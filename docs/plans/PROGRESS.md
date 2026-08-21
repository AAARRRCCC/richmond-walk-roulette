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
- `server/proxy.ts` — its inline `BOUNDS` const replaced by an import of `withinBounds`.

### Deferred

- HUMAN-REVIEW §2.1 — the bundle ceiling is 100 KiB, not README line 91's 64 KB.
- HUMAN-REVIEW §3.1 — `src/lib/bounds.ts` landed with the harness rather than with chunk 0.
- HUMAN-REVIEW §3.2 — `verify-signature.mjs` deferred to chunk 2.

### Next

**Chunk 0 — Foundations.** Preconditions: `npm run verify` green on the tree before any chunk-0 code
is written (met, above); the chunk touches no engine, so no `verify-engine` precondition. The bounds
bullet is already landed and its box is ticked in the chunk-0 file with a pointer to HUMAN-REVIEW §3.1.
