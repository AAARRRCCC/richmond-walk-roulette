# Progress — the v0.5 run, chunk by chunk

Appended, never overwritten. Nobody is reading this live; it is the trail that makes the final pass
possible, and the only way a decision made at chunk 3 is still explicable at chunk 11.

Format is GOAL.md Step 5: done or blocked, gates with their numbers, acceptance, spec corrections,
deferred decisions, next.

---

## Step 1 — the verification harness — done

Built before chunk 0, because nothing in the plan was verifiable: there was no single command that
answered "is the repo healthy", no way to detect a stale snapshot, and no guard on the byte budget
that every chunk spends against.

### What landed

| Script | What it answers |
| --- | --- |
| `npm run verify` (`scripts/verify.mjs`) | Is the repo healthy? Six stages, stops at the first red. |
| `scripts/verify-engine.mjs` | What can the engine actually do — not what does it advertise. |
| `scripts/verify-drift.mjs` | Is a committed reach snapshot still true? |
| `scripts/verify-bundle.mjs` | Is the app's own JS under the ceiling, and by how much did it move? |
| `scripts/verify-places.mjs` | Do the place-data invariants hold, measured by importing the data? |
| `scripts/verify-acceptance.mjs` | Are this chunk's boxes all ticked? Also assembles them. |

Plus `scripts/bundle-budget.json` (the committed number and the ceiling) and `src/lib/bounds.ts`
(chunk 0's box, pulled forward because `verify-places` must import it rather than restate it — logged
in HUMAN-REVIEW §3.1).

`scripts/verify-signature.mjs` is deliberately absent until chunk 2, when there is a rule registry for
it to assert against. HUMAN-REVIEW §3.2 says why, and it is chunk 2's first box.

### Gates

| Gate | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run lint` (eslint + oxlint + knip) | clean |
| `npm test` | 68 passing, 0 failing |
| `npm run build` | succeeds |
| `node scripts/verify-bundle.mjs` | 71,205 B gz app JS, ceiling 102,400 B, 31,195 B headroom |
| `node scripts/verify-places.mjs` | 4 checks pass; 62 places, 11 origins, worst snap 51 m |
| `npm run verify` end to end | all 6 steps clean in 17.6 s |

The harness caught three real things on its first run, which is the argument for building it first:

1. **oxlint's anti-slop plugin rejected the harness's own code** — three `typeof` narrowings, a
   `shape` symbol name and two mutating `sort()` calls. All fixed in the code, none disabled.
2. **`verify-engine` reproduced chunk 1's justification, automatically.** `/height` returns `null` for
   all three probe points and `/route` returns `-500.0` for all 36 elevation samples, on an instance
   that lists `height` in `available_actions`. That is the exact hand-run check the plan says must
   never again depend on somebody remembering to do it by hand.
3. **`verify-drift` found the snapshots were already stale.** 14.16% worst-case area drift, 35
   place-membership flips, before the v0.5 graph rebuild has touched anything. Recorded in
   HUMAN-REVIEW §6.

### Acceptance

Not applicable — the harness is Step 1, not a chunk, and has no acceptance file. Its checks are the
gates above, each observed by running the command and reading its exit code.

### Spec corrections

- `LAUNCH.md` — the **Verify against the live engine** section gained two unticked boxes:
  `verify-engine.mjs` against the deployed engine, and `verify-drift.mjs` clean or the snapshots
  regenerated. Both were manual work nobody had a command for.
- `package.json` — `"verify": "node scripts/verify.mjs"`.
- `server/proxy.ts` — its inline `BOUNDS` const replaced by an import from `src/lib/bounds.ts`
  (renamed inside chunk 0 to the names `geolocate.md` writes).

### Deferred

- HUMAN-REVIEW §2.1 — the bundle ceiling is 100 KiB, not README line 91's 64 KB.
- HUMAN-REVIEW §3.1 — `src/lib/bounds.ts` landed with the harness rather than with chunk 0.
- HUMAN-REVIEW §3.2 — `verify-signature.mjs` deferred to chunk 2.

### Next

**Chunk 0 — Foundations.** Preconditions: `npm run verify` green on the tree before any chunk-0 code
is written (met, above); the chunk touches no engine, so no `verify-engine` precondition. The bounds
bullet is already landed and its box is ticked in the chunk-0 file with a pointer to HUMAN-REVIEW §3.1.

---

## Chunk 0 — Foundations — done

Pure refactor plus dead-but-tested code. Nothing user-visible changed, which is this chunk's own
claim and was checked rather than assumed: the screen-reader sentence a landed spin produces is
byte-identical to what the old `describeResult` produced.

### What landed

| Piece | Where | Note |
| --- | --- | --- |
| The one bounding box | `src/lib/bounds.ts` | Renamed to `geolocate.md`'s own names: `Bounds`, `RICHMOND_BOUNDS`, `insideRichmond`. `server/proxy.ts` imports it |
| Solar arithmetic | `src/lib/solar.ts` | Vendored NOAA/Meeus, single pass, provenance and the 17 U.S.C. 105 basis in the header |
| What the light means | `src/app/daylight.ts` | `daylightAt`, `capFromLight`, `fitsInLight`, and the three strings |
| The one clock | `src/app/conditions.ts`, `src/app/useConditions.ts` | `CapReason` ships as the full union per README 2.1; the hook takes `(origin, frozen)` |
| One voice for times | `src/lib/format.ts` | `RICHMOND_TZ`, `formatClock`, one module-scope formatter, no try/catch |
| One announcement | `src/app/announce.ts` | `describeResult(clauses)` and `walkClauses`, out of `App.tsx` |
| The shared line block | `src/ui/ResultCard.tsx`, `src/styles/app.css` | `ResultLine`, `.result-lines`, rendering an empty array |
| Cache versions split | `server/proxy.ts` | `CACHE_VERSION` v1 for isochrones, `ROUTE_CACHE_VERSION` v2 for routes |
| `keyFor` widened | `worker/index.ts` | `(payload, request)`; no call site changed, a narrower function is assignable |
| Cache stub keyed by name | `server/test-stubs.ts` | One `Map` per cache name, so chunk 10 can prove its cache is not the isochrone cache |

### Gates

| Gate | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run lint` | eslint, oxlint and knip all clean |
| `npm test` | **100 passing**, 0 failing (68 before) |
| `npm run build` | succeeds |
| `node scripts/verify-bundle.mjs` | **71,315 B** gz app JS, **+110 B** on the baseline, 31,085 B headroom |
| `node scripts/verify-places.mjs` | 4 checks pass; 62 places, 11 origins |
| `npm run verify` end to end | all 6 steps clean |

The bundle delta is +0.1 KB against a +0.9 KB estimate. Not a saving — nothing imports the three new
modules yet, so the bundler drops them. Those bytes land in chunk 5.

### Acceptance

`docs/plans/acceptance/chunk-00.md`: **53 of 54 ticked**, one open.

Non-mechanical boxes, and how each was observed:

- **Nothing user-visible changed** — cold load, spin, card and announcement compared against the
  pre-chunk behaviour. The sr-only sentence is byte-identical.
- **Keyboard alone** — focused *Spin again*, pressed Enter, spun to Main Street Station.
- **Phone width** — the app mounted in a 390px iframe on its own origin, where media queries evaluate
  against the frame. Bottom-sheet layout, disclosures collapsed, no horizontal overflow.
- **Dial scrubs with no request** — 25 positions by keyboard, area and count tracking every step,
  zero `/api/` requests in the network panel.
- **Snapshot cold start** — one `/reach/37.53880_-77.43360.json?v=2`, zero `/api/isochrone`.
- **Dropped pin** — nudged the marker 12 steps west, ladder warmed from the engine, spun to The
  Valentine.
- **The one open box** is `prefers-reduced-motion`, which this machine cannot emulate.
  HUMAN-REVIEW 5.1.

### Spec corrections

- `docs/plans/daylight-budget.md` — `CapReason` widened to the full union inside its own code block;
  `useConditions(origin, frozen)` corrected in three places; open question 2's place count corrected
  from 78 to 62 (README 2.6 had already made the correction globally, and that spec had not caught up).
- `src/app/App.tsx` — the point-in-polygon comment said 51 places. It is 62.
- `knip.json` — `src/**/*.test.ts` joined `server/*.test.ts` as an entry. Not a loosened gate: it is
  what `npm test`'s own glob has always treated as an entry point, and without it four modules that
  are tested but not yet consumed read as dead files.

### Deferred

None new. Chunk 0 logged HUMAN-REVIEW 3.3 (what "fully ticked" means when a box cannot be observed)
and 5.1 (the reduced-motion box).

### Next

**Chunk 1 — Elevation on the wire, and the graph.** The only irreversible act in the plan, and
pre-authorised. Preconditions: `npm run verify` green (met); `verify-engine` run before starting (it
is red today, on exactly the two checks the rebuild fixes, which is the justification); and the
tileset plus all eleven `public/reach/*.json` backed up to a timestamped directory **before** the
rebuild starts.

