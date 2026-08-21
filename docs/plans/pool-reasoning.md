# Why a place is not in the pool

**Status:** spec — not implemented
**Slug:** `pool-reasoning`

## Depends on

Nothing but the foundations chunk (`docs/plans/README.md` §2.7, §2.8) — the shared clock, the
`ResultLine` block and the announcement clause array. This is **chunk 2** in the build order and
lands against today's three filters with an empty `rules` array, before any sibling has a rule to
contribute.

**Four specs depend on this one** and cannot land before it: `elevation-profile`,
`weather-filters`, `places-expansion` and `opening-hours` each contribute a `PoolRule` rather than
an argument to the deleted `selectCandidates`.

`docs/plans/README.md` §2.3 amends this spec in three ways — `PoolRule` gains an `id` and a
`deferred` flag, `PoolReport` gains `baseIncluded`/`baseKey`, `hours-unknown` is struck from
`ExclusionReason` — and §3 amends `activeFilters` and the `clearFilters` contract. Read those
before implementing.

## What and why

Today the app answers one question honestly and a second question not at all. It will tell you the
truth about what you can walk to in twenty-five minutes — that is the entire argument of the thing —
and then, if you tick *Food* and *Hilly* at the same dial, it hands you a Spin button that does not
press and a sentence that says "Nothing matches inside 25 minutes." That sentence is true and useless.
It does not say that twelve places were in reach and eleven of them failed the terrain test. The user
is left to guess which of the toggles they touched did the damage, and the only offered repair is
*Clear filters*, which is a sledgehammer aimed at an unknown nail.

That gap is about to get much worse. `opening-hours`, `weather-filters` and `places-expansion` each
add an invisible way for a place to vanish, and `elevation-profile` replaces the terrain chip with a
measured one. Four more silent subtractions on top of the three we already have is not a filter panel,
it is a haunted house. So this spec does the thing the app already does for reach and does not yet do
for anything else: it makes the *reason* a first-class value. The candidate derivation stops returning
a list and starts returning a verdict per place — included, or the ordered set of reasons it was
dropped. Everything else falls out of that: a counts line that is always on screen, an empty-pool state
that names the single change most likely to fix it and puts the button to make that change right there,
a grouped breakdown in the drawer, and a sentence on the result card when you click a dimmed dot.

What it does not do: it does not rank, weight or reorder the draw — the spin stays a uniform pick over
`included` and `reel.ts` is untouched. It does not make excluded places pickable in the reel. It does
not explain *routes*: a place with no walking route is still a route failure surfaced on the result
card, not an exclusion reason, because it is in the pool and simply undrawable. And it does not
promise the reasons are complete — a place is excluded for the reasons this app can compute, and the
copy never says "the only reason".

## The decision

**One pure function owns the whole verdict, and siblings plug into it rather than filtering
themselves.** `selectCandidates` in App.tsx (line 808) is deleted and replaced by `derivePool(places,
conditions): PoolReport` in a new module `src/app/eligibility.ts`, in the spirit of `reel.ts`: every
decision a value, `node --test` coverage over the feel. The alternative — each sibling adding its own
`if` to `selectCandidates` and its own count somewhere — is what produces seven filters with three
explanations. This spec is written as the owner of that contract, and **four sibling specs currently
carry instructions that this deletion supersedes**; they are named line by line in *Contracts asked of
siblings* at the end, because a spec that quietly invalidates a sibling's file is how two implementers
produce two pools.

**Reasons are an ordered set, not a single reason.** A place can be both out of reach and shut, and
which one you show depends on what the reader is trying to fix. The order is fixed in `REASON_ORDER`
and runs geometry → the reader's own filter chips → the far-edge band → conditions of the world
(hours, weather). The rationale is *how fundamental the obstacle is*: nothing about the place or the
clock changes whether it is three miles away, so that is reported first; a vibe chip is the reader's
own choice, so it is reported before the weather, which is nobody's. The first reason in the set is
the *primary* reason, and it is the one the counts line and the drawer group by. The full ordered set
is kept, because "shut, and also the wrong terrain for your setting" is a different conversation
from "shut".

**Reasons are computed for every place, always, including places nobody asked about.** At the 61
places in `src/data/places.ts` today that is free. At the several hundred `places-expansion` proposes
it is one pass of a handful of comparisons plus one point-in-polygon per place — the same sweep
`selectCandidates` already does every render — so the cost does not change in kind. What does change
is that it now runs even when the pool is healthy, in order to produce the counts line. That is
deliberate: a summary that only appears when something is wrong teaches nobody what the filters do.

**Memoised with a `WeakMap` keyed on the reach, not `useMemo`.** The repo's rule is that derived
values are recomputed per render because they read mutable caches a dependency array cannot see, and
that rule stands. But `derivePool` is expensive enough at several hundred places and stable enough
between frames to earn the same trick `smooth.ts` uses on contours — and the exact same shape:
`smooth.ts` keeps a `WeakMap<MultiPolygon, MultiPolygon>` keyed on contour identity (smooth.ts:70),
not a single slot, and the reason generalises. A `WeakMap<Reach, …>` survives a dial oscillating
between two positions, which a one-slot cache gives up on, and it costs nothing extra because the
assembled-reach LRU already makes the key stable per dial position. Rejected: `useMemo` on a
dependency array — it cannot see the reach cache, which is precisely the bug `candidateIds` is
memoised on a string key to avoid.

**Excluded places stay dimmed on the map. They are not hidden.** This is the design decision the
brief asks for, and the current code already dims: `places-out` draws every place not in
`inReachIds` at r3 in `#4a5c6d` (MapCanvas.tsx:269-273), and both place layers are already clickable
via `PLACE_LAYERS`. A map that silently deletes two thirds of the city when you tick *Food* is the
same lie the reel is built not to tell, and the dot is the thing the user clicks to ask why. Hiding
them would not buy much either — the FeatureCollection is already re-serialised and re-uploaded on
any change of `places`/`inReachIds`/`pickedId`, so the *number* of uploads is identical; the payload
would be smaller, which is a real but small saving on a collection of a few hundred points. The
argument here is affordance, not bytes, and the spec no longer claims otherwise.

**But the dot has to be hittable.** MapLibre's hit test on a circle layer is its rendered radius, and
r3 on a phone is a target nobody lands. So `places-out` gains a transparent halo — `"circle-stroke-width":
weighted(7)` with `"circle-stroke-color": "rgba(0,0,0,0)"` — which paints nothing and widens the
query geometry. **Unverified: whether MapLibre GL JS includes `circle-stroke-width` in
`queryRenderedFeatures` hit geometry in the version pinned here. Check before implementing** (tap a
dim dot on a 390px viewport and confirm `onPickPlace` fires from ~8px away); **if it does not, add a
`places-out-hit` layer above it with `"circle-radius": weighted(10)`, `"circle-opacity": 0` and add
its id to `PLACE_LAYERS`.** Either way this is a MapCanvas change, so MapCanvas is no longer listed as
untouched.

