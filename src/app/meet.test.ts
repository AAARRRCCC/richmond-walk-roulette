/**
 * The two-sided pool, and the scan that answers an empty one.
 *
 * Every fixture here is a square, because the assertions are about *which rung
 * first contains a place in both shapes* and a square makes that arithmetic
 * something a reader can check by eye. The one thing these tests must never do
 * is depend on the contour cache: `meetMinimum` takes its reader as an
 * argument precisely so this file can hand it a function.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Place } from "../data/places.ts";
import type { LngLat, MultiPolygon, Ring } from "../lib/geometry.ts";
import { MAX_MINUTES, type Reach } from "../lib/isochrone.ts";
import { derivePool, type PoolConditions } from "./eligibility.ts";
import {
  MEET_GAP_MINUTES,
  cachedMeetMinimum,
  describeBothBy,
  describeGap,
  describeMeetClause,
  meetMinimum,
  meetSplit,
  partnerSignature,
} from "./meet.ts";
import { formatMinutes } from "../lib/format.ts";

/** An axis-aligned square as a one-polygon MultiPolygon, in degrees. */
const square = (cx: number, cy: number, half: number): MultiPolygon => {
  const ring: Ring = [
    [cx - half, cy - half],
    [cx + half, cy - half],
    [cx + half, cy + half],
    [cx - half, cy + half],
    [cx - half, cy - half],
  ];
  return [[ring]];
};

const YOU: LngLat = { lng: 0, lat: 0 };
const THEM: LngLat = { lng: 1, lat: 0 };

/**
 * Deliberately at 0.495 and not 0.5: `contains` is a crossing-number test with
 * an explicit no-guarantee for a point ON an edge, and 0.5 is exactly the
 * 50-minute square's boundary. Testing the undefined case would pin whatever
 * the implementation happens to do there.
 */
const MIDPOINT: Place = { id: "mid", name: "Midpoint", lng: 0.495, lat: 0, tags: ["park"] };
const NEAR_YOU: Place = { id: "near", name: "Near You", lng: 0.1, lat: 0, tags: ["park"] };
const NEAR_THEM: Place = { id: "far", name: "Near Them", lng: 0.95, lat: 0, tags: ["park"] };

/** A contour reader: one side, one minute, one polygon — or null for "no answer". */
const ladder =
  (centre: LngLat, radiusAt: (m: number) => number | null) =>
  (origin: LngLat, minutes: number): MultiPolygon | null => {
    if (origin.lng !== centre.lng) return null;
    const r = radiusAt(minutes);
    return r === null ? null : square(centre.lng, centre.lat, r);
  };

/** Both sides at once, so a scan can be handed one function. */
const both =
  (you: (m: number) => number | null, them: (m: number) => number | null) =>
  (origin: LngLat, minutes: number): MultiPolygon | null =>
    origin.lng === YOU.lng
      ? ladder(YOU, you)(origin, minutes)
      : ladder(THEM, them)(origin, minutes);

const reachOf = (origin: LngLat, polygons: MultiPolygon, budget = 30): Reach => ({
  origin,
  budgetMinutes: budget,
  bands: [{ minutes: budget, polygons }],
  areaSqMeters: 1_000_000,
});

const conditions = (extra: Partial<PoolConditions> = {}): PoolConditions => ({
  reach: reachOf(YOU, square(0, 0, 1)),
  partnerReach: null,
  floorPolygons: null,
  vibes: [],
  edgeOnly: false,
  rules: [],
  ...extra,
});

// ---------------------------------------------------------------- the pool

test("the pool is the intersection", () => {
  const pool = derivePool(
    [MIDPOINT, NEAR_YOU],
    conditions({ partnerReach: reachOf(THEM, square(1, 0, 0.6)) }),
  );
  assert.deepEqual(
    pool.included.map((place) => place.id),
    ["mid"],
  );
  const near = pool.verdicts.get("near");
  assert.ok(near !== undefined && !near.included);
  assert.deepEqual(near.reasons, ["out-of-their-reach"]);
});

test("a null partner reach applies no reason at all", () => {
  // The single most important assertion in this file. A rule with no data is
  // inactive, never "excludes everything" - getting it backwards produces an
  // empty pool with a confident-sounding explanation.
  const pool = derivePool([MIDPOINT, NEAR_YOU], conditions({ partnerReach: null }));
  assert.equal(pool.included.length, 2);
  assert.equal(pool.counts["out-of-their-reach"], 0);
});

test("out-of-reach beats out-of-their-reach in the order", () => {
  const outside: Place = { id: "out", name: "Out", lng: 5, lat: 5, tags: ["park"] };
  const pool = derivePool(
    [outside],
    conditions({ partnerReach: reachOf(THEM, square(1, 0, 0.6)) }),
  );
  const verdict = pool.verdicts.get("out");
  assert.ok(verdict !== undefined && !verdict.included);
  assert.deepEqual(verdict.reasons, ["out-of-reach", "out-of-their-reach"]);
  assert.equal(pool.counts["out-of-reach"], 1);
  assert.equal(pool.counts["out-of-their-reach"], 0, "only the primary reason is counted");
});

