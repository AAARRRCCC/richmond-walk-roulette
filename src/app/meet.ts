/**
 * Where two people can both walk to.
 *
 * The app answers "where can *I* walk to in half an hour" better than anything
 * else does. The question two people actually ask each other is different and
 * nothing answers it honestly: every product that has tried computes a midpoint
 * and searches venues around it — which is the circle again, one level up, and
 * for two Richmonders on opposite banks the midpoint is in the water. There is
 * no middle. There is an **overlap**, and refusing that phrase is the same
 * refusal as refusing the circle: the feature is called *Both in reach*
 * everywhere a reader can see it.
 *
 * This module is the arithmetic half, and it is pure. It never touches the
 * contour cache — the reader is passed in — so every claim below is testable
 * without a network, a cache or a DOM.
 *
 * **`subtract()` must not be used here, and it is forbidden by name.** It reads
 * like a boolean difference and is not one: its own doc comment states its
 * justification, that isochrones from *one* origin are strictly nested, so an
 * inner exterior ring can be appended as a hole to whichever outer polygon
 * contains its first vertex. Two origins' contours cross. Applied here it would
 * append partially-overlapping rings as holes and produce geometry that is not
 * imprecise but meaningless — and `contains`, `areaSqMeters` and MapLibre would
 * all consume it happily. An implementer will reach for it. Do not.
 */
import type { Place } from "../data/places.ts";
import { contains, pointKey, type LngLat, type MultiPolygon } from "../lib/geometry.ts";
import { LADDER, MAX_MINUTES, type Reach } from "../lib/isochrone.ts";
import { formatMinutes } from "../lib/format.ts";
import { clampBudget } from "./session.ts";

/**
 * The smallest dial budget at which at least one place is inside both people's
 * outermost contour, or why there is no such number.
 *
 * `budgetMinutes` is a DIAL budget, in the same total-minutes units as
 * `Session.budgetMinutes` — already doubled for a round trip and already
 * snapped by `clampBudget` — so the notice's button and the dial cannot
 * disagree about the number written on the button's own face.
 *
 * `unmeasuredRungs` is how many rungs the scan could not read. It exists
 * because **a warm ladder is not a complete ladder**: `prefetchLadder` is best
 * effort per contour, so a minute Valhalla drops as degenerate is simply never
 * warm, and the ladder still resolves and still reports done. A scan that
 * treated that as "not warm yet" would leave the panel saying *"Waiting on
 * their side."* forever over a single dropped contour. So the scan skips it,
 * counts it, and the copy hedges by exactly one word.
 *
 * There is deliberately **no "incomplete" outcome**. Whether a warm-up is still
 * running is the CALLER's fact, read off `warmed` / `partnerWarmed`, and
 * `suggestFix` checks it before calling.
 */
export type MeetMinimum =
  | {
      readonly kind: "found";
      readonly budgetMinutes: number;
      readonly placeId: string;
      readonly placeName: string;
      /** Rungs below the answer that could not be read. Usually 0. */
      readonly unmeasuredBelow: number;
    }
  | { readonly kind: "none"; readonly unmeasuredRungs: number };

/** Both people's costs for one destination. Minutes, already round-tripped. */
export type MeetSplit = {
  readonly yourMinutes: number | null;
  readonly theirMinutes: number | null;
  /** max(yours, theirs), or null while either is unknown. */
  readonly bothByMinutes: number | null;
  /** |yours - theirs|, or null while either is unknown. */
  readonly gapMinutes: number | null;
};

/**
 * Above this, the card says who waits. Below it, the gap is not worth a line.
 *
 * A judgement rather than a measurement, and it is written down as one: eight
 * minutes is roughly half a kilometre at the pinned pace, which is the point at
 * which one person is plausibly standing outside waiting. Nothing else depends
 * on the number.
 */
export const MEET_GAP_MINUTES = 8;

/** Distinct pairs the meet-minimum memo holds before it starts evicting. */
const MEET_MEMO_LIMIT = 8;

/**
 * Ascending scan of the two cached ladders.
 *
 * Pure over the contour reader it is handed: App passes `cachedContour`, tests
 * pass a fixture function. `contourAt` returns the RAW outermost contour for
 * one origin at one outbound minute, or null when that rung is not cached.
 *
 * **Raw, and deliberately not `cachedReach`**, for two reasons that are both
 * silent when got wrong. `cachedReach` *writes* into the assembled-reach LRU,
 * which holds 192 entries sized as "two whole dials" for **one** origin — a
 * scan across two origins fills it end to end and evicts the live entries,
 * including the dial position currently on screen, which then re-assemble as
 * new objects and re-upload every contour to MapLibre. And it applies the floor
 * as a hole around whichever origin it is handed, which around the partner is
 * meaningless geometry.
 *
 * `floorPolygons` is the reader's OWN floor contour, or null, and it is applied
 * to the reader's side only. A floor is a preference about the reader's own
 * walk — "make me go at least this far" — and has no meaning at all as a hole
 * punched around somebody else's house.
 */
