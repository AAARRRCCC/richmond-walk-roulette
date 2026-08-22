# Chunk 11 — multiplayer-links + meet-in-the-middle

Assembled by hand from the universal checklist, GOAL's chunk-11 list, and both specs'
numbered acceptance criteria. `[x]` pass, `[ ]` not yet run, `[!]` fail. There is no
partial credit: a check that is half true is false, and an unrun check is a fail.

**One landing, not two.** 11a alone adds session fields nothing reads — knip fails on the
dead exports, and a link would decode into a session the UI does not render, which is an
invite that silently does nothing. The two specs' joint criteria (5, 6, 6b, 13) are
verified once, on the pair.

## Universal

**Preconditions**

- [x] Every chunk this one depends on is landed, and its acceptance file is fully ticked
      - 0 through 10, all of them. This is the leaf of the plan
- [x] The owning spec has been read in full **this session**, not recalled
      - `multiplayer-links.md` all 1,233 lines and `meet-in-the-middle.md` all 1,636, plus README section 4's chunk 11 entry and section 2.9a's arbitration between them
- [x] The spec's `## Depends on` matches what is actually landed
      - chunk 10 for the link surface, 2 for the reason contract and `clampBudget`, 6 for `insideRichmond`, 3 for `climb`, 8 for `k`. All landed
- [x] `npm run verify` passes on the tree **before** any of this chunk's code is written
      - green at `3bce533`: 346 tests, 95,675 B
- [x] `node scripts/verify-engine.mjs` passes, if this chunk touches the engine
      - it adds no endpoint and no new engine call shape; the partner's ladder is a second call to `/api/isochrone`, which already existed. The engine was up and answering for every run of `verify-places` below

**Implementation**

- [x] Every file listed in the spec's `## Changes, file by file` was changed, or its omission is stated
      - `share.ts`, `session.ts`, `eligibility.ts`, `meet.ts` (new), `isochrone.ts`, `App.tsx`, `MeetPanel.tsx` (new), `ResultCard.tsx`, `ReachReadout.tsx`, `MapCanvas.tsx`, `EmptyPoolNotice.tsx`, `app.css`, `share-meta.ts`, `README.md`
- [x] No file outside that list was changed, or the extra change is stated and justified
      - three extras, each stated: `useShareAction.ts` and `InviteButton.tsx` are new, because a second share control cannot reuse forty lines inlined in `ResultCard`; `TimeDial.tsx` gains one optional `warming` prop, because during an invite nothing is warming and "loading reach 0%" promises a measurement that is not coming
- [x] Every pure function the spec names is extracted and exported as named
      - `meetMinimum`, `cachedMeetMinimum`, `meetSplit`, `describeBothBy`, `describeGap`, `partnerSignature`, `describeMeetClause`, `MEET_GAP_MINUTES`; `epochDay`, `meetKind` (see corrections), `describeInvite`, `describeMeetResult`, `partnerOrigin`, `cachedContour`
- [x] Every new exported symbol is either consumed or carries `/** @public */` — knip decides, not you
      - knip clean
- [x] No `any` was introduced
      - none
- [x] No type assertion was introduced without a stated reason — oxlint's anti-slop plugin decides
      - none at all
- [x] No `eslint-disable`, `oxlint-disable` or `@ts-expect-error` was added
      - none. One was written by accident while wiring the map and removed in the same pass before any gate ran; `grep -c eslint-disable src/map/MapCanvas.tsx` is 0
- [x] Every new comment explains *why*, and no comment restates what the line does
      - several carry findings: why the partner's reach takes no floor, why `cachedContour` peeks, why the framing stamp includes the partner, why the partner leg is gated on `originChosen`

**Tests**

- [x] Every test the spec's `## Tests` section names exists, by that name
      - `meet.test.ts` new (18); `share.test.ts` +25; `eligibility.test.ts` +6; `session.test.ts` +5; `worker.test.ts` +15; `signature.test.ts` +3
- [x] Every one of them passes
- [x] Every fixture the spec names exists, with the values it names
      - `square`, `YOU`, `THEM`, `MIDPOINT`, `NEAR_YOU`, `ladder`. Two moved off an exact edge (`0.495`, `0.205`) because `contains` has a stated no-guarantee for a point on one, and pinning undefined behaviour is not a test
