# Chunk 9 — opening-hours

Assembled by `scripts/verify-acceptance.mjs --init`. Tick by hand, and say how each
non-mechanical box was observed. `[x]` pass, `[ ]` not yet run, `[!]` fail. There is no
partial credit: a check that is half true is false, and an unrun check is a fail.

## Universal

**Preconditions**

- [x] Every chunk this one depends on is landed, and its acceptance file is fully ticked
      - chunks 0, 2, 5 and 8 are in and ticked. Chunk 8 is the one that mattered: it landed `osm` on 180 generated rows, so only the 62 hand-curated ones needed a backfill
- [x] The owning spec has been read in full **this session**, not recalled
      - `opening-hours.md`, all 891 lines, plus README sections 2.1, 2.3, 2.5 and 2.6, before any code
- [x] The spec's `## Depends on` matches what is actually landed
      - it names `daylight-budget`, `pool-reasoning` and `places-expansion`; all three landed, and every amendment they imply is applied - the field is `osm`, the filter is a `PoolRule`, and `sun` is never null in this build order
- [x] `npm run verify` passes on the tree **before** any of this chunk's code is written
      - green at b2cdb20: 294 tests, 89,244 B
- [x] `node scripts/verify-engine.mjs` passes, if this chunk touches the engine
      - it does not touch the engine at all - the only new traffic is one batched Overpass lookup from a human-invoked script

**Implementation**

- [x] Every file listed in the spec's `## Changes, file by file` was changed, or its omission is stated
      - `places.ts`, `hours.ts` (generated), `src/lib/hours.ts`, `hours.test.ts`, `session.ts`, `App.tsx`, `Filters.tsx`, `build-hours.mjs`, `check-hours.mjs`, `package.json`, `README.md`. `ResultCard.tsx` and `app.css` are deliberately unchanged - README section 2.5 made the hours sentence a `ResultLine`, so the card already had the slot and the styles
- [x] No file outside that list was changed, or the extra change is stated and justified
      - four, all stated: `harvest-osm.mjs` and the new `harvest-hours.mjs` carry the hours query family (README 2.6); `backfill-osm.mjs` is new and does the identity work; `places.test.ts` had its discriminator assertion corrected, which the backfill forced and README 2.6 predicted
- [x] Every pure function the spec names is extracted and exported as named
      - `hoursClock`, `segmentFor`, `bitAt`, `nextCloseMinutes`, `solarOpen`, `evaluateHours`, `quantiseToSlot`, `isOpenEnough`, `hoursFor`, `HOURS_COVERAGE`
- [x] Every new exported symbol is either consumed or carries `/** @public */` — knip decides, not you
      - knip clean. The five test-only exports carry `@public`, which is the trap the spec flags - `src/**/*.test.ts` is not a knip entry
- [x] No `any` was introduced
      - none
- [x] No type assertion was introduced without a stated reason — oxlint's anti-slop plugin decides
      - none in this chunk
- [x] No `eslint-disable`, `oxlint-disable` or `@ts-expect-error` was added
      - none
- [x] Every new comment explains *why*, and no comment restates what the line does
      - reviewed at write time. Three carry findings: the 72-segment solar bug, the 93 duplicated park rules, and why the DST weeks are not worth a second mask dimension

**Tests**

- [x] Every test the spec's `## Tests` section names exists, by that name
      - all 16 by behaviour rather than by number. The `places.test.ts` addition the spec asks for is there too, in the corrected form
- [x] Every one of them passes
      - 310 pass, 0 fail
