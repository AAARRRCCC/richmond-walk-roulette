import { test } from "node:test";
import assert from "node:assert/strict";
import type { ExpressionSpecification } from "maplibre-gl";
import { weighted } from "./weight.ts";

/**
 * These assert a shape rather than a rendering, because the shape is what
 * MapLibre validates. A `["zoom"]` reference anywhere other than the direct
 * input of a top-level `interpolate` or `step` is rejected, and the layer is
 * dropped with no throw and no log - so the only visible symptom is an empty
 * map. Cheap to assert, expensive to notice.
 */

/** A stop output: arithmetic on a pixel value, and never a zoom lookup. */
type StopOutput = ExpressionSpecification[number];

function mentionsZoom(value: StopOutput): boolean {
  if (!Array.isArray(value)) return false;
  if (value[0] === "zoom") return true;
  return value.some((item: StopOutput) => mentionsZoom(item));
}

test("the zoom curve is the top-level interpolate, not an operand inside one", () => {
  const expression = weighted(7);

  assert.equal(expression[0], "interpolate");
  assert.deepEqual(expression[1], ["exponential", 1.4]);
  assert.deepEqual(expression[2], ["zoom"], "zoom is the interpolate's direct input");

  for (const output of [expression[4], expression[6]]) {
    assert.ok(!mentionsZoom(output), "no stop output may reference zoom");
  }
});

test("the pixel value written at the call site is what lands at the loading zoom", () => {
  const expression = weighted(10);

  // Stops are [zoom, output] pairs: z11 scales to 0.75x, z18 to 2.56x. An
  // exponential 1.4 curve between them passes through ~0.99 at z13.4, the
  // zoom the app opens at.
  assert.equal(expression[3], 11);
  assert.deepEqual(expression[4], ["*", 0.75, 10]);
  assert.equal(expression[5], 18);
  assert.deepEqual(expression[6], ["*", 2.56, 10]);
});

test("a data expression is scaled the same way a number is", () => {
  // What the places layer passes for circle-radius: a per-feature match.
  const byState: ExpressionSpecification = ["match", ["get", "state"], "picked", 8, 4.5];
  const expression = weighted(byState);

  assert.deepEqual(expression[4], ["*", 0.75, byState]);
  assert.deepEqual(expression[6], ["*", 2.56, byState]);
  assert.deepEqual(expression[2], ["zoom"], "a data-driven radius still keeps zoom at the top");
});
