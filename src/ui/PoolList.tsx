import { Fragment, useState } from "react";
import type { Place } from "../data/places";
import {
  REASON_COPY,
  REASON_ORDER,
  type ExclusionReason,
  type PoolReport,
} from "../app/eligibility";

export type PoolListProps = {
  pool: PoolReport;
  places: readonly Place[];
  pickedId: string | null;
  onPick: (id: string) => void;
};

/** Rows shown per excluded group before an expander. */
const GROUP_CAP = 12;

// Every row dispatches the same pick as a map dot and lands on the same card.
export function PoolList(props: PoolListProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<ExclusionReason>>(new Set());

  const byReason = new Map<ExclusionReason, Place[]>();
  for (const place of props.places) {
    const verdict = props.pool.verdicts.get(place.id);
    if (verdict === undefined || verdict.included) continue;
    const primary = verdict.reasons[0];
    if (primary === undefined) continue;
    const group = byReason.get(primary);
    if (group === undefined) byReason.set(primary, [place]);
    else group.push(place);
  }

  return (
    <div className="pool-list">
      <p className="field-label">To spin ({props.pool.included.length})</p>
      <ul className="origin-list">
        {props.pool.included.map((place) => (
          <li key={place.id}>
            <button
              type="button"
              className="origin-option"
              aria-current={place.id === props.pickedId}
              onClick={() => props.onPick(place.id)}
            >
              {place.name}
            </button>
          </li>
        ))}
      </ul>

      {REASON_ORDER.map((reason) => {
        const group = byReason.get(reason) ?? [];
        if (group.length === 0) return null;
        const open = expanded.has(reason);
        const shown = open ? group : group.slice(0, GROUP_CAP);
        const hidden = group.length - shown.length;

        return (
          <Fragment key={reason}>
            <p className="field-label">
              {REASON_COPY[reason].heading} ({group.length})
            </p>
            <ul className="origin-list">
              {shown.map((place) => (
                <li key={place.id}>
                  <button
                    type="button"
                    className="origin-option is-excluded"
                    aria-current={place.id === props.pickedId}
                    onClick={() => props.onPick(place.id)}
                  >
                    {place.name}
                  </button>
                </li>
              ))}
              {hidden > 0 && (
                <li>
                  <button
                    type="button"
                    className="link-button"
                    onClick={() =>
                      setExpanded((current) => new Set([...current, reason]))
                    }
                  >
                    Show {hidden} more
                  </button>
                </li>
              )}
            </ul>
          </Fragment>
        );
      })}

      {props.pool.withdrawn.length > 0 && (
        <p className="pool-withdrawn">
          Set aside: {props.pool.withdrawn.length === 1 ? "one rule" : `${props.pool.withdrawn.length} rules`} left
          too few places to spin.
        </p>
      )}
    </div>
  );
}
