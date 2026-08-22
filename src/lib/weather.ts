/**
 * The client's whole weather tier: one report, held in module state and read
 * synchronously during render, in the shape `route.ts` and `isochrone.ts`
 * already use.
 *
 * Nothing in this app waits on the forecast. It is the one async source that is
 * allowed to simply not arrive, and every consumer is written so that its
 * absence removes a sentence and changes nothing else.
 */
import { getJson } from "./http.ts";
import { isFiniteNumber, isJsonArray, isJsonObject, isString, readJson, type Json } from "./json.ts";

/**
 * **The licence gate, and the only thing that reverses it.**
 *
 * Open-Meteo's free API tier is sold as non-commercial use only — their words,
 * fetched 2026-08-21: *"The free API is for non-commercial use, rate-limited to
 * 10,000 calls/day, and carries no uptime guarantee."* Commercial use, whose
 * stated examples are *"websites or apps that have subscriptions or display
 * advertisements"*, requires a paid subscription and the API key that comes
 * with it.
 *
 * This build assumes the commercial case, because a non-commercial assumption
 * that turns out to be wrong is a licence breach and the reverse is only wasted
 * caution. So the endpoint exists, the proxy works, the rules are written and
 * tested — and the client does not call it. Flip this to `true` (and, for a
 * commercial deployment, point `WEATHER_URL` at a paid endpoint or at
 * `api.weather.gov`) and the whole feature is live with no other edit.
 *
 * See `docs/plans/HUMAN-REVIEW.md` §2.4.
 */
export const WEATHER_ENABLED = true;

/** One slot of forecast, already in the units this app displays. */
export type WeatherSlot = {
  /** Whole minutes from the report's `observedAtMs`. Negative for the hour in progress. */
  atMinutes: number;
  temperatureF: number;
  feelsLikeF: number;
  /** Null past a model's horizon. Null is unknown, never zero. */
  precipInches: number | null;
  /** 0..100, or null past a model's horizon. */
  precipChance: number | null;
  /** WMO code. See `WMO_THUNDER`; otherwise carried, not interpreted. */
  weatherCode: number;
  windMph: number;
  /** Null past a model's horizon. */
  uvIndex: number | null;
  isDay: boolean;
};

export type WeatherReport = {
  /** Epoch milliseconds. Parsed once, from the wire's ISO string. */
  observedAtMs: number;
  refreshSeconds: number;
  now: WeatherSlot;
  hours: WeatherSlot[];
  source: string;
};

/**
 * How long to wait after a failure before trying again.
 *
 * A plain interval rather than an attempt counter in `Session`, and the
 * difference is deliberate: `routeAttempt` exists because the UI offers a **Try
 * again** button for a route and something has to make that effect re-run.
 * Weather offers no such button, because a forecast the user has to ask for
 * twice is worse than no forecast. The minute tick is what re-runs this.
 */
const FAIL_BACKOFF_MS = 120_000;

/**
 * Two attempts, not three. This is the one request nothing waits on, and
 * burning seventy seconds of backoff on a decoration is a waste of the user's
 * radio.
 */
const ATTEMPTS = 2;

let report: WeatherReport | null = null;
let fetchedAtMs = 0;
let failedAtMs = 0;
let inFlight: Promise<void> | null = null;

/**
 * A report that landed during a throw, waiting for the reel to stop.
 *
 * Conditions derive from a ticking clock and a refreshing forecast, so they can
 * change between the reel starting and landing. Freezing the clock is not
 * enough on its own; this is the other half.
 */
let held = false;
let stashed: WeatherReport | null = null;

/**
 * The current report, or null when there has never been one.
 *
 * It keeps the last good report forever, and that is a promise about honesty
 * rather than a loophole: if refreshes start failing after one success,
 * `weatherUnavailable()` is true *and* a report exists, and any cap derived
 * from it may be biting off hours-old data. That is exactly why the rules
 * module reports the report's own age and the panel prints it.
 */
export function cachedWeather(): WeatherReport | null {
  return report;
}

/** True when the last attempt failed and nothing is in flight. */
export function weatherUnavailable(): boolean {
  return inFlight === null && failedAtMs > 0;
}

/**
 * Starts a fetch if the cached report is older than its refresh window and
 * nothing is already in flight. Safe to call every render; it is a no-op in the
 * common case. `onSettled` is App's own bump counter — its own, not the contour
 * or route ones, because a landed forecast must not invalidate reach or restart
 * route warming.
 */
