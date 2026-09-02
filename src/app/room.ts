/**
 * The client half of a room: what travels the socket, and what this side
 * knows about the other.
 *
 * Pure. The socket itself lives in `useRoom.ts`; everything here is a
 * function of frames and time, so every presence state and every decoding
 * rule is provable under `node --test` with no transport at all.
 *
 * The relay (`server/rooms.ts`) reads exactly one field of a peer frame,
 * `t`, and forwards the rest verbatim, so this file is the whole of the
 * protocol's meaning. The three peer frames:
 *
 *   - `setup` — one side's settled setup (CONTEXT.md: **settle**). Sent on
 *     every settle and re-asserted on every (re)join, so a relay restart is a
 *     reconnect blip rather than a wipe. The origin rides at full precision,
 *     behind the consent gate: it is null until this side chose to share it.
 *   - `spin` — the winner's id, sent at spin start by the side that drew it.
 *     The relay serialises: first spin wins, a competing one is dropped. The
 *     other side runs its own reel to the same place, one hop behind (#9).
 *   - `settle` — the reel landed (or was cancelled), releasing the lock.
 *
 * Nothing here computes a pool or picks a winner: the relay never does, and
 * the partner's pool is their own device's business.
 */
import { PRESET_ORIGINS, VIBES, type Origin, type PlaceKind, type Vibe } from "../data/places.ts";
import type { ClimbBand } from "../lib/elevation.ts";
import { insideRichmond } from "../lib/bounds.ts";
import {
  isFiniteNumber,
  isJsonArray,
  isJsonObject,
  isString,
  parseJson,
  type Json,
  type JsonObject,
} from "../lib/json.ts";
import { isClimb, isKind } from "./share.ts";

// --------------------------------------------------------------- one side

/**
 * A start as it crosses the socket: a preset by id, or a coordinate at full
 * precision. Never a name — nothing in this app takes free text, and the
 * other side is named by its start (`partner?.name ?? "Their start"`), which
 * a preset carries itself and a pin never had.
 */
export type WireOrigin = { id: string } | { lat: number; lng: number };

/** Everything one side says about itself. The `setup` frame's payload. */
export type SideSetup = {
  /** Null until this side consented to share its start. */
  origin: WireOrigin | null;
  budgetMinutes: number;
  roundTrip: boolean;
  floorMinutes: number;
  edgeOnly: boolean;
  climb: ClimbBand | "any";
  kind: PlaceKind;
  vibes: readonly Vibe[];
  weatherAware: boolean;
  /** The lock gate's other half: true once they pressed "Lock in". */
  locked: boolean;
};

/**
 * The partner's side, as this device holds it: their setup resolved against
 * this build's data, plus the two facts about the origin the frame cannot
 * settle on its own.
 */
type PartnerSide = Omit<SideSetup, "origin"> & {
  /** Their start as an `Origin`, or null while unshared or refused. */
  origin: Origin | null;
  /** True when the coordinate they shared is outside the app's bounds. */
  originOutOfBounds: boolean;
};

/** The wire form of a `SideSetup`; the `Origin` it came from becomes id-or-coordinate. */
export function wireOrigin(origin: Origin): WireOrigin {
  return origin.id === "custom" || origin.id === "me" || origin.id === "partner"
    ? { lat: origin.lat, lng: origin.lng }
    : { id: origin.id };
}

/**
 * A pin the partner shared, as an `Origin`.
 *
 * `id` and `name` are literals, never from the wire: this being the only
 * constructor for a shared coordinate is what keeps "no free text from the
 * other side" a property rather than a habit.
 */
function partnerOrigin(at: { lat: number; lng: number }): Origin {
  return { id: "partner", name: "Their start", lat: at.lat, lng: at.lng };
}

// ------------------------------------------------------------ the frames

export function joinFrame(room: string, token: string): string {
  return JSON.stringify({ t: "join", room, token });
}

