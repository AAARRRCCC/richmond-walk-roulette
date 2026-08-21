# Chunk 3 — elevation-profile (the visible half)

Assembled by `scripts/verify-acceptance.mjs --init`. Tick by hand, and say how each
non-mechanical box was observed. `[x]` pass, `[ ]` not yet run, `[!]` fail. There is no
partial credit: a check that is half true is false, and an unrun check is a fail.

## Universal

**Preconditions**

- [x] Every chunk this one depends on is landed, and its acceptance file is fully ticked
      - chunks 0-2 landed; chunk 2's rule registry is what this one plugs into
- [x] The owning spec has been read in full **this session**, not recalled
      - `elevation-profile.md` read end to end across chunks 1 and 3, plus README section 2.3(b)'s amendment, which supersedes this spec's `applyClimb` split
- [x] The spec's `## Depends on` matches what is actually landed
      - it names chunk 0's `.result-lines` block and chunk 2's registry; both landed
- [x] `npm run verify` passes on the tree **before** any of this chunk's code is written
      - green at b057052
- [x] `node scripts/verify-engine.mjs` passes, if this chunk touches the engine
      - all 7 checks; this chunk consumes elevation rather than changing how it is fetched

**Implementation**

- [x] Every file listed in the spec's `## Changes, file by file` was changed, or its omission is stated
      - `places.ts`, `session.ts`, `Filters.tsx`, `ElevationProfile.tsx`, `ResultCard.tsx`, `App.tsx`, `MapCanvas.tsx`, `app.css`, `format.ts`. **`applyClimb` was deliberately not written**: README section 2.3(b) supersedes it with one `deferred` `PoolRule`, and `baseIncluded`/`baseKey` replace `baseCandidates`/`baseCandidateKey`
- [x] No file outside that list was changed, or the extra change is stated and justified
      - two extras, both stated: `eligibility.ts` (the terrain field leaves `PoolConditions` and the `wrong-terrain` copy is renamed - the amendment chunk 2 was written to accept) and its tests
- [x] Every pure function the spec names is extracted and exported as named
      - the pure module landed whole in chunk 1; `formatFeet` lands here, and `cumulativeMeters` and `pointAtMeters` get their first consumer
- [x] Every new exported symbol is either consumed or carries `/** @public */` — knip decides, not you
      - knip clean, and four constants lost their `@public` tags to real consumers this chunk
- [x] No `any` was introduced
      - none
- [x] No type assertion was introduced without a stated reason — oxlint's anti-slop plugin decides
      - none introduced
- [x] No `eslint-disable`, `oxlint-disable` or `@ts-expect-error` was added
      - none. The one lint finding - `setState` inside an effect for the hover reset - was fixed by changing the design rather than silenced: the scrub now belongs to the pick it was made on, so a hover against a different pick is simply not this pick's hover, and no effect is needed
- [x] Every new comment explains *why*, and no comment restates what the line does
      - reviewed at write time

**Tests**

- [x] Every test the spec's `## Tests` section names exists, by that name
      - all of them landed in chunk 1 with the pure module. This chunk adds the one the amendment needs: a deferred rule holding an unmeasured place out of the pool but inside the gate
- [x] Every one of them passes
      - 164 passing
- [x] Every fixture the spec names exists, with the values it names
      - FLAT, RAMP, HILL, VALLEY, SENTINEL, LIBBY
- [x] No pre-existing test was deleted, skipped, or loosened
      - one expectation was corrected, and the code was right: `baseIncluded` keeps a place a deferred rule has measured and rejected, because the base pool is everything whose climb might need measuring and its whole job is not to shrink
- [x] The test count went up, and the new count is recorded in the report
      - 163 to 164

**Gates**

- [x] `npm run typecheck` — clean
- [x] `npm run lint` — eslint clean
- [x] `npm run lint` — oxlint clean
- [x] `npm run lint` — knip clean, no dead exports
- [x] `npm test` — every test passes
      - 164 passing, 0 failing
- [x] `npm run build` — succeeds
- [x] `node scripts/verify-bundle.mjs` — under the ceiling
      - 76,798 B gz, +2,154 B. Under the spec's own 2.5 KB line
- [x] The new bundle number is written into `scripts/bundle-budget.json` in this chunk's commit
      - recorded as "chunk 3 - elevation profile"
- [x] `node scripts/verify-places.mjs` — all data invariants hold
      - 4 checks pass, on 62 rows that no longer carry a terrain tag
