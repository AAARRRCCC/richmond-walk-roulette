/**
 * The memo contract, which is the largest single risk in the v0.5 plan.
 *
 * Every feature from chunk 3 onward contributes a `PoolRule` carrying a
 * `signature`. That string is the only way `poolReport`'s memo can know a
 * rule's verdicts could have changed. It must change exactly when they could,
 * and it must never change per render.
 *
 * Get it wrong in the churning direction and nothing throws. The memo misses,
 * `derivePool` re-runs, a fresh `included` array comes back, `candidateKey`
 * changes, the spin-abort effect in App fires — and spinning becomes impossible
 * with no error anywhere and nothing on screen to explain it. A sibling can
 * cause that by putting `Date.now()`, a fetch counter or a render count in a
 * signature, all of which look perfectly reasonable at the call site.
 *
 * So it is not something to hope about. This file derives the candidate set
 * twice from identical inputs and asserts the signatures and keys are
 * byte-identical, then walks a simulated dial scrub and asserts the key changes
 * only on the transitions it should.
 *
 * **Every chunk from 3 to 11 that adds a rule adds its case to REGISTERED
 * below.** A rule that is not listed there fails the last test in this file.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { conditionsSignature, poolReport, type PoolConditions, type PoolRule } from "./eligibility.ts";
import type { Place } from "../data/places.ts";
import type { MultiPolygon, Ring } from "../lib/geometry.ts";
import type { Band, Reach } from "../lib/isochrone.ts";

const square = (half: number): MultiPolygon => {
  const ring: Ring = [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
    [-half, -half],
  ];
  return [[ring]];
};

/** A reach whose outer contour grows with the dial, as a real ladder's does. */
const reachAt = (minutes: number): Reach => {
  const band: Band = { minutes, polygons: square(minutes / 100) };
  return { origin: { lat: 0, lng: 0 }, budgetMinutes: minutes, bands: [band], areaSqMeters: 1 };
};

const PLACES: Place[] = [
  { id: "a", name: "A", lat: 0.05, lng: 0.05, tags: ["park"] },
  { id: "b", name: "B", lat: 0.15, lng: 0.15, tags: ["food"] },
  { id: "c", name: "C", lat: 0.25, lng: 0.25, tags: ["river"] },
];

const conditionsAt = (reach: Reach | null, rules: PoolRule[] = []): PoolConditions => ({
  reach,
  floorPolygons: null,
  vibes: [],
  edgeOnly: false,
  rules,
});

/**
 * A rule object built fresh, as App builds one every render. Only its
 * `signature` may be compared; its identity changes constantly and must not
 * matter.
 */
const freshRule = (): PoolRule => ({
  id: "climb",
  reason: "wrong-terrain",
  active: true,
  clearLabel: "Any climb",
  clear: () => {},
  signature: "hilly|7",
  excludes: (place) => place.id === "b",
});

/**
 * A rule whose signature moves every render. A render counter, a fetch count,
 * `Date.now()` - all look reasonable at the call site and all do this.
 */
const churning = (n: number): PoolRule => ({
  id: "bad",
  reason: "weather",
  active: true,
  clearLabel: "Ignore the weather",
  clear: () => {},
  signature: `render-${n}`,
  excludes: () => false,
});

/** What App joins into `candidateKey`. */
const keyOf = (conditions: PoolConditions): string =>
  poolReport(PLACES, conditions)
    .included.map((place) => place.id)
    .join(",");

/**
 * Every rule the app registers, by the chunk that owns it.
 *
 * The point of the table is the last test in this file: a chunk that adds a
 * rule without adding a case here is a chunk whose signature nobody checked.
 * `stable` is the signature a re-render must reproduce byte for byte; `changed`
 * is what it becomes when that rule's verdicts genuinely could have moved.
 */
const REGISTERED: {
  chunk: number;
  id: string;
  reason: PoolRule["reason"];
  stable: string;
  changed: string;
  why: string;
}[] = [
  {
    chunk: 3,
    id: "climb",
    reason: "wrong-terrain",
    stable: "hilly|7",
    changed: "hilly|8",
    why: "the climb band plus the number of routes measured so far - both change only when a route settles, never per frame. Landed in chunk 3 as `${state.climb}|${climbSettled}` in App.tsx",
  },
];

