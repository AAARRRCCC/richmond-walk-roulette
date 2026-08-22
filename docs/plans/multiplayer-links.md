# The invite link

**Status:** implemented, chunk 11 (2026-08-22). See *Corrections after implementation*.
**Slug:** `multiplayer-links`

## Depends on

This is **chunk 11a** — the first half of chunk 11, landing before `meet-in-the-middle` (11b),
because it is what puts a partner in the session and the meeting half is meaningless without one.
**The two are one landing, not two shippable chunks:** this spec alone adds session fields nothing
reads, which knip fails, and which decodes a link into a session the UI does not render — an invite
that silently does nothing. Chunk 11 is strictly after `shareable-spins` (chunk 10), for exactly the
reason that spec is last: it cannot amend a link format the session does not yet have.

- **`shareable-spins`** — owns `SHARE_PATH`, `src/app/share.ts`, `applyShare`,
  `server/share-meta.ts`, the Worker's `/s` branch and `run_worker_first`. This spec is an
  **amendment** to that document, not a second encoder and not a second path. Every amendment is
  written out in *Contract amendments* below.
- **`pool-reasoning`** — owns `src/app/eligibility.ts` and the exclusion-reason contract. This
  spec does not touch it. Its sibling `meet-in-the-middle` does, and the amendment it needs is
  named there, not here.
- **`geolocate`** — owns `src/lib/bounds.ts` (`RICHMOND_BOUNDS`, `insideRichmond`). This spec
  imports `insideRichmond` to refuse a forged coordinate on the client before it becomes a
  request.
- **`meet-in-the-middle`** ("Both in reach") — the other half of this feature, and now written.
  It owns the geometry, the map, the pool rule, the result card, the readout, `src/app/meet.ts`
  and the `Session` fields `partner`, `originChosen`, `partnerWarmed` and `partnerFailure`. It owns nothing in the
  URL, nothing in the Worker and nothing about privacy copy. **This spec is the sending half only:**
  every product question about the meeting itself — fairness across the overlap, one budget or two,
  one pace or two, what the app says on an empty intersection, the smallest-budget-with-an-overlap
  answer, and the `pool-reasoning` amendment — is answered there, not here. The handoff is one
  section: *What this hands to `meet-in-the-middle`*.

**Two reconciliations, conceded here, binding on both files** (this spec was drafted before that
one was readable; where we disagreed, the better answer won and it was not always mine):

1. **The link keys are `ma`/`mb`, not `o2`.** `meet-in-the-middle`'s *Depends on* and item 9 name
   a single key `o2` beside a reused `o`. Reusing `o` is the one thing this spec refuses, for the
   reason in decision 3 — an older build reads `o` as *the reader's own origin* and would answer a
   stranger's question from a stranger's front door with no notice. Its table row "`partner` ←
   `o2`" becomes "`partner` ← `ma`"; its "`awaitingOrigin` when the link names no origin for this
   device" becomes "when `mb` is absent", which is the same sentence. That spec is amended.
2. ~~**The session shape is `meet-in-the-middle`'s, not the one this spec first proposed.**~~
   **Withdrawn — this concession was wrong, and it was wrong because both files made it at once.**
   `meet-in-the-middle`'s later text withdraws `Partner`, `awaitingOrigin` and `clearPartner` and
   adopts *this* spec's vocabulary; this item adopted that spec's. Two documents each saying "the
   other one wins" leave an implementer with no answer, so **README §2.9a decides it**, and it
   decides in this spec's favour: `Session.partner: Origin | null` built by `partnerOrigin`,
   `Session.originChosen: boolean`, and the actions `leaveMeet` / `dismissMeet`. There is no
   `Partner` type and no `coarse` field — whether the partner arrived as a pin is *derived*
   (`partner.id === "partner"`, since a preset resolves to its own `PRESET_ORIGINS` entry).

   **This document is therefore stale wherever it still writes the withdrawn names, and the fix is
   mechanical:** `awaitingOrigin` becomes `!originChosen` **with the sense inverted** — in the
   `applyShare` pseudocode, the *What this hands to* table, the mint gate, the mirrored-input
   expression, tests 12–17 and 35–36, and criteria 5, 6 and 13; `clearPartner` becomes `leaveMeet`;
   `Session.partner: Partner | null` becomes `Origin | null`; every `state.partner.origin` becomes
   `state.partner`; and `partner.coarse === true` in test 14 becomes
   `partner.id === "partner"`, with 14b's preset case unchanged. Nothing about the link, the keys,
   the privacy copy or the Worker moves. `Session.meet: MeetArrival | null` stays this spec's, with
   all four of its fields — `meet-in-the-middle`'s contract table omits `selfOutOfBounds` and is
   amended to render its line.

   Two consequences worth keeping in view. The id trap survives the rename: when `ma` and `mb` name
   the same preset, `state.partner` and `state.origin` are the **same object**, so nothing may
   distinguish the sides by `origin.id`. And `originChosen: false` is exactly the old
   `awaitingOrigin: true` — the state in which nothing is drawn, nothing is warmed, Spin is not
   pressable, and **no link is mintable**.

**`docs/plans/README.md` is updated and is the arbitration**; it is no longer this spec's job to ask
for edits there. What it decided, beyond item 2: §2.7 carries a row for the amended `/s` behaviour;
§2.9 carries the whole second-origin contract; §4 is eleven chunks with chunk 11 as one landing in
two ordered halves; *Honest sizes* records this spec as **S–M** and `meet-in-the-middle` as **L**;
and §5's total moves from ≈ +24.5 KB to **≈ +28 KB**, with the release narrative from "around 95 KB"
to **just under 100 KB**. Also decided there, and **against `meet-in-the-middle`**: its amendment 8
is refused, so the sender does *not* adopt its own coarsened coordinate at mint and **decision 4 of
this document stands exactly as written**.

## What and why

Two people, two doors, one question: *where can we both walk to in thirty minutes?* The geometry
half of that is cheap — the app already has contours, point-in-polygon with holes and a proxy that
fans out ladders per location. The expensive half is the one nobody in the prior art has solved
honestly: **getting the second person into the session at all.**

Every consumer product in this space does it the same way. Midpointr's own copy is "Generate a
shareable link that allows everyone to input their location and preferences," with "No sign-up
required" — and no statement anywhere on the page about where those locations are stored, for how
long, or under what retention. That is a server-held room shipped without a privacy story. This
app's entire argument is that it will not tell you a comfortable thing it cannot measure; a
feature that quietly parks two people's coordinates on a disk it does not otherwise own would be
the same failure as a circle drawn around your door.

So this spec is the sending half. One person presses a button and gets a link. The other person
opens it, sees whose start they are being asked to meet and how precisely it was shared, sets
their own start on their own device, and gets an answer. If they want to send that answer back,
that is a second press and a second link. There is no room, no socket, no account, no server that
ever holds both coordinates at once, and no request either device makes that it would not have
made anyway.

What it does not do: it is not live. Two people do not watch one reel resolve together, and the
reasons are in *The decision*. It does not expire, because it cannot, and the UI says so in those
words rather than implying a TTL the design cannot enforce. It does not carry a name, a message
or any free text. It does not generalise to three people, and *The decision* says why that is a
product choice rather than a limitation.

## The decision

### 1. Stateless. Everything in the link; no room, no binding, no server-held state.

There is no KV namespace, no Durable Object and no D1 in `wrangler.toml` today — the Worker holds
exactly two `[vars]`, an `ASSETS` binding and the `API_RATE_LIMIT` unsafe binding, and every piece
of state in the product lives in a `useReducer` or an LRU in the tab. `shareable-spins` states
plainly under **Cost → New hosting requirement: None.** A room breaks four things at once:

