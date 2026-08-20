import { test } from "node:test";
import assert from "node:assert/strict";
import { areaSqMeters, contains, subtract, type MultiPolygon } from "./geometry.ts";

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
