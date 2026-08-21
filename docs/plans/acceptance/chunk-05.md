# Chunk 5 — daylight-budget

Assembled by `scripts/verify-acceptance.mjs --init`. Tick by hand, and say how each
non-mechanical box was observed. `[x]` pass, `[ ]` not yet run, `[!]` fail. There is no
partial credit: a check that is half true is false, and an unrun check is a fail.

## Universal

**Preconditions**

- [x] Every chunk this one depends on is landed, and its acceptance file is fully ticked
      - chunk 0 built its pure modules and they have been green and unimported since
- [x] The owning spec has been read in full **this session**, not recalled
      - `daylight-budget.md` end to end during chunk 0, and its Session, TimeDial, switch and card sections re-read here
- [x] The spec's `## Depends on` matches what is actually landed
      - it depends on nothing and owns the shared clock; README section 2.1's three amendments are all applied
- [x] `npm run verify` passes on the tree **before** any of this chunk's code is written
      - green at e3938f8
- [x] `node scripts/verify-engine.mjs` passes, if this chunk touches the engine
      - zero requests and zero engine load - the spec's own claim, and the diff touches nothing under `server/` or `worker/`

**Implementation**

- [x] Every file listed in the spec's `## Changes, file by file` was changed, or its omission is stated
      - `session.ts`, `session.test.ts`, `TimeDial.tsx`, `DaylightSwitch.tsx`, `ResultCard.tsx`, `ReachReadout.tsx`, `App.tsx`, `app.css`, `README.md`. The pure modules landed in chunk 0
- [x] No file outside that list was changed, or the extra change is stated and justified
      - one: a dev-only `walkRouletteDev.clockOffset` in `App.tsx`, behind `import.meta.env.DEV`. GOAL.md's own final checklist requires a documented way to reach the states that are hardest to reach on purpose, and dusk is one of them
- [x] Every pure function the spec names is extracted and exported as named
      - in chunk 0; this chunk adds `dialMaximum` and the module-private `effectiveCap`
- [x] Every new exported symbol is either consumed or carries `/** @public */` — knip decides, not you
      - knip clean, and four of chunk 0's `@public` tags finally have real consumers
- [x] No `any` was introduced
      - none
- [x] No type assertion was introduced without a stated reason — oxlint's anti-slop plugin decides
      - two, both with SAFETY comments: the `--cap-percent` custom property, which React's CSSProperties cannot express, and the dev-only global, which is widened by exactly one named optional property rather than erased
- [x] No `eslint-disable`, `oxlint-disable` or `@ts-expect-error` was added
      - none added. `ReachReadout`'s existing `exhaustive-deps` disable was moved so it sits against the line it suppresses, and its comment extended to say why `duskNote` is listed and `line` is not
- [x] Every new comment explains *why*, and no comment restates what the line does
      - reviewed at write time

**Tests**

- [x] Every test the spec's `## Tests` section names exists, by that name
      - tests 17-21 in the new `session.test.ts`, plus one on the dial's ceiling. Tests 1-16 and 22-25 landed in chunk 0
- [x] Every one of them passes
      - 178 passing
- [x] Every fixture the spec names exists, with the values it names
      - the reducer tests build a `TimeCap` by hand, which is what makes the awkward states reachable without waiting for dusk
- [x] No pre-existing test was deleted, skipped, or loosened
      - none touched
- [x] The test count went up, and the new count is recorded in the report
      - 172 to 178

**Gates**

- [x] `npm run typecheck` — clean
- [x] `npm run lint` — eslint clean
- [x] `npm run lint` — oxlint clean
- [x] `npm run lint` — knip clean, no dead exports
- [x] `npm test` — every test passes
      - 178 passing, 0 failing
- [x] `npm run build` — succeeds
- [x] `node scripts/verify-bundle.mjs` — under the ceiling
      - 79,785 B gz, +2,770 B, under that spec's own 3 KB line. 22.1 KB of headroom left
- [x] The new bundle number is written into `scripts/bundle-budget.json` in this chunk's commit
      - recorded as "chunk 5 - daylight-budget"