export function setupFrame(side: SideSetup): string {
  return JSON.stringify({
    t: "setup",
    o: side.origin,
    b: side.budgetMinutes,
    rt: side.roundTrip,
    f: side.floorMinutes,
    e: side.edgeOnly,
    c: side.climb,
    k: side.kind,
    v: side.vibes,
    w: side.weatherAware,
    l: side.locked,
  });
}

export function spinFrame(winnerId: string): string {
  return JSON.stringify({ t: "spin", p: winnerId });
}

export function settleFrame(aborted: boolean): string {
  return JSON.stringify({ t: "settle", aborted });
}

/** What the relay says. `peer` is presence; the other three end the join. */
export type ServerFrame =
  | { t: "joined"; peers: number; expiresInMs: number }
  | { t: "full" }
  | { t: "closed" }
  | { t: "peer"; connected: boolean };

/** What the other side says, after the join. */
export type PeerFrame =
  | { t: "setup"; side: PartnerSide }
  | { t: "spin"; winnerId: string }
  | { t: "settle"; aborted: boolean };

function readFrame(text: string): JsonObject | null {
  let message: Json;
  try {
    message = parseJson(text);
  } catch {
    return null;
  }
  return isJsonObject(message) ? message : null;
}

type OriginReading = { origin: Origin | null; outOfBounds: boolean };

function readOrigin(value: Json | undefined): OriginReading {
  if (!isJsonObject(value)) return { origin: null, outOfBounds: false };
  const id = value["id"];
  if (isString(id)) {
    return { origin: PRESET_ORIGINS.find((preset) => preset.id === id) ?? null, outOfBounds: false };
  }
  const lat = value["lat"];
  const lng = value["lng"];
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return { origin: null, outOfBounds: false };
  const at = { lat, lng };
  // Refused BEFORE it becomes an `Origin`, the same rule the old link
  // restorer held: a coordinate outside the bounds never generates a request.
  if (!insideRichmond(at)) return { origin: null, outOfBounds: true };
  return { origin: partnerOrigin(at), outOfBounds: false };
}

/**
 * One frame from the socket, sorted into the relay's own vocabulary or the
 * partner's. Null for anything malformed: a bad frame is dropped, never
 * guessed at, and the relay's 16 KB cap bounds what can arrive.
 */
export function readSocketFrame(text: string): ServerFrame | PeerFrame | null {
  const message = readFrame(text);
  if (message === null) return null;
  const kind = message["t"];
  if (!isString(kind)) return null;

  switch (kind) {
    case "joined": {
      const peers = message["peers"];
      const expiresInMs = message["expiresInMs"];
      if (!isFiniteNumber(peers) || !isFiniteNumber(expiresInMs)) return null;
      return { t: "joined", peers, expiresInMs };
    }
    case "full":
      return { t: "full" };
    case "closed":
      return { t: "closed" };
    case "peer":
      return { t: "peer", connected: message["connected"] === true };
    case "spin": {
      const winnerId = message["p"];
      return isString(winnerId) && winnerId.length > 0 ? { t: "spin", winnerId } : null;
    }
    case "settle":
      return { t: "settle", aborted: message["aborted"] === true };
    case "setup": {
      const budgetMinutes = message["b"];
      const floorMinutes = message["f"];
      const climb = message["c"];
      const placeKind = message["k"];
      const vibes = message["v"];
      if (!isFiniteNumber(budgetMinutes) || !isFiniteNumber(floorMinutes)) return null;
      if (!isString(climb) || !isClimb(climb)) return null;
      if (!isString(placeKind) || !isKind(placeKind)) return null;
      if (!isJsonArray(vibes)) return null;
      // Through VIBES rather than trusted: an unknown id is dropped, and the
      // order becomes the app's own so two chips lists read the same way.
      const asked = new Set(vibes.filter(isString));
      const { origin, outOfBounds } = readOrigin(message["o"]);
      return {
        t: "setup",
        side: {
          origin,
          originOutOfBounds: outOfBounds,
          budgetMinutes,
          roundTrip: message["rt"] === true,
          floorMinutes,
          edgeOnly: message["e"] === true,
          climb,
          kind: placeKind,
          vibes: VIBES.filter((vibe) => asked.has(vibe.id)).map((vibe) => vibe.id),
          weatherAware: message["w"] === true,
          locked: message["l"] === true,
        },
      };
    }
    default:
      return null;
  }
}

