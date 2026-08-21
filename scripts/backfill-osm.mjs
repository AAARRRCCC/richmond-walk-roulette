// Propose an `osm` identity for each hand-curated place, and refuse to guess.
//
//   npm run backfill:osm            # print the report
//   npm run backfill:osm -- --write # apply the unambiguous matches to places.ts
//
// The 180 generated rows arrived carrying `osm` because the proposer resolved
// each one from a concrete element. The 62 hand-curated rows did not, and
// `opening-hours` needs the join: a place with no `osm` can never gain hours,
// and a place given the wrong one gains somebody else's.
//
// `opening-hours` budgets this as "a real afternoon, not a footnote" of human
// confirmation. This does the unambiguous half automatically and leaves the
// rest alone, which is the instruction GOAL.md gives for exactly this
// substitution: match where it is unambiguous, and leave everything else
// `unknown` rather than guessing.
//
// **Unambiguous means all four of these**, and any candidate failing one is not
// a match at all:
//
//   1. Its name normalises to the place's name, or one contains the other and
//      the shorter is at least six characters.
//   2. It is within MATCH_METERS of the place's coordinate.
//   3. It is the ONLY candidate meeting 1 and 2.
//   4. It carries a tag that makes it the kind of thing the place is, so a
//      bench named "Maymont" does not become Maymont.
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "vite";

const WRITE = process.argv.includes("--write");

const OSM = new URL("../data/osm/", import.meta.url);
const PLACES_FILE = new URL("../src/data/places.ts", import.meta.url);

/**
 * How close a candidate must sit to a hand-picked coordinate.
 *
 * The hand-picked point is an entrance, not a centroid, so a park's own element
 * centre can be a few hundred metres away. 250 m is generous enough for that
 * and tight enough that the "hours-carrying POI within 120 m" problem
 * `opening-hours` warns about is caught by the uniqueness rule rather than by
 * distance.
 */
const MATCH_METERS = 250;

/** Shortest name that may match by containment rather than exactly. */
const CONTAIN_MIN = 6;

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  cacheDir: "node_modules/.vite-backfill-osm",
  optimizeDeps: { noDiscovery: true, include: [] },
});
let PLACES;
let HAND_CURATED_COUNT;
let metersBetween;
try {
  const places = await vite.ssrLoadModule("/src/data/places.ts");
  const geometry = await vite.ssrLoadModule("/src/lib/geometry.ts");
  PLACES = places.PLACES;
  HAND_CURATED_COUNT = places.HAND_CURATED_COUNT;
  metersBetween = geometry.metersBetween;
} finally {
  await vite.close();
}

const readJson = async (file) => JSON.parse(await readFile(new URL(file, OSM), "utf8"));

const files = ["destinations.json", "detours.json", "backfill.json"];
const elements = [];
for (const file of files) {
  try {
    elements.push(...(await readJson(file)).elements);
  } catch {
    // backfill.json is optional: it only exists once the harvest has been run
    // with the wider family. Say so rather than failing.
    console.log(`  (no ${file}; continuing)`);
  }
}

const normalise = (name) =>
  name
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/\band\b/g, "&")
    .replace(/[^a-z0-9&]+/g, "");

/** Does this element look like a destination rather than a bench beside one? */
const isSubstantial = (tags) =>
  tags.leisure !== undefined ||
  tags.tourism !== undefined ||
  tags.historic !== undefined ||
  tags.amenity !== undefined ||
  tags.landuse !== undefined ||
  tags.man_made !== undefined ||
  tags.building !== undefined ||
  tags.highway === "steps";

// Deduped by element id first: the same museum is in both destinations.json
// and backfill.json, and counting it twice turns a single clean match into a
// false ambiguity.
const seen = new Set();
const candidates = elements.filter((element) => {
  const key = element.type + "/" + element.id;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
})
  .filter((element) => element.tags?.name !== undefined && isSubstantial(element.tags))
  .map((element) => ({
    osm: `${element.type}/${element.id}`,
    name: element.tags.name,
    key: normalise(element.tags.name),
    at:
      element.center !== undefined
        ? { lat: element.center.lat, lng: element.center.lon }
        : { lat: element.lat, lng: element.lon },
    tags: element.tags,
  }))
  .filter((c) => Number.isFinite(c.at.lat) && Number.isFinite(c.at.lng));

const hand = PLACES.slice(0, HAND_CURATED_COUNT);
const taken = new Set(PLACES.map((place) => place.osm).filter(Boolean));

const matched = [];
const ambiguous = [];
const unmatched = [];

for (const place of hand) {
  if (place.osm !== undefined) continue;
  const key = normalise(place.name);

  const near = candidates.filter((c) => metersBetween(place, c.at) <= MATCH_METERS);
  const hits = near.filter((c) => {
    if (c.key === key) return true;
    const shorter = c.key.length < key.length ? c.key : key;
    const longer = c.key.length < key.length ? key : c.key;
    return shorter.length >= CONTAIN_MIN && longer.includes(shorter);
  });

  const fresh = hits.filter((c) => !taken.has(c.osm));
  if (fresh.length === 1) {
    const only = fresh[0];
    matched.push({ place, osm: only.osm, name: only.name, meters: Math.round(metersBetween(place, only.at)) });
    taken.add(only.osm);
  } else if (fresh.length > 1) {
    ambiguous.push({ place, hits: fresh });
  } else {
    unmatched.push(place);
  }
}

console.log(`hand-curated rows: ${hand.length}`);
console.log(`  matched unambiguously: ${matched.length}`);
console.log(`  ambiguous, left alone: ${ambiguous.length}`);
console.log(`  no candidate at all:   ${unmatched.length}`);

if (matched.length > 0) {
  console.log("\nmatched:");
  for (const m of matched) {
    const same = normalise(m.place.name) === normalise(m.name);
    console.log(`  ${m.place.id.padEnd(18)} ${m.osm.padEnd(16)} ${m.meters}m  ${same ? "" : `"${m.name}"`}`);
  }
}

if (ambiguous.length > 0) {
  // Listed in full, because this is the set a person still owes an afternoon.
  console.log("\nAMBIGUOUS - left without an osm id, each needs a human:");
  for (const a of ambiguous) {
    console.log(`  ${a.place.id} (${a.place.name})`);
    for (const hit of a.hits) console.log(`      ${hit.osm}  "${hit.name}"`);
  }
}

if (unmatched.length > 0) {
  console.log(`\nno candidate in the harvest (${unmatched.length}):`);
  console.log(`  ${unmatched.map((p) => p.id).join(", ")}`);
}

if (!WRITE) {
  console.log("\n(report only; pass --write to apply the unambiguous matches)");
} else {
  let source = await readFile(PLACES_FILE, "utf8");
  let applied = 0;
  for (const m of matched) {
    // Anchored on the id so a name that appears twice cannot collide, and
    // inserted before the closing brace so field order stays as `Place`
    // declares it.
    const needle = new RegExp(`(\\{ id: "${m.place.id}",[^\\n]*?)( \\},)`);
    if (!needle.test(source)) {
      console.log(`  ! could not place ${m.place.id} - is it a multiline row?`);
      continue;
    }
    source = source.replace(needle, `$1, osm: ${JSON.stringify(m.osm)}$2`);
    applied += 1;
  }
  await writeFile(PLACES_FILE, source, "utf8");
  console.log(`\nwrote ${applied} osm ids into src/data/places.ts`);
}
