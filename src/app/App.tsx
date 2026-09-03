import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
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
import { DialHead, TimeDial } from "../ui/TimeDial";
import { OriginPicker } from "../ui/OriginPicker";
import { Filters } from "../ui/Filters";
import { ReachReadout, type ReachStatus } from "../ui/ReachReadout";
import { ResultCard, type ResultLine } from "../ui/ResultCard";
import { ConditionsLine } from "../ui/ConditionsLine";
import { DaylightSwitch } from "../ui/DaylightSwitch";
import { PoolList } from "../ui/PoolList";
import { EmptyPoolNotice } from "../ui/EmptyPoolNotice";
import { RoomPanel } from "../ui/RoomPanel";
import { PartnerRail } from "../ui/PartnerRail";
import { TuningPanel } from "../ui/TuningPanel";
import { Sheet, type SheetSnap } from "../ui/Sheet";
import {
  DETOUR_LABELS,
  PLACES,
  PRESET_ORIGINS,
  matchesKind,
  type Origin,
  type Place,
} from "../data/places";
import {
  contains,
  metersBetween,
  pointKey,
  type LngLat,
} from "../lib/geometry";
import {
  MAX_MINUTES,
  NotConfiguredError,
  cachedContour,
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
import { formatClock, formatFeet, formatMinutes } from "../lib/format";
import {
  WEATHER_ENABLED,
  cachedWeather,
  holdWeather,
  refreshWeather,
  weatherUnavailable,
} from "../lib/weather";
import {
  CAP_GRID_MINUTES,
  describeWeatherRule,
  deriveWeatherRules,
  toPoolRules,
  weatherCaps,
} from "../lib/weather-rules";
import {
  HOURS_COVERAGE,
  evaluateHours,
  hoursClock,
  hoursFor,
  isOpenEnough,
  quantiseToSlot,
} from "../lib/hours";
import { solarEvents } from "../lib/solar";
import {
  onSoundChange,
  playPress,
  playTap,
  setSoundOn,
  soundOn,
} from "../lib/sound";
import {
  applyShare,
  budgetStep,
  customOrigin,
  dialMaximum,
  dialMinimum,
  initialSession,
  liveLinkQuery,
  outboundFloorMinutes,
  outboundMinutes,
  reduce,
  shareInputFor,
  type Failure,
} from "./session";
import { randomIndex, useSpin } from "./useSpin";
import {
  SHARE_PATH,
  decodeShare,
  roomUrl,
  shareUrl,
  type ShareInput,
} from "./share";
import { describeMeetClause, meetSplit } from "./meet";
import {
  deviceToken,
  forgetSelf,
  recallSelf,
  rememberSelf,
  settleFrame,
  setupFrame,
  spinFrame,
  wireOrigin,
  type PeerFrame,
  type SideSetup,
} from "./room";
import { mintDeviceToken, mintRoomId } from "./room-id";
import { useRoom } from "./useRoom";
import { useConditions } from "./useConditions";
import { useLocate } from "./useLocate";
import {
  capFromLight,
  describeDeadline,
  describeDusk,
  describeLight,
  fitsInLight,
  type Daylight,
} from "./daylight";
import { arrivalMs, mergeCaps, type TimeCap } from "./conditions";
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
import { installDevHooks, setDevRepaint } from "./dev";

if (import.meta.env.DEV) installDevHooks();

/** Where the rail stops being a bottom sheet. Must match the stylesheet. */
const WIDE = "(min-width: 900px)";

/** Route requests for a picked place before the card gives up, and the first backoff. */
const ROUTE_ATTEMPTS = 3;
const ROUTE_BACKOFF_MS = 900;

/** How long Spin waits for the whole pool's routes before opening on a partial reel. */
const ROUTE_WARM_GRACE_MS = 12_000;

/** Destinations the wide route prefetch warms per origin. Under route.ts's cache limit of 200. */
const WIDE_PREFETCH_LIMIT = 90;

/** React 18 has no boolean `inert`; present-means-on. Takes the dimmed rail out of the tab order. */
const inertWhen = (on: boolean): Record<string, string> =>
  on ? { inert: "" } : {};

/** A standalone REASON_COPY sentence folded into the middle of a longer one. */
const asClause = (sentence: string): string =>
  sentence.replace(/\.$/, "").toLowerCase();

const NO_FIX: PoolFix = { kind: "none" };

const randomBytes = (length: number): Uint8Array =>
  crypto.getRandomValues(new Uint8Array(length));

/** `localStorage`, or null where the browser refuses it. */
function keyStore(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

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
  message:
    cause instanceof Error
      ? cause.message
      : "Could not load the reachable area.",
});