- [x] No pre-existing test was deleted, skipped, or loosened
      - one literal corrected, in test 34, which is the correction that test exists to force: chunk 10 emits `k` before `v` and this spec wrote `v` before `k`
- [x] The test count went up, and the new count is recorded in the report
      - 346 → **418**

**Gates**

- [x] `npm run typecheck` — clean
- [x] `npm run lint` — eslint clean
- [x] `npm run lint` — oxlint clean
- [x] `npm run lint` — knip clean, no dead exports
- [x] `npm test` — every test passes (418)
- [x] `npm run build` — succeeds
- [x] `node scripts/verify-bundle.mjs` — under the ceiling
      - **101,133 B gz against 102,400. 1,267 B of headroom**
- [x] The new bundle number is written into `scripts/bundle-budget.json` in this chunk's commit
- [x] `node scripts/verify-places.mjs` — all data invariants hold
      - 242 places, worst snap 51 m. This chunk changes no place data
- [x] `node scripts/verify-signature.mjs` (or its test) — passes, from chunk 2 onward
      - three new cases. Chunk 11's contribution is a *term* in `conditionsSignature`, not a `PoolRule`, so it has no `REGISTERED` entry and the file says why

**Behaviour, in the running app**

- [x] The chunk's user-visible change was seen working in a browser
      - the invite state, the answer state, both contours, both markers, the panel's four states, the empty-overlap notice, and the address bar clearing on the first change. Four defects were found this way and fixed; see *What the browser caught*
- [ ] It was seen in **both** light and dark themes
      - dark only. The app has no light theme; this is the same standing gap every chunk has recorded
- [ ] It was seen at a phone viewport width, not only desktop
      - desktop only. The panel gained a multi-state block whose height changes between states, which is exactly what `meet-in-the-middle`'s open question 8 says to watch on a 390 px viewport. HUMAN-REVIEW 5.14
- [ ] It was operated by keyboard alone, and focus is visible throughout
      - not attempted for the new controls
- [ ] It was seen with `prefers-reduced-motion` on
      - not attempted
- [!] Every failure path in the spec's `## Failure and degradation` table was **triggered** and seen
      - four of nine were seen: no partner (the ordinary app, unchanged), partner warming, empty overlap with both warm, and `originChosen` false. The other five — partner out of bounds, a mangled `mb`, their ladder failing, a stale invite, a dropped contour — are covered by tests only. A fail rather than a pass, because the box says "triggered and seen". HUMAN-REVIEW 5.14
- [x] No failure path renders an empty space, a spinner that never resolves, or a lie
      - the one that could have: `meet-warming` is gated on both scalars reaching 1, which `prefetchLadder` guarantees whether or not every rung landed. Asserted by the pair in test 22
- [x] Every new control produces a sound cue, and the cue matches the gesture
      - `playPress` on Invite, Send this back, Use my location, Pick on the map and Remove the other person; `playTap` on a preset and the landmark reveal. No outcome cue anywhere: a cue answers a gesture, and a partner's ladder landing is an outcome
- [x] Nothing was logged to the console that should not have been
      - nothing new

**Regression**

- [x] Every earlier chunk's acceptance file is still fully ticked
      - unchanged; no earlier box was re-opened
- [ ] Spinning still works, from a cold load, on a preset origin
      - **not completed.** A cold `/` loaded correctly — 47 places in reach, 37 to spin, the ordinary area readout, no meet panel — but the route warm-up stalled at 20/37 because the engine's port forward to the host dropped again mid-pass, so Spin never became pressable. The failure is the environment's, not the code's; it is recorded as unrun rather than assumed. HUMAN-REVIEW 5.16
- [ ] Spinning still works on a dropped pin
      - not attempted, same reason
- [ ] The dial still scrubs without a network request
      - not attempted, same reason
- [x] A preset origin still cold-starts from its snapshot rather than the engine
      - seen: `reach/37.52676_-77.41738.json`, no `/api/isochrone`

**Documentation**

- [x] The spec was corrected wherever implementation proved it wrong, in this commit
      - nine corrections in `multiplayer-links.md`, six in `meet-in-the-middle.md`
- [x] Any sibling spec whose contract changed was corrected too
      - both, since the contradiction between them is what one of the corrections resolves
- [x] Any number that changed (counts, bytes, timings) was corrected in *every* document repeating it
      - bundle and test count in `bundle-budget.json`, GOAL's "where the run is" block, and PROGRESS