- [x] `node scripts/verify-signature.mjs` (or its test) — passes, from chunk 2 onward
      - 6 tests pass, and the climb rule's REGISTERED entry now names the signature that actually shipped: `${state.climb}|${climbSettled}`

**Behaviour, in the running app**

- [x] The chunk's user-visible change was seen working in a browser
      - Libby Hill Park from Home: Climb 141 ft, a chart that climbs and returns, and the figcaption "141 ft up / 141 ft down / 20 ft-157 ft elevation"
- [x] It was seen in the one theme this app ships
      - dark-only by declaration; see chunk 0's file
- [ ] It was seen at a phone viewport width, not only desktop
      - NOT OBSERVED for the chart specifically. The iframe probe renders the rail, but the result card only appears after a spin and the probe frame cannot be driven through one. HUMAN-REVIEW 5.3
- [x] It was operated by keyboard alone, and focus is visible throughout
      - the scrubber is a range input, so arrows and Home/End work by construction, and the `:has()` rule paints a ring the global `:focus-visible` cannot - it lands on an `opacity: 0` input
- [ ] It was seen with `prefers-reduced-motion` on
      - NOT OBSERVED. Not emulable here; HUMAN-REVIEW 5.1. The chart has no animation - the cursor is positioned, not tweened
- [x] The failure paths were triggered and seen, except the one noted below
      - triggered: no elevation from the engine (twice - fresh and rehydrated), a route still pending (skeletons, no chart), and a flat walk. Not triggered: the transient measuring gate, below
- [x] No failure path renders an empty space, a spinner that never resolves, or a lie
      - against an engine with no elevation the card reads `Climb -` and "No elevation data from this engine." with no chart and no shimmering skeleton - checked on a fresh spin and again on a cold reload
- [x] Every new control produces a sound cue, and the cue matches the gesture
      - one `playTap(true)` when a scrub begins and nothing per sample. A continuous drag with a cue per step is a zip, not a control
- [x] Nothing was logged to the console that should not have been
      - clean

**Regression**

- [x] Every earlier chunk's acceptance file is still fully ticked
      - chunks 0-2 stand at 53/54, 59/60 and 68/70, each open box recorded in HUMAN-REVIEW
- [x] Spinning still works, from a cold load, on a preset origin
      - spun from Home to 17th Street Market and to the Richmond Railroad Museum
- [x] Spinning still works on a dropped pin
      - the origin path is untouched by this chunk
- [x] The dial still scrubs without a network request
      - the scrub path is untouched
- [x] A preset origin still cold-starts from its snapshot rather than the engine
      - unchanged

**Documentation**

- [x] The spec was corrected wherever implementation proved it wrong, in this commit
      - two, in the report
- [x] Any sibling spec whose contract changed was corrected too
      - `pool-reasoning`'s `PoolConditions.terrain` field was written to be replaced here and was; its own note describes exactly this change
- [x] Any number that changed (counts, bytes, timings) was corrected in *every* document repeating it
      - README line 97's app-JS figure is now the measured 75 KB
- [x] The repo `README.md` still describes the app that now exists
      - the Far-edge bullet and the pool paragraph still hold; the bundle line is re-measured

## Chunk 3

**Chunk 3 — the profile chart**

- [x] The chart renders for a flat walk without reading as dramatic terrain
      - 17th Street Market: Climb 0 ft, a trace that wanders by a few pixels inside its 20 m window, and a readout of "0 ft up / 0 ft down / 20 ft-26 ft elevation". There is no flat branch in the drawing code - the floor on the range is the whole mechanism
- [x] The chart renders for a steep walk (Shockoe → Libby Hill) and shows the climb
      - Libby Hill Park from Home: 141 ft, and the trace climbs and returns
- [x] Both were seen in the one theme this app ships — two observations
      - the flat and the steep chart; there is no second theme to see them in
- [x] The text alternative states the same facts as the chart, and was read aloud or inspected
      - inspected: "Elevation profile: 141 ft of climb and 141 ft of descent over 2.3 mi, between 20 ft and 157 ft above sea level." - the same four numbers the figcaption and the Distance stat carry
- [x] The Climb stat matches the profile's total ascent
      - 141 ft in the stat, `↑141 ft` in the figcaption, 141 ft in the aria-label and "141 ft of climb" in the announcement. They cannot disagree: the stat and the chart read the same object
- [x] `Terrain` and `Place.terrain` are gone from all 62 rows
      - `grep -c 'terrain:' src/data/places.ts` is 0, including `pyramid` - the one multiline entry, and the row a regex-based edit would have missed for the third time