export function App() {
  // Restored in the initialiser so the first frame is already the shared walk.
  const [arrival] = useState(() => {
    const link = decodeShare(window.location.search);
    const restored =
      link.room === null
        ? null
        : recallSelf(keyStore(), link.room, customOrigin);
    return { link, restored };
  });
  const [state, dispatch] = useReducer(reduce, initialSession, (base) =>
    applyShare(base, arrival.link, PLACES, PRESET_ORIGINS, arrival.restored),
  );
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches);
  const [filtersOpen, setFiltersOpen] = useState(wide);
  const [snap, setSnap] = useState<SheetSnap>("half");
  const [mirrorOpen, setMirrorOpen] = useState(false);
  const emptyNoticeId = useId();
  const dialHeadId = useId();
  const locationNoticeId = useId();
  const spinRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const query = window.matchMedia(WIDE);
    const onChange = (event: MediaQueryListEvent) => {
      setWide(event.matches);
      setFiltersOpen(event.matches);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // The contour, route and weather caches are module state; these counters are
  // how a landed fetch reaches React. Separate so a route landing does not
  // rebuild the reach and restart route warming.
  const [, bumpContours] = useReducer((n: number) => n + 1, 0);
  const [, bumpRoutes] = useReducer((n: number) => n + 1, 0);
  const [, bumpWeather] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (import.meta.env.DEV) setDevRepaint(bumpWeather);
  }, []);

  const [, bumpSound] = useReducer((n: number) => n + 1, 0);
  useEffect(() => onSoundChange(bumpSound), []);
  const sound = soundOn();

  const { origin, failure, partner, originChosen } = state;
  const outbound = outboundMinutes(state);
  const meetMode = partner !== null;

  // ---- the room ----------------------------------------------------------
  const roomId = state.room;
  const token = useMemo(
    () => deviceToken(keyStore(), () => mintDeviceToken(randomBytes)),
    [],
  );
  /** True once this device shared its start into the room; the opener consents by starting one. */
  const [consented, setConsented] = useState(arrival.restored !== null);
  /** The budget this side locked in, or null. Locked means it still equals the dial. */
  const [lockedMinutes, setLockedMinutes] = useState<number | null>(null);
  const locked = lockedMinutes === state.budgetMinutes;
  // Filled every render so the socket callback sees the current spin machinery.
  const peerRef = useRef<(frame: PeerFrame) => void>(() => {});
  const { state: room, send } = useRoom({
    room: roomId,
    token,
    onPeer: useCallback((frame: PeerFrame) => peerRef.current(frame), []),
  });
  const theirs = room.partner;

  useEffect(() => {
    if (roomId === null) return;
    dispatch({ type: "partner", origin: theirs?.origin ?? null });
  }, [roomId, theirs?.origin]);

  useEffect(() => {
    if (roomId !== null && consented) rememberSelf(keyStore(), roomId, origin);
  }, [roomId, consented, origin]);

  // Warm every contour the dial can reach. Sequential in meet mode, yours
  // first. Nothing runs before `originChosen`: opening an invite must cost
  // the recipient nothing. Their leg's failure goes to `partnerFailed` so it
  // cannot blank the reader's own answer.
  useEffect(() => {
    let cancelled = false;
    const run = async (): Promise<void> => {
      if (originChosen) {
        await prefetchLadder(origin, (progress) => {
          if (cancelled) return;
          dispatch({
            type: "warmProgress",
            fraction: progress.done / progress.total,
          });
          bumpContours();
        });
      }
      if (cancelled || partner === null || !originChosen) return;
      try {
        await prefetchLadder(partner, (progress) => {
          if (cancelled) return;
          dispatch({
            type: "partnerWarmProgress",
            fraction: progress.done / progress.total,
          });
          bumpContours();
        });
      } catch (cause: unknown) {
        if (!cancelled)
          dispatch({ type: "partnerFailed", failure: describe(cause) });
      }
    };
    void run().catch((cause: unknown) => {
      if (!cancelled) dispatch({ type: "failed", failure: describe(cause) });
    });
    return () => {
      cancelled = true;
    };
  }, [origin, partner, originChosen]);

  // Cache reads happen per render, unmemoised: the caches are mutable and a
  // dependency array cannot see them.
  const [scrubbing, setScrubbing] = useState(false);
  const conditions = useConditions(origin, state.spinning || scrubbing);

  const report = cachedWeather();
  useEffect(() => {
    refreshWeather(bumpWeather);
  }, [conditions.atMs]);
  useEffect(() => {
    if (holdWeather(state.spinning)) bumpWeather();
  }, [state.spinning]);

  const weather = deriveWeatherRules(report, {
    nowMs: conditions.atMs,
    // The requested budget, not the capped one: feeding the cap back in oscillates.
    budgetMinutes: state.requestedBudgetMinutes,
    dialMinimumMinutes: dialMinimum(state.roundTrip),
    weatherAware: state.weatherAware,
  });

  // Arrival quantised to the half hour, so the pool does not churn every minute.
  const poolArrivalMs = quantiseToSlot(
    arrivalMs(conditions.atMs, outbound * 60),
  );
  const poolClock = hoursClock(poolArrivalMs);
  const poolSun = solarEvents(poolArrivalMs, origin.lat, origin.lng);

  const floorOutbound = outboundFloorMinutes(state);
  const reach = originChosen
    ? cachedReach(origin, outbound, floorOutbound ?? 0)
    : null;
  // Their reach at THEIR budget, and no floor: a floor is about the reader's own walk.
  const partnerOutbound =
    theirs === null
      ? outbound
      : theirs.roundTrip
        ? Math.floor(theirs.budgetMinutes / 2)
        : theirs.budgetMinutes;
  const partnerReach =
    partner === null ? null : cachedReach(partner, partnerOutbound, 0);
  const floorPolygons =
    floorOutbound === null
      ? null
      : (cachedReach(origin, floorOutbound)?.bands.at(-1)?.polygons ?? null);

  // `undefined`: not settled. `"unmeasurable"`: settled with no usable profile.
  const climbOf = (place: Place): ClimbBand | "unmeasurable" | undefined => {
    const cached = cachedRoute(origin, place);
    if (cached === undefined)
      return routeSettledFailed(origin, place) ? "unmeasurable" : undefined;
    if (cached === null || cached.profile === null) return "unmeasurable";
    return classifyClimb(cached.profile.ascentMeters, cached.distanceMeters);
  };
  const climbSettled = PLACES.filter(
    (place) => climbOf(place) !== undefined,
  ).length;

  const cappedTo = dialMaximum(state);
  const appliedBudget = state.budgetMinutes;

  const weatherPoolRules = toPoolRules(weather, {
    appliedBudget,
    climbSignature: `|${climbSettled}`,
    isHilly: (place) => climbOf(place) === "hilly",
    clear: () => dispatch({ type: "toggleWeatherAware" }),
  });

  // Every rule's signature changes exactly when its verdicts could, never per render.
  const rules: readonly PoolRule[] = [
    ...(state.hideClosed
      ? [
          {
            id: "closed",
            reason: "closed",
            active: true,
            clearLabel: "Include closed places",
            clear: () => dispatch({ type: "toggleHideClosed" }),
            signature: `${poolClock.slot}|${poolClock.date}`,
            // `unknown` is never excluded; most places carry no schedule.
            excludes: (place: Place) =>
              !isOpenEnough(
                evaluateHours(
                  hoursFor(place.id),
                  poolClock,
                  poolSun,
                  HOURS_COVERAGE,
                ),
              ),
          } satisfies PoolRule,
        ]
      : []),
    ...(state.kind === "any"
      ? []
      : [
          {
            id: "kind",
            reason: "kind",
            active: true,
            clearLabel: "Any kind of place",
            clear: () => dispatch({ type: "kind", kind: "any" }),
            signature: state.kind,
            excludes: (place: Place) => !matchesKind(place, state.kind),
          } satisfies PoolRule,
        ]),
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
            // Deferred: an unmeasured place passes provisionally so the pool
            // does not shrink and grow as routes land.
            deferred: true,
            excludes: (place: Place) => {
              const band = climbOf(place);
              return band !== undefined && band !== state.climb;
            },
          } satisfies PoolRule,
        ]),
  ];

  const poolConditions: PoolConditions = {
    reach,
    partnerReach,
    floorPolygons,
    vibes: state.vibes,
    edgeOnly: state.edgeOnly,
    rules,
  };
  const pool = poolReport(PLACES, poolConditions);
  const candidates = pool.included;
  const candidateKey = pool.includedKey;
  const picked = PLACES.find((place) => place.id === state.pickedId) ?? null;

  // A dial position the warm-up missed. Held until the warm-up reports done
  // so a cold start does not race the snapshot with engine queries.
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

  // Warm routes for the current pool as soon as its contour lands.
  const warmedNow = useRef("");
  useEffect(() => {
    const key = `${pointKey(origin)}|${candidateKey}`;
    if (candidateKey === "" || warmedNow.current === key) return;
    warmedNow.current = key;
    const wanted = new Set(candidateKey.split(","));
    void prefetchRoutes(
      origin,
      PLACES.filter((place) => wanted.has(place.id)),
      bumpRoutes,
    );
  }, [candidateKey, origin]);

  // Then widen to the nearest places inside the 100-minute contour, capped for
  // the route cache and the rate limiter. A place past the cap loads on pick.
  const widestReady = cachedReach(origin, MAX_MINUTES) !== null;
  const warmedWide = useRef("");
  useEffect(() => {
    const key = pointKey(origin);
    if (!widestReady || warmedWide.current === key) return;
    warmedWide.current = key;
    const outermost = cachedReach(origin, MAX_MINUTES)?.bands.at(-1);
    if (!outermost) return;
    const reachable = PLACES.filter((place) =>
      contains(outermost.polygons, place),
    )
      .map((place) => ({ place, meters: metersBetween(origin, place) }))
      .toSorted((a, b) => a.meters - b.meters)
      .slice(0, WIDE_PREFETCH_LIMIT)
      .map((entry) => entry.place);
    void prefetchRoutes(origin, reachable, bumpRoutes);
  }, [widestReady, origin]);

  // The reel shows only candidates with a drawable route; the winner is still
  // drawn from the full list so loading order cannot bias it.
  const drawable = candidates.filter((place) => cachedRoute(origin, place));

  // Progress counts key on the pool before the climb filter measured anything,
  // so the denominator does not tick down as measurements land.
  const basePool = pool.baseIncluded;
  const settledRoutes = basePool.filter(
    (place) =>
      cachedRoute(origin, place) !== undefined ||
      routeSettledFailed(origin, place),
  ).length;
  const routesPending = basePool.length > 0 && settledRoutes < basePool.length;

  // The grace is keyed per pool, so a new origin or filter set starts its own wait.
  const poolKey = `${pointKey(origin)}|${pool.baseKey}`;
  const [graceOverFor, setGraceOverFor] = useState<string | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(
      () => setGraceOverFor(poolKey),
      ROUTE_WARM_GRACE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [poolKey]);
  const warmGraceOver = graceOverFor === poolKey;

  // With a climb filter on there is no grace: the pool depends on the measurement.
  const routesWarming =
    routesPending && (state.climb !== "any" || !warmGraceOver);
  const reelIsShort = routesPending && warmGraceOver;

  /** Who drew the reel now turning: this side, the other, or nobody. */
  const spinnerRef = useRef<"me" | "them" | null>(null);
  const {
    showing,
    run: runSpin,
    cancel: cancelSpin,
  } = useSpin(
    useCallback(
      (place: Place) => {
        if (spinnerRef.current === "me") send(settleFrame(false));
        spinnerRef.current = null;
        dispatch({ type: "spinEnd", pickedId: place.id });
      },
      [send],
    ),
  );

  const active = state.spinning ? showing : picked;
  const activeRoute = active ? cachedRoute(origin, active) : null;
  const route = activeRoute ?? null;
  const routeLoading = active !== null && activeRoute === undefined;

  const pickedId = picked?.id ?? null;
  const pickedRouteMissing =
    picked !== null && cachedRoute(origin, picked) === undefined;
  const attempt = state.routeAttempt;
  const routeFailed = pickedRouteMissing && attempt >= ROUTE_ATTEMPTS;

  useEffect(() => {
    if (!picked || !pickedRouteMissing || attempt >= ROUTE_ATTEMPTS) return;
    let cancelled = false;
    let timer = 0;
    void fetchWalkingRoute(origin, picked).then(() => {
      if (cancelled) return;
      if (!routeSettledFailed(origin, picked)) {
        bumpRoutes();
        return;
      }
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

  // Their route to the picked place only. A failure here is a dash on the card.
  useEffect(() => {
    if (partner === null || picked === null) return;
    if (cachedRoute(partner, picked) !== undefined) return;
    let cancelled = false;
    fetchWalkingRoute(partner, picked)
      .then(() => {
        if (!cancelled) bumpRoutes();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [partner, picked, state.routeAttempt]);

  const partnerRoute =
    partner !== null && picked !== null ? cachedRoute(partner, picked) : null;
  const split = meetMode
    ? meetSplit({
        yourSeconds: route?.durationSeconds ?? null,
        theirSeconds: partnerRoute?.durationSeconds ?? null,
        roundTrip: state.roundTrip,
      })
    : null;
  const partnerName = partner?.name ?? "Their start";

  const startReel = (winner: Place, by: "me" | "them") => {
    spinnerRef.current = by;
    const ready = fetchWalkingRoute(origin, winner).then((winnerRoute) => {
      bumpRoutes();
      return winnerRoute;
    });
    dispatch({ type: "spinStart" });
    // A throw and its landing own the sheet at half.
    if (!wide) setSnap("half");
    runSpin(winner, drawable, ready, origin);
  };

  /** The lock gate (CONTEXT.md): with a partner's start in the room, both sides lock in before a spin. */
  const lockGate = roomId !== null && consented && partner !== null;
  const bothLocked = locked && (theirs?.locked ?? false);

  const spin = () => {
    if (candidates.length === 0 || drawable.length === 0 || routesWarming)
      return;
    if (lockGate && !bothLocked) return;
    playPress();
    // Drawn up front and sent before the reel turns, so both screens land on it (#9).
    const winner = candidates[randomIndex(candidates.length)]!;
    if (roomId !== null) send(spinFrame(winner.id));
    startReel(winner, "me");
  };

  useEffect(() => {
    peerRef.current = (frame) => {
      if (frame.t === "spin") {
        const winner = PLACES.find((place) => place.id === frame.winnerId);
        if (winner === undefined) return;
        // Theirs was relayed, so theirs won; a reel of ours already turning follows it.
        if (state.spinning) cancelSpin();
        startReel(winner, "them");
        return;
      }
      if (
        frame.t === "settle" &&
        frame.aborted &&
        spinnerRef.current === "them"
      ) {
        spinnerRef.current = null;
        cancelSpin();
        dispatch({ type: "spinCancel" });
      }
    };
  });

  // Abort a spin whose pool changed underneath it.
  const lastKeyRef = useRef(candidateKey);
  useEffect(() => {
    if (lastKeyRef.current === candidateKey) return;
    lastKeyRef.current = candidateKey;
    if (state.spinning) {
      if (spinnerRef.current === "me") send(settleFrame(true));
      spinnerRef.current = null;
      cancelSpin();
      dispatch({ type: "spinCancel" });
    }
  }, [candidateKey, state.spinning, cancelSpin, send]);

  // Layout effect: a frame callback queued before the commit must not land a stale winner.
  useLayoutEffect(() => {
    if (!state.spinning) cancelSpin();
  }, [state.spinning, cancelSpin]);

  useEffect(() => {
    if (!state.pickingOrigin) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dispatch({ type: "cancelPickOrigin" });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state.pickingOrigin]);

  const {
    locate: useMyLocation,
    locating,
    permissionHint,
  } = useLocate({
    notice: state.locationNotice,
    onOrigin: useCallback(
      (next: Origin) => dispatch({ type: "origin", origin: next }),
      [],
    ),
    onNotice: useCallback(
      (notice) => dispatch({ type: "locationNotice", notice }),
      [],
    ),
  });

  const moveOrigin = useCallback((at: LngLat) => {
    dispatch({ type: "origin", origin: customOrigin(at) });
  }, []);

  const outer = reach?.bands[reach.bands.length - 1];
  const withinBudget = !picked || !outer || contains(outer.polygons, picked);
  // A cached contour outranks a failure from another dial position.
  const status: ReachStatus = !originChosen
    ? "idle"
    : reach
      ? "ready"
      : failure
        ? failure.configured
          ? "error"
          : "not-configured"
        : "loading";

  const routePending = routeLoading && !routeFailed;
  const pickedVerdict = picked ? (pool.verdicts.get(picked.id) ?? null) : null;

  // Judged against the measured walk, whether or not the before-dark mode is on.
  const walkMinutesNow =
    route === null
      ? null
      : Math.ceil(
          (state.roundTrip
            ? route.durationSeconds * 2
            : route.durationSeconds) / 60,
        );
  const walkFitsLight =
    picked === null || routePending || walkMinutesNow === null
      ? true
      : fitsInLight(conditions.light, walkMinutesNow);

  // On the CAP_GRID, not the dial step, so the ceiling does not fall a minute every minute.
  const lightCapMinutes = state.beforeDark
    ? capFromLight(
        conditions.light,
        state.roundTrip,
        dialMinimum(state.roundTrip),
        CAP_GRID_MINUTES,
      )
    : null;
  const lightCap: TimeCap | null =
    lightCapMinutes === null || conditions.light.events.civilDuskMs === null
      ? null
      : {
          minutes: lightCapMinutes,
          reason: "daylight",
          untilMs: conditions.light.events.civilDuskMs,
        };
  const timeCap = mergeCaps([
    lightCap,
    ...(state.weatherAware ? weatherCaps(weather) : []),
  ]);

  // Not during a throw: a moved cap changes the pool under the reel.
  useEffect(() => {
    if (state.spinning) return;
    dispatch({ type: "timeCap", cap: timeCap });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeCap?.minutes, timeCap?.reason, timeCap?.untilMs, state.spinning]);

  // A scrub belongs to the pick it was made on.
  const [hover, setHover] = useState<{
    pickedId: string | null;
    meters: number | null;
  }>({
    pickedId: null,
    meters: null,
  });
  const hoverMeters = hover.pickedId === state.pickedId ? hover.meters : null;
  const setHoverMeters = (meters: number | null): void =>
    setHover({ pickedId: state.pickedId, meters });

  // The card judges hours at the settled route duration, unquantised, and is
  // allowed to disagree with the pool's half-hour pre-sort.
  const cardArrivalMs = arrivalMs(
    conditions.atMs,
    route?.durationSeconds ?? outbound * 60,
  );
  const pickedHours =
    picked === null
      ? null
      : evaluateHours(
          hoursFor(picked.id),
          hoursClock(cardArrivalMs),
          solarEvents(cardArrivalMs, origin.lat, origin.lng),
          HOURS_COVERAGE,
        );
  const closedByPool =
    pickedVerdict !== null &&
    !pickedVerdict.included &&
    pickedVerdict.reasons.includes("closed");

  const resultLines: readonly ResultLine[] = [
    ...(weather.headline === null
      ? []
      : [
          {
            key: "conditions" as const,
            text: weather.headline,
            tier: "fact" as const,
          },
        ]),
    ...(route !== null && !routePending
      ? [
          {
            key: "light" as const,
            text: `${formatMinutes(state.roundTrip ? route.durationSeconds * 2 : route.durationSeconds)} ${state.roundTrip ? "out and back" : "on foot"} · ${describeLight(conditions.light)}`,
            tier: "fact" as const,
          },
        ]
      : []),
    // Suppressed when the pool already shows a "closed" warning row for this place.
    ...(pickedHours === null || pickedHours.note === null || closedByPool
      ? []
      : [
          {
            key: "hours" as const,
            text: pickedHours.note,
            tier:
              pickedHours.source === "category" ||
              pickedHours.state === "unknown"
                ? ("assumed" as const)
                : ("fact" as const),
          },
        ]),
    ...(meetMode
      ? [
          {
            key: "meet" as const,
            text: "Both walks are measured at the same pace.",
            tier: "assumed" as const,
          },
        ]
      : []),
    {
      key: "handoff",
      text: "Other apps will recalculate. Their walk times will differ.",
      tier: "assumed",
    },
  ];

  // The one screen-reader line for a result. Empty during a throw, filled once the route settles.
  const announcement = state.spinAborted
    ? "Filters changed, spin again."
    : state.spinning || !picked || routePending
      ? ""
      : describeResult([
          state.shared === null ? "" : "Shared walk",
          picked.detour === undefined
            ? picked.name
            : `${DETOUR_LABELS[picked.detour]}: ${picked.name}`,
          ...walkClauses(route, routeFailed, state.roundTrip),
          split === null ? "" : (describeMeetClause(split, partnerName) ?? ""),
          withinBudget ? "" : "outside your current time budget",
          route === null
            ? ""
            : route.profile === null
              ? "climb not measured"
              : `${formatFeet(route.profile.ascentMeters)} of climb`,
          walkFitsLight ? "" : "does not fit in the light left",
          pickedHours?.note ?? "",
          weather.headline ?? "",
          pickedVerdict === null ||
          pickedVerdict.included ||
          pickedVerdict.reasons[0] === undefined
            ? ""
            : `not in the pool: ${asClause(REASON_COPY[pickedVerdict.reasons[0]].sentence)}`,
        ]);

  const dialWarm = (minutes: number) => {
    const outboundAt = state.roundTrip ? Math.floor(minutes / 2) : minutes;
    return (
      isWarm(origin, outboundAt) &&
      (partner === null || isWarm(partner, partnerOutbound))
    );
  };

  const shareInput: ShareInput = shareInputFor(state, picked?.id ?? "");

  // This side's settled setup, re-sent on every settle and every (re)join.
  // Not while scrubbing: the room hears settled values only.
  const mySetup: SideSetup = {
    origin: consented ? wireOrigin(origin) : null,
    budgetMinutes: state.budgetMinutes,
    roundTrip: state.roundTrip,
    floorMinutes: state.floorMinutes,
    edgeOnly: state.edgeOnly,
    climb: state.climb,
    kind: state.kind,
    vibes: state.vibes,
    weatherAware: state.weatherAware,
    locked,
  };
  const setupText = setupFrame(mySetup);
  // Also when they arrive: the relay forwards to a partner who is there, not to one who will be.
  useEffect(() => {
    if (roomId === null || room.status !== "open" || scrubbing) return;
    send(setupText);
  }, [
    roomId,
    room.status,
    room.joins,
    room.peerConnected,
    scrubbing,
    setupText,
    send,
  ]);

  // The address bar names the room while there is one, and otherwise clears
  // once it stops describing the screen.
  useEffect(() => {
    const here = window.location.pathname + window.location.search;
    if (roomId !== null) {
      const want = `${SHARE_PATH}?r=${roomId}`;
      if (here !== want) window.history.replaceState(null, "", want);
      return;
    }
    if (
      state.shared !== null &&
      liveLinkQuery(state, picked?.id ?? null) === state.shared.linkQuery
    )
      return;
    if (here !== "/") window.history.replaceState(null, "", "/");
  });

  const leaveRoom = (): void => {
    if (roomId !== null) forgetSelf(keyStore(), roomId);
    setConsented(false);
    setLockedMinutes(null);
    dispatch({ type: "leaveMeet" });
  };
  const startRoom = (): void => {
    const id = mintRoomId(randomBytes);
    rememberSelf(keyStore(), id, origin);
    setConsented(true);
    setLockedMinutes(null);
    dispatch({ type: "enterRoom", room: id });
  };

  const picking = state.pickingOrigin;
  // The sheet parks at peek while a pin is being placed.
  const beginPick = (): void => {
    if (!wide) setSnap("peek");
    dispatch({ type: "beginPickOrigin" });
  };
  useEffect(() => {
    dispatch({ type: "frame" });
  }, [roomId]);
  const landing = !wide && (state.spinning || picked !== null);
  const emptyPool = status === "ready" && candidates.length === 0;

  // A weather cap empties the pool by shrinking the contour, not by excluding,
  // so `suggestFix` cannot see it. Measured here the same way: re-derive at the
  // requested budget with the weather rules dropped and count survivors.
  const weatherCapFix = (): PoolFix | null => {
    if (!state.weatherAware || appliedBudget === null) return null;
    if (state.timeCap === null || state.timeCap.reason === "daylight")
      return null;
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
      suggestFix(PLACES, poolConditions, cachedWalkMinutes(origin), {
        roundTrip: state.roundTrip,
        meet:
          partner === null
            ? null
            : {
                you: origin,
                them: partner,
                roundTrip: state.roundTrip,
                floorMinutes: floorOutbound,
                warmed: state.warmed,
                partnerWarmed: state.partnerWarmed,
                contourAt: cachedContour,
              },
      }))
    : NO_FIX;

  const applyFix = (): void => {
    switch (fix.kind) {
      case "drop-rule":
        if (fix.reason === "no-matching-vibe") dispatch({ type: "clearVibes" });
        else if (fix.reason === "not-far-edge")
          dispatch({ type: "toggleEdge" });
        else fix.clear();
        return;
      case "drop-cap":
        fix.clear();
        return;
      case "widen-budget":
      case "widen-to-meet":
        dispatch({ type: "budget", minutes: fix.budgetMinutes });
        return;
      case "lower-floor":
        dispatch({ type: "floor", minutes: 0 });
        return;
      case "no-overlap":
        leaveRoom();
        return;
      case "meet-warming":
        return;
      case "none":
        dispatch({ type: "clearFilters" });
        return;
    }
  };

  // Counts what "Clear filters" clears. Weather and hours are not in it.
  const activeFilters =
    state.vibes.length +
    (state.edgeOnly ? 1 : 0) +
    rules.filter(
      (rule) =>
        rule.active && rule.reason !== "weather" && rule.reason !== "closed",
    ).length;

  const map = (
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
      partnerOrigin={partner}
      partnerBand={partnerReach?.bands.at(-1)?.polygons ?? null}
      partnerName={partnerName}
      originVisible={originChosen}
      onPickPlace={(id) => dispatch({ type: "pickPlace", pickedId: id })}
      onMoveOrigin={moveOrigin}
    />
  );

  const dial = (
    <TimeDial
      minutes={state.budgetMinutes}
      floorMinutes={state.floorMinutes}
      minimum={dialMinimum(state.roundTrip)}
      maximum={cappedTo}
      capNote={
        cappedTo < MAX_MINUTES
          ? capNote(state.timeCap, cappedTo, conditions.light)
          : undefined
      }
      step={budgetStep()}
      outboundMinutes={outbound}
      roundTrip={state.roundTrip}
      isWarm={dialWarm}
      warming={originChosen}
      warmedFraction={
        meetMode ? (state.warmed + state.partnerWarmed) / 2 : state.warmed
      }
      disabled={picking}
      onChange={(minutes) => dispatch({ type: "budget", minutes })}
      onFloorChange={(minutes) => dispatch({ type: "floor", minutes })}
      onScrub={setScrubbing}
      onCommit={() => dispatch({ type: "frame" })}
      headId={wide ? undefined : dialHeadId}
    />
  );

  const sheetDial = (
    <div className="sheet-dial" {...inertWhen(picking)}>
      <DialHead
        id={dialHeadId}
        minutes={state.budgetMinutes}
        floorMinutes={state.floorMinutes}
        minimum={dialMinimum(state.roundTrip)}
        outboundMinutes={outbound}
        roundTrip={state.roundTrip}
      />
      <div className="segmented" role="group" aria-label="Trip shape">
        <button
          type="button"
          aria-pressed={state.roundTrip}
          onClick={() => {
            if (state.roundTrip) return;
            playTap(true);
            dispatch({ type: "toggleRoundTrip" });
          }}
        >
          Round trip
        </button>
        <button
          type="button"
          aria-pressed={!state.roundTrip}
          onClick={() => {
            if (!state.roundTrip) return;
            playTap(true);
            dispatch({ type: "toggleRoundTrip" });
          }}
        >
          One way
        </button>
      </div>
    </div>
  );

  const header = (
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
            if (next) playTap(true);
          }}
        >
          {sound ? (
            <SpeakerSimpleHighIcon size={16} aria-hidden="true" />
          ) : (
            <SpeakerSimpleSlashIcon size={16} aria-hidden="true" />
          )}
        </button>
        {!wide && (
          <button
            type="button"
            className="icon-button rail-toggle"
            aria-expanded={snap !== "peek"}
            aria-label={snap === "peek" ? "Show controls" : "Hide controls"}
            onClick={() => {
              playPress();
              setSnap(snap === "peek" ? "half" : "peek");
            }}
          >
            <CaretDownIcon
              size={16}
              weight="bold"
              aria-hidden="true"
              style={
                snap === "peek" ? { transform: "rotate(180deg)" } : undefined
              }
            />
          </button>
        )}
      </div>
    </header>
  );

  const spinButton = (
    <button
      type="button"
      ref={spinRef}
      className="button is-spin"
      onClick={spin}
      aria-describedby={emptyPool ? emptyNoticeId : undefined}
      disabled={
        !originChosen ||
        (lockGate && !bothLocked) ||
        candidates.length === 0 ||
        drawable.length === 0 ||
        routesWarming ||
        state.spinning ||
        picking ||
        status !== "ready"
      }
    >
      <ShuffleIcon size={18} weight="bold" aria-hidden="true" />
      {lockGate && !bothLocked
        ? locked
          ? "Waiting for them"
          : "Lock in first"
        : state.spinning
          ? "Spinning"
          : status === "ready" && routesWarming
            ? state.climb === "any"
              ? `Loading routes ${settledRoutes}/${basePool.length}`
              : `Measuring climb ${settledRoutes}/${basePool.length}`
            : picked !== null && !wide
              ? "Spin again"
              : "Spin"}
    </button>
  );

  const panel = (
    <div className="panel">
      {!wide && dial}
      {!(roomId !== null && !originChosen && !wide) && (
        <OriginPicker
          origin={origin}
          pickingOrigin={picking}
          locating={locating}
          onSelect={(next) => dispatch({ type: "origin", origin: next })}
          onBeginPickOnMap={beginPick}
          onCancelPickOnMap={() => dispatch({ type: "cancelPickOrigin" })}
          permissionHint={permissionHint}
          onUseMyLocation={useMyLocation}
        />
      )}
      {roomId !== null && (
        <RoomPanel
          room={room}
          roomUrl={roomUrl(window.location.origin, roomId)}
          origin={origin}
          originChosen={originChosen}
          consented={consented}
          partnerFailure={state.partnerFailure}
          permissionHint={permissionHint}
          locating={locating}
          onStartRoom={startRoom}
          onShareStart={() => setConsented(true)}
          onUseMyLocation={useMyLocation}
          onPickOnMap={beginPick}
          onSelectPreset={(next: Origin) =>
            dispatch({ type: "origin", origin: next })
          }
          onLeave={leaveRoom}
          onNewRoom={() => {
            leaveRoom();
            startRoom();
          }}
        />
      )}
      {state.locationNotice && (
        <div className="notice-stack" {...inertWhen(picking)}>
          <p
            id={locationNoticeId}
            className={
              state.locationNotice.tone === "warn" ? "notice is-warn" : "notice"
            }
            role={state.locationNotice.tone === "warn" ? "alert" : "status"}
          >
            {state.locationNotice.message}
          </p>
          {/* Outside the live region: a control inside an assertive region announces inconsistently. */}
          {state.locationNotice.suggest && (
            <button
              type="button"
              className="link-button"
              aria-describedby={locationNoticeId}
              onClick={() => {
                playTap(true);
                if (state.locationNotice?.suggest) {
                  dispatch({
                    type: "origin",
                    origin: state.locationNotice.suggest,
                  });
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
          <p className="notice" {...inertWhen(picking)}>
            Measuring the reachable area from your spot. The dial fills in as it
            arrives.
          </p>
        )}

      {wide && dial}

      <DaylightSwitch
        checked={state.beforeDark}
        deadline={describeDeadline(conditions.light, state.roundTrip)}
        disabled={picking}
        onToggle={() => dispatch({ type: "toggleBeforeDark" })}
      />

      {status === "not-configured" ? (
        <div className="notice is-setup">
          <strong>The routing engine is not answering.</strong>
          {import.meta.env.DEV ? (
            <p>
              Contours and routes come from a Valhalla instance. Set{" "}
              <code>VALHALLA_URL</code> in <code>.env.local</code>, then restart
              the dev server. See <code>valhalla/README.md</code>. The server
              said: {failure?.message}
            </p>
          ) : (
            <p>
              Reachable areas and routes are unavailable right now. Try again
              shortly.
            </p>
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
          meet={
            meetMode
              ? {
                  bothCount: pool.included.length,
                  outerMinutes: outbound,
                  partnerWarm: partnerReach !== null,
                }
              : null
          }
        />
      )}

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
          capMinutes={state.budgetMinutes}
        />
      )}

      {lockGate && (
        <div className="lock-row" {...inertWhen(picking)}>
          {locked ? (
            <p className="meet-hint" role="status">
              Locked in at <strong>{state.budgetMinutes} min</strong>.
              {theirs?.locked ? "" : " Waiting for them to lock in."}
            </p>
          ) : (
            <button
              type="button"
              className="button"
              disabled={picking || status !== "ready"}
              onClick={() => {
                playPress();
                setLockedMinutes(state.budgetMinutes);
              }}
            >
              Lock in {state.budgetMinutes} min
            </button>
          )}
        </div>
      )}

      {wide && spinButton}

      {status === "ready" && roomId === null && (
        <RoomPanel
          room={null}
          roomUrl={null}
          origin={origin}
          originChosen={originChosen}
          consented={false}
          partnerFailure={null}
          permissionHint={permissionHint}
          locating={locating}
          onStartRoom={startRoom}
          onShareStart={() => {}}
          onUseMyLocation={useMyLocation}
          onPickOnMap={() => {}}
          onSelectPreset={() => {}}
          onLeave={() => {}}
          onNewRoom={() => {}}
        />
      )}

      {state.shared !== null &&
        (state.shared.missingPlaceId !== null ||
          state.shared.clampedFromMinutes !== null) && (
          <div className="notice-stack" {...inertWhen(picking)}>
            {state.shared.missingPlaceId !== null && (
              <p className="notice is-warn">
                The place this link points to is no longer on the map.
                Everything else about the walk is set up. Spin for somewhere
                new.
              </p>
            )}
            {state.shared.clampedFromMinutes !== null && (
              <p className="notice">
                This link asked for {state.shared.clampedFromMinutes} minutes;
                the closest the dial goes is {state.budgetMinutes}.
              </p>
            )}
            <button
              type="button"
              className="link-button"
              onClick={() => {
                playTap(true);
                dispatch({ type: "dismissShared" });
              }}
            >
              Dismiss
            </button>
          </div>
        )}

      {reelIsShort && !emptyPool && (
        <div className="notice" {...inertWhen(picking)} role="status">
          {drawable.length} of {basePool.length} routes are ready. The reel
          turns through those; the rest are still coming from the engine.
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
  );

  const spinSlot = (
    <div className="spin-slot" {...inertWhen(picking)}>
      {state.spinning && showing && (
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
          shareUrl={shareUrl(window.location.origin, shareInput)}
          originName={origin.name}
          budgetMinutes={state.budgetMinutes}
          sharedArrival={state.shared !== null}
          split={split}
          partnerName={partnerName}
          compact={!wide}
          onSpinAgain={spin}
          onRetryRoute={() => dispatch({ type: "routeAttempt", attempt: 0 })}
          onDismiss={() => {
            // The pressed button is inside the card this unmounts; move focus first.
            spinRef.current?.focus();
            dispatch({ type: "clearPick" });
          }}
        />
      )}
    </div>
  );

  const drawers = (
    <>
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
          hideClosed={state.hideClosed}
          onClimb={(climb) => dispatch({ type: "climb", climb })}
          onKind={(kind) => dispatch({ type: "kind", kind })}
          onToggleHideClosed={() => dispatch({ type: "toggleHideClosed" })}
          onToggleVibe={(vibe) => dispatch({ type: "toggleVibe", vibe })}
          onToggleRoundTrip={() => dispatch({ type: "toggleRoundTrip" })}
          onToggleEdge={() => dispatch({ type: "toggleEdge" })}
          onToggleWeatherAware={() => dispatch({ type: "toggleWeatherAware" })}
        />
      </details>

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
    </>
  );

  const tail = (
    <>
      {import.meta.env.DEV && <TuningPanel />}
      <p className="sr-only" role="status">
        {announcement}
      </p>
    </>
  );

  return (
    <div
      className={`shell${picking ? " is-picking" : ""}${!wide && snap === "full" ? " is-covered" : ""}`}
    >
      {map}

      {wide ? (
        <div className="rail">
          {header}
          {panel}
          {spinSlot}
          {drawers}
          {tail}
        </div>
      ) : (
        <Sheet
          snap={snap}
          onSnap={setSnap}
          topInset={roomId === null ? 16 : mirrorOpen ? 220 : 72}
          head={
            <>
              {header}
              {sheetDial}
            </>
          }
          bar={spinButton}
        >
          {landing ? (
            spinSlot
          ) : (
            <>
              {panel}
              {spinSlot}
              {drawers}
            </>
          )}
          {tail}
        </Sheet>
      )}

      {roomId !== null && (
        <PartnerRail
          room={room}
          partnerName={partnerName}
          yourMinutes={state.budgetMinutes}
          bothCount={candidates.length}
          nowMs={conditions.atMs}
          compact={!wide}
          expanded={mirrorOpen}
          onToggle={() => {
            setMirrorOpen((value) => !value);
            dispatch({ type: "frame" });
          }}
          onMatch={(minutes) => dispatch({ type: "budget", minutes })}
          onNewRoom={() => {
            leaveRoom();
            startRoom();
          }}
        />
      )}
    </div>
  );
}

/** The dial's cap note, naming the condition that is clamping it. */
function capNote(
  cap: TimeCap | null,
  minutes: number,
  light: Daylight,
): string {
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
