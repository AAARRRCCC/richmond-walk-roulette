/**
 * The client's weather tier: the wire boundary, and the hold.
 *
 * The hold is the one with a user-visible failure behind it. Conditions derive
 * from a ticking clock and a refreshing forecast, so both can move between the
 * reel starting and landing; freezing the clock is only half the fix, and
 * without the other half a forecast arriving mid-throw moves the pool under a
 * reel that is already turning.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WEATHER_ENABLED,
  applyReport,
  cachedWeather,
  holdWeather,
  readReport,
  resetWeather,
} from "./weather.ts";

const WIRE = {
  observedAt: "2026-08-21T07:15:00.000Z",
  refreshSeconds: 900,
  now: {
    atMinutes: 0,
    temperatureF: 72.4,
    feelsLikeF: 74.1,
    precipInches: 0,
    precipChance: 8,
    weatherCode: 3,
    windMph: 6.2,
    uvIndex: null,
    isDay: false,
  },
  hours: [
    {
      atMinutes: -15,
      temperatureF: 72.1,
      feelsLikeF: 73.8,
      precipInches: 0,
      precipChance: null,
      weatherCode: 3,
      windMph: 6,
      uvIndex: null,
      isDay: false,
    },
  ],
  source: "open-meteo",
};

test("readReport parses the instant once and keeps the nulls", () => {
  const report = readReport(WIRE);
  assert.ok(report);
  assert.equal(report.observedAtMs, Date.parse("2026-08-21T07:15:00.000Z"));
  assert.equal(report.now.temperatureF, 72.4);
  // Null is unknown. A rule reading it must not read it as zero, which means it
  // has to survive the parse as null rather than being defaulted here.
  assert.equal(report.now.uvIndex, null);
  assert.equal(report.hours[0]?.precipChance, null);
  assert.equal(report.now.isDay, false);
});

test("readReport refuses a shape it does not recognise", () => {
  assert.equal(readReport(null), null);
  assert.equal(readReport({ ...WIRE, observedAt: "not a time" }), null);
  assert.equal(readReport({ ...WIRE, now: { atMinutes: 0 } }), null);
});

test("a slot missing a required field is dropped, and the report survives", () => {
  const report = readReport({ ...WIRE, hours: [{ atMinutes: 60, temperatureF: 70 }] });
  assert.ok(report);
  assert.deepEqual(report.hours, []);
});

test("this build does not call the forecast", () => {
  // The licence gate, asserted rather than assumed. Open-Meteo's free tier is
  // non-commercial only and this build takes the commercial case, so the flag
  // ships false and `refreshWeather` is a no-op. Flipping it is the one edit
  // that turns the whole feature on - see docs/plans/HUMAN-REVIEW.md 2.4.
  assert.equal(WEATHER_ENABLED, false);
});

test("a forecast landing mid-throw is stashed, not swapped", (t) => {
  t.after(resetWeather);
  resetWeather();

  const at = (temperatureF: number) => {
    const parsed = readReport({ ...WIRE, now: { ...WIRE.now, temperatureF } });
    assert.ok(parsed);
    return parsed;
  };

  applyReport(at(72.4));
  assert.equal(cachedWeather()?.now.temperatureF, 72.4);

  holdWeather(true);
  applyReport(at(96));
  assert.equal(
    cachedWeather()?.now.temperatureF,
    72.4,
    "the reel finishes against the conditions it started with",
  );

  assert.equal(holdWeather(false), true, "the release says a repaint is owed");
  assert.equal(cachedWeather()?.now.temperatureF, 96, "and the new forecast applies on landing");

  // A release with nothing stashed must not clear what is there, and must not
  // claim a repaint is owed - the caller would re-render once per throw for
  // nothing.
  holdWeather(true);
  assert.equal(holdWeather(false), false);
  assert.equal(cachedWeather()?.now.temperatureF, 96);
});
