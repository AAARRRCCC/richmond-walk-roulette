import { test } from "node:test";
import assert from "node:assert/strict";
import { arrivalMs, mergeCaps, type TimeCap } from "./conditions.ts";

const at = (minutes: number, reason: TimeCap["reason"], untilMs: number): TimeCap => ({
  minutes,
  reason,
  untilMs,
});

test("conditions: mergeCaps picks the earliest deadline, not the smallest budget", () => {
  // Rain in twenty minutes permits a longer *budget* than a dusk two hours out
  // would, because the dial is clamped by whichever reason bites first. Picking
  // the smaller number here would silently prefer the wrong reason and then
  // name it on the dial.
  const dusk = at(60, "daylight", 7_200_000);
  const rain = at(80, "rain", 1_200_000);

  assert.equal(mergeCaps([dusk, rain]), rain);
  assert.equal(mergeCaps([rain, dusk]), rain, "order of the array does not decide it");
});

test("conditions: mergeCaps breaks a tie on the smaller budget", () => {
  const a = at(40, "daylight", 3_600_000);
  const b = at(35, "heat", 3_600_000);
  assert.equal(mergeCaps([a, b]), b);
});

test("conditions: mergeCaps of all nulls, and of an empty array, is null", () => {
  assert.equal(mergeCaps([]), null);
  assert.equal(mergeCaps([null, null]), null);
  assert.equal(mergeCaps([null, at(20, "storm", 1000), null])?.reason, "storm");
});

test("conditions: arrivalMs adds the outbound leg in whole milliseconds", () => {
  const now = Date.parse("2026-06-21T22:00:00Z");
  assert.equal(arrivalMs(now, 600), now + 600_000);
  // Valhalla answers in fractional seconds; an arrival instant is compared
  // against a schedule, so it lands on a whole millisecond rather than carrying
  // a fraction into a clock comparison.
  assert.equal(arrivalMs(now, 142.447), now + 142_447);
  assert.equal(arrivalMs(now, 0), now);
});
