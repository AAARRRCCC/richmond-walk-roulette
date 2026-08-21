import { test } from "node:test";
import assert from "node:assert/strict";
import {
  areaSqMeters,
  contains,
  cumulativeMeters,
  pointAtMeters,
  subtract,
  type MultiPolygon,
} from "./geometry.ts";

/** A square centred on the origin, side `size` degrees, wound counter-clockwise. */
function square(size: number): MultiPolygon {
  const h = size / 2;
  return [[[[-h, -h], [h, -h], [h, h], [-h, h], [-h, -h]]]];
}

test("subtracting the inner reach turns the disc into a band", () => {
  const outer = square(0.1);
  const inner = square(0.04);
  const band = subtract(outer, inner);

  // The inner exterior became a hole in the outer polygon rather than a
  // second polygon: one shape, two rings.
  assert.equal(band.length, 1);
  assert.equal(band[0]?.length, 2);

  // A point in the gap is in the band; the middle is not; outside is not.
  assert.equal(contains(band, { lng: 0.03, lat: 0 }), true);
  assert.equal(contains(band, { lng: 0, lat: 0 }), false);
  assert.equal(contains(band, { lng: 0.2, lat: 0 }), false);
});

test("the band's area is the difference, not the disc's", () => {
  const outer = square(0.1);
  const inner = square(0.04);
  const band = subtract(outer, inner);

  const expected = areaSqMeters(outer) - areaSqMeters(inner);
  const actual = areaSqMeters(band);
  assert.ok(
    Math.abs(actual - expected) / expected < 1e-6,
    `band area ${actual} should equal ${expected}`,
  );
});

test("no lower bound leaves the reach exactly as it was", () => {
  const outer = square(0.1);
  assert.equal(subtract(outer, []), outer);
});

test("an inner shape outside the reach is not a hole in it", () => {
  const outer = square(0.1);
  // Far away: nothing to punch through.
  const elsewhere: MultiPolygon = [[[[9, 9], [9.1, 9], [9.1, 9.1], [9, 9.1], [9, 9]]]];
  const band = subtract(outer, elsewhere);

  assert.equal(band[0]?.length, 1, "a hole with nothing around it is not a hole");
  assert.equal(contains(band, { lng: 0, lat: 0 }), true);
});

test("cumulativeMeters: starts at zero and is monotone", () => {
  const line = [
    { lat: 37.54, lng: -77.45 },
    { lat: 37.541, lng: -77.451 },
    { lat: 37.542, lng: -77.449 },
  ];
  const out = cumulativeMeters(line);

  assert.equal(out.length, line.length);
  assert.equal(out[0], 0);
  for (let index = 1; index < out.length; index += 1) {
    assert.ok((out[index] ?? 0) > (out[index - 1] ?? 0), `step ${index} moves forward`);
  }
});

test("cumulativeMeters: a known one-kilometre north leg measures 1000 m", () => {
  // Due north, so longitude's cosine scaling cannot hide an error in it. The
  // latitude is derived from this module's own EARTH_RADIUS_M rather than from
  // a round number: the spec's fixture assumed a different sphere and came out
  // 1.1 m long, which is a fine way to discover you are carrying two Earths.
  const meters = cumulativeMeters([
    { lat: 37.54, lng: -77.45 },
    { lat: 37.5489832, lng: -77.45 },
  ]);
  const total = meters[1] ?? 0;
  assert.ok(Math.abs(total - 1000) < 1, `measured ${total} m, expected 1000 +/- 1`);
});

test("pointAtMeters: zero returns the first vertex; the total returns the last", () => {
  const line = [
    { lat: 37.54, lng: -77.45 },
    { lat: 37.5489832, lng: -77.45 },
  ];
  const meters = cumulativeMeters(line);
  assert.deepEqual(pointAtMeters(line, meters, 0), line[0]);
  assert.deepEqual(pointAtMeters(line, meters, meters[1] ?? 0), line[1]);
});

test("pointAtMeters: the midpoint of a two-vertex line interpolates", () => {
  const line = [
    { lat: 37.54, lng: -77.45 },
    { lat: 37.5489832, lng: -77.45 },
  ];
  const meters = cumulativeMeters(line);
  const mid = pointAtMeters(line, meters, (meters[1] ?? 0) / 2);
  assert.ok(
    Math.abs((mid?.lat ?? 0) - (37.54 + 37.5489832) / 2) < 1e-9,
    `midpoint latitude was ${mid?.lat}`,
  );
  assert.equal(mid?.lng, -77.45);
});

test("pointAtMeters: beyond the end clamps rather than returning null", () => {
  // The chart's cursor is dragged to its own edge constantly, and a null there
  // would blink the map's hover dot out at exactly the moment it matters.
  const line = [
    { lat: 37.54, lng: -77.45 },
    { lat: 37.5489832, lng: -77.45 },
  ];
  const meters = cumulativeMeters(line);
  assert.deepEqual(pointAtMeters(line, meters, 1e9), line[1]);
  assert.deepEqual(pointAtMeters(line, meters, -50), line[0]);
});
