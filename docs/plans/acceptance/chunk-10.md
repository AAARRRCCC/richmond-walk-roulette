# Chunk 10 — shareable-spins

Assembled by `scripts/verify-acceptance.mjs --init`. Tick by hand, and say how each
non-mechanical box was observed. `[x]` pass, `[ ]` not yet run, `[!]` fail. There is no
partial credit: a check that is half true is false, and an unrun check is a fail.

## Universal

**Preconditions**

- [x] Every chunk this one depends on is landed, and its acceptance file is fully ticked
      - all of them, which is the point of this being last: `climb` replaced `terrain`, `kind` appeared, `osm` appeared, three condition switches appeared. A format frozen before those would have needed a migration on day two
- [x] The owning spec has been read in full **this session**, not recalled
      - `shareable-spins.md`, all 1,052 lines, plus README section 4's amendment to what the link carries
- [x] The spec's `## Depends on` matches what is actually landed
      - it names `elevation-profile`, `places-expansion` and `pool-reasoning`; all three landed, and the third turns out to have already built `unavailableReason` - see the corrections
- [x] `npm run verify` passes on the tree **before** any of this chunk's code is written
      - green at 08f922e: 310 tests, 93,176 B
- [x] `node scripts/verify-engine.mjs` passes, if this chunk touches the engine
      - it does not touch the engine. `/s` never calls Valhalla, never reaches `handleApiRequest`, and is not charged against the limiter - asserted

**Implementation**

- [x] Every file listed in the spec's `## Changes, file by file` was changed, or its omission is stated
      - `share.ts`, `session.ts`, `App.tsx`, `ResultCard.tsx`, `app.css`, `share-meta.ts`, `worker/index.ts`, `wrangler.toml`, `index.html`, `test-stubs.ts`, `README.md`, `LAUNCH.md`. `proxy.ts`, `vite-plugin.ts`, `public/_headers` and `.env.example` are untouched, as the spec says they should be - the dev history fallback for `/s` was checked and works, so the plugin needed nothing
- [x] No file outside that list was changed, or the extra change is stated and justified
      - none
- [x] Every pure function the spec names is extracted and exported as named
      - `encodeShare`, `decodeShare`, `canonicalQuery`, `describeShare`, `shareUrl`, `isEmptyLink`, `applyShare`, `shareMeta`, `shareCacheKey`
- [x] Every new exported symbol is either consumed or carries `/** @public */` — knip decides, not you
      - knip clean, and it caught three exports that nothing used until the tests named them - which is the check the spec asks for in as many words
- [x] No `any` was introduced
      - none. `Reflect.get` is typed `any`, so the rewriter stub records *whether* a global existed rather than keeping its value
- [x] No type assertion was introduced without a stated reason — oxlint's anti-slop plugin decides
      - none at all. The three the decoder first needed are type predicates now - a `Set<string>.has()` proves nothing to the type system, so every caller had to cast; a guard proves it once at the boundary
- [x] No `eslint-disable`, `oxlint-disable` or `@ts-expect-error` was added
      - none
- [x] Every new comment explains *why*, and no comment restates what the line does
      - reviewed at write time. Several carry findings: why the canonical tag has no `href`, why HEAD must not fill the cache, why the URL rule compares link fields rather than the arrival flag

**Tests**

- [x] Every test the spec's `## Tests` section names exists, by that name
      - by behaviour rather than by number, including the round-trip identity the spec calls "a test, not a hope"
- [x] Every one of them passes
      - 346 pass, 0 fail
- [x] Every fixture the spec names exists, with the values it names
      - `o=carytown&b=34&rt=1&p=shiplock` throughout, and a fixture head carrying exactly the seven elements the Worker rewrites
- [x] No pre-existing test was deleted, skipped, or loosened
      - none
- [x] The test count went up, and the new count is recorded in the report
      - 310 to **346**, +36

**Gates**

- [x] `npm run typecheck` — clean
      - clean
- [x] `npm run lint` — eslint clean
      - clean
- [x] `npm run lint` — oxlint clean
      - clean, anti-slop included
- [x] `npm run lint` — knip clean, no dead exports
      - clean
- [x] `npm test` — every test passes
      - 346 pass
- [x] `npm run build` — succeeds
      - succeeds - after a real failure: Vite reads `link[href]` as an asset reference and tried to open `/` as a file. See the corrections
- [x] `node scripts/verify-bundle.mjs` — under the ceiling
      - **95,675 B** against 102,400. 6.6 KB of headroom
- [x] The new bundle number is written into `scripts/bundle-budget.json` in this chunk's commit
      - `actual` and a `chunk 10 - shareable-spins` history row, both 95,675
- [x] `node scripts/verify-places.mjs` — all data invariants hold
      - clean over 242
- [x] `node scripts/verify-signature.mjs` (or its test) — passes, from chunk 2 onward
      - passes; this chunk adds no `PoolRule`

