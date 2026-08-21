/**
 * A spin, as a URL.
 *
 * A readable query string on a dedicated path, never an opaque token. It costs
 * no encoder and no decoder in the byte budget, is forward-compatible by
 * construction — unknown keys are ignored, absent keys fall back to the initial
 * session — and so it never needs a version byte or a migration. It survives
 * hand-editing and reads honestly in a log line.
 *
 * **This is chunk 10 and last for a reason.** Every earlier chunk changed what a
 * session *is*: `climb` replaced `terrain`, `kind` appeared, the condition
 * switches appeared. A format frozen before those landed is a format that needs
 * a migration the day after it ships, which is the whole thing this shape exists
 * to avoid.
 *
 * Pure, and imported by the Worker as well as the app, so it knows nothing about
 * the DOM and reaches for no runtime module beyond `places.ts` (for the vibe
 * ordering) and `format.ts` (for the one shared sentence).
 */
import { VIBES, type Origin, type PlaceKind, type Vibe } from "../data/places.ts";
import type { ClimbBand } from "../lib/elevation.ts";
import { formatMinutes } from "../lib/format.ts";

/** Where a share link sends the recipient. */
export const SHARE_PATH = "/s";

/**
 * The dial's widest range, duplicated here on purpose.
 *
 * `share.ts` is imported by the Worker, and importing `../lib/isochrone` for two
 * numbers would drag the whole contour cache and its fetch plumbing into a
 * Worker that only wants to write a sentence. A test asserts these equal
 * `MIN_MINUTES` and `MAX_MINUTES`, and fails the moment the dial changes shape.
 */
export const SHARE_BUDGET_MIN = 5;
export const SHARE_BUDGET_MAX = 100;

/**
 * Longest query string that will be parsed at all. Past this the link is treated
 * as absent: a decoder is not a place to spend unbounded work, and the Worker's
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
 * Same precision `meet-in-the-middle` pins its own meet point at, deliberately:
 * one number for "how precisely this app is willing to publish a person's
 * location". See docs/plans/HUMAN-REVIEW.md 2.9.
 */
export const PIN_PRECISION = 3;

/** An origin as a link can carry it: a preset id, or a dropped pin. */
export type SharedOrigin =
  | { kind: "preset"; id: string }
  | { kind: "pin"; lat: number; lng: number };

/** Everything a link says, before any of it is checked against the data. */
export type ShareLink = {
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
  budgetMinutes: number;
  floorMinutes: number;
  dialMinimumMinutes: number;
  roundTrip: boolean;
  edgeOnly: boolean;
  climb: ClimbBand | "any";
  kind: PlaceKind;
  vibes: readonly Vibe[];
  placeId: string;
};

/**
 * Predicates rather than sets-plus-assertions.
 *
 * A `Set<string>.has(x)` proves nothing to the type system, so every caller had
 * to follow it with a cast. A type guard proves it once, here, at the boundary
 * where the string arrives - which is the whole rule the anti-slop plugin is
 * enforcing.
 */
const isClimb = (value: string): value is ClimbBand | "any" =>
  value === "easy" || value === "hilly" || value === "any";

const isKind = (value: string): value is PlaceKind =>
  value === "any" || value === "destination" || value === "detour";


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
 */
export function encodeShare(input: ShareInput): string {
  const params: string[] = [];
  const push = (key: string, value: string): void => {
    params.push(`${key}=${encodeURIComponent(value)}`);
  };

  push(
    "o",
    input.origin.id === "custom" || input.origin.id === "me"
      ? `${input.origin.lat.toFixed(PIN_PRECISION)},${input.origin.lng.toFixed(PIN_PRECISION)}`
      : input.origin.id,
  );
  push("b", String(input.budgetMinutes));
  if (input.floorMinutes > input.dialMinimumMinutes) push("f", String(input.floorMinutes));
  push("rt", input.roundTrip ? "1" : "0");
  if (input.edgeOnly) push("e", "1");
  if (input.climb !== "any") push("c", input.climb);
  if (input.kind !== "any") push("k", input.kind);

  // Written in VIBES order rather than in toggle order, so the same selection
  // always produces the same link and therefore the same edge cache key. The
  // only normalisation the encoder does.
  const vibes = VIBES.filter((vibe) => input.vibes.includes(vibe.id)).map((vibe) => vibe.id);
  if (vibes.length > 0) push("v", vibes.join("."));

  push("p", input.placeId);
  return params.join("&");
}

/**
 * Everything a query string says. Never throws, on any input.
 *
 * Knows nothing about `PLACES` or `PRESET_ORIGINS` — that is what keeps it
 * usable from the Worker and from a test with no DOM. The one thing it does
 * check is that `b` and `f` are integers the dial could actually hold, so every
 * consumer sees a budget that is real and nothing downstream needs a clamp.
 */
export function decodeShare(search: string): ShareLink {
  const empty: ShareLink = {
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

  const rawOrigin = query.get("o");
  let origin: SharedOrigin | null = null;
  if (rawOrigin !== null && rawOrigin.length > 0) {
    if (rawOrigin.includes(",")) {
      const [lat, lng] = rawOrigin.split(",").map((part) => Number(part));
      if (lat !== undefined && lng !== undefined && Number.isFinite(lat) && Number.isFinite(lng)) {
        origin = { kind: "pin", lat, lng };
      }
    } else {
      // Existence is deliberately not checked here: an unknown preset is a
      // recoverable state the restorer handles, not a parse failure.
      origin = { kind: "preset", id: rawOrigin };
    }
  }

  const rawClimb = query.get("c");
  const rawKind = query.get("k");
  const rawPlace = query.get("p");

  // A Set of what was asked for, then filtered through VIBES rather than the
  // other way round. That is what dedupes and reorders in one pass, and it means
  // an unknown id simply never matches instead of needing its own guard.
  const asked = new Set((query.get("v") ?? "").split("."));

  return {
    origin,
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
  const params: string[] = [];
  const push = (key: string, value: string): void => {
    params.push(`${key}=${encodeURIComponent(value)}`);
  };

  if (link.origin !== null) {
    push(
      "o",
      link.origin.kind === "preset"
        ? link.origin.id
        : `${link.origin.lat.toFixed(PIN_PRECISION)},${link.origin.lng.toFixed(PIN_PRECISION)}`,
    );
  }
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

/**
 * The one sentence that describes a spin, written once and used twice: by
 * `navigator.share`'s `text` in the browser and by `og:description` in the
 * Worker.
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
