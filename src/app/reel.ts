/**
 * Where the spin reel sits at each moment of a throw.
 *
 * Kept apart from the hook that animates it so the properties that make a spin
 * feel honest are pure functions with tests behind them, rather than something
 * only visible by staring at the screen:
 *
 *   - the reel never stops moving until it has a result to stop on;
 *   - it *arrives* at the winner by stepping onto it, rather than cutting;
 *   - it rests there long enough to read before the card replaces it.
 *
 * The whole phase machine lives here and the loop only executes what it
 * returns, so a loop cannot skip a phase without these tests noticing.
 */

import type { Tuning } from "./tuning";

function wrap(slot: number, slotCount: number): number {
  return ((slot % slotCount) + slotCount) % slotCount;
}

/**
 * Structural on purpose, so this module stays free of runtime imports and can
 * be exercised by `node --test` without a bundler resolving the app's graph.
 */
type Point = { readonly lng: number; readonly lat: number };

/**
 * Compass bearing from the origin, in radians clockwise from north.
 * Equirectangular, which is exact enough over a city: the reel only needs the
 * order these come out in, not the angles themselves.
 */
function bearing(origin: Point, place: Point): number {
  const meanLat = ((origin.lat + place.lat) / 2) * (Math.PI / 180);
  const east = (place.lng - origin.lng) * Math.cos(meanLat);
  const north = place.lat - origin.lat;
  // atan2 returns (-pi, pi], which would sort everything west of the origin
  // ahead of north and start the sweep in the wrong place. Normalised to
  // [0, 2pi) so north is 0 and the order runs N, E, S, W.
  const angle = Math.atan2(east, north);
  return angle < 0 ? angle + 2 * Math.PI : angle;
}

/**
 * Orders the reel so stepping through it sweeps clockwise around the origin,
 * starting due north.
 *
 * EXPERIMENT, behind `spinCircularOrder`. The reel otherwise runs in the order
 * the candidate list happens to be in, which is the order places were written
 * into the data file - so the dot on the map jumps about with no relation to
 * the sweep. Ordering by bearing makes the reel and the map agree: the
 * highlighted place travels round the origin while the names tick past.
 *
 * Ties (two places on the same bearing) keep their relative order, so this is
 * stable and a given pool always produces the same wheel.
 */
export function orderAroundOrigin<T extends Point>(origin: Point, places: readonly T[]): T[] {
  return places
    .map((place, index) => ({ place, index, angle: bearing(origin, place) }))
    .toSorted((a, b) => a.angle - b.angle || a.index - b.index)
    .map((entry) => entry.place);
}

/** Interval until the next flip at this point in the throw, in ms. */
function flipInterval(elapsed: number, settings: Tuning): number {
  const progress = Math.min(1, elapsed / settings.spinDurationMs);
  // Ease-out, so the reel visibly slows. The exponent is on the REMAINING
  // progress, so a value below 1 holds the fast phase almost to the end and
  // then drops hard, and a value above 1 begins slowing immediately.
  const eased = 1 - Math.pow(1 - progress, settings.spinEaseExponent);
  return settings.spinFirstFlipMs + (settings.spinLastFlipMs - settings.spinFirstFlipMs) * eased;
}

/**
 * How many flips the reel still owes from `elapsed` if it keeps to schedule.
 * Zero once the throw's clock is up.
 */
export function flipsRemaining(elapsed: number, settings: Tuning): number {
  let at = elapsed;
  let flips = 0;
  // The cap is a backstop against a pathological interval, not a real bound:
  // a throw reaches its end in a few dozen flips.
  while (at < settings.spinDurationMs && flips < 500) {
    at += flipInterval(at, settings);
    flips++;
  }
  return flips;
}

/**
 * How many slots one flip advances, so that the whole throw travels
 * `spinLaps` times round the pool.
 *
 * **This is what makes the reel a wheel at any pool size.** A throw is a few
 * dozen flips, which happened to be most of a lap at 62 places and is under a
 * quarter at 242 - the same code reading as a spin in one case and as a list
 * scrolling past in the other. Deriving the stride from the pool keeps the
 * *travelled distance* fixed instead of the *number of names*.
 *
 * At least 1: a pool smaller than the flip count still steps one at a time,
 * which is the old behaviour and the right one there.
 */
function stride(settings: Tuning, slotCount: number): number {
  const flips = flipsRemaining(0, settings);
  if (flips <= 0 || slotCount <= 0) return 1;
  return Math.max(1, Math.ceil((settings.spinLaps * slotCount) / flips));
}

/**
 * The throw proper: positioned by how many flips are still owed, so each one
 * steps one stride closer to the winner. Held one stride short of it, because
 * the winner is only ever arrived at deliberately, in the run-in below.
 */
function throwSlot(elapsed: number, settings: Tuning, winnerSlot: number, slotCount: number): number {
  const step = stride(settings, slotCount);
  return wrap(winnerSlot - Math.max(1, flipsRemaining(elapsed, settings)) * step, slotCount);
}

/**
 * Past the throw with no result yet, because the winner's walking route has
 * not landed. The reel keeps turning at its final cadence.
 *
 * This is the case that matters most and is easiest to get wrong: parking the
 * reel on a name while waiting, then moving it once the route arrives, reads
 * as the app quietly deciding after the fact. A reel still in motion reads as
 * a reel that has not decided yet, which is the truth.
 */
function waitingSlot(elapsed: number, settings: Tuning, winnerSlot: number, slotCount: number): number {
  const waited = elapsed - settings.spinDurationMs;
  const steps = Math.floor(waited / settings.spinLastFlipMs);
  const step = stride(settings, slotCount);
  return wrap(winnerSlot - step + steps * step, slotCount);
}

export type ReelFrame =
  | { readonly kind: "flip"; readonly slot: number }
  | { readonly kind: "rest"; readonly slot: number }
  | { readonly kind: "land" };

/**
 * Where the reel was, and when, at the moment there was finally a result to
 * stop on. Null until then; the caller records it once and passes it back.
 */
export type ReelStop = { readonly slot: number; readonly elapsed: number };

export function reelFrameAt(
  elapsed: number,
  settings: Tuning,
  winnerSlot: number,
  slotCount: number,
  stop: ReelStop | null,
): ReelFrame {
  if (stop === null) {
    return {
      kind: "flip",
      slot:
        elapsed < settings.spinDurationMs
          ? throwSlot(elapsed, settings, winnerSlot, slotCount)
          : waitingSlot(elapsed, settings, winnerSlot, slotCount),
    };
  }

  // The run-in: walk forward from wherever the reel was to the winner, one
  // stride per final-cadence tick, so the winner is stepped onto in view.
  //
  // Counted in strides rather than slots, and the last one SNAPS to the winner
  // rather than adding a stride: stepping blindly could overshoot and the reel
  // would arrive on the wrong name, which is the one thing this run-in exists
  // to prevent.
  const step = stride(settings, slotCount);
  const distance = wrap(winnerSlot - stop.slot, slotCount);
  const strides = Math.ceil(distance / step);
  const steps = Math.floor((elapsed - stop.elapsed) / settings.spinLastFlipMs);
  if (steps < strides) return { kind: "flip", slot: wrap(stop.slot + steps * step, slotCount) };

  const restingSince = stop.elapsed + strides * settings.spinLastFlipMs;
  if (elapsed - restingSince >= settings.spinSettleMs) return { kind: "land" };
  return { kind: "rest", slot: winnerSlot };
}