**Two visual tiers only, not three.** An in-reach-but-filtered place is drawn identically to an
out-of-reach one. A third grey is exactly the "do not invent a dimmer grey" trap, and it would mean
recomputing a per-dot property and re-uploading geometry on every filter change to encode information
that reads better as a sentence. Reasons live in text.

**The per-place explanation rides the existing pick; there is no second selection.** Clicking a dimmed
dot already dispatches `pickPlace`, which already draws a route and renders a `ResultCard`. That card
gains `.result-warning` rows carrying the exclusion sentences. Rejected: a separate `explainingId`
field in `Session` with its own popover — two selections on screen, two highlights on the map, two
focus targets, for information that fits on a card that is already open.

**The empty-pool fix is a counterfactual where it can be one, and says so where it cannot.**
`suggestFix` re-runs the verdict with exactly one cause dropped and counts the survivors, for each
droppable cause in turn; the winner is the cause whose removal recovers the most places, and the
button says that number because it was measured. `widen-budget` is the one branch where a
counterfactual is not available: pool membership is decided by isochrone polygon containment, while
the only evidence the app holds about "how much further" is a cached *route duration*, and contour
generalisation makes those two disagree at the margin. So that branch **does not claim a recovery
count at all** — it names the nearest match and how long the route to it takes, both of which are
measured facts, and offers a budget. A number that could be wrong is worse than no number in a
feature whose entire thesis is that the app does not guess.

**Not verified, and the implementer must check first:** nobody has looked at the counts line at 300+
places on a 320px-wide bottom sheet, where `38 of 214 in reach` over `6 to spin · 12 shut · 6 too far
in` will wrap. **Check before shipping: render the two-clause worst case at 320px and confirm the
summary wraps to at most two lines; if it does not, cut to one reason clause on the narrow breakpoint
rather than truncating the numbers.** Also unverified: whether `derivePool` over 300 places with four
active rules stays inside a frame during a dial scrub. **Check: measure the pass with
`performance.now()` at 300 synthetic places before `places-expansion` lands.** The memo is the
mitigation, not the proof.

## Data and types

All new types live in `src/app/eligibility.ts` unless stated.

```ts
import type { Place, Terrain, Vibe } from "../data/places";
import type { MultiPolygon } from "../lib/geometry";
import type { Reach } from "../lib/isochrone";

/**
 * Every way a place can fail to make the pool. This union is the contract the
 * hours, weather, elevation and places-expansion specs plug into: a sibling
 * adds its member here and to REASON_ORDER and REASON_COPY, and gets counting,
 * grouping, the drawer breakdown and the empty-pool fix for free.
 *
 * `daylight-budget` is deliberately absent. That spec's central decision is
 * that darkness clamps the dial and never filters the pool ("Daylight is a
 * property of the clock, not of a place", daylight-budget.md:95), and a
 * reason code reserved for it would be a permanently dead member asserted
 * total by two tests. Its effect arrives here as a smaller budget, which
 * shows up as `out-of-reach`, which is the truth.
 */
export type ExclusionReason =
  | "out-of-reach"     // outside the outermost contour at this budget
  | "inside-floor"     // closer than the range's lower end
  | "wrong-terrain"    // the terrain chip; becomes the climb band under elevation-profile
  | "no-matching-vibe" // the vibe chips
  | "kind"             // owned by places-expansion: the tier/kind chip
  | "not-far-edge"     // edgeOnly, and it sits inside the next contour in
  | "closed"           // owned by opening-hours: shut on arrival, or on return
  | "hours-unknown"    // owned by opening-hours, strict mode only
  | "weather";         // owned by weather-filters

/**
 * Fixed order. The first reason in a verdict is the primary one, and it is what
 * the counts line and the drawer group by. Ordered by how fundamental the
 * obstacle is: geometry the walker cannot argue with, then the reader's own
 * chips, then the far-edge band, then conditions of the world.
 */
export const REASON_ORDER: readonly ExclusionReason[];

/**
 * All copy, in one total record, so `Object.keys` can be compared against
 * REASON_ORDER at runtime. A missing member is a `tsc` error; a member missing
 * from REASON_ORDER is a test failure. Both, because `npm test` runs under
 * Node's type stripping and never sees a type.
 */
export const REASON_COPY: Readonly<
  Record<ExclusionReason, {
    /** "12 shut" */
    readonly clause: (n: number) => string;
    /** "Shut when you would get there." */
    readonly sentence: string;
    /** "Shut on arrival" */
    readonly heading: string;
  }>
>;

export type PlaceVerdict =
  | { readonly placeId: string; readonly included: true }
  | {
      readonly placeId: string;
      readonly included: false;
      /** Non-empty, ordered by REASON_ORDER. reasons[0] is the primary reason. */
      readonly reasons: readonly ExclusionReason[];
    };

/**
 * One removable cause of exclusion, contributed by a sibling feature.
 *
 * `excludes` must be pure and must not read a mutable cache when called: build
 * the rule from values already read this render and close over them.
 *
 * `signature` is the memo's only way to know the rule's verdicts could have
 * changed - it must change exactly when they could, and must NOT change per
 * render, or the pool report is rebuilt on every frame of a dial scrub.
 *
 * `clear` is a plain callback, not an `Action`. Every component in this repo
 * takes `onTerrain`/`onToggleVibe`/`onPick` and never sees the reducer's
 * vocabulary; App closes over `dispatch` when it builds the rule, and
 * `eligibility.ts` stays free of `session.ts`.
 *
 * `minSurvivors`, when set, is the weather-filters withdrawal guard: if
 * applying this rule would leave the running pool below it, the rule is
 * withdrawn instead - see `derivePool`.
 */
export type PoolRule = {
  readonly reason: ExclusionReason;
  /** False when the user has the feature switched off, or its data has not loaded. */
  readonly active: boolean;
  /** Sentence-case, for the fix button: "Ignore opening hours". */
  readonly clearLabel: string;
  readonly clear: () => void;
  readonly signature: string;
  readonly minSurvivors?: number;
  readonly excludes: (place: Place) => boolean;
};

export type PoolConditions = {
  readonly reach: Reach | null;
  /**
   * The floor contour itself, so "too close" can be told apart from "too far".
   * `reach.bands` already carries the floor as a hole, so containment alone
   * cannot distinguish them. Null when there is no lower bound.
   */
  readonly floorPolygons: MultiPolygon | null;
  /**
   * The terrain chip, exactly as `Session.terrain` holds it today.
   *
   * `elevation-profile` deletes `Terrain`, `Place.terrain` and
   * `Session.terrain` outright and replaces this filter with a measured climb
   * band. When it lands this field becomes `climb: ClimbBand | "any"` plus a
   * `climbOf: (place: Place) => ClimbBand | null` closure, and the
   * `wrong-terrain` reason is RENAMED IN COPY ONLY - one control, one reason
   * code, one clause. See *Contracts asked of siblings*.
   */
  readonly terrain: Terrain | "any";
  readonly vibes: readonly Vibe[];
  readonly edgeOnly: boolean;
  readonly rules: readonly PoolRule[];
};

export type PoolReport = {
  readonly verdicts: ReadonlyMap<string, PlaceVerdict>;
  /** The pool. Same list, same order, that selectCandidates returned. */
  readonly included: readonly Place[];
  readonly total: number;
  /**
   * Places that passed geometry: an included verdict, or an excluded verdict
   * whose reasons contain neither `out-of-reach` nor `inside-floor`. This is
   * the number the phrase "in reach" is allowed to name, anywhere in the UI.
   */
  readonly inReach: number;
  /** How many places each reason was the PRIMARY reason for. Total record. */
  readonly counts: Readonly<Record<ExclusionReason, number>>;
  /** Rules set aside by their own `minSurvivors` guard. Usually empty. */
  readonly withdrawn: readonly ExclusionReason[];
};

/**
 * The single change most likely to refill an empty pool. Computed only when
 * `included` is empty, because it re-runs the verdict once per droppable cause.
 *
 * `widen-budget` carries no `recovers`: see "The empty-pool fix" above.
 */
export type PoolFix =
  | { readonly kind: "drop-rule"; readonly reason: ExclusionReason;
      readonly clearLabel: string; readonly clear: () => void; readonly recovers: number }
  | { readonly kind: "widen-budget"; readonly budgetMinutes: number;
      readonly nearest: string /* place name */; readonly nearestMinutes: number }
  | { readonly kind: "lower-floor"; readonly recovers: number }
  | { readonly kind: "none" };

/** Outbound walking minutes to each place from the current origin, from the route cache. */
export type WalkMinutes = ReadonlyMap<string, number>;
```

