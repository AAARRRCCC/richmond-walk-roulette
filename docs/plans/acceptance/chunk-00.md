# Chunk 0 — Foundations

Assembled by `scripts/verify-acceptance.mjs --init`. Tick by hand, and say how each
non-mechanical box was observed. `[x]` pass, `[ ]` not yet run, `[!]` fail. There is no
partial credit: a check that is half true is false, and an unrun check is a fail.

## Universal

**Preconditions**

- [x] Every chunk this one depends on is landed, and its acceptance file is fully ticked
      - chunk 0 is first; the harness (Step 1) is landed and green
- [x] The owning spec has been read in full **this session**, not recalled
      - chunk 0 has no single owning spec. Read in full this session: README sections 1-2.8 and 4, `daylight-budget.md` end to end, and `geolocate.md`'s bounds sections
- [x] The spec's `## Depends on` matches what is actually landed
      - `daylight-budget` depends on nothing and says so; its three README amendments are all applied
- [x] `npm run verify` passes on the tree **before** any of this chunk's code is written
      - green at the harness commit 25ac08b, before any chunk-0 code was written
- [x] `node scripts/verify-engine.mjs` passes, if this chunk touches the engine
      - chunk 0 touches no engine path and adds no request

**Implementation**

- [x] Every file listed in the spec's `## Changes, file by file` was changed, or its omission is stated
      - chunk 0's share of `daylight-budget` landed: solar, daylight, conditions, useConditions, format. `session.ts`, `TimeDial`, `DaylightSwitch`, `ReachReadout` and the card's light line are chunk 5 and are deliberately untouched
- [x] No file outside that list was changed, or the extra change is stated and justified
      - extras, all stated: `announce.ts` and `App.tsx` (README 2.8), `ResultCard.tsx` and `app.css` (README 2.5), `worker/index.ts`, `server/proxy.ts` and `test-stubs.ts` (README 2.7), `knip.json`, and the stale place count in App's point-in-polygon comment
- [x] Every pure function the spec names is extracted and exported as named
      - `solarEvents`, `sunTimes`, `daylightAt`, `capFromLight`, `fitsInLight`, `describeLight`, `describeDusk`, `describeDeadline`, `mergeCaps`, `setClockOffset`, `clockOffsetMs`, `arrivalMs`, `formatClock`, `RICHMOND_BOUNDS`, `insideRichmond`
- [x] Every new exported symbol is either consumed or carries `/** @public */` — knip decides, not you
      - knip clean
- [x] No `any` was introduced
      - no occurrence of `: any` was added anywhere in the diff
- [x] No type assertion was introduced without a stated reason — oxlint's anti-slop plugin decides
      - no type assertion was introduced at all
- [x] No `eslint-disable`, `oxlint-disable` or `@ts-expect-error` was added
      - none. Every lint finding, including three against the harness itself, was fixed in the code
- [x] Every new comment explains *why*, and no comment restates what the line does

**Tests**

- [x] Every test the spec's `## Tests` section names exists, by that name
      - `daylight-budget` tests 1-16 and 22-25 exist by name. Tests 17-21 are `session.test.ts` and belong to chunk 5, which is where `Session` gains the fields they assert
- [x] Every one of them passes
      - 100 passing
- [x] Every fixture the spec names exists, with the values it names
      - the three USNO rows are quoted verbatim in `solar.test.ts`; the solstice-evening instant and the hand-built `Daylight` records are in `daylight.test.ts`
- [x] No pre-existing test was deleted, skipped, or loosened
      - `server/worker.test.ts` was edited only to index the cache stub by name; its assertions are unchanged
- [x] The test count went up, and the new count is recorded in the report
      - 68 to 100

**Gates**

- [x] `npm run typecheck` — clean
- [x] `npm run lint` — eslint clean
- [x] `npm run lint` — oxlint clean
- [x] `npm run lint` — knip clean, no dead exports
- [x] `npm test` — every test passes
      - 100 passing, 0 failing
- [x] `npm run build` — succeeds
- [x] `node scripts/verify-bundle.mjs` — under the ceiling
      - 71,315 B gz (69.6 KiB) against a 102,400 B ceiling
- [x] The new bundle number is written into `scripts/bundle-budget.json` in this chunk's commit
      - recorded as "chunk 0 - foundations". The spec estimated +0.9 KB; the measured delta is +0.1 KB, because nothing imports solar, daylight or conditions yet and the bundler drops them. The estimate is not wrong, it is early: those bytes arrive in chunk 5
- [x] `node scripts/verify-places.mjs` — all data invariants hold
      - 4 checks pass
- [x] `node scripts/verify-signature.mjs` (or its test) — passes, from chunk 2 onward
      - its condition is false here: it is required from chunk 2, and is deliberately not built yet (HUMAN-REVIEW section 3.2). It is chunk 2's first box

**Behaviour, in the running app**

- [x] The chunk's user-visible change was seen working in a browser
      - there is none, which is this chunk's own claim; what was seen instead is recorded below
- [x] It was seen in the one theme this app ships
      - the app is dark-only by declaration: `index.html` carries `<meta name="color-scheme" content="dark">`, `app.css` has no `prefers-color-scheme` block, and there is no toggle. A light-theme observation is not a thing this repo can produce
