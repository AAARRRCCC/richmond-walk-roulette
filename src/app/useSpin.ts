import { useCallback, useEffect, useRef, useState } from "react";
import type { Place } from "../data/places";
import type { LngLat } from "../lib/geometry";
import type { WalkingRoute } from "../lib/route";
import { playLanding, playRatchet } from "../lib/sound";
import { tuning } from "./tuning";
import { orderAroundOrigin, reelFrameAt, type ReelStop } from "./reel";

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
    (
      winner: Place,
      reel: readonly Place[],
      ready: Promise<WalkingRoute | null>,
      origin: LngLat,
    ) => {
      cancelAnimationFrame(frameRef.current);
      // cancel() deliberately leaves `showing` alone, so clear it here or the
      // first frame of a new spin renders the previous spin's last name.
      setShowing(null);
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduced || reel.length === 0) {
        setShowing(null);
        playLanding();
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

      /**
       * The reel has to be able to stop on the winner, so it must contain it.
       * The winner is still drawn from the full candidate list by the caller;
       * this only widens what may be *displayed*, which biases nothing.
       */
      const pool = reel.includes(winner) ? reel : [...reel, winner];
      // Compass order is an experiment; off, the reel runs in the order the
      // candidate list was built, exactly as before.
      const slots = tuning.spinCircularOrder ? orderAroundOrigin(origin, pool) : pool;
      const target = slots.indexOf(winner);

      const started = performance.now();
      /**
       * Where the reel was when a result first became available to stop on.
       * Recorded once; `reelFrameAt` runs the arrival from it.
       */
      let stop: ReelStop | null = null;
      let shownSlot = -1;

      const tick = (now: number) => {
        // Read per frame, not per run: the tuning panel is judged by ear while
        // the reel is turning, so a change has to take effect mid-throw.
        const settings = tuning;
        const elapsed = now - started;

        // A route that never arrives must not hold the reel forever.
        const overdue = elapsed >= settings.spinDurationMs + settings.spinMaxHoldMs;
        if (stop === null && elapsed >= settings.spinDurationMs && (settled || overdue)) {
          stop = { slot: shownSlot < 0 ? target : shownSlot, elapsed };
        }

        const frame = reelFrameAt(elapsed, settings, target, slots.length, stop);
        if (frame.kind === "land") {
          frameRef.current = 0;
          // `showing` is the winner already: the run-in stepped onto it and it
          // has been resting there, so the reel and the card agree across the
          // swap and there is nothing left to jump.
          playLanding();
          landRef.current(winner);
          return;
        }

        // Drawing on change, rather than against a second copy of the flip
        // schedule, keeps the reel's timing in one place: the slot changes
        // exactly when a flip is due, so there is nothing for the two to
        // drift apart about.
        if (frame.slot !== shownSlot) {
          shownSlot = frame.slot;
          playRatchet(Math.min(1, elapsed / settings.spinDurationMs));
          setShowing(slots[frame.slot]!);
        }

        frameRef.current = requestAnimationFrame(tick);
      };
      frameRef.current = requestAnimationFrame(tick);
    },
    [],
  );

  return { showing, run, cancel };
}