---

## Chunk 1 — Elevation on the wire, and the graph — done

The one irreversible act in the plan, pre-authorised, and it went in one pass. Backed up first:
`valhalla/backups/20260821-142818/` holds the old tileset, its config, its hashes, the pre-rebuild
`/status`, and all eleven `public/reach/*.json` — 57 MB, gitignored.

### What landed

`build_elevation=True`, a rebuilt graph, and the data path from the engine to localStorage and back.
Nothing renders a profile: that is chunk 3.

| Piece | Note |
| --- | --- |
| `valhalla/docker-compose.yml` | `build_elevation=True`, with why it is silent when it is wrong |
| `valhalla/scripts/build-graph.sh` | The smoke check now asks for elevation and fails on a sentinel |
| `valhalla/README.md` | A measured Elevation section: one tile, 25 MB, one pass |
| `server/proxy.ts` | `ELEVATION_INTERVAL_M = 30` on the route body |
| `src/lib/elevation.ts` | The pure module: `climbFrom`, `plausibleProfile`, `classifyClimb`, `mirrorProfile`, `elevationAt`, `resample`, `profilePoints`, `areaPath`, `linePath` |
| `src/lib/route.ts` | `ElevationProfile`, `WalkingRoute.profile`, `noteElevation`/`elevationAvailable` |
| `src/lib/route-store.ts` | `SCHEMA_VERSION` 2, `MAX_ENTRIES` 600, the compact stored profile |
| `src/lib/geometry.ts` | `cumulativeMeters`, `pointAtMeters`, one memo, one Earth radius |
| `public/reach/*.json` | All eleven recut; `SNAPSHOT_VERSION` 2 → 3 |

### Gates

| Gate | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run lint` | eslint, oxlint, knip all clean |
| `npm test` | **131 passing**, 0 failing (100 before) |
| `npm run build` | succeeds |
| `verify-bundle` | **71,860 B** gz, **+545 B**. The spec estimated +0.7 KB |
| `verify-places` | 4 checks pass |
| `verify-engine` | **all 7 pass** — the first time it has been green |
| `verify-drift` | 0.00%, 0 flips, after regeneration |
| `npm run verify` | all 6 steps clean |

### The numbers this chunk exists to produce

| | Before the rebuild | After |
| --- | --- | --- |
| `/height`, 3 probe points | `[null, null, null]` | `[51, 44, 31]` m |
| `/route`, 36 elevation samples | 36 at the `-500` sentinel | 0 |
| Tileset timestamp | 1787278077 | 1787337146 |
| Worst snapshot area drift | — | **4.44%** at 25 min, from Maymont |
| Place-membership flips | — | **0** |
| Drift after regenerating all eleven | — | **0.00%**, 0 flips |
| Regeneration cost | — | **2.9 s** |
| Elevation tiles | — | one, `N37W078`, 25 MB |
| Rebuild passes needed | — | **one** |

And the profile is real, not merely present: after one spin the store holds 60 profiles at a 30 m
interval. Forest Hill from Home reads 89 m of ascent over a 7–50 m range; the canal walks read 0.

### Acceptance

`docs/plans/acceptance/chunk-01.md`: **59 of 60 ticked**. The open one is `prefers-reduced-motion`,
which this machine cannot emulate — and this chunk renders nothing.

### Spec corrections

Three, all in `elevation-profile.md`, and the first is the substantive one.

1. **`climbFrom`'s pseudocode has two real bugs**, both caught by the spec's own fixtures.
   - It resolves `direction` only at a reversal. So a walk that climbs and then turns down is still
     "either" at the turn, the turn reads as *extending a fall*, the pivot slides back down, and the
     ascent is silently discarded. `climbFrom(HILL, 2)` returned `{0, 0}` where the spec's own test
     demands `{30, 30}`. Fixed by resolving direction the moment a run clears the threshold.
   - It banks the final open run unconditionally, so noise at the end of a flat walk counts as
     ascent while identical noise in the middle does not — a hill that depends on where the walk
     happened to stop. `climbFrom(FLAT, 2)` returned 0.3 m where the spec demands 0. Fixed by
     holding the last run to the same threshold as every other.
2. **The 1 km geometry fixture assumed a different Earth.** `37.548993` is 1000 m north only at
   ~111,195 m/degree; `geometry.ts` already carries `EARTH_RADIUS_M = 6378137`, which puts it at
   1001.1 m. Rather than add a second radius the fixture is now `37.5489832`, derived from the
   module's own constant. One Earth per module.
3. **The build-ordering open question is answered.** The spec could not tell whether the image
   fetches SRTM tiles before or after the build that needs them, and said to run it twice if the
   first pass came back flat. It does not need a second pass: one `REBUILD=1` produced real
   elevation. Recorded in `valhalla/README.md` as the spec instructed.

Also corrected: `README.md` line 91's stale "64 KB … 276 KB" is now the measured 70 KB and 277 KB,
which README §5 consequence 2 makes chunk 1's job.

### Deferred

- HUMAN-REVIEW 3.4 — the snapshots were regenerated rather than accepted (4.44% drift, 0 flips).
- HUMAN-REVIEW 3.5 — `verify-drift` was measuring the snapshot's own 11 m rounding as drift. The
  measurement was fixed; the 1% threshold was not touched.
- HUMAN-REVIEW 6.1 — **every walking time in the app changed and nothing on screen says so.** The
  fixed fixture route went 1025.7 s → 963.5 s on an unchanged 1.047 km, because `use_hills` now has
  grades to read. The pinned 3.69 km/h is now a flat-ground pace the terrain modulates. Nothing was
  changed in response; somebody should decide whether the constant still holds.

### Next

**Chunk 2 — `pool-reasoning`.** Preconditions: `npm run verify` green (met); chunk 1's acceptance
file at 59/60 with the one open box recorded. It touches no engine. Its first deliverable is
`verify-signature`, deferred here since chunk 0 and owed now: the memo contract it guards is the
plan's single biggest risk, and four later chunks plug rules into the registry it protects.

---

## Chunk 2 — `pool-reasoning` — done

The app used to answer one question honestly and a second not at all: tick *Hilly* and *Food* at the
same dial and it handed you a Spin button that did not press and one sentence, "Nothing matches
inside 25 minutes", which is true and useless. It now says **"0 to spin · 20 wrong terrain · 6 no
match"** and offers a button labelled **"Clear what you are looking for (6 back)"** — a number it
measured by re-running the verdict with that one cause dropped. Pressing it took the pool from 0 to 6.

### What landed

| Piece | Note |
| --- | --- |
| `src/app/eligibility.ts` | `derivePool`, `explainPlace`, `poolReport`, `conditionsSignature`, `suggestFix`, `summaryLine`. Every place gets a verdict, not a yes-or-no |
| `src/app/signature.test.ts` + `scripts/verify-signature.mjs` | The memo contract, owed since Step 1 |
| `src/ui/PoolList.tsx` | The "All places" drawer: the pool, then every exclusion grouped by reason with a count and an expander past twelve |
| `src/ui/EmptyPoolNotice.tsx` | Four branches, each naming a measured fix |
| `ReachReadout` | `.readout` names what geometry allows; a second line names what the filters left |
| `ResultCard` | One row per non-geometry reason; the budget row became reason-aware rather than gaining a twin |
| `MapCanvas` | A transparent hit halo on `places-out`, so a 3 px dim dot is tappable |
| `session.ts` | `clearVibes`, `clampBudget` exported, and the `clearFilters` contract written down at the case |

`selectCandidates` is deleted. README §2.3's three amendments — rule `id`, `deferred`, and
`baseIncluded`/`baseKey` — are implemented here rather than deferred, so chunks 3 and 7 plug in
rather than amend.

### Gates

| Gate | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run lint` | eslint, oxlint, knip all clean |
| `npm test` | **163 passing**, 0 failing (131 before) |
| `npm run build` | succeeds |
| `verify-bundle` | **74,644 B** gz, **+2,784 B**. Over the spec's +1.6 KB estimate — HUMAN-REVIEW 6.2 |
| `verify-signature` | 6 tests pass |
| `verify-places`, `verify-engine`, `verify-drift` | clean |
| `npm run verify` | all 6 steps clean |

### The two checks the spec flagged as unverified, both now measured

1. **Does MapLibre count `circle-stroke-width` in its hit test?** Yes, at the pinned version. A 3 px
   dim dot was hit from about 12.7 px away. The `places-out-hit` fallback layer the spec described as
   the contingency is not needed and was not added.
2. **Does the counts line wrap past two lines at 320px?** No. The two-clause worst case renders 41.5
   px tall against an 18.75 px line-height — two lines — at a 316 px viewport, with no horizontal
   overflow. No narrow-breakpoint cut needed.

