/**
 * Where you are, and whether that is good enough to draw.
 *
 * Every decision this feature makes lives here, as pure functions with no DOM.
 * The impure remainder is six lines of `navigator` plumbing and two dispatches
 * in App, which is the point of splitting it this way: the interesting part is
 * the judgement, and the judgement is testable.
 *
 * The app's whole argument is that a contour is measured rather than assumed.
 * A fix with a 3 km error circle cannot support that claim - the 95% circle
 * swallows the innermost band whole - so this refuses it and says why, rather
 * than drawing a confident shape around a guess.
 */
import { insideRichmond } from "./bounds.ts";
import { formatAccuracy } from "./format.ts";
import { DEFAULT_ORIGIN, PRESET_ORIGINS, type Origin } from "../data/places.ts";
import type { LngLat } from "./geometry.ts";

/** What the browser handed back, flattened out of `GeolocationPosition`. */
export type Fix = { lat: number; lng: number; accuracyMeters: number };

/**
 * Everything the app has to say about where you are: why the browser would not
 * share a location, why we would not use what it shared, or a caveat on a fix we
 * did accept. One field rather than two, because one field is one thing to
 * clear and the origin action already clears it.
 *
 * `tone` exists because those are not the same kind of sentence. A refusal is a
 * warning and belongs in an assertive region; "located to within about 140 m" is
 * information about a fix that worked, and shouting it in amber tells the reader
 * something went wrong when nothing did.
 *
 * `suggest` is a preset to offer as a way forward, or null when there is no
 * sensible one - a denial is not fixed by moving to Carytown.
 */
export type LocationNotice = {
  message: string;
  tone: "warn" | "info";
  suggest: Origin | null;
};

export type LocateOutcome =
  | { kind: "accepted"; origin: Origin; caveat: LocationNotice | null }
  | { kind: "rejected"; error: LocationNotice };

/**
 * Above this, the 95% error circle swallows the innermost band.
 *
 * A five-minute walk is about 300 m at the pace this app pins, so a fix that
 * could be anywhere inside a 250 m radius cannot support a five-minute contour.
 * The number is a judgement about what this app claims, not about GPS.
 */
export const MAX_ACCURACY_METERS = 250;

/** Above this the fix is usable but worth saying out loud. */
export const CAVEAT_ACCURACY_METERS = 100;

/** The whole accept/reject decision, given only a fix. */
export function judgeFix(fix: Fix): LocateOutcome {
  // Three lines, and the same honesty argument as the rest of this file.
  // `coords` is normally clean, but a NaN falls through `insideRichmond` as
  // false - every comparison against NaN is false - and lands in
  // `nearestPreset`, where every score is NaN, every comparison is false, and
  // the reduce returns the first preset. A garbage fix would produce "you are
  // outside Richmond, start from Home" with total confidence.
  if (
    !Number.isFinite(fix.lat) ||
    !Number.isFinite(fix.lng) ||
    !Number.isFinite(fix.accuracyMeters)
  ) {
    return {
      kind: "rejected",
      error: {
        message: "Your device reported a position this can't read. Drop a pin on the map instead.",
        tone: "warn",
        suggest: null,
      },
    };
  }

  // Bounds before accuracy, and the order is load-bearing: a wildly inaccurate
  // fix in another state should be told about the state, which is the fact that
  // actually explains why this app cannot help.
  if (!insideRichmond(fix)) {
    return {
      kind: "rejected",
      error: {
        message:
          "That's outside the area this knows. Walk Roulette only has Richmond — its map, its " +
          "places and its walking times all stop at the city.",
        tone: "warn",
        suggest: nearestPreset(fix),
      },
    };
  }

  if (fix.accuracyMeters > MAX_ACCURACY_METERS) {
    return {
      kind: "rejected",
      error: {
        message:
          `Your device could only place you to within about ${formatAccuracy(fix.accuracyMeters)}. ` +
          "A five-minute walk is about 300 m, so a contour drawn from that fix would be mostly " +
          "guesswork. Drop a pin on the map instead.",
        tone: "warn",
        suggest: null,
      },
    };
  }

  const origin: Origin = { id: "me", name: "My location", lat: fix.lat, lng: fix.lng };
  const caveat: LocationNotice | null =
    fix.accuracyMeters > CAVEAT_ACCURACY_METERS
      ? {
          message: `Located to within about ${formatAccuracy(fix.accuracyMeters)} — the edges are approximate.`,
          tone: "info",
          suggest: null,
        }
      : null;

  return { kind: "accepted", origin, caveat };
}

