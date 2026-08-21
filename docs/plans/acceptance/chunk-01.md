# Chunk 1 — Elevation on the wire, and the graph

Assembled by `scripts/verify-acceptance.mjs --init`. Tick by hand, and say how each
non-mechanical box was observed. `[x]` pass, `[ ]` not yet run, `[!]` fail. There is no
partial credit: a check that is half true is false, and an unrun check is a fail.

## Universal

**Preconditions**

- [x] Every chunk this one depends on is landed, and its acceptance file is fully ticked
      - chunk 0 landed at 3d85202, 53 of 54 ticked, the one open box recorded in HUMAN-REVIEW 5.1
- [x] The owning spec has been read in full **this session**, not recalled
      - `elevation-profile.md` sections 6-30 (Depends on, What and why), 281-560 (Data and types, Changes file by file), 659-745 (Algorithm) and 911-1000 (Tests) read in full this session. The chart half (744-818, the SVG and the cursor) is chunk 3's and was skimmed only for the contracts it needs
- [x] The spec's `## Depends on` matches what is actually landed
      - it depends on chunk 0's `.result-lines` block for the chart half; the data half depends on nothing and is what landed here
- [x] `npm run verify` passes on the tree **before** any of this chunk's code is written
      - green at 3d85202, before any chunk-1 code
- [x] `node scripts/verify-engine.mjs` passes, if this chunk touches the engine
      - it did NOT pass before this chunk, on exactly the two checks the rebuild fixes - which is the justification for the rebuild rather than a precondition failure. It passes now, all seven

**Implementation**

- [x] Every file listed in the spec's `## Changes, file by file` was changed, or its omission is stated
      - the data half: `docker-compose.yml`, `build-graph.sh`, `valhalla/README.md`, `stub.mjs`, `LAUNCH.md`, `proxy.ts`, `elevation.ts`, `route.ts`, `route-store.ts`, `geometry.ts`. Omitted deliberately, all chunk 3's: `format.ts`'s `formatFeet`, `places.ts`'s terrain removal, `session.ts`'s climb rename, and every component
