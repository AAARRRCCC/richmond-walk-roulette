/**
 * What the remaining light means for a walk.
 *
 * `src/lib/solar.ts` says where the sun is; this says what to do about it. The
 * split is worth keeping: the solar module is arithmetic that can be checked
 * against an almanac, and everything here is a product decision that cannot.
 *
 * Every function takes a `Daylight` record rather than a clock, so each one is
 * a pure function of a plain object. That is what makes the awkward states —
 * two in the morning, the minute after sunset, a latitude where the sun never
 * sets — testable by construction instead of by waiting for them.
 */
import { MAX_MINUTES } from "../lib/isochrone.ts";
import { formatClock } from "../lib/format.ts";
import { solarEvents, type SolarEvents } from "../lib/solar.ts";

/**
 * A day, for rolling `solarEvents` forward. Whole days rather than "tomorrow's
 * date" because the events are computed from the Richmond calendar day of an
 * instant, and adding 24 hours lands inside the next one under any offset the
 * DST rules can produce.
 */
const DAY_MS = 86_400_000;

/** @public - consumed by `daylight-budget` (chunk 5). */
export type DaylightPhase =
  | "day" // before sunset
  | "dusk" // between sunset and civil dusk: light, but going
  | "night" // after civil dusk, before civil dawn
  | "dawn"; // between civil dawn and sunrise

/** @public - consumed by `daylight-budget` (chunk 5). */
export type Daylight = {
  atMs: number;
  phase: DaylightPhase;
  /** Today's events, or tomorrow's once tonight's dusk has passed. */
  events: SolarEvents;
  /** Whole minutes from `atMs` to sunset. Negative after sunset, null if none. */
  minutesToSunset: number | null;
  /** Whole minutes from `atMs` to civil dusk. Negative after it, null if none. */
  minutesToDusk: number | null;
  /**
   * Whole minutes from `atMs` to sunrise, on the same `events` day. Negative
   * after sunrise, null if none. A field rather than something derived at the
   * call site because `describeLight`'s dawn branch needs it, and "derived
   * inline" does not say which day it was derived from once `events` has rolled.
   */
  minutesToSunrise: number | null;
  /**
   * The next civil dawn strictly after `atMs`, epoch ms — the number the night
   * statement quotes. Null only when `events.civilDawnMs` is null. Note the word
   * *next*: by day this is tomorrow's dawn, not this morning's.
   */
  nextDawnMs: number | null;
};

/** Floor, never round: "sunset in 40" must never be optimistic. */
const minutesUntil = (fromMs: number, toMs: number | null): number | null =>
  toMs === null ? null : Math.floor((toMs - fromMs) / 60_000);

/**
 * Which part of the day `atMs` falls in, given that day's events.
 *
 * A day missing any boundary cannot be phased, and the honest answer is the
 * phase that disables the clamp rather than a guess — so it reads as night, the
 * cap comes back null, and the dial uncaps. Richmond never reaches this;
 * latitude 89 in midsummer does.
 */
function phaseOf(atMs: number, events: SolarEvents): DaylightPhase {
  const { civilDawnMs, sunriseMs, sunsetMs, civilDuskMs } = events;
  if (civilDawnMs === null || sunriseMs === null || sunsetMs === null || civilDuskMs === null) {
    return "night";
  }
  if (atMs < civilDawnMs) return "night";
  if (atMs < sunriseMs) return "dawn";
  if (atMs < sunsetMs) return "day";
  return "dusk";
}

/** @public - consumed by `daylight-budget` (chunk 5). */
export function daylightAt(atMs: number, lat: number, lng: number): Daylight {
  const today = solarEvents(atMs, lat, lng);

  // Past tonight's civil dusk the interesting numbers are all tomorrow's, so
  // the record rolls over rather than reporting deadlines that have gone.
  const rolled = today.civilDuskMs !== null && atMs >= today.civilDuskMs;
  const events = rolled ? solarEvents(atMs + DAY_MS, lat, lng) : today;
  const phase: DaylightPhase = rolled ? "night" : phaseOf(atMs, today);

  const nextDawnMs =
    events.civilDawnMs === null
      ? null
      : events.civilDawnMs > atMs
        ? events.civilDawnMs
        : solarEvents(atMs + DAY_MS, lat, lng).civilDawnMs;

  return {
    atMs,
    phase,
    events,
    minutesToSunset: minutesUntil(atMs, events.sunsetMs),
    minutesToDusk: minutesUntil(atMs, events.civilDuskMs),
    minutesToSunrise: minutesUntil(atMs, events.sunriseMs),
    nextDawnMs,
  };
}

