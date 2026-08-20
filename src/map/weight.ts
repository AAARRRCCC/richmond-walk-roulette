import type { ExpressionSpecification } from "maplibre-gl";

/**
 * The basemap's roads interpolate their width `["exponential", 1.4]` from z11
 * to z18, so a fixed overlay weight inverts its relationship with the map
 * across the range: a thread over a 6px service road at z18, heavier than an
 * arterial at z11. This is the same curve, anchored so that the value written
 * at each call site is what lands on screen at the zoom the app loads into
 * (z13.4 evaluates to 0.99). A fit can reach about z15.5, where everything is
 * 1.4x heavier - which is the point, since the roads underneath grew too.
 */
const NEAR = 0.75;
const FAR = 2.56;

/**
 * A pixel value, or a data expression producing one, scaled by the zoom curve.
 *
 * The multiply lives INSIDE the interpolate rather than around it, and that is
 * not a matter of taste: a `["zoom"]` expression is only legal as the direct
 * input of a top-level `interpolate` or `step`. Nesting one inside arithmetic
 * fails style validation, and MapLibre reports that by firing an `error` event
 * and skipping the layer - so the layer simply never appears, with nothing
 * thrown and nothing logged. That silently removed the contour lines, the
 * route and every place dot from the map once already.
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
