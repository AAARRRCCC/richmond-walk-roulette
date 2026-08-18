import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { ShuffleIcon } from "@phosphor-icons/react";
import { MapCanvas } from "../map/MapCanvas";
import { TimeDial } from "../ui/TimeDial";
import { OriginPicker } from "../ui/OriginPicker";
import { Filters } from "../ui/Filters";
import { ReachReadout, type ReachStatus } from "../ui/ReachReadout";
import { ResultCard } from "../ui/ResultCard";
import { PLACES, type Place, type Terrain, type Vibe } from "../data/places";
import { contains, type LngLat } from "../lib/geometry";
import {
  MAX_MINUTES,
  NotConfiguredError,
  cachedReach,
  fetchReach,
  isWarm,
  prefetchLadder,
  type Reach,
} from "../lib/isochrone";
import { cachedRoute, fetchWalkingRoute, prefetchRoutes } from "../lib/route";
import {
  budgetStep,
  customOrigin,
  dialMinimum,
  initialSession,
  outboundMinutes,
  reduce,
} from "./session";
import { randomIndex, useSpin } from "./useSpin";

/**
 * Picks the remediation the reader can actually act on: locally the engine
 * URL lives in .env.local, on the deployed Worker it is a var and there is no
 * such file. Compile-time, so the unused branch is stripped and
 * `vite dev --host` from a phone still shows the dev instructions.
 */
const isDevServer = import.meta.env.DEV;

type Failure = { message: string; configured: boolean };

const describe = (error: unknown): Failure => ({
  configured: !(error instanceof NotConfiguredError),
  message: error instanceof Error ? error.message : "Could not load the reachable area.",
});

export function App() {
  const [state, dispatch] = useReducer(reduce, initialSession);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 900px)").matches,
  );

  /**
   * The contour and route caches are mutable module state, so these counters
   * are how a completed fetch reaches React. They are separate on purpose: a
   * route landing must not invalidate the reach, or every finished route would
   * rebuild the candidate list and kick off another round of route warming.
   */
  const [, bumpContours] = useReducer((n: number) => n + 1, 0);
  const [, bumpRoutes] = useReducer((n: number) => n + 1, 0);

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
    }).catch((error: unknown) => {
      if (!cancelled) dispatch({ type: "failed", failure: describe(error) });
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

  // A dial position the warm-up missed still has to work.
  const missing = reach === null;
  useEffect(() => {
    if (!missing || failure) return;
    let cancelled = false;
    fetchReach(origin, outbound)
      .then(() => {
        if (!cancelled) bumpContours();
      })
      .catch((error: unknown) => {
        if (!cancelled) dispatch({ type: "failed", failure: describe(error) });
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
    const key = `${originKey(origin)}|${candidateKey}`;
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
    const key = originKey(origin);
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
  useEffect(() => {
    if (!picked || !pickedRouteMissing) return;
    let cancelled = false;
    void fetchWalkingRoute(origin, picked).then(() => {
      if (!cancelled) bumpRoutes();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedId, pickedRouteMissing, origin]);
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
    const winner = candidates[randomIndex(candidates.length)]!;
    const ready = fetchWalkingRoute(origin, winner).then((route) => {
      bumpRoutes();
      return route;
    });
    dispatch({ type: "spinStart" });
    runSpin(winner, drawable, ready);
  };

  // Abort a spin whose pool changed underneath it: landing on a place that is
  // no longer eligible would contradict the dots on the map.
  const lastKeyRef = useRef(candidateKey);
  useEffect(() => {
    if (lastKeyRef.current === candidateKey) return;
    lastKeyRef.current = candidateKey;
    if (state.spinning) {
      cancelSpin();
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

  const useMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError("This browser cannot share a location.");
      return;
    }
    setLocating(true);
    setLocationError(null);
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
        setLocationError("Location unavailable. Drop a pin instead.");
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

  return (
    <div className={`shell${state.pickingOrigin ? " is-picking" : ""}`}>
      <MapCanvas
        origin={origin}
        reach={reach}
        places={PLACES}
        inReachIds={candidateIds}
        pickedId={active?.id ?? null}
        framingKey={state.framingKey}
        route={route}
        pickingOrigin={state.pickingOrigin}
        onPickPlace={(id) => dispatch({ type: "pickPlace", pickedId: id })}
        onMoveOrigin={moveOrigin}
      />

      <div className="rail">
        <header className="brand">
          <h1>
            Walk Roulette
            <span className="brand-place">Richmond</span>
          </h1>
          <p className="brand-line">
            Real walking reach, not a circle on a map. Pick a time, spin for somewhere to go.
          </p>
        </header>

        <div className="panel">
          <OriginPicker
            origin={origin}
            pickingOrigin={state.pickingOrigin}
            locating={locating}
            onSelect={(next) => dispatch({ type: "origin", origin: next })}
            onBeginPickOnMap={() => dispatch({ type: "beginPickOrigin" })}
            onUseMyLocation={useMyLocation}
          />
          {locationError && <p className="notice is-warn">{locationError}</p>}

          <TimeDial
            minutes={state.budgetMinutes}
            minimum={dialMinimum(state.roundTrip)}
            step={budgetStep(state.roundTrip)}
            outboundMinutes={outbound}
            roundTrip={state.roundTrip}
            isWarm={dialWarm}
            warmedFraction={state.warmed}
            onChange={(minutes) => dispatch({ type: "budget", minutes })}
            onCommit={() => dispatch({ type: "frame" })}
          />

          {status === "not-configured" ? (
            <div className="notice is-setup">
              <strong>{failure?.message ?? "The routing engine is not configured."}</strong>
              <p>
                Contours and routes come from a Valhalla instance.{" "}
                {isDevServer ? (
                  <>
                    Set <code>VALHALLA_URL</code> in <code>.env.local</code>, then restart the dev
                    server. See <code>valhalla/README.md</code>.
                  </>
                ) : (
                  <>
                    Set <code>VALHALLA_URL</code> on the Worker, then redeploy. See{" "}
                    <code>valhalla/README.md</code>.
                  </>
                )}
              </p>
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
            />
          )}

          <button
            type="button"
            className="button is-spin"
            onClick={spin}
            // Routes lag the contours by a second or two on a cold origin, and
            // spinning before any of them land would tick through names with
            // no line on the map. That is the thing the reel exists to show.
            disabled={
              candidates.length === 0 ||
              drawable.length === 0 ||
              state.spinning ||
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

          {status === "ready" && candidates.length === 0 && (
            <div className="notice">
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

        <div className="spin-slot" aria-live="polite" aria-atomic="true">
          {state.spinning && showing && (
            <p className="spin-reel">
              <span className="field-label">Choosing</span>
              <span className="spin-name">{showing.name}</span>
            </p>
          )}
          {!state.spinning && picked && (
            <ResultCard
              origin={origin}
              place={picked}
              route={route}
              routeLoading={routeLoading}
              roundTrip={state.roundTrip}
              withinBudget={withinBudget}
              onSpinAgain={spin}
              onDismiss={() => dispatch({ type: "clearPick" })}
            />
          )}
        </div>

        <details
          className="drawer"
          open={filtersOpen}
          onToggle={(event) => setFiltersOpen(event.currentTarget.open)}
        >
          <summary>Filters</summary>
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

        <ul className="sr-only">
          {candidates.map((place) => (
            <li key={place.id}>
              <button
                type="button"
                onClick={() => dispatch({ type: "pickPlace", pickedId: place.id })}
              >
                {place.name}. {place.blurb}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function originKey(origin: LngLat): string {
  return `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}`;
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