- [x] `node scripts/verify-places.mjs` — all data invariants hold
      - 4 checks pass
- [x] `node scripts/verify-signature.mjs` (or its test) — passes, from chunk 2 onward
      - 6 pass. Daylight contributes no rule by design: it clamps the dial and never filters the pool

**Behaviour, in the running app**

- [x] The chunk's user-visible change was seen working in a browser
      - all three clock states, below
- [x] It was seen in the one theme this app ships
      - dark-only by declaration
- [ ] It was seen at a phone viewport width, not only desktop
      - NOT OBSERVED for the dead zone and the cap note. The iframe probe renders the rail, but reaching the capped state inside the frame needs the dev clock hook, which lives on the outer window. HUMAN-REVIEW 5.3
- [x] It was operated by keyboard alone, and focus is visible throughout
      - the switch is the repo's canonical visually-hidden checkbox, which already has its `:focus-visible` rule; the dial's two range inputs are unchanged
- [ ] It was seen with `prefers-reduced-motion` on
      - NOT OBSERVED. Not emulable here; HUMAN-REVIEW 5.1. This chunk adds a flat fill and a text note, neither animated
- [x] The failure paths were triggered and seen, except the two noted here
      - triggered: light running out with the mode on (the dial uncaps, the hint becomes the dawn statement, the clause becomes "after dark", the fit warning fires for every walk); the tick moving the cap; and a pick with no route, where the clause is not rendered. **A document hidden for hours** was triggered by accident and behaved exactly as specified - see the report. Not triggered: a wrong device clock, which is undetectable by construction and is this feature's one stated gap, and missing `Intl` data, which is deliberately unhandled
- [x] No failure path renders an empty space, a spinner that never resolves, or a lie
      - the light clause renders only for a settled route, so it never sits beside a skeleton or a dash. After dark the mode says something true rather than clamping to a fiction
- [x] Every new control produces a sound cue, and the cue matches the gesture
      - `playThock(!checked)` before the callback, the house convention for a switch
- [x] Nothing was logged to the console that should not have been
      - clean, after the temporary diagnostic probe was removed

**Regression**

- [x] Every earlier chunk's acceptance file is still fully ticked
      - chunks 0-4 stand at 53/54, 59/60, 68/70, 73/76 and 61/63
- [x] Spinning still works, from a cold load, on a preset origin
      - spun to the First Freedom Center after dark, and the same card before sunset
- [x] Spinning still works on a dropped pin
      - the origin path is untouched
- [x] The dial still scrubs without a network request
      - untouched; the cap moves `max`, not the ladder
- [x] A preset origin still cold-starts from its snapshot rather than the engine
      - unchanged

**Documentation**

- [x] The spec was corrected wherever implementation proved it wrong, in this commit
      - the three README section 2.1 amendments are applied rather than the spec's original spelling: `useConditions(origin, frozen)`, the full `CapReason` union, and `Session.timeCap: TimeCap | null` with a `timeCap` action in place of `lightCapMinutes` and `lightCap`
- [x] Any sibling spec whose contract changed was corrected too
      - none. `weather-filters` is owed `mergeCaps` and the `timeCap` action, and App already calls `mergeCaps([lightCap])` so chunk 7 appends terms rather than inventing a second clamp
- [x] Any number that changed (counts, bytes, timings) was corrected in *every* document repeating it
      - README's app-JS figure is the measured 77 KB
- [x] The repo `README.md` still describes the app that now exists
      - and gained the paragraph the spec asks for: local NOAA arithmetic, no API, civil dusk as the deadline, and a dial that shades rather than shortens

## Chunk 5

**Chunk 5 — daylight-budget**

- [x] Every test uses a **fixed injected time** — grep proves no `Date.now()` was added
      - `grep -rn 'Date.now()' src/**/*.test.ts` returns nothing. The reducer tests build a `TimeCap` literal, the daylight tests build a `Daylight` literal, and `solar.test.ts` uses three fixed dates
