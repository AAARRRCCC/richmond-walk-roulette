import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REASON_COPY,
  REASON_ORDER,
  conditionsSignature,
  derivePool,
  explainPlace,
  poolReport,
  suggestFix,
  summaryLine,
  type ExclusionReason,
  type PoolConditions,
  type PoolRule,
} from "./eligibility.ts";
import type { Place } from "../data/places.ts";
import type { MultiPolygon, Ring } from "../lib/geometry.ts";
import type { Band, Reach } from "../lib/isochrone.ts";

/**
 * An axis-aligned square as a one-polygon MultiPolygon.
 *
 * Not the `square()` in smooth.test.ts, which is a unit `Ring` taking no
 * arguments; the two files are independent and neither imports the other's.
 */
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

const OUTER = square(0, 0, 1);
const MID = square(0, 0, 0.5);
const FLOOR = square(0, 0, 0.1);

const reachOf = (...bands: Band[]): Reach => ({
  origin: { lat: 0, lng: 0 },
  budgetMinutes: 30,
  bands,
  areaSqMeters: 1,
});

const NEAR: Place = { id: "near", name: "Near", lat: 0.05, lng: 0.05, tags: ["park"] };
const MIDP: Place = { id: "mid", name: "Mid", lat: 0.3, lng: 0.3, tags: ["food"] };
const EDGE: Place = { id: "edge", name: "Edge", lat: 0.8, lng: 0.8, tags: ["river", "park"] };
const FAR: Place = { id: "far", name: "Far", lat: 5, lng: 5, tags: ["park"] };
const ALL = [NEAR, MIDP, EDGE, FAR];

const shutRule = (ids: string[], extra: Partial<PoolRule> = {}): PoolRule => ({
  id: "hours",
  reason: "closed",
  active: true,
  clearLabel: "Ignore opening hours",
  clear: () => {},
  signature: "1042|strict",
  excludes: (place) => ids.includes(place.id),
  ...extra,
});

const conditionsOf = (extra: Partial<PoolConditions> = {}): PoolConditions => ({
  reach: reachOf({ minutes: 30, polygons: OUTER }),
  floorPolygons: null,
  vibes: [],
  edgeOnly: false,
  rules: [],
  ...extra,
});

const reasonsFor = (report: ReturnType<typeof derivePool>, id: string): readonly ExclusionReason[] => {
  const verdict = report.verdicts.get(id);
  return verdict === undefined || verdict.included ? [] : verdict.reasons;
};

test("REASON_ORDER and REASON_COPY agree, at runtime", () => {
  // The type-level totality - a new union member forcing a REASON_COPY key - is
  // tsc's job. This is the half `npm test` can make, because Node strips types
  // and never sees them.
  assert.deepEqual([...REASON_ORDER].toSorted(), Object.keys(REASON_COPY).toSorted());
  assert.equal(new Set(REASON_ORDER).size, REASON_ORDER.length, "no duplicates");
});

test("explainPlace answers for one place without deriving the whole pool", () => {
  // The result card asks about exactly one place - the one that was clicked -
  // and paying for 62 verdicts to answer about one of them would be silly.
  const verdict = explainPlace(
    MIDP,
    conditionsOf({ rules: [shutRule(["mid"], { id: "climb", reason: "wrong-terrain" })] }),
  );
  assert.equal(verdict.included, false);
  assert.equal(verdict.placeId, "mid");
  assert.deepEqual(verdict.included === false ? verdict.reasons : [], ["wrong-terrain"]);

  assert.equal(explainPlace(NEAR, conditionsOf()).included, true);
});

test("no reach means out-of-reach, not empty", () => {
  // This case used to return [] with no explanation at all.
  const report = derivePool(ALL, conditionsOf({ reach: null }));
  assert.equal(report.verdicts.size, 4);
  assert.equal(report.included.length, 0);
  assert.equal(report.inReach, 0);
  for (const place of ALL) assert.deepEqual(reasonsFor(report, place.id), ["out-of-reach"]);
});

test("a place beyond the outer band is out-of-reach", () => {
  const report = derivePool(ALL, conditionsOf());
  assert.deepEqual(reasonsFor(report, FAR.id), ["out-of-reach"]);
});

