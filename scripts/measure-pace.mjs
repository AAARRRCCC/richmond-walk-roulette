// Does the elevation rebuild actually change the pace the app delivers, or only
// the pace of one downhill fixture?
//
// HUMAN-REVIEW 6.1 records a single route going 1025.7 s -> 963.5 s on an
// unchanged 1.047 km, and asks whether the pinned 3.69 km/h is still right. One
// route cannot answer it: `use_hills` makes downhill quicker and uphill slower,
// so a route chosen for its descent measures the effect at its largest. What a
// contour is drawn from is every direction at once.
//
// So: every place from every preset origin, effective pace per route, and the
// distribution. Committed because the question comes back every time the graph
// is rebuilt, and because answering it by hand once is how a number becomes
// folklore.
//
// The pin has since moved to 4.5 km/h (docs/adr/0002), which is also the limit
// of what this script can tell you: it measures the engine against whatever
// speed.ts currently asks for, so it catches the engine drifting from the pin
// and never the pin drifting from a walker. Only a real walk does that.
//
//   npm run dev                       # not needed; this talks to the engine
//   node scripts/measure-pace.mjs [--url http://127.0.0.1:8002]
import { readFileSync } from "node:fs";

const ENGINE = process.argv.includes("--url")
  ? process.argv[process.argv.indexOf("--url") + 1]
  : "http://127.0.0.1:8002";

// Read, never restated. A copy here would have this script measure the engine
// against its own literal while the app asked for something else - the drift it
// exists to detect, hiding in the detector.
const speedSource = readFileSync(new URL("../src/lib/speed.ts", import.meta.url), "utf8");
const speedMatch = /export const WALKING_SPEED_KMH = ([\d.]+);/.exec(speedSource);
if (speedMatch === null) {
  console.error("measure-pace: could not read WALKING_SPEED_KMH from src/lib/speed.ts");
  process.exit(1);
}
const SPEED = Number(speedMatch[1]);

const src = readFileSync(new URL("../src/data/places.ts", import.meta.url), "utf8");
const rows = (name) => {
  const start = src.indexOf(`export const ${name}`);
  const end = src.indexOf("\n];", start);
  return [...src.slice(start, end).matchAll(/lat:\s*(-?[\d.]+),\s*lng:\s*(-?[\d.]+)/g)].map(
    (m) => ({ lat: Number(m[1]), lng: Number(m[2]) }),
  );
};

const places = rows("PLACES");
const origins = rows("PRESET_ORIGINS");
console.log(`${origins.length} origins x ${places.length} places`);

async function route(from, to) {
  const body = {
    locations: [
      { lat: from.lat, lon: from.lng },
      { lat: to.lat, lon: to.lng },
    ],
    costing: "pedestrian",
    costing_options: { pedestrian: { walking_speed: SPEED } },
    units: "kilometers",
    directions_type: "none",
  };
  const res = await fetch(`${ENGINE}/route`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return null;
  const json = await res.json();
  const summary = json?.trip?.summary;
  if (!summary || !summary.length || !summary.time) return null;
  return { km: summary.length, seconds: summary.time };
}

const paces = [];
let failed = 0;
for (const origin of origins) {
  for (const place of places) {
    const r = await route(origin, place);
    if (r === null || r.km < 0.15) {
      failed += 1;
      continue;
    }
    paces.push(r.km / (r.seconds / 3600));
  }
}

paces.sort((a, b) => a - b);
const at = (q) => paces[Math.floor((paces.length - 1) * q)];
const mean = paces.reduce((a, b) => a + b, 0) / paces.length;

console.log(`routes measured: ${paces.length}  (skipped ${failed})`);
console.log(`effective km/h  min ${at(0).toFixed(3)}  p10 ${at(0.1).toFixed(3)}  median ${at(0.5).toFixed(3)}  p90 ${at(0.9).toFixed(3)}  max ${at(1).toFixed(3)}`);
console.log(`mean ${mean.toFixed(3)} km/h against a pinned ${SPEED}`);
const drift = ((mean - SPEED) / SPEED) * 100;
console.log(
  `${Math.abs(drift).toFixed(2)}% ${drift < 0 ? "SLOWER" : "FASTER"} than the pin, so the app ` +
    `${drift < 0 ? "under-promises" : "over-promises"} reach by that much`,
);
