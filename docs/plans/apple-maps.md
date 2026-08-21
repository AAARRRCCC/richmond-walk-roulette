# Apple Maps handoff

**Status:** spec — not implemented
**Slug:** apple-maps

## Depends on

The foundations chunk only, for `ResultCard`'s shared `.result-lines` block
(`docs/plans/README.md` §2.5) — the recompute caveat ships as a `ResultLine` with
`key: "handoff"` rather than as its own `.result-note` class, which this spec's own sibling
contract predicted. Nothing else, and nothing depends on this. It is **chunk 4** and the smallest
piece of work in v0.5.

The `.result-actions` grid is shared with `shareable-spins`; §3 fixes the final shape (Spin again
full width, then Google \| Apple, then Share full width).

## What and why

The result card currently ends in one way out: a Google Maps link. That is a
reasonable default and a bad monopoly. A large share of the people this app is
for are standing on Cary Street holding an iPhone, and for them the Google link
either opens a browser tab they did not want or bounces through an app they
deleted. Apple Maps is the default map on every iPhone, iPad and Mac, and there
is an Apple Maps web app at `maps.apple.com` for everyone else.

So: two directions links side by side under "Spin again", labelled by name —
**Google Maps** and **Apple Maps** — both always present, on every platform.
Nobody's link disappears; nobody's link is chosen for them by a user-agent
regex.

While we are in this card, the honest thing to admit: neither link hands the
other app *our* walk. Both handoffs carry two coordinates, and Google and Apple
each recompute the route with their own graph and their own pedestrian speed.
Their minute count will disagree with ours — that disagreement is the entire
reason this app exists, since Valhalla pinned to 3.69 km/h is the whole product
claim. The card should say so in one quiet line rather than let the user
discover it as a contradiction on the sidewalk. What this feature does **not**
do: it does not send our polyline, it does not preselect a route shape, and it
cannot guarantee the other app opens in walking mode on every platform.

## The decision