test("a place inside the floor is inside-floor, not out-of-reach", () => {
  const holed: Band = { minutes: 30, polygons: [[...(OUTER[0] ?? []), ...(FLOOR[0] ?? [])]] };
  const withFloor = derivePool(ALL, conditionsOf({ reach: reachOf(holed), floorPolygons: FLOOR }));
  assert.deepEqual(reasonsFor(withFloor, NEAR.id), ["inside-floor"]);

  // The distinguishing half: without the floor contour the same place cannot be
  // told apart from something beyond the budget, and says the honest thing.
  const withoutFloor = derivePool(ALL, conditionsOf({ reach: reachOf(holed), floorPolygons: null }));
  assert.deepEqual(reasonsFor(withoutFloor, NEAR.id), ["out-of-reach"]);
});

test("a climb rule and a vibe chip accumulate", () => {
  // Climb is measured per route, so it arrives as a rule rather than a field -
  // but its reason still sorts ahead of the vibe chips, because REASON_ORDER is
  // about how fundamental the obstacle is and not about where it came from.
  const climb = shutRule(["mid"], { id: "climb", reason: "wrong-terrain" });
  const report = derivePool(ALL, conditionsOf({ vibes: ["park"], rules: [climb] }));
  assert.deepEqual(reasonsFor(report, MIDP.id), ["wrong-terrain", "no-matching-vibe"]);
});

test("reasons come back in REASON_ORDER regardless of rule registration order", () => {
  const closed = shutRule(["mid"]);
  const weather: PoolRule = {
    id: "rain",
    reason: "weather",
    active: true,
    clearLabel: "Ignore the weather",
    clear: () => {},
    signature: "rain|12",
    excludes: (place) => place.id === "mid",
  };

  const first = derivePool(ALL, conditionsOf({ rules: [closed, weather] }));
  const second = derivePool(ALL, conditionsOf({ rules: [weather, closed] }));
  assert.deepEqual(reasonsFor(first, MIDP.id), ["closed", "weather"]);
  assert.deepEqual(reasonsFor(second, MIDP.id), ["closed", "weather"]);
});

test("not-far-edge only applies to places that are in reach", () => {
  const conditions = conditionsOf({
    reach: reachOf({ minutes: 15, polygons: MID }, { minutes: 30, polygons: OUTER }),
    edgeOnly: true,
  });
  const report = derivePool(ALL, conditions);

  assert.deepEqual(reasonsFor(report, MIDP.id), ["not-far-edge"]);
  assert.equal(report.verdicts.get(EDGE.id)?.included, true);
  // The important half: a place that is not in reach at all is not also
  // accused of sitting too far in.
  assert.deepEqual(reasonsFor(report, FAR.id), ["out-of-reach"]);
});

test("edgeOnly with one band is a no-op", () => {
  // Guards the narrow-range case where bandMinutes produces a single band.
  const report = derivePool(ALL, conditionsOf({ edgeOnly: true }));
  assert.equal(report.verdicts.get(EDGE.id)?.included, true);
  assert.equal(report.verdicts.get(MIDP.id)?.included, true);
});

test("an inactive rule excludes nothing", () => {
  const report = derivePool(ALL, conditionsOf({ rules: [shutRule(["edge"], { active: false })] }));
  assert.equal(report.verdicts.get(EDGE.id)?.included, true);
  assert.equal(report.counts.closed, 0);
});

test("counts counts the primary reason only", () => {
  // FAR is both out of reach and shut. It is counted once, under the reason a
  // reader would have to fix first.
  const report = derivePool(ALL, conditionsOf({ rules: [shutRule(["far"])] }));
  assert.equal(report.counts["out-of-reach"], 1);
  assert.equal(report.counts.closed, 0);
  for (const reason of REASON_ORDER) assert.ok(Number.isFinite(report.counts[reason]), reason);
});

test("inReach ignores non-geometry reasons", () => {
  const report = derivePool(ALL, conditionsOf({ rules: [shutRule(["near", "mid"])] }));
  assert.equal(report.inReach, 3, "three places passed geometry");
  assert.equal(report.included.length, 1, "only one of them survived the rule");
});

test("a guarded rule withdraws rather than emptying the pool", () => {
  const report = derivePool(ALL, conditionsOf({ rules: [shutRule(["near", "mid"], { minSurvivors: 3 })] }));
  assert.deepEqual(report.withdrawn, ["hours"]);
  assert.equal(report.included.length, 3);
  assert.equal(report.counts.closed, 0);
});

test("a guarded rule that changes nothing is not withdrawn", () => {
  const report = derivePool(ALL, conditionsOf({ rules: [shutRule([], { minSurvivors: 3 })] }));
  assert.deepEqual(report.withdrawn, []);
});

test("pool order is input order", () => {
  const report = derivePool([EDGE, NEAR, MIDP], conditionsOf());
  assert.deepEqual(
    report.included.map((place) => place.id),
    ["edge", "near", "mid"],
  );
});