And the memo contract, instrumented rather than assumed: ticking a vibe chip produces **exactly one**
imperative announcement carrying both sentences; twenty scrub frames with no commit produce **zero**.

### Acceptance

`docs/plans/acceptance/chunk-02.md`: **68 of 70 ticked**. Two open: `prefers-reduced-motion`
(HUMAN-REVIEW 5.1) and the spec's criterion 5, the `widen-budget` notice on screen, which no origin
this session could construct would produce (HUMAN-REVIEW 5.2) and which three tests assert instead.

Criterion 13 was proven by breaking it: adding a member to `ExclusionReason` without copy fails `tsc`
at the `satisfies` on `REASON_COPY`; removing one from `REASON_ORDER` while leaving its copy fails
test 1. Both put back.

### Spec corrections

- **Criterion 2 was wrong.** It asked that `.readout` and `.pool-summary` both read `PLACES.length` on
  a default session — but the default budget is 50 minutes and reaches 26 of 62 places. Rewritten to
  the check that matters: the two numbers agree with each other, and a whole pool shows no clauses.
- **Criteria 7 and 12 carry stale numbers.** `All places (61)` is 62 (README §2.6 already corrected
  the count); the "64 KB gzipped budget" is the stale claim chunk 1 replaced with a measured 70 KB.
- **The spec's claim that `eligibility.ts`'s three runtime imports "all load cleanly under
  `node --test`" was false.** `session.ts` imported `../lib/isochrone` with no extension, which Vite
  resolves and Node does not, so the first run of `eligibility.test.ts` died in the module loader.
  Three specifiers gained `.ts`.
- `README.md` gained the paragraph the spec asks for, under the feature list.

### Deferred

- HUMAN-REVIEW 5.2 — the `widen-budget` notice was never reached on screen.
- HUMAN-REVIEW 6.2 — chunk 2 spent 2.8 KB against an estimate of 1.6 KB. Three chunks in, the run is
  0.4 KB over in total, which is noise; the per-chunk overspend is what is being watched.

### Next

**Chunk 3 — `elevation-profile`, the visible half.** Preconditions: `npm run verify` green (met);
chunk 2 landed with the rule registry it needs. It contributes the first real `PoolRule` — the climb
rule, `deferred: true` — so it also owes the first new entry in `signature.test.ts`'s REGISTERED
table, which is already seeded with the case it must satisfy.

---

## Chunk 3 — `elevation-profile`, the visible half — done

The card used to say `Terrain: Flat` because somebody typed `terrain: "flat"` next to a coordinate.
It now says **`Climb 141 ft`** and draws the shape of the walk underneath, measured from the origin
you actually chose along the route the map is already showing.

The tag is not supplemented, it is deleted. `Terrain`, `Place.terrain` on all 62 rows,
`Session.terrain` and the `terrain` action are gone from `src/` — `grep -rn 'Terrain\b' src/` returns
nothing.

### What landed

| Piece | Note |
| --- | --- |
| `src/ui/ElevationProfile.tsx` | The chart. One `<input type="range">` laid transparently over the SVG buys pointer, touch and keyboard for nothing |
| `ResultCard` | The `Climb` stat and the chart read the **same object**, so they cannot disagree |
| `Filters` | Any / Easy / Hilly, disabled with a described notice when the engine has no elevation |
| `App` | The climb `PoolRule`, `deferred: true`, and the gate over `pool.baseIncluded` |
| `MapCanvas` | The hover dot, above the place layers so it cannot slide under the winner's marker |
| `format.ts` | `formatFeet` |
| `places.ts` | 62 rows lighter by one field each |

**`applyClimb` was deliberately not written.** README §2.3(b) supersedes that half of the spec: the
climb filter is one `deferred` `PoolRule`, and `baseIncluded`/`baseKey` replace the spec's
`baseCandidates`/`baseCandidateKey`. This is the first sibling to plug into chunk 2's registry, and it
did so without editing it.

### Gates

| Gate | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run lint` | eslint, oxlint, knip all clean |
| `npm test` | **164 passing**, 0 failing |
| `npm run build` | succeeds |
| `verify-bundle` | **76,798 B** gz, **+2,154 B** — under that spec's own 2.5 KB line |
| `verify-signature` | 6 pass, with the climb rule's REGISTERED entry naming the signature that shipped |
| `verify-engine`, `verify-drift`, `verify-places` | clean |

### Seen working

- **Flat versus steep, side by side.** 17th Street Market: `Climb 0 ft`, a trace that wanders a few
  pixels inside its 20 m window, `0 ft up / 0 ft down / 20 ft–26 ft`. Libby Hill Park: `Climb 141 ft`,
  a trace that climbs and comes back down to where it started. There is no "flat" branch in the
  drawing code — the floor on the range is the whole mechanism.
- **Four statements of one fact, agreeing.** Stat `141 ft`, figcaption `↑141 ft`, `aria-label` "141 ft
  of climb … over 2.3 mi", announcement "141 ft of climb". The `aria-label`'s distance and the
  Distance stat read the same 2.3 mi, which is criterion 6's one-card check.
- **The hover dot.** Scrubbed to 900 m; the white dot with the amber ring sat on the route line at
  that distance. `aria-valuetext` read "1.1 mi in, 151 ft" mid-walk and "2.3 mi in, 23 ft" at the
  maximum — a real elevation at the end rather than `undefined ft`.
- **No elevation at all**, run against `valhalla/stub.mjs`, which refuses elevation on purpose: chips
  disabled with `aria-describedby`, `Climb -`, "No elevation data from this engine.", no shimmering
  skeleton — **and the same on a cold reload**, which is the rehydration path criterion 17 exists to
  catch.

### Acceptance

`docs/plans/acceptance/chunk-03.md`: **73 of 76 ticked**. Three open, all environmental and all
logged: `prefers-reduced-motion` (5.1), the card at a phone width (5.3), and criterion 14's
`Measuring climb n/total` label (5.4) — the local engine settles 26 routes faster than the DOM can be
sampled, even polling every 80 ms against a cleared store.

### Spec corrections

- **`applyClimb` and the `selectCandidates` split are not implemented**, per README §2.3(b). Recorded
  here rather than silently skipped, because the spec still describes them at length.
- **One test expectation was wrong and the code was right.** `baseIncluded` keeps a place a deferred
  rule has measured and rejected — the base pool is everything whose climb might need measuring, and
  its entire job is not to shrink while the reader watches the denominator.
- Four comments in `eligibility.ts` still said "terrain" about the renamed filter; they say "climb".
- README's app-JS figure is the measured 75 KB.

### Deferred

- HUMAN-REVIEW 5.3 — the result card at a phone width.
- HUMAN-REVIEW 5.4 — the measuring gate on screen.

### Next

**Chunk 4 — `apple-maps`.** The afternoon: one pure module, eight assertions, two anchors and a CSS
grid. Preconditions: `npm run verify` green (met), and chunk 0's `.result-lines` block, which has been
rendering an empty array since it landed and now gets its first line.

---

## Chunk 4 — `apple-maps` — done

The afternoon, as advertised: one pure module, eight assertions, two anchors and a CSS grid.

The card used to end in one way out. It now ends in two, side by side, on every platform — and
admits, in one quiet line, that neither of them is carrying our walk.

### What landed

`src/lib/handoff.ts` with `googleDirectionsUrl` and `appleDirectionsUrl`; two named anchors in
`.result-actions`; and the recompute caveat as a `ResultLine` with `key: "handoff"`.

**No platform sniffing.** Google documents that its URL falls back to the browser when the app is
absent; `maps.apple.com` is a universal link Apple's own app claims. Sniffing could only ever be
wrong — it breaks the Mac user in Chrome and the Android user who wants Apple's web map — and two
links is the smaller code.

**The Apple form is the unified one**, which reverses an earlier draft of that spec. Apple's answer
to a report that the legacy shape "no longer behaves as expected" was to point at a replacement
rather than to say it still worked. The legacy URL is in a comment with the citation, as the thing to
reach for if the manual check fails on an old device.

**The origin is rounded to `COORD_PRECISION`; the destination is not.** This is the one place the app
hands a coordinate to a third party, and with `geolocate` coming the origin can be a raw GPS fix.
`pointKey` already collapses origins to exactly this precision, so the app itself cannot tell two
origins apart below it — handing out more than we use is a leak with no function. A destination is a
published landmark, so rounding it buys no privacy and would move a pin.

### Gates

| Gate | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run lint` | eslint, oxlint, knip all clean |
| `npm test` | **172 passing**, 0 failing |
| `npm run build` | succeeds |
| `verify-bundle` | **77,015 B** gz, **+217 B** against a +0.3 KB estimate — the closest any chunk has come |
| everything else | clean |

### Seen working

