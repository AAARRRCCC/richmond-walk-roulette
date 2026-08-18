import type { LngLat } from "../lib/geometry";

export type Terrain = "flat" | "hilly";
export type Vibe = "river" | "park" | "museum" | "history" | "food" | "scenic";

export type Place = LngLat & {
  id: string;
  name: string;
  terrain: Terrain;
  tags: Vibe[];
  blurb: string;
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
 * Anything with a schedule says so in its blurb. Markets in particular are
 * seasonal, and sending someone on a 40 minute walk to a closed lot is worse
 * than not offering it.
 */
export const PLACES: Place[] = [
  { id: "vmfa", name: "VMFA", lat: 37.556058, lng: -77.474895, terrain: "flat", tags: ["museum"], blurb: "Free admission. The sculpture garden is the move." },
  { id: "belle-isle", name: "Belle Isle", lat: 37.529197, lng: -77.452844, terrain: "hilly", tags: ["river", "park", "scenic"], blurb: "Pedestrian bridge under the Lee Bridge gets you onto the rocks." },
  { id: "hollywood", name: "Hollywood Cemetery", lat: 37.536582, lng: -77.456874, terrain: "hilly", tags: ["history", "scenic"], blurb: "Quiet hills over the river. Two presidents are buried here." },
  { id: "maymont", name: "Maymont", lat: 37.535784, lng: -77.477576, terrain: "hilly", tags: ["park", "scenic"], blurb: "Italian Garden, Japanese Garden, and a small farm." },
  { id: "capitol", name: "Capitol Square", lat: 37.538818, lng: -77.433558, terrain: "flat", tags: ["history"], blurb: "Jefferson designed the building. The squirrels run the grounds." },
  { id: "canal-walk", name: "Canal Walk", lat: 37.533742, lng: -77.438898, terrain: "flat", tags: ["river", "scenic"], blurb: "Flat riverside path through downtown. Best at sunset." },
  { id: "browns", name: "Brown's Island", lat: 37.534082, lng: -77.442379, terrain: "flat", tags: ["river", "park"], blurb: "Concert lawn most summer evenings. Bridge access from Tredegar." },
  { id: "libby-hill", name: "Libby Hill Park", lat: 37.526758, lng: -77.41738, terrain: "hilly", tags: ["park", "scenic"], blurb: "The view that gave Richmond its name." },
  { id: "carytown", name: "Carytown", lat: 37.55243, lng: -77.477852, terrain: "flat", tags: ["food"], blurb: "Nine blocks of shops, ice cream, and the Byrd Theatre." },
  { id: "byrd", name: "Byrd Park", lat: 37.541968, lng: -77.478958, terrain: "flat", tags: ["park"], blurb: "Three lakes and the Carillon. The loops are almost exactly a mile." },
  { id: "texas-beach", name: "Texas Beach", lat: 37.532657, lng: -77.475807, terrain: "hilly", tags: ["river", "scenic"], blurb: "Sketchy stairs, beautiful river. Wear shoes you do not love." },
  { id: "pump-house", name: "Pump House", lat: 37.53766, lng: -77.488184, terrain: "flat", tags: ["history", "river"], blurb: "Gothic ruin on the river. Open the second Sunday of the month." },
  { id: "forest-hill", name: "Forest Hill Park", lat: 37.51944, lng: -77.47253, terrain: "hilly", tags: ["park", "scenic"], blurb: "Across the river. Trails, a lake, and the Sunday market." },
  { id: "chimborazo", name: "Chimborazo Park", lat: 37.525462, lng: -77.411836, terrain: "hilly", tags: ["park", "history"], blurb: "High bluff looking down on Rocketts Landing." },
  { id: "jefferson-park", name: "Jefferson Park", lat: 37.53549, lng: -77.421612, terrain: "hilly", tags: ["park", "scenic"], blurb: "Best skyline view in the city. Not close." },
  { id: "manch-flood", name: "Manchester Floodwall", lat: 37.528432, lng: -77.442038, terrain: "flat", tags: ["river", "scenic"], blurb: "Long, wide, paved. River on one side, graffiti on the other." },
  { id: "tpott", name: "Potterfield Bridge", lat: 37.531915, lng: -77.445225, terrain: "flat", tags: ["river", "scenic"], blurb: "Pedestrian bridge over the James. Wave at the kayakers." },
  { id: "tredegar", name: "Tredegar Iron Works", lat: 37.53517, lng: -77.445236, terrain: "flat", tags: ["history", "museum"], blurb: "Civil War museum and the start of the river trails." },
  { id: "shockoe", name: "Shockoe Bottom", lat: 37.531485, lng: -77.425133, terrain: "flat", tags: ["food", "history"], blurb: "Cobblestones and oyster bars at the bottom of the hill." },
  { id: "main-st", name: "Main Street Station", lat: 37.534932, lng: -77.428813, terrain: "flat", tags: ["history"], blurb: "Beaux-Arts train shed. The clock tower is the landmark." },
  { id: "poe", name: "Poe Museum", lat: 37.532158, lng: -77.426075, terrain: "flat", tags: ["museum", "history"], blurb: "Oldest standing structure in Richmond. Two black cats live there." },
  { id: "st-johns", name: "St. John's Church", lat: 37.5306, lng: -77.4197, terrain: "hilly", tags: ["history"], blurb: "Where Patrick Henry said the thing about liberty." },
  { id: "monument", name: "Monument Avenue", lat: 37.554232, lng: -77.460419, terrain: "flat", tags: ["scenic", "history"], blurb: "Cobblestone median, brick mansions, no more statues." },
  { id: "scotts-add", name: "Scott's Addition", lat: 37.569591, lng: -77.471222, terrain: "flat", tags: ["food"], blurb: "Breweries, cideries, a meadery. Pace yourself." },
  { id: "diamond", name: "The Diamond", lat: 37.571694, lng: -77.463283, terrain: "flat", tags: ["history"], blurb: "Squirrels home games. The new stadium is going up next door." },
  { id: "sci-museum", name: "Science Museum", lat: 37.561121, lng: -77.46582, terrain: "flat", tags: ["museum"], blurb: "Domed former train station. Foucault pendulum in the rotunda." },
  { id: "battery", name: "Battery Park", lat: 37.566526, lng: -77.439281, terrain: "hilly", tags: ["park"], blurb: "Northside neighborhood park with a real basketball scene." },
  { id: "jackson-ward", name: "Jackson Ward", lat: 37.548611, lng: -77.441865, terrain: "flat", tags: ["history", "food"], blurb: "Birthplace of Black Wall Street. Walk Leigh Street." },
  { id: "vcu-compass", name: "VCU Compass", lat: 37.548147, lng: -77.453196, terrain: "flat", tags: ["scenic"], blurb: "Heart of campus. Cut through if classes are not letting out." },
  { id: "siegel", name: "Siegel Center", lat: 37.552875, lng: -77.452827, terrain: "flat", tags: ["history"], blurb: "Stuff Run loud. Loudest mid-major arena in the country." },
  { id: "17th-mkt", name: "17th Street Market", lat: 37.533977, lng: -77.428235, terrain: "flat", tags: ["food"], blurb: "Pavilion that hosts the night market on weekends." },
  { id: "fan", name: "The Fan", lat: 37.553793, lng: -77.468418, terrain: "flat", tags: ["scenic"], blurb: "Brick rowhouses, gas lamps, the occasional cat in a window." },
  { id: "church-hill", name: "Church Hill", lat: 37.530471, lng: -77.414418, terrain: "hilly", tags: ["history", "food"], blurb: "Sub Rosa, Proper Pie, Alamo BBQ. Make the climb." },
  { id: "reedy-creek", name: "Reedy Creek", lat: 37.524335, lng: -77.469645, terrain: "hilly", tags: ["park", "scenic"], blurb: "Forest Hill trailhead. Buttermilk Trail runs down to the river." },

  // Businesses are deliberately rare here. Hatch Local, Ruby Scoops and a
  // Gelati Celesti node all came out of this pass: one had closed, two had
  // moved. Neighbourhoods and institutions outlive their storefronts.
  { id: "scoop", name: "Scoop", lat: 37.555359, lng: -77.466681, terrain: "flat", tags: ["food"], blurb: "Ice cream counter in the Fan. You can walk it back off on the way home." },

  // Markets. Every one of these is seasonal or weekly; the blurb says which.
  { id: "birdhouse-market", name: "Birdhouse Market", lat: 37.544389, lng: -77.462018, terrain: "flat", tags: ["food"], blurb: "Tuesday afternoons, May through November. Online only in winter." },
  { id: "sotj-market", name: "South of the James Market", lat: 37.520813, lng: -77.473387, terrain: "hilly", tags: ["food", "park"], blurb: "Sundays, 10 to 1, year round in Forest Hill Park." },

  // Museums.
  { id: "black-history", name: "Black History Museum", lat: 37.550047, lng: -77.44135, terrain: "flat", tags: ["museum", "history"], blurb: "Jackson Ward, in the old Leigh Street armory." },
  { id: "maggie-walker", name: "Maggie L. Walker House", lat: 37.547882, lng: -77.437551, terrain: "flat", tags: ["museum", "history"], blurb: "First Black woman to charter a bank in the country. Her house, kept as she left it." },
  { id: "valentine", name: "The Valentine", lat: 37.541495, lng: -77.431118, terrain: "flat", tags: ["museum", "history"], blurb: "City history, with the Wickham House attached." },
  { id: "marshall-house", name: "John Marshall House", lat: 37.541923, lng: -77.433085, terrain: "flat", tags: ["museum", "history"], blurb: "The Chief Justice's house, 1790, still standing downtown." },
  { id: "holocaust", name: "Virginia Holocaust Museum", lat: 37.530906, lng: -77.425964, terrain: "flat", tags: ["museum", "history"], blurb: "Shockoe Bottom. Free, and heavier than you plan for." },
  { id: "whoc", name: "White House of the Confederacy", lat: 37.540712, lng: -77.429602, terrain: "flat", tags: ["museum", "history"], blurb: "Where Jefferson Davis lived. Tours start next door." },
  { id: "vmhc", name: "Virginia Museum of History", lat: 37.558027, lng: -77.473628, terrain: "flat", tags: ["museum"], blurb: "On the Boulevard, next door to the VMFA. Do both." },
  { id: "childrens", name: "Children's Museum", lat: 37.56239, lng: -77.467256, terrain: "flat", tags: ["museum"], blurb: "Built for kids. The carousel does not check IDs." },
  { id: "railroad", name: "Richmond Railroad Museum", lat: 37.525926, lng: -77.435633, terrain: "flat", tags: ["museum", "history"], blurb: "Old Hull Street station. Weekends only, so check before you walk." },
  { id: "branch", name: "Branch Museum", lat: 37.55823, lng: -77.46832, terrain: "flat", tags: ["museum"], blurb: "Architecture and design, in a Tudor pile on Monument." },

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
    blurb: "Ninety feet of dry-stacked granite in Hollywood Cemetery. No mortar holding it up.",
  },
  { id: "bojangles", name: "Bojangles Statue", lat: 37.549347, lng: -77.440362, terrain: "flat", tags: ["history", "scenic"], blurb: "He paid for the traffic light at this corner. The statue came later." },
  { id: "reconciliation", name: "Reconciliation Statue", lat: 37.53486, lng: -77.430429, terrain: "flat", tags: ["history"], blurb: "One of three identical statues. The others are in Liverpool and Benin." },

  // Campus.
  { id: "vcu-commons", name: "VCU Student Commons", lat: 37.546528, lng: -77.453442, terrain: "flat", tags: ["scenic"], blurb: "Cut through, or take a window seat and watch Floyd Avenue." },
];

export type Origin = LngLat & {
  id: string;
  name: string;
};

/** Presets for the origin picker. Any of these is a plausible place to start. */
export const PRESET_ORIGINS: Origin[] = [
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
