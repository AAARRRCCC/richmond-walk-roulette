/**
 * Is this place open when you would get there?
 *
 * A lookup, never a parser. `opening_hours@3.14.0` is 108 KB minified and
 * gzipped - more than this app's entire JS budget for one feature, and
 * LGPL-3.0-only, which is a live obligation for a bundled library and a
 * non-question for a devDependency that emits data. So the parser runs once at
 * build time and bakes a 336-bit weekly mask per place; the runtime does one
 * array index and one bit test.
 *
 * Everything here except `hoursFor` and `HOURS_COVERAGE` is pure and takes its
 * world as arguments, so `node --test` drives the whole evaluator from
 * hand-written fixtures with no generated file and no solar module in the
 * picture.
 *
 * **`unknown` is a first-class answer and never renders as "open".** Most of
 * the list has no schedule in OpenStreetMap and never will. A feature that
 * filtered on openness alone would silently delete most of the destinations,
 * so `closed` is excluded and `unknown` is always kept.
 */
import { formatClock } from "./format.ts";
import { HOURS, type HoursEntry, type HoursSegment, type SolarRule } from "../data/hours.ts";
import type { SolarEvents } from "./solar.ts";

export type Openness = "open" | "closed" | "unknown";

/**
 * How old a `check_date` may be before the note says so.
 *
 * Three years, because the verdict still stands - stale data is not wrong data,
 * and downgrading a schedule to `unknown` because nobody has re-surveyed it
 * would delete more truth than it protects. The note carries the caveat instead.
 */
export const STALE_YEARS = 3;

/** The mask's resolution. Half an hour is the resolution the source data has. */
export const SLOT_MINUTES = 30;

/** How near a closing time has to be before the note mentions it. */
const CLOSING_SOON_MINUTES = 120;

const MS_PER_SLOT = SLOT_MINUTES * 60_000;

export type HoursVerdict = {
  state: Openness;
  /** Absent when the state is `unknown` for want of any data at all. */
  source?: "osm" | "category";
  /** Set when the source is `category` - the assumption is shown, not hidden. */
  category?: string;
  /**
   * The whole sentence the card renders, already composed. Null means render
   * nothing.
   *
   * Composed here rather than in the component so every string in this feature
   * is asserted by `node --test`, and so there is exactly one place that
   * decides what the reader is told.
   */
  note: string | null;
  /** `check_date` older than `STALE_YEARS`. The verdict stands; the note says so. */
  stale: boolean;
};

/**
 * Richmond wall-clock parts, plus the two things every caller derives from them.
 *
 * Computed **once per pool evaluation and threaded**, never per place:
 * `hoursClock` is an `Intl.DateTimeFormat.formatToParts` call and the pool runs
 * over 242 places on every render by design.
 */
export type HoursClock = {
  year: number;
  month: number;
  day: number;
  /** Minutes since Richmond-local midnight, 0..1439. */
  minutes: number;
  /** 0 = Monday ... 6 = Sunday. Matches the mask's day order. */
  weekdayIndex: number;
  /** "YYYY-MM-DD", Richmond-local. */
  date: string;
  /** 0..335, the mask bit this instant selects. */
  slot: number;
};

/**
 * The window the baked masks are valid for.
 *
 * A **parameter**, never a read of `HOURS`, which is what lets a test prove the
 * out-of-date path against a hand-written window rather than against a
 * generated one that moves every bake.
 */
export type HoursCoverage = { from: string; through: string };

/**
 * One formatter, at module scope. The only `Intl` construction in this feature.
 */
const PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  weekday: "short",
});

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * A UTC instant as Richmond wall-clock parts.
 *
 * Richmond's clock, not the device's: a visitor in Berlin planning a Richmond
 * walk gets Richmond's answer. `Intl` is in the platform, not the bundle.
 *
 * @public - consumed by App and by `hours.test.ts`.
 */
