/**
 * Why a place is not in the pool.
 *
 * The app has always told the truth about what you can walk to and said nothing
 * at all about what it left out. Tick *Food* and *Hilly* at the same dial and it
 * hands you a Spin button that does not press and one sentence — "Nothing
 * matches inside 25 minutes" — which is true and useless. It does not say that
 * twelve places were in reach and eleven failed the terrain test, so the reader
 * is left guessing which of the six things they touched did it.
 *
 * So the derivation stops returning a list and starts returning a verdict per
 * place: included, or the ordered set of reasons it was dropped. The counts
 * line, the drawer breakdown, the empty-pool fix and the sentence on the result
 * card all fall out of that one change.
 *
 * Four later features plug into this rather than filtering for themselves. That
 * is the whole point of the file: seven filters with one explanation, instead of
 * seven filters with three.
 *
 * Named `eligibility.ts` and not `pool.ts` on purpose — `src/lib/pool.ts` is the
 * concurrency helper, and two modules called `pool` one directory apart is a
 * trap somebody falls into exactly once.
 */
import type { Place, Vibe } from "../data/places.ts";
import { contains, type MultiPolygon } from "../lib/geometry.ts";
import { MAX_MINUTES, type Reach } from "../lib/isochrone.ts";
import { budgetStep, clampBudget } from "./session.ts";

/**
 * Every way a place can fail to make the pool. This union is the contract the
 * hours, weather, elevation and places-expansion specs plug into: a sibling adds
 * its member here and to REASON_ORDER and REASON_COPY, and gets counting,
 * grouping, the drawer breakdown and the empty-pool fix for free.
 *
 * `daylight-budget` is deliberately absent. Darkness clamps the dial and never
 * filters the pool, so a reason code reserved for it would be a permanently dead
 * member asserted total by two tests. Its effect arrives as a smaller budget,
 * which shows up as `out-of-reach`, which is the truth.
 *
 * `hours-unknown` is absent for the same reason: `opening-hours` always keeps an
 * unknown and never filters on it, so the member would never be produced.
 * `out-of-their-reach` arrives with `meet-in-the-middle` in chunk 11, which is
 * the chunk that can produce it.
 */
export type ExclusionReason =
  | "out-of-reach" // outside the outermost contour at this budget
  | "inside-floor" // closer than the range's lower end
  | "wrong-terrain" // the climb band, measured per route rather than tagged per place
  | "no-matching-vibe" // the vibe chips
  | "kind" // owned by places-expansion: the tier/kind chip
  | "not-far-edge" // edgeOnly, and it sits inside the next contour in
  | "closed" // owned by opening-hours: shut on arrival, or on return
  | "weather"; // owned by weather-filters

/**
 * Fixed order. The first reason in a verdict is the primary one, and it is what
 * the counts line and the drawer group by.
 *
 * Ordered by how fundamental the obstacle is: geometry the walker cannot argue
 * with, then the reader's own chips, then the far-edge band, then conditions of
 * the world. Nothing about the place or the clock changes whether it is three
 * miles away, so that is reported first; a vibe chip is the reader's own choice,
 * so it is reported before the weather, which is nobody's.
 */
export const REASON_ORDER: readonly ExclusionReason[] = [
  "out-of-reach",
  "inside-floor",
  "wrong-terrain",
  "no-matching-vibe",
  "kind",
  "not-far-edge",
  "closed",
  "weather",
];

/**
 * All copy, in one total record, so `Object.keys` can be compared against
 * REASON_ORDER at runtime. A missing member is a `tsc` error; a member missing
 * from REASON_ORDER is a test failure. Both, because `npm test` runs under
 * Node's type stripping and never sees a type.
 */
type ReasonCopy = {
  /** "12 shut" */
  readonly clause: (n: number) => string;
  /** "Shut when you would get there." */
  readonly sentence: string;
  /** "Shut on arrival" */
  readonly heading: string;
};

