// What the Valhalla instance can actually do, not what it says it offers.
//
//   node scripts/verify-engine.mjs [--json] [--url http://127.0.0.1:8002]
//
// Reports capability rather than availability, because "answers /status" and
// "can serve this app" are different claims. The gap between them is not
// hypothetical: the instance this repo was developed against advertises
// `height` in available_actions and returns null for every height it is asked
// for, and returns -500.0 - Valhalla's no-data sentinel - for every point of a
// route's elevation array. Both are silent. A chart drawn from either would be
// a flat line the app would present as terrain.
//
// So every check here posts a real request and reads the answer. Run it at the
// start of every chunk that touches the engine, and from LAUNCH.md's checklist.
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const urlIndex = args.indexOf("--url");

/**
 * The engine URL, from the same place the dev server reads it.
 *
 * Deliberately not `loadEnv` through Vite: this script has to be runnable when
 * the app does not build, which is exactly when an engine problem is being
 * chased. The parse is the small subset of dotenv this repo's files use.
 */
async function engineUrl() {
  if (urlIndex !== -1 && args[urlIndex + 1]) return args[urlIndex + 1];
  if (process.env.VALHALLA_URL) return process.env.VALHALLA_URL;
  for (const file of [".env.local", ".env"]) {
    try {
      const text = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
      const match = text.match(/^VALHALLA_URL=(.*)$/m);
      const value = match?.[1].trim();
      if (value) return value;
    } catch {
      // A missing .env file is normal; the next candidate decides.
    }
  }
  return null;
}

/**
 * Read from `src/lib/speed.ts` rather than restated.
 *
 * A copy here would make this check assert its own literal against the engine
 * while the app asked for something else entirely - which is the exact drift
 * the fixture exists to catch, hiding in the checker. Parsed rather than
 * imported because this is plain `.mjs` and that is a `.ts` module; the regex
 * is anchored on the export so a rename fails loudly instead of matching
 * something else.
 */
const speedSource = readFileSync(new URL("../src/lib/speed.ts", import.meta.url), "utf8");
const speedMatch = /export const WALKING_SPEED_KMH = ([\d.]+);/.exec(speedSource);
if (speedMatch === null) {
  console.error("verify-engine: could not read WALKING_SPEED_KMH from src/lib/speed.ts");
  process.exit(1);
}
const WALKING_SPEED_KMH = Number(speedMatch[1]);

/** Valhalla's sentinel for "this tile carries no elevation data". */
const NO_ELEVATION = -500;

/**
 * How wide a contour ladder to ask for, to tell a configured instance from a
 * stock one. Stock Valhalla ships service_limits.isochrone.max_contours: 4, and
 * this repo's config raises it to 100 so the whole dial ladder is one query.
 * Asking for more than the instance allows gets the whole batch rejected, so a
 * VALHALLA_MAX_CONTOURS the instance does not honour must be caught here rather
 * than as a slow warm-up in somebody's browser.
 */
const WIDE_CONTOURS = 8;

/**
 * A fixed short walk, and what the engine said about it. Grace Street to Main
 * Street Station: flat, central, and inside any Richmond extract.
 *
 * The point is not the number, it is that the number stops moving quietly. A
 * costing change, a speed change, or a graph built from a different extract all
 * show up here as a loud failure on a route nobody edits.
 *
 * **Re-taken 2026-08-21 after the elevation rebuild** (tileset 1787337146,
 * Valhalla 3.8.3). The previous fixture, against the same route on an
 * elevation-less graph, was 1.048 km in 1025.7 s - 3.68 km/h. The rebuild moved
 * it to 963.5 s, 3.91 km/h, on a route whose length did not change by a metre.
 * That is not an error: pedestrian costing's `use_hills` defaults to 0.5, and
 * over a graph that now carries grades this particular walk is downhill (51 m to
 * 44 m), so the engine rightly makes it quicker. Every ETA in the app moved with
 * it. The fixture catching this on the first run after the rebuild is the whole
 * reason it exists.
 */
const SPEED_FIXTURE = {
  from: { lat: 37.5407, lon: -77.436 },
  to: { lat: 37.5345, lon: -77.431 },
  expectedKm: 1.047,
  expectedSeconds: 963.5,
  /** Wide enough to absorb a rebuild that re-snaps an endpoint by a house-width. */
  tolerance: 0.02,
};

/**
 * The field /height reads its sample points from. Its wire name is the engine's
 * word, not this repo's, so it is bound to a constant that says what it holds
 * rather than written inline as a key that says only how it is structured.
 */
const SAMPLE_POINTS_FIELD = "shape";

const HEIGHT_PROBE = [
  { lat: 37.5407, lon: -77.436 },
  { lat: 37.5265, lon: -77.4174 },
  { lat: 37.5292, lon: -77.4528 },
];

const checks = [];
const record = (name, pass, detail) => void checks.push({ name, pass, detail });

async function post(base, path, body) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Left null; the caller reports the status and the raw prefix instead.
  }
  return { ok: response.ok, status: response.status, body: parsed, text };
}

async function probeStatus(base) {
  try {
    const response = await fetch(`${base}/status`, { signal: AbortSignal.timeout(15_000) });
    const status = response.ok ? await response.json() : null;
    record("/status answers", status !== null, `HTTP ${response.status}`);
    return status;
  } catch (error) {
    record("/status answers", false, String(error));
    return null;
  }
}

