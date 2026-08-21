import type { LngLat } from "../lib/geometry.ts";
import { DIAL_STEP, MAX_MINUTES, MIN_MINUTES } from "../lib/isochrone.ts";
import { DEFAULT_ORIGIN, type Origin, type Vibe } from "../data/places.ts";
import type { ClimbBand } from "../lib/elevation.ts";
import type { TimeCap } from "./conditions.ts";

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
  /**
   * The lower end of the range, in the same total-minutes units as
   * `budgetMinutes`. Equal to the dial's minimum means no lower bound at all;
   * above it, the reach becomes a band - reachable inside the budget and NOT
   * inside this - and the map draws the inner contour as a hole.
   */
  floorMinutes: number;
  roundTrip: boolean;
  /** Restrict the pool to the outermost contour: "go as far as you can". */
  edgeOnly: boolean;
  climb: ClimbBand | "any";
  vibes: Vibe[];
  /** "Get back before dark". Opt-in; never set by the app itself. */
  beforeDark: boolean;
  /**
   * The time constraint currently clamping the dial, or null for "no usable
   * clamp" - either the mode is off, or it is already dark and a cap would be a
   * fiction. Derived, pushed in by the `timeCap` action; never persisted.
   *
   * A `TimeCap` rather than a bare number so the dial's note can name *which*
   * condition is clamping. `weather-filters` routes rain, storm, heat and cold
   * onset through the same field, which is what keeps one cap on the dial
   * instead of two competing ones.
   */
  timeCap: TimeCap | null;
  pickedId: string | null;
  spinning: boolean;
  /**
   * A throw cancelled because its pool moved out from under it. `spinStart`
   * has already cleared the pick by then, so without this the reel simply
   * vanishes: a press cue and no landing cue.
   */
  spinAborted: boolean;
  /**
   * How many times the picked place's route has been asked for. A transient
   * route failure is deliberately not cached, so nothing else in the app
   * changes when one happens and this is the only thing that can make the
   * fetch run again. Every action that changes which walk is on screen resets
   * it, which is why it lives here rather than beside the effect.
   */
  routeAttempt: number;
  pickingOrigin: boolean;
  /** 0 to 1 across the contour warm-up for the current origin. */
  warmed: number;
  failure: Failure | null;
  /**
   * Why the browser would not share a location. Lives here rather than beside
   * the geolocation call so it is cleared by the same origin change that
   * clears `failure`: the advice it gives is "drop a pin instead", and it used
   * to still be on screen after the pin was dropped.
   */
  locationError: string | null;
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
  | { type: "floor"; minutes: number }
  | { type: "toggleRoundTrip" }
  | { type: "toggleEdge" }
  | { type: "climb"; climb: ClimbBand | "any" }
  | { type: "toggleVibe"; vibe: Vibe }
  | { type: "clearVibes" }
  | { type: "toggleBeforeDark" }
  | { type: "timeCap"; cap: TimeCap | null }
  | { type: "clearFilters" }
  | { type: "spinStart" }
  | { type: "spinCancel" }
  | { type: "spinEnd"; pickedId: string }
  | { type: "pickPlace"; pickedId: string }
  | { type: "clearPick" }
  | { type: "beginPickOrigin" }
  | { type: "cancelPickOrigin" }
  | { type: "routeAttempt"; attempt: number }
  | { type: "warmProgress"; fraction: number }
  | { type: "failed"; failure: Failure }
  | { type: "locationError"; message: string | null }
  | { type: "frame" };

/**
 * Defaults for a fresh session.
 *
 * Round trips move the dial in two-minute notches from a floor of ten, so a
 * budget has to sit on that grid or the range input and React disagree about
 * the thumb and the dial jams. `clampBudget` is what enforces that everywhere
 * else, so the initial budget is put through it too rather than trusted to be
 * written on-grid by hand.
 *
 * Fifty is chosen for what it leaves outbound: half of it is the twenty-five
 * minute reach the app is built around, so defaulting to a round trip does not
 * quietly halve how much of the city is on offer at first load.
 */
const DEFAULT_ROUND_TRIP = true;
const DEFAULT_BUDGET_MINUTES = 50;

