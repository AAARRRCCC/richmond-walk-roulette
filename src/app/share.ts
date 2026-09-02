/**
 * A spin, as a URL.
 *
 * A readable query string on a dedicated path, never an opaque token. It costs
 * no encoder and no decoder in the byte budget, is forward-compatible by
 * construction — unknown keys are ignored, absent keys fall back to the initial
 * session — and so it never needs a version byte or a migration. It survives
 * hand-editing and reads honestly in a log line.
 *
 * Two shapes share the path. A **spin** link carries a walk (`o`, `b`, `rt`,
 * `p` and the filters). A **room pointer** carries `r` and nothing else: the
 * room, not the URL, is where meet state lives (CONTEXT.md, `docs/adr/0001`).
 *
 * Pure, and imported by the server as well as the app, so it knows nothing
 * about the DOM and reaches for no runtime module beyond `places.ts` (for the
 * vibe ordering), `format.ts` (for the one shared sentence) and `room-id.ts`.
 */
import { VIBES, type Origin, type PlaceKind, type Vibe } from "../data/places.ts";
import type { ClimbBand } from "../lib/elevation.ts";
import { formatMinutes } from "../lib/format.ts";
import { normaliseRoomId } from "./room-id.ts";

/** Where a share link sends the recipient. */
export const SHARE_PATH = "/s";

/**
 * The dial's widest range, duplicated here on purpose.
 *
 * `share.ts` is imported by the server, and importing `../lib/isochrone` for
 * two numbers would drag the whole contour cache and its fetch plumbing into a
 * process that only wants to write a sentence. A test asserts these equal
 * `MIN_MINUTES` and `MAX_MINUTES`, and fails the moment the dial changes shape.
 */
export const SHARE_BUDGET_MIN = 5;
export const SHARE_BUDGET_MAX = 100;

/**
 * Longest query string that will be parsed at all. Past this the link is treated
 * as absent: a decoder is not a place to spend unbounded work, and the server's
 * share cache is keyed off what this returns.
 */
export const SHARE_QUERY_MAX = 512;

/**
 * Decimal places a dropped-pin origin is shared at.
 *
 * **Three, which is about 110 m, and it is a privacy decision rather than a
 * formatting one.** Sharing a preset publishes an id; sharing a pin at the five
 * decimals the contour cache uses publishes a coordinate to about a metre — and
 * for a geolocated or home pin that is somebody's front door, in a link that
 * gets forwarded.
 *
 * The cost is real and is designed for: the recipient's reach is computed from
 * the rounded pin, so it is a slightly different shape, and the shared
 * destination can fall outside it. That is already a state this feature handles
 * — the card shows the destination anyway and says why it is not in the pool —
 * so the failure mode is a sentence rather than a substitution.
 *
 * This governs what a URL **publishes**. A room shares origins over the socket
 * at full precision, by the publishing / sharing-into-a-room distinction in
 * CONTEXT.md, and never through this constant.
 *
 * The rounding happens HERE, in the encoder, and nothing downstream re-expands
 * it: `pointKey` rounds to 5 decimals and is the identity behind the contour
 * cache, the route cache and the snapshot filenames, so a value coarsened after
 * that point would quietly warm a second ladder ~70 m from the one the reader
 * believes they are looking at. `toFixed` is idempotent, which is what keeps
 * `canonicalQuery(decodeShare(encodeShare(x))) === encodeShare(x)` true.
 */
export const PIN_PRECISION = 3;

/** An origin as a link can carry it: a preset id, or a dropped pin. */
export type SharedOrigin =
  | { kind: "preset"; id: string }
  | { kind: "pin"; lat: number; lng: number };

/** Everything a link says, before any of it is checked against the data. */
export type ShareLink = {
  /**
   * The `r` key: a room pointer, validated to the relay's own shape so nothing
   * downstream can try to join garbage. When it is set every other field is
   * at its empty value — a room link carries no origin and no settings.
   *
   * The retired ping-pong keys (`m`, `ma`, `mb`, `l`, `d`) are not read at
   * all and decode as a cold start, which is the degradation `docs/adr/0001`
   * accepts for the handful of such links in the wild.
   */
  room: string | null;
  origin: SharedOrigin | null;
  budgetMinutes: number | null;
  floorMinutes: number | null;
  roundTrip: boolean | null;
  edgeOnly: boolean | null;
  climb: ClimbBand | "any" | null;
  kind: PlaceKind | null;
  vibes: Vibe[];
  placeId: string | null;
};

/** What a link is built from. Exactly the fields `Session` can express. */
export type ShareInput = {
  origin: Origin;
  /** Null for a link that names no destination yet. A spin's link always writes `p`. */
  placeId: string | null;
  budgetMinutes: number;
  floorMinutes: number;
  dialMinimumMinutes: number;
  roundTrip: boolean;
  edgeOnly: boolean;
  climb: ClimbBand | "any";
  kind: PlaceKind;
  vibes: readonly Vibe[];
};