export function hoursClock(atMs: number): HoursClock {
  const parts = PARTS.formatToParts(atMs);
  const find = (type: string): string => parts.find((part) => part.type === type)?.value ?? "";

  const year = Number(find("year"));
  const month = Number(find("month"));
  const day = Number(find("day"));
  // `hour12: false` can report hour 24 for midnight on some engines, which is
  // the same instant as hour 0 and must not become slot 48.
  const hour = Number(find("hour")) % 24;
  const minute = Number(find("minute"));
  const weekdayIndex = Math.max(0, WEEKDAYS.indexOf(find("weekday")));
  const minutes = hour * 60 + minute;

  return {
    year,
    month,
    day,
    minutes,
    weekdayIndex,
    date: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    slot: weekdayIndex * 48 + Math.floor(minutes / SLOT_MINUTES),
  };
}

/**
 * The last segment that had begun by `date`, or null before the first.
 *
 * @public - consumed by `hours.test.ts`.
 */
export function segmentFor(
  segments: readonly HoursSegment[],
  date: string,
): HoursSegment | null {
  let found: HoursSegment | null = null;
  for (const segment of segments) {
    if (segment.from <= date) found = segment;
    else break;
  }
  return found;
}

/**
 * Decoded masks, kept by their own string.
 *
 * The pool asks the same few dozen masks the same question on every render, and
 * `atob` allocates. Keyed on the string because a mask is immutable and shared
 * by every place on the same schedule.
 */
const DECODED = new Map<string, Uint8Array>();

function decode(mask: string): Uint8Array {
  const cached = DECODED.get(mask);
  if (cached !== undefined) return cached;
  const binary = atob(mask);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  DECODED.set(mask, bytes);
  return bytes;
}

/**
 * Is the mask's bit for this slot set?
 *
 * @public - consumed by `hours.test.ts`.
 */
export function bitAt(mask: string, slot: number): boolean {
  if (slot < 0 || slot > 335) return false;
  const bytes = decode(mask);
  const byte = bytes[slot >> 3] ?? 0;
  return (byte & (1 << (7 - (slot & 7)))) !== 0;
}

/**
 * Minutes since local midnight of the first closed slot at or after `slot`,
 * within the same local day, or null if the day never closes inside it.
 *
 * @public - consumed by `hours.test.ts`.
 */
export function nextCloseMinutes(mask: string, slot: number): number | null {
  const dayStart = Math.floor(slot / 48) * 48;
  for (let at = slot; at < dayStart + 48; at += 1) {
    if (!bitAt(mask, at)) return (at - dayStart) * SLOT_MINUTES;
  }
  return null;
}

/**
 * A schedule expressed against the sun, resolved now rather than baked.
 *
 * Baking one produces roughly a segment per week - more bytes for one place
 * than every fixed schedule combined - and it would rot annually. The solar
 * module is in the bundle anyway for `daylight-budget`, so reusing it costs
 * nothing and never goes stale.
 *
 * Three doors lead to `unknown`, and all three are here rather than assumed
 * away: no solar module at all, a null event at this latitude (impossible in
 * Richmond, present because the arithmetic is general), and events for a
 * different local day than the arrival instant - which is a real risk, because
 * an arrival can cross midnight.
 *
 * @public - consumed by `hours.test.ts`.
 */
export function solarOpen(
  rule: SolarRule,
  clock: HoursClock,
  sun: SolarEvents | null,
): Openness {
  if ((rule.days & (1 << clock.weekdayIndex)) === 0) return "closed";
  if (sun === null) return "unknown";
  if (sun.day !== clock.date) return "unknown";

  const edge = (bound: SolarRule["open"]): number | null => {
    if (bound.ref === "clock") return bound.offsetMinutes;
    // Civil dawn and civil dusk are separate events from sunrise and sunset,
    // and the difference is about half an hour at this latitude - which is the
    // difference between a park being open and shut. "dusk" is also the word
    // Richmond's own ordinance uses.
    const atMs =
      bound.ref === "sunrise"
        ? sun.sunriseMs
        : bound.ref === "sunset"
          ? sun.sunsetMs
          : bound.ref === "dawn"
            ? sun.civilDawnMs
            : sun.civilDuskMs;
    if (atMs === null) return null;
    return hoursClock(atMs).minutes + bound.offsetMinutes;
  };

  const open = edge(rule.open);
  const close = edge(rule.close);
  if (open === null || close === null) return "unknown";
  // A window whose close precedes its open is never open rather than always.
  if (close <= open) return "closed";
  return clock.minutes >= open && clock.minutes < close ? "open" : "closed";
}

