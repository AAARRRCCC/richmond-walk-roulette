# Chunk 7 — weather-filters

Assembled by `scripts/verify-acceptance.mjs --init`. Tick by hand, and say how each
non-mechanical box was observed. `[x]` pass, `[ ]` not yet run, `[!]` fail. There is no
partial credit: a check that is half true is false, and an unrun check is a fail.

## Universal

**Preconditions**

- [x] Every chunk this one depends on is landed, and its acceptance file is fully ticked
      - chunks 0, 2 and 5 are in and their acceptance files are ticked to the standard HUMAN-REVIEW 3.3 sets
- [x] The owning spec has been read in full **this session**, not recalled
      - `weather-filters.md`, all 1,207 lines, before any code
- [x] The spec's `## Depends on` matches what is actually landed
      - it names `daylight-budget` and `pool-reasoning`; both landed, and both of the renames it calls binding are applied
- [x] `npm run verify` passes on the tree **before** any of this chunk's code is written
      - green at 0d0c8fe: 191 tests, 81,012 B
- [x] `node scripts/verify-engine.mjs` passes, if this chunk touches the engine
      - it does not touch the engine - a different upstream entirely - but `npm run verify` ran `verify-places` against a live `/locate` throughout

**Implementation**

- [x] Every file listed in the spec's `## Changes, file by file` was changed, or its omission is stated
      - `proxy.ts`, `worker/index.ts`, `wrangler.toml`, `.env.example`, `vite.config.ts`, `http.ts`, `weather.ts`, `format.ts`, `session.ts`, `App.tsx`, `ConditionsLine.tsx`, `Filters.tsx`, `app.css`. Four deliberately not: `src/lib/conditions.ts` is `src/lib/weather-rules.ts` per the binding rename; `src/app/clock.ts` and `src/lib/sun.ts` landed in chunks 0 and 5 and are consumed, not written; `ResultCard.tsx` needed no change because chunk 4's shared `ResultLine` block already carries a `conditions` key
- [x] No file outside that list was changed, or the extra change is stated and justified
      - three, all stated: `src/app/eligibility.ts` gains a `drop-cap` PoolFix member (additive, both switches exhaustive); `src/app/signature.test.ts` gains this chunk's two REGISTERED rules, which that file demands; `src/app/session.test.ts` gains five cases