"Spin again" full width, then "Google Maps" and "Apple Maps" sharing the row, then the caveat. Both
anchors `target="_blank" rel="noreferrer"`, both with distinct `aria-label`s naming the destination
and the provider, both calling `playPress()` — the old Google anchor had no cue at all.

At a 316px viewport the three buttons each measure 282px in one column and none is clipped. That is
the mobile rule doing its job rather than the text relieving the pressure: `.button` sets
`white-space: nowrap`, so "Google Maps" cannot wrap.

### Acceptance

`docs/plans/acceptance/chunk-04.md`: **61 of 63 ticked**. Two open: `prefers-reduced-motion` (5.1),
and the Apple link opened on a real device (5.5), which is a required manual check that cannot be
done from here and is now a checkbox in `LAUNCH.md` under **Ship** with what to look for.

### Spec corrections

- **`.result-note` was not added.** README §2.5 retires it and the caveat ships as a `ResultLine` —
  which this spec's own `## Depends on` predicted, while its `## Changes` section still described the
  class. The line renders in `--ink-3` with `margin: 0` from `.result-line.is-assumed`, which is what
  the spec wanted the class for.

### Deferred

- HUMAN-REVIEW 5.5 — the Apple link on a real device, and the three things that stay unverified until
  somebody opens it. A status code is not evidence: `maps.apple.com` answers 200 with the same shell
  for essentially any path.

### Next

**Chunk 5 — `daylight-budget`.** The visible half of the clock chunk 0 built and nothing has consumed
yet: the switch, the dial's dead zone, the cap note, the light line on the card, and the fit warning.
Its pure modules and their 20 tests have been sitting green and unimported since chunk 0, so this is
wiring rather than arithmetic. Preconditions: `npm run verify` green (met).

---

## Chunk 5 — `daylight-budget` — done

The dial promised a walk of N minutes and never knew whether those minutes existed. Set it to ninety
at seven in the evening in November and the app would draw a confident contour across half the city
and pick you a spot on Belle Isle you would reach in the dark.

It knows now. Chunk 0's pure modules have been sitting green and unimported since; this is the wiring.

### The three states, all seen

| Clock | What the app does |
| --- | --- |
| 62 min to dusk, guard on | `max` drops to 62, the track shades from 62 to 100 behind a dashed edge, and the note reads **"Daylight limit 62 min · dusk 8:22 pm"** |
| 10:30 pm, guard still on | The dial is back to **full range**. It does not clamp to zero. The switch stays on and operable, the hint becomes **"It is dark. Civil dawn is 6:03 am."**, the readout **"dark until 6:03 am"**, the card's clause **"after dark"**, and the fit warning fires — for a **seven-minute** walk, which is the case test 13 exists to catch |
| 40 min to sunset | The card reads **"7 min out and back · sunset in 42"** and the warning is gone, because a seven-minute walk fits |

The cap is drawn as a dead zone rather than a shorter slider, which is the whole decision: a reader
can see what the light is costing them.

### Gates

| Gate | Result |
| --- | --- |
| `npm run typecheck` | clean |
| `npm run lint` | eslint, oxlint, knip all clean |
| `npm test` | **178 passing**, 0 failing |
| `npm run build` | succeeds |
| `verify-bundle` | **79,785 B** gz, **+2,770 B**, under that spec's 3 KB line. 22.0 KB of headroom |
| `verify-engine`, `verify-drift`, `verify-places`, `verify-signature` | clean |
| `git diff` under `server/`, `worker/`, `public/`, `wrangler.toml` | empty — zero requests, as the spec claims |

### Two things the acceptance criteria caught

1. **`formatToParts` was running on every frame of a scrub.** Criterion 16 asks that it not, so it was
   instrumented: **150 calls across a 26-position scrub**. The conditions memo was working — `daylightAt`
   really does run once a minute — but `describeDusk` and `describeDeadline` each call `formatClock`,
   and three call sites render them per frame. Both are now cached on the `Daylight` identity, the same
   `WeakMap` trick `smooth.ts` uses on contours. Measured after: **0**.
2. **The clock did not re-read when the freeze lifted.** The hook is frozen through a throw, and it
   waited for the next minute boundary afterwards — up to sixty seconds of staleness at the moment the
   reader is looking again. The same gap applied to a tab returning from the background. Both paths now
   kick off an immediate tick rather than waiting. Found by criterion 10, which asks that the cap land
   on the falling edge of a throw: it did not, and now it does.

### Acceptance

`docs/plans/acceptance/chunk-05.md`: **67 of 69 ticked**. Two open, both environmental:
`prefers-reduced-motion` (5.1) and the dead zone at a phone width (5.3).

### Spec corrections

The three README §2.1 amendments are implemented rather than the spec's original spelling:
`useConditions(origin, frozen)`, the full `CapReason` union, and `Session.timeCap: TimeCap | null`
with a `timeCap` action replacing `lightCapMinutes`/`lightCap`. App already calls
`mergeCaps([lightCap])` — an array of one — so chunk 7 appends rain, storm, heat and cold rather than
inventing a second clamp path.

### Deferred

- HUMAN-REVIEW 6.3 — `walkRouletteDev.clockOffset(ms)` exists in dev builds, and the catch that goes
  with it: the clock stops while the document is hidden, which is the feature working and reads as a
  bug to anyone automating the page.

### Next

**Chunk 6 — `geolocate`.** The phone says where you are, with a refusal when the fix is too coarse to
draw. `src/lib/bounds.ts` has been in place since the harness with the exact contract that spec
writes, and its three tests pass. Preconditions: `npm run verify` green (met).

---

## Chunk 6 — `geolocate` — done

The phone can say where you are, and the app can refuse what it says.

That refusal is the feature. This app's whole argument is that a contour is measured rather than
assumed, and a fix with a 3 km error circle cannot support it — the 95% circle swallows the innermost
band whole. So a bad fix is turned down by name, with its own accuracy quoted back at it, rather than
drawing a confident shape around a guess.

### Six outcomes, all seen

Driven through the real handler by standing in for `navigator.geolocation`:

| Fix | What the app says |
| --- | --- |
| Denied | "Location is blocked for this site. You can turn it back on in your browser's site settings — or just drop a pin on the map." |
| Unavailable | "Your device couldn't get a fix. That usually means no GPS and no known wifi — try again outdoors, or drop a pin on the map." |
| Timeout | "Locating took too long and gave up. Try again, or drop a pin on the map." |
| Charlottesville | The out-of-bounds sentence, plus **"Start from Scott's Addition"** — which, pressed, set the preset and cleared the notice |
| 3100 m accuracy | "…to within about **3.1 km**. A five-minute walk is about 300 m, so a contour drawn from that fix would be mostly guesswork." |
| 140 m accuracy | Accepted. Origin becomes "My location", and a plain `.notice` with `role="status"` reads "Located to within about 140 m — the edges are approximate." |

Three distinct refusals, none of them offering a preset — a permission problem is not solved by
starting from Maymont — and every one of them naming the pin, which always works.

The accepted-with-caveat case exercises the ordering the spec calls load-bearing: the origin action
clears the notice field, so the caveat must be dispatched *after* it or it vanishes.

### The retry, measured

The spec argues that a flat `maximumAge` makes the button visibly do nothing after an accuracy
refusal — a cached fix carries its *original* accuracy, so the identical refusal comes back
instantly. Recorded the options the handler actually passes:

    first press, nothing standing   maximumAge: 60000
    second press, notice standing   maximumAge: 0

### Gates

| Gate | Result |
| --- | --- |
| `npm run typecheck`, `npm run lint`, `npm run build` | clean |
| `npm test` | **191 passing**, 0 failing |
| `verify-bundle` | **81,058 B** gz, **+1,273 B**, under that spec's 2 KB line |
| everything else | clean |

`grep` over `server/proxy.ts` finds no literal bounding box: the proxy imports `RICHMOND_BOUNDS`,
and a new proxy test proves the shared constant is the one in force by accepting a point at exactly
`RICHMOND_BOUNDS.north` and refusing Charlottesville without an upstream call.

### Spec corrections

**`dev:lan` was deliberately not built.** That spec offers two branches in its own words — "a
`dev:lan` script that serves real HTTPS, or nothing" — with the instruction to check it on a real
iPhone *before* adding the dependency. There is no iPhone here, so the conservative branch is
nothing. HUMAN-REVIEW 2.3.

### Deferred

- HUMAN-REVIEW 2.3 — no `dev:lan`, so criteria 6 and 13 stay open and the insecure-context sentence
  cannot be reached on screen.
- HUMAN-REVIEW 5.6 — the "not pre-baked" warm-up notice was never caught on screen. The condition
  held and a real cold ladder warmed, but a local engine answers all 96 rungs in one query, so the
  notice lives about 200 ms. Third time a state has been too fast to catch locally; all three want a
  look at the deployed engine.

### Next

