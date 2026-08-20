import type { LngLat } from "../lib/geometry.ts";

export type Terrain = "flat" | "hilly";
export type Vibe = "river" | "park" | "museum" | "history" | "food" | "scenic";

export type Place = LngLat & {
  id: string;
  name: string;
  terrain: Terrain;
  tags: Vibe[];
};

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
 * the point. Watch that with anything on a schedule - the markets below are
 * seasonal or weekly, and nothing on screen now says so.
 */
export const PLACES: Place[] = [
  { id: "vmfa", name: "VMFA", lat: 37.556058, lng: -77.474895, terrain: "flat", tags: ["museum"] },
  { id: "belle-isle", name: "Belle Isle", lat: 37.529197, lng: -77.452844, terrain: "hilly", tags: ["river", "park", "scenic"] },
  { id: "hollywood", name: "Hollywood Cemetery", lat: 37.536582, lng: -77.456874, terrain: "hilly", tags: ["history", "scenic"] },
  { id: "maymont", name: "Maymont", lat: 37.535784, lng: -77.477576, terrain: "hilly", tags: ["park", "scenic"] },
  { id: "capitol", name: "Capitol Square", lat: 37.538818, lng: -77.433558, terrain: "flat", tags: ["history"] },
  { id: "canal-walk", name: "Canal Walk", lat: 37.533742, lng: -77.438898, terrain: "flat", tags: ["river", "scenic"] },
  { id: "browns", name: "Brown's Island", lat: 37.534082, lng: -77.442379, terrain: "flat", tags: ["river", "park"] },
  { id: "libby-hill", name: "Libby Hill Park", lat: 37.526758, lng: -77.41738, terrain: "hilly", tags: ["park", "scenic"] },
  { id: "carytown", name: "Carytown", lat: 37.55243, lng: -77.477852, terrain: "flat", tags: ["food"] },
  { id: "byrd", name: "Byrd Park", lat: 37.541968, lng: -77.478958, terrain: "flat", tags: ["park"] },
  { id: "texas-beach", name: "Texas Beach", lat: 37.532657, lng: -77.475807, terrain: "hilly", tags: ["river", "scenic"] },
  { id: "pump-house", name: "Pump House", lat: 37.53766, lng: -77.488184, terrain: "flat", tags: ["history", "river"] },
  { id: "forest-hill", name: "Forest Hill Park", lat: 37.51944, lng: -77.47253, terrain: "hilly", tags: ["park", "scenic"] },
  { id: "chimborazo", name: "Chimborazo Park", lat: 37.525462, lng: -77.411836, terrain: "hilly", tags: ["park", "history"] },
  { id: "jefferson-park", name: "Jefferson Park", lat: 37.53549, lng: -77.421612, terrain: "hilly", tags: ["park", "scenic"] },
  { id: "manch-flood", name: "Manchester Floodwall", lat: 37.528432, lng: -77.442038, terrain: "flat", tags: ["river", "scenic"] },
  { id: "tpott", name: "Potterfield Bridge", lat: 37.531915, lng: -77.445225, terrain: "flat", tags: ["river", "scenic"] },
  { id: "tredegar", name: "Tredegar Iron Works", lat: 37.53517, lng: -77.445236, terrain: "flat", tags: ["history", "museum"] },
  { id: "shockoe", name: "Shockoe Bottom", lat: 37.531485, lng: -77.425133, terrain: "flat", tags: ["food", "history"] },
  { id: "main-st", name: "Main Street Station", lat: 37.534932, lng: -77.428813, terrain: "flat", tags: ["history"] },
  { id: "poe", name: "Poe Museum", lat: 37.532158, lng: -77.426075, terrain: "flat", tags: ["museum", "history"] },
  { id: "st-johns", name: "St. John's Church", lat: 37.5306, lng: -77.4197, terrain: "hilly", tags: ["history"] },
  { id: "monument", name: "Monument Avenue", lat: 37.554232, lng: -77.460419, terrain: "flat", tags: ["scenic", "history"] },
  { id: "scotts-add", name: "Scott's Addition", lat: 37.569591, lng: -77.471222, terrain: "flat", tags: ["food"] },
  { id: "diamond", name: "The Diamond", lat: 37.571694, lng: -77.463283, terrain: "flat", tags: ["history"] },
  { id: "sci-museum", name: "Science Museum", lat: 37.561121, lng: -77.46582, terrain: "flat", tags: ["museum"] },
  { id: "battery", name: "Battery Park", lat: 37.566526, lng: -77.439281, terrain: "hilly", tags: ["park"] },
  { id: "jackson-ward", name: "Jackson Ward", lat: 37.548611, lng: -77.441865, terrain: "flat", tags: ["history", "food"] },
  { id: "vcu-compass", name: "VCU Compass", lat: 37.548147, lng: -77.453196, terrain: "flat", tags: ["scenic"] },
  { id: "siegel", name: "Siegel Center", lat: 37.552875, lng: -77.452827, terrain: "flat", tags: ["history"] },
  { id: "17th-mkt", name: "17th Street Market", lat: 37.533977, lng: -77.428235, terrain: "flat", tags: ["food"] },
  { id: "fan", name: "The Fan", lat: 37.553793, lng: -77.468418, terrain: "flat", tags: ["scenic"] },
  { id: "church-hill", name: "Church Hill", lat: 37.530471, lng: -77.414418, terrain: "hilly", tags: ["history", "food"] },
  { id: "reedy-creek", name: "Reedy Creek", lat: 37.524335, lng: -77.469645, terrain: "hilly", tags: ["park", "scenic"] },

  // Businesses are deliberately rare here. Hatch Local, Ruby Scoops and a
  // Gelati Celesti node all came out of this pass: one had closed, two had
  // moved. Neighbourhoods and institutions outlive their storefronts.
  { id: "scoop", name: "Scoop", lat: 37.555359, lng: -77.466681, terrain: "flat", tags: ["food"] },

  // Markets. Every one of these is seasonal or weekly, and nothing in the UI
  // says which, so a spin can send someone to a closed lot.
  { id: "birdhouse-market", name: "Birdhouse Market", lat: 37.544389, lng: -77.462018, terrain: "flat", tags: ["food"] },
  { id: "sotj-market", name: "South of the James Market", lat: 37.520813, lng: -77.473387, terrain: "hilly", tags: ["food", "park"] },

  // Museums.
  { id: "black-history", name: "Black History Museum", lat: 37.550047, lng: -77.44135, terrain: "flat", tags: ["museum", "history"] },
  { id: "maggie-walker", name: "Maggie L. Walker House", lat: 37.547882, lng: -77.437551, terrain: "flat", tags: ["museum", "history"] },
  { id: "valentine", name: "The Valentine", lat: 37.541495, lng: -77.431118, terrain: "flat", tags: ["museum", "history"] },
  { id: "marshall-house", name: "John Marshall House", lat: 37.541923, lng: -77.433085, terrain: "flat", tags: ["museum", "history"] },
  { id: "holocaust", name: "Virginia Holocaust Museum", lat: 37.530906, lng: -77.425964, terrain: "flat", tags: ["museum", "history"] },
  { id: "whoc", name: "White House of the Confederacy", lat: 37.540712, lng: -77.429602, terrain: "flat", tags: ["museum", "history"] },
  { id: "vmhc", name: "Virginia Museum of History", lat: 37.558027, lng: -77.473628, terrain: "flat", tags: ["museum"] },
  { id: "childrens", name: "Children's Museum", lat: 37.56239, lng: -77.467256, terrain: "flat", tags: ["museum"] },
  { id: "railroad", name: "Richmond Railroad Museum", lat: 37.525926, lng: -77.435633, terrain: "flat", tags: ["museum", "history"] },
  { id: "branch", name: "Branch Museum", lat: 37.55823, lng: -77.46832, terrain: "flat", tags: ["museum"] },

  // Monuments and markers.
  {
    id: "pyramid",
    name: "Confederate Pyramid",
    // Not in OpenStreetMap. Point taken from the geotag on Wikimedia Commons'
    // photograph of the monument, which lands inside Hollywood Cemetery's
    // Confederate section.
    lat: 37.536111,
    lng: -77.458333,
    terrain: "hilly",
    tags: ["history", "scenic"],
  },
  { id: "bojangles", name: "Bojangles Statue", lat: 37.549347, lng: -77.440362, terrain: "flat", tags: ["history", "scenic"] },
  { id: "reconciliation", name: "Reconciliation Statue", lat: 37.53486, lng: -77.430429, terrain: "flat", tags: ["history"] },

  // Campus.
  { id: "vcu-commons", name: "VCU Student Commons", lat: 37.546528, lng: -77.453442, terrain: "flat", tags: ["scenic"] },
  // --- Shockoe Slip and the Bottom, added for the downtown origin. All
  // coordinates from OpenStreetMap via Overpass, as above.
  { id: "triple-crossing", name: "Triple Crossing", lat: 37.53196, lng: -77.43139, terrain: "flat", tags: ["history", "scenic"] },
  { id: "first-freedom", name: "First Freedom Center", lat: 37.53482, lng: -77.43252, terrain: "flat", tags: ["museum", "history"] },
  { id: "pipeline", name: "Pipeline Overlook", lat: 37.53324, lng: -77.43595, terrain: "flat", tags: ["river", "scenic"] },
  { id: "lumpkins", name: "Lumpkin's Slave Jail", lat: 37.5366, lng: -77.42849, terrain: "flat", tags: ["history"] },
  { id: "african-burial", name: "African Burial Ground", lat: 37.538, lng: -77.42685, terrain: "flat", tags: ["history"] },
  { id: "exec-mansion", name: "Executive Mansion", lat: 37.53843, lng: -77.43215, terrain: "hilly", tags: ["history"] },
  { id: "monumental", name: "Monumental Church", lat: 37.53889, lng: -77.42984, terrain: "hilly", tags: ["history"] },
  { id: "bell-tower", name: "Bell Tower", lat: 37.53895, lng: -77.4353, terrain: "hilly", tags: ["history"] },
  { id: "taylors-hill", name: "Taylor's Hill Park", lat: 37.53231, lng: -77.42292, terrain: "hilly", tags: ["park", "scenic"] },
  { id: "shiplock", name: "Great Shiplock Park", lat: 37.52612, lng: -77.42183, terrain: "flat", tags: ["river", "park", "history"] },
  { id: "ancarrows", name: "Ancarrow's Landing", lat: 37.52067, lng: -77.42316, terrain: "flat", tags: ["river", "park", "history"] },
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
