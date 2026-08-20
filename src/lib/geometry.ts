/** Geometry helpers for isochrone polygons. All coordinates are [lng, lat]. */

import { isFiniteNumber, isJsonArray, isJsonObject, type Json } from "./json.ts";

/**
 * Mutable on purpose: these tuples are structurally assignable to GeoJSON's
 * `number[]` positions, so handing a MultiPolygon to MapLibre needs no
 * assertion. Nothing outside this module mutates them.
 */
type Position = [number, number];
/** Exterior ring first, interior rings (holes) after. Exported for the map's
 *  display-side smoothing, which rebuilds rings; nothing else names it. */
export type Ring = Position[];
type Polygon = Ring[];
export type MultiPolygon = Polygon[];

export type LngLat = { lng: number; lat: number };

/**
 * Decimal places a point is identified by. Five is about 1.1 m, far finer
 * than any distinction this app draws between two places to start from.
 *
 * Load-bearing rather than cosmetic: the contour cache, the route cache and
 * the precomputed snapshot filenames all name an origin through `pointKey`,
 * so these have to agree or a snapshot silently stops matching the key the
 * app looks it up by. Changing it means regenerating `public/reach/`.
 *
 * This is identity, not display. The vertices inside a snapshot are rounded
 * coarser than this by scripts/build-reach.mjs, because a contour vertex is a
 * point on a 25 m grid that gets smoothed before it is drawn, while an origin
 * has to hash to the same string everywhere or the snapshot goes missing.
 *
 * @public - the snapshot file names that generator writes come from here
 * through `snapshotName`, so changing it means regenerating public/reach/.
 */
export const COORD_PRECISION = 5;

/** Stable identity for a point, for cache keys and file names. */
export function pointKey(point: LngLat): string {
  return `${point.lat.toFixed(COORD_PRECISION)},${point.lng.toFixed(COORD_PRECISION)}`;
}

/**
 * Pulls every Polygon out of an arbitrary RFC 7946 document: a bare geometry,
 * a Feature, a FeatureCollection, or a GeometryCollection. Valhalla returns
 * Feature(Collection)s today, but accepting the whole family is what made the
 * Google-to-Valhalla provider swap a no-op here.
 */
export function collectPolygons(geoJson: Json): MultiPolygon {
  const out: Polygon[] = [];
  visit(geoJson, out, 0);
  return out;
}

function visit(node: Json | undefined, out: Polygon[], depth: number): void {
  if (depth > 8 || !isJsonObject(node)) return;

  switch (node.type) {
    case "FeatureCollection": {
      const features = node.features;
      if (isJsonArray(features)) {
        for (const feature of features) visit(feature, out, depth + 1);
      }
      return;
    }
    case "GeometryCollection": {
      const geometries = node.geometries;
      if (isJsonArray(geometries)) {
        for (const geometry of geometries) visit(geometry, out, depth + 1);
      }
      return;
    }
    case "Feature":
      visit(node.geometry, out, depth + 1);
      return;
    case "Polygon": {
      const polygon = asPolygon(node.coordinates);
      if (polygon) out.push(polygon);
      return;
    }
    case "MultiPolygon": {
      const coordinates = node.coordinates;
      if (!isJsonArray(coordinates)) return;
      for (const candidate of coordinates) {
        const polygon = asPolygon(candidate);
        if (polygon) out.push(polygon);
      }
      return;
    }
    default:
      return;
  }
}

