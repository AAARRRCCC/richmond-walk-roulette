/**
 * The strings three features share.
 *
 * `formatClock` is the one worth a test of its own: it is Richmond time from a
 * UTC instant, assembled from `Intl` parts rather than taken from `format()`,
 * and both halves of that are places a plausible wrong answer can hide. A clock
 * that silently reads the device's own zone is exactly the failure this app is
 * being rebuilt to stop making.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatClock, formatFahrenheit, formatHorizon, formatUv } from "./format.ts";

test("formatClock renders Richmond time on both sides of a DST boundary", () => {
  // EDT: 23:54Z is 7:54 pm in Richmond.
  assert.equal(formatClock(Date.parse("2026-08-21T23:54:00Z")), "7:54 pm");
  // EST: the same wall clock is five hours behind UTC in December.
  assert.equal(formatClock(Date.parse("2026-12-21T21:55:00Z")), "4:55 pm");
});

test("formatClock says twelve at midnight, not zero and not twenty-four", () => {
  // Where a naive `hour: "numeric"` reading goes wrong, in both directions.
  assert.equal(formatClock(Date.parse("2026-08-22T04:00:00Z")), "12:00 am");
  assert.equal(formatClock(Date.parse("2026-08-21T16:00:00Z")), "12:00 pm");
});

test("formatHorizon counts in minutes and hours, and never backwards", () => {
  assert.equal(formatHorizon(0), "now");
  assert.equal(formatHorizon(40), "in 40 min");
  assert.equal(formatHorizon(130), "in 2 hr 10 min");
  assert.equal(formatHorizon(120), "in 2 hr");
  // A horizon that has already passed is still describing this minute.
  assert.equal(formatHorizon(-3), "now");
});

test("temperature and UV are whole numbers", () => {
  // A tenth of a degree is noise on a sidewalk, and the EPA's scale is integers.
  assert.equal(formatFahrenheit(72.4), "72°F");
  assert.equal(formatFahrenheit(96.6), "97°F");
  assert.equal(formatUv(8.7), "UV 9");
});
