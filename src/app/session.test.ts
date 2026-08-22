import { test } from "node:test";
import assert from "node:assert/strict";
import { dialMaximum, initialSession, reduce, type Session } from "./session.ts";
import { MAX_MINUTES } from "../lib/isochrone.ts";
import { PRESET_ORIGINS } from "../data/places.ts";
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

const rainCap = (minutes: number): TimeCap => ({
  minutes,
  reason: "rain",
  untilMs: Date.parse("2026-08-21T19:00:00Z"),
});

test("session: a weather cap answers to the weather switch, not the daylight one", () => {
  // Two switches, two reasons, one cap field. A weather cap that respected
  // `beforeDark` would clamp the dial for a mode the reader never turned on.
  const raining = reduce({ ...initialSession, beforeDark: false }, { type: "timeCap", cap: rainCap(30) });
  assert.equal(raining.budgetMinutes, 30);
  assert.equal(dialMaximum(raining), 30);

  const ignored = reduce(
    { ...initialSession, weatherAware: false, beforeDark: true },
    { type: "timeCap", cap: rainCap(30) },
  );
  assert.equal(dialMaximum(ignored), MAX_MINUTES);
  assert.equal(ignored.budgetMinutes, initialSession.budgetMinutes);
});

test("session: turning the weather off gives the dial back", () => {
  // The one-way clamp is the bug this asserts against. Without
  // `requestedBudgetMinutes` the reducer lowers `budgetMinutes` when the rain
  // moves in and never raises it again, so the button offering to undo the
  // cause undoes nothing and the pool stays empty.
  const capped = reduce(initialSession, { type: "timeCap", cap: rainCap(20) });
  assert.equal(capped.budgetMinutes, 20);

  const freed = reduce(capped, { type: "toggleWeatherAware" });
  assert.equal(freed.weatherAware, false);
  assert.equal(freed.budgetMinutes, initialSession.budgetMinutes, "the dial comes back to 50");
});

test("session: the dial the reader set is the one that comes back, not the last clamp", () => {
  const asked = reduce(initialSession, { type: "budget", minutes: 80 });
  assert.equal(asked.requestedBudgetMinutes, 80);

  const capped = reduce(asked, { type: "timeCap", cap: rainCap(25) });
  assert.equal(capped.budgetMinutes, 25);
  assert.equal(capped.requestedBudgetMinutes, 80, "the request survives the clamp");

  const lifted = reduce(capped, { type: "timeCap", cap: null });
  assert.equal(lifted.budgetMinutes, 80);
});

test("session: clearFilters leaves the weather switch alone", () => {
  // Same trap as `beforeDark`, stated from both ends: `activeFilters` does not
  // count the weather switch, so the count would not drop when this ran - and a
  // reader who deliberately turned the rules off would have them switched back
  // on by a button that says "clear".
  const off = reduce({ ...initialSession, weatherAware: false }, { type: "clearFilters" });
  assert.equal(off.weatherAware, false);
});

test("session: toggleWeatherAware never clears the pick", () => {
  // A weather rule can move the pool under an existing pick, and the card's
  // "outside your current time budget" warning is already the right answer.
  const picked = reduce(initialSession, { type: "pickPlace", pickedId: "vmfa" });
  assert.equal(reduce(picked, { type: "toggleWeatherAware" }).pickedId, "vmfa");
});

// ---------------------------------------------------------------------------
// The second person
// ---------------------------------------------------------------------------

test("partnerWarmProgress writes only partnerWarmed", () => {
  // In particular it must not move `warmed`, which is the scalar the on-demand
  // fetch gate reads and the dial shades with. Two scalars, one meaning each.
  const warmed = reduce(initialSession, { type: "warmProgress", fraction: 1 });
  const after = reduce(warmed, { type: "partnerWarmProgress", fraction: 0.5 });
  assert.equal(after.partnerWarmed, 0.5);
  assert.equal(after.warmed, 1);
  assert.equal(after.failure, null);
});

test("partnerFailed writes only partnerFailure", () => {
  // The assertion that a failure on their leg cannot blank your answer:
  // `failure` is read by the on-demand fetch gate and by `status`, so routing
  // their engine error there would put the whole panel in an error state.
  const after = reduce(initialSession, {
    type: "partnerFailed",
    failure: { message: "no", configured: true },
  });
  assert.equal(after.partnerFailure?.message, "no");
  assert.equal(after.failure, null);
  // Null clears it, which is what a retry does.
  assert.equal(reduce(after, { type: "partnerFailed", failure: null }).partnerFailure, null);
});

test("origin clears partnerFailure and preserves the partner", () => {
  const meeting = reduce(
    { ...initialSession, partner: PRESET_ORIGINS[1]! },
    { type: "partnerFailed", failure: { message: "no", configured: true } },
  );
  const moved = reduce(meeting, { type: "origin", origin: PRESET_ORIGINS[2]! });
  assert.equal(moved.originChosen, true);
  assert.equal(moved.partnerFailure, null, "the prefetch is about to re-run both legs");
  assert.ok(moved.partner !== null, "moving your own start does not un-invite anybody");
});

test("clearFilters preserves the partner", () => {
  // `clearFilters` resets exactly what the drawer's count counts, and that
  // count is the reader's choices about PLACES. A second person is not a
  // filter.
  const meeting = { ...initialSession, partner: PRESET_ORIGINS[1]!, vibes: ["park" as const] };
  const cleared = reduce(meeting, { type: "clearFilters" });
  assert.deepEqual(cleared.vibes, []);
  assert.ok(cleared.partner !== null);
});

test("dismissMeet drops the notices and keeps the meeting", () => {
  // The same shape as `dismissShared`: it dismisses what the app is SAYING
  // about the link, not the session the link created.
  const meeting = {
    ...initialSession,
    partner: PRESET_ORIGINS[1]!,
    meet: {
      kind: "invite" as const,
      mintedDay: 20690,
      partnerOutOfBounds: false,
      selfOutOfBounds: false,
      partnerLockedMinutes: null,
    },
  };
  const dismissed = reduce(meeting, { type: "dismissMeet" });
  assert.equal(dismissed.meet, null);
  assert.ok(dismissed.partner !== null);
  // A stray dispatch must not re-render the tree for nothing.
  assert.equal(reduce(dismissed, { type: "dismissMeet" }), dismissed);
});
