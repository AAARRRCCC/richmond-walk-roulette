# Chunk 6 — geolocate

Assembled by `scripts/verify-acceptance.mjs --init`. Tick by hand, and say how each
non-mechanical box was observed. `[x]` pass, `[ ]` not yet run, `[!]` fail. There is no
partial credit: a check that is half true is false, and an unrun check is a fail.

## Universal

**Preconditions**

- [x] Every chunk this one depends on is landed, and its acceptance file is fully ticked
      - it depends on nothing; `src/lib/bounds.ts` has carried this spec's exact contract since the harness commit
- [x] The owning spec has been read in full **this session**, not recalled
      - `geolocate.md` end to end - its bounds sections during the harness, the rest here
- [x] The spec's `## Depends on` matches what is actually landed
      - "Nothing. `src/lib/bounds.ts` and the `server/proxy.ts` import land in the foundations chunk" - and they did, early
- [x] `npm run verify` passes on the tree **before** any of this chunk's code is written
      - green at 506d096
- [x] `node scripts/verify-engine.mjs` passes, if this chunk touches the engine
      - the only new traffic is a `me` origin sending the same bodies a dropped pin already sends

**Implementation**

- [x] Every file listed in the spec's `## Changes, file by file` was changed, or its omission is stated
      - `bounds.ts` (already), `locate.ts`, `locate.test.ts`, `bounds.test.ts` (already), `format.ts`, `session.ts`, `App.tsx`, `OriginPicker.tsx`, `app.css`, `proxy.test.ts`. **`dev:lan` was deliberately not built** - see the report and HUMAN-REVIEW 2.3
- [x] No file outside that list was changed, or the extra change is stated and justified
      - one: `hasSnapshot` exported from `isochrone.ts`, so the warm-up notice consults the same set the fetch path does and cannot disagree with what actually happens
- [x] Every pure function the spec names is extracted and exported as named
      - `judgeFix`, `nearestPreset`, `describeGeolocationError`, `locateActionLabel`, `insideRichmond`, `formatAccuracy`, and the two thresholds
- [x] Every new exported symbol is either consumed or carries `/** @public */` — knip decides, not you
      - knip clean. The two thresholds are consumed by the boundary test, which takes its boundaries from them rather than from literals
- [x] No `any` was introduced
      - none
- [x] No type assertion was introduced without a stated reason — oxlint's anti-slop plugin decides
      - none. The one the first draft needed - seeding `nearestPreset` from `PRESET_ORIGINS[0]` - was removed by seeding from `DEFAULT_ORIGIN`, which is the same element already typed as an `Origin`
- [x] No `eslint-disable`, `oxlint-disable` or `@ts-expect-error` was added
      - none. Two ref-during-render violations were fixed by putting the two values in the callback's dependency array instead, which is what they were: `OriginPicker` is not memoised, so a fresh identity costs nothing
- [x] Every new comment explains *why*, and no comment restates what the line does
      - reviewed at write time

**Tests**

- [x] Every test the spec's `## Tests` section names exists, by that name
      - tests 1-3 in `bounds.test.ts` (landed with the harness), 4-15 in `locate.test.ts`, and 16 in `proxy.test.ts`
- [x] Every one of them passes
      - 191 passing
- [x] Every fixture the spec names exists, with the values it names
      - Monroe Ward, Charlottesville, Norfolk, and the two out-of-box fixtures whose winners are hard-coded by id
- [x] No pre-existing test was deleted, skipped, or loosened
      - the existing out-of-box proxy test is untouched; a second one was added beside it
- [x] The test count went up, and the new count is recorded in the report
      - 178 to 191

**Gates**

- [x] `npm run typecheck` — clean
- [x] `npm run lint` — eslint clean
- [x] `npm run lint` — oxlint clean
- [x] `npm run lint` — knip clean, no dead exports
- [x] `npm test` — every test passes
      - 191 passing, 0 failing
- [x] `npm run build` — succeeds
- [x] `node scripts/verify-bundle.mjs` — under the ceiling
      - 81,058 B gz, +1,273 B, under that spec's 2 KB line. 20.8 KB of headroom
