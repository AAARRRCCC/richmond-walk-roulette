# Human review — everything the v0.5 run decided without you

Written as the run goes, never assembled at the end from memory. Six sections, worst first, so a
person arriving cold reads the things most likely to be wrong before the things most likely to be
fine.

The run itself is unattended. Every decision that would once have blocked on a person was instead
decided provisionally, isolated so it is cheap to reverse, and logged here with the file and constant
that reverses it.

---

## 1. Gates I weakened

Every test changed, rule loosened, threshold raised, or budget widened, with the reason. Empty is the
expected answer; a non-empty section is the first thing to read.

_None._

---

## 2. Decisions I made that were meant to be yours

One entry each. Every entry carries the question, the branch taken, why it was the conservative one,
the exact file and constant that reverses it, and what else would have to change if it were reversed.

### 2.1 The bundle ceiling is 100 KiB, not the 64 KB the repo README claims

**The question.** `scripts/verify-bundle.mjs` needs a number to fail against, and the repo has two
candidates that disagree: README line 91 claims 64 KB of app JavaScript, and `docs/plans/README.md`
§5 measures the checked-in build at 71.2 KB and predicts v0.5 lands "just under 100 KB".

**The branch taken.** `ceiling: 102400` — 100 KiB — in `scripts/bundle-budget.json`.

**Why it is the conservative one.** 64 KB is not a budget in this repo, it is a stale claim: the tree
was already 7 KB over it before v0.5 began, so a gate set there would be red on every commit from the
first one, and a gate that is always red is a gate everybody learns to pass with `--force`. 100 KiB is
the number the plan actually spends against, which makes it the only figure that can fail
*informatively* — it fires when a chunk overspends its estimate rather than when the run starts.

**What reverses it.** One number: `ceiling` in `scripts/bundle-budget.json`. Nothing reads it but
`verify-bundle.mjs`.

**What else would have to change.** Getting back under 64 KB is its own piece of work with its own
lever — `docs/plans/README.md` §5 names it as the `@phosphor-icons/react` import surface — and it is
deliberately not smuggled into any v0.5 chunk. Lowering the ceiling without doing that work turns
every subsequent chunk red.

### 2.2 The measured baseline is 71,205 bytes, and that number is now the one in the repo

Recorded in `scripts/bundle-budget.json` under `history`. Vite prints 71.34 **kB** (decimal); this
gate measures 69.5 **KiB** (binary) at gzip level 9. Both describe the same 71,205 bytes. Every
figure in `bundle-budget.json` is bytes, so no unit argument can hide in it.

---

## 3. Plan-level decisions

Anywhere a spec turned out wrong in a way that changed sequencing, scope, or a shared contract.

### 3.1 Chunk 0's `src/lib/bounds.ts` landed with the harness, not with chunk 0

**What happened.** `scripts/verify-places.mjs` asserts every coordinate falls inside the proxy's
bounding box, and GOAL.md requires it to *import* that box rather than restate it — there is to be
exactly one bounding box in the repo. That box lived as a `const` inside `server/proxy.ts` and was
not exported. The harness is built before chunk 0, so the extraction had to come with it.

**What landed.** `src/lib/bounds.ts`, and `server/proxy.ts` importing it in place of its private
const. It shipped with the harness under provisional names and was renamed inside chunk 0 to the
names `geolocate.md` actually writes — `Bounds`, `RICHMOND_BOUNDS`, `insideRichmond` — so the module
that lands early is the module that spec will find when it arrives. Behaviour identical; the proxy's
own tests pass unchanged, and `bounds.test.ts` covers the three cases that spec names.

**Why it is safe to have moved.** It is the first bullet of chunk 0 and a pure extraction with no
user-visible surface. Chunk 0's acceptance file ticks it as landed here rather than there, and says
so.

### 3.2 `scripts/verify-signature.mjs` is deliberately not built yet

GOAL.md §1 lists it in the harness. It asserts that deriving the candidate set twice from identical
inputs yields byte-identical signatures and keys — but the registry it would assert against,
`src/app/eligibility.ts`, does not exist until chunk 2, and GOAL.md's own wording is "from chunk 2
onward". Building it now would mean a script that either tests nothing or tests a stand-in, and a
check that passes vacuously is a fail.

**It is therefore chunk 2's first deliverable, not an omission.** Chunk 2's acceptance file carries
`verify-signature exists and passes` as its first box, and no chunk from 2 onward can be reported
done without it.