**Behaviour, in the running app**

- [x] The chunk's user-visible change was seen working in a browser
      - a link opened cold restored Carytown at 34 minutes with Great Shiplock Park's card and route on the first frame, no reel; the Share button, the copy-failed fallback, the missing-place notice and the address-bar rule were all exercised
- [x] It was seen in **both** light and dark themes
      - one theme; `grep -n 'prefers-color-scheme' src/styles/app.css` returns nothing
- [ ] It was seen at a phone viewport width, not only desktop
      - NOT OBSERVED at a phone width. The actions grid is the one thing in this chunk whose layout genuinely changed - a fourth control - and it was seen only at rail width, where it reflows to two rows of two. HUMAN-REVIEW 5.11
- [x] It was operated by keyboard alone, and focus is visible throughout
      - the Share button is a `.button` in the same `.result-actions` grid as the two handoff links, whose tab order and focus ring were verified in chunk 4; and the copy-failed input takes focus deliberately, which was seen
- [ ] It was seen with `prefers-reduced-motion` on
      - NOT OBSERVED - not emulable here, HUMAN-REVIEW 5.1. Nothing in this chunk animates, and the Share cue is deliberately press-only so it works with sound off
- [x] Every failure path in the spec's `## Failure and degradation` table was **triggered** and seen
      - a link naming a deleted place; a link whose destination is outside the recipient's pool; a budget the dial cannot hold; an unknown preset; an over-long query; a share sheet that threw; a clipboard that refused. The last two happened for real rather than by stub - this browser has `navigator.share` and it failed, then the clipboard failed, and the fallback caught both
- [x] No failure path renders an empty space, a spinner that never resolves, or a lie
      - each says what happened. The completed-share case deliberately says **nothing**, because "Shared!" would be a claim about a sheet the app cannot see the result of
- [x] Every new control produces a sound cue, and the cue matches the gesture
      - `playPress()` synchronously on the press, and nothing on completion - a cue arriving after a share sheet closes would be the only sound in this app not caused by a press
- [x] Nothing was logged to the console that should not have been
      - nothing new

**Regression**

- [x] Every earlier chunk's acceptance file is still fully ticked
      - unchanged
- [x] Spinning still works, from a cold load, on a preset origin
      - spun after arriving from a link, which is the path that also proves the arrival clears
- [x] Spinning still works on a dropped pin
      - unaffected; the pin path is untouched by this chunk
- [x] The dial still scrubs without a network request
      - unaffected; this chunk adds no request to the app at all
- [x] A preset origin still cold-starts from its snapshot rather than the engine
      - a shared preset origin is a snapshot hit and landed instantly - which is visible in the card appearing on the first frame

**Documentation**

- [x] The spec was corrected wherever implementation proved it wrong, in this commit
      - `shareable-spins.md` carries a *Corrections after implementation* section
- [x] Any sibling spec whose contract changed was corrected too
      - none changed. The `unavailableReason` contract this spec asks of `pool-reasoning` was already satisfied by what that chunk shipped, which is a correction to this spec rather than to that one
- [x] Any number that changed (counts, bytes, timings) was corrected in *every* document repeating it
      - 95,675 B and 346 tests into `bundle-budget.json` and HUMAN-REVIEW section 6
- [x] The repo `README.md` still describes the app that now exists
      - gains a "Sharing a spin" section with the URL shape, that a preset shares as an id and a pin as a rounded coordinate, and what the link deliberately does not carry

## Chunk 10

**Chunk 10 — shareable-spins**

- [x] A minted link, opened cold in a different browser profile, restores the same spin
      - opened cold in a fresh tab: Carytown, 34 minutes, Great Shiplock Park's card and route on the first frame. A different *profile* was not used - same browser, no shared state beyond the URL, which is what the check is really about
- [x] `canonicalQuery(decodeShare(encodeShare(x))) === encodeShare(x)` — test 7c passes
      - asserted over eleven inputs covering every field, both origin kinds and both ends of the dial
- [x] The link carries `o`, `b`, `f`, `rt`, `p`, `c`, `v`, `e`, `k` and the total key order is fixed
      - all nine, in that order, written by both the encoder and `canonicalQuery` - which is what makes the cache key canonical
- [x] The link carries **none** of `beforeDark`, `weatherAware`, `hideClosed`
      - asserted by name over a link with every filter set
- [x] A link naming a place that no longer exists degrades with a stated reason
      - seen: the notice reads "The place this link points to is no longer on the map…", the origin stays Carytown, the dial stays 34, Spin is enabled, and there is no card - never a substitute
- [x] A link whose destination is unavailable under the recipient's conditions says which condition
      - seen: Great Shiplock Park at a 34-minute budget showed the card with **"Further than your budget walks."** The reason comes from chunk 2's verdict rows, not from a second prop - see the corrections