async function probeHeight(base) {
  const height = await post(base, "/height", { range: true, [SAMPLE_POINTS_FIELD]: HEIGHT_PROBE });
  const pairs = Array.isArray(height.body?.range_height) ? height.body.range_height : [];
  const heights = pairs.map((pair) => pair?.[1] ?? null);
  const nulls = heights.filter((value) => value === null).length;
  record(
    "/height returns real heights, no nulls",
    pairs.length === HEIGHT_PROBE.length && nulls === 0,
    pairs.length === 0
      ? `HTTP ${height.status}`
      : `${nulls}/${pairs.length} null, got ${JSON.stringify(heights)}`,
  );
}

async function probeRoute(base) {
  const route = await post(base, "/route", {
    locations: [SPEED_FIXTURE.from, SPEED_FIXTURE.to],
    costing: "pedestrian",
    costing_options: { pedestrian: { walking_speed: WALKING_SPEED_KMH } },
    elevation_interval: 30,
    units: "kilometers",
  });

  const leg = route.body?.trip?.legs?.[0] ?? null;
  const elevation = Array.isArray(leg?.elevation) ? leg.elevation : [];
  const dead = elevation.filter((value) => Math.round(value) <= NO_ELEVATION).length;
  record(
    "/route elevation is data, not -500 sentinels",
    elevation.length > 0 && dead === 0,
    elevation.length === 0
      ? `no elevation array (HTTP ${route.status})`
      : `${dead}/${elevation.length} at the no-data sentinel`,
  );

  const summary = route.body?.trip?.summary ?? null;
  if (summary === null) {
    record("walking speed round-trip matches the fixture", false, `no summary (HTTP ${route.status})`);
    return;
  }
  const kmOff = Math.abs(summary.length - SPEED_FIXTURE.expectedKm) / SPEED_FIXTURE.expectedKm;
  const secOff = Math.abs(summary.time - SPEED_FIXTURE.expectedSeconds) / SPEED_FIXTURE.expectedSeconds;
  const impliedKmh = summary.length / (summary.time / 3600);
  record(
    "walking speed round-trip matches the fixture",
    kmOff <= SPEED_FIXTURE.tolerance && secOff <= SPEED_FIXTURE.tolerance,
    `${summary.length} km in ${summary.time.toFixed(1)} s = ${impliedKmh.toFixed(2)} km/h ` +
      `(fixture ${SPEED_FIXTURE.expectedKm} km / ${SPEED_FIXTURE.expectedSeconds} s)`,
  );
}

async function probeContours(base) {
  const contours = Array.from({ length: WIDE_CONTOURS }, (_, index) => ({ time: index + 1 }));
  const iso = await post(base, "/isochrone", {
    locations: [SPEED_FIXTURE.from],
    costing: "pedestrian",
    costing_options: { pedestrian: { walking_speed: WALKING_SPEED_KMH } },
    contours,
    polygons: true,
  });
  const features = Array.isArray(iso.body?.features) ? iso.body.features : [];
  record(
    `max_contours clears ${WIDE_CONTOURS} in one query`,
    features.length === WIDE_CONTOURS,
    `asked ${WIDE_CONTOURS}, got ${features.length}` +
      (iso.ok ? "" : ` (HTTP ${iso.status}: ${iso.body?.error ?? iso.text.slice(0, 80)})`),
  );
}

async function main() {
  const base = await engineUrl();
  if (base === null) {
    const problem = "no VALHALLA_URL - set it in .env.local or pass --url";
    if (asJson) console.log(JSON.stringify({ ok: false, problem }, null, 2));
    else console.error(`verify-engine: ${problem}`);
    return 1;
  }

  const status = await probeStatus(base);
  let tilesetAgeDays = null;
  if (status !== null) {
    const modified = Number(status.tileset_last_modified);
    tilesetAgeDays = Number.isFinite(modified)
      ? Math.round((Date.now() / 1000 - modified) / 86_400)
      : null;
    const version = status.version ?? null;
    record("reports a version", version !== null && version !== "", `version ${version}`);
    record(
      "reports a tileset timestamp",
      tilesetAgeDays !== null,
      tilesetAgeDays === null ? "absent" : `built ${tilesetAgeDays} days ago`,
    );

    // Elevation is probed twice because the two endpoints fail differently:
    // /height answers null and /route answers -500.0, and either one on its own
    // is enough to make chunk 3's chart a lie.
    await probeHeight(base);
    await probeRoute(base);
    await probeContours(base);
  }

  const ok = checks.every((check) => check.pass);
  if (asJson) {
    console.log(JSON.stringify({ ok, url: base, tilesetAgeDays, checks }, null, 2));
  } else {
    console.log(`engine: ${base}`);
    for (const check of checks) {
      console.log(`  ${check.pass ? "[x]" : "[!]"} ${check.name} - ${check.detail}`);
    }
    if (!ok) console.error("verify-engine: the instance cannot serve this app as configured");
  }
  return ok ? 0 : 1;
}

// Not process.exit(): Node asserts inside libuv when it tears a process down
// while a keep-alive socket from fetch is still open, which turns a clean
// failure into exit code 127 and a crash dump. Setting the code and letting the
// loop drain reports the same result honestly.
process.exitCode = await main();
