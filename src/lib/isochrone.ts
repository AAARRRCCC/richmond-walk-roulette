import { PRESET_ORIGINS } from "../data/places.ts";
import {
  areaSqMeters,
  collectPolygons,
  pointKey,
  subtract,
  type LngLat,
  type MultiPolygon,
} from "./geometry.ts";
import { postJson } from "./http.ts";
import {
  isFiniteNumber,
  isJsonArray,
  isJsonObject,
  isString,
  parseJson,
  readJson,
  type Json,
} from "./json.ts";
import { LruMap } from "./lru.ts";
import { WALKING_SPEED_KMH } from "./speed.ts";

/**
 * @public - `eligibility.ts`'s tests build reaches by hand, and a fixture that
 * restated this shape would be a second definition of what a band is.
 */
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
 * One entry per dial position, computed once. `isWarm` is called for every
 * one of the dial's 96 ticks on every render, so the uncached version built
 * 96 Sets and ran 96 sorts per render of the panel, on the same thread that
 * is parsing a snapshot.
 */
const bandMarks = new Map<string, readonly number[]>();

/**
 * The least walking, in minutes, that may separate two contours.
 *
 * Three nested shapes are what make a reach read as territory rather than a
 * blob, but only while they are far enough apart to be read as three. Packed
 * closer than this the fills stack into one flat wash and the lines crowd
 * into a single fuzzy edge, which looks worse than simply drawing fewer.
 *
 * It is a floor on the gap, not on the count. A narrow range draws two
 * contours, a very narrow one draws only its own edge, and the app says less
 * rather than saying it illegibly.
 */
const MIN_BAND_SPAN = 5;

/**
 * How many contours a span of minutes can carry. The most `BAND_COUNT` allows
 * and the fewest the span demands.
 */
function bandCount(span: number): number {
  for (let n = BAND_COUNT; n > 1; n--) {
    if (span / n >= MIN_BAND_SPAN) return n;
  }
  return 1;
}

/**
 * Minute marks to draw, innermost first, always ending at the budget itself.
 * Marks snap to `INNER_STEP`, so every one is a ladder value the warm-up
 * already covers.
 *
 * The marks divide the RANGE, not the budget, and how many of them there are
 * comes from how wide that range is. Without a floor the range is the budget
 * and a normal one is still drawn in thirds, as it always was. With one,
 * dividing the budget instead would pile every mark against the outer edge:
 * a 15 to 25 minute range would put its inner bands at 8 and 17, one of them
 * outside the range entirely and the other a minute inside it, so the reach
 * lost its gradient exactly when it became a band. Dividing the range puts
 * them at 18 and 22, evenly across the shape actually drawn.
 *
 * A pure function of two small integers over a fixed domain, so it is
 * memoised and the arrays are frozen: every caller gets the same array back,
 * and none of them can make the memo lie.
 */
