// Precompute reach snapshots for the preset origins.
//
//   npm run dev                    # in another terminal
//   node scripts/build-reach.mjs [baseUrl]
//
// Writes public/reach/<lat>_<lng>.json, one per preset, each holding the whole
// dial ladder. The app fetches the matching file on startup, so a cold load on
// a known origin costs one static file the browser can cache instead of a
// ladder of engine queries.
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
const { LADDER, SNAPSHOT_VERSION, snapshotName } = await vite.ssrLoadModule("/src/lib/isochrone.ts");
const { collectPolygons, COORD_PRECISION } = await vite.ssrLoadModule("/src/lib/geometry.ts");

const base = process.argv[2] ?? "http://localhost:5173";
const OUT = new URL("../public/reach/", import.meta.url);

/** The app's own coordinate precision, ~1.1 m: far finer than a contour drawn
 *  on a city map, and roughly a tenth fewer bytes than the engine's 6. */
const round = (n) => Number(n.toFixed(COORD_PRECISION));

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
let failures = 0;

for (const [index, origin] of PRESET_ORIGINS.entries()) {
  const label = `[${index + 1}/${PRESET_ORIGINS.length}] ${origin.name}`;
  try {
    const { contours, missing } = await snapshot(origin);
    const name = snapshotName(origin);
    const body = JSON.stringify({
      version: SNAPSHOT_VERSION,
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
console.log("Done. Commit public/reach/ so a cold start needs no engine.");