/**
 * Predicates rather than sets-plus-assertions.
 *
 * A `Set<string>.has(x)` proves nothing to the type system, so every caller had
 * to follow it with a cast. A type guard proves it once, here, at the boundary
 * where the string arrives - which is the whole rule the anti-slop plugin is
 * enforcing. Exported because a room's setup frames arrive as strings too.
 */
export const isClimb = (value: string): value is ClimbBand | "any" =>
  value === "easy" || value === "hilly" || value === "any";

export const isKind = (value: string): value is PlaceKind =>
  value === "any" || value === "destination" || value === "detour";

/**
 * A preset id, or a coordinate at the given precision.
 *
 * Lifted out of the encoder so a second call site cannot drift on which
 * precision it writes; the parameter is what keeps `PIN_PRECISION` a decision
 * rather than a coincidence.
 */
const pinOrId = (origin: Origin, precision: number): string =>
  origin.id === "custom" || origin.id === "me" || origin.id === "partner"
    ? `${origin.lat.toFixed(precision)},${origin.lng.toFixed(precision)}`
    : origin.id;

/**
 * The link for a spin.
 *
 * `o`, `b`, `rt` and `p` are always written; `f`, `e`, `c`, `k` and `v` are
 * omitted at their defaults. The four that define the walk are explicit so that
 * changing a default later cannot quietly change what an old link means. The
 * filters are decoration, and absent-means-default keeps the link short.
 *
 * **It carries no condition switches.** `beforeDark`, `weatherAware` and
 * `hideClosed` are about the recipient's here-and-now rather than about the walk
 * that was sent: a link that switched off somebody's daylight guard would be a
 * trap, and one that switched it on would be a lie about what the sender did.
 *
 * It never writes `r`: a room pointer is minted by `roomUrl`, and a link is
 * one shape or the other.
 */
export function encodeShare(input: ShareInput): string {
  const params: string[] = [];
  const push = (key: string, value: string): void => {
    params.push(`${key}=${encodeURIComponent(value)}`);
  };

  push("o", pinOrId(input.origin, PIN_PRECISION));
  push("b", String(input.budgetMinutes));
  if (input.floorMinutes > input.dialMinimumMinutes) push("f", String(input.floorMinutes));
  push("rt", input.roundTrip ? "1" : "0");
  if (input.edgeOnly) push("e", "1");
  if (input.climb !== "any") push("c", input.climb);
  if (input.kind !== "any") push("k", input.kind);

  // Written in VIBES order rather than in toggle order, so the same selection
  // always produces the same link and therefore the same cache key. The only
  // normalisation the encoder does.
  const vibes = VIBES.filter((vibe) => input.vibes.includes(vibe.id)).map((vibe) => vibe.id);
  if (vibes.length > 0) push("v", vibes.join("."));

  if (input.placeId !== null) push("p", input.placeId);
  return params.join("&");
}

/**
 * Everything a query string says. Never throws, on any input.
 *
 * Knows nothing about `PLACES` or `PRESET_ORIGINS` — that is what keeps it
 * usable from the server and from a test with no DOM. The one thing it does
 * check is that `b` and `f` are integers the dial could actually hold, so every
 * consumer sees a budget that is real and nothing downstream needs a clamp.
 */
export function decodeShare(search: string): ShareLink {
  const empty: ShareLink = {
    room: null,
    origin: null,
    budgetMinutes: null,
    floorMinutes: null,
    roundTrip: null,
    edgeOnly: null,
    climb: null,
    kind: null,
    vibes: [],
    placeId: null,
  };
  if (search.length > SHARE_QUERY_MAX) return empty;

  const query = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);

  // A room pointer is the whole link. Anything beside it is ignored rather
  // than merged: the room holds the setup, and a link that tried to carry
  // both would be two grammars in one string. A malformed id is an empty
  // link, so a mangled pointer cold-starts instead of half-joining.
  const rawRoom = query.get("r");
  if (rawRoom !== null) return { ...empty, room: normaliseRoomId(rawRoom) };

  const minutes = (key: string): number | null => {
    const raw = query.get(key);
    if (raw === null) return null;
    const value = Number.parseInt(raw, 10);
    if (!Number.isInteger(value)) return null;
    return value >= SHARE_BUDGET_MIN && value <= SHARE_BUDGET_MAX ? value : null;
  };

  const flag = (key: string): boolean | null => {
    const raw = query.get(key);
    return raw === "1" ? true : raw === "0" ? false : null;
  };

  const sharedOrigin = (key: string): SharedOrigin | null => {
    const raw = query.get(key);
    if (raw === null || raw.length === 0) return null;
    if (raw.includes(",")) {
      const [lat, lng] = raw.split(",").map((part) => Number(part));
      if (lat !== undefined && lng !== undefined && Number.isFinite(lat) && Number.isFinite(lng)) {
        return { kind: "pin", lat, lng };
      }
      return null;
    }
    // Existence is deliberately not checked here: an unknown preset is a
    // recoverable state the restorer handles, not a parse failure.
    return { kind: "preset", id: raw };
  };

  const rawClimb = query.get("c");
  const rawKind = query.get("k");
  const rawPlace = query.get("p");

  // A Set of what was asked for, then filtered through VIBES rather than the
  // other way round. That is what dedupes and reorders in one pass, and it means
  // an unknown id simply never matches instead of needing its own guard.
  const asked = new Set((query.get("v") ?? "").split("."));

  return {
    room: null,
    origin: sharedOrigin("o"),
    budgetMinutes: minutes("b"),
    floorMinutes: minutes("f"),
    roundTrip: flag("rt"),
    edgeOnly: flag("e"),
    climb: rawClimb !== null && isClimb(rawClimb) ? rawClimb : null,
    kind: rawKind !== null && isKind(rawKind) ? rawKind : null,
    // In VIBES order, matching what the encoder writes, so one selection is
    // always one link and therefore one cache entry.
    vibes: VIBES.filter((vibe) => asked.has(vibe.id)).map((vibe) => vibe.id),
    placeId: rawPlace !== null && rawPlace.length > 0 ? rawPlace : null,
  };
}