Function signatures:

```ts
export function derivePool(places: readonly Place[], conditions: PoolConditions): PoolReport;

/** One place's verdict, ignoring withdrawal. Exported for tests and the result card. */
export function explainPlace(place: Place, conditions: PoolConditions): PlaceVerdict;

/** Memoising wrapper over derivePool. App calls this; tests call derivePool. */
export function poolReport(places: readonly Place[], conditions: PoolConditions): PoolReport;

/**
 * The memo key's non-reach half. Exported because ReachReadout needs an
 * identity for "the filters changed" that does NOT change per scrub frame.
 */
export function conditionsSignature(conditions: PoolConditions): string;

export function suggestFix(
  places: readonly Place[],
  conditions: PoolConditions,
  walkMinutes: WalkMinutes,
  budget: { readonly roundTrip: boolean },
): PoolFix;

/**
 * The pool line: "6 to spin · 12 shut · 6 wrong terrain". Pool size first,
 * then at most two reason clauses. The "N of M in reach" headline is NOT here -
 * that is ReachReadout's existing sentence, and saying it twice is the bug this
 * function's earlier draft had.
 */
export function summaryLine(report: PoolReport): string;
```

Copy (the values of `REASON_COPY`; every number is a plain count, so nothing goes through
`src/lib/format.ts`):

| reason | `clause(n)` | `sentence` | drawer heading |
| --- | --- | --- | --- |
| `out-of-reach` | `${n} too far` | `Further than your budget walks.` | Too far |
| `inside-floor` | `${n} too close` | `Closer than the range's lower end.` | Too close |
| `wrong-terrain` | `${n} wrong terrain` | `Not the terrain you asked for.` | Wrong terrain |
| `no-matching-vibe` | `${n} no match` | `None of the things you are looking for.` | No matching vibe |
| `kind` | `${n} wrong kind` | `Not the kind of place you asked for.` | Wrong kind |
| `not-far-edge` | `${n} not on the edge` | `Not out in the far edge band.` | Not on the far edge |
| `closed` | `${n} shut` | `Shut when you would get there.` | Shut on arrival |
| `hours-unknown` | `${n} hours unknown` | `Nobody has recorded its hours.` | Hours unknown |
| `weather` | `${n} rained out` | `Not a walk for this weather.` | Weather |

The `out-of-reach` and `inside-floor` sentences exist for `describeResult` and for tests. **They are
never rendered on the result card**, because `ResultCard` already owns that row — see its entry below.

No network boundary and no file boundary is crossed. No endpoint, no `ProxyEnv` variable, no
wrangler change, no `.env.example` change, no snapshot change. Nothing in `src/lib/json.ts` is
touched, and nothing here parses external input. There is no external API, licence or rate-limit
question in this feature to state, because there is no new request.

## Changes, file by file

**`src/app/eligibility.ts` — new.** The whole pure layer above. Runtime imports, stated because the
module is otherwise types-only and the test runs under Node's type stripping: `contains` from
`../lib/geometry.ts`, `MAX_MINUTES` from `../lib/isochrone.ts`, and `clampBudget` + `budgetStep` from
`./session.ts`. All three load cleanly under `node --test` (`isochrone.test.ts` already imports
`isochrone.ts` at runtime today). Named `eligibility.ts` and not `pool.ts` deliberately:
`src/lib/pool.ts` is the concurrency helper and two modules called `pool` one directory apart is a
trap.

**`src/app/App.tsx` — modified.**
- Delete `selectCandidates` (line 808). Replace the `const candidates = …` line (180) with:
  ```ts
  const floorPolygons = floorOutbound === null ? null
    : (cachedReach(origin, floorOutbound)?.bands.at(-1)?.polygons ?? null);
  const rules: PoolRule[] = [/* siblings push theirs here */];
  const conditions: PoolConditions = { reach, floorPolygons, terrain: state.terrain,
    vibes: state.vibes, edgeOnly: state.edgeOnly, rules };
  const pool = poolReport(PLACES, conditions);
  const candidates = pool.included;
  ```
  `candidateKey`, `candidateIds`, `drawable`, `settledRoutes`, the two prefetch waves, the spin-abort
  effect and the grace timer are all unchanged — they read `candidates`, which still means the same
  thing. The `floorPolygons` read is a warm-cache lookup on a ladder rung the prefetch already holds.
- `emptyNotice` (line 482) is renamed `emptyPool = status === "ready" && candidates.length === 0`.
  **Every reference is renamed with it**, including `reelIsShort && !emptyNotice` (line 641), which
  becomes `reelIsShort && !emptyPool`, and the `aria-describedby` at line 620.
- **`walkMinutes` is built inside the `emptyPool` branch, over all of `PLACES`.** It must not be
  built in the sweep that computes `drawable`/`settledRoutes` (lines ~245, ~260): those are
  `candidates.filter(...)`, i.e. over the *included* pool, which is empty at exactly the moment
  `suggestFix` runs. Instead, and only when `emptyPool` is true:
  ```ts
  const walkMinutes = new Map<string, number>();
  for (const place of PLACES) {
    const cached = cachedRoute(origin, place);
    if (cached) walkMinutes.set(place.id, cached.durationSeconds / 60);
  }
  ```
  One pass over 61 (later ~300) `Map` lookups, at the one moment nothing else is happening. The
  notice block (652-665) is replaced by `<EmptyPoolNotice>` (below); `suggestFix` is called there and
  nowhere else, so the counterfactual never runs on a healthy pool.
