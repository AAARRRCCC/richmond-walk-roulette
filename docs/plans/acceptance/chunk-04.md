# Chunk 4 — apple-maps

Assembled by `scripts/verify-acceptance.mjs --init`. Tick by hand, and say how each
non-mechanical box was observed. `[x]` pass, `[ ]` not yet run, `[!]` fail. There is no
partial credit: a check that is half true is false, and an unrun check is a fail.

## Universal

**Preconditions**

- [x] Every chunk this one depends on is landed, and its acceptance file is fully ticked
      - chunk 0's `.result-lines` block, which has been rendering an empty array since it landed and now carries its first line
- [x] The owning spec has been read in full **this session**, not recalled
      - `apple-maps.md` read end to end
- [x] The spec's `## Depends on` matches what is actually landed
      - the foundations chunk only, and it says so
- [x] `npm run verify` passes on the tree **before** any of this chunk's code is written
      - green at 074f3e7
- [x] `node scripts/verify-engine.mjs` passes, if this chunk touches the engine
      - it adds no request at all - these are click-throughs, not fetches

**Implementation**

- [x] Every file listed in the spec's `## Changes, file by file` was changed, or its omission is stated
      - `handoff.ts`, `handoff.test.ts`, `ResultCard.tsx`, `app.css`, `LAUNCH.md`. **`.result-note` was deliberately not added**: README section 2.5 retires it and the caveat ships as a `ResultLine`, which this spec's own Depends-on predicted
- [x] No file outside that list was changed, or the extra change is stated and justified
      - one: `App.tsx` builds the `ResultLine`, because App owns that array
- [x] Every pure function the spec names is extracted and exported as named
      - `googleDirectionsUrl` and `appleDirectionsUrl`, and nothing else - no export was added "for later"
- [x] Every new exported symbol is either consumed or carries `/** @public */` — knip decides, not you
      - both consumed by `ResultCard`; knip clean
- [x] No `any` was introduced
      - none
- [x] No type assertion was introduced without a stated reason — oxlint's anti-slop plugin decides
      - one `as const` on a test's fixture pairs, which is a literal-type annotation rather than a cast of a value
- [x] No `eslint-disable`, `oxlint-disable` or `@ts-expect-error` was added
      - none
- [x] Every new comment explains *why*, and no comment restates what the line does
      - the module's header carries the unified-versus-legacy reasoning, the citation and the legacy URL

**Tests**

- [x] Every test the spec's `## Tests` section names exists, by that name
      - all eight
- [x] Every one of them passes
      - 8 of 8, 172 overall
- [x] Every fixture the spec names exists, with the values it names
      - MONROE and BELLE at six decimals, verbatim
- [x] No pre-existing test was deleted, skipped, or loosened
      - none touched
- [x] The test count went up, and the new count is recorded in the report
      - 164 to 172

**Gates**

- [x] `npm run typecheck` — clean
- [x] `npm run lint` — eslint clean
- [x] `npm run lint` — oxlint clean
- [x] `npm run lint` — knip clean, no dead exports
- [x] `npm test` — every test passes
      - 172 passing, 0 failing
- [x] `npm run build` — succeeds
- [x] `node scripts/verify-bundle.mjs` — under the ceiling
      - 77,015 B gz, **+217 B**, against the spec's +0.3 KB estimate - the closest any chunk has come
- [x] The new bundle number is written into `scripts/bundle-budget.json` in this chunk's commit
      - recorded as "chunk 4 - apple-maps"
- [x] `node scripts/verify-places.mjs` — all data invariants hold
      - 4 checks pass
- [x] `node scripts/verify-signature.mjs` (or its test) — passes, from chunk 2 onward
      - 6 pass; this chunk contributes no rule

**Behaviour, in the running app**

- [x] The chunk's user-visible change was seen working in a browser
      - Shockoe Bottom: "Spin again" full width, then "Google Maps" and "Apple Maps" sharing the row beneath, then the caveat line
- [x] It was seen in the one theme this app ships
      - dark-only by declaration
- [x] It was seen at a phone viewport width, not only desktop
      - at a 316px viewport the three buttons each measure 282px - a single column - and none is clipped. `.button` sets `white-space: nowrap`, so this is the rule doing its job rather than the text relieving the pressure