**Chunk 7 — `weather-filters`**, which carries the run's first genuinely deferred decision: the
Open-Meteo licence. GOAL.md's instruction is to fetch the current terms rather than recall them, and
to assume the commercial case — the conservative branch, since a non-commercial assumption that turns
out wrong is a licence breach and the reverse is only wasted caution.

---

## Chunk 7 — `weather-filters` — done, and shipped switched off

The forecast is built, tested, wired and dark. That is the chunk.

### The licence, fetched rather than recalled

GOAL.md's chunk-7 checklist asks for Open-Meteo's *current* terms and for the build to assume the
commercial case. The terms, on 2026-08-21:

> "The free API is for non-commercial use, rate-limited to 10,000 calls/day, and carries no uptime
> guarantee."

Commercial use — their examples are "websites or apps that have subscriptions or display
advertisements" — needs a paid subscription and the key that comes with it. So the conservative
branch applies: **`WEATHER_ENABLED = false` in `src/lib/weather.ts`**, one constant, one file.
`refreshWeather` returns immediately, nothing leaves the browser, and the panel reads "Forecast is
switched off in this build."

The question a person has to answer is one sentence long and it is in HUMAN-REVIEW 2.4: *is Walk
Roulette free and ad-free?* If yes, flipping that line is the whole of the work — no key, no
account. If it ever carries ads or a subscription, it is either a paid plan or `api.weather.gov`,
and the second costs a feature: NWS documents no UV index and no apparent temperature, which is
three of the six rules.

Everything below was observed with the flag flipped on locally, against the real Open-Meteo through
the real proxy. The flag went back to `false` before the commit.

### What it does

Six rules, and the split between them is the design. **Rain** and **storm** produce a `TimeCap` and
nothing else: they cannot remove a candidate, they lower the dial, and the contour visibly shrinks
on the map so the reader can see what happened. **Heat shelter**, **UV shelter** and **cold** are
`PoolRule`s with `minSurvivors: 3`: they steer the pool and set themselves aside rather than empty
it. **Heat flat** is both — a cap of thirty minutes and a veto on hills — and it is `deferred`,
because climb is measured per route now and a place not yet measured must stay in the warm-up's
denominator.

A cap is allowed to empty the pool and a rule is not. That asymmetry is the whole argument: a cap is
the one weather effect you can *see*.

Every sentence names the budget the map is actually drawn at, never the rule's own candidate cap.
Rain at 40 and heat at 30 on a 50-minute round trip: the contour is at 30 and **both** lines say
"Trimmed to 30 min", rather than one of them advertising a 35 that never happened.

### Three bugs the acceptance criteria found, none of which a test would have

1. **The rain cap ate its own window.** The cap lowered `budgetMinutes`, the shorter window no longer
   contained the onset, the rule stopped firing, the cap lifted, and the next render started over.
   On screen it was a dial sitting at 35 with nothing beside it to say why. The window is
   `Session.requestedBudgetMinutes` now — the walk the reader asked for, which a cap cannot move.
   That field is new, and it fixes the same latent bug in **Get back before dark**, which has taken
   the dial and never given it back since chunk 5 (HUMAN-REVIEW 3.7).

2. **`activeFilters` was counting the weather.** The drawer read **FILTERS (2 ACTIVE)** for a cause
   **Clear filters** cannot clear, which criterion 12 forbids in as many words. That number counts
   what the button beside it clears, and nothing else.

3. **A forecast landing mid-throw stayed invisible after the reel stopped.** `holdWeather(false)`
   applied the stash inside an effect and nothing repainted. It returns whether it applied one now,
   and App bumps its own counter.

A fourth, caught by reading rather than running: the empty-pool notice said "3 places are in reach;
4 of them are held back." A cap recovers places from *outside* the shrunken contour, so `drop-rule`'s
copy is arithmetic nonsense of one. `PoolFix` gained a `drop-cap` member with its own sentence
(HUMAN-REVIEW 3.8).

### Gates

| Gate | Result |
| --- | --- |
| `npm run typecheck`, `npm run lint`, `npm run build` | clean; eslint, oxlint and knip all three |
| `npm test` | **246 passing**, 0 failing — up from 191, the largest jump of the run |
| `verify-bundle` | **82,262 B** gz, **+1,250 B**, against that spec's 4,096 B line. 19.7 KB of headroom |
| `verify-places`, `verify-signature` | clean; both new rules are in the REGISTERED table |
| `git diff public/`, `SNAPSHOT_VERSION`, `scripts/build-reach.mjs` | empty — weather cannot be precomputed |

### The endpoint

`GET /api/weather`, no parameters, Richmond pinned in the proxy beside the walking speed. A query
string is a 400 and a POST is a 405, both before anything is spent — and `weatherCacheKey` returns
`null` for either, which is what makes those refusals true in the Worker rather than only in
`proxy.test.ts`. The Worker consults the edge *before* it calls the proxy, so a key that merely
ignored the query string would serve warm Richmond data for Paris with a 200.

Edge-cached 900 s under one constant key, limiter cost 1. Failures speak in the forecast's own
voice: the dev server printed `{"at":"weather","event":"upstream-unreachable",...}` with a dead
upstream, and the body read "The forecast service is not answering." No line anywhere said
`valhalla`. That was the point of writing a second failure vocabulary rather than reusing the
engine's — a forecast blip read as a routing outage is the most expensive wrong diagnosis this
system can produce.

The spec's one genuinely unverified claim — that Cloudflare's Cache API will store an entry keyed
from a real GET, where every other endpoint here keys from a POST — holds against `stubEdgeCache`:
miss, fill, hit, one upstream call across two requests. A real colo is HUMAN-REVIEW 5.7 and one line
in `LAUNCH.md`.

### Acceptance

`docs/plans/acceptance/chunk-07.md`: **81 of 83 ticked**, the best tally of the run. Two open, both
environmental: `prefers-reduced-motion` (5.1, and nothing here animates) and watching the
five-minute ratchet through a real window (5.8 — the clock stops while the tab is hidden, so it is
asserted over twenty simulated minutes instead: exactly four steps, every gap exactly five).

The states that cannot be waited for were injected. `walkRouletteDev.weather(wire)` is dev-only,
inside the same `import.meta.env.DEV` branch as chunk 5's `clockOffset`, and it pushes a forecast
through `readReport` so what lands on screen has crossed the boundary a real one crosses. Richmond
does not supply a heat index in the Danger band on request.

### Spec corrections

Ten, listed in `weather-filters.md`'s new *Corrections after implementation* section. The
load-bearing ones: `dark-return` is deleted rather than deferred (chunk 5 owns darkness, and two
caps on one dial answering to two switches is worse than either); `applyConditionRules` and
`RuleOutcome` are gone in favour of `derivePool` and `PoolRule`s; the cap goes through chunk 5's
`timeCap` rather than an "effective budget", which supersedes criterion 14's "the dial thumb does not
move" — it moves, into a dead zone that says why; and `deriveConditions` is two functions, because a
rule's sentence cannot know the budget until `mergeCaps` has weighed this module's caps against
`daylight-budget`'s.

`pool-reasoning.md` and `daylight-budget.md` each gain an *Amended by chunk 7* note.

### Deferred

- HUMAN-REVIEW **2.4** — the Open-Meteo licence, and `WEATHER_ENABLED`. The one decision in this
  chunk that was meant to be a person's.
- HUMAN-REVIEW **3.7** — `requestedBudgetMinutes`, an amendment to chunk 5's session shape, made now
  rather than after chunk 10 encodes the session into a link.
- HUMAN-REVIEW **3.8** — the `drop-cap` `PoolFix`.
- HUMAN-REVIEW **5.7** — the edge cache keyed from a GET, on a real colo.
- HUMAN-REVIEW **5.8** — the five-minute ratchet, watched in real time.

### Next

**Chunk 8 — `places-expansion`**, which carries the run's most expensive deferred decision and the
one that costs money if it is read late: `HUMAN-REVIEW.md` §6.1, the walking speed. This chunk
recuts all eleven snapshots anyway, which is the only cheap moment to change `WALKING_SPEED_KMH` —
decide now and recut once, or decide later and recut twice. Preconditions: chunks 2 and 3 landed
(both are), `npm run verify` green (it is), and the engine up.

---

## Chunk 8 — `places-expansion` — done

Sixty-two places is a downtown list. It is 242 now, and the pipeline that made it
is committed, reproducible and stops at a page a person clears.

### The deferred decision, settled with 673 routes

`HUMAN-REVIEW.md` §6.1 asked whether the pinned 3.69 km/h survives the elevation
rebuild, and GOAL.md scheduled the answer here because this chunk "recuts all
eleven snapshots anyway". Both halves of that turned out to need correcting.

