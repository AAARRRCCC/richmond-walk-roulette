import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  CaretDownIcon,
  ShuffleIcon,
  SpeakerSimpleHighIcon,
  SpeakerSimpleSlashIcon,
} from "@phosphor-icons/react";
import { MapCanvas } from "../map/MapCanvas";
import { TimeDial } from "../ui/TimeDial";
import { OriginPicker } from "../ui/OriginPicker";
import { Filters } from "../ui/Filters";
import { ReachReadout, type ReachStatus } from "../ui/ReachReadout";
import { ResultCard, type ResultLine } from "../ui/ResultCard";
import { DETOUR_LABELS, PLACES, matchesKind, type Place } from "../data/places";
import { contains, metersBetween, pointKey, type LngLat } from "../lib/geometry";
import type { Json } from "../lib/json";
import {
  MAX_MINUTES,
  NotConfiguredError,
  cachedReach,
  fetchReach,
  hasSnapshot,
  isWarm,
  prefetchLadder,
} from "../lib/isochrone";
import { classifyClimb, type ClimbBand } from "../lib/elevation";
import {
  cachedRoute,
  elevationAvailable,
  fetchWalkingRoute,
  prefetchRoutes,
  routeFailed as routeSettledFailed,
} from "../lib/route";
import {
  budgetStep,
  customOrigin,
  dialMaximum,
  dialMinimum,
  initialSession,
  outboundFloorMinutes,
  outboundMinutes,
  reduce,
  type Failure,
} from "./session";
import { randomIndex, useSpin } from "./useSpin";
import { formatClock, formatFeet, formatMinutes } from "../lib/format";
import { describeGeolocationError, judgeFix, type PermissionHint } from "../lib/locate";
import { useConditions } from "./useConditions";
import {
  capFromLight,
  describeDeadline,
  describeDusk,
  describeLight,
  fitsInLight,
  type Daylight,
} from "./daylight";
import { clockOffsetMs, mergeCaps, setClockOffset, type TimeCap } from "./conditions";
import {
  WEATHER_ENABLED,
  applyReport,
  cachedWeather,
  readReport,
  holdWeather,
  refreshWeather,
  weatherUnavailable,
} from "../lib/weather";
import {
  describeWeatherRule,
  deriveWeatherRules,
  toPoolRules,
  weatherCaps,
} from "../lib/weather-rules";
import { ConditionsLine } from "../ui/ConditionsLine";
import { DaylightSwitch } from "../ui/DaylightSwitch";
import { describeResult, walkClauses } from "./announce";
import {
  REASON_COPY,
  conditionsSignature,
  derivePool,
  poolReport,
  suggestFix,
  type PoolConditions,
  type PoolFix,
  type PoolRule,
} from "./eligibility";
import { PoolList } from "../ui/PoolList";
import { EmptyPoolNotice } from "../ui/EmptyPoolNotice";
import { TuningPanel } from "../ui/TuningPanel";
import { onSoundChange, playPress, playTap, setSoundOn, soundOn } from "../lib/sound";

/**
 * Whether the maintainer instructions are worth showing at all. A stranger
 * meeting an engine outage cannot set an environment variable, and the
 * server's own message names the engine's address, so neither belongs on a
 * deployed page. Compile-time, so the unused branch is stripped and
 * `vite dev --host` from a phone still shows the dev instructions.
 */
const isDevServer = import.meta.env.DEV;

/**
 * A way to reach dusk and after-dark on purpose, in dev only.
 *
 * Three of this app's states are hard to see deliberately - the dial's dead
 * zone, the after-dark statement, and the fit warning - because reaching them
 * means waiting until evening. `setClockOffset` is already the seam
 * `weather-filters` will use to correct a wrong device clock; this exposes it in
 * dev so the same seam can move the clock forward on demand:
 *
 *   __walkRoulette.clockOffset(4 * 60 * 60 * 1000)   // four hours later
 *   __walkRoulette.clockOffset(0)                     // back to the device
 *
 * Never in a production bundle: the assignment is inside an `import.meta.env.DEV`
 * branch, which Vite folds to `false` and drops entirely.
 */
/**
 * How the dev hooks below tell React that module state moved. Assigned once by
 * the mounted App; a no-op before that, which is when nothing is on screen to
 * repaint anyway.
 */
let devRepaint: () => void = () => {};

type DevGlobal = typeof globalThis & {
  walkRouletteDev?: {
    clockOffset: (ms: number) => void;
    readOffset: () => number;
    weather: (wire: Json) => boolean;
  };
};

if (import.meta.env.DEV) {
  // SAFETY: one debug function attached to the global in a dev-only branch.
  // The named type above widens `globalThis` by exactly this one optional
  // property rather than erasing it; nothing is read back from here.
  (globalThis as DevGlobal).walkRouletteDev = {
    clockOffset: setClockOffset,
    readOffset: clockOffsetMs,
    /**
     * Push a forecast in by hand, in the wire shape `/api/weather` answers.
     *
     * Rain forty minutes out, a heat index in the NWS Danger band and a UV of
     * nine are the three states this feature exists for, and none of them can
     * be waited for: two need a season and the third needs a storm. It goes
     * through `readReport` rather than around it, so what lands on screen has
     * crossed the same boundary a real forecast crosses.
     */
    weather: (wire) => {
      const parsed = readReport(wire);
      if (parsed === null) return false;
      applyReport(parsed);
      devRepaint();
      return true;
    },
  };
}

/** Where the rail stops being a bottom sheet. Must match the stylesheet. */
const WIDE = "(min-width: 900px)";

/**
 * How many times a picked route may be asked for before the card says so, and
 * how long the first wait is. `fetchWalkingRoute` deliberately does not cache a
 * transient failure, so nothing about the app's state changes when one happens
 * and the effect that asked would otherwise never ask again.
 */
const ROUTE_ATTEMPTS = 3;
const ROUTE_BACKOFF_MS = 900;

/**
 * How long Spin waits for the whole pool before it opens on a partial one.
 *
 * Waiting is the right default - a reel that turns through a subset is a reel
 * misreporting the pool - but waiting forever is worse. A throttled engine
 * answers routes minutes apart, and against one the strict gate never opens
 * at all, which reads as the app being broken rather than the engine being
 * busy. So the wait is bounded, and when it runs out the app says plainly
 * that the reel is short rather than quietly turning through what it has.
 */
const ROUTE_WARM_GRACE_MS = 12_000;

/**
 * How many destinations the wide prefetch wave will warm per origin change.
 *
 * 90 sits under `route.ts`'s `CACHE_LIMIT` of 200 with room for the near wave
 * and a spin's worth of misses. It is a cap on cost rather than on correctness:
 * the spin still draws its winner from the full candidate list, and a place past
 * the cap loads its route when it is picked.
 */
const WIDE_PREFETCH_LIMIT = 90;


/**
 * `inert`, written by hand. React 18 has no boolean handling for the attribute
 * and its types do not know it at all, so the present-means-on empty string is
 * spread in instead of passed as a prop. This is what takes the dimmed rail
 * out of the tab order during a pin drop; opacity and `pointer-events: none`
 * left every control in it focusable and silently dead.
 */
