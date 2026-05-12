import type { Difficulty, StartLocation, Vibe } from "../data/pois";
import type { Range } from "./geo";
import type { ShareState } from "./url-state";

export type FilterState = {
  startId: string;
  customStart: StartLocation | null;
  range: Range;
  roundTrip: boolean;
  difficulty: "any" | Difficulty;
  tags: Set<Vibe>;
};

export type FilterAction =
  | { type: "SET_START_ID"; id: string }
  | { type: "SET_CUSTOM_START"; start: StartLocation | null }
  | { type: "SET_RANGE"; range: Range }
  | { type: "SET_ROUND_TRIP"; value: boolean }
  | { type: "SET_DIFFICULTY"; value: "any" | Difficulty }
  | { type: "SET_TAGS"; tags: Set<Vibe> }
  | { type: "CLEAR_FILTERS" };

const INITIAL_FILTER_STATE: FilterState = {
  startId: "monroe",
  customStart: null,
  range: [2, 4],
  roundTrip: true,
  difficulty: "any",
  tags: new Set<Vibe>(),
};

export function filterReducer(state: FilterState, action: FilterAction): FilterState {
  switch (action.type) {
    case "SET_START_ID":
      // Selecting a preset implicitly clears any custom map-pin start.
      return { ...state, startId: action.id, customStart: null };
    case "SET_CUSTOM_START":
      return { ...state, customStart: action.start };
    case "SET_RANGE":
      return { ...state, range: action.range };
    case "SET_ROUND_TRIP":
      return { ...state, roundTrip: action.value };
    case "SET_DIFFICULTY":
      return { ...state, difficulty: action.value };
    case "SET_TAGS":
      return { ...state, tags: action.tags };
    case "CLEAR_FILTERS":
      // Reset everything that can exclude POIs. Start location is preserved
      // (it's an anchor, not a filter).
      return {
        ...state,
        range: [0, 8],
        difficulty: "any",
        tags: new Set<Vibe>(),
      };
  }
}

/**
 * Lazy-initializer for useReducer. Reads the URL hash once at mount and
 * returns the full FilterState in one shot — eliminates the previous
 * URL-restore effect that fired 7 cascading setStates.
 */
export function filterStateFromShare(share: Partial<ShareState> | null): FilterState {
  if (!share) return INITIAL_FILTER_STATE;
  return {
    startId: share.start ?? INITIAL_FILTER_STATE.startId,
    customStart: share.custom ?? null,
    range: share.range ?? INITIAL_FILTER_STATE.range,
    roundTrip: typeof share.rt === "boolean" ? share.rt : INITIAL_FILTER_STATE.roundTrip,
    difficulty: share.diff ?? INITIAL_FILTER_STATE.difficulty,
    tags: new Set<Vibe>((share.tags as Vibe[]) ?? []),
  };
}
