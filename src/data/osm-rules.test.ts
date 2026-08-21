/**
 * The classification table, on hand-written elements and no network.
 *
 * Every fixture is a real tag combination from the Richmond box rather than an
 * invented one, because the rules exist to sort what OpenStreetMap actually
 * contains: 956 `historic=*` elements of which 735 are building-ish, 200
 * memorials of which ~165 are plaques, and 1,223 food amenities nobody wants in
 * a destination list.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { NAME_MAX } from "./places.ts";
import {
  DEDUP_METERS,
  PLACE_BOUNDS,
  classify,
  placeId,
  placeName,
  type ClassifyResult,
  type OsmCandidate,
} from "./osm-rules.ts";

/** Somewhere comfortably inside the harvest box. */
const SEED = { lat: 37.5464, lng: -77.4517 };

const candidate = (tags: Record<string, string>, seed = SEED): OsmCandidate => ({
  osm: "way/1",
  seed,
  tags: new Map(Object.entries(tags)),
});

/** The reason, or a message naming what came back instead. */
const rejection = (result: ClassifyResult): string =>
  result.ok ? `accepted: ${JSON.stringify(result.classification)}` : result.reason;

const accepted = (result: ClassifyResult) => {
  assert.ok(result.ok, rejection(result));
  return result.classification;
};

test("a lifecycle-tagged element is refused", () => {
  assert.equal(
    rejection(classify(candidate({ "disused:amenity": "marketplace", name: "Old Market" }))),
    "lifecycle",
  );
  // And by value, not only by key prefix.
  assert.equal(
    rejection(classify(candidate({ leisure: "park", name: "Future Park", park: "proposed" }))),
    "lifecycle",
  );
});

test("a private place is refused", () => {
  assert.equal(
    rejection(classify(candidate({ leisure: "park", name: "Private Green", access: "private" }))),
    "access",
  );
});

test("a cafe is refused and a marketplace is kept", () => {
  // The pair that encodes the whole commercial rule. Neighbourhoods and
  // institutions outlive shops; a market outlives its vendors.
  assert.equal(rejection(classify(candidate({ amenity: "cafe", name: "Lamplighter" }))), "commercial");
  assert.equal(rejection(classify(candidate({ shop: "books", name: "Chop Suey Books" }))), "commercial");

  const market = accepted(classify(candidate({ amenity: "marketplace", name: "17th Street Market" })));
  assert.ok(market.tags.includes("food"));
  assert.equal(market.detour, null);
});

test("an element that collects no vibe is refused rather than shipped unreachable", () => {
  // A dot no chip can filter to would sit in the data forever, invisible to the
  // one control that could find it. Absent is better.
  const spring = classify(candidate({ natural: "spring", name: "Cold Spring" }));
  assert.equal(rejection(spring), "no-vibe");
});

test("artwork_type decides mural against public art", () => {
  const mural = accepted(
    classify(candidate({ tourism: "artwork", artwork_type: "mural", name: "Flood Wall Murals" })),
  );
  assert.equal(mural.detour, "mural");

  const art = accepted(
    classify(candidate({ tourism: "artwork", artwork_type: "sculpture", name: "Headman Statue" })),
  );
  assert.equal(art.detour, "art");
});

test("a memorial with a subtype is a marker", () => {
  // The ~165-element case, and the largest detour source in the city.
  const plaque = accepted(
    classify(candidate({ historic: "memorial", memorial: "plaque", name: "Richmond Slave Trail" })),
  );
  assert.equal(plaque.detour, "marker");
  assert.ok(plaque.tags.includes("history"));
});

test("a park is a destination, not a detour", () => {
  const park = accepted(classify(candidate({ leisure: "park", name: "Bryan Park" })));
  assert.equal(park.detour, null);
  assert.deepEqual(park.tags, ["park"]);
});

test("steps are stairs, and scenic", () => {
  const steps = accepted(classify(candidate({ highway: "steps", name: "Libby Hill Steps" })));
  assert.equal(steps.detour, "stairs");
  assert.ok(steps.tags.includes("scenic"));
});

test("a riverside park collects both river and scenic", () => {
  const riverside = accepted(
    classify(candidate({ leisure: "park", name: "James River Park" })),
  );
  assert.deepEqual(riverside.tags.toSorted(), ["park", "river", "scenic"]);
});

test("wikidata never gates, it only scores", () => {
  // Measured: 6 of 200 memorials carry it. Gating would delete the tier.
  const plain = accepted(classify(candidate({ leisure: "park", name: "Bryan Park" })));
  const notable = accepted(
    classify(candidate({ leisure: "park", name: "Bryan Park", wikidata: "Q123" })),
  );

  assert.equal(notable.detour, plain.detour);
  assert.deepEqual(notable.tags, plain.tags);
  assert.ok(notable.score > plain.score, "and it does move the ranking");
});

