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
import { TimeDial } from "../ui/TimeDial";
import { OriginPicker } from "../ui/OriginPicker";
import { Filters } from "../ui/Filters";
import { ReachReadout, type ReachStatus } from "../ui/ReachReadout";
import { ResultCard } from "../ui/ResultCard";
import { PLACES, type Place, type Terrain, type Vibe } from "../data/places";
import { contains, pointKey, type LngLat } from "../lib/geometry";
import { formatMiles, formatMinutes } from "../lib/format";
import {
  MAX_MINUTES,
  NotConfiguredError,
  cachedReach,
  fetchReach,
  isWarm,
  prefetchLadder,
  type Reach,
} from "../lib/isochrone";
import {
  cachedRoute,
  fetchWalkingRoute,
  prefetchRoutes,
  routeFailed as routeSettledFailed,
  type WalkingRoute,
} from "../lib/route";
import {
  budgetStep,
  customOrigin,
  dialMinimum,
  initialSession,
  outboundMinutes,
  reduce,
  type Failure,
} from "./session";
import { randomIndex, useSpin } from "./useSpin";
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
 * `inert`, written by hand. React 18 has no boolean handling for the attribute
 * and its types do not know it at all, so the present-means-on empty string is
 * spread in instead of passed as a prop. This is what takes the dimmed rail
 * out of the tab order during a pin drop; opacity and `pointer-events: none`
 * left every control in it focusable and silently dead.
 */
const inertWhen = (on: boolean): Record<string, string> => (on ? { inert: "" } : {});

const describe = (cause: unknown): Failure => ({
  configured: !(cause instanceof NotConfiguredError),
  message: cause instanceof Error ? cause.message : "Could not load the reachable area.",
});

