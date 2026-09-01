/**
 * Walking speed, km/h, applied to isochrones and routes alike so the contour
 * on the map and the minutes on the result card are answers to the same
 * question.
 *
 * 4.5 is not arbitrary: it is roughly the pace a mapping provider assumes for
 * an average walker, and it replaced a 3.69 that had been calibrated against
 * Google's *isochrone* rather than against anybody walking. That older number
 * survived a 673-route measurement of the engine against itself (HUMAN-REVIEW
 * 2.5) and still failed the only test that counts: a real walk, downtown to
 * the Virginia Holocaust Museum, which the app called 22 minutes, Google called
 * 18, and a person finished in 15:57. A pin set to agree with Google that
 * disagrees with Google by 22% is measuring something other than walking.
 *
 * It is an average walker's pace and not the pace of whoever is holding the
 * phone, because meet-in-the-middle shares one pin between two people: the
 * arithmetic only works if both are assumed to cover the same ground in the
 * same minutes, and neither of them agreed to the other's speed. Erring under
 * the faster walker is the right direction for the error to run.
 *
 * Changing it moves every contour, every ETA and every candidate pool, so treat
 * it as a product decision to be measured, not a constant to be tweaked. See
 * docs/adr/0002-walking-speed-4-5.md.
 *
 * It lives alone in its own module because three places have to agree on it
 * and two of them are not the proxy: the proxy asks the engine for this pace,
 * `scripts/build-reach.mjs` stamps it into every snapshot it writes, and
 * `seedFromSnapshot` refuses a snapshot stamped with anything else. When the
 * number moves, the presets stop being silently stale and become a cache miss
 * instead.
 */
export const WALKING_SPEED_KMH = 4.5;
