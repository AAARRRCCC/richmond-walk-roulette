// Is a committed reach snapshot still true?
//
//   node scripts/verify-drift.mjs [--json] [--threshold 1] [--sample 5,25,50,75,100]
//
// The plan's quietest failure. public/reach/*.json are precomputed contour
// ladders; nothing in the app detects a stale one, and rebuilding the routing
// graph changes the network underneath all eleven of them at once. A snapshot
// that no longer matches the engine is not a slow path or a warning - it is the
// app confidently drawing last month's city.
//
// So: re-request a sample of rungs from the live engine and compare against the
// committed file. Two numbers per origin, and the second is the interesting one:
//
//   area delta  - how much the contour moved, as a percentage
//   flips       - how many places changed sides
//
// Membership is what the app actually consumes. An area that moved 0.4% while
// three places changed sides is the case worth knowing about, not the
// reassuring one, so both are reported and both appear in the chunk report.
//
// Goes through the app's own /api/isochrone rather than straight at Valhalla,
// for the same reason build-reach.mjs does: the proxy pins the costing model,
// the walking speed and the bounds, and a comparison made past it would be
// measuring a different question than the one the app asks.
import { readFile, readdir } from "node:fs/promises";
import { createServer } from "vite";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const readArg = (flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? null : (args[index + 1] ?? null);
};

/** Percent. Chunk 1 of the v0.5 plan names 1% as the line for regenerating. */
const threshold = Number(readArg("--threshold") ?? 1);

/**
 * Which rungs to re-request, in minutes.
 *
 * Explicit rather than clever, and stated in the output, because a sample small
 * enough to be fast is also small enough to miss drift. These five span the
 * ladder: the innermost rung where a single re-snapped edge moves a large share
 * of a small area, the outermost where the contour meets the edge of the graph,
 * and three between. Re-requesting all 96 x 11 is the honest exhaustive answer
 * and takes long enough that nobody would run it, which is worse.
 */
const sample = (readArg("--sample") ?? "5,25,50,75,100").split(",").map(Number);

const REACH_DIR = new URL("../public/reach/", import.meta.url);

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  cacheDir: "node_modules/.vite-verify-drift",
  optimizeDeps: { noDiscovery: true, include: [] },
});

const { handleApiRequest } = await vite.ssrLoadModule("/server/proxy.ts");
const { collectPolygons, contains, areaSqMeters } = await vite.ssrLoadModule("/src/lib/geometry.ts");
const { PLACES } = await vite.ssrLoadModule("/src/data/places.ts");

const env = {
  VALHALLA_URL: process.env.VALHALLA_URL ?? (await envFile("VALHALLA_URL")),
  VALHALLA_MAX_CONTOURS: process.env.VALHALLA_MAX_CONTOURS ?? (await envFile("VALHALLA_MAX_CONTOURS")),
};

async function envFile(key) {
  for (const file of [".env.local", ".env"]) {
    try {
      const text = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
      const value = text.match(new RegExp(`^${key}=(.*)$`, "m"))?.[1].trim();
      if (value) return value;
    } catch {
      // A missing .env file is normal; the next candidate decides.
    }
  }
  return undefined;
}

/**
 * Rounds a live contour to the precision the snapshot was written at.
 *
 * Without this the tool measures the snapshot's own quantisation and calls it
 * drift. `build-reach.mjs` writes vertices at 4 decimals - about 11 m at this
 * latitude, deliberately coarser than the app's COORD_PRECISION because
 * Valhalla cuts contours on a 25 m grid and the map rounds their corners before
 * drawing them. At the 5-minute rung the contour is a few hundred metres across,
 * so 11 m of vertex rounding is worth about 1% of its area - which is the whole
 * threshold, arriving from a source that is not drift at all. Measured: three
 * origins read 1.0-1.3% against snapshots cut from the very engine they were
 * being compared to.
 *
 * So both sides are rounded the same way, and what is left is the real thing.
 */
function quantise(polygons, precision) {
  const round = (n) => Number(n.toFixed(precision));
  return polygons.map((polygon) =>
    polygon.map((ring) => ring.map(([lng, lat]) => [round(lng), round(lat)])),
  );
}

/** Live contours for one origin, keyed by minute, or null if the engine refused. */
async function liveContours(origin, minutes) {
  const request = new Request("http://verify.local/api/isochrone", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      location: { latitude: origin.lat, longitude: origin.lng },
      minutes,
    }),
  });
  const response = await handleApiRequest(request, env);
  if (response === null || !response.ok) return null;
  const body = await response.json();
  const byMinute = new Map();
  for (const feature of body.features ?? []) {
    const minute = Number(feature?.properties?.contour);
    if (Number.isFinite(minute)) byMinute.set(minute, collectPolygons(feature));
  }
  return byMinute;
}

