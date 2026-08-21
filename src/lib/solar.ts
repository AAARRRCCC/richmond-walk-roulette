/**
 * Where the sun is, for one place on one day.
 *
 * Ported from NOAA's Solar Calculator (gml.noaa.gov/grad/solcalc/), whose
 * formulas are from Meeus, *Astronomical Algorithms*, chapters 25 and 15.
 * Fetched 2026-08-21. Work of the US federal government, so not under copyright
 * in the United States (17 U.S.C. section 105); the page states no licence of
 * its own. It is copied rather than linked because NOAA's own page says the
 * calculator is "no longer actively supported or maintained", which is a poor
 * thing to have as a runtime dependency and a fine thing to have as sixty lines
 * of committed arithmetic.
 *
 * Deliberately single-pass: NOAA iterates the declination against the computed
 * rise/set time for sub-second accuracy. One pass costs about a minute of error
 * at Richmond's latitude, which is measured against three USNO fixtures in
 * `solar.test.ts`, and a minute does not change any decision this app makes.
 *
 * It is vendored rather than depended on because the whole calculation is sixty
 * lines of arithmetic with no state, no I/O and no configuration, and every
 * library that does it ships a timezone database this app does not need —
 * `Intl` already has one.
 *
 * Two rules hold the accuracy together, and both are easy to lose:
 *
 * 1. **Everything is computed in UTC.** The only thing the Richmond timezone
 *    decides is *which calendar day* the events belong to. Doing the arithmetic
 *    in local time and correcting afterwards is where DST bugs come from.
 * 2. **Longitude is east-positive** (-77.436 for Richmond). NOAA's published
 *    spreadsheet is west-positive and the sign flip is the single most common
 *    way this port comes out twelve hours wrong.
 *
 */
import { RICHMOND_TZ } from "./format.ts";

/** Refraction-corrected solar disc at the horizon. */
const ZENITH_SUNRISE = 90.833;

/**
 * Civil twilight: the sun 6 degrees below the horizon. This is the app's
 * definition of "dark" — the point where you can no longer comfortably read a
 * path — rather than sunset, which still leaves half an hour of usable light.
 */
const ZENITH_CIVIL = 96;

const MS_PER_MINUTE = 60_000;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
const toDegrees = (radians: number): number => (radians * 180) / Math.PI;

/**
 * All fields are epoch milliseconds (UTC). Null when the sun does not cross
 * that altitude on the given day — impossible at Richmond's latitude, present
 * because the arithmetic is general and a silent NaN is worse.
 *
 * @public - consumed by `daylight-budget` (chunk 5).
 */
export type SolarEvents = {
  /** The Richmond-local calendar day these events belong to, as YYYY-MM-DD. */
  day: string;
  civilDawnMs: number | null;
  sunriseMs: number | null;
  solarNoonMs: number;
  sunsetMs: number | null;
  civilDuskMs: number | null;
};

const DAY_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: RICHMOND_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * The Richmond calendar day containing `atMs`, as YYYY-MM-DD.
 *
 * `en-CA` because its short date format *is* ISO order, so the parts come back
 * in the order they are needed and nothing has to be reassembled by index.
 */
function richmondDay(atMs: number) {
  const parts = DAY_PARTS.formatToParts(atMs);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const date = Number(parts.find((part) => part.type === "day")?.value);
  const day = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
  return { day, year, month, date };
}

/** Julian Day for 00:00 UTC of a Gregorian calendar date. */
function julianDay(year: number, month: number, date: number): number {
  let y = year;
  let m = month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + date + b - 1524.5;
}

/**
 * Sun times for the Richmond calendar day containing `atMs`.
 *
 * `lng` is east-positive. Every returned instant is an absolute epoch time, so
 * a value that falls outside the day it was computed for — a sunset past UTC
 * midnight, say — is correct rather than something to clamp.
 *
 * @public - consumed by `daylight-budget` (chunk 5) and `opening-hours` (9).
 */