/** `low + n*step`, never rounding up into the dark. */
const floorToStep = (value: number, step: number, low: number): number =>
  low + Math.floor((value - low) / step) * step;

/**
 * The dial cap, in TOTAL budget minutes, or null for "cannot clamp".
 *
 * Named `capFromLight` rather than `lightCapMinutes` because `Session` already
 * has a field by that name and App.tsx has both in scope — a cap effect that
 * appears to call itself is a bad five seconds for the next reader.
 *
 * The final clamp to `MAX_MINUTES` is why the cap is only ever *visible* inside
 * the last hundred minutes of light: six hours before dusk it equals the dial's
 * own ceiling, so there is no shading and no note. The dead zone appears exactly
 * when the light becomes the binding constraint.
 *
 * @public - consumed by `daylight-budget` (chunk 5).
 */
export function capFromLight(
  light: Daylight,
  roundTrip: boolean,
  dialMinimum: number,
  step: number,
): number | null {
  // `roundTrip` does not change the arithmetic: the dial's units are total
  // minutes either way, so the budget already *is* the wall-clock length of the
  // outing. It stays in the signature because the switch's hint has to promise
  // either "back before" or "arrive before", and both read this same cap.
  void roundTrip;

  if (light.phase === "night" || light.minutesToDusk === null) return null;
  const capped = floorToStep(light.minutesToDusk, step, dialMinimum);
  if (capped < dialMinimum) return null;
  return Math.min(capped, MAX_MINUTES);
}

/**
 * Does a walk of `totalMinutes` starting now finish before civil dusk?
 *
 * False at night, always. That branch carries the whole rule: at 11pm `events`
 * has rolled to tomorrow and `minutesToDusk` reads as something like 1400, which
 * is true and useless — nobody is walking through the night to reach tomorrow's
 * dusk. It also catches 2am, which is `night` for the same reason.
 *
 * @public - consumed by `daylight-budget` (chunk 5).
 */
export function fitsInLight(light: Daylight, totalMinutes: number): boolean {
  if (light.phase === "night") return false;
  if (light.minutesToDusk === null) return false;
  return totalMinutes <= light.minutesToDusk;
}

/**
 * The clause the result card and the sr-only line share.
 *
 * Switches on `phase` first, and that ordering is the fix for a real bug: an
 * earlier draft tested `minutesToSunset > 0` before the dawn branch, and at 6am
 * sunset is thirteen hours away and comfortably positive, so a pre-dawn walker
 * was told "sunset in 812". Phase is the fact; the countdowns decorate it.
 *
 * @public - consumed by `daylight-budget` (chunk 5).
 */
export function describeLight(light: Daylight): string {
  switch (light.phase) {
    case "night":
      return "after dark";
    case "dawn":
      return light.minutesToSunrise === null
        ? "before sunrise"
        : `sunrise in ${light.minutesToSunrise}`;
    case "dusk":
      return light.minutesToSunset === null
        ? "past sunset"
        : `sunset was ${-light.minutesToSunset} min ago`;
    case "day":
      return light.minutesToSunset === null ? "daylight" : `sunset in ${light.minutesToSunset}`;
  }
}

/**
 * The deadline as a bare clock phrase, for the readout and the dial's cap note.
 * It exists so nothing downstream has to slice a sentence apart to get a time.
 *
 * @public - consumed by `daylight-budget` (chunk 5).
 */
export function describeDusk(light: Daylight): string {
  if (light.phase === "night") {
    return light.nextDawnMs === null ? "daylight unknown" : `dark until ${formatClock(light.nextDawnMs)}`;
  }
  return light.events.civilDuskMs === null
    ? "daylight unknown"
    : `dusk ${formatClock(light.events.civilDuskMs)}`;
}

/**
 * The switch's hint line, and the only one of the three that has to know
 * whether the walk comes home: "back before" and "arrive before" are different
 * promises, and the cap deliberately applies the same arithmetic to both.
 *
 * @public - consumed by `daylight-budget` (chunk 5).
 */
export function describeDeadline(light: Daylight, roundTrip: boolean): string {
  if (light.phase === "night") {
    return light.nextDawnMs === null
      ? "Daylight is not available for this location."
      : `It is dark. Civil dawn is ${formatClock(light.nextDawnMs)}.`;
  }
  if (light.events.civilDuskMs === null) return "Daylight is not available for this location.";
  const at = formatClock(light.events.civilDuskMs);
  return roundTrip ? `Back before civil dusk, ${at}` : `Arrive before civil dusk, ${at}`;
}
