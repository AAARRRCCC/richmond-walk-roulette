// The only thing in this repo that talks to Overpass.
//
//   npm run harvest:osm
//
// Writes data/osm/*.json plus a manifest, and commits nothing else. Everything
// downstream - propose, apply, the build - reads those committed files and
// never the network, for the same reason scripts/build-reach.mjs points at a
// committed snapshot rather than a live engine: a build whose output depends on
// the day it ran is not a build.
//
// **This must never run in CI.** Overpass's own documentation forbids using a
// public instance as an application backend, states a ceiling near 10,000
// queries and 1 GB a day, and returns 429 after a 15 second queue. Harvesting
// on every push would be exactly the abuse the docs name, would make the build
// non-reproducible, and would let a mid-air OSM edit change the destination
// list with no review.
import { mkdir, writeFile } from "node:fs/promises";

const ENDPOINT = "https://overpass-api.de/api/interpreter";

/** Named so an operator can be found. Overpass asks; this is the asking. */
const USER_AGENT =
  "walk-roulette/0.5 (Richmond walking app; https://github.com/; contact via repo)";

/**
 * The harvest box. Tighter than the proxy's `RICHMOND_BOUNDS`, deliberately:
 * that one is about refusing to be a worldwide routing service and this one is
 * about what counts as Richmond. Must match `PLACE_BOUNDS` in osm-rules.ts.
 */
const BBOX = "37.44,-77.60,37.64,-77.34";

/** Overpass etiquette: a pause between queries, and a long wait on a 429. */
const PAUSE_MS = 5_000;
const RETRY_WAIT_MS = 30_000;
const MAX_ATTEMPTS = 3;

const OUT = new URL("../data/osm/", import.meta.url);

/** Where the hours family lands. Read by scripts/build-hours.mjs, never fetched. */
const HOURS_FILE = "hours.json";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * `out center tags;` everywhere, never `out geom;`.
 *
 * Geometry would balloon the committed payload by an order of magnitude for
 * data nothing downstream reads: the proposer wants one coordinate and a tag
 * map. The manifest stores the verbatim QL precisely so that a later change to
 * this line is visible in a diff rather than as a mysteriously larger file.
 */
const CATEGORIES = [
  {
    file: "destinations.json",
    ql: `[out:json][timeout:180];
(
  nwr[leisure=park][name](${BBOX});
  nwr[leisure=garden][name](${BBOX});
  nwr[leisure=nature_reserve][name](${BBOX});
  nwr[landuse=cemetery][name](${BBOX});
  nwr[tourism~"^(museum|gallery|zoo|aquarium|theme_park)$"][name](${BBOX});
  nwr[amenity=marketplace][name](${BBOX});
  nwr[historic~"^(monument|fort|archaeological_site|city_gate|aqueduct)$"][name](${BBOX});
);
out center tags;`,
  },
  {
    file: "detours.json",
    ql: `[out:json][timeout:180];
(
  nwr[tourism=artwork][name](${BBOX});
  nwr[tourism=viewpoint](${BBOX});
  nwr[man_made~"^(bridge|pier|water_tower|lighthouse|obelisk)$"][name](${BBOX});
  way[highway=steps][name](${BBOX});
  nwr[natural~"^(peak|cliff|spring|waterfall)$"][name](${BBOX});
  nwr[historic=memorial][memorial](${BBOX});
);
out center tags;`,
  },
];

/**
 * Gate nodes: a node shared between a candidate's outline and a pedestrian way.
 *
 * One query **per outline family**, not one for everything. A node-set recursion
 * over the whole bbox at once is what produced a `timeout` error during
 * research, and the four families below are the ones with area geometry and
 * therefore a centroid problem. An earlier draft queried only parks while
 * claiming the rung "works for parks and cemeteries" - Hollywood Cemetery is the
 * single worst centroid in the dataset and had no gate query at all.
 *
 * `out;` rather than `out ids;`: the node's own coordinate is the entire point
 * and `ids` prints nothing else.
 */
const GATE_FAMILIES = [
  { file: "gates-park.json", key: "leisure", value: "park" },
  { file: "gates-garden.json", key: "leisure", value: "garden" },
  { file: "gates-reserve.json", key: "leisure", value: "nature_reserve" },
  { file: "gates-cemetery.json", key: "landuse", value: "cemetery" },
];

const gateQl = ({ key, value }) => `[out:json][timeout:180];
way[${key}=${value}][name](${BBOX})->.p;
way[highway~"^(footway|path|steps|pedestrian|cycleway|residential|service)$"](${BBOX})->.f;
node(w.p)->.pn;
node(w.f)->.fn;
node.pn.fn;
out;`;

