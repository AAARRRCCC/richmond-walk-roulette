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
      return `nothing to spin. ${props.inReach} in reach, ${fix.recovers} held back by filters.`;
    case "widen-budget":
      return `nothing in reach in ${props.outerMinutes} min. nearest is ${fix.nearest}, about ${fix.nearestMinutes} min.`;
    case "drop-cap":
      return `nothing inside ${fix.cappedMinutes} min. the weather trimmed ${fix.askedMinutes} min.`;
    case "lower-floor":
      return "everything is under the lower bound.";
    // The button moves the dial; it does not promise the named place, since
    // `contains` has no on-edge guarantee where two contours graze.
    case "widen-to-meet":
      return fix.hedged
        ? `nothing inside ${props.outerMinutes} min of both. ${fix.nearest} is in both reaches at ${fix.budgetMinutes} min or less.`
        : `nothing inside ${props.outerMinutes} min of both. ${fix.nearest} is in both reaches at ${fix.budgetMinutes} min.`;
    case "no-overlap":
      return fix.hedged
        ? "nothing measured is inside 100 min of both."
        : "nothing is inside 100 min of both.";
    case "meet-warming":
      return "waiting on their side.";
    case "none":
      return "nothing matches at any budget.";
  }
}

/** The button's face, or null for the one state that offers no fix. */
function label(fix: PoolFix): string | null {
  switch (fix.kind) {
    case "drop-rule":
      return `${fix.clearLabel} (${fix.recovers} back)`;
    case "widen-budget":
      return `try ${fix.budgetMinutes} min`;
    case "drop-cap":
      return `${fix.clearLabel} (${fix.recovers} back)`;
    case "lower-floor":
      return "drop the lower bound";
    case "widen-to-meet":
      return `widen to ${fix.budgetMinutes} min`;
    case "no-overlap":
      return "spin alone";
    case "meet-warming":
      return null;
    case "none":
      return "clear filters";
  }
}
