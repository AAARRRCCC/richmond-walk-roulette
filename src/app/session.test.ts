import { test } from "node:test";
import assert from "node:assert/strict";
import { dialMaximum, initialSession, reduce, type Session } from "./session.ts";
import { MAX_MINUTES } from "../lib/isochrone.ts";
import type { TimeCap } from "./conditions.ts";

const cap = (minutes: number): TimeCap => ({
  minutes,
  reason: "daylight",
  untilMs: Date.parse("2026-06-21T21:06:00Z"),
});

/** A session with the guard on and a cap already applied. */
const guarded = (minutes: number, over: Partial<Session> = {}): Session =>
  reduce({ ...initialSession, beforeDark: true, ...over }, { type: "timeCap", cap: cap(minutes) });

test("session: toggleBeforeDark clamps the budget down to the cap and bumps framingKey", () => {
  const capped = reduce({ ...initialSession, timeCap: cap(40) }, { type: "toggleBeforeDark" });

  assert.equal(capped.beforeDark, true);
  assert.equal(capped.budgetMinutes, 40, "the default 50 comes down to the cap");
  assert.equal(
    capped.framingKey,
    initialSession.framingKey + 1,
    "the outbound contour moved with no dial commit to piggyback on",
  );
});

test("session: timeCap returns the same state object when nothing moves", () => {
  // Applied once, then again with the same cap - and the second is compared
  // against the RESULT of the first. Calling reduce twice on the same input and
  // comparing the two results would pass by accident: if the input does not
  // already carry the cap, both calls allocate and the reference check fails.
  //
  // The identity that matters is the idempotent one. It is what keeps the
  // once-a-minute tick from re-rendering the tree.
  const once = reduce({ ...initialSession, beforeDark: true }, { type: "timeCap", cap: cap(40) });
  assert.equal(reduce(once, { type: "timeCap", cap: cap(40) }), once);
});

test("session: a cap below the dial minimum does not clamp the dial to an impossible value", () => {
  // After dark the cap is a fiction, and the honest answer is no clamp at all
  // rather than a dial with one position on it.
  const dark = guarded(3);
  assert.equal(dialMaximum(dark), MAX_MINUTES);
  assert.equal(dark.budgetMinutes, initialSession.budgetMinutes, "the budget is left alone");

  const none = reduce({ ...initialSession, beforeDark: true }, { type: "timeCap", cap: null });
  assert.equal(dialMaximum(none), MAX_MINUTES);
});

test("session: clearFilters leaves beforeDark on", () => {
  // The explicit anti-trap assertion. The mode is a safety bound, not a filter,
  // and "Clear filters" removing somebody's daylight guard would be a trap.
  const guardedOn = reduce({ ...initialSession, beforeDark: true }, { type: "clearFilters" });
  assert.equal(guardedOn.beforeDark, true);
});

test("session: toggleRoundTrip re-clamps against the cap as well as the round-trip minimum", () => {
  const capped = guarded(40);
  assert.equal(capped.budgetMinutes, 40);

  const oneWay = reduce(capped, { type: "toggleRoundTrip" });
  assert.equal(oneWay.roundTrip, false);
  assert.ok(oneWay.budgetMinutes <= 40, `budget ${oneWay.budgetMinutes} still respects the cap`);
});

test("session: the cap is a ceiling on the dial, not a shorter track", () => {
  // The dial's own track still spans the full range; only the usable maximum
  // moves, so the reader can see how much walk the light is costing them.
  assert.equal(dialMaximum(guarded(62)), 62);
  assert.equal(dialMaximum({ ...initialSession, beforeDark: false, timeCap: cap(62) }), MAX_MINUTES);
});