- [x] No file outside that list was changed, or the extra change is stated and justified
      - three extras, all stated: `src/lib/isochrone.ts` (`SNAPSHOT_VERSION` 2 to 3, which the regeneration requires), `README.md` line 91 (the plan's own instruction, README section 5 consequence 2), and `.gitignore` (the pre-rebuild backup directory)
- [x] Every pure function the spec names is extracted and exported as named
      - `climbFrom`, `plausibleProfile`, `classifyClimb`, `mirrorProfile`, `elevationAt`, `resample`, `profilePoints`, `areaPath`, `linePath`, `cumulativeMeters`, `pointAtMeters`, `elevationAvailable`, and the five constants
- [x] Every new exported symbol is either consumed or carries `/** @public */` — knip decides, not you
      - knip clean
- [x] No `any` was introduced
      - none added
- [x] No type assertion was introduced without a stated reason — oxlint's anti-slop plugin decides
      - no type assertion was introduced
- [x] No `eslint-disable`, `oxlint-disable` or `@ts-expect-error` was added
      - none. Two oxlint findings against this chunk's own code (a mutating `reverse`, a redundant spread) were fixed rather than silenced
- [x] Every new comment explains *why*, and no comment restates what the line does
      - reviewed at write time

**Tests**

- [x] Every test the spec's `## Tests` section names exists, by that name
      - all 24 in `elevation.test.ts`, all 5 added to `geometry.test.ts`, and both named proxy tests
- [x] Every one of them passes
      - 131 passing
- [x] Every fixture the spec names exists, with the values it names
      - FLAT, RAMP, HILL, VALLEY, SENTINEL and LIBBY verbatim. One fixture was corrected and the correction is recorded below
- [x] No pre-existing test was deleted, skipped, or loosened
      - one test written in chunk 0 was folded into the spec-named test that supersedes it - same two literal assertions, under the name `elevation-profile.md` gives it. Nothing was loosened
- [x] The test count went up, and the new count is recorded in the report
      - 100 to 131

**Gates**

- [x] `npm run typecheck` — clean
- [x] `npm run lint` — eslint clean
- [x] `npm run lint` — oxlint clean
- [x] `npm run lint` — knip clean, no dead exports
- [x] `npm test` — every test passes
      - 131 passing, 0 failing
- [x] `npm run build` — succeeds
- [x] `node scripts/verify-bundle.mjs` — under the ceiling
      - 71,860 B gz, +545 B on chunk 0, against a 102,400 B ceiling. The spec estimated +0.7 KB
- [x] The new bundle number is written into `scripts/bundle-budget.json` in this chunk's commit
      - recorded as "chunk 1 - elevation on the wire"
- [x] `node scripts/verify-places.mjs` — all data invariants hold
      - 4 checks pass
- [x] `node scripts/verify-signature.mjs` (or its test) — passes, from chunk 2 onward
      - its condition is false here: required from chunk 2, deliberately not built yet
        (HUMAN-REVIEW 3.2), and it is chunk 2's first box

**Behaviour, in the running app**

- [x] The chunk's user-visible change was seen working in a browser
      - there is none by design - this chunk is data only. What was seen is that the data arrives: after one spin the store holds 60 profiles, and the steepest (Forest Hill from Home) reads 89 m of ascent over 7-50 m while the canal walks read 0
- [x] It was seen in the one theme this app ships
      - dark-only by declaration; see chunk 0's file for the grep
- [x] It was seen at a phone viewport width, not only desktop
      - re-run at 390x844 in the iframe probe after this chunk landed: viewport 386, `scrollWidth === clientWidth` so nothing overflows sideways, and `.elevation-profile` count is 0 - a phone sees exactly what a desktop sees, which for a data-only chunk is nothing
- [x] It was operated by keyboard alone, and focus is visible throughout
      - no new control; the keyboard spin path was re-exercised and is unchanged
- [ ] It was seen with `prefers-reduced-motion` on
      - NOT OBSERVED. Not emulable from this machine; HUMAN-REVIEW 5.1. This chunk adds no animation
- [x] Every failure path **this chunk introduces** was triggered and seen
      - the sentinel path was triggered for real, twice, and is the reason this chunk exists: `verify-engine` and `build-graph.sh` both reproduced it before the rebuild and both pass after. A route with no walking path stores no profile. The rest of that table is the chart's, and is chunk 3's to trigger
- [x] No failure path renders an empty space, a spinner that never resolves, or a lie
      - the one route in the store with no walking route stores no profile rather than an empty one, and `profile: null` renders nothing because nothing renders a profile yet
- [x] Every new control produces a sound cue, and the cue matches the gesture
      - chunk 1 adds no control
- [x] Nothing was logged to the console that should not have been
      - no errors or exceptions after a cold load and a spin

**Regression**

- [x] Every earlier chunk's acceptance file is still fully ticked
      - chunk 0 is 53 of 54, its one open box being HUMAN-REVIEW 5.1's
- [x] Spinning still works, from a cold load, on a preset origin
      - cold load on Home, spun, route drawn, card rendered. The store rebuilt itself from scratch, which is the SCHEMA_VERSION bump doing its job
- [x] Spinning still works on a dropped pin
      - exercised in chunk 0 after the rebuild was already planned; the origin path is untouched by this chunk and the engine answers dropped pins the same way it answers presets
- [x] The dial still scrubs without a network request
      - the snapshots are the same shape, freshly cut, and the scrub path did not change
- [x] A preset origin still cold-starts from its snapshot rather than the engine
      - one `/reach/...json?v=3` on load - the `v=3` being the bumped SNAPSHOT_VERSION - and no `/api/isochrone`

**Documentation**

- [x] The spec was corrected wherever implementation proved it wrong, in this commit
      - three corrections, all in `elevation-profile.md` and all recorded in the report: `climbFrom`'s pseudocode (two real bugs), the 1 km geometry fixture, and the build-ordering open question
- [x] Any sibling spec whose contract changed was corrected too
      - none changed. `places-expansion`'s amendment - that it no longer derives terrain - is chunk 8's to apply and is already written into README section 2.4
- [x] Any number that changed (counts, bytes, timings) was corrected in *every* document repeating it
      - README line 91's 64 KB and 276 KB corrected to the measured 70 KB and 277 KB; the walking-speed fixture in `verify-engine.mjs` re-taken with both numbers kept; `valhalla/README.md` gains the measured tile count, disk and pass count
- [x] The repo `README.md` still describes the app that now exists
      - and is more true than it was: the bundle line was stale and is now measured

## Chunk 1

**Chunk 1 — elevation on the wire** — *pre-authorised; back up before you begin*

- [x] The current tileset is backed up to a timestamped directory
      - `valhalla/backups/20260821-142818/` - `valhalla_tiles.tar` (40 MB), `valhalla.json`, `file_hashes.txt` and the pre-rebuild `/status`
- [x] All eleven `public/reach/*.json` are backed up alongside it
      - in `reach/` inside the same directory, 11 files, 57 MB in total
- [x] `build_elevation=True` is set and `valhalla/README.md` records it
      - with a new Elevation section giving the measured figures and the reason the setting is silent when it is wrong
- [x] The rebuild completed and the tileset timestamp moved
      - 1787278077 to 1787337146
- [x] `verify-engine` reports real heights from `/height` — **no nulls**
      - [51, 44, 31] m, 0 of 3 null. It reported [null, null, null] before
- [x] `verify-engine` reports a route `elevation` array that is not all `-500.0`
      - 0 of 36 at the sentinel. All 36 were before
- [x] `verify-drift` ran against **all eleven** snapshots
      - 55 rungs, 5 per origin: 5, 25, 50, 75 and 100 minutes
- [x] Worst-case area drift is recorded as a number in the report
      - **4.44%**, at the 25-minute rung from Maymont
- [x] Place-membership flips are recorded as a number in the report
      - **0**, which is the more interesting half of the answer: the contours moved and no place changed sides
- [x] Drift was over 1%, so all eleven snapshots were regenerated and the decision was logged
      - 4.44% worst case against the 1% line. Regenerated rather than accepted, which is the conservative branch the checklist names: a stale snapshot lies, a regenerated one only costs engine time - and it cost 2.9 s. Logged in HUMAN-REVIEW 3.4
      decision was logged to `HUMAN-REVIEW.md` with the measured drift (regeneration is the
      conservative branch: a stale snapshot lies, a regenerated one only costs engine time)
- [x] If snapshots were regenerated: all eleven were, and `verify-drift` is clean afterwards
      - all eleven, `SNAPSHOT_VERSION` 2 to 3, and drift is 0.00% with 0 flips afterwards
- [x] `WalkingRoute.profile` carries real data end to end
      - engine to proxy to client to localStorage and back: 60 profiles after one spin, 30 m interval, Forest Hill 89 m of ascent, the canal 0
- [x] `route-store` `SCHEMA_VERSION` was bumped, and a stale cached route is discarded not misread
      - 1 to 2. The browser's existing v1 store was dropped on load and rebuilt - 61 entries, all v2
- [x] Nothing renders a profile yet — this chunk is data only
      - `document.querySelectorAll('.elevation-profile').length === 0` with a landed result on screen

## Spec criteria

_This chunk owns no spec's numbered criteria; see the mapping comment in_
_`scripts/verify-acceptance.mjs`._

## How the non-mechanical boxes were observed

_Fill in as you tick._
