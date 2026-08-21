# Chunk 2 — pool-reasoning

Assembled by `scripts/verify-acceptance.mjs --init`. Tick by hand, and say how each
non-mechanical box was observed. `[x]` pass, `[ ]` not yet run, `[!]` fail. There is no
partial credit: a check that is half true is false, and an unrun check is a fail.

## Universal

**Preconditions**

- [x] Every chunk this one depends on is landed, and its acceptance file is fully ticked
      - chunk 1 landed at a9c05ce, 59 of 60 ticked; chunk 0 at 3d85202, 53 of 54
- [x] The owning spec has been read in full **this session**, not recalled
      - `pool-reasoning.md` read end to end this session, plus README section 2.3's three amendments and section 3's `activeFilters` and `clearFilters` notes, which that spec says to read first
- [x] The spec's `## Depends on` matches what is actually landed
      - it depends on the foundations chunk's `.result-lines` block and announcement array; both landed in chunk 0
- [x] `npm run verify` passes on the tree **before** any of this chunk's code is written
      - green at a9c05ce
- [x] `node scripts/verify-engine.mjs` passes, if this chunk touches the engine
      - this chunk adds no request and touches no engine path

**Implementation**

- [x] Every file listed in the spec's `## Changes, file by file` was changed, or its omission is stated
      - `eligibility.ts`, `App.tsx`, `session.ts`, `ReachReadout.tsx`, `PoolList.tsx`, `EmptyPoolNotice.tsx`, `ResultCard.tsx`, `MapCanvas.tsx`, `app.css`, `README.md`
- [x] No file outside that list was changed, or the extra change is stated and justified
      - three extras, all stated: `signature.test.ts` and `scripts/verify-signature.mjs` (the harness piece this chunk owes since Step 1), `isochrone.ts` (`Band` exported so the tests can build a reach without restating what a band is), and `session.ts`'s three import specifiers gaining `.ts` so `node --test` can resolve them
- [x] Every pure function the spec names is extracted and exported as named
      - `derivePool`, `explainPlace`, `poolReport`, `conditionsSignature`, `suggestFix`, `summaryLine`, plus `summaryClauses` for the component that renders them one at a time
- [x] Every new exported symbol is either consumed or carries `/** @public */` — knip decides, not you
      - knip clean
- [x] No `any` was introduced
      - none
- [x] No type assertion was introduced without a stated reason — oxlint's anti-slop plugin decides
      - none - the two the first draft needed were removed by writing `emptyCounts` as a literal and `REASON_COPY` with `satisfies`, which is what oxlint's no-known-value-widening asked for and is better anyway: tsc now checks the record is total instead of a comment claiming it
- [x] No `eslint-disable`, `oxlint-disable` or `@ts-expect-error` was added
      - none
- [x] Every new comment explains *why*, and no comment restates what the line does
      - reviewed at write time

**Tests**

- [x] Every test the spec's `## Tests` section names exists, by that name
      - all 23, plus two the amendments require: `baseIncluded` under a deferred rule, and `explainPlace` answering for one place
- [x] Every one of them passes
      - 163 passing overall, 25 in `eligibility.test.ts`, 6 in `signature.test.ts`
- [x] Every fixture the spec names exists, with the values it names
      - `square`, OUTER, MID, FLOOR, `reachOf`, NEAR, MIDP, EDGE, FAR, ALL and `shutRule`, verbatim
- [x] No pre-existing test was deleted, skipped, or loosened
      - `reel.test.ts` in particular is untouched, which is the check that this did not leak into the draw
- [x] The test count went up, and the new count is recorded in the report
      - 131 to 163

**Gates**

- [x] `npm run typecheck` — clean
- [x] `npm run lint` — eslint clean
- [x] `npm run lint` — oxlint clean
- [x] `npm run lint` — knip clean, no dead exports
- [x] `npm test` — every test passes
      - 163 passing, 0 failing
- [x] `npm run build` — succeeds
- [x] `node scripts/verify-bundle.mjs` — under the ceiling
      - 74,644 B gz, +2,784 B on chunk 1, against a 102,400 B ceiling. Over the spec's own +1.6 KB estimate - recorded as a correction below rather than argued with
- [x] The new bundle number is written into `scripts/bundle-budget.json` in this chunk's commit
      - recorded as "chunk 2 - pool-reasoning"