- Pass `pool={pool}` and `filterKey={conditionsSignature(conditions)}` into `<ReachReadout>`; drop
  `placeCount`.
- Pass `verdict={picked ? pool.verdicts.get(picked.id) ?? null : null}` into `<ResultCard>`.
- The "Places in reach" drawer (736) becomes `<PoolList pool={pool} …/>` and its `<summary>` becomes
  `All places ({pool.total})`. The existing WHY comment above it (725-733) explains why the drawer is
  held back until `reach !== null` — that reason is unchanged and the comment stays, but its
  parenthetical about `"Places in reach (0)"` is updated to name the new label.
- `activeFilters` (485) gains `+ rules.filter((rule) => rule.active).length`.
- `describeResult` (781) gains a sixth parameter `verdict: PlaceVerdict | null`; when the verdict is
  an exclusion it appends `` `not in the pool: ${REASON_COPY[verdict.reasons[0]!].sentence.toLowerCase()}` ``
  before the final period. This is the only way the exclusion reaches a screen reader on a result.

**`src/app/session.ts` — modified.**
- New action member `{ type: "clearVibes" }`, reducing to `{ ...state, vibes: [] }`. Needed because
  the offered fix for `no-matching-vibe` must clear the vibes *and nothing else*; `clearFilters` is a
  sledgehammer and toggling each vibe off is N dispatches.
- Export `clampBudget` (currently module-private, line 262) so `suggestFix` can snap a proposed budget
  onto the dial's notches. Without it the fix can propose a budget the dial immediately re-snaps to
  something else, and the button lies about the number on its own face.
- The `clearFilters` case gains a comment naming the contract: **every sibling filter field must be
  reset here and must also expose itself as a `PoolRule` with a `clear` callback.**

**`src/ui/ReachReadout.tsx` — modified.** `placeCount: number` is replaced by `pool: PoolReport` and
`filterKey: string`.
- **The existing `.readout` line keeps its shape and changes one number.** `pluralize(props.placeCount,
  "place")` becomes `pluralize(props.pool.inReach, "place")` — the phrase is "in reach", and `inReach`
  is the geometry-passing count, which is what "in reach" means. Under filters this line used to
  report the post-filter pool while calling it "in reach"; that was the mislabel.
- Below it, when `ready`, a second paragraph carries the filter accounting, which is a different
  sentence about a different number:
  ```tsx
  <p className="pool-summary">
    <strong>{pool.included.length}</strong> to spin
    {clauses.map((clause) => (
      <Fragment key={clause}>
        <span className="readout-sep" aria-hidden="true" />
        {clause}
      </Fragment>
    ))}
  </p>
  ```
  `Fragment` is added to the existing `react` import. `clauses` is `summaryLine`'s clause half (at
  most two, see Algorithm). So the panel reads "1.2 km² within 25 min · 38 places in reach" and then
  "6 to spin · 12 shut · 20 wrong terrain" — each number named once, and the two lines compose.
  When the pool is whole, `clauses` is empty and the line is just "61 to spin".
- **No `aria-live` on the visible lines:** they change every frame of a scrub, and this component
  already owns the one correct pattern for that. The imperative announcement becomes the readout
  sentence plus `summaryLine(pool)`, and its effect deps become `[props.commitKey, props.filterKey,
  ready]`. `commitKey` is `state.framingKey`, which bumps only on origin / dial commit / round-trip —
  so today a vibe chip changes the counts and announces nothing. `filterKey` is exactly the identity
  that changes on a filter change and *not* per scrub frame, which is why it is a separate prop
  rather than a hash of the counts.
- Rendering the counts inside `ReachReadout` rather than as a sibling component is deliberate — a
  second `role="status"` node twenty pixels away would announce twice per commit.

**`src/ui/PoolList.tsx` — new.** Renders the contents of the "All places" drawer: the existing
`.origin-list` of included places under a `<p className="field-label">To spin (6)</p>` heading, then
one group per reason with `counts[reason] > 0`, in `REASON_ORDER`, each a `field-label` heading
(`"Shut on arrival (12)"`, from `REASON_COPY[reason].heading`) over an `.origin-list` of
`.origin-option.is-excluded` buttons. Each button calls `onPick` — the same path a dimmed dot on the
map takes, landing on the same explained card. Groups longer than `GROUP_CAP = 12` render the first
twelve and a trailing `<li><button className="link-button">Show 24 more</button></li>` that reveals
the rest, held in a local `useState<ReadonlySet<ExclusionReason>>`. A cap without an expander would be
a completeness feature that hides things; an uncapped list would put 250 tab stops behind one
`<summary>` at `places-expansion` scale. Props: `{ pool: PoolReport; places: readonly Place[];
pickedId: string | null; onPick: (id: string) => void }`.

**`src/ui/EmptyPoolNotice.tsx` — new.** Props `{ fix: PoolFix; outerMinutes: number; inReach: number;
onFix: () => void }`. Renders a `<div className="notice">` (not `is-warn` — an empty pool is a filter
combination, not a fault) whose first line names the situation and whose second is the button.
`onFix` is called after `playPress()`; the notice never sees an `Action`. Copy, by `fix.kind`:
- `drop-rule`: `Nothing to spin. {inReach} places are in reach; {recovers} of them are held back.` +
  `<button className="link-button">{clearLabel} ({recovers} back)</button>`. `inReach` here is
  `PoolReport.inReach`, the same number and the same phrase `.readout` shows.
- `widen-budget`: `Nothing is in reach in {outerMinutes} min. The nearest match is {nearest}, about
  {nearestMinutes} min away.` + `<button className="link-button">Try {budgetMinutes} min</button>`,
  App dispatching `{ type: "budget", minutes: budgetMinutes }` from `onFix`.
- `lower-floor`: `Everything that matches is closer than your range starts.` +
  `<button className="link-button">Drop the lower bound</button>`, App dispatching
  `{ type: "floor", minutes: 0 }` (which `clampFloor` pins to the dial minimum, i.e. no lower bound).
- `none`: `Nothing matches, at any budget the dial offers.` + `Clear filters`, App dispatching
  `{ type: "clearFilters" }`.
The notice keeps `id={emptyNoticeId}`, stays wired to the Spin button's `aria-describedby`, and keeps
`{...inertWhen(picking)}`.

**`src/ui/ResultCard.tsx` — modified.** New optional prop `verdict?: PlaceVerdict | null`.
- The existing `!withinBudget` row (82-87) is the *same test* as `out-of-reach` — both are
  `contains(outer.polygons, picked)` — so the geometry reasons must not produce a second row saying
  the same thing. Instead that row becomes reason-aware: when the verdict's reasons include
  `inside-floor` it reads `Closer than your range's lower end.`, otherwise it keeps
  `Outside your current time budget.` One row, right words, no duplication.
