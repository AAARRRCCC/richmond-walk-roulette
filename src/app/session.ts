import type { LngLat } from "../lib/geometry.ts";
import { DIAL_STEP, MAX_MINUTES, MIN_MINUTES } from "../lib/isochrone.ts";
import { DEFAULT_ORIGIN, type Origin, type PlaceKind, type Vibe } from "../data/places.ts";
import type { ClimbBand } from "../lib/elevation.ts";
import type { TimeCap } from "./conditions.ts";
import type { LocationNotice } from "../lib/locate.ts";
import {
  canonicalQuery,
  decodeShare,
  encodeShare,
  epochDay,
  meetKind,
  shareUrl,
  isEmptyLink,
  type ShareInput,
  type ShareLink,
  type SharedOrigin,
} from "./share.ts";
// The first `src/app/ -> src/lib/bounds` import, and it earns its place: a
// forged `ma` has to be refused BEFORE it becomes an `Origin`, not after it
// becomes a request. The proxy would 400 it anyway, but a client that refuses
// first means a forged link cannot even generate the attempt.
import { insideRichmond } from "../lib/bounds.ts";

/**
 * What the user has chosen. Everything derived from it, the reachable area and
 * the routes, lives in the contour and route caches and is read from there;
 * duplicating it here is what let a stale budget and a stale reach disagree.
 */
export type Failure = { message: string; configured: boolean };

/**
 * How this session arrived.
 *
 * Non-null only when the app was opened from a share link, and cleared by the
 * first action that changes which walk is on screen.
 */
export type SharedArrival = {
  /** Set when the link named a place this build no longer has. */
  missingPlaceId: string | null;
  /** The budget the link asked for, when the dial could not honour it. */
  clampedFromMinutes: number | null;
  /**
   * `canonicalQuery` of the link exactly as it arrived.
   *
   * App compares the live session's canonical query against this to decide when
   * the address bar has stopped describing the screen. Without it the
   * URL-clearing rule and the `shared` flag would have to be the same thing,
   * and they are not: moving the dial makes the URL wrong immediately, while the
   * arrival notices stay relevant until they are dismissed.
   */
  linkQuery: string;
};

/**
 * A partner start that arrived as a coordinate rather than as a preset id.
 *
 * Deliberately a plain `Origin` so every existing per-origin path - the contour
 * cache, `cachedReach`, `prefetchLadder`, `pointKey`, `snapshotName` - takes it
 * unchanged, with no adapter anywhere.
 *
 * **Only for pins.** A preset `ma` resolves to its own `PRESET_ORIGINS` entry
 * and keeps its own id and name - "Carytown", not "Their start" - which is both
 * truthful and what the panel's chip renders. The "no free text from a link"
 * invariant is enforced by this being the only constructor: `id` and `name` are
 * literals that never come from the URL, so there is no code path from a query
 * value to a rendered name.
 *
 * A consequence, and it is a trap: when `ma` and `mb` name the same preset,
 * `Session.partner` and `Session.origin` are the SAME OBJECT. Nothing may
 * distinguish the two sides by `origin.id`; the sides are `state.origin` and
 * `state.partner`, and that is the only distinction that holds.
 */
export function partnerOrigin(at: LngLat): Origin {
  return { id: "partner", name: "Their start", lat: at.lat, lng: at.lng };
}

/**
 * How a meet link arrived. Null unless this session was opened from one.
 *
 * Separate from `shared` because the two expire at different moments: `shared`
 * is dropped by the first action that changes which walk is on screen, while a
 * meeting survives a spin - the other person is still there afterwards.
 */
export type MeetArrival = {
  readonly kind: "invite" | "answer";
  /** From `d`. Null when the link carried no pin, so nothing was disclosed to date. */
  readonly mintedDay: number | null;
  /**
   * True when the link's partner coordinate (`ma`) was outside RICHMOND_BOUNDS.
   * The partner is NOT set in that case: an invite from another city is a
   * designed refusal, not an engine failure, and it gets a sentence naming
   * Richmond rather than the generic engine notice.
   */
  readonly partnerOutOfBounds: boolean;
  /**
   * True when the link's echo of the READER's own start (`mb`) was out of
   * bounds or unparseable, so it was dropped and `originChosen` stayed false.
   *
   * This can only happen if the sender's app mangled the echo, since `mb` is
   * never anything but a value the reader themselves sent - which is exactly
   * why it gets a line rather than silence. "The link came back with your own
   * start broken; set it again" is true, short and actionable, and this app
   * does not fail silently even about its own mistakes.
   */
  readonly selfOutOfBounds: boolean;
  /**
   * The budget the other person committed to, or null if they had not.
   *
   * Read by the Spin gate: in a meeting where they have locked in, spinning
   * waits until this device's dial agrees. It is the cheapest possible form of
   * "both of you settle on a number first" - one integer, carried by a link
   * that was already being sent, with no socket and no server holding a room.
   */
  readonly partnerLockedMinutes: number | null;
};

