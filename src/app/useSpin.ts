import { useCallback, useEffect, useRef, useState } from "react";
import type { Place } from "../data/places";
import type { WalkingRoute } from "../lib/route";

const DURATION_MS = 1500;
const FIRST_FLIP_MS = 45;
const LAST_FLIP_MS = 260;
/** Longest the reel will keep turning while waiting for the winner's route. */
const MAX_HOLD_MS = 4000;

/**
 * Kept out of the component so the React Compiler's purity rule does not see
 * `Math.random` in render scope. The reel is theatre; only its frames use this.
 */
export function randomIndex(length: number): number {
  return Math.floor(Math.random() * length);
}
/**
 * Runs the shuffle that precedes a result. The winner is drawn uniformly up
 * front and the animation is pure theatre on the way to it, so a slow frame
 * can never bias the outcome.
 *
 * `showing` is the place currently on the reel, exposed so the map can draw its
 * route as the reel ticks. That is the whole point of the animation: you watch
 * candidate walks flick past rather than staring at an empty map until it
 * stops.
 */
export function useSpin(onLand: (place: Place) => void) {
  const [showing, setShowing] = useState<Place | null>(null);
  const frameRef = useRef(0);
  const landRef = useRef(onLand);
  useEffect(() => {
    landRef.current = onLand;
  });

  /**
   * Stops the animation without touching state, so it is safe to call from an
   * effect. `showing` is only rendered while the session says it is spinning,
   * so a stale value behind a stopped reel is never visible.
   */
  const cancel = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
  }, []);

  useEffect(() => cancel, [cancel]);

  /**
   * `winner` is chosen by the caller, which also starts fetching its route and
   * passes that here. `reel` is what the animation may display: places whose
   * route is already cached, so every visible tick puts a real line on the map.
   *
   * Winner and reel are separate on purpose. Drawing the winner from the reel
   * would bias the result toward whichever routes happened to load first.
   *
   * Reduced motion skips the reel entirely and lands at once. There is no
   * animation to protect in that case, and making someone who asked for less
   * motion wait on a network round trip would be a worse trade.
   */
  const run = useCallback(
    (winner: Place, reel: readonly Place[], ready: Promise<WalkingRoute | null>) => {
      cancelAnimationFrame(frameRef.current);
      // cancel() deliberately leaves `showing` alone, so clear it here or the
      // first frame of a new spin renders the previous spin's last name.
      setShowing(null);
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced || reel.length === 0) {
        setShowing(null);
        landRef.current(winner);
        return;
      }

      /**
       * Settled, not "drawable". A null result means the Routes API has no
       * walking route to the winner, or the request exhausted its retries;
       * either way there is nothing left to wait for and the result card
       * reports the gap. Bounded so a hung request still lands.
       */
      let settled = false;
      void ready.then(
        () => (settled = true),
        () => (settled = true),
      );

      const started = performance.now();
      let nextFlipAt = started;
      let shownIndex = -1;

      const tick = (now: number) => {
        const elapsed = now - started;
        const progress = Math.min(1, elapsed / DURATION_MS);
        if (progress >= 1 && (settled || elapsed >= DURATION_MS + MAX_HOLD_MS)) {
          frameRef.current = 0;
          setShowing(null);
          landRef.current(winner);
          return;
        }
        if (now >= nextFlipAt) {
          // Cubic ease-out on the interval, so the reel visibly slows down.
          const eased = 1 - Math.pow(1 - progress, 3);
          nextFlipAt = now + FIRST_FLIP_MS + (LAST_FLIP_MS - FIRST_FLIP_MS) * eased;
          let index = randomIndex(reel.length);
          if (index === shownIndex && reel.length > 1) index = (index + 1) % reel.length;
          shownIndex = index;
          setShowing(reel[index]!);
        }
        frameRef.current = requestAnimationFrame(tick);
      };
      frameRef.current = requestAnimationFrame(tick);
    },
    [],
  );

  return { showing, run, cancel };
}