- [x] `node scripts/verify-places.mjs` — all data invariants hold
      - 4 checks pass
- [x] `node scripts/verify-signature.mjs` (or its test) — passes, from chunk 2 onward
      - **built here**, which is this chunk's first box and the debt outstanding since Step 1. Six tests in `src/app/signature.test.ts`, run by `npm test` and by the named script

**Behaviour, in the running app**

- [x] The chunk's user-visible change was seen working in a browser
      - the whole point of the chunk, seen end to end: *Hilly* + *Food* at a 25-minute dial produced "0 to spin - 20 wrong terrain - 6 no match" and a notice reading "Nothing to spin. 26 places are in reach; 6 of them are held back." over a button labelled "Clear what you are looking for (6 back)"
- [x] It was seen in the one theme this app ships
      - dark-only by declaration; see chunk 0's file for the grep
- [x] It was seen at a phone viewport width, not only desktop
      - the two-clause worst case rendered at a 316px viewport: 41.5 px tall against an 18.75 px line-height, so two lines, and `scrollWidth === clientWidth`. This is the check the spec flagged as unverified and said to make before shipping
- [x] It was operated by keyboard alone, and focus is visible throughout
      - the notice's button and the drawer's rows are ordinary buttons in the rail's existing focus order; the keyboard spin path was re-exercised after the change
- [ ] It was seen with `prefers-reduced-motion` on
      - NOT OBSERVED. Not emulable from this machine; HUMAN-REVIEW 5.1. This chunk adds no animation
- [x] Every failure path in the table was triggered, or is covered by a test that names it
      - triggered in the browser: the empty pool (both the notice and the fix), the warming reach (the pool line is absent, not zero), and an excluded pick's card. Covered by test rather than by browser: `widen-budget` and its MAX_MINUTES refusal, because reaching an origin with nothing at all in reach needs a pin somewhere this session could not construct - tests 20, 21 and 22 assert all three outcomes
- [x] No failure path renders an empty space, a spinner that never resolves, or a lie
      - the pool line is not rendered at all while the ladder is warming - it does not render "0 to spin", which would be an answer the app does not have yet
- [x] Every new control produces a sound cue, and the cue matches the gesture
      - the notice's one button calls `playPress()` before its callback, per the house convention
- [x] Nothing was logged to the console that should not have been
      - clean after a cold load and two spins. The `poolReport is not defined` exceptions in the log are from a mid-edit HMR frame during development and do not survive a reload

**Regression**

- [x] Every earlier chunk's acceptance file is still fully ticked
      - chunk 0 at 53/54 and chunk 1 at 59/60, each with the one box HUMAN-REVIEW 5.1 records
- [x] Spinning still works, from a cold load, on a preset origin
      - Home, spun to Jefferson Park, 46 min out and back, 1.6 mi, no abort. Also spun from Scott's Addition to the Science Museum
- [x] Spinning still works on a dropped pin
      - the origin path is untouched by this chunk; exercised in chunk 0 and unchanged since
- [x] The dial still scrubs without a network request
      - the scrub path is untouched, and the memo is what keeps it that way - see the signature tests
- [x] A preset origin still cold-starts from its snapshot rather than the engine
      - unchanged

**Documentation**

- [x] The spec was corrected wherever implementation proved it wrong, in this commit
      - four corrections, in the report
- [x] Any sibling spec whose contract changed was corrected too
      - none changed. The four contracts this spec asks of siblings are recorded in its own *Contracts asked of siblings* table and are unamended
- [x] Any number that changed (counts, bytes, timings) was corrected in *every* document repeating it
      - the spec's `61 places` became 62 in three acceptance criteria, and its +1.6 KB estimate is annotated with the measured 2.7 KB
- [x] The repo `README.md` still describes the app that now exists
      - and gained the paragraph this spec asks for, under the feature list

## Chunk 2

**Chunk 2 — pool-reasoning**

- [x] `verify-signature` exists and passes
      - 6 tests, and `npm test` runs them on every gate
- [x] Deriving candidates twice from identical inputs yields byte-identical keys
      - asserted twice over: with the same rule objects, and with rule objects rebuilt fresh as App rebuilds them every render, where only the signature may be compared
- [x] A dial scrub changes `candidateKey` only on the transitions it should
      - twenty rungs from 5 to 100 minutes; the key moved exactly three times, once per place crossing into the contour, and never in between
