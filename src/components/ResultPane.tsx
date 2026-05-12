import type { ReactNode } from "react";
import type { POI, StartLocation } from "../data/pois";
import { fmtMiles, fmtMinutes } from "../lib/geo";

type Props = {
  destination: POI | null;
  startLocation: StartLocation;
  totalDist: number;
  roundTrip: boolean;
  spinning: boolean;
  eligibleCount: number;
  onOpenInMaps: () => void;
  onReroll: () => void;
  onClear: () => void;
};

export function ResultPane({
  destination,
  startLocation,
  totalDist,
  roundTrip,
  spinning,
  eligibleCount,
  onOpenInMaps,
  onReroll,
  onClear,
}: Props) {
  if (!destination || spinning) {
    const text = spinning
      ? "Spinning the wheel…"
      : eligibleCount === 0
        ? "Adjust your filters to populate the wheel"
        : `Hit SPIN to pick from ${eligibleCount} destination${eligibleCount === 1 ? "" : "s"}`;
    return <div className="result-pane empty">{text}</div>;
  }

  return (
    <div className="result-pane">
      <div>
        <h2 className="result-name">{destination.name}</h2>
        <p className="result-blurb">{destination.blurb}</p>
        <div className="result-stats">
          <Stat label="Distance">
            {fmtMiles(totalDist)} {roundTrip ? "round trip" : "one way"}
          </Stat>
          <Stat label="Walk time">{fmtMinutes(totalDist)}</Stat>
          <Stat label="Terrain">
            <span style={{ textTransform: "capitalize" }}>{destination.difficulty}</span>
          </Stat>
          <Stat label="From">{startLocation.name}</Stat>
        </div>
      </div>
      <div className="result-actions">
        <button className="btn" onClick={onOpenInMaps}>
          Open in Maps
        </button>
        <button className="btn ghost" onClick={onReroll} disabled={spinning}>
          Reroll
        </button>
        <button className="btn ghost" onClick={onClear}>
          Clear
        </button>
      </div>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{children}</span>
    </div>
  );
}
