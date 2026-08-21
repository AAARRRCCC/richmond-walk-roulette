import { ArrowSquareOutIcon, ShuffleIcon, WarningIcon, XIcon } from "@phosphor-icons/react";
import { REASON_COPY, REASON_ORDER, type PlaceVerdict } from "../app/eligibility";
import { mirrorProfile } from "../lib/elevation";
import { appleDirectionsUrl, googleDirectionsUrl } from "../lib/handoff";
import { playPress } from "../lib/sound";
import { elevationAvailable } from "../lib/route";
import { ElevationProfile } from "./ElevationProfile";
import type { Place } from "../data/places";
import type { LngLat } from "../lib/geometry";
import type { WalkingRoute } from "../lib/route";
import { formatFeet, formatMiles, formatMinutes } from "../lib/format";

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
  /**
   * Why this place is not in the pool, when it is not. A dimmed dot on the map
   * is clickable precisely so the reader can ask, and this is the answer.
   */
  verdict?: PlaceVerdict | null;
  /** Metres along the profile the reader is scrubbing, or null. */
  hoverMeters: number | null;
  onHoverRoute: (meters: number | null) => void;
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
  /**
   * The profile the chart draws and the stat counts, which must be one object.
   *
   * With round trip on, every other number on the card doubles; a profile
   * showing only the outbound leg beside a doubled distance would be two
   * different walks described at once.
   */
  const shown =
    route?.profile == null ? null : props.roundTrip ? mirrorProfile(route.profile) : route.profile;

  const verdict = props.verdict ?? null;
  const reasons =
    verdict === null || verdict.included
      ? []
      : REASON_ORDER.filter((reason) => verdict.reasons.includes(reason));

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
        <Stat
          label="Climb"
          value={pending ? null : shown === null ? "-" : formatFeet(shown.ascentMeters)}
        />
      </dl>

      {shown !== null && (
        <ElevationProfile
          profile={shown}
          hoverMeters={props.hoverMeters}
          onHover={props.onHoverRoute}
        />
      )}
      {!pending && route !== null && shown === null && elevationAvailable() === false && (
        /* Never an empty gap. A route with no profile from an engine that has
           never produced one is a fact about the engine, and saying so beats a
           flat line drawn from nothing. */
        <p className="profile-empty field-label">No elevation data from this engine.</p>
      )}

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

      {reasons
        .filter((reason) => reason !== "out-of-reach" && reason !== "inside-floor")
        .map((reason) => (
          /* Geometry is deliberately absent here: the budget row below is the
             same test, and two rows saying one thing in two vocabularies is
             worse than one row saying it once. */
          <p className="result-warning" key={reason}>
            <WarningIcon size={15} weight="fill" aria-hidden="true" />
            {REASON_COPY[reason].sentence}
          </p>
        ))}

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
        /* The same test as `out-of-reach`, so it stays one row and changes its
           words rather than gaining a second row that says the same thing. */
        <p className="result-warning">
          <WarningIcon size={15} weight="fill" aria-hidden="true" />
          {reasons.includes("inside-floor")
            ? "Closer than your range's lower end."
            : "Outside your current time budget."}
        </p>
      )}

      <div className="result-actions">
        <button type="button" className="button is-primary" onClick={props.onSpinAgain}>
          <ShuffleIcon size={16} weight="bold" aria-hidden="true" />
          Spin again
        </button>
        {/* Both, always, on every platform. Google documents that its URL
            falls back to the browser when the app is absent, and maps.apple.com
            is a universal link Apple's own app claims; sniffing the platform
            could only ever be wrong, and would break the Mac user in Chrome and
            the Android user who wants Apple's web map. Google is first because
            it is the incumbent and moving it would retrain a habit for nothing.

            Named links rather than two vague "Maps": in an accessibility tree,
            "Directions" twice is a coin toss. */}
        <a
          className="button"
          href={googleDirectionsUrl(props.origin, place)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Walking directions to ${place.name} in Google Maps`}
          onClick={() => playPress()}
        >
          <ArrowSquareOutIcon size={16} weight="bold" aria-hidden="true" />
          Google Maps
        </a>
        <a
          className="button"
          href={appleDirectionsUrl(props.origin, place)}
          target="_blank"
          rel="noreferrer"
          aria-label={`Walking directions to ${place.name} in Apple Maps`}
          onClick={() => playPress()}
        >
          <ArrowSquareOutIcon size={16} weight="bold" aria-hidden="true" />
          Apple Maps
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
