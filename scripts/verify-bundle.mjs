// The byte budget, measured rather than estimated.
//
//   node scripts/verify-bundle.mjs [--json] [--record] [--label "chunk 3"]
//
// Sums the gzipped size of the app's own JavaScript in dist/, excluding the
// MapLibre chunk, and compares it against scripts/bundle-budget.json. MapLibre
// is excluded because it is a fixed 284 KB the plan never proposes to move; the
// number under scrutiny is the code v0.5 actually writes.
//
// The plan spends bytes in nearly every chunk and every per-chunk figure in
// docs/plans/README.md section 5 is an estimate. This is how an estimate becomes
// a fact: --record writes the new measurement into the budget file as part of
// that chunk's commit, so the table can be corrected from measurements at the
// end rather than from memory.
//
// Reads dist/ as it stands. Run `npm run build` first; the gate script does.
import { readFile, readdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const record = args.includes("--record");
const labelIndex = args.indexOf("--label");
const label = labelIndex === -1 ? null : (args[labelIndex + 1] ?? null);

const BUDGET_PATH = new URL("./bundle-budget.json", import.meta.url);
const ASSETS = new URL("../dist/assets/", import.meta.url);

/**
 * Chunks that are somebody else's bytes.
 *
 * Matched against the chunk name Vite writes before its content hash, which is
 * the key in vite.config.ts's manualChunks. A renamed chunk shows up here as a
 * sudden jump in the measured total rather than as a silent exclusion, which is
 * the failure direction to prefer.
 */
const VENDOR_CHUNKS = new Set(["maplibre"]);

const chunkName = (file) => file.replace(/-[A-Za-z0-9_-]{8,}\.js$/, "");

async function measure() {
  let files;
  try {
    files = await readdir(ASSETS);
  } catch {
    return null;
  }
  const js = files.filter((file) => file.endsWith(".js"));
  const entries = [];
  for (const file of js) {
    const raw = await readFile(new URL(file, ASSETS));
    entries.push({
      file,
      chunk: chunkName(file),
      raw: raw.byteLength,
      gzip: gzipSync(raw, { level: 9 }).byteLength,
    });
  }
  entries.sort((a, b) => b.gzip - a.gzip);
  return entries;
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const signed = (bytes) => `${bytes >= 0 ? "+" : "-"}${kb(Math.abs(bytes))}`;

const budget = JSON.parse(await readFile(BUDGET_PATH, "utf8"));
const entries = await measure();

if (entries === null || entries.length === 0) {
  const problem = "dist/assets holds no JavaScript - run `npm run build` first";
  if (asJson) console.log(JSON.stringify({ ok: false, problem }, null, 2));
  else console.error(`verify-bundle: ${problem}`);
  process.exit(1);
}

const app = entries.filter((entry) => !VENDOR_CHUNKS.has(entry.chunk));
const vendor = entries.filter((entry) => VENDOR_CHUNKS.has(entry.chunk));
const total = app.reduce((sum, entry) => sum + entry.gzip, 0);
const delta = total - budget.actual;
const ok = total <= budget.ceiling;

if (record) {
  const next = {
    ...budget,
    actual: total,
    history: [...budget.history, { label: label ?? "unlabelled", bytes: total }],
  };
  await writeFile(BUDGET_PATH, `${JSON.stringify(next, null, 2)}\n`);
}

if (asJson) {
  console.log(
    JSON.stringify(
      { ok, total, ceiling: budget.ceiling, previous: budget.actual, delta, app, vendor, recorded: record },
      null,
      2,
    ),
  );
} else {
  for (const entry of app) console.log(`  ${entry.file}  ${kb(entry.gzip)} gz`);
  for (const entry of vendor) console.log(`  ${entry.file}  ${kb(entry.gzip)} gz  (excluded)`);
  console.log(`app JS: ${kb(total)} gz  (${signed(delta)} since ${kb(budget.actual)})`);
  console.log(`ceiling: ${kb(budget.ceiling)}  headroom: ${kb(budget.ceiling - total)}`);
  if (record) console.log(`recorded as "${label ?? "unlabelled"}"`);
  if (!ok) console.error(`verify-bundle: over the ceiling by ${kb(total - budget.ceiling)}`);
}

process.exit(ok ? 0 : 1);
