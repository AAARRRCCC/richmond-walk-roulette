import { useId, useRef, type CSSProperties } from "react";
import { playDetent } from "../lib/sound";
import { MAX_MINUTES } from "../lib/isochrone";

export type TimeDialProps = {
  minutes: number;
  /** The range's lower end. Equal to `minimum` means no lower bound. */
  floorMinutes: number;
  minimum: number;
  /** Highest accepted budget. The track still spans to MAX_MINUTES; the clamp is drawn as a dead zone. */
  maximum: number;
  /** "Daylight limit 62 min · dusk 8:21 pm", when something is clamping. */
  capNote?: string | undefined;
  /** How far one notch moves the budget. Doubled for round trips. */
  step: number;
  outboundMinutes: number;
  roundTrip: boolean;
  /** Whether this dial position's contours are already cached. */
  isWarm: (minutes: number) => boolean;
  /** False when nothing is being measured, so no progress is promised. */
  warming: boolean;
  /** 0 to 1 across the warm-up. */
  warmedFraction: number;
  disabled?: boolean;
  onChange: (minutes: number) => void;
  onFloorChange: (minutes: number) => void;
  /** Fires when a drag or keypress ends, so the map re-frames once. */
  onCommit: () => void;
  /** True while a hand is on the control. App freezes the clock on it so the cap cannot move mid-gesture. */
  onScrub: (active: boolean) => void;
};

export function TimeDial(props: TimeDialProps) {
  const captionId = useId();
  const span = MAX_MINUTES - props.minimum;
  const ticks = Array.from(
    { length: Math.floor(span / props.step) + 1 },
    (_, i) => props.minimum + i * props.step,
  );
  const warming = props.warming && props.warmedFraction < 1;
  const capped = props.maximum < MAX_MINUTES;
  const pct = (minutes: number): number => ((minutes - props.minimum) / span) * 100;

  // SAFETY: CSSProperties has no index signature for custom properties; the value is built here from a number.
  const trackStyle = { "--cap-percent": `${pct(props.maximum)}%` } as CSSProperties;

  // A commit must mean "the value moved": four events end a gesture and a
  // blur after panning the map by hand must not fly the camera back.
  const committed = useRef(`${props.floorMinutes}-${props.minutes}`);
  const commit = () => {
    // Always release the scrub, even when nothing changed.
    props.onScrub(false);
    const now = `${props.floorMinutes}-${props.minutes}`;
    if (committed.current === now) return;
    committed.current = now;
    props.onCommit();
  };
  const grab = () => props.onScrub(true);

  const hasFloor = props.floorMinutes > props.minimum;

  return (
    <div className="dial">
      <div className="dial-head">
        <span className="dial-value">
          {hasFloor ? `${props.floorMinutes}-${props.minutes}` : props.minutes}
        </span>
        <span className="dial-unit">min</span>
        <span className="dial-caption" id={captionId}>
          {props.roundTrip
            ? `${props.outboundMinutes} out, ${props.outboundMinutes} back`
            : "one way, on foot"}
        </span>
      </div>

      <div
        className={`dial-track${hasFloor ? " has-floor" : ""}${capped ? " is-capped" : ""}`}
        style={trackStyle}
      >
        <div className="dial-marks" aria-hidden="true">
          {ticks.map((tick) => (
            <span
              key={tick}
              className={tickClass(tick, props.floorMinutes, props.minutes, props.isWarm(tick))}
              style={{ left: `${pct(tick)}%` }}
            />
          ))}
        </div>

        <input
          className="dial-input"
          type="range"
          min={props.minimum}
          max={props.maximum}
          step={props.step}
          value={props.minutes}
          disabled={props.disabled === true}
          aria-label="Walking time budget"
          aria-describedby={captionId}
          aria-valuetext={
            (props.roundTrip
              ? `${props.minutes} minutes, ${props.outboundMinutes} out and ${props.outboundMinutes} back`
              : `${props.minutes} minutes, one way`) + (capped ? ", limited by daylight" : "")
          }
          onChange={(event) => {
            const next = Number(event.target.value);
            // One detent per step actually moved, not per input event.
            if (next !== props.minutes) playDetent(next, props.minimum);
            props.onChange(next);
          }}
          onPointerDown={grab}
          onKeyDown={grab}
          onPointerUp={commit}
          onPointerCancel={commit}
          onKeyUp={commit}
          onBlur={commit}
        />

        {/* Second native range on the same track: keeps its own keyboard behaviour and focus ring. */}
        <input
          className="dial-input is-floor"
          type="range"
          min={props.minimum}
          max={props.maximum}
          step={props.step}
          value={props.floorMinutes}
          disabled={props.disabled === true}
          aria-label="Shortest walk worth taking"
          aria-valuetext={
            hasFloor
              ? `from ${props.floorMinutes} minutes`
              : "no lower limit, everything inside the budget"
          }
          onChange={(event) => {
            const next = Number(event.target.value);
            if (next !== props.floorMinutes) playDetent(next, props.minimum);
            props.onFloorChange(next);
          }}
          onPointerDown={grab}
          onKeyDown={grab}
          onPointerUp={commit}
          onPointerCancel={commit}
          onKeyUp={commit}
          onBlur={commit}
        />
      </div>

      {props.capNote !== undefined && <p className="dial-cap-note">{props.capNote}</p>}

      <div className="dial-scale" aria-hidden="true">
        <span>{props.minimum}</span>
        {warming ? (
          <span className="dial-warming">
            loading reach {Math.round(props.warmedFraction * 100)}%
          </span>
        ) : null}
        <span>{MAX_MINUTES}</span>
      </div>

      {/* Announced in quarters: the fraction moves ~96 times per warm-up. */}
      <span className="sr-only" role="status">
        {warming
          ? `Loading reachable area, ${Math.round(props.warmedFraction * 4) * 25} percent`
          : props.warming
            ? "Reachable area ready"
            : ""}
      </span>
    </div>
  );
}

function tickClass(tick: number, floorMinutes: number, minutes: number, warm: boolean): string {
  const weight = tick % 10 === 0 ? " is-major" : tick % 5 === 0 ? " is-mid" : "";
  const reached = tick <= minutes && tick >= floorMinutes ? " is-reached" : "";
  return `dial-tick${weight}${reached}${warm ? " is-warm" : ""}`;
}