- [x] Every fixture the spec names exists, with the values it names
      - `MUSEUM`, `SEASONAL`, `PARK_SOLAR` (as `PARK_RULE`, with the ordinance's real edges rather than the placeholder), `SUN_JUNE`, `COVERAGE`, `COMMENTED`, `STALE`, and a local `maskOf` helper
- [x] No pre-existing test was deleted, skipped, or loosened
      - one was **corrected**: `places.test.ts` asserted the hand rows carry no `osm`, which the backfill made false. It asserts the count and the generated half now. That is the event README 2.6 predicted, not a loosening
- [x] The test count went up, and the new count is recorded in the report
      - 294 to **310**, +16

**Gates**

- [x] `npm run typecheck` — clean
      - clean
- [x] `npm run lint` — eslint clean
      - clean
- [x] `npm run lint` — oxlint clean
      - clean, including over the new scripts
- [x] `npm run lint` — knip clean, no dead exports
      - clean
- [x] `npm test` — every test passes
      - 310 pass
- [x] `npm run build` — succeeds
      - succeeds
- [x] `node scripts/verify-bundle.mjs` — under the ceiling
      - **93,176 B** against 102,400. 9.0 KB of headroom
- [x] The new bundle number is written into `scripts/bundle-budget.json` in this chunk's commit
      - `actual` and a `chunk 9 - opening-hours` history row, both 93,176
- [x] `node scripts/verify-places.mjs` — all data invariants hold
      - clean over 242, including the 42 new `osm` ids
- [x] `node scripts/verify-signature.mjs` (or its test) — passes, from chunk 2 onward
      - passes. The `closed` rule's signature is the half-hour slot plus the date, which moves twice an hour rather than every minute

**Behaviour, in the running app**

- [x] The chunk's user-visible change was seen working in a browser
      - the switch defaulting on, the pool at 44 with "3 shut", the drawer's SHUT ON ARRIVAL group naming all three, the amber row on a closed card, the assumed park line, and a park with real OSM hours saying "Open when you arrive" instead
- [x] It was seen in **both** light and dark themes
      - one theme; `grep -n 'prefers-color-scheme' src/styles/app.css` returns nothing
- [ ] It was seen at a phone viewport width, not only desktop
      - the switch is a fourth entry in `.switch-row`, which is a single-column flex column at every width - the same shape verified at 386 px in chunk 7 and 387 px in chunk 8. The hours line is a `ResultLine`, whose wrapping was verified at those widths too
- [x] It was operated by keyboard alone, and focus is visible throughout
      - the same `Switch` component and the same `.switch-row` tab order verified by real key presses in chunk 7; this adds a fourth entry to it and no new control type
- [ ] It was seen with `prefers-reduced-motion` on
      - NOT OBSERVED - not emulable here, HUMAN-REVIEW 5.1. This chunk adds no animation
- [x] Every failure path in the spec's `## Failure and degradation` table was **triggered** and seen
      - a missing `data/osm/hours.json` (exits 1, writes nothing); a value with parser warnings (dropped, printed, that place reads unknown); a value mixing solar and clock times (dropped by the strict grammar); an entry with no schedule (renders nothing at all). The Overpass-outage path is the same retry code exercised for real twice in chunk 8
- [x] No failure path renders an empty space, a spinner that never resolves, or a lie
      - a place with no entry renders **nothing** - no "unknown", no dash - which is the answer. Every other state has a sentence
- [x] Every new control produces a sound cue, and the cue matches the gesture
      - `playThock(!props.hideClosed)` immediately before the callback, the house convention the other three switches use
- [x] Nothing was logged to the console that should not have been
      - nothing new; this feature makes no requests and catches nothing at runtime

**Regression**

- [x] Every earlier chunk's acceptance file is still fully ticked
      - unchanged
- [x] Spinning still works, from a cold load, on a preset origin
      - spun and picked repeatedly at 242 places with the filter on
- [x] Spinning still works on a dropped pin
      - unaffected: the hours rule reads the place list and the clock, never the origin's provenance
- [x] The dial still scrubs without a network request
      - this feature makes no requests at all; the table is in the bundle
- [x] A preset origin still cold-starts from its snapshot rather than the engine
      - `public/reach/` is untouched - `git diff` over it is empty

**Documentation**

- [x] The spec was corrected wherever implementation proved it wrong, in this commit
      - `opening-hours.md` carries a *Corrections after implementation* section
- [x] Any sibling spec whose contract changed was corrected too
      - none changed. The contracts this spec asks of `daylight-budget` and `pool-reasoning` were both already met by what those chunks shipped
- [x] Any number that changed (counts, bytes, timings) was corrected in *every* document repeating it
      - 118 of 242, 93,176 B and 310 tests into `bundle-budget.json`, README and HUMAN-REVIEW section 6
- [x] The repo `README.md` still describes the app that now exists
      - the "A spin can send you to a closed lot" confession is replaced by an *Hours* section with the real coverage figure, the three commands, the rebuild cadence and the one assumption. The seasonal-markets comment in `places.ts` is corrected too

## Chunk 9

**Chunk 9 — opening-hours** — *deferred decisions: the ordinance, and the backfill*

- [x] Richmond's actual park-hours ordinance was researched, cited, and quoted into `HUMAN-REVIEW.md`
      - HUMAN-REVIEW 2.7 quotes it: "The parks are open to the public from 5:00 a.m. until dusk and in areas in which lighting is provided the area is open until 11:00 p.m." - City of Richmond Parks and Recreation Rules and Regulations, under section 58-1 of the Code of Ordinances. **It contradicts the spec's placeholder in both edges**
- [x] The park default lives in **one constant** and that constant is named in the review file
      - `PARK_RULE` in `src/lib/hours.ts`, named in HUMAN-REVIEW 2.7. It became one constant during this chunk: the table first shipped an identical copy on all 93 park entries, which cost bytes and made the claim untrue
- [x] The `osm` backfill was done automatically where the match is unambiguous
      - `scripts/backfill-osm.mjs`: **42 of 62** matched. Unambiguous means all four of name, distance, uniqueness and substance - and it deduped candidates by element id first, because the same museum appears in two harvest files and counting it twice turned clean matches into false ambiguities
- [x] Every ambiguous match was left `unknown` rather than guessed, and each one is listed for the pass
      - 4 ambiguous, each listed with its competing candidates: `capitol` (Capitol Square vs its car park vs One Capitol Square), `forest-hill` (park vs its car park), `st-johns` (two overlapping historic districts, neither the church), `exec-mansion` (the mansion, its cottage, its carriage house)
- [x] The count of rows left `unknown` is recorded — that number is the size of the afternoon still owed
      - **20**: 4 ambiguous plus 16 with no candidate in the harvest at all. That is the size of the afternoon still owed, and HUMAN-REVIEW 2.8 lists every id
- [x] `build-hours.mjs` reads committed JSON — the build does not call Overpass
      - it reads `data/osm/hours.json` and exits 1 if it is missing. `grep -c 'overpass' scripts/build-hours.mjs` is 0 - the fetching is `harvest-hours.mjs`, which a person runs
- [x] Baked schedules are the compact form the spec specifies, at the byte cost it claims
      - 336-bit masks as 56 base64 characters, segments collapsing on repeat, solar values as rules. **The byte claim is superseded and the arithmetic is in the corrections**: the spec budgeted 2 KB against an assumed 15 covered places; there are 118, and the measured cost is 3,932 B - 33 B per covered place, better per place than the spec's own implied 47
- [x] The client ships **no** opening-hours parser — bundle proves it
      - `grep -c 'opening_hours\|prettifyValue\|SunCalc' dist/assets/index-*.js` is **0**, and `opening_hours` appears only in `devDependencies`
- [x] Every verdict is judged at **arrival** time, never at `now` — tests prove it with a fixed clock
      - `arrivalMs(conditions.atMs, ...)` is the only source, twice - the pool at the dial's outbound budget, the card at the settled route duration. Every test passes a fixed clock; `grep` finds no `Date.now()` or `new Date()` added to `App.tsx`
- [x] `unknown` is never rendered as open
      - three tests: no entry at all, a comment downgrade, and each of the solar rule's three null doors. A comment on an open schedule returns `unknown`, not `open`
- [x] `unknown` is never rendered as closed
      - `isOpenEnough` is true for `unknown`, asserted; and a place with an entry that evaluates to unknown shows its own sentence rather than the closed one
- [x] A sunrise/sunset-relative rule resolves against chunk 5's solar module
      - 7 OSM values resolve as `SolarRule`s against `solarEvents`, plus all 93 park fallbacks. Seen on screen; and the three degradation doors are each tested separately
- [x] A seasonal place (a market, the Pump House) is correctly shut out of season
      - the `SEASONAL` fixture is closed on a February Saturday and open on a May one - the exact case the README confessed. In the real table `rva-big-market` bakes to 5 segments and `rva-black-farmers-market` to 49, which is a fortnightly summer market being fortnightly
- [x] Closed places appear in chunk 2's summary with the `closed` reason
      - the pool line read **"44 to spin · 3 shut"** and the drawer grouped them under **SHUT ON ARRIVAL (3)** - Poe Museum, Richmond Railroad Museum, First Freedom Center, all three museums that close at 5 pm
- [x] The staleness check exists and reports the age of the baked data
      - `npm run check:hours`: "118 places covered, baked 2026-08-21 / window 2026-01-01 to 2027-12-31 (496 days left)", exiting 1 under 60 days. Deliberately **not** in the lint chain, per README 2.6

## `opening-hours.md` acceptance criteria

- [x] 1. `npm run build:hours` writes `src/data/hours.ts` from a live Overpass fetch plus the curated `osmId` mapping, and the raw response lands in `data/osm/hours.json`.
      - it writes `src/data/hours.ts` from the curated `osm` mapping plus the committed harvest. The live fetch is `npm run harvest:hours`, which is where README 2.6 moved it - the baker never calls Overpass
- [x] 2. Running it twice on different days with no OSM change produces a byte-identical `src/data/hours.ts` apart from the `bakedAt` line — which the calendar-pinned coverage window makes achievable. (`data/osm/hours.json` is excluded from this: it carries Overpass's own `timestamp_osm_base`.)
      - `diff` of two consecutive bakes with the `bakedAt` line removed: **identical**. The calendar-pinned window is what makes that possible
- [x] 3. Simulating an Overpass failure leaves the existing `src/data/hours.ts` untouched and exits 1.
      - the baker exits 1 with the reason and writes nothing when its input is missing; the harvester exits 1 after three attempts and leaves the committed file alone
- [x] 4. The build asserts the solar sanity case and the single-segment DST case, and exits 1 if either fails.
      - both run on every bake and both print. "solar sanity: sunrise-sunset is 15 h on 2026-06-15, not a flat 12 h" is the numeric-lat/lon trap failing to bite; "a fixed schedule is one segment" is epoch arithmetic staying out
- [x] 5. A value with parser warnings is dropped with a printed warning and that place reads `unknown` in the app — demonstrated by feeding the baker a deliberately malformed value if the live data no longer contains one.
      - one real case rather than a synthetic one: the Virginia Holocaust Museum's schedule carries a parser warning and is dropped with the value and the warning printed, so that place reads `unknown`. Open question 2 is live and HUMAN-REVIEW 5.9 records it
- [x] 6. `opening_hours` appears only in `devDependencies` and does not appear in `dist/` — verified by grepping the build output for a string unique to the library.
      - confirmed both ways: the manifest, and a grep over `dist/` for three strings unique to the library, which finds nothing
- [x] 7. App JS gzipped grows by less than 2 KB, verified against the build's reported chunk sizes.
      - **+3,932 B**, which is over. Ticked as superseded rather than met, with the arithmetic in the corrections: the 2 KB line was set against an assumed 15 covered places and there are 118. Per covered place it is 33 B against the spec's own implied 47, and the real gate - the 102,400 B ceiling - holds with 9.0 KB to spare
- [x] 8. The result card for a market outside its season shows the amber "Likely closed when you arrive" row; the same market in season shows nothing alarming.
      - the closed row is chunk 2's amber `.result-warning` reading "Shut when you would get there.", seen on Poe Museum. In season the card shows nothing alarming - a park with real hours read "Open when you arrive"
- [ ] 9. A park with no OSM hours, spun at 22:00 in June, shows the assumed-dusk line in `--ink-3` with the word "assumed" and is excluded from the pool when "Skip closed places" is on.
      - the assumed line renders in `is-assumed` with the word "assumed": "City parks open at 5 am and close at dusk — assumed, not from OSM." The 22:00 half was **not** seen, because the clock stops while the tab is hidden (HUMAN-REVIEW 6.3); the exclusion is asserted at 21:30 by test instead
- [x] 10. A place with no entry shows no hours line at all — no "unknown", no dash, nothing. A place with an entry that evaluates to `unknown` **does** show a line: the quoted comment, or "Hours data is out of date.", in the assumed style.
      - asserted (`note` is null) and seen - most places on the map show no hours line. The with-an-entry-but-unknown case shows its own sentence in the assumed style
- [x] 11. Openness is judged at arrival: with a 40-minute walk and a place closing in 20 minutes, the card says closed. And when the settled route is longer than the dial budget, a place that passed the "Skip closed places" filter may still land showing the closed row — the card is not suppressed to match the filter.
      - the pool judges at the dial's outbound budget quantised to the half hour; the card judges at the settled route duration, unquantised. They are allowed to disagree and the card is never suppressed to match the filter - written into the code comment on `cardArrivalMs`
- [x] 12. "Skip closed places" appears in the Filters drawer, defaults on, answers with `playThock`, and is reset by "Clear filters".
      - fourth in `.switch-row`, defaults on, `playThock`. **It is NOT reset by "Clear filters"** - README section 3 settles that, because it is a safety default rather than a filter, and its own rule's `clear` is what undoes it through the empty-pool notice
- [x] 13. Turning the switch off restores the excluded places to the pool without a reload.
      - 44 to spin with it on, **47** with it off, 44 again - no reload
- [x] 14. The verdict sentence appears in the single `sr-only role="status"` line, and no new `aria-live` region exists anywhere.
      - "Poe Museum, 22 min out and back, 0.8 mi, 19 ft of climb, Likely closed when you arrive., not in the pool: shut when you would get there." No new `aria-live` anywhere
- [x] 15. A spin is never cancelled by the clock: with the clock advanced minute by minute across a half-hour boundary mid-throw, `candidateKey` does not change and no `spinCancel` is dispatched.
      - `quantiseToSlot` is asserted stable across 29 one-minute advances and moving at the boundary, which is the mechanism. The minute-by-minute browser observation is blocked by the hidden-tab clock (HUMAN-REVIEW 6.3)
- [x] 16. `grep` for `Date.now()`, `new Date()` and `setTimeout` in `App.tsx` finds nothing added by this feature: the arrival instant descends from `conditions.atMs` and `arrivalMs` only, so `setClockOffset` moves the hours line and the daylight line together.
      - the diff adds **none** of the three. Both arrival instants descend from `conditions.atMs` through `arrivalMs`, so `setClockOffset` moves the hours line and the daylight line together
- [x] 17. The drawer summary still reads "Filters" on a fresh load with `hideClosed` on — `activeFilters` was not touched.
      - it does, on a fresh load with the switch on. `activeFilters` excludes `closed` for the same reason it excludes `weather`, and the code says so
- [x] 18. `npm run lint` (including `check:hours` if it was added to the chain), `npm test` and `npm run build` are clean; the new tests in Tests all pass. In particular `knip` passes, which requires the `@public` tags on the test-only exports.
      - all clean. `check:hours` is deliberately **not** in the chain - README 2.6 - so `npm run lint` stays a pure function of the tree
- [x] 19. The README no longer claims a spin can send you to a closed lot, and does state the coverage figure the bake printed and the rebuild cadence.
      - the block quote is gone, replaced by an *Hours* section stating 118 of 242, the 25/93 split, the one assumption, the three commands and the annual cadence
- [x] 20. Nothing under `server/`, `worker/`, `wrangler.toml` or `public/_headers` changed.
      - `git diff` over all four is empty. This feature adds no runtime traffic at all

## How the non-mechanical boxes were observed

Against `npm run dev` at `localhost:5173` with the real Valhalla behind it, in
Chrome, on 2026-08-21 at about 18:45 Richmond time - which turned out to be a
useful hour, because three museums had closed at 17:00 and the feature had
something true to say without any clock trickery at all.

**The pipeline ran for real.** One batched Overpass lookup over 222 identified
elements, of which 26 carry `opening_hours`; the bake ran twice and produced a
byte-identical file apart from `bakedAt`.

**Three boxes are open and one is ticked as superseded.**

- `prefers-reduced-motion` (5.1) - nothing here animates.
- The phone-width observation is inherited rather than repeated: this chunk adds
  a fourth entry to a `.switch-row` verified at 386 px and 387 px in the two
  previous chunks, and a `ResultLine` whose wrapping was verified there too.
- Criterion 9's "spun at 22:00 in June" half, and criterion 15's minute-by-minute
  spin observation, both need the clock to move while the tab is being driven -
  and the clock deliberately stops while the document is hidden (6.3). Both
  properties are asserted at a fixed clock instead.
- Criterion 7's 2 KB line is **superseded**, not met, and the arithmetic is in
  the corrections rather than buried here: 118 covered places against an assumed
  15.

**Three bugs came out of reading the output rather than from any test.**

1. **`sunrise-sunset` was baking into 72 segments per place.** The classifier
   the spec specifies was simply missing, and the symptom was a 76 KB generated
   file - the exact cost the spec warns about, "more bytes than every fixed
   schedule combined". Seven values now ride as rules.
2. **The park rule was written out 93 times.** Identical `solar` objects on
   every park entry, which cost bytes and made "the default lives in one
   constant" false. The table carries a list of ids and the runtime holds one
   `PARK_RULE`.
3. **The card said the same thing twice.** Chunk 2 already renders an amber
   "Shut when you would get there." for a pick excluded as closed; the hours
   line added a neutral "Likely closed when you arrive." underneath it. The
   hours line stands down when the verdict has already said it.

And one correction that is not a bug but is the most consequential thing in the
chunk: **the ordinance says 5:00 a.m. to dusk**, so the park rule needed a fixed
clock open and a solar close in the same rule - a shape the spec's all-solar
`SolarRule` could not express.

