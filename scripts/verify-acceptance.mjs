// The per-chunk checklists, assembled from the plan and then ticked by hand.
//
//   node scripts/verify-acceptance.mjs --init 4     # write docs/plans/acceptance/chunk-04.md
//   node scripts/verify-acceptance.mjs --chunk 4    # the gate: fails on any unticked box
//   node scripts/verify-acceptance.mjs              # a report on every chunk, exits 0
//
// Each chunk file is assembled from three sources, in this order, so that the
// plan stays the single copy of every check:
//
//   1. GOAL.md's universal checklist  - every chunk, no exceptions
//   2. GOAL.md's chunk-specific list  - the boxes only this chunk has
//   3. the owning spec's numbered acceptance criteria, as binary checks
//
// --init never overwrites: a file that exists holds ticks somebody earned, and
// re-extracting it would erase them silently. Ticking is manual and honest. A
// criterion that says "observable in the browser" gets ticked by someone who
// observed it, and the note beside it says how.
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const readArg = (flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? null : (args[index + 1] ?? null);
};

const PLANS = new URL("../docs/plans/", import.meta.url);
const ACCEPTANCE = new URL("./acceptance/", PLANS);

/**
 * Which spec owns each chunk's numbered acceptance criteria.
 *
 * Chunk 0 has no spec of its own - it is pulled out of five of them, and its
 * checks live in GOAL.md's chunk-specific list. Chunk 1 has none either, for a
 * different reason: it is the data half of `elevation-profile`, whose numbered
 * criteria are all about what the chart renders, and those belong to chunk 3.
 * Listing them under chunk 1 as well would leave boxes that cannot honestly be
 * ticked there, which is how a checklist teaches people to ignore it.
 */
const SPECS = {
  0: [],
  1: [],
  2: ["pool-reasoning"],
  3: ["elevation-profile"],
  4: ["apple-maps"],
  5: ["daylight-budget"],
  6: ["geolocate"],
  7: ["weather-filters"],
  8: ["places-expansion"],
  9: ["opening-hours"],
  10: ["shareable-spins"],
  11: ["multiplayer-links", "meet-in-the-middle"],
};

const TITLES = {
  0: "Foundations",
  1: "Elevation on the wire, and the graph",
  2: "pool-reasoning",
  3: "elevation-profile (the visible half)",
  4: "apple-maps",
  5: "daylight-budget",
  6: "geolocate",
  7: "weather-filters",
  8: "places-expansion",
  9: "opening-hours",
  10: "shareable-spins",
  11: "multiplayer-links + meet-in-the-middle",
};

const fileFor = (chunk) => new URL(`chunk-${String(chunk).padStart(2, "0")}.md`, ACCEPTANCE);

/** Everything between one heading and the next at the same or a shallower level. */
function section(markdown, heading) {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) return null;
  const depth = heading.match(/^#+/)[0].length;
  const out = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const level = lines[index].match(/^(#+)\s/)?.[1].length ?? null;
    if (level !== null && level <= depth) break;
    out.push(lines[index]);
  }
  return out.join("\n").trim();
}

/** GOAL.md's chunk-specific list, found by its bold `**Chunk N — ...**` lead. */
function chunkList(goal, chunk) {
  const all = section(goal, "### Chunk-specific checklists");
  if (all === null) return null;
  const lines = all.split("\n");
  const start = lines.findIndex((line) => new RegExp(`^\\*\\*Chunk ${chunk}\\b`).test(line.trim()));
  if (start === -1) return null;
  const out = [lines[start]];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\*\*Chunk \d/.test(lines[index].trim())) break;
    out.push(lines[index]);
  }
  return out.join("\n").trim();
}

/** A spec's numbered acceptance criteria, one entry per number, folded flat. */
function criteria(spec) {
  const body = section(spec, "## Acceptance criteria");
  if (body === null) return [];
  const items = [];
  for (const line of body.split("\n")) {
    if (/^\d+\.\s/.test(line)) items.push(line.replace(/^\d+\.\s/, "").trim());
    else if (items.length > 0 && line.trim() !== "") items[items.length - 1] += ` ${line.trim()}`;
    else if (line.trim() === "" && items.length > 0) items.push("");
  }
  return items.filter((item) => item !== "");
}

