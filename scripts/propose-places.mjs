// Turn the committed harvest into a reviewable list of candidate places.
//
//   npm run dev                       # in another terminal; this needs /api/locate
//   npm run propose:places [--allow-remote] [--base http://localhost:5173]
//
// Reads ONLY data/osm/*.json. The single outbound call is /api/locate against
// the app's own proxy, which is what corrects an OSM centroid to somewhere a
// person can actually stand: `out center` on a park way returns the
// bounding-box centre, which for Hollywood Cemetery is a spot with no path to
// it.
//
// Writes data/proposals/places.json and a self-contained review.html. It never
// writes src/. A script that can rewrite the destination list unattended is a
// script that can ship a marker standing in a highway median, so the pipeline
// stops at a page a person clears by hand.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "vite";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : (args[index + 1] ?? fallback);
};

const BASE = flag("--base", "http://localhost:5173");
const ALLOW_REMOTE = args.includes("--allow-remote");

/**
 * A propose run is roughly one /api/locate per candidate, against an endpoint
 * the Worker charges a rate-limit unit for. Pointed at production that stalls
 * after ~240 calls, which is the limiter doing its job; pointed at a local dev
 * server there is no limiter at all, which is where this is meant to run.
 *
 * The limiter cannot enforce that, so this does: a check with a message rather
 * than a comment nobody reads. An operator who means it passes --allow-remote
 * and owns the calls.
 */
const host = new URL(BASE).hostname;
if (!ALLOW_REMOTE && host !== "localhost" && host !== "127.0.0.1") {
  console.error(
    `propose-places: ${BASE} is not local.\n` +
      "A run is hundreds of /api/locate calls, each a rate-limit unit. Point this\n" +
      "at a local dev server, or pass --allow-remote and own the traffic.",
  );
  process.exit(1);
}

const OSM = new URL("../data/osm/", import.meta.url);
const OUT = new URL("../data/proposals/", import.meta.url);

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  cacheDir: "node_modules/.vite-propose-places",
  optimizeDeps: { noDiscovery: true, include: [] },
});

let rules;
let placesModule;
let geometry;
try {
  // Loaded through Vite rather than re-implemented, so classification cannot
  // drift from what osm-rules.test.ts asserts. Same trick build-reach.mjs uses.
  rules = await vite.ssrLoadModule("/src/data/osm-rules.ts");
  placesModule = await vite.ssrLoadModule("/src/data/places.ts");
  geometry = await vite.ssrLoadModule("/src/lib/geometry.ts");
} finally {
  await vite.close();
}

const { classify, placeId, placeName, DEDUP_METERS } = rules;
const { PLACES, MAX_PLACES } = placesModule;
const { metersBetween } = geometry;

const readJson = async (file) => JSON.parse(await readFile(new URL(file, OSM), "utf8"));

const manifest = await readJson("manifest.json");
const destinations = (await readJson("destinations.json")).elements;
const detours = (await readJson("detours.json")).elements;

/** Gate nodes, pooled across families: proximity is the rule, not parentage. */
const gates = [];
for (const family of ["gates-park.json", "gates-garden.json", "gates-reserve.json", "gates-cemetery.json"]) {
  for (const node of (await readJson(family)).elements) {
    // Narrowed at the boundary rather than tested for a representation: a gate
    // with no coordinate is not a gate, and Number.isFinite says exactly that
    // about the value rather than about how it is stored.
    if (Number.isFinite(node.lat) && Number.isFinite(node.lon)) {
      gates.push({ lat: node.lat, lng: node.lon });
    }
  }
}

/**
 * How far a gate node may sit from a seed and still be this feature's gate.
 *
 * Matched by proximity rather than by parentage, and that is a correction
 * rather than a shortcut: `out ids;` on a way suppresses its member node list
 * entirely, so the id-matching an earlier draft made the primary rule had
 * nothing to match against. Proximity is also the answer we actually want - a
 * gate on a neighbouring park's outline 40 m away is a fine place to stand, and
 * parentage would reject it.
 */
const GATE_RADIUS_M = 250;

/** How far an anchor may move from its seed, by feature shape. */
const MAX_MOVE_NODE_M = 60;
const MAX_MOVE_AREA_M = 120;

/** Below this the edge is a stub the walker cannot get anywhere from. */
const MIN_OUTBOUND_REACH = 50;

/** Case, punctuation and articles removed, so "The Parsons House" == "Parsons House". */
const normalise = (name) =>
  name
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9]+/g, "");

const element = (raw) => {
  const seed =
    raw.center !== undefined
      ? { lat: raw.center.lat, lng: raw.center.lon }
      : { lat: raw.lat, lng: raw.lon };
  return {
    osm: `${raw.type}/${raw.id}`,
    isNode: raw.type === "node",
    seed,
    tags: new Map(Object.entries(raw.tags ?? {})),
  };
};

