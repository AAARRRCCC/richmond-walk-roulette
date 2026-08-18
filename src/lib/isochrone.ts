import { areaSqMeters, collectPolygons, type LngLat, type MultiPolygon } from "./geometry";
import { postJson } from "./http";

export type Band = {
  /** Walking minutes this contour represents. */
  minutes: number;
  polygons: MultiPolygon;
};

export type Reach = {
  origin: LngLat;
  budgetMinutes: number;
  /** Innermost first. The last entry is always the full budget. */
  bands: Band[];
  /** Area of the outermost band. */
  areaSqMeters: number;
};

export class NotConfiguredError extends Error {
  constructor(detail?: string) {
    super(detail ?? "The routing engine is not configured.");
    this.name = "NotConfiguredError";
  }
}

export const MIN_MINUTES = 5;
export const MAX_MINUTES = 60;

/**
 * Dial resolution in minutes.
 *
 * The whole ladder is fetched when an origin is chosen, so a dial position is
 * a cache read rather than a request, and scrubbing the slider repaints the
 * contour and the readout per frame. Valhalla answers every contour on the
 * ladder from a single graph expansion, so a 1 minute ladder costs the engine
 * barely more than a 5 minute one.
 *
 * `TimeDial` takes its `step` and its ticks from here too, so the dial can
 * never land on a value the ladder does not cover.
 */
export const DIAL_STEP = 1;

export const LADDER: readonly number[] = Array.from(
  { length: Math.floor((MAX_MINUTES - MIN_MINUTES) / DIAL_STEP) + 1 },
  (_, i) => MIN_MINUTES + i * DIAL_STEP,
);

/** Snaps an arbitrary minute value onto the ladder. */
export function snapToLadder(minutes: number): number {
  const stepped = Math.round((minutes - MIN_MINUTES) / DIAL_STEP) * DIAL_STEP + MIN_MINUTES;
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, stepped));
}

/** Inner contours snap to this, so they are shared across dial positions. */
const INNER_STEP = 5;
const BAND_COUNT = 3;

/**
 * Minute marks to draw for a budget, innermost first, always ending at the
 * budget itself. The inner marks snap to `INNER_STEP`, so every mark is a
 * ladder value and the warm-up covers all of them.
 */
export function bandMinutes(budgetMinutes: number): number[] {
  const marks = new Set<number>();
  for (let k = 1; k < BAND_COUNT; k++) {
    const raw = (budgetMinutes * k) / BAND_COUNT;
    const snapped = Math.max(INNER_STEP, Math.round(raw / INNER_STEP) * INNER_STEP);
    // Keep a visible gap so two contours never render on top of each other.
    if (snapped <= budgetMinutes - 3) marks.add(snapped);
  }
  return [...marks].sort((a, b) => a - b).concat(budgetMinutes);
}

/** The whole ladder for a couple of origins, times a safety margin. */
const CACHE_LIMIT = 180;
const cache = new Map<string, MultiPolygon>();
const inFlight = new Map<string, Promise<MultiPolygon>>();

function cacheKey(origin: LngLat, minutes: number): string {
  return `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}|${minutes}`;
}

type ContourFeature = { properties?: { contour?: number } };

/**
 * One request for many contours. Valhalla computes a single expansion and
 * cuts every requested contour out of it, so asking for the whole ladder at
 * once is cheaper for the engine than asking minute by minute; the proxy
 * splits it upstream only when the instance's `max_contours` demands it.
 */
async function requestContours(
  origin: LngLat,
  minutes: readonly number[],
): Promise<Map<number, MultiPolygon>> {
  const response = await postJson("/api/isochrone", {
    location: { latitude: origin.lat, longitude: origin.lng },
    minutes,
  });

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const detail =
      typeof body === "object" && body !== null && "detail" in body && typeof body.detail === "string"
        ? body.detail
        : undefined;
    if (response.status === 503) throw new NotConfiguredError(detail);
    throw new Error(detail ?? `Isochrone request failed (${response.status}).`);
  }

  const payload = (await response.json()) as { features?: ContourFeature[] };
  const byMinute = new Map<number, MultiPolygon>();
  for (const feature of payload.features ?? []) {
    const contour = feature.properties?.contour;
    if (typeof contour !== "number") continue;
    const polygons = collectPolygons(feature);
    if (polygons.length > 0) byMinute.set(contour, polygons);
  }
  if (byMinute.size === 0) throw new Error("The engine returned no reachable area.");
  return byMinute;
}

/**
 * Fills the cache for every requested minute, deduplicated against contours
 * already cached or in flight, in as few requests as possible.
 *
 * Deliberately not abortable: a batch already in flight is about to warm the
 * whole dial, which is worth finishing whatever the user does next. Callers
 * discard stale results by comparing the origin instead.
 *
 * Returns one settled result per requested minute. A minute can fail alone,
 * because Valhalla drops a contour it considers degenerate; the callers
 * decide whether that is fatal.
 */