const results = [];
const files = (await readdir(REACH_DIR)).filter((file) => file.endsWith(".json")).toSorted();

for (const file of files) {
  const snapshot = JSON.parse(await readFile(new URL(file, REACH_DIR), "utf8"));
  const origin = snapshot.origin;
  const live = await liveContours(origin, sample);

  if (live === null) {
    results.push({ file, origin, error: "the engine did not answer", rungs: [] });
    continue;
  }

  // The snapshot says what precision it was written at; older files that
  // predate the stamp were written at the same 4 and say so by defaulting.
  const precision = Number.isFinite(snapshot.coordPrecision) ? snapshot.coordPrecision : 4;

  const rungs = [];
  for (const minute of sample) {
    const committed = snapshot.contours?.[String(minute)] ?? null;
    const raw = live.get(minute) ?? null;
    if (committed === null || raw === null) {
      rungs.push({ minute, missing: committed === null ? "committed" : "live" });
      continue;
    }
    const fresh = quantise(raw, precision);
    const before = collectPolygons(committed);
    const beforeArea = areaSqMeters(before);
    const afterArea = areaSqMeters(fresh);
    const areaDelta = beforeArea === 0 ? Number.POSITIVE_INFINITY : ((afterArea - beforeArea) / beforeArea) * 100;
    const flipped = PLACES.filter(
      (place) => contains(before, place) !== contains(fresh, place),
    ).map((place) => place.id);
    rungs.push({ minute, beforeArea, afterArea, areaDelta, flips: flipped.length, flipped });
  }
  results.push({ file, origin, rungs });
}

await vite.close();

const measured = results.flatMap((result) => result.rungs.filter((rung) => "areaDelta" in rung));
// `>=` rather than `>`, and seeded with the first rung: a run where every
// delta is exactly 0 is the expected answer right after a regeneration, and
// "worst 0.00% at - min" reads like the tool failed to measure anything.
const worstArea = measured.reduce(
  (worst, rung) => (worst === null || Math.abs(rung.areaDelta) > Math.abs(worst.areaDelta) ? rung : worst),
  null,
);
const totalFlips = measured.reduce((sum, rung) => sum + rung.flips, 0);
const errored = results.filter((result) => result.error !== undefined);
const gaps = results.flatMap((result) => result.rungs.filter((rung) => rung.missing !== undefined));

const ok =
  errored.length === 0 &&
  gaps.length === 0 &&
  measured.length > 0 &&
  Math.abs(worstArea?.areaDelta ?? 0) <= threshold;

if (asJson) {
  console.log(
    JSON.stringify(
      {
        ok,
        threshold,
        sample,
        snapshots: results.length,
        rungsCompared: measured.length,
        worstAreaDeltaPercent: worstArea?.areaDelta ?? null,
        totalFlips,
        results,
      },
      null,
      2,
    ),
  );
} else {
  console.log(`sample: ${sample.join(", ")} min   threshold: ${threshold}%   (live contours rounded to the snapshot's own precision)`);
  for (const result of results) {
    if (result.error !== undefined) {
      console.log(`  [!] ${result.file} - ${result.error}`);
      continue;
    }
    const worst = result.rungs.reduce(
      (acc, rung) =>
        rung.areaDelta === undefined
          ? acc
          : acc === null || Math.abs(rung.areaDelta) > Math.abs(acc.areaDelta)
            ? rung
            : acc,
      null,
    );
    const flips = result.rungs.reduce((sum, rung) => sum + (rung.flips ?? 0), 0);
    const missing = result.rungs.filter((rung) => rung.missing !== undefined).length;
    const bad = missing > 0 || Math.abs(worst?.areaDelta ?? 0) > threshold;
    console.log(
      `  ${bad ? "[!]" : "[x]"} ${result.file}  worst ${(worst?.areaDelta ?? 0).toFixed(2)}% ` +
        `at ${worst?.minute ?? "-"} min, ${flips} flips` +
        (missing > 0 ? `, ${missing} rung(s) missing` : ""),
    );
    for (const rung of result.rungs) {
      if (rung.flipped?.length) console.log(`        ${rung.minute} min flipped: ${rung.flipped.join(", ")}`);
    }
  }
  console.log(
    `worst area delta: ${(worstArea?.areaDelta ?? 0).toFixed(2)}% (${worstArea?.minute ?? "-"} min), ` +
      `total membership flips: ${totalFlips}, rungs compared: ${measured.length}`,
  );
  if (!ok) console.error("verify-drift: the committed snapshots no longer match the engine");
}

process.exitCode = ok ? 0 : 1;
