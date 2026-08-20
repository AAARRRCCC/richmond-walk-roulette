import { pointKey, type LngLat } from "./geometry";
import { pooled } from "./pool";
import { postJson } from "./http";
import { isFiniteNumber, isJsonArray, isJsonObject, isString, readJson } from "./json";
import { LruMap } from "./lru";

export type WalkingRoute = {
  coords: LngLat[];
  distanceMeters: number;
  durationSeconds: number;
};

/**
 * Cached in place of a route when an attempt settled without one for a reason
 * that could be different next time: a rate limit, a dropped connection, an
 * engine that is not configured yet.
 *
 * Not `null`, which means the engine answered and there is no walking route
 * between these two points. That is a fact about the city; this is a fact
 * about one attempt, and a card that rendered "no route" for a rate-limited
 * request would be inventing the first from the second.
 */
const FAILED = Symbol("route attempt failed");

type CacheEntry = WalkingRoute | null | typeof FAILED;

/** Every destination for a few origins, so revisiting a start stays instant. */
const CACHE_LIMIT = 200;
const cache = new LruMap<string, CacheEntry>(CACHE_LIMIT);
const inFlight = new Map<string, Promise<WalkingRoute | null>>();

/** How many times a warm-up of any size reports progress in the middle. */
const PROGRESS_STEPS = 10;

function cacheKey(origin: LngLat, destination: LngLat): string {
  return `${pointKey(origin)}|${pointKey(destination)}`;
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
 * A transient failure is recorded rather than answered. It is never read back
 * as a result - the next call takes the request again, so a rate limit during
 * the warm-up burst does not blank a destination for the session - but it is
 * on the record, so `routeFailed` can tell a caller the difference between a
 * route that is still coming and one that is not.
 */
export function fetchWalkingRoute(
  origin: LngLat,
  destination: LngLat,
): Promise<WalkingRoute | null> {
  const key = cacheKey(origin, destination);

  const settled = cache.get(key);
  if (settled !== undefined && settled !== FAILED) return Promise.resolve(settled);

  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = requestRoute(origin, destination)
    .then((route) => {
      cache.set(key, route);
      return route;
    })
    .catch(() => {
      cache.set(key, FAILED);
      return null;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}

/**
 * Synchronous cache read. Undefined means "nothing to draw", null means the
 * engine says there is no walking route between these points.
 * Peeked, not promoted: the render path reads this for every candidate.
 *
 * A settled failure reads as undefined here, because there is no line for it
 * either. `routeFailed` is what separates the two.
 */
export function cachedRoute(origin: LngLat, destination: LngLat): WalkingRoute | null | undefined {
  const entry = cache.peek(cacheKey(origin, destination));
  return entry === FAILED ? undefined : entry;
}

/**
 * True when the last attempt for this pair finished without a route and no
 * retry is running. Pair it with `cachedRoute`: undefined and not failed is
 * still loading, undefined and failed is a dash and a retry rather than a
 * skeleton that shimmers for the rest of the session.
 *
 * False again the moment a retry is in flight, so a card that answers this
 * goes back to loading while the retry runs.
 */
export function routeFailed(origin: LngLat, destination: LngLat): boolean {
  const key = cacheKey(origin, destination);
  return cache.peek(key) === FAILED && !inFlight.has(key);
}

/**
 * Warms routes to every destination the spinner could land on. Without this the
 * reel ticks through names with an empty map behind it and only draws a line
 * once it stops, which throws away the most legible part of the animation.
 *
 * `signal` stops the pool from starting work it has not started yet. Six
 * requests are in flight at a time, so clicking through to another origin
 * abandons dozens of route requests for a map nobody is looking at instead of
 * racing them against the one on screen.
 */
export async function prefetchRoutes(
  origin: LngLat,
  destinations: readonly LngLat[],
  onProgress?: (done: number, total: number) => void,
  options?: { signal?: AbortSignal },
): Promise<void> {
  const total = destinations.length;
  const step = Math.max(1, Math.ceil(total / PROGRESS_STEPS));
  let done = 0;
  let reported = 0;
  let scheduled = false;

  const report = (): void => {
    if (!onProgress || scheduled) return;
    scheduled = true;
    // A microtask, so completions landing in the same turn share one report.
    queueMicrotask(() => {
      scheduled = false;
      if (done === reported) return;
      reported = done;
      onProgress(done, total);
    });
  };

  await pooled(
    destinations.map((destination) => async () => {
      if (options?.signal?.aborted) return null;
      const route = await fetchWalkingRoute(origin, destination);
      done++;
      // The first route matters, because it is what lets the reel show a real
      // walk; the last one matters. In between, tenths are as fine as any
      // progress a reader can use - and every report in between is a React
      // render that re-runs the whole candidate sweep for nothing.
      if (done === 1 || done === total || done % step === 0) report();
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