/**
 * The same query an equivalent `ShareInput` would have produced, rebuilt from a
 * decoded link.
 *
 * `encodeShare` cannot be reused: it takes an `Origin`, and a decoded pin is
 * `{kind:"pin",lat,lng}` with no name and no id, so the two signatures do not
 * compose. This is what makes a canonical `og:url` and a canonical cache key the
 * same string, which is the only thing stopping two different walks from sharing
 * one cache entry.
 */
export function canonicalQuery(link: ShareLink): string {
  // A room pointer canonicalises to itself: the id is already case-folded and
  // nothing else in the link is read.
  if (link.room !== null) return `r=${link.room}`;

  const params: string[] = [];
  const push = (key: string, value: string): void => {
    params.push(`${key}=${encodeURIComponent(value)}`);
  };

  // Re-rounded rather than copied, so a hand-edited five-decimal coordinate
  // cannot be smuggled through the canonical URL a crawler stores. Canonical
  // is allowed to differ from requested - the vibe ordering already relies on
  // that - and here it is the difference that matters.
  const at = link.origin;
  if (at !== null) {
    push(
      "o",
      at.kind === "preset"
        ? at.id
        : `${at.lat.toFixed(PIN_PRECISION)},${at.lng.toFixed(PIN_PRECISION)}`,
    );
  }

  // The key order is fixed and TOTAL, because this string is simultaneously
  // `og:url` and the share cache key: two orderings of one link must not
  // become two documents, and a key left out of it would be erased from both.
  if (link.budgetMinutes !== null) push("b", String(link.budgetMinutes));
  if (link.floorMinutes !== null) push("f", String(link.floorMinutes));
  if (link.roundTrip !== null) push("rt", link.roundTrip ? "1" : "0");
  if (link.edgeOnly === true) push("e", "1");
  if (link.climb !== null && link.climb !== "any") push("c", link.climb);
  if (link.kind !== null && link.kind !== "any") push("k", link.kind);
  if (link.vibes.length > 0) push("v", link.vibes.join("."));
  if (link.placeId !== null) push("p", link.placeId);

  return params.join("&");
}

/** True when the link carries nothing this build understands. */
export function isEmptyLink(link: ShareLink): boolean {
  return (
    link.room === null &&
    link.origin === null &&
    link.budgetMinutes === null &&
    link.floorMinutes === null &&
    link.roundTrip === null &&
    link.edgeOnly === null &&
    link.climb === null &&
    link.kind === null &&
    link.vibes.length === 0 &&
    link.placeId === null
  );
}

/** The absolute URL for a spin. */
export function shareUrl(siteOrigin: string, input: ShareInput): string {
  return `${siteOrigin}${SHARE_PATH}?${encodeShare(input)}`;
}

/** The room pointer: the only thing a meet link carries. */
export function roomUrl(siteOrigin: string, roomId: string): string {
  return `${siteOrigin}${SHARE_PATH}?r=${roomId}`;
}

/**
 * The one sentence that describes a spin, written once and used twice: by
 * the share button's copy in the browser and by `og:description` on the
 * server.
 *
 * Two copies of this sentence would drift, and the drift would only ever be
 * visible to the recipient — the one person who cannot compare them.
 *
 * `walkMinutes` is the *budget* the link carries, not a measured route.
 */
export function describeShare(args: {
  placeName: string;
  originName: string;
  walkMinutes: number;
  roundTrip: boolean;
}): string {
  const walk = formatMinutes(args.walkMinutes * 60);
  return args.roundTrip
    ? `${args.placeName} — a ${walk} round trip from ${args.originName}.`
    : `${args.placeName} — ${walk} on foot from ${args.originName}.`;
}

/**
 * The title and sentence for a room link's unfurl.
 *
 * They say nothing about either person: a room link carries no origin and no
 * settings, so there is nothing to disclose and nothing to name. A message-app
 * preview is rendered by a third-party crawler and cached on its servers, and
 * having nothing to leak into it is the whole point of the room shape.
 */
export const ROOM_LINK_TITLE = "Somewhere we can both walk to";

export function describeRoom(): string {
  return "Open this and say where you're starting from. The room stays open for 12 hours.";
}
