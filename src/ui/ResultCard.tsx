import { ArrowSquareOutIcon, ShuffleIcon, WarningIcon, XIcon } from "@phosphor-icons/react";
import type { Place } from "../data/places";
import type { LngLat } from "../lib/geometry";
import type { WalkingRoute } from "../lib/route";
import { formatMiles, formatMinutes } from "../lib/format";

/**
 * One small grey line under the stats.
 *
 * Four specs each wanted a line of their own here, each with its own class, and
 * `apple-maps` wrote down the right answer before any of them landed: if three
 * of you want a line, the move is one shared list rather than three classes
 * sharing a stylesheet by accident. So this is the list.
 *
 * Every string is composed by a pure, tested module - `describeLight`, the
 * weather headline, `evaluateHours`' note - and never by this component. That is
 * what keeps the card and the screen-reader sentence from drifting: they are
 * literally the same strings.
 *
 * @public - App fills this from chunk 4 onward; today it renders empty.
 */
export type ResultLine = {
  /** Stable, for React keys and for tests. */
  key: "conditions" | "light" | "hours" | "handoff" | "meet";
  text: string;
  /** "assumed" renders in --ink-3; a fact renders in --ink-2. */
  tier: "fact" | "assumed";
};

export type ResultCardProps = {
  origin: LngLat;
  place: Place;
  route: WalkingRoute | null;
  routeLoading: boolean;
  /** The route request has settled without a line and has stopped retrying. */
  routeFailed: boolean;
  roundTrip: boolean;
  /** False when the dial moved below what this walk actually costs. */
  withinBudget: boolean;
  /**
   * Rendered in array order, which App fixes as: conditions, light, hours,
   * handoff, meet. Empty until chunk 4 puts the first one in it.
   */
  lines: readonly ResultLine[];
  onSpinAgain: () => void;
  onRetryRoute: () => void;
  onDismiss: () => void;
};

/**
 * Not a live region. The reel and the card sit inside the same slot, and both
 * announcing meant the winner was read twice; App writes one composed sentence
 * once the route has settled instead.
 */
export function ResultCard(props: ResultCardProps) {
  const { place, route } = props;
  // A skeleton means "still coming". Once the attempts are spent it is a lie,
  // and the honest answer is a dash next to something to press.
  const pending = props.routeLoading && !props.routeFailed;
  const mapsUrl =
    "https://www.google.com/maps/dir/?api=1&travelmode=walking" +
    `&origin=${props.origin.lat},${props.origin.lng}` +
    `&destination=${place.lat},${place.lng}`;

  return (
    <section className="result">
      <header className="result-head">
        <p className="field-label">Your walk</p>
        <button type="button" className="icon-button" onClick={props.onDismiss} aria-label="Dismiss result">
          <XIcon size={15} weight="bold" aria-hidden="true" />
        </button>
      </header>

      <h2 className="result-name">{place.name}</h2>

      <dl className="result-stats">
        <Stat
          label={props.roundTrip ? "Out and back" : "Walk time"}
          value={
            pending
              ? null
              : route
                ? formatMinutes(props.roundTrip ? route.durationSeconds * 2 : route.durationSeconds)
                : "-"
          }
        />
        <Stat
          label="Distance"
          value={
            pending
              ? null
              : route
                ? formatMiles(props.roundTrip ? route.distanceMeters * 2 : route.distanceMeters)
                : "-"
          }
        />
        <Stat label="Terrain" value={place.terrain === "hilly" ? "Hilly" : "Flat"} />
      </dl>

      {props.lines.length > 0 && (
        <div className="result-lines">
          {props.lines.map((line) => (
            <p
              key={line.key}
              className={`result-line${line.tier === "assumed" ? " is-assumed" : ""}`}
            >
              {line.text}
            </p>
          ))}
        </div>
      )}

      {props.routeFailed && (
        <p className="result-warning">
          <WarningIcon size={15} weight="fill" aria-hidden="true" />
          Could not measure this walk.
          <button type="button" className="link-button" onClick={props.onRetryRoute}>
            Try again
          </button>
        </p>
      )}

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