const YEAR_OF = (date: string): number => Number(date.slice(0, 4));

/**
 * The one entry point. Pure: no module state, no clock, no read of `HOURS`.
 */
export function evaluateHours(
  entry: HoursEntry | undefined,
  clock: HoursClock,
  sun: SolarEvents | null,
  coverage: HoursCoverage,
): HoursVerdict {
  // No entry at all is absence, not uncertainty: the card renders nothing.
  if (entry === undefined) return { state: "unknown", note: null, stale: false };

  const stale =
    entry.checkedAt !== undefined && clock.year - YEAR_OF(entry.checkedAt) > STALE_YEARS;
  const staleClause = stale && entry.checkedAt !== undefined
    ? `, last checked ${YEAR_OF(entry.checkedAt)}`
    : "";

  const base: Pick<HoursVerdict, "source" | "category" | "stale"> = {
    source: entry.source,
    stale,
  };
  if (entry.category !== undefined) base.category = entry.category;

  const rule = ruleFor(entry);
  if (rule !== null) {
    // Solar entries skip the window check on purpose: a rule against the sun is
    // date-independent, so it keeps working after the masks expire.
    const state = solarOpen(rule, clock, sun);
    return { ...base, state, note: categoryNote(entry, state, staleClause) };
  }

  if (clock.date < coverage.from || clock.date > coverage.through) {
    return { ...base, state: "unknown", note: `Hours data is out of date.${staleClause}` };
  }

  const segment = entry.segments === undefined ? null : segmentFor(entry.segments, clock.date);
  if (segment === null) return { ...base, state: "unknown", note: `Hours data is out of date.${staleClause}` };

  const state: Openness = bitAt(segment.mask, clock.slot) ? "open" : "closed";

  // A rule the parser reports as state-unknown - "weather permitting" - is
  // never reported open. The comment is the sentence.
  if (state === "open" && entry.comment !== undefined) {
    return {
      ...base,
      state: "unknown",
      note: `Hours say “${entry.comment}”.${staleClause}`,
    };
  }

  if (state === "closed") return { ...base, state, note: `Likely closed when you arrive.${staleClause}` };

  const closesAt = nextCloseMinutes(segment.mask, clock.slot);
  const soon = closesAt !== null && closesAt - clock.minutes <= CLOSING_SOON_MINUTES;
  const clause = soon && closesAt !== null ? ` — closes ${clockOf(clock, closesAt)}` : "";
  return { ...base, state, note: `Open when you arrive${clause}${staleClause}` };
}

/** A local minutes-since-midnight back into the app's one clock voice. */
function clockOf(clock: HoursClock, minutes: number): string {
  // Built from the clock's own local date so `formatClock` renders the same
  // wall time the mask is expressed in, whatever the device's zone.
  const utcNoon = Date.UTC(clock.year, clock.month - 1, clock.day, 12, 0, 0);
  const noonLocal = hoursClock(utcNoon).minutes;
  return formatClock(utcNoon + (minutes - noonLocal) * 60_000);
}

function categoryNote(entry: HoursEntry, state: Openness, staleClause: string): string | null {
  if (entry.source === "category" && entry.category === "public-park") {
    return `${PARK_NOTE}${staleClause}`;
  }
  if (state === "closed") return `Likely closed when you arrive.${staleClause}`;
  if (state === "unknown") return null;
  return `Open when you arrive${staleClause}`;
}

/**
 * What the park assumption says out loud.
 *
 * The word "assumed" is doing real work: this is a city ordinance applied to a
 * category, not a fact about this park. See `PARK_HOURS` in
 * `scripts/build-hours.mjs` and HUMAN-REVIEW 2.7.
 */
