import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { POIS, START_LOCATIONS, type POI } from "./data/pois";
import { distanceTo, eligiblePoiIds, findStart, fmtMiles, fmtMinutes, toLngLat, type MileXY } from "./lib/geo";
import { wheelLayout, normalizeAngle } from "./lib/wheel-layout";
import { readShareState, writeShareState, type ShareState } from "./lib/url-state";
import { fetchWalkingRoute, type WalkingRoute } from "./lib/route";
import { filterReducer, filterStateFromShare } from "./lib/filter-state";
import { wheelReducer, wheelStateFromShare } from "./lib/wheel-state";
import { Header } from "./components/Header";
import { Controls } from "./components/Controls";
import { WheelPane } from "./components/WheelPane";
import { MapPane } from "./components/MapPane";
import { ResultPane } from "./components/ResultPane";
import { MobileDrawer } from "./components/MobileDrawer";

const DEFAULT_WEATHER = "Get out — the air is doing nothing dramatic";
const SPIN_DURATION_MS = 4200;

export default function App() {
  // Filter state lives in a single reducer so URL-restore can land
  // everything in one dispatch (was 7 cascading setStates) and filter
  // updates remain atomic. Initial value is computed lazily from the
  // URL hash so there's no startup effect-chain.
  const [filters, filtersDispatch] = useReducer(filterReducer, null, () =>
    filterStateFromShare(readShareState()),
  );
  const { startId, customStart, range, roundTrip, difficulty, tags } = filters;

  // Wheel/animation state lives in its own reducer so the (rotation,
  // spinning, selectedId) trio updates atomically — previously these were
  // three separate setStates with briefly-inconsistent intermediate
  // renders. Restored from URL hash on mount via the lazy initializer.
  const [wheel, wheelDispatch] = useReducer(wheelReducer, null, () =>
    wheelStateFromShare(readShareState()?.pick),
  );
  const { rotation, spinning, selectedId } = wheel;
  const animFrameRef = useRef<number | null>(null);
  // Focus management for the wheel overlay: when a spin starts, keyboard
  // focus shifts to a non-interactive announcement region inside the
  // overlay (Web Claude: "focus moves to non-interactive announcement
  // region 'Spinning the wheel'"); when the spin ends, focus returns to
  // the Spin Again button in the drawer peek so the next interaction is
  // one keystroke away.
  const spinningAnnounceRef = useRef<HTMLDivElement | null>(null);
  const spinAgainButtonRef = useRef<HTMLButtonElement | null>(null);
  const wasSpinningRef = useRef(false);

  const [pickingStart, setPickingStart] = useState(false);
  const [walkingRoute, setWalkingRoute] = useState<WalkingRoute | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const showToast = useCallback((msg: string) => {
    // Cancel any in-flight clear timer so a re-trigger doesn't get its
    // toast cut short by the previous trigger's setTimeout.
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast(msg);
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 1800);
  }, []);
  // Cleanup the toast timer if the component unmounts mid-display.
  useEffect(
    () => () => {
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    },
    [],
  );

  const startLocation = useMemo(
    () => findStart(startId, customStart, START_LOCATIONS),
    [startId, customStart],
  );

  const eligibleIds = useMemo(
    () => eligiblePoiIds(startLocation, range, roundTrip, difficulty, tags, POIS),
    [startLocation, range, roundTrip, difficulty, tags],
  );

  const wheelPois = useMemo<POI[]>(
    () =>
      POIS.filter((p) => eligibleIds.has(p.id))
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [eligibleIds],
  );

  // Resolve the destination shown in the result pane AND the map:
  // - if a pick is locked in (post-spin), use it
  // - else if not spinning, use the entry currently closest to the indicator
  //
  // The "closest-to-indicator" idle fallback is deliberate: it gives the
  // result pane + map a meaningful preview state instead of being empty
  // before the user spins. The right-column UI tracks whatever's at the
  // indicator — same POI the wheel visually highlights, same route the
  // user would commit to if they spun and happened to land there. The
  // Spin button label ("Spin" vs "Spin Again") is the source of truth
  // for whether anything is actually committed.
  const destination = useMemo<POI | null>(() => {
    if (selectedId) return POIS.find((p) => p.id === selectedId) ?? null;
    if (spinning || wheelPois.length === 0) return null;
    const layout = wheelLayout(wheelPois.length);
    let best = 0;
    let bestAbs = Infinity;
    for (let i = 0; i < layout.totalSlots; i++) {
      const t = Math.abs(normalizeAngle(i * layout.step + rotation));
      if (t < bestAbs) {
        bestAbs = t;
        best = i;
      }
    }
    return wheelPois[best % wheelPois.length] ?? null;
  }, [wheelPois, rotation, selectedId, spinning]);

  // If filters change such that the picked POI is no longer eligible, drop it
  useEffect(() => {
    if (selectedId && !eligibleIds.has(selectedId)) {
      wheelDispatch({ type: "CLEAR_SELECTION" });
    }
  }, [eligibleIds, selectedId]);

  // Fetch a real walking route from Google Routes API when a destination is picked.
  // Eagerly clear walkingRoute on every dependency change: otherwise the previous
  // destination's polyline would render on the new destination's dot/callout for
  // the duration of the fetch (~100–500ms), producing a visible route/marker
  // mismatch. Clearing first lets the map fall back to its stylized Bezier
  // placeholder during the fetch, then upgrade to the real polyline on resolve.
  // AbortController cancels the in-flight HTTP request (not just the result)
  // when destination changes again — saves bandwidth and billed API calls.
  useEffect(() => {
    setWalkingRoute(null);
    if (!destination) return;
    const ctrl = new AbortController();
    fetchWalkingRoute(toLngLat(startLocation), toLngLat(destination), ctrl.signal).then(
      (route) => {
        if (!ctrl.signal.aborted) setWalkingRoute(route);
      },
    );
    return () => ctrl.abort();
  }, [destination, startLocation]);

  // Full roulette spin: 4–6 turns, random destination, ~4.2s deceleration.
  // Single source of truth for the share-state payload — used by spin
  // (with the just-picked POI), rotateTo (with its target POI), and the
  // Share button (with whatever's currently selected). Keeping this in
  // one place ensures the three callers stay in sync.
  const buildShareState = useCallback(
    (pickId: string | null): ShareState => ({
      start: customStart ? null : startId,
      custom: customStart,
      range,
      rt: roundTrip,
      diff: difficulty,
      tags: Array.from(tags),
      pick: pickId,
    }),
    [customStart, startId, range, roundTrip, difficulty, tags],
  );

  // Used by the Spin button and Reroll. POI clicks use rotateTo() instead.
  const spin = useCallback(() => {
    if (spinning || wheelPois.length === 0) return;
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
    }

    const targetIdx = Math.floor(Math.random() * wheelPois.length);
    const layout = wheelLayout(wheelPois.length);
    const repToUse = Math.floor(Math.random() * layout.reps);
    const filledIdx = repToUse * wheelPois.length + targetIdx;
    const targetBase = filledIdx * layout.step;
    // turns must be an INTEGER — a fractional turn offsets the landing rotation
    // by that fraction of a circle, so the targeted slot doesn't actually land at theta=0.
    const turns = 4 + Math.floor(Math.random() * 3); // 4, 5, or 6 full rotations
    let to = -targetBase + turns * 360;
    const from = rotation;
    while (to < from + 360 * 3) to += 360;

    wheelDispatch({ type: "SPIN_START" });

    const startTime = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 4);

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / SPIN_DURATION_MS, 1);
      const v = from + (to - from) * ease(t);
      if (t < 1) {
        wheelDispatch({ type: "ROTATION_TICK", rotation: v });
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        animFrameRef.current = null;
        const picked = wheelPois[targetIdx];
        if (picked) {
          // Snap to the EXACT target rotation (no float drift) and commit
          // the pick atomically with spinning=false.
          wheelDispatch({ type: "SPIN_END", rotation: -targetBase, pickedId: picked.id });
          writeShareState(buildShareState(picked.id));
        } else {
          // Defensive: targetIdx should always be in range. If not, just
          // stop spinning and reset rotation.
          wheelDispatch({ type: "CLEAR_SELECTION" });
        }
      }
    };
    animFrameRef.current = requestAnimationFrame(tick);
  }, [spinning, wheelPois, rotation, buildShareState]);

  // Cleanup pending animation on unmount
  useEffect(
    () => () => {
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
    },
    [],
  );

  // Dynamic document.title for share-URL previews. When a pick is in
  // the URL hash, the tab title reads "Richmond Walk Roulette: <POI>"
  // — that's what link previews (iMessage, Discord, Slack) pick up as
  // the headline. Static OG tags in index.html cover og:image and
  // og:description. Per-pick OG image generation is a v2 concern
  // (Web Claude direction).
  useEffect(() => {
    const base = "Richmond Walk Roulette";
    document.title = destination ? `${base}: ${destination.name}` : base;
  }, [destination]);

  // Focus management around the wheel overlay (Web Claude a11y direction).
  // Detect spinning transitions:
  //   false → true: focus the in-overlay announcement so screen-reader
  //                 users hear "Spinning the wheel" and so keyboard
  //                 focus doesn't land on a button hidden by the overlay.
  //   true → false: return focus to the Spin Again button if it's
  //                 mounted (destination set, drawer peek shows it).
  // No focus trap — user can tab away from the overlay region freely
  // (Web Claude's "no focus trap during 1.2s auto-dismiss").
  useEffect(() => {
    const wasSpinning = wasSpinningRef.current;
    wasSpinningRef.current = spinning;
    // preventScroll keeps the browser from scrolling the page to bring
    // the focus target into view. The announce region is visually
    // hidden but still has a DOM position (top-left of the body), so
    // without this the page would jump on every spin start.
    if (!wasSpinning && spinning) {
      spinningAnnounceRef.current?.focus({ preventScroll: true });
    } else if (wasSpinning && !spinning) {
      spinAgainButtonRef.current?.focus({ preventScroll: true });
    }
  }, [spinning]);

  // If filters change mid-spin, cancel the in-flight animation. The spin's
  // closure captured the OLD wheelPois snapshot, so allowing it to complete
  // would land the wheel at a slot that may not exist in the new layout
  // (and the filter-invalidation effect would then clean up selectedId
  // half a frame later — user sees a broken landing flash). Cancel up
  // front. wheelPois identity is stable across animation frames thanks
  // to useMemo, so this only fires on actual filter changes.
  useEffect(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
      wheelDispatch({ type: "CLEAR_SELECTION" });
    }
  }, [wheelPois]);

  // User chose a custom start by clicking on the map (only fires while
  // pickingStart). If the click landed on a POI dot, RichmondMap forwards
  // the POI name so the start label reads as the place instead of a
  // generic coord pair.
  const onPickStart = useCallback((miles: MileXY, name?: string) => {
    filtersDispatch({
      type: "SET_CUSTOM_START",
      start: {
        id: "custom",
        name: name ?? `Custom (${miles.x.toFixed(1)}, ${miles.y.toFixed(1)})`,
        x: miles.x,
        y: miles.y,
      },
    });
    wheelDispatch({ type: "CLEAR_SELECTION" });
    setPickingStart(false);
  }, []);

  // Rotate the wheel by the SHORTEST angular path to land on a specific POI.
  // Unlike spin(), this skips the full 4–6 turns — it picks whichever rep of the
  // targeted POI is closest to the current indicator position and animates the
  // minimal delta to get there. A POI sitting one tick away just nudges one tick.
  const rotateTo = useCallback(
    (targetPoiId: string) => {
      if (spinning || wheelPois.length === 0) return;
      const idx = wheelPois.findIndex((p) => p.id === targetPoiId);
      if (idx < 0) return;
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }

      const layout = wheelLayout(wheelPois.length);

      // Among all reps of the target POI, find the one whose slot is closest
      // to the indicator at the current rotation.
      let bestDelta = Infinity;
      let bestFilledIdx = idx;
      for (let r = 0; r < layout.reps; r++) {
        const filledIdx = r * wheelPois.length + idx;
        const slotAngle = filledIdx * layout.step;
        // delta = rotation needed so this slot lands at theta=0, in (-180, 180]
        const raw = -slotAngle - rotation;
        const delta = (((raw % 360) + 540) % 360) - 180;
        if (Math.abs(delta) < Math.abs(bestDelta)) {
          bestDelta = delta;
          bestFilledIdx = filledIdx;
        }
      }

      const targetBase = bestFilledIdx * layout.step;
      const from = rotation;
      const to = from + bestDelta;
      // Duration scales with angular distance — snappy for nearby labels,
      // longer for the worst-case ~180° move. Clamped to 250–900ms.
      const duration = Math.max(250, Math.min(900, Math.abs(bestDelta) * 6));
      const ease = (t: number) => 1 - Math.pow(1 - t, 3);

      wheelDispatch({ type: "SPIN_START" });

      const startTime = performance.now();
      const tick = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / duration, 1);
        const v = from + (to - from) * ease(t);
        if (t < 1) {
          wheelDispatch({ type: "ROTATION_TICK", rotation: v });
          animFrameRef.current = requestAnimationFrame(tick);
        } else {
          animFrameRef.current = null;
          wheelDispatch({ type: "SPIN_END", rotation: -targetBase, pickedId: targetPoiId });
          writeShareState(buildShareState(targetPoiId));
        }
      };
      animFrameRef.current = requestAnimationFrame(tick);
    },
    [spinning, wheelPois, rotation, buildShareState],
  );

  // User clicked a POI dot on the map → rotate the wheel over to that POI.
  // If the POI isn't currently eligible (filtered out), do nothing.
  const onPoiClick = useCallback(
    (poiId: string) => {
      if (eligibleIds.has(poiId)) rotateTo(poiId);
    },
    [rotateTo, eligibleIds],
  );

  const togglePickingStart = useCallback(() => {
    setPickingStart((v) => !v);
  }, []);

  // Esc cancels picking mode
  useEffect(() => {
    if (!pickingStart) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPickingStart(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickingStart]);

  // Distance for stat readout
  const oneWay = destination ? distanceTo(startLocation, destination) : 0;
  const totalDist = roundTrip ? oneWay * 2 : oneWay;

  // Screen-reader announcement: fires whenever a pick is locked in (after a
  // spin or POI click), tells assistive tech what landed. Derived, no extra
  // state — the aria-live region reads its text from this memo.
  const announcement = useMemo(() => {
    if (spinning || !selectedId || !destination) return "";
    const trip = roundTrip ? "round trip" : "one way";
    return `Picked ${destination.name}. ${fmtMiles(totalDist)} ${trip}, about ${fmtMinutes(totalDist)} walk.`;
  }, [spinning, selectedId, destination, totalDist, roundTrip]);

  // Share
  const copyShare = useCallback(async () => {
    writeShareState(buildShareState(selectedId));
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast("Link copied");
    } catch {
      showToast("Couldn't copy");
    }
  }, [buildShareState, selectedId, showToast]);

  // Open in Google Maps walking directions
  const openInMaps = useCallback(() => {
    if (!destination) return;
    // Pass lat,lng instead of names. Names get geocoded by Maps and can
    // land at a similarly-named place; the POI dataset has exact
    // coordinates, so use those directly. Maps will still render the
    // resolved place name on its end.
    const startLL = toLngLat(startLocation);
    const destLL = toLngLat(destination);
    const origin = `${startLL.lat},${startLL.lng}`;
    const dest = `${destLL.lat},${destLL.lng}`;
    const win = window.open(
      `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=walking`,
      "_blank",
      "noopener,noreferrer",
    );
    // window.open returns null when a popup blocker rejects the call.
    // Without feedback the user just sees nothing happen.
    if (!win) showToast("Popup blocked");
  }, [destination, startLocation, showToast]);

  const reset = useCallback(() => {
    wheelDispatch({ type: "CLEAR_SELECTION" });
  }, []);

  const onStartChange = useCallback((id: string) => {
    // SET_START_ID reducer action already clears customStart atomically.
    filtersDispatch({ type: "SET_START_ID", id });
    wheelDispatch({ type: "CLEAR_SELECTION" });
    // Selecting a preset is an explicit start choice; cancel pick-on-map
    // mode if it's still active so the cursor and chip don't lie.
    setPickingStart(false);
  }, []);

  // Thin dispatch wrappers for the Controls component (it expects per-field setters).
  const onRangeChange = useCallback(
    (next: typeof range) => filtersDispatch({ type: "SET_RANGE", range: next }),
    [],
  );
  const onRoundTripChange = useCallback(
    (value: boolean) => filtersDispatch({ type: "SET_ROUND_TRIP", value }),
    [],
  );
  const onDifficultyChange = useCallback(
    (value: typeof difficulty) => filtersDispatch({ type: "SET_DIFFICULTY", value }),
    [],
  );
  const onTagsChange = useCallback(
    (next: typeof tags) => filtersDispatch({ type: "SET_TAGS", tags: next }),
    [],
  );

  // Empty-state "Clear filters" action: single reducer call resets
  // difficulty, tags, and range atomically (one render, one reducer
  // pass). Start location is preserved — it's an anchor, not a filter.
  const onClearFilters = useCallback(() => {
    filtersDispatch({ type: "CLEAR_FILTERS" });
  }, []);

  return (
    <div className="app">
      <Header weather={DEFAULT_WEATHER} onShare={copyShare} />

      {/* Desktop: top controls bar. Hidden at <900px by CSS — the same
          <Controls> tree is rendered again inside <MobileDrawer> at the
          bottom of the app. <Controls> is fully prop-driven so the two
          mounts share no internal state. */}
      <Controls
        starts={START_LOCATIONS}
        startId={startId}
        customStart={customStart}
        onStartChange={onStartChange}
        pickingStart={pickingStart}
        onTogglePickingStart={togglePickingStart}
        range={range}
        onRangeChange={onRangeChange}
        roundTrip={roundTrip}
        onRoundTripChange={onRoundTripChange}
        difficulty={difficulty}
        onDifficultyChange={onDifficultyChange}
        tags={tags}
        onTagsChange={onTagsChange}
      />

      <div className={"main" + (spinning ? " spinning" : "")}>
        <WheelPane
          wheelPois={wheelPois}
          totalPoiCount={POIS.length}
          rotation={rotation}
          selectedId={selectedId}
          spinning={spinning}
          onSpin={spin}
          onClearFilters={onClearFilters}
        />

        <div className="right-col">
          <MapPane
            pois={POIS}
            wheelPois={wheelPois}
            eligibleIds={eligibleIds}
            startLocation={startLocation}
            destination={destination}
            walkRange={range}
            roundTrip={roundTrip}
            walkingRoute={walkingRoute}
            pickingStart={pickingStart}
            onPickStart={onPickStart}
            onPoiClick={onPoiClick}
          />

          <ResultPane
            destination={destination}
            startLocation={startLocation}
            totalDist={totalDist}
            roundTrip={roundTrip}
            spinning={spinning}
            eligibleCount={wheelPois.length}
            onOpenInMaps={openInMaps}
            onReroll={spin}
            onClear={reset}
          />
        </div>
      </div>

      {/* Mobile-only bottom sheet. Renders a second copy of <Controls>
          so phone users can reach filters without scrolling past the
          map/wheel. Desktop CSS hides this entirely. */}
      <MobileDrawer
        label="Filters"
        peekContent={
          <div className="mobile-peek">
            {destination ? (
              <>
                <div
                  className="mobile-peek-result"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <span className="mobile-peek-name">{destination.name}</span>
                  <span className="mobile-peek-stat">
                    {fmtMiles(totalDist)}{" "}
                    {roundTrip ? "round trip" : "one way"}
                  </span>
                </div>
                <button
                  ref={spinAgainButtonRef}
                  type="button"
                  className="btn primary mobile-peek-spin"
                  onClick={spin}
                  disabled={spinning || wheelPois.length === 0}
                  aria-busy={spinning}
                  title="Spin the wheel again"
                >
                  {spinning ? "…" : "Spin Again"}
                </button>
              </>
            ) : (
              <>
                <span className="mobile-peek-hint">
                  {wheelPois.length === 0
                    ? "No matches — open Filters"
                    : "Tap Spin to pick a destination"}
                </span>
                <button
                  type="button"
                  className="btn primary mobile-peek-spin"
                  onClick={spin}
                  disabled={spinning || wheelPois.length === 0}
                  aria-busy={spinning}
                >
                  {spinning ? "…" : "Spin"}
                </button>
              </>
            )}
          </div>
        }
      >
        <Controls
          starts={START_LOCATIONS}
          startId={startId}
          customStart={customStart}
          onStartChange={onStartChange}
          pickingStart={pickingStart}
          onTogglePickingStart={togglePickingStart}
          range={range}
          onRangeChange={onRangeChange}
          roundTrip={roundTrip}
          onRoundTripChange={onRoundTripChange}
          difficulty={difficulty}
          onDifficultyChange={onDifficultyChange}
          tags={tags}
          onTagsChange={onTagsChange}
        />
      </MobileDrawer>

      {toast && <div className="toast">{toast}</div>}

      {/* Visually-hidden live region. Announces picks to screen readers
          once the spin animation completes. aria-atomic="true" makes
          assistive tech read the whole sentence, not just the diff. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {/* Wheel-spinning announcement region. Receives focus when a spin
          starts (Web Claude a11y direction) so keyboard users don't
          land on a hidden control and screen-reader users hear the
          state change immediately. tabindex=-1 makes it programmatically
          focusable but skipped in natural tab order — no focus trap. */}
      <div
        ref={spinningAnnounceRef}
        className="sr-only"
        tabIndex={-1}
        aria-live="assertive"
      >
        {spinning ? "Spinning the wheel" : ""}
      </div>
    </div>
  );
}
