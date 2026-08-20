import { test } from "node:test";
import assert from "node:assert/strict";
import { bandMinutes } from "./isochrone.ts";

/**
 * The contour marks a reach draws. Three nested shapes make the gradient that
 * lets a contour read as territory, and they only do that if they are spread
 * across the shape actually on screen.
 */

test("without a floor the marks are thirds of the budget, innermost first", () => {
  const marks = bandMinutes(30);

  assert.deepEqual(marks, [10, 20, 30]);
  assert.equal(marks.at(-1), 30, "the outermost mark is always the budget itself");
});

test("with a floor the marks divide the range, not the budget", () => {
  // The bug this fixes: dividing the budget put a 15-to-25 range's inner
  // marks at 8 and 17 - one outside the range entirely, the other a minute
  // inside it - so the band lost its gradient exactly when it became a band.
  const marks = bandMinutes(50, 30);

  for (const mark of marks) {
    assert.ok(mark > 30, `mark ${mark} is inside the excluded middle`);
    assert.ok(mark <= 50, `mark ${mark} is past the budget`);
  }
  assert.deepEqual(marks, [37, 43, 50]);
});

test("a narrow range draws fewer contours rather than crowding three in", () => {
  // Three shapes only read as three while they are far enough apart to be
  // told apart. Closer than five minutes of walking the fills stack into one
  // wash and the lines crowd into a single fuzzy edge.
  assert.deepEqual(bandMinutes(25, 15), [20, 25], "ten minutes carries two");
  assert.deepEqual(bandMinutes(25, 20), [25], "five carries only its own edge");
  assert.deepEqual(bandMinutes(20, 18), [20]);

  // The same rule without a floor: a small budget was crowded too.
  assert.deepEqual(bandMinutes(10), [5, 10]);
});

test("no two marks are closer than the readable minimum", () => {
  for (const [budget, floor] of [[25, 15], [40, 10], [100, 60], [30, 0], [12, 0], [50, 44]] as const) {
    const marks = bandMinutes(budget, floor);
    const edges = [floor, ...marks];
    for (let i = 1; i < edges.length; i++) {
      assert.ok(
        edges[i]! - edges[i - 1]! >= 5,
        `${floor}-${budget} put contours ${edges[i - 1]} and ${edges[i]} together`,
      );
    }
  }
});

test("the same request returns the same frozen array, so callers cannot skew it", () => {
  const once = bandMinutes(45, 20);
  assert.equal(bandMinutes(45, 20), once, "memoised by range, not just by budget");
  assert.ok(Object.isFrozen(once));

  // A different floor is a different answer, not a cache hit on the budget.
  assert.notDeepEqual(bandMinutes(45, 20), bandMinutes(45));
});