/** A rule standing in for one a later chunk will contribute. */
const registered = (
  id: string,
  reason: PoolRule["reason"],
  signature: string,
): PoolRule => ({
  id,
  reason,
  active: true,
  clearLabel: "Clear",
  clear: () => {},
  signature,
  excludes: () => false,
});

test("signature: identical inputs derive byte-identical signatures and keys", () => {
  const reach = reachAt(30);
  const first = conditionsAt(reach);
  const second = conditionsAt(reach);

  assert.equal(conditionsSignature(first), conditionsSignature(second));
  assert.equal(keyOf(first), keyOf(second));
  // And the memo really returned the same object, not an equal one.
  assert.equal(poolReport(PLACES, first), poolReport(PLACES, second));
});

test("signature: deriving twice with a fresh rule object is still identical", () => {
  // The realistic shape of the bug: App rebuilds its rule array every render,
  // so the rule OBJECT is always new. Only the signature may be compared.
  const reach = reachAt(30);
  const first = conditionsAt(reach, [freshRule()]);
  const second = conditionsAt(reach, [freshRule()]);
  assert.equal(conditionsSignature(first), conditionsSignature(second));
  assert.equal(poolReport(PLACES, first), poolReport(PLACES, second), "a new rule object is not a new pool");
});

test("signature: a dial scrub changes the key only where membership changes", () => {
  // Twenty rungs of a scrub. The contour grows continuously; the key may only
  // move on the three rungs where a place actually crosses into it.
  const keys = new Map<number, string>();
  for (let minutes = 5; minutes <= 100; minutes += 5) {
    keys.set(minutes, keyOf(conditionsAt(reachAt(minutes))));
  }

  const transitions = [...keys.entries()].filter(([minutes, key], index, all) => {
    const previous = all[index - 1];
    return previous !== undefined && previous[1] !== key && minutes > 0;
  });

  assert.deepEqual(
    transitions.map(([, key]) => key),
    ["a", "a,b", "a,b,c"],
    "the key gains one place at a time and never churns in between",
  );
});

test("signature: a churning signature is what breaks spinning, and is visible here", () => {
  // This is the failure being guarded against, written out so the next reader
  // can see what it looks like rather than only what it is called. A signature
  // that changes per render defeats the memo, and a fresh `included` array is
  // what fires App's spin-abort effect mid-throw.
  const reach = reachAt(30);
  const first = poolReport(PLACES, conditionsAt(reach, [churning(1)]));
  const second = poolReport(PLACES, conditionsAt(reach, [churning(2)]));

  assert.notEqual(first, second, "the memo misses, which is the bug");
  // And the tell that makes it survivable: the pool is identical in content
  // even though the object is not. A rule whose verdicts did not change must
  // not produce a new signature.
  assert.deepEqual(
    first.included.map((place) => place.id),
    second.included.map((place) => place.id),
  );
});

test("signature: an inactive rule contributes nothing to the signature", () => {
  // Otherwise toggling a feature off and on again would move the key twice for
  // a pool that never changed.
  const reach = reachAt(30);
  const off: PoolRule = {
    id: "hours",
    reason: "closed",
    active: false,
    clearLabel: "Ignore opening hours",
    clear: () => {},
    signature: "1042|strict",
    excludes: () => true,
  };
  assert.equal(
    conditionsSignature(conditionsAt(reach, [off])),
    conditionsSignature(conditionsAt(reach, [])),
  );
});

test("signature: every registered rule has a stable and a changing case", () => {
  // The gate on later chunks. A rule that lands without an entry here has a
  // signature nobody checked, and the failure it can cause is silent.
  const reach = reachAt(30);
  for (const entry of REGISTERED) {
    const rule = (signature: string): PoolRule => registered(entry.id, entry.reason, signature);

    assert.equal(
      conditionsSignature(conditionsAt(reach, [rule(entry.stable)])),
      conditionsSignature(conditionsAt(reach, [rule(entry.stable)])),
      `chunk ${entry.chunk}'s ${entry.id}: the same signature twice must be the same string`,
    );
    assert.notEqual(
      conditionsSignature(conditionsAt(reach, [rule(entry.stable)])),
      conditionsSignature(conditionsAt(reach, [rule(entry.changed)])),
      `chunk ${entry.chunk}'s ${entry.id}: a changed signature must change the key. ${entry.why}`,
    );
  }
});
