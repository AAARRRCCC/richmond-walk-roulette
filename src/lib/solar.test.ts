import { test } from "node:test";
import assert from "node:assert/strict";
import { solarEvents, sunTimes } from "./solar.ts";

/** Richmond, the coordinate every fixture below was fetched for. */
const RICHMOND = { lat: 37.5407, lng: -77.436 };

/**
 * USNO's own answers, fetched 2026-08-21 from
 * https://aa.usno.navy.mil/api/rstt/oneday?date=<date>&coords=37.5407,-77.436&tz=<tz>
 * and quoted as returned, in Richmond local clock time.
 *
 * Three dates on purpose: an equinox just after the spring-forward, a solstice
 * deep in daylight time, and a solstice in standard time. Between them they
 * catch a DST sign error, a longitude sign error and a declination error, which
 * are the three ways this port can be wrong by a lot rather than by a minute.
 */
const USNO = [
  { date: "2026-03-20", tzOffsetHours: -4, dawn: "06:47", rise: "07:13", transit: "13:17", set: "19:22", dusk: "19:48" },
  { date: "2026-06-21", tzOffsetHours: -4, dawn: "05:18", rise: "05:49", transit: "13:12", set: "20:34", dusk: "21:06" },
  { date: "2026-12-21", tzOffsetHours: -5, dawn: "06:52", rise: "07:21", transit: "12:08", set: "16:55", dusk: "17:24" },
] as const;

/**
 * Two minutes, which is the spec's tolerance and roughly twice the error the
 * single-pass simplification actually produces. USNO publishes to the minute, so
 * half of any one-minute disagreement is its own rounding.
 */
const TOLERANCE_MINUTES = 2;

/** The epoch instant of a local clock time on a fixture's date. */
function expectedMs(row: (typeof USNO)[number], hhmm: string): number {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return (
    Date.parse(`${row.date}T00:00:00Z`) +
    ((hours ?? 0) * 60 + (minutes ?? 0) - row.tzOffsetHours * 60) * 60_000
  );
}

const minutesApart = (a: number, b: number): number => Math.abs(Math.round((a - b) / 60_000));

/** Noon on the fixture's date, so `solarEvents` resolves to that Richmond day. */
const middayOf = (row: (typeof USNO)[number]): number => Date.parse(`${row.date}T17:00:00Z`);

test("solar: matches USNO within two minutes on all five phenomena", () => {
  for (const row of USNO) {
    const events = solarEvents(middayOf(row), RICHMOND.lat, RICHMOND.lng);
    assert.equal(events.day, row.date);

    const pairs: [string, number | null, string][] = [
      ["civil dawn", events.civilDawnMs, row.dawn],
      ["sunrise", events.sunriseMs, row.rise],
      ["transit", events.solarNoonMs, row.transit],
      ["sunset", events.sunsetMs, row.set],
      ["civil dusk", events.civilDuskMs, row.dusk],
    ];

    for (const [name, actual, expected] of pairs) {
      assert.notEqual(actual, null, `${row.date} ${name} should exist`);
      const off = minutesApart(actual ?? 0, expectedMs(row, expected));
      assert.ok(off <= TOLERANCE_MINUTES, `${row.date} ${name} is ${off} min from USNO's ${expected}`);
    }
  }
});

test("solar: is stable across the DST boundary", () => {
  // 2026-03-20 is after the US spring-forward and 2026-12-21 is in standard
  // time. Both go through the same code path with no manual offset anywhere:
  // the calculation is in UTC and only the calendar day is local.
  const spring = USNO[0];
  const winter = USNO[2];
  for (const row of [spring, winter]) {
    const events = solarEvents(middayOf(row), RICHMOND.lat, RICHMOND.lng);
    assert.ok(
      minutesApart(events.sunsetMs ?? 0, expectedMs(row, row.set)) <= TOLERANCE_MINUTES,
      `${row.date} sunset survives the offset change`,
    );
  }
});

test("solar: the same instant yields the same day from any caller timezone", () => {
  // 00:30 in Richmond, 13:30 in Tokyo. The day belongs to the place, not to
  // whoever is asking.
  const events = solarEvents(Date.parse("2026-06-21T04:30:00Z"), RICHMOND.lat, RICHMOND.lng);
  assert.equal(events.day, "2026-06-21");
});

test("solar: civil dusk is later than sunset, sunrise later than civil dawn, noon between", () => {
  for (const row of USNO) {
    const e = solarEvents(middayOf(row), RICHMOND.lat, RICHMOND.lng);
    const dawn = e.civilDawnMs ?? Number.NaN;
    const rise = e.sunriseMs ?? Number.NaN;
    const set = e.sunsetMs ?? Number.NaN;
    const dusk = e.civilDuskMs ?? Number.NaN;
    assert.ok(dawn < rise, `${row.date}: dawn before sunrise`);
    assert.ok(rise < e.solarNoonMs, `${row.date}: sunrise before noon`);
    assert.ok(e.solarNoonMs < set, `${row.date}: noon before sunset`);
    assert.ok(set < dusk, `${row.date}: sunset before dusk`);
  }
});

test("solar: a latitude with no crossing returns null rather than NaN", () => {
  const events = solarEvents(Date.parse("2026-06-21T17:00:00Z"), 89, RICHMOND.lng);
  assert.equal(events.sunsetMs, null);
  assert.equal(events.sunriseMs, null);

  // Every instant on the record, by name, so a NaN cannot hide in a field this
  // test forgot to list. `day` is a string and is asserted above by `.day`.
  const instants = {
    civilDawnMs: events.civilDawnMs,
    sunriseMs: events.sunriseMs,
    solarNoonMs: events.solarNoonMs,
    sunsetMs: events.sunsetMs,
    civilDuskMs: events.civilDuskMs,
  };
  for (const [name, value] of Object.entries(instants)) {
    assert.ok(
      value === null || Number.isFinite(value),
      `${name} is ${String(value)} - every field is finite or null`,
    );
  }
});

test("solar: sunTimes returns Dates matching solarEvents, and null when the sun does not set", () => {
  const at = new Date("2026-06-21T17:00:00Z");
  const events = solarEvents(at.getTime(), RICHMOND.lat, RICHMOND.lng);
  const times = sunTimes(at, RICHMOND);

  assert.notEqual(times, null);
  assert.equal(times?.sunrise.getTime(), events.sunriseMs);
  assert.equal(times?.sunset.getTime(), events.sunsetMs);

  // The null contract `opening-hours` relies on, asserted here rather than
  // discovered there.
  assert.equal(sunTimes(at, { lat: 89, lng: RICHMOND.lng }), null);
});