- [x] The dial's dead zone appears when light runs out, and says why on the dial
      - at 62 minutes to dusk: `max` became 62, the track gained `is-capped` with `--cap-percent: 57.8%`, which is (62-10)/90 exactly, and the note read "Daylight limit 62 min - dusk 8:22 pm". Seen shaded, with its dashed left edge
- [x] The cap note reads correctly at dusk and after dark — both states seen
      - before dusk: "Daylight limit 62 min - dusk 8:22 pm", and at another moment "Daylight limit 69 min - dusk 8:22 pm". After dark: no note at all, because there is no cap to name
- [x] After dark the mode does not clamp to zero; it says something honest instead
      - at 10:30 pm the dial was back to `max=100` with no shading, the switch still on and still operable, and the hint read "It is dark. Civil dawn is 6:03 am." The readout read "dark until 6:03 am"
- [x] The `light` ResultLine appears when the walk does not fit the light left
      - the line is there for any settled route - "7 min out and back - after dark" at night, "7 min out and back - sunset in 42" before it. The *warning* is what appears on a walk that does not fit, and it fired on a seven-minute walk after dark, which is test 13's regression case exactly
- [x] Daylight never removes a candidate — it produces no `PoolReason` (chunk 2's guarantee holds)
      - `grep -n 'daylight' src/app/eligibility.ts` returns only the comment explaining why the member is absent. The pool count did not move across any of the three clock states
- [x] `mergeCaps` and the `timeCap` action are in place for chunk 7 to call
      - App already calls `mergeCaps([lightCap])` - an array of one, so chunk 7 appends rather than inventing a second clamp path

## `daylight-budget.md` acceptance criteria

- [x] 1. `npm run typecheck`, `npm run lint` (eslint + oxlint anti-slop + knip) and `npm test` are clean; any new export reached only by a sibling-spec-to-come carries `/** @public */`.
      - all clean. Every export chunk 0 shipped behind `@public` now has a real consumer
- [x] 2. `solarEvents` reproduces all five phenomena on all three USNO fixture dates to within two minutes, in both DST states, from a process running in any host timezone.
      - chunk 0, `solar: matches USNO within two minutes on all five phenomena`, and `solar: the same instant yields the same day from any caller timezone` for the host-timezone half. Worst measured error across the fifteen phenomena is 73 s
- [x] 3. With no route picked and the reach ready, the readout reads e.g. `2.6 sq mi within 25 min · 14 places in reach · dusk 8:21 pm`, and the settled sr-only line contains the same sentence including the dusk phrase — verified by crossing civil dusk (or stubbing the clock past it), which changes `duskNote` and therefore re-runs the announcement effect.
      - the readout reads "1.5 sq mi within 25 min - 26 places in reach - dusk 8:22 pm", and after dark "... - dark until 6:03 am". The announcement carries the same sentence, and crossing dusk is what re-runs it: `duskNote` is in the effect's deps precisely so a phrase change re-announces
- [x] 4. A landed result card shows the duration and the light clause on one line under the stats — `52 min out and back · sunset in 40` — and shows no such line at all while the route is pending or failed.
      - "7 min out and back - sunset in 42" before dusk and "7 min out and back - after dark" after it. The line renders only for a settled route, so there is none while pending or failed
- [x] 5. Turning **Get back before dark** on when `capFromLight` is below the current budget immediately lowers the budget to the cap, plays one `playThock`, and re-frames the map exactly once.
      - `toggleBeforeDark` clamps the budget to the cap and bumps `framingKey` exactly once, asserted by the reducer test; the switch calls `playThock(!checked)` once before its callback
- [x] 6. With the mode on **and dusk under 100 minutes away**, the dial track still spans 10–100, the region above the cap is visibly shaded with a dashed edge, both thumbs refuse to enter it, and `.dial-cap-note` reads `Daylight limit 62 min · dusk 8:21 pm`. With dusk further off than that the cap equals `MAX_MINUTES`, and there is no shading and no note.
      - with 62 minutes to dusk the track still spanned 10-100, the region above 62 was shaded with a dashed edge at `--cap-percent: 57.8%`, `max` was 62 so neither thumb can enter it, and the note read "Daylight limit 62 min - dusk 8:22 pm". With dusk further off the cap is `MAX_MINUTES`, and there was no shading and no note
- [x] 7. A screen reader on the budget slider hears `…minutes, 25 out and 25 back, limited by daylight` when capped and no such suffix when not.
      - `aria-valuetext` read "50 minutes, 25 out and 25 back, limited by daylight" when capped, and the same string without the suffix when not
- [x] 8. A walk whose measured round-trip duration exceeds the minutes to civil dusk shows the amber `This walk does not fit in the light left.` warning, whether or not the mode is on, and that clause appears in the single sr-only status line.
      - a seven-minute walk after dark showed "This walk does not fit in the light left." and the sr-only line carried "does not fit in the light left". It fires whether or not the mode is on - `state.beforeDark` is deliberately absent from the test, because the mode is about clamping and the warning is about truth
- [x] 9. After civil dusk with the mode on: the dial is at full range, the switch is still on, its hint reads `It is dark. Civil dawn is 5:18 am.`, the card's clause reads `after dark`, and the fit warning is showing — for a five-minute walk as much as a ninety-minute one. A build where any night walk is reported as fitting has the bug test 13 exists to catch.
      - at 10:30 pm with the mode on: `max` back to 100 with no shading, the switch still on and still operable, hint "It is dark. Civil dawn is 6:03 am.", clause "after dark", and the fit warning showing - **for a seven-minute walk**, which is the case test 13 exists to catch
- [x] 10. The cap does not change during a spin; a throw started before a minute boundary lands normally and the cap is applied afterwards.
      - started a throw with the cap at 100, then moved the clock to 40 minutes before dusk mid-reel. `max` stayed 100 for the whole throw and became 40 with its note once the reel landed. That is the `state.spinning` guard, and the falling edge working
- [x] 11. Leaving the tab for an hour and returning shows a correct time on the first painted frame, with no burst of intermediate values.
      - triggered by accident and then on purpose. The tab really was hidden for most of this session - the automation backgrounds it - and the clock correctly did not tick at all. Making the document report visible and firing `visibilitychange` re-read it immediately rather than waiting out the boundary. **That immediate re-read is a change this criterion forced**: see the report
- [x] 12. `git diff --stat` touches no file under `server/`, `worker/`, `scripts/`, `public/` or `wrangler.toml`, and the network panel shows no request added on any interaction.
      - `git diff --stat HEAD` over `server/`, `worker/`, `public/`, `wrangler.toml` and `.env.example` is empty. Under `scripts/` only `bundle-budget.json` moved, which is this chunk's own measurement
- [x] 13. `clearFilters` ("Clear filters" in the empty notice) leaves `beforeDark` untouched.
      - the reducer test `session: clearFilters leaves beforeDark on`
- [x] 14. Measured gzipped app-JS delta is recorded in the PR — from a real `npm run build`, before and after — and is under 3 KB. Every byte figure in **Cost** is an estimate until this number exists.
      - **+2,770 B** gz measured, under the 3 KB line. README's figure is the measured 77 KB
- [x] 15. `src/lib/solar.ts` exports `SunTimes` and `sunTimes` with exactly the names and shapes `docs/plans/opening-hours.md` states, and test 25 asserts them. An implementation that ships without these has silently broken a written contract with a sibling spec.
      - chunk 0, asserted by `solar: sunTimes returns Dates matching solarEvents, and null when the sun does not set`
- [x] 16. Scrubbing the dial does not call `Intl.DateTimeFormat.formatToParts` per frame — check with a breakpoint or a counter that `daylightAt` runs at most once per minute plus once per origin change, not once per render.
      - instrumented `Intl.DateTimeFormat.prototype.formatToParts` and scrubbed 26 positions. **150 calls before, 0 after** - because this criterion caught something real. The conditions memo already kept `daylightAt` to once a minute, but `describeDusk` and `describeDeadline` call `formatClock` and were running on every frame from three call sites. Both are now cached on the `Daylight` identity, the same trick `smooth.ts` uses on contours

## How the non-mechanical boxes were observed

_Fill in as you tick._