const inertWhen = (on: boolean): Record<string, string> => (on ? { inert: "" } : {});

/**
 * A standalone sentence, folded into the middle of a longer one.
 *
 * `REASON_COPY` sentences are written to be read on their own - the card shows
 * them as rows - so they carry a capital and a full stop. `describeResult`
 * joins its clauses and terminates the whole thing, so passing one in whole
 * produced "further than your budget walks.." on screen readers.
 */
const asClause = (sentence: string): string =>
  sentence.replace(/\.$/, "").toLowerCase();

/** One object, so a healthy pool does not allocate a fix it will never read. */
const NO_FIX: PoolFix = { kind: "none" };

/**
 * Outbound walking minutes to every place, from the route cache.
 *
 * Over all of PLACES, deliberately, and not folded into the sweep that computes
 * `drawable` and `settledRoutes`: those run over the *included* pool, which is
 * empty at exactly the moment `suggestFix` needs this. One pass of Map lookups,
 * at the one moment nothing else is happening.
 */
function cachedWalkMinutes(origin: LngLat): Map<string, number> {
  const minutes = new Map<string, number>();
  for (const place of PLACES) {
    const cached = cachedRoute(origin, place);
    if (cached) minutes.set(place.id, cached.durationSeconds / 60);
  }
  return minutes;
}

const describe = (cause: unknown): Failure => ({
  configured: !(cause instanceof NotConfiguredError),
  message: cause instanceof Error ? cause.message : "Could not load the reachable area.",
});