/**
 * One query, with the documented etiquette around it.
 *
 * Overpass signals rate limiting two ways - an HTTP 429, and a 200 whose body
 * carries an `osm3s` error mentioning it - and only handling the first is how a
 * script quietly harvests a page of HTML into a JSON file.
 */
async function ask(ql) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": USER_AGENT },
      body: `data=${encodeURIComponent(ql)}`,
    });
    const text = await response.text();

    const limited =
      response.status === 429 || /rate_limited|too many requests/i.test(text.slice(0, 2000));
    const busy = /Dispatcher_Client|too busy|timeout/i.test(text.slice(0, 2000)) && !text.startsWith("{");

    if (response.ok && !limited && !busy) {
      try {
        return JSON.parse(text);
      } catch {
        throw new Error(`Overpass answered 200 with something that is not JSON:\n${text.slice(0, 400)}`);
      }
    }

    if (attempt === MAX_ATTEMPTS) {
      throw new Error(
        `Overpass refused after ${MAX_ATTEMPTS} attempts (status ${response.status}):\n${text.slice(0, 400)}`,
      );
    }
    console.log(`  ${limited ? "rate limited" : "server busy"}, waiting ${RETRY_WAIT_MS / 1000}s...`);
    await sleep(RETRY_WAIT_MS);
  }
  throw new Error("unreachable");
}

/** Sorted by id so a re-harvest of unchanged data produces an unchanged diff. */
const sortElements = (elements) =>
  [...elements].toSorted((a, b) => (a.type === b.type ? a.id - b.id : a.type.localeCompare(b.type)));

/**
 * The hours family, added by `opening-hours` (chunk 9).
 *
 * One batched element lookup over every `place.osm`, rather than a category
 * sweep: the join is by identity, never by name or by proximity, so the only
 * elements worth asking about are the ones the data file already names. That
 * is also what keeps this query small - it grows with the number of identified
 * places rather than with the city.
 *
 * Built from `PLACES` at run time, which is why it is a function while every
 * other family is a constant.
 */
async function hoursQuery() {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "custom",
    cacheDir: "node_modules/.vite-harvest-osm",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  let places;
  try {
    places = (await vite.ssrLoadModule("/src/data/places.ts")).PLACES;
  } finally {
    await vite.close();
  }

  const byType = { node: [], way: [], relation: [] };
  for (const place of places) {
    if (place.osm === undefined) continue;
    const [type, id] = place.osm.split("/");
    if (byType[type] !== undefined) byType[type].push(id);
  }
  const clauses = Object.entries(byType)
    .filter(([, ids]) => ids.length > 0)
    .map(([type, ids]) => type + "(id:" + ids.join(",") + ");")
    .join("");
  const total = Object.values(byType).reduce((sum, ids) => sum + ids.length, 0);
  if (total === 0) return null;
  return {
    file: HOURS_FILE,
    total,
    ql: "[out:json][timeout:180];(" + clauses + ");out tags;",
  };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const queries = [];
  let copyright = "";

  const hours = await hoursQuery();
  if (hours !== null) console.log(`hours: asking about ${hours.total} identified elements`);

  const all = [
    ...CATEGORIES,
    ...GATE_FAMILIES.map((family) => ({ file: family.file, ql: gateQl(family) })),
    ...(hours === null ? [] : [{ file: hours.file, ql: hours.ql }]),
  ];

  for (const [index, category] of all.entries()) {
    console.log(`[${index + 1}/${all.length}] ${category.file}`);
    const body = await ask(category.ql);
    const elements = sortElements(body.elements ?? []);
    copyright = body.osm3s?.copyright ?? copyright;

    await writeFile(
      new URL(category.file, OUT),
      `${JSON.stringify({ elements }, null, 2)}\n`,
      "utf8",
    );
    queries.push({
      file: category.file,
      osmBase: body.osm3s?.timestamp_osm_base ?? null,
      elements: elements.length,
      ql: category.ql,
    });
    console.log(`  ${elements.length} elements`);

    if (index < all.length - 1) await sleep(PAUSE_MS);
  }

  await writeFile(
    new URL("manifest.json", OUT),
    `${JSON.stringify(
      {
        version: 1,
        harvestedAt: new Date().toISOString(),
        endpoint: ENDPOINT,
        bbox: { south: 37.44, west: -77.6, north: 37.64, east: -77.34 },
        copyright,
        queries,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const total = queries.reduce((sum, query) => sum + query.elements, 0);
  console.log(`\nharvest: ${queries.length} queries, ${total} elements, written to data/osm/`);
}

await main();