### 3.3 "Fully ticked" excludes boxes recorded in section 5

**The problem.** GOAL.md makes "every earlier chunk's acceptance file is fully ticked" a precondition
for the next chunk. One box in the universal checklist cannot be answered from this machine at all -
`prefers-reduced-motion` (section 5.1) - so read literally, no chunk can ever be done and the run
stops at chunk 0 with everything else green.

**The branch taken.** A chunk counts as done when every box is ticked *except* ones recorded in
section 5 as environmentally unobservable, each with the reason in its own acceptance file.

**Why it is the conservative one.** The alternative that keeps the letter of the rule is to tick a
box that was not observed, which is the single thing GOAL.md says makes the whole document
worthless. This way the box stays visibly open, in the file, forever, and lands in front of the
person doing the feel pass - which is where a "needs a real device" check belongs anyway.

**What reverses it.** Nothing structural. Run the pass on a machine where the media feature can be
set and tick the boxes; they are one line each in `docs/plans/acceptance/chunk-*.md`.

### 3.4 The eleven snapshots were regenerated rather than accepted

**What happened.** The graph rebuild moved the contours. `verify-drift` measured 4.44% worst-case
area drift at the 25-minute rung from Maymont, against a 1% threshold — and, more interestingly, **0**
place-membership flips: every contour moved and no place changed sides.

**The branch taken.** Regenerated all eleven and bumped `SNAPSHOT_VERSION` 2 → 3.

**Why it is the conservative one.** It is the checklist's own wording: a stale snapshot lies, a
regenerated one only costs engine time. Here it cost **2.9 seconds** — the whole ladder for one origin
is a single upstream query at `VALHALLA_MAX_CONTOURS=100`, so eleven origins is eleven queries against
a local engine. There was no trade to think about.

**What reverses it.** `git checkout` of `public/reach/` and `SNAPSHOT_VERSION` back to 2, though
there is no reason to: `verify-drift` reads 0.00% and 0 flips afterwards.

### 3.5 `verify-drift` was measuring the snapshot's own rounding and calling it drift

Not a decision so much as a defect found by using the tool. A freshly cut snapshot still read
1.0–1.3% on three origins, which cannot be drift — it was cut from the engine it was being compared
to. The cause: `build-reach.mjs` writes vertices at 4 decimals, about 11 m, and at the 5-minute rung
the contour is a few hundred metres across, so 11 m of vertex rounding is worth about 1% of its area.

The tool now rounds the live contour to the snapshot's own recorded `coordPrecision` before
comparing. Both sides quantised the same way; what is left is the real thing. Afterwards the same
eleven read 0.00%.

Worth stating plainly, because it is the one place in this run where a threshold looked wrong and the
answer was to fix the measurement rather than move the line: **the threshold is still 1%.** It was
never touched.

---

## 4. Unticked boxes

Every `[ ]` and every `[!]` left standing, by chunk, with what stopped it. Blocked and skipped chunks
go here.

**Chunk 3 — three boxes.** 73 of 76 ticked.

- [ ] *`prefers-reduced-motion`.* Section 5.1. The chart has no animation.
- [ ] *The result card at a phone width.* Section 5.3.
- [ ] *`elevation-profile` criterion 14 — the measuring gate on screen.* Section 5.4.

**Chunk 2 — two boxes.** 68 of 70 ticked.

- [ ] *It was seen with `prefers-reduced-motion` on.* Section 5.1. This chunk adds no animation.
- [ ] *`pool-reasoning` criterion 5 — the `widen-budget` notice, on screen.* Section 5.2. Asserted by
  three tests; never reached in a browser.

**Chunk 1 — one box, and it is section 5.1's.** 59 of 60 ticked.

- [ ] *It was seen with `prefers-reduced-motion` on.* Not observable here; see 5.1. Chunk 1 renders
  nothing at all, so nothing in it is at risk from it.

**Chunk 0 — one box, and it is section 5.1's.**

- [ ] *It was seen with `prefers-reduced-motion` on.* Not observable from this machine; see 5.1. Chunk
  0 added no animation, so nothing in this chunk is at risk from it.

Every other box in `docs/plans/acceptance/chunk-00.md` is ticked, 53 of 54, each with a note saying
how it was observed.

---

## 5. Things I could not observe

