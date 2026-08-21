// Bake OpenStreetMap opening hours into a static weekly mask per place.
//
//   npm run build:hours
//
// Reads data/osm/hours.json - committed by `npm run harvest:hours` - and never
// the network. Writes src/data/hours.ts.
//
// **`opening_hours` is a devDependency and must stay one.** It is 108 KB
// minified and gzipped, more than this app's whole JS budget for one feature,
// and LGPL-3.0-only, which is a live obligation for a bundled client library
// and a non-question for a build tool that emits data. The parser runs here,
// once; the runtime does one array index and one bit test.
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "vite";
import opening_hours from "opening_hours";

const OSM = new URL("../data/osm/", import.meta.url);
const OUT = new URL("../src/data/hours.ts", import.meta.url);

const ACCEPT_WARNINGS = process.argv.includes("--accept-warnings");

/**
 * Richmond's public-park hours, from the city's own rules.
 *
 * **This is the one constant the whole park assumption turns on**, and it is
 * not the placeholder the spec carried. The City of Richmond Parks and
 * Recreation Rules and Regulations, developed under section 58-1 of the Code of
 * Ordinances, state: "The parks are open to the public from 5:00 a.m. until
 * dusk and in areas in which lighting is provided the area is open until 11:00
 * p.m."
 *
 * So the open edge is a **fixed clock time**, not sunrise - the spec assumed
 * `sunrise-30` and that is simply wrong for Richmond - and only the close edge
 * is solar. The lighted-areas exception is deliberately not modelled: nothing
 * in OSM says which areas are lit, and assuming a park is lit is the kind of
 * guess that sends somebody to a dark field at 10 pm.
 *
 * Dusk means civil dusk, which is the same threshold `daylight-budget` clamps
 * the dial to, so the two features cannot disagree about when the light goes.
 *
 * See docs/plans/HUMAN-REVIEW.md 2.7 for the sourcing and what reverses it.
 */
// The rule itself lives in src/lib/hours.ts as `PARK_RULE`, because the table
// now emits the category rather than ninety-three copies of the same object.
// This comment stays here so the sourcing is beside the code that decides which
// places get it.

/** Every day. Bit 0 = Monday. */
const ALL_DAYS = 0b1111111;

const SLOTS_PER_DAY = 48;
const SLOTS = 7 * SLOTS_PER_DAY;

/**
 * Values that are a schedule against the sun, and nothing else.
 *
 * Strict on purpose: anything that contains a solar token and does not match
 * becomes `unknown` with a log line, because a half-parsed rule is worse than
 * an absent one.
 *
 * **The parentheses on an offset are mandatory and are the whole point.** The
 * opening_hours specification defines a variable time as either a bare event or
 * `( <event> <plus_or_minus> <hour_minutes> )`; a bare `sunrise+01:00` is not
 * valid syntax. A real value looks like `Mo-Su (sunrise+01:00)-(sunset-00:30)`.
 */
const SOLAR_EVENT = "sunrise|sunset|dawn|dusk";
const SOLAR_TIME = "(?:" + SOLAR_EVENT + ")|\\((?:" + SOLAR_EVENT + ")[+-]\\d{2}:\\d{2}\\)";
const SOLAR_VALUE = new RegExp(
  "^(?:([A-Za-z,\\- ]+?) )?(" + SOLAR_TIME + ")-(" + SOLAR_TIME + ")$",
);
const HAS_SOLAR = new RegExp(SOLAR_EVENT);
const BARE_EVENT = new RegExp("^(" + SOLAR_EVENT + ")$");
const OFFSET_EVENT = new RegExp("^\\((" + SOLAR_EVENT + ")([+-])(\\d{2}):(\\d{2})\\)$");

const WEEKDAY_BITS = { Mo: 0, Tu: 1, We: 2, Th: 3, Fr: 4, Sa: 5, Su: 6 };

