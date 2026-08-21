/**
 * The one minute-hand. Every feature that needs to know what time it is reads
 * this hook, and nothing anywhere else calls `Date.now()` in a render.
 */
import { useEffect, useMemo, useState } from "react";
import type { LngLat } from "../lib/geometry.ts";
import { clockOffsetMs, type Conditions } from "./conditions.ts";
import { daylightAt } from "./daylight.ts";

const MINUTE_MS = 60_000;

/**
 * The minute `atMs` falls in, truncated.
 *
 * Truncated rather than rounded so the value only ever moves forward, and moves
 * exactly when the wall clock's minute digit does. A rounded clock reads 8:22
 * for thirty seconds while every other clock in the room says 8:21.
 *
 * Exported because it is the arithmetic worth testing; the hook around it is a
 * timer and a listener.
 */
export function minuteOf(atMs: number): number {
  return Math.floor(atMs / MINUTE_MS) * MINUTE_MS;
}

/**
 * How long until the next minute boundary after `atMs`.
 *
 * Never zero: standing exactly on a boundary means waiting a whole minute for
 * the next one, and a zero here would spin the timer chain as fast as the event
 * loop allows.
 */
export function msToNextMinute(atMs: number): number {
  return MINUTE_MS - (atMs % MINUTE_MS);
}

/** The current instant, corrected by the clock offset, truncated to its minute. */
const nowMinute = (): number => minuteOf(Date.now() + clockOffsetMs());

/**
 * Conditions at `origin`, re-read on each minute boundary.
 *
 * `frozen` holds the clock still. A spin takes a couple of seconds of reel, and
 * a minute boundary crossed mid-throw would change the pool underneath the
 * animation — which is how a spin lands on a place the user watched being
 * excluded. Two specs asked for this latch separately; one flag on the hook
 * serves both. App passes `state.spinning`.
 *
 * A `setTimeout` chain rather than `setInterval`: an interval drifts, and after
 * a laptop wakes from sleep it fires the whole backlog at once. The timer is
 * also cleared entirely while the document is hidden, and the clock re-read on
 * the way back, so a tab left open overnight costs nothing and is still right
 * the moment it is looked at.
 *
 * @public - consumed by `daylight-budget` (chunk 5) onward.
 */
export function useConditions(origin: LngLat, frozen: boolean): Conditions {
  const [atMs, setAtMs] = useState(nowMinute);

  useEffect(() => {
    if (frozen) return;

    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = (): void => {
      const untilNextMinute = msToNextMinute(Date.now() + clockOffsetMs());
      timer = setTimeout(() => {
        setAtMs(nowMinute());
        schedule();
      }, untilNextMinute);
    };

    const stop = (): void => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };

    const onVisibility = (): void => {
      stop();
      if (document.visibilityState === "hidden") return;
      // Re-read before rescheduling: the tab may have been hidden for hours,
      // and the first thing a returning reader sees must not be a stale minute.
      setAtMs(nowMinute());
      schedule();
    };

    if (document.visibilityState !== "hidden") schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [frozen]);

  // The one place this codebase's "derived values are not memoised" rule is
  // bent, and the reason is measurable rather than aesthetic: `daylightAt` runs
  // `Intl.DateTimeFormat.formatToParts` once or twice, and a dial scrub
  // re-renders App every frame while `atMs` and the origin sit still. The
  // trigonometry is free; the formatter is not. The key is three numbers and the
  // value changes at most once a minute, so the memo is correct by construction.
  return useMemo(
    () => ({ atMs, light: daylightAt(atMs, origin.lat, origin.lng) }),
    [atMs, origin.lat, origin.lng],
  );
}