- Every *other* reason, in `REASON_ORDER`, renders one extra `.result-warning` row above it using
  `REASON_COPY[reason].sentence`. Same `WarningIcon size={15} weight="fill" aria-hidden`.
- The card stays not-a-live-region; the announcement is `describeResult`'s job.

**`src/map/MapCanvas.tsx` — modified.** The `places-out` paint (273) gains the transparent hit halo
described in *The decision*; nothing else changes. Excluded places keep rendering dim and stay
clickable via `PLACE_LAYERS`. No reason is added to the feature properties: that would put a full
FeatureCollection re-upload on every filter keystroke to encode something the rail says better.

**`src/styles/app.css` — modified.** In the readout section, after `.readout.is-loading`:
```css
.pool-summary { margin: 0; font-size: 12.5px; color: var(--ink-3); display: flex;
  align-items: center; flex-wrap: wrap; gap: 4px 8px; }
.pool-summary strong { color: var(--ink-2); font-weight: 500; font-family: var(--mono);
  font-variant-numeric: tabular-nums; }
```
In the origin-list section: `.origin-option.is-excluded { color: var(--ink-3); }`.
No new tokens, no new hue, no new radius, no keyframes. Under the 900px breakpoint `.pool-summary`
inherits the rail's existing wrapping; see the unverified check above.

**Not touched:** `server/proxy.ts`, `worker/index.ts`, `server/vite-plugin.ts`, `wrangler.toml`,
`.env.example`, `scripts/build-reach.mjs`, `public/reach/*`, `src/lib/route.ts`, `src/lib/isochrone.ts`,
`src/app/reel.ts`, `src/app/useSpin.ts`, `src/lib/sound.ts` (the one new button reuses `playPress`).
`README.md` gains a paragraph under the feature list: "the panel always says how many places are in
reach and why the rest are not". `knip.json` needs no change — every new export is reached from
App.tsx or a test.

## Algorithm

### `explainPlace(place, conditions)`

Accumulate into an array in `REASON_ORDER` order, then return. Short-circuiting after the first
reason is explicitly rejected: the per-place explanation wants the whole set, and the extra work is a
handful of comparisons on places that are already excluded.

```
reasons = []
bands = conditions.reach?.bands
if bands is missing or empty: return included-false with ["out-of-reach"]
outer = bands[bands.length - 1]
inner = conditions.edgeOnly and bands.length > 1 ? bands[bands.length - 2] : undefined

// Geometry. `outer` carries the floor as a hole, so a place inside the floor
// fails `contains` for the same reason a place beyond the budget does. The
// floor contour is what tells them apart, and it is only read when there is one.
inside = contains(outer.polygons, place)
if not inside:
    if conditions.floorPolygons and contains(conditions.floorPolygons, place):
        reasons.push("inside-floor")
    else:
        reasons.push("out-of-reach")

// The reader's own chips.
if conditions.terrain != "any" and place.terrain != conditions.terrain: reasons.push("wrong-terrain")
if conditions.vibes.length > 0 and no tag of place is in conditions.vibes: reasons.push("no-matching-vibe")

// The far edge band. Only meaningful when the place is in reach at all, and a
// no-op when bandMinutes produced a single band.
if inside and inner and contains(inner.polygons, place): reasons.push("not-far-edge")

// Conditions of the world, contributed by siblings.
for rule of conditions.rules:
    if rule.active and rule.excludes(place): reasons.push(rule.reason)

if reasons is empty: return { placeId, included: true }
sort reasons by REASON_ORDER index   // rules may be registered out of order
return { placeId, included: false, reasons }
```

`contains` runs at most twice per place (`outer`, then `inner` or `floorPolygons`, never both).
That is the same count `selectCandidates` does today.

### `derivePool(places, conditions)` — including withdrawal

Withdrawal exists because `weather-filters` auto-drops a rule that leaves fewer than `MIN_SURVIVORS`
places (weather-filters.md:684-702). A withdrawn rule is neither inactive nor excluding, and if this
module could not express it, the empty-pool notice could never name weather — weather would have
withdrawn itself before the notice ran. So it is expressed here, once, for anyone:

```
// Pass 1: verdicts with every active rule applied.
verdicts = map of explainPlace(place, conditions) for each place

// Pass 2: withdrawal, only if some active rule sets minSurvivors.
withdrawn = []
guarded = active rules with minSurvivors != null, in REASON_ORDER
for rule of guarded:
    // Survivors with this rule and every rule not yet withdrawn.
    survivors = count of places whose reasons (minus withdrawn) is empty
    without   = count of places whose reasons (minus withdrawn, minus rule.reason) is empty
    if survivors < rule.minSurvivors and survivors < without:
        withdrawn.push(rule.reason)

// Pass 3: if anything withdrew, recompute verdicts with those rules dropped.
```

Withdrawal is not cascading, matching the sibling's own rule: dropping the preference does not
un-drop the veto. Pass 3 runs only when `withdrawn` is non-empty, which is rare, so the common case
is still one pass. `withdrawn` is reported on `PoolReport` so `PoolList` can print
`Set aside: not a walk for this weather (it left too few places).` under the groups — the one place a
withdrawal is visible.

The rest of the report: build `verdicts` as a `Map`, push included places into an array **in input
order** (the reel and the drawer both depend on the pool order being the data file's order;
`orderAroundOrigin` is what re-sorts for the reel), and increment `counts[verdict.reasons[0]]`.
`inReach` counts verdicts that are included, plus excluded verdicts whose reasons contain neither
`out-of-reach` nor `inside-floor`. `counts` is initialised with every reason at 0 so the record is
total and no consumer has to guard for `undefined`.

### `conditionsSignature` and `poolReport` — the memo

```
conditionsSignature(c) = [terrain, vibes.join("+"), edgeOnly, floorPolygons ? "f" : "-",
                          ...c.rules.filter(active).map(r => r.reason + US + r.signature)].join(US)

memo: WeakMap<Reach, { places, signature, report }>
nullSlot: { places, signature, report } | null   // for conditions.reach === null

entry = c.reach ? memo.get(c.reach) : nullSlot
if entry and entry.places === places and entry.signature === signature: return entry.report
report = derivePool(places, c); store; return report
```

**`US` is `"\u001f"` (ASCII unit separator), not `"|"` or `":"`.** A rule signature is a sibling's
free-form string — `opening-hours` is told below to use `"1042|strict"` — so a printable joiner can
appear inside a field and two different condition sets can produce the same signature. Unit separator
is the delimiter no sibling will put in a signature, and the type doc says so.

`conditions.reach` is the `WeakMap` key rather than a compared field, which is sound because the
assembled-reach LRU in `isochrone.ts` returns the same object for a given origin + budget + floor,
and it means a dial oscillating between two warm positions hits the memo both ways.
`floorPolygons` is not compared directly: it is derived from the same reach identity, so a `"f"`/`"-"`
marker is enough to catch the floor being switched on and off.

