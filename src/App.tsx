import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { POIS, START_LOCATIONS, type Difficulty, type POI, type StartLocation, type Vibe } from "./data/pois";
import { distanceTo, eligiblePoiIds, findStart, toLngLat, type MileXY, type Range } from "./lib/geo";
import { wheelLayout, normalizeAngle } from "./lib/wheel-layout";
import { readShareState, writeShareState } from "./lib/url-state";
import { fetchWalkingRoute, type WalkingRoute } from "./lib/route";
import { Header } from "./components/Header";
import { Controls } from "./components/Controls";
import { Wheel } from "./components/Wheel";
import { RichmondMap } from "./components/RichmondMap";
import { ResultPane } from "./components/ResultPane";

const DEFAULT_WEATHER = "Get out — the air is doing nothing dramatic";
const SPIN_DURATION_MS = 4200;

export default function App() {
  const [startId, setStartId] = useState<string>("monroe");
  const [customStart, setCustomStart] = useState<StartLocation | null>(null);
  const [range, setRange] = useState<Range>([2, 4]);
  const [roundTrip, setRoundTrip] = useState(true);
  const [difficulty, setDifficulty] = useState<"any" | Difficulty>("any");
  const [tags, setTags] = useState<Set<Vibe>>(new Set<Vibe>());

  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const [pickingStart, setPickingStart] = useState(false);
  const [walkingRoute, setWalkingRoute] = useState<WalkingRoute | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  }, []);

  // Restore state from URL hash on mount
  useEffect(() => {
    const s = readShareState();
    if (!s) return;
    if (s.start) setStartId(s.start);
    if (s.custom) setCustomStart(s.custom);
    if (s.range) setRange(s.range);
    if (typeof s.rt === "boolean") setRoundTrip(s.rt);
    if (s.diff) setDifficulty(s.diff);
    if (s.tags) setTags(new Set<Vibe>(s.tags as Vibe[]));
    if (s.pick) setSelectedId(s.pick);
  }, []);

  const startLocation = useMemo<StartLocation>(
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

  // Resolve the destination shown in the result pane:
  // - if a pick is locked in (post-spin), use it
  // - else if not spinning, use the entry currently closest to the indicator
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
      setSelectedId(null);
      setRotation(0);
    }
  }, [eligibleIds, selectedId]);

  // Fetch a real walking route from Google Routes API when a destination is picked
  useEffect(() => {
    if (!destination) {
      setWalkingRoute(null);
      return;
    }
    let cancelled = false;
    fetchWalkingRoute(toLngLat(startLocation), toLngLat(destination)).then(
      (route) => {
        if (!cancelled) setWalkingRoute(route);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [destination, startLocation]);

  // Full roulette spin: 4–6 turns, random destination, ~4.2s deceleration.
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

    setSpinning(true);
    setSelectedId(null);

    const startTime = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 4);

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / SPIN_DURATION_MS, 1);
      const v = from + (to - from) * ease(t);
      if (t < 1) {
        setRotation(v);
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        animFrameRef.current = null;
        // Snap to the EXACT target rotation. The eased value is correct math-wise,
        // but explicit snapping eliminates any accumulated float drift across many
        // spins and guarantees the slot's center sits dead-center on the indicator.
        setRotation(-targetBase);
        setSpinning(false);
        const picked = wheelPois[targetIdx];
        if (picked) {
          setSelectedId(picked.id);
          writeShareState({
            start: customStart ? null : startId,
            custom: customStart,
            range,
            rt: roundTrip,
            diff: difficulty,
            tags: Array.from(tags),
            pick: picked.id,
          });
        }
      }
    };
    animFrameRef.current = requestAnimationFrame(tick);
  }, [spinning, wheelPois, rotation, customStart, startId, range, roundTrip, difficulty, tags]);

  // Cleanup pending animation on unmount
  useEffect(
    () => () => {
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
    },
    [],
  );

  // User chose a custom start by clicking on the map (only fires while pickingStart)
  const onPickStart = useCallback((miles: MileXY) => {
    setCustomStart({
      id: "custom",
      name: `Custom (${miles.x.toFixed(1)}, ${miles.y.toFixed(1)})`,
      x: miles.x,
      y: miles.y,
    });
    setSelectedId(null);
    setRotation(0);
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

      setSpinning(true);
      setSelectedId(null);

      const startTime = performance.now();
      const tick = (now: number) => {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / duration, 1);
        const v = from + (to - from) * ease(t);
        if (t < 1) {
          setRotation(v);
          animFrameRef.current = requestAnimationFrame(tick);
        } else {
          animFrameRef.current = null;
          setRotation(-targetBase);
          setSpinning(false);
          setSelectedId(targetPoiId);
          writeShareState({
            start: customStart ? null : startId,
            custom: customStart,
            range,
            rt: roundTrip,
            diff: difficulty,
            tags: Array.from(tags),
            pick: targetPoiId,
          });
        }
      };
      animFrameRef.current = requestAnimationFrame(tick);
    },
    [spinning, wheelPois, rotation, customStart, startId, range, roundTrip, difficulty, tags],
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

  // Share
  const copyShare = useCallback(async () => {
    writeShareState({
      start: customStart ? null : startId,
      custom: customStart,
      range,
      rt: roundTrip,
      diff: difficulty,
      tags: Array.from(tags),
      pick: selectedId,
    });
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast("Link copied");
    } catch {
      showToast("Couldn't copy");
    }
  }, [customStart, startId, range, roundTrip, difficulty, tags, selectedId, showToast]);

  // Open in Google Maps walking directions
  const openInMaps = useCallback(() => {
    if (!destination) return;
    const origin = encodeURIComponent(`${startLocation.name} Richmond VA`);
    const dest = encodeURIComponent(`${destination.name} Richmond VA`);
    window.open(
      `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=walking`,
      "_blank",
      "noopener,noreferrer",
    );
  }, [destination, startLocation.name]);

  const reset = useCallback(() => {
    setSelectedId(null);
    setRotation(0);
  }, []);

  const onStartChange = useCallback((id: string) => {
    setCustomStart(null);
    setStartId(id);
    setSelectedId(null);
    setRotation(0);
  }, []);

  return (
    <div className="app">
      <Header weather={DEFAULT_WEATHER} onShare={copyShare} />

      <Controls
        starts={START_LOCATIONS}
        startId={startId}
        customStart={customStart}
        onStartChange={onStartChange}
        pickingStart={pickingStart}
        onTogglePickingStart={togglePickingStart}
        range={range}
        onRangeChange={setRange}
        roundTrip={roundTrip}
        onRoundTripChange={setRoundTrip}
        difficulty={difficulty}
        onDifficultyChange={setDifficulty}
        tags={tags}
        onTagsChange={setTags}
      />

      <div className={"main" + (spinning ? " spinning" : "")}>
        <div className="wheel-pane">
          <span className="pane-label">Destinations</span>
          <span className="pane-meta">
            <span>
              {wheelPois.length} of {POIS.length} fit
            </span>
          </span>

          {wheelPois.length === 0 ? (
            <div className="empty-wheel">
              <div className="big">No matches</div>
              <div className="small">widen the range or clear filters</div>
            </div>
          ) : (
            <Wheel
              pois={wheelPois}
              rotation={rotation}
              pickedId={selectedId}
            />
          )}

          <div className="spin-btn-wrap">
            <button
              className="btn primary"
              onClick={spin}
              disabled={spinning || wheelPois.length === 0}
            >
              {spinning ? "Spinning…" : selectedId ? "Spin Again" : "Spin"}
            </button>
          </div>
        </div>

        <div className="right-col">
          <div className="map-pane">
            <span className="pane-label">Map</span>
            <span className="pane-meta">
              <span>{startLocation.name.toUpperCase()}</span>
              {destination && <span>→ {destination.name.toUpperCase()}</span>}
            </span>
            <RichmondMap
              pois={POIS}
              eligibleIds={eligibleIds}
              startLocation={startLocation}
              destination={destination}
              walkRange={range}
              roundTrip={roundTrip}
              showRoute={!!destination}
              walkingRoute={walkingRoute}
              pickingStart={pickingStart}
              onPickStart={onPickStart}
              onPoiClick={onPoiClick}
            />
          </div>

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

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