/** `Mo-Fr`, `Sa,Su`, `Mo-We,Fr` or absent (meaning every day) into a bitmask. */
function daysOf(selector) {
  if (selector === undefined || selector.trim().length === 0) return ALL_DAYS;
  let mask = 0;
  for (const part of selector.split(",")) {
    const range = part.trim().split("-");
    const from = WEEKDAY_BITS[range[0]];
    if (from === undefined) return null;
    if (range.length === 1) {
      mask |= 1 << from;
      continue;
    }
    const to = WEEKDAY_BITS[range[1]];
    if (to === undefined) return null;
    for (let day = from; ; day = (day + 1) % 7) {
      mask |= 1 << day;
      if (day === to) break;
    }
  }
  return mask;
}

/** One `sunrise`, `dusk` or `(sunset-00:30)` into an edge. */
function edgeOf(token) {
  const bare = token.match(BARE_EVENT);
  if (bare !== null) return { ref: bare[1], offsetMinutes: 0 };
  const offset = token.match(OFFSET_EVENT);
  if (offset === null) return null;
  const minutes = Number(offset[3]) * 60 + Number(offset[4]);
  return { ref: offset[1], offsetMinutes: offset[2] === "-" ? -minutes : minutes };
}

/**
 * A `SolarRule` for a value that is purely solar, or null.
 *
 * Baking one instead produces roughly a segment per week - dozens for one
 * place, more bytes than every fixed schedule in the table combined - and it
 * rots annually. The first run of this baker did exactly that: 72 segments for
 * Battery Park's `sunrise-sunset`, which is what caught the missing branch.
 */
function solarRuleOf(value) {
  const match = value.trim().match(SOLAR_VALUE);
  if (match === null) return null;
  const days = daysOf(match[1]);
  const open = edgeOf(match[2]);
  const close = edgeOf(match[3]);
  if (days === null || open === null || close === null) return null;
  return { days, open, close };
}

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom",
  cacheDir: "node_modules/.vite-build-hours",
  optimizeDeps: { noDiscovery: true, include: [] },
});
let PLACES;
try {
  PLACES = (await vite.ssrLoadModule("/src/data/places.ts")).PLACES;
} finally {
  await vite.close();
}

let harvest;
try {
  harvest = JSON.parse(await readFile(new URL("hours.json", OSM), "utf8"));
} catch {
  // A missing input is a build error rather than a reason to publish an empty
  // table: an empty table means every destination reads `unknown`, which is a
  // silent, plausible-looking regression.
  console.error("build-hours: data/osm/hours.json is missing. Run npm run harvest:hours first.");
  process.exit(1);
}

const tagsByOsm = new Map(
  harvest.elements.map((element) => [element.type + "/" + element.id, element.tags ?? {}]),
);

/**
 * The window, pinned to calendar boundaries - 1 January of this year through
 * 31 December of next.
 *
 * **Never "today".** A window that starts today makes every first segment's
 * `from` move with the bake date, so two bakes on different days differ in
 * every entry and "running it twice produces the same file" stops being
 * testable. The extra past weeks cost nothing: they collapse into the first
 * segment for any fixed schedule.
 */
const thisYear = new Date().getFullYear();
const COVERS_FROM = thisYear + "-01-01";
const COVERS_THROUGH = thisYear + 1 + "-12-31";

const pad = (n) => String(n).padStart(2, "0");
const ymd = (date) =>
  date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());

/**
 * Bake one value into segments.
 *
 * **Wall-clock arithmetic only.** `new Date(y, m, d + offset, hour, minute)`,
 * never `+ n * 86400000`: epoch arithmetic splits every fixed schedule into
 * spurious segments at the DST boundaries, because the same wall time sits at a
 * different offset either side. The second assertion below keeps that true.
 *
 * Two DST weeks a year have no honest answer and neither is worth a second
 * dimension on the mask. In March, 02:00 and 02:30 do not occur; `new Date`
 * resolves them to 03:00 and those two bits hold 03:00's answer - unreadable,
 * because `Intl` never reports 02:xx that day, so `hoursClock` cannot produce
 * those slots. In November, 01:00-01:59 happens twice and the mask holds one
 * bit, written from the first (EDT) pass. One hour a year a verdict can be an
 * hour stale, in an app about walking to a park.
 */