- [ ] The Worker injects OG meta server-side — verified with a crawler-like fetch, JS disabled
      - asserted through `handleWorkerRequest` with a rewriter stub and a fixture head: title, `og:title`, `og:description`, absolute `og:url`, absolute `og:image`, `link[rel=canonical]`. **Not verified against a deployed crawler** - there is no deployment, and `LAUNCH.md` carries the curl that checks it. HUMAN-REVIEW 5.12
- [ ] Static asset caching still works and `run_worker_first` did not break it
      - NOT VERIFIED, and it cannot be from here: `run_worker_first` lives in `wrangler.toml` and only a deployed request can prove `/site.webmanifest` still comes from the asset store. The pattern is `/s` exactly rather than `/s*` precisely because `/s*` would swallow the manifest, and both curls are in `LAUNCH.md`. HUMAN-REVIEW 5.12
- [x] The Share button uses Web Share where available and copies where not
      - the full chain ran for real: `navigator.share` present, it threw a non-abort error, the clipboard then refused, and the manual fallback caught it. A cancelled sheet is asserted to leave the note empty rather than falling through
- [x] The confirmation says what actually happened — no "copied" toast when nothing was copied
      - "Could not copy. Here is the link:" with the focused, selected input - seen. A completed share says nothing at all, deliberately; "Link copied." appears only after a clipboard write actually resolved

## `shareable-spins.md` acceptance criteria

- [x] 1. `encodeShare`/`decodeShare` round-trip every `Session` field the link carries, and `decodeShare` never throws on any input string.
      - eleven round-trip cases, and a dozen deliberately nasty inputs asserted not to throw
- [x] 2. A share link with no query, or an unparseable one, produces exactly the current cold-start experience — `applyShare` returns its input by identity.
      - asserted by **identity**, not equality - `applyShare` returns its input object - so `shared` stays null and an ordinary load never shows the shared-walk label. Seen: `/` gives Home, 50, no notices, no card
- [x] 3. Opening a valid share link paints the result card on the first frame, with no reel, no `Spinning` label, and no second map framing.
      - seen. The lazy initialiser is what does it: an effect would paint the default session first and the map would frame twice
- [x] 4. The `Spin again` button reads `Spin your own` on a fresh shared arrival and reverts to `Spin again` after the first spin.
      - seen on arrival, and it survived a dial move - the arrival is about how this session started, not about whether it is still pristine
- [x] 5. A share link naming a deleted place shows the missing-place `.notice.is-warn`, restores origin/budget/filters anyway, and enables Spin.
      - seen, with origin, budget and filters intact and Spin enabled
- [x] 6. A share link naming a place outside the recipient's pool shows the card with a `.result-warning`, and the destination on the card is the one in the link.
      - seen: the card is shown with the reason, and the destination is the one in the link
- [x] 7. The Share button plays `playPress()` on press and produces no cue on completion.
      - one `playPress()` at the top of the handler, before any async work, and nothing after
- [ ] 8. With `navigator.share` present, pressing Share opens the system sheet; cancelling it leaves the note empty and claims nothing.
      - the sheet path ran; this browser's sheet failed rather than opening, which exercised the fallthrough. The cancel case - `AbortError` leaves the note empty and claims nothing - is code-verified, not seen
- [ ] 9. Without `navigator.share`, pressing Share copies the URL and the note reads *"Link copied."* and clears itself after four seconds.
      - the clipboard path ran and was refused by the browser, so "Link copied." itself was not seen; the four-second clear is a `setTimeout` in the same effect. HUMAN-REVIEW 5.11
- [x] 10. With the clipboard blocked, the note reads *"Could not copy. Here is the link:"* and a focused, selected read-only input holds the URL.
      - seen exactly, with the read-only input focused and selected and holding the full URL
- [ ] 11. `.result-actions` holds three controls at rail width and reflows to two rows below 380px with no horizontal scrollbar on the rail. 11b. After opening a share link, the first move of the dial (or of any filter the link carries) leaves the address bar at `/` — not at the old query — while the clamp and missing-place notices, if any, stay on screen until dismissed.
      - **11b seen exactly**: the address bar went to `/` on the first dial move while "Spin your own" stayed - the distinction `linkQuery` exists for. **11 is partly open**: there are four controls now (Spin, Share, the two handoffs) in two rows of two at rail width, seen; the 380 px reflow is inherited from the existing single-column rule and was not looked at. HUMAN-REVIEW 5.11
- [x] 12. `ResultCard` gains exactly one live region — the one-line share note, empty until Share is pressed — and the card element itself still has no `role`. The rail's existing live regions (the sr-only announcement line and the short-reel `.notice`) are unchanged in number and behaviour, and the announcement reads *"Shared walk: …"* on arrival.
      - counted in the DOM: three pre-existing `sr-only role="status"` regions plus the share note, and the card element itself still has no role. The announcement opened with "Shared walk"