export function meetMinimum(args: {
  readonly you: LngLat;
  readonly them: LngLat;
  readonly places: readonly Place[];
  readonly roundTrip: boolean;
  readonly floorPolygons: MultiPolygon | null;
  readonly contourAt: (origin: LngLat, outboundMinutes: number) => MultiPolygon | null;
}): MeetMinimum {
  let unmeasured = 0;

  for (const minutes of LADDER) {
    const yours = args.contourAt(args.you, minutes);
    const theirs = args.contourAt(args.them, minutes);
    if (yours === null || theirs === null) {
      // The engine has no answer at this rung — not "wait longer". Counted, so
      // one word of the copy can say so.
      unmeasured += 1;
      continue;
    }

    for (const place of args.places) {
      if (!contains(yours, place)) continue;
      if (args.floorPolygons !== null && contains(args.floorPolygons, place)) continue;
      if (!contains(theirs, place)) continue;

      const raw = args.roundTrip ? minutes * 2 : minutes;
      // Compared BEFORE clamping, deliberately. `clampBudget` ends in
      // `Math.min(MAX_MINUTES, …)`, so a post-clamp check can never fire and
      // the app would cheerfully offer "Widen to 100 min" for a walk that needs
      // 160. The identical trap `widen-budget` documents, in a second file.
      if (raw > MAX_MINUTES) return { kind: "none", unmeasuredRungs: unmeasured };
      return {
        kind: "found",
        budgetMinutes: clampBudget(raw, args.roundTrip, null),
        placeId: place.id,
        placeName: place.name,
        unmeasuredBelow: unmeasured,
      };
    }
  }

  return { kind: "none", unmeasuredRungs: unmeasured };
}

type MemoArgs = Parameters<typeof meetMinimum>[0] & { readonly floorMinutes: number | null };

const memo = new Map<string, MeetMinimum>();

/**
 * Memoising wrapper.
 *
 * Only ever called once both warm-ups report done, so a cached answer cannot be
 * a snapshot of a half-warm ladder. The floor is in the key because a different
 * floor is a different question — and the key is deliberately *not* symmetric
 * in the two origins even though the result is, so that the shape of the key is
 * something a test can pin.
 *
 * @public - consumed by `suggestFix` and by `meet.test.ts`.
 */
export function cachedMeetMinimum(args: MemoArgs): MeetMinimum {
  const key = [
    pointKey(args.you),
    pointKey(args.them),
    String(args.roundTrip),
    args.floorMinutes === null ? "-" : String(args.floorMinutes),
  ].join("|");

  const hit = memo.get(key);
  if (hit !== undefined) return hit;

  const answer = meetMinimum(args);
  // FIFO rather than LRU: entries are tiny, the cap exists only so a session
  // that drags its origin around cannot grow this without bound, and a Map
  // iterates in insertion order.
  if (memo.size >= MEET_MEMO_LIMIT) {
    const oldest = memo.keys().next();
    if (!oldest.done) memo.delete(oldest.value);
  }
  memo.set(key, answer);
  return answer;
}

/** Both walks to one destination, in the dial's own units. */
export function meetSplit(args: {
  readonly yourSeconds: number | null;
  readonly theirSeconds: number | null;
  readonly roundTrip: boolean;
}): MeetSplit {
  const legs = args.roundTrip ? 2 : 1;
  const yourMinutes = args.yourSeconds === null ? null : (args.yourSeconds * legs) / 60;
  const theirMinutes = args.theirSeconds === null ? null : (args.theirSeconds * legs) / 60;
  const both = yourMinutes !== null && theirMinutes !== null;
  return {
    yourMinutes,
    theirMinutes,
    bothByMinutes: both ? Math.max(yourMinutes, theirMinutes) : null,
    gapMinutes: both ? Math.abs(yourMinutes - theirMinutes) : null,
  };
}

/**
 * "You'd both be there by 24 min." — null while either side is unknown.
 *
 * Through `formatMinutes` like every other number in the app, so the card, the
 * announcement and the notice cannot drift from each other or from the rest of
 * the app's number voice.
 */
export function describeBothBy(split: MeetSplit): string | null {
  if (split.bothByMinutes === null) return null;
  return `You'd both be there by ${formatMinutes(split.bothByMinutes * 60)}.`;
}

/**
 * "You get there 19 min before them." — null below `MEET_GAP_MINUTES`.
 *
 * The word "unfair" never appears, here or anywhere in this feature: it is a
 * claim about a relationship the app cannot see. Two numbers, and two adults
 * decide.
 */
export function describeGap(split: MeetSplit): string | null {
  const gap = split.gapMinutes;
  if (gap === null || gap < MEET_GAP_MINUTES) return null;
  const walk = formatMinutes(gap * 60);
  return (split.yourMinutes ?? 0) < (split.theirMinutes ?? 0)
    ? `You get there ${walk} before them.`
    : `They get there ${walk} before you.`;
}

/**
 * The identity of a partner's reachable area, for `conditionsSignature`.
 *
 * It must change when and only when the partner's verdicts could — **never per
 * render**. Every component is read off the assembled `Reach`, whose object
 * identity the assembled-reach LRU already keeps stable per origin, budget and
 * floor, so this moves when the partner moves, when the dial moves and when
 * their ladder warms into a new rung, and at no other time.
 *
 * Never derive it from a fetch counter, a timestamp or a render count: a
 * churning signature kills the pool's `WeakMap` memo *and* churns
 * `candidateKey`, which fires the spin-abort effect and makes spinning
 * impossible with no error anywhere. That is the single largest risk in this
 * plan and `signature.test.ts` is what catches it.
 */
export function partnerSignature(partnerReach: Reach | null): string {
  if (partnerReach === null) return "-";
  return [
    pointKey(partnerReach.origin),
    partnerReach.budgetMinutes,
    partnerReach.bands.length,
    Math.round(partnerReach.areaSqMeters),
  ].join(",");
}

/**
 * The sr-only clause naming both walks, for `announce.ts`'s array.
 *
 * Null outside a meet session and null while either number is missing, so the
 * announcement never gains an empty clause.
 */
export function describeMeetClause(split: MeetSplit, partnerName: string): string | null {
  if (split.yourMinutes === null || split.theirMinutes === null) return null;
  return (
    `${formatMinutes(split.yourMinutes * 60)} from your start, ` +
    `${formatMinutes(split.theirMinutes * 60)} from ${partnerName}`
  );
}
