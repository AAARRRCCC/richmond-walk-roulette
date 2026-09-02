# Shareable spins

**Status:** implemented in chunk 10. See *Corrections after implementation* at the end.
**Slug:** `shareable-spins`

## Depends on

Everything that changes what a session *is*, which is why this is **chunk 10 and last**:

- **`elevation-profile`** — the filter field is `climb: ClimbBand | "any"`, not `terrain`. The link
  carries `c=`, never `t=`. Do not serialise the profile; it is re-derived from a route the
  recipient fetches anyway.
- **`places-expansion`** — the link carries `k=` for the tier filter, and that spec owes the
  guarantee this one asked for: place ids are permanent and never reused, since a reassigned id
  turns every old link into a silent substitution rather than a visible 404.
- **`pool-reasoning`** — `unavailableReason` is read off `PoolReport.verdicts.get(placeId)` rather
  than being a private function this spec asks `opening-hours` and `weather-filters` to compose
  into. Those specs keep filtering separately from naming, exactly as asked, but the naming already
  exists: `REASON_COPY[verdict.reasons[0]].sentence`. The `unavailableReason(place, at)` contract
  below is therefore satisfied by machinery that is already built, not by a new function.
- **`opening-hours`, `weather-filters`, `daylight-budget`** — only in that their fields must exist
  before the format is frozen. Freezing it earlier would need the migration this spec's whole
  argument for a readable query string exists to avoid.

**One amendment, from `docs/plans/README.md` §4.** The link carries the walk (`o`, `b`, `f`, `rt`,
`p`) and the *place filters* (`c`, `v`, `e`, `k`). It does **not** carry `beforeDark`,
`weatherAware` or `hideClosed`. Those are about the recipient's here-and-now, not about the walk
that was sent: a link that switched off somebody's daylight guard would be a trap, and one that
switched it on would be a lie about what the sender did. `.result-actions` is shared with
`apple-maps`; §3 fixes the final grid and deletes this spec's separate 380px rule as redundant.

## What and why

A good spin is currently unshareable. You get sent to Great Shiplock Park from a 34 minute
round trip out of Carytown, you want to send that to someone, and the only thing the address
bar offers is the front door of the app. The other person lands on the first preset, 50
minutes, no filters, no pick — a different question with a different answer. Everything that
made the spin worth sending lives in a `useReducer` that never touches the URL.

This adds a URL that describes a spin — origin, budget, floor, round trip, edge-only,
terrain, vibes and the winning place — a Share control on the result card, and server-side
Open Graph tags so the link unfurls as *"Great Shiplock Park — a 34 minute walk from
Carytown"* in a message app instead of the site's generic card. Opening the link does **not**
re-run the reel: it restores the session and shows the result card, framed on the shared
reach with the route drawn, with a "Spin your own" affordance next to it. A replayed reel is
either predetermined theatre or a genuine second draw, and both break the one promise a share
URL makes, which is that it reproduces the spin.

What it does not do: the preview picture is the same for every share. The dynamic half of the
unfurl is text only — title and description — and the image stays the baked
`public/og.png`. The reasoning is in the next section, and it is a decision, not an oversight.
It also does not make a shared link a live document: opening one restores state from the
query string and then the app stops reading and stops writing the URL. The first change that
makes the address bar stop describing the screen clears it, because an address bar that no
longer describes the screen is worse than an empty one — and "the first change" is measured
against the link's own fields, not against whether the arrival notices are still relevant.

## The decision

**A readable query string on a dedicated path, `/s`, not an opaque token.**
`/s?o=carytown&b=34&rt=1&t=flat&v=river.park&p=shiplock` costs no encoder and no decoder in
the 64 KB budget, is forward-compatible by construction (unknown keys are ignored, absent keys
fall back to `initialSession`, and so it never needs a version byte or a migration), survives
hand-editing, and reads honestly in a log line. Rejected: a base64 token — it needs two
codecs in the bundle, needs versioning the first time a sibling spec adds a filter, cannot be
debugged, turns "this place id was deleted" from one ignorable key into an opaque decode
failure, and buys nothing, because the state is not secret and the query form is 60–90
characters. Rejected: putting the state on `/` — that is reachable (`run_worker_first` can list
`/`), but it would route the app's own front door through the Worker on every cold load, put a
query string on the URL people bookmark, and give the share cache the same key space as the
homepage. A dedicated path keeps the expensive-to-get-wrong behaviour on a path nothing else
uses.

**`o`, `b`, `rt` and `p` are always written; `f`, `e`, `t`, `v` are omitted at their
defaults.** The four that define the walk are explicit so that changing a default later cannot
quietly change what an old link means. The filters are decoration; absent-means-default is
right for them and keeps the link short.

**Opening a share restores and shows the card; it never spins.** Rejected: replaying the reel
— a predetermined animation lies about being a draw, and an honest re-draw stops the link from
reproducing the spin. The card gets a "Shared walk" label and the existing `Spin again` button
is relabelled `Spin your own` while the arrival is fresh.

**The shared destination is always shown, even when the recipient's conditions exclude it.**
If `p` names a place that is no longer in `PLACES`, there is no card at all: the panel says
plainly that the place is gone, keeps the origin/budget/filters that did survive, and invites a
spin. If `p` names a place that exists but sits outside the recipient's candidate pool —
outside the reach at their dial, filtered out, closed under `opening-hours`, or rained out
under `weather-filters` — the card is shown anyway, with a `.result-warning` line saying which.
A share link must never silently substitute a different destination; that is the same lie as a
reel that omits part of its own pool.