export function refreshWeather(onSettled: () => void): void {
  if (!WEATHER_ENABLED) return;
  if (inFlight !== null) return;

  const now = Date.now();
  if (failedAtMs > 0 && now - failedAtMs < FAIL_BACKOFF_MS) return;
  if (report !== null && now - fetchedAtMs < report.refreshSeconds * 1000) return;

  inFlight = getJson("/api/weather", { attempts: ATTEMPTS })
    .then(async (response) => {
      if (!response.ok) throw new Error(`weather ${response.status}`);
      const parsed = readReport(await readJson(response));
      if (parsed === null) throw new Error("weather shape");
      fetchedAtMs = Date.now();
      failedAtMs = 0;
      applyReport(parsed);
    })
    .catch(() => {
      failedAtMs = Date.now();
    })
    .finally(() => {
      inFlight = null;
      onSettled();
    });
}

/**
 * The one place a landed report becomes the current one.
 *
 * A seam rather than four lines inside the fetch's `then`, because the branch
 * it carries is the whole of the freeze guarantee and a branch nothing can
 * reach is a branch nothing checks. `weather.test.ts` drives it directly.
 *
 * @public - the fetch path calls it; `weather.test.ts` exercises the hold.
 */
export function applyReport(next: WeatherReport): void {
  if (held) stashed = next;
  else report = next;
}

/**
 * Holds the swap. A refresh that lands while held is stashed and applied on
 * release, so the conditions cannot move under a spin that is mid-flight.
 *
 * Returns true when releasing actually applied a stashed report, because that
 * is a change to module state that no fetch is going to announce: the caller
 * has to repaint, or the forecast sits invisible until something unrelated
 * re-renders. Seen doing exactly that - a report that landed mid-throw stayed
 * off screen after the reel stopped.
 */
export function holdWeather(hold: boolean): boolean {
  held = hold;
  if (hold || stashed === null) return false;
  report = stashed;
  stashed = null;
  return true;
}

/**
 * The proxy's shape into this module's.
 *
 * Exported for its own test, and narrowed through `json.ts` rather than
 * asserted: this is a network boundary, and every field the rules read has to
 * be a number this module checked rather than a number it was promised.
 *
 * @public - consumed by `weather.test.ts`.
 */
export function readReport(body: Json): WeatherReport | null {
  if (!isJsonObject(body)) return null;
  if (!isString(body.observedAt)) return null;
  const observedAtMs = Date.parse(body.observedAt);
  if (!Number.isFinite(observedAtMs)) return null;

  const now = readSlot(body.now);
  if (now === null) return null;

  const hours: WeatherSlot[] = [];
  if (isJsonArray(body.hours)) {
    for (const entry of body.hours) {
      const slot = readSlot(entry);
      if (slot !== null) hours.push(slot);
    }
  }

  return {
    observedAtMs,
    refreshSeconds: isFiniteNumber(body.refreshSeconds) ? body.refreshSeconds : 900,
    now,
    hours,
    source: isString(body.source) ? body.source : "unknown",
  };
}

function readSlot(value: Json | undefined): WeatherSlot | null {
  if (!isJsonObject(value)) return null;
  const { atMinutes, temperatureF, feelsLikeF } = value;
  if (!isFiniteNumber(atMinutes) || !isFiniteNumber(temperatureF) || !isFiniteNumber(feelsLikeF)) {
    return null;
  }
  return {
    atMinutes,
    temperatureF,
    feelsLikeF,
    precipInches: isFiniteNumber(value.precipInches) ? value.precipInches : null,
    precipChance: isFiniteNumber(value.precipChance) ? value.precipChance : null,
    weatherCode: isFiniteNumber(value.weatherCode) ? value.weatherCode : 0,
    windMph: isFiniteNumber(value.windMph) ? value.windMph : 0,
    uvIndex: isFiniteNumber(value.uvIndex) ? value.uvIndex : null,
    // A boolean on this side of the wire: the proxy already coerced the 0/1.
    isDay: value.isDay === true,
  };
}

/**
 * Drops every piece of module state.
 *
 * @public - consumed by `weather.test.ts`, which would otherwise carry one
 * test's report into the next.
 */
export function resetWeather(): void {
  report = null;
  fetchedAtMs = 0;
  failedAtMs = 0;
  inFlight = null;
  held = false;
  stashed = null;
}