/**
 * Nearest preset, by an equirectangular approximation over `PRESET_ORIGINS`.
 *
 * Squared values, so nothing needs a square root. Degrees are fine as the unit
 * because only the ordering matters, and the cosine correction is what keeps
 * longitude from being over-weighted at 37 degrees north.
 *
 * **This is not a distance and must never be displayed as one.** An honest note
 * for whoever writes the tests: at Richmond's scale the correction almost never
 * changes the winner - the presets span 0.043 degrees of latitude against 0.061
 * of longitude, and the naive score picks the same preset for every fixture
 * worth pinning. It changes the ordering only for near-tie diagonal points,
 * which is exactly the kind of fixture a test should not be built on. The
 * correction is here because the comparison is wrong without it, and it is
 * defended by this comment rather than by an assertion.
 */
export function nearestPreset(at: LngLat): Origin {
  const scale = Math.cos((at.lat * Math.PI) / 180);
  // `DEFAULT_ORIGIN` rather than `PRESET_ORIGINS[0]`: it is the same element and
  // it is already typed as an `Origin`, so the seed needs no assertion. It is
  // only ever returned when every score is NaN, which `judgeFix` guards against
  // before it ever calls here.
  let best: Origin = DEFAULT_ORIGIN;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const preset of PRESET_ORIGINS) {
    const dx = (preset.lng - at.lng) * scale;
    const dy = preset.lat - at.lat;
    const score = dx * dx + dy * dy;
    if (score < bestScore) {
      bestScore = score;
      best = preset;
    }
  }
  return best;
}

/** Every sentence here is a refusal, and no refusal is fixed by a preset. */
const warn = (message: string): LocationNotice => ({ message, tone: "warn", suggest: null });

/**
 * The four sentences, keyed on `GeolocationPositionError.code`.
 *
 * Every one carries `tone: "warn"` and `suggest: null`, and every one ends by
 * naming the way forward that always works, because the pin is always there.
 * None suggests a preset: a permission problem is not solved by starting from
 * Maymont.
 */
export function describeGeolocationError(code: number, secureContext: boolean): LocationNotice {
  if (code === 1 && !secureContext) {
    return warn(
      "This page isn't on a secure connection, so the browser won't share a location. Drop a pin " +
        "on the map instead.",
    );
  }
  if (code === 1) {
    return warn(
      "Location is blocked for this site. You can turn it back on in your browser's site " +
        "settings — or just drop a pin on the map.",
    );
  }
  if (code === 3) {
    return warn("Locating took too long and gave up. Try again, or drop a pin on the map.");
  }
  // Code 2, and every unknown code: "unavailable" is true of all of them.
  return warn(
    "Your device couldn't get a fix. That usually means no GPS and no known wifi — try again " +
      "outdoors, or drop a pin on the map.",
  );
}

/** @public - consumed by `OriginPicker` from chunk 6 onward. */
export type PermissionHint = "granted" | "denied" | "prompt" | "unknown";

/**
 * What the action should be called, given whatever we know.
 *
 * "Use my location" is a promise the button cannot keep when permission is
 * already denied - pressing it can only produce the same refusal - so in that
 * state it says what it will actually do.
 */
export function locateActionLabel(hint: PermissionHint): string {
  return hint === "denied" ? "Location is blocked" : "Use my location";
}
