import { Fragment, useEffect, useRef } from "react";
import { formatArea, pluralize } from "../lib/format";
import { summaryClauses, summaryLine, type PoolReport } from "../app/eligibility";

/**
 * `"idle"` renders **nothing at all** — no skeleton, no area, no announcement.
 *
 * App resolves `status` to `"loading"` whenever `reach` is null with no
 * failure, which before the reader of an invite has chosen a start would be a
 * skeleton pair sitting behind the invite panel forever, promising a
 * measurement nobody asked for.
 */
export type ReachStatus = "idle" | "loading" | "ready" | "error" | "not-configured";

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
  /** `describeDusk`'s bare clock phrase, or null while there is nothing to say. */
  duskNote: string | null;
  /**
   * Non-null in meet mode.
   *
   * `partnerWarm` is false while their ladder has not produced a reach at this
   * budget yet, and it is **not cosmetic**: with it false the pool is one
   * person's, so `bothCount` would be a one-sided number and the words "you can
   * both reach" would be a claim nothing has checked. False therefore keeps
   * today's area line and appends "their side still working". The prop carries
   * the state so the component cannot get this wrong by accident.
   */
  meet?: {
    readonly bothCount: number;
    readonly outerMinutes: number;
    readonly partnerWarm: boolean;
  } | null;
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
  /**
   * In meet mode the headline is a count, not an area — but only once their
   * reach exists.
   *
   * The swap is of kind rather than a degradation, and it is arguably the
   * better sentence: what two people want to know is how many options they
   * have, not how many square kilometres they share. It is also the only
   * honest one available, because there is no overlap polygon to measure — see
   * `meet.ts` on why `subtract` is forbidden here and why no clipper was bought.
   */
  const bothLine = props.meet !== null && props.meet !== undefined && props.meet.partnerWarm;
  const meet = props.meet ?? null;
  // Two sentences about two different numbers, and the announcement carries
  // both: the reach line names what geometry allows, the pool line names what
  // is left after the filters.
  const line = !ready
    ? ""
    : bothLine && meet !== null
      ? `${pluralize(meet.bothCount, "place")} you can both reach, ${meet.outerMinutes} min each` +
        `${props.duskNote === null ? "" : `, ${props.duskNote}`}. ${summaryLine(props.pool)}`
      : `${formatArea(props.areaSqMeters)} within ${props.outerMinutes} min, ` +
        `${pluralize(props.pool.inReach, "place")} in reach` +
        `${meet === null ? "" : ", their side still working"}` +
        `${props.duskNote === null ? "" : `, ${props.duskNote}`}. ${summaryLine(props.pool)}`;

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
    // `line` itself stays out of the deps because it is rebuilt every frame of
    // a scrub; `duskNote` is listed because it changes at most once a minute and
    // only when a sentence-level fact did. The honest residue: a cap tick that
    // moves the budget without changing the dusk phrase moves the visible
    // numbers silently for one minute. The alternative is announcing a
    // recomputed reach once a minute, unprompted, which is worse to listen to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.commitKey, props.filterKey, props.duskNote, ready]);

  return (
    <>
      {props.status === "loading" && (
        <p className="readout is-loading" aria-hidden="true">
          <span className="skeleton" style={{ width: "5.5rem" }} />
          <span className="skeleton" style={{ width: "7rem" }} />
        </p>
      )}
      {ready && bothLine && meet !== null && (
        <p className="readout">
          <strong>{pluralize(meet.bothCount, "place")}</strong> you can both reach
          <span className="readout-sep" aria-hidden="true" />
          <strong>{meet.outerMinutes} min</strong> each
          {props.duskNote !== null && (
            <>
              <span className="readout-sep" aria-hidden="true" />
              <strong>{props.duskNote}</strong>
            </>
          )}
        </p>
      )}
      {ready && !bothLine && (
        <p className="readout">
          <strong>{formatArea(props.areaSqMeters)}</strong> within {props.outerMinutes} min
          <span className="readout-sep" aria-hidden="true" />
          <strong>{pluralize(props.pool.inReach, "place")}</strong> in reach
          {meet !== null && (
            <>
              <span className="readout-sep" aria-hidden="true" />
              their side still working
            </>
          )}
          {props.duskNote !== null && (
            <>
              <span className="readout-sep" aria-hidden="true" />
              <strong>{props.duskNote}</strong>
            </>
          )}
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
