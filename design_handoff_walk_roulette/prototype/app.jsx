// Richmond Walk Roulette — main app.

const { useState, useEffect, useMemo, useRef, useCallback } = React;

// Tweakable defaults — host parses this JSON block.
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accent": "#b6332a",
  "paper": "#faf7ee",
  "showNeighborhoods": true,
  "showRoute": true,
  "wheelDensity": "medium",
  "weather": "67\u00b0F \u00b7 partly cloudy \u00b7 great for walking"
}/*EDITMODE-END*/;

// ---------- helpers ----------

function fmtMiles(m) {
  return m.toFixed(1) + " mi";
}

function fmtMinutes(miles) {
  // 3 mph average walking pace
  const mins = Math.round((miles / 3) * 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}

function eligibility(start, range, roundTrip, difficulty, tags, pois) {
  const [minR, maxR] = range;
  const set = new Set();
  pois.forEach((p) => {
    const oneWay = window.distanceTo(start, p);
    const total = roundTrip ? oneWay * 2 : oneWay;
    if (total < minR || total > maxR) return;
    if (difficulty !== "any" && p.difficulty !== difficulty) return;
    if (tags.size > 0) {
      const hasAny = p.tags.some((t) => tags.has(t));
      if (!hasAny) return;
    }
    set.add(p.id);
  });
  return set;
}

// Read/write spin state to URL hash so links can be shared.
function readShareState() {
  try {
    const h = window.location.hash;
    if (!h.startsWith("#s=")) return null;
    return JSON.parse(decodeURIComponent(h.slice(3)));
  } catch (e) {
    return null;
  }
}

function writeShareState(state) {
  const enc = encodeURIComponent(JSON.stringify(state));
  history.replaceState(null, "", "#s=" + enc);
}

// ---------- subcomponents ----------

const RangeSlider = ({ range, onChange, min = 0, max = 8, step = 0.25 }) => {
  const [a, b] = range;
  const trackRef = useRef();

  return (
    <div className="range-row">
      <span style={{ minWidth: 36 }}>{a.toFixed(1)}</span>
      <div className="range-track" ref={trackRef}>
        <div className="rail" />
        <div
          className="filled"
          style={{
            left: ((a - min) / (max - min)) * 100 + "%",
            width: ((b - a) / (max - min)) * 100 + "%",
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={a}
          onChange={(e) => {
            const v = Math.min(parseFloat(e.target.value), b - step);
            onChange([v, b]);
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={b}
          onChange={(e) => {
            const v = Math.max(parseFloat(e.target.value), a + step);
            onChange([a, v]);
          }}
        />
      </div>
      <span style={{ minWidth: 36, textAlign: "right" }}>{b.toFixed(1)}</span>
    </div>
  );
};

const ChipGroup = ({ options, value, onChange, multi = false }) => (
  <div className="chips">
    {options.map((opt) => {
      const active = multi ? value.has(opt.value) : value === opt.value;
      return (
        <button
          key={opt.value}
          className={"chip" + (active ? " active" : "")}
          onClick={() => {
            if (multi) {
              const next = new Set(value);
              if (next.has(opt.value)) next.delete(opt.value);
              else next.add(opt.value);
              onChange(next);
            } else {
              onChange(opt.value);
            }
          }}
        >
          {opt.label}
        </button>
      );
    })}
  </div>
);

// ---------- App ----------

function App() {
  // --- tweaks state ---
  const [tweaks, setTweak] = window.useTweaks(TWEAK_DEFAULTS);

  // --- form state ---
  const [startId, setStartId] = useState("monroe");
  const [customStart, setCustomStart] = useState(null); // {name, x, y}
  const [range, setRange] = useState([2, 4]);
  const [roundTrip, setRoundTrip] = useState(true);
  const [difficulty, setDifficulty] = useState("any");
  const [timeOfDay, setTimeOfDay] = useState("any");
  const [tags, setTags] = useState(new Set());

  // --- wheel state ---
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const animRef = useRef();

  // --- toast ---
  const [toast, setToast] = useState(null);
  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 1800);
  };

  // load shared state
  useEffect(() => {
    const s = readShareState();
    if (s) {
      if (s.start) setStartId(s.start);
      if (s.custom) setCustomStart(s.custom);
      if (s.range) setRange(s.range);
      if (typeof s.rt === "boolean") setRoundTrip(s.rt);
      if (s.diff) setDifficulty(s.diff);
      if (s.tags) setTags(new Set(s.tags));
      if (s.pick) setSelectedId(s.pick);
    }
  }, []);

  const startLocation = useMemo(() => {
    if (customStart) return customStart;
    return window.START_LOCATIONS.find((s) => s.id === startId) || window.START_LOCATIONS[0];
  }, [startId, customStart]);

  // Eligible POIs
  const eligibleIds = useMemo(
    () => eligibility(startLocation, range, roundTrip, difficulty, tags, window.POIS),
    [startLocation, range, roundTrip, difficulty, tags]
  );

  // Wheel population: alphabetical, only eligible
  const wheelPois = useMemo(() => {
    return window.POIS
      .filter((p) => eligibleIds.has(p.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [eligibleIds]);

  // Currently-displayed destination derives from selectedId (post-spin)
  // or the entry closest to the indicator at the current rotation.
  const destination = useMemo(() => {
    if (selectedId) return window.POIS.find((p) => p.id === selectedId) || null;
    if (spinning || !wheelPois.length) return null;
    const layout = window.wheelLayout(wheelPois.length);
    let best = 0;
    let bestAbs = Infinity;
    for (let i = 0; i < layout.totalSlots; i++) {
      let t = i * layout.step + rotation;
      while (t > 180) t -= 360;
      while (t < -180) t += 360;
      if (Math.abs(t) < bestAbs) {
        bestAbs = Math.abs(t);
        best = i;
      }
    }
    return wheelPois[best % wheelPois.length] || null;
  }, [wheelPois, rotation, selectedId, spinning]);

  // Always reset selected pick when filters change in a way that excludes it
  useEffect(() => {
    if (selectedId && !eligibleIds.has(selectedId)) {
      setSelectedId(null);
      setRotation(0);
    }
  }, [eligibleIds, selectedId]);

  // SPIN
  const spin = useCallback(() => {
    if (spinning || wheelPois.length === 0) return;
    cancelAnimationFrame(animRef.current);

    // Pick a random target POI, then a random copy on the wheel.
    const targetIdx = Math.floor(Math.random() * wheelPois.length);
    const layout = window.wheelLayout(wheelPois.length);
    const repToUse = Math.floor(Math.random() * layout.reps);
    const filledIdx = repToUse * wheelPois.length + targetIdx;
    const targetBase = filledIdx * layout.step;
    const turns = 4 + Math.random() * 2;
    const finalRotation = -targetBase + turns * 360;

    setSpinning(true);
    setSelectedId(null);

    const startTime = performance.now();
    const from = rotation;
    let to = finalRotation;
    while (to < from + 360 * 3) to += 360;

    const duration = 4200;
    const ease = (t) => 1 - Math.pow(1 - t, 4);

    const tick = (now) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const v = from + (to - from) * ease(t);
      setRotation(v);
      if (t < 1) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        setSpinning(false);
        const picked = wheelPois[targetIdx];
        setSelectedId(picked.id);
        // share state
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
    };
    animRef.current = requestAnimationFrame(tick);
  }, [spinning, wheelPois, rotation, startId, customStart, range, roundTrip, difficulty, tags]);

  useEffect(() => () => cancelAnimationFrame(animRef.current), []);

  // Map click -> custom start
  const onMapClick = useCallback((miles) => {
    const cs = {
      id: "custom",
      name: `Custom (${miles.x.toFixed(1)}, ${miles.y.toFixed(1)})`,
      x: miles.x,
      y: miles.y,
    };
    setCustomStart(cs);
    setSelectedId(null);
    setRotation(0);
  }, []);

  // Distance to selected destination
  const oneWay = destination ? window.distanceTo(startLocation, destination) : 0;
  const totalDist = roundTrip ? oneWay * 2 : oneWay;

  // share link
  const copyShare = async () => {
    const state = {
      start: customStart ? null : startId,
      custom: customStart,
      range,
      rt: roundTrip,
      diff: difficulty,
      tags: Array.from(tags),
      pick: selectedId,
    };
    writeShareState(state);
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast("Link copied");
    } catch (e) {
      showToast("Couldn't copy");
    }
  };

  const openInMaps = () => {
    if (!destination) return;
    // Use Google Maps directions, walking, with destination name + "Richmond VA"
    const dest = encodeURIComponent(destination.name + " Richmond VA");
    const origin = encodeURIComponent(startLocation.name + " Richmond VA");
    window.open(
      `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=walking`,
      "_blank"
    );
  };

  const reset = () => {
    setSelectedId(null);
    setRotation(0);
  };

  // ---------- render ----------

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="brand">
          <h1>Richmond Walk Roulette</h1>
          <span className="tag">v1 · downtown · 4-mile radius</span>
        </div>
        <div className="actions">
          <span className="tag" style={{ marginRight: 8 }}>{tweaks.weather}</span>
          <button className="btn ghost" onClick={copyShare}>Share</button>
        </div>
      </header>

      {/* Controls */}
      <div className="controls">
        <div className="control">
          <span className="label">Start</span>
          <select
            value={customStart ? "__custom" : startId}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "__custom") return;
              setCustomStart(null);
              setStartId(v);
              setSelectedId(null);
              setRotation(0);
            }}
          >
            {window.START_LOCATIONS.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
            {customStart && <option value="__custom">{customStart.name}</option>}
          </select>
        </div>

        <div className="control">
          <span className="label">Distance ({roundTrip ? "round-trip" : "one-way"}, miles)</span>
          <RangeSlider range={range} onChange={setRange} min={0} max={8} step={0.25} />
        </div>

        <div className="control" style={{ alignItems: "flex-start" }}>
          <span className="label">Round trip</span>
          <label className="toggle" style={{ marginTop: 4 }}>
            <input
              type="checkbox"
              checked={roundTrip}
              onChange={(e) => setRoundTrip(e.target.checked)}
            />
            <span className="switch"></span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
              {roundTrip ? "ON" : "OFF"}
            </span>
          </label>
        </div>

        <div className="control">
          <span className="label">Difficulty</span>
          <ChipGroup
            options={[
              { label: "Any", value: "any" },
              { label: "Flat", value: "flat" },
              { label: "Hilly", value: "hilly" },
            ]}
            value={difficulty}
            onChange={setDifficulty}
          />
        </div>

        <div className="control">
          <span className="label">Vibe</span>
          <ChipGroup
            options={[
              { label: "River", value: "river" },
              { label: "Park", value: "park" },
              { label: "Museum", value: "museum" },
              { label: "History", value: "history" },
              { label: "Food", value: "food" },
              { label: "Scenic", value: "scenic" },
            ]}
            value={tags}
            onChange={setTags}
            multi
          />
        </div>
      </div>

      {/* Main */}
      <div className={"main" + (spinning ? " spinning" : "")}>
        {/* Wheel */}
        <div className="wheel-pane">
          <span className="pane-label">Destinations</span>
          <span className="count">
            {wheelPois.length} of {window.POIS.length} fit
          </span>

          {wheelPois.length === 0 ? (
            <div className="empty-wheel">
              <div className="big">No matches</div>
              <div className="small">widen the range or clear filters</div>
            </div>
          ) : (
            <window.Wheel
              pois={wheelPois}
              rotation={rotation}
              pickedId={selectedId}
              spinning={spinning}
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

        {/* Right column */}
        <div className="right-col">
          <div className="map-pane">
            <span className="pane-label">Map</span>
            <div className="map-meta">
              <span>{startLocation.name.toUpperCase()}</span>
              {destination && <span>→ {destination.name.toUpperCase()}</span>}
            </div>
            <window.RichmondMap
              pois={window.POIS}
              eligibleIds={eligibleIds}
              startLocation={startLocation}
              destination={destination}
              walkRange={range}
              roundTrip={roundTrip}
              onMapClick={onMapClick}
              showRoute={tweaks.showRoute && !!destination}
              showNeighborhoods={tweaks.showNeighborhoods}
            />
          </div>

          {/* Result */}
          {destination && !spinning ? (
            <div className="result-pane">
              <div>
                <h2 className="result-name">{destination.name}</h2>
                <p className="result-blurb">{destination.blurb}</p>
                <div className="result-stats">
                  <div className="stat">
                    <span className="stat-label">Distance</span>
                    <span className="stat-value">
                      {fmtMiles(totalDist)} {roundTrip ? "round trip" : "one way"}
                    </span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Walk time</span>
                    <span className="stat-value">{fmtMinutes(totalDist)}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Terrain</span>
                    <span className="stat-value" style={{ textTransform: "capitalize" }}>
                      {destination.difficulty}
                    </span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">From</span>
                    <span className="stat-value">{startLocation.name}</span>
                  </div>
                </div>
              </div>
              <div className="result-actions">
                <button className="btn" onClick={openInMaps}>Open in Maps</button>
                <button className="btn ghost" onClick={spin} disabled={spinning}>Reroll</button>
                <button className="btn ghost" onClick={reset}>Clear</button>
              </div>
            </div>
          ) : (
            <div className="result-pane empty">
              {spinning
                ? "Spinning the wheel…"
                : wheelPois.length === 0
                ? "Adjust your filters to populate the wheel"
                : `Hit SPIN to pick from ${wheelPois.length} destination${wheelPois.length === 1 ? "" : "s"}`}
            </div>
          )}
        </div>
      </div>

      {/* Tweaks panel */}
      <window.TweaksPanel title="Tweaks">
        <window.TweakSection title="Display">
          <window.TweakToggle
            label="Show route line"
            value={tweaks.showRoute}
            onChange={(v) => setTweak("showRoute", v)}
          />
          <window.TweakToggle
            label="Neighborhood labels"
            value={tweaks.showNeighborhoods}
            onChange={(v) => setTweak("showNeighborhoods", v)}
          />
        </window.TweakSection>
        <window.TweakSection title="Theme">
          <window.TweakColor
            label="Accent"
            value={tweaks.accent}
            options={["#b6332a", "#2a4d56", "#5b6b3a", "#8a5a2c", "#1c1c1a"]}
            onChange={(v) => {
              setTweak("accent", v);
              document.documentElement.style.setProperty("--highlight", v);
            }}
          />
          <window.TweakColor
            label="Paper"
            value={tweaks.paper}
            options={["#faf7ee", "#f1ebdc", "#ffffff", "#e9ead8"]}
            onChange={(v) => {
              setTweak("paper", v);
              document.documentElement.style.setProperty("--paper", v);
            }}
          />
        </window.TweakSection>
        <window.TweakSection title="Demo">
          <window.TweakText
            label="Weather pill"
            value={tweaks.weather}
            onChange={(v) => setTweak("weather", v)}
          />
        </window.TweakSection>
      </window.TweaksPanel>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
