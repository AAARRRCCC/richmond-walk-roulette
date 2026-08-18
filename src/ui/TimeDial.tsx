import { useId } from "react";
import { MAX_MINUTES } from "../lib/isochrone";

export type TimeDialProps = {
  minutes: number;
  minimum: number;
  /** How far one notch moves the budget. Doubled for round trips. */
  step: number;
  outboundMinutes: number;
  roundTrip: boolean;
  /** Whether this dial position's contours are already cached. */
  isWarm: (minutes: number) => boolean;
  /** 0 to 1 across the warm-up, for the progress hairline under the track. */
  warmedFraction: number;
  onChange: (minutes: number) => void;
  /** Fires when a drag or keypress ends, so the map can re-frame exactly once. */
  onCommit: () => void;
};

export function TimeDial(props: TimeDialProps) {
  const captionId = useId();
  const span = MAX_MINUTES - props.minimum;
  const ticks = Array.from(
    { length: Math.floor(span / props.step) + 1 },
    (_, i) => props.minimum + i * props.step,
  );
  const warming = props.warmedFraction < 1;

  return (
    <div className="dial">
      <div className="dial-head">
        <span className="dial-value">{props.minutes}</span>
        <span className="dial-unit">min</span>
        <span className="dial-caption" id={captionId}>
          {props.roundTrip
            ? `${props.outboundMinutes} out, ${props.outboundMinutes} back`
            : "one way, on foot"}
        </span>
      </div>

      <div className="dial-track">
        <div className="dial-marks" aria-hidden="true">
          {ticks.map((tick) => (
            <span
              key={tick}
              className={tickClass(tick, props.minutes, props.isWarm(tick))}
              style={{ left: `${((tick - props.minimum) / span) * 100}%` }}
            />
          ))}
        </div>
        <input
          className="dial-input"
          type="range"
          min={props.minimum}
          max={MAX_MINUTES}
          step={props.step}
          value={props.minutes}
          aria-label="Walking time budget"
          aria-describedby={captionId}
          aria-valuetext={`${props.minutes} minutes`}
          onChange={(event) => props.onChange(Number(event.target.value))}
          // React maps onChange to `input`, which fires continuously during a
          // drag. These are the commit edges: the map re-frames on them so the
          // camera is not restarted on every pixel of the drag.
          onPointerUp={props.onCommit}
          onPointerCancel={props.onCommit}
          onKeyUp={props.onCommit}
          onBlur={props.onCommit}
        />
      </div>

      <div className="dial-scale" aria-hidden="true">
        <span>{props.minimum}</span>
        {warming ? (
          <span className="dial-warming">
            loading reach {Math.round(props.warmedFraction * 100)}%
          </span>
        ) : null}
        <span>{MAX_MINUTES}</span>
      </div>
    </div>
  );
}

/**
 * A tick is dim until its contours are cached. That is honest about which
 * positions respond instantly, and it turns the warm-up into something the
 * reader can watch fill in rather than a spinner over the whole panel.
 */
function tickClass(tick: number, minutes: number, warm: boolean): string {
  const weight = tick % 10 === 0 ? " is-major" : tick % 5 === 0 ? " is-mid" : "";
  return `dial-tick${weight}${tick <= minutes ? " is-reached" : ""}${warm ? " is-warm" : ""}`;
}
