/**
 * Handing the walk to whichever map is on your phone.
 *
 * Two links, side by side, on every platform. No user-agent sniffing: Google
 * documents that its URL falls back to the browser when the app is absent, and
 * `maps.apple.com` is a universal link the Maps app claims on Apple platforms
 * and the Maps web app serves everywhere else. So sniffing can only be wrong —
 * it breaks the Mac user who lives in Chrome, the Android user who wants
 * Apple's web map, and every UA string the regex did not anticipate.
 *
 * Neither link hands over *our* walk. Both carry two coordinates, and both
 * providers recompute with their own graph and their own pedestrian speed, so
 * their minute counts will disagree with ours. That disagreement is the entire
 * reason this app exists, and the card says so in one quiet line rather than
 * letting somebody find it out on the sidewalk.
 *
 * **The Apple form is the unified one, and that reverses an earlier draft.**
 * The legacy Map Links shape (`?saddr=…&daddr=…&dirflg=w`) was never formally
 * withdrawn, but Apple's own answer to a report that it "no longer behaves as
 * expected" was to point at the replacement rather than to say it still works:
 *
 *   "See Adopting unified Maps URLs for the latest URL schema. You don't
 *    mention the iOS version, but the schema above was introduced in iOS 18.4."
 *   — developer.apple.com/forums/thread/784030
 *
 * Unified is documented at developer.apple.com/documentation/mapkit/unified-map-urls:
 * base `https://maps.apple.com/directions`, `source` and `destination` each
 * taking a bare `latitude,longitude`, and `mode` including `walking`, from iOS
 * 18.4 / macOS 15.4 (March 2025). The pre-18.4 tail is small and shrinking, and
 * the audience for this feature is precisely the phone that has already updated.
 *
 * If the manual check ever fails on an old device, the legacy form is:
 *
 *   https://maps.apple.com/?saddr=37.54696,-77.45024&daddr=37.529197,-77.452844&dirflg=w
 */
import { COORD_PRECISION, type LngLat } from "./geometry.ts";

/**
 * The origin, rounded. The destination is not, and the asymmetry is the point.
 *
 * This is the one place the app hands a coordinate to a third party. With
 * `geolocate` shipping, the origin can be a raw GPS fix, and
 * `String(37.546812345678)` exports centimetre-grade positioning for no
 * benefit. `pointKey` already collapses origins to exactly this precision for
 * cache keys and snapshot filenames, so the app itself cannot tell two origins
 * apart below it — handing out more precision than we use ourselves is a leak
 * with no function.
 *
 * A destination is a public landmark whose coordinates are already published in
 * `src/data/places.ts` and in this repo's git history, so rounding it buys no
 * privacy and would gratuitously move a pin.
 *
 * `Number(toFixed())` rather than the string, so a trim stays a trim: 37.5 stays
 * "37.5" instead of becoming "37.50000".
 */
function roundedPair(at: LngLat): string {
  return `${Number(at.lat.toFixed(COORD_PRECISION))},${Number(at.lng.toFixed(COORD_PRECISION))}`;
}

const exactPair = (at: LngLat): string => `${at.lat},${at.lng}`;

/**
 * Google Maps walking directions.
 *
 * The parameter order is the one the result card has always built. Do not tidy
 * it: this string is frozen by a test precisely so the extraction out of
 * `ResultCard` cannot have changed anyone's link.
 */
export function googleDirectionsUrl(from: LngLat, to: LngLat): string {
  return (
    "https://www.google.com/maps/dir/?api=1&travelmode=walking" +
    `&origin=${roundedPair(from)}` +
    `&destination=${exactPair(to)}`
  );
}

/** Apple Maps walking directions, unified Maps URL form (iOS 18.4+). */
export function appleDirectionsUrl(from: LngLat, to: LngLat): string {
  return (
    "https://maps.apple.com/directions" +
    `?source=${roundedPair(from)}` +
    `&destination=${exactPair(to)}` +
    "&mode=walking"
  );
}