test("score is additive and clamps at 100", () => {
  const everything = accepted(
    classify(
      candidate({
        leisure: "park",
        name: "A Thoroughly Documented Park",
        wikidata: "Q1",
        wikipedia: "en:Park",
        heritage: "2",
        website: "https://example.org",
        wikimedia_commons: "Category:Park",
        description: "A park.",
        artwork_type: "sculpture",
      }),
    ),
  );
  assert.equal(everything.score, 100);
});

test("placeName refuses a name that cannot stand on its own", () => {
  assert.equal(placeName(candidate({ tourism: "artwork", name: "Untitled" })), null);
  assert.equal(placeName(candidate({ tourism: "artwork", name: "Untitled (No. 4)" })), null);
  assert.equal(placeName(candidate({ leisure: "park", name: "RVA" })), null);
  assert.equal(placeName(candidate({ leisure: "park" })), null);
  // Over-length is rejected at source rather than shipped for places.test.ts to
  // catch: the test governs the file, this governs what reaches it.
  assert.equal(placeName(candidate({ leisure: "park", name: "x".repeat(NAME_MAX + 1) })), null);
  assert.equal(placeName(candidate({ leisure: "park", name: "x".repeat(NAME_MAX) })), "x".repeat(NAME_MAX));
});

test("a name that is really a street address is refused", () => {
  // Measured: of 52 markers the first propose run accepted, 38 were Historic
  // Richmond house plaques named like this. "Marker: 635 North 27th Street" is
  // an address, not an offer.
  assert.equal(placeName(candidate({ historic: "memorial", name: "2816 E. Grace" })), null);
  assert.equal(placeName(candidate({ historic: "memorial", name: "605 N. 25th Street" })), null);
  assert.equal(placeName(candidate({ historic: "memorial", name: "314 N. 32nd St" })), null);
  assert.equal(placeName(candidate({ historic: "memorial", name: "3013 Libby Terrace" })), null);

  // A number that is part of the name survives, because it is not an address.
  assert.equal(placeName(candidate({ amenity: "marketplace", name: "17th Street Market" })), "17th Street Market");
  assert.equal(placeName(candidate({ tourism: "gallery", name: "1708 Gallery" })), "1708 Gallery");
});

test("a ghost bike is refused by name", () => {
  // A memorial to one named cyclist killed in traffic. Four are in the box, and
  // the first propose run accepted three - drawn at random and presented as a
  // small delight, with no room on the card to say what the place is.
  const bike = candidate({
    historic: "memorial",
    memorial: "ghost_bike",
    name: "Robyn Hightman",
  });
  assert.equal(rejection(classify(bike)), "in-memoriam");

  // And the ordinary plaque beside it is untouched.
  const plaque = candidate({ historic: "memorial", memorial: "plaque", name: "Powhatan Stone" });
  assert.ok(classify(plaque).ok);
});

test("placeId is slugged, stable and deduped", () => {
  const church = candidate({ historic: "church", name: "St. John's Church" });
  assert.equal(placeId(church, "St. John's Church", new Set()), "st-johns-church");
  // Same input, same id: this is what lets apply-places refuse a row it has
  // already appended.
  assert.equal(placeId(church, "St. John's Church", new Set()), "st-johns-church");
  assert.equal(
    placeId(church, "St. John's Church", new Set(["st-johns-church"])),
    "st-johns-church-2",
  );
});

test("a seed outside the harvest box is refused", () => {
  const outside = candidate({ leisure: "park", name: "Somewhere Else" }, { lat: 38.9072, lng: -77.0369 });
  assert.equal(rejection(classify(outside)), "out-of-bounds");
});

test("the harvest box sits inside the app's own bounds", () => {
  // Tighter on purpose: the proxy's box is about refusing to be a worldwide
  // routing service, and this one is about what counts as Richmond.
  assert.ok(PLACE_BOUNDS.south > 37.3 && PLACE_BOUNDS.north < 37.8);
  assert.ok(PLACE_BOUNDS.west > -77.9 && PLACE_BOUNDS.east < -77.1);
});

test("an element matching no rule is not a place", () => {
  assert.equal(rejection(classify(candidate({ building: "yes", name: "Some Building" }))), "not-a-place");
  // 735 of the city's 956 historic=* elements are building-ish, which is why
  // the historic key is read by allowlisted value and never bare.
  assert.equal(rejection(classify(candidate({ historic: "building", name: "Old Bank" }))), "not-a-place");
});

test("DEDUP_METERS is the distance a reader would call the same place", () => {
  assert.equal(DEDUP_METERS, 90);
});
