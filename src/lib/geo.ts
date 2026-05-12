import type { POI, StartLocation } from "../data/pois";

export const WALK_FACTOR = 1.25;

export const MONROE_PARK_LAT = 37.5479;
export const MONROE_PARK_LNG = -77.4502;
const MILES_PER_DEG_LAT = 69;
const MILES_PER_DEG_LNG_AT_RVA = 54.8;

export type LngLat = { lng: number; lat: number };
export type MileXY = { x: number; y: number };

export function toLngLat(p: MileXY): LngLat {
  return {
    lng: MONROE_PARK_LNG + p.x / MILES_PER_DEG_LNG_AT_RVA,
    lat: MONROE_PARK_LAT + p.y / MILES_PER_DEG_LAT,
  };
}

export function fromLngLat(ll: LngLat): MileXY {
  return {
    x: (ll.lng - MONROE_PARK_LNG) * MILES_PER_DEG_LNG_AT_RVA,
    y: (ll.lat - MONROE_PARK_LAT) * MILES_PER_DEG_LAT,
  };
}

export function distanceTo(start: MileXY, poi: MileXY): number {
  const dx = poi.x - start.x;
  const dy = poi.y - start.y;
  return Math.sqrt(dx * dx + dy * dy) * WALK_FACTOR;
}

export function fmtMiles(m: number): string {
  return m.toFixed(1) + " mi";
}

export function fmtMinutes(miles: number): string {
  const mins = Math.round((miles / 3) * 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

export type Range = [number, number];

export function eligiblePoiIds(
  start: MileXY,
  range: Range,
  roundTrip: boolean,
  difficulty: "any" | "flat" | "hilly",
  tags: ReadonlySet<string>,
  pois: readonly POI[],
): Set<string> {
  const [minR, maxR] = range;
  const set = new Set<string>();
  for (const p of pois) {
    const oneWay = distanceTo(start, p);
    const total = roundTrip ? oneWay * 2 : oneWay;
    if (total < minR || total > maxR) continue;
    if (difficulty !== "any" && p.difficulty !== difficulty) continue;
    if (tags.size > 0 && !p.tags.some((t) => tags.has(t))) continue;
    set.add(p.id);
  }
  return set;
}

export function findStart(
  startId: string,
  custom: StartLocation | null,
  starts: readonly StartLocation[],
): StartLocation {
  if (custom) return custom;
  return starts.find((s) => s.id === startId) ?? starts[0]!;
}
