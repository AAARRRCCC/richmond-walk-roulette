/**
 * Live-tunable feel settings.
 *
 * The spin reel and the sound cues are judged by ear and eye, not by argument,
 * so their numbers live here instead of as module constants and the dev panel
 * writes to them while the app runs. Values persist per browser so a reload
 * does not throw away a setting someone just dialled in.
 *
 * Production reads the same defaults; only the panel that edits them is
 * stripped from the build.
 */

import { isFiniteNumber, isJsonObject, parseJson } from "../lib/json.ts";

export type Tuning = {
  /** How long the reel turns before it may land, ms. */
  spinDurationMs: number;
  /** Interval between the first two name flips, ms. */
  spinFirstFlipMs: number;
  /** Interval between the last two flips, ms. The gap to first is the slowdown. */
  spinLastFlipMs: number;
  /**
   * Ease exponent on the flip interval. The curve is
   * `1 - (1 - progress) ** exponent`, so 1 is linear, BELOW 1 holds the fast
   * phase longer and drops at the end, and above 1 starts slowing at once.
   */
  spinEaseExponent: number;
  /** Longest the reel keeps turning while waiting on the winner's route, ms. */
  spinMaxHoldMs: number;
  /**
   * How long the reel rests on the winner after its final step, before the
   * result card replaces it. Without this the reel's last drawn name is the
   * one *before* the winner and the card reads as a jump rather than a stop.
   */
  spinSettleMs: number;
  /**
   * How many times the reel travels the whole pool before it lands.
   *
   * A wheel that does not come round is not a wheel. The reel steps one flip at
   * a time and a throw is a few dozen flips, so at 62 places it happened to
   * cover most of a lap and read correctly; at 242 it covered under a quarter
   * and read as a list scrolling past. This makes the distance covered a
   * decision rather than an accident of how many places are in the pool: the
   * stride is derived per throw so that laps x pool is travelled whatever the
   * pool's size.
   */
  spinLaps: number;
  /** Master cue level, 0 to 1. */
  soundVolume: number;
  soundEnabled: boolean;
  /**
   * EXPERIMENT. Run the reel in compass order around the origin, so the
   * highlighted place sweeps round the map instead of hopping about in
   * whatever order the candidate list happened to be built in. Off restores
   * the previous behaviour exactly.
   */
  spinCircularOrder: boolean;
};

export const TUNING_DEFAULTS: Tuning = {
  spinDurationMs: 3000,
  spinFirstFlipMs: 10,
  spinLastFlipMs: 60,
  spinEaseExponent: 0.5,
  spinMaxHoldMs: 4000,
  spinSettleMs: 500,
  spinLaps: 2,
  soundVolume: 0.5,
  soundEnabled: true,
  spinCircularOrder: true,
};

/**
 * Bounds the panel offers, and the range a stored value must fall inside.
 * `satisfies` rather than an annotation, so each entry keeps its literal type
 * and a key missing from Tuning is still a compile error.
 */
export const TUNING_RANGE = {
  spinDurationMs: { min: 500, max: 10000, step: 100 },
  spinFirstFlipMs: { min: 10, max: 300, step: 5 },
  spinLastFlipMs: { min: 40, max: 1200, step: 10 },
  // Below 1 is the interesting half: the reel holds its top speed almost the
  // whole throw and then falls off a cliff onto the winner. Not zero, which
  // would be no slowdown at all and so no landing to watch.
  spinEaseExponent: { min: 0.2, max: 6, step: 0.1 },
  spinMaxHoldMs: { min: 0, max: 10000, step: 250 },
  // Not zero: the settle is what puts the winner on screen before the card
  // takes over, and a dwell under about a tenth of a second is a flicker
  // rather than a stop - which is the bug this setting exists to prevent.
  spinSettleMs: { min: 100, max: 1500, step: 20 },
  // Two is a wheel. One reads as a list that stopped; past about four the
  // names are a blur and the slowdown is the only thing carrying the throw.
  spinLaps: { min: 1, max: 6, step: 1 },
  soundVolume: { min: 0, max: 1, step: 0.05 },
  // The switches carry an entry only so a key missing from Tuning stays a
  // compile error; nothing reads their bounds.
  soundEnabled: { min: 0, max: 1, step: 1 },
  spinCircularOrder: { min: 0, max: 1, step: 1 },
} satisfies Record<keyof Tuning, { min: number; max: number; step: number }>;

const STORAGE_KEY = "walk-roulette:tuning";

/**
 * The defaults as this browser should first meet them. Only sound differs:
 * someone who has asked the system for less motion is asking for less
 * incidental feedback as well, and Web Audio ignores the hardware silent
 * switch on iOS, so the quiet has to be seeded rather than assumed. Once the
 * mute has been touched the stored value wins, here as everywhere.
 */
function seeded(): Tuning {
  let quiet = false;
  try {
    quiet = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    // No matchMedia: nothing has been asked for, so the plain default stands.
  }
  return { ...TUNING_DEFAULTS, soundEnabled: TUNING_DEFAULTS.soundEnabled && !quiet };
}

function restore(): Tuning {
  const next = seeded();
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return next;
  }
  if (stored === null) return next;

  try {
    const parsed = parseJson(stored);
    if (!isJsonObject(parsed)) return next;
    // SAFETY: TUNING_DEFAULTS is a local object literal declared as Tuning, so
    // its own enumerable keys are exactly Tuning's. Object.keys is typed
    // string[] only because a wider object could be passed in; none can here.
    const keys = Object.keys(TUNING_DEFAULTS) as (keyof Tuning)[];
    for (const key of keys) {
      const value = parsed[key];
      if (key === "soundEnabled" || key === "spinCircularOrder") {
        if (value === true || value === false) next[key] = value;
        continue;
      }
      // Out-of-range values are dropped rather than clamped: a stored number
      // outside the panel's own bounds came from an older shape of this file.
      const { min, max } = TUNING_RANGE[key];
      if (isFiniteNumber(value) && value >= min && value <= max) next[key] = value;
    }
  } catch {
    return seeded();
  }
  return next;
}

/**
 * Read directly. This is deliberately a mutable singleton rather than React
 * state: the reel's frame loop and the sound engine read it outside render,
 * and a value that only reached them on the next commit would make the panel
 * feel a beat behind the thing it is tuning.
 */
export const tuning: Tuning = restore();

const listeners = new Set<() => void>();

export function setTuning<K extends keyof Tuning>(key: K, value: Tuning[K]): void {
  tuning[key] = value;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tuning));
  } catch {
    // Private mode or a full quota: the value still applies for this session.
  }
  for (const listener of listeners) listener();
}

export function resetTuning(): void {
  Object.assign(tuning, seeded());
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored to clear.
  }
  for (const listener of listeners) listener();
}

/** Subscribe for re-render; returns the unsubscribe. */
export function onTuningChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
