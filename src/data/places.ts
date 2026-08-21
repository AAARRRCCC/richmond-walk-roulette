import type { LngLat } from "../lib/geometry.ts";

export type Vibe = "river" | "park" | "museum" | "history" | "food" | "scenic";

/**
 * A second tier of place: not somewhere to arrive, but a reason to walk a
 * particular way.
 *
 * The *absence* of this field is the destination tier, which is why none of the
 * hand-curated rows carry it and why adding the tier cost those rows nothing.
 *
 * The value is also the word the result card prints where a destination prints
 * "Your walk". That is a *category*, not a description. The distinction is
 * load-bearing: "the name is the whole offer" works for a destination because
 * the name names a known thing - "Maymont" is a complete sentence in Richmond -
 * and it does not survive contact with a plaque whose name is the first line of
 * its inscription. Rather than answer that with a description field, the
 * proposer drops any candidate whose name is not self-describing and the tier
 * word supplies the category the name alone cannot.
 */
export type DetourKind =
  | "mural"
  | "art"
  | "overlook"
  | "stairs"
  | "marker"
  | "bridge"
  | "street";

export type Place = LngLat & {
  id: string;
  name: string;
  tags: Vibe[];
  /** Second tier. Absent means a destination. */
  detour?: DetourKind;
  /**
   * The OpenStreetMap element this row came from, as `type/id`, e.g.
   * `way/23456789`.
   *
   * Identity, not data: it exists so a later pass can re-read tags for the same
   * feature without re-matching by name, and `opening-hours` (chunk 9) is its
   * consumer. Generated rows always carry it; the hand-curated rows do not yet,
   * and chunk 9 backfills them by hand.
   *
   * **Presence of this field is not a reliable discriminator for "generated".**
   * An earlier draft used it as one, which stops being true the moment chunk 9
   * backfills. `HAND_CURATED_COUNT` is the discriminator - see below.
   */
  osm?: string;
};

/** Which tier the spin is drawing from. */
export type PlaceKind = "any" | "destination" | "detour";

/** Segments for the Kind control, in render order. */
export const PLACE_KINDS: { id: PlaceKind; label: string }[] = [
  { id: "any", label: "Any" },
  { id: "destination", label: "Places" },
  { id: "detour", label: "Detours" },
];

/**
 * The card's eyebrow word per tier. A destination has no entry and prints
 * "Your walk".
 */
export const DETOUR_LABELS = {
  mural: "Mural",
  art: "Public art",
  overlook: "Overlook",
  stairs: "Stairs",
  marker: "Marker",
  bridge: "Bridge",
  street: "Street",
  // `satisfies` rather than an annotation, the same way `REASON_COPY` is
  // written: the record still has to be total over the union - a missing tier
  // is a tsc error, which is the point - but the inferred type keeps each
  // label's own literal rather than widening all seven to `string`.
} satisfies Record<DetourKind, string>;

/**
 * The tier predicate.
 *
 * It lives **here** rather than in `osm-rules.ts`, and that placement is
 * load-bearing rather than tidy: App builds a `PoolRule` around it, so whichever
 * module holds it is in the app's import graph. Keeping it beside the data it
 * questions is what lets `osm-rules.ts` stay proposer-and-test-only and ship
 * zero bytes.
 */
export function matchesKind(place: Place, kind: PlaceKind): boolean {
  if (kind === "any") return true;
  return kind === "detour" ? place.detour !== undefined : place.detour === undefined;
}

/**
 * Hard ceiling on the dataset, asserted by `places.test.ts`.
 *
 * A build-time wall rather than a runtime discovery, because at 600 places the
 * cost is roughly +19 KB gzipped - about a fifth of the whole app JS budget -
 * and that has to be a decision somebody argues for rather than something that
 * happens.
 */
export const MAX_PLACES = 250;

/**
 * How many rows above the generated boundary are hand-curated.
 *
 * The discriminator, and it is a count rather than a field because the obvious
 * field does not survive: `opening-hours` backfills `osm` onto the hand rows,
 * after which presence of `osm` means nothing. `apply-places.mjs` is
 * append-only, so the generated rows are always a suffix and one exact number
 * separates them for good.
 */
export const HAND_CURATED_COUNT = 62;

