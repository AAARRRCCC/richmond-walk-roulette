import { ArrowSquareOutIcon, ShuffleIcon, WarningIcon, XIcon } from "@phosphor-icons/react";
import type { Place } from "../data/places";
import type { LngLat } from "../lib/geometry";
import type { WalkingRoute } from "../lib/route";
import { formatMiles, formatMinutes } from "../lib/format";

export type ResultCardProps = {
  origin: LngLat;
  place: Place;
  route: WalkingRoute | null;
  routeLoading: boolean;
  roundTrip: boolean;
  /** False when the dial moved below what this walk actually costs. */
  withinBudget: boolean;
  onSpinAgain: () => void;
  onDismiss: () => void;
};

export function ResultCard(props: ResultCardProps) {
  const { place, route } = props;
  const mapsUrl =
    "https://www.google.com/maps/dir/?api=1&travelmode=walking" +
    `&origin=${props.origin.lat},${props.origin.lng}` +
    `&destination=${place.lat},${place.lng}`;

  return (
    <section className="result" aria-live="polite">
      <header className="result-head">
        <p className="field-label">Your walk</p>
        <button type="button" className="icon-button" onClick={props.onDismiss} aria-label="Dismiss result">
          <XIcon size={15} weight="bold" aria-hidden="true" />
        </button>
      </header>

      <h2 className="result-name">{place.name}</h2>
      <p className="result-blurb">{place.blurb}</p>

      <dl className="result-stats">
        <Stat
          label={props.roundTrip ? "Out and back" : "Walk time"}
          value={
            props.routeLoading
              ? null
              : route
                ? formatMinutes(props.roundTrip ? route.durationSeconds * 2 : route.durationSeconds)
                : "-"
          }
        />
        <Stat
          label="Distance"
          value={
            props.routeLoading
              ? null
              : route
                ? formatMiles(props.roundTrip ? route.distanceMeters * 2 : route.distanceMeters)
                : "-"
          }
        />
        <Stat label="Terrain" value={place.terrain === "hilly" ? "Hilly" : "Flat"} />
      </dl>

      {!props.withinBudget && (
        <p className="result-warning">
          <WarningIcon size={15} weight="fill" aria-hidden="true" />
          Outside your current time budget.
        </p>
      )}

      <div className="result-actions">
        <button type="button" className="button is-primary" onClick={props.onSpinAgain}>
          <ShuffleIcon size={16} weight="bold" aria-hidden="true" />
          Spin again
        </button>
        <a className="button" href={mapsUrl} target="_blank" rel="noreferrer">
          <ArrowSquareOutIcon size={16} weight="bold" aria-hidden="true" />
          Directions
        </a>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd>{value ?? <span className="skeleton" style={{ width: "3.2rem" }} />}</dd>
    </div>
  );
}