export function bandMinutes(budgetMinutes: number, floorMinutes = 0): readonly number[] {
  const key = `${floorMinutes}|${budgetMinutes}`;
  const memo = bandMarks.get(key);
  if (memo) return memo;

  const span = budgetMinutes - floorMinutes;
  const count = bandCount(span);
  const marks = new Set<number>();
  for (let k = 1; k < count; k++) {
    const raw = floorMinutes + (span * k) / count;
    // Floored at the ladder's own start, not at the step: a mark below
    // MIN_MINUTES has no contour behind it and would strand the whole reach.
    const snapped = Math.max(MIN_MINUTES, Math.round(raw / INNER_STEP) * INNER_STEP);
    // Snapping can pull a mark back onto an end it was clear of before it was
    // rounded onto the ladder.
    if (snapped < budgetMinutes && snapped > floorMinutes) marks.add(snapped);
  }

  const computed = Object.freeze([...marks].toSorted((a, b) => a - b).concat(budgetMinutes));
  bandMarks.set(key, computed);
  return computed;
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
 * A snapshot is best effort in both directions: an origin without one takes
 * the engine path, and a file that carries only part of the ladder seeds the
 * part it has while the engine fills the rest.
 */

/**
 * Snapshot build number. Stamped into every file the generator writes, and
 * sent as the query the app fetches the file under.
 *
 * Two jobs, and the second is why it must move: the file name is derived from
 * the origin's coordinates and cannot change, so this query is the only thing
 * that distinguishes one build of a snapshot from the next. `public/_headers`
 * grants `/reach/*` a year of immutable caching on the strength of it. Bump
 * it for *any* regeneration - a new walking speed, a coarser coordinate
 * precision, fresher tiles - or returning visitors keep the file they have.
 *
 * @public - the generator stamps this into every file it writes.
 */
export const SNAPSHOT_VERSION = 3;

/**
 * The oldest build this reader still understands. Every version so far is the
 * same document with more stamped onto it, so an older file loads unchanged;
 * a file claiming a *newer* build might not, and takes the engine path.
 */
const MIN_SNAPSHOT_VERSION = 1;

/**
 * @public - the generator names its output files with this.
 * Derived from `pointKey` so a snapshot is always filed under the same
 * coordinates the cache looks it up by; the comma is only swapped out to keep
 * the name plain.
 */
export function snapshotName(origin: LngLat): string {
  return `${pointKey(origin).replace(",", "_")}.json`;
}

/**
 * The snapshots that actually exist. Without this every dropped pin, dragged
 * marker and "use my location" fetched a 404 to completion before the first
 * byte of the engine request went out - a serial round trip bolted onto the
 * path that is already the slowest one.
 */
const PRESET_SNAPSHOTS = new Set(PRESET_ORIGINS.map(snapshotName));

/**
 * Whether this origin has a baked ladder waiting for it.
 *
 * `geolocate` asks so it can say out loud that a personal origin pays the full
 * warm-up price. The set is the same one the fetch path consults, so the notice
 * cannot disagree with what actually happens.
 *
 * @public - consumed by `geolocate` (chunk 6).
 */
export function hasSnapshot(origin: LngLat): boolean {
  return PRESET_SNAPSHOTS.has(snapshotName(origin));
}

/** 0 to 1 as a ratio, in whatever unit the current phase can honestly count. */
export type PrefetchProgress = { done: number; total: number };

/**
 * Reads a JSON body, reporting bytes as they land.
 *
 * A snapshot is the one download in the app big enough for a fraction to mean
 * anything, and `Response.json()` says nothing at all until the last byte. A
 * response with no stream or no declared length has nothing to be a fraction
 * of, and takes the plain path.
 *
 * `content-length` counts bytes on the wire, and when the server compressed
 * them there are fewer of those than of the bytes read out here. So the total
 * is held one above whatever has arrived once the two disagree: the fraction
 * climbs and then stalls just short of full rather than reading 100% with a
 * megabyte still to come.
 */
async function readJsonWithProgress(
  response: Response,
  onProgress: (progress: PrefetchProgress) => void,
): Promise<Json> {
  const declared = Number(response.headers.get("content-length"));
  const body = response.body;
  if (!body || !Number.isFinite(declared) || declared <= 0) return readJson(response);

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let received = 0;
  let reported = -1;

  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    text += decoder.decode(chunk.value, { stream: true });
    received += chunk.value.length;
    const total = Math.max(declared, received + 1);
    // Coarsened to whole percent: a callback per chunk is a render per chunk,
    // and nothing on screen can show a finer distinction than that.
    const percent = Math.floor((received / total) * 100);
    if (percent !== reported) {
      reported = percent;
      onProgress({ done: received, total });
    }
  }
  return parseJson(text + decoder.decode());
}

/**
 * Seeds the contour cache from a snapshot, for as many ladder minutes as the
 * file actually carries.
 *
 * Returns nothing on purpose. It used to answer "did that work", and one
 * seeded contour out of ninety-six counted as yes, which presented a
 * truncated file as a fully warm dial. The only thing that knows what is
 * still missing is the cache, so the caller asks it.
 */
async function seedFromSnapshot(
  origin: LngLat,
  onProgress: (progress: PrefetchProgress) => void,
  signal: AbortSignal | undefined,
): Promise<void> {
  let payload: Json;
  try {
    const response = await fetch(`/reach/${snapshotName(origin)}?v=${SNAPSHOT_VERSION}`, {
      signal: signal ?? null,
    });
    if (!response.ok) return;
    payload = await readJsonWithProgress(response, onProgress);
  } catch {
    return;
  }

  if (!isJsonObject(payload)) return;
  const version = payload.version;
  if (!isFiniteNumber(version)) return;
  if (version < MIN_SNAPSHOT_VERSION || version > SNAPSHOT_VERSION) return;

  // A file built at a different pace is a different answer to "25 minutes",
  // and serving it beside dropped pins that get the current pace puts two
  // definitions on the same map. Rejecting it is a cache miss, which the
  // engine path already handles. A file that records no pace predates the
  // stamp and is exactly the drift nothing could see; regenerating it stamps
  // one on.
  const speedKmh = payload.speedKmh;
  if (isFiniteNumber(speedKmh) && speedKmh !== WALKING_SPEED_KMH) return;

  const contours = payload.contours;
  if (!isJsonObject(contours)) return;

  for (const minutes of LADDER) {
    const polygons = collectPolygons(contours[String(minutes)] ?? null);
    if (polygons.length === 0) continue;
    cache.set(cacheKey(origin, minutes), polygons);
  }
}