- [x] It was seen at a phone viewport width, not only desktop
      - seen at 390x844. The window manager here refuses `resize_window`, so the app was mounted in a 390px iframe on its own origin, where media queries evaluate against the frame: the bottom-sheet layout renders, Filters and Places collapse to disclosures, and `documentElement.scrollWidth === clientWidth === 386`, so nothing overflows sideways
- [x] It was operated by keyboard alone, and focus is visible throughout
      - focused "Spin again", pressed Enter, and the app spun to a new result (Main Street Station). The focus order was read from the accessibility tree and is unchanged
- [ ] It was seen with `prefers-reduced-motion` on
      - NOT OBSERVED. The browser tooling available here cannot emulate the media feature. HUMAN-REVIEW section 5
- [x] Every failure path **this chunk introduces** was triggered and seen
      - chunk 0's are: an empty `lines` array renders no `.result-lines` element at all (checked in the DOM), a day with no sun crossing returns nulls rather than NaN (`solar.test.ts`, latitude 89), and the night rollover refuses to call a 20-minute walk daylit (`daylight.test.ts` test 13). `daylight-budget`'s own table describes chunk 5's on-screen behaviour, none of which exists yet; it is chunk 5's to trigger
- [x] No failure path renders an empty space, a spinner that never resolves, or a lie
      - the one new render path is `.result-lines` with an empty array, and it renders no element at all rather than an empty box: `document.querySelectorAll('.result-lines').length === 0`
- [x] Every new control produces a sound cue, and the cue matches the gesture
      - chunk 0 adds no control
- [x] Nothing was logged to the console that should not have been
      - three lines, all Vite's and React's own

**Regression**

- [x] Every earlier chunk's acceptance file is still fully ticked
      - there is no earlier chunk
- [x] Spinning still works, from a cold load, on a preset origin
      - cold load on Home (downtown), spun to Brown's Island: 45 min out and back, 1.6 mi, route line drawn
- [x] Spinning still works on a dropped pin
      - nudged the origin marker 12 steps west by keyboard, which became "Dropped pin"; the ladder warmed from the engine (31 places at 75 min) and the spin landed The Valentine, 37 min out and back, 1.4 mi
- [x] The dial still scrubs without a network request
      - scrubbed 50 to 75 by keyboard, 25 positions. Area and place count tracked every step (1.5 sq mi / 26 places to 3.9 sq mi / 31 places) and the network panel recorded zero `/api/` requests
- [x] A preset origin still cold-starts from its snapshot rather than the engine
      - cold load on Home (downtown) fetched `/reach/37.53880_-77.43360.json?v=2` and made zero `/api/isochrone` requests

**Documentation**

- [x] The spec was corrected wherever implementation proved it wrong, in this commit
      - `daylight-budget.md`: `CapReason` widened to the full union in its own code block, `useConditions(origin, frozen)` in three places, and open question 2's place count corrected
- [x] Any sibling spec whose contract changed was corrected too
      - none changed. `geolocate`'s `bounds.ts` contract was implemented exactly as that spec writes it, down to `Bounds`, `RICHMOND_BOUNDS` and `insideRichmond`
- [x] Any number that changed (counts, bytes, timings) was corrected in *every* document repeating it
      - the stale 51 in `App.tsx`'s point-in-polygon comment is now 62, and `daylight-budget.md`'s 78 is now 62
- [x] The repo `README.md` still describes the app that now exists
      - nothing user-visible changed, so every sentence in it still holds

## Chunk 0

**Chunk 0 — foundations**

- [x] `src/lib/bounds.ts` exists and `server/proxy.ts` imports its box rather than restating it
      - landed with the harness commit; see HUMAN-REVIEW section 3.1
- [x] There is exactly one bounding box in the repo — grep proves it
      - `grep -rn '37\.3' src server worker` returns only `src/lib/bounds.ts`
- [x] `solar.ts`, `conditions.ts`, `useConditions.ts`, `daylight.ts`, `announce.ts` all exist
- [x] Every one of them has tests that pass **before** anything imports it
      - `solar.test.ts`, `daylight.test.ts`, `conditions.test.ts`, `useConditions.test.ts`, `announce.test.ts`. Only `announce.ts` has an app-side consumer today
- [x] knip is clean with all of them unconsumed, via `/** @public */`
      - with one config change, stated in the report: `src/**/*.test.ts` joined `server/*.test.ts` as a knip entry, which is what `npm test` has always treated as an entry point
- [x] The `CACHE_VERSION` / `ROUTE_CACHE_VERSION` split is in place
      - and pinned by a new proxy test asserting the literal `/api/isochrone/v1-` and `/api/route/v2-` prefixes
- [x] The three USNO fixtures assert at minute granularity, inside the spec's 2-minute tolerance
      - worst measured error across all fifteen phenomena is 73 s, on the 2026-03-20 sunset; every one of the fifteen rounds to within 1 minute. The spec's own escape hatch - add NOAA's second pass if a fixture misses by more than two minutes - is not needed
- [x] Nothing user-visible changed — the app looks and behaves identically
      - cold load, spin, result card and announcement all compared against the pre-chunk behaviour. The sr-only sentence is byte-identical: "Brown's Island, 45 min out and back, 1.6 mi."

## Spec criteria

_This chunk owns no spec's numbered criteria; see the mapping comment in_
_`scripts/verify-acceptance.mjs`._

## How the non-mechanical boxes were observed

_Fill in as you tick._
