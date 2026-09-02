import {
  ArrowSquareOutIcon,
  ShareNetworkIcon,
  ShuffleIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react";
import { REASON_COPY, REASON_ORDER, type PlaceVerdict } from "../app/eligibility";
import { appleDirectionsUrl, googleDirectionsUrl } from "../lib/handoff";
import { shareNote, useShareAction } from "./useShareAction";
import { describeBothBy, describeGap, type MeetSplit } from "../app/meet";
import { playPress } from "../lib/sound";
import { elevationAvailable } from "../lib/route";
import { ElevationProfile } from "./ElevationProfile";
import { DETOUR_LABELS, type Place } from "../data/places";
import type { LngLat } from "../lib/geometry";
import type { WalkingRoute } from "../lib/route";
import { formatFeet, formatMiles, formatMinutes } from "../lib/format";

/**
 * One grey line under the stats. Strings are composed by pure modules, never
 * here, so the card and the screen-reader sentence stay identical.
 *
 * @public
 */
export type ResultLine = {
  key: "conditions" | "light" | "hours" | "handoff" | "meet";
  text: string;
  /** "assumed" renders dimmer than a fact. */
  tier: "fact" | "assumed";
};

export type ResultCardProps = {
  origin: LngLat;
  place: Place;
  route: WalkingRoute | null;
  routeLoading: boolean;
  /** The route request settled without a line and has stopped retrying. */
  routeFailed: boolean;
  roundTrip: boolean;
  /** False when the dial moved below what this walk costs. */
  withinBudget: boolean;
  /** Rendered in array order: conditions, light, hours, handoff, meet. */
  lines: readonly ResultLine[];
  /** Why this place is not in the pool, when it is not. */
  verdict: PlaceVerdict | null;
  /** Metres along the profile being scrubbed, or null. */
  hoverMeters: number | null;
  onHoverRoute: (meters: number | null) => void;
  /** False when the measured walk does not finish before civil dusk. */
  fitsLight: boolean;
  shareUrl: string;
  originName: string;
  /** The dial's budget, not the measured walk. */
  budgetMinutes: number;
  /** True while this session is still the one a link described. */
  sharedArrival: boolean;
  /** Non-null in meet mode: the card renders one row per side instead of stats. */
  split: MeetSplit | null;
  partnerName: string;
  onSpinAgain: () => void;
  onRetryRoute: () => void;
  onDismiss: () => void;
};

// Not a live region: App announces one composed sentence once the route settles.
export function ResultCard(props: ResultCardProps) {
  const { place, route, split, verdict } = props;
  const { state: shareState, lastUrl, fallbackRef, share } = useShareAction();

  const onShare = (): Promise<void> => share({ url: props.shareUrl });
  const pending = props.routeLoading && !props.routeFailed;
  // Always the outbound leg, even on a round trip.
  const shown = route?.profile ?? null;

  const reasons =
    verdict === null || verdict.included
      ? []
      : REASON_ORDER.filter((reason) => verdict.reasons.includes(reason));

  return (
    <section className="result">
      <header className="result-head">
        <p className="field-label">
          {place.detour === undefined ? "Your walk" : DETOUR_LABELS[place.detour]}
        </p>
        <button type="button" className="icon-button" onClick={props.onDismiss} aria-label="Dismiss result">
          <XIcon size={15} weight="bold" aria-hidden="true" />
        </button>
      </header>

      <h2 className="result-name">{place.name}</h2>

      {split !== null ? (
        <div className="result-split">
          <div className="result-split-row">
            <span className="result-split-who">Your start</span>
            <SplitValue
              minutes={split.yourMinutes}
              pending={pending}
              meters={route === null ? null : route.distanceMeters * (props.roundTrip ? 2 : 1)}
            />
          </div>
          <div className="result-split-row">
            <span className="result-split-who">{props.partnerName}</span>
            <SplitValue minutes={split.theirMinutes} pending={split.theirMinutes === null} meters={null} />
          </div>
          {describeBothBy(split) !== null && (
            <p className="result-split-both">{describeBothBy(split)}</p>
          )}
          {describeGap(split) !== null && <p className="result-split-gap">{describeGap(split)}</p>}
        </div>
      ) : (
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
      )}

      {shown !== null && (
        <ElevationProfile
          profile={shown}
          roundTrip={props.roundTrip}
          hoverMeters={props.hoverMeters}
          onHover={props.onHoverRoute}
        />
      )}
      {!pending && route !== null && shown === null && elevationAvailable() === false && (
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

      {/* Geometry reasons are covered by the budget row below. */}
      {reasons
        .filter((reason) => reason !== "out-of-reach" && reason !== "inside-floor")
        .map((reason) => (
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
        <p className="result-warning">
          <WarningIcon size={15} weight="fill" aria-hidden="true" />
          {reasons.includes("inside-floor")
            ? "Closer than your range's lower end."
            : "Outside your current time budget."}
        </p>
      )}

      {!props.fitsLight && (
        <p className="result-warning">
          <WarningIcon size={15} weight="fill" aria-hidden="true" />
          This walk does not fit in the light left.
        </p>
      )}

      <div className="result-actions">
        <button type="button" className="button is-primary" onClick={props.onSpinAgain}>
          <ShuffleIcon size={16} weight="bold" aria-hidden="true" />
          {props.sharedArrival ? "Spin your own" : "Spin again"}
        </button>
        <button type="button" className="button" onClick={() => void onShare()}>
          <ShareNetworkIcon size={16} weight="bold" aria-hidden="true" />
          Share
        </button>
        {/* Both links on every platform; each falls back to the browser when the app is absent. */}
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

      {/* The one live region here. */}
      <p className="result-share-note" role="status">
        {shareNote(shareState) ?? ""}
      </p>
      {shareState === "manual" && (
        <input
          ref={fallbackRef}
          className="result-share-fallback"
          readOnly
          value={lastUrl}
          aria-label="Share link"
        />
      )}
    </section>
  );
}

function SplitValue(props: {
  minutes: number | null;
  pending: boolean;
  meters: number | null;
}) {
  return (
    <>
      <span className="result-split-value">
        {props.pending ? (
          <span className="skeleton" style={{ width: "3.2rem" }} />
        ) : props.minutes === null ? (
          "-"
        ) : (
          formatMinutes(props.minutes * 60)
        )}
      </span>
      <span className="result-split-value">
        {props.meters === null ? "" : formatMiles(props.meters)}
      </span>
    </>
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
