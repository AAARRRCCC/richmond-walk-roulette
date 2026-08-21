/**
 * Hills, as a property of a route rather than a label on a dot.
 *
 * The app used to carry `terrain: "flat" | "hilly"` beside each place, which
 * cannot express the thing a walker feels: Church Hill is flat once you are on
 * it and brutal on the way up, and which of those you get depends entirely on
 * where you started. So the tag goes and this arrives — measured from the same
 * route the map is already drawing, between the origin you actually chose and
 * the place you actually drew.
 *
 * Everything here is pure and imports nothing at runtime, so `node --test` runs
 * it by type-stripping alone.
 */
import type { ElevationProfile } from "./route.ts";

/**
 * Metres of wobble to ignore before calling a reversal real.
 *
 * A 30 m DEM sampled every 30 m produces a metre of noise on ground that is
 * flat to the foot, and counting it as climb turns a towpath into 40 m of
 * ascent. Two metres is above that noise and below any step a walker would
 * notice as a hill.
 */
export const ELEVATION_HYSTERESIS_M = 2;

/**
 * Smallest vertical span a chart is allowed to fill its box with.
 *
 * Without a floor, autoscaling makes a two-metre undulation look like a
 * mountain range: the chart is drawn to the data, and a walk along the canal
 * would read as terrain. 20 m means anything flatter than 20 m draws as the
 * gentle line it is.
 *
 * @public - consumed by `elevation-profile` (chunk 3).
 */
export const PROFILE_MIN_RANGE_M = 20;

/**
 * The rate at or under which a walk is easy, in metres of ascent per kilometre.
 * A judgement about this city; it should be tuned by walking, not by argument.
 *
 * @public - `classifyClimb` reads it here, and `elevation-profile` (chunk 3)
 * names it on screen so a reader can see what the filter is deciding on.
 */
export const CLIMB_EASY_MAX_M_PER_KM = 12;

/**
 * Total ascent at or above which a walk is hilly however far it ran.
 *
 * @public - as above.
 */
export const CLIMB_HILLY_MIN_M = 25;

/**
 * Most points a chart draws. Beyond this the SVG grows and the line does not.
 *
 * @public - consumed by `elevation-profile` (chunk 3).
 */
export const CHART_MAX_POINTS = 96;

/**
 * Valhalla's `kNoElevationData`, from `baldr/graphconstants.h`. Emitted raw by
 * the serializer when a graph was built without elevation — not null, not
 * absent, just a confident number five hundred metres below sea level.
 */
const NO_ELEVATION_M = -500;

/** @public - consumed by `elevation-profile` (chunk 3). */
export type ClimbBand = "easy" | "hilly";

/** @public - consumed by `elevation-profile` (chunk 3). */
export type ClimbTotals = { ascentMeters: number; descentMeters: number };

/**
 * Ascent and descent, with oscillations smaller than `hysteresisMeters`
 * suppressed.
 *
 * A turning-point walk rather than a sum of absolute deltas. The property that
 * matters, and that the tests assert: a monotone climb of H metres returns
 * exactly H however finely it was sampled, and a sawtooth whose teeth are
 * smaller than the threshold returns nothing at all. Summing deltas gets the
 * first right and the second catastrophically wrong.
 */
export function climbFrom(
  samples: readonly number[],
  hysteresisMeters: number,
): ClimbTotals {
  if (samples.length < 2) return { ascentMeters: 0, descentMeters: 0 };

  let up = 0;
  let down = 0;
  let runStart = samples[0] ?? 0;
  let pivot = runStart;
  // 0 means "either", and it resolves the moment a run clears the threshold -
  // not at the first reversal. Waiting for a reversal loses the peak: a walk
  // that climbs 30 m and then turns down is still "either" at the turn, so the
  // turn reads as extending a fall, the pivot slides back down, and 30 m of
  // ascent is silently discarded.
  let direction = 0;

  for (let index = 1; index < samples.length; index += 1) {
    const value = samples[index] ?? 0;
    if (direction >= 0 && value > pivot) {
      pivot = value;
      if (pivot - runStart >= hysteresisMeters) direction = 1;
    } else if (direction <= 0 && value < pivot) {
      pivot = value;
      if (runStart - pivot >= hysteresisMeters) direction = -1;
    } else if (Math.abs(value - pivot) >= hysteresisMeters) {
      if (direction >= 0) up += pivot - runStart;
      else down += runStart - pivot;
      runStart = pivot;
      pivot = value;
      direction = -direction;
    }
  }

  // The run still open when the samples ran out is real climb - but only if it
  // was ever real. Banking it unconditionally means the last few metres of
  // noise on a flat walk count as ascent while identical noise in the middle
  // does not, which is a hill that depends on where the walk happened to stop.
  const open = pivot - runStart;
  if (Math.abs(open) >= hysteresisMeters) {
    if (open > 0) up += open;
    else down += -open;
  }

  return { ascentMeters: Math.max(0, up), descentMeters: Math.max(0, down) };
}