export const initialSession: Session = {
  origin: DEFAULT_ORIGIN,
  // No state to take a cap from at module scope, and none is wanted: the mode
  // defaults off, so the effective cap is null either way.
  budgetMinutes: clampBudget(DEFAULT_BUDGET_MINUTES, DEFAULT_ROUND_TRIP, null),
  floorMinutes: dialMinimum(DEFAULT_ROUND_TRIP),
  roundTrip: DEFAULT_ROUND_TRIP,
  edgeOnly: false,
  climb: "any",
  beforeDark: false,
  timeCap: null,
  vibes: [],
  pickedId: null,
  spinning: false,
  spinAborted: false,
  routeAttempt: 0,
  pickingOrigin: false,
  warmed: 0,
  failure: null,
  locationError: null,
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
        spinAborted: false,
        routeAttempt: 0,
        pickingOrigin: false,
        warmed: 0,
        failure: null,
        locationError: null,
        framingKey: state.framingKey + 1,
      };
    case "warmProgress":
      return { ...state, warmed: action.fraction };
    case "locationError":
      return { ...state, locationError: action.message };
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
      {
        const budgetMinutes = clampBudget(action.minutes, state.roundTrip, effectiveCap(state));
        return {
          ...state,
          budgetMinutes,
          // The floor cannot overtake the budget: a range whose ends crossed
          // would ask for a band with nothing in it.
          floorMinutes: clampFloor(state.floorMinutes, budgetMinutes, state.roundTrip, effectiveCap(state)),
          failure: null,
        };
      }
    case "floor":
      return {
        ...state,
        floorMinutes: clampFloor(action.minutes, state.budgetMinutes, state.roundTrip, effectiveCap(state)),
        failure: null,
      };
    case "toggleRoundTrip": {
      const roundTrip = !state.roundTrip;
      const budgetMinutes = clampBudget(state.budgetMinutes, roundTrip, effectiveCap({ ...state, roundTrip }));
      return {
        ...state,
        roundTrip,
        budgetMinutes,
        floorMinutes: clampFloor(state.floorMinutes, budgetMinutes, roundTrip, effectiveCap({ ...state, roundTrip })),
        // Halves or doubles the outbound contour with no dial commit to
        // piggyback on, so the map has to be told to re-frame.
        failure: null,
        framingKey: state.framingKey + 1,
      };
    }
    case "toggleEdge":
      return { ...state, edgeOnly: !state.edgeOnly };
    case "climb":
      return { ...state, climb: action.climb };
    case "toggleVibe":
      return {
        ...state,
        vibes: state.vibes.includes(action.vibe)
          ? state.vibes.filter((vibe) => vibe !== action.vibe)
          : [...state.vibes, action.vibe],
      };
    // The offered fix for `no-matching-vibe` clears the vibes and nothing else.
    // `clearFilters` is a sledgehammer aimed at an unknown nail, and toggling
    // each vibe off one at a time is N dispatches and N renders.
    /**
     * Flips the guard and re-clamps, the same shape as `toggleRoundTrip` and
     * for the same reason: the outbound contour can move with no dial commit to
     * piggyback on, so the map needs a re-frame of its own.
     */
    case "toggleBeforeDark": {
      const beforeDark = !state.beforeDark;
      const cap = effectiveCap({ ...state, beforeDark });
      const budgetMinutes = clampBudget(state.budgetMinutes, state.roundTrip, cap);
      return {
        ...state,
        beforeDark,
        budgetMinutes,
        floorMinutes: clampFloor(state.floorMinutes, budgetMinutes, state.roundTrip, cap),
        failure: null,
        framingKey: state.framingKey + 1,
      };
    }
    /**
     * The once-a-minute tick lands here, and almost always changes nothing.
     * Returning the same object when nothing moved is what keeps that tick from
     * re-rendering the whole app - it costs one Object.is comparison instead.
     *
     * Deliberately does NOT bump `framingKey`: a passive tick must not lurch
     * the camera once a minute.
     */
    case "timeCap": {
      const next = { ...state, timeCap: action.cap };
      const cap = effectiveCap(next);
      const budgetMinutes = clampBudget(state.budgetMinutes, state.roundTrip, cap);
      const floorMinutes = clampFloor(state.floorMinutes, budgetMinutes, state.roundTrip, cap);
      const same =
        state.timeCap?.minutes === action.cap?.minutes &&
        state.timeCap?.reason === action.cap?.reason &&
        state.timeCap?.untilMs === action.cap?.untilMs &&
        state.budgetMinutes === budgetMinutes &&
        state.floorMinutes === floorMinutes;
      return same ? state : { ...next, budgetMinutes, floorMinutes };
    }
    case "clearVibes":
      return state.vibes.length === 0 ? state : { ...state, vibes: [] };
    // THE CONTRACT: every sibling filter field must be reset here, and must
    // also expose itself as a `PoolRule` with a `clear` callback. A filter that
    // resets here but contributes no rule is invisible in the pool summary; a
    // rule that clears but does not reset here survives "Clear filters", which
    // is the trap `beforeDark` is deliberately allowed to fall into and nothing
    // else is.
    case "clearFilters":
      return { ...state, climb: "any", vibes: [], edgeOnly: false };
    // Every one of these changes which walk is on screen, so each starts the
    // route's retry budget over and clears the cancelled-throw notice.
    case "spinStart":
      return { ...state, spinning: true, pickedId: null, spinAborted: false, routeAttempt: 0 };
    case "spinCancel":
      return { ...state, spinning: false, spinAborted: true };
    case "spinEnd":
      return {
        ...state,
        spinning: false,
        pickedId: action.pickedId,
        spinAborted: false,
        routeAttempt: 0,
      };
    case "pickPlace":
      return {
        ...state,
        spinning: false,
        pickedId: action.pickedId,
        spinAborted: false,
        routeAttempt: 0,
      };
    case "clearPick":
      return { ...state, spinning: false, pickedId: null, spinAborted: false, routeAttempt: 0 };
    case "routeAttempt":
      return { ...state, routeAttempt: action.attempt };
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
 * How far one dial notch moves the *total* budget: one minute, always.
 *
 * Round trips used to move in two-minute notches so that halving the total
 * landed back on the contour ladder. That mattered when the ladder was coarse;
 * it now holds every minute from 5 to 60, so any total from the dial's floor
 * of ten halves onto a rung whatever its parity, and the doubling only cost
 * the dial half its resolution.
 *
 * Kept as a function rather than folded into callers because the dial's step,
 * its tick spacing and the budget snap all have to agree, and one of them
 * disagreeing is how the control jams.
 *
 * The old note, for why it was ever doubled: a 5 minute ladder plus a 15 minute round trip
 * would ask for a 7 minute outbound contour that was never prefetched, and the
 * dial would be back to hitting the network.
 */
