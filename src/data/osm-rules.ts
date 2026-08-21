/**
 * What an OpenStreetMap element is, in this app's vocabulary.
 *
 * Pure, and imported by exactly two things: `scripts/propose-places.mjs` and
 * this file's own tests. **No app module may import it**, and that is a design
 * constraint rather than an observation - it is what keeps the classification
 * table, the bounds and the dedup threshold out of the bundle entirely.
 * `matchesKind`, `PlaceKind` and `PLACE_KINDS` live in `places.ts` precisely so
 * that no app module has a reason to reach in here. If a build ever shows
 * strings from this file in `dist/`, an import crept in; find it rather than
 * adding a budget line.
 *
 * Every export carries `@public`, and that tag is the only thing keeping knip
 * quiet: `knip.json` lists `scripts/*.mjs` as an entry point, but the proposer
 * reaches this module through `vite.ssrLoadModule("/src/data/osm-rules.ts")` -
 * a bare string literal knip cannot trace, exactly as `build-reach.mjs` reaches
 * `isochrone.ts`. Do not delete the tags on the theory that the script entry
 * point covers them; it does not.
 */
import type { LngLat } from "../lib/geometry.ts";
import type { DetourKind, Vibe } from "./places.ts";
import { NAME_MAX } from "./places.ts";

/**
 * One Overpass element, already narrowed at the boundary.
 *
 * @public - consumed by `scripts/propose-places.mjs` and this file's tests.
 */
export type OsmCandidate = {
  /** `node/123`, `way/456`, `relation/789`. */
  osm: string;
  /** The element's own coordinate, or the `out center` centre for a way. */
  seed: LngLat;
  /** Tag key to value, exactly as Overpass returned it. */
  tags: ReadonlyMap<string, string>;
};

/** @public - consumed by `scripts/propose-places.mjs` and this file's tests. */
export type Classification = {
  detour: DetourKind | null;
  tags: Vibe[];
  /** Additive notability, 0..100. Never a gate; it only ranks the review page. */
  score: number;
};

/**
 * Why a candidate was thrown away. Rendered verbatim on the review page, so a
 * reviewer can see the shape of what was refused rather than only what survived.
 *
 * @public - consumed by `scripts/propose-places.mjs` and this file's tests.
 */
export type Rejection =
  | "lifecycle" // disused:/was:/abandoned:/demolished:/removed:/proposed:/construction:
  | "access" // access=private|no, entrance=no
  | "commercial" // shop=*, amenity in the food set; marketplace excepted
  | "unnamed" // no name, /^untitled/i, an address, too short, or over NAME_MAX
  | "in-memoriam" // a memorial to one named person's death
  | "not-public" // a community or residential garden: plots, not a destination
  | "no-vibe" // collected zero Vibes, so no chip could ever reach it
  | "out-of-bounds" // outside PLACE_BOUNDS
  | "not-a-place"; // matched no rule in the classification table

/**
 * A **tagged** union, not `Classification | Rejection`.
 *
 * A bare union of an object with a string literal can only be discriminated by
 * `typeof result === "string"`, and `anti-slop/no-runtime-typeof` is an error
 * in `.oxlintrc.json` with `allowInTypeGuards` off - which bans `typeof`
 * outside an opted-in predicate. `scripts/` is not in `ignorePatterns`, so the
 * proposer is linted under the same rule. The `ok` discriminant is how both
 * sides read this without one.
 *
 * @public - consumed by `scripts/propose-places.mjs` and this file's tests.
 */
export type ClassifyResult =
  | { ok: true; classification: Classification }
  | { ok: false; reason: Rejection };

/**
 * How close is too close. A generated row this near an existing one is the same
 * place under another name, and the hand-curated coordinate is the better one.
 *
 * @public - consumed by `scripts/propose-places.mjs` and `places.test.ts`.
 */
export const DEDUP_METERS = 90;

/**
 * The harvest box, which sits inside the proxy's own wider `RICHMOND_BOUNDS`.
 * Tighter on purpose: the proxy's box is about refusing to be a worldwide
 * routing service, and this one is about what counts as Richmond.
 *
 * @public - consumed by `scripts/propose-places.mjs` and `places.test.ts`.
 */
export const PLACE_BOUNDS = { south: 37.44, west: -77.6, north: 37.64, east: -77.34 };