export type Session = {
  origin: Origin;
  /**
   * Total minutes the walker has, after every cap in force. Split across both
   * legs when roundTrip. This is the number the map is drawn at.
   */
  budgetMinutes: number;
  /**
   * The dial position the reader actually asked for, before any cap touched it.
   *
   * Without it a cap is one-way: the reducer clamps `budgetMinutes` down when
   * the rain moves in, and switching the rules back off leaves the budget where
   * the clamp put it, so the button offering to undo the cause undoes nothing.
   * Every clamping path re-derives `budgetMinutes` from this rather than from
   * its own previous output, which is what makes a cap reversible.
   *
   * Never rendered. The dial shows `budgetMinutes`, because a thumb that sits
   * outside the shaded dead zone is the UI lying about what it will do.
   */
  requestedBudgetMinutes: number;
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
  /**
   * Which tier the spin draws from. Mixed by default, because the surprise is
   * the product: a detour is the best answer this app has to "twenty minutes,
   * surprise me", and hiding the new half of the dataset behind a control
   * nobody presses would waste it.
   */
  kind: PlaceKind;
  vibes: Vibe[];
  /** "Get back before dark". Opt-in; never set by the app itself. */
  beforeDark: boolean;
  /**
   * "Skip closed places". Defaults ON, unlike every other filter here.
   *
   * The default excludes rather than annotates because being sent forty minutes
   * to a padlocked gate is the single worst thing this app can do to somebody,
   * and a walker who wants the closed ones back can say so. `unknown` is never
   * excluded - most of the list has no schedule in OSM and never will - so this
   * only ever removes places something actually says are shut.
   */
  hideClosed: boolean;
  /**
   * "Mind the weather". Gates every rule that changes the pool or the dial, and
   * never the conditions line - the forecast is stated whatever this says,
   * because the reader deciding to ignore the rain does not stop it raining.
   *
   * Defaults on, because the rules it gates are the ones a walker would apply
   * from memory anyway: nobody sets out on a fifty-minute round trip into a
   * thunderstorm on purpose.
   */
  weatherAware: boolean;
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
   * Anything the app has to say about where you are: why the browser would not
   * share a location, why we would not use what it shared, or a caveat on a fix
   * we did accept - plus, sometimes, a preset to offer as the way out.
   *
   * Lives here rather than beside the geolocation call so it is cleared by the
   * same origin change that clears `failure`. That is what stops "you are
   * outside Richmond" from surviving the user taking the offered preset, and it
   * is the same bug the advice "drop a pin instead" used to have when it stayed
   * on screen after the pin was dropped.
   */
  locationNotice: LocationNotice | null;
  /**
   * Bumped when the map should re-frame: a new origin, or a dial that has come
   * to rest. Not every dial value, or a drag would restart the camera on every
   * pixel now that the contours arrive instantly.
   */
  framingKey: number;
  /** Non-null only on a session restored from a share link. */
  shared: SharedArrival | null;
  /** Non-null only on a session opened from a meet link. */
  meet: MeetArrival | null;
  /**
   * The other person's start, or null. Read-only on this device: it arrived
   * from a link and the person it belongs to is not here.
   */
  partner: Origin | null;
  /**
   * False for exactly one state: a fresh invite before this reader has answered
   * it.
   *
   * A flag rather than a nullable `origin`, which would make fourteen call
   * sites and an exhaustive reducer argue about a case that lasts one screen.
   * While it is false **nothing is drawn for the local side, no ladder is
   * warmed, Spin is not pressable, and no link is mintable** - because
   * `origin` is still DEFAULT_ORIGIN, Monroe Park, which has nothing to do
   * with this reader, and answering a stranger's question from it is the same
   * lie as the circle. The first `origin` action of any kind sets it true
   * forever.
   */
  originChosen: boolean;
  /**
   * 0 to 1 across the PARTNER's contour warm-up.
   *
   * Deliberately not folded into `warmed`, which means "this device's own reach
   * is ready": that scalar gates the on-demand `fetchReach` and shades the dial,
   * and a second leg writing into it would make it mean neither thing. Two
   * scalars, one meaning each.
   */
  partnerWarmed: number;
  /**
   * A failure on the PARTNER's leg only.
   *
   * Separate from `failure` because `failure` is read by the on-demand fetch
   * gate and by `status`, which resolves to an error state whenever `reach` is
   * null - so routing their engine error into it would blank YOUR answer at any
   * dial position of yours that has not warmed yet.
   */
  partnerFailure: Failure | null;
};

