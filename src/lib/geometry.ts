/** Geometry helpers for isochrone polygons. All coordinates are [lng, lat]. */

export type Position = readonly [number, number];
/** Exterior ring first, interior rings (holes) after. */
export type Ring = readonly Position[];
export type Polygon = readonly Ring[];
export type MultiPolygon = readonly Polygon[];

export type LngLat = { lng: number; lat: number };
export type Bounds = { west: number; south: number; east: number; north: number };

/**
 * Pulls every Polygon out of an arbitrary RFC 7946 document: a bare geometry,
 * a Feature, a FeatureCollection, or a GeometryCollection. Valhalla returns
 * Feature(Collection)s today, but accepting the whole family is what made the
 * Google-to-Valhalla provider swap a no-op here.
 */
export function collectPolygons(geoJson: unknown): MultiPolygon {
  const out: Polygon[] = [];
  visit(geoJson, out, 0);
  return out;
}

function visit(node: unknown, out: Polygon[], depth: number): void {
  if (depth > 8 || typeof node !== "object" || node === null) return;
  const record = node as Record<string, unknown>;

  switch (record.type) {
    case "FeatureCollection":
      if (Array.isArray(record.features)) {
        for (const feature of record.features) visit(feature, out, depth + 1);
      }
      return;
    case "GeometryCollection":
      if (Array.isArray(record.geometries)) {
        for (const geometry of record.geometries) visit(geometry, out, depth + 1);
      }
      return;
    case "Feature":
      visit(record.geometry, out, depth + 1);
      return;
    case "Polygon": {
      const polygon = asPolygon(record.coordinates);
      if (polygon) out.push(polygon);
      return;
    }
    case "MultiPolygon": {
      if (!Array.isArray(record.coordinates)) return;
      for (const candidate of record.coordinates) {
        const polygon = asPolygon(candidate);
        if (polygon) out.push(polygon);
      }
      return;
    }
    default:
      return;
  }
}

function asPolygon(coordinates: unknown): Polygon | null {
  if (!Array.isArray(coordinates)) return null;
  const rings: Ring[] = [];
  for (const rawRing of coordinates) {
    if (!Array.isArray(rawRing) || rawRing.length < 4) continue;
    const ring: Position[] = [];
    for (const rawPosition of rawRing) {
      if (!Array.isArray(rawPosition)) continue;
      const [lng, lat] = rawPosition as unknown[];
      if (typeof lng === "number" && typeof lat === "number") ring.push([lng, lat]);
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

export function boundsOf(polygons: MultiPolygon): Bounds | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const rings of polygons) {
    for (const position of rings[0] ?? []) {
      if (position[0] < west) west = position[0];
      if (position[0] > east) east = position[0];
      if (position[1] < south) south = position[1];
      if (position[1] > north) north = position[1];
    }
  }
  return Number.isFinite(west) ? { west, south, east, north } : null;
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

/** Great-circle distance in metres. */
export function distanceMeters(a: LngLat, b: LngLat): number {
  const dLat = (b.lat - a.lat) * DEG;
  const dLng = (b.lng - a.lng) * DEG;
  const meanLat = ((a.lat + b.lat) / 2) * DEG;
  const x = dLng * Math.cos(meanLat);
  return Math.hypot(x, dLat) * EARTH_RADIUS_M;
}
