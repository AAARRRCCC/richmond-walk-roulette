# Goal: ship v0.5, one verified chunk at a time

**Status:** the instruction. Not a spec.
**Reads:** `docs/plans/README.md` §4 (build order) is the authority on what each chunk contains.
Each chunk's own spec is the authority on how.

## Resuming: read these three things first

This run is partly done. **Do not start a chunk before reading:**

1. **`docs/plans/PROGRESS.md`, last entry.** Where it stopped, what landed, and what the next chunk's
   preconditions are. Step 6's checklist at the bottom of this file names the commit for every chunk
   that is in.
2. **`docs/plans/HUMAN-REVIEW.md` §2 and §6.** Decisions already made that constrain what you do next
   — the bundle ceiling, the `dev:lan` refusal, the one-way elevation chart, and §6.1, which is the
   one that costs money if it is read late (see chunk 8's checklist).
3. **`docs/plans/acceptance/chunk-*.md`.** Every open box is open for a stated reason. Do not re-open
   settled ones or re-verify what is already ticked.

**The engine has to be running before anything.** `npm run verify` includes `verify-places`, which
makes a live `/locate` call for all 73 coordinates, so with Valhalla down *every gate in this document
fails for a reason that has nothing to do with the code*. Check it first:

```
curl -s http://127.0.0.1:8002/status      # expect a version and a tileset date
```

If it is down: in WSL, `cd valhalla && ./scripts/run-engine.sh start`. The graph survives a reboot —
it is the one built with elevation on 2026-08-21, and rebuilding it is not required and not free.

## The objective

Implement all twelve chunks of v0.5 — chunk 0 through chunk 11 — in the order `docs/plans/README.md`
§4 gives, and do not begin a chunk until the previous one is **verified**, not merely written.

Verified means a machine said so. A chunk that typechecks in your head is not verified. A chunk whose
tests you wrote and did not run is not verified. A chunk you believe is fine because the diff looks
right is not verified. Every gate below is a command with an exit code, and the exit code is the
answer.

This document is deliberately strict about stopping. The plan is eleven features deep and most of the
failure modes are quiet ones — a stale snapshot, a churning memo key, a silently dropped layer, a
number that was wrong in a document before it was wrong in the code. Sequential verification is the
only thing standing between those and a v0.5 that nobody can debug.

## Non-negotiables

1. **Never proceed on red.** If a gate fails, fix it. If it cannot be fixed, the chunk is `BLOCKED`
   and it is logged — it is never carried forward "to fix later". There is no later; there is chunk 11
   with nine unexplained regressions.
2. **Never weaken a gate to pass it.** Do not delete a failing test, loosen a lint rule, add an
   `eslint-disable`, widen a type to `any`, or raise a byte budget in order to get green. This is the
   rule most likely to be quietly broken by an agent working alone against a clock, which is exactly
   why it is second. If a gate is genuinely wrong, change it — then log the change to
   `HUMAN-REVIEW.md` under **Gates I weakened**, which is the first section the final pass reads.
3. **The specs are not sacred, but they are not disposable either.** They were written against the
   real code and reviewed against it. If implementation shows a spec is wrong — and it will, several
   times — correct the spec file in the same commit as the code, and say what changed and why in the
   report. A spec that quietly diverges from the code is worse than no spec, which is the whole reason
   the 78-versus-62 count mattered.
4. **One chunk, one commit** (or one commit per coherent step within a chunk). Never a single commit
   spanning two chunks. Follow the repo's commit conventions; no attribution trailers of any kind.
5. **Do not stop for a human. There is nobody there.** This runs unattended, start to finish. Every
   decision that would once have blocked on a person is instead **decided provisionally, isolated so
   it is cheap to reverse, and logged** to `docs/plans/HUMAN-REVIEW.md`. See *Step 6*, which is the
   single human gate this plan has, and it is at the end.
6. **Report after every chunk** into `docs/plans/PROGRESS.md`, appended, never overwritten. Nobody is
   reading it live; it is the trail that makes the final pass possible, and it is the only way a
   decision made at chunk 3 is still explicable at chunk 11.
7. **Never let one blocked chunk end the run.** If a chunk cannot be finished and cannot be fixed,
   mark it `BLOCKED` with the reason, log it, and continue to the next chunk that does not depend on
   it. Skipping forward is allowed; skipping a dependency is not. Record every skip.

## Working unattended

The plan was written assuming someone was there to answer six questions. Nobody is. That changes the
method, not the standard.

**Every deferred decision gets three things:** a provisional answer, a reason, and an escape hatch.

- **The provisional answer** is the conservative branch — the one that is wrong in the cheap direction.
  When in doubt, choose the option that shows less, claims less, and disables rather than enables.
- **The reason** goes in `HUMAN-REVIEW.md` with enough context that it can be judged cold, months
  later, by someone who was not here.
- **The escape hatch** is structural. A deferred decision must live behind **one constant, one file, or
  one flag**, so reversing it is an edit and not an excavation. If implementing a decision would spread
  it across nine files, that is the signal to isolate it first and implement second.

**Irreversibility is the one thing that still deserves fear.** Two acts in this plan cannot be undone
by editing a constant:

- **The graph rebuild (chunk 1).** Already proven necessary — the current instance returns `null`
  heights and `-500.0` route elevations — so it is pre-authorised and needs no permission. But back up
  the current tileset and all eleven `public/reach/*.json` snapshots to a timestamped directory before
  touching either, so "regenerate the snapshots" stays reversible even though the graph does not.
- **Committing generated place data (chunk 8).** Generated rows land as an append-only suffix in their
  own committed file, never interleaved with the hand-curated 62, so pruning them later is deleting a
  range rather than untangling a merge.

Everything else in the plan is a constant, a rule, or a line of copy, and all three are cheap.

**Do not lower the standard because nobody is watching.** The temptation of an unattended run is to
tick a box that is probably fine. A `[ ]` left unticked and logged is a good outcome. A `[x]` that was
not observed is the one thing that makes this whole document worthless.

## How verification is graded

**Every check in this document is a proposition that is true or false.** Not a score, not a rating,
not a percentage of doneness, not a confidence level. You tick a box or you do not, and a box you
cannot honestly tick is a failure with a name attached.

This is a deliberate constraint on the grader, and the reason is worth stating plainly: an LLM asked
"is this true?" is reliable, and an LLM asked "rate this 1–10" produces a number that feels
authoritative and means nothing. A 7/10 on "code quality" cannot be acted on, cannot be regressed
against, and cannot be wrong in a way anyone will notice. "The `climb` rule appears in the pool
summary when it removes a place" can be all three.

The rules:

- **Three states only: `[x]` pass, `[ ]` not yet run, `[!]` fail.** There is no partial credit and no
  "mostly". A check that is half true is false.
- **Never invent a scale.** No "quality: good", no "readiness: 8/10", no "90% complete", no
  "high confidence". If you want to express doubt, write another binary check that would resolve it.
- **Numbers are measurements, not verdicts.** Bundle bytes, drift percentage, test counts and timings
  are all recorded as numbers — that is how they get compared across chunks. But the number always
  feeds a threshold, and the threshold produces the binary. `bundle = 71.4 KB` is a measurement;
  `[x] bundle under the 96 KB ceiling` is the check.
- **Unknown is a fail, not a pass.** An unrun check is `[ ]`, and a chunk with a `[ ]` is not done.
  Do not tick a box because it is probably fine.
- **Each check names one observable thing.** If a check needs the word "and", it is two checks. If it
  cannot be resolved without a judgement call, rewrite it until it can, or defer it to *Step 6* —
  that pass exists precisely for the questions that are not binary.
- **A check that passes vacuously is a fail.** "No test fails" passes when there are no tests. Prefer
  checks that would notice absence: "the spec's named tests all exist, and all pass."

## Step 1: build the verification harness first

Before chunk 0. Nothing in the plan is verifiable at the moment — there is no single command that
answers "is the repo healthy", no way to detect a stale snapshot, and no guard on the byte budget the
plan spends against in every chunk. Build these first, commit them as their own step, and use them
from then on.

Each is small. None should sprawl. They live in `scripts/`, are plain `.mjs` like `build-reach.mjs`,
take `--json` for machine output, and exit non-zero on failure.

### `npm run verify` — the gate

One script, `scripts/verify.mjs`, running in this order and stopping at the first failure:

```
npm run typecheck     # tsc --noEmit
npm run lint          # eslint + oxlint + knip, all three
npm test              # node --test
npm run build         # the real build, because tsc --noEmit misses bundler-only failures
node scripts/verify-bundle.mjs
node scripts/verify-places.mjs
```

This is the command every chunk gate runs. Add it to `package.json` as `"verify"`.

### `scripts/verify-engine.mjs` — what the engine can actually do

Probes the configured `VALHALLA_URL` and reports capability rather than availability, because
"answers `/status`" and "can serve this app" are different claims. It must check:

- `/status` — reachable, version, `tileset_last_modified`, and the age of that tileset in days.
- **Elevation is real, not merely advertised.** `available_actions` lists `height` on an instance with
  no elevation data whatsoever. Post a three-point `/height` with `range=true` and fail if any height
  is `null`; post a short `/route` with `elevation_interval` and fail if the `elevation` array is all
  `-500.0`. This exact check, run by hand, is what proved chunk 1's graph rebuild is genuinely
  required — it must not be a thing anyone has to remember to do by hand again.
- `max_contours` — request a ladder wider than 4 and confirm the instance answers it, so a
  `VALHALLA_MAX_CONTOURS=100` that the instance does not honour is caught here rather than as a slow
  warm-up in the browser.
- Walking speed round-trip: a fixed short route at `3.69` km/h, asserting the returned duration
  against a committed expected value, so a costing change is loud.

Run it at the start of every chunk that touches the engine, and in `LAUNCH.md`'s checklist.

### `scripts/verify-drift.mjs` — is a snapshot still true?

The plan's quietest failure: `public/reach/*.json` are precomputed contour ladders, nothing detects a
stale one, and chunk 1 changes the graph underneath all eleven of them. For each snapshot, re-request
a sample of rungs from the live engine and compare against the committed file. Report per-origin and
worst-case **area delta as a percentage**, and the count of places whose membership flips — membership
is what the app actually consumes, so an area that moved 0.4% while three places changed sides is the
interesting case, not the reassuring one.

Takes `--threshold` (default 1%, the figure chunk 1 names) and exits non-zero above it. Do not sample
so few rungs that it cannot see drift; do not re-request all 96 × 11 by default. Make the sample
explicit and state it in the output.

### `scripts/verify-bundle.mjs` — the 64 KB line

Builds (or reads `dist/`), sums the gzipped size of the app's own JS excluding MapLibre, and compares
against a committed budget file (`scripts/bundle-budget.json`) holding the current number and the
plan's ceiling. Prints the delta since the last recorded value. Fails when the ceiling is crossed.

The plan spends bytes in nearly every chunk and the per-chunk estimates in README §5 are estimates.
This is how an estimate becomes a fact. After each chunk, record the new actual in the budget file as
part of that chunk's commit, so the table in README §5 can be corrected from measurements at the end.

### `scripts/verify-places.mjs` — the data invariants

Written specifically because a place count was wrong in three documents at once and nobody noticed
until it was measured. Parses `src/data/places.ts` **by importing it**, never by regex — the regex
that skipped `pyramid`, the one multiline entry, is exactly the bug this prevents. Asserts:

- Every `id` unique, across `PLACES` and `PRESET_ORIGINS` separately.
- Every coordinate inside the proxy's `BOUNDS`, which chunk 0 extracts to `src/lib/bounds.ts` — import
  it rather than restating the box, so there is one bounding box in the repo.
- Every place routable: it snaps to a walkable edge within a sane distance via Valhalla `/locate`.
  This is the automated form of the repo's entrance-not-centroid rule, and it becomes load-bearing at
  chunk 8 when places stop being hand-picked.
- `PLACES.length` printed on every run, and asserted against `HAND_CURATED_COUNT` once chunk 8
  introduces it.
- After chunk 8: name length under `NAME_MAX` for generated rows, and no generated row within a few
  metres of a hand-curated one.

### `scripts/verify-acceptance.mjs` — the checklist

Every spec ends in a numbered **Acceptance criteria** list. Extract them per chunk into
`docs/plans/acceptance/<chunk>.md` as an unticked checklist, and refuse to consider a chunk done while
an item is unticked. Ticking is manual and honest: a criterion that says "observable in the browser"
gets ticked by someone observing it, and the report says how it was observed. A criterion that cannot
be observed is a defect in the spec — fix the spec.

### `scripts/verify-signature.mjs` — the plan's biggest risk, made testable

README names it: `pool-reasoning`'s memo requires every contributing feature to supply a `signature`
that changes exactly when its verdicts could and **never per render**. A sibling getting this wrong
churns `candidateKey`, fires the spin-abort effect, and makes spinning impossible with no error
anywhere.

That is not something to hope about. From chunk 2 onward, this harness derives the candidate set twice
from identical inputs and asserts byte-identical signatures and keys, and derives it across a
simulated dial scrub asserting the key changes only on the transitions it should. Every chunk from 2 to
11 that adds a reason must add its case here. This is a test file, not a script, if it fits the
`node --test` suites better — the requirement is that it exists and runs in `npm test`, not where it
lives.

**Build anything else you find yourself wanting.** If you catch yourself checking something by hand
twice, that is a tool. Write it, commit it, and say so in the report.

## Step 2: the per-chunk loop

For each chunk in order, 0 through 11:

1. **Read.** The chunk's entry in README §4, then the owning spec in full — including its
   `## Depends on`, `## Failure and degradation`, `## Tests` and `## Acceptance criteria`. Read the
   spec every time; do not work from memory of it.
2. **Check the preconditions.** Everything the chunk depends on is landed and green. Engine capability
   probed if the chunk touches the engine.
3. **Implement**, following the spec's `## Changes, file by file`. Extract the pure functions the spec
   names — they exist so behaviour can be asserted rather than eyeballed, which is the house pattern
   `src/app/reel.ts` established.
4. **Write the spec's named tests**, all of them, with the fixtures they name. A spec test you skipped
   is a gate you removed.
5. **Run the gates** (below). All of them, every chunk, not just the ones you think are relevant —
   the point of a regression gate is that it fires where you were not looking.
6. **Tick the acceptance criteria**, honestly, recording how each was observed.
7. **Correct the spec** if implementation proved it wrong. Same commit.
8. **Commit**, then **report**, then stop for a beat before the next chunk.

## Step 3: the checklists

Copy the universal checklist into `docs/plans/acceptance/<chunk>.md` at the start of every chunk,
append that chunk's specific checklist, then append the spec's own numbered acceptance criteria
rewritten as binary checks. Tick as you go. The file is the chunk's record and it is committed.

### The universal checklist — every chunk, no exceptions

**Preconditions**

- [ ] Every chunk this one depends on is landed, and its acceptance file is fully ticked
- [ ] The owning spec has been read in full **this session**, not recalled
- [ ] The spec's `## Depends on` matches what is actually landed
- [ ] `npm run verify` passes on the tree **before** any of this chunk's code is written
- [ ] `node scripts/verify-engine.mjs` passes, if this chunk touches the engine

**Implementation**

- [ ] Every file listed in the spec's `## Changes, file by file` was changed, or its omission is stated
- [ ] No file outside that list was changed, or the extra change is stated and justified
- [ ] Every pure function the spec names is extracted and exported as named
- [ ] Every new exported symbol is either consumed or carries `/** @public */` — knip decides, not you
- [ ] No `any` was introduced
- [ ] No type assertion was introduced without a stated reason — oxlint's anti-slop plugin decides
- [ ] No `eslint-disable`, `oxlint-disable` or `@ts-expect-error` was added
- [ ] Every new comment explains *why*, and no comment restates what the line does

**Tests**

- [ ] Every test the spec's `## Tests` section names exists, by that name
- [ ] Every one of them passes
- [ ] Every fixture the spec names exists, with the values it names
- [ ] No pre-existing test was deleted, skipped, or loosened
- [ ] The test count went up, and the new count is recorded in the report

**Gates**

- [ ] `npm run typecheck` — clean
- [ ] `npm run lint` — eslint clean
- [ ] `npm run lint` — oxlint clean
- [ ] `npm run lint` — knip clean, no dead exports
- [ ] `npm test` — every test passes
- [ ] `npm run build` — succeeds
- [ ] `node scripts/verify-bundle.mjs` — under the ceiling
- [ ] The new bundle number is written into `scripts/bundle-budget.json` in this chunk's commit
- [ ] `node scripts/verify-places.mjs` — all data invariants hold
- [ ] `node scripts/verify-signature.mjs` (or its test) — passes, from chunk 2 onward

**Behaviour, in the running app**

- [ ] The chunk's user-visible change was seen working in a browser
- [ ] It was seen in **both** light and dark themes
- [ ] It was seen at a phone viewport width, not only desktop
- [ ] It was operated by keyboard alone, and focus is visible throughout
- [ ] It was seen with `prefers-reduced-motion` on
- [ ] Every failure path in the spec's `## Failure and degradation` table was **triggered** and seen
- [ ] No failure path renders an empty space, a spinner that never resolves, or a lie
- [ ] Every new control produces a sound cue, and the cue matches the gesture
- [ ] Nothing was logged to the console that should not have been

**Regression**

- [ ] Every earlier chunk's acceptance file is still fully ticked
- [ ] Spinning still works, from a cold load, on a preset origin
- [ ] Spinning still works on a dropped pin
- [ ] The dial still scrubs without a network request
- [ ] A preset origin still cold-starts from its snapshot rather than the engine

**Documentation**

- [ ] The spec was corrected wherever implementation proved it wrong, in this commit
- [ ] Any sibling spec whose contract changed was corrected too
- [ ] Any number that changed (counts, bytes, timings) was corrected in *every* document repeating it
- [ ] The repo `README.md` still describes the app that now exists

### Chunk-specific checklists

**Chunk 0 — foundations**

- [ ] `src/lib/bounds.ts` exists and `server/proxy.ts` imports its box rather than restating it
- [ ] There is exactly one bounding box in the repo — grep proves it
- [ ] `solar.ts`, `conditions.ts`, `useConditions.ts`, `daylight.ts`, `announce.ts` all exist
- [ ] Every one of them has tests that pass **before** anything imports it
- [ ] knip is clean with all of them unconsumed, via `/** @public */`
- [ ] The `CACHE_VERSION` / `ROUTE_CACHE_VERSION` split is in place
- [ ] The three USNO sunset fixtures assert to the minute
- [ ] Nothing user-visible changed — the app looks and behaves identically

**Chunk 1 — elevation on the wire** — *pre-authorised; back up before you begin*

- [ ] The current tileset is backed up to a timestamped directory
- [ ] All eleven `public/reach/*.json` are backed up alongside it
- [ ] `build_elevation=True` is set and `valhalla/README.md` records it
- [ ] The rebuild completed and the tileset timestamp moved
- [ ] `verify-engine` reports real heights from `/height` — **no nulls**
- [ ] `verify-engine` reports a route `elevation` array that is not all `-500.0`
- [ ] `verify-drift` ran against **all eleven** snapshots
- [ ] Worst-case area drift is recorded as a number in the report
- [ ] Place-membership flips are recorded as a number in the report
- [ ] Drift is under the 1% threshold — **or**, if over, the snapshots were regenerated and the
      decision was logged to `HUMAN-REVIEW.md` with the measured drift (regeneration is the
      conservative branch: a stale snapshot lies, a regenerated one only costs engine time)
- [ ] If snapshots were regenerated: all eleven were, and `verify-drift` is clean afterwards
- [ ] `WalkingRoute.profile` carries real data end to end
- [ ] `route-store` `SCHEMA_VERSION` was bumped, and a stale cached route is discarded not misread
- [ ] Nothing renders a profile yet — this chunk is data only

**Chunk 2 — pool-reasoning**

- [ ] `verify-signature` exists and passes
- [ ] Deriving candidates twice from identical inputs yields byte-identical keys
- [ ] A dial scrub changes `candidateKey` only on the transitions it should
- [ ] The pool summary line renders counts against today's three filters
- [ ] Every filter that removes a place is named in the summary
- [ ] The empty-pool notice names one fix and offers the control that applies it
- [ ] Pressing that control actually refills the pool
- [ ] The rule registry accepts a new rule without being edited — chunks 3, 6, 7, 8 plug in, not amend
- [ ] `clampBudget` is exported and has tests
- [ ] A later chunk requesting an amendment to this contract is treated as a defect **here**

**Chunk 3 — the profile chart**

- [ ] The chart renders for a flat walk without reading as dramatic terrain
- [ ] The chart renders for a steep walk (Shockoe → Libby Hill) and shows the climb
- [ ] Both were seen in light and dark themes — four observations, not two
- [ ] The text alternative states the same facts as the chart, and was read aloud or inspected
- [ ] The Climb stat matches the profile's total ascent
- [ ] `Terrain` and `Place.terrain` are gone from all 62 rows
- [ ] `Session.terrain` is now `climb` everywhere, including anything that persisted it
- [ ] The climb `PoolRule` is `deferred: true` and does not gate spinning before routes are measured
- [ ] The map hover dot tracks the chart, and the chart tracks the map
- [ ] A route with no elevation data degrades to no chart and says why — it does not render a flat line

**Chunk 4 — apple-maps**

- [ ] Both anchors appear in `.result-actions`
- [ ] The Google link is byte-identical to what it was before this chunk
- [ ] The Apple URL format was verified against current documentation, not recalled
- [ ] The recompute caveat renders as a `ResultLine` and says something true
- [ ] `handoff.ts` has its eight assertions and they pass
- [ ] Nothing breaks on Android, desktop Windows, or a machine with neither app

**Chunk 5 — daylight-budget**

- [ ] Every test uses a **fixed injected time** — grep proves no `Date.now()` was added
- [ ] The dial's dead zone appears when light runs out, and says why on the dial
- [ ] The cap note reads correctly at dusk and after dark — both states seen
- [ ] After dark the mode does not clamp to zero; it says something honest instead
- [ ] The `light` ResultLine appears when the walk does not fit the light left
- [ ] Daylight never removes a candidate — it produces no `PoolReason` (chunk 2's guarantee holds)
- [ ] `mergeCaps` and the `timeCap` action are in place for chunk 7 to call

**Chunk 6 — geolocate**

- [ ] A real fix sets the origin and warms its ladder
- [ ] Permission denied was triggered and produces a stated message
- [ ] Position unavailable was triggered and produces a different stated message
- [ ] Timeout was triggered and produces a different stated message
- [ ] An insecure context produces a stated message rather than a silent no-op
- [ ] A fix outside the Richmond bounds says so and offers the nearest preset
- [ ] That offer, when pressed, actually sets the preset
- [ ] A fix worse than the accuracy floor is refused, and the refusal says why
- [ ] The warm-up state is visible — a non-preset origin pays full price and the app admits it

**Chunk 7 — weather-filters** — *deferred decision: the licence*

- [ ] Open-Meteo's current terms were fetched and quoted into `HUMAN-REVIEW.md`, not recalled
- [ ] The build assumes the **commercial** case — the conservative branch, since a non-commercial
      assumption that turns out wrong is a licence breach and the reverse is only wasted caution
- [ ] If the commercial case needs a paid tier or an API key, the feature ships **behind a single
      flag, defaulting off**, with the panel saying weather is unavailable rather than fetching
- [ ] The flag is one constant in one file, and `HUMAN-REVIEW.md` names it
- [ ] `GET /api/weather` works in the dev server
- [ ] `GET /api/weather` works in the Worker
- [ ] It is edge-cached, and a second request within the TTL does not hit Open-Meteo
- [ ] An anonymous request cannot make the Worker do unbounded work
- [ ] Attribution is present where the licence requires it
- [ ] Every pool rule fires on injected conditions, not on today's real weather
- [ ] `minSurvivors: 3` holds — no weather rule can empty the pool by itself
- [ ] Every weather exclusion appears in chunk 2's summary with a reason
- [ ] An unreachable weather API blocks nothing: spinning still works, and the panel says what is missing
- [ ] Rain-onset caps route through chunk 5's `timeCap`, not into `selectCandidates`

**Chunk 8 — places-expansion** — *deferred decisions: the additions, and the walking speed*

- [ ] **Settle the walking speed before recutting anything.** `HUMAN-REVIEW.md` §6.1: the elevation
      rebuild changed every ETA in the app — the fixed fixture route went 1025.7 s to 963.5 s on an
      unchanged 1.047 km — because pedestrian costing's `use_hills` now has grades to read. The pinned
      3.69 km/h was measured against Google's isochrones on a graph with no hills in it, so it is now
      a flat-ground pace the terrain modulates rather than the pace. **This chunk recuts all eleven
      snapshots anyway**, which is the only cheap moment to change it: decide now and recut once, or
      decide later and recut twice. It is one constant, `WALKING_SPEED_KMH` in `server/proxy.ts`.
      "Leave it at 3.69" is a perfectly good answer — record it as settled either way, so nobody has
      to rediscover the question at chunk 11
- [ ] `harvest-osm.mjs` output is committed, so the build is reproducible without Overpass
- [ ] `propose-places.mjs` produces the review artefact
- [ ] The review artefact is committed and linked from `HUMAN-REVIEW.md`, ready to be skimmed cold
- [ ] Generated rows are an **append-only suffix in their own file**, never interleaved with the 62,
      so the whole batch can be pruned by deleting a range
- [ ] The automated gate ran in place of the human one, and every rejection reason is logged
- [ ] Any row the gate was unsure about was **excluded**, not included — unsure is a rejection
- [ ] `verify-places` passes on the full set, including `/locate` routability for every row
- [ ] No generated row duplicates a hand-curated one, by id or by proximity
- [ ] Every hand-curated coordinate is unchanged — they win every conflict
- [ ] `HAND_CURATED_COUNT` equals 62 and `places.test.ts` asserts `NAME_MAX` over the generated suffix
- [ ] ODbL attribution is present
- [ ] The map stays legible and interactive at the full place count, seen on a phone viewport
- [ ] The far-edge band is no longer starved — a 100-minute spin has real candidates
- [ ] `WIDE_PREFETCH_LIMIT = 90` holds and prefetch does not stampede the engine
- [ ] Detour-tier places are visually distinct on the map and in the result card
- [ ] The snapshot regeneration cost was measured and recorded

**Chunk 9 — opening-hours** — *deferred decisions: the ordinance, and the backfill*

- [ ] Richmond's actual park-hours ordinance was researched, cited, and quoted into `HUMAN-REVIEW.md`
- [ ] The park default lives in **one constant** and that constant is named in the review file
- [ ] The `osm` backfill was done automatically where the match is unambiguous
- [ ] Every ambiguous match was left `unknown` rather than guessed, and each one is listed for the pass
- [ ] The count of rows left `unknown` is recorded — that number is the size of the afternoon still owed
- [ ] `build-hours.mjs` reads committed JSON — the build does not call Overpass
- [ ] Baked schedules are the compact form the spec specifies, at the byte cost it claims
- [ ] The client ships **no** opening-hours parser — bundle proves it
- [ ] Every verdict is judged at **arrival** time, never at `now` — tests prove it with a fixed clock
- [ ] `unknown` is never rendered as open
- [ ] `unknown` is never rendered as closed
- [ ] A sunrise/sunset-relative rule resolves against chunk 5's solar module
- [ ] A seasonal place (a market, the Pump House) is correctly shut out of season
- [ ] Closed places appear in chunk 2's summary with the `closed` reason
- [ ] The staleness check exists and reports the age of the baked data

**Chunk 10 — shareable-spins**

- [ ] A minted link, opened cold in a different browser profile, restores the same spin
- [ ] `canonicalQuery(decodeShare(encodeShare(x))) === encodeShare(x)` — test 7c passes
- [ ] The link carries `o`, `b`, `f`, `rt`, `p`, `c`, `v`, `e`, `k` and the total key order is fixed
- [ ] The link carries **none** of `beforeDark`, `weatherAware`, `hideClosed`
- [ ] A link naming a place that no longer exists degrades with a stated reason
- [ ] A link whose destination is unavailable under the recipient's conditions says which condition
- [ ] The Worker injects OG meta server-side — verified with a crawler-like fetch, JS disabled
- [ ] Static asset caching still works and `run_worker_first` did not break it
- [ ] The Share button uses Web Share where available and copies where not
- [ ] The confirmation says what actually happened — no "copied" toast when nothing was copied

**Chunk 11 — meet-in-the-middle + the link** — one landing, not two

- [ ] 11a and 11b landed together; knip was never green on 11a alone because it was never committed alone
- [ ] `MEET_PIN_PRECISION` is 3 — the measured value, not a typed one
- [ ] A meet pin is rounded in the encoder, before it can reach `pointKey`
- [ ] An invite minted on one device, opened on another, produces a shared pool
- [ ] The recipient's origin does not leave their device until they press *Send this back*
- [ ] What the sender is told before minting matches what the link actually carries — read both, compare
- [ ] A preset origin shares as an id and leaks no coordinate
- [ ] An invite cannot be minted before the sender has chosen an origin
- [ ] The empty overlap is handled as the **arrival** state: the suggestion lands on the same beat as
      the warm-up finishing, with no visible dead Spin button in between
- [ ] `widen-to-meet` names a real budget that, when applied, actually produces a pool
- [ ] `no-overlap` appears only when nothing overlaps under the dial's maximum
- [ ] Hedging appears when rungs were unmeasurable, and does not appear when they were not
- [ ] `meetMinimum` was timed at the full post-chunk-8 place count, and the number is recorded
- [ ] The result card shows both walks' durations without claiming to know the other person's pace
- [ ] The words "their pace" appear nowhere — grep proves it
- [ ] Two devices on the same link show counts that differ only where honest divergence is expected

## Step 4: what to do when something is wrong

- **A gate fails.** Fix the code. If the gate is wrong, say so explicitly, with the reasoning, and get
  agreement before touching it.
- **A spec is wrong.** Correct the spec file, in the same commit, and report what changed. If the
  correction affects a sibling spec's contract, correct that too — a contract that exists in one
  document and not its partner is how chunk 11's session shape went wrong the first time.
- **A spec is wrong in a way that changes the plan.** Do not stop — nobody is there to unblock you.
  Take the conservative branch, log it to `HUMAN-REVIEW.md` as a **plan-level** decision (they get
  their own section, because they are the ones most likely to be overturned), and continue.
  Resequencing or dropping a chunk is allowed if a dependency genuinely forces it; changing a shared
  contract after later chunks depend on it is not — amend the owning chunk instead.
- **A number in a document disagrees with the code.** The code wins, and every document repeating that
  number gets corrected in the same pass. Not just the one you noticed.
- **You are unsure whether something is verified.** It is not.

## Step 5: the report between chunks

Short. Five parts, no preamble:

1. **Chunk N — done** (or **blocked**, and on what).
2. **Gates** — each one, and its result. Actual numbers where there are numbers: bundle bytes and the
   delta, test count, drift percentage.
3. **Acceptance** — how many criteria, and how the non-mechanical ones were observed.
4. **Spec corrections** — what changed in which document and why. "None" is a fine answer.
5. **Deferred** — every decision logged to `HUMAN-REVIEW.md` during this chunk, by name.
6. **Next** — the chunk about to start, and its preconditions.

Then continue. Nobody is waiting; the report is written for the person who arrives at the end.

## Step 6: the human pass — the one gate, at the end

Everything deferred during the run collects here. This is the only point where a person is required,
and it is designed so that person can arrive cold, with no memory of the run, and still judge it.

### Run this checklist to the end before declaring the work finished

**Where the run is: chunk 7 landed, on 2026-08-21.**
`npm run verify` green, working tree clean. Bundle 82,262 B gzipped against the 102,400 B ceiling;
246 tests. Each ticked chunk names its commit and its acceptance tally — every open box in those
tallies is recorded in `HUMAN-REVIEW.md` §4 and §5, and none of them is a `[!]`. `PROGRESS.md`
carries a report per chunk; the next one to start is chunk 8, and its first act is the walking-speed
decision in `HUMAN-REVIEW.md` §6.1 — that chunk recuts all eleven snapshots, which is the only cheap
moment to settle it.

- [x] Harness built and committed — `25ac08b`
- [x] Chunk 0 — foundations — `3d85202`, 53/54
- [x] Chunk 1 — elevation on the wire, and the graph — `a9c05ce`, 59/60
- [x] Chunk 2 — pool-reasoning — `b057052`, 68/70
- [x] Chunk 3 — elevation-profile, the visible half — `074f3e7`, 73/76
- [x] Chunk 4 — apple-maps — `e3938f8`, 61/63
- [x] Chunk 5 — daylight-budget — `506d096`, 67/69
- [x] Chunk 6 — geolocate — `e575427`, 65/71
- [x] Chunk 7 — weather-filters — `e62f166`, 81/83
- [ ] Chunk 8 — places-expansion
- [ ] Chunk 9 — opening-hours
- [ ] Chunk 10 — shareable-spins
- [ ] Chunk 11 — multiplayer-links + meet-in-the-middle, one landing
- [ ] `docs/plans/HUMAN-REVIEW.md` complete
- [ ] The feel pass prepared

### `docs/plans/HUMAN-REVIEW.md`

Written as you go, never assembled at the end from memory. Six sections, in this order — the order is
a priority order, worst first:

1. **Gates I weakened.** Every test changed, rule loosened, threshold raised or budget widened, with
   the reason. Empty is the expected answer and a non-empty section is the first thing to read.
2. **Decisions I made that were meant to be yours.** One entry each, and every entry carries: the
   question, the branch taken, why it was the conservative one, **the exact file and constant that
   reverses it**, and what else would have to change if it were reversed. The known six:
   Open-Meteo's licence, the Richmond park-hours ordinance, the two climb thresholds, the accuracy
   floor that refuses a fix, whether a dropped-pin share publishes a front door at 1 m precision, and
   one pinned pace for two walkers.
3. **Plan-level decisions.** Anywhere a spec turned out wrong in a way that changed sequencing,
   scope, or a shared contract.
4. **Unticked boxes.** Every `[ ]` and every `[!]` left standing, by chunk, with what stopped it.
   Blocked chunks and skipped chunks go here.
5. **Things I could not observe.** Anything that needs a real phone, a second person, a GPS fix
   outside Richmond, a specific season, or weather that did not occur during the run. These are not
   failures; they are the work the pass inherits.
6. **Numbers.** Final bundle size against the ceiling, test count, drift percentage, place count,
   `meetMinimum` timing, snapshot rebuild cost. The README §5 cost table corrected from these
   measurements rather than estimates.

### Prepare the feel pass

The final pass is a person judging whether it *feels* right, which is the one thing no checklist in
this document can do and the reason the word "feel" appears nowhere else in it. Leave the ground
ready for it:

- [ ] The app runs from a cold clone with one documented command
- [ ] The TUNE panel still works, and every feel constant the run touched is adjustable in it live
- [ ] A walkthrough exists: one ordered list of what to try, one line per feature, phone first
- [ ] Each walkthrough step names what to look at, not just what to press
- [ ] Every deliberately ugly compromise is called out in advance, so it reads as a decision rather
      than as something nobody noticed
- [ ] Every piece of user-facing copy written during the run is collected in one list, because copy is
      judged by reading it together rather than by meeting it one screen at a time
- [ ] The three states that are hardest to reach on purpose — empty pool, dark, no overlap — have a
      documented way to reach them, so the pass can see them without waiting for nightfall

### What "done" means for v0.5

All twelve chunks landed and green. Every acceptance file fully ticked. `npm run verify` clean from a
cold clone. `HUMAN-REVIEW.md` complete and honest, including the sections nobody wants to write.
README §6 ("what v0.5 does not do") rewritten to be true of the thing that actually shipped — the
last honest act of the release, and the one most likely to be skipped.
