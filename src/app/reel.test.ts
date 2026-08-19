/**
 * The spin reel's felt properties, asserted against the phase machine the
 * animation loop actually runs.
 *
 * Two bugs motivated these, both of which read to a user as "it jumped to the
 * answer rather than landing on it", and neither of which an earlier version
 * of this file caught because it simulated frames the loop never drew:
 *
 *   1. the reel stopped one slot short and let the result card supply the
 *      winner, so the last name drawn was never the answer;
 *   2. once the throw's clock was up but the winner's walking route had not
 *      arrived, the reel froze on a name for as long as the route took, then
 *      moved once - which is the giveaway, since a wheel that has stopped
 *      turning has already decided.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { flipsRemaining, orderAroundOrigin, reelFrameAt, type ReelStop } from "./reel.ts";
import { TUNING_DEFAULTS, TUNING_RANGE } from "./tuning.ts";

const SETTINGS = TUNING_DEFAULTS;
const SLOTS = 9;
const WINNER = 3;

/**
 * Replays a throw frame by frame at 60fps, exactly as the loop does: it only
 * advances the clock and records what the phase machine says to draw.
 * `routeReadyAt` is when the winner's route arrives, in ms.
 */
function replay(routeReadyAt: number, settings = SETTINGS, winnerSlot = WINNER, slotCount = SLOTS) {
  const drawn: { slot: number; at: number }[] = [];
  let stop: ReelStop | null = null;
  let shownSlot = -1;
  for (let at = 0; at < 60_000; at += 16) {
    const settled = at >= routeReadyAt;
    const overdue = at >= settings.spinDurationMs + settings.spinMaxHoldMs;
    if (stop === null && at >= settings.spinDurationMs && (settled || overdue)) {
      stop = { slot: shownSlot < 0 ? winnerSlot : shownSlot, at: 0 }.slot === undefined
        ? null
        : { slot: shownSlot < 0 ? winnerSlot : shownSlot, elapsed: at };
    }
    const frame = reelFrameAt(at, settings, winnerSlot, slotCount, stop);
    if (frame.kind === "land") return { drawn, landedAt: at };
    if (frame.slot !== shownSlot) {
      shownSlot = frame.slot;
      drawn.push({ slot: frame.slot, at });
    }
  }
  throw new Error("reel never landed");
}

test("the last name drawn is the winner, so the card is not a reveal", () => {
  for (const routeReadyAt of [0, 1000, 3999, 4500, 6000]) {
    const { drawn } = replay(routeReadyAt);
    assert.equal(drawn.at(-1)?.slot, WINNER, `route ready at ${routeReadyAt}ms`);
  }
});

test("the winner is stepped onto from the slot before it", () => {
  for (const routeReadyAt of [0, 2000, 4500, 6000]) {
    const { drawn } = replay(routeReadyAt);
    const step = (drawn.at(-1)!.slot - drawn.at(-2)!.slot + SLOTS) % SLOTS;
    assert.equal(step, 1, `arrived by a jump of ${step} (route ready ${routeReadyAt}ms)`);
  }
});

test("a slow route keeps the reel turning instead of parking it", () => {
  // The regression: the reel used to freeze on one name for the whole wait.
  const routeReadyAt = 7000;
  const { drawn } = replay(routeReadyAt);
  const duringWait = drawn.filter((d) => d.at >= SETTINGS.spinDurationMs && d.at < routeReadyAt);
  assert.ok(
    duringWait.length >= 5,
    `reel drew only ${duringWait.length} names across a ${routeReadyAt - SETTINGS.spinDurationMs}ms wait`,
  );
  // and it must never stall: no two consecutive draws further apart than a
  // final-cadence tick, with a frame of slack.
  for (let i = 1; i < duringWait.length; i++) {
    const gap = duringWait[i]!.at - duringWait[i - 1]!.at;
    assert.ok(gap <= SETTINGS.spinLastFlipMs + 32, `reel stalled for ${gap}ms mid-wait`);
  }
});

test("every draw advances exactly one slot, so it reads as rotation", () => {
  const { drawn } = replay(5500);
  for (let i = 1; i < drawn.length; i++) {
    const step = (drawn[i]!.slot - drawn[i - 1]!.slot + SLOTS) % SLOTS;
    assert.equal(step, 1, `draw ${i} moved ${step} slots`);
  }
});

test("the winner rests on screen before the card replaces it", () => {
  const { drawn, landedAt } = replay(1000);
  const restFor = landedAt - drawn.at(-1)!.at;
  assert.ok(
    restFor >= SETTINGS.spinSettleMs - 32,
    `winner shown for only ${restFor}ms, wanted ~${SETTINGS.spinSettleMs}ms`,
  );
});