**Link previews are injected by the Worker with `HTMLRewriter`, and the image is the existing
baked `og.png`.** Crawlers do not run JavaScript, so per-spin meta has to be server-side. But
runtime image rendering is refused: the Workers Free plan allows **10 ms of CPU per HTTP
request** ([Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
"CPU time per HTTP request | 10 ms | 5 min (default: 30 seconds)"), and rasterising a 1200×630
PNG is not a 10 ms operation on any renderer, so runtime images force Workers Paid. *Assumed,
not measured:* that `satori` + `@resvg/resvg-wasm` lands around 1 MB of gzipped Worker bundle.
Nobody has installed them here. If a human ever wants to reopen this, the check is
`npm i -D satori @resvg/resvg-wasm && npx esbuild --bundle --minify --format=esm` on a
throwaway entry and read the gzipped size — but the CPU limit alone already decides it, so the
size is a supporting argument and not the load-bearing one. It also needs a TTF/WOFF font shipped separately
because satori cannot read WOFF2 and Geist ships WOFF2; and it cannot be mounted in the Vite
dev server the way every other endpoint is. Build-time per-place PNGs (`scripts/build-og.mjs`
+ `@resvg/resvg-js`, 62 files at roughly the 47,874 bytes `public/og.png` weighs, so about
3 MB) are technically fine and well inside the asset limits — and still **rejected for now**,
because the image would be a per-place still that cannot show the shared minutes, the origin
or the contours (that is 11 origins × 62 places × 96 dial positions), so it does not carry the
dynamic half of the unfurl either. It buys a prettier constant in exchange for a native,
platform-specific devDependency in CI and 3 MB in git. **What is given up:** every shared walk
unfurls with the same picture; only the headline and the description differ. If a human decides
the picture matters, the upgrade is small and local — `scripts/build-og.mjs`, one
`public/_headers` rule for `/og/`, and one line in `shareMeta` — and the trigger for it is
stated in Open questions.

**Routing must be pinned, not inherited, and there is no SPA fallback to inherit.** With
`[assets]` plus `main` and no `run_worker_first`, static assets win first and the Worker only
sees what no asset matches. That is not the same as `/s` working today: `wrangler.toml` sets no
`not_found_handling`, and its documented default is **`"none"`**
([Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)),
so a request for `/s` today is a hard 404 — the Worker's own
`if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request)` hands it to an asset
store that has no such asset. Two consequences, both binding:

- `run_worker_first = ["/api/*", "/s"]` in `wrangler.toml`. **Not `/s*`** — that pattern also
  matches `/site.webmanifest`, and routing the manifest through the Worker is a silent
  regression with no error anywhere. The array form with `*` globs and `!` exceptions is
  documented in the same page. `/s/` and `/s/anything` are not share paths and stay 404s.
- **Every degradation path must fetch the index document explicitly.** `return
  env.ASSETS.fetch(request)` is a 404 for `/s`, so it is never the fallback here. `/s` has one
  fallback and it is `env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }))`.
  Rejected: setting `not_found_handling = "single-page-application"` — it would fix `/s` as a
  side effect while also turning every typo'd path in the whole site into a 200 with the app in
  it, which is a repo-wide behaviour change this spec has no business making.

**Fetch `/`, never `/index.html`.** Workers Assets defaults `html_handling` to
`"auto-trailing-slash"`, under which a request for `.../index.html` answers **307 to the
directory** rather than 200 (same docs page, and the
[html_handling table](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/)).
`env.ASSETS.fetch(new URL("/index.html", …))` would therefore return a redirect, trip the
status guard below, and degrade every share to the fallback. The asset fetch is always for `/`.

**`/s` does no expensive work and is never a way in.** It fetches `/` through
`env.ASSETS.fetch` and runs it through `HTMLRewriter`. It never calls Valhalla, never
touches `handleApiRequest`, and is not charged against `API_RATE_LIMIT` because it costs the
engine nothing. Abuse control is instead: a canonical cache key built from the link's own
normalised fields (so key-order and vibe-order permutations of one walk are one entry), **no
cache entry at all for a dropped-pin origin** (coordinates are unbounded and a scraper could
otherwise mint infinite entries), a `SHARE_QUERY_MAX` length cap past which the query is
ignored, and a separate named edge cache with its own TTL. `public/_headers` is
not touched, `/reach/*` immutability is not touched, and the isochrone/route edge cache is not
touched.

**Unverified, must be checked before this ships:** that `new URL(request.url).origin` inside
the Worker carries the *public* hostname when the site is served through a custom domain
(Cloudflare normally rewrites `request.url` to the public URL, but this repo has never had a
domain, and every absolute `og:url` / `og:image` depends on it). The check: deploy, request
`/s?o=home&b=50&rt=1&p=capitol`, and read the emitted `og:url`. If it comes back with a
`workers.dev` or internal host, fall back to a `SITE_ORIGIN` var on `ProxyEnv` and use it when
set. Also unverified: that Vite's dev server serves `index.html` for `/s` (it should, via the
default `appType: "spa"` history fallback) — check with `curl -H 'Accept: text/html'
http://localhost:5173/s?o=home` before relying on it; if it does not, the dev plugin needs a
two-line rewrite of `req.url` to `/` for `/s`.

## Data and types

### `src/app/share.ts` (new — pure, no runtime imports beyond types)

```ts
/** Where a share link sends the recipient. */
export const SHARE_PATH = "/s";

/**
 * The dial's widest range, duplicated here on purpose. `share.ts` is imported
 * by the Worker, and importing `../lib/isochrone` for two numbers would drag
 * the whole contour cache and its fetch plumbing into a Worker that only wants
 * to write a sentence. The duplication is made safe by a test that asserts
 * these equal `MIN_MINUTES` and `MAX_MINUTES`, which fails the moment the dial
 * changes shape.
 */
export const SHARE_BUDGET_MIN = 5;
export const SHARE_BUDGET_MAX = 100;

/**
 * Longest query string that will be parsed at all. Past this the link is
 * treated as absent: a decoder is not a place to spend unbounded work, and
 * the Worker's share cache is keyed off what this returns.
 */
export const SHARE_QUERY_MAX = 512;

/** An origin as a link can carry it: a preset id, or a dropped pin. */
export type SharedOrigin =
  | { kind: "preset"; id: string }
  | { kind: "pin"; lat: number; lng: number };

/** Everything a link says, before any of it is checked against the data. */
export type ShareLink = {
  origin: SharedOrigin | null;
  budgetMinutes: number | null;
  floorMinutes: number | null;
  roundTrip: boolean | null;
  edgeOnly: boolean | null;
  terrain: Terrain | "any" | null;
  vibes: Vibe[];
  placeId: string | null;
};

/** What a link is built from. Exactly the fields `Session` can express. */
export type ShareInput = {
  origin: Origin;
  budgetMinutes: number;
  floorMinutes: number;
  roundTrip: boolean;
  edgeOnly: boolean;
  terrain: Terrain | "any";
  vibes: readonly Vibe[];
  placeId: string;
};

export function encodeShare(input: ShareInput): string;      // "o=carytown&b=34&rt=1&p=shiplock"
export function decodeShare(search: string): ShareLink;      // never throws
export function shareUrl(siteOrigin: string, input: ShareInput): string; // absolute
/** True when the link carries nothing this build understands. */
export function isEmptyLink(link: ShareLink): boolean;

/**
 * The same query a `ShareInput` would have produced, rebuilt from a decoded
 * link. `encodeShare` cannot be reused for this: it takes an `Origin`, and a
 * decoded pin is `{kind:"pin",lat,lng}` with no name and no id, so the two
 * signatures do not compose. This is what makes a canonical `og:url` and a
 * canonical cache key the same string, which is the only thing that stops two
 * different walks sharing one cache entry.
 */
export function canonicalQuery(link: ShareLink): string;

/**
 * The one sentence that describes a spin, written once and used twice: by
 * `navigator.share`'s `text` in the browser and by `og:description` in the
 * Worker. Two copies of this sentence would drift, and the drift would only
 * ever be visible to the recipient.
 *
 * `walkMinutes` is the *budget* the link carries, not a measured route.
 */
export function describeShare(args: {
  placeName: string;
  originName: string;
  walkMinutes: number;
  roundTrip: boolean;
}): string;
```

`canonicalQuery(decodeShare(encodeShare(input))) === encodeShare(input)` for every input the
encoder can produce; that identity is a test, not a hope.

`decodeShare` accepts a raw `location.search` with or without the leading `?`. Every field is
`null` when absent or unparseable, and it knows nothing about `PLACES` or `PRESET_ORIGINS` —
that is what keeps it usable from the Worker and from a test with no DOM. The one thing it does
range-check is `b` and `f`, which must be integers in `[SHARE_BUDGET_MIN, SHARE_BUDGET_MAX]` or
they decode to `null`. That is deliberate: it means every consumer of a `ShareLink` sees a
budget the dial could actually hold, so `shareMeta` needs no clamp of its own and needs no
access to `session.ts`'s private `clampBudget`.

### `src/app/session.ts` (modified)

```ts
/**
 * How this session arrived. Non-null only when the app was opened from a
 * share link, and cleared by the first action that changes which walk is on
 * screen. `missingPlaceId` is set when the link named a place this build no
 * longer has: the panel says so instead of pretending the link was empty.
 */
export type SharedArrival = {
  missingPlaceId: string | null;
  /** The budget the link asked for, when the dial could not honour it. */
  clampedFromMinutes: number | null;
  /**
   * `canonicalQuery` of the link exactly as it arrived. App compares the live
   * session's canonical query against this to decide when the address bar has
   * stopped describing the screen. Without it the URL-clearing rule and the
   * `shared` flag would have to be the same thing, and they are not: moving
   * the dial makes the URL wrong immediately, while the arrival notices stay
   * relevant until they are dismissed.
   */
  linkQuery: string;
};

export type Session = {
  /* …unchanged fields… */
  shared: SharedArrival | null;
};

export type Action =
  /* …the existing 20… */
  | { type: "dismissShared" };

/**
 * A fresh session as a share link describes it. Pure, and the lazy initialiser
 * for App's useReducer — restoring through a burst of existing actions would
 * fire each one's resets in turn (`origin` clears `pickedId`, `toggleRoundTrip`
 * re-clamps the budget) and end somewhere the link did not ask for.
 */
export function applyShare(base: Session, link: ShareLink): Session;
```