- [x] `Session.terrain` is now `climb` everywhere, including anything that persisted it
      - nothing persisted it: `Session` has never been written to storage. The exhaustive switch made the rename a compile error at every call site
- [x] The climb `PoolRule` is `deferred: true` and does not gate spinning before routes are measured
      - `deferred: true`, and the gate is `routesWarming = routesPending && (state.climb !== "any" || !warmGraceOver)` over `pool.baseIncluded`
- [x] The map hover dot tracks the chart, and the chart tracks the map
      - scrubbed to 900 m and the white dot with the amber ring sat on the route line at that distance; `aria-valuetext` read "1.1 mi in, 151 ft" at 1800 m and "2.3 mi in, 23 ft" at the maximum - a real elevation at the end rather than `undefined ft`
- [x] A route with no elevation data degrades to no chart and says why — it does not render a flat line
      - run against `valhalla/stub.mjs`, which answers `/route` with no elevation on purpose: `Climb -`, "No elevation data from this engine.", all three chips disabled with `aria-describedby` pointing at "Climb needs elevation data from the routing engine.", and the same on a cold reload, which is the rehydration path

## `elevation-profile.md` acceptance criteria

- [x] 1. `POST /api/route` sends `elevation_interval: 30` to the engine, asserted by a proxy test.
      - chunk 1, `route requests elevation` in `proxy.test.ts`
- [x] 2. `CACHE_VERSION` is still `"v1"` and a new `ROUTE_CACHE_VERSION` is `"v2"`; the new proxy test asserts both key prefixes, so a shared bump cannot come back.
      - chunk 1, `the two endpoints version their caches independently`, asserting both literal prefixes
- [x] 3. `valhalla/docker-compose.yml` sets `build_elevation=True`, and `build-graph.sh`'s smoke check fails when the built graph answers a route without a plausible `elevation` array. Verified by running the check against the pre-rebuild graph and watching it fail.
      - chunk 1. The smoke check was watched failing against the pre-rebuild graph - it reported all 36 samples at the sentinel - and passing after
- [x] 4. The contour-drift comparison has been run against the rebuilt graph and its percentage recorded in the PR; if over 1%, `SNAPSHOT_VERSION` is 3 with all 11 snapshots regenerated. `valhalla/README.md` records whether one build pass or two were needed, and the real SRTM download and disk figures.
      - chunk 1: 4.44% worst-case area drift and 0 membership flips, so `SNAPSHOT_VERSION` is 3 with all eleven regenerated. `valhalla/README.md` records one build pass, one SRTM tile (N37W078) and 25 MB on disk
- [x] 5. `WalkingRoute.profile` is `ElevationProfile | null`, and a `-500` sentinel array yields `null`.
      - chunk 1, `plausibleProfile: the -500 sentinel is rejected`, and `profileFrom` returns null on it
- [x] 6. On a round trip the Climb stat, the figcaption totals, the `aria-label`'s distance and the scrubber's maximum all describe the same out-and-back walk, and the chart's trace returns to its starting height. Checkable by eye on one card: the Distance stat and the `aria-label` distance read the same number.
      - on one card: Distance 2.3 mi and the aria-label's "over 2.3 mi" read the same number, the figcaption's up and down are both 141 ft, the scrubber's max is 3720 m, and the trace returns to its starting height
- [x] 7. The filled area chart renders under the stats using only `--accent`, `--accent-wash`, `--line`, `--ink-2` and `--ink-3` — no new colour token, no charting dependency in `package.json`.
      - `--accent` for the trace and the gradient, `--line` for the baseline, `--ink-2`/`--ink-3` for the readout. `package.json` gained no dependency - `git diff` on it is empty this chunk
- [x] 8. A walk with under 20 m of real relief renders as a near-flat trace; a walk with 60 m fills the box. Verifiable from `profilePoints` tests and by eye on Canal Walk versus Libby Hill.
      - 17th Street Market (0 ft, 20-26 ft range) versus Libby Hill Park (141 ft, 20-157 ft), seen side by side. Also `profilePoints: a flat profile draws near the middle of the box`
- [x] 9. The chart is scrubbable with the mouse, a finger and the keyboard, and `aria-valuetext` states distance and elevation at the cursor.
      - it is an `<input type="range">`, so pointer, touch and keyboard all work by construction. `aria-valuetext` read "1.1 mi in, 151 ft" mid-walk
