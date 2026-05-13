/**
 * State machine for the wheel's rotation/spin/selection. Pulled out of App.tsx
 * so the (rotation, spinning, selectedId) trio updates atomically — the
 * previous separate setStates briefly produced intermediate renders (e.g.
 * spinning=true with selectedId still pointing at the prior pick).
 *
 * Used by both spin() and rotateTo() — they have the same lifecycle, just
 * different rotation targets and durations.
 */
export type WheelState = {
  rotation: number;
  spinning: boolean;
  selectedId: string | null;
};

export type WheelAction =
  /** Begin an animation. Clears any prior pick, flips spinning on. Rotation
   *  is left alone — the caller's animation tick will update it from where
   *  it was. */
  | { type: "SPIN_START" }
  /** Mid-animation tick. Fires ~60x/sec via requestAnimationFrame; only
   *  updates rotation so React can batch with the surrounding render. */
  | { type: "ROTATION_TICK"; rotation: number }
  /** Animation completed. Snap rotation to the exact target (no float
   *  drift), commit the pick, flip spinning off. */
  | { type: "SPIN_END"; rotation: number; pickedId: string }
  /** Drop any pick and reset rotation. Used by:
   *   - Clear button
   *   - start-location change (preset or custom pick)
   *   - filter-invalidation effect when current pick is no longer eligible
   *   - filter-cancel-spin effect when wheelPois identity changes mid-spin */
  | { type: "CLEAR_SELECTION" };

export function wheelReducer(state: WheelState, action: WheelAction): WheelState {
  switch (action.type) {
    case "SPIN_START":
      return { ...state, spinning: true, selectedId: null };
    case "ROTATION_TICK":
      return { ...state, rotation: action.rotation };
    case "SPIN_END":
      return { rotation: action.rotation, spinning: false, selectedId: action.pickedId };
    case "CLEAR_SELECTION":
      return { rotation: 0, spinning: false, selectedId: null };
  }
}

export function wheelStateFromShare(pickId: string | null | undefined): WheelState {
  return {
    rotation: 0,
    spinning: false,
    selectedId: pickId ?? null,
  };
}
