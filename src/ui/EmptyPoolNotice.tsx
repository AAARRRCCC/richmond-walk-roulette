import { playPress } from "../lib/sound";
import type { PoolFix } from "../app/eligibility";

export type EmptyPoolNoticeProps = {
  id: string;
  fix: PoolFix;
  /** The outermost contour's minutes. */
  outerMinutes: number;
  /** `PoolReport.inReach`, the same number `.readout` shows. */
  inReach: number;
  onFix: () => void;
};

// Names the single change most likely to help and offers it. Not `is-warn`:
// an empty pool is a filter combination, not a fault.
export function EmptyPoolNotice(props: EmptyPoolNoticeProps) {
  const press = () => {
    playPress();
    props.onFix();
  };
  const action = label(props.fix);

  return (
    <div className="notice" id={props.id}>
      {line(props)}
      {action !== null && (
        <button type="button" className="link-button" onClick={press}>
          {action}
        </button>
      )}
    </div>
  );
}

function line(props: EmptyPoolNoticeProps): string {
  const { fix } = props;
  switch (fix.kind) {
    case "drop-rule":
      return `Nothing to spin. ${props.inReach} places are in reach; ${fix.recovers} of them are held back.`;
    case "widen-budget":
      return `Nothing is in reach in ${props.outerMinutes} min. The nearest match is ${fix.nearest}, about ${fix.nearestMinutes} min away.`;
    case "drop-cap":
      return `Nothing to spin inside ${fix.cappedMinutes} min. The weather trimmed your ${fix.askedMinutes} min, and everything that matches is outside what is left.`;
    case "lower-floor":
      return "Everything that matches is closer than your range starts.";
    // The button moves the dial; it does not promise the named place, since
    // `contains` has no on-edge guarantee where two contours graze.
    case "widen-to-meet":
      return fix.hedged
        ? `Nothing is inside ${props.outerMinutes} min of both of you. The smallest we could measure is ${fix.budgetMinutes} min, where ${fix.nearest} comes into both your reaches.`
        : `Nothing is inside ${props.outerMinutes} min of both of you. At ${fix.budgetMinutes} min, ${fix.nearest} comes into both your reaches.`;
    case "no-overlap":
      return fix.hedged
        ? "Nothing we could measure is inside 100 minutes' walk of both of you."
        : "Nothing is inside 100 minutes' walk of both of you, the widest the dial goes.";
    case "meet-warming":
      return "Waiting on their side.";
    case "none":
      return "Nothing matches, at any budget the dial offers.";
  }
}

/** The button's face, or null for the one state that offers no fix. */
function label(fix: PoolFix): string | null {
  switch (fix.kind) {
    case "drop-rule":
      return `${fix.clearLabel} (${fix.recovers} back)`;
    case "widen-budget":
      return `Try ${fix.budgetMinutes} min`;
    case "drop-cap":
      return `${fix.clearLabel} (${fix.recovers} back)`;
    case "lower-floor":
      return "Drop the lower bound";
    case "widen-to-meet":
      return `Widen to ${fix.budgetMinutes} min`;
    case "no-overlap":
      return "Spin from just your side";
    case "meet-warming":
      return null;
    case "none":
      return "Clear filters";
  }
}
