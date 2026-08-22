/**
 * The hours evaluator, on hand-written entries.
 *
 * No network, no parser, no generated file: every fixture below is written out
 * here, so this suite tests the evaluator rather than the bake. The coverage
 * window is a fixture too, which is the whole reason `evaluateHours` takes it
 * as an argument - a test that read `HOURS.coversThrough` would change meaning
 * every time somebody re-baked.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { HoursEntry, SolarRule } from "../data/hours.ts";
import type { SolarEvents } from "./solar.ts";
import {
  SLOT_MINUTES,
  STALE_YEARS,
  bitAt,
  evaluateHours,
  hoursClock,
  isOpenEnough,
  nextCloseMinutes,
  quantiseToSlot,
  segmentFor,
  solarOpen,
  type HoursCoverage,
} from "./hours.ts";

/** Sets the given slots and base64s 42 bytes, exactly as the baker does. */
function maskOf(slots: readonly number[]): string {
  const bytes = new Uint8Array(42);
  for (const slot of slots) {
    const index = slot >> 3;
    bytes[index] = (bytes[index] ?? 0) | (1 << (7 - (slot & 7)));
  }
  return Buffer.from(bytes).toString("base64");
}

/** Every half-hour slot in `[fromMinutes, toMinutes)` on `day` (0 = Monday). */
const slotsFor = (day: number, fromMinutes: number, toMinutes: number): number[] => {
  const out: number[] = [];
  for (let minutes = fromMinutes; minutes < toMinutes; minutes += 30) {
    out.push(day * 48 + Math.floor(minutes / 30));
  }
  return out;
};

/** Tu-Su 10:00-17:00, one segment from the start of the window. */
const MUSEUM: HoursEntry = {
  id: "museum",
  source: "osm",
  segments: [
    {
      from: "2026-01-01",
      mask: maskOf([1, 2, 3, 4, 5, 6].flatMap((day) => slotsFor(day, 10 * 60, 17 * 60))),
    },
  ],
};

/** Closed all winter, Sa-Su 10:00-16:00 from April. The market case. */
const SEASONAL: HoursEntry = {
  id: "market",
  source: "osm",
  segments: [
    { from: "2026-01-01", mask: maskOf([]) },
    {
      from: "2026-04-01",
      mask: maskOf([5, 6].flatMap((day) => slotsFor(day, 10 * 60, 16 * 60))),
    },
  ],
};

/**
 * Richmond's park ordinance: open 5:00 a.m., close at dusk.
 *
 * A fixed clock open and a solar close in one rule, which is what the ordinance
 * actually says and what an all-solar shape could not express.
 */
const PARK_RULE: SolarRule = {
  days: 0b1111111,
  open: { ref: "clock", offsetMinutes: 5 * 60 },
  close: { ref: "dusk", offsetMinutes: 0 },
};

const PARK: HoursEntry = {
  id: "park",
  source: "category",
  category: "public-park",
  solar: PARK_RULE,
};

/**
 * A June day in Richmond. The clock times are illustrative fixture values, not
 * asserted astronomy - `daylight-budget` owns testing the solar port against
 * USNO.
 */
const SUN_JUNE: SolarEvents = {
  day: "2026-06-15",
  civilDawnMs: Date.parse("2026-06-15T09:16:00Z"), // 05:16 EDT
  sunriseMs: Date.parse("2026-06-15T09:48:00Z"), // 05:48 EDT
  solarNoonMs: Date.parse("2026-06-15T17:10:00Z"),
  sunsetMs: Date.parse("2026-06-16T00:33:00Z"), // 20:33 EDT
  civilDuskMs: Date.parse("2026-06-16T01:05:00Z"), // 21:05 EDT
};

const COVERAGE: HoursCoverage = { from: "2026-01-01", through: "2027-12-31" };

const COMMENTED: HoursEntry = { ...MUSEUM, comment: "weather permitting" };
const STALE: HoursEntry = { ...MUSEUM, checkedAt: "2019-04-02" };

/** A Richmond instant, given local wall-clock parts, via a fixed UTC offset. */
const atEDT = (iso: string): number => Date.parse(`${iso}-04:00`);
const atEST = (iso: string): number => Date.parse(`${iso}-05:00`);

test("hoursClock converts a UTC instant to Richmond parts, on both sides of DST", () => {
  // The point of the whole function: a visitor in Berlin gets Richmond's answer.
  assert.equal(hoursClock(Date.parse("2026-01-15T20:00:00Z")).minutes, 15 * 60);
  assert.equal(hoursClock(Date.parse("2026-07-15T20:00:00Z")).minutes, 16 * 60);
});

