import { test } from "node:test";
import assert from "node:assert/strict";
import { minuteOf, msToNextMinute } from "./useConditions.ts";

const at = (iso: string): number => Date.parse(iso);

test("useConditions: the clock truncates to its minute rather than rounding", () => {
  // Rounding would read 8:22 for thirty seconds while every other clock in the
  // room still said 8:21.
  assert.equal(minuteOf(at("2026-06-21T20:21:59.999Z")), at("2026-06-21T20:21:00Z"));
  assert.equal(minuteOf(at("2026-06-21T20:21:00.000Z")), at("2026-06-21T20:21:00Z"));
});

test("useConditions: the next tick is scheduled to the boundary, and is never zero", () => {
  assert.equal(msToNextMinute(at("2026-06-21T20:21:00.000Z")), 60_000);
  assert.equal(msToNextMinute(at("2026-06-21T20:21:59.000Z")), 1_000);
  assert.equal(msToNextMinute(at("2026-06-21T20:21:30.500Z")), 29_500);
});

test("useConditions: a tick lands exactly on the minute it announces", () => {
  // The property the timer chain depends on: waiting msToNextMinute from any
  // instant lands on a boundary, so the chain cannot drift a fraction later
  // each time the way setInterval does.
  for (const iso of ["2026-06-21T20:21:00.001Z", "2026-06-21T20:21:30.500Z", "2026-06-21T20:21:59.999Z"]) {
    const now = at(iso);
    const landed = now + msToNextMinute(now);
    assert.equal(minuteOf(landed), landed, `from ${iso}`);
  }
});