export function budgetStep(): number {
  return DIAL_STEP;
}

/**
 * Snaps a budget onto the dial's notches and inside its range.
 *
 * @public - exported so `suggestFix` can snap a proposed budget onto the same
 * notches. Without it the empty-pool fix can offer a budget the dial
 * immediately re-snaps to something else, and the button lies about the number
 * written on its own face.
 */
export function clampBudget(
  minutes: number,
  roundTrip: boolean,
  cap: number | null,
): number {
  const low = dialMinimum(roundTrip);
  const step = budgetStep();
  const snapped = low + Math.round((minutes - low) / step) * step;
  const ceiling = cap === null ? MAX_MINUTES : Math.min(MAX_MINUTES, cap);
  return Math.min(ceiling, Math.max(low, snapped));
}

/**
 * Snaps the range's lower end onto the notches, and keeps it at least one
 * whole band below the budget. A floor equal to the dial minimum is the
 * "no lower bound" position rather than a 5 minute hole.
 */
function clampFloor(
  minutes: number,
  budgetMinutes: number,
  roundTrip: boolean,
  cap: number | null,
): number {
  const low = dialMinimum(roundTrip);
  const step = budgetStep();
  const snapped = low + Math.round((minutes - low) / step) * step;
  const ceiling = cap === null ? budgetMinutes : Math.min(budgetMinutes, cap);
  return Math.min(Math.max(low, ceiling - step), Math.max(low, snapped));
}

/**
 * The cap that is actually in force, or null.
 *
 * Null when the mode is off, when nothing is clamping, or when the cap has
 * fallen below the dial's own minimum - because a cap of zero is not a dial and
 * a cap with one position on it is not one either. After dark the mode says
 * something honest instead of clamping to a fiction.
 */
function effectiveCap(
  state: Pick<Session, "beforeDark" | "timeCap" | "roundTrip">,
): number | null {
  if (!state.beforeDark || state.timeCap === null) return null;
  return state.timeCap.minutes < dialMinimum(state.roundTrip) ? null : state.timeCap.minutes;
}

/**
 * The dial's usable ceiling. The *track* still spans `dialMinimum..MAX_MINUTES`
 * - the clamp is drawn as a dead zone rather than a shorter slider, so a reader
 * can see how much walk the light is costing them.
 *
 * @public - consumed by App and `TimeDial`.
 */
export function dialMaximum(
  state: Pick<Session, "beforeDark" | "timeCap" | "roundTrip">,
): number {
  const cap = effectiveCap(state);
  return cap === null ? MAX_MINUTES : Math.min(cap, MAX_MINUTES);
}

/** Minutes of *outbound* walking, which is what the isochrone measures. */
export function outboundMinutes(state: Pick<Session, "budgetMinutes" | "roundTrip">): number {
  return state.roundTrip ? Math.floor(state.budgetMinutes / 2) : state.budgetMinutes;
}

/**
 * The outbound minutes of the range's lower end, or null when there is no
 * lower bound. Null rather than the dial minimum so callers cannot accidentally
 * punch a 5 minute hole in every reach.
 */
export function outboundFloorMinutes(
  state: Pick<Session, "floorMinutes" | "roundTrip">,
): number | null {
  if (state.floorMinutes <= dialMinimum(state.roundTrip)) return null;
  return state.roundTrip ? Math.floor(state.floorMinutes / 2) : state.floorMinutes;
}

export function customOrigin(at: LngLat): Origin {
  return { id: "custom", name: "Dropped pin", lat: at.lat, lng: at.lng };
}