- it adds a binding that **does not exist in the Vite dev path**. `server/vite-plugin.ts` mounts
  `handleApiRequest` as Node middleware with a hand-built `ProxyEnv`; there is no workerd in dev.
  A room means either a `RoomStore` interface with a `Map` implementation in dev (a second
  implementation of the thing the repo's one-handler-two-mounts rule exists to prevent) or
  adopting `@cloudflare/vite-plugin`, which replaces this repo's dev architecture wholesale.
- it ends `/s`'s zero-cost property. `/s` never reaches `handleApiRequest` and is charged **0**
  against the limiter (README §2.7). A room lands in that table with an owner, a cache rule and a
  charge, and it becomes free storage for anyone who wants it.
- it buys revocation for a disclosure that is a **single stale coordinate**, not a feed. Find My
  and Strava Beacon need revocation because they leak a moving position continuously; an invite
  leaks one point at one instant, and rounding it to ~110 m and dating it makes a stale copy close
  to worthless.
- it puts two people's starting points in one record on a disk this project does not otherwise
  own, which is precisely the thing the feature is supposed to avoid.

And capacity does not argue the other way. A full meet link is ~120–160 characters —
`https://host/s?m=1&ma=37.541,-77.436&b=30&rt=1&v=food.park&d=20690` — and `SHARE_QUERY_MAX = 512`
caps it well inside anything a browser or a message app will carry. That constant is the only
figure this decision rests on and it is **not raised** by this spec. (An earlier draft cited
address-bar and message-length limits for four named products; none of them was load-bearing and
none was checked, so they are gone rather than defended.)

**Named fallback, if a future reviewer decides unrevocable links are unacceptable:** a
SQLite-backed Durable Object (KV is disqualified outright — [1,000 writes/day on the free
plan](https://developers.cloudflare.com/kv/platform/limits/) and a [60-second minimum
`expirationTtl`](https://developers.cloudflare.com/kv/api/write-key-value-pairs/), and one room is
at minimum three writes; note the 30-second minimum on the limits page is `cacheTtl`, a different
knob, and the two are easy to conflate), a 128-bit
`crypto.getRandomValues` room id in the path, `storage.setAlarm` for a hard two-hour self-delete,
and a `RoomStore` interface with a `Map` implementation for dev. That is a different spec. It is
named so nobody has to rediscover it.

### 2. Async. And the "we both saw the same answer" property comes from the link, not from a seed.

**The cost argument is the one that decides it.** Live means presence, a socket or a poll,
reconnection, a server that holds both sides, both ladders warm at the same instant, and a shared
animation — for a reel that lasts about three seconds. Every one of those costs is paid in the
architecture decision 1 already refuses: there is no binding in the dev path and no server-held
state anywhere in this product.

*Supporting, and weaker than the earlier draft claimed:* mobile Safari is a bad host for a socket a
phone carries in a pocket. Since iOS 15 Safari closes the connection when the user switches
apps ([Apple Developer Forums thread
696310](https://developer.apple.com/forums/thread/696310)), and there is a filed WebKit regression
in which no `close` event is emitted at all when the network drops ([WebKit bug
247943](https://bugs.webkit.org/show_bug.cgi?id=247943), reported against Safari 15.6.1–16.6, so
possibly fixed in the versions that matter by the time anyone builds this). Neither source is a
statement that backgrounding *silently* kills the socket on current iOS; that stronger claim was
asserted in the first draft with no citation and is withdrawn. Treat this as a reason to distrust
the scenario, not as the proof. The proof is the cost.

It is also unnecessary, because `shareable-spins` already fixed the rule that gives it away for
free: **opening a link restores a pick and never replays the reel.** So B spins, presses *Send
this back*, and A opens a link carrying `p` — A sees B's result card, framed, with the route
drawn, on the first paint. One shared outcome, one message later, in whatever thread the two
people were already using. The app never becomes a message bus.

**Rejected: a seed key making the draw deterministic.** (It would have to be a *new* letter —
`k` is taken by `places-expansion`'s tier filter, which is one more reason not to.) The draw is one `Math.random()` away
from reproducible — `randomIndex` has exactly one call site — so this was tempting and it is still
wrong. A seed only reproduces a winner if both devices derive the *same pool*, and by construction
they do not: the two devices measure the shared origin from points up to ~70 m apart (decision 4),
one may be on a snapshot while the other is on live engine contours, and a graph rebuild between
the two opens changes the contours under both. A seed that usually agrees and sometimes silently
does not is worse than a link that states the answer outright. `p` is the mechanism; determinism
is not attempted, and `useSpin.ts` and `reel.ts` are untouched by this spec.

### 3. Meet links never reuse the `o` key, and that is a correctness decision, not a style one.

`shareable-spins`' forward-compatibility rule is that unknown keys are ignored and absent keys
fall back to `initialSession`, which is why it needs no version byte and no migration. A meet key
that *changed the meaning of an existing key* would break that rule silently and dangerously: an
older build (or a stale cached bundle) opening `?m=1&o=37.541,-77.436` would ignore `m`, read `o`
as **the reader's own origin**, and answer a stranger's question from a stranger's front door with
no notice at all. That is the exact failure the app exists to argue against.

So: **`m=1` links carry no `o` at all.** The two origins live under two new keys, `ma` and `mb`,
which an older build ignores entirely, falling back to a plain cold start. Absent keys → defaults
is the documented behaviour, and here it is also the right behaviour.

The interpretation rule is one line and it is symmetric:

> **`ma` is the sender's start. `mb` is the other person's start, echoed from the link the sender
> was themselves opening. On open: `ma` becomes the *partner*, `mb` becomes *your own* start.**

Three link shapes, and only three:

| Shape | Keys | Meaning |
| --- | --- | --- |
| solo share | `o` … `p`, no `m` | today's `shareable-spins` link, unchanged in every respect |
| **invite** | `m=1`, `ma`, budget/filters, no `mb`, no `p` | "here is where I'm starting from — where are you?" |
| **answer** | `m=1`, `ma`, `mb`, budget/filters, `p` | "here is where we both can get to, and where the spin landed" |

**`mb` is never a guess.** It is only ever a value copied verbatim out of the link the sender was
reading. An invite — the first link in any chain — cannot carry `mb`, and the encoder refuses to
write one for a `ShareInput` that did not come from a decoded link. This is the mechanical form of
README §4's rule that the recipient's here-and-now does not belong in the sender's link: nothing
about the reader ever enters a link except the reader's own act of sending one back.

### 4. Meet links round a pin to three decimals. Solo links keep five.

`COORD_PRECISION = 5` is ~1.11 m. That is a doorstep. It is the right precision for a solo share,
where the coordinate *is the walk's premise* and rounding it changes the sender's own answer. It
is the wrong precision for a meet link, where the coordinate is **a person's starting point** and
the thing being computed is a blunt overlap region.

So `MEET_PIN_PRECISION = 3` (~111 m in latitude, ~88 m in longitude at Richmond — a city block).
This number is **measured, not chosen**: two decimals was tested against a live engine and can flip
an entire sixteen-place shared pool. Open question 2 carries the table and the method.
Both `ma` and `mb` are written at three decimals whenever `m=1`, and a preset origin still shares
as an **id and leaks nothing at all** — which the invite UI is required to say, because it is both
the private answer and the cheap one (a preset has a baked snapshot; a pin pays a full 96-contour
warm-up).

Three consequences, all stated rather than hidden:

- **The rounding happens in the encoder, before the value can reach `pointKey`.** `pointKey`
  rounds to 5 decimals and is the identity behind the contour cache, the route cache *and* the
  snapshot filenames. A coarse coordinate re-expanded to full precision anywhere downstream would
  make the app quietly warm a second ladder ~70 m from the one it thinks it is using.
  `toFixed(3)` is idempotent, so `canonicalQuery(decodeShare(encodeShare(x))) === encodeShare(x)`
  survives the rounding — that identity is `shareable-spins`' test 7c and it must still pass.
- **The two devices measure the shared start from points up to ~70 m apart** (worst-case diagonal
  of a 3-decimal cell), which is larger than the ~25 m grid Valhalla cuts contours on. Places
  within about a minute of the overlap boundary can therefore be in one person's pool and not the
  other's. That is why the answer link carries `p`: the outcome never depends on two pools
  agreeing. `meet-in-the-middle` owns saying this on screen where it matters.
- **When A opens B's answer, A's own start comes back at three decimals** and A pays one cold
  ladder for it. That is a real cost and it is also, on reflection, the more honest state: after
  the answer link both people are looking at the same two coarse premises rather than at two
  slightly different pictures. It is stated in *Cost*, not hidden.

**Rejected: snapping a coarse pin to a nearby preset** to recover a warm snapshot. It substitutes
a landmark the sender did not choose, and then names it on screen. An app that refuses to draw a
circle does not get to quietly relabel somebody's start as "Carytown".

### 5. There is no expiry and no revocation. The link says so in those words.

A stateless link cannot be revoked; anyone holding the URL can read the coordinate out of it with
a text editor forever. An `x=<timestamp>` key checked client-side would be **advisory expiry**,
which is worse than none: it looks like a guarantee and is not one.

What ships instead is a **date, not a deadline**: `d`, days since the Unix epoch, written only
when a meet link actually carries a pin — that is, exactly when something private was disclosed.
An invite older than `INVITE_STALE_DAYS = 2` renders a notice saying how old it is and **still
works**, because refusing to open it would be theatre: the coordinate is in the URL either way.

The disclosure copy is fixed here and `meet-in-the-middle` renders it verbatim, above the button,
before the press:

> **Sending a pin:** "This link carries where you're starting from, rounded to about 100 metres.
> Anyone who gets the link can read it — including the app you send it through, which fetches the
> link to build its preview. It does not expire and it cannot be taken back. Treat it like a text
> message, not a secret."
>
> **Sending a preset:** "This link names Carytown, not a coordinate. Nothing about where you
> actually are goes into it."
>
> **On the recipient's side, before they set anything:** "When you set your start, it goes to this
> app's own server to measure how far you can walk — and nowhere else. It never goes into a link,
> and it never reaches the other person unless you press *Send this back*."

That third sentence is deliberately not the one the first draft had. That one read *"Your starting
point stays on this device"* — and it was false. The moment the recipient sets a start the app
`POST`s that coordinate to `/api/isochrone`, at full `COORD_PRECISION` (5 decimals, ~1.1 m), which
is exactly what it does for any origin in the app and exactly what it must do to answer the
question at all. `MEET_PIN_PRECISION` protects the *link*; it does nothing to the request. In an
app whose entire argument is that it does not tell you a comfortable thing it cannot measure,
shipping a comfortable untruth in the one sentence written to reassure people would be the worst
line in the product. What the copy above claims is precisely what decision 6 guarantees: no new
endpoint, no third party, no request the app would not have made for a solo walk, and nothing about
the recipient in any URL.

### 6. The recipient's coordinate never reaches the address bar, and no request carries it that
the app would not have made anyway.

Two rules:

- **The app never writes `mb` to `location`.** `shareable-spins` establishes that the app reads the
  URL once and then stops writing it, clearing to `/` on the first change that makes the address
  bar stop describing the screen. This spec adds one rule on top: the answer link is produced only
  by an explicit press and handed straight to `navigator.share` / the clipboard. Writing it to
  `location` would put B's coordinate in B's browser history, in every screenshot, and in every
  screen-share — for no benefit, since B already knows where B is.
- **The only place either coordinate is ever sent is `POST /api/isochrone`,** which is a request
  the app makes for any origin at all, at full precision, and which the proxy already
  bounds-checks. There is no new endpoint, no telemetry and no analytics. The recipient's
  coordinate is sent as soon as they set a start, because that is the measurement they asked for;
  the claim is not that it stays on the device but that it goes nowhere the app does not already go.

**And the honest limit of the abuse control.** "Opening a link does no work" is true of an
**invite** and only of an invite: an invite carries no `mb`, so `awaitingOrigin` is true,
`meet-in-the-middle`'s prefetch effect does not run for either side, and a forwarded invite costs
the recipient's browser and IP nothing at all until they answer it. An **answer** link names both
starts, so `awaitingOrigin` is false on the first paint and two cold ladders warm sequentially —
2 × 96 contours, plus the picked place's routes — with no user gesture beyond opening the link.
That is real and it is not gated, for two reasons and one accepted risk: an answer only ever exists
as a reply to an invite the reader themselves minted, so in the intended chain the reader asked for
this; and a link that opened to a blank screen with a *Measure this* button would be the same
ceremony the app refuses everywhere else. The accepted risk is a **forwarded** answer link, which
does make a third party's browser warm two ladders. It is one burst per open against the 240/minute
limiter, it is the same order of work as any cold pin origin, and it is stated in *Cost* rather than
being papered over by a criterion that claims otherwise.

### 7. The unfurl for an invite is a different object from a spin, and gets different words.

`shareMeta` today returns `null` when the link names no place, so an invite would unfurl as the
site's generic card. That is wrong: an invite is the one link in this app whose *whole content* is
a question, and the question is what the recipient needs to see in the message thread before they
tap. So `shareMeta` gains a meet branch with two shapes — invite (no `p`) and answer (`p`) — and
the invariant that **coordinates never reach the meta text** is preserved exactly as it is for a
dropped pin today. `og:url` necessarily still carries them; that is the link the sender chose to
send.

`shareCacheKey` still returns `null` whenever any origin in the link is a pin. Nearly every meet
link carries at least one pin, so **nearly every meet link is rendered fresh and never stored at
the edge.** That is accepted and stated in *Cost* rather than quietly fixed by relaxing the rule —
coordinates are an unbounded key space and a scraper minting entries in it is the reason the rule
exists. A meet link between two presets *is* cacheable, and those are the ones that repeat.

### 8. Two people. Not N.

The decoder change for a third origin is about five lines, and every other cost is superlinear.
N cold ladders against a per-IP limiter; N markers; N rows on a card; a list-shaped key that has
to be canonicalised and length-capped; and an empty-overlap rate that gets brutal fast — three
people across a river city share nothing at any budget the dial has. `knip` exists in this repo
specifically to fail speculative generality. Build `ma`/`mb`, singular, and if a third person is
ever wanted, write the spec then.

## Data and types

### `src/app/share.ts` (amended — `shareable-spins` owns this file)

New constants:

```ts
/**
 * Decimals a pin is written with in a MEET link. Deliberately coarser than
 * COORD_PRECISION (5, ~1.1 m): a solo share's coordinate is the walk's own
 * premise, while a meet link's coordinate is a person's front door and the
 * thing being computed is a blunt overlap. Three decimals is ~111 m of
 * latitude and ~88 m of longitude at this latitude — a city block.
 *
 * The rounding happens HERE, in the encoder, and nothing downstream ever
 * re-expands it: `pointKey` rounds to 5 decimals and is the identity behind
 * the contour cache, the route cache and the snapshot filenames, so a value
 * coarsened after that point would warm a second ladder for what the user
 * believes is one place. `toFixed` is idempotent, which is what keeps
 * `canonicalQuery(decodeShare(encodeShare(x))) === encodeShare(x)` true.
 */
export const MEET_PIN_PRECISION = 3;

/** Days since the Unix epoch, in UTC. The `d` key's whole value space. */
export function epochDay(atMs: number): number;

/** How old an invite gets before the panel says so. It still works. */
export const INVITE_STALE_DAYS = 2;
```

`ShareLink` gains three fields:

```ts
export type ShareLink = {
  /** The `m` key. True only for `m=1`; any other value is false. */
  meet: boolean;
  /**
   * The sender's start, from `ma`. Null on a solo link. NOTE: `o` and `ma` are
   * different keys on purpose — see The decision §3. A meet link never carries
   * `o`, so an older build opening one falls back to a cold start rather than
   * silently adopting a stranger's front door as the reader's own origin.
   */
  originA: SharedOrigin | null;
  /** The other person's start, from `mb`. Only ever an echo, never a guess. */
  originB: SharedOrigin | null;
  /** The `d` key: days since the epoch when the link was minted, or null. */
  mintedDay: number | null;

  /* …the existing fields, unchanged, AS CHUNK 10 LEAVES THEM AFTER ITS OWN
     amendments — note `climb`, not `terrain`: README §4 chunk 3 deletes the
     `Terrain` type across 62 rows and renames `Session.terrain` to `climb`,
     and `k` is the tier filter `places-expansion` owns… */
  origin: SharedOrigin | null;   // still `o`; null whenever `meet` is true
  budgetMinutes: number | null;
  floorMinutes: number | null;
  roundTrip: boolean | null;
  edgeOnly: boolean | null;
  climb: ClimbBand | "any" | null;   // the `c` key
  vibes: Vibe[];
  kind: PlaceKind | "any" | null;    // the `k` key
  placeId: string | null;
};
```

`ShareInput` is amended in three ways, and one of them is a breaking change to a field
`shareable-spins` declared required:

```ts
export type ShareInput = {
  /** The sender's own start. Written as `o` when `meet` is false, `ma` when true. */
  origin: Origin;
  /** True to mint a meet link. */
  meet: boolean;
  /**
   * The other person's start, written as `mb`. MUST be null unless it came
   * out of a decoded link — the encoder cannot tell, so this is enforced by
   * App building it only from `Session.partner`, and by test 9.
   */
  partner: Origin | null;
  /**
   * AMENDED from `string`. Null only for an invite, which names no
   * destination because there is not one yet. A solo link still always
   * writes `p`; that rule of shareable-spins is unchanged.
   */
  placeId: string | null;
  /** `epochDay(Date.now())` at mint time, or null. Written only for meet links with a pin. */
  mintedDay: number | null;

  /* …budgetMinutes, floorMinutes, roundTrip, edgeOnly, climb, vibes, kind:
     unchanged. `climb` and `kind`, NOT `terrain` — chunk 3 deleted that type
     before chunk 10 froze this one. …*/
};
```

Two invariants, asserted by tests rather than by types because a discriminated union here would
fork every call site in `App.tsx`:

1. `meet === false` implies `partner === null` and `placeId !== null`.
2. `placeId === null` implies `meet === true`.

New functions:

```ts
/**
 * True when the link describes a meeting rather than a walk. Exported because
 * three consumers (App's initialiser, `shareMeta`, `shareCacheKey`) each need
 * to branch on it and `link.meet` alone does not say which of the two meet
 * shapes it is.
 */
export function meetShape(link: ShareLink): "none" | "invite" | "answer";

/**
 * The sentence for an invite, used twice: `navigator.share`'s `text` and
 * `og:description`. Never contains a coordinate. `minutes` is the BUDGET the
 * link carries, never a measured route — the same discipline `describeShare`
 * already applies.
 */
export function describeInvite(args: {
  originName: string;      // "Carytown", or "a dropped pin"
  minutes: number;
  roundTrip: boolean;
}): string;

/** The sentence for an answer link. Also coordinate-free. */
export function describeMeetResult(args: {
  placeName: string;
  minutes: number;
  roundTrip: boolean;
}): string;
```

Copy, fixed here:

- `describeInvite` → *"Somewhere we can both walk to in 30 minutes, out and back. Open this and
  say where you're starting from."* (`roundTrip: false` drops ", out and back".)
- `describeMeetResult` → *"Great Shiplock Park — inside 30 min on foot from both our starts."*

### `src/app/session.ts` (amended)

`Session.partner`, `Session.partnerWarmed` and `Session.awaitingOrigin` are **`meet-in-the-middle`'s
fields**, declared in its own *Data and types* section, with `Partner` living in `src/app/meet.ts`.
This spec does not redeclare them; it fills them in inside `applyShare`, which is the only place
they can be written at the lazy initialiser. What this spec adds to `session.ts` is one type, one
field and one action, all of them about *the link*, not about the meeting:

```ts
/**
 * A partner start that arrived as a coordinate rather than as a preset id.
 * Deliberately a plain `Origin` so every existing per-origin path (the contour
 * cache, `cachedReach`, `prefetchRoutes`, `snapshotName`) takes it unchanged.
 *
 * ONLY used for pins. A preset `ma` resolves through `resolveShared` to the
 * PRESET_ORIGINS entry and keeps its own id and name — "Carytown", not "Their
 * start" — which is both truthful and what `meet-in-the-middle`'s chip renders.
 * A consequence, and it is a trap: when `ma` and `mb` name the same preset,
 * `Session.partner.origin` and `Session.origin` are the SAME OBJECT. Nothing may
 * distinguish the two sides by `origin.id`; the sides are `state.origin` and
 * `state.partner`, and that is the only distinction that holds.
 */
export function partnerOrigin(at: LngLat): Origin;   // { ...at, id: "partner", name: "Their start" }

/** How a meet link arrived. Null unless this session was opened from one. */
export type MeetArrival = {
  readonly kind: "invite" | "answer";
  /** From `d`. Null when the link carried no pin, so nothing was disclosed to date. */
  readonly mintedDay: number | null;
  /**
   * True when the link's partner coordinate (`ma`) was outside RICHMOND_BOUNDS.
   * The partner is NOT set in that case: an invite from another city is a
   * designed refusal, not an engine failure.
   */
  readonly partnerOutOfBounds: boolean;
  /**
   * True when the link's echo of the READER's own start (`mb`) was out of
   * bounds or unparseable, so it was dropped and `awaitingOrigin` stayed true.
   * This can only happen if the sender's app mangled the echo, since `mb` is
   * never anything but a value the reader themselves sent — which is exactly
   * why it gets a line rather than silence. The app does not fail silently,
   * and "the link came back with your own start broken; set it again" is a
   * true, short and actionable sentence. `meet-in-the-middle` renders it.
   */
  readonly selfOutOfBounds: boolean;
};

export type Session = {
  /* …unchanged… */
  meet: MeetArrival | null;       // THIS spec
  partner: Partner | null;        // meet-in-the-middle
  partnerWarmed: number;          // meet-in-the-middle
  awaitingOrigin: boolean;        // meet-in-the-middle
  shared: SharedArrival | null;   // shareable-spins, unchanged
};

export type Action =
  /* …the existing 22, plus meet-in-the-middle's `partner` / `clearPartner`… */
  | { type: "dismissMeet" };
```

Reducer rules (the first two are amendments to `meet-in-the-middle`'s reducer table, and belong
in that file too):

- `origin` sets `awaitingOrigin: false` (its rule) and leaves `partner` **and `meet`** alone.
  Choosing your own start is how you *answer* an invite, so it must not clear either.
- `clearPartner` additionally sets `meet: null`. Dropping the other person drops the link's
  provenance with them; a stale "this invite is 3 days old" line over a one-person session is noise.
- `dismissMeet` sets `meet: null` and leaves `partner` alone — same shape as `dismissShared`: it
  dismisses the *notices about the link*, not the session the link created.
- Every other case leaves `meet` untouched. Notably `spinStart`/`spinEnd`/`pickPlace` do **not**
  clear it, unlike `shared`: the meeting is still the thing on screen after a spin.

`applyShare(base, link)` is amended; the algorithm is below.

### `server/share-meta.ts` (amended)

No new exports. `shareMeta` gains the two meet branches, `shareCacheKey` gains one clause. Both
are described under *Algorithm*.

### The `/s` response

**Unchanged in shape, status, headers, caching rules and degradations.** The only differences are
the strings `shareMeta` produces and the fact that `shareCacheKey` now also returns `null` when a
pin appears under `ma` or `mb`. No new path, no second `run_worker_first` entry, no second named
cache, no new Worker branch.

## Changes, file by file

**`src/app/share.ts`** — *amended.* Add `MEET_PIN_PRECISION`, `INVITE_STALE_DAYS`, `epochDay`,
`meetShape`, `describeInvite`, `describeMeetResult`; add `meet`, `originA`, `originB`,
`mintedDay` to `ShareLink`; add `meet`, `partner`, `mintedDay` to `ShareInput` and widen
`placeId` to `string | null`. `encodeShare`, `decodeShare` and `canonicalQuery` grow the four
keys. Still no `SHARE_KEYS` array, still pure, still no `unknown` at any boundary, still
importable from the Worker. `SHARE_QUERY_MAX` is **not** raised.

**`src/app/session.ts`** — *amended.* Add `partnerOrigin`, `MeetArrival`, the `meet: MeetArrival |
null` field (`null` in `initialSession`), the `dismissMeet` action, and the `applyShare` meet
branch — which also writes `meet-in-the-middle`'s `partner`, `partnerWarmed` and `awaitingOrigin`,
declared there, not here. Two amendments to that spec's reducer table: `origin` leaves `meet`
alone, and `clearPartner` clears it. `insideRichmond` is imported from `../lib/bounds` — the
first `src/app/ → src/lib/bounds` import, and it gets a comment saying why: the bounds check has
to happen before a forged coordinate becomes an `Origin`, not after it becomes a request.

**`src/app/App.tsx`** — *amended, narrowly.* This spec owns three things here and hands the rest
to `meet-in-the-middle`:
- `shareInput` gains `meet: state.partner !== null`, `partner: state.partner?.origin ?? null`, and
  `mintedDay: state.partner !== null ? epochDay(Date.now()) : null`. Note `mintedDay` is *not*
  memo-stable across midnight; it is read only when a link is **minted**, never in a comparison —
  the comparison below uses the arrival's own `mintedDay` instead, or `d` would make the address
  bar clear itself at midnight.
- the existing URL-clearing effect is amended to be **direction-aware**, and this is the one piece
  of App wiring with a real trap in it. In a link being *minted*, `ma` is the sender's own start;
  in a link being *read*, `ma` is the partner. So comparing
  `canonicalQuery(decodeShare(encodeShare(shareInput)))` — whose `ma` is the reader's origin —
  against `state.shared.linkQuery` — whose `ma` is the sender's — is structurally guaranteed to
  differ on every single meet arrival. The effect would fire `history.replaceState(null, "", "/")`
  on the first paint, wiping the address bar while it still described the screen (the exact
  inverse of `shareable-spins` criterion 11b) and losing the partner entirely on reload.
  The fix is to compare against a **mirrored** input that re-states the link as it arrived:

  ```ts
  // Only when state.partner !== null; otherwise the chunk-10 comparison verbatim.
  const mirrored: ShareInput = {
    ...shareInput,
    meet: true,
    origin:  state.partner.origin,                        // ma, as the link carried it
    partner: state.awaitingOrigin ? null : state.origin,  // mb, the reader's own echo
    placeId: state.pickedId,
    mintedDay: state.meet?.mintedDay ?? null,             // NOT Date.now()
  };
  const live = canonicalQuery(decodeShare(encodeShare(mirrored)));
  ```

  On an answer arrival this matches `linkQuery` byte for byte on the first paint (both origins are
  already at `MEET_PIN_PRECISION`, and `toFixed(3)` is idempotent), so the URL survives. On an
  invite arrival `mb` is absent on both sides and it also matches — until the reader sets their own
  start, at which point `mb` appears, the strings diverge, and the URL clears. That is the correct
  moment: the screen now shows a walk the address bar does not describe. Everything else about the
  effect — ref-guarded, fires once, never writes the URL otherwise — is chunk 10's, unchanged.
  Nothing here writes a coordinate anywhere: `live` is a string compared in memory and discarded,
  and the only thing ever passed to `replaceState` is the literal `"/"`.
- an `Invite` / `Answer` link is built by two small expressions (`shareUrl(origin, {...})` with
  `placeId: null` and `placeId: picked.id` respectively) and passed down, **as `string | null`**.
  Both are `null` while `state.awaitingOrigin` is true (see the gate below). Which components
  render them is `meet-in-the-middle`'s business.

**`src/ui/InvitePanel.tsx`, `src/ui/ResultCard.tsx`, `src/map/MapCanvas.tsx`,
`src/ui/ReachReadout.tsx`, `src/styles/app.css`** — *owned by `meet-in-the-middle`.* This spec
supplies the strings in decision 5 and the link values; it specifies no markup and no CSS class.

**`server/share-meta.ts`** — *amended.* Two branches in `shareMeta`, one clause in
`shareCacheKey`. `SHARE_CACHE_VERSION` stays `"v1"`: the key gains keys it did not have, and a
key that did not exist cannot collide with one that did.

**`worker/index.ts`** — *unchanged.* Read that twice. The whole multiplayer half of this feature
adds **zero** lines to the Worker: `/s` already fetches `/`, rewrites seven nodes and caches by
`shareCacheKey`, and every meet-specific decision is inside the two pure modules it already
imports.

**`server/proxy.ts`** — *unchanged.* No new endpoint. `POST /api/isochrone` is already
per-location, so the partner's ladder is a second call through the existing bounds check, cost
function and edge cache. `WALKING_SPEED_KMH = 3.69` stays pinned and is **not** parameterised;
see *Open questions* 1 for the honest statement that owes.

**`server/vite-plugin.ts`** — *unchanged.* Dev parity is unchanged because nothing new is
server-side. `shareable-spins`' stated parity exception ("dev does not inject meta") is
inherited as-is and is not widened.

**`wrangler.toml`, `public/_headers`, `index.html`, `knip.json`** — *unchanged.*
`run_worker_first = ["/api/*", "/s"]` already covers every link this spec can mint.

**`README.md`** — *amended.* One paragraph under the existing "Sharing a spin" section: what an
invite link contains, that a preset shares an id and a pin shares ~110 m, and that a link cannot
be revoked.

## Algorithm

### Encoding (`encodeShare`, amended)

```
params = []
if input.meet:
  push "m"  = "1"
  push "ma" = pinOrId(input.origin,  MEET_PIN_PRECISION)
  push "mb" = pinOrId(input.partner, MEET_PIN_PRECISION)   only when partner !== null
else:
  push "o"  = pinOrId(input.origin, COORD_PRECISION)       // unchanged
push "b"  = String(budgetMinutes)
push "f"  = String(floorMinutes)   only when > dialMinimum(roundTrip)
push "rt" = roundTrip ? "1" : "0"
push "e"  = "1"                    only when edgeOnly
push "c"  = climb band             only when not "any"          // README §4 renamed t -> c
push "v"  = vibes in VIBES order   only when non-empty
push "k"  = kind                   only when not "any"          // places-expansion's tier filter
push "p"  = placeId                only when placeId !== null
push "d"  = String(mintedDay)      only when input.meet AND some written origin is a pin
                                   AND mintedDay !== null
```

**The nine solo keys keep chunk 10's exact push order** — `o, b, f, rt, e, c, v, k, p` — and this
spec inserts `m, ma, mb` before them and `d` after them. Nothing about a solo link's bytes changes;
see *`canonicalQuery`* for why that matters more than it looks.

`pinOrId(origin, precision)` is `origin.id` when `PRESET_ORIGINS` holds that id, else
`` `${lat.toFixed(precision)},${lng.toFixed(precision)}` ``. It is the existing inline logic,
lifted to a module-private helper so the two precisions cannot drift.

`d` is written only when a pin is present because that is exactly when something private was
disclosed and staleness is worth naming; a preset-only invite has nothing to go stale and gets to
keep a cacheable, date-free key.

### Decoding (`decodeShare`, amended)

```
m  -> "1" -> meet = true; anything else (including "0", "true", "") -> meet = false
ma -> parsed exactly like `o` today: a comma -> two finite numbers -> {kind:"pin"},
      else {kind:"preset", id}. Ignored entirely when meet is false.
mb -> same. Ignored when meet is false, and ignored when `ma` is absent — a link
      naming a second person and not a first is not a shape this app mints.
o  -> unchanged, but forced to null when meet is true. One link, one grammar.
d  -> Number.parseInt(...); null unless a non-negative integer below 100_000
      (~year 2243). Bounded because it reaches `Number` arithmetic and a notice.
```

Everything else is unchanged, including "unknown keys are ignored, never an error" and the
`SHARE_QUERY_MAX` refusal.

### `canonicalQuery` (amended)

Key order is fixed and total, because this string is simultaneously `og:url` and the edge cache
key, and two orderings of one invite must not become two documents:

```
m, ma, mb, o, b, f, rt, e, c, v, k, p, d
```

**`k` is in that list and its position is load-bearing.** README §4 chunk 10 decides the link
carries the walk (`o`, `b`, `f`, `rt`, `p`) and the place filters (`c`, `v`, `e`, **`k`**), and
`places-expansion` owns `k` as the tier filter. A "total" order that omitted it would make
`canonicalQuery` erase the tier from both `og:url` and `shareCacheKey`, so two links differing only
in `k` would collapse into one cached document — which `shareable-spins` test 21 forbids and this
spec's own criterion 16 promises still passes.

**The solo subset of this order must be byte-identical to chunk 10's encoder**, i.e. `o, b, f, rt,
e, c, v, k, p` with the meet keys absent. This is the reason `SHARE_CACHE_VERSION` can stay `"v1"`.
The earlier draft argued that only from "new keys cannot collide with old ones", which is true and
insufficient: this spec also imposes a *fixed total order* that chunk 10 never wrote down, and if
chunk 10's implementation happened to emit, say, `k` before `v`, every already-warm solo entry
would silently re-key at deploy. So it is pinned in two places — the order above, and test 34,
which asserts a solo link's cache key against a **literal string**. If test 34 fails when this chunk
lands, the fix is to match chunk 10's bytes here, not to bump the version.

`ma`/`mb` pins are re-rounded to `MEET_PIN_PRECISION` here, not merely copied. A hand-edited
`?m=1&ma=37.54070,-77.43600` therefore canonicalises to `ma=37.541,-77.436` — canonical is
allowed to differ from requested (`shareable-spins` already relies on that for vibe order), and
here it means a five-decimal coordinate cannot be smuggled through the canonical URL a crawler
stores.

### Restoring (`applyShare`, amended)

```
link = decodeShare(search)
if isEmptyLink(link) -> return base                     // identity, unchanged

shape = meetShape(link)
if shape === "none" -> the existing shareable-spins path, verbatim, with
                       partner: null, partnerWarmed: 0, meet: null, awaitingOrigin: false

// meet:
partnerAt = resolveShared(link.originA)                 // preset -> PRESET_ORIGINS entry (keeps
                                                        //           its own id and name)
                                                        // pin    -> partnerOrigin({lat,lng})
outOfBounds = partnerAt !== null && !insideRichmond(partnerAt)
partner     = outOfBounds || partnerAt === null
                ? null
                : { origin: partnerAt, coarse: link.originA.kind === "pin" }   // meet.ts's Partner

mine     = link.originB === null ? null : resolveShared(link.originB)
selfBad  = link.originB !== null && (mine === null || !insideRichmond(mine))
if selfBad -> mine = null      // named, not silent: `mb` is only ever an echo of something the
                              // reader sent, so a broken one means the sender's app mangled it

roundTrip     = link.roundTrip ?? base.roundTrip
budgetMinutes = clampBudget(link.budgetMinutes ?? base.budgetMinutes, roundTrip)
floorMinutes  = clampFloor(link.floorMinutes ?? dialMinimum(roundTrip), budgetMinutes, roundTrip)
place         = link.placeId === null ? null : PLACES.find(id) ?? null

return {
  ...base,
  origin: mine ?? base.origin,
  awaitingOrigin: mine === null,          // meet-in-the-middle's flag; inverse of the draft's
                                          // `originChosen`, same meaning
  partner,
  partnerWarmed: 0,
  meet: { kind: shape, mintedDay: link.mintedDay,
          partnerOutOfBounds: outOfBounds, selfOutOfBounds: selfBad },
  budgetMinutes, floorMinutes, roundTrip,
  edgeOnly: link.edgeOnly ?? base.edgeOnly,
  climb:    link.climb    ?? base.climb,
  kind:     link.kind     ?? base.kind,
  vibes:    link.vibes.length > 0 ? link.vibes : base.vibes,
  pickedId: place?.id ?? null,
  framingKey: base.framingKey + 1,
  shared: {
    missingPlaceId: link.placeId !== null && place === null ? link.placeId : null,
    clampedFromMinutes: link.budgetMinutes !== null && link.budgetMinutes !== budgetMinutes
      ? link.budgetMinutes : null,
    linkQuery: canonicalQuery(link),
  },
}
```

`applyShare` stays the lazy `useReducer` initialiser and stays pure. `shared` is still populated
for meet links, so the missing-place and clamp notices `shareable-spins` built work on an answer
link with no new code.

### Minting a link (App, on press)

```
// THE GATE. Both are null while awaitingOrigin is true — see below.
invite = state.awaitingOrigin ? null : shareUrl(siteOrigin,
           { ...shareInput, meet: true, partner: null,
             placeId: null, mintedDay: epochDay(Date.now()) })
answer = state.awaitingOrigin || picked === null ? null : shareUrl(siteOrigin,
           { ...shareInput, meet: true, partner: state.partner?.origin ?? null,
             placeId: picked.id, mintedDay: epochDay(Date.now()) })
```

**Minting is gated on `awaitingOrigin` for the same reason drawing is.** `shareInput.origin` is
`state.origin`, which is `DEFAULT_ORIGIN` — Home, downtown — for as long as `awaitingOrigin` is
true. Without the gate, a recipient who opens an invite and presses the invite button before
setting a start mints a link naming somebody else's front door as *their own* start. That is a
fabricated premise handed to a third person under the reader's name, and it is precisely the class
of lie decision 3 exists to prevent — worse, in fact, since decision 3's failure needed a stale
build and this one needs only an impatient tap. **Sharing joins drawing, warming and spinning in
the list of things that must not happen while `awaitingOrigin` is true**, in the handoff table and
in acceptance criterion 5.

then the existing `shareable-spins` share flow verbatim: `playPress()`, `navigator.share` →
clipboard → read-only input, with `text` from `describeInvite` or `describeMeetResult`. No new
sound cue, no outcome cue. `playLanding()` stays reserved for the reel; if `meet-in-the-middle`
wants a cue for "both sides ready", that is its own decision in `src/lib/sound.ts`, not this
spec's.

### `shareMeta` (amended)

```
link = decodeShare(search)
switch (meetShape(link)) {
  case "none":    …existing behaviour, unchanged, including `return null` for an unknown place…

  case "invite":
    name = nameOf(link.originA)            // preset name, or "a dropped pin"; null -> return null
    if link.budgetMinutes === null -> return null
    title       = `Somewhere we can both walk to in ${walk} | Walk Roulette`
    description = describeInvite({ originName: name, minutes: link.budgetMinutes,
                                   roundTrip: link.roundTrip ?? true })

  case "answer":
    place = PLACES.find(link.placeId); if none -> return null   // same rule as a solo link
    title       = `${place.name} — inside ${walk} on foot for both of you | Walk Roulette`
    description = describeMeetResult({ placeName: place.name,
                                       minutes: link.budgetMinutes, roundTrip: … })
}
url   = `${siteOrigin}${SHARE_PATH}?${canonicalQuery(link)}`
image = `${siteOrigin}/og.png`
```

Three things this deliberately does:

- **An invite unfurls without a place**, which is the one case `shareMeta` previously refused
  outright. An invite whose whole content is a question must show the question in the thread; a
  generic card there would mean the recipient taps blind.
- **The title never names the sender's origin.** A solo share says "from Carytown" because the
  origin is the walk's premise; an invite is about a *person*, and putting their neighbourhood in
  a message-app preview — which is rendered by a third-party crawler and cached on its servers —
  is a disclosure the sender did not ask for. The origin name appears in the `description` only
  when it is a preset; a pin origin's description says "a dropped pin", never a coordinate and
  never a neighbourhood guess.
- **`walk` is `formatMinutes(budget * 60)` via the shared describe functions**, so the preview
  says *"inside 30 min"* and never *"a 30 min walk"*. Same discipline, same reason: the Worker has
  never seen a route.

### `shareCacheKey` (amended)

```
link = decodeShare(search)
if link is unusable                                  -> null      (unchanged)
if link.origin?.kind === "pin"                       -> null      (unchanged)
if link.originA?.kind === "pin"                      -> null      (NEW)
if link.originB?.kind === "pin"                      -> null      (NEW)
return `/__share/${SHARE_CACHE_VERSION}?${canonicalQuery(link)}`
```

Same rule, same reason, extended to the keys that can now hold a coordinate: an unbounded value
space is a place a scraper mints cache entries. A preset-to-preset invite is cacheable and is
exactly the kind of link that repeats.

## What this hands to `meet-in-the-middle`

The contract, in full. Everything below is available on the first paint of a meet arrival; nothing
below requires a fetch, a promise or an effect.

| Value | Type | Meaning |
| --- | --- | --- |
| `Session.partner` | `Partner \| null` | Your type, filled in here. `origin` is a plain `Origin`, so `cachedReach`, `prefetchLadder`, `prefetchRoutes`, `pointKey` and `snapshotName` take it unchanged. **A preset partner keeps its preset identity** (`{id: "carytown", name: "Carytown"}`); only a pin partner is `partnerOrigin(...)`, i.e. `id: "partner"`, `name: "Their start"`. `coarse` is true exactly for the pin case. |
| — the id trap | — | When `ma` and `mb` name the same preset, `partner.origin` and `origin` are the **same object**. Distinguish the sides by `state.origin` vs `state.partner`, never by `origin.id`. |
| `Session.awaitingOrigin` | `boolean` | True for exactly one state — a fresh invite before the recipient has answered. **Nothing may be drawn for the local side, no ladder may be warmed, Spin must not be pressable, and no link may be minted while it is true.** The last of those four is enforced in App by this spec. |
| `Session.meet` | `MeetArrival \| null` | `kind` (`"invite"` \| `"answer"`), `mintedDay`, `partnerOutOfBounds`, `selfOutOfBounds`. |
| `INVITE_STALE_DAYS`, `epochDay` | — | For the "this invite is N days old" line. |
| the three disclosure strings | — | Decision 5, verbatim, rendered before the button. |
| `invite` / `answer` URLs | `string \| null` | Built in App; null while `awaitingOrigin`, and null for `answer` with no pick. Render the buttons where they belong; a null URL means no control. |

What `meet-in-the-middle` owes back, and what this spec assumes:

1. **Nothing at all is warmed while `awaitingOrigin` is true** — not the partner's ladder and not
   the local one. That flag is the whole of the "opening an invite costs the recipient nothing"
   property: without it the existing `[origin]` prefetch and the `warmedNow` route wave both see
   `DEFAULT_ORIGIN` and fire. `meet-in-the-middle`'s decision 8 already specifies this (the
   `[origin, partner, awaitingOrigin]` effect returns early). It is restated here because criteria
   5 and 6 below are unmeetable without it, and they are **joint criteria for the pair**.
   The corollary, stated in decision 6: an **answer** link has `awaitingOrigin: false` on the first
   paint and therefore *does* warm two ladders on open. That is accepted, not gated, and named in
   *Cost*.
2. **Sequential warm-up, yours then theirs, and `warmed` keeps its meaning.** `Session.warmed` is a
   single scalar written from the `[origin]` prefetch effect, and `missing = reach === null &&
   state.warmed >= 1` gates the on-demand fetch, so two concurrent `prefetchLadder` calls racing it
   would make App fire 96 duplicate contour requests. `meet-in-the-middle`'s decision 8 resolves it
   with one sequential effect and a separate `partnerWarmed` scalar that no existing gate reads.
   This spec's copy assumes exactly that shape; if it changes, the "working out what's inside N
   minutes of their start" wording has to change with it.
3. **A `partnerOutOfBounds` arrival is a designed refusal**, not the generic engine notice: the
   partner is `null`, nothing is fetched, and the panel says the invite came from outside
   Richmond. A `selfOutOfBounds` arrival gets its own one-line notice ("this link came back with
   your own start broken — set it again") and leaves `awaitingOrigin` true. This spec does not
   write either sentence; it guarantees both flags.
4. **The pool amendment to `pool-reasoning` is yours and is written** — `"out-of-their-reach"`,
   its `REASON_ORDER` slot after `inside-floor`, its `REASON_COPY` row, the `partnerSignature`
   discipline and the rule that a partner with no reach yet excludes nothing. Nothing about it
   belongs in the URL and nothing about it changes here.
5. **Nothing you add may write `mb` to `location`.** The answer link is minted on a press and
   handed to the share sheet. This is the mechanism behind "your start stays on this device".

## Failure and degradation

| Situation | What happens |
| --- | --- |
| An **older build** (or a stale cached bundle) opens a meet link | `m`, `ma`, `mb`, `d` are unknown keys and are ignored; there is no `o`, so the origin is `DEFAULT_ORIGIN`. A plain cold start with the sender's budget and filters. It never adopts a stranger's start as the reader's own — that is the whole reason `o` is not reused. |
| A meet link's `ma` is a pin outside `RICHMOND_BOUNDS` | `partner` is null, `meet.partnerOutOfBounds` is true, **no request is made**. The proxy would have 400'd it, but the client refuses first so a forged link cannot even generate the attempt. |
| A meet link's `mb` (the reader's own start) is out of bounds or unparseable | Treated as absent — `awaitingOrigin` stays true and the panel asks for a start — **plus** `meet.selfOutOfBounds`, which draws one line saying the link came back with the reader's own start broken. Not silent: `mb` is only ever an echo of a value the reader sent, so a bad one means the sender's app mangled it, and this app does not fail silently even about its own mistakes. |
| An **answer** link is opened (by its intended recipient or a forwarded third party) | `awaitingOrigin` is false, so two cold ladders warm sequentially with no gesture. Not gated; see decision 6 and *Cost*. |
| `mb` present but `ma` absent | `mb` is ignored and the link decodes as a non-meet link with no origin — i.e. a cold start with the budget and filters. The app never mints this shape. |
| An answer link's `p` names a place this build no longer has | The existing `shareable-spins` missing-place `.notice.is-warn`, unchanged. Origin, partner, dial and filters are all still restored. |
| An answer link's place is outside one or both reaches | The card is shown with a `.result-warning`, per `shareable-spins`' rule that a shared destination is never silently substituted. Which warning is `meet-in-the-middle`'s. |
| An invite older than `INVITE_STALE_DAYS` | A notice naming its age. **The link still works.** Refusing it would be theatre — the coordinate is in the URL either way — and the honest act is to say the start may be stale, not to pretend it was withdrawn. |
| `d` is missing, garbage, or out of range | `mintedDay` is null and no age line renders. A link with no date is a link that made no claim about its age. |
| Query is over `SHARE_QUERY_MAX`, or garbage | `applyShare` returns `base` by identity — an ordinary cold start. Unchanged from `shareable-spins`, and a meet link is ~160 characters against a 512 cap. |
| A crawler fetches an invite | One `ASSETS.fetch` of `/`, one `HTMLRewriter` pass, invite meta, **no cache entry** (a pin is present). Never charged against `API_RATE_LIMIT`. |
| A crawler fetches a preset-to-preset meet link twice | Second one served from `walk-roulette-share`. |
| The Worker has no `HTMLRewriter`, or the asset fetch fails | The app's document, unmodified, generic card. Unchanged. |
| Someone forwards an invite to a third person | It works, and it is meant to. A link is a link; the disclosure copy says so before the press. What the third person cannot get is the recipient's start, which was never in it. |
| Someone tries to use `/s` as storage | There is nothing to store into. `/s` reads an asset and writes a cache entry keyed by its own canonical query, and only when no pin is present. Nothing user-supplied is persisted anywhere. |

## Cost

**Bundle — estimated; the estimate is not the gate.** `share.ts` additions (four keys, two
describe functions, `meetShape`, `epochDay`, the precision helper) ≈ 550 B gzipped;
`session.ts` additions (`partnerOrigin`, three fields, two actions, the `applyShare` branch)
≈ 350 B; the App wiring ≈ 150 B. **Call it ≈ 1.0 KB** — an estimate stacked on top of chunk 10's
own unmeasured 1.8 KB estimate, which is why it is not the gate. Per README §5 this spec makes **no claim of
fitting the 64 KB budget** — the checked-in build already measures 71.2 KB against that promise.
The binding gate is acceptance criterion 15: record gzipped app JS from `npm run build` before and
after, and stop if the delta exceeds **1.5 KB**. `server/share-meta.ts` adds nothing to the client.
`meet-in-the-middle` reports its own delta separately.

**New endpoints:** none. **New bindings:** none. **New dependencies:** none. **New hosting
requirement:** none — the claim `shareable-spins` makes survives this spec intact, which was the
point.

**Worker:** one `ASSETS.fetch` plus one `HTMLRewriter` pass per uncached `/s`, exactly as today.
The honest new cost is a **lower cache hit rate**: nearly every meet link carries a pin and is
therefore rendered fresh every time. That is a handful of milliseconds of CPU per unfurl against
the Free plan's 10 ms budget, and it is the price of not storing coordinates.

**Engine:** doubles per meeting, and in the expensive direction. `PRESET_SNAPSHOTS` is a closed
set of 11 filenames, so a shared pin skips `seedFromSnapshot` entirely: 96 contours to
`/api/isochrone`, which is one upstream graph expansion against the configured instance and up to
**24** against a stock one, each charged to that browser's IP against the 240/minute limiter. Two
mitigations, both design-level: the two people are on two IPs and each warms one side, and the
invite panel surfaces `PRESET_ORIGINS` prominently because a preset is both the private answer and
the free one.

**The worst case, named:** opening an **answer** link warms *both* ladders — 2 × 96 contours plus
the picked place's routes — with no user gesture, because `awaitingOrigin` is false the moment `mb`
resolves. Sequenced, so it is two bursts and not one doubled one, but it is real and it is charged
to whoever opened the link, including a third party the answer was forwarded to. An invite costs
nothing until it is answered; an answer costs a full meeting on open. Both facts are in decision 6
and neither is claimed away in the acceptance criteria.

**One cost that is easy to miss:** when A opens B's answer link, A's own start comes back at three
decimals, misses A's warm ladder by up to ~70 m, and pays a full cold warm-up. Accepted — after
the answer link both people are looking at the same two coarse premises, which is more honest than
two slightly different pictures, and it is one warm-up per meeting.

**Build time:** zero. No snapshot change, `SNAPSHOT_VERSION` untouched, no new asset.

## Tests

### `src/app/share.test.ts` (extended — `shareable-spins` owns the file)

Fixtures: `CARYTOWN = PRESET_ORIGINS.find(o => o.id === "carytown")!`,
`PIN_A = customOrigin({ lat: 37.5407012, lng: -77.4360987 })`,
`PIN_B = partnerOrigin({ lat: 37.512, lng: -77.402 })`, `SHIPLOCK = "shiplock"`.

1. **"a meet link never carries `o`"** — `encodeShare({ ...base, meet: true, origin: PIN_A })`
   contains `m=1` and `ma=` and does **not** contain `o=`. This is the test that protects the
   old-build degradation.
2. **"an older build reads a meet link as a cold start"** — decode a meet query with a decoder
   that ignores `m`/`ma`/`mb` (simulated by asserting `decodeShare(meetQuery).origin === null`)
   and assert `applyShare(initialSession, { ...decoded, meet: false, originA: null })` yields
   `origin.id === DEFAULT_ORIGIN.id`. Names the failure mode in the test title.
3. **"a meet pin is written at three decimals"** — `encodeShare` with `PIN_A` under `meet: true`
   contains `ma=37.541%2C-77.436`, and the same origin under `meet: false` contains
   `o=37.54070%2C-77.43610`.
4. **"a preset in a meet link is still an id"** — `ma=carytown`, no coordinate anywhere in the
   query.
5. **"canonicalQuery is idempotent under coarsening"** —
   `canonicalQuery(decodeShare(encodeShare(x))) === encodeShare(x)` for an invite, for an answer,
   and for a preset-to-preset invite. This is `shareable-spins` test 7c extended to the shapes
   that round.
6. **"a hand-edited five-decimal meet pin canonicalises to three"** —
   `canonicalQuery(decodeShare("?m=1&ma=37.54070,-77.43600&b=30&rt=1"))` contains
   `ma=37.541,-77.436`.
7. **"key order is fixed"** — a query written with its keys shuffled canonicalises byte-identically
   to one written in order, for a full-house answer link.
8. **"`meetShape` distinguishes the three shapes"** — `"none"`, `"invite"`, `"answer"` for the
   three fixtures, and `"none"` for `?m=1&b=30` (an `m` with no `ma` is not a meeting).
9. **"an invite carries no `mb` and no `p`"** — the encoder **omits `p` and writes whatever
   `partner` it was given; it does not throw.** (Decided here rather than left to the
   implementer: `share.ts` is a pure encoder that never throws, and a throwing branch would fork
   that discipline for an invariant App can hold trivially.) So: `encodeShare({ ...base, meet:
   true, partner: null, placeId: null })` contains `m=1`, `ma=`, no `mb=` and no `p=`; and the
   invariant "`mb` is never a guess" is enforced by App's invite expression passing
   `partner: null`, asserted by test 35.
10. **"`d` is written only when a pin is present"** — an invite from `PIN_A` has `d=`; an invite
    from `CARYTOWN` does not.
11. **"`d` out of range decodes to null"** — `?d=-1`, `?d=abc`, `?d=999999999` all give
    `mintedDay === null` and neither throw nor produce a notice.
12. **"an out-of-bounds partner is refused without a request"** —
    `applyShare(initialSession, decodeShare("?m=1&ma=40.712,-74.006&b=30&rt=1"))` (Manhattan)
    yields `partner === null`, `meet.partnerOutOfBounds === true`, `awaitingOrigin === true`.
12b. **"a mangled `mb` is named, not swallowed"** —
    `?m=1&ma=carytown&mb=40.712,-74.006&b=30&rt=1` yields `awaitingOrigin === true`,
    `meet.selfOutOfBounds === true`, and `origin === initialSession.origin`.
13. **"an invite leaves the local origin unchosen"** — a valid invite yields `awaitingOrigin ===
    true` and `origin === initialSession.origin` (the flag, not a null origin, is what gates).
14. **"an answer restores both starts and the pick"** —
    `?m=1&ma=37.512,-77.402&mb=carytown&b=30&rt=1&p=shiplock` yields
    `partner.origin.id === "partner"`, `partner.coarse === true`, `origin.id === "carytown"`,
    `awaitingOrigin === false`, `pickedId === "shiplock"`, `meet.kind === "answer"`.
14b. **"a preset partner keeps its own identity"** — `?m=1&ma=carytown&b=30&rt=1` yields
    `partner.origin.id === "carytown"`, `partner.origin.name === "Carytown"`,
    `partner.coarse === false` — **not** `"Their start"`.
15. **"`origin` does not clear the meeting"** — `reduce(meetSession, { type: "origin", … })`
    leaves `partner` and `meet` set and flips `awaitingOrigin` to false.
16. **"`clearPartner` returns a single-person session"** — `partner === null`, `meet === null`,
    `awaitingOrigin === false`, `partnerWarmed === 0`, `framingKey` bumped. (The `meet: null` half
    is this spec's amendment to `meet-in-the-middle`'s reducer; the rest is that spec's test.)
17. **"a spin does not dismiss the meeting"** — `spinStart`/`spinEnd`/`pickPlace` leave `meet`
    non-null while clearing `shared`, unlike the solo path.
18. **"neither describe function contains a coordinate"** — `describeInvite` and
    `describeMeetResult` outputs contain no `37.` and no `-77.` for a pin origin.
19. **"a meet link is comfortably inside the query cap"** — a full-house answer link (two pins,
    floor, edge-only, climb, tier, three vibes, place, date) is under 300 characters, i.e. under
    `SHARE_QUERY_MAX` with room, and `SHARE_QUERY_MAX` is unchanged.
19b. **"the tier survives canonicalisation"** — `canonicalQuery(decodeShare("?o=carytown&b=30&
    rt=1&k=stop&p=shiplock"))` contains `k=stop`, and the same link with `k=destination` produces
    a **different** string. This is the regression guard for `k` being dropped from the total key
    order; without it `shareable-spins` test 21 fails at chunk 11 and nothing says why.

### `server/share-meta.test.ts` (extended)

20. **"an invite unfurls as a question"** —
    `shareMeta("?m=1&ma=carytown&b=30&rt=1", "https://walk.example")` is non-null, its title
    contains `both` and `30 min`, and it names no place. The old rule returned `null` here.
21. **"an invite from a pin never leaks a coordinate or a neighbourhood"** —
    `?m=1&ma=37.541,-77.436&b=30&rt=1` produces a title and description containing neither `37.5`
    nor `-77.4`, containing "a dropped pin", and containing no preset name.
22. **"an invite title does not name the sender's neighbourhood"** — the `ma=carytown` title does
    not contain `Carytown`; the description may.
23. **"an answer names the place and says `inside`, not `a walk`"** —
    `?m=1&ma=37.512,-77.402&mb=carytown&b=30&rt=1&p=shiplock` → title contains
    `Great Shiplock Park` and `inside 30 min`, and does not contain `a 30 min walk`.
24. **"an answer with an unknown place has no preview"** — returns `null`, same as a solo link.
25. **"a meet link with any pin is never cached"** — `shareCacheKey` is `null` for a pin under
    `ma`, for a pin under `mb`, and for both.
26. **"a preset-to-preset meet link is cached"** — `?m=1&ma=carytown&mb=home&b=30&rt=1&p=shiplock`
    yields a non-null key beginning `/__share/v1?`.
27. **"an invite and an answer between the same two starts are different documents"** — different
    `shareCacheKey`s and different `og:url`s.
28. **"a meet cache key and a solo cache key cannot collide"** — the solo link
    `?o=carytown&b=30&rt=1&p=shiplock` and the meet link `?m=1&ma=carytown&b=30&rt=1&p=shiplock`
    yield different keys.
29. **"og:url carries the canonical coarse coordinate"** — for `?m=1&ma=37.54070,-77.43600&…`,
    `meta.url` contains `ma=37.541,-77.436` and does not contain `37.54070`.

### `server/worker.test.ts` (extended)

30. **"an invite never touches the engine"** — `GET /s?m=1&ma=carytown&b=30&rt=1` with a
    `stubFetch` that throws: 200, zero fetch calls, zero limiter charges.
31. **"an invite with a pin is rendered and not stored"** — two identical GETs, two `ASSETS`
    calls, and the `"walk-roulette-share"` map is empty (this needs `stubEdgeCache`'s
    keyed-by-name change, which README §2.7 already puts in the foundations chunk).
32. **"a preset-to-preset meet link is served from the edge on the second GET"** — one `ASSETS`
    call across two requests, one entry in `"walk-roulette-share"`, zero in
    `"walk-roulette-isochrone"`.
33. **"the asset fetched is always `/`"** — across every meet path, no recorded `ASSETS` URL is
    `/s` or ends in `/index.html`.

### Regression guards for chunk 10 (`server/share-meta.test.ts`, `src/app/share.test.ts`)

34. **"this chunk does not re-key a single warm solo entry"** — `shareCacheKey` for
    `?o=carytown&b=34&rt=1&e=1&c=flat&v=park.river&k=stop&p=shiplock` equals the **literal string**
    `"/__share/v1?o=carytown&b=34&rt=1&e=1&c=flat&v=park.river&k=stop&p=shiplock"`. The same
    literal is added to chunk 10's own test file when this chunk lands, so a future reorder fails
    in both places. If this test fails on arrival, chunk 10 emitted a different order and *this*
    document's order is the thing to change — not `SHARE_CACHE_VERSION`.
35. **"App never mints a link with a start the reader did not choose"** — a pure unit over the two
    mint expressions extracted as `meetLinks(state, siteOrigin, picked)`: with
    `awaitingOrigin: true` both `invite` and `answer` are `null`; with it false and no pick,
    `invite` is a string and `answer` is `null`; and the invite string never contains `mb=`.
36. **"the URL-clearing comparison is stable across a meet arrival"** — for both an invite query
    and an answer query, `canonicalQuery(decodeShare(encodeShare(mirrored)))` computed from
    `applyShare(initialSession, decodeShare(q))` equals that session's `shared.linkQuery`; and
    after `reduce(session, { type: "origin", origin: OTHER })` on the invite case, it no longer
    does. This is the test that stops the address bar wiping itself on the first paint.

## Acceptance criteria

1. `encodeShare`/`decodeShare`/`canonicalQuery` round-trip all three link shapes, and
   `decodeShare` never throws on any input string, including one where `m=1` is present and `ma`
   is not.
2. A meet link contains no `o=` key, and an app build without this chunk opens one as a plain cold
   start on `DEFAULT_ORIGIN` — never on the sender's coordinate.
3. A pin in a meet link is written at exactly three decimals, in the encoder, and no code path
   re-expands it before `pointKey` sees it.
4. A preset origin in a meet link is written as an id and no coordinate appears in the query.
5. **(joint with `meet-in-the-middle`; verified once, on the pair)** Opening an invite leaves
   `awaitingOrigin` true, and with the Network panel open and the reel untouched: **zero**
   requests, no contour drawn, Spin not pressable, and **no invite or answer link mintable** —
   `meetLinks(...)` returns `{invite: null, answer: null}`, so no control that would send anything
   is rendered. The disclosure sentence from decision 5 is on screen above every such control.
   Test 35 covers this spec's half; the DOM half is `meet-in-the-middle`'s.
6. **(joint)** Opening an invite whose `ma` is outside `RICHMOND_BOUNDS` sets `partnerOutOfBounds`,
   sets `partner` to null, and makes **zero** network requests. A mangled `mb` sets
   `selfOutOfBounds` and draws one line rather than nothing.
6b. Opening an **answer** link *does* warm two ladders and that is the specified behaviour, not a
   defect. The observable form: exactly two sequential `POST /api/isochrone` waves, yours first,
   and no third wave.
7. The recipient's own coordinate never appears in `location.href`, in `history`, or in any
   request other than `POST /api/isochrone` for their own reach.
8. The answer link is produced only by an explicit press and is handed to `navigator.share` /
   the clipboard using `shareable-spins`' existing flow, with `playPress()` on press and no
   outcome cue.
9. `curl -H 'Accept: text/html' https://<host>/s?m=1&ma=carytown&b=30&rt=1 | grep og:` returns
   **200** with an invite-shaped `og:title` and `og:description` that name no place and no
   coordinate — not the site's generic card.
10. The same URL with `ma=37.541,-77.436` returns 200, its `og:description` says "a dropped pin",
    and neither `og:title` nor `og:description` contains a digit of the coordinate.
11. Two GETs of a pin-bearing meet link both re-render; two GETs of a preset-to-preset meet link
    hit the share edge cache once.
12. `wrangler.toml`, `worker/index.ts`, `server/proxy.ts`, `server/vite-plugin.ts`,
    `public/_headers`, `public/reach/` and `SNAPSHOT_VERSION` are **unchanged**. No new binding,
    no new endpoint, no new dependency.
13. **(joint)** An invite older than `INVITE_STALE_DAYS` shows its age and still opens. This spec's
    half is observable on its own: `applyShare` on a query with `d` set to
    `epochDay(Date.now()) - 3` yields `meet.mintedDay` three days behind today and a session that
    is in every other respect a working invite. The line itself is `meet-in-the-middle`'s markup.
14. `npm run typecheck`, `npm run lint` (eslint + oxlint + knip) and `npm test` are clean: no
    `unknown` at a boundary, no unexplained type assertion, no unused export in `share.ts`.
15. Gzipped app JS from `npm run build` grew by no more than **1.5 KB** for this chunk alone.
    Record before and after in the PR body.
16. `shareable-spins`' own acceptance criteria 1–18 still pass unmodified, in particular 11b (the
    address bar clears on the first change to a link's own fields) and its round-trip identity,
    and its test 21 (two walks differing only in a filter — including `k` — do not share a key).
17. Opening an **answer** link and reloading it restores the same two starts and the same pick: the
    address bar is not cleared on the first paint of any meet arrival, only on the first change the
    reader makes. Test 36 is the unit form; the browser form is one reload.

## Open questions

1. **One pace for two walkers, and whether saying so is enough.** `WALKING_SPEED_KMH = 3.69` is
   pinned in `server/proxy.ts` and stamped into every snapshot; there is no per-request speed
   parameter and adding one would be a policy change plus new abuse surface on the one endpoint
   that costs real graph expansions. This spec refuses it. The honest lever left is that both
   people share one budget at one pace, and the copy must never say "her pace". Someone should
   decide whether a hint line in the panel is sufficient or whether v0.5's README §6 ("what v0.5
   does not do") needs a paragraph. **Substantially answered since this was written:**
   `meet-in-the-middle` decision 1 ships a `ResultLine` with `tier: "assumed"` reading *"Both walks
   are measured at the same pace."* plus a panel hint, and forbids the words "their pace" anywhere.
   What is left for this spec is only the README §6 paragraph, which it should carry.
2. ~~**Three decimals, or two?**~~ **Answered by measurement, 2026-08-21. `MEET_PIN_PRECISION = 3`.**
   The question was whether two decimals (~1.2 km) could buy an order of magnitude more privacy
   without a boundary that is visibly wrong at the edges. It cannot.

   The measurement ran against a live engine over four preset pairs — `home+carytown`,
   `monroe+libby-hill`, `manchester+siegel`, `belle-isle+capitol` — at 20, 30 and 45 outbound
   minutes, probing **every corner of the rounding cell** rather than the average displacement,
   since a link minted anywhere in that cell is a link somebody can send. For each corner it
   counted the symmetric difference between the both-reach set from the true coordinates and the
   both-reach set from the pin, one side coarsened and both. 63 isochrone queries, three contours
   each.

   | precision | worst one-sided flip | worst two-sided flip | context |
   | --- | --- | --- | --- |
   | 3 decimals (~100 m) | 4 | 4 | out of a 10-place pool; **zero flips at 20 and 30 min** in seven of eight cases |
   | 2 decimals (~1.2 km) | 15 | 16 | out of a **16**-place pool |

   The row that settles it is `monroe+libby-hill` at 45 minutes: sixteen places both people can
   reach, and at two decimals all sixteen can flip. That is not a boundary that is wrong at the
   edges; that is two devices answering the same question with disjoint sets. `manchester+siegel`
   repeats it (eight true, twelve flips). At three decimals the disagreement is confined to a
   handful of genuinely marginal places — `tpott`, `browns`, `marshall-house` — which is precisely
   the honest-divergence case README §2.9f was written to leave visible rather than paper over.

   Two corrections to the instructions this question originally gave, recorded so the measurement
   can be reproduced rather than re-derived:

   - **It cannot run "against the shipped snapshots and no network".** Displacing an origin asks
     for reach from a *different* coordinate, and `public/reach/` holds ladders for the eleven
     exact preset points only. It needs a live Valhalla. It is still cheap — three contours per
     request, not the 96-rung ladder — but it is not free, and a future re-check of this constant
     must budget for the engine.
   - The script parsed 61 of the 62 entries in `PLACES`; the regex missed `pyramid`, the one
     multiline entry. One place cannot move a verdict decided by sixteen, but a re-run should
     parse the module rather than scrape it.

   The script is not committed. If this constant is ever revisited — a denser `PLACES` after
   `places-expansion` would be the reason — reproduce it from this description.
3. **Should an invite be mintable at all from a `geolocate` origin?** A geolocated origin encodes
   exactly like a dropped pin, and the person pressing the button may not register that the
   thing being shared came from their GPS rather than from a tap. `geolocate`'s own open question
   1 is the same question for solo shares. Options: treat it identically and rely on the copy
   (this spec's assumption), or require one extra confirmation for a `me` origin specifically.
4. **Unverified, inherited from `shareable-spins` and still blocking:** that
   `new URL(request.url).origin` inside the Worker carries the public hostname, and that Vite's
   dev server serves `index.html` for `/s`. Both must be checked before chunk 10 ships; this spec
   adds nothing to either check but cannot ship without them.
5. **Unmeasured:** the `HTMLRewriter` pass for an invite is the same work as for a solo share, so
   the 10 ms Free-plan CPU budget should be equally fine — *should*, because neither has been
   measured. `wrangler tail` reports CPU time; look at the first deploy.

## Corrections after implementation

Landed 2026-08-22 as chunk 11, together with `meet-in-the-middle`. Nine things
this document got wrong, in the order they were hit.

1. **`MEET_PIN_PRECISION` does not exist, and must not.** Decision 4 says "meet
   links round a pin to three decimals, solo links keep five" and asks for a
   second constant. Chunk 10 had already decided against five for the same
   privacy reason and shipped `PIN_PRECISION = 3` — whose comment says, in
   advance, that it is "the same precision `meet-in-the-middle` pins its own
   meet point at, deliberately: one number for how precisely this app is
   willing to publish a person's location." A second name for one number is
   exactly the drift that comment exists to prevent, so there is one constant
   and its doc records the measurement. GOAL's chunk 11 box asking that
   `MEET_PIN_PRECISION` be 3 is satisfied in value and not in name; the report
   says so rather than inventing an alias to tick it.

2. **`meetShape` is `meetKind`.** The repo's own oxlint anti-slop plugin
   refuses `shape` in a symbol name — "describes structure rather than
   ownership" — and it fires on every occurrence. Renamed at the six call
   sites. Nothing else about it changed.

3. **The total key order is `… c, k, v, p …`, not `… c, v, k …`.** This
   document writes `m, ma, mb, o, b, f, rt, e, c, v, k, p, d` and then insists,
   correctly, that the solo subset must be byte-identical to chunk 10's. It is
   not: chunk 10 emits `k` before `v`. **Test 34 caught this on its first run,
   which is what it was written for**, and the fix was the one this document
   prescribes — match chunk 10's bytes, never bump `SHARE_CACHE_VERSION`. The
   literal in that test now reads
   `/__share/v1?o=carytown&b=34&rt=1&e=1&c=easy&k=detour&v=river.park&p=shiplock`.

4. **`describeInvite` dropped its own `originName` on the floor.** The copy
   fixed in *Data and types* never interpolates the parameter, while the
   `shareMeta` section requires the invite description to say "a dropped pin"
   and criterion 22 requires it to be able to say "Carytown". The second is
   right — an invite's premise is where the sender is starting from — so the
   sentence now reads *"Somewhere we can both walk to in 30 min, out and back,
   starting from Carytown. Open this and say where you're starting from."*
   Caught by test 21, not by a type: an unused parameter is not an error.

5. **`awaitingOrigin` is `originChosen`, with the sense inverted**, and
   `Partner`/`coarse`/`clearPartner` do not exist. This document says so itself
   in *Depends on* item 2 and calls the fix mechanical; it is recorded here
   because the file still reads the other way in a dozen places and the next
   person to open it should not have to re-derive which half won. README §2.9a
   decides it, in this spec's favour.

6. **`ShareInput` needed a fourth amendment, not three.** `placeId` widening to
   `string | null` is named; `partner`, `meet` and `mintedDay` are named. What
   is not named is that App's one construction site had to move: it is now
   `shareInputFor(state, placeId)` in `session.ts`, with `liveLinkQuery` and
   `meetLinks` beside it, because three things depend on the exact bytes — the
   Share button, the address-bar comparison and the mint gate — and a copy of
   the shape in `App.tsx` is a fourth that cannot be unit-tested.

7. **The share flow had to be extracted before a second button could use it.**
   This document says the answer link goes through "the existing
   `shareable-spins` share flow verbatim", which was forty lines inlined in
   `ResultCard`. Two share controls now exist (*Send this back* on the card,
   *Invite someone to meet* in the panel), so the flow is
   `src/ui/useShareAction.ts` and both call it. The hook also had to grow
   `lastUrl`: with one state and two buttons, a manual fallback showing the
   caller's "current" link hands the reader the wrong URL at exactly the moment
   they must copy it by hand.

8. **`Date.now()` cannot be called where the mint expressions live.** This
   document's mint pseudocode reads `mintedDay: epochDay(Date.now())` in App's
   render body, and the repo's `react-hooks/purity` rule refuses it — correctly,
   since it also makes `d` differ between two renders in the same minute.
   `meetLinks` takes `nowMs`, and App passes `conditions.atMs`, the one clock
   that already ticks once a minute.

9. **The Worker is unchanged, exactly as promised — read that twice.** It was
   worth checking rather than assuming, and it held: `/s` gained zero lines, and
   both meet branches live in `share-meta.ts` and `share.ts`, which it already
   imported. `wrangler.toml`, `proxy.ts`, `vite-plugin.ts`, `public/_headers`
   and `public/reach/` are all untouched.