test("inReach still means your reach", () => {
  // A place you can walk to that they cannot is still in reach. Two different
  // numbers, each named once: the readout names the both-count, the pool
  // summary names this.
  const alsoNearYou: Place = { id: "near2", name: "Near You Two", lng: 0.2, lat: 0, tags: ["park"] };
  const pool = derivePool(
    [MIDPOINT, NEAR_YOU, alsoNearYou],
    conditions({ partnerReach: reachOf(THEM, square(1, 0, 0.6)) }),
  );
  assert.equal(pool.inReach, 3);
  assert.equal(pool.included.length, 1);
});

test("partnerSignature is stable across renders and moves with the reach", () => {
  const reach = reachOf(THEM, square(1, 0, 1));
  assert.equal(partnerSignature(reach), partnerSignature(reach));
  assert.equal(partnerSignature(null), "-");
  assert.notEqual(partnerSignature(reach), partnerSignature(reachOf(THEM, square(1, 0, 1), 45)));
  assert.notEqual(partnerSignature(reach), partnerSignature(reachOf(YOU, square(0, 0, 1))));
  assert.notEqual(
    partnerSignature(reach),
    partnerSignature({ ...reach, areaSqMeters: reach.areaSqMeters + 5_000 }),
  );
});

// ------------------------------------------------------------ meetMinimum

test("meetMinimum finds the first overlapping rung", () => {
  // Radii grow by m/100. Yours spans [-m/100, m/100] and holds 0.495 from
  // m = 50; theirs spans [1 - m/100, 1 + m/100] and holds it only once
  // 1 - m/100 < 0.495, i.e. from m = 51. THEIRS is the binding side, which is
  // the whole point of scanning both.
  const contourAt = both(
    (m) => m / 100,
    (m) => m / 100,
  );
  const found = meetMinimum({
    you: YOU,
    them: THEM,
    places: [MIDPOINT],
    roundTrip: false,
    floorPolygons: null,
    contourAt,
  });
  assert.equal(found.kind, "found");
  assert.ok(found.kind === "found");
  assert.equal(found.budgetMinutes, 51);
  assert.equal(found.placeId, "mid");
  assert.equal(found.unmeasuredBelow, 0);
});

test("meetMinimum doubles a round trip", () => {
  const contourAt = both(
    (m) => m / 100,
    (m) => m / 100,
  );
  const found = meetMinimum({
    you: YOU,
    them: THEM,
    places: [NEAR_YOU],
    roundTrip: true,
    floorPolygons: null,
    contourAt,
  });
  // NEAR_YOU at lng 0.1 needs their square to reach 0.9, i.e. m = 90 outbound,
  // which doubles past the dial and is refused - see the next test for why
  // that is checked before clamping.
  assert.equal(found.kind, "none");
});

test("meetMinimum returns none when nothing ever overlaps", () => {
  const contourAt = both(
    (m) => m / 1000,
    (m) => m / 1000,
  );
  const found = meetMinimum({
    you: YOU,
    them: THEM,
    places: [MIDPOINT],
    roundTrip: false,
    floorPolygons: null,
    contourAt,
  });
  assert.deepEqual(found, { kind: "none", unmeasuredRungs: 0 });
});

test("meetMinimum returns none rather than a budget over the dial", () => {
  // The case a POST-clamp check silently passes: clampBudget(120, true) is 100,
  // so comparing after the clamp would offer "widen to 100" for a walk that
  // needs 120.
  const contourAt = both(
    (m) => (m >= 60 ? 1 : 0.01),
    (m) => (m >= 60 ? 1 : 0.01),
  );
  const found = meetMinimum({
    you: YOU,
    them: THEM,
    places: [MIDPOINT],
    roundTrip: true,
    floorPolygons: null,
    contourAt,
  });
  assert.equal(found.kind, "none");
  assert.ok(60 * 2 > MAX_MINUTES);
});

test("meetMinimum skips a rung the engine has no answer for and says so", () => {
  // The regression test for the first draft's bug, where this same input
  // produced a permanent "Waiting on their side." Both halves matter: the
  // answer is given, and the gap is disclosed.
  const contourAt = both(
    (m) => (m === 12 ? null : m / 100),
    (m) => m / 100,
  );
  const found = meetMinimum({
    you: YOU,
    them: THEM,
    places: [MIDPOINT],
    roundTrip: false,
    floorPolygons: null,
    contourAt,
  });
  assert.ok(found.kind === "found");
  assert.equal(found.budgetMinutes, 51);
  assert.equal(found.unmeasuredBelow, 1);
});