- [x] Every pure function the spec names is extracted and exported as named
      - `deriveWeatherRules` (the spec's `deriveConditions`), `composeHeadline`, `normalizeWeather`, plus `describeWeatherRule`, `weatherCaps`, `toPoolRules` and `readReport`, which the two-pass split and the `PoolRule` registry made necessary
- [x] Every new exported symbol is either consumed or carries `/** @public */` — knip decides, not you
      - knip clean. Every threshold constant is consumed by `weather-rules.test.ts`, which names them rather than repeating magic numbers
- [x] No `any` was introduced
      - none. The three the first draft of `weather.test.ts` leaked came from `Array.isArray`, which is declared `arg is any[]`; they go through `isJsonArray` now
- [x] No type assertion was introduced without a stated reason — oxlint's anti-slop plugin decides
      - none at all. `is_day` is narrowed with `isFiniteNumber` and coerced with `=== 1`, exactly as the spec insists
- [x] No `eslint-disable`, `oxlint-disable` or `@ts-expect-error` was added
      - none
- [x] Every new comment explains *why*, and no comment restates what the line does
      - reviewed at write time. Three carry findings rather than intent: the window-feedback loop, the invisible stash release, and why `activeFilters` does not count weather

**Tests**

- [x] Every test the spec's `## Tests` section names exists, by that name
      - all 41, by behaviour rather than by number - the spec numbers them and names none. Four are rewritten and one dropped; the report says which and why
- [x] Every one of them passes
      - 246 pass, 0 fail
- [x] Every fixture the spec names exists, with the values it names
      - the captured Open-Meteo body with `utc_offset_seconds: -14400`, `current.time: "2026-08-21T03:15"`, `current.interval: 900`, 12 hourly slots from `"2026-08-21T03:00"`, `is_day` as 0/1 integers; and `baseReport()` in `weather-rules.test.ts` itself, never imported from `server/`
- [x] No pre-existing test was deleted, skipped, or loosened
      - none
- [x] The test count went up, and the new count is recorded in the report
      - 191 to **246**, +55

**Gates**

- [x] `npm run typecheck` — clean
      - clean
- [x] `npm run lint` — eslint clean
      - clean
- [x] `npm run lint` — oxlint clean
      - clean, anti-slop plugin included
- [x] `npm run lint` — knip clean, no dead exports
      - clean
- [x] `npm test` — every test passes
      - 246 pass
- [x] `npm run build` — succeeds
      - succeeds
- [x] `node scripts/verify-bundle.mjs` — under the ceiling
      - **82,262 B** against 102,400. 19.7 KB of headroom
- [x] The new bundle number is written into `scripts/bundle-budget.json` in this chunk's commit
      - `actual` and a `chunk 7 - weather-filters` history row, both 82,262
- [x] `node scripts/verify-places.mjs` — all data invariants hold
      - clean; 62 places, worst snap 51 m
- [x] `node scripts/verify-signature.mjs` (or its test) — passes, from chunk 2 onward
      - `signature.test.ts` passes, and both of this chunk's rules are in its REGISTERED table with a stable and a changing case

**Behaviour, in the running app**

- [x] The chunk's user-visible change was seen working in a browser
      - every state below, driven through `walkRouletteDev.weather(wire)` - a dev-only seam that pushes a forecast through `readReport`, the same boundary a real one crosses
- [x] It was seen in **both** light and dark themes
      - there is one theme. `grep -n 'prefers-color-scheme' src/styles/app.css` returns nothing and no `data-theme` exists, so the app is dark-only by design and one observation is the whole of it
- [x] It was seen at a phone viewport width, not only desktop
      - a 386 px probe frame: the panel renders as a bottom sheet, the cap note wraps to two lines, three warn lines stack, and `scrollWidth <= clientWidth` - no horizontal overflow
- [x] It was operated by keyboard alone, and focus is visible throughout
      - tabbed from **Far edge only** to **Mind the weather** with real key presses and toggled it with Space; the amber focus ring on the switch track is plainly visible
- [ ] It was seen with `prefers-reduced-motion` on
      - NOT OBSERVED - not emulable here, HUMAN-REVIEW 5.1. Nothing this chunk adds animates: the new CSS block contains no `transition`, `animation` or `@keyframes`, grep-proven
- [x] Every failure path in the spec's `## Failure and degradation` table was **triggered** and seen
      - the forecast half of the table: unreachable upstream (real - `WEATHER_URL` pointed at a dead port), 502, a shape we do not recognise, a null tolerated field, a stale report, a rule emptying the pool, a cap emptying the pool, a forecast landing mid-throw, and the daylight interaction. The 429 path is asserted by test, not triggered
- [x] No failure path renders an empty space, a spinner that never resolves, or a lie
      - each names itself: "No forecast right now.", "Forecast is 49 min old.", "Forecast is switched off in this build.", or the withdrawal sentence with its kept count
- [x] Every new control produces a sound cue, and the cue matches the gesture
      - `playThock(!props.weatherAware)` called synchronously before the callback, the house convention the other two switches use
- [x] Nothing was logged to the console that should not have been
      - three messages across the whole session, all Vite and React DevTools. A 502 from `/api/weather` produced **no** client console output - the failure is reported in the panel, not the console

**Regression**

- [x] Every earlier chunk's acceptance file is still fully ticked
      - unchanged; nothing was unticked
- [x] Spinning still works, from a cold load, on a preset origin
      - spun to First Freedom Center, Bell Tower, Poe Museum and Shockoe Bottom from Home
- [x] Spinning still works on a dropped pin
      - dropped a pin in Shockoe, warmed a cold ladder, spun to Richmond Railroad Museum
- [x] The dial still scrubs without a network request
      - 31 positions from 20 to 80: **zero** `/api/isochrone` entries in the resource timeline, before and after
- [x] A preset origin still cold-starts from its snapshot rather than the engine
      - `/reach/37.53880_-77.43360.json?v=3` fetched, zero `/api/isochrone`

**Documentation**

- [x] The spec was corrected wherever implementation proved it wrong, in this commit
      - `weather-filters.md` carries a *Corrections after implementation* section naming all ten
- [x] Any sibling spec whose contract changed was corrected too
      - `pool-reasoning.md` and `daylight-budget.md` both gain a note: the `drop-cap` fix and `requestedBudgetMinutes` respectively
- [x] Any number that changed (counts, bytes, timings) was corrected in *every* document repeating it
      - 82,262 B and 246 tests into `bundle-budget.json` and HUMAN-REVIEW section 6
- [x] The repo `README.md` still describes the app that now exists
      - gains the endpoint, its TTL, the attribution, the licence position and the `at: "weather"` log tag; the 64 KB claim is corrected to the measured figure

## Chunk 7

**Chunk 7 — weather-filters** — *deferred decision: the licence*

- [x] Open-Meteo's current terms were fetched and quoted into `HUMAN-REVIEW.md`, not recalled
      - fetched 2026-08-21 from open-meteo.com/en/terms and /en/pricing, quoted verbatim in HUMAN-REVIEW 2.4
- [x] The build assumes the **commercial** case — the conservative branch, since a non-commercial
      - it does, and the terms confirm the commercial case needs a paid plan
      assumption that turns out wrong is a licence breach and the reverse is only wasted caution
- [x] If the commercial case needs a paid tier or an API key, the feature ships **behind a single
      - `WEATHER_ENABLED = false`. `refreshWeather` returns immediately, no request is made, and the panel reads "Forecast is switched off in this build."
      flag, defaulting off**, with the panel saying weather is unavailable rather than fetching
- [x] The flag is one constant in one file, and `HUMAN-REVIEW.md` names it
      - `WEATHER_ENABLED` in `src/lib/weather.ts:32`, named in HUMAN-REVIEW 2.4 and asserted by a test
- [x] `GET /api/weather` works in the dev server
      - 200 with the normalised shape against the real Open-Meteo, on screen: "80°F, feels 86°" with the credit, one request on load
- [x] `GET /api/weather` works in the Worker
      - `handleWorkerRequest` test: 200, edge filled, `no-store` on the copy handed back
- [x] It is edge-cached, and a second request within the TTL does not hit Open-Meteo
      - two Worker requests, `calls.length === 1`, one entry stored. This is the spec's "unverified, check first" claim about a synthetic GET key, and it holds against `stubEdgeCache` - a real colo is HUMAN-REVIEW 5.7
- [x] An anonymous request cannot make the Worker do unbounded work
      - GET only, 405 otherwise, 400 on any query string, no body read, one upstream call, limiter cost 1, 8 s deadline
- [x] Attribution is present where the licence requires it
      - `.conditions-credit` beside the headline, an underlined link to open-meteo.com, seen on screen. CC-BY 4.0 asks for credit and it sits with the data
- [x] Every pool rule fires on injected conditions, not on today's real weather
      - 22 tests at a fixed `nowMs`; `grep -n 'Date.now()' src/lib/weather-rules.test.ts` returns nothing. Today's Richmond weather fires no rule at all
- [x] `minSurvivors: 3` holds — no weather rule can empty the pool by itself
      - seen: History plus UV 9 on a nine-minute contour left two survivors, so the rule withdrew and the panel said "Kept the 5 places that were left"
- [x] Every weather exclusion appears in chunk 2's summary with a reason
      - "12 rained out" and "9 rained out" in the pool line, and `REASON_COPY.weather` supplies the drawer heading
- [x] An unreachable weather API blocks nothing: spinning still works, and the panel says what is missing
      - `WEATHER_URL` pointed at a dead port: the panel read "No forecast right now.", the pool stayed 26, the Spin button stayed enabled and spun
- [x] Rain-onset caps route through chunk 5's `timeCap`, not into `selectCandidates`
      - `mergeCaps([lightCap, ...weatherCaps(weather)])` is the only path; `toPoolRules` returns `[]` for a rule whose only ask is a cap, asserted by its own test

## `weather-filters.md` acceptance criteria

- [x] 1. `GET /api/weather` returns the normalised shape above in dev (Vite plugin) and in the Worker, with no change to `server/vite-plugin.ts`.
      - seen in dev against real Open-Meteo and asserted in the Worker. `server/vite-plugin.ts` is untouched - `git diff` is empty for it
- [x] 2. `GET /api/weather?latitude=48.85` is a 400 and makes no upstream call **in the Worker with a warm edge entry present** (test 16), not only in `proxy.test.ts`.
      - the Worker test primes the edge, then asks with a query string: 400, and `calls.length` stays 1. Also 400 in dev, live
- [x] 3. Anything other than `GET` on `/api/weather` is a 405, and `weatherCacheKey` returns null for it.
      - 405 in dev, live, and `weatherCacheKey(null, postRequest)` is null
- [x] 4. The endpoint is edge-cached for 900 s under one constant key and costs the rate limiter 1.
      - `WEATHER_REFRESH_SECONDS = 900` is the TTL, the body's `refreshSeconds` and the Worker's cache seconds, all one constant; the key is `/api/weather/v1-12/richmond`; limiter charged exactly 1
- [x] 5. `observedAt` is a correct UTC instant on both sides of a DST boundary, proven by test 4.
      - `"2026-08-21T03:15"` at -14400 becomes `"2026-08-21T07:15:00.000Z"`
- [x] 6. A weather outage logs `at: "weather"` and answers with a body that names the forecast service. Grepping `wrangler tail` output for `valhalla` during a weather-only outage returns nothing.
      - the real dev server printed `{"at":"weather","event":"upstream-unreachable","base":"http://127.0.0.1:9/forecast"}` and the body read "The forecast service is not answering." No line contained `valhalla`
- [x] 7. A slot with `precipitation_probability: null` is kept, with `precipChance === null`, and no rule reads it as 0.
      - 12 hours in, 12 out, that slot's field null; and `isWet` returns false on a null rather than reading it as zero, tested from both sides
- [x] 8. The panel shows a conditions line under the readout whenever a forecast exists, with the Open-Meteo attribution link beside it; "No forecast right now." only when there is no report at all; "Forecast is N min old." once the report passes three refresh windows.
      - all four states seen: headline plus credit, "No forecast right now." only with no report, "Forecast is 49 min old." past three windows, and the switched-off line
- [x] 9. The conditions line appears whether or not **Mind the weather** is on.
      - with the switch off the headline still read "99°F, feels 105°. Rain likely in 40 min" and no rule line was shown
- [x] 10. The result card shows a `.result-conditions` line and `.result-stats` is still three columns.
      - as a `conditions` `ResultLine` rather than a `.result-conditions` element - chunk 4's shared block already owns that slot and its key list already names `conditions`. `.result-stats` measured `106.885px 106.885px 106.885px`: still three columns
- [x] 11. `describeResult` includes the conditions clause when a pick has landed, and **no new live region is added** — the page still has exactly the `role="alert"` / `role="status"` elements it has today.
      - "Shockoe Bottom, 26 min out and back, 1.0 mi, 27 ft of climb, 84°F, feels 86°. UV 9." Exactly three `role="status"` regions, zero `aria-live`, no new region
- [x] 12. **Mind the weather** is a third `<Switch>` in Filters, defaults on, plays `playThock` with the next boolean, and is **not** changed by **Clear filters**. `activeFilters` is unchanged.
      - third in `.switch-row`, defaults on, `playThock(!props.weatherAware)`, untouched by `clearFilters` (tested). `activeFilters` excludes weather - it was counting it until the drawer read "FILTERS (2 ACTIVE)" on screen
- [x] 13. Every visible rule line names the budget the map is actually drawn at: with rain at 40 min and dusk at 25 min on a 50-minute round trip, the contour is at 20 and every warn line says 20. No line shows a negative number for any onset.
      - rain at 40 and heat at 30 on a 50-minute round trip: the contour is at 30 and **both** warn lines say "Trimmed to 30 min". Rain three minutes out clamps to the dial minimum and no line shows a `-`. The dusk half of the spec's example is superseded - see the corrections
- [x] 14. With rain 40 minutes out and a 50-minute round trip, the map contour visibly shrinks, the readout's minutes and area follow it, and a `.notice.is-warn` names the cap. The dial thumb does not move and the camera does not re-frame.
      - 0.7 sq mi within 17 min, 17 places, contour visibly smaller, `.notice.is-warn` naming the cap, camera unmoved. The dial thumb **does** move, to 35, because chunk 5's landed `timeCap` clamps `budgetMinutes` and draws the dead zone - see the corrections
- [ ] 15. Leaving the tab open through a five-minute window shows the contour step in **once**, not five times, and no route warm-up is restarted more than once in that window.
      - NOT OBSERVED on screen: the clock stops while the document is hidden and a tab under automation is hidden, HUMAN-REVIEW 6.3. Asserted instead across twenty simulated minutes: exactly four steps, every gap exactly five minutes, monotonically down
- [x] 16. With an apparent temperature ≥ 103°F, no `hilly` place is in the pool and the reason is on screen.
      - the reason was on screen ("Heat index in the danger band. Flat routes only") and the rule excludes a measured `hilly` climb, asserted by test. Which specific dots were hilly was not read off the map
- [x] 17. No rule ever produces a pool smaller than `MIN_SURVIVORS` unless a *cap* did it; when a preference or veto is withdrawn, its warn line is absent **and** the withdrawal line is present, naming the kept count. Both halves are driven by the same `RuleOutcome` the App holds.
      - seen exactly: the `uv-shelter` warn line was **absent** and "Kept the 5 places that were left - some weather rules would have emptied the pool." was present. Both halves read the same `PoolReport.withdrawn`
- [x] 18. When a cap empties the pool, the empty notice offers **Ignore the weather**, and pressing it restores the full uncapped pool immediately with no refetch.
      - "Nothing to spin inside 10 min. The weather trimmed your 50 min..." with **Ignore the weather (4 back)**; pressing it restored the dial to 50 and the pool to exactly 4, with no request
- [x] 19. `gzip -c dist/assets/index-*.js | wc -c` grows by no more than 4,096 bytes (4,700 if this branch also writes `src/app/clock.ts`) against the pre-branch build. The absolute figure is recorded in the PR. The 64 KB headline is *not* claimed, because the pre-branch build is already 71,188 bytes and README line 91 is corrected to say so.
      - 81,012 to **82,262**, **+1,250 B**, under a third of the line
- [x] 20. Killing the network makes the conditions line read "No forecast right now." and changes nothing else: the Spin button's enabled state, the grace timer and the reel are identical.
      - with the upstream dead: "No forecast right now.", pool 26 unfiltered, Spin enabled, no console output
- [x] 21. Starting a spin and letting a forecast refresh land mid-throw does not abort the spin.
      - pushed a 105°F report mid-reel: the reel kept turning, the panel kept the pre-throw conditions, and the new one applied on landing. The release now repaints - it did not, and the report sat invisible until something else re-rendered
- [x] 22. `npm run typecheck`, `npm run lint` (eslint + oxlint anti-slop + knip) and `npm test` are all clean, with every `as` carrying a `SAFETY:` comment and every parsed field narrowed through `src/lib/json.ts` — including `is_day`, which is narrowed with `isFiniteNumber` and coerced, never asserted.
      - all clean. No `as` was added anywhere in this chunk, so there is none to carry a `SAFETY:` comment; `is_day` goes through `isFiniteNumber` and `=== 1`
- [x] 23. `WEATHER_URL` appears in `wrangler.toml`, `.env.example`, `ProxyEnv` and the `loadEnv` destructure in `vite.config.ts`, and is resolved with `||` so an unset key falls back to the default rather than to `""`.
      - all four, and `server/proxy.ts:501` reads `env.WEATHER_URL || DEFAULT_WEATHER_URL`

## How the non-mechanical boxes were observed

Every browser observation above was made against `npm run dev` at `localhost:5173`, with the real
Valhalla instance behind it, in Chrome, on 2026-08-21.

**The forecast states were injected, not waited for.** `walkRouletteDev.weather(wire)` exists in dev
builds only - inside the same `import.meta.env.DEV` branch as chunk 5's `clockOffset`, which Vite
folds to `false` and drops from a production bundle. It takes the wire shape `/api/weather` answers
and pushes it through `readReport`, so what reaches the screen has crossed the same boundary a real
forecast crosses. Rain forty minutes out, a heat index in the NWS Danger band, a UV of nine and a
report fifty minutes stale are not things Richmond supplies on request.

**The two boxes left open are environmental, not defects.** `prefers-reduced-motion` cannot be
emulated from here (HUMAN-REVIEW 5.1) and nothing this chunk adds animates. The five-minute ratchet
window cannot be watched because the clock deliberately stops while the document is hidden, and a
tab being driven by automation counts as hidden (HUMAN-REVIEW 6.3); the property is asserted over
twenty simulated minutes instead.

**Two bugs were found by looking at the screen and would not have been found by any test written
first**, both fixed and both now covered:

1. **The rain cap ate its own window.** The cap lowered `budgetMinutes`, the shorter window no longer
   contained the onset, the rule stopped firing, the cap lifted, and the next render started over.
   Seen as a dial sitting at 35 with no rule beside it to explain why. The window is
   `requestedBudgetMinutes` now - the walk the reader asked for, which a cap cannot move.
2. **A forecast landing mid-throw stayed invisible after the reel stopped.** `holdWeather(false)`
   released the stash inside an effect and nothing repainted, so the report sat unread until
   something unrelated re-rendered. `holdWeather` returns whether it applied one, and App bumps.

A third came from reading the drawer rather than the code: it said **FILTERS (2 ACTIVE)** with two
weather rules firing, which criterion 12 forbids - that number counts what **Clear filters** clears,
and that button does not touch the weather switch.