Anything needing a real phone, a second person, a GPS fix outside Richmond, a specific season, or
weather that did not occur during the run. Not failures — the work this pass inherits.

### 5.1 `prefers-reduced-motion: reduce` — every chunk

The browser tooling available to this run cannot emulate the media feature, and the machine it runs
on reports `no-preference`, which is a system setting and not mine to change. So the universal
checklist's reduced-motion box is open on every chunk, and will stay open until somebody runs the
walkthrough with the setting on.

**What is known without observing it:** `src/styles/app.css` carries a
`@media (prefers-reduced-motion: reduce)` block, and chunk 0 added no animation, transition or
transform of any kind — its only new render path is a `<div>` of `<p>` elements. The risk this box
covers is real for chunks 2, 3 and 11, and near zero for chunk 0.

### 5.2 The `widen-budget` empty-pool notice, in the browser

`pool-reasoning`'s acceptance criterion 5 asks for the dial to be wound down until nothing is in
reach, so the notice names the nearest match and offers a budget. Every origin this session could
construct kept at least one place at the dial's floor — Home holds 3 at 10 minutes, Scott's Addition
1 — so the state was never reached on screen.

It is asserted by three tests instead (20, 21, 22), including the `MAX_MINUTES` refusal that a
post-clamp check silently passes. What is owed is one look at the real notice, from an origin far
enough out that ten minutes reaches nothing. The walkthrough should name a pin that produces it.

### 5.3 The result card at a phone width

The 390px iframe probe renders the rail, but the result card only exists after a spin, and the probe
frame cannot be driven through one from outside. So the elevation chart, its scrubber and its
figcaption have been seen only at desktop width.

The chart is `width: 100%` inside `.result`, which is the column the probe *did* render without
overflow, so the risk is the figcaption's three-item flex row wrapping rather than the chart itself.
One look on a phone settles it.

### 5.4 The "Measuring climb n/total" gate, on screen

`elevation-profile`'s criterion 14 asks for the Spin button to read `Measuring climb n/total` and
**stay** disabled past the twelve-second grace, until every base candidate has settled. That is the
behaviour the whole `deferred` rule exists to produce.

It could not be caught here. A local Valhalla plus the prefetch settles all 26 routes faster than the
DOM can be sampled — polling every 80 ms against a cleared route store still only ever saw `Spin`.
The spec's own method is to throttle the network, which this session has no way to do.

What is known without seeing it: the gate is `routesPending && (state.climb !== "any" ||
!warmGraceOver)`, so with a climb filter on the grace is bypassed entirely; the denominator is
`pool.baseIncluded.length`, which a test asserts cannot shrink; and no spin was aborted mid-throw in
any run this chunk. What is owed is one look with the network throttled.

**Two things that were nearly in this section and are not**, because a way to observe them was found
rather than assumed:

- **Phone viewport.** `resize_window` reports success and the viewport does not move. The app mounts
  in a 390px iframe on its own origin instead, where media queries evaluate against the frame, and
  the real bottom-sheet layout renders with no horizontal overflow. Good enough to see the layout;
  not a substitute for a real phone's touch targets, which the feel pass still owes.
- **Network-free dial scrub, and the snapshot cold start.** Both are readable from the network panel
  and both were measured rather than inferred.

---

## 6. Numbers

Final measurements, replacing `docs/plans/README.md` §5's estimates.

| Measurement | Value | When |
| --- | --- | --- |
| App JS, gzipped, excluding MapLibre | 71,205 B (69.5 KiB) | Harness baseline, v0.4 |
| Ceiling | 102,400 B (100 KiB) | Set with the harness — see 2.1 |
| Tests | 68 passing | Harness baseline |
| Hand-curated places | 62 | Harness baseline, measured by import |
| Preset origins | 11 | Harness baseline |
| Worst place snap distance | 51 m (`diamond`) | Harness baseline |
| App JS after chunk 0 | 71,315 B (69.6 KiB) | +110 B on the baseline |
| Tests after chunk 0 | 100 passing | 68 at the baseline |
| Worst solar error vs USNO | 73 s (2026-03-20 sunset) | Chunk 0, across 15 phenomena |
| App JS after chunk 1 | 71,860 B (70.2 KiB) | +545 B on chunk 0; the spec estimated +0.7 KB |
| Tests after chunk 1 | 131 passing | |
| Snapshot drift after the rebuild | 4.44% worst area, **0** membership flips | Chunk 1, 55 rungs |
| Snapshot drift after regenerating | 0.00%, 0 flips | Chunk 1 |
| Snapshot regeneration cost | **2.9 s** for all eleven | Chunk 1, local engine, one query per origin |
| Elevation tiles | one (`N37W078`), 25 MB on disk | Chunk 1 |
| Graph rebuild | a single pass; no second run needed | Chunk 1 |
| Walking-speed fixture | 1025.7 s → **963.5 s** on the same 1.047 km | Chunk 1 — see 6.1 |
| App JS after chunk 2 | 74,644 B (72.9 KiB) | +2,784 B on chunk 1 — see 6.2 |
| Tests after chunk 2 | 163 passing | |
| App JS after chunk 3 | 76,798 B (75.0 KiB) | +2,154 B, under that spec's 2.5 KB line |
| Tests after chunk 3 | 164 passing | |
| Snapshot drift, worst area delta | **14.16%** at 25 min | Harness baseline — see below |
| Snapshot drift, membership flips | **35** across 55 rungs sampled | Harness baseline |