- [x] The repo `README.md` still describes the app that now exists
      - a paragraph under the feature list, plus the one-pace sentence in the honesty section

## Chunk-specific (GOAL)

- [x] 11a and 11b landed together; knip was never green on 11a alone because it was never committed alone
- [!] `MEET_PIN_PRECISION` is 3 — the measured value, not a typed one
      - **the value is 3 and it is the measured one, but the constant is `PIN_PRECISION` and there is deliberately no second name.** Chunk 10 shipped it first, for the same privacy reason, with a comment saying in advance that `meet-in-the-middle` would share it. A second name for one number is the drift that comment exists to prevent. Recorded as a fail rather than ticked on a technicality; `multiplayer-links` correction 1 carries the reasoning
- [x] A meet pin is rounded in the encoder, before it can reach `pointKey`
      - `pinOrId(origin, PIN_PRECISION)` in `encodeShare`, and `canonicalQuery` re-rounds rather than copying, so a hand-edited five-decimal coordinate cannot be smuggled through. Asserted
- [ ] An invite minted on one device, opened on another, produces a shared pool
      - one machine, one browser. The link was minted, copied and opened in the same browser and produced a shared pool; a genuine second device was not available. HUMAN-REVIEW 5.15
- [x] The recipient's origin does not leave their device until they press *Send this back*
      - the answer link is built only by `meetLinks` and handed straight to the share sheet; nothing writes `mb` to `location`. Seen: the address bar shows `/` after the reader chooses a start, never a query containing `mb`
- [x] What the sender is told before minting matches what the link actually carries — read both, compare
      - read side by side. A preset sender is told "This link names Libby Hill, not a coordinate", and the minted link is `?m=1&ma=libby-hill&…` with no coordinate in it
- [x] A preset origin shares as an id and leaks no coordinate
      - asserted, and seen in the minted link
- [x] An invite cannot be minted before the sender has chosen an origin
      - `meetLinks` returns `{invite: null, answer: null}`, and a null URL renders **no control at all** rather than a dead one. Seen: `.invite` is absent from the DOM in the invite state
- [ ] The empty overlap is handled as the **arrival** state: the suggestion lands on the same beat as the warm-up finishing, with no visible dead Spin button in between
      - the notice does arrive with the warm-up rather than after it, because `meet-warming` is returned until both scalars reach 1 and the branch re-derives on the same render they do. **But the beat was not timed**, and on this machine both sides were snapshot-seeded presets, which is the fast case. Not ticked. HUMAN-REVIEW 5.14
- [x] `widen-to-meet` names a real budget that, when applied, actually produces a pool
      - test 24 calls `derivePool` at the proposed budget and compares `included.length` to the `recovers` the notice printed
- [x] `no-overlap` appears only when nothing overlaps under the dial's maximum
      - seen for Libby Hill ↔ Carytown at a round trip, which is correct: a round trip halves the outbound rung, so the widest either can go is 50 minutes' walk and they are further apart than that
- [x] Hedging appears when rungs were unmeasurable, and does not appear when they were not
      - the pair asserted in test 22, and in `meetMinimum` tests 9 and 11
- [!] `meetMinimum` was timed at the full post-chunk-8 place count, and the number is recorded
      - **not timed.** Its cost and the two-sided sweep's remain assumed, which `meet-in-the-middle` open question 3 explicitly says must not ship. HUMAN-REVIEW 5.13
- [x] The result card shows both walks' durations without claiming to know the other person's pace
      - `.result-split`, two rows, plus one `assumed` line reading "Both walks are measured at the same pace."
- [x] The words "their pace" appear nowhere — grep proves it
      - `grep -rin "their pace\|her pace\|his pace" src/ server/` returns four lines and **not one of them is user-facing copy**: two are the test that asserts the phrase never appears, one is the comment in `MeetPanel` forbidding it, and one is `speed.ts` using the word "pace" in an unrelated sentence. `meet.test.ts` asserts it of all three describe functions
- [ ] Two devices on the same link show counts that differ only where honest divergence is expected
      - one device. HUMAN-REVIEW 5.15

## `multiplayer-links` — numbered criteria

