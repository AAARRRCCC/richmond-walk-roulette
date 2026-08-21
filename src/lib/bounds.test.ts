import { test } from "node:test";
import assert from "node:assert/strict";
import { RICHMOND_BOUNDS, insideRichmond } from "./bounds.ts";

test("a downtown fix is inside the box", () => {
  // The Monroe Ward fixture server/proxy.test.ts already uses, so the two
  // sides of the bounds check are asserted against the same coordinate.
  assert.equal(insideRichmond({ lat: 37.5464, lng: -77.4517 }), true);
});

test("the edges of the box count as inside", () => {
  const { south, west, north, east } = RICHMOND_BOUNDS;
  for (const corner of [
    { lat: south, lng: west },
    { lat: south, lng: east },
    { lat: north, lng: west },
    { lat: north, lng: east },
  ]) {
    assert.equal(insideRichmond(corner), true, `corner ${corner.lat},${corner.lng}`);
  }

  // A tenth of a thousandth of a degree past an edge is out. The margin is
  // deliberately tiny: the check has to be an inequality on the boundary
  // itself, not an approximate one that a rounded coordinate could slip past.
  assert.equal(insideRichmond({ lat: south - 0.0001, lng: west }), false);
  assert.equal(insideRichmond({ lat: south, lng: east + 0.0001 }), false);
});

test("other Virginia cities are outside it", () => {
  assert.equal(insideRichmond({ lat: 38.0293, lng: -78.4767 }), false, "Charlottesville");
  assert.equal(insideRichmond({ lat: 36.8508, lng: -76.2859 }), false, "Norfolk");
});
