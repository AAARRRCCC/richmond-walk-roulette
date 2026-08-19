/**
 * Rounds the raster staircase off a contour, for drawing only.
 *
 * Valhalla computes isochrones on a grid and traces the contour along cell
 * edges, so the geometry arrives as ~25 m steps square to the compass: on the
 * shipped data a quarter of all segments sit within three degrees of due
 * north-south or east-west. There is no API parameter for the grid - the
 * isochrone service takes only contours, polygons, denoise and generalize -
 * so the stair-stepping cannot be asked away at the source.
 *
 * It is also not information. Nobody's walking range ends in right angles on
 * a 25 m lattice; the steps are an artefact of how the answer was computed,
 * and drawing them faithfully draws the grid rather than the reach. Corner
 * cutting removes them and moves the boundary by a few metres at most, which
 * is far inside what an isochrone is accurate to anyway.
 *
 * Deliberately confined to the map layer, and deliberately not applied to the
 * geometry the app reasons with: which places are in reach is still decided
 * by `contains` against the engine's own polygon. Smoothing is allowed to
 * change the picture, never the answer.
 */

import type { MultiPolygon, Ring } from "../lib/geometry";

/**
 * One pass of Chaikin corner cutting on a closed ring: every corner is
 * replaced by the points a quarter and three quarters along its two edges.
 * Each pass halves the visible step and doubles the vertices.
 */
function cutCorners(ring: Ring): Ring {
  const out: Ring = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
    out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
  }
  // Chaikin leaves the ring open; close it so it is still a valid polygon.
  out.push(out[0]!);
  return out;
}

/**
 * Two passes: one still reads as steps, three costs vertices without looking
 * any different at the zooms this map uses.
 */
const PASSES = 2;

/** Rings shorter than a triangle have no corners worth cutting. */
const MIN_RING = 4;

/**
 * Keyed on the contour's identity, which the reach cache keeps stable for a
 * given origin and minute, so a dial scrub redraws from this rather than
 * recomputing the same curve every frame.
 */
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