**The pace: 3.69 stays.** One route cannot answer the question — `use_hills`
makes a descent quicker and a climb slower, and the fixture in §6.1 is a descent
to the river, so it measures the effect at its largest. Measured across every
direction instead: all 11 presets to all 62 places, 673 real routes, **mean
effective pace 3.606 km/h**. That is 2.3% *slower* than the pin, not faster. The
app under-promises by less than the difference between two people's walking.
`scripts/measure-pace.mjs` is committed, because this question returns every time
the graph is rebuilt.

**The escape hatch was fiction.** GOAL and §6.1 both call it "one constant"; it
was in three files, and the third was `verify-engine.mjs`, which asserts the
engine's answer against its own literal — so a changed pace would have left the
checker checking the wrong number and reporting green. One literal now.

**And the deadline was imaginary.** `build-reach.mjs` reads `PRESET_ORIGINS` and
nothing else. A snapshot is a contour ladder; it knows nothing about places. This
chunk regenerates **zero** snapshots, `SNAPSHOT_VERSION` is untouched, and the
"decide now or recut twice" pressure did not exist. HUMAN-REVIEW 3.9.

### What the terrain deletion was worth

Chunk 3 removed `Place.terrain` before this ran, and README §2.4 predicted this
would be the largest single simplification in the plan. It was: the relief ring,
`terrainFromRelief`, the null-abort, the elevation prerequisite and **nine
`/api/locate` probes per candidate** all come out. One locate per candidate
instead of nine is roughly 5,400 upstream calls removed, which is the difference
between a propose run that takes minutes and one that takes an afternoon.

### Coverage, which is the whole argument

Measured from the centroid of the preset origins:

| | before | after |
| --- | --- | --- |
| SE / NW / SW / NE | 29 / 16 / 9 / 8 | 95 / 79 / 29 / 39 |
| south of the James | 4 | 25 |
| west of −77.488 | 1 | 33 |
| north of 37.56 | 5 | 59 |

And the one that matters most: **a 100-minute round trip with Far edge only now
has 38 candidates.** That band is what this feature exists for, and it was
frequently empty.

### The gate refused 434 and accepted 180

Four of those rules exist *because the first run produced something wrong and it
was read rather than shipped*. None of them is a data rule; all four are
judgements, which is exactly the work a human reviewer was meant to do:

1. **38 of 52 markers were street addresses** — Historic Richmond house plaques
   named "2816 E. Grace". A street address is not an offer.
2. **Three ghost bikes** came through as "Marker: Robyn Hightman" — a memorial
   where a named cyclist was killed in traffic, drawn at random and presented as
   a small delight. The card has no room to say otherwise.
3. **34 of 63 gardens are community allotments** — a membership of raised beds,
   usually gated.
4. **`tourism=gallery` is refused wholesale.** Most of the 18 are commercial art
   dealers and nothing in the tags separates them from The Anderson. Unsure is a
   rejection, and this data layer has already shipped one closed storefront.

A fifth came from the corpus rather than a row: the Canal Walk is tagged as
several ways more than 90 m apart, so it arrived twice on top of the
hand-curated one. Distance dedup cannot see that; name dedup can.

HUMAN-REVIEW 2.6 has the full tally and the three committed artefacts.

### Two measurements the spec asked for by name

- **`osm` costs 1,288 B gzipped** over 180 rows — built twice to find out, which
  is what open question 1 asked for instead of a decision on the estimate. It
  stays; chunk 9 is its consumer.
- **38.8 B gzipped per generated row**, against an estimate of 50. Lower for the
  reason the spec predicted: in a real bundle these rows share a dictionary with
  the rest of the app JS, which a standalone file cannot.

### The 250-place performance work, measured

`syncPlaces` re-uploaded the whole FeatureCollection on every reel tick, because
the winner was a `state` value on the shared source. The winner has a
one-feature source of its own now. Instrumented with a counter at 242 places:
**syncPlaces 0, syncPicked 2 across a whole throw.** Before the split those were
the same function.

The wide prefetch wave is capped at 90, nearest-first. Uncapped it is one
`/route` per place inside the 100-minute contour — up to 242 rate-limit units per
origin change, against a route cache that holds 200. The cost is stated rather
than hidden: `CACHE_LIMIT` was sized so revisiting a start stays instant for "a
few" origins, and that is now about two.

### Gates

| Gate | Result |
| --- | --- |
| `npm run typecheck`, `npm run lint`, `npm run build` | clean, including over `scripts/` |
| `npm test` | **294 passing**, 0 failing |
| `verify-bundle` | **89,244 B** gz, **+6,982 B**; 12.8 KB of headroom |
| `verify-places` | 242 of 242 through a live `/locate`; worst snap still `diamond` at 51 m |
| `git diff public/` | empty — no snapshot recut |

### Acceptance

`docs/plans/acceptance/chunk-08.md`: **84 of 85 ticked**. One open,
`prefers-reduced-motion` (5.1), and this chunk animates nothing.

Two criteria are ticked as **superseded** rather than met, both by chunk 3's
deletion of `Place.terrain`. One, criterion 9, is ticked at a lower standard than
it asks — `/api/locate` was exercised live under `npm run dev` and asserted
through `handleWorkerRequest` with a stubbed edge, not under `wrangler dev`,
which no endpoint in this repo has ever been. Named rather than ticked past.

### Spec corrections

Nine, in `places-expansion.md`'s new *Corrections after implementation*. The
load-bearing ones: the terrain half is gone; the tier is a `PoolRule` rather than
a fifth positional argument; `activeFilters` needed no change because it already
counts rules; and `apply-places.mjs` counts by importing the module, having
walked into **both** documented miscount traps in one sitting — 81 for 62 with a
whole-file regex, 61 with a scoped one that skips `pyramid`.

### Deferred

- HUMAN-REVIEW **2.5** — the walking speed, settled at 3.69 with the measurement.
- HUMAN-REVIEW **2.6** — the automated gate standing in for the human one, with
  its four judgement calls and the committed artefacts.
- HUMAN-REVIEW **3.9** — chunk 8 recuts no snapshots; GOAL's premise corrected.

### Next

**Chunk 9 — `opening-hours`**, which chunk 8 was ordered before precisely so that
every generated row arrives carrying `osm` and only the 62 hand-curated rows need
that spec's manual identity backfill. Preconditions: chunks 0, 2, 5 and 8 landed
(all are), `npm run verify` green (it is), and `harvest-osm.mjs` already carries
the query family that spec needs.

---

## Chunk 9 — `opening-hours` — done

The README's one confession is gone: *"A spin can send you to a closed lot."*

### The ordinance, and why it changed a type

GOAL.md's chunk-9 checklist asks for Richmond's park-hours ordinance to be
researched, cited and quoted rather than assumed. The spec shipped
`sunrise-30` to `sunset+30` as an admitted placeholder.

The City of Richmond Parks and Recreation *Rules and Regulations*, developed
under section 58-1 of the Code of Ordinances:

> "The parks are open to the public from 5:00 a.m. until dusk and in areas in
> which lighting is provided the area is open until 11:00 p.m."

Both edges were wrong, and the open edge was wrong in a way that changed the
**shape** rather than the numbers: a fixed opening time and a solar closing time
cannot be expressed by two solar references, so `SolarRule`'s edges became a
union with a `clock` ref. Had the placeholder been right, that union would not
exist — which is a small argument for reading the source before building the
type.

The lighted-areas exception is deliberately not modelled. Nothing in OSM says
which areas are lit, and assuming a park is lit is how somebody ends up in a
dark field at ten o'clock. HUMAN-REVIEW 2.7 has the sourcing, including the part
worth knowing: this is the Parks department quoting the ordinance, not § 58-1
itself, because Municode 403s automated fetches.

### The backfill: 42 matched, 20 refused

`opening-hours` calls filling in `osm` for the hand-curated rows "a real
afternoon, not a footnote" — each one a person confirming that this element *is*
that destination. Two thirds of it turns out to be machine work, if the machine
refuses to guess.

**42 of 62 matched. 20 did not, and none was guessed.** A match needs the name,
the distance, uniqueness *and* substance, all four. The four ambiguous cases are
the ones that prove the rule is doing something: `capitol` collided with Capitol
Square Parking, `forest-hill` with its own car park, `st-johns` with two
overlapping historic districts that are not the church, `exec-mansion` with its
own carriage house. Every one of those, guessed wrong, would state a confident
schedule belonging to a different building.

HUMAN-REVIEW 2.8 lists all twenty. That is the size of the afternoon still owed.

### What it does

Coverage is **118 of 242**, stated rather than hidden: 25 from OSM, 93 from the
one park assumption, and 124 places that say nothing at all — which is the
honest answer and the reason `unknown` is a first-class state that never renders
as "open".

Judged at **arrival**, twice over and deliberately differently: the pool at the
dial's outbound budget quantised to the half hour, the card at the settled route
duration, unquantised. They are allowed to disagree, and the card is never
silenced to protect the filter's story.

