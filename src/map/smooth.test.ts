/**
 * What the display smoothing is allowed to do to a contour, asserted on the
 * smallest ring that can show it going wrong.
 *
 * The bug these were written for: `cutCorners` iterated the ring as delivered,
 * and GeoJSON rings are closed, so the repeated closing vertex was cut as if it
 * were a corner. That cut is a no-op, so the ring's start point survived every
 * pass untouched - three corners of a square rounded off and the fourth stayed
 * a hard right angle, at whatever vertex Valhalla happened to start the ring
 * on. One raw 25 m staircase corner on every ring the app has ever drawn, in
 * the one module whose whole job is removing them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { smoothedForDisplay } from "./smooth.ts";
import type { MultiPolygon, Ring } from "../lib/geometry.ts";

/** A closed unit square: four corners, five positions, RFC 7946 shaped. */
function square(): Ring {
  return [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
    [0, 0],
  ];
}

function onlyRing(polygons: MultiPolygon): Ring {
  const ring = polygons[0]?.[0];
  assert.ok(ring, "expected one polygon with one ring");
  return ring;
}

test("two passes round every corner, including the one the ring starts on", () => {
  const out = onlyRing(smoothedForDisplay([[square()]]));

  // Four corners, doubled twice, plus the closing repeat.
  assert.equal(out.length, 17);
  assert.ok(
    !out.some(([x, y]) => x === 0 && y === 0),
    "the ring's start point survived both passes uncut",
  );
});

test("no vertex is emitted twice in a row", () => {
  const out = onlyRing(smoothedForDisplay([[square()]]));
  for (let i = 1; i < out.length - 1; i++) {
    const a = out[i - 1]!;
    const b = out[i]!;
    assert.ok(a[0] !== b[0] || a[1] !== b[1], `positions ${i - 1} and ${i} are the same point`);
  }
});

test("the smoothed ring is still closed", () => {
  const out = onlyRing(smoothedForDisplay([[square()]]));
  assert.deepEqual(out.at(0), out.at(-1));
});

test("holes are smoothed and stay closed too", () => {
  const hole: Ring = [
    [0.4, 0.4],
    [0.6, 0.4],
    [0.6, 0.6],
    [0.4, 0.6],
    [0.4, 0.4],
  ];
  const [polygon] = smoothedForDisplay([[square(), hole]]);
  assert.ok(polygon);
  assert.equal(polygon.length, 2);
  for (const ring of polygon) {
    assert.equal(ring.length, 17);
    assert.deepEqual(ring.at(0), ring.at(-1));
  }
});

test("corner cutting never pushes the boundary outward", () => {
  // Chaikin only ever emits convex combinations of neighbouring vertices, so
  // the drawn shape is inside the engine's answer rather than around it. That
  // is the licence for smoothing the picture and not the reach.
  const out = onlyRing(smoothedForDisplay([[square()]]));
  for (const [x, y] of out) {
    assert.ok(x >= 0 && x <= 1 && y >= 0 && y <= 1, `[${x}, ${y}] left the input's bounds`);
  }
});

test("a ring with no corners worth cutting is passed straight through", () => {
  const sliver: Ring = [
    [0, 0],
    [1, 1],
    [0, 0],
  ];
  assert.equal(onlyRing(smoothedForDisplay([[sliver]])), sliver);
});

test("an unclosed ring keeps all of its vertices", () => {
  // Nothing in the app delivers one, but dropping the last position of a ring
  // that was never closed would silently lose a real corner.
  const open: Ring = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  assert.equal(onlyRing(smoothedForDisplay([[open]])).length, 17);
});

test("the same contour is smoothed once, however many frames ask for it", () => {
  // A dial scrub redraws from this rather than recomputing the curve every
  // frame, so the memo is a feel decision, not a micro-optimisation.
  const polygons: MultiPolygon = [[square()]];
  assert.equal(smoothedForDisplay(polygons), smoothedForDisplay(polygons));
});

test("an equal but distinct contour is smoothed on its own", () => {
  // Keyed on identity, not on value: two origins can hold equal geometry and
  // must not share a cache entry that outlives either of them.
  assert.notEqual(smoothedForDisplay([[square()]]), smoothedForDisplay([[square()]]));
});