/** Shortest name that can stand on its own on the result card. */
const NAME_MIN = 4;

/**
 * A name that is really a street address.
 *
 * Measured, not imagined: of 52 markers the first propose run accepted, **38**
 * were Historic Richmond house plaques named "2816 E. Grace", "605 N. 25th
 * Street", "802 N. 25th Street". Each is a real plaque on a real house, and
 * "Marker: 635 North 27th Street" is not an offer - it is an address, and
 * sending somebody on a twenty-minute walk to a house number is this app
 * failing its own promise that the name is the whole offer.
 *
 * The leading house number is the whole tell. A genuine place beginning with a
 * digit - "17th Street Market", "1708 Gallery" - does not match, because the
 * number is part of the name rather than a street address preceding one.
 */
const ADDRESS_LIKE = /^\d+[a-z]?\s+(n|s|e|w|north|south|east|west|[a-z]+\s+(st|street|ave|avenue|rd|road|blvd|boulevard|ln|lane|ter|terrace|pl|place|dr|drive))\b/i;

/** Tag key prefixes that mean "this used to be, or is not yet, a thing". */
const LIFECYCLE_PREFIXES = [
  "disused:",
  "was:",
  "abandoned:",
  "demolished:",
  "removed:",
  "proposed:",
  "construction:",
];

const LIFECYCLE_VALUES = new Set(["construction", "proposed", "razed"]);

/**
 * Commercial amenities, refused wholesale.
 *
 * Neighbourhoods and institutions outlive shops: the data layer's own comment
 * already records that an earlier pass shipped one closed and two moved
 * storefronts. `marketplace` is the sole exception, because a market outlives
 * its vendors.
 */
const COMMERCIAL_AMENITIES = new Set([
  "cafe",
  "restaurant",
  "bar",
  "pub",
  "fast_food",
  "ice_cream",
]);

/**
 * Garden subtypes that are somebody's plot rather than somewhere to walk to.
 *
 * Measured: of 63 named gardens in the Richmond box, **34** are
 * `garden:type=community` and one is `residential`. A community garden is a
 * membership of raised beds, usually behind a gate, and turning up at one
 * because a roulette sent you is not a thing to do. The 27 untagged ones are
 * Lewis Ginter's named gardens - Rose Garden, Sunken Garden, Asian Valley -
 * which are exactly the destinations this harvest is for.
 */
const PRIVATE_GARDEN_TYPES = new Set(["community", "residential", "allotment"]);

const HISTORIC_DESTINATIONS = new Set([
  "monument",
  "fort",
  "archaeological_site",
  "city_gate",
  "aqueduct",
  "memorial",
  "ruins",
  "heritage",
]);

const get = (candidate: OsmCandidate, key: string): string | undefined =>
  candidate.tags.get(key);

const has = (candidate: OsmCandidate, key: string): boolean => candidate.tags.has(key);

/**
 * The name a place would carry, or null when it cannot carry one.
 *
 * "Untitled" is the case that motivates the rule: an artwork named for the fact
 * that it has no name tells a reader nothing, and this app's answer to that is
 * to drop the row rather than to invent a description field. An over-length
 * name is rejected here rather than shipped for `places.test.ts` to catch,
 * because the test governs the file and this governs what reaches it.
 *
 * @public - consumed by `scripts/propose-places.mjs` and this file's tests.
 */
export function placeName(candidate: OsmCandidate): string | null {
  const raw = get(candidate, "name")?.trim();
  if (raw === undefined || raw.length === 0) return null;
  if (/^untitled/i.test(raw)) return null;
  if (ADDRESS_LIKE.test(raw)) return null;
  if (raw.length < NAME_MIN) return null;
  if (raw.length > NAME_MAX) return null;
  return raw;
}

/**
 * A stable, slugged, deduplicated id.
 *
 * Deterministic in the name alone, so re-running the proposer over unchanged
 * data produces unchanged ids - which is what makes `apply-places.mjs` able to
 * refuse a row it has already appended.
 *
 * @public - consumed by `scripts/propose-places.mjs` and this file's tests.
 */
export function placeId(
  candidate: OsmCandidate,
  name: string,
  taken: ReadonlySet<string>,
): string {
  void candidate;
  const base =
    name
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "place";

  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidateId = `${base}-${n}`;
    if (!taken.has(candidateId)) return candidateId;
  }
  return `${base}-${taken.size}`;
}