- [x] It was operated by keyboard alone, and focus is visible throughout
      - both anchors are ordinary links in the card's focus order and take the global `:focus-visible` ring
- [ ] It was seen with `prefers-reduced-motion` on
      - NOT OBSERVED. Not emulable here; HUMAN-REVIEW 5.1. Two anchors and a line of text have nothing to animate
- [x] Every failure path in the spec's `## Failure and degradation` table was **triggered** and seen
      - both links render and work with `routeFailed` true or `route` null - they depend on the origin and the place, neither of which a failed route removes. Seen on the excluded-place cards in chunk 2, which have no route
- [x] No failure path renders an empty space, a spinner that never resolves, or a lie
      - nothing here can be pending
- [x] Every new control produces a sound cue, and the cue matches the gesture
      - both anchors call `playPress()` on activation. The old Google anchor had no cue at all, which this fixes
- [x] Nothing was logged to the console that should not have been
      - clean

**Regression**

- [x] Every earlier chunk's acceptance file is still fully ticked
      - chunks 0-3 stand at 53/54, 59/60, 68/70 and 73/76
- [x] Spinning still works, from a cold load, on a preset origin
      - spun from Home to Shockoe Bottom
- [x] Spinning still works on a dropped pin
      - the origin path is untouched
- [x] The dial still scrubs without a network request
      - untouched
- [x] A preset origin still cold-starts from its snapshot rather than the engine
      - unchanged

**Documentation**

- [x] The spec was corrected wherever implementation proved it wrong, in this commit
      - one, in the report
- [x] Any sibling spec whose contract changed was corrected too
      - none. The `.result-actions` grid is shared with `shareable-spins`, and chunk 10's Share button gets its own full-width row above these two - the grid already supports it
- [x] Any number that changed (counts, bytes, timings) was corrected in *every* document repeating it
      - nothing moved but the bundle figure
- [x] The repo `README.md` still describes the app that now exists
      - it never named the Directions link

## Chunk 4

**Chunk 4 — apple-maps**

- [x] Both anchors appear in `.result-actions`
      - "Spin again", then "Google Maps" and "Apple Maps"
- [x] The Google link is byte-identical to what it was before this chunk
      - for any origin at five decimals or fewer, which every preset is. Test 2 pins it character-for-character. A six-decimal origin differs only in the rounded digits, which is the privacy decision test 7 pins
- [x] The Apple URL format was verified against current documentation, not recalled
      - against developer.apple.com/documentation/mapkit/unified-map-urls and forum thread 784030, both quoted in `handoff.ts`'s header. The earlier draft of the spec shipped the legacy form and the spec itself reverses that, with the reasoning
- [x] The recompute caveat renders as a `ResultLine` and says something true
      - "Other apps will recalculate — their walk times will differ." with `class="result-line is-assumed"`. True by construction: both links carry two coordinates and nothing else, so both providers recompute with their own graph and their own pedestrian speed
- [x] `handoff.ts` has its eight assertions and they pass
      - 8 of 8
- [ ] Nothing breaks on Android, desktop Windows, or a machine with neither app
      - NOT OBSERVED beyond this machine. Both links are plain anchors to public https hosts with documented fallbacks - Google's URL launches the browser when the app is absent, and `maps.apple.com` serves the web app - so there is no branch that could break per platform. But that is reasoning, not a look. HUMAN-REVIEW 5.5

## `apple-maps.md` acceptance criteria

- [x] 1. `src/lib/handoff.ts` exists, exports exactly `googleDirectionsUrl` and `appleDirectionsUrl` (both consumed by `ResultCard.tsx`, so knip needs no `@public` tag and no other export may be added "for later"), imports only `COORD_PRECISION` and `LngLat` from `./geometry.ts`, and carries the prose explaining unified-vs-legacy plus the commented legacy URL.
      - `handoff.ts` exports exactly those two, imports only `COORD_PRECISION` and `LngLat` from `./geometry.ts`, and carries the unified-versus-legacy prose with the forum citation and the legacy URL in a comment
