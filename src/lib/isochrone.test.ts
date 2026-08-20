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
  const marks = bandMinutes(25, 15);

  for (const mark of marks) {
    assert.ok(mark > 15, `mark ${mark} is inside the excluded middle`);
    assert.ok(mark <= 25, `mark ${mark} is past the budget`);
  }
  assert.deepEqual(marks, [18, 22, 25]);
});

test("marks stay clear of both ends, so no two contours draw on top of each other", () => {
  // A range too narrow to fit an inner mark three minutes clear of each end
  // draws one contour rather than three stacked in the same place.
  assert.deepEqual(bandMinutes(20, 18), [20]);

  for (const [budget, floor] of [[25, 15], [40, 10], [100, 60], [30, 0]] as const) {
    for (const mark of bandMinutes(budget, floor)) {
      const isOutermost = mark === budget;
      assert.ok(
        isOutermost || (mark <= budget - 3 && mark >= floor + 3),
        `mark ${mark} crowds an end of ${floor}-${budget}`,
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
