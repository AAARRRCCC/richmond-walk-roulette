import { test } from "node:test";
import assert from "node:assert/strict";
import {
  capFromLight,
  daylightAt,
  describeDeadline,
  describeDusk,
  describeLight,
  fitsInLight,
  type Daylight,
  type DaylightPhase,
} from "./daylight.ts";
import { solarEvents } from "../lib/solar.ts";

const RICHMOND = { lat: 37.5407, lng: -77.436 };

/**
 * 18:00 EDT on the summer solstice: sunset 20:34, civil dusk 21:06, so 154
 * minutes of sun left and 186 of usable light.
 */
const SOLSTICE_EVENING = Date.parse("2026-06-21T22:00:00Z");

/**
 * A `Daylight` built by hand.
 *
 * Tests that need a specific `minutesToDusk` construct one rather than hunting
 * for an instant that produces it. The type is a plain record, and that is
 * exactly what makes the awkward states — 2am, the minute after sunset, a
 * latitude with no sunset — reachable without waiting for them.
 */
function daylight(phase: DaylightPhase, fields: Partial<Daylight> = {}): Daylight {
  return {
    atMs: SOLSTICE_EVENING,
    phase,
    events: solarEvents(SOLSTICE_EVENING, RICHMOND.lat, RICHMOND.lng),
    minutesToSunset: null,
    minutesToDusk: null,
    minutesToSunrise: null,
    nextDawnMs: null,
    ...fields,
  };
}

test("daylight: phase is day before sunset, dusk between, night after civil dusk", () => {
  const day = daylightAt(Date.parse("2026-06-21T22:00:00Z"), RICHMOND.lat, RICHMOND.lng);
  const dusk = daylightAt(Date.parse("2026-06-22T00:45:00Z"), RICHMOND.lat, RICHMOND.lng);
  const night = daylightAt(Date.parse("2026-06-22T02:00:00Z"), RICHMOND.lat, RICHMOND.lng);

  assert.equal(day.phase, "day"); // 18:00 EDT
  assert.equal(dusk.phase, "dusk"); // 20:45 EDT, between sunset and civil dusk
  assert.equal(night.phase, "night"); // 22:00 EDT, past civil dusk
});

test("daylight: minutes are floored, never rounded up", () => {
  const events = solarEvents(SOLSTICE_EVENING, RICHMOND.lat, RICHMOND.lng);
  const sunset = events.sunsetMs ?? 0;
  const at = sunset - 90.7 * 60_000;
  const light = daylightAt(at, RICHMOND.lat, RICHMOND.lng);
  assert.equal(light.minutesToSunset, 90, "90.7 minutes out reads as 90, not 91");
});

test("daylight: after civil dusk it rolls to tomorrow and reports the next civil dawn", () => {
  const light = daylightAt(Date.parse("2026-06-22T02:00:00Z"), RICHMOND.lat, RICHMOND.lng);
  assert.equal(light.phase, "night");
  assert.equal(light.events.day, "2026-06-22", "the events rolled to tomorrow");

  // USNO gives civil dawn 05:18 on 2026-06-22; ±2 minutes, as in solar.test.ts.
  const expected = Date.parse("2026-06-22T09:18:00Z");
  const off = Math.abs(Math.round(((light.nextDawnMs ?? 0) - expected) / 60_000));
  assert.ok(off <= 2, `next dawn is ${off} min from 5:18 am`);
});

test("daylight: the cap is clamped to MAX_MINUTES when dusk is further off than the dial reaches", () => {
  const far = daylight("day", { minutesToDusk: 186 });
  assert.equal(capFromLight(far, true, 10, 1), 100, "186 minutes of light, but the dial stops at 100");

  const near = daylight("day", { minutesToDusk: 62 });
  assert.equal(capFromLight(near, true, 10, 1), 62, "this is the case the dial actually shows");
});

test("daylight: the cap floors onto the dial step and is null below the dial minimum", () => {
  const light = daylight("day", { minutesToDusk: 8 });
  assert.equal(capFromLight(light, true, 10, 1), null, "8 minutes cannot fill a 10 minute dial");
  assert.equal(capFromLight(light, true, 5, 1), 8);

  const fractional = daylight("day", { minutesToDusk: 8.9 });
  assert.equal(capFromLight(fractional, true, 5, 1), 8, "floored, never rounded into the dark");
});

test("daylight: the cap is null at night", () => {
  // The mode must not clamp to zero after dark; it says something honest
  // instead, and a null is what lets it.
  const night = daylight("night", { minutesToDusk: 1400 });
  assert.equal(capFromLight(night, true, 10, 1), null);
});

test("daylight: fitsInLight admits a walk that ends exactly at dusk and refuses one minute more", () => {
  const light = daylight("day", { minutesToDusk: 60 });
  assert.equal(fitsInLight(light, 60), true, "finishing on the stroke of dusk finished in the light");
  assert.equal(fitsInLight(light, 61), false);
});

test("daylight: fitsInLight is false at night however much time the rolled-over dusk shows", () => {
  // This is the regression test for the whole night branch. At 11pm the events
  // have rolled to tomorrow, so minutesToDusk really is about 1400 - and
  // without the phase check a 20 minute walk would sail through it.
  const night = daylight("night", { minutesToDusk: 1400 });
  assert.equal(fitsInLight(night, 20), false);
});

test("daylight: describeLight switches on phase, not on the sign of minutesToSunset", () => {
  // Pre-dawn, sunset is thirteen hours away and comfortably positive. An
  // earlier draft tested that first and told a 6am walker "sunset in 812".
  const dawn = daylight("dawn", { minutesToSunset: 812, minutesToSunrise: 32 });
  assert.equal(describeLight(dawn), "sunrise in 32");

  assert.equal(describeLight(daylight("night")), "after dark");
  assert.equal(describeLight(daylight("day", { minutesToSunset: 40 })), "sunset in 40");
  assert.equal(describeLight(daylight("dusk", { minutesToSunset: -12 })), "sunset was 12 min ago");
});

test("daylight: describeDeadline names arrival for one-way and return for round trip", () => {
  const light = daylight("day", { minutesToDusk: 186 });
  const back = describeDeadline(light, true);
  const arrive = describeDeadline(light, false);

  assert.match(back, /^Back before civil dusk, /);
  assert.match(arrive, /^Arrive before civil dusk, /);
  assert.notEqual(back, arrive);
});

test("daylight: describeDusk is a bare clock phrase in both phases", () => {
  // The readout and the dial's cap note both embed this, so it must not become
  // a sentence.
  const day = daylight("day");
  assert.match(describeDusk(day), /^dusk \d{1,2}:\d{2} (am|pm)$/);

  const night = daylight("night", { nextDawnMs: Date.parse("2026-06-22T09:18:00Z") });
  assert.equal(describeDusk(night), "dark until 5:18 am");
});
