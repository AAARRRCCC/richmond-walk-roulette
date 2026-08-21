/**
 * The one box.
 *
 * `server/proxy.ts` rejects any request outside it: the app is about one city,
 * and without a bound a leaked endpoint is a free worldwide routing service on
 * whatever box hosts the engine. It lives here rather than in the proxy because
 * more than the proxy has to agree with it — the client refuses a location fix
 * beyond it *before* dispatching, so the user hears about geography rather than
 * meeting the generic failure panel a 400 produces.
 *
 * The direction of that import matters. The server depending on a
 * dependency-free shared constant is not the boundary this architecture
 * protects; the client importing server policy code is, and that stays
 * rejected. This module imports nothing, touches no DOM and no Node API, so it
 * bundles cleanly into the Worker.
 *
 * Note the scale before writing copy against it: the box is about 55 × 70 km
 * while `PLACES` spans about 6 × 7 km. A fix can be well inside it, produce
 * perfectly good contours, and still reach no destination at all. That is a
 * different state with its own message, and telling someone in Manchester they
 * are not in Richmond is the failure this note exists to prevent.
 */
export type Bounds = { south: number; west: number; north: number; east: number };

/** @public - `geolocate` (chunk 6) checks a fix against it before dispatching. */
export const RICHMOND_BOUNDS: Bounds = { south: 37.3, west: -77.9, north: 37.8, east: -77.1 };

/** True inside {@link RICHMOND_BOUNDS}. Edges count as inside. */
export function insideRichmond(at: { lat: number; lng: number }): boolean {
  if (at.lat < RICHMOND_BOUNDS.south || at.lat > RICHMOND_BOUNDS.north) return false;
  if (at.lng < RICHMOND_BOUNDS.west || at.lng > RICHMOND_BOUNDS.east) return false;
  return true;
}