export const REASON_COPY = {
  "out-of-reach": {
    clause: (n: number) => `${n} too far`,
    sentence: "Further than your budget walks.",
    heading: "Too far",
  },
  "inside-floor": {
    clause: (n: number) => `${n} too close`,
    sentence: "Closer than the range's lower end.",
    heading: "Too close",
  },
  // Renamed in copy only when the climb filter replaced the terrain chip. One
  // control, one reason code, one clause - a second member would have made the
  // same filter answer to two names.
  "wrong-terrain": {
    clause: (n: number) => `${n} wrong climb`,
    sentence: "Not the climb you asked for.",
    heading: "Wrong climb",
  },
  "no-matching-vibe": {
    clause: (n: number) => `${n} no match`,
    sentence: "None of the things you are looking for.",
    heading: "No matching vibe",
  },
  kind: {
    clause: (n: number) => `${n} wrong kind`,
    sentence: "Not the kind of place you asked for.",
    heading: "Wrong kind",
  },
  "not-far-edge": {
    clause: (n: number) => `${n} not on the edge`,
    sentence: "Not out in the far edge band.",
    heading: "Not on the far edge",
  },
  closed: {
    clause: (n: number) => `${n} shut`,
    sentence: "Shut when you would get there.",
    heading: "Shut on arrival",
  },
  weather: {
    clause: (n: number) => `${n} rained out`,
    sentence: "Not a walk for this weather.",
    heading: "Weather",
  },
  // `satisfies` rather than an annotation: the record still has to be total
  // over the union - a missing member is a tsc error, which is the whole point -
  // but the inferred type keeps each entry's own shape rather than widening
  // every one of them to the same open dictionary.
} satisfies Readonly<Record<ExclusionReason, ReasonCopy>>;

export type PlaceVerdict =
  | { readonly placeId: string; readonly included: true }
  | {
      readonly placeId: string;
      readonly included: false;
      /** Non-empty, deduplicated, ordered by REASON_ORDER. `reasons[0]` is primary. */
      readonly reasons: readonly ExclusionReason[];
    };

/**
 * One removable cause of exclusion, contributed by a sibling feature.
 *
 * `excludes` must be pure and must not read a mutable cache when called: build
 * the rule from values already read this render and close over them.
 *
 * `signature` is the memo's only way to know the rule's verdicts could have
 * changed. It must change exactly when they could, and must **not** change per
 * render. A signature that churns turns the memo off, and then feeds churn into
 * `candidateKey`, which fires the spin-abort effect and makes spinning
 * impossible with no error anywhere. That failure is the single largest risk in
 * the v0.5 plan, and `signature.test.ts` exists to catch it.
 *
 * `clear` is a plain callback, not an `Action`. Every component in this repo
 * takes `onClimb`/`onToggleVibe`/`onPick` and never sees the reducer's
 * vocabulary; App closes over `dispatch` when it builds the rule, and this
 * module stays free of `session.ts`'s action type.
 */
export type PoolRule = {
  /**
   * Unique per rule instance. Two rules may share a `reason` — `weather-filters`
   * fires four at once and needs each withdrawal attributable — so identity and
   * reason are separate things.
   */
  readonly id: string;
  readonly reason: ExclusionReason;
  /** False when the user has the feature switched off, or its data has not loaded. */
  readonly active: boolean;
  /** Sentence-case, for the fix button: "Ignore opening hours". */
  readonly clearLabel: string;
  readonly clear: () => void;
  readonly signature: string;
  /** The withdrawal guard: below this many survivors, the rule sets itself aside. */
  readonly minSurvivors?: number;
  /**
   * True when this rule decides on data that arrives asynchronously per place.
   * Places it has not measured yet are held OUT of `included` but stay IN
   * `baseIncluded`, so the Spin gate has a denominator that does not count
   * downward while the reader watches it.
   */
  readonly deferred?: boolean;
  readonly excludes: (place: Place) => boolean;
  /** One sentence naming this rule specifically, for the drawer and the notice. */
  readonly detail?: string;
};

export type PoolConditions = {
  readonly reach: Reach | null;
  /**
   * The floor contour itself, so "too close" can be told apart from "too far".
   * `reach.bands` already carries the floor as a hole, so containment alone
   * cannot distinguish them. Null when there is no lower bound.
   */
  readonly floorPolygons: MultiPolygon | null;
  readonly vibes: readonly Vibe[];
  readonly edgeOnly: boolean;
  readonly rules: readonly PoolRule[];
};