**The signature contract siblings must honour:** `rule.signature` must change when and only when that
rule's verdicts could change. `opening-hours` should use the half-hour slot index it already computes
plus the strict flag (`"1042|strict"`), not `Date.now()`. `weather-filters` should use the forecast's
`current.time` plus the active threshold set, not the fetch count. A signature that churns per render
turns this memo off; worse, it feeds `candidateKey` churn, which fires the spin-abort effect and
makes spinning impossible.

### `suggestFix(places, conditions, walkMinutes, budget)`

Only called when `included.length === 0`.

1. **Droppable causes first.** For each of: the terrain filter (if not `"any"`), the vibe filter (if
   non-empty), `edgeOnly` (if on), and each active `PoolRule` — re-run `derivePool` with that one
   cause disabled and take `included.length` as `recovers`. Keep the maximum with `recovers > 0`. Ties
   break by `REASON_ORDER` reversed: prefer removing a condition of the world over removing the
   reader's own chip, because the chip is the thing they meant. Costs at most `4 + rules.length`
   extra passes, at the one moment nothing else is happening.
2. **Otherwise, if `counts["inside-floor"] > 0`**, return `lower-floor` with that count as `recovers`
   — that count is a real counterfactual, because dropping the floor is exactly what makes those
   places pass.
3. **Otherwise, widen the budget.** Consider places whose verdict's *only* reason is `out-of-reach`.
   For each, read `walkMinutes.get(place.id)`; skip places with no cached route. Take the minimum,
   `m`, and its place. Then:
   ```
   raw = roundTrip ? Math.ceil(m) * 2 : Math.ceil(m)
   if raw > MAX_MINUTES: fall through to step 4          // BEFORE clamping, not after
   snapped = clampBudget(raw, roundTrip)
   if snapped < raw: snapped = clampBudget(raw + budgetStep(), roundTrip)
   if snapped < raw: fall through to step 4
   return { kind: "widen-budget", budgetMinutes: snapped, nearest: place.name,
            nearestMinutes: Math.ceil(m) }
   ```
   **The `MAX_MINUTES` comparison happens before `clampBudget`, deliberately.** `clampBudget` ends
   with `Math.min(MAX_MINUTES, …)` (session.ts:266), so a post-clamp check can never fire:
   `clampBudget(160, true)` returns 100 and the app would cheerfully offer "Try 100 min" for a walk
   that needs 160. The raw figure is the only one that knows the dial cannot get there.
   **The snap is upward, not to-nearest**, for the same reason: `clampBudget` rounds to the *nearest*
   notch, so a coarser dial would snap a raw 62 down to 60 and the proposed budget would still not
   reach the place the button names. `DIAL_STEP` is 1 today (isochrone.ts:66), which makes the up-snap
   a no-op — but round trips moved in two-minute notches until recently (session.ts, `budgetStep`'s
   comment), the step is a function precisely because it changes, and a fix that lies whenever
   somebody widens a notch is not worth the two lines it saves.
   Using the cached route duration rather than scanning the ladder is what keeps this off the network:
   the wide prefetch wave has already routed every place inside the 100-minute contour, so the answer
   is usually already in memory, and when it is not the app says "clear filters" instead of guessing.
4. `{ kind: "none" }`.

### `summaryLine(report)`

`` `${included.length} to spin` `` then, joined with ` · `, the clauses for reasons where
`counts[reason] > 0`, **excluding `out-of-reach` and `inside-floor`** (those are the difference
between `inReach` and `total`, and `.readout` above already names `inReach`), sorted by descending
count with `REASON_ORDER` as the tie-break, **capped at two clauses**. Two, not three, because the
line lives above the Spin button on a 320px sheet and the third clause is always the one nobody is
fixing.

## Failure and degradation

| Situation | What the reader sees |
| --- | --- |
| `reach === null` (ladder warming) | `ReachReadout` shows its existing skeleton; `.pool-summary` is not rendered at all. It does not render "0 to spin", which would be an answer the app does not have yet. Same reason the places drawer is already held back until `reach !== null`. |
| Engine not configured (503) | Unchanged: the `is-setup` notice replaces the readout entirely, so no counts line and no empty-pool notice. An exclusion breakdown over a reach that does not exist is theatre. |
| Engine error | Unchanged `notice is-warn` with the failure message. No counts. |
| A `PoolRule` whose data has not loaded | The rule reports `active: false` and is skipped. The counts line simply has one fewer clause. **This is the sibling contract's most important clause: a rule with no data is inactive, never "excludes everything".** A weather fetch that 500s must not empty the pool. |
| A `PoolRule` that would leave too few places | Withdrawn by its own `minSurvivors`, reported in `PoolReport.withdrawn`, named once in the drawer. The pool is the pool without it. |
| A `PoolRule` whose `excludes` throws | Not caught. This is app-internal pure code over app-internal data; swallowing it would produce a pool that is silently wrong, which is the failure mode this whole feature exists to end. It will surface as a render error, loudly, in development. |
| A place with no walking route | Still included, still in the pool, still spinnable; the result card says "no walking route" as it does today. Route health is not an exclusion reason. |
| Empty pool, no fix computable | `{ kind: "none" }` → "Nothing matches, at any budget the dial offers." + Clear filters. The old behaviour, reached only when the new reasoning genuinely has nothing better. |
| Empty pool because `PLACES` is empty | `total === 0`; `.readout` says "0 places in reach", `summaryLine` says "0 to spin", `suggestFix` returns `none`. Only reachable with a broken data file, and it says so rather than dividing by zero. |
| Stale `walkMinutes` (route cache evicted under LRU pressure) | `widen-budget` is skipped for places with no cached duration. Worst case the fix degrades to `none` and offers Clear filters. It never proposes a budget it cannot justify. |
| Offline | No new network calls exist, so this feature behaves identically. Whatever is in the contour and route caches still produces a full verdict. |
| A sibling registers a reason not in `ExclusionReason` | `tsc --noEmit` error: `PoolRule.reason` is the union. A member missing from `REASON_ORDER` or `REASON_COPY` is a runtime test failure (test 1). |

## Cost

- **Bundle.** Estimated, not measured: `eligibility.ts` ≈ 4.8 KB raw at the repo's comment density,
  `PoolList.tsx` ≈ 1.6 KB, `EmptyPoolNotice.tsx` ≈ 1.2 KB, CSS ≈ 260 B; `ReachReadout`/`ResultCard`/
  `App` edits roughly net-neutral (the deleted `selectCandidates` pays for part of it). Comments and
  copy tables compress well. **Working estimate: +1.4 KB gzipped**, ~2.2% of the 64 KB budget. **This
  figure is a guess until it is measured, and the measurement is part of the work:** run
  `npm run build` on the branch point, record `gzip -9 -c dist/assets/index-*.js | wc -c` excluding
  MapLibre's chunk, repeat after the change, and take the difference. That is the number acceptance
  criterion 12 checks. No new dependency, no new icon glyph (`WarningIcon` is reused).
