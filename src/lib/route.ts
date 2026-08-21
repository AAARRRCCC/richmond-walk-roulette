import { pointKey, type LngLat } from "./geometry";
import { pooled } from "./pool";
import { postJson } from "./http";
import { isFiniteNumber, isJsonArray, isJsonObject, isString, readJson, type Json } from "./json";
import { LruMap } from "./lru";
import { flush, rememberRoute, storedRoute } from "./route-store.ts";
import { ELEVATION_HYSTERESIS_M, climbFrom, plausibleProfile } from "./elevation.ts";

/**
 * Metres above sea level along the walk, evenly spaced. Sample `i` sits at
 * `i * intervalMeters` from the start, so the profile spans
 * `(samples.length - 1) * intervalMeters` - which is the walk's length as this
 * profile measures it, and is **not** the same number as the trip summary's.
 * Anything that scrubs, draws or labels this profile uses the span above, or it
 * will put the cursor in the wrong place by the difference.
 */
export type ElevationProfile = {
  samples: number[];
  intervalMeters: number;
  /** Metres gained, with small oscillations suppressed. See `climbFrom`. */
  ascentMeters: number;
  descentMeters: number;
  minMeters: number;
  maxMeters: number;
};

export type WalkingRoute = {
  coords: LngLat[];
  distanceMeters: number;
  durationSeconds: number;
  /** null when the engine answered without usable elevation. */
  profile: ElevationProfile | null;
};

/**
 * The interval to assume when the engine returns an elevation array without
 * echoing what it sampled at. Matches what the proxy asks for.
 */
const DEFAULT_INTERVAL_M = 30;

/**
 * Whether this engine can measure hills at all.
 *
 * `undefined` until the first route settles, then fixed. It is a fact about the
 * instance, not about one walk, so chunk 3 can disable the Climb filter outright
 * rather than showing a control that silently never matches - which is what an
 * engine built without `build_elevation` would otherwise produce.
 *
 * Module state rather than React state because it is read by the same pure path
 * that fills the cache, including on rehydration from a previous session.
 */
let sawElevation: boolean | undefined;

function noteElevation(hadProfile: boolean): void {
  // Only ever turns on, never back off: one route through a tunnel with no
  // samples does not make an elevation-bearing graph elevation-less.
  if (sawElevation === true) return;
  sawElevation = hadProfile;
}

/** @public - consumed by `elevation-profile` (chunk 3). */
export function elevationAvailable(): boolean | undefined {
  return sawElevation;
}

/**
 * The profile out of one leg, or null.
 *
 * The first leg only, and deliberately: `route()` in `server/proxy.ts` sends
 * exactly two locations, so Valhalla returns exactly one leg, always. A
 * concatenation loop would be dead code that was also wrong if it ever ran - a
 * leg's final interval is a partial one, so joining legs breaks the
 * `i * intervalMeters` rule everything downstream is built on.
 */
function profileFrom(leg: Json): ElevationProfile | null {
  if (!isJsonObject(leg)) return null;
  const raw = leg["elevation"];
  if (!isJsonArray(raw)) return null;

  const samples = raw.filter((value) => isFiniteNumber(value));
  // A non-number anywhere voids the whole profile rather than leaving a hole in
  // it: the samples are positional, and dropping one shifts every later one.
  if (samples.length !== raw.length) return null;
  if (!plausibleProfile(samples)) return null;

  // Echoed in the response's own units. The proxy pins `units: "kilometers"`,
  // so the echo is metres and so is the array. If anything ever changes those
  // pinned units, this reader changes with it.
  const echoed = leg["elevation_interval"];
  const intervalMeters =
    isFiniteNumber(echoed) && echoed > 0 ? echoed : DEFAULT_INTERVAL_M;

  const { ascentMeters, descentMeters } = climbFrom(samples, ELEVATION_HYSTERESIS_M);
  return {
    samples,
    intervalMeters,
    ascentMeters,
    descentMeters,
    minMeters: Math.min(...samples),
    maxMeters: Math.max(...samples),
  };
}

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