/** Does any tag key start with a lifecycle prefix, or carry a lifecycle value? */
function isLifecycle(candidate: OsmCandidate): boolean {
  for (const [key, value] of candidate.tags) {
    if (LIFECYCLE_PREFIXES.some((prefix) => key.startsWith(prefix))) return true;
    if (LIFECYCLE_VALUES.has(value)) return true;
  }
  return false;
}

/** The detour tier, or null for a destination. First match wins. */
function detourOf(candidate: OsmCandidate): DetourKind | null {
  const tourism = get(candidate, "tourism");
  if (tourism === "artwork") {
    const kind = get(candidate, "artwork_type");
    return kind === "mural" || kind === "graffiti" ? "mural" : "art";
  }
  if (tourism === "viewpoint") return "overlook";

  const natural = get(candidate, "natural");
  if (natural === "peak" || natural === "cliff") return "overlook";

  if (get(candidate, "highway") === "steps") return "stairs";
  if (get(candidate, "historic") === "memorial" && has(candidate, "memorial")) return "marker";

  const manMade = get(candidate, "man_made");
  if (manMade === "bridge" || manMade === "pier") return "bridge";
  if (manMade === "water_tower" || manMade === "lighthouse" || manMade === "obelisk") return "art";

  // "street" has no automatic rule. It exists for the handful of notable
  // streets - Monument Avenue is already hand-curated - and is only ever set by
  // hand.
  return null;
}

/** Every vibe this element collects. OR semantics; order follows `VIBES`. */
function vibesOf(candidate: OsmCandidate, name: string): Vibe[] {
  const vibes = new Set<Vibe>();

  const leisure = get(candidate, "leisure");
  const tourism = get(candidate, "tourism");
  const amenity = get(candidate, "amenity");
  const historic = get(candidate, "historic");
  const natural = get(candidate, "natural");
  const manMade = get(candidate, "man_made");

  if (
    has(candidate, "waterway") ||
    manMade === "pier" ||
    leisure === "slipway" ||
    /James|Canal|River|Kanawha|Floodwall/i.test(name)
  ) {
    vibes.add("river");
  }

  const isPark =
    leisure === "park" ||
    leisure === "garden" ||
    leisure === "nature_reserve" ||
    leisure === "dog_park" ||
    get(candidate, "landuse") === "recreation_ground";
  if (isPark) vibes.add("park");

  // Museums only. `tourism=gallery` is not here for the same reason it is not
  // in `isPlaceLike`: in this box it is overwhelmingly commercial art dealers.
  if (tourism === "museum") vibes.add("museum");
  if (amenity === "arts_centre" || amenity === "theatre" || amenity === "library") {
    vibes.add("museum");
  }

  if (
    (historic !== undefined && HISTORIC_DESTINATIONS.has(historic)) ||
    has(candidate, "heritage") ||
    has(candidate, "ref:nrhp") ||
    has(candidate, "memorial") ||
    get(candidate, "landuse") === "cemetery"
  ) {
    vibes.add("history");
  }

  if (amenity === "marketplace") vibes.add("food");

  if (
    tourism === "viewpoint" ||
    tourism === "artwork" ||
    manMade === "bridge" ||
    natural === "peak" ||
    natural === "cliff" ||
    natural === "waterfall" ||
    get(candidate, "highway") === "steps" ||
    (isPark && vibes.has("river"))
  ) {
    vibes.add("scenic");
  }

  return [...vibes];
}

/**
 * Additive notability, ranking only.
 *
 * Never a gate, and the measurement is why: only 6 of 200 Richmond memorials
 * and 39 of 125 named parks carry `wikidata`. Gating on it would delete the
 * marker and mural tiers outright.
 */
function scoreOf(candidate: OsmCandidate, name: string): number {
  let score = 0;
  if (has(candidate, "wikidata")) score += 30;
  if (has(candidate, "wikipedia")) score += 20;
  if (has(candidate, "heritage") || has(candidate, "ref:nrhp")) score += 15;
  if (has(candidate, "website")) score += 10;
  if (has(candidate, "name:en") || name.length > 12) score += 10;
  if (has(candidate, "wikimedia_commons")) score += 10;
  if (has(candidate, "description")) score += 5;
  if (has(candidate, "artwork_type")) score += 5;
  return Math.min(100, score);
}

