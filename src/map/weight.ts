import type { ExpressionSpecification } from "maplibre-gl";

/**
 * The basemap roads widen `["exponential", 1.4]` from z11 to z18. Overlay
 * weights follow the same curve, anchored so the value at the call site is
 * what lands on screen at the initial zoom (z13.4 evaluates to 0.99).
 */
const NEAR = 0.75;
const FAR = 2.56;

/**
 * A pixel value, or an expression producing one, scaled by the zoom curve.
 *
 * The multiply is inside the interpolate on purpose: `["zoom"]` is only legal
 * as the direct input of a top-level `interpolate` or `step`. Nested in
 * arithmetic it fails validation and MapLibre silently drops the layer.
 */
export function weighted(pixels: number | ExpressionSpecification): ExpressionSpecification {
  return [
    "interpolate",
    ["exponential", 1.4],
    ["zoom"],
    11,
    ["*", NEAR, pixels],
    18,
    ["*", FAR, pixels],
  ];
}