No parser ships. `opening_hours` is 108 KB gzipped and LGPL-3.0-only; it is a
devDependency that runs once and bakes a 336-bit weekly mask per place. `grep`
over `dist/` confirms it is absent.

### Three bugs found by reading output, not by any test

1. **`sunrise-sunset` was baking into 72 segments per place.** The classifier
   the spec specifies was simply not written, and the symptom was a 76 KB
   generated file — the exact cost the spec warns about in as many words, "more
   bytes than every fixed schedule combined". Seven values ride as rules now and
   the file is 14 KB.
2. **The park rule was written out 93 times.** Identical `solar` objects on
   every park entry, which cost bytes and made "the default lives in one
   constant" false. The table carries a list of ids; the runtime holds one
   `PARK_RULE`.
3. **The card said the same thing twice.** Chunk 2 already renders an amber
   "Shut when you would get there." for a pick excluded as closed; the hours
   line added a neutral "Likely closed when you arrive." underneath. The hours
   line stands down when the verdict has said it.

Both build-time assertions the spec demands earn their keep on every bake: the
solar one prints "sunrise-sunset is 15 h on 2026-06-15, not a flat 12 h", which
is the numeric-lat/lon trap failing to bite; the DST one proves a fixed schedule
is still one segment, which is epoch arithmetic staying out.

### The byte line, and why it is superseded rather than met

Criterion 7 asks for under 2 KB. Measured: **+3,932 B**.

The line was set against an assumed coverage of "near 15 of 62". Chunk 8
quadrupled the dataset and coverage is 118. Per covered place the cost is **33 B
against that spec's own implied 47** — the per-place estimate was good, the
place count moved. The real gate, the 102,400 B ceiling, holds with 9.0 KB to
spare. Ticked as superseded with the arithmetic beside it rather than quietly.

### Gates

| Gate | Result |
| --- | --- |
| `npm run typecheck`, `npm run lint`, `npm run build` | clean |
| `npm test` | **310 passing**, 0 failing |
| `verify-bundle` | **93,176 B** gz, **+3,932 B**; 9.0 KB of headroom |
| `verify-places` | 242 of 242, including the 42 new `osm` ids |
| bake reproducibility | two consecutive bakes byte-identical apart from `bakedAt` |
| `git diff server/ worker/ wrangler.toml public/` | empty — no runtime traffic added |

### Seen on screen

At about 18:45 Richmond time, which was a useful hour: three museums had closed
at 17:00, so the feature had something true to say with no clock trickery.

The pool read **"44 to spin · 3 shut"**; the drawer grouped them under **SHUT ON
ARRIVAL (3)** — Poe Museum, Richmond Railroad Museum, First Freedom Center. The
switch off restored 47 with no reload. A closed card showed one amber sentence.
A park with no OSM hours read "City parks open at 5 am and close at dusk —
assumed, not from OSM." in the quieter tier; a park *with* OSM hours read "Open
when you arrive" instead.

### Acceptance

`docs/plans/acceptance/chunk-09.md`: **78 of 81 ticked**. Three open —
`prefers-reduced-motion` (5.1), the phone-width look at this specific line
(inherited from chunks 7 and 8 rather than repeated), and a park at 22:00 (the
clock stops while the tab is hidden, 6.3, so it is asserted at 21:30 instead).

### Spec corrections

Eight, in `opening-hours.md`. The load-bearing ones: the ordinance, the missing
solar classifier, the superseded byte line, and the `frozenArrivalRef` latch
this spec asks for and does not need — `useConditions(origin, frozen)` already
holds the clock through a throw, exactly as README section 2.1 predicted.

### Deferred

- HUMAN-REVIEW **2.7** — the park ordinance and `PARK_RULE`.
- HUMAN-REVIEW **2.8** — the twenty places with no OSM identity, listed.
- HUMAN-REVIEW **5.9** — the warning gate drops the Virginia Holocaust Museum;
  open question 2 is live with exactly one name attached.
- HUMAN-REVIEW **5.10** — the two hours states that need a clock that moves.

### Next

**Chunk 10 — `shareable-spins`.** Preconditions: chunks 0, 2, 3 and 8 landed
(all are), `npm run verify` green (it is). It is the first chunk that serialises
the session, which is why `requestedBudgetMinutes` was added in chunk 7 rather
than after a link format existed.

---

## Chunk 10 — `shareable-spins` — done

A good spin is shareable now. It was not: you got sent to Great Shiplock Park
from a 34-minute round trip out of Carytown, and the address bar offered the
front door of the app — a different question with a different answer.

    /s?o=carytown&b=34&rt=1&p=shiplock

### Why this had to be last

Every earlier chunk changed what a session *is*: `climb` replaced `terrain`,
`kind` appeared, `osm` appeared, three condition switches appeared. A format
frozen before those landed is a format that needs a migration the day after it
ships — which is the whole thing a readable query string exists to avoid. Being
tenth is the feature, not the schedule.

The amendment in README §4 is applied in full: the link carries the walk
(`o`, `b`, `f`, `rt`, `p`) and the *place* filters (`c`, `v`, `e`, `k`), and
**none** of the condition switches. Those are about the recipient's here-and-now.
A link that switched off somebody's daylight guard would be a trap; one that
switched it on would be a lie about what the sender did.

### The deferred decision: a pin is published at 110 metres

Open question 2, which GOAL.md names as a decision meant to be a person's.
Sharing a preset publishes an id; sharing a dropped pin publishes a coordinate,
and at the five decimals the contour cache uses that is about a metre — for a
geolocated or home pin, somebody's front door, in a link built to be forwarded.

**`PIN_PRECISION = 3`**, about 110 m. Enough to say "start around here", not
enough to say which door. Same number `meet-in-the-middle` pins its meet point
at, deliberately: one number for how precisely this app is willing to publish a
person's location. The cost is real and already designed for — the recipient's
reach is a slightly different shape, so the shared destination can fall outside
it, and that degrades to a sentence rather than a substitution because the card
shows the destination anyway. HUMAN-REVIEW 2.9.

### Two things removed after being written

Both for the same reason, and both found by reading the screen rather than by
any test.

1. **`unavailableReason` duplicated chunk 2.** The card already renders one
   warning row per exclusion reason, so the prop printed "Further than your
   budget walks." above "Outside your current time budget." This spec's own
   `## Depends on` says the contract "is satisfied by machinery that is already
   built" — and then the file-by-file section adds a prop anyway. Same shape of
   mistake as chunk 9's hours line, caught the same way.
2. **The canonical tag cannot ship an `href`.** Vite's HTML plugin treats
   `link[href]` as an asset reference and tried to open `/` as a file — `EISDIR`,
   build failed outright. It ships with no `href` and the Worker supplies an
   absolute one, which is the honest default for a repo that does not know its
   own domain.

### What the Worker does, and the three things it must not do

`/s` fetches **`/`** explicitly and never `env.ASSETS.fetch(request)`:
`not_found_handling` defaults to `"none"`, so a `/s` request matches no asset
and comes back 404, which would turn every careful degradation here into a
broken link. It fetches `/` rather than `/index.html` because `html_handling`
defaults to `auto-trailing-slash` and answers the latter with a 307.

Its own named edge cache, so a test can prove nothing landed in the isochrone
one. **No entry at all for a dropped-pin origin** — coordinates are the one
field with an unbounded value space, and a pin link is sent by one person
anyway. **A HEAD never fills the cache**, because crawlers issue HEAD and a
stored empty body would be served to the next GET of the same spin.

The cache key carries the *whole* canonical query rather than a digest of the
fields the sentence uses: two spins differing only in a filter are different
documents, and keying them together would hand the second sender's crawler the
first sender's `og:url`.

### Gates

| Gate | Result |
| --- | --- |
| `npm run typecheck`, `npm run lint`, `npm run build` | clean |
| `npm test` | **346 passing**, 0 failing |
| `verify-bundle` | **95,675 B** gz, **+2,499 B** against a 3 KB line; 6.6 KB of headroom |
| `share-meta.ts` in the client bundle | zero — grep finds neither `shareMeta` nor `__share` |
| `git diff public/_headers public/reach/ wrangler.toml`'s `not_found_handling` | unchanged |

### Seen on screen

A link opened cold restored Carytown at 34 minutes with the card and route on
the **first frame**, no reel. The destination was outside the recipient's pool
at that budget and was shown anyway, with "Further than your budget walks."

**The address-bar rule, which is the subtle one, behaved exactly as designed:**
moving the dial cleared the URL to `/` on the next paint while "Spin your own"
stayed. That distinction is the entire reason `SharedArrival.linkQuery` exists —
the arrival is about how this session started, and the URL is about whether it
still describes the screen, and they expire at different moments.

A link naming a deleted place showed its notice, kept Carytown and 34 minutes,
enabled Spin and rendered no card. The Share button's full fallback chain ran
for real: this browser has `navigator.share`, it threw, the clipboard then
refused, and the manual fallback caught it with the URL focused and selected.