/**
 * Longest name a **generated** row may carry, measured rather than guessed.
 *
 * The `.result-name` is 25 px in a fixed-width rail. The longest hand-curated
 * name is "White House of the Confederacy" at 30 characters, so 32 is the
 * ceiling that name already proves the rail can hold, with two characters of
 * headroom.
 *
 * The hand-curated rows are exempt from the assertion, deliberately: a person
 * naming a real Richmond institution has standing the proposer does not.
 * `placeName` rejects an over-length OSM name at source rather than shipping
 * one for the test to catch.
 */
export const NAME_MAX = 32;

/**
 * Curated walking destinations in and around downtown Richmond.
 *
 * Coordinates come from OpenStreetMap via Overpass, geocoded once and baked in;
 * data (c) OpenStreetMap contributors, ODbL. Two exceptions are noted inline
 * where OSM had no entry. For large features such as parks and cemeteries the
 * point is a public entrance or a recognisable spot inside, not the polygon
 * centroid, so the walking route lands somewhere a person can actually stand.
 *
 * A place carries no description: the name is the whole offer, and the walk is
 * the point. It carries no terrain either, and that is a deletion rather than an
 * omission: hilliness is a property of a route, not of a dot. Church Hill is
 * flat once you are on it and brutal on the way up, and which of those you get
 * depends entirely on where you started - which a tag beside a coordinate
 * cannot express. It is measured per walk now, from the origin you chose. Watch that with anything on a schedule - the markets below are
 * seasonal or weekly, and nothing on screen now says so.
 */