export type PoolReport = {
  readonly verdicts: ReadonlyMap<string, PlaceVerdict>;
  /** The pool. Same list, same order, that `selectCandidates` returned. */
  readonly included: readonly Place[];
  /**
   * The id join of `included`. Computed here rather than at the call site so it
   * shares the report's identity: App feeds it to a `useMemo` that keeps
   * MapCanvas from re-uploading every place on every render, and a key
   * recomputed from a fresh `.map().join()` each render is a chain the React
   * Compiler cannot prove stable.
   */
  readonly includedKey: string;
  /**
   * The same ids as a Set, for the map's "is this place in the pool" test.
   *
   * Built here rather than in a `useMemo` at the call site, and that is a
   * correctness point rather than a tidiness one: its identity is the report's
   * identity, so it is stable exactly as long as the pool is, and MapCanvas
   * stops re-uploading every place on every render without anyone having to
   * argue with the React Compiler about whether a derived string is stable.
   */
  readonly includedIds: ReadonlySet<string>;
  /**
   * `included`, plus every place excluded ONLY by rules marked `deferred`.
   *
   * This is what the route prefetch, the settlement count and the warm grace
   * count — never `included`, which shrinks as measurements land. Counting
   * `included` makes "Measuring climb 3/12" tick downward on both halves at once
   * and re-waves the prefetch on every settling route.
   */
  readonly baseIncluded: readonly Place[];
  /** The id join of `baseIncluded`, which is the identity those consumers key on. */
  readonly baseKey: string;
  readonly total: number;
  /**
   * Places that passed geometry: an included verdict, or an excluded verdict
   * whose reasons contain neither `out-of-reach` nor `inside-floor`. This is the
   * number the phrase "in reach" is allowed to name, anywhere in the UI.
   */
  readonly inReach: number;
  /** How many places each reason was the PRIMARY reason for. Total record. */
  readonly counts: Readonly<Record<ExclusionReason, number>>;
  /** Ids of rules set aside by their own `minSurvivors` guard. Usually empty. */
  readonly withdrawn: readonly string[];
};

/**
 * The single change most likely to refill an empty pool. Computed only when
 * `included` is empty, because it re-runs the verdict once per droppable cause.
 */
export type PoolFix =
  | {
      /**
       * `clear` is authoritative for a cause a sibling contributed as a
       * `PoolRule` - that rule brought its own callback. For the three chips
       * this app already owns (vibes, far edge) it is a no-op, because
       * clearing those means dispatching to the reducer and this module is
       * deliberately free of the reducer's vocabulary. App switches on `reason`
       * for exactly those three and falls through to `clear` for everything
       * else; `EmptyPoolNotice` never calls either directly.
       */
      readonly kind: "drop-rule";
      readonly reason: ExclusionReason;
      readonly clearLabel: string;
      readonly clear: () => void;
      readonly recovers: number;
    }
  | {
      readonly kind: "widen-budget";
      readonly budgetMinutes: number;
      readonly nearest: string;
      readonly nearestMinutes: number;
    }
  | { readonly kind: "lower-floor"; readonly recovers: number }
  | { readonly kind: "none" };

/** Outbound walking minutes to each place from the current origin, from the route cache. */
export type WalkMinutes = ReadonlyMap<string, number>;

const orderIndex = (reason: ExclusionReason): number => REASON_ORDER.indexOf(reason);

/**
 * The `clear` for a cause this app already owns as a chip. A no-op on purpose:
 * clearing a chip is a dispatch, and this module is deliberately free of the
 * reducer's vocabulary, so App resolves those three by reason instead.
 */
const byReducer = (): void => {};

/**
 * Every reason at zero.
 *
 * Written out rather than built from REASON_ORDER in a loop, because a loop
 * needs an assertion to start from an empty object and this way `tsc` checks
 * the record is total - which is the same guarantee, taken from the type system
 * instead of from a comment.
 */
const emptyCounts = () => ({
  "out-of-reach": 0,
  "inside-floor": 0,
  "wrong-terrain": 0,
  "no-matching-vibe": 0,
  kind: 0,
  "not-far-edge": 0,
  closed: 0,
  weather: 0,
}) satisfies Record<ExclusionReason, number>;

/**
 * One place's verdict, ignoring withdrawal.
 *
 * Accumulates the whole set rather than short-circuiting on the first reason:
 * the per-place explanation wants all of them — "shut, and also the wrong
 * climb for your setting" is a different conversation from "shut" — and the
 * extra work is a handful of comparisons on places that are already out.
 */