test("hoursClock puts an instant in the right slot and the right day", () => {
  // 2026-06-15 is a Monday.
  const monday = hoursClock(atEDT("2026-06-15T00:00:00"));
  assert.equal(monday.weekdayIndex, 0);
  assert.equal(monday.slot, 0);
  assert.equal(hoursClock(atEDT("2026-06-15T00:29:00")).slot, 0);
  assert.equal(hoursClock(atEDT("2026-06-15T00:30:00")).slot, 1);

  const sunday = hoursClock(atEDT("2026-06-21T23:30:00"));
  assert.equal(sunday.weekdayIndex, 6);
  assert.equal(sunday.slot, 335);
});

test("bitAt reads the bit the baker wrote, across byte and bit boundaries", () => {
  const mask = maskOf([0, 7, 8, 335]);
  for (const slot of [0, 7, 8, 335]) assert.equal(bitAt(mask, slot), true, `slot ${slot}`);
  for (const slot of [1, 6, 9, 334]) assert.equal(bitAt(mask, slot), false, `slot ${slot}`);
  // Out of range is closed, not a crash and not open.
  assert.equal(bitAt(mask, 336), false);
  assert.equal(bitAt(mask, -1), false);
});

test("segmentFor picks the last segment that had begun", () => {
  const segments = SEASONAL.segments ?? [];
  assert.equal(segmentFor(segments, "2025-12-31"), null, "before the first");
  assert.equal(segmentFor(segments, "2026-03-31")?.from, "2026-01-01");
  assert.equal(segmentFor(segments, "2026-04-01")?.from, "2026-04-01");
  assert.equal(segmentFor(segments, "2026-05-02")?.from, "2026-04-01");
});

test("a place with no entry says nothing at all", () => {
  // Absence, not uncertainty. No "unknown", no dash, no line.
  const verdict = evaluateHours(undefined, hoursClock(atEDT("2026-06-16T12:00:00")), null, COVERAGE);
  assert.equal(verdict.state, "unknown");
  assert.equal(verdict.note, null);
});

test("a fixed schedule opens and closes on the right day and hour", () => {
  // 2026-06-16 is a Tuesday.
  const at = (iso: string) => evaluateHours(MUSEUM, hoursClock(atEDT(iso)), null, COVERAGE).state;
  assert.equal(at("2026-06-16T12:00:00"), "open");
  assert.equal(at("2026-06-16T09:30:00"), "closed");
  assert.equal(at("2026-06-15T12:00:00"), "closed", "Monday");
});

test("a seasonal place is shut out of season", () => {
  // The case the README confessed: both markets are weekly and seasonal, and
  // nothing on screen used to say so. 2026-02-14 and 2026-05-16 are Saturdays.
  const at = (iso: string) => evaluateHours(SEASONAL, hoursClock(atEDT(iso)), null, COVERAGE).state;
  assert.equal(at("2026-02-14T12:00:00"), "closed");
  assert.equal(at("2026-05-16T12:00:00"), "open");
});

test("the park rule opens at five and closes at dusk", () => {
  const at = (iso: string) => solarOpen(PARK_RULE, hoursClock(atEDT(iso)), SUN_JUNE);
  assert.equal(at("2026-06-15T04:30:00"), "closed", "before 5 am");
  assert.equal(at("2026-06-15T05:00:00"), "open", "the ordinance's opening time");
  assert.equal(at("2026-06-15T21:00:00"), "open", "before civil dusk at 21:05");
  assert.equal(at("2026-06-15T21:30:00"), "closed", "after it");
});

test("the park rule degrades to unknown through each of its three doors", () => {
  // Not open, and not closed either: an assumption with no sun behind it is not
  // an answer.
  const clock = hoursClock(atEDT("2026-06-15T12:00:00"));
  assert.equal(solarOpen(PARK_RULE, clock, null), "unknown", "no solar module");
  assert.equal(
    solarOpen(PARK_RULE, clock, { ...SUN_JUNE, civilDuskMs: null }),
    "unknown",
    "a null event",
  );
  assert.equal(
    solarOpen(PARK_RULE, clock, { ...SUN_JUNE, day: "2026-06-14" }),
    "unknown",
    "events for another local day - a real risk, since arrival can cross midnight",
  );
});

test("the park verdict says it is an assumption, in those words", () => {
  const verdict = evaluateHours(PARK, hoursClock(atEDT("2026-06-15T12:00:00")), SUN_JUNE, COVERAGE);
  assert.equal(verdict.source, "category");
  assert.equal(verdict.category, "public-park");
  assert.equal(verdict.note, "City parks open at 5 am and close at dusk — assumed, not from OSM.");
  assert.match(String(verdict.note), /assumed/);
});