### Acceptance

`docs/plans/acceptance/chunk-10.md`: **65 of 74 ticked**. Nine open, and three
of those are checks the spec itself says only a deployment can make —
`run_worker_first` lives in `wrangler.toml` and nothing local can prove `/s`
reaches the Worker or that `/site.webmanifest` still does not. All three are
curls in `LAUNCH.md`. HUMAN-REVIEW 5.12.

The rest are the usual local limits plus one that matters more than usual: the
actions grid gained a fourth control and was seen only at rail width
(HUMAN-REVIEW 5.11).

### Spec corrections

Six, in `shareable-spins.md`. Also two of its "unverified, check first" items
resolved: Vite's dev server **does** serve the document for `/s`, so the
reserve plugin change is unnecessary; and the Worker's public-hostname question
remains open because it needs a deployment.

### Deferred

- HUMAN-REVIEW **2.9** — the shared pin precision.
- HUMAN-REVIEW **5.11** — the share control at a phone width, and the two share
  states this browser refused.
- HUMAN-REVIEW **5.12** — the three checks that need a deployment.

### Next

**Chunk 11 — `multiplayer-links` + `meet-in-the-middle`, as one landing.** The
last chunk, and the plan is explicit that 11a and 11b land together: knip is
never green on 11a alone, so it must never be committed alone. Preconditions:
every other chunk landed, `npm run verify` green, and `share.ts` in place for
it to grow `m`/`ma`/`mb`/`d` onto — with `PIN_PRECISION` already settled at the
3 decimals that spec's `MEET_PIN_PRECISION` asks for.

---

## Chunk 11 — `multiplayer-links` + `meet-in-the-middle` — done

The last chunk, and the only one that is not shippable in halves. Two people, two
doors, one question: *where can we both walk to in half an hour?*

    /s?m=1&ma=carytown&b=30&rt=1

### One landing, and the plan was right about why

11a alone adds `partner`, `originChosen`, `partnerWarmed` and `partnerFailure` to
the session and nothing reads them — knip fails on the dead exports, and worse, a
link would decode into a session the UI does not render, which is an invite that
silently does nothing. Landed as one commit. The two specs' joint criteria (5, 6,
6b, 13) were verified once, on the pair.

### The two specs contradicted each other, and the browser is what found it

`multiplayer-links` criterion 5 says opening an invite makes **zero** requests.
`meet-in-the-middle` decision 8 says the map frames on the partner's contour
alone in that same state — which needs their ladder warmed. Both cannot be true.

I built the second and shipped the first only after opening an invite with the
network panel open and watching Carytown's snapshot being fetched. For a **pin**
partner — which is nearly every real meet link — that is 96 contours and up to 24
upstream graph expansions charged to somebody who has been sent a link and has
not answered it. A forwarded invite would charge a third party who had no part in
the exchange at all.

The criterion wins. The partner's leg is gated on `originChosen` beside the
reader's own, so **nothing at all is warmed until they choose a start**. The cost
is honest and stated: the recipient sees an empty map and a question, which is
less than the sibling spec wanted and the only version that keeps the promise
printed on the same screen. HUMAN-REVIEW 3.10.

**Not one unit test changed behaviour across that fix.** They passed before and
after, because what changed is which effect runs, not what any function returns.

### Three more the browser caught and no test could

1. **The panel said "15 minutes" for a 30-minute link** — handed outbound minutes
   where the sentence speaks the dial's language.
2. **The dial read "loading reach 0%" forever during an invite**, promising a
   measurement that was never coming. `TimeDial` gained one optional `warming`
   prop: silence is the honest state, not zero.
3. **The partner's contour never reached the map on an answer link.** Every
   per-source effect returns early until the style is ready, so a value already
   set when `load` fired was never uploaded — its dependency never changes again.
   `syncAll` exists for exactly this and had not been told about the new source.
   The camera had the same lag: their ladder lands after yours by design and
   `framingKey` does not bump again, so it framed your contour alone and left
   half the answer off screen.

### What the geometry does, and what it refuses

`contains(yours) && contains(theirs)`, as a ninth `ExclusionReason` evaluated
inline in the geometry section rather than as a `PoolRule` — a rule runs after the
reader's chips, so a place three miles from the other person would report "wrong
climb" as its primary reason. `REASON_ORDER` puts it third, after `inside-floor`.

**No overlap polygon, no overlap area, no clipper.** `subtract()` is forbidden by
name in `meet.ts`'s header and the comment says why: it appends an inner ring as a
hole to whichever outer polygon contains its first vertex, which is sound for one
origin's nested contours and meaningless for two that cross. The two fills simply
composite, and the app never measures or names the denser region. **No dependency
was added — the largest single cost decision in the chunk was refusing one.**

### The empty overlap is the arrival state

Measured over four preset pairs: at 20 minutes all four share nothing; at 30,
three still do. So `widen-to-meet` is the opening move, not a recovery path. When
the pool is empty and both warm-ups report done, `meetMinimum` scans both cached
ladders ascending for the first rung where a place is inside both.

Two things it does deliberately. It **skips a rung the engine has no answer for
and counts it** — `prefetchLadder` is best effort per contour, so a null after a
completed warm-up means *never*, not *later*, and the first draft's version would
have said "Waiting on their side." forever over one dropped contour. And it
compares against `MAX_MINUTES` **before** clamping, because `clampBudget` ends in
`Math.min(MAX_MINUTES, …)` and a post-clamp check can never fire.

### Gates

| Gate | Result |
| --- | --- |
| `npm run typecheck`, `npm run lint`, `npm run build` | clean |
| `npm test` | **418 passing**, 0 failing — +72, the largest jump of the run |
| `verify-bundle` | **101,133 B** gz, **+5,458 B**; **1,267 B** under the ceiling |
| `verify-places` | 242 places, worst snap 51 m |
| `npm run verify` | **all 6 steps clean** |
| `git diff wrangler.toml worker/ server/proxy.ts public/` | **empty** |

The Worker gained **zero lines**, exactly as the spec promised. Every meet
decision lives in the two pure modules it already imported.

### Acceptance

`docs/plans/acceptance/chunk-11.md`: **73 of 100**. Seven `[!]`, twenty `[ ]`, and
the three that matter:

- **The bundle.** +5,458 B against the two specs' combined 4,608 B allowance — 850 B
  over, and both specs say the figure was never measured. The binding gate held
  with 1,267 B of headroom. I checked whether the verbatim disclosure copy was
  the cause by collapsing it and rebuilding: 0.2 KB. The rest is code.
  HUMAN-REVIEW 6.4.
- **`meetMinimum` was never timed**, which that spec's open question 3 says
  explicitly must not ship. HUMAN-REVIEW 5.13.
- **`MEET_PIN_PRECISION` does not exist and should not.** Chunk 10 shipped
  `PIN_PRECISION = 3` first, for the same privacy reason, with a comment saying
  in advance that this chunk would share it. Recorded as a fail rather than
  ticked on a technicality.

### Spec corrections

Nine in `multiplayer-links.md`, six in `meet-in-the-middle.md`. The one that
earned its test: **the total key order is `c, k, v`, not `c, v, k`** — that
document insists, correctly, that the solo subset stay byte-identical to chunk
10's, and then writes it the other way round. Test 34 caught it on its first run,
which is precisely what it was written for, and the fix was the one prescribed:
match chunk 10's bytes, never bump `SHARE_CACHE_VERSION`.

Also: `meetShape` is `meetKind`, because the repo's own anti-slop rule refuses
"shape" in a symbol name; and `describeInvite` was dropping its own `originName`
on the floor while the `shareMeta` section required it to be used.

### Deferred

- HUMAN-REVIEW **2.12** — one pinned pace for two walkers. The last of the six
  decisions this run was told were meant to be a person's.
- HUMAN-REVIEW **3.10** — the specs' contradiction, decided.
- HUMAN-REVIEW **5.13** — `meetMinimum` unmeasured.
- HUMAN-REVIEW **5.14** — the states one desktop browser could not reach.
- HUMAN-REVIEW **5.15** — one device, so no cross-device check.
- HUMAN-REVIEW **5.16** — the engine's port forward, which cost the regression spin.
- HUMAN-REVIEW **6.4** — the bundle overage.

### Next

**Nothing. Chunk 11 was the leaf of the plan and all twelve chunks are in.** What
remains is GOAL's Step 6: `HUMAN-REVIEW.md` is written but wants a final read, and
the feel pass has to be prepared — the cold-clone command, the TUNE panel, the
walkthrough, the copy list, and documented ways to reach the three states that are
hardest to reach on purpose. Two of those three are now easy to name: **no
overlap** is the *default* for any preset pair at a round trip, and **dark** is
whatever this machine's clock says. The empty pool still needs a recipe.
