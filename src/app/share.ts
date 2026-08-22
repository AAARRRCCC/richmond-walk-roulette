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
 * **This is also `multiplayer-links`' `MEET_PIN_PRECISION`, and there is
 * deliberately only one constant for the two.** That spec names a second one
 * and says solo links keep five decimals; chunk 10 had already decided against
 * five for the same reason, so a second name would have been two names for one
 * number - exactly the drift this comment exists to prevent. One number for
 * "how precisely this app is willing to publish a person's location", and it is
 * measured rather than chosen: at two decimals (~1.2 km) a sixteen-place shared
 * pool can flip entirely between the two devices, and at three the disagreement
 * is confined to a handful of genuinely marginal places. The method and the
 * table are in `multiplayer-links` open question 2.
 *
 * The rounding happens HERE, in the encoder, and nothing downstream re-expands
 * it: `pointKey` rounds to 5 decimals and is the identity behind the contour
 * cache, the route cache and the snapshot filenames, so a value coarsened after
 * that point would quietly warm a second ladder ~70 m from the one the reader
 * believes they are looking at. `toFixed` is idempotent, which is what keeps
 * `canonicalQuery(decodeShare(encodeShare(x))) === encodeShare(x)` true.
 *
 * See docs/plans/HUMAN-REVIEW.md 2.9.
 */
export const PIN_PRECISION = 3;

/**
 * How old an invite gets before the panel says so. **It still works.**
 *
 * Refusing to open a stale invite would be theatre: the coordinate is in the
 * URL either way, and a reader with the link can read it in a text editor
 * forever. What the app can honestly do is name the age and let the reader
 * judge whether a two-day-old starting point still describes where somebody is.
 */
export const INVITE_STALE_DAYS = 2;

/**
 * Days since the Unix epoch, in UTC. The `d` key's whole value space.
 *
 * A date rather than a deadline, and the distinction is the whole of decision
 * 5: an `expires` timestamp checked on the client would be *advisory* expiry,
 * which looks like a guarantee and is not one. A date claims only what it is.
 */
export function epochDay(atMs: number): number {
  return Math.floor(atMs / 86_400_000);
}

/** An origin as a link can carry it: a preset id, or a dropped pin. */
export type SharedOrigin =
  | { kind: "preset"; id: string }
  | { kind: "pin"; lat: number; lng: number };

