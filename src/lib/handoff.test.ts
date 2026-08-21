import { test } from "node:test";
import assert from "node:assert/strict";
import { appleDirectionsUrl, googleDirectionsUrl } from "./handoff.ts";

const MONROE = { lat: 37.546961, lng: -77.450237 }; // preset origin, six decimals
const BELLE = { lat: 37.529197, lng: -77.452844 }; // a real place, six decimals

const GOOGLE =
  "https://www.google.com/maps/dir/?api=1&travelmode=walking" +
  "&origin=37.54696,-77.45024&destination=37.529197,-77.452844";
const APPLE =
  "https://maps.apple.com/directions" +
  "?source=37.54696,-77.45024&destination=37.529197,-77.452844&mode=walking";

test("handoff: googleDirectionsUrl emits the exact expected string", () => {
  // The regression guard the whole extraction exists for.
  assert.equal(googleDirectionsUrl(MONROE, BELLE), GOOGLE);
});

test("handoff: the Google URL is unchanged apart from origin rounding", () => {
  // The Home preset is already at five decimals, so nothing rounds and the
  // output must be character-for-character what the old inline template
  // produced. Pins that the rounding is a trim, not a reformat.
  const home = { lat: 37.5388, lng: -77.4336 };
  assert.equal(
    googleDirectionsUrl(home, BELLE),
    "https://www.google.com/maps/dir/?api=1&travelmode=walking" +
      "&origin=37.5388,-77.4336&destination=37.529197,-77.452844",
  );
});

test("handoff: appleDirectionsUrl uses the unified form with walking mode", () => {
  assert.equal(appleDirectionsUrl(MONROE, BELLE), APPLE);

  // Asserted structurally as well as literally, so a refactor cannot drop the
  // mode or slide back to the legacy path while keeping the string plausible.
  const url = new URL(appleDirectionsUrl(MONROE, BELLE));
  assert.equal(url.pathname, "/directions");
  assert.equal(url.searchParams.get("mode"), "walking");
});

test("handoff: both are absolute https URLs on the expected hosts", () => {
  for (const [url, host] of [
    [new URL(googleDirectionsUrl(MONROE, BELLE)), "www.google.com"],
    [new URL(appleDirectionsUrl(MONROE, BELLE)), "maps.apple.com"],
  ] as const) {
    assert.equal(url.protocol, "https:");
    assert.equal(url.host, host);
  }
});

test("handoff: origin and destination are distinct and in the right order", () => {
  // The classic swap, and a check that the destination is not rounded.
  const google = new URL(googleDirectionsUrl(MONROE, BELLE)).searchParams;
  const apple = new URL(appleDirectionsUrl(MONROE, BELLE)).searchParams;

  assert.equal(google.get("origin"), "37.54696,-77.45024");
  assert.equal(apple.get("source"), "37.54696,-77.45024");
  assert.equal(google.get("destination"), "37.529197,-77.452844");
  assert.equal(apple.get("destination"), "37.529197,-77.452844");
});

test("handoff: nothing is percent-encoded", () => {
  // Asserting that %2D is absent has no teeth - encodeURIComponent("-") returns
  // "-" unchanged - so the whole query string is compared, comma and minus and
  // all.
  assert.equal(
    googleDirectionsUrl(MONROE, BELLE).split("?")[1],
    "api=1&travelmode=walking&origin=37.54696,-77.45024&destination=37.529197,-77.452844",
  );
  assert.equal(
    appleDirectionsUrl(MONROE, BELLE).split("?")[1],
    "source=37.54696,-77.45024&destination=37.529197,-77.452844&mode=walking",
  );
});

test("handoff: the origin is rounded and the destination is not", () => {
  // The privacy decision, pinned. A raw GPS fix must not leave here at
  // centimetre grade; a published landmark must not be moved.
  const fix = { lat: 37.546812345678, lng: -77.451987654 };
  const exact = { lat: 37.5291973456, lng: -77.4528441234 };
  const google = new URL(googleDirectionsUrl(fix, exact)).searchParams;

  assert.equal(google.get("origin"), "37.54681,-77.45199");
  assert.equal(google.get("destination"), "37.5291973456,-77.4528441234");
});

test("handoff: rounding drops trailing zeros", () => {
  const flat = { lat: 37.5, lng: -77.4 };
  assert.equal(new URL(googleDirectionsUrl(flat, BELLE)).searchParams.get("origin"), "37.5,-77.4");
});