export function App() {
  const [state, dispatch] = useReducer(reduce, initialSession);
  const [locating, setLocating] = useState(false);
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches);
  const [filtersOpen, setFiltersOpen] = useState(wide);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const emptyNoticeId = useId();
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
  // point-in-polygon sweep over 51 places, which is cheaper than the
  // bookkeeping memoising them would need against an external cache. The
  // whole ladder is prefetched, so during a scrub this is a hit on every
  // frame and the contour and the readout track the dial exactly.
  const reach = cachedReach(origin, outbound);

  const candidates = selectCandidates(reach, state.terrain, state.vibes, state.edgeOnly);
  const candidateKey = candidates.map((p) => p.id).join(",");
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
    fetchReach(origin, outbound)
      .then(() => {
        if (!cancelled) bumpContours();
      })
      .catch((cause: unknown) => {
        if (!cancelled) dispatch({ type: "failed", failure: describe(cause) });
      });
    return () => {
      cancelled = true;
    };
  }, [missing, failure, origin, outbound]);

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
    const pool = PLACES.filter((place) => candidateKey.split(",").includes(place.id));
    void prefetchRoutes(origin, pool, bumpRoutes);
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
    void prefetchRoutes(
      origin,
      PLACES.filter((place) => contains(outermost.polygons, place)),
      bumpRoutes,
    );
  }, [widestReady, origin]);

  /**
   * Candidates that already have a line to draw. The reel shows only these, so
   * every tick puts a real route on the map. The winner is still drawn from the
   * full candidate list: restricting the draw to whatever loaded first would
   * quietly bias the result toward nearby places.
   */
  const drawable = candidates.filter((place) => cachedRoute(origin, place));

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
    if (candidates.length === 0 || drawable.length === 0) return;
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
    if (!navigator.geolocation) {
      dispatch({ type: "locationError", message: "This browser cannot share a location." });
      return;
    }
    setLocating(true);
    dispatch({ type: "locationError", message: null });
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        dispatch({
          type: "origin",
          origin: {
            id: "me",
            name: "My location",
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
        });
      },
      () => {
        setLocating(false);
        dispatch({
          type: "locationError",
          message: "Location unavailable. Drop a pin instead.",
        });
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, []);

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
  const announcement = state.spinAborted
    ? "Filters changed, spin again."
    : state.spinning || !picked || routePending
      ? ""
      : describeResult(picked, route, routeFailed, state.roundTrip, withinBudget);

  // Rebuilt each render rather than memoised: it is read during TimeDial's
  // render, and App already re-renders whenever the contour cache changes.
  const dialWarm = (minutes: number) =>
    isWarm(origin, state.roundTrip ? Math.floor(minutes / 2) : minutes);

  // Built from the key so its identity is stable while the pool is unchanged,
  // which keeps MapCanvas from resending every place on every render.
  const candidateIds = useMemo(
    () => new Set(candidateKey === "" ? [] : candidateKey.split(",")),
    [candidateKey],
  );

  const picking = state.pickingOrigin;
  const collapsed = railCollapsed && !wide;
  const emptyNotice = status === "ready" && candidates.length === 0;
  // A phone starts with the drawer shut, and a bare "Filters" over a shrunken
  // count is a cause the reader cannot see.
  const activeFilters =
    (state.terrain === "any" ? 0 : 1) + state.vibes.length + (state.edgeOnly ? 1 : 0);

  return (
    <div className={`shell${picking ? " is-picking" : ""}`}>
      <MapCanvas
        origin={origin}
        reach={reach}
        places={PLACES}
        inReachIds={candidateIds}
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
            onUseMyLocation={useMyLocation}
          />
          {state.locationError && (
            <p className="notice is-warn" role="alert">
              {state.locationError}
            </p>
          )}

          <TimeDial
            minutes={state.budgetMinutes}
            minimum={dialMinimum(state.roundTrip)}
            step={budgetStep()}
            outboundMinutes={outbound}
            roundTrip={state.roundTrip}
            isWarm={dialWarm}
            warmedFraction={state.warmed}
            disabled={picking}
            onChange={(minutes) => dispatch({ type: "budget", minutes })}
            onCommit={() => dispatch({ type: "frame" })}
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
              placeCount={candidates.length}
              outerMinutes={outer?.minutes ?? outbound}
              commitKey={state.framingKey}
            />
          )}

          <button
            type="button"
            ref={spinRef}
            className="button is-spin"
            onClick={spin}
            aria-describedby={emptyNotice ? emptyNoticeId : undefined}
            // Routes lag the contours by a second or two on a cold origin, and
            // spinning before any of them land would tick through names with
            // no line on the map. That is the thing the reel exists to show.
            disabled={
              candidates.length === 0 ||
              drawable.length === 0 ||
              state.spinning ||
              picking ||
              status !== "ready"
            }
          >
            <ShuffleIcon size={18} weight="bold" aria-hidden="true" />
            {state.spinning
              ? "Spinning"
              : status === "ready" && candidates.length > 0 && drawable.length === 0
                ? "Loading routes"
                : "Spin"}
          </button>

          {emptyNotice && (
            <div className="notice" id={emptyNoticeId} {...inertWhen(picking)}>
              Nothing matches inside {outer?.minutes ?? outbound} minutes.
              <button
                type="button"
                className="link-button"
                onClick={() => dispatch({ type: "clearFilters" })}
              >
                Clear filters
              </button>
            </div>
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
            terrain={state.terrain}
            vibes={state.vibes}
            roundTrip={state.roundTrip}
            edgeOnly={state.edgeOnly}
            onTerrain={(terrain) => dispatch({ type: "terrain", terrain })}
            onToggleVibe={(vibe) => dispatch({ type: "toggleVibe", vibe })}
            onToggleRoundTrip={() => dispatch({ type: "toggleRoundTrip" })}
            onToggleEdge={() => dispatch({ type: "toggleEdge" })}
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
            error, and "Places in reach (0)" reads as an answer in both. The
            app does not know the count yet, so it does not offer one. */}
        {reach !== null && (
        <details className="drawer" {...inertWhen(picking)}>
          <summary>Places in reach ({candidates.length})</summary>
          <ul className="origin-list">
            {candidates.map((place) => (
              <li key={place.id}>
                <button
                  type="button"
                  className="origin-option"
                  aria-current={place.id === state.pickedId}
                  onClick={() => dispatch({ type: "pickPlace", pickedId: place.id })}
                >
                  {place.name}
                </button>
              </li>
            ))}
          </ul>
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
 * The one line a screen reader gets for a result: what the reel and the card
 * say between them, in a sentence.
 */
function describeResult(
  place: Place,
  route: WalkingRoute | null,
  routeFailed: boolean,
  roundTrip: boolean,
  withinBudget: boolean,
): string {
  const parts = [place.name];
  if (route) {
    parts.push(
      `${formatMinutes(roundTrip ? route.durationSeconds * 2 : route.durationSeconds)} ${
        roundTrip ? "out and back" : "on foot"
      }`,
      formatMiles(roundTrip ? route.distanceMeters * 2 : route.distanceMeters),
    );
  } else {
    parts.push(routeFailed ? "walk time unavailable" : "no walking route");
  }
  if (!withinBudget) parts.push("outside your current time budget");
  return `${parts.join(", ")}.`;
}

/**
 * Places that pass the filters and sit inside the reachable area. With
 * `edgeOnly`, a place must also fall outside the next contour in, which is the
 * "walk as far as you can" pool.
 */
function selectCandidates(
  reach: Reach | null,
  terrain: Terrain | "any",
  vibes: readonly Vibe[],
  edgeOnly: boolean,
): Place[] {
  const bands = reach?.bands;
  if (!bands || bands.length === 0) return [];
  const outer = bands[bands.length - 1]!;
  const inner = edgeOnly && bands.length > 1 ? bands[bands.length - 2] : undefined;

  return PLACES.filter((place) => {
    if (terrain !== "any" && place.terrain !== terrain) return false;
    if (vibes.length > 0 && !place.tags.some((tag) => vibes.includes(tag))) return false;
    if (!contains(outer.polygons, place)) return false;
    if (inner && contains(inner.polygons, place)) return false;
    return true;
  });
}
