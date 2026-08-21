# Use my location

**Status:** spec — not implemented
**Slug:** `geolocate`

## Depends on

Nothing. `src/lib/bounds.ts` and the `server/proxy.ts` import land in the **foundations chunk
(0)** so `places-expansion`'s `/api/locate` reads the shared constant from its first line; the
rest of this spec is **chunk 6** and can be slotted wherever there is a gap.

`places-expansion` depends on it only in that direction — the shared bounds constant — and
`apple-maps` names it in a sibling contract that is already satisfied (the handoff is total over
any `LngLat`, and rounds the origin to `COORD_PRECISION` so a raw GPS fix never leaves the page at
full precision).

## What and why

Today there are two ways to say where you are standing: pick one of eleven presets, or drag a
pin. On a laptop the pin is fine. On a phone, standing on a corner in Church Hill wondering
whether the market is a twenty-minute walk, dragging a pin to your own feet on a dark basemap is
the worst possible way to answer a question the device already knows the answer to. There is
already a "Use my location" button in the origin popup. It works, and everything around it is
thin: one generic sentence for four very different failures, an eight-second timeout that a cold
GPS will lose, `maximumAge` left at its default of 0 so every press forces a fresh acquisition,
no look at `coords.accuracy` at all, and no check that the fix is anywhere near Richmond — so a
visitor from Charlottesville gets an origin set successfully, then a 400 from the proxy, then the
generic failure panel, which says nothing about geography.

This spec keeps the shape of the control and replaces everything behind it. A one-shot fix with
options that suit a phone. Four separate, plainly-worded errors keyed on `error.code`, with
`PERMISSION_DENIED` split on `window.isSecureContext` because the spec makes an insecure origin
report as a denial and that is exactly what a LAN dev server looks like. An accuracy gate, because
a 1.2 km wifi fix drawn as a five-minute contour is a confident lie and this app's entire claim is
that the contour is true. A bounds pre-check against the same box the proxy enforces, so a fix
outside Richmond is refused by the app with a sentence that explains the app's scope and an offer
of the nearest preset, rather than by the engine with a 400. And an honest note that your own spot
has no baked snapshot, so it pays the full engine warm-up that a preset does not.

What it does not do: it does not track you. There is no `watchPosition`, no follow-me mode, no
re-centring as you walk — the button answers once and then you are a pin like any other. It does
not store the fix anywhere: no localStorage, no query string, nothing leaves the tab except the
lat/lng in the normal `/api/isochrone` body that a dropped pin would send anyway. It does not do
reverse geocoding, so the origin is called "My location" and not the name of your street. It does
not make a fix outside Richmond work; the honest answer there is "this only knows Richmond".

## The decision

**One-shot `getCurrentPosition`, not `watchPosition`.** The control's whole contract is "answer
once". `watchPosition` exists to report significant position change; using it to race to a first
coarse fix buys a marginally faster answer on some devices at the cost of a watch id lifecycle, an
abort-on-unmount path and a second failure mode. Rejected.

**Options: `{ enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }`.** 8 s is short for a
cold GPS acquisition on a phone that has just come out of a pocket; 15 s is the point past which a
person assumes the button is broken anyway, which is where the timeout message belongs. `maximumAge`
defaulting to 0 forces a fresh acquisition on every press — for a tool whose smallest unit is a
five-minute walk, a fix up to a minute old is indistinguishable from a fresh one and costs nothing.
**But only on the first press.** A cached fix carries its original `accuracy`, so with a flat
`maximumAge` a user who presses again after a 250 m refusal gets the same coarse fix replayed
instantly and the identical refusal, with no new attempt made — a button that visibly does nothing.
Any press made while a notice is standing therefore uses `maximumAge: 0`. See *Algorithm* step 4.

**Errors are branched on `error.code`, and code 1 is split on `window.isSecureContext`.** The
Geolocation spec terminates with `PERMISSION_DENIED` when the environment settings object is a
non-secure context, so on `http://192.168.x.x:5173` the app is told "denied" without a prompt ever
appearing. Telling a developer their permission is blocked when the real problem is the scheme
sends them into browser settings for an hour. Four distinct sentences, listed under *Failure and
degradation*.