/** Everything a link says, before any of it is checked against the data. */
export type ShareLink = {
  /**
   * The `m` key. True only for the literal `"1"`; any other value is false.
   *
   * A meet link carries **no `o` at all**, and that is a correctness decision
   * rather than a style one. The forward-compatibility rule this whole format
   * rests on is that unknown keys are ignored and absent keys fall back to the
   * initial session - so a meet key that *changed the meaning of an existing
   * key* would break it silently and dangerously. An older build (or a stale
   * cached bundle) opening `?m=1&o=37.541,-77.436` would ignore `m`, read `o`
   * as **the reader's own origin**, and answer a stranger's question from a
   * stranger's front door with no notice at all. That is the exact failure this
   * app exists to argue against, so the two origins live under two new keys an
   * older build ignores entirely.
   */
  meet: boolean;
  /** The sender's start, from `ma`. Null on a solo link. */
  originA: SharedOrigin | null;
  /**
   * The other person's start, from `mb`.
   *
   * **Only ever an echo, never a guess.** It is a value copied verbatim out of
   * the link the sender was themselves reading, which is the mechanical form of
   * the rule that the recipient's here-and-now does not belong in the sender's
   * link: nothing about a reader ever enters a link except that reader's own
   * act of sending one back.
   */
  originB: SharedOrigin | null;
  /** The `d` key: days since the epoch when the link was minted, or null. */
  mintedDay: number | null;
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
  /** The sender's own start. Written as `o` when `meet` is false, `ma` when true. */
  origin: Origin;
  /** True to mint a meet link. */
  meet: boolean;
  /**
   * The other person's start, written as `mb`. Null on every solo link and on
   * every invite.
   *
   * It must be null unless it came out of a decoded link. The encoder cannot
   * tell - it is handed an `Origin` like any other - so the invariant is held
   * where it can be: App builds this only from `Session.partner`, and
   * `meetLinks`' invite expression passes null explicitly.
   */
  partner: Origin | null;
  /**
   * Null only for an **invite**, which names no destination because there is
   * not one yet. A solo link and an answer link both always write `p`.
   */
  placeId: string | null;
  /**
   * `epochDay(Date.now())` at mint time, or null. Written only for a meet link
   * that actually carries a pin - that is, exactly when something private was
   * disclosed and staleness is worth naming. A preset-only invite has nothing
   * to go stale and keeps a date-free, cacheable key.
   */
  mintedDay: number | null;
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
 * enforcing.
 */
const isClimb = (value: string): value is ClimbBand | "any" =>
  value === "easy" || value === "hilly" || value === "any";

const isKind = (value: string): value is PlaceKind =>
  value === "any" || value === "destination" || value === "detour";

/**
 * Which of the three shapes a link is.
 *
 * Exported because three consumers - App's initialiser, `shareMeta` and
 * `shareCacheKey` - each need to branch on it, and `link.meet` alone does not
 * say *which* of the two meet shapes it is. An `m` with no `ma` is not a
 * meeting: a link naming a second person and not a first is not a shape this
 * app mints, so it decodes as a plain cold start rather than as half a meeting.
 */
export function meetKind(link: ShareLink): "none" | "invite" | "answer" {
  if (!link.meet || link.originA === null) return "none";
  return link.placeId === null ? "invite" : "answer";
}

/**
 * A preset id, or a coordinate at the given precision.
 *
 * Lifted out of the encoder so the two call sites cannot drift on which
 * precision they write. Today they pass the same number - see `PIN_PRECISION` -
 * and the parameter is what keeps that a decision rather than a coincidence.
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
 * A **meet** link writes `m`, `ma` and optionally `mb` in place of `o`, and `d`
 * after everything else. It never throws on a shape it was not meant to be
 * handed - this is a pure encoder, and a throwing branch would fork that
 * discipline for an invariant the one call site holds trivially.
 */
export function encodeShare(input: ShareInput): string {
  const params: string[] = [];
  const push = (key: string, value: string): void => {
    params.push(`${key}=${encodeURIComponent(value)}`);
  };

  const partner = input.partner;
  if (input.meet) {
    push("m", "1");
    push("ma", pinOrId(input.origin, PIN_PRECISION));
    if (partner !== null) push("mb", pinOrId(partner, PIN_PRECISION));
  } else {
    push("o", pinOrId(input.origin, PIN_PRECISION));
  }
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

  if (input.placeId !== null) push("p", input.placeId);
  // Only when a pin was actually written, because that is exactly when
  // something private was disclosed. A preset-to-preset invite discloses
  // nothing, has nothing to go stale, and keeps a date-free key the edge can
  // cache.
  const carriesPin =
    input.meet &&
    input.mintedDay !== null &&
    (pinOrId(input.origin, PIN_PRECISION).includes(",") ||
      (partner !== null && pinOrId(partner, PIN_PRECISION).includes(",")));
  if (carriesPin) push("d", String(input.mintedDay));
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
    meet: false,
    originA: null,
    originB: null,
    mintedDay: null,
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

  const meet = query.get("m") === "1";
  const originA = meet ? sharedOrigin("ma") : null;
  // Ignored when `ma` is absent: a link naming a second person and not a first
  // is not a shape this app mints, and reading it would invent a meeting out of
  // half a link.
  const originB = meet && originA !== null ? sharedOrigin("mb") : null;
  // Forced to null on a meet link. One link, one grammar - and it is what makes
  // the old-build degradation in `ShareLink.meet`'s note a cold start rather
  // than a stranger's front door.
  const origin = meet ? null : sharedOrigin("o");

  const rawDay = query.get("d");
  const day = rawDay === null ? Number.NaN : Number.parseInt(rawDay, 10);
  // Bounded because it reaches `Number` arithmetic and a rendered notice. The
  // ceiling is about the year 2243, which is far enough past any link anyone
  // will send and near enough to catch a garbage integer.
  const mintedDay =
    Number.isInteger(day) && day >= 0 && day < 100_000 ? day : null;

  const rawClimb = query.get("c");
  const rawKind = query.get("k");
  const rawPlace = query.get("p");

  // A Set of what was asked for, then filtered through VIBES rather than the
  // other way round. That is what dedupes and reorders in one pass, and it means
  // an unknown id simply never matches instead of needing its own guard.
  const asked = new Set((query.get("v") ?? "").split("."));

  return {
    meet,
    originA,
    originB,
    mintedDay,
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
  const shared = (key: string, at: SharedOrigin | null): void => {
    if (at === null) return;
    // Re-rounded rather than copied, so a hand-edited five-decimal coordinate
    // cannot be smuggled through the canonical URL a crawler stores. Canonical
    // is allowed to differ from requested - the vibe ordering already relies on
    // that - and here it is the difference that matters.
    push(
      key,
      at.kind === "preset"
        ? at.id
        : `${at.lat.toFixed(PIN_PRECISION)},${at.lng.toFixed(PIN_PRECISION)}`,
    );
  };

  // The key order is fixed and TOTAL, because this string is simultaneously
  // `og:url` and the edge cache key: two orderings of one invite must not
  // become two documents, and a key left out of it would be erased from both.
  // The solo subset - o, b, f, rt, e, c, v, k, p - is byte-identical to what
  // the encoder wrote before meet links existed, which is what lets
  // SHARE_CACHE_VERSION stay "v1" rather than re-keying every warm entry.
  if (link.meet) push("m", "1");
  shared("ma", link.originA);
  shared("mb", link.originB);
  shared("o", link.origin);
  if (link.budgetMinutes !== null) push("b", String(link.budgetMinutes));
  if (link.floorMinutes !== null) push("f", String(link.floorMinutes));
  if (link.roundTrip !== null) push("rt", link.roundTrip ? "1" : "0");
  if (link.edgeOnly === true) push("e", "1");
  if (link.climb !== null && link.climb !== "any") push("c", link.climb);
  if (link.kind !== null && link.kind !== "any") push("k", link.kind);
  if (link.vibes.length > 0) push("v", link.vibes.join("."));
  if (link.placeId !== null) push("p", link.placeId);
  if (link.mintedDay !== null) push("d", String(link.mintedDay));

  return params.join("&");
}

/** True when the link carries nothing this build understands. */
export function isEmptyLink(link: ShareLink): boolean {
  return (
    !link.meet &&
    link.originA === null &&
    link.originB === null &&
    link.mintedDay === null &&
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

/**
 * The sentence for an invite, used twice: `navigator.share`'s `text` and
 * `og:description`.
 *
 * Never contains a coordinate, and `originName` is a preset's name or the
 * literal "a dropped pin" - never a neighbourhood guessed from a number. A
 * message-app preview is rendered by a third-party crawler and cached on its
 * servers, so anything in here is a disclosure the sender did not separately
 * agree to.
 *
 * `minutes` is the BUDGET the link carries, never a measured route - the same
 * discipline `describeShare` already applies, and for the same reason: the
 * Worker has never seen a route.
 */
export function describeInvite(args: {
  originName: string;
  minutes: number;
  roundTrip: boolean;
}): string {
  const walk = formatMinutes(args.minutes * 60);
  const trip = args.roundTrip ? ", out and back" : "";
  return `Somewhere we can both walk to in ${walk}${trip}, starting from ${args.originName}. Open this and say where you're starting from.`;
}

/** The sentence for an answer link. Also coordinate-free. */
export function describeMeetResult(args: {
  placeName: string;
  minutes: number;
  roundTrip: boolean;
}): string {
  const walk = formatMinutes(args.minutes * 60);
  const trip = args.roundTrip ? " on foot" : "";
  return `${args.placeName} — inside ${walk}${trip} from both our starts.`;
}