**Show both links. Do not sniff the platform.** Google documents the fallback
explicitly: "If the Google Maps app is not installed, the URL launches Google
Maps in a browser and performs the requested action" — stated separately for
Android, for iOS, and for all other platforms
([developers.google.com/maps/documentation/urls/get-started](https://developers.google.com/maps/documentation/urls/get-started)).
Apple's side is the same shape: `maps.apple.com` is a universal link that the
Maps app claims on Apple platforms and that serves the Maps web app elsewhere.
Sniffing therefore buys nothing and can only be wrong: it breaks the Mac user
who lives in Chrome and Google Maps, the Android user who wants Apple's web
map, and every UA string the regex did not anticipate. Two links is also the
smaller code. Rejected: `navigator.userAgent` / `userAgentData.platform`
branching; rejected: a single "Directions" link with a provider preference
stored in tuning — a setting is a worse answer than two buttons when there are
exactly two options.

**Use the unified Apple URL form:**
`https://maps.apple.com/directions?source={lat},{lng}&destination={lat},{lng}&mode=walking`.

This reverses an earlier draft of this spec, which shipped the legacy Map Links
form (`?saddr=…&daddr=…&dirflg=w`) on the reasoning that it had never been
withdrawn. That reasoning does not survive Apple's own evidence. In developer
forum thread 784030 ("Apple Maps URL scheme daddr=lat,long no longer working –
regression?") a DTS Engineer answers:

> "See Adopting unified Maps URLs for the latest URL schema. You don't mention
> the iOS version, but the schema above was introduced in iOS 18.4."

— [developer.apple.com/forums/thread/784030](https://developer.apple.com/forums/thread/784030),
answering a report that `https://maps.apple.com/?daddr=37.7749,-122.4194` "no
longer behaves as expected" on recent iOS. Apple did not say the legacy form
still works; Apple pointed at a replacement. The unified documentation confirms
the shape and the availability: base `https://maps.apple.com/directions`,
parameters `source` and `destination` (each accepting a bare
`latitude,longitude` pair such as `40.753035,-73.981846`), and `mode` with
values including `walking` — introduced "in iOS 18.4 and later, macOS 15.4 and
later, and watchOS 11.4 and later"
([developer.apple.com/documentation/mapkit/unified-map-urls](https://developer.apple.com/documentation/mapkit/unified-map-urls),
read via the docs JSON endpoint since the HTML page is JS-rendered).

iOS 18.4 shipped in March 2025. The pre-18.4 tail is now small, and — this is
the part the earlier draft got backwards — the audience this feature is written
for is precisely the phone that has *already updated*. Shipping legacy would
mean shipping the form Apple says changed, to the majority, in order to serve a
shrinking minority. So: ship unified, and leave the legacy form in a comment in
`handoff.ts` with the thread citation, as the thing to reach for if the manual
check below fails on an old device.

**Stated assumptions, to check before merge.** None of the following could be
verified from a text-mode fetch, and none of them is verified by an HTTP 200 —
`maps.apple.com` is a JS-rendered SPA that answers 200 with the same shell for
essentially any path, so a status code proves the host answers and nothing more.
Do not treat reachability as evidence a parameter was honoured.

- Whether the Apple Maps **web** app honours `mode=walking` client-side.
- Whether a unified URL degrades gracefully on a pre-18.4 device (best guess:
  the Maps app fails to parse the path and shows a plain map; the fallback is
  the legacy form in the comment).
- Apple's supported-browser matrix. Reported second-hand as Safari and Chrome on
  Mac and iPad, Chrome and Edge on Windows, with Firefox and Android added later
  ([Macworld](https://www.macworld.com/article/2684697/apple-maps-on-the-web-expands-access-to-more-devices-and-browsers.html));
  Apple's own page, `support.apple.com/en-us/120585`, is JS-rendered and would
  not yield its content. Note also that Apple Maps on the web is **still labelled
  beta** on the site — the earlier draft's claim that it "left beta" was wrong
  and is removed. Nothing here depends on it: a beta web map that renders
  directions is still a working link, and the Google link sits next to it.

**Required manual check:** open the Apple link from (a) an iPhone with Apple
Maps installed, (b) Chrome on Windows, (c) Chrome on Android, and confirm the
destination is right and the mode is walking. If the web app ignores the mode,
ship anyway — the route still renders and the Google link is untouched — but
record it under `LAUNCH.md`'s **Ship** heading so it gets re-checked.

**Carry the walk as origin + destination, and admit the recompute.** The
alternative — link only the destination and let the other app use "here" — is
tempting because it avoids implying we handed over a route. It is worse: the
user's chosen origin is frequently *not* where their phone is (a dropped pin, a
preset), and losing it means the other app measures a different walk entirely.
So both links carry the origin. The card then carries one static line under the
actions: **"Other apps will recalculate — their walk times will differ."** It is
`.result-note`, in `--ink-3`, not a `.result-warning` — nothing is wrong, it is
a fact about the world. It is static text in the DOM, not fed into the
`sr-only role="status"` line: `describeResult` composes one *result-specific*
sentence per spin, and a constant caveat repeated on every landing would be
noise. A screen reader reaches this line by reading the card.

**Privacy: round the origin, not the destination.** This is the one place the
app hands a coordinate to a third party. It is a user-initiated top-level
navigation with `rel="noreferrer"`, not a fetch, so it does not breach the house
rule that the browser never talks to a third-party engine — but the spec should
say that out loud rather than let it pass unremarked. With `geolocate` shipping,
the origin can be a raw GPS fix, and `String(37.546812345678)` exports
centimetre-grade positioning for no benefit. So the **origin** is rounded to
`COORD_PRECISION` (5 decimals, ~1.1 m) before interpolation. The principled
reason, not just a nice-to-have: `pointKey` in `src/lib/geometry.ts` already
collapses origins to exactly this precision for cache keys and snapshot
filenames, so the app itself cannot distinguish two origins that differ below
it. Handing out more precision than we ourselves use is a leak with no
function. The **destination** is not rounded: it is a public landmark whose
coordinates are already published in `src/data/places.ts` and in this repo's
git history, so rounding buys no privacy and would gratuitously move a pin.

**Sound.** Both anchors call `playPress()` in `onClick`, matching the house rule
that every control answers. Today's Google anchor has no cue at all; this fixes
that. Reject brand logos for the icons — trademark risk and kilobytes for shapes
we do not have. Both links reuse `ArrowSquareOutIcon`, per App.tsx's own note
about rotating a caret rather than importing a second glyph.

## Data and types

New module `src/lib/handoff.ts`. No network, no JSON, no endpoint — this feature
adds nothing to `server/proxy.ts`, `worker/index.ts`, `wrangler.toml`,
`.env.example`, the dev plugin or the build scripts, and needs no CSP or
preconnect change (these are click-throughs, not fetches).

```ts
import { COORD_PRECISION, type LngLat } from "./geometry.ts";

/** Google Maps walking directions. Parameter order is the one the result card
 *  has always built; do not "tidy" it. */
export function googleDirectionsUrl(from: LngLat, to: LngLat): string;

/** Apple Maps walking directions, unified Maps URL form (iOS 18.4+). */
export function appleDirectionsUrl(from: LngLat, to: LngLat): string;
```

`COORD_PRECISION` is imported as a value, not just a type — `geometry.ts` is
already in the bundle, and a second copy of the number is how the handoff and
the cache keys would quietly drift apart.

Exact output shapes, with `from = {lat: 37.546961, lng: -77.450237}` (the
Monroe Park preset, six decimals) and `to = {lat: 37.529197, lng: -77.452844}`
(Belle Isle):

```
https://www.google.com/maps/dir/?api=1&travelmode=walking&origin=37.54696,-77.45024&destination=37.529197,-77.452844
https://maps.apple.com/directions?source=37.54696,-77.45024&destination=37.529197,-77.452844&mode=walking
```

Rounding trims trailing zeros — `Number(n.toFixed(COORD_PRECISION))` then plain
interpolation, so `37.5` stays `37.5` and never becomes `37.50000`. The
destination is interpolated raw. Both builders use the same rendering so the two
providers get the same pair.

`ResultCardProps` is unchanged. No `Session` field, no `Action` member, no
reducer change, no new cache, no bump counter.

## Changes, file by file

**`src/lib/handoff.ts` — new.** The two functions above, the origin-rounding
helper, and the prose explaining unified-vs-legacy with the forum citation and
the legacy URL in a comment. Only `geometry.ts` is imported, so `node --test`
type-stripping runs it.

**`src/lib/handoff.test.ts` — new.** See Tests.

**`src/ui/ResultCard.tsx` — modified.**
- Delete the inline `mapsUrl` template; import `googleDirectionsUrl`,
  `appleDirectionsUrl` from `../lib/handoff.ts` and `playPress` from
  `../lib/sound.ts`.
- Call each builder as `googleDirectionsUrl(props.origin, place)`. `Place` is
  declared `LngLat & { id; name; terrain; tags }`, so `place` *is* an `LngLat`
  and satisfies the parameter directly. Do not construct a throwaway
  `{ lat: place.lat, lng: place.lng }`.
- Replace the single `<a>` in `.result-actions` with two anchors, both
  `className="button"`, `target="_blank"`, `rel="noreferrer"`,
  `onClick={() => { playPress(); }}`, each containing
  `<ArrowSquareOutIcon size={16} weight="bold" aria-hidden="true" />` then the
  text node `Google Maps` / `Apple Maps`, and each carrying
  ``aria-label={`Walking directions to ${place.name} in Google Maps`}`` (resp.
  Apple Maps) so the link text is not two identically-vague "Maps" links in the
  a11y tree.
- Order: Google first, Apple second — Google is the incumbent and moving it
  would retrain a habit for no gain.
- Add, immediately after `</div>` closing `.result-actions`:
  `<p className="result-note">Other apps will recalculate — their walk times will differ.</p>`

**`src/styles/app.css` — modified.** Edit the existing `.result-actions`
declaration (line ~845): change `grid-template-columns: 1fr auto` to
`1fr 1fr`, leaving `display`, `gap` and `margin-top` as they are. Do not add a
second `.result-actions` rule — this stylesheet never overrides a selector with
a duplicate of itself. Then add, next to it:

```css
.result-actions > .is-primary {
  grid-column: 1 / -1;              /* Spin again keeps its own full-width row */
}
.result-note {
  margin: 0;
  font-size: 12px;
  color: var(--ink-3);
  line-height: 1.45;
}
```

`margin: 0` is not optional. There is no global `p` reset in this stylesheet —
`.result-name`, `.result-warning` and every other text block zeroes its own
margin — so a bare `<p>` would inherit the UA's 1em top and bottom and land far
below the actions, on top of `.result`'s own 10px flex gap.

`.result-note` is **single-purpose**: the recompute caveat, one sentence, tied
to the handoff. It is not a general "small grey line in the result card" class.
A sibling that wants its own line in this card should name its own class rather
than borrow this one, so that removing the handoff removes its note.

At the mobile breakpoint the two link buttons **stack unconditionally**. Add to
the existing `@media (max-width: 899px)` rail block (line ~1053 — 899, not 900;
that one-pixel difference is the house breakpoint and there is no 900px block in
this file):

```css
  .result-actions {
    grid-template-columns: 1fr;
  }
```

This is not a contingency. `.button` sets `white-space: nowrap` (line ~632), so
"Google Maps" cannot wrap to relieve pressure; at 320px each grid cell gets
roughly `320 − 24` (rail padding) `− 32` (`.result` padding) `− 8` (gap) `/ 2` ≈
128px, against a min-content width of about 16px icon + 8px gap + 32px padding +
~85px of 14px Geist ≈ 140px. Grid items do not shrink below min-content, so a
`1fr 1fr` row would push the card into horizontal overflow. Stacked is the
correct layout, not the fallback one. `.is-primary`'s `grid-column: 1 / -1` is
harmless in a single-column grid and needs no override.

No new tokens. `--ink-3` is the documented dim grey with its contrast
justification; do not invent a dimmer one.

**`LAUNCH.md` — modified.** Add a checkbox under the **Ship** heading (the one
that already holds "A real phone, not a resized desktop window"): "Result card →
Apple Maps opens Apple Maps (iPhone) / Apple's web map (Windows, Android) at the
right destination, in walking mode. Note the result either way." Apple changed
this URL schema once already; this line is what catches it if they do it again.

Untouched, explicitly: `session.ts`, `App.tsx`, `server/*`, `worker/*`,
`scripts/*`, `wrangler.toml`, `.env.example`, `public/_headers`, `index.html`.

## Algorithm

There is no algorithm worth the name; the extraction exists so the URLs are
asserted rather than eyeballed.

```
round(n)  =  Number(n.toFixed(COORD_PRECISION))     // trailing zeros dropped by String()

googleDirectionsUrl(from, to):
  "https://www.google.com/maps/dir/?api=1&travelmode=walking"
    + "&origin=" + round(from.lat) + "," + round(from.lng)
    + "&destination=" + to.lat + "," + to.lng

appleDirectionsUrl(from, to):
  "https://maps.apple.com/directions?source=" + round(from.lat) + "," + round(from.lng)
    + "&destination=" + to.lat + "," + to.lng
    + "&mode=walking"
```

No `encodeURIComponent`: every interpolated value is a `number` rendered by
`String`, which can only produce digits, `-`, `.` and (for absurd magnitudes we
cannot reach inside the Richmond bounding box) `e` — none of which needs
escaping in a query value, and all of which both providers accept in a bare
comma-separated pair. Note the argument is about the *type*, not about where the
numbers came from: it stays true if a future spec starts parsing destinations
out of an endpoint response, so long as they arrive as `number`s. Say this in a
comment, because the next reader will reach for the encoder.

Both functions are pure and total: given any two `LngLat` they return a string.
The link is built at render time; there is nothing to cache and nothing that can
fail.

## Failure and degradation

- **Neither app installed (desktop Windows, Linux, a stripped Android).** Both
  URLs open a web map in a new tab. Google documents this fallback (cited
  above); Apple's is the universal-link behaviour and is one of the assumptions
  the manual check covers. Nothing to detect and no message to show.
- **Apple's web map shows an unsupported-browser page.** Possible on
  combinations we could not verify — and it is still a beta product. The Google
  link is right beside it, which is exactly why both ship. No detection is
  possible from our side (no fetch, no CORS, no error event on a click-through)
  and none is attempted.
- **Apple ignores `mode=walking`.** The user gets the right destination in the
  wrong mode and switches with one tap. Acceptable; flagged in LAUNCH.md.
- **A pre-18.4 device does not understand the unified path.** Worst case is a
  plain map instead of a route. Mitigation is the manual check plus the legacy
  form sitting in a comment, ready to swap back.
- **Route failed / no walking route (`routeFailed`, `route === null`).** The
  links still work — they only need two coordinates, and the destination is
  reachable *by our polygon* even if the route service could not draw a line.
  This is arguably the moment the handoff is most useful. Do not gate the links
  on `route`.
- **Popup blocked / `target="_blank"` suppressed.** Browser-level; the anchor is
  a real `href`, so long-press, middle-click and "open in this tab" all work.
- **Sound muted or reduced-motion seeded sound off.** `playPress()` is silent;
  the anchor's own hover/active/focus styling is the feedback. The cue is never
  the only signal.
- **Offline.** The click opens a tab that fails to load, in the other app's own
  error UI. The card itself is unaffected and the walk is still on our map —
  which is the point of having drawn it.

## Cost

Bundle: two string builders, one `toFixed` helper, a second anchor, a label and
a sentence. Unmeasured, but bounded above by a few hundred bytes gzipped — well
inside the noise of the 64 KB budget. Since this repo treats that number as a
promise: record the delta from `npm run build` in the PR rather than trusting
this estimate. `playPress` and `COORD_PRECISION` are already in the bundle. Zero
new dependencies — no brand icons, no UA parser.

Requests: zero added per session. No `/api` traffic, no engine load, no upstream
call, no rate-limit units, no edge-cache entries. Build time: unchanged; no
snapshot regeneration (contours are untouched, `SNAPSHOT_VERSION` stays 2). No
new hosting requirement, no env var, no Worker change.

## Tests

`src/lib/handoff.test.ts`, `node --test`, imports with an explicit `.ts`
extension — the convention every `src/lib/*.ts` module here follows.

```ts
const MONROE = { lat: 37.546961, lng: -77.450237 };  // preset origin, six decimals
const BELLE  = { lat: 37.529197, lng: -77.452844 };  // a real place, six decimals
```

1. **`googleDirectionsUrl` emits the exact expected string.** Assert
   `googleDirectionsUrl(MONROE, BELLE)` equals the literal in Data and types.
   This is the regression guard the whole extraction exists for.
2. **The Google URL is unchanged apart from origin rounding.** With an origin
   already at five decimals — `{ lat: 37.5388, lng: -77.4336 }`, the Home
   preset — assert the emitted URL is character-for-character what the old
   inline template produced: `…&origin=37.5388,-77.4336&destination=…`. Pins
   that rounding is a trim, not a reformat.
3. **`appleDirectionsUrl` uses the unified form with walking mode.** Assert the
   exact string, and separately assert `new URL(u).pathname === "/directions"`
   and `searchParams.get("mode") === "walking"`, so a refactor cannot drop the
   mode or fall back to the legacy path while keeping the string plausible.
4. **Both are absolute https URLs on the expected hosts.**
   `new URL(u).protocol === "https:"`, host `www.google.com` / `maps.apple.com`.
   Catches a relative or protocol-relative slip.
5. **Origin and destination are distinct and in the right order.** With
   `MONROE -> BELLE`, assert Google's `origin` and Apple's `source` both equal
   `"37.54696,-77.45024"`, and both `destination` params equal
   `"37.529197,-77.452844"`. Catches the classic swap, and pins that the
   destination is *not* rounded.
6. **Nothing is percent-encoded.** Assert the full query string of each URL
   equals the expected literal, comma and minus sign included. (Asserting merely
   that `%2D` is absent has no teeth — `encodeURIComponent("-")` returns `-`
   unchanged — so the whole-string comparison is the test.)
7. **The origin is rounded and the destination is not.** With
   `from = { lat: 37.546812345678, lng: -77.451987654 }` and an unrounded
   destination, assert the origin renders as `37.54681,-77.45199` and the
   destination survives at full precision. Pins the privacy decision.
8. **Rounding drops trailing zeros.** `from = { lat: 37.5, lng: -77.4 }` renders
   as `37.5,-77.4`, never `37.50000,-77.40000`.

No test is added for `ResultCard.tsx` — there is no DOM test harness in this
repo and none is being introduced for two anchors.

## Acceptance criteria

1. `src/lib/handoff.ts` exists, exports exactly `googleDirectionsUrl` and
   `appleDirectionsUrl` (both consumed by `ResultCard.tsx`, so knip needs no
   `@public` tag and no other export may be added "for later"), imports only
   `COORD_PRECISION` and `LngLat` from `./geometry.ts`, and carries the prose
   explaining unified-vs-legacy plus the commented legacy URL.
2. The Google URL is unchanged for any origin at five decimals or fewer
   (test 2), and differs only in the origin's rounded digits otherwise (test 1).
   Only the URL is frozen — the visible label deliberately changes from
   "Directions" to "Google Maps", and the anchor gains an `aria-label`, an
   `onClick` and a sibling.
3. The Apple URL uses `maps.apple.com/directions` with `source`, `destination`
   and `mode=walking`. No `saddr`, `daddr` or `dirflg` appears outside a comment.
4. The result card shows exactly three actions: "Spin again" spanning a full
   row, then "Google Maps" and "Apple Maps" sharing the row beneath on the
   ≥900px rail, and stacked one per row at ≤899px. At a 320px viewport the card
   does not scroll horizontally and neither button is clipped.
5. Both links are `target="_blank" rel="noreferrer"`, carry an
   `ArrowSquareOutIcon` with `aria-hidden`, and have distinct `aria-label`s
   naming the destination and the provider.
6. Both links fire `playPress()` on activation, by mouse and by keyboard.
7. The line "Other apps will recalculate — their walk times will differ." is
   visible under the actions in `--ink-3` with `margin: 0`, sits within
   `.result`'s 10px gap of the actions rather than ~26px below them, and is
   **not** wrapped in an `aria-live` region and not added to `describeResult`.
8. Both links render and work when `routeFailed` is true or `route` is null.
9. LAUNCH.md carries the Apple-link checkbox under **Ship**, and the manual pass
   is recorded there: the Apple link opens the right destination from an iPhone,
   from Chrome on Windows, and from Chrome on Android, with the walking-mode
   result noted either way.
10. `npm run typecheck`, `npm run lint` (eslint + oxlint + knip) and `npm test`
    are clean. The PR notes the measured gzipped bundle delta.
11. No change appears in `server/`, `worker/`, `scripts/`, `wrangler.toml`,
    `.env.example` or `public/reach/`.

## Open questions

None that block a decision. The unresolved items — whether the Apple web map
honours `mode=walking`, and how a pre-18.4 device handles the unified path — are
checks to run, not choices to make; both are specified above as pre-merge manual
tests and neither changes what ships.

## Sibling contracts

- **`geolocate`**: the handoff must keep working when the origin is a
  geolocation fix rather than a preset. It already does — `ResultCard` takes
  `origin: LngLat` and both builders are total over any pair. Two asks: keep
  dispatching a real `Origin` with finite `lat`/`lng`, and do not introduce a
  "no origin yet" state that reaches this card. The privacy rounding here means
  a raw GPS fix never leaves the page at full precision.
- **`shareable-spins`**: if that spec needs a directions URL in a share payload
  or an OG target, it must import `googleDirectionsUrl` / `appleDirectionsUrl`
  from `src/lib/handoff.ts` rather than re-templating the strings. Two copies of
  a URL builder is how the Google link quietly stops matching itself.
- **`places-expansion`**: destinations may arrive from an endpoint instead of
  the `Place` literals, but they must arrive as parsed `number`s. The
  no-`encodeURIComponent` argument in handoff.ts rests on the type, not the
  provenance; a `string` coordinate reaching a builder breaks it.
- **`elevation-profile`, `daylight-budget`, `opening-hours`**: `.result-note` is
  single-purpose and belongs to the recompute caveat. Do not reuse it for a
  second line in this card — name your own class, so the two can be removed
  independently. If three of you end up wanting a line, the right move is one
  spec that introduces a shared list, not three specs sharing one class by
  accident.
