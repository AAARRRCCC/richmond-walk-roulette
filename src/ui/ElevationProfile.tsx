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
  /** Already mirrored for a round trip by the caller — see `mirrorProfile`. */
  profile: Profile;
  hoverMeters: number | null;
  onHover: (meters: number | null) => void;
};

/** User units. The element is width 100%; the viewBox is what keeps the maths whole. */
const W = 300;
const H = 76;

/**
 * The walk's shape, drawn from the route the map is already showing.
 *
 * There is no "flat" branch anywhere in here, and that is deliberate: a profile
 * whose real range is under 20 m is drawn inside a 20 m window, so its trace
 * sits near the vertical middle and wanders by a few pixels. It reads as flat
 * because it is flat. The floor on the range is the whole mechanism.
 *
 * Input is one `<input type="range">` laid transparently over the chart, which
 * buys pointer drag, touch drag, arrow keys and Home/End for nothing, and gets
 * a real focus ring from the `:has()` rule in the stylesheet — the global one
 * lands on an `opacity: 0` input and is invisible.
 */
export function ElevationProfile(props: ElevationProfileProps) {
  const gradientId = useId();
  // Two result cards in one document must not share a <defs> id.
  const scrubbing = useRef(false);

  const { profile } = props;
  const samples = resample(profile.samples, CHART_MAX_POINTS);
  const points = profilePoints(samples, W, H, PROFILE_MIN_RANGE_M);

  /**
   * The profile's own span, never the trip summary's length.
   *
   * They are two measurements of the same walk and they disagree by a few
   * metres, so using the summary would let the slider's last step index past the
   * end of `samples`.
   */
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
            // One cue when a scrub begins, and nothing per sample: a continuous
            // drag with a cue per step is a zip, not a control.
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