`shared` is set to `null` by `origin`, `spinStart`, `spinEnd`, `pickPlace`, `clearPick` and
`dismissShared`. Every other case leaves it alone: moving the dial or a filter does not stop
this from being the walk that was shared, it just makes the warnings on the card true.

### `server/share-meta.ts` (new — pure, shared by the Worker and its tests)

```ts
/** The four strings the Worker writes into the document head. */
export type ShareMeta = {
  title: string;
  description: string;
  /** Absolute. */
  url: string;
  /** Absolute. */
  image: string;
};

/**
 * Meta for a share query, or null when the link does not describe a walk this
 * build can name — in which case the Worker serves the asset untouched and the
 * unfurl is the site's own generic card, which is the right answer.
 */
export function shareMeta(search: string, siteOrigin: string): ShareMeta | null;

/**
 * Canonical cache path for a share request, or null when it must not be
 * cached at all.
 */
export function shareCacheKey(search: string): string | null;
```

`shareCacheKey` shape: `/__share/${SHARE_CACHE_VERSION}?${canonicalQuery(link)}`.

It carries the **whole** canonical query, not a digest of the fields the sentence happens to
use. `ShareMeta.url` is the full link, so two spins that agree on place, origin, minutes and
round trip but differ in terrain, vibes, edge-only or floor are *different documents*: keying
them together would hand the second sender's crawler the first sender's `og:url` and
`link[rel=canonical]`, which is a share link that resolves to somebody else's filters. That is
worse than a cache miss.

`shareCacheKey` returns `null` when `link.origin.kind === "pin"`, so pin shares are rendered
every time and never stored. Preset shares are the ones that repeat — a pin link is by
construction sent by one person — and the coordinates are the one field in the query with an
unbounded value space. The `/__share/` prefix keeps these synthetic keys from ever colliding
with a real `/s` request; nothing fetches this path.

The honest boundedness claim: the key space is presets × places × minutes × round-trip × the
filter combinations, which is large. The edge's own eviction is what keeps that from mattering;
the key's job is correctness and the version segment, not smallness.

### The document head (`index.html`, modified)

Two tags are added so the rewriter only ever *rewrites* existing elements and never has to
insert one. Both also settle the long-standing root-relative TODO:

```html
<meta property="og:url" content="/" />
<link rel="canonical" href="/" />
```

### The `/s` response

`GET /s?<query>` and `HEAD /s?<query>` →

- `200`, `content-type: text/html; charset=utf-8`
- body: the document served at `/` with exactly seven things rewritten — `<title>`,
  `meta[name="description"]`, `og:title`, `og:description`, `og:url`, `og:image` and
  `link[rel=canonical]`. No `twitter:*` tag is written; see the note under the algorithm.
- `cache-control: public, max-age=300` on the copy handed to the client;
  `public, max-age=${SHARE_HTML_CACHE_SECONDS}` on the copy stored at the edge
- `HEAD` gets the same headers and no stored entry (see the algorithm)

Any other method, an over-long query, an unparseable query, a query naming an unknown place,
or a runtime with no `HTMLRewriter` → the document at `/`, unmodified. Note again that this is
**not** `env.ASSETS.fetch(request)`, which would 404. There is no error response: a share link
that cannot be described is still the app.

## Changes, file by file

**`src/app/share.ts`** — *new.* `SHARE_PATH`, `SHARE_QUERY_MAX`, `SHARE_BUDGET_MIN`,
`SHARE_BUDGET_MAX`, `SharedOrigin`, `ShareLink`, `ShareInput`, `encodeShare`, `decodeShare`,
`canonicalQuery`, `describeShare`, `shareUrl`, `isEmptyLink`. Every one of those is used by
`App.tsx`, `session.ts`, `share-meta.ts` or a test — knip runs inside `npm run lint` with
`"tags": ["-@public"]`, so an export kept "for symmetry" fails the build. There is deliberately
no `SHARE_KEYS` array: the encoder and decoder each name their keys as literals, which is
shorter than driving both off a const and is what makes them independently readable.
Imports `type Terrain`, `type Vibe`, `type Origin` and `VIBES` from `../data/places` (canonical
vibe ordering) and `formatMinutes` from `../lib/format` (for `describeShare`). No `unknown` anywhere: the input is a string and
`URLSearchParams` gives back `string | null`, so nothing crosses the JSON boundary and
`src/lib/json.ts` is not involved.

**`src/app/session.ts`** — *modified.* Add `shared: SharedArrival | null` to `Session`
(initial `null`), the `SharedArrival` type, the `dismissShared` action, `shared: null` to the
five cases listed above, and `applyShare(base, link)`. `applyShare` reuses the existing private
`clampBudget`/`clampFloor`, which is why it lives here rather than in `share.ts`; neither is
exported, because nothing outside this file needs them any more. `applyShare` also imports
`canonicalQuery` from `share.ts` to stamp `linkQuery`. `clearFilters` is unchanged — nothing
new is a filter.

**`src/app/App.tsx`** — *modified.*
- `useReducer(reduce, initialSession, (base) => applyShare(base, decodeShare(window.location.search)))`.
  Lazy initialiser, not a mount effect: an effect would paint the default session first and
  then jump, and the map would frame twice.
- `shareInput` built per render from `state`, `origin` and `picked` (a plain expression; like
  everything else here it is not memoised).
- A ref-guarded effect that calls `history.replaceState(null, "", "/")` the first time either
  `state.shared` is null or `canonicalQuery(decodeShare(encodeShare(shareInput))) !==
  state.shared.linkQuery`, and never again. This is the fix for the obvious trap: because
  `shared` deliberately *survives* dial and filter changes, keying the clear off `shared`
  alone would leave `b=34` in the address bar while the screen showed 60. The comparison is
  against the link's own fields, so moving the dial clears the URL on the next paint while the
  clamp and missing-place notices stay up. The app never otherwise writes the URL.
- Pass `shareUrl`, `sharedArrival={state.shared !== null}` and `unavailableReason` down
  to `<ResultCard>`; pass `onSpinAgain` unchanged.
- A `.notice.is-warn` inside `.panel`, directly below the `ReachReadout`, when
  `state.shared?.missingPlaceId` is set: *"The place this link points to is no longer on the
  map. Everything else about the walk is set up — spin for somewhere new."* with a
  `.link-button` "Dismiss" dispatching `dismissShared`. It carries `{...inertWhen(picking)}`.
- A second `.notice` in the same slot when `state.shared?.clampedFromMinutes` is set: *"This
  link asked for N minutes; the closest the dial goes is M."* The wording covers both ends
  because `clampBudget` can move a budget up as well as down (a `rt=1` link asking for 7 lands
  on 10).
- Both notices share one Dismiss, and `dismissShared` clears the whole `SharedArrival`. That is
  intended: they are one "about the link you followed" block, and two separate dismiss controls
  on two one-line notices is more chrome than either sentence is worth.
- `describeResult` gains a leading `"Shared walk: "` when `state.shared !== null`, so the one
  sr-only line says how this arrived. When the place is missing, `announcement` is the missing
  notice's text — the notice is not itself a live region.

**`src/ui/ResultCard.tsx`** — *modified.* New props:

```ts
  /** Absolute URL for this exact spin. */
  shareUrl: string;
  /** The origin's display name, for the shared sentence. */
  originName: string;
  /** The dial's budget, for the shared sentence. Not the measured walk. */
  budgetMinutes: number;
  /** True while this session is still the one the link described. */
  sharedArrival: boolean;
  /** Why the recipient cannot do this walk right now, or null. */
  unavailableReason: string | null;
```

- A third cell in `.result-actions`: `<button type="button" className="button">` with
  `ShareNetworkIcon size={16} weight="bold" aria-hidden="true"` and the text `Share`.
  `aria-label` stays the visible text; the confirmation is a sibling, not a label swap.
- `Spin again` reads `Spin your own` while `sharedArrival` is true.
- `unavailableReason` renders as a third `.result-warning` line with the existing
  `WarningIcon size={15} weight="fill"`.
