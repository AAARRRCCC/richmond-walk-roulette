// Fake Valhalla for offline UI work: node valhalla/stub.mjs [port]
//
// Speaks just enough of the API for the app's proxy: POST /isochrone (any
// number of contours), POST /route, GET /status. Contours are concentric,
// deterministically irregular blobs with a notch cut to the south so nesting,
// holes-adjacent rendering and point-in-polygon paths all get exercised.
// The shapes are synthetic - never judge reachability with this.
import { createServer } from "node:http";

const PORT = Number(process.argv[2] ?? 8003);
const SPEED_KMH = 3.69;
const M_PER_MIN = (SPEED_KMH * 1000) / 60;

/** Radius with deterministic angular noise, so contours nest and look organic. */
function radiusMeters(minutes, theta) {
  const base = minutes * M_PER_MIN;
  const noise =
    0.14 * Math.sin(3 * theta + 0.7) + 0.09 * Math.sin(5 * theta + 2.1) + 0.05 * Math.sin(8 * theta);
  // The "river": press the south-southeast in, hard, like the James does.
  const notch = theta > 3.6 && theta < 4.9 ? 0.45 : 1;
  return base * (1 + noise) * notch;
}

function contourRing(lat, lon, minutes) {
  const ring = [];
  const mLat = 111320;
  const mLon = mLat * Math.cos((lat * Math.PI) / 180);
  for (let i = 0; i <= 72; i++) {
    const theta = (i / 72) * 2 * Math.PI;
    const r = radiusMeters(minutes, theta);
    ring.push([
      Number((lon + (r * Math.cos(theta)) / mLon).toFixed(6)),
      Number((lat + (r * Math.sin(theta)) / mLat).toFixed(6)),
    ]);
  }
  return ring;
}

function encodePolyline6(points) {
  let out = "";
  let prevLat = 0;
  let prevLon = 0;
  for (const [lon, lat] of points) {
    for (let value of [Math.round(lat * 1e6) - prevLat, Math.round(lon * 1e6) - prevLon]) {
      value = value < 0 ? ~(value << 1) : value << 1;
      while (value >= 0x20) {
        out += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
        value >>= 5;
      }
      out += String.fromCharCode(value + 63);
    }
    prevLat = Math.round(lat * 1e6);
    prevLon = Math.round(lon * 1e6);
  }
  return out;
}

function haversineMeters(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(s));
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/status") return json(res, 200, { version: "stub" });

  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    let body;
    try {
      body = JSON.parse(raw || "{}");
    } catch {
      return json(res, 400, { error: "bad json" });
    }
    const [a, b] = body.locations ?? [];

    if (req.method === "POST" && req.url === "/isochrone") {
      if (!a) return json(res, 400, { error: "no location" });
      const features = (body.contours ?? [])
        .map(({ time }) => time)
        .sort((x, y) => y - x)
        .map((minutes) => ({
          type: "Feature",
          properties: { contour: minutes, metric: "time" },
          geometry: { type: "Polygon", coordinates: [contourRing(a.lat, a.lon, minutes)] },
        }));
      return json(res, 200, { type: "FeatureCollection", features });
    }

    if (req.method === "POST" && req.url === "/route") {
      if (!a || !b) return json(res, 400, { error: "need two locations" });
      // A gentle S-curve rather than a ruler line, so the map draw looks real.
      const points = [];
      for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        const sway = 0.00035 * Math.sin(t * Math.PI * 2);
        points.push([a.lon + (b.lon - a.lon) * t + sway, a.lat + (b.lat - a.lat) * t - sway]);
      }
      const meters = haversineMeters(a, b) * 1.3;
      return json(res, 200, {
        trip: {
          legs: [{ "shape": encodePolyline6(points) }],
          summary: { length: meters / 1000, time: (meters / (SPEED_KMH * 1000)) * 3600 },
        },
      });
    }

    json(res, 404, { error: "not found" });
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`stub valhalla on http://localhost:${PORT}`);
});
