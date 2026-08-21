// The data invariants for src/data/places.ts.
//
//   node scripts/verify-places.mjs [--json] [--no-engine]
//
// Written because a place count was wrong in three documents at once and nobody
// noticed until it was measured. The count that was wrong came from a regex that
// skipped `pyramid`, the one entry written across two lines - so this script
// never parses the file. It imports it through Vite, exactly as the app does,
// and asserts against the values the app will actually see.
//
// --no-engine drops the routability check and is honest about doing so: the run
// then reports that check as skipped and still exits non-zero, because a place
// that does not snap to a walkable edge is a destination the app cannot route
// to, and not knowing is not the same as it being fine.
import { createServer } from "vite";

const args = new Set(process.argv.slice(2));
const asJson = args.has("--json");
const noEngine = args.has("--no-engine");

/**
 * Furthest a place may sit from the walkable edge it snaps to.
 *
 * This is the automated form of the repo's entrance-not-centroid rule: a park
 * pinned at its polygon centroid snaps to whatever edge happens to be nearest,
 * and the walk ends in the middle of a field. 120 m is deliberately loose - the
 * worst hand-curated row measures well inside it, so this catches a coordinate
 * dropped in the wrong place rather than one that is merely imprecise. It
 * becomes load-bearing at chunk 8, when places stop being hand-picked.
 */
const SNAP_MAX_METERS = 120;

const EARTH_RADIUS_M = 6_371_000;
const toRadians = (degrees) => (degrees * Math.PI) / 180;

function metersBetween(a, b) {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

const checks = [];
const record = (name, pass, detail) => void checks.push({ name, pass, detail });
const notes = [];

// Loaded through Vite rather than imported directly, for the same reason
// build-reach.mjs does it: the app's modules use extensionless specifiers only
// its resolver understands.
const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  cacheDir: "node_modules/.vite-verify-places",
  optimizeDeps: { noDiscovery: true, include: [] },
});

let places;
let bounds;
let rules;
try {
  places = await vite.ssrLoadModule("/src/data/places.ts");
  bounds = await vite.ssrLoadModule("/src/lib/bounds.ts");
  rules = await vite.ssrLoadModule("/src/data/osm-rules.ts");
} finally {
  await vite.close();
}

const { PLACES, PRESET_ORIGINS } = places;
const { RICHMOND_BOUNDS, insideRichmond } = bounds;
const { DEDUP_METERS } = rules;

/** Present from chunk 8 onward; absent before it, and said so rather than assumed. */
const handCuratedCount = places.HAND_CURATED_COUNT ?? null;
const nameMax = places.NAME_MAX ?? null;

/**
 * The generated rows: the suffix of `PLACES` past the hand-curated count.
 *
 * The harness expected a separate `GENERATED_PLACES` array here. Chunk 8 landed
 * the other shape - one array with an append-only boundary and one exact count -
 * because `apply-places.mjs` appends and `opening-hours` will backfill `osm`
 * onto the hand rows, which destroys the obvious "has an osm id" discriminator.
 * One number survives that; a field does not.
 */
const generated =
  handCuratedCount === null ? null : PLACES.slice(handCuratedCount);

function uniqueIds(label, rows) {
  const seen = new Map();
  const duplicates = [];
  for (const row of rows) {
    if (seen.has(row.id)) duplicates.push(row.id);
    seen.set(row.id, row);
  }
  record(
    `every ${label} id is unique`,
    duplicates.length === 0,
    duplicates.length === 0 ? `${rows.length} ids` : `duplicated: ${duplicates.join(", ")}`,
  );
}

uniqueIds("PLACES", PLACES);
uniqueIds("PRESET_ORIGINS", PRESET_ORIGINS);

const outside = [...PLACES, ...PRESET_ORIGINS].filter((row) => !insideRichmond(row));
record(
  "every coordinate is inside the proxy's bounds",
  outside.length === 0,
  outside.length === 0
    ? `box ${RICHMOND_BOUNDS.south},${RICHMOND_BOUNDS.west} to ${RICHMOND_BOUNDS.north},${RICHMOND_BOUNDS.east}`
    : `outside: ${outside.map((row) => row.id).join(", ")}`,
);