- A `<p className="result-share-note" role="status">` under the actions carrying the share
  outcome, and an `<input className="result-share-fallback" readOnly value={shareUrl}>` shown
  only in the copy-failed case.
- Local `useState<ShareState>` where
  `type ShareState = { kind: "idle" } | { kind: "copied" } | { kind: "shared" } | { kind: "manual" }`.
- **On the live region.** The card's header comment says it is not a live region, because the
  reel and the card share a slot and both announcing read the winner twice. That reason does
  not reach this note: it is empty until the user presses Share, it never contains the place
  name, and "Link copied." is otherwise unannounced. So the note keeps `role="status"`, the
  card as a whole still does not, and **the header comment is amended** to say which of the two
  it means. Anything else leaves a copy confirmation that only sighted users get.
- The `manual` case needs a mechanism, not just a wish: an input `ref`, and a `useEffect` on
  the transition into `manual` that calls `focus()` then `select()`. It gets the same one-line
  comment `onDismiss` already carries in App.tsx for its focus move — focus is being taken from
  the button the user just pressed, and that is the sort of thing that has to be justified where
  it happens.

**`src/styles/app.css`** — *modified.*
- `.result-actions` becomes `grid-template-columns: 1fr auto auto;` (was `1fr auto`).
- New `@media (max-width: 380px)` rule inside the existing responsive section:
  `.result-actions { grid-template-columns: 1fr 1fr; } .result-actions > :first-child { grid-column: 1 / -1; }`
  — three buttons do not fit a 320px sheet.
- `.result-share-note` — `margin: 0; font-size: 12.5px; color: var(--ink-2);` matching
  `.result-warning`'s metrics without its accent, because a copied link is not a warning.
- `.result-share-fallback` — full width, `background: var(--raise)`, `border: 1px solid
  var(--line)`, `border-radius: var(--r-control)`, `padding: 8px 10px`,
  `font-family: var(--mono)`, `font-size: 12px`, `color: var(--ink)`.
- No new tokens. No new hue — amber stays the only accent.

**`src/lib/sound.ts`** — *unchanged.* The Share button plays the existing `playPress()`,
called synchronously in the handler before the async work, exactly as the Spin button does.
There is deliberately **no** cue on success or failure: a cue answers a gesture, not an
outcome, and a cue arriving a second later after a share sheet closes would be the only sound
in the app not caused by a press. The written confirmation is the confirmation, which also
means it still works with sound seeded off under `prefers-reduced-motion`.

**`server/share-meta.ts`** — *new.* `ShareMeta`, `shareMeta`, `shareCacheKey`,
`SHARE_CACHE_VERSION = "v1"`. Imports `decodeShare`, `canonicalQuery`, `describeShare` and
`SHARE_PATH` from `../src/app/share.ts` and `PLACES`/`PRESET_ORIGINS` from
`../src/data/places.ts`. It does **not** import `formatMinutes` directly and does **not** clamp
anything: the sentence is built by `describeShare`, which the client also calls, and the budget
is whatever `decodeShare` accepted. Zero client cost: nothing in `src/` imports it.

**`worker/index.ts`** — *modified.* Before the `/api/` check:

```ts
if (url.pathname === "/s") {
  return (await shareResponse(request, env, ctx)) ?? (await indexDocument(request, env));
}
```

plus module-private `SHARE_HTML_CACHE_SECONDS = 3_600`, `shareCache()` opening a **separate**
named cache `"walk-roulette-share"` (the isochrone cache keeps its own name and TTL),
`shareResponse` returning `Response | null`, and:

```ts
/**
 * The app's own document. `env.ASSETS.fetch(request)` cannot stand in for
 * this: `not_found_handling` defaults to "none", so a `/s` request has no
 * matching asset and comes back 404 — which would turn every one of this
 * feature's careful degradations into a broken link. The URL is "/" and not
 * "/index.html" because `html_handling` defaults to "auto-trailing-slash" and
 * redirects the latter. The method is forced to GET so a crawler's HEAD does
 * not fetch an empty body.
 */
function indexDocument(request: Request, env: Env): Promise<Response>;
```

`shareResponse` guards `if (!("HTMLRewriter" in globalThis)) return null;` for the same reason
`edgeCache()` guards `caches`: the type says it is always there and it is not, and a null here
means "serve the app's document", which is a correct answer rather than a failure. `/s` is not
passed to `handleApiRequest` and is not charged against the limiter.

**`server/proxy.ts`** — *unchanged.* `/s` is not an API endpoint, it produces HTML, it exists
only where static assets exist, and putting it in the proxy would mean a dev mount that has no
`HTMLRewriter` and no assets binding. The policy layer stays about the engine.

**`server/vite-plugin.ts`** — *unchanged*, subject to the `/s` history-fallback check above.
**Dev does not inject meta.** That is a stated parity exception, not an accident: the injection
depends on a Workers-only global and on built assets. What is testable is factored into
`server/share-meta.ts` and covered by `node --test`; what is left in the Worker is
`HTMLRewriter` plumbing.

**`wrangler.toml`** — *modified.* Add, with a comment saying why the exact paths and not `/s*`:

```toml
[assets]
directory = "./dist"
binding = "ASSETS"
run_worker_first = ["/api/*", "/s"]
# not_found_handling is deliberately left at its default, "none". /s never
# relies on a SPA fallback; the Worker fetches "/" explicitly, so setting it
# would only change what happens to every *other* unmatched path on the site.
```

**`public/_headers`** — *unchanged.* `/s` is Worker-generated and `_headers` never applied to
it; `/reach/*` immutability is untouched.

**`index.html`** — *modified.* The two tags above, and the comment at `og:image` updated: the
Worker now makes these absolute at request time, so the note stops being a TODO and becomes a
description of where the absolute URL comes from.

**`server/test-stubs.ts`** — *modified.* Add `stubHtmlRewriter(t)`, a minimal
`globalThis.HTMLRewriter` sufficient for the fixture head: it collects `on(selector, handlers)`
registrations and, in `transform(response)`, applies `setAttribute`/`setInnerContent` to a
small fixed HTML document by string substitution. It is not a parser and does not pretend to
be; its job is to prove the Worker registers the right selectors and computes the right
values.

Also *modified:* `stubEdgeCache(t)` currently ignores the cache name — `open: () =>
Promise.resolve(cache)` hands every caller the same `Map`. Give it one `Map` per name and
return the outer `Map<string, Map<string, Response>>`, so a test can assert that a `/s` request
put nothing in `"walk-roulette-isochrone"`. Without that change no test can tell the two caches
apart, and the claim that they are separate is untested.

**`README.md` / `LAUNCH.md`** — *modified.* README gains a "Sharing a spin" paragraph
describing the URL shape and that presets share as an id while a dropped pin shares as
coordinates. LAUNCH.md gains the `og:url` verification step from the Decision section, and the
note that `run_worker_first` must list `/api/*` explicitly once it exists at all — dropping it
silently reverts the API to asset-first — and the criterion 14 curls, framed as the only check
that can catch a `/s` routing mistake, since `/s` misrouted is a 404 rather than a degraded
preview.

**`.env.example`** — *modified only if* the `og:url` check fails: a commented `SITE_ORIGIN=`
entry, matched by `SITE_ORIGIN?: string | undefined` on `ProxyEnv`, a `[vars]` line, and a
name in `vite.config.ts`'s `loadEnv` destructuring. Do not add it speculatively.

**`knip.json`** — *unchanged.* `server/share-meta.ts` is reached from `worker/index.ts`, which
is already an entry; `src/app/share.ts` is reached from `App.tsx` and from `share-meta.ts`.

## Algorithm

### Encoding (pure, `encodeShare`)

```
params = []
push "o" = origin.id when PRESET_ORIGINS has that id, else `${lat.toFixed(5)},${lng.toFixed(5)}`
push "b" = String(budgetMinutes)
push "f" = String(floorMinutes)      only when floorMinutes > dialMinimum(roundTrip)
push "rt" = roundTrip ? "1" : "0"
push "e" = "1"                        only when edgeOnly
push "t" = terrain                    only when terrain !== "any"
push "v" = VIBES.filter(v => vibes.includes(v.id)).map(v => v.id).join(".")   only when non-empty
push "p" = placeId
return params joined with "&", each value URL-encoded
```