export function solarEvents(atMs: number, lat: number, lng: number): SolarEvents {
  const { day, year, month, date } = richmondDay(atMs);
  const dayUtcMidnightMs = Date.UTC(year, month - 1, date);

  const jd = julianDay(year, month, date);
  const t = (jd - 2_451_545) / 36_525;

  const l0 = (280.46646 + t * (36_000.76983 + t * 0.0003032)) % 360;
  const m = 357.52911 + t * (35_999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const c =
    Math.sin(toRadians(m)) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(toRadians(2 * m)) * (0.019993 - 0.000101 * t) +
    Math.sin(toRadians(3 * m)) * 0.000289;

  const omega = 125.04 - 1934.136 * t;
  const lambda = l0 + c - 0.00569 - 0.00478 * Math.sin(toRadians(omega));

  const seconds = 21.448 - t * (46.815 + t * (0.00059 - t * 0.001813));
  const e0 = 23 + (26 + seconds / 60) / 60;
  const eps = e0 + 0.00256 * Math.cos(toRadians(omega));

  const dec = Math.asin(Math.sin(toRadians(eps)) * Math.sin(toRadians(lambda)));

  const y2 = Math.tan(toRadians(eps / 2)) ** 2;
  const eqTime =
    4 *
    toDegrees(
      y2 * Math.sin(toRadians(2 * l0)) -
        2 * e * Math.sin(toRadians(m)) +
        4 * e * y2 * Math.sin(toRadians(m)) * Math.cos(toRadians(2 * l0)) -
        0.5 * y2 * y2 * Math.sin(toRadians(4 * l0)) -
        1.25 * e * e * Math.sin(toRadians(2 * m)),
    );

  /** Degrees of hour angle from noon to the given zenith, or null for no crossing. */
  function hourAngle(zenith: number): number | null {
    const cosH =
      Math.cos(toRadians(zenith)) / (Math.cos(toRadians(lat)) * Math.cos(dec)) -
      Math.tan(toRadians(lat)) * Math.tan(dec);
    if (Math.abs(cosH) > 1) return null;
    return toDegrees(Math.acos(cosH));
  }

  // Rounded to a whole millisecond. The arithmetic is in fractional minutes, and
  // an epoch instant carrying a fraction of a millisecond is a value no clock
  // has - it survives arithmetic fine and then fails to round-trip through a
  // Date, which is exactly what `sunTimes` does with it.
  const msFor = (utcMinutes: number): number =>
    Math.round(dayUtcMidnightMs + utcMinutes * MS_PER_MINUTE);
  const noonUtcMinutes = 720 - 4 * lng - eqTime;

  const riseSet = (zenith: number) => {
    const ha = hourAngle(zenith);
    // Null on both, together: a zenith the sun never reaches has no rise and no
    // set, and reporting one without the other would be a day half-described.
    if (ha === null) return { rise: null, set: null };
    return {
      rise: msFor(720 - 4 * (lng + ha) - eqTime),
      set: msFor(720 - 4 * (lng - ha) - eqTime),
    };
  };

  const sun = riseSet(ZENITH_SUNRISE);
  const civil = riseSet(ZENITH_CIVIL);

  return {
    day,
    civilDawnMs: civil.rise,
    sunriseMs: sun.rise,
    solarNoonMs: msFor(noonUtcMinutes),
    sunsetMs: sun.set,
    civilDuskMs: civil.set,
  };
}

/**
 * The shape `opening-hours` asked for, and the only reason it exists.
 *
 * @public - consumed by `opening-hours` (chunk 9).
 */
export type SunTimes = { sunrise: Date; sunset: Date };

/**
 * Sun times for the Richmond-local calendar date containing `at`, at `point`.
 * Null when either phenomenon does not occur.
 *
 * A four-line adapter, and the asymmetry in it is deliberate: `opening-hours`
 * is `Date`-based throughout because it compares wall clocks, while everything
 * in `daylight-budget` is epoch-ms because it does arithmetic. This is where the
 * two worlds meet, and one adapter is cheaper than a conversion at every call.
 *
 * @public - consumed by `opening-hours` (chunk 9).
 */
export function sunTimes(at: Date, point: { lat: number; lng: number }): SunTimes | null {
  const events = solarEvents(at.getTime(), point.lat, point.lng);
  if (events.sunriseMs === null || events.sunsetMs === null) return null;
  return { sunrise: new Date(events.sunriseMs), sunset: new Date(events.sunsetMs) };
}
