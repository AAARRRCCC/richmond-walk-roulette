import { areaSqMeters, collectPolygons, pointKey, type LngLat, type MultiPolygon } from "./geometry";
import { postJson } from "./http";
import { isFiniteNumber, isJsonArray, isJsonObject, isString, readJson, type Json } from "./json";
import { LruMap } from "./lru";

type Band = {
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
/**
 * The engine's own ceiling, not ours: FOSSGIS's instance refuses a pedestrian
 * isochrone past 100 minutes ("Exceeded max time: 100"). A self-hosted
 * Valhalla can be configured higher; raise this and the proxy's cap together,
 * and regenerate the snapshots, if that ever happens.
 */
export const MAX_MINUTES = 100;

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

/** @public - also read by scripts/build-reach.mjs when generating snapshots. */
export const LADDER: readonly number[] = Array.from(
  { length: Math.floor((MAX_MINUTES - MIN_MINUTES) / DIAL_STEP) + 1 },
  (_, i) => MIN_MINUTES + i * DIAL_STEP,
);

/**
 * Inner contours used to snap to five-minute marks so a handful of them were
 * shared across every dial position. The whole ladder is prefetched at
 * one-minute resolution now, so that saved nothing and only made the inner
 * bands lurch while the outer one moved smoothly.
 */
const INNER_STEP = 1;
const BAND_COUNT = 3;

/**
 * Minute marks to draw for a budget, innermost first, always ending at the
 * budget itself. The inner marks snap to `INNER_STEP`, so every mark is a
 * ladder value and the warm-up covers all of them.
 */
function bandMinutes(budgetMinutes: number): number[] {
  const marks = new Set<number>();
  for (let k = 1; k < BAND_COUNT; k++) {
    const raw = (budgetMinutes * k) / BAND_COUNT;
    // Floored at the ladder's own start, not at the step: a mark below
    // MIN_MINUTES has no contour behind it and would strand the whole reach.
    const snapped = Math.max(MIN_MINUTES, Math.round(raw / INNER_STEP) * INNER_STEP);
    // Keep a visible gap so two contours never render on top of each other.
    if (snapped <= budgetMinutes - 3) marks.add(snapped);
  }
  return [...marks].toSorted((a, b) => a - b).concat(budgetMinutes);
}

/**
 * Precomputed reach for the preset origins.
 *
 * A cold start on a known origin would otherwise spend the whole ladder on the
 * engine: against an instance with the stock contour limit that is fourteen
 * sequential queries before the first contour draws. The snapshots are built
 * by `scripts/build-reach.mjs` and served as static files, so the same start
 * costs one request the browser can also cache between visits.
 *
 * The filename is derived from the origin alone, so nothing here needs to know
 * which origins are presets; an origin without a snapshot just takes the
 * engine path. `version` guards the shape of the file, and a snapshot whose
 * contours were built at a different walking speed is stale in a way no code
 * can detect - regenerate it when WALKING_SPEED_KMH changes.
 */
/** @public - the generator stamps this into every file it writes. */
export const SNAPSHOT_VERSION = 1;

/**
 * @public - the generator names its output files with this.
 * Derived from `pointKey` so a snapshot is always filed under the same
 * coordinates the cache looks it up by; the comma is only swapped out to keep
 * the name plain.
 */
export function snapshotName(origin: LngLat): string {
  return `${pointKey(origin).replace(",", "_")}.json`;
}

/** Seeds the contour cache from a snapshot. False when there is not one. */
async function seedFromSnapshot(origin: LngLat): Promise<boolean> {
  let payload: Json;
  try {
    const response = await fetch(`/reach/${snapshotName(origin)}`);
    if (!response.ok) return false;
    payload = await readJson(response);
  } catch {
    return false;
  }

  if (!isJsonObject(payload) || payload.version !== SNAPSHOT_VERSION) return false;
  const contours = payload.contours;
  if (!isJsonObject(contours)) return false;

  let seeded = 0;
  for (const minutes of LADDER) {
    const polygons = collectPolygons(contours[String(minutes)] ?? null);
    if (polygons.length === 0) continue;
    cache.set(cacheKey(origin, minutes), polygons);
    seeded++;
  }
  return seeded > 0;
}

/** The whole ladder for a couple of origins, times a safety margin. */
const CACHE_LIMIT = 180;
const cache = new LruMap<string, MultiPolygon>(CACHE_LIMIT);
const inFlight = new Map<string, Promise<MultiPolygon>>();

function cacheKey(origin: LngLat, minutes: number): string {
  return `${pointKey(origin)}|${minutes}`;
}

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
    const failure = await readJson(response).catch(() => null);
    const detailValue = isJsonObject(failure) ? failure.detail : undefined;
    const detail = isString(detailValue) ? detailValue : undefined;
    if (response.status === 503) throw new NotConfiguredError(detail);
    throw new Error(detail ?? `Isochrone request failed (${response.status}).`);
  }

  const payload = await readJson(response);
  const features = isJsonObject(payload) && isJsonArray(payload.features) ? payload.features : [];
  const byMinute = new Map<number, MultiPolygon>();
  for (const feature of features) {
    if (!isJsonObject(feature)) continue;
    const properties = feature.properties;
    const contour = isJsonObject(properties) ? properties.contour : undefined;
    if (!isFiniteNumber(contour)) continue;
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
const assembled = new LruMap<string, Reach>(ASSEMBLED_LIMIT);

/**
 * Assembles a reach from cache alone, or returns null if any contour is still
 * outstanding. This is the path the dial takes, which is why moving it repaints
 * within a frame instead of after a round trip.
 */
export function cachedReach(origin: LngLat, budgetMinutes: number): Reach | null {
  const key = cacheKey(origin, budgetMinutes);
  // Peeked, not promoted: this runs on every render, and the identity these
  // entries provide matters more than which one is oldest.
  const memo = assembled.peek(key);
  if (memo) return memo;

  const bands: Band[] = [];
  for (const minutes of bandMinutes(budgetMinutes)) {
    const polygons = cache.peek(cacheKey(origin, minutes));
    if (!polygons) return null;
    bands.push({ minutes, polygons });
  }

  const reach: Reach = {
    origin,
    budgetMinutes,
    bands,
    areaSqMeters: areaSqMeters(bands[bands.length - 1]!.polygons),
  };
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
  if (failed?.status === "rejected") throw failed.reason;
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
  if (await seedFromSnapshot(origin)) {
    onProgress({ done: 1, total: 1 });
    return;
  }
  const results = await ensureContours(origin, LADDER);
  onProgress({ done: 1, total: 1 });

  const configFailure = results.find(
    (r) => r.status === "rejected" && r.reason instanceof NotConfiguredError,
  );
  if (configFailure?.status === "rejected") throw configFailure.reason;
}
