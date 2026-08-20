/**
 * Walking speed, km/h, applied to isochrones and routes alike so the contour
 * on the map and the minutes on the result card are answers to the same
 * question.
 *
 * 3.69 is not arbitrary: it is the pace at which Valhalla's 25 minute area
 * from Monroe Park matched Google's isochrone during the provider comparison
 * (see LAUNCH.md), i.e. the pace the app's shipped contours have always
 * implied. Changing it moves every contour, every ETA and every candidate
 * pool, so treat it as a product decision to be measured, not a constant to
 * be tweaked.
 *
 * It lives alone in its own module because three places have to agree on it
 * and two of them are not the proxy: the proxy asks the engine for this pace,
 * `scripts/build-reach.mjs` stamps it into every snapshot it writes, and
 * `seedFromSnapshot` refuses a snapshot stamped with anything else. When the
 * number moves, the presets stop being silently stale and become a cache miss
 * instead.
 */
export const WALKING_SPEED_KMH = 3.69;
