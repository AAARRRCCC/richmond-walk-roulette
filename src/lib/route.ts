import type { LngLat } from "./geometry";
import { pooled } from "./pool";
import { postJson } from "./http";
import { isFiniteNumber, isJsonArray, isJsonObject, isString, readJson } from "./json";
import { LruMap } from "./lru";

export type WalkingRoute = {
  coords: LngLat[];
  distanceMeters: number;
  durationSeconds: number;
};

/** Every destination for a few origins, so revisiting a start stays instant. */
const CACHE_LIMIT = 200;
const cache = new LruMap<string, WalkingRoute | null>(CACHE_LIMIT);
const inFlight = new Map<string, Promise<WalkingRoute | null>>();

function cacheKey(origin: LngLat, destination: LngLat): string {
  return `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}|${destination.lat.toFixed(5)},${destination.lng.toFixed(5)}`;
}

async function requestRoute(origin: LngLat, destination: LngLat): Promise<WalkingRoute | null> {
  const response = await postJson("/api/route", {
    origin: { latitude: origin.lat, longitude: origin.lng },
    destination: { latitude: destination.lat, longitude: destination.lng },
  });

  // postJson has already retried the transient statuses. Anything still
  // failing here is the server's final word, except 503, which means the
  // engine is not configured and will start working the moment it is.
  if (response.status === 503) throw new Error("route service not configured");
  if (!response.ok) return null;

  // Valhalla's trip JSON: legs carry a polyline under the wire key "shape";
  // with `units: "kilometers"` the summary's length is km and time seconds.
  const payload = await readJson(response);
  const trip = isJsonObject(payload) && isJsonObject(payload.trip) ? payload.trip : undefined;
  const legs = trip && isJsonArray(trip.legs) ? trip.legs : [];

  const coords: LngLat[] = [];
  for (const leg of legs) {
    if (!isJsonObject(leg)) continue;
    const encodedPolyline = leg["shape"];
    if (isString(encodedPolyline)) coords.push(...decodePolyline(encodedPolyline));
  }
  if (coords.length === 0) return null;

  const summary = trip && isJsonObject(trip.summary) ? trip.summary : undefined;
  const lengthKm = summary && isFiniteNumber(summary.length) ? summary.length : 0;
  const timeSeconds = summary && isFiniteNumber(summary.time) ? summary.time : 0;

  return {
    coords,
    distanceMeters: Math.round(lengthKm * 1000),
    durationSeconds: timeSeconds,
  };
}

/**
 * A genuine "no walking route" is cached as null: it will not become reachable
 * on a retry, and re-asking on every spin tick would be a request per frame.
 *
 * A transient failure is deliberately *not* cached. Caching a rate-limited
 * response would blank that destination's route for the rest of the session,
 * and the warm-up burst is exactly when rate limiting is most likely.
 */
export function fetchWalkingRoute(
  origin: LngLat,
  destination: LngLat,
): Promise<WalkingRoute | null> {
  const key = cacheKey(origin, destination);

  if (cache.has(key)) return Promise.resolve(cache.get(key) ?? null);

  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = requestRoute(origin, destination)
    .then((route) => {
      cache.set(key, route);
      return route;
    })
    .catch(() => null)
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}

/**
 * Synchronous cache read. Undefined means "not fetched", null means "no route".
 * Peeked, not promoted: the render path reads this for every candidate.
 */
export function cachedRoute(origin: LngLat, destination: LngLat): WalkingRoute | null | undefined {
  return cache.peek(cacheKey(origin, destination));
}

/**
 * Warms routes to every destination the spinner could land on. Without this the
 * reel ticks through names with an empty map behind it and only draws a line
 * once it stops, which throws away the most legible part of the animation.
 */
export async function prefetchRoutes(
  origin: LngLat,
  destinations: readonly LngLat[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  let done = 0;
  await pooled(
    destinations.map((destination) => async () => {
      const route = await fetchWalkingRoute(origin, destination);
      onProgress?.(++done, destinations.length);
      return route;
    }),
    6,
  );
}

/**
 * Valhalla encodes shapes with the same algorithm Google documents, but at
 * six decimal places rather than five; the 1e6 divisor is the whole
 * difference. https://valhalla.github.io/valhalla/decoding/
 */
function decodePolyline(encoded: string): LngLat[] {
  const points: LngLat[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ lat: lat / 1e6, lng: lng / 1e6 });
  }
  return points;
}
