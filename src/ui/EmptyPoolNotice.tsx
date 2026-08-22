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
  const action = label(props.fix);

  return (
    <div className="notice" id={props.id}>
      {line(props)}
      {/* `meet-warming` is the one state with no button: it is not an answer
          yet, so it is not a fix yet. It ends when `prefetchLadder` resolves,
          which it does whether or not every contour landed. */}
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
    // The number is measured the same way the pool measures: both containment
    // tests and the reader's own floor, at the budget the button offers. What
    // the copy will not do is promise the named place - `contains` has no
    // on-edge guarantee and the overlap boundary is exactly where two
    // generalised contours graze, so a place can flicker across adjacent
    // minutes. The button moves the dial and shows the real state there.
    case "widen-to-meet":
      return fix.hedged
        ? `Nothing is inside ${props.outerMinutes} min of both of you. The smallest we could measure is ${fix.budgetMinutes} min, where ${fix.nearest} comes into both your reaches.`
        : `Nothing is inside ${props.outerMinutes} min of both of you. At ${fix.budgetMinutes} min, ${fix.nearest} comes into both your reaches.`;
    // "we could measure" is one word of hedging, earned: Valhalla drops a
    // minute it considers degenerate and that rung is never coming, so a scan
    // that skipped one cannot claim to have checked everything.
    case "no-overlap":
      return fix.hedged
        ? "Nothing we could measure is inside 100 minutes' walk of both of you."
        : "Nothing is inside 100 minutes' walk of both of you — the widest the dial goes.";
    case "meet-warming":
      return "Waiting on their side.";
    case "none":
      return "Nothing matches, at any budget the dial offers.";
  }
}

/** The button's face, or null for the one state that is not offering a fix. */
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