function bake(oh) {
  const segments = [];
  const start = new Date(thisYear, 0, 1);
  // Rewind to the Monday on or before, so slot 0 is always a Monday midnight.
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const endMs = new Date(thisYear + 1, 11, 31).getTime();

  let last = null;
  for (let week = new Date(start); week.getTime() <= endMs; week.setDate(week.getDate() + 7)) {
    const bytes = new Uint8Array(42);
    for (let slot = 0; slot < SLOTS; slot += 1) {
      const dayOffset = Math.floor(slot / SLOTS_PER_DAY);
      const withinDay = slot % SLOTS_PER_DAY;
      const at = new Date(
        week.getFullYear(),
        week.getMonth(),
        week.getDate() + dayOffset,
        Math.floor(withinDay / 2),
        (withinDay % 2) * 30,
      );
      if (oh.getState(at) && !oh.getUnknown(at)) {
        bytes[slot >> 3] |= 1 << (7 - (slot & 7));
      }
    }
    const mask = Buffer.from(bytes).toString("base64");
    if (mask !== last) {
      segments.push({ from: ymd(week), mask });
      last = mask;
    }
  }
  return segments;
}

const nominatim = (place) => ({
  // STRINGS, deliberately. Research reported that numeric lat/lon make
  // sunrise/sunset silently resolve to a flat 06:00-18:00 with no warning.
  // The first assertion below is what actually verifies that, either way.
  lat: String(place.lat),
  lon: String(place.lng),
  address: { country_code: "us", state: "Virginia" },
});

// --- the two mandatory build-time assertions -------------------------------

const battery = PLACES.find((place) => place.id === "battery") ?? PLACES[0];
{
  const oh = new opening_hours("sunrise-sunset", nominatim(battery), { mode: 0 });
  const june = new Date(2026, 5, 15);
  let open = 0;
  for (let minutes = 0; minutes < 1440; minutes += 30) {
    const at = new Date(
      june.getFullYear(),
      june.getMonth(),
      june.getDate(),
      Math.floor(minutes / 60),
      minutes % 60,
    );
    if (oh.getState(at)) open += 1;
  }
  // 06:00-18:00 is exactly 24 half-hour slots. Richmond's June day is ~14h45.
  if (open === 24) {
    console.error(
      "build-hours: the solar sanity check failed - 'sunrise-sunset' resolved to a flat\n" +
        "06:00-18:00, which is the numeric-lat/lon fallback. Nothing written.",
    );
    process.exit(1);
  }
  console.log("solar sanity: sunrise-sunset is " + open / 2 + " h on 2026-06-15, not a flat 12 h");
}
{
  const oh = new opening_hours("Tu-Su 10:00-17:00", nominatim(battery), { mode: 0 });
  const segments = bake(oh);
  if (segments.length !== 1) {
    console.error(
      "build-hours: a fixed schedule baked into " + segments.length + " segments, not 1.\n" +
        "That is epoch arithmetic creeping back in at the DST boundaries. Nothing written.",
    );
    process.exit(1);
  }
  console.log("dst sanity: a fixed schedule is one segment across the window");
}

// --- the real bake ---------------------------------------------------------

const entries = [];
const parks = [];
const dropped = [];
let fromOsm = 0;
let fromCategory = 0;
let solarValues = 0;