export const PLACES: Place[] = [
  { id: "vmfa", name: "VMFA", lat: 37.556058, lng: -77.474895, tags: ["museum"] },
  { id: "belle-isle", name: "Belle Isle", lat: 37.529197, lng: -77.452844, tags: ["river", "park", "scenic"] },
  { id: "hollywood", name: "Hollywood Cemetery", lat: 37.536582, lng: -77.456874, tags: ["history", "scenic"] },
  { id: "maymont", name: "Maymont", lat: 37.535784, lng: -77.477576, tags: ["park", "scenic"] },
  { id: "capitol", name: "Capitol Square", lat: 37.538818, lng: -77.433558, tags: ["history"] },
  { id: "canal-walk", name: "Canal Walk", lat: 37.533742, lng: -77.438898, tags: ["river", "scenic"] },
  { id: "browns", name: "Brown's Island", lat: 37.534082, lng: -77.442379, tags: ["river", "park"] },
  { id: "libby-hill", name: "Libby Hill Park", lat: 37.526758, lng: -77.41738, tags: ["park", "scenic"] },
  { id: "carytown", name: "Carytown", lat: 37.55243, lng: -77.477852, tags: ["food"] },
  { id: "byrd", name: "Byrd Park", lat: 37.541968, lng: -77.478958, tags: ["park"] },
  { id: "texas-beach", name: "Texas Beach", lat: 37.532657, lng: -77.475807, tags: ["river", "scenic"] },
  { id: "pump-house", name: "Pump House", lat: 37.53766, lng: -77.488184, tags: ["history", "river"] },
  { id: "forest-hill", name: "Forest Hill Park", lat: 37.51944, lng: -77.47253, tags: ["park", "scenic"] },
  { id: "chimborazo", name: "Chimborazo Park", lat: 37.525462, lng: -77.411836, tags: ["park", "history"] },
  { id: "jefferson-park", name: "Jefferson Park", lat: 37.53549, lng: -77.421612, tags: ["park", "scenic"] },
  { id: "manch-flood", name: "Manchester Floodwall", lat: 37.528432, lng: -77.442038, tags: ["river", "scenic"] },
  { id: "tpott", name: "Potterfield Bridge", lat: 37.531915, lng: -77.445225, tags: ["river", "scenic"] },
  { id: "tredegar", name: "Tredegar Iron Works", lat: 37.53517, lng: -77.445236, tags: ["history", "museum"] },
  { id: "shockoe", name: "Shockoe Bottom", lat: 37.531485, lng: -77.425133, tags: ["food", "history"] },
  { id: "main-st", name: "Main Street Station", lat: 37.534932, lng: -77.428813, tags: ["history"] },
  { id: "poe", name: "Poe Museum", lat: 37.532158, lng: -77.426075, tags: ["museum", "history"] },
  { id: "st-johns", name: "St. John's Church", lat: 37.5306, lng: -77.4197, tags: ["history"] },
  { id: "monument", name: "Monument Avenue", lat: 37.554232, lng: -77.460419, tags: ["scenic", "history"] },
  { id: "scotts-add", name: "Scott's Addition", lat: 37.569591, lng: -77.471222, tags: ["food"] },
  { id: "diamond", name: "The Diamond", lat: 37.571694, lng: -77.463283, tags: ["history"] },
  { id: "sci-museum", name: "Science Museum", lat: 37.561121, lng: -77.46582, tags: ["museum"] },
  { id: "battery", name: "Battery Park", lat: 37.566526, lng: -77.439281, tags: ["park"] },
  { id: "jackson-ward", name: "Jackson Ward", lat: 37.548611, lng: -77.441865, tags: ["history", "food"] },
  { id: "vcu-compass", name: "VCU Compass", lat: 37.548147, lng: -77.453196, tags: ["scenic"] },
  { id: "siegel", name: "Siegel Center", lat: 37.552875, lng: -77.452827, tags: ["history"] },
  { id: "17th-mkt", name: "17th Street Market", lat: 37.533977, lng: -77.428235, tags: ["food"] },
  { id: "fan", name: "The Fan", lat: 37.553793, lng: -77.468418, tags: ["scenic"] },
  { id: "church-hill", name: "Church Hill", lat: 37.530471, lng: -77.414418, tags: ["history", "food"] },
  { id: "reedy-creek", name: "Reedy Creek", lat: 37.524335, lng: -77.469645, tags: ["park", "scenic"] },

  // Businesses are deliberately rare here. Hatch Local, Ruby Scoops and a
  // Gelati Celesti node all came out of this pass: one had closed, two had
  // moved. Neighbourhoods and institutions outlive their storefronts.
  { id: "scoop", name: "Scoop", lat: 37.555359, lng: -77.466681, tags: ["food"] },

  // Markets. Every one of these is seasonal or weekly, and nothing in the UI
  // says which, so a spin can send someone to a closed lot.
  { id: "birdhouse-market", name: "Birdhouse Market", lat: 37.544389, lng: -77.462018, tags: ["food"] },
  { id: "sotj-market", name: "South of the James Market", lat: 37.520813, lng: -77.473387, tags: ["food", "park"] },

  // Museums.
  { id: "black-history", name: "Black History Museum", lat: 37.550047, lng: -77.44135, tags: ["museum", "history"] },
  { id: "maggie-walker", name: "Maggie L. Walker House", lat: 37.547882, lng: -77.437551, tags: ["museum", "history"] },
  { id: "valentine", name: "The Valentine", lat: 37.541495, lng: -77.431118, tags: ["museum", "history"] },
  { id: "marshall-house", name: "John Marshall House", lat: 37.541923, lng: -77.433085, tags: ["museum", "history"] },
  { id: "holocaust", name: "Virginia Holocaust Museum", lat: 37.530906, lng: -77.425964, tags: ["museum", "history"] },
  { id: "whoc", name: "White House of the Confederacy", lat: 37.540712, lng: -77.429602, tags: ["museum", "history"] },
  { id: "vmhc", name: "Virginia Museum of History", lat: 37.558027, lng: -77.473628, tags: ["museum"] },
  { id: "childrens", name: "Children's Museum", lat: 37.56239, lng: -77.467256, tags: ["museum"] },
  { id: "railroad", name: "Richmond Railroad Museum", lat: 37.525926, lng: -77.435633, tags: ["museum", "history"] },
  { id: "branch", name: "Branch Museum", lat: 37.55823, lng: -77.46832, tags: ["museum"] },

  // Monuments and markers.
  {
    id: "pyramid",
    name: "Confederate Pyramid",
    // Not in OpenStreetMap. Point taken from the geotag on Wikimedia Commons'
    // photograph of the monument, which lands inside Hollywood Cemetery's
    // Confederate section.
    lat: 37.536111,
    lng: -77.458333,
    tags: ["history", "scenic"],
  },
  { id: "bojangles", name: "Bojangles Statue", lat: 37.549347, lng: -77.440362, tags: ["history", "scenic"] },
  { id: "reconciliation", name: "Reconciliation Statue", lat: 37.53486, lng: -77.430429, tags: ["history"] },

  // Campus.
  { id: "vcu-commons", name: "VCU Student Commons", lat: 37.546528, lng: -77.453442, tags: ["scenic"] },
  // --- Shockoe Slip and the Bottom, added for the downtown origin. All
  // coordinates from OpenStreetMap via Overpass, as above.
  { id: "triple-crossing", name: "Triple Crossing", lat: 37.53196, lng: -77.43139, tags: ["history", "scenic"] },
  { id: "first-freedom", name: "First Freedom Center", lat: 37.53482, lng: -77.43252, tags: ["museum", "history"] },
  { id: "pipeline", name: "Pipeline Overlook", lat: 37.53324, lng: -77.43595, tags: ["river", "scenic"] },
  { id: "lumpkins", name: "Lumpkin's Slave Jail", lat: 37.5366, lng: -77.42849, tags: ["history"] },
  { id: "african-burial", name: "African Burial Ground", lat: 37.538, lng: -77.42685, tags: ["history"] },
  { id: "exec-mansion", name: "Executive Mansion", lat: 37.53843, lng: -77.43215, tags: ["history"] },
  { id: "monumental", name: "Monumental Church", lat: 37.53889, lng: -77.42984, tags: ["history"] },
  { id: "bell-tower", name: "Bell Tower", lat: 37.53895, lng: -77.4353, tags: ["history"] },
  { id: "taylors-hill", name: "Taylor's Hill Park", lat: 37.53231, lng: -77.42292, tags: ["park", "scenic"] },
  { id: "shiplock", name: "Great Shiplock Park", lat: 37.52612, lng: -77.42183, tags: ["river", "park", "history"] },
  { id: "ancarrows", name: "Ancarrow's Landing", lat: 37.52067, lng: -77.42316, tags: ["river", "park", "history"] },

  // ---------------------------------------------------------------------------
  // Generated by scripts/apply-places.mjs from data/proposals/accepted.txt.
  // Everything ABOVE this line is hand-curated and wins every conflict: the
  // hand-picked coordinates were chosen by someone who has stood there, and the
  // proposer refuses to emit a row within DEDUP_METERS of one. Edit generated
  // rows freely - re-running apply never rewrites a row that already exists by
  // id, it only appends.
  // Map data (c) OpenStreetMap contributors, ODbL.
  // ---------------------------------------------------------------------------
];