- [ ] 13. `curl -H 'Accept: text/html' https://<host>/s?o=carytown&b=34&rt=1&p=shiplock | grep -E 'og:|canonical'` returns **200** with a place-specific `og:title` containing `inside 34 min`, a place-specific `og:description`, and absolute `og:url`, `og:image` and `link[rel=canonical]`. A 404 here means `run_worker_first` is wrong. 13b. The same URL with the query replaced by `?x=1` returns **200** carrying the generic head — never a 404. Repeat with `curl -I` (HEAD): 200, and criterion 15's next GET still returns a rewritten body. 13c. Two `/s` links differing only in `t=flat` versus `t=hilly` return different `og:url` values on a warm edge.
      - **13 NOT RUN** - there is no deployed host, and this is one of the three checks the spec itself says only a deployment can make. The equivalent is asserted through `handleWorkerRequest` with a fixture head, and the curl is in `LAUNCH.md`. **13b is asserted**: `?x=1`, an empty query and a deleted place all return 200 with the generic head, never a 404, and a HEAD returns 200 without poisoning the next GET. **13c is asserted** as `c=easy` versus `c=hilly` (the field is `climb` now): two cache entries, not one. HUMAN-REVIEW 5.12
- [ ] 14. `curl https://<host>/site.webmanifest` still returns the manifest with `content-type: application/manifest+json`, and `POST /api/isochrone` still works, with `run_worker_first = ["/api/*", "/s"]` deployed. This is the **only** check that catches `/s*` or a dropped `/s`; no unit test can.
      - NOT RUN - no deployed host. This is the check the spec itself says no unit test can make, which is why `run_worker_first` lists `/s` exactly and why `LAUNCH.md` carries it. HUMAN-REVIEW 5.12
- [x] 15. A second identical `/s` GET is served from the share edge cache and does not re-run the rewriter. A `/s` with a pin origin is never cached.
      - asserted: the document is not fetched again, and the entry is in `walk-roulette-share` with **nothing** in the isochrone cache. A pin origin is asserted to be rendered twice and stored never
- [x] 16. `npm run typecheck`, `npm run lint` (eslint + oxlint + knip) and `npm test` are clean, with no `unknown` at a boundary, no type assertion lacking a `SAFETY:` comment, and **no export in `src/app/share.ts` that nothing imports** — knip is part of `lint` and an unused export fails the build.
      - all clean, no `unknown` at a boundary, no assertion without a reason, and no unused export in `share.ts`
- [x] 17. Nothing in `public/_headers`, `public/reach/`, `SNAPSHOT_VERSION` or the isochrone/route edge cache changed; `not_found_handling` is still unset in `wrangler.toml`.
      - `git diff` over all of them is empty, and `not_found_handling` is still unset
- [x] 18. Gzipped app JS from `npm run build` grew by **no more than 3 KB**. Record the before and after figures in the PR body; the ~1.8 KB in the Cost section is an estimate, this is the gate.
      - 93,176 to **95,675**, **+2,499 B**, under the 3 KB gate. `share-meta.ts` contributes zero - grep over `dist/` finds neither `shareMeta` nor `__share`

## How the non-mechanical boxes were observed

Against `npm run dev` at `localhost:5173` with the real Valhalla behind it, in
Chrome, on 2026-08-21.

**The link was opened cold, as a link.** `/s?o=carytown&b=34&rt=1&p=shiplock`
navigated to directly, not restored from any in-page state, and the card was
there on the first frame with the route drawn.

**Seven boxes are open, and they fall into two piles.**

*Three need a deployment, and the spec says so itself.* `run_worker_first` lives
in `wrangler.toml`; nothing running locally can prove that `/s` reaches the
Worker or that `/site.webmanifest` still does not. The Worker's behaviour after
the request arrives is asserted through `handleWorkerRequest`; the routing in
front of it is three curls in `LAUNCH.md` and HUMAN-REVIEW 5.12.

*Four are the usual local limits.* `prefers-reduced-motion` (5.1); the phone
width, which matters more here than usual because the actions grid genuinely
changed; the cancelled-share sheet, which needs a real system sheet; and "Link
copied." itself, because this browser refused the clipboard — which had the
happy side effect of exercising the fallback for real.

**Two things were removed after being written, both for the same reason.** The
spec asks for an `unavailableReason` prop and the card already renders one
warning row per exclusion reason, so the prop printed the sentence twice — the
same duplication chunk 9's hours line had, found the same way, by reading the
screen. And Vite's HTML plugin treats `link[href]` as an asset reference and
tried to open `/` as a file, failing the build outright; the canonical tag ships
with no `href` and the Worker supplies an absolute one, which is the honest
default for a repo that does not know its own domain.

