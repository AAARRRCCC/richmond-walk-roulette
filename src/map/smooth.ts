/**
 * Chaikin corner cutting on contour rings, for drawing only.
 *
 * Valhalla traces isochrones along grid-cell edges, so contours arrive as
 * ~25 m axis-aligned steps that the API cannot be asked to remove. Cutting
 * the corners moves the boundary by a few metres, well inside what an
 * isochrone is accurate to. Reach membership is still decided on the
 * engine's own geometry.
 */

import type { MultiPolygon, Ring } from "../lib/geometry";

/**
 * One pass of Chaikin corner cutting on a closed ring: every corner is
 * replaced by the points a quarter and three quarters along its two edges.
 * Each pass halves the visible step and doubles the vertices.
 */
function cutCorners(ring: Ring): Ring {
  // Open the ring first: cutting the repeated closing point as a corner
  // would leave one hard step at the start.
  const open = isClosed(ring) ? ring.slice(0, -1) : ring;
  const out: Ring = [];
  for (let i = 0; i < open.length; i++) {
    const a = open[i]!;
    const b = open[(i + 1) % open.length]!;
    out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
    out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
  }
  // Chaikin leaves the ring open; close it so it is still a valid polygon.
  out.push(out[0]!);
  return out;
}

function isClosed(ring: Ring): boolean {
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first !== undefined && last !== undefined && first[0] === last[0] && first[1] === last[1];
}

/** One pass still reads as steps; three adds vertices for no visible change. */
const PASSES = 2;

/** Rings shorter than a triangle have no corners worth cutting. */
const MIN_RING = 4;

/** Keyed on contour identity, which the reach cache keeps stable per origin and minute. */
const cache = new WeakMap<MultiPolygon, MultiPolygon>();

export function smoothedForDisplay(polygons: MultiPolygon): MultiPolygon {
  const memo = cache.get(polygons);
  if (memo) return memo;

  const smoothed: MultiPolygon = polygons.map((rings) =>
    rings.map((ring) => {
      if (ring.length < MIN_RING) return ring;
      let out = ring;
      for (let pass = 0; pass < PASSES; pass++) out = cutCorners(out);
      return out;
    }),
  );
  cache.set(polygons, smoothed);
  return smoothed;
}
