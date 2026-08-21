const MILES_PER_METER = 1 / 1609.344;

export function formatMiles(meters: number): string {
  const miles = meters * MILES_PER_METER;
  return miles < 0.1 ? `${Math.round(meters * 3.28084)} ft` : `${miles.toFixed(1)} mi`;
}

export function formatMinutes(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
}

/**
 * Reachable area in square miles. Square kilometres would be the tidier unit,
 * but every other number on this screen is imperial and mixing them is worse
 * than being slightly gauche.
 */
export function formatArea(sqMeters: number): string {
  const sqMiles = sqMeters / 2_589_988;
  if (sqMiles < 0.1) return `${sqMiles.toFixed(2)} sq mi`;
  return `${sqMiles.toFixed(1)} sq mi`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Richmond, always. Every clock time this app prints is a Richmond time,
 * whatever the device is set to: a walker in Richmond wants dusk in Richmond,
 * and a reader elsewhere looking at a shared spin wants to know when it gets
 * dark *there*, not where they are sitting.
 *
 * @public - consumed by `daylight-budget` (chunk 5) and `opening-hours`
 * (chunk 9); nothing imports it yet.
 */
export const RICHMOND_TZ = "America/New_York";

/**
 * One formatter, built once at module scope rather than per call: constructing
 * an Intl.DateTimeFormat is the expensive part, and this one runs on a
 * once-a-minute tick behind every clock string in the app.
 *
 * No try/catch. A platform without full-ICU `Intl` cannot format a Richmond
 * time from a UTC instant at all, and a fallback would print a plausible wrong
 * time in the device's own zone - which is exactly the failure this app is
 * being rebuilt to stop making silently.
 */
const CLOCK = new Intl.DateTimeFormat("en-US", {
  timeZone: RICHMOND_TZ,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/**
 * "8:21 pm" - lowercase meridiem, no leading zero, Richmond time.
 *
 * Assembled from parts rather than taken from `format()` because the meridiem
 * separator and casing are locale output, not contract, and this string is
 * compared literally in tests and embedded in copy by three features.
 *
 * @public - consumed by `daylight-budget` (chunk 5) onward.
 */
export function formatClock(atMs: number): string {
  const parts = CLOCK.formatToParts(atMs);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "";
  const meridiem = parts.find((part) => part.type === "dayPeriod")?.value ?? "";
  return `${hour}:${minute} ${meridiem.toLowerCase()}`;
}

/**
 * "72°F". Rounded: a tenth of a degree is noise on a sidewalk, and a decimal
 * reads as a measurement somebody took rather than as the model output it is.
 *
 * @public - consumed by `weather-filters` (chunk 7).
 */
export function formatFahrenheit(f: number): string {
  return `${Math.round(f)}°F`;
}

/**
 * "now", "in 40 min", "in 2 hr 10 min". Minutes, not seconds — this is a
 * forecast horizon, and a forecast is not accurate to the second.
 *
 * Anything at or below zero is "now" rather than a negative: a rule reading a
 * horizon that has already passed is still describing this minute's weather.
 *
 * @public - consumed by `weather-filters` (chunk 7).
 */
export function formatHorizon(minutes: number): string {
  const whole = Math.round(minutes);
  if (whole <= 0) return "now";
  if (whole < 60) return `in ${whole} min`;
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest === 0 ? `in ${hours} hr` : `in ${hours} hr ${rest} min`;
}

/**
 * "UV 9". Whole numbers, because the EPA scale is one.
 *
 * @public - consumed by `weather-filters` (chunk 7).
 */
export function formatUv(index: number): string {
  return `UV ${Math.round(index)}`;
}

/**
 * Elevation, in feet, with no decimal.
 *
 * A foot of precision on a 30 m DEM is a fiction, and "112 ft" reads as a fact
 * while "112.4 ft" reads as a measurement somebody took. Every displayed
 * elevation goes through this.
 */
export function formatFeet(meters: number): string {
  return `${Math.round(meters * 3.28084)} ft`;
}

/**
 * A GPS accuracy radius, with its unit attached.
 *
 * The unit has to live in here. A caller that formats the magnitude and appends
 * " m" itself will one day print "within about 3.1 m" for a 3.1 km fix, in the
 * one sentence whose whole job is to state a magnitude honestly.
 *
 * Metres, against this file's own imperial house rule, and deliberately: this is
 * the device's own number, reported in metres by the Geolocation API, and
 * converting it would dress a plus-or-minus 3000 m guess up as "10171 ft".
 */
export function formatAccuracy(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
