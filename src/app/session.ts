import type { LngLat } from "../lib/geometry";
import { DIAL_STEP, MAX_MINUTES, MIN_MINUTES } from "../lib/isochrone";
import { DEFAULT_ORIGIN, type Origin, type Terrain, type Vibe } from "../data/places";

/**
 * What the user has chosen. Everything derived from it, the reachable area and
 * the routes, lives in the contour and route caches and is read from there;
 * duplicating it here is what let a stale budget and a stale reach disagree.
 */
export type Failure = { message: string; configured: boolean };

export type Session = {
  origin: Origin;
  /** Total minutes the walker has. Split across both legs when roundTrip. */
  budgetMinutes: number;
  roundTrip: boolean;
  /** Restrict the pool to the outermost contour: "go as far as you can". */
  edgeOnly: boolean;
  terrain: Terrain | "any";
  vibes: Vibe[];
  pickedId: string | null;
  spinning: boolean;
  pickingOrigin: boolean;
  /** 0 to 1 across the contour warm-up for the current origin. */
  warmed: number;
  failure: Failure | null;
  /**
   * Bumped when the map should re-frame: a new origin, or a dial that has come
   * to rest. Not every dial value, or a drag would restart the camera on every
   * pixel now that the contours arrive instantly.
   */
  framingKey: number;
};

export type Action =
  | { type: "origin"; origin: Origin }
  | { type: "budget"; minutes: number }
  | { type: "toggleRoundTrip" }
  | { type: "toggleEdge" }
  | { type: "terrain"; terrain: Terrain | "any" }
  | { type: "toggleVibe"; vibe: Vibe }
  | { type: "clearFilters" }
  | { type: "spinStart" }
  | { type: "spinCancel" }
  | { type: "spinEnd"; pickedId: string }
  | { type: "pickPlace"; pickedId: string }
  | { type: "clearPick" }
  | { type: "beginPickOrigin" }
  | { type: "cancelPickOrigin" }
  | { type: "warmProgress"; fraction: number }
  | { type: "failed"; failure: Failure }
  | { type: "frame" };

export const initialSession: Session = {
  origin: DEFAULT_ORIGIN,
  budgetMinutes: 25,
  roundTrip: false,
  edgeOnly: false,
  terrain: "any",
  vibes: [],
  pickedId: null,
  spinning: false,
  pickingOrigin: false,
  warmed: 0,
  failure: null,
  framingKey: 0,
};

export function reduce(state: Session, action: Action): Session {
  switch (action.type) {
    case "origin":
      // The pick's walk time was measured from the old origin, so it is stale,
      // and the whole warm-up starts over for the new one. Doing this here
      // rather than in an effect keeps it atomic with the origin change.
      return {
        ...state,
        origin: action.origin,
        pickedId: null,
        spinning: false,
        pickingOrigin: false,
        warmed: 0,
        failure: null,
        framingKey: state.framingKey + 1,
      };
    case "warmProgress":
      return { ...state, warmed: action.fraction };
    case "failed":
      return { ...state, failure: action.failure, spinning: false };
    case "frame":
      return { ...state, framingKey: state.framingKey + 1 };
    case "budget":
      // The pick survives a budget change on purpose: the walk itself did not
      // change, only whether it still fits. The result card says which.
      //
      // Clearing the failure matters as much: one contour that exhausted its
      // retries must not lock every other dial position out of trying.
      return {
        ...state,
        budgetMinutes: clampBudget(action.minutes, state.roundTrip),
        failure: null,
      };
    case "toggleRoundTrip": {
      const roundTrip = !state.roundTrip;
      return {
        ...state,
        roundTrip,
        budgetMinutes: clampBudget(state.budgetMinutes, roundTrip),
        // Halves or doubles the outbound contour with no dial commit to
        // piggyback on, so the map has to be told to re-frame.
        failure: null,
        framingKey: state.framingKey + 1,
      };
    }
    case "toggleEdge":
      return { ...state, edgeOnly: !state.edgeOnly };
    case "terrain":
      return { ...state, terrain: action.terrain };
    case "toggleVibe":
      return {
        ...state,
        vibes: state.vibes.includes(action.vibe)
          ? state.vibes.filter((vibe) => vibe !== action.vibe)
          : [...state.vibes, action.vibe],
      };
    case "clearFilters":
      return { ...state, terrain: "any", vibes: [], edgeOnly: false };
    case "spinStart":
      return { ...state, spinning: true, pickedId: null };
    case "spinCancel":
      return { ...state, spinning: false };
    case "spinEnd":
      return { ...state, spinning: false, pickedId: action.pickedId };
    case "pickPlace":
      return { ...state, spinning: false, pickedId: action.pickedId };
    case "clearPick":
      return { ...state, spinning: false, pickedId: null };
    case "beginPickOrigin":
      return { ...state, pickingOrigin: true };
    case "cancelPickOrigin":
      return { ...state, pickingOrigin: false };
  }
}

/**
 * Lowest value the dial may take. A round trip splits the budget across two
 * legs, so the smallest honest total is twice the smallest contour we can ask
 * for. Without the floor, a 7 minute round trip would quietly request a 5
 * minute outbound leg and promise a 10 minute walk.
 */
export function dialMinimum(roundTrip: boolean): number {
  return roundTrip ? MIN_MINUTES * 2 : MIN_MINUTES;
}

/**
 * How far one dial notch moves the *total* budget.
 *
 * Doubled for round trips so that halving the total always lands back on the
 * contour ladder. Without this, a 5 minute ladder plus a 15 minute round trip
 * would ask for a 7 minute outbound contour that was never prefetched, and the
 * dial would be back to hitting the network.
 */
export function budgetStep(roundTrip: boolean): number {
  return roundTrip ? DIAL_STEP * 2 : DIAL_STEP;
}

/** Snaps a budget onto the dial's notches and inside its range. */
export function clampBudget(minutes: number, roundTrip: boolean): number {
  const low = dialMinimum(roundTrip);
  const step = budgetStep(roundTrip);
  const snapped = low + Math.round((minutes - low) / step) * step;
  return Math.min(MAX_MINUTES, Math.max(low, snapped));
}

/** Minutes of *outbound* walking, which is what the isochrone measures. */
export function outboundMinutes(state: Pick<Session, "budgetMinutes" | "roundTrip">): number {
  return state.roundTrip ? Math.floor(state.budgetMinutes / 2) : state.budgetMinutes;
}

export function customOrigin(at: LngLat): Origin {
  return { id: "custom", name: "Dropped pin", lat: at.lat, lng: at.lng };
}
