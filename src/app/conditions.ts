/**
 * One reading of "right now", and the only clock in this app.
 *
 * Three specs each described a minute-hand of their own. This is the one that
 * ships, because a second interval is a second answer to "what time is it" and
 * the whole point of v0.5 is that the app stops holding two of anything.
 */
import type { Daylight } from "./daylight.ts";

/**
 * `weather-filters` (chunk 7) widens this with its own `weather` field;
 * `opening-hours` (chunk 9) reads `atMs` and nothing else.
 *
 * @public - consumed from chunk 5 onward.
 */
export type Conditions = {
  /** Epoch ms, corrected by `clockOffsetMs`. Advances in whole minutes. */
  atMs: number;
  light: Daylight;
};

/**
 * Why a time constraint exists.
 *
 * The full union ships now rather than growing one member per chunk, because
 * `mergeCaps` and the dial's cap note are written against it and a union that
 * widens later is a contract that changes later. Only "daylight" is produced
 * until chunk 7.
 *
 * @public - consumed from chunk 5 onward.
 */
export type CapReason = "daylight" | "rain" | "storm" | "heat" | "cold";

/** @public - consumed from chunk 5 onward. */
export type TimeCap = {
  /** Total budget minutes this reason permits, already on the dial's step. */
  minutes: number;
  reason: CapReason;
  /** The instant the reason bites, epoch ms — used to pick the earliest. */
  untilMs: number;
};

/**
 * Earliest deadline wins; ties go to the smaller budget. Null in, null out, and
 * an empty array is null.
 *
 * It exists so `weather-filters` has somewhere to put rain onset without
 * inventing a second clamp path, and so the dial's cap note can name *which*
 * condition is doing the clamping rather than just that something is.
 *
 * @public - consumed from chunk 5 onward.
 */
export function mergeCaps(caps: readonly (TimeCap | null)[]): TimeCap | null {
  let winner: TimeCap | null = null;
  for (const cap of caps) {
    if (cap === null) continue;
    if (winner === null) {
      winner = cap;
      continue;
    }
    if (cap.untilMs < winner.untilMs) winner = cap;
    else if (cap.untilMs === winner.untilMs && cap.minutes < winner.minutes) winner = cap;
  }
  return winner;
}

/**
 * Device clocks are wrong and the app cannot tell.
 *
 * Module state rather than React state on purpose: it is a correction to the
 * clock itself, read by pure functions that have no component to read from, and
 * it changes at most once per forecast refresh. `weather-filters` (chunk 7) is
 * asked to call the setter once with a server timestamp, which is the only way
 * this app will ever know. Until then the offset is zero and the device is
 * trusted — a gap `daylight-budget` names out loud rather than papering over.
 */
let offsetMs = 0;

/** @public - called by `weather-filters` (chunk 7). */
export function setClockOffset(deltaMs: number): void {
  offsetMs = deltaMs;
}

/** @public - read by `useConditions`, and by tests that need to reset it. */
export function clockOffsetMs(): number {
  return offsetMs;
}

/**
 * Arrival instant for an outbound leg, for `opening-hours` — which judges every
 * verdict at the minute you would get there, never at now.
 *
 * @public - consumed by `opening-hours` (chunk 9).
 */
export function arrivalMs(atMs: number, outboundSeconds: number): number {
  return atMs + Math.round(outboundSeconds * 1000);
}