- **Requests per session:** zero added. No endpoint, no fetch, no snapshot.
- **Build time:** zero added. No generator, no new script.
- **Engine load:** zero added. `floorPolygons` is a read of a ladder rung the prefetch already holds;
  in the pathological case where it is cold, `cachedReach` returns null and the reason degrades from
  `inside-floor` to `out-of-reach`, which is still true.
- **Render:** one extra `contains` call for places that fail the outer test *and* have a floor set
  (previously they were rejected with one test). Offset by the memo, which removes the entire sweep
  on every reel tick and every render that is not a dial or filter move.
- **Map:** the hit halo is a paint property on an existing layer. No new source, no new upload, no
  change to upload frequency; the transparent stroke costs one more circle attribute per dim place.
- **Hosting:** nothing new.

## Tests

New file `src/app/eligibility.test.ts`, `node --test` under Node type stripping, `.ts` import
extensions. Fixtures, declared once at the top:

```ts
import type { MultiPolygon, Ring } from "../lib/geometry.ts";

/**
 * An axis-aligned square as a one-polygon MultiPolygon. Note this is NOT the
 * `square()` in smooth.test.ts, which is a unit `Ring` with no arguments; the
 * two files are independent and neither should import the other's.
 */
const square = (cx: number, cy: number, half: number): MultiPolygon => {
  const ring: Ring = [[cx - half, cy - half], [cx + half, cy - half],
    [cx + half, cy + half], [cx - half, cy + half], [cx - half, cy - half]];
  return [[ring]];
};

const OUTER = square(0, 0, 1);
const MID   = square(0, 0, 0.5);
const FLOOR = square(0, 0, 0.1);
const reachOf = (...bands) => ({ origin: {lat:0,lng:0}, budgetMinutes: 30, bands, areaSqMeters: 1 });

const NEAR  = { id:"near",  name:"Near",  lat:0.05, lng:0.05, terrain:"flat",  tags:["park"] };
const MIDP  = { id:"mid",   name:"Mid",   lat:0.3,  lng:0.3,  terrain:"hilly", tags:["food"] };
const EDGE  = { id:"edge",  name:"Edge",  lat:0.8,  lng:0.8,  terrain:"flat",  tags:["river","park"] };
const FAR   = { id:"far",   name:"Far",   lat:5,    lng:5,    terrain:"flat",  tags:["park"] };
const ALL   = [NEAR, MIDP, EDGE, FAR];

const shutRule = (ids, extra = {}) => ({ reason:"closed", active:true,
  clearLabel:"Ignore opening hours", clear:() => {}, signature:"1042|strict",
  excludes:(p) => ids.includes(p.id), ...extra });
```

1. **`REASON_ORDER` and `REASON_COPY` agree, at runtime** — `[...REASON_ORDER].sort()` deep-equals
   `Object.keys(REASON_COPY).sort()`, and `REASON_ORDER` has no duplicates. This is the check
   `npm test` can actually make; the *type-level* totality (a new union member forcing a `REASON_COPY`
   key) is `tsc --noEmit`'s job, because `node --test` strips types and never sees them.
2. **No reach means out-of-reach, not empty** — `derivePool(ALL, {reach:null,…})` gives four verdicts,
   all `included:false` with `reasons === ["out-of-reach"]`, `included.length === 0`, `inReach === 0`.
   (Today this case silently returned `[]` with no explanation at all.)
3. **A place beyond the outer band is `out-of-reach`** — `FAR` with `reachOf({minutes:30,polygons:OUTER})`.
4. **A place inside the floor is `inside-floor`, not `out-of-reach`** — `NEAR` with an `OUTER` band
   holed by `FLOOR` and `floorPolygons: FLOOR`. The distinguishing test: with `floorPolygons: null`
   the same place reports `out-of-reach`.
5. **Terrain and vibe accumulate** — `MIDP` with `terrain:"flat"` and `vibes:["park"]` yields
   `["wrong-terrain","no-matching-vibe"]`, in that order, and `included:false`.
6. **Reasons come back in `REASON_ORDER` regardless of rule registration order** — register a `closed`
   rule and a `weather` rule with the weather one second; assert `["closed","weather"]` when both fire
   and the array order matches `REASON_ORDER` when they are registered the other way round.
7. **`not-far-edge` only applies to places that are in reach** — with `edgeOnly` and bands
   `[MID, OUTER]`, `MIDP` (inside `MID`) reports `["not-far-edge"]`, `EDGE` is included, and `FAR`
   reports `["out-of-reach"]` and NOT `not-far-edge`.
8. **`edgeOnly` with one band is a no-op** — bands `[OUTER]`, `edgeOnly: true`: `EDGE` and `MIDP` are
   both included. Guards the `bandMinutes` narrow-range case.
9. **An inactive rule excludes nothing** — `shutRule(["edge"], {active:false})`: `EDGE` included,
   `counts.closed === 0`.
10. **`counts` counts the primary reason only** — a place that is both `out-of-reach` and `closed`
    increments `out-of-reach` and not `closed`; every reason key is present and numeric.
11. **`inReach` ignores non-geometry reasons** — three places in the polygon, two of them shut:
    `inReach === 3`, `included.length === 1`.
12. **A guarded rule withdraws rather than emptying the pool** — three in-reach places,
    `shutRule(["near","mid"], {minSurvivors:3})`: `withdrawn === ["closed"]`, all three included,
    `counts.closed === 0`.
13. **A guarded rule that changes nothing is not withdrawn** — same rule excluding nobody:
    `withdrawn` is empty.
14. **Pool order is input order** — included places come back in the order they appear in `places`.
15. **`poolReport` memo returns the identical object** for two calls with the same `places` reference,
    the same `reach` reference and equal rule signatures; a **different** object when only a rule
    signature changes, when only `edgeOnly` flips, and when only the `reach` reference changes with
    equal contents (reference comparison is the contract). Plus: two calls alternating between two
    distinct `reach` references both hit the memo (the `WeakMap`, not one slot).
16. **Two rules cannot collide through the signature joiner** — rules whose `reason`/`signature`
    fields concatenate to the same string under a `"|"` joiner produce different
    `conditionsSignature` values under the unit separator.
17. **`summaryLine` shape** — `"6 to spin · 12 shut · 6 wrong terrain"` from a hand-built report;
    asserts geometry reasons are excluded from the clauses, clauses are sorted by descending count,
    and at most two appear when three reasons are non-zero.
18. **`suggestFix` picks the largest recovery** — pool empty with `vibes:["food"]` excluding 3 and a
    `closed` rule excluding 1: returns `drop-rule` for `no-matching-vibe` with `recovers: 3`.
19. **`suggestFix` tie-break prefers the world over the chip** — vibe filter and `closed` rule each
    recover 2: returns the `closed` rule.
20. **`suggestFix` widens the budget** — nothing in reach, `walkMinutes` has `MIDP` at 31 min,
    `roundTrip: true`: returns `widen-budget` with `budgetMinutes === 62` (raw 62; with `DIAL_STEP`
    at 1 the snap is exact), `nearest === "Mid"`, `nearestMinutes === 31`, and **no `recovers`
    field**. Assert `budgetMinutes >= raw` rather than only the literal, so the case survives a
    coarser dial.
