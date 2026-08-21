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

**What landed.** `src/lib/bounds.ts` exporting `BOUNDS` and `withinBounds`, and `server/proxy.ts`
importing `withinBounds` in place of its two inline comparisons. Behaviour identical; the proxy's own
tests pass unchanged.

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

---

## 4. Unticked boxes

Every `[ ]` and every `[!]` left standing, by chunk, with what stopped it. Blocked and skipped chunks
go here.

_Nothing yet; the run has not reached chunk 0._

---

## 5. Things I could not observe

Anything needing a real phone, a second person, a GPS fix outside Richmond, a specific season, or
weather that did not occur during the run. Not failures — the work this pass inherits.

_Nothing yet._

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
| Snapshot drift, worst area delta | **14.16%** at 25 min | Harness baseline — see below |
| Snapshot drift, membership flips | **35** across 55 rungs sampled | Harness baseline |

**The snapshots in `public/reach/` are already stale, before chunk 1 touches anything.** The first run
of `verify-drift.mjs` measured 14.16% worst-case area drift and 35 place-membership flips against the
live engine, on a tileset built the day before the run began. This is not caused by the v0.5 graph
rebuild; it predates it. It is exactly the silent failure the drift detector was written to find, and
it means the app has been drawing contours that disagree with its own engine by up to 14% of area.
Chunk 1 regenerates all eleven and bumps `SNAPSHOT_VERSION`, which fixes it — but it is worth knowing
that the fix was already owed before the plan asked for it.