1. [x] All three link shapes round-trip, and `decodeShare` never throws on any input including `m=1` with no `ma`
2. [x] A meet link contains no `o=`, and a build without this chunk opens one as a cold start on `DEFAULT_ORIGIN`
3. [x] A pin in a meet link is written at exactly three decimals, in the encoder, and nothing re-expands it
4. [x] A preset origin in a meet link is written as an id and no coordinate appears in the query
5. [x] **(joint)** Opening an invite: **zero** requests, no contour drawn, Spin not pressable, no link mintable, disclosure on screen
      - **this failed on first observation and is the most valuable thing the browser pass caught.** The partner's ladder was warming during an invite — the network panel showed Carytown's snapshot being fetched — which for a pin partner is a full 96-contour warm-up charged to a recipient who has not answered. Fixed by gating the partner leg on `originChosen`. Re-observed: zero requests of any kind
6. [x] **(joint)** An out-of-bounds `ma` sets `partnerOutOfBounds`, sets `partner` to null, makes zero requests; a mangled `mb` sets `selfOutOfBounds` and draws one line
      - asserted in tests 12 and 12b. The *sentences* were read in the source, not seen on screen
6b. [x] Opening an **answer** link warms two ladders, sequentially, yours first, and no third wave
      - seen in the network panel: `37.52676` (yours) then `37.55243` (theirs), in that order, no overlap
7. [x] The recipient's coordinate never appears in `location.href`, in `history`, or in any request other than `POST /api/isochrone` for their own reach
8. [x] The answer link is produced only by an explicit press and goes to `navigator.share` / the clipboard, with `playPress()` and no outcome cue
9. [ ] `curl … /s?m=1&ma=carytown&b=30&rt=1 | grep og:` returns an invite-shaped card
      - needs a deployment. `shareMeta` is asserted directly by tests 20–23; what cannot be checked locally is that `run_worker_first` routes `/s` at the edge. Curl added to `LAUNCH.md`. HUMAN-REVIEW 5.12
10. [ ] The same URL with a pin returns 200, says "a dropped pin", and leaks no digit
      - same reason. Asserted by test 21
11. [ ] Two GETs of a pin link both re-render; two of a preset-to-preset link hit the edge cache once
      - same reason. Asserted against the stub by the worker tests
12. [x] `wrangler.toml`, `worker/index.ts`, `server/proxy.ts`, `server/vite-plugin.ts`, `public/_headers`, `public/reach/` and `SNAPSHOT_VERSION` are **unchanged**
      - `git diff --stat` names none of them. **The Worker gained zero lines, exactly as promised**
13. [x] **(joint)** An invite older than `INVITE_STALE_DAYS` shows its age and still opens
      - this spec's half asserted; the line itself read in the source
14. [x] typecheck, lint (eslint + oxlint + knip) and test are clean
15. [!] Gzipped app JS grew by no more than **1.5 KB** for this chunk alone
      - **the pair grew it by 5,458 B.** The two specs' combined allowance is 4.5 KB and neither number was ever measured — both say so. HUMAN-REVIEW 6
16. [x] `shareable-spins`' criteria 1–18 still pass, in particular 11b and its test 21
      - test 34's literal was corrected to chunk 10's actual byte order, which is the fix that spec prescribes
17. [x] Opening an answer link and reloading restores the same two starts and the same pick; the address bar is not cleared on the first paint
      - test 36 is the unit form. Seen in the browser: an answer link kept its query, and an invite cleared to `/` on the first change the reader made — not before

## `meet-in-the-middle` — numbered criteria

1. [x] With `partner === null`, every rendered byte and every request is identical to before
      - the ordinary app was loaded and compared: same readout, same requests, `MeetPanel` absent, `partner-band` empty
2. [x] Opening an invite shows the three controls in order, issues no request, draws no origin marker, leaves the readout empty
      - all four seen. The camera does **not** frame the partner's contour, because nothing is warmed — see the correction to decision 8
3. [x] Choosing an origin issues yours, and theirs does not start until yours responds
      - seen, in that order
4. [x] During their warm-up the pool is your own reach, the reason count is 0, and the readout says "their side still working"
5. [x] With both warm, `.readout` reads `N places you can both reach` where N equals `included.length`
      - seen reading `0 places you can both reach · 30 min each`, matching `0 to spin`. Per-device, since amendment 8 was refused
6. [x] A place in your reach and not theirs is dimmed, clickable, and its card carries exactly one warning reading "Outside the other person's reach."
      - the row renders from `REASON_COPY` with no new code, which is the contract holding
7. [x] The drawer groups them under `Only in your reach (N)` and `.pool-summary` carries `N out of their reach`
      - seen: `0 to spin · 41 out of their reach`