// ------------------------------------------------------------- the state

/**
 * Where this side's socket stands. `connecting` is the first attempt;
 * `reconnecting` is every later one, and the difference is what the rail
 * shows — a first join has nothing to hold on to, a reconnect holds the
 * partner's last values dimmed.
 */
type RoomStatus =
  | "connecting"
  | "open"
  | "reconnecting"
  | "full"
  | "closed"
  | "replaced";

export type RoomState = {
  status: RoomStatus;
  /** True while the relay says the other seat has a live transport. */
  peerConnected: boolean;
  /** True once the other seat has ever been seen. Waiting ends here. */
  peerEverSeen: boolean;
  /** When their transport last went, or null while connected or never seen. */
  peerLeftAt: number | null;
  /** The room's close, on this device's clock, from the relay's `expiresInMs`. */
  expiresAt: number | null;
  /** Their last settled setup. Held through their disconnect, dimmed. */
  partner: PartnerSide | null;
  /** Bumped on every successful join, so a rejoin re-asserts this side's setup. */
  joins: number;
};

export const initialRoom: RoomState = {
  status: "connecting",
  peerConnected: false,
  peerEverSeen: false,
  peerLeftAt: null,
  expiresAt: null,
  partner: null,
  joins: 0,
};

export type RoomEvent =
  /** A new room id: everything known about the last one is gone. */
  | { type: "reset" }
  | { type: "joined"; peers: number; expiresInMs: number; nowMs: number }
  | { type: "full" }
  | { type: "closed" }
  | { type: "replaced" }
  /** The transport went without a policy close; a reconnect is coming. */
  | { type: "lost" }
  | { type: "peer"; connected: boolean; nowMs: number }
  | { type: "partnerSetup"; side: PartnerSide };

export function reduceRoom(state: RoomState, event: RoomEvent): RoomState {
  switch (event.type) {
    case "reset":
      return initialRoom;
    case "joined": {
      // `peers` counts live transports including this one; a partner in the
      // room is anything past that. A reconnect that finds them still there
      // must not leave `peerConnected` at the value the disconnect set.
      const peerConnected = event.peers >= 2;
      return {
        ...state,
        status: "open",
        peerConnected,
        peerEverSeen: state.peerEverSeen || peerConnected,
        peerLeftAt: peerConnected ? null : state.peerLeftAt,
        expiresAt: event.nowMs + event.expiresInMs,
        joins: state.joins + 1,
      };
    }
    case "full":
      return { ...state, status: "full" };
    case "closed":
      return { ...state, status: "closed", peerConnected: false };
    case "replaced":
      return { ...state, status: "replaced" };
    case "lost":
      // A policy close already moved the status somewhere final, and a lost
      // transport after one is not a reconnect.
      if (state.status !== "open" && state.status !== "connecting") return state;
      return { ...state, status: state.status === "open" ? "reconnecting" : "connecting" };
    case "peer":
      return {
        ...state,
        peerConnected: event.connected,
        peerEverSeen: true,
        peerLeftAt: event.connected ? null : event.nowMs,
      };
    case "partnerSetup":
      return { ...state, partner: event.side };
  }
}

// ------------------------------------------------------------- presence

/**
 * The five states the mirror rail reads as data staleness (#15), plus the
 * two the rail hides behind a panel of their own. Derived, never stored:
 * every one is a function of the state above.
 */
export type Presence = "waiting" | "here" | "reconnecting" | "away" | "closed" | "full" | "replaced";