test("a rule the parser calls unknown is never reported open", () => {
  // "weather permitting" is the case: the schedule says open, the comment says
  // it depends, and the honest answer is neither.
  const verdict = evaluateHours(
    COMMENTED,
    hoursClock(atEDT("2026-06-16T12:00:00")),
    null,
    COVERAGE,
  );
  assert.equal(verdict.state, "unknown");
  assert.match(String(verdict.note), /weather permitting/);
});

test("a stale check_date is said, and does not change the verdict", () => {
  const verdict = evaluateHours(STALE, hoursClock(atEDT("2026-06-16T12:00:00")), null, COVERAGE);
  assert.equal(verdict.stale, true);
  assert.equal(verdict.state, "open", "stale data is not wrong data");
  assert.match(String(verdict.note), /, last checked 2019$/);
  assert.equal(STALE_YEARS, 3);
  // Half an hour is the resolution the source data actually has; minute
  // resolution would be eight times the bytes for precision OSM does not carry.
  assert.equal(SLOT_MINUTES, 30);
});

test("outside the baked window every mask is unknown, and solar rules still resolve", () => {
  const narrow: HoursCoverage = { from: "2026-01-01", through: "2026-12-31" };
  const clock = hoursClock(atEST("2027-03-02T12:00:00"));

  const masked = evaluateHours(MUSEUM, clock, null, narrow);
  assert.equal(masked.state, "unknown");
  assert.equal(masked.note, "Hours data is out of date.");

  // A rule against the sun is date-independent, so it keeps working after the
  // masks expire. That is why it skips the window check.
  const sun: SolarEvents = { ...SUN_JUNE, day: clock.date };
  assert.notEqual(solarOpen(PARK_RULE, clock, sun), "unknown");
});

test("a closing time inside two hours is named, and a distant one is not", () => {
  const mask = (MUSEUM.segments ?? [])[0]?.mask ?? "";
  // Tuesday 15:30 is slot 48 + 31.
  const tuesday1530 = 48 + 31;
  assert.equal(nextCloseMinutes(mask, tuesday1530), 17 * 60);

  const near = evaluateHours(MUSEUM, hoursClock(atEDT("2026-06-16T15:30:00")), null, COVERAGE);
  assert.equal(near.note, "Open when you arrive — closes 5:00 pm");

  const far = evaluateHours(MUSEUM, hoursClock(atEDT("2026-06-16T10:30:00")), null, COVERAGE);
  assert.equal(far.note, "Open when you arrive");
});

test("quantiseToSlot holds still inside a slot and moves at the boundary", () => {
  // The spin-stability guarantee. `conditions.atMs` advances every minute; if
  // the pool's arrival instant did too, `candidateKey` would churn once a
  // minute and the spin-abort effect would cancel throws for no visible reason.
  const base = atEDT("2026-06-16T12:00:00");
  const first = quantiseToSlot(base);
  for (let minute = 1; minute < 30; minute += 1) {
    assert.equal(quantiseToSlot(base + minute * 60_000), first, `+${minute} min`);
  }
  assert.notEqual(quantiseToSlot(base + 30 * 60_000), first, "and it does move at the boundary");
});

const verdictOf = (state: "open" | "closed" | "unknown") => ({ state, note: null, stale: false });

test("only a definite closed keeps a place out of the pool", () => {
  const of = verdictOf;
  assert.equal(isOpenEnough(of("open")), true);
  assert.equal(isOpenEnough(of("unknown")), true, "unknown is always kept");
  assert.equal(isOpenEnough(of("closed")), false);
});

test("a category assumption annotates and never excludes", () => {
  // The park ordinance is a regulation applied to 93 places, none of them
  // individually checked, and most Richmond parks have no gate to close. An
  // OSM schedule is a fact somebody recorded about ONE place. Only the second
  // is allowed to keep somebody away. Decided by a person; HUMAN-REVIEW 2.7.
  assert.equal(
    isOpenEnough({ state: "closed", note: null, stale: false, source: "category" }),
    true,
    "a park after dusk is still in the pool",
  );
  assert.equal(
    isOpenEnough({ state: "closed", note: null, stale: false, source: "osm" }),
    false,
    "a recorded schedule still excludes",
  );
  // No source at all behaves like a recorded one: forgiveness is opt-in, so a
  // future entry that forgets to say what it is cannot quietly stop excluding.
  assert.equal(isOpenEnough(verdictOf("closed")), false);
});