async function locate(point) {
  const response = await fetch(`${BASE}/api/locate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ point: { latitude: point.lat, longitude: point.lng } }),
  });
  if (response.status === 404) return null;
  if (response.status === 503) {
    console.error(
      "\npropose-places: /api/locate says the engine is not configured.\n" +
        "VALHALLA_URL is unset. See .env.example and valhalla/README.md.\n" +
        "Nothing was written - a half-anchored dataset is the failure mode where\n" +
        "somebody accepts the rows that happened to resolve.",
    );
    process.exit(1);
  }
  if (!response.ok) {
    console.error(`\npropose-places: /api/locate answered ${response.status}. Nothing written.`);
    process.exit(1);
  }
  return response.json();
}

/**
 * Where a walker can stand for this candidate. First rung that hits wins, and
 * the rung is recorded so a reviewer can distrust a fallback.
 *
 * 1. entrance - a node on this feature's own way. Measured at ~0% on Richmond
 *    park outlines; kept only because it is free when it hits.
 * 2. gate - the nearest harvested gate node within GATE_RADIUS_M.
 * 3. snap - whatever /api/locate correlates the seed to.
 *
 * Rungs 1 and 2 still go through /api/locate, because that is where the
 * pedestrian-access and edge-use gates live - but they keep their OWN
 * coordinate rather than the correlated one. An entrance node is a better
 * answer than a snap to the nearest sidewalk segment.
 */
async function resolveAnchor(candidate) {
  const entrance = null; // No entrance nodes exist on Richmond outlines. See data/osm/README.md.

  let source = "snap";
  let from = candidate.seed;
  if (entrance !== null) {
    source = "entrance";
    from = entrance;
  } else {
    let nearest = null;
    let best = GATE_RADIUS_M;
    for (const gate of gates) {
      const apart = metersBetween(candidate.seed, gate);
      if (apart < best) {
        best = apart;
        nearest = gate;
      }
    }
    if (nearest !== null && !candidate.isNode) {
      source = "gate";
      from = nearest;
    }
  }

  const answer = await locate(from);
  if (answer === null) return null;
  if (answer.outboundReach < MIN_OUTBOUND_REACH) return null;

  // Rungs 1 and 2 keep their own coordinate; rung 3 takes the correlated one.
  const point = source === "snap" ? { lat: answer.point.latitude, lng: answer.point.longitude } : from;

  const moved = metersBetween(candidate.seed, point);
  const ceiling = candidate.isNode ? MAX_MOVE_NODE_M : MAX_MOVE_AREA_M;
  if (moved > ceiling) return null;

  return {
    point,
    source,
    distanceMeters: Number(moved.toFixed(1)),
    edgeUse: answer.use,
    outboundReach: answer.outboundReach,
  };
}

async function main() {
  const raw = [...destinations, ...detours];
  console.log(`${raw.length} harvested elements, ${gates.length} gate nodes`);

  const rejected = [];
  const staged = [];
  const taken = new Set(PLACES.map((place) => place.id));
  let located = 0;

  for (const item of raw) {
    const candidate = element(item);
    if (!Number.isFinite(candidate.seed.lat) || !Number.isFinite(candidate.seed.lng)) {
      rejected.push({ osm: candidate.osm, name: candidate.tags.get("name") ?? "", reason: "out-of-bounds" });
      continue;
    }

    const verdict = classify(candidate);
    if (!verdict.ok) {
      rejected.push({ osm: candidate.osm, name: candidate.tags.get("name") ?? "", reason: verdict.reason });
      continue;
    }

    const name = placeName(candidate);
    if (name === null) {
      rejected.push({ osm: candidate.osm, name: candidate.tags.get("name") ?? "", reason: "unnamed" });
      continue;
    }

    const anchor = await resolveAnchor(candidate);
    located += 1;
    if (located % 25 === 0) process.stdout.write(`  located ${located}...\r`);
    if (anchor === null) {
      // A point nobody can stand on is worse than a missing row.
      rejected.push({ osm: candidate.osm, name, reason: "no-anchor" });
      continue;
    }

    staged.push({
      name,
      osm: candidate.osm,
      seed: candidate.seed,
      anchor,
      classification: verdict.classification,
    });
  }
  process.stdout.write("\n");

  // Highest score first, so dedup keeps the better of any pair and the cap
  // takes the best rather than the earliest.
  staged.sort((a, b) => b.classification.score - a.classification.score);

  const accepted = [];
  const kept = PLACES.map((place) => ({ lat: place.lat, lng: place.lng }));

  /**
   * Names already spoken for, normalised.
   *
   * Distance dedup alone is not enough, and the first run proved it: the Canal
   * Walk is tagged as several separate ways more than 90 m apart, so it came
   * through twice as a detour on top of the hand-curated `canal-walk` - three
   * rows, one place, three different coordinates. `placeId` would have papered
   * over it with `canal-walk-2`, which is a duplicate wearing a suffix.
   */
  const spokenFor = new Set(PLACES.map((place) => normalise(place.name)));

  for (const row of staged) {
    const tooClose = kept.some((other) => metersBetween(row.anchor.point, other) < DEDUP_METERS);
    if (tooClose) {
      rejected.push({ osm: row.osm, name: row.name, reason: "duplicate" });
      continue;
    }
    const key = normalise(row.name);
    if (spokenFor.has(key)) {
      rejected.push({ osm: row.osm, name: row.name, reason: "duplicate-name" });
      continue;
    }
    spokenFor.add(key);
    kept.push(row.anchor.point);
    accepted.push(row);
  }

  // The budget is read, not assumed: apply is append-only and re-runnable, so a
  // second run's room is MAX_PLACES minus whatever the file holds NOW.
  const room = MAX_PLACES - PLACES.length;

  // Interleaved so neither tier eats the whole budget - 165 plaques would.
  const dest = accepted.filter((row) => row.classification.detour === null);
  const det = accepted.filter((row) => row.classification.detour !== null);
  const capped = [];
  for (let i = 0; capped.length < room && (i < dest.length || i < det.length); i += 1) {
    if (i < dest.length && capped.length < room) capped.push(dest[i]);
    if (i < det.length && capped.length < room) capped.push(det[i]);
  }
  const overflow = accepted.length - capped.length;

  const rows = capped.map((row) => ({
    id: placeId(row, row.name, taken),
    name: row.name,
    lat: Number(row.anchor.point.lat.toFixed(6)),
    lng: Number(row.anchor.point.lng.toFixed(6)),
    tags: row.classification.tags,
    detour: row.classification.detour,
    osm: row.osm,
    anchorSource: row.anchor.source,
    anchorDistanceMeters: row.anchor.distanceMeters,
    edgeUse: row.anchor.edgeUse,
    outboundReach: row.anchor.outboundReach,
    score: row.classification.score,
    seed: { lat: Number(row.seed.lat.toFixed(6)), lng: Number(row.seed.lng.toFixed(6)) },
  }));
  for (const row of rows) taken.add(row.id);

  await mkdir(OUT, { recursive: true });
  await writeFile(
    new URL("places.json", OUT),
    `${JSON.stringify(
      {
        version: 1,
        generatedAt: new Date().toISOString(),
        harvestedAt: manifest.harvestedAt,
        accepted: rows,
        rejected,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(new URL("review.html", OUT), reviewPage(rows, rejected), "utf8");

  const byReason = new Map();
  for (const row of rejected) byReason.set(row.reason, (byReason.get(row.reason) ?? 0) + 1);
  const bySource = new Map();
  for (const row of rows) bySource.set(row.anchorSource, (bySource.get(row.anchorSource) ?? 0) + 1);

  console.log(`\nproposed ${rows.length} (room for ${room})`);
  console.log(`  destinations ${rows.filter((r) => r.detour === null).length}, detours ${rows.filter((r) => r.detour !== null).length}`);
  console.log(`  anchors: ${[...bySource].map(([k, v]) => `${k} ${v}`).join(", ")}`);
  if (overflow > 0) {
    // Never a silent truncation: a capped list that says nothing reads as
    // "this is everything Richmond has".
    console.log(`  CAPPED: ${overflow} accepted rows did not fit under MAX_PLACES=${MAX_PLACES}`);
  }
  console.log(`rejected ${rejected.length}`);
  for (const [reason, count] of [...byReason].toSorted((a, b) => b[1] - a[1])) {
    console.log(`  ${reason}: ${count}`);
  }
  console.log("\nreview: data/proposals/review.html");
  console.log("then write ids into data/proposals/accepted.txt and run npm run apply:places");
}

const escape = (text) =>
  String(text).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);

/**
 * One self-contained file: no CDN, no fetch, no build step. It opens from disk
 * with the network off, which is the only way a review page is still there in a
 * year.
 */
function reviewPage(rows, rejected) {
  const body = rows
    .map(
      (row, index) => `<tr data-id="${escape(row.id)}" class="${row.anchorSource === "snap" ? "snap" : ""}">
  <td class="n">${index + 1}</td>
  <td><input type="checkbox" data-check></td>
  <td class="name">${escape(row.name)}</td>
  <td>${row.detour === null ? '<span class="tier dest">place</span>' : `<span class="tier det">${escape(row.detour)}</span>`}</td>
  <td class="vibes">${row.tags.map((tag) => `<span>${escape(tag)}</span>`).join("")}</td>
  <td class="num">${row.score}</td>
  <td class="anchor">${escape(row.anchorSource)}</td>
  <td class="num">${row.anchorDistanceMeters} m</td>
  <td>${escape(row.edgeUse)}</td>
  <td class="num">${row.outboundReach}</td>
  <td><a href="https://www.openstreetmap.org/${escape(row.osm)}" target="_blank" rel="noreferrer">osm</a>
      <a href="https://www.openstreetmap.org/?mlat=${row.lat}&amp;mlon=${row.lng}#map=18/${row.lat}/${row.lng}" target="_blank" rel="noreferrer">map</a></td>
</tr>`,
    )
    .join("\n");

  const reasons = new Map();
  for (const row of rejected) reasons.set(row.reason, (reasons.get(row.reason) ?? 0) + 1);
  const rejectedRows = [...reasons]
    .toSorted((a, b) => b[1] - a[1])
    .map(([reason, count]) => `<tr><td>${escape(reason)}</td><td class="num">${count}</td></tr>`)
    .join("\n");

  return `<!doctype html>
<meta charset="utf-8">
<title>Place proposals</title>
<style>
  :root { color-scheme: dark; }
  body { background:#0b1014; color:#dfe6ec; font:14px/1.45 system-ui, sans-serif; margin:0; padding:24px; }
  h1 { font-size:18px; margin:0 0 4px; }
  p.lede { color:#8fa0ae; margin:0 0 20px; }
  table { border-collapse:collapse; width:100%; }
  th, td { text-align:left; padding:5px 8px; border-bottom:1px solid #1b242c; vertical-align:top; }
  th { color:#8fa0ae; font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:.08em; }
  tr.snap { background:rgba(255,176,67,.07); }
  tr.here { outline:2px solid #ffb043; }
  td.n, td.num { color:#8fa0ae; font-variant-numeric:tabular-nums; text-align:right; }
  td.name { font-weight:600; }
  .tier { font-size:11px; padding:1px 6px; border-radius:9px; }
  .tier.dest { background:#1b242c; color:#8fa0ae; }
  .tier.det { background:rgba(255,176,67,.18); color:#ffd7a0; }
  .vibes span { font-size:11px; color:#8fa0ae; margin-right:5px; }
  a { color:#ffb043; }
  .bar { position:sticky; top:0; background:#0b1014; padding:10px 0; border-bottom:1px solid #1b242c; margin-bottom:12px; }
  kbd { background:#1b242c; border-radius:3px; padding:1px 5px; font:12px ui-monospace, monospace; }
  #count { color:#ffb043; font-weight:600; }
  .side { display:flex; gap:32px; align-items:flex-start; }
  .rejected { min-width:220px; }
</style>
<div class="bar">
  <strong>Place proposals</strong> &mdash; <span id="count">0</span> accepted of ${rows.length}
  &nbsp; <kbd>j</kbd>/<kbd>k</kbd> move &nbsp; <kbd>a</kbd> toggle &nbsp; <kbd>c</kbd> copy ids
</div>
<p class="lede">
  Amber rows were anchored by <strong>snap</strong> rather than by a gate node. A snapped anchor can be
  technically walkable and socially wrong &mdash; a park anchored to a service road behind a maintenance
  yard passes every automated gate. Look at those on the map before accepting them.
</p>
<div class="side">
<table>
  <thead><tr>
    <th></th><th></th><th>Name</th><th>Tier</th><th>Vibes</th><th>Score</th>
    <th>Anchor</th><th>Moved</th><th>Edge</th><th>Reach</th><th>Links</th>
  </tr></thead>
  <tbody id="rows">
${body}
  </tbody>
</table>
<div class="rejected">
  <table>
    <thead><tr><th>Rejected</th><th class="num">${rejected.length}</th></tr></thead>
    <tbody>${rejectedRows}</tbody>
  </table>
</div>
</div>
<script>
  const rows = [...document.querySelectorAll("#rows tr")];
  let at = 0;
  const paint = () => {
    rows.forEach((row, index) => row.classList.toggle("here", index === at));
    rows[at]?.scrollIntoView({ block: "nearest" });
    document.getElementById("count").textContent =
      String(rows.filter((row) => row.querySelector("[data-check]").checked).length);
  };
  document.addEventListener("keydown", (event) => {
    if (event.key === "j") at = Math.min(rows.length - 1, at + 1);
    else if (event.key === "k") at = Math.max(0, at - 1);
    else if (event.key === "a") {
      const box = rows[at]?.querySelector("[data-check]");
      if (box) box.checked = !box.checked;
    } else if (event.key === "c") {
      const ids = rows
        .filter((row) => row.querySelector("[data-check]").checked)
        .map((row) => row.dataset.id)
        .join("\\n");
      navigator.clipboard.writeText(ids);
      document.getElementById("count").textContent += " (copied)";
      return;
    } else return;
    event.preventDefault();
    paint();
  });
  document.addEventListener("change", paint);
  paint();
</script>
`;
}

await main();