### 6.2 Chunk 2 spent 2.8 KB against an estimate of 1.6 KB

Not a problem yet, and worth watching. Chunks 0, 1 and 2 have spent 3,439 B against estimates
totalling 3.0 KB, so the run is 0.4 KB over across three chunks — inside the noise. But chunk 2 alone
is 1.2 KB over its own line, and the plan has nine chunks left including one estimated at 10 KB.

The bytes are real and mostly copy: `REASON_COPY` is eight reasons × three strings, and two new
components. Nothing to cut without cutting the feature. Recorded so the trend has a starting point
rather than so anybody does something about it.

| Chunk | Estimated | Measured |
| --- | --- | --- |
| 0 Foundations | +0.9 KB | +110 B (deferred to chunk 5 — nothing imports it yet) |
| 1 Elevation wire | +0.7 KB | +545 B |
| 2 `pool-reasoning` | +1.4 KB | **+2,784 B** |
| 3 `elevation-profile` UI | +1.2 KB | +2,154 B (its own spec allowed 2.5 KB; README section 5's row is the low one) |

### 6.1 Every walking time in the app changed, and nothing on screen says so

The rebuild's loudest measured effect, caught by `verify-engine`'s fixture on the first run after it.
The same fixed route — Grace Street to Main Street Station, 1.047 km, not a metre different — went
from 1025.7 s to 963.5 s. That is 3.68 km/h to 3.91 km/h against a walking speed the proxy pins at
3.69 and calls a product decision.

It is not a bug. Pedestrian costing's `use_hills` defaults to 0.5, and over a graph that now carries
grades the engine rightly makes a downhill walk quicker. But it means the pinned 3.69 km/h is now a
*flat-ground* pace that the terrain modulates, where before it was the pace, full stop — and
`server/proxy.ts`'s comment on `WALKING_SPEED_KMH` still describes the older, simpler thing.

**Nothing was changed in response.** Two reasons: the plan does not ask for it, and the new behaviour
is more honest than the old one — a walk downhill *is* quicker. But somebody should decide whether
the 3.69 that was measured against Google's isochrones on an elevation-less graph is still the right
number now that the graph has hills in it, because that measurement is the whole basis for the
constant. It is one number in one file, `WALKING_SPEED_KMH` in `server/proxy.ts`, and changing it
means recutting the snapshots again.

**Chunk 0's measured bundle delta is +0.1 KB against an estimate of +0.9 KB, and the estimate is not
wrong — it is early.** Nothing imports `solar.ts`, `daylight.ts` or `conditions.ts` yet, so the
bundler drops them entirely. Those bytes arrive in chunk 5, when the switch and the cap start reading
them, and README section 5's chunk-0 row should be read as chunk 5's row until then.

**The snapshots in `public/reach/` are already stale, before chunk 1 touches anything.** The first run
of `verify-drift.mjs` measured 14.16% worst-case area drift and 35 place-membership flips against the
live engine, on a tileset built the day before the run began. This is not caused by the v0.5 graph
rebuild; it predates it. It is exactly the silent failure the drift detector was written to find, and
it means the app has been drawing contours that disagree with its own engine by up to 14% of area.
Chunk 1 regenerates all eleven and bumps `SNAPSHOT_VERSION`, which fixes it — but it is worth knowing
that the fix was already owed before the plan asked for it.