export function explainPlace(place: Place, conditions: PoolConditions): PlaceVerdict {
  const reasons: ExclusionReason[] = [];
  const bands = conditions.reach?.bands;

  if (bands === undefined || bands.length === 0) {
    return { placeId: place.id, included: false, reasons: ["out-of-reach"] };
  }

  const outer = bands[bands.length - 1];
  const inner = conditions.edgeOnly && bands.length > 1 ? bands[bands.length - 2] : undefined;

  // Geometry first. `outer` carries the floor as a hole, so a place inside the
  // floor fails `contains` for exactly the same reason a place beyond the budget
  // does. The floor contour is the only thing that tells them apart.
  const inside = outer !== undefined && contains(outer.polygons, place);
  if (!inside) {
    if (conditions.floorPolygons !== null && contains(conditions.floorPolygons, place)) {
      reasons.push("inside-floor");
    } else {
      reasons.push("out-of-reach");
    }
  }

  // The reader's own chips. Climb is not among them any more: it is measured
  // per route rather than tagged per place, so it arrives as a `deferred`
  // PoolRule from App and is evaluated below with everything else.
  if (conditions.vibes.length > 0 && !place.tags.some((tag) => conditions.vibes.includes(tag))) {
    reasons.push("no-matching-vibe");
  }

  // The far edge band. Only meaningful for a place that is in reach at all, and
  // a no-op when `bandMinutes` produced a single band.
  if (inside && inner !== undefined && contains(inner.polygons, place)) {
    reasons.push("not-far-edge");
  }

  // Conditions of the world, contributed by siblings.
  for (const rule of conditions.rules) {
    if (rule.active && rule.excludes(place)) reasons.push(rule.reason);
  }

  if (reasons.length === 0) return { placeId: place.id, included: true };

  // Deduplicated, because two weather rules firing on one place is one
  // `"weather"` to everything downstream, and sorted because rules may be
  // registered in any order.
  const ordered = [...new Set(reasons)].toSorted((a, b) => orderIndex(a) - orderIndex(b));
  return { placeId: place.id, included: false, reasons: ordered };
}

/** Reasons a verdict still holds once `dropped` rule reasons are ignored. */
function reasonsWithout(
  verdict: PlaceVerdict,
  dropped: ReadonlySet<ExclusionReason>,
): readonly ExclusionReason[] {
  if (verdict.included) return [];
  return verdict.reasons.filter((reason) => !dropped.has(reason));
}

/**
 * Every verdict, plus the counting the UI reads.
 *
 * Withdrawal exists because `weather-filters` auto-drops a rule that would leave
 * fewer than a handful of places. A withdrawn rule is neither inactive nor
 * excluding, and if this module could not express it, the empty-pool notice
 * could never name weather — weather would have withdrawn itself before the
 * notice ran. So it is expressed here, once, for anyone.
 */
export function derivePool(
  places: readonly Place[],
  conditions: PoolConditions,
): PoolReport {
  let verdicts = places.map((place) => explainPlace(place, conditions));

  // Withdrawal, and only when some active rule asks for it. Rare, so the common
  // case stays a single pass.
  const guarded = conditions.rules
    .filter((rule) => rule.active && rule.minSurvivors !== undefined)
    .toSorted((a, b) => orderIndex(a.reason) - orderIndex(b.reason));

  const withdrawn: string[] = [];
  const withdrawnReasons = new Set<ExclusionReason>();
  for (const rule of guarded) {
    const survivors = verdicts.filter(
      (verdict) => reasonsWithout(verdict, withdrawnReasons).length === 0,
    ).length;
    const relaxed = new Set([...withdrawnReasons, rule.reason]);
    const without = verdicts.filter(
      (verdict) => reasonsWithout(verdict, relaxed).length === 0,
    ).length;
    // Not cascading: dropping the preference does not un-drop the veto. And the
    // second test matters - a rule that is not the thing emptying the pool
    // should not withdraw itself for someone else's exclusion.
    if (survivors < (rule.minSurvivors ?? 0) && survivors < without) {
      withdrawn.push(rule.id);
      withdrawnReasons.add(rule.reason);
    }
  }

  if (withdrawn.length > 0) {
    const kept = conditions.rules.filter((rule) => !withdrawn.includes(rule.id));
    verdicts = places.map((place) => explainPlace(place, { ...conditions, rules: kept }));
  }

  const deferredReasons = new Set(
    conditions.rules
      .filter((rule) => rule.active && rule.deferred === true && !withdrawn.includes(rule.id))
      .map((rule) => rule.reason),
  );

  const byId = new Map<string, PlaceVerdict>();
  const included: Place[] = [];
  const baseIncluded: Place[] = [];
  const counts = emptyCounts();
  let inReach = 0;

  places.forEach((place, index) => {
    const verdict = verdicts[index];
    if (verdict === undefined) return;
    byId.set(place.id, verdict);

    if (verdict.included) {
      included.push(place);
      baseIncluded.push(place);
      inReach += 1;
      return;
    }

    const primary = verdict.reasons[0];
    if (primary !== undefined) counts[primary] += 1;
    if (!verdict.reasons.includes("out-of-reach") && !verdict.reasons.includes("inside-floor")) {
      inReach += 1;
    }
    // Excluded only by deferred rules means "not measured yet", which is a
    // different state from "measured and rejected".
    if (verdict.reasons.every((reason) => deferredReasons.has(reason))) baseIncluded.push(place);
  });

  return {
    verdicts: byId,
    included,
    includedKey: included.map((place) => place.id).join(","),
    includedIds: new Set(included.map((place) => place.id)),
    baseIncluded,
    baseKey: baseIncluded.map((place) => place.id).join(","),
    total: places.length,
    inReach,
    counts,
    withdrawn,
  };
}

