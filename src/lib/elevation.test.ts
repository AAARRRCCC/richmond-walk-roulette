import { test } from "node:test";
import assert from "node:assert/strict";
import {
  areaPath,
  classifyClimb,
  climbFrom,
  elevationAt,
  linePath,
  plausibleProfile,
  profilePoints,
  resample,
} from "./elevation.ts";
import type { ElevationProfile } from "./route.ts";

const FLAT = [41.0, 41.4, 40.8, 41.2, 40.9, 41.3]; // noise, no hill
const RAMP = [20, 25, 30, 35, 40, 45, 50]; // +30 monotone
const HILL = [20, 35, 50, 44, 30, 20]; // +30 then -30
const VALLEY = [50, 40, 30, 40, 50]; // -20 then +20
const SENTINEL = [-500, -500, -500];
const LIBBY = [8, 14, 23, 31, 38, 41, 43]; // Shockoe -> Libby Hill, about 35 m

/** A profile around a sample array, for the functions that take the record. */
const profileOf = (samples: number[]): ElevationProfile => {
  const { ascentMeters, descentMeters } = climbFrom(samples, 2);
  return {
    samples,
    intervalMeters: 30,
    ascentMeters,
    descentMeters,
    minMeters: Math.min(...samples),
    maxMeters: Math.max(...samples),
  };
};

test("climbFrom: a monotone ramp returns exactly its total rise", () => {
  assert.deepEqual(climbFrom(RAMP, 2), { ascentMeters: 30, descentMeters: 0 });
});

test("climbFrom: noise below the hysteresis is not climb", () => {
  // Summing absolute deltas would call this 2.4 m of ascent on ground that is
  // flat to the foot. Over a 6 km walk that arithmetic invents a hill.
  assert.deepEqual(climbFrom(FLAT, 2), { ascentMeters: 0, descentMeters: 0 });
});

test("climbFrom: an up-then-down profile banks both halves", () => {
  assert.deepEqual(climbFrom(HILL, 2), { ascentMeters: 30, descentMeters: 30 });
});

test("climbFrom: a dip is descent then ascent, not zero", () => {
  assert.deepEqual(climbFrom(VALLEY, 2), { ascentMeters: 20, descentMeters: 20 });
});

test("climbFrom: hysteresis 0 counts every delta", () => {
  // Proves the threshold is what suppresses the noise above, and not some
  // rounding accident that would also swallow a real step.
  assert.ok(climbFrom(FLAT, 0).ascentMeters > 0);
});

test("climbFrom: a single sample is no climb", () => {
  assert.deepEqual(climbFrom([41], 2), { ascentMeters: 0, descentMeters: 0 });
});

test("plausibleProfile: the -500 sentinel is rejected", () => {
  // The whole point. An un-rebuilt graph answers with these, and a chart that
  // checked for presence rather than plausibility would draw a confident flat
  // line five hundred metres below sea level.
  assert.equal(plausibleProfile(SENTINEL), false);
});

test("plausibleProfile: fewer than two samples is rejected", () => {
  assert.equal(plausibleProfile([41]), false);
  assert.equal(plausibleProfile([]), false);
});

test("plausibleProfile: Richmond elevations pass", () => {
  assert.equal(plausibleProfile(LIBBY), true);
});

test("classifyClimb: Libby Hill from Shockoe is hilly", () => {
  assert.equal(classifyClimb(35, 1000), "hilly");
});

test("classifyClimb: a long gentle walk is easy", () => {
  // 4.8 m/km, and under the 25 m absolute floor.
  assert.equal(classifyClimb(24, 5000), "easy");
});

test("classifyClimb: a big total is hilly however far you walked", () => {
  assert.equal(classifyClimb(40, 9000), "hilly");
});

test("classifyClimb: a zero-length walk does not divide by zero", () => {
  assert.equal(classifyClimb(0, 0), "easy");
});

test("resample: a short profile is returned unchanged", () => {
  assert.deepEqual(resample(HILL, 96), HILL);
});

test("resample: a long profile is capped", () => {
  const long = Array.from({ length: 400 }, (_, index) => 40 + Math.sin(index / 9));
  assert.equal(resample(long, 96).length, 96);
});

test("resample: the extremes survive decimation", () => {
  // A peak at index 137 of 400 falls between strides. Losing it would put the
  // chart's high point eight feet below the number printed under it.
  const long = Array.from({ length: 400 }, () => 40);
  long[137] = 99;
  assert.ok(resample(long, 96).includes(99));
});

test("profilePoints: a flat profile draws near the middle of the box", () => {
  const points = profilePoints(FLAT, 300, 76, 20);
  for (const point of points) {
    assert.ok(
      Math.abs(point.y - 38) <= 76 * 0.15,
      `y ${point.y} should sit near the middle - a flat walk must not read as terrain`,
    );
  }
});

test("profilePoints: a 60 m profile fills the box", () => {
  const points = profilePoints([0, 60], 300, 76, 20);
  assert.equal(points[0]?.y, 76);
  assert.equal(points[1]?.y, 0);
});

test("profilePoints: x spans the full width", () => {
  const points = profilePoints(HILL, 300, 76, 20);
  assert.equal(points[0]?.x, 0);
  assert.equal(points[points.length - 1]?.x, 300);
});

test("profilePoints: a single sample does not produce NaN", () => {
  const points = profilePoints([41], 300, 76, 20);
  assert.equal(points.length, 1);
  assert.ok(Number.isFinite(points[0]?.x));
  assert.ok(Number.isFinite(points[0]?.y));
});

test("areaPath: the path closes along the baseline", () => {
  const points = profilePoints(HILL, 300, 76, 20);
  assert.ok(areaPath(points, 76).endsWith("L 300.00 76.00 L 0.00 76.00 Z"));
});

test("linePath: no closing skirt", () => {
  const points = profilePoints(HILL, 300, 76, 20);
  assert.ok(!linePath(points).includes("Z"));
});

test("elevationAt: clamps past both ends", () => {
  const profile = profileOf(RAMP);
  assert.equal(elevationAt(profile, -50), 20);
  assert.equal(elevationAt(profile, 1e9), 50);
  // And interpolates in between: half an interval past the start is half a step.
  assert.equal(elevationAt(profile, 15), 22.5);
});
