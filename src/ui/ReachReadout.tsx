import { formatArea, pluralize } from "../lib/format";

export type ReachStatus = "loading" | "ready" | "error" | "not-configured";

export type ReachReadoutProps = {
  status: ReachStatus;
  areaSqMeters: number;
  placeCount: number;
  outerMinutes: number;
};

export function ReachReadout(props: ReachReadoutProps) {
  if (props.status === "loading") {
    return (
      <p className="readout is-loading" aria-hidden="true">
        <span className="skeleton" style={{ width: "5.5rem" }} />
        <span className="skeleton" style={{ width: "7rem" }} />
      </p>
    );
  }

  if (props.status !== "ready") return null;

  return (
    <p className="readout" role="status">
      <strong>{formatArea(props.areaSqMeters)}</strong> within {props.outerMinutes} min
      <span className="readout-sep" aria-hidden="true" />
      <strong>{pluralize(props.placeCount, "place")}</strong> in reach
    </p>
  );
}