function asPolygon(coordinates: Json | undefined): Polygon | null {
  if (!isJsonArray(coordinates)) return null;
  const rings: Ring[] = [];
  for (const rawRing of coordinates) {
    if (!isJsonArray(rawRing) || rawRing.length < 4) continue;
    const ring: Position[] = [];
    for (const rawPosition of rawRing) {
      if (!isJsonArray(rawPosition)) continue;
      const [lng, lat] = rawPosition;
      if (isFiniteNumber(lng) && isFiniteNumber(lat)) ring.push([lng, lat]);
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return rings.length > 0 ? rings : null;
}

/** Crossing-number test. Points exactly on an edge are not guaranteed either way. */
function ringContains(ring: Ring, lng: number, lat: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    const straddles = a[1] > lat !== b[1] > lat;
    if (!straddles) continue;
    const crossingLng = ((b[0] - a[0]) * (lat - a[1])) / (b[1] - a[1]) + a[0];
    if (lng < crossingLng) inside = !inside;
  }
  return inside;
}

/** True when the point is inside any polygon's exterior ring and outside its holes. */
export function contains(polygons: MultiPolygon, point: LngLat): boolean {
  for (const rings of polygons) {
    const exterior = rings[0];
    if (!exterior || !ringContains(exterior, point.lng, point.lat)) continue;
    let inHole = false;
    for (let i = 1; i < rings.length; i++) {
      if (ringContains(rings[i]!, point.lng, point.lat)) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return false;
}

/**
 * The outer reach with the inner one punched out of it: everywhere you can get
 * to within the upper bound but NOT within the lower one.
 *
 * Isochrones from one origin are strictly nested - the 20 minute shape lies
 * wholly inside the 60 minute shape - so the difference needs no clipping
 * library. The inner shape's exterior ring becomes a hole in whichever outer
 * polygon contains it, which is the same thing the engine already does for an
 * unreachable pocket, and every reader of a MultiPolygon here already honours
 * holes: `contains` tests them, `areaSqMeters` subtracts them, and MapLibre
 * renders them with the even-odd rule.
 *
 * An inner polygon that matches no outer polygon is dropped rather than kept,
 * because a hole with nothing around it is not a hole.
 */
export function subtract(outer: MultiPolygon, inner: MultiPolygon): MultiPolygon {
  if (inner.length === 0) return outer;

  const innerExteriors = inner.map((rings) => rings[0]).filter((ring) => ring !== undefined);
  if (innerExteriors.length === 0) return outer;

  return outer.map((rings) => {
    const exterior = rings[0];
    if (!exterior) return rings;
    const holes = innerExteriors.filter((ring) => {
      const anchor = ring[0];
      return anchor !== undefined && ringContains(exterior, anchor[0], anchor[1]);
    });
    return holes.length === 0 ? rings : [...rings, ...holes];
  });
}

const EARTH_RADIUS_M = 6_378_137;
const DEG = Math.PI / 180;

/**
 * Shoelace area on a local equirectangular projection, in square metres. Good
 * to well under a percent at city scale, which is all the readout needs.
 *
 * Interior rings are subtracted explicitly rather than relying on winding
 * order: RFC 7946 mandates right-hand-rule winding, but the isochrone
 * geometry is generated upstream and a wrong-wound hole would silently
 * inflate the reachable area instead of shrinking it.
 */
export function areaSqMeters(polygons: MultiPolygon): number {
  let total = 0;
  for (const rings of polygons) {
    const exterior = rings[0];
    if (!exterior) continue;
    // One reference latitude per polygon keeps the exterior and its holes on
    // the same projection, so the subtraction stays consistent.
    let latSum = 0;
    for (const position of exterior) latSum += position[1];
    const scale =
      0.5 * EARTH_RADIUS_M * EARTH_RADIUS_M * Math.cos((latSum / exterior.length) * DEG);

    let polygonArea = Math.abs(shoelace(exterior)) * scale;
    for (let i = 1; i < rings.length; i++) {
      polygonArea -= Math.abs(shoelace(rings[i]!)) * scale;
    }
    if (polygonArea > 0) total += polygonArea;
  }
  return total;
}

/** Shoelace sum in squared radians; caller applies the projection scale. */
function shoelace(ring: Ring): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    sum += (b[0] - a[0]) * DEG * ((a[1] + b[1]) * DEG);
  }
  return sum;
}