function ensureContours(
  origin: LngLat,
  wanted: readonly number[],
): Promise<PromiseSettledResult<MultiPolygon>[]> {
  const jobs: Promise<MultiPolygon>[] = [];
  const missing: number[] = [];

  for (const minutes of wanted) {
    const key = cacheKey(origin, minutes);
    const cached = cache.get(key);
    if (cached) {
      // Map iterates in insertion order, so re-inserting moves this entry to
      // the tail and keeps the eviction below honest.
      cache.delete(key);
      cache.set(key, cached);
      jobs.push(Promise.resolve(cached));
      continue;
    }
    const pending = inFlight.get(key);
    if (pending) {
      jobs.push(pending);
      continue;
    }
    missing.push(minutes);
  }

  if (missing.length > 0) {
    const batch = requestContours(origin, missing);
    for (const minutes of missing) {
      const key = cacheKey(origin, minutes);
      const promise = batch
        .then((byMinute) => {
          const polygons = byMinute.get(minutes);
          if (!polygons) throw new Error(`No reachable area at ${minutes} minutes.`);
          if (cache.size >= CACHE_LIMIT) {
            const oldest = cache.keys().next();
            if (!oldest.done) cache.delete(oldest.value);
          }
          cache.set(key, polygons);
          return polygons;
        })
        .finally(() => {
          inFlight.delete(key);
        });
      inFlight.set(key, promise);
      jobs.push(promise);
    }
  }

  return Promise.allSettled(jobs);
}

/**
 * Assembled reaches, so repeated reads of the same dial position return the
 * *same object*. Callers put this straight into React props and effect
 * dependencies; a fresh object every render would resend every GeoJSON source
 * to the map on every frame of a drag.
 *
 * Never invalidated on insert: a stored contour is immutable and the contour
 * cache only ever fills a missing key, so a newly arrived contour cannot
 * stale an already assembled reach. An entry whose contours have since been
 * evicted still holds them by reference and stays correct.
 */
const ASSEMBLED_LIMIT = 60;
const assembled = new Map<string, Reach>();

/**
 * Assembles a reach from cache alone, or returns null if any contour is still
 * outstanding. This is the path the dial takes, which is why moving it repaints
 * within a frame instead of after a round trip.
 */
export function cachedReach(origin: LngLat, budgetMinutes: number): Reach | null {
  const key = cacheKey(origin, budgetMinutes);
  const memo = assembled.get(key);
  if (memo) return memo;

  const bands: Band[] = [];
  for (const minutes of bandMinutes(budgetMinutes)) {
    const polygons = cache.get(cacheKey(origin, minutes));
    if (!polygons) return null;
    bands.push({ minutes, polygons });
  }

  const reach: Reach = {
    origin,
    budgetMinutes,
    bands,
    areaSqMeters: areaSqMeters(bands[bands.length - 1]!.polygons),
  };
  if (assembled.size >= ASSEMBLED_LIMIT) {
    const oldest = assembled.keys().next();
    if (!oldest.done) assembled.delete(oldest.value);
  }
  assembled.set(key, reach);
  return reach;
}

/**
 * True when every contour a budget needs is already cached, so the dial can
 * mark which positions are instant and which still have to be fetched.
 */
export function isWarm(origin: LngLat, budgetMinutes: number): boolean {
  return bandMinutes(budgetMinutes).every((m) => cache.has(cacheKey(origin, m)));
}

/**
 * Fetches only the contours a single budget needs, then assembles from cache
 * so the result shares identity with every later read of the same position.
 */
export async function fetchReach(origin: LngLat, budgetMinutes: number): Promise<Reach> {
  const results = await ensureContours(origin, bandMinutes(budgetMinutes));
  const reach = cachedReach(origin, budgetMinutes);
  if (reach) return reach;

  // Every band this budget needs was requested; if the reach still cannot be
  // assembled, the first failure is the reason worth reporting.
  const failed = results.find((r) => r.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason as Error;
  throw new Error("Contours resolved but could not be assembled.");
}

export type PrefetchProgress = { done: number; total: number };

/**
 * Warms every contour on the ladder for an origin so the dial becomes a cache
 * read. One request against a self-hosted engine; the proxy splits it only
 * when the instance's contour limit is lower than the ladder.
 *
 * Best effort per contour: a minute Valhalla dropped as degenerate is simply
 * not warm, and the dial falls back to fetching it on demand, which surfaces
 * the error in context. Only a configuration failure aborts the warm-up,
 * because nothing else will succeed until it is fixed.
 */
export async function prefetchLadder(
  origin: LngLat,
  onProgress: (progress: PrefetchProgress) => void,
): Promise<void> {
  onProgress({ done: 0, total: 1 });
  const results = await ensureContours(origin, LADDER);
  onProgress({ done: 1, total: 1 });

  const configFailure = results.find(
    (r) => r.status === "rejected" && r.reason instanceof NotConfiguredError,
  );
  if (configFailure?.status === "rejected") throw configFailure.reason as Error;
}