export type Action =
  | { type: "origin"; origin: Origin }
  | { type: "budget"; minutes: number }
  | { type: "floor"; minutes: number }
  | { type: "toggleRoundTrip" }
  | { type: "toggleEdge" }
  | { type: "climb"; climb: ClimbBand | "any" }
  | { type: "kind"; kind: PlaceKind }
  | { type: "toggleVibe"; vibe: Vibe }
  | { type: "clearVibes" }
  | { type: "toggleBeforeDark" }
  | { type: "toggleWeatherAware" }
  | { type: "toggleHideClosed" }
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
  | { type: "locationNotice"; notice: LocationNotice | null }
  | { type: "frame" }
  | { type: "dismissShared" }
  | { type: "dismissMeet" }
  | { type: "leaveMeet" }
  | { type: "partnerWarmProgress"; fraction: number }
  | { type: "partnerFailed"; failure: Failure | null };

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
  requestedBudgetMinutes: clampBudget(DEFAULT_BUDGET_MINUTES, DEFAULT_ROUND_TRIP, null),
  floorMinutes: dialMinimum(DEFAULT_ROUND_TRIP),
  roundTrip: DEFAULT_ROUND_TRIP,
  edgeOnly: false,
  climb: "any",
  kind: "any",
  beforeDark: false,
  weatherAware: true,
  hideClosed: true,
  timeCap: null,
  vibes: [],
  pickedId: null,
  spinning: false,
  spinAborted: false,
  routeAttempt: 0,
  pickingOrigin: false,
  warmed: 0,
  failure: null,
  locationNotice: null,
  framingKey: 0,
  shared: null,
  meet: null,
  partner: null,
  originChosen: true,
  partnerWarmed: 0,
  partnerFailure: null,
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
        locationNotice: null,
        framingKey: state.framingKey + 1,
        shared: null,
        // Choosing your own start is how you ANSWER an invite, so it must not
        // clear the meeting: `partner` and `meet` both survive, and moving your
        // own start later does not un-invite anybody either.
        originChosen: true,
        // The prefetch effect is about to re-run both legs, so a stale warning
        // about their side would outlive the attempt it describes.
        partnerFailure: null,
      };
    case "warmProgress":
      return { ...state, warmed: action.fraction };
    case "locationNotice":
      return { ...state, locationNotice: action.notice };
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
          // The reader's own number, kept unclamped: this is the one action
          // that sets it, because it is the only one where the reader said it.
          requestedBudgetMinutes: clampBudget(action.minutes, state.roundTrip, null),
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
      const budgetMinutes = clampBudget(state.requestedBudgetMinutes, roundTrip, effectiveCap({ ...state, roundTrip }));
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
    case "kind":
      return { ...state, kind: action.kind };
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
     * Flips the guard and re-clamps, the same kind as `toggleRoundTrip` and
     * for the same reason: the outbound contour can move with no dial commit to
     * piggyback on, so the map needs a re-frame of its own.
     */
    case "toggleBeforeDark": {
      const beforeDark = !state.beforeDark;
      const cap = effectiveCap({ ...state, beforeDark });
      const budgetMinutes = clampBudget(state.requestedBudgetMinutes, state.roundTrip, cap);
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
     * The same kind as `toggleBeforeDark`, and for the same reason: a weather
     * cap can move the outbound contour with no dial commit to piggyback on.
     *
     * It must **not** clear `pickedId`. A weather rule can move the pool under
     * an existing pick, and the card's "outside your current time budget"
     * warning is already the right answer for that.
     */
    case "toggleHideClosed":
      // No re-clamp and no re-frame: this changes which places are in the pool,
      // never how far the reach goes.
      return { ...state, hideClosed: !state.hideClosed };
    case "toggleWeatherAware": {
      const weatherAware = !state.weatherAware;
      const cap = effectiveCap({ ...state, weatherAware });
      const budgetMinutes = clampBudget(state.requestedBudgetMinutes, state.roundTrip, cap);
      return {
        ...state,
        weatherAware,
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
      const budgetMinutes = clampBudget(state.requestedBudgetMinutes, state.roundTrip, cap);
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
    //
    // `weatherAware` falls into it too, and for the same reason stated from
    // both ends: `activeFilters` does not count it, so the count would not drop
    // when this ran, and a reader who deliberately turned the weather rules off
    // would have them switched back on by a button that says "clear". This
    // clears what the count counts.
    case "clearFilters":
      return { ...state, climb: "any", kind: "any", vibes: [], edgeOnly: false };
    // Every one of these changes which walk is on screen, so each starts the
    // route's retry budget over and clears the cancelled-throw notice.
    case "spinStart":
      return {
        ...state,
        spinning: true,
        pickedId: null,
        spinAborted: false,
        routeAttempt: 0,
        shared: null,
      };
    case "spinCancel":
      return { ...state, spinning: false, spinAborted: true };
    case "spinEnd":
      return {
        ...state,
        spinning: false,
        pickedId: action.pickedId,
        spinAborted: false,
        routeAttempt: 0,
        shared: null,
      };
    case "pickPlace":
      return {
        ...state,
        spinning: false,
        pickedId: action.pickedId,
        spinAborted: false,
        routeAttempt: 0,
        shared: null,
      };
    case "clearPick":
      return {
        ...state,
        spinning: false,
        pickedId: null,
        spinAborted: false,
        routeAttempt: 0,
        shared: null,
      };
    case "dismissShared":
      return state.shared === null ? state : { ...state, shared: null };
    // Dismisses the NOTICES about the link, not the session the link created -
    // the same kind as `dismissShared`, and the reason `partner` is untouched.
    case "dismissMeet":
      return state.meet === null ? state : { ...state, meet: null };
    /**
     * Drop the other person and go back to being one app.
     *
     * `meet` goes with them: a stale "this invite is 3 days old" line over a
     * one-person session is noise about a link that no longer describes
     * anything on screen.
     *
     * The pick is cleared too, and that is the half worth stating. The pool is
     * about to change - it was the intersection and is about to be one reach -
     * so a pick produced by the old pool is no longer a pick from this one, and
     * a pick surviving a pool change is a bug chunk 2 spent a section on.
     */
    case "leaveMeet":
      return {
        ...state,
        partner: null,
        meet: null,
        originChosen: true,
        partnerWarmed: 0,
        partnerFailure: null,
        pickedId: null,
        spinning: false,
        spinAborted: false,
        routeAttempt: 0,
        framingKey: state.framingKey + 1,
      };
    case "partnerWarmProgress":
      return { ...state, partnerWarmed: action.fraction };
    case "partnerFailed":
      return { ...state, partnerFailure: action.failure };
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
  state: Pick<Session, "beforeDark" | "weatherAware" | "timeCap" | "roundTrip">,
): number | null {
  if (state.timeCap === null) return null;

  /**
   * **Only daylight moves the dial. Weather warns and never clamps.**
   *
   * Both used to. The difference that decides it is which switch owns the
   * reason: `beforeDark` is opt-in and its label is a promise - "Get back
   * before dark" is somebody *asking* to be held to a limit, and honouring it
   * is doing what they said. `weatherAware` defaults ON, so a rain cap took
   * reach away from every walker who had never asked for it.
   *
   * And it took it away repeatedly. The cap is derived from the onset time, so
   * it falls as the rain approaches; every tick re-clamped the budget, which
   * meant a reader who dragged the slider up watched it thrown back a few
   * seconds later, over and over, with no way to refuse. A limit you cannot
   * argue with had better be one you asked for.
   *
   * The forecast still says everything it knew: the conditions line names the
   * rain, the graph draws it, and a walk that will not finish before it gets a
   * warning. What it no longer does is decide.
   */
  if (state.timeCap.reason !== "daylight") return null;
  if (!state.beforeDark) return null;
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
  state: Pick<Session, "beforeDark" | "weatherAware" | "timeCap" | "roundTrip">,
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

/**
 * A fresh session as a share link describes it.
 *
 * Pure, and the lazy initialiser for App's `useReducer` — restoring through a
 * burst of existing actions would fire each one's resets in turn (`origin`
 * clears `pickedId`, `toggleRoundTrip` re-clamps the budget) and end somewhere
 * the link did not ask for.
 *
 * It lives here rather than in `share.ts` because it needs `clampBudget` and
 * `clampFloor`, which are this module's own and stay that way.
 *
 * @public - consumed by App and by `share.test.ts`.
 */
export function applyShare(base: Session, link: ShareLink, places: readonly { id: string }[], presets: readonly Origin[]): Session {
  // Identity on an empty link, so a cold start with no query costs nothing and
  // `shared` stays null rather than becoming an empty arrival.
  if (isEmptyLink(link)) return base;

  /**
   * A link's origin as an `Origin`, or null when it named nothing usable.
   *
   * `pin` builds through the caller's constructor: the reader's own start is a
   * `customOrigin` like any dropped pin, while the partner's is a
   * `partnerOrigin` whose id and name are literals. A preset resolves to its
   * own entry either way and keeps its own identity.
   */
  const resolve = (
    at: SharedOrigin | null,
    pin: (coords: LngLat) => Origin,
  ): Origin | null => {
    if (at === null) return null;
    if (at.kind === "preset") return presets.find((preset) => preset.id === at.id) ?? null;
    return pin({ lat: at.lat, lng: at.lng });
  };

  const kind = meetKind(link);

  // ---- the meeting, when there is one -------------------------------------
  // Everything below is written HERE, at the lazy initialiser, and never by a
  // later dispatch: restoring a partner through a dispatch would frame the map
  // twice, once on the default session and once on the shared one.
  const partnerAt = kind === "none" ? null : resolve(link.originA, partnerOrigin);
  const partnerOutOfBounds = partnerAt !== null && !insideRichmond(partnerAt);
  const partner = partnerOutOfBounds ? null : partnerAt;

  // `mb` is only ever an echo of a value the reader themselves sent, so a
  // broken one means the sender's app mangled it. Named rather than swallowed.
  const echoed = kind === "none" ? null : resolve(link.originB, customOrigin);
  const selfOutOfBounds =
    kind !== "none" &&
    link.originB !== null &&
    (echoed === null || !insideRichmond(echoed));
  const mine = selfOutOfBounds ? null : echoed;

  // Bound to a local so the narrowing survives into the closure below.
  const from = link.origin;
  let origin = base.origin;
  if (kind !== "none") {
    origin = mine ?? base.origin;
  } else if (from !== null) {
    origin =
      from.kind === "preset"
        ? // An unknown preset falls back to the default rather than failing: the
          // rest of the link is still a walk worth restoring.
          (presets.find((preset) => preset.id === from.id) ?? base.origin)
        : customOrigin({ lat: from.lat, lng: from.lng });
  }

  const roundTrip = link.roundTrip ?? base.roundTrip;
  const asked = link.budgetMinutes ?? base.budgetMinutes;
  // No cap: a link is not subject to the recipient's daylight or weather, whose
  // switches it deliberately does not carry. The `timeCap` effect clamps on the
  // next render if their conditions call for it, and the notice says so.
  const budgetMinutes = clampBudget(asked, roundTrip, null);
  const floorMinutes = clampFloor(
    link.floorMinutes ?? dialMinimum(roundTrip),
    budgetMinutes,
    roundTrip,
    null,
  );

  const found = link.placeId === null ? null : places.find((place) => place.id === link.placeId);
  const missing = link.placeId !== null && found === undefined;

  return {
    ...base,
    origin,
    budgetMinutes,
    // The reader never asked for this budget - the link did - but it is the
    // number they would be putting back if a cap moved it, so it is the request.
    requestedBudgetMinutes: budgetMinutes,
    floorMinutes,
    roundTrip,
    edgeOnly: link.edgeOnly ?? base.edgeOnly,
    climb: link.climb ?? base.climb,
    kind: link.kind ?? base.kind,
    vibes: link.vibes.length > 0 ? [...link.vibes] : base.vibes,
    pickedId: found?.id ?? null,
    framingKey: base.framingKey + 1,
    partner,
    partnerWarmed: 0,
    partnerFailure: null,
    // The flag, not a null origin, is what gates. `origin` stays
    // DEFAULT_ORIGIN throughout, so every path that reads it keeps working -
    // it is simply never drawn, warmed or shared while this is false.
    originChosen: kind === "none" || mine !== null,
    meet:
      kind === "none"
        ? null
        : {
            kind: kind,
            mintedDay: link.mintedDay,
            partnerOutOfBounds,
            selfOutOfBounds,
            partnerLockedMinutes: link.lockedMinutes,
          },
    shared: {
      missingPlaceId: missing ? link.placeId : null,
      clampedFromMinutes:
        link.budgetMinutes !== null && link.budgetMinutes !== budgetMinutes
          ? link.budgetMinutes
          : null,
      linkQuery: canonicalQuery(link),
    },
  };
}

export function customOrigin(at: LngLat): Origin {
  return { id: "custom", name: "Dropped pin", lat: at.lat, lng: at.lng };
}

/**
 * This session as a link would carry it.
 *
 * Extracted from App so the three things that depend on the exact bytes - the
 * Share button, the address-bar comparison and the mint gate - cannot drift
 * from each other, and so all three are testable without a DOM.
 *
 * @public - consumed by App and by `share.test.ts`.
 */
export function shareInputFor(state: Session, placeId: string | null): ShareInput {
  return {
    origin: state.origin,
    meet: false,
    partner: null,
    mintedDay: null,
    lockedMinutes: null,
    budgetMinutes: state.budgetMinutes,
    floorMinutes: state.floorMinutes,
    dialMinimumMinutes: dialMinimum(state.roundTrip),
    roundTrip: state.roundTrip,
    edgeOnly: state.edgeOnly,
    climb: state.climb,
    kind: state.kind,
    vibes: state.vibes,
    placeId,
  };
}

/**
 * The canonical query the address bar *would* carry if it still described this
 * screen.
 *
 * App compares this against `shared.linkQuery` to decide whether to clear the
 * URL, and the meet branch is the one piece of that wiring with a real trap in
 * it. **In a link being minted, `ma` is the sender's own start; in a link being
 * read, `ma` is the partner.** So comparing a plain `shareInputFor` - whose
 * origin is the reader's - against a link whose `ma` is the sender's is
 * structurally guaranteed to differ on every single meet arrival, and the
 * effect would wipe the address bar on the first paint while it still described
 * the screen, losing the partner entirely on reload.
 *
 * So a meet session is mirrored back into the kind it arrived in: `ma` is the
 * partner, `mb` is the reader's own echo. On an answer arrival that matches
 * byte for byte on the first paint (both origins are already at
 * `PIN_PRECISION`, and `toFixed` is idempotent). On an invite arrival `mb` is
 * absent on both sides and it also matches - until the reader sets their own
 * start, at which point `mb` appears, the strings diverge, and the URL clears.
 * That is the correct moment: the screen now shows a walk the address bar does
 * not describe.
 *
 * @public - consumed by App and by `share.test.ts`.
 */
export function liveLinkQuery(state: Session, placeId: string | null): string {
  const base = shareInputFor(state, placeId);
  const partner = state.partner;
  const input: ShareInput =
    partner === null
      ? base
      : {
          ...base,
          meet: true,
          origin: partner,
          partner: state.originChosen ? state.origin : null,
          // The arrival's own date, never `Date.now()` - `d` read from the
          // clock here would make the address bar clear itself at midnight.
          mintedDay: state.meet?.mintedDay ?? null,
        };
  return canonicalQuery(decodeShare(encodeShare(input)));
}

/**
 * The two links a meet session can mint, or null for each that must not exist
 * yet.
 *
 * **Both are null while `originChosen` is false, and that gate is the point.**
 * `shareInputFor`'s origin is `state.origin`, which is DEFAULT_ORIGIN until the
 * reader answers. Without the gate, somebody who opens an invite and presses
 * the invite button before setting a start mints a link naming *somebody else's
 * front door as their own* - a fabricated premise handed to a third person
 * under the reader's name. Sharing therefore joins drawing, warming and
 * spinning in the list of things that must not happen while it is false.
 *
 * `answer` needs a pick as well: it is the link that says where the spin
 * landed, and there is no such place yet.
 *
 * @public - consumed by App and by `share.test.ts`.
 */
export function meetLinks(
  state: Session,
  siteOrigin: string,
  placeId: string | null,
  nowMs: number,
  /** True to commit to this dial position rather than merely report it. */
  locked = false,
) {
  if (!state.originChosen) return { invite: null, answer: null };
  const base = shareInputFor(state, null);
  const day = epochDay(nowMs);
  const lockedMinutes = locked ? state.budgetMinutes : null;
  return {
    // `partner: null` is what enforces "`mb` is never a guess": an invite is
    // the first link in a chain, so there is nothing to echo.
    invite: shareUrl(siteOrigin, {
      ...base,
      meet: true,
      partner: null,
      mintedDay: day,
      lockedMinutes,
    }),
    answer:
      placeId === null
        ? null
        : shareUrl(siteOrigin, {
            ...base,
            meet: true,
            partner: state.partner,
            placeId,
            mintedDay: day,
            lockedMinutes,
          }),
  };
}
