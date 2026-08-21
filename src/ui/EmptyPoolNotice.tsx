import { playPress } from "../lib/sound";
import type { PoolFix } from "../app/eligibility";

export type EmptyPoolNoticeProps = {
  id: string;
  fix: PoolFix;
  /** The outermost contour's minutes, for the budget branch's first line. */
  outerMinutes: number;
  /** `PoolReport.inReach` — the same number and the same phrase `.readout` shows. */
  inReach: number;
  onFix: () => void;
};

/**
 * What to say when there is nothing to spin.
 *
 * The old version said "Nothing matches inside 25 minutes" and offered *Clear
 * filters*, which is true, useless, and a sledgehammer aimed at an unknown nail.
 * This names the single change most likely to help and puts the button that
 * makes it right there.
 *
 * Not `is-warn`. An empty pool is a filter combination, not a fault — the app
 * did what it was asked and is saying so.
 *
 * Every number on screen here was measured. `recovers` comes from re-running
 * the verdict with exactly one cause dropped and counting the survivors; the
 * budget branch carries no count at all, because the only evidence the app holds
 * about "how much further" is a cached route duration and pool membership is
 * decided by polygon containment, and those two disagree at the margin.
 */
export function EmptyPoolNotice(props: EmptyPoolNoticeProps) {
  const press = () => {
    playPress();
    props.onFix();
  };

  return (
    <div className="notice" id={props.id}>
      {line(props)}
      <button type="button" className="link-button" onClick={press}>
        {label(props.fix)}
      </button>
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
    case "lower-floor":
      return "Everything that matches is closer than your range starts.";
    case "none":
      return "Nothing matches, at any budget the dial offers.";
  }
}

function label(fix: PoolFix): string {
  switch (fix.kind) {
    case "drop-rule":
      return `${fix.clearLabel} (${fix.recovers} back)`;
    case "widen-budget":
      return `Try ${fix.budgetMinutes} min`;
    case "lower-floor":
      return "Drop the lower bound";
    case "none":
      return "Clear filters";
  }
}