const PARK_NOTE = "City parks open at 5 am and close at dusk — assumed, not from OSM.";

/**
 * **The one constant Richmond's whole park assumption turns on.**
 *
 * The City of Richmond Parks and Recreation Rules and Regulations, developed
 * under section 58-1 of the Code of Ordinances, state: "The parks are open to
 * the public from 5:00 a.m. until dusk and in areas in which lighting is
 * provided the area is open until 11:00 p.m."
 *
 * So the open edge is a **fixed clock time** and only the close edge is solar -
 * the plan assumed `sunrise-30` to `sunset+30` and both halves of that are
 * wrong for this city. The lighted-areas exception is deliberately not
 * modelled: nothing in OSM says which areas are lit, and assuming a park is lit
 * is the kind of guess that sends somebody to a dark field at 10 pm.
 *
 * Dusk is civil dusk, the same threshold `daylight-budget` clamps the dial to,
 * so the two features cannot disagree about when the light goes.
 *
 * One object rather than one per park: the table used to carry an identical
 * copy on all ninety-three, which cost bytes and made "the default lives in one
 * constant" untrue. See docs/plans/HUMAN-REVIEW.md 2.7.
 */
const PARK_RULE: SolarRule = {
  days: 0b1111111,
  open: { ref: "clock", offsetMinutes: 5 * 60 },
  close: { ref: "dusk", offsetMinutes: 0 },
};

/** The rule a category entry stands for, or null if the category is unknown. */
function ruleFor(entry: HoursEntry): SolarRule | null {
  if (entry.solar !== undefined) return entry.solar;
  return entry.category === "public-park" ? PARK_RULE : null;
}

const BY_ID = new Map(HOURS.entries.map((entry) => [entry.id, entry]));

/**
 * The entry a park id stands for, built once rather than shipped 93 times.
 *
 * The table carries only the ids; this is the rest of what those entries mean,
 * and it is why `PARK_RULE` above is genuinely one constant.
 */
const PARKS = new Map(
  HOURS.parks.map((id): [string, HoursEntry] => [
    id,
    { id, source: "category", category: "public-park" },
  ]),
);

/** @public - consumed by App. */
export function hoursFor(placeId: string): HoursEntry | undefined {
  return BY_ID.get(placeId) ?? PARKS.get(placeId);
}

/** @public - consumed by App, so it never reaches into the generated table. */
export const HOURS_COVERAGE: HoursCoverage = {
  from: HOURS.coversFrom,
  through: HOURS.coversThrough,
};

/**
 * The start of the containing half-hour slot, as an epoch instant.
 *
 * **This is the entire mechanism keeping the candidate pool still between slot
 * boundaries.** `conditions.atMs` advances every minute; the pool's arrival
 * instant must not, or `candidateKey` churns once a minute and the spin-abort
 * effect cancels throws for no reason a reader can see.
 *
 * Half-hour offsets exist in other zones but not in America/New_York, so
 * subtracting the local minute-remainder is exact here. That is a fact about
 * this one timezone rather than a general truth, and it is why this function is
 * not called `quantise`.
 *
 * @public - consumed by App and by `hours.test.ts`.
 */
export function quantiseToSlot(atMs: number): number {
  const clock = hoursClock(atMs);
  const past = (clock.minutes % SLOT_MINUTES) * 60_000;
  // Seconds and milliseconds go too, or the "same slot" test is off by the
  // fraction of a minute the instant happened to carry.
  return atMs - past - (atMs % 60_000);
}

/**
 * The pool's rule: keep it unless it is definitely shut.
 *
 * @public - consumed by App and by `hours.test.ts`.
 */
export function isOpenEnough(verdict: HoursVerdict): boolean {
  return verdict.state !== "closed";
}

/** Every place the table knows anything about. @public - consumed by App. */
export function hoursCoverageCount(): number {
  return HOURS.entries.length + HOURS.parks.length;
}

void MS_PER_SLOT;