/**
 * Three whole ladders: the origin on screen, the one before it, and room for
 * a third. Derived rather than picked, because the previous fixed 180 was
 * twelve short of two ladders, so alternating between two presets evicted and
 * re-seeded both of them forever.
 */
const CACHE_LIMIT = 3 * LADDER.length;
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
  signal: AbortSignal | undefined,
): Promise<Map<number, MultiPolygon>> {
  const response = await postJson(
    "/api/isochrone",
    {
      location: { latitude: origin.lat, longitude: origin.lng },
      minutes,
    },
    { signal },
  );

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
 * discard stale results by comparing the origin instead, and `prefetchLadder`
 * stops a batch from *starting* for an origin nobody is looking at.
 *
 * Returns one settled result per requested minute. A minute can fail alone,
 * because Valhalla drops a contour it considers degenerate; the callers
 * decide whether that is fatal.
 *
 * `onSettled` fires once per requested minute as it lands, so a caller can
 * report a fraction it actually measured. Minutes already cached or already
 * in flight land on their own timing; the ones this call asks for arrive
 * together, because they arrive in one response.
 *
 * `signal` belongs to the caller that started this batch, and reaches the
 * request itself: an abandoned origin stops costing the engine, rather than
 * finishing a ladder into a cache nobody will read. Minutes already in flight
 * for this origin keep whatever signal started them.
 */
function ensureContours(
  origin: LngLat,
  wanted: readonly number[],
  onSettled?: () => void,
  signal?: AbortSignal,
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
    const batch = requestContours(origin, missing, signal);
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

  // Both arms, so a rejection reported as progress is still handled here and
  // never surfaces as an unhandled rejection alongside the settled result.
  if (onSettled) for (const job of jobs) void job.then(onSettled, onSettled);

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
 *
 * The limit bounds how many *origins* stay assembled, not how far the dial
 * can travel. Two whole dials, because an entry is three references and a
 * number: a limit under the dial's own 96 positions meant a scrub to the end
 * evicted the positions it started from, and scrubbing back re-assembled them
 * as new objects, which is the exact thing this cache exists to prevent.
 */
const ASSEMBLED_LIMIT = LADDER.length * 2;
const assembled = new LruMap<string, Reach>(ASSEMBLED_LIMIT);

/**
 * Assembles a reach from cache alone, or returns null if any contour is still
 * outstanding. This is the path the dial takes, which is why moving it repaints
 * within a frame instead of after a round trip.
 */
export function cachedReach(
  origin: LngLat,
  budgetMinutes: number,
  floorMinutes = 0,
): Reach | null {
  // The floor is part of the shape, so it is part of the identity. Two reaches
  // for the same budget and different floors are different geometry, and
  // MapCanvas re-uploads a band only when this reference changes.
  const key = `${cacheKey(origin, budgetMinutes)}|${floorMinutes}`;
  // Peeked, not promoted: this runs on every render, and the identity these
  // entries provide matters more than which one is oldest.
  const memo = assembled.peek(key);
  if (memo) return memo;

  // The shape the range excludes. Fetched like any other rung, because that is
  // what it is; missing means the ladder is not warm here yet, and a band
  // drawn without its hole would claim the middle is in range.
  let hole: MultiPolygon | null = null;
  if (floorMinutes > 0) {
    hole = cache.peek(cacheKey(origin, floorMinutes)) ?? null;
    if (!hole) return null;
  }

  const bands: Band[] = [];
  for (const minutes of bandMinutes(budgetMinutes, floorMinutes)) {
    const polygons = cache.peek(cacheKey(origin, minutes));
    if (!polygons) return null;
    bands.push({ minutes, polygons: hole ? subtract(polygons, hole) : polygons });
  }

  const reach: Reach = {
    origin,
    budgetMinutes,
    bands,
    // Measured from the shape actually drawn, so a range reports the band's
    // area rather than the disc's.
    areaSqMeters: areaSqMeters(bands[bands.length - 1]!.polygons),
  };
  assembled.set(key, reach);
  return reach;
}

/**
 * The raw cached contour for one origin at one minute, or null.
 *
 * A peek: it neither promotes an LRU entry nor writes one. `meetMinimum` reads
 * up to 192 rungs across two origins in one pass and must not disturb either
 * cache while doing it — the obvious alternative, `cachedReach`, inserts an
 * assembled entry per read into an LRU that holds 192 total, so a single scan
 * would evict the dial position currently on screen and the partner's reach,
 * both of which would then re-assemble as new objects and re-upload every
 * contour to MapLibre. A visible stutter, produced by a notice explaining why
 * there is nothing to spin.
 *
 * @public - consumed by App, which hands it to `meetMinimum` as its reader.
 */
export function cachedContour(origin: LngLat, minutes: number): MultiPolygon | null {
  return cache.peek(cacheKey(origin, minutes)) ?? null;
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
export async function fetchReach(
  origin: LngLat,
  budgetMinutes: number,
  floorMinutes = 0,
): Promise<Reach> {
  const wanted = bandMinutes(budgetMinutes, floorMinutes);
  const results = await ensureContours(
    origin,
    floorMinutes > 0 ? [floorMinutes, ...wanted] : wanted,
  );
  const reach = cachedReach(origin, budgetMinutes, floorMinutes);
  if (reach) return reach;

  // Every band this budget needs was requested; if the reach still cannot be
  // assembled, the first failure is the reason worth reporting.
  const failed = results.find((r) => r.status === "rejected");
  if (failed?.status === "rejected") throw failed.reason;
  throw new Error("Contours resolved but could not be assembled.");
}

/**
 * Warms every contour on the ladder for an origin so the dial becomes a cache
 * read. One request against a self-hosted engine; the proxy splits it only
 * when the instance's contour limit is lower than the ladder.
 *
 * Best effort per contour: a minute Valhalla dropped as degenerate is simply
 * not warm, and the dial falls back to fetching it on demand, which surfaces
 * the error in context. Only a configuration failure aborts the warm-up,
 * because nothing else will succeed until it is fixed.
 *
 * Progress is measured, not asserted: bytes while a snapshot downloads, then
 * contours while the engine fills whatever the snapshot did not carry. Only
 * the ratio means anything, and the unit behind it changes between the two
 * phases.
 *
 * `signal` is for an origin nobody is looking at any more. It aborts the
 * snapshot download and stops the engine batch from starting; it does not
 * cancel a batch already in flight, which is one request away from making the
 * whole dial instant. Never pass the current origin's signal.
 */
export async function prefetchLadder(
  origin: LngLat,
  onProgress: (progress: PrefetchProgress) => void,
  options?: { signal?: AbortSignal },
): Promise<void> {
  const signal = options?.signal;
  const gaps = (): number[] => LADDER.filter((m) => !cache.has(cacheKey(origin, m)));

  // An origin that is already warm is already done. Seeding it again would
  // re-download and re-parse a couple of megabytes of JSON, and re-allocate
  // every position in it, to arrive at the cache it is holding.
  if (gaps().length === 0) {
    onProgress({ done: 1, total: 1 });
    return;
  }

  onProgress({ done: 0, total: 1 });
  if (PRESET_SNAPSHOTS.has(snapshotName(origin))) {
    await seedFromSnapshot(origin, onProgress, signal);
  }
  if (signal?.aborted) return;

  // Whatever the snapshot did not carry is the engine's job: a file with
  // holes in it, a file rejected for its pace, or no file at all.
  const missing = gaps();
  if (missing.length === 0) {
    onProgress({ done: 1, total: 1 });
    return;
  }

  const seeded = LADDER.length - missing.length;
  let settled = 0;
  const results = await ensureContours(
    origin,
    missing,
    () => {
      settled++;
      onProgress({ done: seeded + settled, total: LADDER.length });
    },
    signal,
  );
  onProgress({ done: 1, total: 1 });

  const configFailure = results.find(
    (r) => r.status === "rejected" && r.reason instanceof NotConfiguredError,
  );
  if (configFailure?.status === "rejected") throw configFailure.reason;
}