/**
 * False for the no-data sentinel, for absurd values, and for fewer than two
 * samples.
 *
 * Presence is not the test. A chart that checked only that an `elevation` array
 * existed would draw a perfectly confident flat line at -500 m, which is what an
 * un-rebuilt graph hands over and what nothing else in the stack will flag.
 */
export function plausibleProfile(samples: readonly number[]): boolean {
  if (samples.length < 2) return false;
  return samples.every((value) => value > NO_ELEVATION_M + 400 && value < 2000);
}

/**
 * Easy or hilly, from the ascent and how far it was spread over.
 *
 * Rate is the primary test because 30 m over a ninety-minute walk is a gentle
 * ramp and 30 m over 800 m is Church Hill. The absolute floor exists so a short
 * steep climb cannot be diluted by a long flat approach.
 */
export function classifyClimb(ascentMeters: number, distanceMeters: number): ClimbBand {
  if (ascentMeters >= CLIMB_HILLY_MIN_M) return "hilly";
  const km = Math.max(distanceMeters, 1) / 1000;
  return ascentMeters / km <= CLIMB_EASY_MAX_M_PER_KM ? "easy" : "hilly";
}

/** Elevation at `meters` along the profile, clamped to both ends of `samples`. */
export function elevationAt(profile: ElevationProfile, meters: number): number {
  const { samples, intervalMeters } = profile;
  const last = samples.length - 1;
  if (last < 0) return 0;
  const position = meters / intervalMeters;
  if (position <= 0) return samples[0] ?? 0;
  if (position >= last) return samples[last] ?? 0;
  const index = Math.floor(position);
  const low = samples[index] ?? 0;
  const high = samples[index + 1] ?? low;
  return low + (high - low) * (position - index);
}

/** @public - consumed by `elevation-profile` (chunk 3). */
export type ProfilePoint = { x: number; y: number };

/**
 * Decimation to at most `maxPoints`, preserving the global minimum and maximum.
 *
 * The extremes are forced back in after striding because the readout prints
 * them: a chart whose peak sits eight feet below the number written under it is
 * a bug the eye cannot see and the ear catches the moment somebody reads both
 * aloud.
 *
 * @public - consumed by `elevation-profile` (chunk 3).
 */
export function resample(samples: readonly number[], maxPoints: number): number[] {
  if (samples.length <= maxPoints) return [...samples];
  if (maxPoints < 2) return samples.slice(0, Math.max(0, maxPoints));

  const step = (samples.length - 1) / (maxPoints - 1);
  const out: number[] = [];
  for (let index = 0; index < maxPoints; index += 1) {
    out.push(samples[Math.round(index * step)] ?? 0);
  }

  let lowIndex = 0;
  let highIndex = 0;
  samples.forEach((value, index) => {
    if (value < (samples[lowIndex] ?? 0)) lowIndex = index;
    if (value > (samples[highIndex] ?? 0)) highIndex = index;
  });

  for (const index of [lowIndex, highIndex]) {
    const slot = Math.min(maxPoints - 1, Math.round(index / step));
    out[slot] = samples[index] ?? 0;
  }
  return out;
}

/**
 * Chart geometry. `y` is 0 at the top of the box, matching SVG.
 *
 * @public - consumed by `elevation-profile` (chunk 3).
 */
export function profilePoints(
  samples: readonly number[],
  width: number,
  height: number,
  minRangeMeters: number,
): ProfilePoint[] {
  if (samples.length === 0) return [];
  const lo = Math.min(...samples);
  const hi = Math.max(...samples);
  const mid = (lo + hi) / 2;
  // Centred on the data's midpoint rather than anchored at its floor, so a walk
  // flatter than the minimum range draws through the middle of the box instead
  // of hugging the bottom of it.
  const range = Math.max(hi - lo, minRangeMeters);
  const top = mid + range / 2;
  const last = samples.length - 1;

  return samples.map((value, index) => ({
    x: last === 0 ? 0 : (index / last) * width,
    y: ((top - value) / range) * height,
  }));
}

/** Two decimals, so the `d` string is stable across renders and diffable. */
const at = (value: number): string => value.toFixed(2);

/**
 * The filled shape: the line, then down to the baseline and back.
 *
 * @public - consumed by `elevation-profile` (chunk 3).
 */
export function areaPath(points: readonly ProfilePoint[], height: number): string {
  if (points.length === 0) return "";
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) return "";
  const line = points.map((point, index) =>
    index === 0 ? `M ${at(point.x)} ${at(point.y)}` : `L ${at(point.x)} ${at(point.y)}`,
  );
  return `${line.join(" ")} L ${at(last.x)} ${at(height)} L ${at(first.x)} ${at(height)} Z`;
}

/**
 * The stroke alone, with no closing skirt.
 *
 * @public - consumed by `elevation-profile` (chunk 3).
 */
export function linePath(points: readonly ProfilePoint[]): string {
  return points
    .map((point, index) =>
      index === 0 ? `M ${at(point.x)} ${at(point.y)}` : `L ${at(point.x)} ${at(point.y)}`,
    )
    .join(" ");
}
