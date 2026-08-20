import { useEffect, useRef } from "react";
import { formatArea, pluralize } from "../lib/format";

export type ReachStatus = "loading" | "ready" | "error" | "not-configured";

export type ReachReadoutProps = {
  status: ReachStatus;
  areaSqMeters: number;
  placeCount: number;
  outerMinutes: number;
  /**
   * Bumped when the dial comes to rest. The visible line tracks every frame of
   * a scrub, which is the point of prefetching the ladder; the announced one
   * waits for this.
   */
  commitKey: number;
};

export function ReachReadout(props: ReachReadoutProps) {
  const ready = props.status === "ready";
  const line = ready
    ? `${formatArea(props.areaSqMeters)} within ${props.outerMinutes} min, ` +
      `${pluralize(props.placeCount, "place")} in reach`
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
  }, [props.commitKey, ready]);

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
          <strong>{pluralize(props.placeCount, "place")}</strong> in reach
        </p>
      )}
      <span className="sr-only" role="status" ref={settledRef} />
    </>
  );
}
