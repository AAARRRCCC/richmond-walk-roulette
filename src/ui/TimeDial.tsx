import { useId, useRef, type CSSProperties } from "react";
import { playDetent } from "../lib/sound";
import { MAX_MINUTES } from "../lib/isochrone";

export type TimeDialProps = {
  minutes: number;
  /**
   * The range's lower end, in the same units as `minutes`. Equal to `minimum`
   * means no lower bound: the reach is a disc rather than a band.
   */
  floorMinutes: number;
  minimum: number;
  /**
   * The highest budget the two inputs will accept. The *track* still spans
   * `minimum..MAX_MINUTES` on purpose: the clamp is drawn as a dead zone rather
   * than as a shorter slider, so a reader can see how much walk the light is
   * costing them.
   */
  maximum: number;
  /** "Daylight limit 62 min · dusk 8:21 pm", when something is clamping. */
  capNote?: string | undefined;
  /** How far one notch moves the budget. Doubled for round trips. */
  step: number;
  outboundMinutes: number;
  roundTrip: boolean;
  /** Whether this dial position's contours are already cached. */
  isWarm: (minutes: number) => boolean;
  /**
   * False when nothing is being measured and nothing is going to be.
   *
   * The invite state: the reader has not chosen a start, so no ladder is
   * warming, and a counter reading "loading reach 0%" would promise a
   * measurement that is not coming. Silence is the honest state - not zero.
   */
  warming?: boolean;
  /** 0 to 1 across the warm-up, for the progress hairline under the track. */
  warmedFraction: number;
  /** Pin-drop mode owns the map; the dial goes with the rest of the rail. */
  disabled?: boolean;
  onChange: (minutes: number) => void;
  onFloorChange: (minutes: number) => void;
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
  const warming = (props.warming ?? true) && props.warmedFraction < 1;
  const capped = props.maximum < MAX_MINUTES;
  const pct = (minutes: number): number => ((minutes - props.minimum) / span) * 100;

  // SAFETY: React's CSSProperties has no index signature for custom
  // properties, so a `--cap-percent` key cannot be expressed without an
  // assertion. The value is a string this component just built from a number
  // it already had; nothing is widened and nothing is trusted from outside.
  const trackStyle = { "--cap-percent": `${pct(props.maximum)}%` } as CSSProperties;

  /**
   * A commit re-frames the camera, so it has to mean "the value moved". Four
   * events end a gesture and an ordinary mouse drag fires two of them; worse,
   * blurring the dial after panning the map by hand would fly the camera back
   * to the contour bounds and throw away the view the reader just set.
   *
   * Only tracks commits. A budget changed from elsewhere - the round trip
   * switch re-snapping it - leaves this stale, and the reducer already
   * re-frames for that itself.
   */
  const committed = useRef(`${props.floorMinutes}-${props.minutes}`);
  const commit = () => {
    const now = `${props.floorMinutes}-${props.minutes}`;
    if (committed.current === now) return;
    committed.current = now;
    props.onCommit();
  };

  const hasFloor = props.floorMinutes > props.minimum;
  const asPercent = (value: number) => ((value - props.minimum) / span) * 100;

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
              style={{ left: `${asPercent(tick)}%` }}
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
          // The split, not a restatement of the value: `value`, `min` and `max`
          // already give a reader "50". What it cannot derive is that in round
          // trip mode fifty minutes is a twenty-five minute walk out.
          aria-valuetext={
            (props.roundTrip
              ? `${props.minutes} minutes, ${props.outboundMinutes} out and ${props.outboundMinutes} back`
              : `${props.minutes} minutes, one way`) + (capped ? ", limited by daylight" : "")
          }
          onChange={(event) => {
            const next = Number(event.target.value);
            // One detent per step the value actually moved, not per input
            // event: a fast drag fires many events on the same minute.
            if (next !== props.minutes) playDetent(next, props.minimum);
            props.onChange(next);
          }}
          // React maps onChange to `input`, which fires continuously during a
          // drag. These are the commit edges: the map re-frames on them so the
          // camera is not restarted on every pixel of the drag.
          onPointerUp={commit}
          onPointerCancel={commit}
          onKeyUp={commit}
          onBlur={commit}
        />

        {/* The lower thumb rides the same track. Two inputs rather than one
            custom control: each keeps its own keyboard behaviour, its own
            value announcement and its own focus ring, which a div with
            pointer handlers would have to reimplement and get wrong. */}
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

      {/* The warm-up used to be silent: the counter above sits inside an
          aria-hidden scale, so a reader met a disabled Spin button and no
          explanation. Announced in quarters rather than per contour, because
          the fraction moves ninety-six times and a live region would read
          every one of them. */}
      <span className="sr-only" role="status">
        {warming
          ? `Loading reachable area, ${Math.round(props.warmedFraction * 4) * 25} percent`
          : props.warming === false
            ? ""
            : "Reachable area ready"}
      </span>
    </div>
  );
}

/**
 * A tick is dim until its contours are cached. That is honest about which
 * positions respond instantly, and it turns the warm-up into something the
 * reader can watch fill in rather than a spinner over the whole panel.
 */
function tickClass(tick: number, floorMinutes: number, minutes: number, warm: boolean): string {
  const weight = tick % 10 === 0 ? " is-major" : tick % 5 === 0 ? " is-mid" : "";
  // Reached means inside the range, so a floor darkens the near end again:
  // those minutes are no longer part of the answer.
  const reached = tick <= minutes && tick >= floorMinutes ? " is-reached" : "";
  return `dial-tick${weight}${reached}${warm ? " is-warm" : ""}`;
}
