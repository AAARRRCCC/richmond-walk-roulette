/**
 * The dataset's own invariants.
 *
 * Nothing covered `places.ts` before this file, at build time or at runtime,
 * which was tolerable while every row was typed by a person and stops being so
 * the moment a script can append to it. Each case here is a way a generated row
 * can be wrong that nothing else would notice: a duplicate id, a coordinate in
 * the wrong county, a name too long for the rail it renders in, an empty tag
 * array that makes a place unreachable by any chip.
 *
 * `verify-places.mjs` covers the two invariants that need a live engine - that
 * every coordinate snaps to a walkable edge, and that the count matches what
 * the documents claim. These are the ones that need only the module.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { metersBetween } from "../lib/geometry.ts";
import { DEDUP_METERS, PLACE_BOUNDS } from "./osm-rules.ts";
import {
  DETOUR_LABELS,
  HAND_CURATED_COUNT,
  MAX_PLACES,
  NAME_MAX,
  PLACES,
  PLACE_KINDS,
  PRESET_ORIGINS,
  VIBES,
  matchesKind,
  type Place,
} from "./places.ts";

/** Everything the proposer appended, which is the only tier some rules govern. */
const generated = (): Place[] => PLACES.slice(HAND_CURATED_COUNT);

test("every place id is unique", () => {
  const ids = PLACES.map((place) => place.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("every preset origin id is unique", () => {
  // Within each array, and deliberately NOT across them: `siegel`, `vmfa`,
  // `carytown`, `capitol`, `maymont`, `belle-isle`, `libby-hill` and
  // `scotts-add` are each both a place and a place to start from.
  const ids = PRESET_ORIGINS.map((origin) => origin.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("every place is inside the harvest bounds", () => {
  for (const place of PLACES) {
    assert.ok(
      place.lat >= PLACE_BOUNDS.south && place.lat <= PLACE_BOUNDS.north,
      `${place.id} latitude ${place.lat}`,
    );
    assert.ok(
      place.lng >= PLACE_BOUNDS.west && place.lng <= PLACE_BOUNDS.east,
      `${place.id} longitude ${place.lng}`,
    );
  }
});

test("every place carries at least one vibe", () => {
  // Otherwise no chip can reach it and the dot is unfilterable.
  for (const place of PLACES) {
    assert.ok(place.tags.length > 0, `${place.id} has no vibe`);
  }
});

test("every vibe on a place is a real vibe", () => {
  const known = new Set(VIBES.map((vibe) => vibe.id));
  for (const place of PLACES) {
    for (const tag of place.tags) assert.ok(known.has(tag), `${place.id} carries ${tag}`);
  }
});

test("every detour value has a label", () => {
  // The card prints this word; a tier with no label would render undefined.
  for (const place of PLACES) {
    if (place.detour === undefined) continue;
    assert.ok(place.detour in DETOUR_LABELS, `${place.id} is a ${place.detour}`);
  }
});

test("no generated name is longer than the rail can hold", () => {
  // The hand-curated rows are exempt and the ceiling is measured from them:
  // "White House of the Confederacy" is 30, so 32 is a bound that name already
  // proves. A person naming a real institution has standing the proposer does
  // not.
  for (const place of generated()) {
    assert.ok(place.name.length <= NAME_MAX, `${place.id}: "${place.name}" is ${place.name.length}`);
  }
});

test("the hand-curated count is exactly what it claims", () => {
  // The discriminator for "this row came out of the proposer". A count rather
  // than a field because the obvious field does not survive: `opening-hours`
  // backfills `osm` onto the hand rows, after which its presence means nothing.
  assert.ok(PLACES.length >= HAND_CURATED_COUNT);
  for (const place of PLACES.slice(0, HAND_CURATED_COUNT)) {
    assert.equal(place.osm, undefined, `${place.id} is above the boundary but carries an osm id`);
  }
});

test("the dataset stays under its ceiling", () => {
  // A build-time wall rather than a runtime discovery: at 600 places the cost
  // is about a fifth of the whole app JS budget, and that must be argued for.
  assert.ok(PLACES.length <= MAX_PLACES, `${PLACES.length} places against a ceiling of ${MAX_PLACES}`);
});

test("no two places are within the dedup distance", () => {
  // Catches a generated row landing on a hand-curated one. `PLACES` only: the
  // `manchester` ORIGIN and the `manch-flood` PLACE deliberately share a
  // coordinate, and comparing across the two arrays would fail on that forever.
  for (let i = 0; i < PLACES.length; i += 1) {
    for (let j = i + 1; j < PLACES.length; j += 1) {
      const a = PLACES[i];
      const b = PLACES[j];
      if (a === undefined || b === undefined) continue;
      const apart = metersBetween(a, b);
      assert.ok(apart >= DEDUP_METERS, `${a.id} and ${b.id} are ${apart.toFixed(0)} m apart`);
    }
  }
});

test("every osm id is well formed and unique", () => {
  const seen = new Set<string>();
  for (const place of PLACES) {
    if (place.osm === undefined) continue;
    assert.match(place.osm, /^(node|way|relation)\/\d+$/, `${place.id} carries "${place.osm}"`);
    assert.ok(!seen.has(place.osm), `${place.osm} appears twice`);
    seen.add(place.osm);
  }
});

test("every detour carries an osm id", () => {
  // The detour tier exists only through the proposer, so a detour without an
  // identity is a row somebody typed into the wrong half of the file.
  for (const place of PLACES) {
    if (place.detour === undefined) continue;
    assert.ok(place.osm !== undefined, `${place.id} is a detour with no osm id`);
  }
});

test("matchesKind sorts the two tiers and lets Any through", () => {
  const destination: Place = { id: "d", name: "D", lat: 37.54, lng: -77.45, tags: ["park"] };
  const detour: Place = { ...destination, id: "t", detour: "mural" };

  assert.equal(matchesKind(destination, "any"), true);
  assert.equal(matchesKind(destination, "destination"), true);
  assert.equal(matchesKind(destination, "detour"), false);

  assert.equal(matchesKind(detour, "any"), true);
  assert.equal(matchesKind(detour, "destination"), false);
  assert.equal(matchesKind(detour, "detour"), true);
});

test("the Kind control offers exactly the three tiers", () => {
  assert.deepEqual(
    PLACE_KINDS.map((kind) => kind.id),
    ["any", "destination", "detour"],
  );
});