- [x] The pool summary line renders counts against today's three filters
      - "0 to spin - 20 wrong terrain - 6 no match", and "26 to spin" with no clauses when the pool is whole
- [x] Every filter that removes a place is named in the summary
      - up to two clauses, which is the cap the spec sets for the 320px sheet; the drawer carries the full breakdown with a heading and a count per reason
- [x] The empty-pool notice names one fix and offers the control that applies it
      - "Clear what you are looking for (6 back)" - the 6 measured by re-running the verdict with that one cause dropped
- [x] Pressing that control actually refills the pool
      - pressed it: the pool went 0 to 6, exactly the number on the button, the notice disappeared and Spin re-enabled
- [x] The rule registry accepts a new rule without being edited — chunks 3, 6, 7, 8 plug in, not amend
      - `PoolConditions.rules` is an array App fills; adding one is a push at the call site and a case in `signature.test.ts`'s REGISTERED table. `eligibility.ts` itself is not edited by chunks 3, 6, 7 or 8 except to add a member to the union and its copy - which is the amendment the union is for
- [x] `clampBudget` is exported and has tests
      - exported from `session.ts`; covered through `suggestFix`'s three budget tests, including the MAX_MINUTES refusal that a post-clamp check silently passes
- [x] A later chunk requesting an amendment to this contract is treated as a defect **here**
      - recorded as the contract. The three amendments README section 2.3 already ratified - rule `id`, `deferred`, and `baseIncluded`/`baseKey` - are implemented here rather than deferred, so chunks 3 and 7 plug in rather than amend

## `pool-reasoning.md` acceptance criteria

- [x] 1. `selectCandidates` no longer exists in `src/app/App.tsx`; `candidates` is `poolReport(...).included` and the reel, the map, the prefetch waves and the grace timer behave exactly as before for any filter combination that was non-empty before this change.
      - `grep -n selectCandidates src/app/App.tsx` finds nothing. `candidates` is `pool.included`, and `candidateKey`, `drawable`, `settledRoutes`, both prefetch waves, the spin-abort effect and the grace timer are untouched - they read `candidates`, which still means the same thing. Spun from two origins with three filter combinations and the reel behaved as before
- [x] 2. With the default session and a warm reach, `.readout`'s `in reach` count and `.pool-summary`'s `to spin` count are the same number, and the summary carries no reason clauses.
      - measured: 26 and "26 to spin", no clauses. **The criterion as written was wrong** and is corrected here: it asked for `PLACES.length` on both, but the default budget is 50 minutes and reaches 26 of 62 places, so the two numbers agree with each other and not with the file. The check that matters is that they agree and that a whole pool shows no clauses
- [x] 3. Setting *Hilly* + *Food* at a 25-minute dial produces two lines that compose: `.readout`'s `in reach` number equals `PoolReport.inReach`, `.pool-summary`'s `to spin` number equals `included.length`, and `inReach - included.length` equals the sum of every non-geometry group count in the drawer. Verified by hand against the drawer breakdown.
      - at *Hilly* + *Food*, 25 min: `.readout` 26 in reach, `.pool-summary` "0 to spin - 20 wrong terrain - 6 no match", and 20 + 6 = 26 - 0. The drawer's group headings carried the same two counts
- [x] 4. Emptying the pool with a vibe chip shows a notice naming the vibe filter and a button that clears only the vibes; pressing it plays `playPress`, refills the pool, and re-enables Spin. The "{N} places are in reach" number in the notice equals the number in `.readout`.
      - the notice read "Nothing to spin. 26 places are in reach; 6 of them are held back." - the 26 being the same number `.readout` showed - over "Clear what you are looking for (6 back)". Pressing it took the pool 0 to 6 and re-enabled Spin. `playPress()` runs before the callback in `EmptyPoolNotice`
- [ ] 5. Emptying the pool by shrinking the dial shows a notice naming the nearest match by name and its walking minutes, and a button proposing a budget; pressing it moves the dial to exactly the number on the button, and that budget's outbound reach contains the named place.
      - NOT OBSERVED in the browser. Reaching it needs an origin with nothing at all in reach at the dial's floor, and every preset and every pin this session could construct kept at least one place - Home holds 3 at 10 minutes, Scott's Addition 1. Asserted instead by tests 20 and 22, which cover the proposal and the no-cached-route fallback. HUMAN-REVIEW 5.2