test("baseIncluded holds places a deferred rule has not measured yet", () => {
  // The Spin gate's denominator. `included` shrinks as measurements land, so
  // counting it makes "Measuring climb 3/12" tick down on both halves at once.
  const deferred = shutRule(["mid"], { id: "climb", reason: "wrong-terrain", deferred: true });
  const report = derivePool(ALL, conditionsOf({ rules: [deferred] }));

  assert.deepEqual(report.included.map((p) => p.id), ["near", "edge"]);
  assert.deepEqual(report.baseIncluded.map((p) => p.id), ["near", "mid", "edge"]);
  assert.equal(report.baseKey, "near,mid,edge");

  // A place a non-deferred rule excluded is out of the base pool too.
  const settled = derivePool(ALL, conditionsOf({ rules: [shutRule(["mid"])] }));
  assert.deepEqual(settled.baseIncluded.map((p) => p.id), ["near", "edge"]);
});

test("poolReport memoises on the reach identity and the signature", () => {
  const reach = reachOf({ minutes: 30, polygons: OUTER });
  const conditions = conditionsOf({ reach });

  const first = poolReport(ALL, conditions);
  assert.equal(poolReport(ALL, conditionsOf({ reach })), first, "same inputs, same object");

  assert.notEqual(
    poolReport(ALL, conditionsOf({ reach, edgeOnly: true })),
    first,
    "a filter change is a different report",
  );
  assert.notEqual(
    poolReport(ALL, conditionsOf({ reach, rules: [shutRule([])] })),
    poolReport(ALL, conditionsOf({ reach, rules: [shutRule([], { signature: "1043|strict" })] })),
    "a signature change is a different report",
  );

  // Reference comparison is the contract: an equal-but-distinct reach is a
  // different key, because the assembled-reach LRU is what makes identity stable.
  assert.notEqual(poolReport(ALL, conditionsOf({ reach: reachOf({ minutes: 30, polygons: OUTER }) })), first);

  // A WeakMap, not one slot: a dial oscillating between two warm positions hits
  // the memo both ways.
  const other = reachOf({ minutes: 20, polygons: MID });
  const a1 = poolReport(ALL, conditionsOf({ reach }));
  const b1 = poolReport(ALL, conditionsOf({ reach: other }));
  assert.equal(poolReport(ALL, conditionsOf({ reach })), a1);
  assert.equal(poolReport(ALL, conditionsOf({ reach: other })), b1);
});

test("two rules cannot collide through the signature joiner", () => {
  // Under a printable joiner these two condition sets produce the same string,
  // and the memo then serves one pool for the other's filters.
  const left = conditionsOf({
    rules: [shutRule([], { id: "a", signature: "x|b" }), shutRule([], { id: "c", signature: "y" })],
  });
  const right = conditionsOf({
    rules: [shutRule([], { id: "a", signature: "x" }), shutRule([], { id: "b|c", signature: "y" })],
  });
  assert.notEqual(conditionsSignature(left), conditionsSignature(right));
});

test("summaryLine names the pool, then at most two reasons", () => {
  const climb = shutRule(["mid"], { id: "climb", reason: "wrong-terrain" });
  const report = derivePool(ALL, conditionsOf({ rules: [climb, shutRule(["near", "edge"])] }));
  const line = summaryLine(report);

  assert.ok(line.startsWith("0 to spin"), line);
  assert.ok(line.includes("shut"), line);
  // Geometry reasons never appear: .readout already names inReach, and saying
  // it twice was this function's earlier bug.
  assert.ok(!line.includes("too far"), line);
  assert.ok(line.split(" · ").length <= 3, `pool size plus at most two clauses: ${line}`);
});

test("suggestFix picks the largest recovery", () => {
  const conditions = conditionsOf({ vibes: ["scenic"], rules: [shutRule(["far"])] });
  const fix = suggestFix(ALL, conditions, new Map(), { roundTrip: true });

  assert.equal(fix.kind, "drop-rule");
  assert.equal(fix.kind === "drop-rule" ? fix.reason : null, "no-matching-vibe");
  assert.equal(fix.kind === "drop-rule" ? fix.recovers : null, 3);
});

test("suggestFix tie-break prefers the world over the reader's own chip", () => {
  // Both recover the same number. The chip is the thing they meant; the weather
  // is nobody's choice, so that is the one to offer.
  const conditions = conditionsOf({
    vibes: ["park"],
    rules: [shutRule(["near", "edge"], { id: "rain", reason: "weather", clearLabel: "Ignore the weather" })],
  });
  const fix = suggestFix(ALL, conditions, new Map(), { roundTrip: true });
  assert.equal(fix.kind === "drop-rule" ? fix.reason : null, "weather");
});