test("meetMinimum applies the floor to your side only", () => {
  const contourAt = both(
    (m) => m / 100,
    (m) => m / 100,
  );
  // NEAR_YOU sits inside a floor around YOUR start, so it is never reported
  // however wide both squares grow.
  const mine = meetMinimum({
    you: YOU,
    them: THEM,
    places: [NEAR_YOU],
    roundTrip: false,
    floorPolygons: square(0, 0, 0.2),
    contourAt,
  });
  assert.equal(mine.kind, "none");

  // The mirror, and the assertion that pins the asymmetry: a place a couple of
  // minutes from THEIR start is reported normally, because the partner never
  // has a floor at all - there is no argument by which one could be given. A
  // floor is a preference about the reader's own walk, and punching it around
  // somebody else's front door would report the places most emphatically in
  // their reach as being outside it.
  const theirs = meetMinimum({
    you: YOU,
    them: THEM,
    places: [NEAR_THEM],
    roundTrip: false,
    floorPolygons: null,
    contourAt,
  });
  assert.equal(theirs.kind, "found");
});

test("meetMinimum early-exits", () => {
  let calls = 0;
  const contourAt = (origin: LngLat, minutes: number): MultiPolygon | null => {
    calls += 1;
    return both(
      (m) => m / 100,
      (m) => m / 100,
    )(origin, minutes);
  };
  meetMinimum({
    you: YOU,
    them: THEM,
    places: [MIDPOINT],
    roundTrip: false,
    floorPolygons: null,
    contourAt,
  });
  // The answer is at 51, the ladder runs to 100, and each rung reads twice.
  assert.ok(calls < 2 * MAX_MINUTES, `read ${calls} contours`);
});

test("cachedMeetMinimum memoises on the pair and the floor", () => {
  let calls = 0;
  const counting = (origin: LngLat, minutes: number): MultiPolygon | null => {
    calls += 1;
    return both(
      (m) => m / 100,
      (m) => m / 100,
    )(origin, minutes);
  };
  const args = {
    you: YOU,
    them: THEM,
    places: [MIDPOINT],
    roundTrip: false,
    floorPolygons: null,
    floorMinutes: null,
    contourAt: counting,
  };

  cachedMeetMinimum(args);
  const afterFirst = calls;
  cachedMeetMinimum(args);
  assert.equal(calls, afterFirst, "the same pair hits the memo");

  // The scan is symmetric in its result but the KEY is not, and asserting that
  // pins the key's shape.
  cachedMeetMinimum({ ...args, you: THEM, them: YOU });
  assert.ok(calls > afterFirst, "swapping the sides is a different key");

  const afterSwap = calls;
  cachedMeetMinimum({ ...args, floorMinutes: 10 });
  assert.ok(calls > afterSwap, "a different floor is a different question");
});

// -------------------------------------------------------------- the split

test("meetSplit doubles for a round trip and nulls through", () => {
  const trip = meetSplit({ yourSeconds: 600, theirSeconds: 900, roundTrip: true });
  assert.equal(trip.yourMinutes, 20);
  assert.equal(trip.theirMinutes, 30);
  assert.equal(trip.bothByMinutes, 30);
  assert.equal(trip.gapMinutes, 10);

  const half = meetSplit({ yourSeconds: 600, theirSeconds: null, roundTrip: true });
  assert.equal(half.bothByMinutes, null);
  assert.equal(half.gapMinutes, null);
});

test("describeBothBy uses formatMinutes", () => {
  // Asserted by composition rather than against a literal, so the two cannot
  // drift apart if the app's number voice changes.
  const split = meetSplit({ yourSeconds: 1440, theirSeconds: 1440, roundTrip: false });
  assert.equal(describeBothBy(split), `You'd both be there by ${formatMinutes(1440)}.`);
  assert.equal(describeBothBy(meetSplit({ yourSeconds: null, theirSeconds: 1, roundTrip: false })), null);
});

test("describeGap is silent below the threshold", () => {
  const under = meetSplit({ yourSeconds: 60, theirSeconds: 60 + 7 * 60, roundTrip: false });
  assert.equal(under.gapMinutes, 7);
  assert.equal(describeGap(under), null);

  const over = meetSplit({ yourSeconds: 60, theirSeconds: 60 + MEET_GAP_MINUTES * 60, roundTrip: false });
  assert.match(describeGap(over) ?? "", /^You get there /);

  const reversed = meetSplit({ yourSeconds: 60 + 19 * 60, theirSeconds: 60, roundTrip: false });
  assert.match(describeGap(reversed) ?? "", /^They get there /);
});

test("describeMeetClause returns null with no split", () => {
  // So the announcement array does not gain an empty clause.
  const half = meetSplit({ yourSeconds: 600, theirSeconds: null, roundTrip: false });
  assert.equal(describeMeetClause(half, "Their start"), null);
  const whole = meetSplit({ yourSeconds: 600, theirSeconds: 900, roundTrip: false });
  assert.match(describeMeetClause(whole, "Carytown") ?? "", /Carytown/);
});

test("the words \"their pace\" appear nowhere", () => {
  // A grep, as a test, because the sentence it forbids is the one the app
  // would most plausibly write by accident: it has never measured anybody's
  // pace and must not imply it has.
  const split = meetSplit({ yourSeconds: 600, theirSeconds: 900, roundTrip: true });
  for (const text of [
    describeBothBy(split) ?? "",
    describeGap(split) ?? "",
    describeMeetClause(split, "Their start") ?? "",
  ]) {
    assert.equal(/their pace|her pace|his pace/i.test(text), false, text);
  }
});