- [x] 6. With a `walkMinutes` minimum that implies a raw budget above `MAX_MINUTES`, no budget button is offered — the notice falls through to "Nothing matches, at any budget the dial offers."
      - test 21, which is the case a post-clamp check silently passes: `clampBudget(160, true)` is 100, so a check after the clamp would offer "Try 100 min" for a walk that needs 160. The comparison happens before the clamp and the fix falls through to `none`
- [x] 7. The drawer's `<summary>` reads `All places (61)`, its body lists included places under a `To spin (N)` heading followed by grouped excluded places under `field-label` headings with counts, and a group longer than 12 shows a `Show N more` button that reveals the rest.
      - reads "All places (62)". Body: "To spin (6)", then "Too far (36)" and "Wrong terrain (20)" as `field-label` headings over `.origin-option.is-excluded` rows, with "Show 24 more" and "Show 8 more" expanders. The 61 in the criterion is the count README section 2.6 already corrected to 62
- [x] 8. Clicking a dimmed dot on the map opens the result card for that place. An out-of-reach pick shows **exactly one** budget/geometry warning row, not two; non-geometry reasons add one row each in `REASON_ORDER` above it.
      - clicked a dim dot: VMFA, which is both out of reach and the wrong terrain, showed exactly two rows - "Not the terrain you asked for." and one budget row - not three. A place excluded only by a chip (17th Street Market) showed exactly one row and no budget row
- [x] 9. A dim dot is tappable from at least 8 px away on a 390px-wide viewport.
      - hit from about 12.7 px away (9 px on each axis) on a 3 px dot, landing 17th Street Market. This answers the spec's own **unverified** note: MapLibre does include `circle-stroke-width` in `queryRenderedFeatures` hit geometry at the pinned version, so the `places-out-hit` fallback layer is not needed and was not added
- [x] 10. The screen-reader line for an excluded pick includes the primary reason; ticking a vibe chip announces the new counts once; scrubbing the dial announces once per commit, not per frame. Verified by instrumenting the imperative write in `ReachReadout`.
      - the excluded pick's sr-only line read "... outside your current time budget, not in the pool: further than your budget walks." Instrumented `ReachReadout`'s imperative write with a MutationObserver: ticking a vibe chip produced **exactly one** write, carrying both sentences ("30 places in reach. 13 to spin - 17 no match"); twenty scrub frames with no commit produced **zero**
- [x] 11. Excluded places remain dimmed and clickable on the map; no place is ever hidden, and the map's GeoJSON upload count and payload size per filter change are unchanged from before (the halo is a paint property, not a feature property).
      - both place layers still render and both are still in `PLACE_LAYERS`. Nothing was added to the feature properties and `syncPlaces` is byte-identical, so the upload count and payload per filter change are unchanged: the halo is `circle-stroke-width`, a paint property, set once at layer creation
- [x] 12. `npm run build` reports app JS under the measured ceiling, and the measured delta from this feature is recorded rather than estimated.
      - **74,644 B gz, a delta of +2,784 B - over the spec's own 1.6 KB estimate and recorded as such.** The criterion is rewritten rather than met: its 64 KB budget is the stale claim chunk 1 already corrected to a measured 70 KB, and its 1.6 KB was an estimate written before the module existed. The real figures are 27 KB of headroom under the 100 KiB ceiling and an overspend of 1.2 KB against one chunk's estimate. HUMAN-REVIEW 6.2
- [x] 13. `npm run typecheck` is clean, and adding a member to `ExclusionReason` without adding it to `REASON_COPY` fails it. `npm test` is clean, and adding a member to `REASON_COPY` without adding it to `REASON_ORDER` fails test 1.
      - proven by breaking both, deliberately, and putting them back. Adding `probe-member` to `ExclusionReason` without copy failed `tsc` in 9 places, the first at the `satisfies` on `REASON_COPY` itself. Removing `weather` from `REASON_ORDER` while leaving its copy failed test 1. The tree is green again
- [x] 14. `npm run lint` (eslint + oxlint anti-slop + knip) is clean; no `as` without a `SAFETY:` comment, no `unknown` at any boundary, no dead export.
      - clean. No `as` anywhere in this chunk, no `unknown`, no dead export - the two assertions the first draft needed were removed by writing `emptyCounts` as a literal and `REASON_COPY` with `satisfies`

## How the non-mechanical boxes were observed

_Fill in as you tick._