export function App() {
  const [state, dispatch] = useReducer(reduce, initialSession);
  const [locating, setLocating] = useState(false);

  /**
   * What the Permissions API says, if it says anything.
   *
   * A hint, never a gate: Safari reports "prompt" where other browsers report
   * nothing at all, and a browser without the API leaves this "unknown". The
   * only thing it changes is the button's label and one early return.
   */
  const [permissionHint, setPermissionHint] = useState<PermissionHint>("unknown");

  useEffect(() => {
    let status: PermissionStatus | null = null;
    const onChange = (): void => {
      if (status !== null) setPermissionHint(status.state);
    };
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((result) => {
        status = result;
        setPermissionHint(result.state);
        result.addEventListener("change", onChange);
      })
      // A rejection or a missing API leaves the hint "unknown", which is the
      // state that changes nothing.
      .catch(() => {});
    return () => status?.removeEventListener("change", onChange);
  }, []);
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches);
  const [filtersOpen, setFiltersOpen] = useState(wide);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const emptyNoticeId = useId();
  const locationNoticeId = useId();
  const spinRef = useRef<HTMLButtonElement>(null);

  /**
   * The sheet breakpoint, watched rather than sampled once at mount. Rotating
   * a tablet across it used to leave the drawer at the other layout's default
   * and the sheet's collapse control on a rail that is no longer a sheet, so
   * the drawer's default moves with it.
   */
  useEffect(() => {
    const query = window.matchMedia(WIDE);
    const onChange = (event: MediaQueryListEvent) => {
      setWide(event.matches);
      setFiltersOpen(event.matches);
    };
    query.addEventListener("change", onChange);
    return () => {
      query.removeEventListener("change", onChange);
    };
  }, []);

  /**
   * The contour and route caches are mutable module state, so these counters
   * are how a completed fetch reaches React. They are separate on purpose: a
   * route landing must not invalidate the reach, or every finished route would
   * rebuild the candidate list and kick off another round of route warming.
   */
  const [, bumpContours] = useReducer((n: number) => n + 1, 0);
  const [, bumpRoutes] = useReducer((n: number) => n + 1, 0);
  // Its own counter, for the same reason those two are separate: a landed
  // forecast must not invalidate the reach or restart route warming.
  const [, bumpWeather] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (import.meta.env.DEV) devRepaint = bumpWeather;
  }, []);

  // The mute is stored, not React state, because the sound engine reads it
  // outside render. This is how a change reaches the icon.
  const [, bumpSound] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onSoundChange(bumpSound), []);
  const sound = soundOn();

  const { origin, failure } = state;
  const outbound = outboundMinutes(state);

  // Warm every contour the dial can reach — one batched engine query — so
  // that moving the dial is a cache read rather than a request.
  useEffect(() => {
    let cancelled = false;
    prefetchLadder(origin, (progress) => {
      if (cancelled) return;
      dispatch({ type: "warmProgress", fraction: progress.done / progress.total });
      bumpContours();
    }).catch((cause: unknown) => {
      if (!cancelled) dispatch({ type: "failed", failure: describe(cause) });
    });
    return () => {
      cancelled = true;
    };
  }, [origin]);

  // Read straight from the cache on every render. These are Map lookups plus a
  // point-in-polygon sweep over 62 places, which is cheaper than the
  // bookkeeping memoising them would need against an external cache. The
  // whole ladder is prefetched, so during a scrub this is a hit on every
  // frame and the contour and the readout track the dial exactly.
  /**
   * The lower end of the range, in outbound minutes, or null for no lower
   * bound. `cachedReach` takes it from here and does the rest: it divides its
   * bands across the range rather than the budget, punches the floor contour
   * out of each one, and measures the area from what is left.
   */
  /**
   * The one clock. Frozen during a throw: a minute boundary crossed mid-reel
   * would move the cap, which moves the budget, which moves the reach, which
   * changes the pool the reel is already turning through.
   */
  const conditions = useConditions(origin, state.spinning);

  /**
   * The forecast, read straight from module state like `reach` and `route`.
   *
   * The refresh is driven by the minute tick rather than by a mount effect, so
   * a tab left open keeps up without a second timer, and `refreshWeather` is a
   * no-op in the common case. The hold is what stops a forecast landing
   * mid-throw from moving the pool under a reel that is already turning.
   */
  const report = cachedWeather();
  useEffect(() => {
    refreshWeather(bumpWeather);
  }, [conditions.atMs]);
  useEffect(() => {
    // The release can hand back a report that landed during the throw, and
    // nothing else is going to announce it.
    if (holdWeather(state.spinning)) bumpWeather();
  }, [state.spinning]);

  const weather = deriveWeatherRules(report, {
    nowMs: conditions.atMs,
    // The walk the reader ASKED for, not the one a cap left them with. Feeding
    // the capped budget back in is a loop that eats itself: the rain cap
    // narrows the window, the window no longer contains the onset, the rule
    // stops firing, the cap lifts, and the whole thing starts again on the next
    // render. Seen doing exactly that before this line said `requested`.
    budgetMinutes: state.requestedBudgetMinutes,
    dialMinimumMinutes: dialMinimum(state.roundTrip),
    weatherAware: state.weatherAware,
  });

  const floorOutbound = outboundFloorMinutes(state);
  const reach = cachedReach(origin, outbound, floorOutbound ?? 0);

  /**
   * The floor contour itself, so "too close" can be told apart from "too far".
   * The bands already carry the floor as a hole, so containment alone cannot
   * distinguish them. A warm-cache lookup on a rung the prefetch already holds.
   */
  const floorPolygons =
    floorOutbound === null
      ? null
      : (cachedReach(origin, floorOutbound)?.bands.at(-1)?.polygons ?? null);

  /**
   * Where siblings plug in. Chunks 3, 6, 7 and 8 each push one `PoolRule` here
   * rather than adding an argument to a filter function, which is what keeps
   * seven filters down to one explanation.
   *
   * Anything added here owes a `signature` that changes exactly when its
   * verdicts could and never per render - see `signature.test.ts`.
   *
   * Readonly, and built as a literal rather than pushed into: the React
   * Compiler traces this array through `conditions` to `pool` to `candidates`
   * to `candidateKey`. A mutable binding along that path is a value the
   * compiler cannot prove stable.
   */
  /**
   * The climb of the walk to a place, as far as it is known right now.
   *
   * Three states, and the difference between the last two is the whole design:
   * `undefined` means nothing has settled yet, `"unmeasurable"` means something
   * settled and carried no usable profile. Read from the caches per render with
   * no memoisation, per the house rule - the caches are mutable and a dependency
   * array cannot see them.
   *
   * Round trip does not enter into it. Doubling ascent and doubling distance
   * leaves metres per kilometre unchanged, so only the absolute floor would
   * move; banding on the outbound keeps Easy meaning the same thing with the
   * switch either way.
   */
  const climbOf = (place: Place): ClimbBand | "unmeasurable" | undefined => {
    const cached = cachedRoute(origin, place);
    if (cached === undefined) return routeSettledFailed(origin, place) ? "unmeasurable" : undefined;
    if (cached === null || cached.profile === null) return "unmeasurable";
    return classifyClimb(cached.profile.ascentMeters, cached.distanceMeters);
  };

  /**
   * How many candidates have a settled answer about their climb.
   *
   * Part of the rule's signature, and the reason it is a count rather than a
   * timestamp: it changes when a route settles and at no other moment, which is
   * exactly when the rule's verdicts could have moved. A clock here would churn
   * the memo, and a churning memo makes spinning impossible - see
   * `signature.test.ts`.
   */
  const climbSettled = PLACES.filter((place) => climbOf(place) !== undefined).length;

  /**
   * The budget the map is actually drawn at, when something is capping it.
   *
   * Null when nothing binds - including the case where a cap exists but sits
   * above where the reader left the dial, which is not a trim and must not be
   * described as one. Every weather sentence names this number and no other, so
   * a rule whose own cap was not the binding one still says what the reader is
   * looking at rather than advertising a number that never happened.
   */
  const cappedTo = dialMaximum(state);
  const appliedBudget =
    cappedTo < MAX_MINUTES && state.budgetMinutes >= cappedTo ? cappedTo : null;

  const weatherPoolRules = toPoolRules(weather, {
    appliedBudget,
    climbSignature: `|${climbSettled}`,
    isHilly: (place) => climbOf(place) === "hilly",
    clear: () => dispatch({ type: "toggleWeatherAware" }),
  });

  /**
   * The tier filter, as a rule rather than a fifth argument to a filter
   * function. Its signature is the chip itself: the verdict for a place depends
   * on nothing else, so it changes exactly when the reader presses one.
   */
  const kindRule: readonly PoolRule[] =
    state.kind === "any"
      ? []
      : [
          {
            id: "kind",
            reason: "kind",
            active: true,
            clearLabel: "Any kind of place",
            clear: () => dispatch({ type: "kind", kind: "any" }),
            signature: state.kind,
            excludes: (place) => !matchesKind(place, state.kind),
          },
        ];

  const rules: readonly PoolRule[] = [
    ...kindRule,
    ...weatherPoolRules,
    ...(state.climb === "any"
      ? []
      : [
          {
            id: "climb",
            reason: "wrong-terrain",
            active: true,
            clearLabel: "Any climb",
            clear: () => dispatch({ type: "climb", climb: "any" }),
            signature: `${state.climb}|${climbSettled}`,
            // Deferred, because it decides on data that arrives per place. A
            // place it has not measured yet is held out of the pool but stays in
            // `baseIncluded`, so the "Measuring climb 3/12" denominator does not
            // count downward while the reader watches it.
            deferred: true,
            excludes: (place) => {
              const band = climbOf(place);
              // Not measured yet passes provisionally: excluding it would make
              // the pool shrink and grow as routes land.
              if (band === undefined) return false;
              return band !== state.climb;
            },
          } satisfies PoolRule,
        ]),
  ];

  const poolConditions: PoolConditions = {
    reach,
    floorPolygons,
    vibes: state.vibes,
    edgeOnly: state.edgeOnly,
    rules,
  };
  const pool = poolReport(PLACES, poolConditions);
  const candidates = pool.included;
  const candidateKey = pool.includedKey;
  const picked = PLACES.find((place) => place.id === state.pickedId) ?? null;

  /**
   * A dial position the warm-up missed still has to work.
   *
   * Held until the warm-up reports done, because on a cold start this effect
   * and `prefetchLadder` would otherwise race: the ladder is one static
   * snapshot away, but this would already have asked the engine for the same
   * contours, which against a stock contour limit is fourteen queries for
   * something about to arrive for free.
   */
  const missing = reach === null && state.warmed >= 1;
  useEffect(() => {
    if (!missing || failure) return;
    let cancelled = false;
    fetchReach(origin, outbound, floorOutbound ?? 0)
      .then(() => {
        if (!cancelled) bumpContours();
      })
      .catch((cause: unknown) => {
        if (!cancelled) dispatch({ type: "failed", failure: describe(cause) });
      });
    return () => {
      cancelled = true;
    };
  }, [missing, failure, origin, outbound, floorOutbound]);

  /**
   * Warm the routes the reel could show *now*, as soon as the current contour
   * lands. Waiting for the whole ladder would be too late: the widest contour
   * arrives near the end of the warm-up, and a spin before then would tick
   * through names with no line on the map. Guarded per origin and candidate set
   * so a completed route cannot start another wave.
   */
  const warmedNow = useRef("");
  useEffect(() => {
    const key = `${pointKey(origin)}|${candidateKey}`;
    if (candidateKey === "" || warmedNow.current === key) return;
    warmedNow.current = key;
    // A Set, built once. The obvious `.includes()` inside the filter is O(n^2),
    // which at 250 places is ~62,500 string comparisons every time this effect
    // runs - and it runs on every pool change.
    const wanted = new Set(candidateKey.split(","));
    const warming = PLACES.filter((place) => wanted.has(place.id));
    void prefetchRoutes(origin, warming, bumpRoutes);
  }, [candidateKey, origin]);

  /**
   * Then widen to every place the dial could ever reach from here, so pushing
   * the dial outward does not start the route warm-up over.
   */
  const widest = cachedReach(origin, MAX_MINUTES);
  const widestReady = widest !== null;
  const warmedWide = useRef("");
  useEffect(() => {
    const key = pointKey(origin);
    if (!widestReady || warmedWide.current === key) return;
    warmedWide.current = key;
    const outermost = cachedReach(origin, MAX_MINUTES)?.bands.at(-1);
    if (!outermost) return;
    // Nearest first, then capped. Uncapped, this wave is one `/route` call per
    // place inside the 100-minute contour - at 250 places, 250 rate-limit units
    // per origin change against a route cache that holds 200.
    //
    // The cap is about the cache and the limiter, not about correctness: a place
    // past it simply loads its route when it is picked, through the existing
    // retry effect. What it costs is honest and worth naming - `CACHE_LIMIT` was
    // sized so that revisiting a start stays instant for "a few" origins, and a
    // 90-place wave plus a near wave makes that about two rather than three.
    const reachable = PLACES.filter((place) => contains(outermost.polygons, place))
      .map((place) => ({ place, meters: metersBetween(origin, place) }))
      .toSorted((a, b) => a.meters - b.meters)
      .slice(0, WIDE_PREFETCH_LIMIT)
      .map((entry) => entry.place);
    void prefetchRoutes(origin, reachable, bumpRoutes);
  }, [widestReady, origin]);

  /**
   * Candidates that already have a line to draw. The reel shows only these, so
   * every tick puts a real route on the map. The winner is still drawn from the
   * full candidate list: restricting the draw to whatever loaded first would
   * quietly bias the result toward nearby places.
   */
  const drawable = candidates.filter((place) => cachedRoute(origin, place));

  /**
   * The pool before the climb filter measured anything.
   *
   * Everything that counts progress keys on this rather than on `candidates`:
   * `candidates` shrinks as measurements land, so a denominator taken from it
   * ticks down on both halves at once and the prefetch re-waves on every
   * settling route.
   */
  const basePool = pool.baseIncluded;

  /**
   * A candidate has settled when the question has an answer, whatever it is: a
   * route, a cached "there is no walking route here", or attempts spent on a
   * failure. Spin waits for all of them.
   *
   * It used to open as soon as one route landed, which meant the reel ticked
   * through whichever places happened to be back and silently skipped the
   * rest - so the same origin gave a different set of possible winners
   * depending on when you pressed it. That is the reel misrepresenting the
   * pool, which is the one thing this app is built not to do. Waiting costs a
   * second or two on a cold origin and makes the throw honest.
   */
  const settledRoutes = basePool.filter(
    (place) => cachedRoute(origin, place) !== undefined || routeSettledFailed(origin, place),
  ).length;
  const routesPending = basePool.length > 0 && settledRoutes < basePool.length;

  /**
   * Which pool the wait has run out for, rather than a flag that has to be
   * cleared. A new origin or a new filter set makes its own key, so it starts
   * its own full wait simply by not matching - nothing has to remember to
   * reset, and a timer left over from the previous pool cannot open the gate
   * for this one.
   */
  const poolKey = `${pointKey(origin)}|${pool.baseKey}`;
  const [graceOverFor, setGraceOverFor] = useState<string | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setGraceOverFor(poolKey), ROUTE_WARM_GRACE_MS);
    return () => window.clearTimeout(timer);
  }, [poolKey]);
  const warmGraceOver = graceOverFor === poolKey;

  /**
   * With a climb filter on there is no grace: the answer depends on a
   * measurement, so opening the gate early would offer a pool that is a
   * different pool a second later. Without one, the existing grace stands.
   */
  const routesWarming = routesPending && (state.climb !== "any" || !warmGraceOver);
  /** The wait ran out with routes still missing, so the reel will be short. */
  const reelIsShort = routesPending && warmGraceOver;

  const { showing, run: runSpin, cancel: cancelSpin } = useSpin(
    useCallback((place: Place) => dispatch({ type: "spinEnd", pickedId: place.id }), []),
  );

  // The reel drives the map while it turns, so you watch candidate walks flick
  // past instead of an empty map that only draws a line once it stops.
  const active = state.spinning ? showing : picked;
  const activeRoute = active ? cachedRoute(origin, active) : null;
  const route = activeRoute ?? null;
  const routeLoading = active !== null && activeRoute === undefined;

  // The warm-up covers every reachable place, but a pick can outrun it.
  const pickedId = picked?.id ?? null;
  const pickedRouteMissing = picked !== null && cachedRoute(origin, picked) === undefined;
  const attempt = state.routeAttempt;
  /** Attempts spent with nothing to draw. The card says so rather than shimmering. */
  const routeFailed = pickedRouteMissing && attempt >= ROUTE_ATTEMPTS;

  useEffect(() => {
    if (!picked || !pickedRouteMissing || attempt >= ROUTE_ATTEMPTS) return;
    let cancelled = false;
    let timer = 0;
    void fetchWalkingRoute(origin, picked).then(() => {
      if (cancelled) return;
      if (!routeMissed(origin, picked)) {
        bumpRoutes();
        return;
      }
      // Backed off rather than re-asked at once: a warm-up burst is exactly
      // when the engine is most likely to be rate limiting, and the attempt
      // count is the only thing here that can make this effect run again.
      timer = window.setTimeout(
        () => dispatch({ type: "routeAttempt", attempt: attempt + 1 }),
        ROUTE_BACKOFF_MS * (attempt + 1),
      );
    });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedId, pickedRouteMissing, origin, attempt]);
  /**
   * Plain function: `candidates` and `drawable` are rebuilt each render from
   * the caches, so a useCallback would memoise on values the compiler cannot
   * prove stable.
   *
   * The winner is drawn here rather than inside the animation so its route can
   * start loading immediately. A route takes a few hundred milliseconds and the
   * reel runs for 1.5 seconds, so the line is drawn by the time it lands.
   *
   * The `drawable` guard is here, not only on the button, because Spin again in
   * the result card calls this directly.
   */
  const spin = () => {
    if (candidates.length === 0 || drawable.length === 0 || routesWarming) return;
    playPress();
    const winner = candidates[randomIndex(candidates.length)]!;
    const ready = fetchWalkingRoute(origin, winner).then((winnerRoute) => {
      bumpRoutes();
      return winnerRoute;
    });
    dispatch({ type: "spinStart" });
    runSpin(winner, drawable, ready, origin);
  };

  // Abort a spin whose pool changed underneath it: landing on a place that is
  // no longer eligible would contradict the dots on the map.
  const lastKeyRef = useRef(candidateKey);
  useEffect(() => {
    if (lastKeyRef.current === candidateKey) return;
    lastKeyRef.current = candidateKey;
    if (state.spinning) {
      cancelSpin();
      // `spinCancel` raises `spinAborted`: `spinStart` already cleared the
      // pick, so without a word in the slot the reel simply vanishes - a press
      // cue and no landing cue, the one gesture in the app that opens and
      // never closes.
      dispatch({ type: "spinCancel" });
    }
  }, [candidateKey, state.spinning, cancelSpin]);

  /**
   * Anything that ends a spin from outside the animation, changing origin or
   * clicking a place on the map, only flips the session flag. Without this the
   * frame loop keeps running and later lands its own stale winner on top of
   * whatever the user actually did.
   *
   * Layout effect, not a passive one: passive effects run after paint, and a
   * frame callback queued before the commit would fire in between and still
   * get to land.
   */
  useLayoutEffect(() => {
    if (!state.spinning) cancelSpin();
  }, [state.spinning, cancelSpin]);

  /**
   * Pin drop had no keyboard exit at all: the marker is aria-hidden and not
   * focusable, and the only other ways out are a map click or a marker drag.
   * The reducer's cancel case was written and never dispatched.
   */
  useEffect(() => {
    if (!state.pickingOrigin) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dispatch({ type: "cancelPickOrigin" });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [state.pickingOrigin]);

  const useMyLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      dispatch({
        type: "locationNotice",
        notice: {
          message: "This browser can't share a location. Drop a pin on the map instead.",
          tone: "warn",
          suggest: null,
        },
      });
      return;
    }

    // A denied permission cannot prompt, so calling would produce nothing at
    // all - a button that visibly does not work, which is the entire class of
    // failure this rewrite exists to remove. Say why instead.
    if (permissionHint === "denied") {
      dispatch({
        type: "locationNotice",
        notice: describeGeolocationError(1, window.isSecureContext),
      });
      return;
    }

    /**
     * Read before clearing, because it decides whether a cached fix is
     * acceptable.
     *
     * A cached fix carries its *original* accuracy, so a stale 250 m wifi fix is
     * just as eligible for instant replay as a good one. With a flat
     * `maximumAge`, somebody pressing again after an accuracy refusal gets the
     * identical refusal back instantly with no new acquisition attempted. So:
     * the first press accepts a minute-old fix, free and indistinguishable at
     * this app's resolution, and any press made while a notice is standing
     * forces a fresh one.
     */
    const retry = state.locationNotice !== null;

    setLocating(true);
    dispatch({ type: "locationNotice", notice: null });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const outcome = judgeFix({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
        });
        if (outcome.kind === "rejected") {
          dispatch({ type: "locationNotice", notice: outcome.error });
          return;
        }
        // The origin action clears the notice field, so a caveat dispatched
        // first would vanish. This order is load-bearing.
        dispatch({ type: "origin", origin: outcome.origin });
        if (outcome.caveat !== null) {
          dispatch({ type: "locationNotice", notice: outcome.caveat });
        }
      },
      (error) => {
        setLocating(false);
        dispatch({
          type: "locationNotice",
          notice: describeGeolocationError(error.code, window.isSecureContext),
        });
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: retry ? 0 : 60_000 },
    );
    // Both are read at call time and both change what the call does, so they
    // belong in the deps rather than being smuggled in through a ref.
    // `OriginPicker` is not memoised, so a fresh identity costs nothing.
  }, [permissionHint, state.locationNotice]);

  const moveOrigin = useCallback((at: LngLat) => {
    dispatch({ type: "origin", origin: customOrigin(at) });
  }, []);

  const outer = reach?.bands[reach.bands.length - 1];
  const withinBudget = !picked || !outer || contains(outer.polygons, picked);
  // A cached contour outranks a failure. One position that exhausted its
  // retries should not put the whole panel in an error state while the dial is
  // sitting on a position that is perfectly warm.
  const status: ReachStatus = reach
    ? "ready"
    : failure
      ? failure.configured
        ? "error"
        : "not-configured"
      : "loading";

  /**
   * The one line a screen reader gets, derived rather than queued.
   *
   * The reel is aria-hidden and the card is no longer a live region: between
   * them the winner was read twice and every one of the forty name flips
   * before it. This stays empty for the length of a throw and fills once the
   * route settles, so the sentence is complete on first read and a second
   * throw onto the same place still reads as a new result.
   *
   * A skeleton means "still coming"; once the attempts are spent it is a lie,
   * which is why a failed route composes a line rather than holding this back.
   */
  const routePending = routeLoading && !routeFailed;
  const pickedVerdict = picked ? (pool.verdicts.get(picked.id) ?? null) : null;

  /**
   * Does the walk on screen finish before civil dusk?
   *
   * Judged only against a *measured* walk: while the route is pending there is
   * nothing to accuse, and the card is showing skeletons anyway. Note what is
   * absent - `state.beforeDark`. The warning fires whether or not the mode is
   * on, because the mode is about clamping and the warning is about truth.
   */
  const walkMinutesNow =
    route === null
      ? null
      : Math.ceil((state.roundTrip ? route.durationSeconds * 2 : route.durationSeconds) / 60);
  const walkFitsLight =
    picked === null || routePending || walkMinutesNow === null
      ? true
      : fitsInLight(conditions.light, walkMinutesNow);

  /**
   * Where the reader is scrubbing the elevation chart, in metres along it.
   *
   * Not in `Session`: it is transient pointer state with no bearing on the walk,
   * and putting it in the reducer would re-run every derivation on every frame
   * of a drag.
   */
  /**
   * The cap, derived in render and dispatched by a one-value effect.
   *
   * A `number | null` in the deps, so it compares by value and the effect runs
   * only when the cap actually moves - not once a minute. The `spinning` guard
   * is load-bearing: a cap that moves the budget mid-throw changes the reach,
   * which changes `candidateKey`, which fires the spin-abort effect. A throw is
   * a couple of seconds; the minute can wait, and because `state.spinning` is in
   * the deps the pending cap lands on the falling edge of the reel.
   */
  const lightCapMinutes = state.beforeDark
    ? capFromLight(conditions.light, state.roundTrip, dialMinimum(state.roundTrip), budgetStep())
    : null;

  const lightCap: TimeCap | null =
    lightCapMinutes === null || conditions.light.events.civilDuskMs === null
      ? null
      : {
          minutes: lightCapMinutes,
          reason: "daylight",
          untilMs: conditions.light.events.civilDuskMs,
        };

  // One array, one cap, one clamp. Rain, storm, heat and cold arrive here
  // rather than through a second clamp path of their own, which is what keeps
  // the dial answering to one condition at a time instead of two competing
  // ones. `mergeCaps` takes the earliest deadline; ties go to the shorter walk.
  const timeCap = mergeCaps([lightCap, ...(state.weatherAware ? weatherCaps(weather) : [])]);

  useEffect(() => {
    if (state.spinning) return;
    dispatch({ type: "timeCap", cap: timeCap });
    // The cap's own fields are the value; the object is rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeCap?.minutes, timeCap?.reason, timeCap?.untilMs, state.spinning]);

  const [hover, setHover] = useState<{ pickedId: string | null; meters: number | null }>({
    pickedId: null,
    meters: null,
  });
  // Reset by ownership rather than by an effect: the scrub belongs to the place
  // it was made on, so a hover recorded against a different pick is simply not
  // this pick's hover. An effect calling setState here would render twice on
  // every pick and put a stale dot on the map for one frame.
  const hoverMeters = hover.pickedId === state.pickedId ? hover.meters : null;
  const setHoverMeters = (meters: number | null): void =>
    setHover({ pickedId: state.pickedId, meters });

  /**
   * The card's shared line block, in the fixed order the plan sets: conditions,
   * light, hours, handoff, meet. Empty until chunk 4 contributes the first one -
   * the block renders nothing at all rather than an empty box.
   */
  const resultLines: readonly ResultLine[] = [
    ...(weather.headline === null
      ? []
      : [
          {
            // First in the block's fixed order, and a fact: it is a
            // measurement somebody else took, reported unchanged.
            key: "conditions" as const,
            text: weather.headline,
            tier: "fact" as const,
          },
        ]),
    ...(route !== null && !routePending
      ? [
          {
            // The duration repeated from the stat directly above, deliberately.
            // A stat is a label-over-value pair that is scanned in a grid; a
            // sentence is read. "sunset in 40" beside a bare "52 min" in a
            // column is two facts, and "52 min out and back · sunset in 40" is
            // one comparison - which is the entire point of the line.
            key: "light" as const,
            text: `${formatMinutes(state.roundTrip ? route.durationSeconds * 2 : route.durationSeconds)} ${state.roundTrip ? "out and back" : "on foot"} · ${describeLight(conditions.light)}`,
            tier: "fact" as const,
          },
        ]
      : []),
    {
      // Neither handoff carries our walk - both send two coordinates and let
      // the other app recompute with its own graph and its own pedestrian
      // speed. Their minutes will disagree with ours, and that disagreement is
      // the whole reason this app exists. Better said here than discovered on
      // the sidewalk.
      //
      // `assumed` rather than `fact`: it is a claim about somebody else's
      // software. And deliberately not in `describeResult` - a constant caveat
      // repeated on every landing is noise in a sentence that is already eight
      // clauses long.
      key: "handoff",
      text: "Other apps will recalculate — their walk times will differ.",
      tier: "assumed",
    },
  ];

  const announcement = state.spinAborted
    ? "Filters changed, spin again."
    : state.spinning || !picked || routePending
      ? ""
      : describeResult([
          // The tier opens the sentence for a detour. The sr-only line is the
          // only screen-reader surface this card has, so a tier that is
          // invisible there is invisible.
          picked.detour === undefined
            ? picked.name
            : `${DETOUR_LABELS[picked.detour]}: ${picked.name}`,
          ...walkClauses(route, routeFailed, state.roundTrip),
          withinBudget ? "" : "outside your current time budget",
          // The only path by which the chart's headline fact reaches a screen
          // reader, since the card is deliberately not a live region.
          route === null
            ? ""
            : route.profile === null
              ? "climb not measured"
              // The outbound leg, matching the stat and the chart. The card
              // shows one profile and this says its number.
              : `${formatFeet(route.profile.ascentMeters)} of climb`,
          // The only way an exclusion reaches a screen reader on a result. The
          // card shows it as a row; this is the same sentence, lowercased into
          // the middle of one.
          walkFitsLight ? "" : "does not fit in the light left",
          // The only path by which the forecast reaches a screen reader on a
          // result. Deliberately with a result rather than before one: the
          // pre-spin path is ConditionsLine's own paragraphs, which are
          // ordinary static text in the panel and need no live region.
          // Not lowercased, unlike the REASON_COPY clauses `asClause` handles:
          // this sentence is mostly units and a proper label, and "84°f, feels
          // 86°. uv 9" is what a screen reader has to say out loud.
          weather.headline ?? "",
          pickedVerdict === null || pickedVerdict.included || pickedVerdict.reasons[0] === undefined
            ? ""
            : `not in the pool: ${asClause(REASON_COPY[pickedVerdict.reasons[0]].sentence)}`,
        ]);

  // Rebuilt each render rather than memoised: it is read during TimeDial's
  // render, and App already re-renders whenever the contour cache changes.
  const dialWarm = (minutes: number) =>
    isWarm(origin, state.roundTrip ? Math.floor(minutes / 2) : minutes);

  const picking = state.pickingOrigin;
  const collapsed = railCollapsed && !wide;
  const emptyPool = status === "ready" && candidates.length === 0;

  /**
   * Outbound walking minutes to each place, built only when the pool is empty
   * and over all of PLACES.
   *
   * Deliberately not folded into the sweep that computes `drawable` and
   * `settledRoutes`: those run over the *included* pool, which is empty at
   * exactly the moment `suggestFix` needs this. One pass of Map lookups, at the
   * one moment nothing else is happening.
   */
  /**
   * The one cause `suggestFix` cannot see.
   *
   * A weather *cap* is not a `PoolRule` - it empties the pool by shrinking the
   * contour, not by excluding anything - so the counterfactual that re-runs the
   * verdict with one rule dropped will never find it, and the reader is offered
   * a wider budget the cap would immediately clamp back down. So it is measured
   * here, the same way and to the same standard: re-derive the pool at the
   * budget the reader actually asked for, with every weather rule dropped
   * alongside the cap, and count the survivors. No number that was not counted.
   *
   * Returns null when the cap is daylight's - that switch is `beforeDark`, and
   * offering to ignore the weather would not move it.
   */
  const weatherCapFix = (): PoolFix | null => {
    if (!state.weatherAware || appliedBudget === null) return null;
    if (state.timeCap === null || state.timeCap.reason === "daylight") return null;

    const asked = state.requestedBudgetMinutes;
    const uncapped = cachedReach(
      origin,
      state.roundTrip ? Math.floor(asked / 2) : asked,
      floorOutbound ?? 0,
    );
    if (uncapped === null) return null;

    const recovers = derivePool(PLACES, {
      ...poolConditions,
      reach: uncapped,
      rules: rules.filter((rule) => rule.reason !== "weather"),
    }).included.length;
    if (recovers === 0) return null;

    return {
      kind: "drop-cap",
      clearLabel: "Ignore the weather",
      clear: () => dispatch({ type: "toggleWeatherAware" }),
      recovers,
      askedMinutes: asked,
      cappedMinutes: appliedBudget,
    };
  };

  const fix: PoolFix = emptyPool
    ? (weatherCapFix() ??
      suggestFix(PLACES, poolConditions, cachedWalkMinutes(origin), { roundTrip: state.roundTrip }))
    : NO_FIX;

  /**
   * What the empty-pool notice's one button does.
   *
   * The three chips this app already owns are resolved by reason, because
   * clearing them is a dispatch and `eligibility.ts` is deliberately free of
   * the reducer's vocabulary. Anything a sibling contributed brought its own
   * callback.
   */
  const applyFix = (): void => {
    switch (fix.kind) {
      case "drop-rule":
        // `wrong-terrain` is the climb rule now, and it brought its own clear.
        if (fix.reason === "no-matching-vibe") dispatch({ type: "clearVibes" });
        else if (fix.reason === "not-far-edge") dispatch({ type: "toggleEdge" });
        else fix.clear();
        return;
      case "drop-cap":
        fix.clear();
        return;
      case "widen-budget":
        dispatch({ type: "budget", minutes: fix.budgetMinutes });
        return;
      case "lower-floor":
        dispatch({ type: "floor", minutes: 0 });
        return;
      case "none":
        dispatch({ type: "clearFilters" });
        return;
    }
  };
  // A phone starts with the drawer shut, and a bare "Filters" over a shrunken
  // count is a cause the reader cannot see.
  const activeFilters =
    state.vibes.length +
    (state.edgeOnly ? 1 : 0) +
    // Weather is deliberately not counted, and the reason is the button next to
    // the number: this counts what **Clear filters** clears, and that button
    // does not touch the weather switch. A count that cannot be cleared by the
    // control beside it is worse than no count. The cause of a shrunken pool is
    // named in prose by ConditionsLine instead, which is always visible in the
    // panel rather than hidden behind the collapsed drawer.
    rules.filter((rule) => rule.active && rule.reason !== "weather").length;

  return (
    <div className={`shell${picking ? " is-picking" : ""}`}>
      <MapCanvas
        origin={origin}
        reach={reach}
        places={PLACES}
        inReachIds={pool.includedIds}
        hoverMeters={hoverMeters}
        pickedId={active?.id ?? null}
        framingKey={state.framingKey}
        route={route}
        pickingOrigin={picking}
        spinning={state.spinning}
        onPickPlace={(id) => dispatch({ type: "pickPlace", pickedId: id })}
        onMoveOrigin={moveOrigin}
      />

      <div className={`rail${collapsed ? " is-collapsed" : ""}`}>
        <header className="brand" {...inertWhen(picking)}>
          <h1>
            Walk Roulette
            <span className="brand-place">Richmond</span>
          </h1>
          <div className="brand-actions">
            <button
              type="button"
              className="icon-button"
              aria-label={sound ? "Mute sound cues" : "Unmute sound cues"}
              onClick={() => {
                const next = !sound;
                setSoundOn(next);
                // The only cue that can confirm itself: you cannot hear a mute.
                if (next) playTap(true);
              }}
            >
              {sound ? (
                <SpeakerSimpleHighIcon size={16} aria-hidden="true" />
              ) : (
                <SpeakerSimpleSlashIcon size={16} aria-hidden="true" />
              )}
            </button>
            {/* The sheet can cover most of the map, which is the one thing the
                app exists to show. One control, one cue; the stylesheet does
                the rest through `.rail.is-collapsed`. */}
            {!wide && (
              <button
                type="button"
                className="icon-button rail-toggle"
                aria-expanded={!collapsed}
                aria-label={collapsed ? "Show controls" : "Hide controls"}
                onClick={() => {
                  playPress();
                  setRailCollapsed((value) => !value);
                }}
              >
                {/* Turned rather than swapped for a second glyph: the caret is
                    already in the bundle for the origin chip, and a second one
                    is a kilobyte for a shape we have. */}
                <CaretDownIcon
                  size={16}
                  weight="bold"
                  aria-hidden="true"
                  style={collapsed ? { transform: "rotate(180deg)" } : undefined}
                />
              </button>
            )}
          </div>
        </header>

        <div className="panel">
          <OriginPicker
            origin={origin}
            pickingOrigin={picking}
            locating={locating}
            onSelect={(next) => dispatch({ type: "origin", origin: next })}
            onBeginPickOnMap={() => dispatch({ type: "beginPickOrigin" })}
            onCancelPickOnMap={() => dispatch({ type: "cancelPickOrigin" })}
            permissionHint={permissionHint}
            onUseMyLocation={useMyLocation}
          />
          {state.locationNotice && (
            <div className="notice-stack" {...inertWhen(picking)}>
              <p
                id={locationNoticeId}
                className={state.locationNotice.tone === "warn" ? "notice is-warn" : "notice"}
                role={state.locationNotice.tone === "warn" ? "alert" : "status"}
              >
                {state.locationNotice.message}
              </p>
              {/* Outside the live region on purpose. An assertive region
                  announces its text on insertion, and a focusable control inside
                  one is announced inconsistently and gives the listener no
                  obvious route to it. So the region holds the sentence and
                  nothing else; the button is the very next element in DOM order,
                  and `aria-describedby` makes it announce as "Start from Scott's
                  Addition, button" followed by the sentence that explains why. */}
              {state.locationNotice.suggest && (
                <button
                  type="button"
                  className="link-button"
                  aria-describedby={locationNoticeId}
                  onClick={() => {
                    playTap(true);
                    if (state.locationNotice?.suggest) {
                      dispatch({ type: "origin", origin: state.locationNotice.suggest });
                    }
                  }}
                >
                  Start from {state.locationNotice.suggest.name}
                </button>
              )}
            </div>
          )}

          {origin.id === "me" &&
            !hasSnapshot(origin) &&
            state.warmed < 1 &&
            status !== "error" &&
            status !== "not-configured" && (
              /* Information, not a warning: a personal origin has no baked
                 snapshot, so it pays the full price and the app says so. No
                 `role` - TimeDial already announces warm-up progress in quarters
                 through its own status line, and a second region double-speaks.

                 The `id === "me"` half is not redundant with `hasSnapshot`: every
                 cold origin lacks one, and today the commonest is a dropped pin.
                 The copy says "your own spot", which is a sentence about a
                 geolocated fix. */
              <p className="notice" {...inertWhen(picking)}>
                Your own spot is not pre-baked the way the presets are, so the reachable area is
                being computed from scratch. The dial fills in as it arrives.
              </p>
            )}

          <TimeDial
            minutes={state.budgetMinutes}
            floorMinutes={state.floorMinutes}
            minimum={dialMinimum(state.roundTrip)}
            maximum={dialMaximum(state)}
            capNote={cappedTo < MAX_MINUTES ? capNote(state.timeCap, cappedTo, conditions.light) : undefined}
            step={budgetStep()}
            outboundMinutes={outbound}
            roundTrip={state.roundTrip}
            isWarm={dialWarm}
            warmedFraction={state.warmed}
            disabled={picking}
            onChange={(minutes) => dispatch({ type: "budget", minutes })}
            onFloorChange={(minutes) => dispatch({ type: "floor", minutes })}
            onCommit={() => dispatch({ type: "frame" })}
          />

          <DaylightSwitch
            checked={state.beforeDark}
            deadline={describeDeadline(conditions.light, state.roundTrip)}
            disabled={picking}
            onToggle={() => dispatch({ type: "toggleBeforeDark" })}
          />

          {status === "not-configured" ? (
            <div className="notice is-setup">
              <strong>The routing engine is not answering.</strong>
              {isDevServer ? (
                <p>
                  Contours and routes come from a Valhalla instance. Set{" "}
                  <code>VALHALLA_URL</code> in <code>.env.local</code>, then restart the dev
                  server. See <code>valhalla/README.md</code>. The server said:{" "}
                  {failure?.message}
                </p>
              ) : (
                <p>Reachable areas and routes are unavailable right now. Try again shortly.</p>
              )}
            </div>
          ) : status === "error" ? (
            <p className="notice is-warn" role="alert">
              {failure?.message}
            </p>
          ) : (
            <ReachReadout
              status={status}
              areaSqMeters={reach?.areaSqMeters ?? 0}
              pool={pool}
              filterKey={conditionsSignature(poolConditions)}
              duskNote={status === "ready" ? describeDusk(conditions.light) : null}
              outerMinutes={outer?.minutes ?? outbound}
              commitKey={state.framingKey}
            />
          )}

          {/* The last thing read before the decision to press Spin, which is
              why it is here and not in the drawer: on a phone the drawer is
              shut, and the cause of a shrunken pool has to be visible. It needs
              no `inertWhen(picking)` - `.panel` already carries it. */}
          {status === "ready" && (
            <ConditionsLine
              report={report}
              unavailable={weatherUnavailable()}
              disabled={!WEATHER_ENABLED}
              verdict={weather}
              withdrawn={pool.withdrawn}
              appliedBudget={appliedBudget}
              keptCount={candidates.length}
              describe={describeWeatherRule}
            />
          )}

          <button
            type="button"
            ref={spinRef}
            className="button is-spin"
            onClick={spin}
            aria-describedby={emptyPool ? emptyNoticeId : undefined}
            // Routes lag the contours by a second or two on a cold origin. The
            // reel exists to show a real walk per tick, so it waits for the
            // whole pool rather than turning through whichever routes are back.
            disabled={
              candidates.length === 0 ||
              drawable.length === 0 ||
              routesWarming ||
              state.spinning ||
              picking ||
              status !== "ready"
            }
          >
            <ShuffleIcon size={18} weight="bold" aria-hidden="true" />
            {state.spinning
              ? "Spinning"
              : status === "ready" && routesWarming
                ? state.climb === "any"
                  ? `Loading routes ${settledRoutes}/${basePool.length}`
                  : `Measuring climb ${settledRoutes}/${basePool.length}`
                : "Spin"}
          </button>

          {reelIsShort && !emptyPool && (
            /* Said rather than hidden. The reel can only turn through walks it
               can draw, so with routes still missing it is showing a subset -
               and a wheel that quietly omits some of its own pool is the same
               lie as a circle. */
            <div className="notice" {...inertWhen(picking)} role="status">
              {drawable.length} of {basePool.length} routes are ready. The reel turns
              through those; the rest are still coming from the engine.
            </div>
          )}

          {emptyPool && (
            <EmptyPoolNotice
              id={emptyNoticeId}
              fix={fix}
              outerMinutes={outer?.minutes ?? outbound}
              inReach={pool.inReach}
              onFix={applyFix}
              {...inertWhen(picking)}
            />
          )}
        </div>

        <div className="spin-slot" {...inertWhen(picking)}>
          {state.spinning && showing && (
            // A randomising metaphor, not information. It changes name twenty
            // to forty times a throw, and each flip used to queue its own
            // announcement, long outlasting the throw itself.
            <p className="spin-reel" aria-hidden="true">
              <span className="field-label">Choosing</span>
              <span className="spin-name">{showing.name}</span>
            </p>
          )}
          {!state.spinning && !picked && state.spinAborted && (
            <p className="notice is-warn">Filters changed, spin again.</p>
          )}
          {!state.spinning && picked && (
            <ResultCard
              origin={origin}
              place={picked}
              route={route}
              routeLoading={routeLoading}
              routeFailed={routeFailed}
              roundTrip={state.roundTrip}
              withinBudget={withinBudget}
              lines={resultLines}
              verdict={pickedVerdict}
              hoverMeters={hoverMeters}
              onHoverRoute={setHoverMeters}
              fitsLight={walkFitsLight}
              onSpinAgain={spin}
              onRetryRoute={() => dispatch({ type: "routeAttempt", attempt: 0 })}
              onDismiss={() => {
                // The button being pressed is inside the card this unmounts.
                // Without moving focus first it lands on the body and the next
                // Tab restarts from the top of the page.
                spinRef.current?.focus();
                dispatch({ type: "clearPick" });
              }}
            />
          )}
        </div>

        <details
          className="drawer"
          open={filtersOpen}
          onToggle={(event) => setFiltersOpen(event.currentTarget.open)}
          {...inertWhen(picking)}
        >
          <summary>
            {activeFilters > 0 ? `Filters (${activeFilters} active)` : "Filters"}
          </summary>
          <Filters
            climb={state.climb}
            climbAvailable={elevationAvailable() !== false}
            vibes={state.vibes}
            roundTrip={state.roundTrip}
            edgeOnly={state.edgeOnly}
            weatherAware={state.weatherAware}
            kind={state.kind}
            onClimb={(climb) => dispatch({ type: "climb", climb })}
            onKind={(kind) => dispatch({ type: "kind", kind })}
            onToggleVibe={(vibe) => dispatch({ type: "toggleVibe", vibe })}
            onToggleRoundTrip={() => dispatch({ type: "toggleRoundTrip" })}
            onToggleEdge={() => dispatch({ type: "toggleEdge" })}
            onToggleWeatherAware={() => dispatch({ type: "toggleWeatherAware" })}
          />
        </details>

        {/* This was a bare sr-only <ul> of up to sixty buttons. A sighted
            keyboard user tabbing off the drawer fell into dozens of invisible
            stops with the focus ring clipped to a pixel, and a screen reader
            arrived at an unnamed pile of names with no hint that pressing one
            draws a route. Closed, a disclosure holds no tab stops at all - and
            the list is worth having for everyone, not as a parallel UI.
            Borrowing the origin menu's list vocabulary: same shape, same job.

            Held back until there is a reach to count against: `candidates` is
            empty while the ladder is warming and empty again on an engine
            error, and "All places (0)" reads as an answer in both. The app does
            not know the count yet, so it does not offer one. */}
        {reach !== null && (
        <details className="drawer" {...inertWhen(picking)}>
          <summary>All places ({pool.total})</summary>
          <PoolList
            pool={pool}
            places={PLACES}
            pickedId={state.pickedId}
            onPick={(id) => dispatch({ type: "pickPlace", pickedId: id })}
          />
        </details>
        )}

        {import.meta.env.DEV && <TuningPanel />}

        <p className="sr-only" role="status">
          {announcement}
        </p>
      </div>
    </div>
  );
}

/**
 * Did that request settle without leaving anything to draw?
 *
 * `fetchWalkingRoute` resolves null for two different things: a destination
 * with no walking route at all, which it caches, and a transient failure,
 * which it deliberately does not - so the cache is what tells them apart. Only
 * the second is worth asking again, and `routeFailed` in route.ts is the one
 * that knows which happened.
 */
function routeMissed(origin: LngLat, destination: Place): boolean {
  return routeSettledFailed(origin, destination);
}

/**
 * The dial's cap note, naming the condition that is clamping it.
 *
 * One sentence per reason rather than a shared "Time limit", because the note
 * exists to answer "why is half my dial dead", and "Daylight limit" beside a
 * thunderstorm is the wrong answer confidently given. Every branch names the
 * deadline in the same clock voice `describeDusk` uses.
 */
function capNote(cap: TimeCap | null, minutes: number, light: Daylight): string {
  if (cap === null) return `Limit ${minutes} min`;
  switch (cap.reason) {
    case "daylight":
      return `Daylight limit ${minutes} min · ${describeDusk(light)}`;
    case "rain":
      return `Rain limit ${minutes} min · rain ${formatClock(cap.untilMs)}`;
    case "storm":
      return `Storm limit ${minutes} min · storms ${formatClock(cap.untilMs)}`;
    case "heat":
      return `Heat limit ${minutes} min · the heat index is in the danger band`;
    case "cold":
      return `Cold limit ${minutes} min · it is dangerously cold`;
  }
}