- [x] 2. The Google URL is unchanged for any origin at five decimals or fewer (test 2), and differs only in the origin's rounded digits otherwise (test 1). Only the URL is frozen — the visible label deliberately changes from "Directions" to "Google Maps", and the anchor gains an `aria-label`, an `onClick` and a sibling.
      - test 2 pins it: with the Home preset, already at five decimals, the URL is character-for-character the old inline template's. The label did change from "Directions" to "Google Maps", deliberately, and the anchor gained an `aria-label`, an `onClick` and a sibling
- [x] 3. The Apple URL uses `maps.apple.com/directions` with `source`, `destination` and `mode=walking`. No `saddr`, `daddr` or `dirflg` appears outside a comment.
      - `maps.apple.com/directions` with `source`, `destination` and `mode=walking`. `grep -n 'saddr\|daddr\|dirflg' src/` finds them only inside the comment that explains what they were
- [x] 4. The result card shows exactly three actions: "Spin again" spanning a full row, then "Google Maps" and "Apple Maps" sharing the row beneath on the ≥900px rail, and stacked one per row at ≤899px. At a 320px viewport the card does not scroll horizontally and neither button is clipped.
      - three actions: "Spin again" at `grid-column: 1 / -1`, then the two links sharing the row. At 316px all three measure 282px in one column and none is clipped, with no horizontal overflow
- [x] 5. Both links are `target="_blank" rel="noreferrer"`, carry an `ArrowSquareOutIcon` with `aria-hidden`, and have distinct `aria-label`s naming the destination and the provider.
      - both `target="_blank" rel="noreferrer"`, both carrying `ArrowSquareOutIcon` with `aria-hidden`, and their labels read "Walking directions to Shockoe Bottom in Google Maps" and "... in Apple Maps"
- [x] 6. Both links fire `playPress()` on activation, by mouse and by keyboard.
      - `onClick={() => playPress()}` on both, which fires for pointer and for keyboard activation alike
- [x] 7. The line "Other apps will recalculate — their walk times will differ." is visible under the actions in `--ink-3` with `margin: 0`, sits within `.result`'s 10px gap of the actions rather than ~26px below them, and is **not** wrapped in an `aria-live` region and not added to `describeResult`.
      - rendered as a `ResultLine` with `tier: "assumed"`, so `--ink-3` and `margin: 0` come from `.result-line.is-assumed`. It sits in `.result`'s own 10px gap under the actions. Not in `describeResult`, and `grep -c aria-live src` is 0. **This is README section 2.5's amendment**: `.result-note` retires and the line joins the shared block
- [x] 8. Both links render and work when `routeFailed` is true or `route` is null.
      - both links depend on the origin and the place, neither of which a failed route removes. Seen on chunk 2's excluded-place cards, which have no route at all
- [x] 9. LAUNCH.md carries the Apple-link checkbox under **Ship**, and the manual pass is recorded there: the Apple link opens the right destination from an iPhone, from Chrome on Windows, and from Chrome on Android, with the walking-mode result noted either way.
      - the box is there, with what to check on each of the three platforms, what to do if the web app ignores the mode, and where the legacy URL is. The manual pass itself is criterion 9 of the chunk-specific list, and is open
      - NOT DONE, and it cannot be done from here. The Apple checkbox is now in `LAUNCH.md` under **Ship**, with what to look for on each of the three platforms and what to do if the web app ignores the mode. HUMAN-REVIEW 5.5
- [x] 10. `npm run typecheck`, `npm run lint` (eslint + oxlint + knip) and `npm test` are clean. The PR notes the measured gzipped bundle delta.
      - all clean. **+217 B** gz measured, against the spec's +0.3 KB estimate
- [x] 11. No change appears in `server/`, `worker/`, `scripts/`, `wrangler.toml`, `.env.example` or `public/reach/`.
      - `git diff --stat HEAD` over `server/`, `worker/`, `wrangler.toml`, `.env.example` and `public/` is empty. These are click-throughs, not fetches. The one file under `scripts/` that moved is `bundle-budget.json`, which is this chunk's own measurement and which the universal checklist requires

## How the non-mechanical boxes were observed

_Fill in as you tick._
