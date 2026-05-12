// Richmond walk POIs and start locations.
// Coordinates: (x, y) in MILES east/north of Monroe Park (0, 0),
// derived from real lat/lng (1° lat ≈ 69 mi; 1° lng @ 37.5° ≈ 54.8 mi).
// Walking distance ~= Euclidean * 1.25 (street factor).

window.WALK_FACTOR = 1.25;

window.START_LOCATIONS = [
  { id: "monroe",    name: "Monroe Park",          x:  0.00, y:  0.00 },
  { id: "siegel",    name: "Siegel Center",        x:  0.15, y:  0.65 },
  { id: "vmfa",      name: "VMFA",                 x: -1.36, y:  0.50 },
  { id: "carytown",  name: "Carytown",             x: -1.13, y:  0.21 },
  { id: "capitol",   name: "Capitol Square",       x:  0.92, y: -0.50 },
  { id: "maymont",   name: "Maymont",              x: -1.36, y: -0.70 },
  { id: "belle",     name: "Belle Isle",           x:  0.12, y: -0.92 },
  { id: "libby",     name: "Libby Hill",           x:  1.69, y: -1.28 },
  { id: "manchester",name: "Manchester",           x:  0.65, y: -1.30 },
  { id: "scotts",    name: "Scott's Addition",     x: -0.95, y:  1.05 },
];