/** The route, plus the engine's own encoded legs, which is what gets stored. */
type FetchedRoute = { route: WalkingRoute; encodedLegs: string[] } | null;

async function requestRoute(origin: LngLat, destination: LngLat): Promise<FetchedRoute> {
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

  const encodedLegs: string[] = [];
  const coords: LngLat[] = [];
  for (const leg of legs) {
    if (!isJsonObject(leg)) continue;
    const encodedPolyline = leg["shape"];
    if (!isString(encodedPolyline)) continue;
    encodedLegs.push(encodedPolyline);
    coords.push(...decodePolyline(encodedPolyline));
  }
  if (coords.length === 0) return null;

  const summary = trip && isJsonObject(trip.summary) ? trip.summary : undefined;
  const lengthKm = summary && isFiniteNumber(summary.length) ? summary.length : 0;
  const timeSeconds = summary && isFiniteNumber(summary.time) ? summary.time : 0;

  const profile = profileFrom(legs[0] ?? null);
  noteElevation(profile !== null);

  return {
    route: {
      coords,
      distanceMeters: Math.round(lengthKm * 1000),
      durationSeconds: timeSeconds,
      profile,
    },
    encodedLegs,
  };
}

/**
 * The in-memory answer, falling back to what a previous visit stored.
 *
 * Decoded on the way through and kept in memory afterwards, so the cost is
 * paid once per pair per session rather than on every render.
 */
function entryFor(key: string): CacheEntry | undefined {
  const live = cache.peek(key);
  if (live !== undefined) return live;

  const stored = storedRoute(key);
  if (!stored) return undefined;

  const entry: CacheEntry =
    stored.encodedLegs === null
      ? null
      : {
          coords: stored.encodedLegs.flatMap((leg) => decodePolyline(leg)),
          distanceMeters: stored.distanceMeters,
          durationSeconds: stored.durationSeconds,
          profile:
            stored.profile === undefined
              ? null
              : {
                  samples: stored.profile.e,
                  intervalMeters: stored.profile.i,
                  ascentMeters: stored.profile.up,
                  descentMeters: stored.profile.down,
                  minMeters: Math.min(...stored.profile.e),
                  maxMeters: Math.max(...stored.profile.e),
                },
        };
  // A rehydrated route answers the elevation question as well as a fresh one:
  // a returning visitor whose store is warm would otherwise see the Climb
  // filter disabled until the first cache miss of the session.
  if (entry !== null) noteElevation(entry.profile !== null);
  cache.set(key, entry);
  return entry;
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

  const settled = entryFor(key);
  if (settled !== undefined && settled !== FAILED) return Promise.resolve(settled);

  const pending = inFlight.get(key);
  if (pending) return pending;

  const promise = requestRoute(origin, destination)
    .then((fetched) => {
      const route = fetched?.route ?? null;
      cache.set(key, route);
      // Only settled answers are kept. A transient failure never reaches here.
      const base = {
        encodedLegs: fetched?.encodedLegs ?? null,
        distanceMeters: route?.distanceMeters ?? 0,
        durationSeconds: route?.durationSeconds ?? 0,
      };
      const profile = route?.profile ?? null;
      // Ascent and descent are carried rather than recomputed on read: they are
      // measured here from the unrounded samples, and re-deriving them over
      // whole-metre ones manufactures oscillation the walk never had.
      rememberRoute(
        key,
        profile === null
          ? base
          : {
              ...base,
              profile: {
                i: profile.intervalMeters,
                e: profile.samples.map((sample) => Math.round(sample)),
                up: profile.ascentMeters,
                down: profile.descentMeters,
              },
            },
      );
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
  const entry = entryFor(cacheKey(origin, destination));
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
 * Writes are batched, so a tab closed inside that window would throw away
 * everything the visit just learned. `pagehide` rather than `unload`, which
 * browsers no longer fire reliably and which disqualifies a page from the
 * back-forward cache.
 */
try {
  window.addEventListener("pagehide", flush);
} catch {
  // No window: nothing to flush on the way out either.
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