if (handCuratedCount === null) {
  notes.push(`PLACES.length = ${PLACES.length} (HAND_CURATED_COUNT arrives with chunk 8)`);
} else {
  const curated = PLACES.length - (generated?.length ?? 0);
  record(
    "the hand-curated rows still number HAND_CURATED_COUNT",
    curated === handCuratedCount,
    `${curated} curated of ${PLACES.length} total, expected ${handCuratedCount}`,
  );
}

if (generated === null || generated.length === 0) {
  notes.push(`no generated rows yet - all ${PLACES.length} are hand-curated`);
} else {
  const tooLong = generated.filter((row) => row.name.length > nameMax);
  record(
    "every generated name is under NAME_MAX",
    nameMax !== null && tooLong.length === 0,
    nameMax === null ? "NAME_MAX is not exported" : `${tooLong.length} over ${nameMax}`,
  );

  const curated = PLACES.slice(0, handCuratedCount);
  // DEDUP_METERS, not the snap distance: this asks "is this the same place
  // under another name", which is a wider question than "did the anchor move".
  const collisions = generated.filter((row) =>
    curated.some((hand) => metersBetween(row, hand) < DEDUP_METERS),
  );
  record(
    "no generated row sits on top of a hand-curated one",
    collisions.length === 0,
    collisions.length === 0 ? "none" : `${collisions.map((row) => row.id).join(", ")}`,
  );
}

if (noEngine) {
  record("every place snaps to a walkable edge", false, "skipped: --no-engine");
} else {
  const rows = [...PLACES, ...PRESET_ORIGINS];
  const response = await fetch(`${await engineUrl()}/locate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      locations: rows.map((row) => ({ lat: row.lat, lon: row.lng })),
      costing: "pedestrian",
      verbose: false,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const located = response.ok ? await response.json() : null;

  if (located === null) {
    record("every place snaps to a walkable edge", false, `engine answered HTTP ${response.status}`);
  } else {
    const far = [];
    let worst = { id: null, meters: 0 };
    located.forEach((result, index) => {
      const row = rows[index];
      const edge = result.edges?.[0] ?? null;
      const meters =
        edge === null
          ? Number.POSITIVE_INFINITY
          : metersBetween(row, { lat: edge.correlated_lat, lng: edge.correlated_lon });
      if (meters > worst.meters) worst = { id: row.id, meters };
      if (meters > SNAP_MAX_METERS) far.push(`${row.id} (${Math.round(meters)} m)`);
    });
    record(
      "every place snaps to a walkable edge",
      far.length === 0,
      far.length === 0
        ? `worst snap ${worst.id} at ${Math.round(worst.meters)} m, under ${SNAP_MAX_METERS} m`
        : `beyond ${SNAP_MAX_METERS} m: ${far.join(", ")}`,
    );
  }
}

/** Same resolution order as verify-engine.mjs; kept small rather than shared. */
async function engineUrl() {
  if (process.env.VALHALLA_URL) return process.env.VALHALLA_URL;
  const { readFile } = await import("node:fs/promises");
  for (const file of [".env.local", ".env"]) {
    try {
      const text = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
      const value = text.match(/^VALHALLA_URL=(.*)$/m)?.[1].trim();
      if (value) return value;
    } catch {
      // A missing .env file is normal; the next candidate decides.
    }
  }
  throw new Error("no VALHALLA_URL - set it in .env.local, or pass --no-engine and accept the fail");
}

const ok = checks.every((check) => check.pass);

if (asJson) {
  console.log(JSON.stringify({ ok, places: PLACES.length, origins: PRESET_ORIGINS.length, checks, notes }, null, 2));
} else {
  console.log(`places: ${PLACES.length}   preset origins: ${PRESET_ORIGINS.length}`);
  for (const check of checks) {
    console.log(`  ${check.pass ? "[x]" : "[!]"} ${check.name} - ${check.detail}`);
  }
  for (const note of notes) console.log(`  --- ${note}`);
  if (!ok) console.error("verify-places: a data invariant does not hold");
}

process.exitCode = ok ? 0 : 1;
