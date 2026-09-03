import { Fragment, useEffect, useRef } from "react";
import { formatArea, pluralize } from "../lib/format";
import {
  summaryClauses,
  summaryLine,
  type PoolReport,
} from "../app/eligibility";

/** `"idle"` renders nothing at all: no skeleton, no announcement. */
export type ReachStatus =
  "idle" | "loading" | "ready" | "error" | "not-configured";

export type ReachReadoutProps = {
  status: ReachStatus;
  areaSqMeters: number;
  pool: PoolReport;
  outerMinutes: number;
  /** Changes when the filters change, and never per scrub frame. */
  filterKey: string;
  /** `describeDusk`'s clock phrase, or null. */
  duskNote: string | null;
  /** Non-null in meet mode. `partnerWarm` false keeps the one-sided area line. */
  meet?: {
    readonly bothCount: number;
    readonly outerMinutes: number;
    readonly partnerWarm: boolean;
  } | null;
  /** Bumped when the dial comes to rest; the announcement waits for it. */
  commitKey: number;
  /** Phone layout: a row of stats instead of sentences. */
  compact?: boolean;
};

export function ReachReadout(props: ReachReadoutProps) {
  const ready = props.status === "ready";
  const clauses = ready ? summaryClauses(props.pool) : [];
  const bothLine =
    props.meet !== null && props.meet !== undefined && props.meet.partnerWarm;
  const meet = props.meet ?? null;
  const line = !ready
    ? ""
    : bothLine && meet !== null
      ? `${pluralize(meet.bothCount, "place")} you can both reach, ${meet.outerMinutes} min each` +
        `${props.duskNote === null ? "" : `, ${props.duskNote}`}. ${summaryLine(props.pool)}`
      : `${formatArea(props.areaSqMeters)} within ${props.outerMinutes} min, ` +
        `${pluralize(props.pool.inReach, "place")} in reach` +
        `${meet === null ? "" : ", their side still working"}` +
        `${props.duskNote === null ? "" : `, ${props.duskNote}`}. ${summaryLine(props.pool)}`;

  // Announce the settled value, not every scrub frame: written directly on the commit edge.
  const settledRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (settledRef.current && line !== "")
      settledRef.current.textContent = line;
    // `line` is rebuilt every frame of a scrub, so it stays out of the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.commitKey, props.filterKey, props.duskNote, ready]);

  // "dark until 6:14 am" reads as a cell labelled "Dark until" with the clock as its value.
  const light = props.duskNote === null ? null : splitClock(props.duskNote);
  if (props.compact === true) {
    return (
      <>
        <dl className="stat-row" aria-hidden={!ready}>
          {bothLine && meet !== null ? (
            <>
              <Cell
                label="Both reach"
                value={ready ? String(meet.bothCount) : null}
              />
              <Cell
                label="Each"
                value={ready ? `${meet.outerMinutes} min` : null}
              />
            </>
          ) : (
            <>
              <Cell
                label="Reach"
                value={ready ? formatArea(props.areaSqMeters) : null}
              />
              <Cell
                label="In reach"
                value={ready ? String(props.pool.inReach) : null}
              />
            </>
          )}
          <Cell
            label="To spin"
            value={ready ? String(props.pool.included.length) : null}
          />
          {light !== null && (
            <Cell label={light.label} value={ready ? light.value : null} />
          )}
        </dl>
        {ready && (clauses.length > 0 || (meet !== null && !bothLine)) && (
          <p className="pool-summary is-compact">
            {[
              ...(meet !== null && !bothLine
                ? ["their side still working"]
                : []),
              ...clauses,
            ].join(" · ")}
          </p>
        )}
        <span className="sr-only" role="status" ref={settledRef} />
      </>
    );
  }

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
          <strong>{pluralize(meet.bothCount, "place")}</strong> you can both
          reach
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
          <strong>{formatArea(props.areaSqMeters)}</strong> within{" "}
          {props.outerMinutes} min
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

function Cell({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd>
        {value ?? <span className="skeleton" style={{ width: "2.6rem" }} />}
      </dd>
    </div>
  );
}

function splitClock(note: string) {
  const match = /^(.*\S)\s+(\d[\d:]*\s*[ap]m)$/i.exec(note);
  if (match === null) return { label: "Light", value: note };
  const words = match[1]!;
  return {
    label: words.charAt(0).toUpperCase() + words.slice(1),
    value: match[2]!,
  };
}