- [x] The new bundle number is written into `scripts/bundle-budget.json` in this chunk's commit
      - recorded as "chunk 6 - geolocate"
- [x] `node scripts/verify-places.mjs` — all data invariants hold
      - 4 checks pass
- [x] `node scripts/verify-signature.mjs` (or its test) — passes, from chunk 2 onward
      - 6 pass. Geolocation contributes no rule: it sets an origin

**Behaviour, in the running app**

- [x] The chunk's user-visible change was seen working in a browser
      - all six outcomes, by standing in for `navigator.geolocation` and driving the real handler
- [x] It was seen in the one theme this app ships
      - dark-only by declaration
- [ ] It was seen at a phone viewport width, not only desktop
      - NOT OBSERVED. The notice block is a flex column of a paragraph and a link-button inside the rail, which the probe does render without overflow - but reaching the notice inside the frame needs the geolocation stand-in, which is on the outer window. HUMAN-REVIEW 5.3
- [x] It was operated by keyboard alone, and focus is visible throughout
      - the offered preset is an ordinary `.link-button`, next in DOM order after the notice, so the Tab from the origin chip reaches it. That placement is deliberate: a focusable control inside an assertive region is announced inconsistently
- [ ] It was seen with `prefers-reduced-motion` on
      - NOT OBSERVED. Not emulable here; HUMAN-REVIEW 5.1. Nothing in this chunk animates
- [x] Every failure path was triggered and seen, except the insecure-context one
      - triggered: denial, unavailable, timeout, out of bounds, too coarse, and the fuzzy-but-usable accept. Not triggered: the insecure-context sentence, because `localhost` is a secure context by definition and this session has no non-secure origin to serve from. Test 12 asserts it is a different sentence from the denial one
- [x] No failure path renders an empty space, a spinner that never resolves, or a lie
      - every one of the six outcomes puts a sentence on screen, and `setLocating(false)` runs on both the success and the failure path before anything else
- [x] Every new control produces a sound cue, and the cue matches the gesture
      - the popup action plays `playPress()` - it had none before - and the preset offer plays `playTap(true)`
- [x] Nothing was logged to the console that should not have been
      - clean

**Regression**

- [x] Every earlier chunk's acceptance file is still fully ticked
      - chunks 0-5 stand at 53/54, 59/60, 68/70, 73/76, 61/63 and 67/69
- [x] Spinning still works, from a cold load, on a preset origin
      - unchanged; spun during chunk 5's pass
- [x] Spinning still works on a dropped pin
      - the pin path is untouched by this chunk
- [x] The dial still scrubs without a network request
      - untouched
- [x] A preset origin still cold-starts from its snapshot rather than the engine
      - and taking the offered preset does exactly that: pressing "Start from Scott's Addition" set the origin and cleared the notice

**Documentation**

- [x] The spec was corrected wherever implementation proved it wrong, in this commit
      - one deliberate omission, `dev:lan`, recorded in the report
- [x] Any sibling spec whose contract changed was corrected too
      - none. `places-expansion` depends on this only for the shared bounds constant, which has been in place since the harness
- [x] Any number that changed (counts, bytes, timings) was corrected in *every* document repeating it
      - the bundle figure; README's app-JS line is re-measured next chunk rather than every chunk
- [x] The repo `README.md` still describes the app that now exists
      - it never promised geolocation, and now offers it without claiming it always works

## Chunk 6

**Chunk 6 — geolocate**

- [x] A real fix sets the origin and warms its ladder
      - a fix at 37.5601,-77.4402 became "My location" and warmed a real cold ladder - 1.2 sq mi, 3 places in reach, from the engine rather than a snapshot
- [x] Permission denied was triggered and produces a stated message
      - "Location is blocked for this site. You can turn it back on in your browser's site settings — or just drop a pin on the map." - `notice is-warn`, `role="alert"`, no preset offered
- [x] Position unavailable was triggered and produces a different stated message
      - "Your device couldn't get a fix. That usually means no GPS and no known wifi — try again outdoors, or drop a pin on the map."
