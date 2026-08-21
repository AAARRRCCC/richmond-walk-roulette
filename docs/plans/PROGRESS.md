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