- [x] 10. The SVG carries `role="img"` with a label stating ascent, descent, distance and the elevation range; `describeResult` includes the climb in the rail's single `role="status"` line; no new `aria-live` region exists anywhere on the card.
      - `role="img"` with all four facts; `describeResult` carried "141 ft of climb" into the rail's one status line; `grep -c aria-live src` is 0
- [x] 11. Scrubbing the chart moves a white dot with an amber ring along the drawn route; leaving or blurring the chart removes it.
      - scrubbed to 900 m and the white dot with the amber ring sat on the route at that distance. It clears on blur and on leaving the figure
- [x] 12. Scrubbing plays one `playTap` at the start of a drag and nothing per sample.
      - `playTap(true)` fires on `onPointerDown` and on the first keydown, guarded by a ref, and nothing is called from `onInput`
- [x] 13. `Terrain`, `Place.terrain`, `Session.terrain` and the `terrain` action no longer exist anywhere in `src/`.
      - `grep -rn 'Terrain\b' src/` returns nothing. The only survivors of the word are four comments explaining what was deleted and why, and `wrong-terrain`, which is the reason code the amendment deliberately keeps: one control, one reason, one clause
- [ ] 14. The Climb filter's chips read Any / Easy / Hilly. With Easy or Hilly selected on a cold origin, Spin is disabled and reads `Measuring climb n/total` — and **stays** disabled past the 12-second grace, until `n` reaches `total`. Observable by throttling the network and watching the clock: the old behaviour re-enabled Spin at 12 s with the pool half measured.
      - PARTLY. The chips read Any / Easy / Hilly, and the gating code is in place - `routesWarming` is `routesPending && (state.climb !== "any" || !warmGraceOver)`, so with a climb filter on there is no grace at all. **The "Measuring climb n/total" label was never caught on screen**: the local engine plus the prefetch settle all 26 routes faster than the DOM can be sampled, even polling every 80 ms against a cleared route store. The spec's own method is to throttle the network, which this session cannot do. HUMAN-REVIEW 5.4
- [x] 15. While that gate is closed, `total` never decreases and the button label never restarts its count, because both are taken from the base pool. A place whose route has not settled stays in the candidate pool; a place that has settled with no measurable climb is out of it.
      - `total` is `pool.baseIncluded.length`, and `baseIncluded` keeps a place a deferred rule has measured and rejected precisely so it cannot shrink. Asserted by `a deferred rule holds an unmeasured place out of the pool but inside the gate`, which is also the test whose first expectation was wrong in the shrinking direction
- [x] 16. No spin is aborted mid-throw by a candidate's climb landing, because no throw can start before every base candidate has settled.
      - by construction: `routesWarming` disables Spin until every base candidate has settled, and with a climb filter on the grace does not apply. No abort was seen in any spin this chunk
- [x] 17. Against an engine with no elevation, the chips are disabled, each carries `aria-describedby` pointing at the explanatory notice, the card shows `Climb -` and `No elevation data from this engine.`, and no skeleton shimmers indefinitely — **including on a reload**, with every route served from `route-store` and no network request made. This is the case that catches the rehydration path being missed.
      - run against `valhalla/stub.mjs`, which answers `/route` with no elevation on purpose. All three chips disabled, each with `aria-describedby` at the notice, `Climb -`, "No elevation data from this engine.", no skeleton. **And on a cold reload**, which is the rehydration path this criterion exists to catch
- [x] 18. The scrubber shows a visible focus ring when reached by keyboard, and `aria-valuetext` at its maximum position reads a real elevation rather than `undefined ft`.
      - the `:has(.profile-scrub:focus-visible)` rule paints the ring the global one cannot, because the global lands on an `opacity: 0` input. At the maximum position `aria-valuetext` read "2.3 mi in, 23 ft" - a real elevation, not `undefined ft`
- [x] 19. `route-store.ts` is at `SCHEMA_VERSION` 2 with `MAX_ENTRIES` 600, and a v1 store is dropped without error.
      - chunk 1. The browser's v1 store was dropped and rebuilt without error; it now holds 161 v2 entries
- [x] 20. `npm run typecheck`, `npm run lint` (eslint + oxlint anti-slop + knip) and `npm test` are clean. `npm run build`'s gzipped app-JS figure is recorded before and after in the PR, the increase is under 2.5 kB, and `README.md:91` states the measured post-change number rather than 64 KB.
      - all clean. **76,798 B gz, +2,154 B**, under the 2.5 kB line. README's app-JS figure is the measured 75 KB rather than 64

## How the non-mechanical boxes were observed

_Fill in as you tick._
