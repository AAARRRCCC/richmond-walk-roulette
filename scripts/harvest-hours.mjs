// Fetch just the hours family, without re-harvesting the other five.
//
//   npm run harvest:hours
//
// `harvest-osm.mjs` runs every family and is the right thing once a year.
// This is the same query on its own, because the hours family is the only one
// that changes when `place.osm` does — the backfill adds identities, and every
// new identity is an element nobody has asked about yet.
//
// Same endpoint, same user-agent, same etiquette, same committed output. It
// must never run in CI either.
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "vite";

const ENDPOINT = "https://overpass-api.de/api/interpreter";
const USER_AGENT =
  "walk-roulette/0.5 (Richmond walking app; https://github.com/; contact via repo)";
const RETRY_WAIT_MS = 30_000;
const MAX_ATTEMPTS = 3;

const OUT = new URL("../data/osm/", import.meta.url);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  cacheDir: "node_modules/.vite-harvest-hours",
  optimizeDeps: { noDiscovery: true, include: [] },
});
let PLACES;
try {
  PLACES = (await vite.ssrLoadModule("/src/data/places.ts")).PLACES;
} finally {
  await vite.close();
}

const byType = { node: [], way: [], relation: [] };
for (const place of PLACES) {
  if (place.osm === undefined) continue;
  const [type, id] = place.osm.split("/");
  if (byType[type] !== undefined) byType[type].push(id);
}
const total = Object.values(byType).reduce((sum, ids) => sum + ids.length, 0);
if (total === 0) {
  // An empty join is a configuration problem, not a reason to write an empty
  // file over a good one.
  console.error("harvest-hours: no place carries an osm id. Run npm run backfill:osm first.");
  process.exit(1);
}

const clauses = Object.entries(byType)
  .filter(([, ids]) => ids.length > 0)
  .map(([type, ids]) => `${type}(id:${ids.join(",")});`)
  .join("");
const ql = `[out:json][timeout:180];(${clauses});out tags;`;

console.log(`asking about ${total} identified elements`);

let body = null;
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": USER_AGENT },
    body: `data=${encodeURIComponent(ql)}`,
  });
  const text = await response.text();
  const limited =
    response.status === 429 || /rate_limited|too many requests/i.test(text.slice(0, 2000));
  const busy = /Dispatcher_Client|too busy/i.test(text.slice(0, 2000)) && !text.startsWith("{");

  if (response.ok && !limited && !busy) {
    body = JSON.parse(text);
    break;
  }
  if (attempt === MAX_ATTEMPTS) {
    console.error(`harvest-hours: Overpass refused after ${MAX_ATTEMPTS} attempts.`);
    console.error(text.slice(0, 400));
    process.exit(1);
  }
  console.log(`  ${limited ? "rate limited" : "server busy"}, waiting 30s...`);
  await sleep(RETRY_WAIT_MS);
}

const elements = [...body.elements].toSorted((a, b) =>
  a.type === b.type ? a.id - b.id : a.type.localeCompare(b.type),
);
await writeFile(
  new URL("hours.json", OUT),
  `${JSON.stringify({ osm3s: body.osm3s, elements }, null, 2)}\n`,
  "utf8",
);

const withHours = elements.filter((element) => element.tags?.opening_hours !== undefined);
console.log(`  ${elements.length} elements back, ${withHours.length} carry opening_hours`);

// Fold the query into the manifest so the record stays complete.
const manifestUrl = new URL("manifest.json", OUT);
const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
manifest.queries = manifest.queries.filter((query) => query.file !== "hours.json");
manifest.queries.push({
  file: "hours.json",
  osmBase: body.osm3s?.timestamp_osm_base ?? null,
  elements: elements.length,
  ql,
});
await writeFile(manifestUrl, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log("  manifest updated");
