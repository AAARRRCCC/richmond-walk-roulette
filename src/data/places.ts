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
 * cannot express. It is measured per walk now, from the origin you chose.
 *
 * Schedules are no longer nobody's problem either: `osm` joins a row to an
 * OpenStreetMap element, `scripts/build-hours.mjs` bakes what that element says
 * about opening hours, and the card judges it at the time you would arrive. A
 * row without an `osm` id can never gain hours, which is why the field is worth
 * the bytes.
 */
export const PLACES: Place[] = [
  { id: "vmfa", name: "VMFA", lat: 37.556058, lng: -77.474895, tags: ["museum"] },
  { id: "belle-isle", name: "Belle Isle", lat: 37.529197, lng: -77.452844, tags: ["river", "park", "scenic"], osm: "relation/6243498" },
  { id: "hollywood", name: "Hollywood Cemetery", lat: 37.536582, lng: -77.456874, tags: ["history", "scenic"], osm: "way/76362268" },
  { id: "maymont", name: "Maymont", lat: 37.535784, lng: -77.477576, tags: ["park", "scenic"], osm: "way/264469781" },
  { id: "capitol", name: "Capitol Square", lat: 37.538818, lng: -77.433558, tags: ["history"] },
  { id: "canal-walk", name: "Canal Walk", lat: 37.533742, lng: -77.438898, tags: ["river", "scenic"] },
  { id: "browns", name: "Brown's Island", lat: 37.534082, lng: -77.442379, tags: ["river", "park"], osm: "way/76314480" },
  { id: "libby-hill", name: "Libby Hill Park", lat: 37.526758, lng: -77.41738, tags: ["park", "scenic"], osm: "way/298621431" },
  { id: "carytown", name: "Carytown", lat: 37.55243, lng: -77.477852, tags: ["food"], osm: "way/236026086" },
  { id: "byrd", name: "Byrd Park", lat: 37.541968, lng: -77.478958, tags: ["park"], osm: "way/264469782" },
  { id: "texas-beach", name: "Texas Beach", lat: 37.532657, lng: -77.475807, tags: ["river", "scenic"], osm: "way/303803586" },
  { id: "pump-house", name: "Pump House", lat: 37.53766, lng: -77.488184, tags: ["history", "river"], osm: "way/236152567" },
  { id: "forest-hill", name: "Forest Hill Park", lat: 37.51944, lng: -77.47253, tags: ["park", "scenic"] },
  { id: "chimborazo", name: "Chimborazo Park", lat: 37.525462, lng: -77.411836, tags: ["park", "history"], osm: "relation/10049004" },
  { id: "jefferson-park", name: "Jefferson Park", lat: 37.53549, lng: -77.421612, tags: ["park", "scenic"], osm: "way/266890328" },
  { id: "manch-flood", name: "Manchester Floodwall", lat: 37.528432, lng: -77.442038, tags: ["river", "scenic"] },
  { id: "tpott", name: "Potterfield Bridge", lat: 37.531915, lng: -77.445225, tags: ["river", "scenic"] },
  { id: "tredegar", name: "Tredegar Iron Works", lat: 37.53517, lng: -77.445236, tags: ["history", "museum"], osm: "node/898650652" },
  { id: "shockoe", name: "Shockoe Bottom", lat: 37.531485, lng: -77.425133, tags: ["food", "history"] },
  { id: "main-st", name: "Main Street Station", lat: 37.534932, lng: -77.428813, tags: ["history"], osm: "way/113030476" },
  { id: "poe", name: "Poe Museum", lat: 37.532158, lng: -77.426075, tags: ["museum", "history"], osm: "node/13352676244" },
  { id: "st-johns", name: "St. John's Church", lat: 37.5306, lng: -77.4197, tags: ["history"] },
  { id: "monument", name: "Monument Avenue", lat: 37.554232, lng: -77.460419, tags: ["scenic", "history"] },
  { id: "scotts-add", name: "Scott's Addition", lat: 37.569591, lng: -77.471222, tags: ["food"], osm: "node/9208267175" },
  { id: "diamond", name: "The Diamond", lat: 37.571694, lng: -77.463283, tags: ["history"], osm: "way/38173754" },
  { id: "sci-museum", name: "Science Museum", lat: 37.561121, lng: -77.46582, tags: ["museum"], osm: "node/13353752420" },
  { id: "battery", name: "Battery Park", lat: 37.566526, lng: -77.439281, tags: ["park"], osm: "way/677107281" },
  { id: "jackson-ward", name: "Jackson Ward", lat: 37.548611, lng: -77.441865, tags: ["history", "food"], osm: "way/1517671817" },
  { id: "vcu-compass", name: "VCU Compass", lat: 37.548147, lng: -77.453196, tags: ["scenic"] },
  { id: "siegel", name: "Siegel Center", lat: 37.552875, lng: -77.452827, tags: ["history"], osm: "way/226503191" },
  { id: "17th-mkt", name: "17th Street Market", lat: 37.533977, lng: -77.428235, tags: ["food"] },
  { id: "fan", name: "The Fan", lat: 37.553793, lng: -77.468418, tags: ["scenic"] },
  { id: "church-hill", name: "Church Hill", lat: 37.530471, lng: -77.414418, tags: ["history", "food"], osm: "way/751156302" },
  { id: "reedy-creek", name: "Reedy Creek", lat: 37.524335, lng: -77.469645, tags: ["park", "scenic"], osm: "way/76211910" },

  // Businesses are deliberately rare here. Hatch Local, Ruby Scoops and a
  // Gelati Celesti node all came out of this pass: one had closed, two had
  // moved. Neighbourhoods and institutions outlive their storefronts.
  { id: "scoop", name: "Scoop", lat: 37.555359, lng: -77.466681, tags: ["food"], osm: "node/10968377014" },

  // Markets. Every one of these is seasonal or weekly - and the app now says
  // which: a mask baked from OSM closes them out of season, and "Skip closed
  // places" keeps them out of the spin.
  { id: "birdhouse-market", name: "Birdhouse Market", lat: 37.544389, lng: -77.462018, tags: ["food"] },
  { id: "sotj-market", name: "South of the James Market", lat: 37.520813, lng: -77.473387, tags: ["food", "park"] },

  // Museums.
  { id: "black-history", name: "Black History Museum", lat: 37.550047, lng: -77.44135, tags: ["museum", "history"], osm: "node/13351826899" },
  { id: "maggie-walker", name: "Maggie L. Walker House", lat: 37.547882, lng: -77.437551, tags: ["museum", "history"] },
  { id: "valentine", name: "The Valentine", lat: 37.541495, lng: -77.431118, tags: ["museum", "history"], osm: "way/224601768" },
  { id: "marshall-house", name: "John Marshall House", lat: 37.541923, lng: -77.433085, tags: ["museum", "history"], osm: "way/345031039" },
  { id: "holocaust", name: "Virginia Holocaust Museum", lat: 37.530906, lng: -77.425964, tags: ["museum", "history"], osm: "way/225586238" },
  { id: "whoc", name: "White House of the Confederacy", lat: 37.540712, lng: -77.429602, tags: ["museum", "history"], osm: "way/224601753" },
  { id: "vmhc", name: "Virginia Museum of History", lat: 37.558027, lng: -77.473628, tags: ["museum"], osm: "node/5696388058" },
  { id: "childrens", name: "Children's Museum", lat: 37.56239, lng: -77.467256, tags: ["museum"], osm: "way/44888557" },
  { id: "railroad", name: "Richmond Railroad Museum", lat: 37.525926, lng: -77.435633, tags: ["museum", "history"], osm: "way/463588973" },
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
  { id: "reconciliation", name: "Reconciliation Statue", lat: 37.53486, lng: -77.430429, tags: ["history"], osm: "node/3696244196" },

  // Campus.
  { id: "vcu-commons", name: "VCU Student Commons", lat: 37.546528, lng: -77.453442, tags: ["scenic"] },
  // --- Shockoe Slip and the Bottom, added for the downtown origin. All
  // coordinates from OpenStreetMap via Overpass, as above.
  { id: "triple-crossing", name: "Triple Crossing", lat: 37.53196, lng: -77.43139, tags: ["history", "scenic"], osm: "node/4261567908" },
  { id: "first-freedom", name: "First Freedom Center", lat: 37.53482, lng: -77.43252, tags: ["museum", "history"], osm: "node/3500856476" },
  { id: "pipeline", name: "Pipeline Overlook", lat: 37.53324, lng: -77.43595, tags: ["river", "scenic"], osm: "node/3070522846" },
  { id: "lumpkins", name: "Lumpkin's Slave Jail", lat: 37.5366, lng: -77.42849, tags: ["history"], osm: "way/368238477" },
  { id: "african-burial", name: "African Burial Ground", lat: 37.538, lng: -77.42685, tags: ["history"], osm: "way/315535969" },
  { id: "exec-mansion", name: "Executive Mansion", lat: 37.53843, lng: -77.43215, tags: ["history"] },
  { id: "monumental", name: "Monumental Church", lat: 37.53889, lng: -77.42984, tags: ["history"], osm: "way/224530979" },
  { id: "bell-tower", name: "Bell Tower", lat: 37.53895, lng: -77.4353, tags: ["history"], osm: "way/658620590" },
  { id: "taylors-hill", name: "Taylor's Hill Park", lat: 37.53231, lng: -77.42292, tags: ["park", "scenic"], osm: "way/746447566" },
  { id: "shiplock", name: "Great Shiplock Park", lat: 37.52612, lng: -77.42183, tags: ["river", "park", "history"], osm: "relation/13728919" },
  { id: "ancarrows", name: "Ancarrow's Landing", lat: 37.52067, lng: -77.42316, tags: ["river", "park", "history"], osm: "way/679324138" },

  // ---------------------------------------------------------------------------
  // Generated by scripts/apply-places.mjs from data/proposals/accepted.txt.
  // Everything ABOVE this line is hand-curated and wins every conflict: the
  // hand-picked coordinates were chosen by someone who has stood there, and the
  // proposer refuses to emit a row within DEDUP_METERS of one. Edit generated
  // rows freely - re-running apply never rewrites a row that already exists by
  // id, it only appends.
  // Map data (c) OpenStreetMap contributors, ODbL.
  // ---------------------------------------------------------------------------
  { id: "barton-heights-cemetery", name: "Barton Heights Cemetery", lat: 37.557951, lng: -77.431499, tags: ["history"], osm: "way/44884751" },
  { id: "fifth-street-viaduct", name: "Fifth Street Viaduct", lat: 37.553434, lng: -77.427521, tags: ["scenic"], detour: "bridge", osm: "way/710713202" },
  { id: "bryan-park", name: "Bryan Park", lat: 37.592938, lng: -77.474972, tags: ["park", "history"], osm: "way/316099498" },
  { id: "arthur-ashe-statue", name: "Arthur Ashe Statue", lat: 37.565231, lng: -77.479084, tags: ["scenic"], detour: "art", osm: "node/5209437090" },
  { id: "chimborazo-medical-museum", name: "Chimborazo Medical Museum", lat: 37.52689, lng: -77.412135, tags: ["museum"], osm: "way/298621404" },
  { id: "edgar-allan-poe", name: "Edgar Allan Poe", lat: 37.540042, lng: -77.434259, tags: ["history", "scenic"], detour: "art", osm: "node/5420002328" },
  { id: "oakwood-cemetery", name: "Oakwood Cemetery", lat: 37.536758, lng: -77.396155, tags: ["history"], osm: "relation/17173266" },
  { id: "chloe", name: "Chloe", lat: 37.557009, lng: -77.475286, tags: ["scenic"], detour: "art", osm: "node/7095866280" },
  { id: "hebrew-cemetery", name: "Hebrew Cemetery", lat: 37.552451, lng: -77.429799, tags: ["history"], osm: "way/44703329" },
  { id: "rumors-of-war", name: "Rumors of War", lat: 37.556489, lng: -77.473957, tags: ["scenic"], detour: "art", osm: "node/7095879702" },
  { id: "gambles-hill-park", name: "Gambles Hill Park", lat: 37.53739, lng: -77.446945, tags: ["park"], osm: "way/264479485" },
  { id: "powhatan-stone", name: "Powhatan Stone", lat: 37.524681, lng: -77.412807, tags: ["history"], detour: "marker", osm: "node/13294886983" },
  { id: "patrick-henry-park", name: "Patrick Henry Park", lat: 37.532013, lng: -77.419602, tags: ["park", "history"], osm: "way/266890327" },
  { id: "robert-e-lee-memorial-bridge", name: "Robert E. Lee Memorial Bridge", lat: 37.53068, lng: -77.450578, tags: ["scenic"], detour: "bridge", osm: "relation/16271271" },
  { id: "deep-run-park", name: "Deep Run Park", lat: 37.625419, lng: -77.58924, tags: ["park"], osm: "relation/11623997" },
  { id: "i-can-because-i-said-so", name: "I Can Because I Said So", lat: 37.571401, lng: -77.43391, tags: ["scenic"], detour: "mural", osm: "node/13658908095" },
  { id: "richmond-national-cemetery", name: "Richmond National Cemetery", lat: 37.514383, lng: -77.392809, tags: ["history"], osm: "way/38176596" },
  { id: "girl-with-phone", name: "Girl with phone", lat: 37.5607, lng: -77.475491, tags: ["scenic"], detour: "mural", osm: "way/1482292129" },
  { id: "monroe-park", name: "Monroe Park", lat: 37.546955, lng: -77.45022, tags: ["park"], osm: "way/45087752" },
  { id: "icarus-fallen", name: "Icarus Fallen", lat: 37.544274, lng: -77.452777, tags: ["scenic"], detour: "mural", osm: "node/13646021692" },
  { id: "rockwood-park", name: "Rockwood Park", lat: 37.449992, lng: -77.580608, tags: ["park"], osm: "way/315035710" },
  { id: "say-their-names", name: "Say Their Names", lat: 37.567121, lng: -77.476203, tags: ["scenic"], detour: "mural", osm: "way/1481981173" },
  { id: "dabbs-house-museum", name: "Dabbs House Museum", lat: 37.543576, lng: -77.382631, tags: ["museum"], osm: "way/708736666" },
  { id: "chris", name: "Chris", lat: 37.550623, lng: -77.453389, tags: ["scenic"], detour: "mural", osm: "way/1482311468" },
  { id: "ginter-park-historic-district", name: "Ginter Park Historic District", lat: 37.589172, lng: -77.443526, tags: ["park"], osm: "node/356602345" },
  { id: "a-pearl-of-wisdom", name: "A Pearl of Wisdom", lat: 37.557646, lng: -77.462648, tags: ["scenic"], detour: "mural", osm: "node/13599643336" },
  { id: "forest-lawn-cemetery", name: "Forest Lawn Cemetery", lat: 37.593313, lng: -77.435525, tags: ["history"], osm: "way/44659688" },
  { id: "silence-isnt-golden", name: "Silence Isn't Golden", lat: 37.548543, lng: -77.463757, tags: ["scenic"], detour: "mural", osm: "node/13658855185" },
  { id: "carter-jones-park", name: "Carter Jones Park", lat: 37.515855, lng: -77.460362, tags: ["park"], osm: "way/44660433" },
  { id: "nates-bagels", name: "Nate's Bagels", lat: 37.547219, lng: -77.463819, tags: ["scenic"], detour: "mural", osm: "way/1487363788" },
  { id: "woodland-cemetery", name: "Woodland Cemetery", lat: 37.562411, lng: -77.412706, tags: ["history"], osm: "way/44703326" },
  { id: "lockwood-double-house", name: "Lockwood Double House", lat: 37.534231, lng: -77.425467, tags: ["history"], detour: "marker", osm: "node/2179727313" },
  { id: "highland-plaza", name: "Highland Plaza", lat: 37.575373, lng: -77.417086, tags: ["park"], osm: "way/44908077" },
  { id: "oregon-hill-overlook", name: "Oregon Hill Overlook", lat: 37.535276, lng: -77.450509, tags: ["scenic"], detour: "overlook", osm: "node/3017455573" },
  { id: "westhampton-memorial-park", name: "Westhampton Memorial Park", lat: 37.598703, lng: -77.595562, tags: ["history"], osm: "way/45902101" },
  { id: "la-comunidad-ii", name: "La Comunidad II", lat: 37.551536, lng: -77.452697, tags: ["scenic"], detour: "mural", osm: "node/13585998968" },
  { id: "ridge-cemetery", name: "Ridge Cemetery", lat: 37.601161, lng: -77.560377, tags: ["history"], osm: "way/45902915" },
  { id: "royster-house", name: "Royster House", lat: 37.529447, lng: -77.419371, tags: ["history"], detour: "marker", osm: "node/13615589401" },
  { id: "kanawha-plaza", name: "Kanawha Plaza", lat: 37.536486, lng: -77.439459, tags: ["river", "park", "scenic"], osm: "way/225274659" },
  { id: "the-parsons-house", name: "The Parsons House", lat: 37.529395, lng: -77.41721, tags: ["history"], detour: "marker", osm: "node/13615589407" },
  { id: "holly-street-park", name: "Holly Street Park", lat: 37.535549, lng: -77.451764, tags: ["park"], osm: "way/252837456" },
  { id: "ann-carrington-house", name: "Ann Carrington House", lat: 37.531667, lng: -77.420954, tags: ["history"], detour: "marker", osm: "node/13616245533" },
  { id: "abner-clay-park", name: "Abner Clay Park", lat: 37.549615, lng: -77.442466, tags: ["park"], osm: "way/266499307" },
  { id: "c-w-hardwicke-carriage-house", name: "C.W. Hardwicke Carriage House", lat: 37.532758, lng: -77.421918, tags: ["history"], detour: "marker", osm: "node/13616245540" },
  { id: "cheswick-park", name: "Cheswick Park", lat: 37.605648, lng: -77.545258, tags: ["park"], osm: "way/296201488" },
  { id: "netherwood-house", name: "Netherwood House", lat: 37.529931, lng: -77.418091, tags: ["history"], detour: "marker", osm: "node/13616245554" },
  { id: "three-lakes-park", name: "Three Lakes Park", lat: 37.616997, lng: -77.428974, tags: ["park"], osm: "way/296208595" },
  { id: "genl-joseph-l-johnston", name: "Gen'l Joseph L Johnston", lat: 37.530722, lng: -77.417456, tags: ["history"], detour: "marker", osm: "node/13616245561" },
  { id: "robinson-park", name: "Robinson Park", lat: 37.556273, lng: -77.349415, tags: ["park"], osm: "way/342205613" },
  { id: "the-j-m-carter-house", name: "The J.M. Carter House", lat: 37.534554, lng: -77.415902, tags: ["history"], detour: "marker", osm: "node/13616245564" },
  { id: "powhatan-playground", name: "Powhatan Playground", lat: 37.515586, lng: -77.406325, tags: ["park"], osm: "way/576461461" },
  { id: "richardsons-drug-store", name: "Richardson's Drug Store", lat: 37.530061, lng: -77.411536, tags: ["history"], detour: "marker", osm: "node/13632907505" },
  { id: "montrose-heights-playground", name: "Montrose Heights Playground", lat: 37.52354, lng: -77.393982, tags: ["park"], osm: "way/840378385" },
  { id: "hiram-oliver-house", name: "Hiram Oliver House", lat: 37.536272, lng: -77.417126, tags: ["history"], detour: "marker", osm: "node/13636183195" },
  { id: "pocosham-park", name: "Pocosham Park", lat: 37.471165, lng: -77.504437, tags: ["park"], osm: "way/1084702409" },
  { id: "myrtle-terrace", name: "Myrtle Terrace", lat: 37.528064, lng: -77.416372, tags: ["history"], detour: "marker", osm: "node/13641321239" },
  { id: "colored-paupers-cemetery", name: "Colored Paupers Cemetery", lat: 37.536609, lng: -77.389823, tags: ["history"], osm: "way/1446280636" },
  { id: "the-pulliam-house", name: "The Pulliam House", lat: 37.528673, lng: -77.418593, tags: ["history"], detour: "marker", osm: "node/13641321240" },
  { id: "the-jxn-haus", name: "The JXN Haus", lat: 37.550566, lng: -77.432799, tags: ["museum"], osm: "node/13727734577" },
  { id: "2014-princess-anne-avenue", name: "2014 Princess Anne Avenue", lat: 37.535953, lng: -77.420503, tags: ["history"], detour: "marker", osm: "node/13645857198" },
  { id: "powhite-park", name: "Powhite Park", lat: 37.521803, lng: -77.524302, tags: ["park"], osm: "relation/9294688" },
  { id: "elliott-house", name: "Elliott House", lat: 37.533387, lng: -77.415056, tags: ["history"], detour: "marker", osm: "node/13645857200" },
  { id: "pollard-park", name: "Pollard Park", lat: 37.573055, lng: -77.444695, tags: ["park"], osm: "way/307757135" },
  { id: "boatmans-tower", name: "Boatman's Tower", lat: 37.536633, lng: -77.436069, tags: ["scenic"], detour: "art", osm: "node/13978497121" },
  { id: "kiehr-field", name: "Kiehr Field", lat: 37.626518, lng: -77.427776, tags: ["park"], osm: "way/546227792" },
  { id: "fruits-and-veggies", name: "Fruits and Veggies", lat: 37.534601, lng: -77.427344, tags: ["scenic"], detour: "mural", osm: "way/1484770948" },
  { id: "richmond-makers-market", name: "Richmond Makers Market", lat: 37.526249, lng: -77.442303, tags: ["food"], osm: "node/13361298862" },
  { id: "lakeside", name: "Lakeside", lat: 37.614918, lng: -77.469846, tags: ["scenic"], detour: "mural", osm: "way/1484771674" },
  { id: "bandy-field-nature-park", name: "Bandy Field Nature Park", lat: 37.587294, lng: -77.533951, tags: ["park"], osm: "way/171211185" },
  { id: "maggie-lena-walker", name: "Maggie Lena Walker", lat: 37.55758, lng: -77.453182, tags: ["scenic"], detour: "art", osm: "node/5417333240" },
  { id: "huguenot-park", name: "Huguenot Park", lat: 37.514747, lng: -77.598577, tags: ["park"], osm: "way/315813183" },
  { id: "dooley-sundial", name: "Dooley sundial", lat: 37.534401, lng: -77.473867, tags: ["scenic"], detour: "art", osm: "node/5775290150" },
  { id: "triangle-park", name: "Triangle Park", lat: 37.534913, lng: -77.41995, tags: ["park"], osm: "way/365619045" },
  { id: "maggie-lena-walker-statue", name: "Maggie Lena Walker Statue", lat: 37.546195, lng: -77.442606, tags: ["scenic"], detour: "art", osm: "node/7678867202" },
  { id: "westview-park", name: "Westview Park", lat: 37.576795, lng: -77.519456, tags: ["park"], osm: "way/502860808" },
  { id: "manchester-wall-rock-climbing", name: "Manchester Wall Rock Climbing", lat: 37.529542, lng: -77.445958, tags: ["scenic"], detour: "overlook", osm: "node/10968066382" },
  { id: "lucks-field-playground", name: "Lucks Field Playground", lat: 37.545243, lng: -77.414474, tags: ["park"], osm: "way/574960663" },
  { id: "park-guardian-ii", name: "Park Guardian II", lat: 37.536644, lng: -77.449592, tags: ["scenic"], detour: "art", osm: "node/11082221505" },
  { id: "rva-big-market", name: "RVA Big Market", lat: 37.589318, lng: -77.472326, tags: ["food"], osm: "way/1415709159" },
  { id: "park-guardian-i", name: "Park Guardian I", lat: 37.541745, lng: -77.449472, tags: ["scenic"], detour: "art", osm: "node/11089269438" },
  { id: "rva-black-farmers-market", name: "RVA Black Farmers Market", lat: 37.578114, lng: -77.452531, tags: ["food"], osm: "way/1415711161" },
  { id: "crash-dummies", name: "Crash Dummies", lat: 37.550494, lng: -77.452146, tags: ["scenic"], detour: "mural", osm: "node/13585970444" },
  { id: "burying-ground", name: "Burying Ground", lat: 37.575876, lng: -77.537555, tags: ["history"], osm: "node/12952541160" },
  { id: "together-we-rise", name: "Together We Rise", lat: 37.544382, lng: -77.438791, tags: ["scenic"], detour: "mural", osm: "node/13658881408" },
  { id: "emergency-call-box", name: "Emergency Call Box", lat: 37.573052, lng: -77.542594, tags: ["park"], osm: "node/13568547130" },
  { id: "happy-children", name: "Happy Children", lat: 37.5717, lng: -77.435646, tags: ["scenic"], detour: "mural", osm: "node/13658908505" },
  { id: "paradise-park", name: "Paradise Park", lat: 37.549607, lng: -77.461842, tags: ["park"], osm: "way/143098974" },
  { id: "cardinal-points", name: "Cardinal Points", lat: 37.548252, lng: -77.470826, tags: ["scenic"], detour: "art", osm: "node/13666091333" },
  { id: "floodwall-park", name: "Floodwall Park", lat: 37.526781, lng: -77.435145, tags: ["river", "park", "scenic"], osm: "way/491695518" },
  { id: "the-giant-cigarette", name: "The Giant Cigarette", lat: 37.474656, lng: -77.429801, tags: ["scenic"], detour: "art", osm: "way/761043823" },
  { id: "childrens-garden", name: "Children's Garden", lat: 37.622339, lng: -77.47004, tags: ["park"], osm: "node/2805247716" },
  { id: "visual-symphony", name: "Visual Symphony", lat: 37.548546, lng: -77.449195, tags: ["scenic"], detour: "mural", osm: "way/1481952849" },
  { id: "four-seasons-garden", name: "Four Seasons Garden", lat: 37.620525, lng: -77.471263, tags: ["park"], osm: "node/2805247798" },
  { id: "peppermint-butler", name: "Peppermint Butler", lat: 37.551461, lng: -77.447435, tags: ["scenic"], detour: "mural", osm: "way/1481952850" },
  { id: "west-island-garden", name: "West Island Garden", lat: 37.621365, lng: -77.470009, tags: ["park"], osm: "node/2805247802" },
  { id: "grizzly", name: "GRIZZLY", lat: 37.539665, lng: -77.424062, tags: ["scenic"], detour: "mural", osm: "way/1481985613" },
  { id: "lace-house-garden", name: "Lace House Garden", lat: 37.621806, lng: -77.468487, tags: ["park"], osm: "node/2805247822" },
  { id: "think", name: "Think", lat: 37.541833, lng: -77.413497, tags: ["scenic"], detour: "mural", osm: "way/1482362873" },
  { id: "lucy-payne-minor-garden", name: "Lucy Payne Minor Garden", lat: 37.622945, lng: -77.471327, tags: ["park"], osm: "node/2805247823" },
  { id: "jackson-ward-legacies", name: "Jackson Ward Legacies", lat: 37.545568, lng: -77.44051, tags: ["scenic"], detour: "mural", osm: "way/1489939983" },
  { id: "vienna-cobb-anderson-meadow", name: "Vienna Cobb Anderson Meadow", lat: 37.621421, lng: -77.471378, tags: ["park"], osm: "node/2805247825" },
  { id: "manchester-free-bridges", name: "Manchester & Free Bridges", lat: 37.533634, lng: -77.441196, tags: ["history"], detour: "marker", osm: "node/898650767" },
  { id: "lake-view-garden", name: "Lake View Garden", lat: 37.591234, lng: -77.497156, tags: ["park"], osm: "node/5411281241" },
  { id: "tdia-1895-james-river-overlook", name: "TDIA 1895 James River Overlook", lat: 37.533697, lng: -77.444471, tags: ["river", "scenic"], detour: "overlook", osm: "node/2975991287" },
  { id: "homeless-camp-ground", name: "Homeless Camp Ground", lat: 37.478893, lng: -77.516643, tags: ["park"], osm: "node/8295609184" },
  { id: "highest-point-in-henrico-county", name: "Highest Point In Henrico County", lat: 37.590958, lng: -77.566042, tags: ["scenic"], detour: "overlook", osm: "node/3017991713" },
  { id: "hatch-local", name: "Hatch Local", lat: 37.524844, lng: -77.437625, tags: ["food"], osm: "node/10553699900" },
  { id: "david", name: "David", lat: 37.639523, lng: -77.587727, tags: ["scenic"], detour: "art", osm: "node/6618860841" },
  { id: "university-forum", name: "University Forum", lat: 37.574954, lng: -77.539706, tags: ["park"], osm: "node/13544263043" },
  { id: "hydroelectric-plant", name: "Hydroelectric Plant", lat: 37.533693, lng: -77.437329, tags: ["history"], detour: "marker", osm: "node/10164803159" },
  { id: "pony-pasture-park", name: "Pony Pasture Park", lat: 37.549424, lng: -77.515701, tags: ["park"], osm: "relation/6036457" },
  { id: "powhatan-hill-overlook", name: "Powhatan Hill Overlook", lat: 37.515136, lng: -77.407331, tags: ["scenic"], detour: "overlook", osm: "node/10253486981" },
  { id: "lewis-g-larus-park", name: "Lewis G. Larus Park", lat: 37.544931, lng: -77.563981, tags: ["park"], osm: "relation/9972905" },
  { id: "bloody-run", name: "Bloody Run", lat: 37.525982, lng: -77.416461, tags: ["history"], detour: "marker", osm: "node/13615520971" },
  { id: "falling-creek-linear-park", name: "Falling Creek Linear Park", lat: 37.442967, lng: -77.444236, tags: ["park"], osm: "relation/11520213" },
  { id: "22nd-street-pedestrian-stairs", name: "22nd Street Pedestrian Stairs", lat: 37.524459, lng: -77.456036, tags: ["scenic"], detour: "stairs", osm: "way/76227376" },
  { id: "gates-mill-park", name: "Gates Mill Park", lat: 37.450954, lng: -77.453118, tags: ["park"], osm: "relation/11520214" },
  { id: "manchester-floodwall-walk", name: "Manchester Floodwall Walk", lat: 37.527126, lng: -77.439348, tags: ["river", "scenic"], detour: "stairs", osm: "way/167824983" },
  { id: "hidden-creek-park", name: "Hidden Creek Park", lat: 37.556272, lng: -77.394708, tags: ["park"], osm: "relation/11623994" },
  { id: "pipeline-trail", name: "Pipeline Trail", lat: 37.532481, lng: -77.434508, tags: ["scenic"], detour: "stairs", osm: "way/294031479" },
  { id: "dock-street-park", name: "Dock Street Park", lat: 37.524365, lng: -77.419318, tags: ["park"], osm: "relation/16078640" },
  { id: "north-bank-trail", name: "North Bank Trail", lat: 37.530516, lng: -77.46428, tags: ["scenic"], detour: "stairs", osm: "way/296545526" },
  { id: "lombardy-park", name: "Lombardy Park", lat: 37.550878, lng: -77.45859, tags: ["park"], osm: "relation/16467781" },
  { id: "connecting-lodge-footpath", name: "Connecting Lodge Footpath", lat: 37.581853, lng: -77.540645, tags: ["scenic"], detour: "stairs", osm: "way/1417444939" },
  { id: "westwood-playground", name: "Westwood Playground", lat: 37.579555, lng: -77.509677, tags: ["park"], osm: "relation/19397249" },
  { id: "future", name: "Future", lat: 37.536769, lng: -77.434075, tags: ["scenic"], detour: "art", osm: "node/3741870436" },
  { id: "holy-cross-cemetery", name: "Holy Cross Cemetery", lat: 37.55872, lng: -77.427303, tags: ["history"], osm: "way/44703271" },
  { id: "winds-up", name: "Wind's Up", lat: 37.537105, lng: -77.437107, tags: ["scenic"], detour: "art", osm: "node/7682158122" },
  { id: "hotchkiss-field-community-center", name: "Hotchkiss Field Community Center", lat: 37.569601, lng: -77.423474, tags: ["park"], osm: "way/44888595" },
  { id: "hope", name: "Hope", lat: 37.571532, lng: -77.432392, tags: ["scenic"], detour: "mural", osm: "node/13658911353" },
  { id: "patterson-memorial-garden", name: "Patterson Memorial Garden", lat: 37.539816, lng: -77.430819, tags: ["park"], osm: "way/224601757" },
  { id: "gambles-hill", name: "Gambles Hill", lat: 37.537146, lng: -77.444485, tags: ["scenic"], detour: "overlook", osm: "node/356602284" },
  { id: "harrison-park", name: "Harrison Park", lat: 37.548691, lng: -77.454878, tags: ["park"], osm: "way/229722610" },
  { id: "fishing-dock", name: "Fishing Dock", lat: 37.624168, lng: -77.587052, tags: ["river"], detour: "bridge", osm: "way/603735933" },
  { id: "italian-garden", name: "Italian Garden", lat: 37.533661, lng: -77.47678, tags: ["park"], osm: "way/236150754" },
  { id: "huguenot-flatwater-park", name: "Huguenot Flatwater Park", lat: 37.559447, lng: -77.541963, tags: ["park"], osm: "way/264474191" },
  { id: "thomas-square", name: "Thomas Square", lat: 37.541879, lng: -77.460757, tags: ["park"], osm: "way/264670674" },
  { id: "mount-calvary-cemetery", name: "Mount Calvary Cemetery", lat: 37.534453, lng: -77.465509, tags: ["history"], osm: "way/264670697" },
  { id: "canoe-run-park", name: "Canoe Run Park", lat: 37.523133, lng: -77.456498, tags: ["park"], osm: "way/266877983" },
  { id: "humphrey-calder-community-center", name: "Humphrey Calder Community Center", lat: 37.561275, lng: -77.485641, tags: ["park"], osm: "way/366222782" },
  { id: "pony-pasture-park-wetland-park", name: "Pony Pasture Park - Wetland Park", lat: 37.544647, lng: -77.509438, tags: ["park"], osm: "way/402536157" },
  { id: "bill-robinson-playground", name: "Bill Robinson Playground", lat: 37.529696, lng: -77.404193, tags: ["park"], osm: "way/576071486" },
  { id: "pump-house-park", name: "Pump House Park", lat: 37.537283, lng: -77.487194, tags: ["park"], osm: "way/600879394" },
  { id: "oregon-hill-linear-park", name: "Oregon Hill Linear Park", lat: 37.540491, lng: -77.449559, tags: ["park"], osm: "way/601799933" },
  { id: "roy-west-park-washington-park", name: "Roy West Park (Washington Park)", lat: 37.59233, lng: -77.443787, tags: ["park"], osm: "way/679275523" },
  { id: "wayside-spring-park", name: "Wayside Spring Park", lat: 37.525457, lng: -77.484606, tags: ["park"], osm: "way/679310817" },
  { id: "learning-therapy-garden", name: "Learning & Therapy Garden", lat: 37.631655, lng: -77.461963, tags: ["park"], osm: "way/697524178" },
  { id: "butterfly-garden", name: "Butterfly Garden", lat: 37.536815, lng: -77.479549, tags: ["park"], osm: "way/700377908" },
  { id: "fragrance-garden", name: "Fragrance Garden", lat: 37.533584, lng: -77.480469, tags: ["park"], osm: "way/700377915" },
  { id: "lakeside-landing-park", name: "Lakeside Landing Park", lat: 37.613117, lng: -77.458751, tags: ["park"], osm: "way/737415531" },
  { id: "alice-fitz-park", name: "Alice Fitz Park", lat: 37.523061, lng: -77.44781, tags: ["park"], osm: "way/761038913" },
  { id: "oak-grove-playground", name: "Oak Grove Playground", lat: 37.506924, lng: -77.444754, tags: ["park"], osm: "way/761047752" },
  { id: "bethlehem-park", name: "Bethlehem Park", lat: 37.617623, lng: -77.513279, tags: ["park"], osm: "way/847264851" },
  { id: "westwood-park", name: "Westwood Park", lat: 37.588027, lng: -77.513794, tags: ["park"], osm: "way/847264852" },
  { id: "roslyn-hills-park", name: "Roslyn Hills Park", lat: 37.577134, lng: -77.561756, tags: ["park"], osm: "way/847264853" },
  { id: "spring-park-historic-site", name: "Spring Park Historic Site", lat: 37.600513, lng: -77.463121, tags: ["park"], osm: "way/847264859" },
  { id: "yancey-street-playground", name: "Yancey Street Playground", lat: 37.55999, lng: -77.433352, tags: ["park"], osm: "way/949602698" },
  { id: "smith-peters-parks", name: "Smith-Peters Parks", lat: 37.553005, lng: -77.448171, tags: ["park"], osm: "way/1042936185" },
  { id: "north-central-park", name: "North Central Park", lat: 37.577547, lng: -77.435317, tags: ["park"], osm: "way/1052171286" },
  { id: "riverside-meadow-greenspace", name: "Riverside Meadow Greenspace", lat: 37.557038, lng: -77.526874, tags: ["river", "park", "scenic"], osm: "way/1089482397" },
  { id: "providence-cemetery", name: "Providence Cemetery", lat: 37.484112, lng: -77.549674, tags: ["history"], osm: "way/1102588967" },
  { id: "monroe-park-learning-garden", name: "Monroe Park Learning Garden", lat: 37.54403, lng: -77.457529, tags: ["park"], osm: "way/1210574643" },
  { id: "ricks-garden", name: "Rick's Garden", lat: 37.554685, lng: -77.4717, tags: ["park"], osm: "way/1266567346" },
  { id: "albert-hill-native-plant-garden", name: "Albert Hill Native Plant Garden", lat: 37.561592, lng: -77.4815, tags: ["park"], osm: "way/1300716641" },
  { id: "providence-park", name: "Providence Park", lat: 37.581505, lng: -77.426175, tags: ["park"], osm: "way/1414587754" },
  { id: "conrad-street-mini-park", name: "Conrad Street Mini Park", lat: 37.552793, lng: -77.415752, tags: ["park"], osm: "way/1425681874" },
  { id: "briel-street-playground", name: "Briel Street Playground", lat: 37.531938, lng: -77.396719, tags: ["park"], osm: "way/1425951819" },
  { id: "james-s-christian-jr-park", name: "James S. Christian Jr. Park", lat: 37.532996, lng: -77.404879, tags: ["river", "park", "scenic"], osm: "way/1425951820" },
  { id: "m-street-cemetery", name: "M Street Cemetery", lat: 37.531801, lng: -77.41213, tags: ["history"], osm: "way/1425951821" },
  { id: "franklin-street-burial-grounds", name: "Franklin Street Burial Grounds", lat: 37.532224, lng: -77.424411, tags: ["history"], osm: "way/1467380190" },
  { id: "street-lamp", name: "Street Lamp", lat: 37.571866, lng: -77.54225, tags: ["park"], osm: "node/13568547124" },
  { id: "oakwood-park", name: "Oakwood Park", lat: 37.53565, lng: -77.39832, tags: ["park"], osm: "relation/19483472" },
  { id: "library-park", name: "Library Park", lat: 37.542301, lng: -77.442748, tags: ["park"], osm: "relation/21036259" },
  { id: "meadow-park", name: "Meadow Park", lat: 37.553727, lng: -77.463266, tags: ["park"], osm: "way/236147597" },
  { id: "federal-park", name: "Federal Park", lat: 37.550379, lng: -77.467224, tags: ["park"], osm: "way/236147602" },
  { id: "grace-park", name: "Grace Park", lat: 37.555387, lng: -77.458553, tags: ["park"], osm: "way/236147603" },
  { id: "sydney-park", name: "Sydney Park", lat: 37.54682, lng: -77.456769, tags: ["park"], osm: "way/236147606" },
  { id: "arcpark", name: "ARCpark", lat: 37.581095, lng: -77.472609, tags: ["park"], osm: "way/597002701" },
  { id: "westham-park", name: "Westham Park", lat: 37.586473, lng: -77.549169, tags: ["park"], osm: "way/846245203" },
  { id: "dog-park", name: "Dog Park", lat: 37.611408, lng: -77.587511, tags: ["park"], osm: "way/1516391064" },
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
