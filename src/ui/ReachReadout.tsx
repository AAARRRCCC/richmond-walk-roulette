import { Fragment, useEffect, useRef } from "react";
import { formatArea, pluralize } from "../lib/format";
import { summaryClauses, summaryLine, type PoolReport } from "../app/eligibility";

export type ReachStatus = "loading" | "ready" | "error" | "not-configured";

export type ReachReadoutProps = {
  status: ReachStatus;
  areaSqMeters: number;
  pool: PoolReport;
  outerMinutes: number;
  /**
   * An identity for "the filters changed" that does NOT move per scrub frame.
   *
   * `commitKey` bumps only on origin, dial commit and round trip, so without
   * this a vibe chip would change every count on screen and announce nothing.
   * A hash of the counts would not do: those move on every frame of a scrub.
   */
  filterKey: string;
  /**
   * Bumped when the dial comes to rest. The visible line tracks every frame of
   * a scrub, which is the point of prefetching the ladder; the announced one
   * waits for this.
   */
  commitKey: number;
};

export function ReachReadout(props: ReachReadoutProps) {
  const ready = props.status === "ready";
  const clauses = ready ? summaryClauses(props.pool) : [];
  // Two sentences about two different numbers, and the announcement carries
  // both: the reach line names what geometry allows, the pool line names what
  // is left after the filters.
  const line = ready
    ? `${formatArea(props.areaSqMeters)} within ${props.outerMinutes} min, ` +
      `${pluralize(props.pool.inReach, "place")} in reach. ${summaryLine(props.pool)}`
    : "";

  /**
   * Announce the settled value, not the drag.
   *
   * The line below is rebuilt every render, which during a scrub is every
   * frame - that being the whole point of prefetching the ladder - so a live
   * region on it queued dozens of polite announcements that outlasted the
   * gesture, on top of the slider's own. This node is written directly instead,
   * on the same commit edge that re-frames the camera. React owns the element;
   * the dial owns when its text moves.
   */
  const settledRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (settledRef.current && line !== "") settledRef.current.textContent = line;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.commitKey, props.filterKey, ready]);

  return (
    <>
      {props.status === "loading" && (
        <p className="readout is-loading" aria-hidden="true">
          <span className="skeleton" style={{ width: "5.5rem" }} />
          <span className="skeleton" style={{ width: "7rem" }} />
        </p>
      )}
      {ready && (
        <p className="readout">
          <strong>{formatArea(props.areaSqMeters)}</strong> within {props.outerMinutes} min
          <span className="readout-sep" aria-hidden="true" />
          <strong>{pluralize(props.pool.inReach, "place")}</strong> in reach
        </p>
      )}
      {ready && (
        /* A different sentence about a different number. "In reach" above is
           what geometry allows; this is what the filters left. Each number is
           named once and the two lines compose. No aria-live: these change on
           every frame of a scrub, and the settled announcement above is this
           component's one correct pattern for that. */
        <p className="pool-summary">
          <strong>{props.pool.included.length}</strong> to spin
          {clauses.map((clause) => (
            <Fragment key={clause}>
              <span className="readout-sep" aria-hidden="true" />
              {clause}
            </Fragment>
          ))}
        </p>
      )}
      <span className="sr-only" role="status" ref={settledRef} />
    </>
  );
}