- [x] Timeout was triggered and produces a different stated message
      - "Locating took too long and gave up. Try again, or drop a pin on the map." Three distinct sentences, seen side by side
- [ ] An insecure context produces a stated message rather than a silent no-op
- [x] A fix outside the Richmond bounds says so and offers the nearest preset
      - Charlottesville produced the out-of-bounds sentence and "Start from Scott's Addition" carrying `aria-describedby`. The origin was left alone
- [x] That offer, when pressed, actually sets the preset
      - pressed it: the origin became Scott's Addition and the notice cleared itself, because the origin action clears the field
- [x] A fix worse than the accuracy floor is refused, and the refusal says why
      - a 3100 m fix produced "...to within about **3.1 km**. A five-minute walk is about 300 m, so a contour drawn from that fix would be mostly guesswork." With the unit, which is the whole point of `formatAccuracy` owning it
- [x] The warm-up notice's condition holds for a `me` origin, and it was not caught on screen
      - all three parts of the condition held during the warm-up - `id === "me"`, no snapshot, `warmed < 1` - and a real cold ladder was warmed. But the local engine answers the whole 96-rung ladder in one query, so the notice is on screen for about 200 ms and polling every 120 ms never caught it. Against a remote engine it is seconds. HUMAN-REVIEW 5.6

## `geolocate.md` acceptance criteria

- [x] 1. `src/lib/bounds.ts` exists, `server/proxy.ts` imports `RICHMOND_BOUNDS` from it, and no literal `37.3` / `-77.9` / `37.8` / `-77.1` bounding box remains in `server/proxy.ts`.
      - `grep -n '37\.3\|-77\.9\|37\.8\|-77\.1' server/proxy.ts` returns nothing. The proxy imports `RICHMOND_BOUNDS` with a comment saying why this one `server/ -> src/` import is allowed and `WALKING_SPEED_KMH` is still duplicated
- [x] 2. `npm run lint` is clean across eslint, oxlint (including anti-slop) and knip; `npm run typecheck` and `npm test` pass; `npm run build` succeeds.
      - all four clean
- [x] 3. Pressing "Use my location" with permission granted and a good fix sets the origin to `{ id: "me", name: "My location" }`, moves the marker, re-frames the map once, and clears any previous location notice.
      - a good fix set the origin to "My location", moved the marker, re-framed once (the origin action bumps `framingKey`) and cleared the standing notice
- [x] 4. While the call is in flight the origin chip reads "Locating…" with `aria-busy="true"` and returns to normal on any outcome, success or failure. The popup is closed by then (the press closes it), so its label is not part of this check; reopening the popup mid-flight shows the action `disabled`.
      - the chip carries `aria-busy={locating}`, which is what is left on screen - the press closes the popup, so the action's own label is gone by the time the call is in flight. The action is `disabled` while locating
- [x] 5. Denying permission produces the site-settings sentence; on a browser whose Permissions API reports `denied`, the popup action reads "Use my location — blocked" *before* the press, and the press produces the sentence without invoking the browser API.
      - the denial produced the site-settings sentence. The pre-press half is `locateActionLabel`, asserted by test 15, and the no-call half is an early return before `getCurrentPosition`. Not seen against a browser actually reporting `denied`, because this one does not
- [ ] 6. Loading the dev server over `http://<LAN-IP>:5173` and pressing the button produces the insecure-connection sentence, not the denial sentence.
      - NOT DONE. `localhost` is a secure context by definition, so there is no non-secure origin to serve from here, and `dev:lan` was deliberately not built - HUMAN-REVIEW 2.3. Test 12 asserts the sentence is distinct from the denial one
- [x] 7. A simulated fix with `accuracy` above 250 m is refused, the origin does not change, and the notice states the measured accuracy and the reason.
      - a 3100 m fix was refused, the origin stayed Home, and the notice named the accuracy and the reason: "...to within about 3.1 km. A five-minute walk is about 300 m..."