/**
 * ASCII unit separator.
 *
 * Not `"|"` or `":"`: a rule signature is a sibling's free-form string —
 * `opening-hours` is told to use something like `"1042|strict"` — so a printable
 * joiner can appear inside a field, and two different condition sets can then
 * produce the same signature. This is the delimiter no sibling will put in one.
 */
const US = "";

/**
 * The memo key's non-reach half. Exported because `ReachReadout` needs an
 * identity for "the filters changed" that does not change per scrub frame.
 */
export function conditionsSignature(conditions: PoolConditions): string {
  return [
    conditions.vibes.join("+"),
    String(conditions.edgeOnly),
    conditions.floorPolygons === null ? "-" : "f",
    ...conditions.rules
      .filter((rule) => rule.active)
      .map((rule) => `${rule.id}${US}${rule.reason}${US}${rule.signature}`),
  ].join(US);
}

type MemoEntry = {
  places: readonly Place[];
  signature: string;
  report: PoolReport;
};

/**
 * Keyed on the reach object, the same trick `smooth.ts` plays on contours.
 *
 * A `WeakMap` rather than a single slot because a dial oscillating between two
 * warm positions hits the memo both ways, and it costs nothing extra: the
 * assembled-reach LRU already returns the same object for a given origin,
 * budget and floor, so the key is stable per dial position.
 *
 * Not `useMemo`, and this is the one place the repo's "derived values are not
 * memoised" rule bends. A dependency array cannot see the reach cache, which is
 * precisely the bug `candidateIds` is memoised on a string key to avoid.
 */
const MEMO = new WeakMap<Reach, MemoEntry>();
let nullSlot: MemoEntry | null = null;

/** Memoising wrapper over `derivePool`. App calls this; tests call `derivePool`. */
export function poolReport(
  places: readonly Place[],
  conditions: PoolConditions,
): PoolReport {
  const signature = conditionsSignature(conditions);
  const entry = conditions.reach === null ? nullSlot : (MEMO.get(conditions.reach) ?? null);
  if (entry !== null && entry.places === places && entry.signature === signature) {
    return entry.report;
  }

  const report = derivePool(places, conditions);
  const fresh: MemoEntry = { places, signature, report };
  if (conditions.reach === null) nullSlot = fresh;
  else MEMO.set(conditions.reach, fresh);
  return report;
}

/**
 * The single change most likely to refill an empty pool.
 *
 * Every branch but one is a counterfactual: re-run the verdict with exactly one
 * cause dropped and count the survivors, so the number on the button was
 * measured rather than guessed. `widen-budget` is the exception and says so by
 * carrying no count at all — pool membership is decided by polygon containment
 * while the only "how much further" evidence the app holds is a cached route
 * duration, and contour generalisation makes those two disagree at the margin.
 * A number that could be wrong is worse than no number in a feature whose whole
 * thesis is that the app does not guess.
 */
