import { useId, useRef } from "react";
import {
  CHART_MAX_POINTS,
  PROFILE_MIN_RANGE_M,
  areaPath,
  elevationAt,
  linePath,
  profilePoints,
  resample,
} from "../lib/elevation";
import { formatFeet, formatMiles } from "../lib/format";
import { playTap } from "../lib/sound";
import type { ElevationProfile as Profile } from "../lib/route";

export type ElevationProfileProps = {
  /** The outbound leg, always, including on a round trip. */
  profile: Profile;
  roundTrip: boolean;
  hoverMeters: number | null;
  onHover: (meters: number | null) => void;
};

/** viewBox units; the element is width 100%. */
const W = 300;
const H = 76;

// No "flat" branch: a profile under PROFILE_MIN_RANGE_M is drawn inside that
// window and reads as flat because it is. The scrubber is a transparent
// range input over the SVG; its focus ring comes from the `:has()` rule in CSS.
export function ElevationProfile(props: ElevationProfileProps) {
  const gradientId = useId();
  const scrubbing = useRef(false);

  const { profile } = props;
  const samples = resample(profile.samples, CHART_MAX_POINTS);
  const points = profilePoints(samples, W, H, PROFILE_MIN_RANGE_M);

  // The profile's own span, not the trip summary's: they differ by metres and
  // the slider must not index past the samples.
  const spanMeters = Math.max(1, (profile.samples.length - 1) * profile.intervalMeters);

  const hover = props.hoverMeters;
  const hoverAt = hover === null ? null : Math.min(Math.max(hover, 0), spanMeters);
  const hx = hoverAt === null ? 0 : (hoverAt / spanMeters) * W;
  const hoverPoint =
    hoverAt === null ? null : points[Math.round((hoverAt / spanMeters) * (points.length - 1))];

  const label =
    `Elevation profile: ${formatFeet(profile.ascentMeters)} of climb and ` +
    `${formatFeet(profile.descentMeters)} of descent over ${formatMiles(spanMeters)}, between ` +
    `${formatFeet(profile.minMeters)} and ${formatFeet(profile.maxMeters)} above sea level.`;

  return (
    <figure className="profile">
      <div
        className="profile-figure"
        onMouseLeave={() => props.onHover(null)}
      >
        <svg
          className="profile-chart"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={label}
          focusable="false"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--accent)" stopOpacity="0.28" />
              <stop offset="1" stopColor="var(--accent)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={areaPath(points, H)} fill={`url(#${gradientId})`} />
          <path
            d={linePath(points)}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.6"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1="0"
            y1={H - 0.5}
            x2={W}
            y2={H - 0.5}
            stroke="var(--line)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          {hoverPoint !== undefined && hoverAt !== null && (
            <>
              <line
                className="profile-cursor"
                x1={hx}
                y1="0"
                x2={hx}
                y2={H}
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={hx}
                cy={hoverPoint?.y ?? 0}
                r="3"
                fill="#ffffff"
                stroke="var(--accent)"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}
        </svg>
        <input
          className="profile-scrub"
          type="range"
          min={0}
          max={spanMeters}
          step={profile.intervalMeters}
          value={hoverAt ?? 0}
          aria-label="Scrub the elevation profile"
          aria-valuetext={`${formatMiles(hoverAt ?? 0)} in, ${formatFeet(elevationAt(profile, hoverAt ?? 0))}`}
          onPointerDown={() => {
            // One cue per scrub, not per sample.
            if (!scrubbing.current) playTap(true);
            scrubbing.current = true;
          }}
          onKeyDown={() => {
            if (!scrubbing.current) playTap(true);
            scrubbing.current = true;
          }}
          onInput={(event) => props.onHover(Number(event.currentTarget.value))}
          onPointerUp={() => {
            scrubbing.current = false;
            props.onHover(null);
          }}
          onBlur={() => {
            scrubbing.current = false;
            props.onHover(null);
          }}
        />
      </div>
      {props.roundTrip && (
        <p className="profile-note">The way out. You come back the same way.</p>
      )}
      <figcaption className="profile-readout">
        <span>
          <b>&#8593;{formatFeet(profile.ascentMeters)}</b> up
        </span>
        <span>
          <b>&#8595;{formatFeet(profile.descentMeters)}</b> down
        </span>
        <span>
          <b>
            {formatFeet(profile.minMeters)}&#8211;{formatFeet(profile.maxMeters)}
          </b>{" "}
          elevation
        </span>
      </figcaption>
    </figure>
  );
}