for (const place of PLACES) {
  const tags = place.osm === undefined ? undefined : tagsByOsm.get(place.osm);
  const value = tags === undefined ? undefined : tags.opening_hours;

  if (value !== undefined) {
    const checkedAt =
      tags["check_date:opening_hours"] ?? tags["check_date"] ?? tags["survey:date"];

    // Solar first: a value that is purely a rule against the sun must never
    // reach the mask baker.
    const solar = solarRuleOf(value);
    if (solar !== null) {
      const entry = { id: place.id, source: "osm", solar };
      if (checkedAt !== undefined) entry.checkedAt = checkedAt;
      entries.push(entry);
      fromOsm += 1;
      solarValues += 1;
      continue;
    }
    if (HAS_SOLAR.test(value)) {
      // Contains a solar token but is not purely one. Honest and loud beats a
      // half-parsed rule: no schedule, a log line, `unknown` in the app.
      dropped.push({ id: place.id, value, why: "mixes solar and clock times - not baked" });
      continue;
    }

    let oh;
    try {
      oh = new opening_hours(value, nominatim(place), { mode: 0 });
    } catch (cause) {
      dropped.push({ id: place.id, value, why: String(cause).slice(0, 120) });
      continue;
    }

    const warnings = oh.getWarnings();
    if (warnings.length > 0 && !ACCEPT_WARNINGS) {
      // The gate that stops a typo like `Su 01:00-16:00` - a museum open at one
      // in the morning - from shipping as fact. A dropped entry is a build
      // warning, never a build failure: one bad OSM value must not block a
      // release.
      dropped.push({ id: place.id, value, why: warnings.join("; ").slice(0, 140) });
      continue;
    }

    // A comment on an unknown-state rule - "weather permitting" - downgrades an
    // open verdict at runtime, so it has to travel with the entry.
    const probe = new Date(thisYear, 6, 15, 12, 0);
    const comment = oh.getUnknown(probe) ? oh.getComment(probe) : null;

    const entry = { id: place.id, source: "osm", segments: bake(oh) };
    // A string with something in it, or nothing. `getComment` answers null,
    // undefined or a string depending on the rule, so the check is on the value
    // rather than on how it is stored.
    if (comment !== null && comment !== undefined && String(comment).length > 0) {
      entry.comment = String(comment);
    }
    if (checkedAt !== undefined) entry.checkedAt = checkedAt;
    entries.push(entry);
    fromOsm += 1;
    continue;
  }

  // The one category fallback, and only for a public park. Everything else -
  // museums, markets, cemeteries, viewpoints, memorials, plazas - stays
  // `unknown` unless OSM says otherwise, because "most museums are open in the
  // afternoon" is a guess and this app does not make those.
  const isPark =
    tags !== undefined
      ? tags.leisure === "park" || tags.leisure === "garden" || tags.leisure === "nature_reserve"
      : place.tags.includes("park") && !place.tags.includes("museum");
  if (isPark) {
    // The category alone. All 93 park entries carried an identical `solar`
    // object before this - the same five numbers written out ninety-three times,
    // which is both wasteful and a lie about where the rule lives. The runtime
    // holds ONE `PARK_RULE` keyed by this string, which is also what makes
    // "the park default lives in one constant" true rather than aspirational.
    // Just the id. Ninety-three entries of `{id, source, category}` were 93
    // copies of the same two constant fields; a list of ids says the same thing
    // and the runtime supplies the rest.
    parks.push(place.id);
    fromCategory += 1;
  }
}

entries.sort((a, b) => a.id.localeCompare(b.id));
parks.sort();

const header = `// GENERATED by scripts/build-hours.mjs. Do not edit by hand.
//
// One weekly opening mask per place: 7 days x 48 half-hours = 336 bits = 42
// bytes = 56 base64 characters, Monday 00:00 first, a set bit meaning open. A
// schedule is a list of [from, mask] segments, each valid until the next one
// begins, so a fixed schedule collapses to one and a seasonal place costs one
// per season boundary.
//
// Sunrise/sunset schedules are NOT baked - they would cost about a segment per
// week and rot annually. They ride as a SolarRule and resolve at runtime
// against the solar module daylight-budget already ships.
//
// Coverage: ${entries.length + parks.length} of ${PLACES.length} places, ${fromOsm} from OSM, ${fromCategory} from the park fallback.
// Map data (c) OpenStreetMap contributors, ODbL.
`;