async function assemble(chunk) {
  const goal = await readFile(new URL("GOAL.md", PLANS), "utf8");
  const universal = section(goal, "### The universal checklist — every chunk, no exceptions");
  const specific = chunkList(goal, chunk);

  const parts = [
    `# Chunk ${chunk} — ${TITLES[chunk]}`,
    "",
    "Assembled by `scripts/verify-acceptance.mjs --init`. Tick by hand, and say how each",
    "non-mechanical box was observed. `[x]` pass, `[ ]` not yet run, `[!]` fail. There is no",
    "partial credit: a check that is half true is false, and an unrun check is a fail.",
    "",
    "## Universal",
    "",
    universal ?? "_GOAL.md's universal checklist could not be found._",
    "",
    `## Chunk ${chunk}`,
    "",
    specific ?? "_No chunk-specific list in GOAL.md._",
  ];

  for (const name of SPECS[chunk]) {
    const spec = await readFile(new URL(`${name}.md`, PLANS), "utf8");
    const items = criteria(spec);
    parts.push("", `## \`${name}.md\` acceptance criteria`, "");
    if (items.length === 0) parts.push("_That spec lists no numbered acceptance criteria._");
    else parts.push(...items.map((item, index) => `- [ ] ${index + 1}. ${item}`));
  }

  if (SPECS[chunk].length === 0) {
    parts.push(
      "",
      "## Spec criteria",
      "",
      "_This chunk owns no spec's numbered criteria; see the mapping comment in_",
      "_`scripts/verify-acceptance.mjs`._",
    );
  }

  parts.push("", "## How the non-mechanical boxes were observed", "", "_Fill in as you tick._", "");
  return parts.join("\n");
}

function tally(markdown) {
  const boxes = markdown.match(/^\s*- \[[ x!]\]/gm) ?? [];
  const done = boxes.filter((box) => box.includes("[x]")).length;
  const failed = boxes.filter((box) => box.includes("[!]")).length;
  return { total: boxes.length, done, failed, open: boxes.length - done - failed };
}

async function readIfPresent(url) {
  try {
    return await readFile(url, "utf8");
  } catch {
    return null;
  }
}

const initChunk = readArg("--init");
const gateChunk = readArg("--chunk");

if (initChunk !== null) {
  const chunk = Number(initChunk);
  const target = fileFor(chunk);
  if ((await readIfPresent(target)) !== null) {
    console.error(`verify-acceptance: chunk-${String(chunk).padStart(2, "0")}.md already exists - not overwriting`);
    process.exitCode = 1;
  } else {
    await mkdir(ACCEPTANCE, { recursive: true });
    const body = await assemble(chunk);
    await writeFile(target, body);
    console.log(`wrote docs/plans/acceptance/chunk-${String(chunk).padStart(2, "0")}.md (${tally(body).total} boxes)`);
  }
} else if (gateChunk !== null) {
  const chunk = Number(gateChunk);
  const body = await readIfPresent(fileFor(chunk));
  if (body === null) {
    console.error(`verify-acceptance: chunk ${chunk} has no acceptance file - run --init ${chunk}`);
    process.exitCode = 1;
  } else {
    const counts = tally(body);
    const ok = counts.open === 0 && counts.failed === 0 && counts.total > 0;
    if (asJson) console.log(JSON.stringify({ ok, chunk, ...counts }, null, 2));
    else console.log(`chunk ${chunk}: ${counts.done}/${counts.total} ticked, ${counts.open} open, ${counts.failed} failed`);
    if (!ok) console.error(`verify-acceptance: chunk ${chunk} is not done`);
    process.exitCode = ok ? 0 : 1;
  }
} else {
  let files = [];
  try {
    files = (await readdir(ACCEPTANCE)).filter((file) => file.endsWith(".md")).toSorted();
  } catch {
    // No acceptance directory yet: the report below says so by being empty.
  }
  const rows = [];
  for (const file of files) {
    const body = await readFile(new URL(file, ACCEPTANCE), "utf8");
    rows.push({ file, ...tally(body) });
  }
  if (asJson) {
    console.log(JSON.stringify({ chunks: rows }, null, 2));
  } else if (rows.length === 0) {
    console.log("no acceptance files yet - run --init 0");
  } else {
    for (const row of rows) {
      const state = row.failed > 0 ? "[!]" : row.open === 0 ? "[x]" : "[ ]";
      console.log(`  ${state} ${row.file}  ${row.done}/${row.total} ticked, ${row.open} open, ${row.failed} failed`);
    }
  }
}