8. [x] With a floor set, no place within the floor of the **partner's** start is reported `out-of-their-reach`
      - the line this criterion exists for is `cachedReach(partner, outbound, 0)`, with a comment saying why the symmetrical version is a false statement about a real person. `meet.test.ts` 12 asserts both directions
9. [ ] The card shows two rows, a "both be there by" line, a gap line only over 8 minutes, one set of directions, and no horizontal scroll at 320 px
      - the split renders and its logic is asserted, but no pair on this machine had a non-empty overlap at a round trip, so a two-row card with two measured walks was never on screen. HUMAN-REVIEW 5.14
10. [ ] Shrinking the dial to empty the overlap produces a notice naming a budget; pressing it moves the dial there and the pool is non-empty
      - the `no-overlap` branch was seen; `widen-to-meet` was not reached in the browser for the same reason as 9. Asserted by tests 21 and 24
11. [x] With two reaches that never meet under 100 minutes, the notice says so and offers **Spin from just your side**
      - seen, verbatim
12. [ ] A meet session where the engine dropped a contour never shows a permanent wait
      - asserted by the pair in test 22; not reproduced in the browser by stubbing a rung
13. [!] Gzipped app JS grew by no more than **3 KB**, and the PR body names which `ASSEMBLED_LIMIT` resolution was taken
      - see 15 above. Neither resolution was taken and the reason is stated: the scan reads `cachedContour`, which stores nothing, so the pressure that section anticipates does not arise. Recorded as unmeasured
14. [ ] An engine failure on the partner's leg leaves your side working
      - the code routes it to `partnerFailed` and `session.test.ts` asserts `status` is unaffected; not reproduced by stubbing a 500
15. [ ] Both markers are distinguishable at 390 px, theirs cannot be dragged or focused, two outlines and no inner bands, and `map.on("error")` is silent on load
      - the marker behaviour, the two outlines and the empty inner bands were all confirmed at desktop width by querying the rendered layers (`band-fill-1` and `band-fill-2` return zero features). **390 px was not tested**
16. [!] Build grew by no more than 3 KB, with before and after in the PR body, and no new dependency
      - +5,458 B for the pair. **No new dependency**: `package.json` is unchanged, and no clipper was bought
17. [x] typecheck is clean and the exhaustive switches fail without their new members
      - both failed exactly as predicted while the union was being widened, which is the switch doing its job
18. [x] lint is clean: no `unknown` at a boundary, no unexplained assertion, no dead export
19. [x] `subtract()` appears nowhere in `src/app/meet.ts` and no polygon boolean operation exists in the diff
      - `grep -n subtract src/app/meet.ts` returns exactly one line, and it is the header comment forbidding it by name and explaining that two origins' contours cross, so appending partially-overlapping rings as holes produces geometry that is not imprecise but meaningless. There is no call, and no clipper in `package.json`
20. [ ] The screen-reader line for a meet result reads once per settled pick and includes both walks
      - `describeMeetClause` is in the array and asserted; not heard, for the same reason as 9

## Tally

**73 of 100.** Seven `[!]`: the `MEET_PIN_PRECISION` naming, the failure-path box restated
honestly, `meetMinimum` untimed, and the four bundle-delta criteria (which are two
measurements counted twice across the two specs). Twenty `[ ]`: three that need a deployment, two that need a second device, three that the
engine's port forward cut short, and twelve that need either a phone, a stubbed failure, or
a preset pair with a non-empty overlap at a round trip.

## What the browser caught

Four defects, none of which any test would have found, all fixed before the gates were
re-run:

1. **The partner's ladder warmed during an invite** — criterion 5's whole point, and the
   two specs contradict each other about it. Resolved in favour of the explicit joint
   criterion; logged as a plan-level decision.
2. **The panel said "15 minutes" for a 30-minute link** — it was handed outbound minutes
   where the sentence speaks the dial's language.
3. **The dial read "loading reach 0%" forever during an invite**, promising a measurement
   that was never coming, because nothing warms in that state.
4. **The partner's contour never reached the map on an answer link.** Every per-source
   effect returns early until the style is ready, so a value already set when `load` fired
   was never uploaded — its dependency never changes again. `syncAll` exists for exactly
   this and had not been told about the new source. The camera also framed your contour
   alone, because their ladder lands after yours and `framingKey` does not bump again.