test("a throw laps the reel rather than nudging a few names", () => {
  assert.ok(replay(0).drawn.length > SLOTS);
});

test("a route that never arrives still lands, and still lands on the winner", () => {
  const { drawn, landedAt } = replay(Number.POSITIVE_INFINITY);
  assert.equal(drawn.at(-1)?.slot, WINNER);
  assert.ok(landedAt >= SETTINGS.spinDurationMs + SETTINGS.spinMaxHoldMs);
});

test("it holds for any pool size and any winner position", () => {
  for (const slotCount of [1, 2, 5, 9, 51]) {
    for (const winnerSlot of [0, slotCount - 1]) {
      const { drawn } = replay(2000, SETTINGS, winnerSlot, slotCount);
      assert.equal(drawn.at(-1)?.slot, winnerSlot, `pool ${slotCount}, winner ${winnerSlot}`);
    }
  }
});

test("it holds across the tuning panel's range", () => {
  const variants = [
    { ...SETTINGS, spinDurationMs: 500, spinFirstFlipMs: 10, spinLastFlipMs: 40 },
    { ...SETTINGS, spinDurationMs: 10000, spinFirstFlipMs: 300, spinLastFlipMs: 1200 },
    { ...SETTINGS, spinEaseExponent: 1 },
    { ...SETTINGS, spinEaseExponent: 6 },
    { ...SETTINGS, spinSettleMs: TUNING_RANGE.spinSettleMs.min },
    { ...SETTINGS, spinSettleMs: TUNING_RANGE.spinSettleMs.max },
  ];
  for (const settings of variants) {
    const { drawn } = replay(1500, settings, 4, 7);
    assert.equal(drawn.at(-1)?.slot, 4, JSON.stringify(settings));
  }
});

test("flipsRemaining falls to zero exactly at the end of the throw", () => {
  assert.equal(flipsRemaining(SETTINGS.spinDurationMs, SETTINGS), 0);
  assert.ok(flipsRemaining(0, SETTINGS) > 0);
});

test("no reachable settle setting can skip drawing the winner", () => {
  // A settle of zero lands the instant the run-in arrives, so the winner is
  // never drawn - the original bug, reachable from the slider. The floor is
  // the guard, so assert the floor is meaningful and that it holds there.
  assert.ok(TUNING_RANGE.spinSettleMs.min >= 100, "settle floor is too low to be seen");
  const { drawn } = replay(1200, { ...SETTINGS, spinSettleMs: TUNING_RANGE.spinSettleMs.min });
  assert.equal(drawn.at(-1)?.slot, WINNER);
});

/* --- EXPERIMENT: compass ordering (spinCircularOrder) --------------------- */

test("compass order sweeps clockwise from north around the origin", () => {
  const origin = { lng: -77.4, lat: 37.5 };
  // Written deliberately out of order; N/E/S/W by construction.
  const north = { id: "n", lng: -77.4, lat: 37.52 };
  const east = { id: "e", lng: -77.38, lat: 37.5 };
  const south = { id: "s", lng: -77.4, lat: 37.48 };
  const west = { id: "w", lng: -77.42, lat: 37.5 };
  const ordered = orderAroundOrigin(origin, [south, west, north, east]);
  assert.deepEqual(
    ordered.map((p) => p.id),
    ["n", "e", "s", "w"],
  );
});

test("compass order keeps every place exactly once", () => {
  const origin = { lng: -77.4336, lat: 37.5388 };
  const places = Array.from({ length: 25 }, (_, i) => ({
    id: String(i),
    lng: origin.lng + Math.cos(i * 1.7) * 0.01,
    lat: origin.lat + Math.sin(i * 2.3) * 0.01,
  }));
  const ordered = orderAroundOrigin(origin, places);
  assert.equal(ordered.length, places.length);
  assert.deepEqual(
    ordered.map((p) => p.id).toSorted(),
    places.map((p) => p.id).toSorted(),
  );
});

test("compass order is stable, so the same pool always gives the same wheel", () => {
  const origin = { lng: -77.4, lat: 37.5 };
  // Two places on an identical bearing: input order has to decide.
  const near = { id: "near", lng: -77.4, lat: 37.51 };
  const far = { id: "far", lng: -77.4, lat: 37.52 };
  assert.deepEqual(
    orderAroundOrigin(origin, [near, far]).map((p) => p.id),
    ["near", "far"],
  );
  assert.deepEqual(
    orderAroundOrigin(origin, [far, near]).map((p) => p.id),
    ["far", "near"],
  );
});