Vibes are written in `VIBES` order, not in toggle order, so the same selection always produces
the same link and therefore the same edge cache key. This is the only normalisation the
encoder does.

### Decoding (pure, `decodeShare`)

```
if search.length > SHARE_QUERY_MAX -> every field null
q = new URLSearchParams(search)
o  -> if it contains "," parse two finite numbers -> {kind:"pin", lat, lng}
      else -> {kind:"preset", id}                   (existence is not checked here)
b,f -> Number.parseInt(value, 10); null unless an integer in
       [SHARE_BUDGET_MIN, SHARE_BUDGET_MAX]  (so `b=400` is simply absent)
rt,e -> "1" -> true, "0" -> false, anything else null
t  -> "flat"|"hilly"|"any" only, else null
v  -> split "." , keep values in the Vibe set, dedupe, reorder into VIBES order
p  -> non-empty string, else null
unknown keys: ignored, never an error
```

### Restoring (pure, `applyShare(base, link)`)

```
if isEmptyLink(link) -> return base                       (identity, so no-query costs nothing)

origin = link.origin.kind === "preset"
           ? PRESET_ORIGINS.find(id) ?? base.origin       (unknown preset -> default origin)
           : customOrigin({lat, lng})                     (existing helper, id "custom")

roundTrip     = link.roundTrip ?? base.roundTrip
budgetMinutes = clampBudget(link.budgetMinutes ?? base.budgetMinutes, roundTrip)
floorMinutes  = clampFloor(link.floorMinutes ?? dialMinimum(roundTrip), budgetMinutes, roundTrip)

place  = link.placeId === null ? null : PLACES.find(p => p.id === link.placeId) ?? null
missing = link.placeId !== null && place === null

return {
  ...base,
  origin, budgetMinutes, floorMinutes, roundTrip,
  edgeOnly: link.edgeOnly ?? base.edgeOnly,
  terrain:  link.terrain  ?? base.terrain,
  vibes:    link.vibes.length > 0 ? link.vibes : base.vibes,
  pickedId: place?.id ?? null,
  framingKey: base.framingKey + 1,
  shared: {
    missingPlaceId: missing ? link.placeId : null,
    clampedFromMinutes:
      link.budgetMinutes !== null && link.budgetMinutes !== budgetMinutes
        ? link.budgetMinutes : null,
    linkQuery: canonicalQuery(link),
  },
}
```

`clampBudget` and `clampFloor` stay module-private in `session.ts`, which is why `applyShare`
lives here and not in `share.ts`. The only other thing that wanted them — `shareMeta` — no
longer needs them, because `decodeShare` range-checks `b` and `f` at the boundary.

Nothing else in the app needs to change to make the shared walk appear: `pickedId` set at
initialisation flows through the existing `picked` lookup, the existing picked-route retry
effect fetches the line, `withinBudget` already computes whether it still fits, and
`framingKey` already frames the map. A shared preset origin is a snapshot hit and lands
instantly; a shared dropped pin has no snapshot and pays the full engine warm-up, showing the
existing `TimeDial` warm-up progress and the `ReachReadout` skeleton while it does.

### Sharing (`ResultCard`)

```
onShare():
  playPress()
  url = props.shareUrl
  text = describeShare({ placeName: place.name, originName: props.originName,
                         walkMinutes: props.budgetMinutes, roundTrip: props.roundTrip })
  if (navigator.share) {
    try { await navigator.share({ title: place.name, text, url })
          setShareState({kind:"shared"}); return }
    catch (error) { if (error is AbortError) { setShareState({kind:"idle"}); return } }
    // any other share failure falls through to the clipboard
  }
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(url); setShareState({kind:"copied"}); return }
    catch { /* fall through */ }
  }
  setShareState({kind:"manual"})
```

The confirmation says only what happened. `shared` → the note stays empty, because the share
sheet was the confirmation and "Shared!" would be a claim about a sheet the app cannot see the
result of. `copied` → *"Link copied."* `manual` → *"Could not copy. Here is the link:"* plus
the read-only input, which the effect described above focuses and selects. A `useEffect` clears
`copied` back to `idle` after 4 s; `manual` is never cleared automatically, because the user
still needs the text.

### The Worker's `/s` (`shareResponse`)

```
if request.method not in {GET, HEAD}         -> null
if !("HTMLRewriter" in globalThis)           -> null

meta = shareMeta(url.search, new URL(request.url).origin); if null -> null

key = shareCacheKey(url.search)              // null for a pin origin: render, never store
cache = key === null ? null : await shareCache()
cacheKey = cache && key ? new Request(new URL(key, request.url)) : null
hit = cache && cacheKey ? await cache.match(cacheKey) : null
if hit -> new Response(await hit.arrayBuffer(), {…, "cache-control": "public, max-age=300"})

asset = await indexDocument(request, env)    // "/" and method GET, always
if asset.status !== 200                      -> null

html = new HTMLRewriter()
  .on("title",                              { element: e => e.setInnerContent(meta.title) })
  .on('meta[property="og:title"]',          { element: e => e.setAttribute("content", meta.title) })
  .on('meta[property="og:description"]',    { element: e => e.setAttribute("content", meta.description) })
  .on('meta[property="og:url"]',            { element: e => e.setAttribute("content", meta.url) })
  .on('meta[property="og:image"]',          { element: e => e.setAttribute("content", meta.image) })
  .on('meta[name="description"]',           { element: e => e.setAttribute("content", meta.description) })
  .on('link[rel="canonical"]',              { element: e => e.setAttribute("href", meta.url) })
  .transform(asset)

body = await html.arrayBuffer()
if (cache && cacheKey && request.method === "GET") {
  ctx.waitUntil(cache.put(cacheKey, new Response(body, {headers: {…, "cache-control": `public, max-age=${SHARE_HTML_CACHE_SECONDS}`}})))
}
return new Response(body, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300" } })
```

Three details that are the whole point of writing this out:

- **The response is buffered, not streamed.** `arrayBuffer()` is what makes one body servable
  and storable at once, and that costs the streaming property `HTMLRewriter` is famous for. It
  is the right trade for a 2 KB head, but it is a trade and the prose should not pretend
  otherwise.
- **HEAD never fills the cache.** `shareCacheKey` is derived from the query, not the method, so
  a HEAD that stored its (empty) body would serve an empty document to the next GET of the same
  spin from the edge. Crawlers do issue HEAD. `indexDocument` forces GET upstream so the
  rewriter has something to work on, and the `put` is gated on the *client's* method being GET
  rather than the method being in the key — one entry per spin, filled only by a request that
  wanted a body.
- **`ctx.waitUntil` is guarded, not optional-chained.** `WorkerContext.waitUntil(promise:
  Promise<unknown>)` in `worker/index.ts` does not accept `undefined`, so `ctx.waitUntil(cache?.put(…))`
  does not typecheck. The `if` above is the form that does.

`twitter:title` and `twitter:description` are not in `index.html` today and are not added —
X reads `og:*` when the twitter equivalents are absent, and two more tags to keep in sync is a
cost with no gain. `meta[name="twitter:card"]` is left exactly as it is.

### `shareMeta`

```
link = decodeShare(search)
place = PLACES.find(p => p.id === link.placeId); if none -> null
originName = link.origin?.kind === "preset"
               ? PRESET_ORIGINS.find(id)?.name ?? null
               : link.origin?.kind === "pin" ? "a dropped pin" : null
if originName === null -> null
if link.budgetMinutes === null -> null            // no clamping here; the decoder range-checked it
walk = formatMinutes(link.budgetMinutes * 60)     // via describeShare

title       = `${place.name} — inside ${walk} on foot from ${originName} | Walk Roulette`
description = describeShare({ placeName: place.name, originName,
                              walkMinutes: link.budgetMinutes, roundTrip: link.roundTrip ?? true })
url   = `${siteOrigin}${SHARE_PATH}?${canonicalQuery(link)}`
image = `${siteOrigin}/og.png`
```