export function presenceOf(state: RoomState): Presence {
  switch (state.status) {
    case "closed":
      return "closed";
    case "full":
      return "full";
    case "replaced":
      return "replaced";
    case "connecting":
    case "reconnecting":
      return "reconnecting";
    case "open":
      if (state.peerConnected) return "here";
      return state.peerEverSeen ? "away" : "waiting";
  }
}

/** "11h 40m", or "under a minute" at the end. Never negative. */
export function formatRemaining(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 1) return "under a minute";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** "just now", "4 min ago", "2 h ago". For the away state's dating. */
export function formatAgo(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} h ago`;
}

/**
 * The presence sentence. "They", never a name: nobody in this app has one.
 * `nowMs` dates the away state and counts down the waiting one, so the line
 * reads as a fact about how stale the rail's values are.
 */
export function describePresence(state: RoomState, nowMs: number): string {
  switch (presenceOf(state)) {
    case "here":
      return "They're here.";
    case "reconnecting":
      return "Reconnecting…";
    case "away":
      return `Last seen ${formatAgo(nowMs - (state.peerLeftAt ?? nowMs))}.`;
    case "waiting":
      return "They haven't opened the link yet.";
    case "closed":
      return "This room has closed.";
    case "full":
      return "This room already has two walkers.";
    case "replaced":
      return "This room is open in another tab.";
  }
}

// ------------------------------------------------------- the device side

/** The subset of `Storage` these helpers touch; a `Map`-backed fake satisfies it. */
export type KeyStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const TOKEN_KEY = "walk.device";
const selfKey = (roomId: string): string => `walk.room.${roomId}`;

/**
 * This browser's seat token, minted once and kept. The store can throw or be
 * absent (private windows, blocked site data); a token that cannot be kept
 * is still a token for this page's life, so the seat survives a reconnect
 * within the tab even when it cannot survive a reload.
 */
export function deviceToken(store: KeyStore | null, mint: () => string): string {
  try {
    const kept = store?.getItem(TOKEN_KEY);
    if (kept !== null && kept !== undefined && kept.length > 0) return kept;
    const fresh = mint();
    store?.setItem(TOKEN_KEY, fresh);
    return fresh;
  } catch {
    return mint();
  }
}

/**
 * What this side chose to share into a room, kept so a reload rejoins as the
 * same walker with the same start rather than as a stranger asked to choose
 * again. Per room: consent to share a start is consent to *this* room, and
 * the next room asks afresh.
 */
export function rememberSelf(store: KeyStore | null, roomId: string, origin: Origin): void {
  try {
    store?.setItem(
      selfKey(roomId),
      JSON.stringify({ id: origin.id, name: origin.name, lat: origin.lat, lng: origin.lng }),
    );
  } catch {
    // Nothing to do: the reload will ask again, which is the safe direction.
  }
}

export function forgetSelf(store: KeyStore | null, roomId: string): void {
  try {
    store?.removeItem(selfKey(roomId));
  } catch {
    // Already gone, or never kept.
  }
}

/**
 * The start this device shared into the room, or null. A preset resolves to
 * its own entry; a pin rebuilds through the given constructor so the name
 * stays a literal and never a stored string.
 */
export function recallSelf(
  store: KeyStore | null,
  roomId: string,
  pin: (at: { lat: number; lng: number }) => Origin,
): Origin | null {
  try {
    const raw = store?.getItem(selfKey(roomId));
    if (raw === null || raw === undefined) return null;
    const kept = parseJson(raw);
    if (!isJsonObject(kept)) return null;
    const id = kept["id"];
    const lat = kept["lat"];
    const lng = kept["lng"];
    if (!isString(id) || !isFiniteNumber(lat) || !isFiniteNumber(lng)) return null;
    const preset = PRESET_ORIGINS.find((entry) => entry.id === id);
    if (preset !== undefined) return preset;
    return insideRichmond({ lat, lng }) ? pin({ lat, lng }) : null;
  } catch {
    return null;
  }
}
