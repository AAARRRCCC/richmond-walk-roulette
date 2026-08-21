import { useEffect, useReducer, useState } from "react";
import {
  TUNING_RANGE,
  onTuningChange,
  resetTuning,
  setTuning,
  tuning,
  type Tuning,
} from "../app/tuning";
import { playLanding, playPress, playTap } from "../lib/sound";
import { isJsonObject, isString, parseJson } from "../lib/json";

/**
 * Dev-only feel controls: the reel's timing and the cue level, adjustable
 * while the thing they change is running. Mounted by App behind
 * `import.meta.env.DEV`, so it is stripped from a production build along with
 * this whole module.
 *
 * Toggled with the `~` key, and starts closed - it exists to be reached for,
 * not to sit over the map.
 */

/**
 * Everything in Tuning a slider can drive. Derived from the value types rather
 * than by listing the switches, so adding a boolean setting cannot leave a
 * checkbox being rendered as a range.
 */
type NumericTuningKey = {
  [K in keyof Tuning]: Tuning[K] extends number ? K : never;
}[keyof Tuning];

const SLIDERS: { key: NumericTuningKey; label: string; hint: string; unit: string }[] = [
  { key: "spinDurationMs", label: "Spin length", hint: "how long the reel turns", unit: "ms" },
  { key: "spinFirstFlipMs", label: "Start interval", hint: "gap between the first flips", unit: "ms" },
  { key: "spinLastFlipMs", label: "End interval", hint: "gap between the last flips", unit: "ms" },
  { key: "spinEaseExponent", label: "Slowdown", hint: "below 1 stays fast, then drops", unit: "" },
  { key: "spinSettleMs", label: "Settle", hint: "how long it rests on the winner", unit: "ms" },
  { key: "spinMaxHoldMs", label: "Route grace", hint: "extra turning while a route loads", unit: "ms" },
  { key: "soundVolume", label: "Cue level", hint: "master volume for every sound", unit: "" },
];

/**
 * Promotes what is on screen from "what this browser does" to "what the app
 * does", by writing these numbers into `TUNING_DEFAULTS` in the source.
 *
 * The panel saves to localStorage, and a stored value beats a default for
 * good - right while dialling something in, wrong once it is dialled in. The
 * alternative was reading the numbers off the panel and retyping them, which
 * is how a setting ends up one digit away from the one that was chosen.
 *
 * The dev server does the writing; a page cannot touch the filesystem. Vite
 * reloads the module on the change, so `Reset` immediately afterwards returns
 * to the values just baked rather than the old ones.
 */
async function bake(report: (message: string) => void): Promise<void> {
  report("Baking...");
  try {
    const response = await fetch("/api/dev/bake-tuning", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(tuning),
    });
    if (response.ok) {
      report("Baked into src/app/tuning.ts. Reset now returns to these.");
      return;
    }
    const result = parseJson(await response.text());
    const detail = isJsonObject(result) && isString(result["error"]) ? result["error"] : "refused";
    report(`Not baked: ${detail}`);
  } catch {
    report("Not baked: the dev server did not answer.");
  }
}

export function TuningPanel() {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const [baked, setBaked] = useState<string | null>(null);
  const [open, toggle] = useReducer((v: boolean) => !v, false);

  useEffect(() => onTuningChange(redraw), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      const typing = target instanceof HTMLElement && target.isContentEditable;
      if (event.key === "`" || (event.key === "~" && !typing)) toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) {
    return (
      <button type="button" className="tuner-tab" onClick={toggle} title="Feel controls (~)">
        Tune
      </button>
    );
  }

  return (
    <aside className="tuner" aria-label="Feel controls">
      <header className="tuner-head">
        <span className="field-label">Feel</span>
        <button type="button" className="icon-button" onClick={toggle} aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" strokeLinecap="round" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </header>

      <label className="switch tuner-switch">
        <input
          type="checkbox"
          checked={tuning.soundEnabled}
          onChange={() => {
            const next = !tuning.soundEnabled;
            setTuning("soundEnabled", next);
            if (next) playTap(true);
          }}
        />
        <span className="switch-track"><span className="switch-thumb" /></span>
        <span className="switch-text">
          <span className="switch-label">Sound</span>
          <span className="switch-hint">every cue at once</span>
        </span>
      </label>

      <label className="switch tuner-switch">
        <input
          type="checkbox"
          checked={tuning.spinCircularOrder}
          onChange={() => {
            setTuning("spinCircularOrder", !tuning.spinCircularOrder);
            playTap(tuning.spinCircularOrder);
          }}
        />
        <span className="switch-track"><span className="switch-thumb" /></span>
        <span className="switch-text">
          <span className="switch-label">Sweep order</span>
          <span className="switch-hint">reel travels round the map, not at random</span>
        </span>
      </label>

      {SLIDERS.map(({ key, label, hint, unit }) => {
        const range = TUNING_RANGE[key];
        const value = tuning[key];
        return (
          <div className="tuner-row" key={key}>
            <div className="tuner-label">
              <span>{label}</span>
              <span className="tuner-value">
                {Number.isInteger(value) ? value : value.toFixed(1)}
                {unit}
              </span>
            </div>
            <input
              type="range"
              min={range.min}
              max={range.max}
              step={range.step}
              value={value}
              aria-label={label}
              onChange={(event) => setTuning(key, Number(event.target.value))}
            />
            <span className="tuner-hint">{hint}</span>
          </div>
        );
      })}

      <div className="tuner-actions">
        <button type="button" className="button" onClick={() => { playPress(); playLanding(); }}>
          Hear landing
        </button>
        <button type="button" className="button" onClick={resetTuning}>
          Reset
        </button>
      </div>
      <div className="tuner-actions">
        <button type="button" className="button is-bake" onClick={() => void bake(setBaked)}>
          Bake as defaults
        </button>
      </div>
      <p className="tuner-note">
        {baked ??
          "Dev only. Saved in this browser until baked, which writes these numbers into src/app/tuning.ts."}
      </p>
    </aside>
  );
}