**The headline number is the budget, not the measured walk.** The card's "Out and back" stat is
`formatMinutes(route.durationSeconds * 2)` — what Valhalla says the walk costs — and the link
carries `b`, the dial. Those two numbers disagree by design: 34 minutes of budget buys a 26
minute walk. The preview therefore never says "a 34 min walk"; it says *"inside 34 min"*, which
is true of the budget and cannot be read as a claim about the route. `describeShare` is worded
the same way so the sheet text and the unfurl agree with each other, and neither pretends to
agree with a stat it has not seen.

`url` uses `canonicalQuery`, not `encodeShare`. `encodeShare` takes a `ShareInput` with a real
`Origin`; a decoded pin is `{kind:"pin",lat,lng}` and has no `Origin` to give it, so the two do
not compose. Because `url` is the whole canonical query, `shareCacheKey` must be too — see the
data section.

Coordinates never reach the meta *text*. A shared dropped pin unfurls as *"from a dropped
pin"*, while `og:url` and the canonical link necessarily still carry them: they are the link
the sender chose to send.

### The availability contract (for siblings)

`shareable-spins` needs one function to render its "you cannot do this right now" line, and
will not invent a private copy:

```ts
/** Owned by opening-hours; weather-filters composes into the same signature. */
export function unavailableReason(place: Place, at: Date): string | null;
```

- Returns a short sentence fragment fit for a `.result-warning` line
  (*"Closed right now"*, *"Market runs Saturdays"*, *"Heavy rain until 4 pm"*), or `null`.
- Must be pure and synchronous against already-fetched data; a shared card must render on the
  first paint, not after a fetch.
- Those specs must keep their filtering **separate** from this reason. A place excluded from
  the candidate pool by hours or weather must still be nameable and describable, or a shared
  link to a closed museum degrades into "that place is gone", which is a lie.
- `places-expansion` owes one guarantee: **place ids are permanent and never reused.** A
  deleted id may 404 into the missing-place notice; an id reassigned to a different place turns
  every old link into a silent substitution.
- `daylight-budget` owes: any clamp it applies to a restored budget must surface the same way
  `clampedFromMinutes` does, as a notice, not a silent adjustment.
- `geolocate` owes nothing, but note that a geolocated origin (`id: "me"`) encodes as
  coordinates exactly like a dropped pin, and the share note must say so.

## Failure and degradation

| Situation | What the user sees |
| --- | --- |
| `p` names a place this build no longer has | No card. `.notice.is-warn` in the panel: *"The place this link points to is no longer on the map. Everything else about the walk is set up — spin for somewhere new."* Origin, dial and filters are still restored. The sr-only line says the same. |
| `o` names a preset that no longer exists | Falls back to `DEFAULT_ORIGIN`, everything else restored, and the origin chip plainly reads the default's name. No notice — the app is not able to tell the difference between a removed preset and a typo, and inventing a message for both is worse than showing what it did. |
| The place exists but is outside the recipient's reach at their dial | The card is shown with the existing *"Outside your current time budget"* `.result-warning`. Nothing about that path changes. |
| The place is closed / rained out (`opening-hours`, `weather-filters`) | The card is shown with `unavailableReason` as a `.result-warning` line. It is never removed from the card. |
| `b` is on the dial's scale but off its grid or below its floor for this `rt` | Clamped by `clampBudget`, and a `.notice`: *"This link asked for N minutes; the closest the dial goes is M."* |
| `b` is outside `[5, 100]` entirely (hand-edited, or a future ladder change) | `decodeShare` drops the field. The budget is the default and there is no notice — the link did not name a budget this build has a scale for, and a message about a number the app never held would be inventing detail. |
| Query is garbage, empty, or over `SHARE_QUERY_MAX` | `applyShare` returns `base` by identity: an ordinary cold start with no notice. This is the one deliberate silent degradation in the spec, and it is deliberate because 512 characters is roughly six times a real link — the length path is reachable only by hand-mangling a URL, and a person who does that does not need to be told. |
| Shared dropped-pin origin, engine cold | The existing warm-up path: dial progress, `ReachReadout` skeleton, card skeleton stats. Slower than a preset, and the README says so. |
| Engine not configured / unreachable on a shared link | The existing `.notice.is-setup` / `.notice.is-warn` from `status`. The result card still names the shared place; only the stats are dashes and the route is missing, exactly as an ordinary failed route already renders. |
| `navigator.share` absent (desktop Chrome/Firefox) | Straight to the clipboard. Note: *"Link copied."* |
| `navigator.share` present, user cancels the sheet | `AbortError` → back to `idle`, empty note. Nothing is claimed. |
| `navigator.share` present and throws something else | Falls through to the clipboard, then to manual. |
| Clipboard blocked (insecure context, permission denied, Safari without a user gesture) | Note: *"Could not copy. Here is the link:"* plus a focused, selected read-only input. The link is never lost. |
| Worker has no `HTMLRewriter`, or the asset fetch of `/` fails | The app's own document, unmodified. The link still works for a human; the unfurl is the site's generic card. No error page — a share link is never allowed to be a 500. |
| `run_worker_first` drops `/s` | `/s` is a **hard 404**, not a generic preview: `not_found_handling` defaults to `"none"` and there is no `/s` asset. This is the most expensive way to get this wrong and it is invisible to every unit test, because `handleWorkerRequest` never runs. Only the deploy-time curl in acceptance criterion 14 catches it, which is why LAUNCH.md carries it. |
| `run_worker_first` written as `/s*` | `/site.webmanifest` is routed through the Worker, falls past the `/s` branch, and is served by `env.ASSETS.fetch` — so it still works, silently, until someone adds a second Worker path. Also caught only by criterion 14. |
| Crawler requests `/s` with an unknown place | `shareMeta` returns null, the app's document is served, generic card. |
| Crawler requests `/s` with `HEAD` | Rewritten headers, no cache entry. The next `GET` for that spin renders fresh rather than being served the HEAD's empty body. |

## Cost

**Bundle — estimated, and the estimate is not the acceptance test.** Nobody has built this, so
the numbers below are informed guesses, not measurements: `share.ts` ~700 B gzipped,
`applyShare` plus the `shared` field ~250 B, the `ResultCard` button/note/handler ~400 B,
`ShareNetworkIcon` ~250 B (the icon does exist in the installed `@phosphor-icons/react`; its
weight is the guess), CSS ~180 B. **Call it ≈ 1.8 KB, roughly 2.8% of the 64 KB budget.** What
is actually binding is criterion 18: record the gzipped app-JS figure from `npm run build`
before the change and after, and if the delta exceeds **3 KB**, stop and find out why rather
than quietly spending the budget. `server/share-meta.ts` and the Worker changes add nothing to
the client.

**Requests per session.** Zero. Opening a share link is the same request the site already
makes, and sharing is entirely local — no endpoint is called, and `navigator.share` /
`navigator.clipboard` are browser APIs.

**Build time.** Zero. No new build script, no new asset, no snapshot regeneration.
`SNAPSHOT_VERSION` is untouched.

**Engine load.** Zero additional. A shared preset origin is a snapshot hit exactly like
choosing that preset by hand; a shared dropped pin costs what dropping that pin costs. `/s`
never reaches `handleApiRequest`.