/** Is this element one this app is willing to send somebody to at all? */
function isPlaceLike(candidate: OsmCandidate): boolean {
  const leisure = get(candidate, "leisure");
  if (
    leisure === "park" ||
    leisure === "garden" ||
    leisure === "nature_reserve" ||
    leisure === "dog_park"
  ) {
    return true;
  }
  if (get(candidate, "landuse") === "cemetery") return true;

  const tourism = get(candidate, "tourism");
  // `tourism=gallery` is deliberately absent. Of the 18 in the Richmond box,
  // most are commercial art dealers - Reynolds, Quirk, Page Bond, Try-Me,
  // Uptown - and nothing in the tags tells those apart from The Anderson or
  // Artspace, which are not. Unsure is a rejection: a destination list that
  // sends somebody to a storefront that has closed or moved is the exact
  // failure the data layer's own comment already records happening once.
  if (
    tourism === "museum" ||
    tourism === "zoo" ||
    tourism === "aquarium" ||
    tourism === "theme_park" ||
    tourism === "artwork" ||
    tourism === "viewpoint"
  ) {
    return true;
  }

  if (get(candidate, "amenity") === "marketplace") return true;

  const historic = get(candidate, "historic");
  if (historic !== undefined && HISTORIC_DESTINATIONS.has(historic)) return true;

  const manMade = get(candidate, "man_made");
  if (
    manMade === "bridge" ||
    manMade === "pier" ||
    manMade === "water_tower" ||
    manMade === "lighthouse" ||
    manMade === "obelisk"
  ) {
    return true;
  }

  if (get(candidate, "highway") === "steps") return true;

  const natural = get(candidate, "natural");
  return natural === "peak" || natural === "cliff" || natural === "spring" || natural === "waterfall";
}

/**
 * The whole table, in one pass: refuse, then tier, then vibes, then score.
 *
 * Rejections are checked first and short-circuit, because every one of them is
 * cheaper than the work below it and because a refused element must never
 * accumulate a score somebody could read as an endorsement.
 *
 * @public - consumed by `scripts/propose-places.mjs` and this file's tests.
 */
export function classify(candidate: OsmCandidate): ClassifyResult {
  if (isLifecycle(candidate)) return { ok: false, reason: "lifecycle" };

  const access = get(candidate, "access");
  if (access === "private" || access === "no" || get(candidate, "entrance") === "no") {
    return { ok: false, reason: "access" };
  }

  const amenity = get(candidate, "amenity");
  if (has(candidate, "shop") || (amenity !== undefined && COMMERCIAL_AMENITIES.has(amenity))) {
    return { ok: false, reason: "commercial" };
  }

  if (get(candidate, "leisure") === "garden") {
    const type = get(candidate, "garden:type");
    if (type !== undefined && PRIVATE_GARDEN_TYPES.has(type)) {
      return { ok: false, reason: "not-public" };
    }
  }

  // A ghost bike marks where a named cyclist was killed in traffic. Four of
  // them are in the Richmond box, and the first propose run accepted three -
  // as "Marker: Robyn Hightman", a person's name with no context, drawn at
  // random and presented as a small delight.
  //
  // This app has no room on the card to say what that place is, and no business
  // making a roulette prize of it. The refusal is a product decision rather than
  // a data rule, which is exactly why it is written down here rather than left
  // to whoever reviews the list to notice.
  if (get(candidate, "memorial") === "ghost_bike") {
    return { ok: false, reason: "in-memoriam" };
  }

  const { lat, lng } = candidate.seed;
  if (
    lat < PLACE_BOUNDS.south ||
    lat > PLACE_BOUNDS.north ||
    lng < PLACE_BOUNDS.west ||
    lng > PLACE_BOUNDS.east
  ) {
    return { ok: false, reason: "out-of-bounds" };
  }

  const name = placeName(candidate);
  if (name === null) return { ok: false, reason: "unnamed" };

  if (!isPlaceLike(candidate)) return { ok: false, reason: "not-a-place" };

  const tags = vibesOf(candidate, name);
  // No vibe means no chip can reach it, so it would sit in the data as a dot
  // nobody can filter to. That is worse than absent.
  if (tags.length === 0) return { ok: false, reason: "no-vibe" };

  return {
    ok: true,
    classification: { detour: detourOf(candidate), tags, score: scoreOf(candidate, name) },
  };
}