// Difficulty: "flat" or "hilly"; tags: "river" | "park" | "museum" | "history" | "food" | "scenic"
window.POIS = [
  { id: "vmfa",         name: "VMFA",                          x: -1.36, y:  0.50, difficulty: "flat",  tags: ["museum"],          blurb: "Free admission. The sculpture garden is the move." },
  { id: "belle-isle",   name: "Belle Isle",                    x:  0.12, y: -0.92, difficulty: "hilly", tags: ["river","park","scenic"], blurb: "Pedestrian bridge under the Lee Bridge gets you on the rocks." },
  { id: "hollywood",    name: "Hollywood Cemetery",            x: -0.77, y: -0.61, difficulty: "hilly", tags: ["history","scenic"], blurb: "Quiet hills overlooking the river. Two presidents are here." },
  { id: "maymont",      name: "Maymont",                       x: -1.36, y: -0.70, difficulty: "hilly", tags: ["park","scenic"],   blurb: "Italian Garden, Japanese Garden, and a little farm." },
  { id: "capitol",      name: "Capitol Square",                x:  0.92, y: -0.50, difficulty: "flat",  tags: ["history"],         blurb: "Jefferson designed the building. Squirrels run the grounds." },
  { id: "canal-walk",   name: "Canal Walk",                    x:  0.92, y: -0.82, difficulty: "flat",  tags: ["river","scenic"],  blurb: "Flat riverside path through downtown. Good at sunset." },
  { id: "browns",       name: "Brown's Island",                x:  0.56, y: -0.82, difficulty: "flat",  tags: ["river","park"],    blurb: "Concert lawn most summer evenings. Bridge access from Tredegar." },
  { id: "libby-hill",   name: "Libby Hill Park",               x:  1.69, y: -1.28, difficulty: "hilly", tags: ["park","scenic"],   blurb: "The view that gave Richmond its name." },
  { id: "carytown",     name: "Carytown",                      x: -1.13, y:  0.21, difficulty: "flat",  tags: ["food"],            blurb: "Nine blocks of shops, ice cream, and the Byrd Theatre." },
  { id: "byrd",         name: "Byrd Park",                     x: -1.09, y: -0.12, difficulty: "flat",  tags: ["park"],            blurb: "Three lakes and the Carillon. Loops are exactly a mile." },
  { id: "texas-beach",  name: "Texas Beach",                   x: -1.71, y:  0.21, difficulty: "hilly", tags: ["river","scenic"],  blurb: "Sketchy stairs, beautiful river. Wear shoes you don't love." },
  { id: "pump-house",   name: "Pump House",                    x: -2.21, y: -0.03, difficulty: "flat",  tags: ["history","river"], blurb: "Gothic ruin on the river. Open the second Sunday." },
  { id: "forest-hill",  name: "Forest Hill Park",              x: -1.00, y: -1.30, difficulty: "hilly", tags: ["park","scenic"],   blurb: "Across the river. Saturday farmers market in season." },
  { id: "chimborazo",   name: "Chimborazo Park",               x:  2.06, y: -1.06, difficulty: "hilly", tags: ["park","history"],  blurb: "High bluff with a view of Rocketts Landing." },
  { id: "jefferson",    name: "Jefferson Park",                x:  1.80, y: -0.24, difficulty: "hilly", tags: ["park","scenic"],   blurb: "Best skyline view in the city. Hands down." },
  { id: "manch-flood",  name: "Manchester Floodwall",          x:  0.79, y: -1.30, difficulty: "flat",  tags: ["river","scenic"],  blurb: "Long, wide, paved. River on one side, graffiti on the other." },
  { id: "tpott",        name: "T. Tyler Potterfield Bridge",   x:  0.49, y: -0.92, difficulty: "flat",  tags: ["river","scenic"],  blurb: "Pedestrian bridge across the James. Wave at the kayakers." },
  { id: "tredegar",     name: "Tredegar Iron Works",           x:  0.23, y: -0.91, difficulty: "flat",  tags: ["history","museum"],blurb: "Civil War museum and the start of the river trails." },
  { id: "shockoe",      name: "Shockoe Bottom",                x:  1.15, y: -0.93, difficulty: "flat",  tags: ["food","history"],  blurb: "Cobblestones, oyster bars, and the Edgar Allan Poe Museum." },
  { id: "main-st",      name: "Main Street Station",           x:  1.05, y: -0.98, difficulty: "flat",  tags: ["history"],         blurb: "Beaux-Arts train shed. The clock tower is the landmark." },
  { id: "poe",          name: "Edgar Allan Poe Museum",        x:  1.41, y: -1.11, difficulty: "flat",  tags: ["museum","history"],blurb: "Oldest standing structure in Richmond. Two black cats live there." },
  { id: "st-johns",     name: "St. John's Church",             x:  1.63, y: -0.95, difficulty: "hilly", tags: ["history"],         blurb: "Where Patrick Henry said the thing about liberty." },
  { id: "monument",     name: "Monument Avenue",               x: -0.21, y:  0.22, difficulty: "flat",  tags: ["scenic","history"],blurb: "Cobblestone median, brick mansions, no more statues." },
  { id: "scotts-add",   name: "Scott's Addition",              x: -0.95, y:  1.05, difficulty: "flat",  tags: ["food"],            blurb: "Breweries, cideries, a meadery. Pace yourself." },
  { id: "diamond",      name: "The Diamond",                   x: -0.51, y:  1.68, difficulty: "flat",  tags: ["history"],         blurb: "Squirrels home games. New stadium going up next door." },
  { id: "sci-museum",   name: "Science Museum",                x: -0.65, y:  0.95, difficulty: "flat",  tags: ["museum"],          blurb: "Domed former train station. Foucault pendulum in the rotunda." },
  { id: "battery",      name: "Battery Park",                  x:  0.01, y:  1.80, difficulty: "hilly", tags: ["park"],            blurb: "Northside neighborhood park with a real basketball scene." },
  { id: "jackson-w",    name: "Jackson Ward",                  x:  0.67, y: -0.01, difficulty: "flat",  tags: ["history","food"],  blurb: "Birthplace of Black Wall Street. Walk Leigh Street." },
  { id: "vcu-compass",  name: "VCU Compass",                   x: -0.15, y: -0.03, difficulty: "flat",  tags: ["scenic"],          blurb: "Heart of campus. Cut through if classes aren't out." },
  { id: "siegel",       name: "Siegel Center",                 x:  0.15, y:  0.65, difficulty: "flat",  tags: ["history"],         blurb: "Stuff Run loud. Loudest mid-major arena in the country." },
  { id: "17th-mkt",     name: "17th Street Market",            x:  0.99, y: -0.83, difficulty: "flat",  tags: ["food"],            blurb: "Pavilion that hosts the night market on weekends." },
  { id: "fan-loop",     name: "Fan District Loop",             x: -0.87, y:  0.35, difficulty: "flat",  tags: ["scenic"],          blurb: "Brick rowhouses, gas lamps, the occasional cat in a window." },
  { id: "church-hill",  name: "Church Hill",                   x:  1.76, y: -1.17, difficulty: "hilly", tags: ["history","food"],  blurb: "Sub Rosa, Proper Pie, Alamo BBQ — make the climb." },
  { id: "reedy-creek",  name: "Reedy Creek",                   x: -1.36, y: -1.23, difficulty: "hilly", tags: ["park","scenic"],   blurb: "Forest Hill trailhead. Buttermilk Trail down to the river." },
];

// Distance from start to POI (one-way miles, with street factor).
window.distanceTo = function(start, poi) {
  const dx = poi.x - start.x;
  const dy = poi.y - start.y;
  return Math.sqrt(dx * dx + dy * dy) * window.WALK_FACTOR;
};