**Worker.** One `ASSETS.fetch` plus one `HTMLRewriter` pass over a ~2 KB head per uncached `/s`
hit. That should sit well inside the Free plan's [10 ms CPU per
request](https://developers.cloudflare.com/workers/platform/limits/) — *should*, because it has
not been measured; `wrangler tail` reports CPU time and the first deploy is when to look. Each
cache entry is one small HTML document. Pin shares are never cached and always render.

**New hosting requirement.** None. No new binding, no KV, no R2, no plan change. One
`wrangler.toml` line.

## Tests

### `src/app/share.test.ts` (new; matches `"src/**/*.test.ts"`)

Fixtures: `CARYTOWN = PRESET_ORIGINS.find(o => o.id === "carytown")!`,
`PIN = customOrigin({ lat: 37.538821234, lng: -77.433561234 })`,
`SHIPLOCK = "shiplock"`.

1. **"a preset spin round-trips through the URL"** — `decodeShare(encodeShare(input))` returns
   every field of `input` for a full-house input (preset origin, budget 34, floor 20,
   round trip, edge-only, `flat`, `["river","park"]`, `shiplock`).
2. **"vibes are written in VIBES order whatever order they were toggled"** —
   `encodeShare({… vibes: ["park","river"]})` and `["river","park"]` produce byte-identical
   strings containing `v=river.park`.
3. **"the walk's four defining fields are always written"** — an input at every default still
   emits `o`, `b`, `rt`, `p` and emits none of `f`, `e`, `t`, `v`.
4. **"unknown keys are ignored"** — `decodeShare("?o=home&b=30&rt=1&p=capitol&hours=1&x=y")`
   equals the same decode without the extra keys.
5. **"a dropped pin encodes at five decimals"** — `encodeShare` with `PIN` contains
   `o=37.53882%2C-77.43356` and decodes back to `{kind:"pin", lat:37.53882, lng:-77.43356}`.
6. **"garbage decodes to all-null rather than throwing"** — `decodeShare("?o=&b=abc&rt=maybe&v=..&t=lava&p=")`
   returns every field null / `vibes: []`, and `isEmptyLink` is true.
7. **"an over-long query is refused whole"** — a query of `SHARE_QUERY_MAX + 1` characters
   decodes to the empty link.
7b. **"the duplicated dial bounds still match the dial"** — `SHARE_BUDGET_MIN === MIN_MINUTES`
   and `SHARE_BUDGET_MAX === MAX_MINUTES` imported from `../lib/isochrone`. This is the test
   that licenses the duplication.
7c. **"canonicalQuery is the encoder's own output"** —
   `canonicalQuery(decodeShare(encodeShare(input))) === encodeShare(input)` for the full-house
   input, for a defaults-only input, and for a pin input.
8. **"an empty link restores nothing"** — `applyShare(initialSession, decodeShare(""))`
   returns `initialSession` by `===`.
9. **"a restored link clamps an off-grid budget and says so"** —
   `applyShare(initialSession, decodeShare("?o=home&b=7&rt=1&p=capitol"))` yields
   `budgetMinutes === 10` (the round-trip dial floor) and `shared.clampedFromMinutes === 7`.
9b. **"a budget off the dial's scale is not a clamp, it is an absent field"** — `?b=400`
   yields `initialSession.budgetMinutes` and `shared.clampedFromMinutes === null`.
10. **"a floor above the budget is pulled below it"** — `?b=20&f=90&rt=1` yields
    `floorMinutes < budgetMinutes`.
11. **"an unknown place id leaves no pick and is named in the arrival"** —
    `?o=home&b=30&rt=1&p=ruby-scoops` yields `pickedId === null` and
    `shared.missingPlaceId === "ruby-scoops"`.
12. **"an unknown preset falls back to the default origin"** — `?o=petersburg&b=30&rt=1&p=capitol`
    yields `origin.id === DEFAULT_ORIGIN.id` and a live pick.
13. **"restoring is atomic"** — a link with `rt=0` and `b=7` does not end at the round-trip
    minimum: `applyShare` clamps against the *link's* `roundTrip`, not the base's.

### `server/share-meta.test.ts` (new; matches `"server/*.test.ts"`)

14. **"the title names the place, the budget and the origin"** —
    `shareMeta("?o=carytown&b=34&rt=1&p=shiplock", "https://walk.example")` →
    title contains `Great Shiplock Park`, `Carytown`, and the substring `inside 34 min` (the
    minutes via `formatMinutes`, not a hand-built string). The wording is asserted, not just
    the number: `a 34 min walk` would be a claim about a route this function has never seen.
15. **"a one-way walk is described differently from a round trip"** — the `rt=0` description
    does not contain "out and back"; the `rt=1` one does.
16. **"a dropped pin never leaks coordinates into the preview"** —
    `shareMeta("?o=37.53882,-77.43356&b=30&rt=1&p=capitol", origin)` produces a title and
    description containing neither `37.5` nor `-77.4`, and containing "a dropped pin".
17. **"an apostrophe in a place name survives verbatim"** — `p=ancarrows` →
    description contains `Ancarrow's Landing` with no `&#39;`. Escaping is `HTMLRewriter`'s
    job and doing it twice is a visible bug.
18. **"an unknown place has no preview"** — `shareMeta("?p=ruby-scoops&o=home&b=30&rt=1", …)`
    returns `null`.
19. **"og:url and og:image are absolute"** — both start with the passed `siteOrigin`.
20. **"the cache key is canonical"** — the same walk written with the vibes in either order,
    with the keys in any order, and with an extra unknown key, all yield the identical
    `shareCacheKey`.
21. **"two walks that differ only in their filters do not share a key"** — the same origin,
    place, minutes and `rt` with `t=flat` versus `t=hilly`, and with `v=park` versus no `v`,
    yield different `shareCacheKey`s. This is the test that stops one sender's crawler seeing
    another sender's `og:url`.
21b. **"a dropped-pin share is never cached"** — `shareCacheKey("?o=37.53882,-77.43356&…")` is
    `null`, while the same query with `o=carytown` is not.
22. **"an unusable query has no cache key"** — `shareCacheKey("?x=1")` is `null`.
22b. **"the pin still unfurls"** — a null cache key does not stop `shareMeta` returning a
    `ShareMeta` for the same query. Not caching and not describing are different decisions.

### `server/worker.test.ts` (extended)

Fixture: an `ASSETS` stub returning a five-line HTML head containing `<title>`, `og:title`,
`og:description`, `og:url`, `og:image` and `link[rel=canonical]`; `stubHtmlRewriter(t)`;
`stubEdgeCache(t)`; `stubFetch(t, …)` asserting the engine is never called.

The `ASSETS` stub records the URL of every request it is handed, because several of these
assert *which document was asked for*, not only what came back.

23. **"a share URL never touches the engine"** — `GET /s?o=home&b=30&rt=1&p=capitol` with a
    `stubFetch` that throws; assert 200 and `calls.length === 0`.
24. **"a share URL is not charged against the rate limiter"** — `limiter()` charged 0. Note
    honestly what this proves: the `/s` branch returns before the limiter block exists, so this
    is unconditionally true today. It is a guard against a future refactor that moves the
    branch below the limiter, not evidence about the current code.
25. **"the preview is rewritten"** — response body contains the place name in `og:title`.
26. **"a second identical share is served from the edge"** — two requests, one `ASSETS` call.
26b. **"the share cache is not the isochrone cache"** — after 26, the
    `"walk-roulette-isochrone"` map from the extended `stubEdgeCache` is empty and
    `"walk-roulette-share"` has one entry. This test is the reason `stubEdgeCache` has to key
    by name; without that change both caches are one `Map` and the assertion is meaningless.
26c. **"a HEAD does not poison the cache"** — `HEAD /s?…`, then `GET` the same query; the GET's
    body contains the rewritten `og:title` and is not empty.
27. **"a runtime without HTMLRewriter serves the app's document"** — no `stubHtmlRewriter`;
    assert status 200, the body is the unmodified fixture, **and the `ASSETS` stub was asked
    for `/` rather than `/s`**. That last clause is the one that matters: asking for `/s`
    would be a 404 in production and a 200 against a permissive stub.
28. **"an unknown place serves the app's document"** — `?p=ruby-scoops`; unmodified body, and
    again the asset request is for `/`.
29. **"a POST to /s serves the app's document"** — no rewrite, no engine call, asset request
    for `/`.
29b. **"the asset is never fetched as /index.html"** — across every path above, no recorded
    `ASSETS` URL ends in `/index.html`. Workers Assets redirects that path by default, so a
    single slip turns every share into the fallback.
30. **"every other path is handed straight to ASSETS"** — `GET /site.webmanifest` reaches
    `env.ASSETS.fetch` with its own URL, untouched. Say plainly what this does **not** prove:
    `run_worker_first` is applied by Cloudflare *before* the Worker runs, so this test passes
    identically whether `wrangler.toml` says `/s`, `/s*`, or nothing at all. The `/s*` trap is
    observable only at deploy time, by criterion 14.

## Acceptance criteria

1. `encodeShare`/`decodeShare` round-trip every `Session` field the link carries, and
   `decodeShare` never throws on any input string.
2. A share link with no query, or an unparseable one, produces exactly the current cold-start
   experience — `applyShare` returns its input by identity.
3. Opening a valid share link paints the result card on the first frame, with no reel, no
   `Spinning` label, and no second map framing.
4. The `Spin again` button reads `Spin your own` on a fresh shared arrival and reverts to
   `Spin again` after the first spin.
5. A share link naming a deleted place shows the missing-place `.notice.is-warn`, restores
   origin/budget/filters anyway, and enables Spin.
6. A share link naming a place outside the recipient's pool shows the card with a
   `.result-warning`, and the destination on the card is the one in the link.
7. The Share button plays `playPress()` on press and produces no cue on completion.
8. With `navigator.share` present, pressing Share opens the system sheet; cancelling it leaves
   the note empty and claims nothing.
9. Without `navigator.share`, pressing Share copies the URL and the note reads *"Link copied."*
   and clears itself after four seconds.
10. With the clipboard blocked, the note reads *"Could not copy. Here is the link:"* and a
    focused, selected read-only input holds the URL.
11. `.result-actions` holds three controls at rail width and reflows to two rows below 380px
    with no horizontal scrollbar on the rail.
11b. After opening a share link, the first move of the dial (or of any filter the link carries)
    leaves the address bar at `/` — not at the old query — while the clamp and missing-place
    notices, if any, stay on screen until dismissed.
12. `ResultCard` gains exactly one live region — the one-line share note, empty until Share is
    pressed — and the card element itself still has no `role`. The rail's existing live regions
    (the sr-only announcement line and the short-reel `.notice`) are unchanged in number and
    behaviour, and the announcement reads *"Shared walk: …"* on arrival.
13. `curl -H 'Accept: text/html' https://<host>/s?o=carytown&b=34&rt=1&p=shiplock | grep -E 'og:|canonical'`
    returns **200** with a place-specific `og:title` containing `inside 34 min`, a
    place-specific `og:description`, and absolute `og:url`, `og:image` and `link[rel=canonical]`.
    A 404 here means `run_worker_first` is wrong.
13b. The same URL with the query replaced by `?x=1` returns **200** carrying the generic head —
    never a 404. Repeat with `curl -I` (HEAD): 200, and criterion 15's next GET still returns a
    rewritten body.
13c. Two `/s` links differing only in `t=flat` versus `t=hilly` return different `og:url`
    values on a warm edge.
14. `curl https://<host>/site.webmanifest` still returns the manifest with
    `content-type: application/manifest+json`, and `POST /api/isochrone` still works, with
    `run_worker_first = ["/api/*", "/s"]` deployed. This is the **only** check that catches
    `/s*` or a dropped `/s`; no unit test can.
15. A second identical `/s` GET is served from the share edge cache and does not re-run the
    rewriter. A `/s` with a pin origin is never cached.
16. `npm run typecheck`, `npm run lint` (eslint + oxlint + knip) and `npm test` are clean, with
    no `unknown` at a boundary, no type assertion lacking a `SAFETY:` comment, and **no export
    in `src/app/share.ts` that nothing imports** — knip is part of `lint` and an unused export
    fails the build.
17. Nothing in `public/_headers`, `public/reach/`, `SNAPSHOT_VERSION` or the isochrone/route
    edge cache changed; `not_found_handling` is still unset in `wrangler.toml`.
18. Gzipped app JS from `npm run build` grew by **no more than 3 KB**. Record the before and
    after figures in the PR body; the ~1.8 KB in the Cost section is an estimate, this is the
    gate.

## Open questions

1. **Is the picture worth 62 build-time PNGs?** This spec ships one image for every share and
   a per-spin headline. A per-place image is ~3 MB in git, a native `@resvg/resvg-js`
   devDependency in CI, and still cannot show the minutes, origin or contours. Someone has to
   decide whether the unfurl's picture is part of the product. A concrete trigger to reach for:
   if shares become a real acquisition channel and the generic image is measurably costing
   click-through, build it; otherwise leave it.
2. **Should a dropped-pin origin be shareable at all?** Sharing a preset publishes an id.
   Sharing a pin publishes a coordinate at ~1 m precision, which for a `geolocate` or
   home-pin origin is somebody's front door. The options are: share it and say so on the
   button (this spec's assumption — the share note names it), round it to 3 decimals (~110 m,
   which produces a different reach and can drop the winner out of the pool), or refuse and
   share pin-origin spins as place-only. This is a privacy call, not a technical one.

## Corrections after implementation

Written against the code that shipped. Six things.

1. **`unavailableReason` should not exist, and this spec half-knew it.** Its own
   `## Depends on` says the contract "is satisfied by machinery that is already
   built, not by a new function" — and then the file-by-file section adds a prop
   anyway. `ResultCard` already renders one `.result-warning` per exclusion
   reason from `verdict`, so the prop printed the sentence twice: "Further than
   your budget walks." above "Outside your current time budget." Found by
   reading the screen, removed, and the card carries a comment saying where the
   guarantee actually lives.

2. **The canonical tag ships with no `href`, because Vite will not build one
   that has one.** Vite's HTML plugin treats `link[href]` as an asset reference
   and tried to open `/` as a file — `EISDIR`, build failed outright. That is a
   better failure than the alternative, but it does mean the spec's
   `<link rel="canonical" href="/" />` is not shippable. A canonical with no
   `href` is ignored by crawlers, which is exactly right for a repo that does
   not know its own domain, and `/s` gets a real absolute one from the Worker.
   `og:url` is unaffected — `meta[content]` is not an asset attribute.

3. **The link carries `c` and `k`, not `t`.** `docs/plans/README.md` §4's
   amendment, applied: the climb band replaced terrain in chunk 3 and the tier
   filter arrived in chunk 8. It carries none of `beforeDark`, `weatherAware` or
   `hideClosed`, which is the same amendment's other half.

4. **A dropped pin is published at three decimals, not five.** Open question 2
   is answered rather than left open: ~110 m instead of ~1 m, one constant
   `PIN_PRECISION`, and the same number `meet-in-the-middle` pins its own meet
   point at. The cost the spec warns about — the recipient's reach is a slightly
   different shape and the destination can fall outside it — is a state this
   feature already handles, so it degrades to a sentence rather than a
   substitution. HUMAN-REVIEW 2.9.

5. **`applyShare` takes its data as arguments.** The spec has it reach for
   `PLACES` and `PRESET_ORIGINS` directly; passing them keeps `session.ts` free
   of a data import it does not otherwise need and lets `share.test.ts` restore
   against a fixture list. It also sets `requestedBudgetMinutes`, which did not
   exist when this spec was written — chunk 7 added it, and a restored session
   that did not set it would hand the reader back a different budget the first
   time a cap lifted.

6. **`decodeShare` narrows by type predicate, not by `Set.has` plus a cast.**
   A `Set<string>.has(x)` proves nothing to the type system, so the first draft
   needed three assertions and the anti-slop plugin refused all three — rightly.
   The guards prove it once, at the boundary where the string arrives.

Two things the spec flagged as unverified, now checked:

- **Vite's dev server does serve `index.html` for `/s`.** `curl -H 'Accept:
  text/html' 'http://localhost:5173/s?…'` returns 200 with the document, so the
  two-line `req.url` rewrite the spec holds in reserve is not needed.
- **`new URL(request.url).origin` inside the Worker** is still unverified, and
  cannot be checked without a deployment. It is one of three checks in
  `LAUNCH.md` that only a deployed request can make. HUMAN-REVIEW 5.12.
