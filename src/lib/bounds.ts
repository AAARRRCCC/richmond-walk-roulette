/**
 * The one bounding box in this repo.
 *
 * The proxy rejects any request outside it: the app is about one city, and
 * without a bound a leaked endpoint is a free worldwide routing service on
 * whatever box hosts the engine. It lives here rather than in `server/proxy.ts`
 * because more than the proxy needs to agree with it — the place-data checks
 * assert every coordinate falls inside it, and `geolocate` refuses a fix beyond
 * it. A box restated in three files is three boxes waiting to disagree.
 *
 * Generous on purpose. It is an abuse limit, not a definition of Richmond: a
 * walker on the far side of the county should be refused by the accuracy floor
 * or by an empty pool, with a reason, rather than by a 400 from the proxy.
 *
 * @public - read by scripts/verify-places.mjs, which loads it through Vite, and
 * by `geolocate` from chunk 6 onward. Neither is an import knip can see.
 */
export const BOUNDS = { south: 37.3, west: -77.9, north: 37.8, east: -77.1 } as const;

/** True when a point is inside {@link BOUNDS}, edges included. */
export function withinBounds(lat: number, lng: number): boolean {
  if (lat < BOUNDS.south || lat > BOUNDS.north) return false;
  if (lng < BOUNDS.west || lng > BOUNDS.east) return false;
  return true;
}