21. **`suggestFix` refuses a budget the dial cannot reach** — `walkMinutes` at 80 with
    `roundTrip: true` (raw 160 > `MAX_MINUTES`) returns `{kind:"none"}`. This is the case a post-clamp
    check silently passes, because `clampBudget(160, true)` is 100.
22. **`suggestFix` returns `none` with no cached walking times** — same setup, empty `walkMinutes`.
23. **Every `REASON_COPY` sentence is non-empty and ends in `"."`; every `clause(1)` is non-empty.**

Existing suites must still pass unchanged; `reel.test.ts` in particular is untouched, which is the
check that this did not leak into the draw.

## Contracts asked of siblings

This spec deletes `selectCandidates`. Four sibling specs still instruct an implementer to modify it,
and those instructions are superseded — named here so whoever lands second does not follow a dead
file:

| Spec | Superseded lines | Replacement |
| --- | --- | --- |
| `opening-hours` | 276, 330 (`selectCandidates` gains an `hours` argument; the seven-positional signature) | Contribute two `PoolRule`s — `closed` and, only if strict mode ships, `hours-unknown` — with `signature` = arrival slot key + strict flag. |
| `weather-filters` | 462-470 (`selectCandidates` gains a fifth parameter), 684-702 (`applyConditionRules`' own withdrawal) | Contribute **one `PoolRule` per user-visible control**, each with `minSurvivors: 3`. `ConditionRuleId` stays internal to that spec; it must collapse to a single `weather` reason at this boundary, or add its own members to `ExclusionReason`. `derivePool` performs the withdrawal. |
| `places-expansion` | 402, 794-797 (the tier filter as a positional fifth argument to `selectCandidates`, reason named `"kind"`) | The reason **is** named `kind` — it is in the union above. Contribute it as a `PoolRule`, not an argument. |
| `elevation-profile` | 375, 760 (`selectCandidates(reach, climb, vibes, edgeOnly, climbOf)`) | `PoolConditions.terrain: Terrain \| "any"` becomes `climb: ClimbBand \| "any"` plus `climbOf`, and `explainPlace`'s terrain clause becomes the climb clause. **The reason code stays `wrong-terrain`** and only `REASON_COPY["wrong-terrain"]` changes wording — one control, one reason, one clause. Do not add `too-hilly`; that spec and this one describe the same filter. |

`daylight-budget` is asked for nothing and gives up nothing: its decision that the mode clamps the
dial and never filters the pool (daylight-budget.md:95, 495) stands, and this spec reserves no reason
code for it.

Every sibling also owes: a `signature` that changes exactly when its verdicts could (never per
render); `active: false` when its data has not loaded, never "excludes everything"; a `clear`
callback and a matching reset in `clearFilters`.

## Acceptance criteria

1. `selectCandidates` no longer exists in `src/app/App.tsx`; `candidates` is `poolReport(...).included`
   and the reel, the map, the prefetch waves and the grace timer behave exactly as before for any
   filter combination that was non-empty before this change.
2. With the default session and a warm reach, `.readout` reads `… · 61 places in reach` and
   `.pool-summary` reads `61 to spin` with no reason clauses — the real `PLACES` length, whatever it
   is on the day.
3. Setting *Hilly* + *Food* at a 25-minute dial produces two lines that compose: `.readout`'s
   `in reach` number equals `PoolReport.inReach`, `.pool-summary`'s `to spin` number equals
   `included.length`, and `inReach - included.length` equals the sum of every non-geometry group count
   in the drawer. Verified by hand against the drawer breakdown.
4. Emptying the pool with a vibe chip shows a notice naming the vibe filter and a button that clears
   only the vibes; pressing it plays `playPress`, refills the pool, and re-enables Spin. The
   "{N} places are in reach" number in the notice equals the number in `.readout`.
5. Emptying the pool by shrinking the dial shows a notice naming the nearest match by name and its
   walking minutes, and a button proposing a budget; pressing it moves the dial to exactly the number
   on the button, and that budget's outbound reach contains the named place.
6. With a `walkMinutes` minimum that implies a raw budget above `MAX_MINUTES`, no budget button is
   offered — the notice falls through to "Nothing matches, at any budget the dial offers."
7. The drawer's `<summary>` reads `All places (61)`, its body lists included places under a
   `To spin (N)` heading followed by grouped excluded places under `field-label` headings with counts,
   and a group longer than 12 shows a `Show N more` button that reveals the rest.
8. Clicking a dimmed dot on the map opens the result card for that place. An out-of-reach pick shows
   **exactly one** budget/geometry warning row, not two; non-geometry reasons add one row each in
   `REASON_ORDER` above it.
9. A dim dot is tappable from at least 8 px away on a 390px-wide viewport.
10. The screen-reader line for an excluded pick includes the primary reason; ticking a vibe chip
    announces the new counts once; scrubbing the dial announces once per commit, not per frame.
    Verified by instrumenting the imperative write in `ReachReadout`.
11. Excluded places remain dimmed and clickable on the map; no place is ever hidden, and the map's
    GeoJSON upload count and payload size per filter change are unchanged from before (the halo is a
    paint property, not a feature property).
12. `npm run build` reports app JS within the 64 KB gzipped budget, and the measured delta from this
    feature — `gzip -9 -c dist/assets/index-*.js | wc -c` before and after, MapLibre's chunk excluded
    — is at or under 1.6 KB.
13. `npm run typecheck` is clean, and adding a member to `ExclusionReason` without adding it to
    `REASON_COPY` fails it. `npm test` is clean, and adding a member to `REASON_COPY` without adding
    it to `REASON_ORDER` fails test 1.
14. `npm run lint` (eslint + oxlint anti-slop + knip) is clean; no `as` without a `SAFETY:` comment,
    no `unknown` at any boundary, no dead export.

## Open questions

1. **Should `hours-unknown` count as an exclusion at all, or only ever as a note?** `opening-hours`
   asserts that filtering on openness alone "would silently delete 76% of the destinations"
   (opening-hours.md:83). **That figure is unverified and unmeasured in this repo** — no script here
   counts recorded hours, and the number belongs to a spec that has not been implemented. It is
   repeated here as that spec's stated assumption, not as a fact. **Check before the strict mode is
   built: run the `opening-hours` baker against the current place list and count the `unknown`
   verdicts.** This spec provides the reason code and the machinery either way; whether the sibling
   ever sets `active: true` on it is that spec's call, and a human should decide whether the strict
   mode exists at all.
2. **Does the counts line survive at 300 places on a 320px sheet, or does it drop to one clause
   there?** Named in *The decision* as a check that must happen before this ships; it is a look-at-it
   decision, not a research one.
3. **Does MapLibre's hit test include `circle-stroke-width`?** Named in *The decision* with the
   fallback. Ten minutes with a phone-sized viewport settles it.