test("suggestFix widens the budget, and carries no recovery count", () => {
  const conditions = conditionsOf({ reach: reachOf({ minutes: 5, polygons: FLOOR }) });
  const fix = suggestFix(ALL, conditions, new Map([["mid", 31]]), { roundTrip: true });

  assert.equal(fix.kind, "widen-budget");
  if (fix.kind !== "widen-budget") return;
  assert.equal(fix.nearest, "Mid");
  assert.equal(fix.nearestMinutes, 31);
  // Asserted as an inequality as well as a literal, so the case survives a
  // coarser dial: the snap is upward and must still reach the named place.
  assert.ok(fix.budgetMinutes >= 62, `${fix.budgetMinutes} must reach a 62 minute round trip`);
  assert.equal(fix.budgetMinutes, 62);
  assert.ok(!("recovers" in fix));
});

test("suggestFix refuses a budget the dial cannot reach", () => {
  // The case a post-clamp check silently passes: clampBudget(160, true) is 100,
  // so the app would cheerfully offer "Try 100 min" for a walk that needs 160.
  const conditions = conditionsOf({ reach: reachOf({ minutes: 5, polygons: FLOOR }) });
  const fix = suggestFix(ALL, conditions, new Map([["mid", 80]]), { roundTrip: true });
  assert.equal(fix.kind, "none");
});

test("suggestFix returns none with no cached walking times", () => {
  const conditions = conditionsOf({ reach: reachOf({ minutes: 5, polygons: FLOOR }) });
  assert.equal(suggestFix(ALL, conditions, new Map(), { roundTrip: true }).kind, "none");
});

test("suggestFix offers to lower the floor when that is what is holding the pool", () => {
  const holed: Band = { minutes: 30, polygons: [[...(OUTER[0] ?? []), ...(FLOOR[0] ?? [])]] };
  const inside: Place = { ...NEAR, id: "inside", lat: 0.02, lng: 0.02 };
  const conditions = conditionsOf({ reach: reachOf(holed), floorPolygons: FLOOR });
  const fix = suggestFix([inside], conditions, new Map(), { roundTrip: true });

  assert.equal(fix.kind, "lower-floor");
  assert.equal(fix.kind === "lower-floor" ? fix.recovers : null, 1);
});

test("every REASON_COPY sentence is a sentence, and every clause says something", () => {
  for (const reason of REASON_ORDER) {
    const copy = REASON_COPY[reason];
    assert.ok(copy.sentence.length > 0, `${reason} has a sentence`);
    assert.ok(copy.sentence.endsWith("."), `${reason}: "${copy.sentence}" ends in a full stop`);
    assert.ok(copy.clause(1).length > 0, `${reason} has a clause`);
    assert.ok(copy.heading.length > 0, `${reason} has a heading`);
  }
});

test("a deferred rule holds an unmeasured place out of the pool but inside the gate", () => {
  // Chunk 3's climb rule, in the shape App builds it. The distinction that
  // matters: "not measured yet" passes provisionally, so the pool does not
  // shrink and grow as routes land, while "measured and wrong" is simply out.
  const measured = new Map<string, string>([["near", "easy"], ["mid", "hilly"]]);
  const climb: PoolRule = {
    id: "climb",
    reason: "wrong-terrain",
    active: true,
    clearLabel: "Any climb",
    clear: () => {},
    signature: `easy|${measured.size}`,
    deferred: true,
    excludes: (place) => {
      const band = measured.get(place.id);
      return band !== undefined && band !== "easy";
    },
  };

  const report = derivePool(ALL, conditionsOf({ rules: [climb] }));

  // `edge` has not been measured, so it passes provisionally and is in the pool.
  // `mid` was measured and is the wrong band, so it is out of it.
  assert.deepEqual(report.included.map((p) => p.id), ["near", "edge"]);

  // But `mid` is still in the BASE pool, and that is the whole point of the
  // flag: the base pool is everything whose climb might need measuring, so the
  // "Measuring climb n/total" denominator does not shrink as answers land. A
  // place excluded by a non-deferred rule is out of both - the test above this
  // one covers that.
  assert.deepEqual(report.baseIncluded.map((p) => p.id), ["near", "mid", "edge"]);
  assert.equal(report.counts["wrong-terrain"], 1);
});