**The Permissions API decorates the label; it never gates the call.** Safari implements
`navigator.permissions.query({ name: "geolocation" })` from 16.0 and resolves it to `"prompt"`
unconditionally regardless of the real state (open BCD issue #25032) — it returns wrong data rather
than throwing. So `"denied"` is trustworthy where it appears (Chrome, Firefox) and its absence
means nothing. We use `"denied"` to relabel the action "Use my location — blocked" and answer the
press with the explanation instead of a call that cannot prompt; every other state, including the
query throwing or the API being absent, renders the normal label and makes the normal call. Gating
the button on the query would disable it on roughly every iPhone, which is the single most likely
device to press it. Rejected.

**Accuracy threshold: decline above 250 m, caveat between 100 m and 250 m.** `coords.accuracy` is
metres at 95% confidence and is always present. The number is chosen against the app's own
resolution, not by feel: at the pinned 3.69 km/h, five minutes of walking is 308 m as the crow
flies and less along streets, so the innermost band the dial can draw is roughly a 300 m radius. A
fix whose 95% circle is 250 m across puts most of that innermost band inside the error bar — the
picture would be a drawing of the uncertainty, not of the walk. Above 250 m the app declines the
fix, keeps the current origin, and says what the accuracy was and why that is not good enough,
pointing at the pin. Between 100 m and 250 m the fix is accepted with a caveat line, because a
120 m error is a block and a half — real, worth saying, not disqualifying. Below 100 m, silence.
This will fire on many desktop visitors, whose wifi/IP fixes are routinely hundreds of metres to
kilometres; that is the correct outcome, not noise, because those fixes genuinely cannot anchor a
walking isochrone.

**Bounds are checked in the client before the origin is dispatched, against a single shared
constant.** `server/proxy.ts` pins `BOUNDS = { south: 37.3, west: -77.9, north: 37.8, east: -77.1 }`
and `readLatLng` returns null outside it, producing a 400 that `src/lib/http.ts` treats as final. If
the app dispatches first and asks later, the user sees the generic failure panel with no mention of
geography. So: a new `src/lib/bounds.ts` exporting the box and a predicate, **imported by
`server/proxy.ts`** so the number exists once. The direction matters — the server importing a
dependency-free shared constant is not the boundary this architecture protects; the client
importing server policy code is, and that is rejected. `src/lib/bounds.ts` imports nothing, touches
no DOM and no Node API, so it bundles cleanly into the Worker. The duplication precedent set by
`WALKING_SPEED_KMH` (declared independently in `server/proxy.ts` and `src/lib/speed.ts`) is not
followed: the recon already files that duplication as a live gotcha, and adding a second one to the
same file is going the wrong way.

**Out of bounds offers the nearest preset.** Rejected alternative: computing a distance ("you are
94 km from Richmond"). `src/lib/geometry.ts` exports no haversine, the 64 KB budget refuses a geo
library, and the sentence is no more useful than the boolean. What is useful is a way forward, so
the notice carries a `.link-button` that sets the nearest `PRESET_ORIGIN` — nearest by a small
equirectangular approximation, which needs no library and cannot pick wrong at these distances.

**Note the distinction the copy must respect:** `BOUNDS` is about 55 × 70 km while `PLACES` spans
about 6 × 7 km. A fix can be well inside the box, produce perfectly good contours, and contain zero
destinations — that is a *different* state and it already has a path (`emptyNotice` in App.tsx,
owned by sibling `pool-reasoning`). Do not send an out-of-bounds message to someone south of the
James.

**LAN development: a `dev:lan` script that serves real HTTPS, or nothing.** Verified: a private LAN
address over `http` is not a potentially-trustworthy origin under W3C Secure Contexts §3.1, so
geolocation reports code 1 before any prompt. A `vite --host` script over HTTP would look like it
works while silently disabling the exact feature it was added to test — rejected outright. The
repo's only host-exposing script today is `preview: vite preview --host`, which is plain HTTP; that
stays as it is and gets a warning line in the README. The new path adds `@vitejs/plugin-basic-ssl`
as a **devDependency** (zero client bytes), enabled by `mode === "lan"` — no env file, no
`DEV_HTTPS` variable, nothing for `.gitignore` to swallow.

Version check, done rather than assumed: `@vitejs/plugin-basic-ssl@2.3.0` declares
`peerDependencies: { "vite": "^6.0.0 || ^7.0.0 || ^8.0.0" }`
(<https://registry.npmjs.org/@vitejs/plugin-basic-ssl/latest>, read 2026-08-21), so it is compatible
with the pinned `vite ^7.3.6`. Pin `^2.3.0`. **Still an assumption:** that adding the plugin is
sufficient — that no `server.https` block and no `server.allowedHosts` entry is needed for a LAN IP.
Nothing in this tree corroborates it because the package is not installed (`node_modules/@vitejs`
contains only `plugin-react`). The implementer runs `npm run dev:lan` and loads
`https://<LAN-IP>:5173` from a second machine **before** writing the README section; if either is
needed, add it and say so there.

**Prior art in the tree, reconcile before spending the dependency.** The repo root already carries
`dev-lan.log` and `dev-lan.err.log` with matching `.gitignore` entries, so something LAN-shaped was
attempted here and left residue. Whoever implements this should find out what it was and whether it
was abandoned for a reason — that history, not this paragraph, decides open question 2.

**UNVERIFIED — the one check that must happen before this ships:** whether iOS Safari requires
transient user activation for `getCurrentPosition`. Research found only developer-forum anecdotes
and one W3C thread claiming a gesture "isn't actually required"; no primary WebKit documentation
either way. The design is safe as specified because the call is made synchronously inside a click
handler. **The implementer must not move the call into an effect, a `setTimeout`, a retry timer, or
an `await` that precedes it.** If a retry is ever added, it must be a second press of a button.

**UNVERIFIED — self-signed certificate acceptance on iOS Safari.** `@vitejs/plugin-basic-ssl`
issues a self-signed certificate; Safari shows an interstitial. Whether tapping through it yields a
context Safari treats as secure enough for geolocation was not verified, and no primary WebKit
source was found either way. This is the pivot the whole `dev:lan` argument rests on: if it is
false, the devDependency buys nothing on the one device class this feature is for and a tunnel
terminating real TLS was always the answer. **Check it on a real iPhone before adding the
dependency, not after.** The README text must state the outcome and name the tunnel fallback rather
than promising the flow works.

## Data and types

New module `src/lib/bounds.ts`:

```ts
/** The one box. `server/proxy.ts` imports this; nothing else defines it. */
export type Bounds = { south: number; west: number; north: number; east: number };

export const RICHMOND_BOUNDS: Bounds = { south: 37.3, west: -77.9, north: 37.8, east: -77.1 };

export function insideRichmond(at: { lat: number; lng: number }): boolean;
```

New module `src/lib/locate.ts` — every decision this feature makes, as pure functions with no DOM
and no imports beyond `../data/places` and `./bounds`:

```ts
import type { LngLat } from "./geometry";
import type { Origin } from "../data/places";

/** What the browser handed back, flattened out of GeolocationPosition. */
export type Fix = { lat: number; lng: number; accuracyMeters: number };

/**
 * Everything the app has to say about where you are: why the browser would not
 * share a location, why we would not use what it shared, or a caveat on a fix
 * we did accept. One field rather than two because one field is one thing to
 * clear, and the origin action already clears it.
 *
 * `tone` exists because those are not the same kind of sentence. A refusal is
 * a warning and belongs in an assertive region; "located to within about 140 m"
 * is information about a fix that worked, and shouting it in amber tells the
 * user something went wrong when nothing did.
 *
 * `suggest` is a preset to offer as a way forward, or null when there is no
 * sensible one (a denial is not fixed by moving to Carytown).
 */
export type LocationNotice = {
  message: string;
  tone: "warn" | "info";
  suggest: Origin | null;
};

export type LocateOutcome =
  | { kind: "accepted"; origin: Origin; caveat: LocationNotice | null }
  | { kind: "rejected"; error: LocationNotice };

/** Above this, the 95% error circle swallows the innermost band. */
export const MAX_ACCURACY_METERS = 250;
/** Above this the fix is usable but worth saying out loud. */
export const CAVEAT_ACCURACY_METERS = 100;

/** The whole accept/reject decision, given only a fix. */
export function judgeFix(fix: Fix): LocateOutcome;

/** Nearest preset by equirectangular approximation. Never returns undefined. */
export function nearestPreset(at: LngLat): Origin;

/** The four sentences, keyed on GeolocationPositionError.code. */
export function describeGeolocationError(code: number, secureContext: boolean): LocationNotice;

/** What the popup action should be called, given whatever we know. */
export type PermissionHint = "granted" | "denied" | "prompt" | "unknown";
export function locateActionLabel(hint: PermissionHint): string;
```

Added to the existing `src/lib/format.ts`, which is where every user-facing number in this app is
turned into a string and is therefore where this one belongs:

```ts
/**
 * A GPS accuracy radius, with its unit attached. The unit has to live in here:
 * a caller that formats the magnitude and appends " m" itself will one day
 * print "within about 3.1 m" for a 3.1 km fix, in the one sentence whose whole
 * job is to state a magnitude honestly.
 *
 * Metres, not feet, against this file's own imperial house rule — because this
 * is the device's number, reported in metres by the Geolocation API, and
 * converting it to feet would dress a ±3000 m guess up as "10171 ft".
 */
export function formatAccuracy(meters: number): string;
// 18 -> "18 m"   140 -> "140 m"   999 -> "999 m"   1000 -> "1.0 km"   3100 -> "3.1 km"
```

Changed reducer types in `src/app/session.ts` — the field widens from `string | null` to the
structured notice so it can carry a tone and an action, and is **renamed** `locationNotice`, because
it no longer only holds errors:

```ts
locationNotice: LocationNotice | null;   // was: locationError: string | null
// action member, renamed field for the same reason:
| { type: "locationNotice"; notice: LocationNotice | null }   // was: locationError / message
```

Its doc comment in `src/app/session.ts` currently reads *"Why the browser would not share a
location. Lives here rather than beside the geolocation call so it is cleared by the same origin
change that clears `failure`…"*. The first sentence becomes false the moment the field also carries
a success caveat and a suggested `Origin`. **Rewriting it is a required edit, not an optional
tidy:** the new comment keeps the second sentence's reasoning (it lives in the reducer so the origin
action clears it) and replaces the first with what the field now holds — anything the app has to say
about where you are, error or caveat, plus an optional preset to offer as a way out.

Nothing crosses a network or file boundary. No endpoint is added, no request or response shape
changes, no snapshot field changes, `SNAPSHOT_VERSION` is untouched. The only new wire traffic is
that a `me` origin sends the same `/api/isochrone` and `/api/route` bodies a dropped pin already
sends.

## Changes, file by file

**`src/lib/bounds.ts` — new.** Exports `Bounds`, `RICHMOND_BOUNDS`, `insideRichmond`, with the prose
comment explaining that a bound is what stops a leaked endpoint from being a free worldwide routing
service, moved here from `server/proxy.ts` and cross-referenced from both sides.

**`src/lib/locate.ts` — new.** The exports above. No React, no `navigator`, no `window`; it is
handed a `Fix` and a boolean and returns data, which is what makes the accuracy threshold, the
bounds refusal, the nearest-preset offer and every string assertable under `node --test`.

**`src/lib/locate.test.ts` — new.** See *Tests*.
**`src/lib/bounds.test.ts` — new.** See *Tests*.

**`server/proxy.ts` — modified.** Delete the local `const BOUNDS = {...}` and
`import { RICHMOND_BOUNDS } from "../src/lib/bounds.ts"` (extension per house convention), using it
in `readLatLng`. Leave a comment at the import saying why this one shared import is allowed and
`WALKING_SPEED_KMH` is still duplicated: bounds are geography both sides must agree on for the app
to be able to refuse a fix before the engine does; costing is policy the client must never see.

**`src/app/session.ts` — modified.** `Session.locationError: string | null` becomes
`Session.locationNotice: LocationNotice | null` (line 54), its doc comment is rewritten as described
under *Data and types*, the action member becomes
`{ type: "locationNotice"; notice: LocationNotice | null }` (line 82), the initial state key is
renamed (line 116), and the reducer case becomes
`return { ...state, locationNotice: action.notice }` (line 142). The `origin` case already clears
the field (line 136) and must keep doing so — that is what stops "you are outside Richmond" from
surviving the user taking the offered preset. Import the type from `../lib/locate`. No new state
field: `locating` stays the local `useState` in App.tsx it already is, because a pending
geolocation call has no effect on any derived value and does not need to survive anything.

**`src/app/App.tsx` — modified.**

- Rewrite `useMyLocation` (currently lines ~401–429) per *Algorithm*. It keeps its
  `useCallback([])` and its synchronous position inside the click handler.
- Add a `permissionHint` state (`PermissionHint`, initial `"unknown"`) and a mount effect that
  wraps `navigator.permissions.query({ name: "geolocation" })` in try/catch, sets the state, and
  subscribes to `status.onchange`, removing the listener on cleanup. A rejection or a missing API
  leaves `"unknown"`.
- Pass `permissionHint` to `<OriginPicker>` alongside the existing `locating`.
- Replace the location notice (currently lines 565–569, a bare
  `<p className="notice is-warn" role="alert">{state.locationError}</p>`) with a two-node block:

  ```tsx
  {state.locationNotice && (
    <div className="notice-stack" {...inertWhen(picking)}>
      <p
        id={locationNoticeId}
        className={state.locationNotice.tone === "warn" ? "notice is-warn" : "notice"}
        role={state.locationNotice.tone === "warn" ? "alert" : "status"}
      >
        {state.locationNotice.message}
      </p>
      {state.locationNotice.suggest && (
        <button
          type="button"
          className="link-button"
          aria-describedby={locationNoticeId}
          onClick={/* playTap(true); dispatch({ type: "origin", origin: suggest }) */}
        >
          Start from {state.locationNotice.suggest.name}
        </button>
      )}
    </div>
  )}
  ```

  `locationNoticeId` is a `useId()`-derived constant, matching how `emptyNoticeId` is already done.

  **Why the button is outside the live region.** An assertive region announces its text content on
  insertion; a focusable control inside one is announced inconsistently across assistive technology
  and gives the listener no obvious route to it. So the region holds the sentence and nothing else.
  What a screen-reader user hears on a fix outside the box is exactly the out-of-bounds sentence.
  They reach the offer the ordinary way: the button is the very next element in DOM order after the
  notice, so the next Tab from the origin chip lands on it, and `aria-describedby` makes it announce
  as *"Start from Scott's Addition, button"* followed by the sentence that explains why it is being
  offered. No `aria-live` is added; the region reuses the `role` the notice already had.

- Add a warm-up notice directly beneath that block: when `origin.id === "me" && !hasSnapshot(origin)
  && state.warmed < 1 && status !== "error" && status !== "not-configured"`, render
  `<p className="notice" {...inertWhen(picking)}>` reading *"Your own spot is not pre-baked the way
  the presets are, so the reachable area is being computed from scratch. The dial fills in as it
  arrives."* Plain `.notice`, not `.is-warn` — this is information, not a warning. It disappears on
  its own when `warmed` reaches 1. It carries no `role`, because `TimeDial` already announces
  warm-up progress in quarters through its own `sr-only role="status"` and a second live region
  would double-speak.

  The `origin.id === "me"` half of that condition is deliberate and is **not** redundant with
  `hasSnapshot`. Every cold origin lacks a snapshot, and today the commonest cold origin is a
  dropped pin — but the copy says "Your own spot", which is a sentence about a geolocated fix. This
  feature does not own the dropped-pin path and should not put slightly-wrong copy on it. If a
  sibling spec wants the same reassurance for pins, it generalises the sentence and drops the id
  check; that is its call, not this one's.

- **Both new nodes need `{...inertWhen(picking)}` explicitly.** They sit in `<div className="panel">`
  (App.tsx line 504), which carries no `inertWhen` — `inertWhen(picking)` is applied to
  `<header className="brand">` (505), the reel notices (646, 653), `.spin-slot` (666) and the drawer
  (735), and pick-on-map mode dims the rail purely in CSS (`src/styles/app.css:168`,
  `.shell.is-picking .rail { opacity: .55; pointer-events: none }`, with `.origin` re-enabled at
  172). `pointer-events: none` does not remove anything from the tab order, so without the attribute
  the new `Start from {preset}` button would be keyboard-reachable and activatable while the panel
  is visually disabled. The notice this replaces gets away without the attribute today only because
  it contains no interactive content; the moment it carries a button it must have it. No new rail
  child, so `.rail.is-collapsed`'s selector list is untouched.

**`src/ui/OriginPicker.tsx` — modified.**

- `OriginPickerProps` gains `permissionHint: PermissionHint`.
- The trigger chip shows the pending state: when `props.locating`, `.origin-name` renders
  `Locating…` instead of `props.origin.name` and the button gets `aria-busy={true}`. The popup
  still closes on press — the handler at OriginPicker.tsx:89–96 calls `props.onUseMyLocation()` and
  then `close(true)` — so focus returns to the chip and the reader hears the busy state on the
  control they just used.
- **The action label has no pending state, because it can never be seen.** `close(true)` runs in the
  same click handler, so the popup is unmounted before `locating` is ever true; today's
  `{props.locating ? "Locating..." : "Use my location"}` (line 96) is dead in the only path that
  reaches it. `locateActionLabel(props.permissionHint)` therefore takes no `locating` argument and
  has two results: `"Use my location — blocked"` when the hint is `"denied"`, `"Use my location"`
  otherwise. It stays enabled when blocked (pressing it is how you get the explanation).
  `disabled={props.locating}` **stays**, and is the one thing `locating` still does inside this
  component: a user who reopens the popup during an in-flight call must not start a second one.
- The click handler calls `playPress()` immediately before `props.onUseMyLocation()`, per the house
  cue convention. Note for the record: none of the other origin buttons have cues today; adding
  them is out of scope for this spec but is a real gap.

**`src/styles/app.css` — modified, minimally.** No new tokens, no new colours. Three small
additions: `.origin-chip[aria-busy="true"] .origin-name { color: var(--ink-2) }` so the pending chip
reads as provisional; `.notice-stack { display: flex; flex-wrap: wrap; align-items: baseline;
gap: 6px }`, which is the layout `.notice` already uses internally and is what a sentence followed
by a link-button wants (the button is now a sibling of the `<p>`, not a child, so the rule has to
move out one level); and a rule letting the `.link-button` inside `.notice-stack` take
`--accent-soft` rather than `--accent`, so the offer does not out-shout the sentence above it.

**`src/lib/isochrone.ts` — modified.** Export a predicate over the existing private
`PRESET_SNAPSHOTS` set so App can tell a baked origin from a cold one without reaching into the
module's internals:

```ts
/** True when this origin's ladder ships as a file and will not hit the engine cold. */
export function hasSnapshot(origin: LngLat): boolean;
```

Its body must be **exactly** `return PRESET_SNAPSHOTS.has(snapshotName(origin));` — character for
character the expression `prefetchLadder` already uses at `src/lib/isochrone.ts:574` to decide
whether to seed from a file, and ideally that line is changed to call `hasSnapshot` so there is one
copy. Left to judgement the two drift, and the failure mode is a notice claiming "not pre-baked"
about an origin that is baked, or staying silent about one that is not. (`snapshotName` keys on
5-decimal coordinates, so a real geolocated fix cannot collide with a preset; the risk here is
drift, not collision.) Read by `src/app/App.tsx`, so no `@public` tag is needed for knip.

**`vite.config.ts` — modified.** Append the plugin conditionally on the mode Vite was already
given — no env variable, no `loadEnv` change:

```ts
// ... plugins: [react(), apiProxy({...}), ...(mode === "lan" ? [basicSsl()] : [])]
```

Keying off `mode` rather than a shell prefix is deliberate: `DEV_HTTPS=1 vite` is a syntax error in
`cmd.exe` and this repo is developed on Windows. An earlier draft of this spec routed the switch
through a checked-in `.env.lan`; that is **rejected**, because `.gitignore` ignores `.env.*` with
only `!.env.example` negated, so git would silently refuse the file and `dev:lan` would serve plain
HTTP for everyone but its author — the exact "looks like it works while silently disabling the
feature" failure this design spends a paragraph refusing. `mode` needs no file, so `.gitignore` is
untouched.

**`package.json` — modified.** Add `"dev:lan": "vite --host --mode lan"` and the devDependency
`"@vitejs/plugin-basic-ssl": "^2.3.0"`.

**`README.md` — modified.** A short section under development: what `dev:lan` does, that the
certificate is self-signed so the phone shows an interstitial, that `npm run preview -- --host` is
plain HTTP and **cannot** do geolocation no matter what the browser settings say, that Chromium has
`--unsafely-treat-insecure-origin-as-secure` / `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
for testing an Android device against a LAN HTTP origin, and that iOS has no such escape hatch
because every iOS browser is WebKit — a real certificate or a tunnel are the only iPhone paths.

**`LAUNCH.md` — modified.** Add to the manual pass: grant, deny and revoke on a real phone; airplane
mode (expect `POSITION_UNAVAILABLE`); a desktop over wifi (expect the accuracy refusal, with the
measured number written down so the 250 m threshold can be re-argued against reality); and a fix
faked outside the box via devtools sensors (expect the out-of-bounds notice and a working preset
offer).

**Untouched, deliberately:** `worker/index.ts`, `wrangler.toml`, `.env.example`, `.gitignore`,
`public/_headers`, `server/vite-plugin.ts`, `scripts/build-reach.mjs`, `knip.json`,
`public/reach/*`. No endpoint, no env var reaching the server, no snapshot, no cache key, and no new
ignore rule — `.gitignore` is listed here on purpose, because the one design that would have needed
a change to it was rejected above.

## Algorithm

`judgeFix` is the whole feature and is pure:

```
judgeFix(fix):
  if not (isFinite(fix.lat) and isFinite(fix.lng) and isFinite(fix.accuracyMeters)):
    return rejected({
      message: "Your device reported a position this can't read. Drop a pin on the map instead.",
      tone: "warn",
      suggest: null,
    })
  if not insideRichmond(fix):
    return rejected({
      message: "That's outside the area this knows. Walk Roulette only has Richmond —
                its map, its places and its walking times all stop at the city.",
      tone: "warn",
      suggest: nearestPreset(fix),
    })
  if fix.accuracyMeters > MAX_ACCURACY_METERS:
    return rejected({
      message: `Your device could only place you to within about ${formatAccuracy(acc)}.
                A five-minute walk is about 300 m, so a contour drawn from that fix would
                be mostly guesswork. Drop a pin on the map instead.`,
      tone: "warn",
      suggest: null,
    })
  origin = { id: "me", name: "My location", lat: fix.lat, lng: fix.lng }
  caveat = accuracyMeters > CAVEAT_ACCURACY_METERS
    ? { message: `Located to within about ${formatAccuracy(acc)} — the edges are approximate.`,
        tone: "info", suggest: null }
    : null
  return accepted(origin, caveat)
```

The non-finite guard is three lines and it is the same honesty argument as the rest of this
document. `coords` is normally clean, but a `NaN` or `Infinity` falls through `insideRichmond` as
`false` — every comparison against a NaN is false — and lands in `nearestPreset`, where every score
is NaN, every comparison is false, and the reduce returns `PRESET_ORIGINS[0]`. A garbage fix would
produce *"you are outside Richmond, start from Home (downtown)"* with total confidence. Reject it
by name instead.

Bounds before accuracy, and the order is load-bearing: a wildly inaccurate fix in another state
should be told about the state, which is the fact that actually explains why this app cannot help.
Every magnitude in these strings goes through `formatAccuracy` from `src/lib/format.ts`, unit
included, so nothing can print "within about 3.1 m" for a 3.1 km fix.

`nearestPreset` uses an equirectangular approximation over `PRESET_ORIGINS`, comparing squared
values so nothing needs a square root:

```
dx = (p.lng - at.lng) * cos(at.lat * PI / 180)
dy = (p.lat - at.lat)
score = dx*dx + dy*dy
```

Degrees are fine as the unit because only the ordering matters and the cosine correction is what
keeps longitude from being over-weighted at 37° N. This is not a distance and must never be
displayed as one. Honest note for whoever writes the tests: at Richmond's scale the correction
almost never changes the winner — the presets span 0.043° of latitude against 0.061° of longitude,
and the naive score picks the same preset for every fixture worth pinning. It changes the ordering
only for near-tie diagonal points, which is exactly the kind of fixture a test should not be built
on. The correction is there because the comparison is wrong without it, and it is defended by this
comment, not by an assertion. Do not invent a test that claims otherwise.

`describeGeolocationError(code, secureContext)`:

```
code 1 and not secureContext ->
  "This page isn't on a secure connection, so the browser won't share a location.
   Drop a pin on the map instead." (suggest: null)
code 1 ->
  "Location is blocked for this site. You can turn it back on in your browser's site
   settings — or just drop a pin on the map." (suggest: null)
code 2 ->
  "Your device couldn't get a fix. That usually means no GPS and no known wifi —
   try again outdoors, or drop a pin on the map." (suggest: null)
code 3 ->
  "Locating took too long and gave up. Try again, or drop a pin on the map."
  (suggest: null)
anything else ->
  the code-2 sentence, because "unavailable" is true of every unknown code.
```

Every one of these carries `tone: "warn"` and `suggest: null`, and every one ends by naming the way
forward that always works, because the pin is always there. None of them suggests a preset: a
permission problem is not solved by starting from Maymont.

The handler in App.tsx, in order:

1. If `!("geolocation" in navigator)`, dispatch `locationNotice` with
   `{ message: "This browser can't share a location. Drop a pin on the map instead.",
   tone: "warn", suggest: null }` and stop.
2. If `permissionHint === "denied"`, dispatch `describeGeolocationError(1, window.isSecureContext)`
   and stop — no call is made, because a denied state cannot prompt and a silent no-op is the
   failure mode this feature exists to remove.
3. Read `const retry = state.locationNotice !== null` **before** clearing, then `setLocating(true)`
   and dispatch `{ type: "locationNotice", notice: null }`.
4. `navigator.geolocation.getCurrentPosition(onFix, onError, { enableHighAccuracy: true,
   timeout: 15000, maximumAge: retry ? 0 : 60000 })`, called synchronously in the handler (see the
   unverified iOS activation note).

   **Why `maximumAge` depends on `retry`.** A cached fix carries its *original* `accuracy`, so a
   stale 250 m wifi fix is just as eligible for instant replay as a good one. With a flat
   `maximumAge: 60000`, a user who presses again after an accuracy refusal or a timeout gets the
   identical refusal back instantly, with no new acquisition attempted — a button that visibly does
   nothing, which is the whole class of failure this spec exists to delete. So the first press
   accepts a minute-old fix (free, and indistinguishable at this app's resolution) and any press
   made while a notice is standing forces a fresh acquisition. `retry` is derived from existing
   state; no new state field.
5. `onFix`: `setLocating(false)`; build a `Fix` from `position.coords`; call `judgeFix`. On
   `rejected`, dispatch `{ type: "locationNotice", notice: error }` and leave the origin alone. On
   `accepted`, dispatch `{ type: "origin", origin }` — which clears the old notice, resets the pick
   and bumps `framingKey` — and then, if `caveat` is non-null, dispatch
   `{ type: "locationNotice", notice: caveat }` **after** the origin action, because the origin case
   clears the field and a caveat dispatched first would vanish. The caveat arrives with
   `tone: "info"`, so it renders as a plain `.notice` with `role="status"`: a fix that was accepted
   is not a warning.
6. `onError`: `setLocating(false)`; dispatch
   `describeGeolocationError(error.code, window.isSecureContext)`.

The pure surface to test is `judgeFix`, `nearestPreset`, `describeGeolocationError`,
`insideRichmond` and `locateActionLabel`; the impure remainder is six lines of `navigator` plumbing
and two dispatches, which is the point of splitting it this way.

**Warm-up, once accepted.** Nothing new runs: the origin action bumps `framingKey`, the existing
`prefetchLadder` effect starts the ladder, `state.warmed` climbs, `TimeDial` greys unwarmed ticks
and announces in quarters, `ReachReadout` shows its skeleton and writes its settled text on the
commit key. What is new is only the honesty: the `.notice` explaining that a personal origin has no
baked snapshot. The order the user experiences is — chip says "Locating…" (usually under two
seconds), map jumps to the fix and the marker lands there, panel says the reach is being computed,
dial ticks fill from the short end, first contours draw within a few seconds, the whole 96-rung
ladder settles over tens of seconds against a warm engine. Spin stays disabled by the existing
`status !== "ready"` gate until there is a reach, and the route-warming grace timer then does its
usual `Loading routes n/total` work. No new gate, no new spinner.

## Failure and degradation

| What happens | What the user sees |
| --- | --- |
| No `navigator.geolocation` | Amber notice: "This browser can't share a location. Drop a pin on the map instead." The action still exists and still says why when pressed. |
| Permission denied by the user | Amber notice with the site-settings sentence. If the Permissions API reported `denied` first, the popup action already read "Use my location — blocked" before the press. |
| Insecure context (LAN dev over http, or a downgraded deploy) | The insecure-connection sentence, distinct from denial. This is the sentence that saves a developer an hour. |
| `POSITION_UNAVAILABLE` (airplane mode, no GPS, no known wifi) | "Your device couldn't get a fix… try again outdoors, or drop a pin." |
| Timeout at 15 s | "Locating took too long and gave up. Try again, or drop a pin." Pressing again is a genuine second attempt: a press made while a notice is standing sets `maximumAge: 0`, so the browser cannot replay the cache that just failed to help. |
| Fix worse than 250 m | Refused, with the measured accuracy in the sentence and the 300 m five-minute comparison as the reason. Origin unchanged. Common on desktop and correct there. A second press re-acquires rather than replaying the same coarse cached fix. |
| Fix 100–250 m | Accepted. A plain (not amber) `.notice` says the edges are approximate and names the accuracy. |
| A fix with a non-finite coordinate or accuracy | Refused by name: "Your device reported a position this can't read. Drop a pin on the map instead." Never reaches `nearestPreset`, so it cannot produce a confident out-of-bounds sentence about garbage. |
| Fix outside `RICHMOND_BOUNDS` | Refused before any request. "Walk Roulette only has Richmond…" plus a `Start from {nearest preset}` link-button. The proxy never sees the coordinate, so no 400 and no generic failure panel. |
| Fix inside bounds but with no places in range | Not this feature's message. The origin is set, contours draw, and the existing `emptyNotice` path (sibling `pool-reasoning`) explains the empty pool. Conflating the two would tell someone in Manchester they are not in Richmond. |
| Engine unconfigured (`VALHALLA_URL` unset → 503) | Unchanged: `status === "not-configured"` and the existing `.notice.is-setup` block. Geolocation succeeded; it is the reach that is missing, and the panel already says which. |
| Engine down / timeout (502, 504) | Unchanged failure panel. The location notice is separate and stays true. |
| Offline entirely | `getCurrentPosition` may still succeed from a cached fix; the ladder then fails and the failure panel says so. There is no service worker, so nothing pretends to work offline. |
| Rate-limited (429) during a cold personal-origin ladder | Unchanged: `postJson` honours `retry-after`. Worth noting the load argument below — a personal origin is one uncached ladder, which is what the limiter is sized for. |
| `navigator.permissions.query` throws or is absent | Hint stays `"unknown"`, label stays "Use my location", behaviour is identical. Nothing is gated on it. |
| Safari reporting `"prompt"` for an actually-denied permission | Label is the neutral one, the press makes the call, the browser refuses immediately, and the code-1 sentence appears. Exactly the same outcome as a correct hint, one press later. |

## Cost

**Bundle — estimated, and the estimate is not the check.** `src/lib/bounds.ts` is ~40 lines mostly
comment: ~120 bytes of code, under 100 gzipped. `src/lib/locate.ts` is the strings plus five small
functions: ~1.6 KB raw, and because the copy is prose that does not compress as well as code, call
it ~700 bytes gzipped. App.tsx and OriginPicker changes add the permission effect, the notice block
and the label call: ~600 bytes raw, ~300 gzipped. CSS: three rules, under 150 bytes. That reasons to
**≈ 1.1 KB gzipped** against a 64 KB budget, about 1.7% — but nothing here was measured, and in a
repo where the budget is a stated point of pride an asserted figure is not a defended one. So the
implementer records the real number: `npm run build` on the branch point and again on the finished
branch, gzipped size of the app JS chunk (excluding MapLibre's vendor chunk) both times, both
figures written into the PR description. Acceptance criterion 16. If the delta exceeds 2 KB
gzipped, something is wrong with the implementation and not with the budget. No client dependency is
added; `@vitejs/plugin-basic-ssl` is a devDependency and ships nothing.

**Requests.** Zero new endpoints and zero new request types. A session that uses the button and
lands on a personal origin pays one full uncached ladder (one `/api/isochrone` POST carrying 96
minutes, which the proxy splits into `ceil(96 / VALHALLA_MAX_CONTOURS)` sequential upstream
queries — 24 against a stock `max_contours` of 4, one against a properly configured instance) plus
the usual two route-prefetch waves. That is identical to what dropping a pin costs today; the
feature makes cold origins more common, it does not make them more expensive. Rate-limiter cost is
`isochroneQueryCost`, unchanged.

**Build.** Nothing. No snapshot regeneration, no `SNAPSHOT_VERSION` bump, no new generator step.
`dev:lan` costs a one-time certificate generation on first run, cached by the plugin.

**Engine.** More cold ladders in the mix, in proportion to how many phone users press the button
instead of taking a preset. This is the real ongoing cost and it is the honest price of the
feature; it is also bounded by the same rate limiter and edge cache that already bound dropped
pins. Two mitigations exist and neither is proposed here: baking more preset origins (a snapshot
rebuild, ~1.7 MB each, and a `SNAPSHOT_VERSION` bump), or snapping personal origins to a coarse
grid so nearby users share an edge-cache key — the latter would trade contour truth for cache hits
and is exactly the kind of quiet lie this app refuses. Say no and move on.

**Hosting.** None. No new binding, no KV, no new outbound host, no CSP or preconnect change.

## Tests

New `src/lib/bounds.test.ts`:

1. **inside the box** — `insideRichmond({ lat: 37.5464, lng: -77.4517 })` (the Monroe Ward fixture
   already used in `server/proxy.test.ts`) is true.
2. **edges are inclusive** — all four corners of `RICHMOND_BOUNDS` are inside; `south - 0.0001` and
   `east + 0.0001` are outside.
3. **far away** — Charlottesville `{ lat: 38.0293, lng: -78.4767 }` and Norfolk
   `{ lat: 36.8508, lng: -76.2859 }` are outside.

New `src/lib/locate.test.ts`:

4. **a good downtown fix is accepted with no caveat** — `judgeFix({ lat: 37.5464, lng: -77.4517,
   accuracyMeters: 18 })` returns `kind: "accepted"`, `origin.id === "me"`,
   `origin.name === "My location"`, coordinates preserved exactly, `caveat === null`.
5. **a merely-fuzzy fix is accepted with a caveat** — same point at `accuracyMeters: 140` is
   accepted, `caveat` is non-null, `caveat.message` contains `"140 m"`, `caveat.tone === "info"`
   (an accepted fix is never a warning) and `caveat.suggest === null`.
6. **thresholds are boundaries, not ranges** — `accuracyMeters: 100` has no caveat, `101` does;
   `250` is accepted, `251` is rejected. Locks the numbers the prose argues for.
7. **a hopeless fix is refused and mentions its own accuracy with its unit** — `accuracyMeters:
   3100` returns `kind: "rejected"`, `error.tone === "warn"`, `error.suggest === null`, and the
   message contains `"3.1 km"` — asserted with the unit, because `"3.1"` alone passes for a message
   that says "within about 3.1 m", which is the failure this string exists to avoid.
8. **bounds beat accuracy** — Charlottesville at `accuracyMeters: 5000` returns the out-of-bounds
   message, not the accuracy one, and `suggest !== null`. This is the ordering assertion.
9. **the offered preset is the nearest one, pinned by id** — two fixtures, each with a hard-coded
   expected winner computed by hand from `PRESET_ORIGINS` and written into the assertion:
   `judgeFix({ lat: 37.95, lng: -77.44, accuracyMeters: 20 })` (due north of the city, outside
   `RICHMOND_BOUNDS`) has `error.suggest.id === "scotts-add"`, the northernmost preset;
   `judgeFix({ lat: 37.53, lng: -77.05, accuracyMeters: 20 })` (due east, outside the box) has
   `error.suggest.id === "libby-hill"`, the easternmost. Hard-coded ids, not a formula: a test that
   recomputes the implementation asserts nothing. If a preset is ever added north of Scott's
   Addition or east of Libby Hill this test fails, which is correct — the offered preset changed.
10. **`nearestPreset` never returns undefined** — over a grid of twenty scattered points, including
    several far outside `RICHMOND_BOUNDS`, every result is a member of `PRESET_ORIGINS`.
11. **a non-finite fix is refused by name** — `judgeFix({ lat: NaN, lng: -77.44,
    accuracyMeters: 20 })` and `{ lat: 37.54, lng: -77.44, accuracyMeters: Infinity }` both return
    `kind: "rejected"` with `suggest === null`. Specifically **not** the out-of-bounds message and
    **not** a preset offer: without the guard, NaN falls through `insideRichmond` as `false` and
    `nearestPreset` reduces to `PRESET_ORIGINS[0]`, so the un-guarded implementation passes an
    `expect(rejected)` assertion while producing "start from Home (downtown)". Assert the
    absence of the suggestion, which is the part that actually detects the bug.
12. **the four error codes are four different sentences** — `describeGeolocationError(1, true)`,
    `(1, false)`, `(2, true)`, `(3, true)` produce four distinct non-empty messages, all with
    `suggest === null`, and the `(1, false)` one mentions a secure connection while the `(1, true)`
    one does not.
13. **an unknown code degrades to unavailable** — `describeGeolocationError(99, true)` equals
    `describeGeolocationError(2, true)`.
14. **every message names a way forward** — every string returned by `describeGeolocationError` and
    by a rejected `judgeFix` with `suggest === null` contains `"pin"`. A cheap assertion that
    guards the house rule that the panel always says what to do next.
15. **label decoration** — `locateActionLabel("denied")` differs from `locateActionLabel("prompt")`
    and from `locateActionLabel("unknown")`, and those latter two are equal, because Safari's lie
    must not produce distinct UI. There is no pending case to assert: the popup is unmounted before
    `locating` is ever true, so the function does not take that argument.

Added to `server/proxy.test.ts`:

16. **the proxy still rejects outside the shared box, without calling upstream** — POST
    `/api/isochrone` with Charlottesville coordinates returns 400 and `calls.length === 0` (this
    case may already exist; if so, extend it to assert the message and add a case at exactly
    `RICHMOND_BOUNDS.north` that is accepted, proving the shared constant is the one in force).

No test needs a browser: `judgeFix` never touches `navigator`, which is the reason it exists.

## Acceptance criteria

1. `src/lib/bounds.ts` exists, `server/proxy.ts` imports `RICHMOND_BOUNDS` from it, and no literal
   `37.3` / `-77.9` / `37.8` / `-77.1` bounding box remains in `server/proxy.ts`.
2. `npm run lint` is clean across eslint, oxlint (including anti-slop) and knip; `npm run typecheck`
   and `npm test` pass; `npm run build` succeeds.
3. Pressing "Use my location" with permission granted and a good fix sets the origin to
   `{ id: "me", name: "My location" }`, moves the marker, re-frames the map once, and clears any
   previous location notice.
4. While the call is in flight the origin chip reads "Locating…" with `aria-busy="true"` and returns
   to normal on any outcome, success or failure. The popup is closed by then (the press closes it),
   so its label is not part of this check; reopening the popup mid-flight shows the action
   `disabled`.
5. Denying permission produces the site-settings sentence; on a browser whose Permissions API
   reports `denied`, the popup action reads "Use my location — blocked" *before* the press, and the
   press produces the sentence without invoking the browser API.
6. Loading the dev server over `http://<LAN-IP>:5173` and pressing the button produces the
   insecure-connection sentence, not the denial sentence.
7. A simulated fix with `accuracy` above 250 m is refused, the origin does not change, and the
   notice states the measured accuracy and the reason.
8. A simulated fix between 100 m and 250 m is accepted; after the origin changes, a caveat notice
   naming the accuracy **with its unit** ("about 140 m") is visible, rendered as a plain `.notice`
   with `role="status"` — not amber, not `role="alert"`.
9. A simulated fix outside `RICHMOND_BOUNDS` is refused with no network request to `/api/isochrone`
   (verify in the network panel), and the notice carries a working `Start from {preset}` button
   that sets that preset and clears the notice. With pick-on-map mode active, Tab does **not** reach
   that button — the `inertWhen(picking)` on the notice block is doing its job.
10. A `me` origin shows the "not pre-baked" notice while `warmed < 1`, and the notice disappears
    once the ladder completes. Dropping a pin does **not** show it.
11. Pressing the button again while an accuracy refusal or a timeout notice is standing issues a
    fresh acquisition (the request is not answered instantly from cache with the same accuracy).
    Observable in devtools sensors by changing the simulated position between presses.
12. The Spin button stays disabled until the reach is ready, and no new spinner or gate was added.
13. `npm run dev:lan` serves over HTTPS on the LAN and is reached from a second device. Whether
    geolocation then works on an iPhone that accepts the self-signed certificate is **recorded**,
    pass or fail, in the README section — a fail is an acceptable outcome here and means the
    dependency is reverted and the README points at a tunnel instead. `npm run preview -- --host`
    is documented as unable to do this either way.
14. Sound: the popup action plays `playPress()` on press and the preset offer plays `playTap(true)`;
    with sound muted or `prefers-reduced-motion` set, every one of these states is still fully
    conveyed in text.
15. No `aria-live` region is added anywhere, and no existing `sr-only role="status"` region is
    touched — there are three (`src/app/App.tsx:756`, `src/ui/ReachReadout.tsx:57`,
    `src/ui/TimeDial.tsx:163`) and all three keep their current content. The location notice
    carries `role="alert"` when its tone is `warn` and `role="status"` when it is `info`; the
    warm-up notice carries no role; the `Start from {preset}` button sits outside the notice's live
    region and is announced with its own text plus the `aria-describedby` sentence.
16. The gzipped size of the app JS chunk (MapLibre's vendor chunk excluded) is measured from
    `npm run build` before and after the branch, and both figures appear in the PR description. The
    delta is under 2 KB gzipped.

## Open questions

1. **The 250 m refusal threshold is a judgement call with a real cost:** it will refuse a large
   share of desktop visitors, who are the ones most likely to be exploring rather than walking. The
   argument for refusing is that a wrong contour is worse than no contour. The argument for
   accepting-with-a-loud-caveat is that a desktop user is browsing and a rough centre is enough to
   start. This spec chooses refusal; a human should confirm that is the trade they want before
   implementation, because it is the one decision here that is about product rather than
   correctness.
2. **Whether `dev:lan` and `@vitejs/plugin-basic-ssl@^2.3.0` are worth a devDependency at all**,
   versus a README paragraph pointing at an existing tunnel tool. The feature is untestable on a
   real phone without one of the two, but the repo has been strict about dependencies and this is
   the first one added for developer convenience. Two facts should settle it before any install:
   the repo root already carries `dev-lan.log` and `dev-lan.err.log` with matching `.gitignore`
   entries, so a LAN attempt has been made here and abandoned — find out why; and the whole
   argument rests on iOS Safari treating a tapped-through self-signed certificate as a secure
   context for geolocation, which is unverified. If that is false, the tunnel was always the
   answer, and `dev:lan`, the devDependency and the `mode === "lan"` branch all come out of this
   spec, leaving only the README paragraph. Nothing else in the document depends on them.
