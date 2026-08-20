// Precompute reach snapshots for the preset origins.
//
//   npm run dev                                        # in another terminal
//   node scripts/build-reach.mjs [baseUrl] [--allow-gaps]
//
// Writes public/reach/<lat>_<lng>.json, one per preset, each holding the whole
// dial ladder. The app fetches the matching file on startup, so a cold load on
// a known origin costs one static file the browser can cache instead of a
// ladder of engine queries.
//
// Bump SNAPSHOT_VERSION in src/lib/isochrone.ts whenever you regenerate:
// the app asks for these files under that number and public/_headers lets a
// browser keep them for a year, so an unbumped rebuild reaches nobody who has
// already loaded the old one.
//
// Deliberately goes through the app's own /api/isochrone rather than straight
// at Valhalla: the proxy pins the costing model, the walking speed and the
// bounds, and a snapshot built past it could disagree with what the app asks
// for at runtime.
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "vite";

// Loaded through Vite rather than imported directly: the app's modules use
// extensionless specifiers only its resolver understands, and copying LADDER
// or the snapshot filename rule into this script would let the generator and
// the runtime drift apart silently.
// Its own cacheDir: sharing the project's would let this throwaway server
// re-optimise dependencies underneath a dev server running from the same
// root, which leaves that one serving stale module transforms.
const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  cacheDir: "node_modules/.vite-build-reach",
  optimizeDeps: { noDiscovery: true, include: [] },
});
const { PRESET_ORIGINS } = await vite.ssrLoadModule("/src/data/places.ts");
const { LADDER, DIAL_STEP, MIN_MINUTES, MAX_MINUTES, SNAPSHOT_VERSION, snapshotName } =
  await vite.ssrLoadModule("/src/lib/isochrone.ts");
const { collectPolygons } = await vite.ssrLoadModule("/src/lib/geometry.ts");
const { WALKING_SPEED_KMH } = await vite.ssrLoadModule("/src/lib/speed.ts");

const args = process.argv.slice(2);
// A ladder with holes in it is a dial with cold positions the app cannot see
// are cold, so it is a failure by default. The flag is for the case where the
// engine genuinely refuses a contour and shipping the rest is still better.
const allowGaps = args.includes("--allow-gaps");
const base = args.find((arg) => !arg.startsWith("--")) ?? "http://localhost:5173";
const OUT = new URL("../public/reach/", import.meta.url);

/**
 * Snapshot vertex precision, about 11 m at this latitude.
 *
 * Deliberately coarser than the app's COORD_PRECISION, which identifies an
 * origin and has to stay exact or a snapshot stops matching the key it is
 * looked up by. These are contour vertices: Valhalla cuts them on a 25 m grid
 * and the map rounds their corners before drawing them, so the fifth decimal
 * was a byte per vertex spent well below the error already accepted.
 */
const SNAPSHOT_PRECISION = 4;
const round = (n) => Number(n.toFixed(SNAPSHOT_PRECISION));

/**
 * What the engine says about itself, if the proxy exposes it.
 *
 * A snapshot is only as current as the tiles it was cut from, and nothing in
 * the file could say which build that was. Best effort: a missing health
 * endpoint records null rather than failing a build, because a snapshot is
 * correct without it - just harder to date.
 */
async function engineFingerprint() {
  try {
    const response = await fetch(`${base}/api/health`);
    if (!response.ok) return null;
    const health = await response.json();
    const version = health?.version ?? null;
    const tileset = health?.tileset_last_modified ?? null;
    return version === null && tileset === null ? null : { version, tileset };
  } catch {
    return null;
  }
}

async function snapshot(origin) {
  const response = await fetch(`${base}/api/isochrone`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      location: { latitude: origin.lat, longitude: origin.lng },
      minutes: LADDER,
    }),
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${(await response.text()).slice(0, 120)}`);
  }

  const payload = await response.json();
  const contours = {};
  for (const feature of payload.features ?? []) {
    const minutes = feature?.properties?.contour;
    if (!Number.isFinite(minutes)) continue;
    const polygons = collectPolygons(feature);
    if (polygons.length === 0) continue;
    // Stored as GeoJSON geometry, not bare arrays: the app parses it back with
    // the same collectPolygons the engine response goes through, and the file
    // stays inspectable in any GIS tool.
    contours[minutes] = {
      type: "MultiPolygon",
      coordinates: polygons.map((rings) =>
        rings.map((ring) => ring.map(([lng, lat]) => [round(lng), round(lat)])),
      ),
    };
  }
  return { contours, missing: LADDER.filter((m) => !(m in contours)) };
}

await mkdir(OUT, { recursive: true });
const engine = await engineFingerprint();
let failures = 0;

for (const [index, origin] of PRESET_ORIGINS.entries()) {
  const label = `[${index + 1}/${PRESET_ORIGINS.length}] ${origin.name}`;
  try {
    const { contours, missing } = await snapshot(origin);
    if (missing.length > 0 && !allowGaps) {
      failures++;
      console.error(
        `${label}: FAILED - the engine dropped ${missing.length} of ${LADDER.length} contours ` +
          `(${missing.join(",")}). Re-run against a healthy engine, or pass --allow-gaps.`,
      );
      continue;
    }

    const name = snapshotName(origin);
    // Everything the app needs to decide whether this file still answers the
    // question it is about to ask. speedKmh is the one it enforces: a file
    // built at another pace is a different definition of "25 minutes", and
    // seedFromSnapshot rejects it rather than serving two definitions at once.
    const body = JSON.stringify({
      version: SNAPSHOT_VERSION,
      generatedAt: new Date().toISOString(),
      speedKmh: WALKING_SPEED_KMH,
      ladder: { min: MIN_MINUTES, max: MAX_MINUTES, step: DIAL_STEP },
      coordPrecision: SNAPSHOT_PRECISION,
      engine,
      origin: { lat: origin.lat, lng: origin.lng },
      contours,
    });
    await writeFile(new URL(name, OUT), body);
    const kb = (body.length / 1024).toFixed(0);
    const gap = missing.length > 0 ? `  (engine dropped ${missing.join(",")})` : "";
    console.log(`${label}: ${Object.keys(contours).length} contours, ${kb} KB -> ${name}${gap}`);
  } catch (error) {
    failures++;
    console.error(`${label}: FAILED - ${error.message}`);
  }
}

await vite.close();
if (failures > 0) {
  console.error(`${failures} origin(s) failed; their snapshots were not written.`);
  process.exit(1);
}
console.log("Done. Bump SNAPSHOT_VERSION, then commit public/reach/.");