export function suggestFix(
  places: readonly Place[],
  conditions: PoolConditions,
  walkMinutes: WalkMinutes,
  budget: { readonly roundTrip: boolean },
): PoolFix {
  const candidates: { fix: PoolFix; recovers: number; order: number }[] = [];

  const consider = (
    reason: ExclusionReason,
    clearLabel: string,
    clear: () => void,
    relaxed: PoolConditions,
  ): void => {
    const recovers = derivePool(places, relaxed).included.length;
    if (recovers > 0) {
      candidates.push({
        fix: { kind: "drop-rule", reason, clearLabel, clear, recovers },
        recovers,
        order: orderIndex(reason),
      });
    }
  };

  if (conditions.vibes.length > 0) {
    consider("no-matching-vibe", "Clear what you are looking for", byReducer, {
      ...conditions,
      vibes: [],
    });
  }
  if (conditions.edgeOnly) {
    consider("not-far-edge", "Include the whole reach", byReducer, {
      ...conditions,
      edgeOnly: false,
    });
  }
  for (const rule of conditions.rules) {
    if (!rule.active) continue;
    consider(rule.reason, rule.clearLabel, rule.clear, {
      ...conditions,
      rules: conditions.rules.filter((other) => other !== rule),
    });
  }

  if (candidates.length > 0) {
    // Ties break by REASON_ORDER reversed: prefer removing a condition of the
    // world over removing the reader's own chip, because the chip is the thing
    // they meant.
    const best = candidates.toSorted((a, b) => b.recovers - a.recovers || b.order - a.order)[0];
    if (best !== undefined) return best.fix;
  }

  const report = derivePool(places, conditions);
  if (report.counts["inside-floor"] > 0) {
    return { kind: "lower-floor", recovers: report.counts["inside-floor"] };
  }

  // Only places whose sole complaint is distance can be fixed by more distance.
  let nearestMinutes = Number.POSITIVE_INFINITY;
  let nearestName: string | null = null;
  for (const place of places) {
    const verdict = report.verdicts.get(place.id);
    if (verdict === undefined || verdict.included) continue;
    if (verdict.reasons.length !== 1 || verdict.reasons[0] !== "out-of-reach") continue;
    const minutes = walkMinutes.get(place.id);
    if (minutes === undefined) continue;
    if (minutes < nearestMinutes) {
      nearestMinutes = minutes;
      nearestName = place.name;
    }
  }

  if (nearestName !== null && Number.isFinite(nearestMinutes)) {
    const whole = Math.ceil(nearestMinutes);
    const raw = budget.roundTrip ? whole * 2 : whole;
    // Compared BEFORE clamping, deliberately. `clampBudget` ends in
    // `Math.min(MAX_MINUTES, …)`, so a post-clamp check can never fire:
    // clampBudget(160, true) is 100, and the app would cheerfully offer
    // "Try 100 min" for a walk that needs 160.
    if (raw <= MAX_MINUTES) {
      // Snapped upward, not to-nearest, for the same reason: `clampBudget`
      // rounds to the nearest notch, so a coarser dial would snap a raw 62 down
      // to 60 and the proposed budget still would not reach the place the button
      // names. DIAL_STEP is 1 today, which makes this a no-op - and the step is a
      // function precisely because it has changed before.
      let snapped = clampBudget(raw, budget.roundTrip);
      if (snapped < raw) snapped = clampBudget(raw + budgetStep(), budget.roundTrip);
      if (snapped >= raw) {
        return {
          kind: "widen-budget",
          budgetMinutes: snapped,
          nearest: nearestName,
          nearestMinutes: whole,
        };
      }
    }
  }

  return { kind: "none" };
}

/** At most this many reason clauses on the summary line. */
const MAX_CLAUSES = 2;

/**
 * The clause half of the pool line: `["12 shut", "6 wrong climb"]`.
 *
 * Geometry reasons are excluded — they are the difference between `inReach` and
 * `total`, and `.readout` already names `inReach`. Saying it twice was the bug
 * this function's earlier draft had.
 *
 * Capped at two, not three, because the line lives above the Spin button on a
 * 320px sheet and the third clause is always the one nobody is fixing.
 */
export function summaryClauses(report: PoolReport): string[] {
  return REASON_ORDER.filter(
    (reason) =>
      reason !== "out-of-reach" && reason !== "inside-floor" && report.counts[reason] > 0,
  )
    .toSorted((a, b) => report.counts[b] - report.counts[a] || orderIndex(a) - orderIndex(b))
    .slice(0, MAX_CLAUSES)
    .map((reason) => REASON_COPY[reason].clause(report.counts[reason]));
}

/**
 * The pool line: "6 to spin · 12 shut · 6 wrong climb". Pool size first, then
 * at most two reason clauses. The "N of M in reach" headline is deliberately not
 * here — that is `ReachReadout`'s existing sentence.
 */
export function summaryLine(report: PoolReport): string {
  return [`${report.included.length} to spin`, ...summaryClauses(report)].join(" · ");
}