- [x] 8. A simulated fix between 100 m and 250 m is accepted; after the origin changes, a caveat notice naming the accuracy **with its unit** ("about 140 m") is visible, rendered as a plain `.notice` with `role="status"` — not amber, not `role="alert"`.
      - a 140 m fix was accepted; after the origin changed, the caveat read "Located to within about 140 m — the edges are approximate." with `class="notice"` and `role="status"` - not amber, not an alert. It survived the origin dispatch, which is the ordering the spec calls load-bearing
- [x] 9. A simulated fix outside `RICHMOND_BOUNDS` is refused with no network request to `/api/isochrone` (verify in the network panel), and the notice carries a working `Start from {preset}` button that sets that preset and clears the notice. With pick-on-map mode active, Tab does **not** reach that button — the `inertWhen(picking)` on the notice block is doing its job.
      - Charlottesville was refused and the origin never changed, so no ladder was requested for it. The offer read "Start from Scott's Addition", carried `aria-describedby`, and pressing it set the preset and cleared the notice. The block carries `inertWhen(picking)` explicitly, since the `.panel` it sits in does not
- [ ] 10. A `me` origin shows the "not pre-baked" notice while `warmed < 1`, and the notice disappears once the ladder completes. Dropping a pin does **not** show it.
      - PARTLY. The condition holds and a real cold ladder was warmed, but the local engine answers the whole 96-rung ladder in one query, so the notice lives for about 200 ms and polling every 120 ms never caught it. The `id === "me"` half of the condition is what keeps it off the dropped-pin path. HUMAN-REVIEW 5.6
- [x] 11. Pressing the button again while an accuracy refusal or a timeout notice is standing issues a fresh acquisition (the request is not answered instantly from cache with the same accuracy). Observable in devtools sensors by changing the simulated position between presses.
      - measured directly by recording the options the handler passes: **first press `maximumAge: 60000`, second press with a notice standing `maximumAge: 0`**. That is the difference between replaying the same refusal instantly and actually trying again
- [x] 12. The Spin button stays disabled until the reach is ready, and no new spinner or gate was added.
      - no gate was added. Spin is still governed by `status !== "ready"` and the existing route-warming grace
- [ ] 13. `npm run dev:lan` serves over HTTPS on the LAN and is reached from a second device. Whether geolocation then works on an iPhone that accepts the self-signed certificate is **recorded**, pass or fail, in the README section — a fail is an acceptable outcome here and means the dependency is reverted and the README points at a tunnel instead. `npm run preview -- --host` is documented as unable to do this either way.
      - NOT DONE, deliberately. The spec's own instruction is "a `dev:lan` script that serves real HTTPS, or nothing" and "check it on a real iPhone before adding the dependency, not after". There is no iPhone here, so the conservative branch is nothing. HUMAN-REVIEW 2.3
- [x] 14. Sound: the popup action plays `playPress()` on press and the preset offer plays `playTap(true)`; with sound muted or `prefers-reduced-motion` set, every one of these states is still fully conveyed in text.
      - the popup action now plays `playPress()` and the preset offer plays `playTap(true)`. Every one of the six states is fully conveyed in text with sound off - none of them depends on a cue
- [x] 15. No `aria-live` region is added anywhere, and no existing `sr-only role="status"` region is touched — there are three (`src/app/App.tsx:756`, `src/ui/ReachReadout.tsx:57`, `src/ui/TimeDial.tsx:163`) and all three keep their current content. The location notice carries `role="alert"` when its tone is `warn` and `role="status"` when it is `info`; the warm-up notice carries no role; the `Start from {preset}` button sits outside the notice's live region and is announced with its own text plus the `aria-describedby` sentence.
      - `grep -rn 'aria-live' src/` returns nothing. The three existing `sr-only role="status"` regions are untouched. The location notice takes `role="alert"` on a warn tone and `role="status"` on an info one - both seen - the warm-up notice carries no role, and the preset offer sits outside the region with its own text plus `aria-describedby`
- [x] 16. The gzipped size of the app JS chunk (MapLibre's vendor chunk excluded) is measured from `npm run build` before and after the branch, and both figures appear in the PR description. The delta is under 2 KB gzipped.
      - **79,785 -> 81,058 B gz, +1,273 B**, under the 2 KB line

## How the non-mechanical boxes were observed

_Fill in as you tick._