const body = `${header}
/** Where a schedule came from. Rendered, not just recorded. */
export type HoursSource = "osm" | "category";

/** Bit 0 = Monday ... bit 6 = Sunday. Matches the mask's day order. */
export type DayMask = number;

/**
 * One edge of a solar rule. \`clock\` carries minutes since local midnight;
 * every other ref carries an offset in minutes from that event.
 *
 * Richmond's park ordinance needs both kinds in one rule - open at 5 am, close
 * at dusk - which is why this is a union rather than a bare solar reference.
 */
export type HoursEdge = {
  ref: "sunrise" | "sunset" | "dawn" | "dusk" | "clock";
  offsetMinutes: number;
};

export type SolarRule = {
  days: DayMask;
  open: HoursEdge;
  close: HoursEdge;
};

/** A weekly mask valid from \`from\` until the next segment's \`from\`. */
export type HoursSegment = {
  /** Richmond-local calendar date, "YYYY-MM-DD". */
  from: string;
  mask: string;
};

export type HoursEntry = {
  /** Place id, matching \`Place.id\` in src/data/places.ts. */
  id: string;
  source: HoursSource;
  /** Set when source is "category": which rule spoke. */
  category?: string;
  // The OSM element id and the raw \`opening_hours\` value are deliberately NOT
  // here. Both are provenance rather than data: the element id is already on
  // \`Place.osm\` and the raw value is in the committed \`data/osm/hours.json\`, so
  // shipping either to every visitor buys auditability that two files in the
  // repo already provide. Measured at 1.4 KB gzipped for the pair.
  segments?: HoursSegment[];
  solar?: SolarRule;
  /** A quoted comment on an unknown-state rule, e.g. "weather permitting". */
  comment?: string;
  /** check_date:opening_hours / check_date / survey:date. */
  checkedAt?: string;
};

export type HoursTable = {
  version: number;
  bakedAt: string;
  /** Richmond-local dates. Outside this window every verdict is unknown. */
  coversFrom: string;
  coversThrough: string;
  timeZone: "America/New_York";
  slotMinutes: 30;
  entries: readonly HoursEntry[];
  /**
   * Places the public-park fallback speaks for, by id.
   *
   * A list rather than 93 entries carrying identical \`source\` and \`category\`
   * fields. \`src/lib/hours.ts\` holds the one rule they all stand for.
   */
  parks: readonly string[];
};

export const HOURS: HoursTable = {
  version: 1,
  bakedAt: ${JSON.stringify(new Date().toISOString())},
  coversFrom: ${JSON.stringify(COVERS_FROM)},
  coversThrough: ${JSON.stringify(COVERS_THROUGH)},
  timeZone: "America/New_York",
  slotMinutes: 30,
  entries: [
${entries.map((entry) => "    " + JSON.stringify(entry) + ",").join("\n")}
  ],
  parks: ${JSON.stringify(parks)},
};
`;

await writeFile(OUT, body, "utf8");

console.log("\ncoverage: " + (entries.length + parks.length) + " of " + PLACES.length + " places");
console.log(
  "  from OSM:            " + fromOsm +
    " (" + solarValues + " solar rules, " + (fromOsm - solarValues) + " masks)",
);
console.log("  from park fallback:  " + fromCategory);
console.log("  dropped:             " + dropped.length);
for (const drop of dropped) {
  console.log('    ' + drop.id + ': "' + drop.value + '"');
  console.log("        -> " + drop.why);
}
console.log("\nwindow: " + COVERS_FROM + " to " + COVERS_THROUGH);