export type Origin = LngLat & {
  id: string;
  name: string;
};

/** Presets for the origin picker. Any of these is a plausible place to start. */
export const PRESET_ORIGINS: Origin[] = [
  { id: "home", name: "Home (downtown)", lat: 37.5388, lng: -77.4336 },
  { id: "monroe", name: "Monroe Park", lat: 37.546961, lng: -77.450237 },
  { id: "siegel", name: "Siegel Center", lat: 37.552875, lng: -77.452827 },
  { id: "vmfa", name: "VMFA", lat: 37.556058, lng: -77.474895 },
  { id: "carytown", name: "Carytown", lat: 37.55243, lng: -77.477852 },
  { id: "capitol", name: "Capitol Square", lat: 37.538818, lng: -77.433558 },
  { id: "maymont", name: "Maymont", lat: 37.535784, lng: -77.477576 },
  { id: "belle-isle", name: "Belle Isle", lat: 37.529197, lng: -77.452844 },
  { id: "libby-hill", name: "Libby Hill", lat: 37.526758, lng: -77.41738 },
  { id: "manchester", name: "Manchester", lat: 37.528432, lng: -77.442038 },
  { id: "scotts-add", name: "Scott's Addition", lat: 37.569591, lng: -77.471222 },
];

export const DEFAULT_ORIGIN = PRESET_ORIGINS[0]!;

export const VIBES: { id: Vibe; label: string }[] = [
  { id: "river", label: "River" },
  { id: "park", label: "Park" },
  { id: "museum", label: "Museum" },
  { id: "history", label: "History" },
  { id: "food", label: "Food" },
  { id: "scenic", label: "Scenic" },
];
