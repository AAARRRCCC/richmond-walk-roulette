# Both in reach

**Status:** spec — not implemented
**Slug:** `meet-in-the-middle`

> The slug is the file name and the chunk name. **The feature is called "Both in reach" everywhere a
> reader can see it.** "Meet in the middle" is the phrase every competitor uses and it is a lie in this
> app's own terms: there is no middle. There is an overlap, and the midpoint of two people on opposite
> banks of the James is in the river. Refusing that phrase is the same refusal as refusing the circle.
> The reasoning is in *The decision*, item 9.

## Depends on

- **`pool-reasoning`** (chunk 2) — this spec adds one member to `ExclusionReason` and one field to
  `PoolConditions`. It does **not** reintroduce a parallel filter. Amendments are named in
  *Contract amendments* and are binding on that spec.
- **`shareable-spins`** (chunk 10) — the second origin arrives through `applyShare`, which that spec
  owns and `multiplayer-links` extends. This spec never reads or writes the URL.
- **`multiplayer-links`** — the other half of this feature, now drafted. It owns the link: the `m`,
  `ma`, `mb` and `d` query keys, `partnerOrigin`, `MeetArrival`, the invite and "send this back"
  controls, `shareMeta`'s meet branch, coordinate coarsening, and every word of privacy copy that
  appears *before* a coordinate leaves a device. **An earlier draft of this spec invented its own
  names for the session fields (`Partner`, `awaitingOrigin`, `partner`/`clearPartner` actions, the
  `o2` key). Those were wrong and are withdrawn — this spec now uses `multiplayer-links`' vocabulary
  verbatim.** The exact contract, including the three amendments this spec asks of *that* document,
  is in *The contract with `multiplayer-links`*.
- **`geolocate`** (chunk 6) — `src/lib/bounds.ts` and `RICHMOND_BOUNDS`, used here to refuse a partner
  origin outside Richmond before any request is made, and `hasSnapshot(origin)` to tell the reader
  which side is about to be slow.
- **`elevation-profile`** (chunk 3) — only for `climb` replacing `terrain`, which the link carries and
  this spec reads through `PoolConditions` without touching.
- **`places-expansion`** (chunk 8) — not a code dependency, a *measurement* one: the two-sided sweep
  and `meetMinimum` must be timed at that spec's 250-place cap, not at today's 62. See *Open
  questions* 3.
- **`docs/plans/README.md`** §2.3d (the exclusion-reason contract, including this spec's amendments),
  §2.5 (`ResultLine` and the fixed warning order), §2.8 (the announcement clause array), **§2.9 (the
  second origin — the session vocabulary, the warm-up scalars, the ladder caches, and the two
  amendments this spec asked for that were decided there)**, §4 chunk 11 (build order), §5 (the
  budget rule).

**Build position: chunk 11, the second half.** `multiplayer-links` is 11a and lands first, because it
is what puts a partner in the session; this spec is 11b. **The two are one landing, not two shippable
chunks** — 11a alone adds session fields nothing reads, which knip fails and which decodes a link into
a session the UI does not render. Chunk 11 is strictly after `shareable-spins` (chunk 10) for exactly
the reason that spec is last: a second origin is a change to what a `Session` *is*, and it cannot
amend a share format the session does not yet have.

**Two amendments this spec asked of others were decided in README §2.9, and one went against it.**
Amendment 7 (strike the "96 duplicate contour requests" claim) is ratified. **Amendment 8 is
refused**: the sender does **not** adopt its own coarsened coordinate at mint, because doing so would
move their start by up to ~70 m, change the answer they are looking at, and re-warm 96 contours as a
side effect of pressing Share — degrading a measurement so that two screens agree. The consequence is
binding on this document: the divergence row in *Failure and degradation* is **required copy**, and
acceptance criterion 5 is a per-device claim.

## What and why

The app answers "where can *I* walk to in half an hour" better than anything else does. The question
two people actually ask each other is different and nothing answers it at all: *where can we both walk
to*. Every product that has tried computes a midpoint — MeetWays picks "the nearest freeway or
main-road friendly midpoint" and searches venues around it; Mappr and Midpointr market the same shape
with an undisclosed weighting. That is the circle again, one level up: a confident pin produced by a
method nobody shows you. For two Richmonders on opposite banks the midpoint is in the water.

The honest answer is a region, and the app already holds everything needed to compute membership in
it. `contains()` handles multipolygons and holes. The contour cache is already keyed per origin, so a
second person's ladder costs no new key design. `/api/isochrone` is already per-location, so the
partner's contours are a second call to an endpoint that already exists with policy already pinned.
The whole geometry half of this feature is one extra point-in-polygon test per place.

So this spec adds a second origin to the session, fetches its ladder, redefines "in the pool" as *in
both reaches*, gives the reader a map that can carry two people without becoming soup, gives the
result card two walks instead of one, and — the part that is actually delightful — answers the common
case honestly. Two people far apart share no overlap at thirty minutes. Most pairs in a river city
share none at any dial position anybody would use. The app can compute the smallest budget at which an
overlap exists, from ladders it has already cached, in a few milliseconds, and offer to move the dial
there. That is a real number about the real network, and it is the sentence this feature is for.

What it does not do. It does not draw an intersection polygon, because it cannot compute one and will
not pay 10–30 KB gzipped for a library that could (see *The decision*, item 4). It does not print an
overlap area, because every way to get that number carries an error bar and this app does not ship
numbers with error bars. It does not weight the draw toward "fair" places — the spin stays a uniform
pick over `included`, as `pool-reasoning` fixed and README §1 restates. It does not support three
people. It does not give the two of you two walking speeds, because the proxy pins one and that is a
policy change, not a feature. And it never claims the two of you will arrive together.

## The decision

Nine decisions. Each is defensible alone; together they are the reason this fits in one chunk.

### 1. Two origins, one dial, one budget, one pace — and the pace is admitted

`Session` gains `partner: Origin | null` beside the existing `origin: Origin`, built by
`multiplayer-links`' `partnerOrigin(at)` — `{ ...at, id: "partner", name: "Their start" }`. The local
device always owns `origin` — it is draggable, nudgeable, and it is the one the map frames on. The
partner is read-only on this device: it arrived from a link and the person it belongs to is not here.

A plain `Origin` rather than a wrapper type is `multiplayer-links`' call and it is the right one:
every per-origin path (`cachedReach`, `prefetchLadder`, `pointKey`, `snapshotName`) takes it
unchanged. The "no free text from a link" invariant is enforced by `partnerOrigin` being the only
constructor — `id` and `name` are fixed strings that never come from the URL — not by a paragraph.
Whether the partner arrived as a coarsened pin is derived, not stored: `partner.id === "partner"`
means a pin (a preset resolves to its own `PRESET_ORIGINS` entry, id and all), and a pin in a meet
link is always at `MEET_PIN_PRECISION`. That is what drives the "to about a block" wording. **There
is no `coarse` field and no `Partner` type.**

**One budget, one dial.** The question is *"where can we both walk to in thirty minutes"*. The symmetry
is the question. Two dials would make the fairness problem invisible by letting the reader tune it
away, would double the dial's state space, and would need a second warm-up trigger. Rejected.

**One pace, said out loud.** `WALKING_SPEED_KMH = 3.69` is pinned in `server/proxy.ts` and stamped
into every snapshot; `seedFromSnapshot` rejects a file whose `speedKmh` disagrees. There is no
per-request speed parameter and adding one would put a costing knob on the one endpoint that costs
real graph expansions, on a rate-limited path, for a policy the client is deliberately never shown.
So both walks are measured at the same pace, and the app says so rather than implying otherwise: one
`ResultLine` with `tier: "assumed"` reading **"Both walks are measured at the same pace."** and one
hint line in the panel. **No stat, no sentence and no label anywhere in this feature may say "their
pace" or "her pace".** That wording would be the app inventing a fact about a person it has never
measured, which is precisely what it exists not to do.

### 2. The pool is `contains(yours) && contains(theirs)`, expressed as a reason and not a rule

The exact intersection test for the only question the spin asks needs no geometry at all:

```ts
contains(reach.bands.at(-1)!.polygons, place) && contains(partnerReach.bands.at(-1)!.polygons, place)
```

That is two point-in-polygon sweeps over the place list, the same order of work `explainPlace` already
does every frame of a dial scrub. **Assumed, not measured: that the two-sided sweep is a fraction of a
millisecond.** An earlier draft quoted "0.040 ms for 61 places × 2 `contains`" with no script behind
it; the number is withdrawn. What the implementer must do instead is *Open questions* 3's check — one
`performance.now()` bracket around `derivePool` at `places-expansion`'s 250-place cap with a partner
reach and every sibling rule active — before this ships. The argument for the design does not rest on
the number: `contains` goes from twice per place to three times per place, and the existing `WeakMap`
memo removes it entirely on any render that is not a dial or filter move.

It plugs into `pool-reasoning` as a new **`ExclusionReason` member, `"out-of-their-reach"`, evaluated
inline in `explainPlace`'s geometry section — not as a `PoolRule`.** This is the one place where this
spec insists on a different shape from the four sibling filters, and the reason is ordering: a
`PoolRule` is evaluated *after* the reader's own chips, so a place three miles from the other person
that also happens to be hilly would report `wrong-terrain` as its primary reason. That is a nonsense
sentence in a drawer heading. The obstacle is geometry, it is as fundamental as `out-of-reach`, and
`REASON_ORDER`'s stated rationale — "how fundamental the obstacle is" — puts it immediately after
`inside-floor`.

**`subtract()` must not be used and is forbidden by name.** It reads like a boolean difference and is
not one. Its own doc comment states its justification: isochrones from *one* origin are strictly
nested, so an inner exterior ring can be appended as a hole to whichever outer polygon contains its
first vertex. Two origins' contours cross. Applied here it would append partially-overlapping rings as
holes and produce geometry that is not imprecise but meaningless — and `contains`, `areaSqMeters` and
MapLibre would all consume it happily. An implementer will reach for it. Do not.

### 3. No partner route prefetch. One route, on demand, for the picked place only

The partner's walking minutes are needed in exactly one place: the result card, for the place that
won. So the app fetches exactly that: one `fetchWalkingRoute(partner, picked)` when a pick
settles, rendered as a skeleton until it lands.

This is the decision that keeps the felt cost from doubling, and it resolves three of the recon's
sharpest hazards at once:

- `warmedNow` and `warmedWide` stay keyed on `pointKey(origin)` — yours — because there is no second
  wave to guard. The "single-string ref keyed on one of two origins" bug never exists.
- The route LRU is not asked to hold two origins' worth of the pool: it holds yours plus one extra
  entry per pick. Its size is therefore not a factor here, which is fortunate, because the two specs
  disagree about it — `elevation-profile` proposes `MAX_ENTRIES 600` and the checked-in
  `src/lib/route-store.ts:41` is still 800. Either is fine at one entry per pick.
- **The Spin gate keeps its meaning and its timer.** `settledRoutes` counts *your* routes over
  `baseIncluded`, unchanged, against the same `ROUTE_WARM_GRACE_MS`. Rejected: counting 2 × candidates
  behind the same 12-second grace, which would hit the short-reel notice constantly and would change a
  documented honesty guarantee ("the reel is honest about its pool") as a side effect of a different
  feature. The pool is still fully represented on the reel; the partner's minutes are a fact about the
  winner, discovered after the winner is known.

Also rejected, emphatically: gating the draw on "both routes loaded". `drawable` (routes cached) and
the winner pool (full `candidates`) are deliberately different so the reel never biases toward places
whose routes arrived first. Drawing from "both loaded" would reintroduce exactly that bias, pointed
at places near both people — a thumb on the scale wearing a loading state's clothes.

### 4. There is no overlap polygon, and there is no overlap area

**Nothing in this feature computes, draws or measures the intersection as geometry.** Three options
were costed and all three are refused:

- **A polygon clipper.** `@turf/intersect` (polyclip-ts + bignumber.js) and `polygon-clipping` are
  both in the 9–17 KB gzipped range — **treat those figures as an assumption and re-measure with
  `npx esbuild --bundle --minify` plus `gzip -9` before spending any of it.** The refusal does not
  depend on which end of that range is right. It depends on the failure mode: `polygon-clipping`
  aborts with `Unable to complete output ring starting at …` on degenerate rings, a long-standing and
  still-open robustness class ([#49](https://github.com/mfogel/polygon-clipping/issues/49),
  [#105](https://github.com/mfogel/polygon-clipping/issues/105),
  [#139](https://github.com/mfogel/polygon-clipping/issues/139),
  [#140](https://github.com/mfogel/polygon-clipping/issues/140)) — and **this repo's own snapshots
  carry exactly that input.** Verified, and reproducible in one command:

  ```sh
  node -e "const fs=require('fs');for(const f of fs.readdirSync('public/reach')){\
  const g=JSON.parse(fs.readFileSync('public/reach/'+f,'utf8')).contours['100'];let v=0,d=0;\
  for(const p of g.coordinates)for(const r of p){v+=r.length;\
  for(let i=1;i<r.length;i++)if(r[i].join()===r[i-1].join())d++;}console.log(f,v,d);}"
  ```

  On the eleven checked-in snapshots the 100-minute ring runs 1505–2577 vertices with **2 to 17
  consecutive-duplicate vertices each** (`37.52676_-77.41738.json`: 2309 and 5), a direct consequence
  of `SNAPSHOT_PRECISION = 4` over a ~25 m grid. Against a budget README §5 records as already broken
  (71.2 KB shipped against a claimed 64 KB), buying that failure mode is not defensible.
- **A grid-sampled area.** Pure, testable, about twenty lines — and it would be the only number in an
  app built on exactness that ships with a stated error bar. Refused on those grounds alone.
- **A Canvas2D raster mask.** Sketched as the upgrade path, **unbuilt and unverified**: fill both
  reaches into an offscreen canvas and composite with `destination-in`, mounted as a MapLibre `canvas`
  source, at zero bundle cost. Four claims are load-bearing and **none has been tested in this repo**
  — they are the checklist for whoever reopens *Open questions* 6, not facts: (a) `ctx.fill("evenodd")`
  matches `contains`'s crossing-number-with-holes semantics on our rings; (b) `destination-in` yields
  an overlap that agrees with `contains` at the pixel; (c) `ImageSource.setCoordinates` projects
  corners through Mercator and interpolates linearly across the quad, so the texture must be
  rasterised in **Mercator y**, not linear latitude; (d) a single-zoom texture's magnification is
  acceptable when the reader zooms past its native resolution. **It is not built in this chunk**,
  because what it produces is a prettier version of something two crossing outlines and a cluster of
  dots already say.

**What the map does instead.** In meet mode each side draws **one** fill — its outermost contour at
the current budget — and one outline. Yours is `#ffb043` at `fill-opacity: 0.07` with the existing
`band-line-0` treatment; theirs is `#ffb043` at 0.06 with a dashed `#ffd7a0` line. Where the two fills
cross, alpha compositing makes the region visibly denser than either alone. **That density is
compositing, not a computed polygon, and the app never measures it or names it.** The nested inner
bands are dropped in meet mode (see item 6) precisely so that the only stratification on screen is the
one that means "both".

**What the readout says instead of an area.** In meet mode `ReachReadout` stops naming an area and
names a count: *"11 places you can both reach · 30 min each"* — **but only once `partnerReach` is
non-null.** While the partner's ladder is warming the pool *is* your own reach, so `included.length`
is a one-person number and calling it "both" would be the app asserting a two-sided fact it has not
computed. In that state the readout keeps naming your area exactly as it does today and appends
`.readout-sep` + *"their side still working"*. The prop carries the state (`meet.partnerWarm`), so
the component cannot get this wrong by accident. The count is exact and derivable from the pool. The
area is not computable without one of the three refused options. This is a swap of kind,
not a degradation, and it is arguably the better sentence: the thing two people want to know is how
many options they have, not how many square kilometres they share.

### 5. Fairness: show the split, do not correct it

A place in the overlap can be 8 minutes for one person and 29 for the other. Three answers were
available and only one survives the app's existing commitments:

- **Weight the draw toward balanced places.** This would be the app's first non-uniform draw. README
  §1 states as a non-negotiable that nothing in v0.5 ranks or weights it, and `pool-reasoning` fixes
  the spin as "a uniform pick over `included`". Refused.
- **An "even split" toggle.** An arbitrary threshold, a chip, a new `ExclusionReason`, a `REASON_COPY`
  row and a counterfactual branch — to hide places from a reader who can already see the numbers.
  Refused as chrome.
- **Show both numbers and let two adults decide.** Shipped.

The card in meet mode replaces the three-column `.result-stats` with a two-row `.result-split`: one
row per side — *Your start* / *Their start*, out-and-back minutes, distance — then one line naming the
meeting instant as `max(yours, theirs)`: **"You'd both be there by 24 min."** A gap line appears only
when the gap is large (`MEET_GAP_MINUTES = 8`): **"You get there 19 min before them."** The word
"unfair" never appears; it is a claim about a relationship the app cannot see.

Only **your** directions button renders, on your device. This is what keeps `.result-actions` at the
three-row grid README §3 already resolved between `apple-maps` and `shareable-spins` — a fourth row
for a link that opens navigation from somebody else's house on your phone would be chrome pretending
to be a feature.

### 6. The map drops more than it adds

Legibility, not addition, is the design problem. Three nested amber fills at 0.085 already stack to
roughly 0.24; a second set of three would be six overlapping strata of one hue and the eye separates
none of them. So in meet mode:

- **Both sides lose their inner bands.** `band-1` and `band-2` are fed `EMPTY`. The contour ladder is
  a single-person instrument — it answers "how much further with ten more minutes" — and that question
  has no two-person form.
- Your outermost contour keeps its fill (dropped to 0.07) and its `band-line-0` outline.
- The partner gets **one** new source and two new layers, drawn *beneath* yours.
- Your route line is the only route drawn.
- The partner gets a second marker, `.origin-marker.is-partner`: same 18 px, transparent core,
  `--accent-soft` border, no white fill, no shadow ring, `pointer-events: none`, not draggable.
  **Distinctness comes from fill and lightness, never from a second hue** — amber is the only accent
  and that decision is locked in `app.css`'s header.
- The dots carry the overlap. `inReachIds` is the two-sided pool, so the existing three-state
  vocabulary (`picked` / `in` / `out`) means "in both" with no new layer, no new colour and no new
  geometry.
- Framing fits the union of both outermost contours, so both starts and the shared region are on
  screen at once — **and this needs a guard change, not just an extra `extend`.** The framing effect
  today early-returns on `!outerBand` (`MapCanvas.tsx:416-420`), and before the recipient has chosen a
  start `reach` is deliberately null, so as written the map would never frame on anything. See
  *Changes, file by file*.

### 7. The empty overlap is escalated with a computed number, not a shrug

Two people far apart is not the edge case; across a river city it is the common case. **Measured,
2026-08-21, and it is worse than "common": it is the default.** Four real preset pairs —
`home+carytown`, `monroe+libby-hill`, `manchester+siegel`, `belle-isle+capitol` — were checked for a
non-empty shared pool at 20, 30 and 45 outbound minutes against a live engine. At **20 minutes all
four pairs share nothing**. At **30 minutes three of the four still share nothing** (`belle-isle+capitol`,
the closest pair on the list, manages three places). Only at 45 minutes does every pair have something
(2, 16, 8 and 10 places respectively). The dial's default sits well below that.

So the empty overlap is not a state the app falls into when two people are unusually far apart. It is
the state two people are in when they open the link, and `widen-to-meet` is not a recovery path — **it
is the feature's opening move**, which is why the escalation below carries a computed number rather
than an apology.

The app can answer, because both ladders are up to 96 cached rungs (`LADDER`, 5–100 at `DIAL_STEP` 1)
and the membership test is a `contains` pair. `meetMinimum` scans ascending for the first rung at which
any place passes both tests. It runs when the pool is empty and both warm-ups have reported done,
memoised on the pair of origins — the same discipline `suggestFix` uses.

**Amendment forced by the measurement, for the implementer:** because the empty pool is the arrival
state rather than an unlucky one, `meetMinimum` must be treated as part of the *arrival* path, not as
a late branch of `suggestFix`. Two consequences, both of which must hold:

- The panel must not show an empty pool and a dead Spin button while it decides whether it has
  anything to suggest. The transition from "both warm" to either `widen-to-meet` or `no-overlap` is
  the first thing a recipient sees, so it must be the same beat as the warm-up finishing, not a
  second beat after it.
- The cost assumption changes with it. `meetMinimum` was specified as rare — "it runs once per pair,
  off the render path" — and its cost was accepted on that basis. It is not rare; it runs on
  essentially every meet arrival. That does not obviously break anything (it is still once per pair,
  still behind the memo), but *Open questions* 3's instrumentation is now a requirement rather than a
  precaution, and it must be timed at `places-expansion`'s 250-place cap before this ships. Its cost
  remains **assumed, not measured** — an earlier draft's 12.8 ms / 3–4 ms figures had no script behind
  them and are withdrawn.

**A warm ladder is not a complete ladder, and this is the thing the first draft got wrong.**
`prefetchLadder` is best effort per contour — "a minute Valhalla dropped as degenerate is simply not
warm" (`isochrone.ts:538-556`) — and it calls `onProgress({done:1,total:1})` and resolves normally
even when individual rungs rejected. So "one ladder is not warm enough yet" and "the engine has no
answer at that rung, ever" are different states, and a scan that reports *incomplete* on the first
null rung would leave the panel saying **"Waiting on their side."** forever over a single dropped
contour. The scan therefore **skips a null rung and counts it**, and the copy names what was
measurable rather than claiming completeness:

- **Found**, at some rung whose round-tripped budget is ≤ `MAX_MINUTES`: *"At 42 minutes, Byrd Park
  comes into both your reaches."* with a `.link-button` **Widen to 42 min** that dispatches
  `{ type: "budget" }` and lets the pool re-derive. If any rung *below* the answer was unmeasurable,
  the sentence becomes *"The smallest we could measure is 42 minutes …"* — one word of hedging,
  earned.
- **None**, no measurable rung yields a shared place: *"Nothing is inside 100 minutes' walk of both of
  you — the widest the dial goes."* plus **Spin from just your side**, which drops the partner. When
  rungs were skipped it reads *"Nothing we could measure is inside 100 minutes' walk of both of
  you."*
- **Warming** — a state the *caller* determines from `warmed`/`partnerWarmed`, never a return value of
  the scan: no number, and the notice says a side is still working.

This is the app's rule that it never fails silently, applied to a case where the silent failure would
have been a spinner.

**The button moves the dial; it does not promise the place.** `contains` is a crossing-number test
with an explicit no-guarantee for points on an edge, and the overlap boundary is exactly where two
generalised contours graze, so a place can flicker across adjacent minutes. The app widens the dial
and shows the real state at the new budget. Nothing anywhere claims the named place will be there, and
every sentence about the meet minimum is worded to survive a ±1 minute wobble.

Deliberately **not** built in this chunk: a tick mark on the dial at the meet minimum. It is the one
piece of this design that adds an instrument rather than removing one, it moves whenever either origin
moves, and it lives on the app's most heavily tuned control. It is written down in *Open questions*
and it is the first thing to cut.

### 8. The second person's cold start shows nothing they did not ask for

B opens `/s?m=1&ma=…&b=30&rt=1` cold, on a phone, with no origin of their own. **Before B has chosen
an origin the app draws no contours at all** — not the default origin's. Answering A's question with a
stranger's premise is the same lie as the circle, and `DEFAULT_ORIGIN` is a house in the Fan that has
nothing to do with the reader.

`Session.originChosen` (`multiplayer-links`' name and flag; it is `false` for exactly this state)
expresses this without making `origin` nullable across fourteen call sites and an exhaustive
20-member reducer. While it is false: the ladder prefetch for `origin` does not run, `reach` is forced
to `null`, the map frames on the partner's contour alone, and the panel is the invite. The first
`origin` action of any kind sets it true forever.

**Three visible artefacts have to be suppressed explicitly, because the default is to render them.**
Each is a named instruction in *Changes, file by file*: the origin marker is created unconditionally
in the mount-once effect and set from `props.origin` (`MapCanvas.tsx:156-173, 360-364`), so without an
instruction a draggable pin sits on the Fan house this decision just refused; `status` resolves to
`"loading"` whenever `reach` is null and `failure` is null (`App.tsx:441-447`), so `ReachReadout`
would render its skeleton pair forever behind the invite; and the sr-only map summary is written from
`reach`/`outerBand` (`MapCanvas.tsx:446-454`), so a screen-reader user would get nothing at all.

The invite panel offers three ways in, **in this order**: *Use my location* (one tap, the phone
answer), *Pick on the map*, and last a `.link-button` revealing the preset list — last because the
reader who wants the privacy-safe, snapshot-cheap path will go looking for it, and because a preset is
the only choice that costs the engine nothing.

Then the warm-up. **The first draft justified this with a bug that does not exist, and the sibling
copied the claim — both are corrected here.** The alleged failure was that a partner leg writing
`1.0` into `Session.warmed` would let `missing = reach === null && state.warmed >= 1` fire *96
duplicate contour requests*. Check it against the code: that gate calls `fetchReach(origin, outbound,
floorOutbound ?? 0)` (`App.tsx:193-207`), which asks for `bandMinutes(budget, floor)` — at most a
handful of contours for one dial position, never the ladder. And `ensureContours` deduplicates against
the module-level `inFlight` map per contour key (`isochrone.ts:397-428`), so a request that collides
with an in-flight batch joins its promise and costs the engine nothing at all. **The real exposure is
a few contours' worth of premature engine work while a snapshot is still downloading — roughly 24×
smaller than the number that was written down, and worth naming correctly because this document's
sentences become code comments.**

The design is unchanged, because the honest reasons are still good ones:

- **`warmed` must keep meaning "this device's own reach is ready."** It is read by the `missing` gate
  and shades the dial. A second leg writing into it makes it mean nothing in particular. So the
  partner's progress goes to a separate scalar, `partnerWarmed`, that no existing gate reads.
- **Sequential, yours first, from one effect.** Yours is the one the map frames on and the one that
  puts something true on screen soonest; the partner's leg then turns the overlap on. It also halves
  the peak burst against a limiter that charges **per graph expansion** (`worker/index.ts:192-207`
  calls `limiter.limit` `isochroneQueryCost` times; `proxy.ts:209-215`).
- The cost of sequencing is latency, and it is real: see *Cost*.

### 9. Two people. It does not generalise, and it should not

The geometry generalises for free — the pool test is an `AND` over N containments. Nothing else does.
N cold ladders against a per-IP limiter that charges per graph expansion; N markers on a map whose
palette has one accent; N rows on a card; a list-shaped share key instead of a scalar one; and an
empty-overlap curve that gets brutal faster than linearly, because each added person can only shrink
the region. Three people in a river city share nothing at any budget the dial has.

So: the partner is a single `Origin | null`, not an array, and the link keys are `ma`/`mb`, singular
(`multiplayer-links` decision 8 reaches the same conclusion independently). If a third person
is ever wanted the decoder change is a handful of lines and the pool change is a loop — but knip fails
you for speculative generality, and a `readonly Origin[]` with a length invariant of exactly one is a
lie told in a type.

## The contract with `multiplayer-links`

`multiplayer-links` owns the link, the invite ceremony, the privacy copy shown before a coordinate
leaves a device, `shareMeta`'s meet branch, coordinate coarsening, and the session fields that carry
a link's arrival. This spec owns the geometry, the pool, the map, the card and the panel.

**Where the two drafts disagreed, this spec conceded.** The first draft of this file invented
`Partner = { origin, coarse }`, `awaitingOrigin`, the actions `partner` / `clearPartner`, and the
query keys `m` / `o2`. `multiplayer-links` had already specified `partner: Origin | null` built by
`partnerOrigin`, `originChosen: boolean`, the actions `leaveMeet` / `dismissMeet`, and the keys
`ma` / `mb` at three decimals. **Its answer is the better one** — a plain `Origin` needs no adapter
at `cachedReach`, `pointKey` or `snapshotName`, `originChosen` reads as a fact about the reader
rather than about the app's mood, and `leaveMeet` says what pressing the button means. Every symbol
in this document now matches that file. Anything in this spec's prior draft that contradicts it is
withdrawn, not negotiable.

**What this spec is handed**, all of it available on the first paint of a meet arrival, all of it
written by `applyShare` at `useReducer`'s lazy initialiser — never by a mount effect and never by a
later dispatch, because restoring a partner through a dispatch frames the map twice:

| Value | Type | Meaning |
| --- | --- | --- |
| `Session.partner` | `Origin \| null` | Their start, from `partnerOrigin` (`id: "partner"`, `name: "Their start"`) or a `PRESET_ORIGINS` entry. Null when `ma` was absent, unparseable, or outside Richmond. |
| `Session.originChosen` | `boolean` | False for exactly one state: a fresh invite before this reader has answered. |
| `Session.meet` | `MeetArrival \| null` | `kind` (`"invite"`/`"answer"`), `mintedDay`, `partnerOutOfBounds`. |
| `INVITE_STALE_DAYS`, `epochDay` | — | The "this invite is N days old" line. |
| the three disclosure strings | — | `multiplayer-links` decision 5, rendered verbatim, before the press. |
| `invite` / `answer` URLs | `string` | Built in App by that spec; this spec decides where the buttons live. |

**Three amendments this spec asks of `multiplayer-links`.** They are small and they are binding:

1. **Add `partnerWarmed: number` and `partnerFailure: Failure | null` to `Session`**, plus the actions
   `{ type: "partnerWarmProgress"; fraction: number }` and `{ type: "partnerFailed"; failure: Failure
   | null }`. `applyShare` initialises both to `0` / `null`. They are this spec's fields and this spec
   specifies their semantics (below), but they live in a file that document owns. *Why they cannot be
   folded into `warmed` and `failure` is in decision 8 and in the failure table.*
2. **Strike the "96 duplicate contour requests" claim** in *What this hands to `meet-in-the-middle`*,
   item 2. It is not what the code does — see decision 8 for the line-by-line. The instruction it
   supports (sequence the two legs, keep `warmed` meaning one thing) is kept for the reasons stated
   there; only the arithmetic is wrong, and it would otherwise be copied into a code comment.
3. **The sender adopts its own coarsened coordinate the moment a meet link is minted.** As drafted,
   A holds their own start at five decimals while B holds A's at three, up to ~70 m apart — so the two
   devices compute *different pools and can show different counts* for the same meeting, which is
   exactly what this feature promises not to do. `multiplayer-links` already accepts this for the
   answer link ("after the answer link both people are looking at the same two coarse premises"); this
   asks it to happen one step earlier, on minting the invite, by dispatching `{ type: "origin", origin:
   customOrigin(roundTo(origin, MEET_PIN_PRECISION)) }` alongside the share. **If that is refused**,
   the divergence must be stated on screen and in *Failure and degradation* on both sides, and this
   spec's acceptance criterion 5 becomes a per-device claim rather than a shared one. **Either answer
   is acceptable; silence is not.**

**Three invariants this spec depends on and cannot enforce itself:**

1. **Coarsening happens before the coordinate becomes an `Origin`.** `pointKey` rounds to 5 decimals
   (~1.1 m) and is the identity behind the contour cache, the route cache *and* the snapshot file
   names. A link that carries 3 decimals and is then re-expanded downstream produces a different cache
   key and a different snapshot name from the one the sender used, and the app quietly warms two
   ladders ~70 m apart for what the reader believes is one place. Round once, at encode time.
2. **No free-text name ever reaches this spec.** Enforced by construction: `partnerOrigin`'s `name` is
   the literal `"Their start"` and `id` the literal `"partner"`, and a preset resolves to its own
   entry. There is no code path from a query value to a rendered name, which is what keeps this off
   `og:description` and out of the injection surface.
3. **The partner origin is inside `RICHMOND_BOUNDS` before it is written** — `applyShare` sets
   `partner: null` and `meet.partnerOutOfBounds: true`. This spec renders the refusal (see *Failure
   and degradation*); it does not re-check, because a null partner cannot generate a request.

**No seed is needed and none should be built for this half.** `shareable-spins` already writes `p`
unconditionally, so the answer link carries the result. `randomIndex`, `useSpin` and `reel.ts` are
untouched. If `multiplayer-links` ever ships a `k` seed for "spin again together", it is that spec's
feature and it must not change the draw's uniformity.

**What this spec hands back**, for `multiplayer-links` to encode: `state.partner`, `state.origin`,
`state.budgetMinutes`, `state.pickedId`. All plain session fields; no accessor is added.

## Data and types

### `src/app/meet.ts` — new

```ts
import type { Place } from "../data/places";
import type { LngLat, MultiPolygon } from "../lib/geometry";
import type { Reach } from "../lib/isochrone";

/**
 * The smallest dial budget at which at least one place is inside both people's
 * outermost contour, or why there is no such number.
 *
 * `budgetMinutes` is a DIAL budget in the same total-minutes units as
 * `Session.budgetMinutes` - already doubled for a round trip and already
 * snapped by `clampBudget` - so the notice's button and the dial cannot
 * disagree about the number printed on the button's own face. This is the same
 * discipline `suggestFix`'s `widen-budget` branch uses and for the same reason.
 *
 * `unmeasuredRungs` is how many rungs the scan could not read, because
 * `prefetchLadder` is best effort per contour: Valhalla drops a minute it
 * considers degenerate, `prefetchLadder` still resolves and still reports
 * done, and that rung is never coming. A scan that treated it as "not warm
 * yet" would leave the panel saying "Waiting on their side." forever. So the
 * scan skips it, counts it, and the copy hedges by exactly one word when the
 * count is non-zero. There is no "incomplete" outcome here: whether a warm-up
 * is still running is the CALLER's fact, read off `warmed` / `partnerWarmed`,
 * and `suggestFix` checks it before calling.
 */
export type MeetMinimum =
  | { readonly kind: "found"; readonly budgetMinutes: number;
      readonly placeId: string; readonly placeName: string;
      /** Rungs below the answer that could not be read. Usually 0. */
      readonly unmeasuredBelow: number }
  | { readonly kind: "none"; readonly unmeasuredRungs: number };

/** Both people's costs for one destination. Minutes, already round-tripped. */
export type MeetSplit = {
  readonly yourMinutes: number | null;
  readonly theirMinutes: number | null;
  /** max(yours, theirs), or null while either is unknown. */
  readonly bothByMinutes: number | null;
  /** |yours - theirs|, or null while either is unknown. */
  readonly gapMinutes: number | null;
};

/** Above this, the card says who waits. Below it, the gap is not worth a line. */
export const MEET_GAP_MINUTES = 8;

/**
 * Ascending scan of the two cached ladders. Pure over the contour reader it is
 * handed, so it is testable without the cache: App passes `cachedContour`,
 * tests pass a fixture function.
 *
 * `contourAt` returns the RAW outermost contour for one origin at one outbound
 * minute, or null when that rung is not in the cache. Raw, and not
 * `cachedReach`, for two reasons stated at length in *Algorithm*: `cachedReach`
 * WRITES into the assembled-reach LRU, and a scan across two origins would
 * evict every live entry including the two the screen is currently drawing;
 * and `cachedReach` subtracts the floor as a hole around whichever origin it
 * is given, which around the partner is meaningless geometry.
 *
 * `floorPolygons` is the reader's OWN floor contour, or null. It is applied to
 * the reader's side only, because a floor is a preference about the reader's
 * own walk - "make me go at least this far" - and has no meaning at all as a
 * hole punched around somebody else's house.
 */
export function meetMinimum(args: {
  readonly you: LngLat;
  readonly them: LngLat;
  readonly places: readonly Place[];
  readonly roundTrip: boolean;
  readonly floorPolygons: MultiPolygon | null;
  readonly contourAt: (origin: LngLat, outboundMinutes: number) => MultiPolygon | null;
}): MeetMinimum;

/**
 * Memoising wrapper. Keyed on
 * `${pointKey(you)}|${pointKey(them)}|${roundTrip}|${floorMinutes ?? "-"}` in a
 * module-level Map of at most MEET_MEMO_LIMIT entries. Only ever called once
 * both warm-ups report done, so a cached answer cannot be a snapshot of a
 * half-warm ladder. The floor is in the key because a different floor is a
 * different question.
 */
export function cachedMeetMinimum(
  args: Parameters<typeof meetMinimum>[0] & { readonly floorMinutes: number | null },
): MeetMinimum;

export function meetSplit(args: {
  readonly yourSeconds: number | null;
  readonly theirSeconds: number | null;
  readonly roundTrip: boolean;
}): MeetSplit;

/** "You'd both be there by 24 min." — null while either side is unknown. */
export function describeBothBy(split: MeetSplit): string | null;

/** "You get there 19 min before them." — null below MEET_GAP_MINUTES. */
export function describeGap(split: MeetSplit): string | null;

/**
 * The identity of a partner's reachable area, for `conditionsSignature`.
 *
 * It must change when and only when the partner's verdicts could - never per
 * render. `pointKey(origin)` plus the budget plus the band count plus the
 * rounded area is derived entirely from the assembled `Reach`, whose object
 * identity the assembled-reach LRU already keeps stable per origin + budget +
 * floor. Never derive this from a fetch counter, a timestamp or a render
 * count: `pool-reasoning` is explicit that a churning signature kills the
 * WeakMap memo AND churns `candidateKey`, which fires the spin-abort effect
 * and makes spinning impossible.
 */
export function partnerSignature(partnerReach: Reach | null): string;

/** The sr-only clause, for `announce.ts`'s array. */
export function describeMeetClause(split: MeetSplit, partnerName: string): string | null;
```

### `src/lib/isochrone.ts` — one export added

```ts
/**
 * The raw cached contour for one origin at one minute, or null. A peek: it
 * neither promotes an LRU entry nor writes one. `meetMinimum` reads up to 192
 * rungs in one pass and must not disturb either cache while doing it.
 */
export function cachedContour(origin: LngLat, minutes: number): MultiPolygon | null;
```

Four lines — `cache.peek(cacheKey(origin, minutes)) ?? null`. It exists because the obvious
alternative, `cachedReach`, is wrong here twice over, and both ways are silent:

- **It writes.** `cachedReach` inserts into `assembled` (`isochrone.ts:455-456,501`), whose
  `ASSEMBLED_LIMIT` is `LADDER.length * 2` = 192 — sized by its own comment as "two whole dials" for
  *one* origin. A scan across two origins fills it end to end and evicts the live entries, including
  the current dial position and the partner's reach. The next render re-assembles them as **new
  objects**, which defeats `bandsRef`'s reference comparison and re-uploads every contour to MapLibre,
  and misses the pool's `WeakMap` memo. That is the exact identity churn `partnerSignature`'s comment
  warns about, arriving through the back door.
- **It applies the floor as a hole around the origin it was handed.** See *Algorithm*.

### `src/app/session.ts` — modified

`multiplayer-links` owns this file's meet fields (`partner`, `meet`, `originChosen`) and its two
actions (`leaveMeet`, `dismissMeet`). This spec adds two fields and two actions on top — amendment 1
in *The contract*:

```ts
export type Session = {
  /* …unchanged, plus multiplayer-links' partner / meet / originChosen… */
  /**
   * 0 to 1 across the PARTNER's contour warm-up. Deliberately not folded into
   * `warmed`, which means "this device's own reach is ready": that scalar
   * gates the on-demand `fetchReach` (`missing = reach === null && warmed >= 1`)
   * and shades the dial, and a second leg writing into it would make it mean
   * neither thing. Two scalars, one meaning each.
   */
  partnerWarmed: number;
  /**
   * A failure on the PARTNER's leg only. Separate from `failure` because
   * `failure` is read by the on-demand fetch gate and by `status`, which
   * resolves to "error" whenever `reach` is null - so routing their engine
   * error into it would blank YOUR answer at any dial position of yours that
   * has not warmed. Read by MeetPanel and by nothing else.
   */
  partnerFailure: Failure | null;
};

export type Action =
  /* …the existing 20, plus shareable-spins' dismissShared,
     plus multiplayer-links' leaveMeet / dismissMeet… */
  | { type: "partnerWarmProgress"; fraction: number }
  | { type: "partnerFailed"; failure: Failure | null };
```

Reducer behaviour, exactly:

- `partnerWarmProgress` — sets `partnerWarmed` only. In particular it must not touch `warmed`.
- `partnerFailed` — sets `partnerFailure` only. `null` clears it, which is what a retry does.
- **`leaveMeet`** (owned by `multiplayer-links`: `partner: null`, `meet: null`, `originChosen: true`,
  `framingKey + 1`) **additionally resets `partnerWarmed: 0`, `partnerFailure: null`, and clears
  `pickedId`, `spinning`, `spinAborted`, `routeAttempt`** — the pool is about to change, so the pick
  it produced is no longer a pick from this pool. That clearing is this spec's amendment to that case,
  and it is stated because a pick surviving a pool change is a bug `pool-reasoning` spent a section on.
- **A partner only ever arrives through `applyShare`**, never through a dispatch (see *The contract*).
  `applyShare` sets `partnerWarmed: 0` and `partnerFailure: null` with the rest.
- The existing **`origin` case** sets `originChosen: true` (that spec's rule), leaves `partner` alone —
  moving your own start does not un-invite anybody — and clears `partnerFailure`, because the prefetch
  effect is about to re-run both legs.
- The existing **`clearFilters` case does not touch `partner`.** README §3's rule is that
  `clearFilters` resets exactly what `activeFilters` counts, and `activeFilters` counts the reader's
  choices about *places*. A second person is not a filter.
- `initialSession` gains `partnerWarmed: 0`, `partnerFailure: null`.


### `src/app/eligibility.ts` — amended (see *Contract amendments*)

```ts
export type ExclusionReason =
  | "out-of-reach"
  | "inside-floor"
  | "out-of-their-reach"   // NEW — outside the other person's outermost contour
  | "wrong-terrain"
  | "no-matching-vibe"
  | "kind"
  | "not-far-edge"
  | "closed"
  | "weather";

export type PoolConditions = {
  readonly reach: Reach | null;
  /**
   * The other person's reach at the same budget, or null when there is no
   * partner OR their ladder has not warmed to this rung yet. Null means the
   * reason is not applied at all: a reason with no data is inactive, never
   * "excludes everything". This is `pool-reasoning`'s most emphatic clause and
   * it applies here verbatim.
   */
  readonly partnerReach: Reach | null;
  /* …unchanged fields… */
};

export type PoolFix =
  /* …the four existing variants… */
  | { readonly kind: "widen-to-meet"; readonly budgetMinutes: number;
      readonly nearest: string; readonly recovers: number;
      /** True when a rung below this one could not be measured; hedges the copy. */
      readonly hedged: boolean }
  | { readonly kind: "no-overlap"; readonly hedged: boolean }
  /** A warm-up is still running. Never returned once both report done. */
  | { readonly kind: "meet-warming" };
```

`REASON_COPY["out-of-their-reach"]`:

| `clause(n)` | `sentence` | drawer heading |
| --- | --- | --- |
| `${n} out of their reach` | `Outside the other person's reach.` | Only in your reach |

`REASON_ORDER` gains it in third position, immediately after `inside-floor`.

### `src/ui/ResultCard.tsx` — modified

```ts
  /** Non-null in meet mode. The card renders `.result-split` instead of `.result-stats`. */
  split?: MeetSplit | null;
  /** "Their start", or a preset's own name. Never free text from a link. */
  partnerName?: string;
```

### `src/ui/ReachReadout.tsx` — modified

```ts
  /**
   * Non-null in meet mode. `partnerWarm` is false while their ladder has not
   * produced a reach at this budget yet, and it is NOT cosmetic: with it false
   * the pool is one person's, so `bothCount` would be a one-sided number and
   * the words "you can both reach" would be a claim nothing has checked. False
   * therefore keeps today's area line and appends "their side still working".
   */
  meet?: {
    readonly bothCount: number;
    readonly outerMinutes: number;
    readonly partnerWarm: boolean;
  } | null;

/**
 * NEW member. `status` today is loading | ready | error | not-configured, and
 * App resolves it to "loading" whenever `reach` is null with no failure - which
 * before the reader has chosen a start would be a skeleton pair sitting behind
 * the invite forever, promising a measurement nobody asked for. "idle" renders
 * NOTHING: no skeleton, no area, no announcement.
 */
export type ReachStatus = "idle" | "loading" | "ready" | "error" | "not-configured";
```

### `src/map/MapCanvas.tsx` — modified

```ts
  /** The other person's start, or null. Renders a second, undraggable marker. */
  partnerOrigin?: LngLat | null;
  /** Their outermost contour at the current budget, or null while warming. */
  partnerBand?: MultiPolygon | null;
  /**
   * False before the reader has chosen their own start. The local marker is
   * created unconditionally in the mount-once effect and would otherwise sit,
   * draggable, on DEFAULT_ORIGIN - a house in the Fan with nothing to do with
   * this reader, which is the exact lie the invite state exists to refuse.
   */
  originVisible?: boolean;
```

**No new endpoint, no `ProxyEnv` variable, no `wrangler.toml` change, no `.env.example` change, no
snapshot change, no `SNAPSHOT_VERSION` bump, no new dependency.** `/api/isochrone` already takes
`{location, minutes[]}` per location and already enforces `BOUNDS`, `MAX_UPSTREAM_QUERIES`,
`LADDER_BUDGET_MS` and the pinned walking speed. The partner's ladder is a second call to it. There is
no new abuse surface because there is no new surface.

## Changes, file by file

**`src/app/meet.ts` — new.** Everything above. Runtime imports: `contains` and `pointKey` from
`../lib/geometry.ts`, `LADDER` and `MAX_MINUTES` from `../lib/isochrone.ts`, `clampBudget` from
`./session.ts` (exported by `pool-reasoning`, which builds first — see *Contract amendments* 11 for
the stale sentence in `shareable-spins` that says otherwise), `formatMinutes` from
`../lib/format.ts`. It does **not** import `cachedContour`: the reader is passed in, so the module
stays pure and testable without the cache. Named `meet.ts` and not `partner.ts` because the module is
about the shared answer, not about the person.

**`src/lib/isochrone.ts` — modified.** One four-line export, `cachedContour`, and its comment. This is
the only change to the file and it adds no behaviour — see *Data and types* for why the alternative
is a cache-eviction bug.

**`src/app/session.ts` — modified.** Two fields, two actions, two reducer cases, the additions to
`multiplayer-links`' `leaveMeet` and to the existing `origin` case, two lines in `initialSession`.
`meet.ts` does not import `session.ts`'s state, only `clampBudget`, so there is no cycle.

**`src/app/eligibility.ts` — modified.** The union member, the `REASON_ORDER` slot, the `REASON_COPY`
row, the `PoolConditions.partnerReach` field, one clause in `explainPlace`, one term in
`conditionsSignature`, three `PoolFix` variants and one branch in `suggestFix`. Details in *Algorithm*.

**`src/app/App.tsx` — modified.**

- `const { origin, partner, originChosen } = state;` and `const meet = partner !== null;`.
- **The prefetch effect becomes sequential and side-aware.** One effect, deps `[origin, partner,
  originChosen]`:
  ```ts
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (originChosen) {
        await prefetchLadder(origin, (p) => {
          if (cancelled) return;
          dispatch({ type: "warmProgress", fraction: p.done / p.total });
          bumpContours();
        });
      }
      if (cancelled || !partner) return;
      // Their leg's failure is THEIR leg's failure: `failure` is read by the
      // on-demand fetch gate and by `status`, so putting an engine error from
      // the second leg there would blank the reader's own answer.
      try {
        await prefetchLadder(partner, (p) => {
          if (cancelled) return;
          dispatch({ type: "partnerWarmProgress", fraction: p.done / p.total });
          bumpContours();
        });
      } catch (cause: unknown) {
        if (!cancelled) dispatch({ type: "partnerFailed", failure: describe(cause) });
      }
    };
    run().catch((cause: unknown) => {
      if (!cancelled) dispatch({ type: "failed", failure: describe(cause) });
    });
    return () => { cancelled = true; };
  }, [origin, partner, originChosen]);
  ```
  The `await` between the two legs is the point, and the comment that goes with it must say what is
  true and only that: **`warmed` keeps meaning "this device's own reach is ready"**, and the burst
  against a limiter charged per graph expansion is halved. It must **not** repeat the withdrawn claim
  about 96 duplicate requests — see decision 8.
- `const reach = originChosen ? cachedReach(origin, outbound, floorOutbound ?? 0) : null;`
- `const partnerReach = partner ? cachedReach(partner, outbound, 0) : null;` — **the same budget, and
  deliberately no floor.** This is the one line in the file whose obvious version is wrong.
  `cachedReach` subtracts the floor contour *around the origin it is given* (`isochrone.ts:480-491`),
  so passing `floorOutbound` here punches a hole around **the other person's house**, and every place
  near their start then fails `contains(theirOuter.polygons, place)` and is reported as
  `out-of-their-reach` — *"Outside the other person's reach."* — about the places that are most
  emphatically in it. A floor is a preference about the reader's own walk ("make me go at least this
  far"), it is a fact about one walker, and it has no meaning applied to the other. Yours keeps its
  floor; theirs never has one. **A comment must say this where the line lives**, because the
  symmetrical version looks more correct and is a false statement about a real person.
- `conditions` gains `partnerReach`. Nothing else about the pool call site changes; `candidateKey`,
  `candidateIds`, `drawable`, `settledRoutes`, `poolKey`, the grace timer and the spin-abort effect all
  read `candidates` and continue to mean what they meant.
- `status` gains one clause ahead of everything else: `originChosen ? (…existing ladder…) : "idle"`.
- **The partner's route for the picked place**, a new effect keyed on `[partner, picked, routeAttempt]`:
  fetch `fetchWalkingRoute(partner, picked)` when `partner && picked && cachedRoute(partner, picked)
  === undefined`. Failures are swallowed into a dash on the card — not into `failure`, and not into
  `partnerFailure` either: a missing route to one destination is one unknown number, not a broken leg.
- `split = meet ? meetSplit({ yourSeconds: route?.durationSeconds ?? null, theirSeconds:
  cachedRoute(partner, picked)?.durationSeconds ?? null, roundTrip: state.roundTrip }) : null`.
- `dialWarm` in meet mode requires both: `isWarm(origin, m) && isWarm(partner, m)`. A rung warm on one
  side only cannot answer the question the dial is asking.
- The warm-up fraction the dial shades with becomes `meet ? (state.warmed + state.partnerWarmed) / 2 :
  state.warmed`. Display only; no gate reads it.
- `emptyPool`'s notice gains the three new `PoolFix` branches (below).
- `<MeetPanel>` is rendered inside the existing `.panel`, immediately after `<OriginPicker>`.
- `announce.ts`'s clause array gains `describeMeetClause(split, partnerName)` — see the amendment.
- `lines` gains `{ key: "meet", text: "Both walks are measured at the same pace.", tier: "assumed" }`
  when `meet`.
- `MapCanvas` gains `partnerOrigin`, `partnerBand` and `originVisible={originChosen}`.
- `ResultCard` gains `split` and `partnerName`.
- `ReachReadout` gains `meet={meet ? { bothCount: pool.included.length, outerMinutes: outbound,
  partnerWarm: partnerReach !== null } : null}`.


**`src/ui/MeetPanel.tsx` — new.** Props `{ partner: Origin | null; partnerName: string;
partnerCoarse: boolean; originChosen: boolean; meet: MeetArrival | null; warmedFraction: number;
partnerFailure: Failure | null; bothCount: number; onLeaveMeet: () => void }`. Four states, one
fixed-height block in each so the mobile sheet does not resize step by step (see *Cost*):

- **`!originChosen`** — the invite. `<p className="field-label">Both in reach</p>`, then *"Someone
  shared a starting point with you. Set where you're starting from and you'll see what's inside 30
  minutes' walk of both of you."*, then `multiplayer-links`' recipient disclosure sentence verbatim.
  The three controls, in order: **Use my location**, **Pick on the map**, and a `.link-button` *"or
  start from a landmark"* revealing the preset list. This component renders the controls; the handlers
  are `OriginPicker`'s existing ones lifted through App, so there is exactly one implementation of
  "choose an origin" in the app.
- **partner set, warming** — the partner chip plus *"Working out what's inside {N} minutes of their
  start."*
- **partner set, warm** — a read-only `.meet-chip` reading `Their start` (or the preset's name), with
  a `.meet-hint` of *"to about a block"* when `partnerCoarse` (that is, `partner.id === "partner"`),
  a count line, and an `.icon-button` with `aria-label="Remove the other person"` dispatching
  `leaveMeet`.
- **`partnerFailure !== null`** — a `.notice.is-warn` naming their side: *"Couldn't measure their side.
  {failure.message}"* with **Spin from just your side**. This is the only consumer of
  `partnerFailure`, and it is why the field exists rather than reusing `failure`.

`meet.partnerOutOfBounds` and a `mintedDay` older than `INVITE_STALE_DAYS` each render one
`.notice.is-warn` above the block; both sentences belong to `multiplayer-links`' copy and this
component only places them.

The whole component must sit inside a wrapper carrying the class `origin` **or** `.shell.is-picking`'s
exemption selector must be extended: `is-picking` dims the rail to 0.55 and kills its pointer events,
exempting `.origin` and its children, and "Pick on the map" is unusable if the panel is dimmed while
picking. Simplest correct answer: `MeetPanel`'s root is `<section className="origin meet">`.

**`src/ui/ResultCard.tsx` — modified.** When `split` is non-null the `.result-stats` `<dl>` is replaced
by `.result-split`: two `.result-split-row`s, each a `.result-split-who` label (*Your start* /
`partnerName`) and two values reusing the existing `Stat` skeleton behaviour for a pending number. Then
a `.result-split-both` line from `describeBothBy`, and `describeGap` when it is non-null. The
`.result-lines` block, the warning rows and `.result-actions` are all unchanged, and only your
directions buttons render. The card is still not a live region.

**`src/ui/ReachReadout.tsx` — modified.** Two changes, and the second is the one that keeps the
sentence honest:

- `ReachStatus` gains `"idle"`, which renders nothing at all — no skeleton pair, no area, no
  announcement. App passes it whenever `originChosen` is false.
- When `meet` is non-null **and `meet.partnerWarm` is true**, the visible line becomes
  `<strong>{pluralize(meet.bothCount, "place")}</strong> you can both reach` + `.readout-sep` +
  `{meet.outerMinutes} min each`, and the announced sentence follows it; `formatArea` is not called.
  When `meet.partnerWarm` is **false** the component renders exactly today's area line plus
  `.readout-sep` + *"their side still working"* — because the pool is one person's until their reach
  exists, and "you can both reach" over a one-sided pool is the app asserting something nobody
  checked. The imperative announcement pattern, the `commitKey` deps and the single
  `sr-only role="status"` node are untouched.

**`src/map/MapCanvas.tsx` — modified.**

- One new source `partner-band` and two new layers, **created first in the mount sequence, before
  `band-0`**, both with `beforeId: UNDER_LABELS`, so the partner renders beneath your contour:
  - `partner-band-fill` — `fill-color: "#ffb043"`, `fill-opacity: 0.06`
  - `partner-band-line` — `line-color: ACCENT_SOFT`, `line-width: weighted(1.2)`, `line-opacity: 0.55`,
    `line-dasharray: [2, 2]`
- One new marker, created unconditionally in the same mount-once effect as the existing one and hidden
  by a class when there is no partner. **It must not be created conditionally in a later effect** —
  the existing marker, its drag handler, its nudge listener and the map click handler are all
  registered inside `useEffect([])` reading props through the `handlers` ref, and adding a second
  create/destroy effect introduces an ordering problem against `readyRef` for no benefit. Element:
  `<button class="origin-marker is-partner">`, `aria-label="The other person's start."`,
  `tabIndex={-1}`, `maplibregl.Marker({ element, draggable: false, anchor: "center" })`.
- **The existing local marker gains the same hidden treatment**, driven by `originVisible`. It is
  created unconditionally at `MapCanvas.tsx:156-173` and positioned from `props.origin` at 360-364, so
  without this a draggable pin sits on `DEFAULT_ORIGIN` throughout the invite state — a house in the
  Fan, offered as the reader's start, which is the one thing decision 8 exists to prevent. One line in
  the `[props.origin]` effect: `markerRef.current?.getElement().classList.toggle("is-hidden",
  !props.originVisible)`.
- A new effect, deps `[props.partnerBand]` only, feeding `partner-band` through `smoothedForDisplay`.
  **Effects stay one-per-source** — that split exists because a shared effect re-uploaded three
  contours and the places collection on every reel tick — and the partner band is memoised by
  `cachedReach`'s stable identity, so the `WeakMap` in `smooth.ts` and the reference comparison in
  `bandsRef` both work on it exactly as they do on yours.
- A new effect, deps `[props.partnerOrigin]`, calling `setLngLat` and toggling the hidden class.
- `syncBands` in meet mode feeds slot 0 your outermost band and `EMPTY` to slots 1 and 2.
- **Framing needs a guard change, not just an extra `extend`.** The effect today reads
  `const outerBand = props.reach?.bands.at(-1)` and early-returns on `if (!map || !outerBand) return;`
  (`MapCanvas.tsx:416-420`). In the invite state `reach` is null by design, so as written the camera
  would never move and the map would sit wherever it initialised — decision 8 and criterion 2 would
  both be unimplementable. Required shape:

  ```ts
  const partnerBand = props.partnerBand;
  if (!map || (!outerBand && !partnerBand)) return;
  let bounds = outerBand ? boundsOfBand(outerBand.polygons) : null;
  const theirs = partnerBand ? boundsOfBand(partnerBand) : null;
  bounds = bounds && theirs ? bounds.extend(theirs) : (bounds ?? theirs);
  if (!bounds) return;
  ```

  `partnerBand` joins the effect's dependency array. No bbox helper is added to `geometry.ts`;
  MapLibre's `LngLatBounds.extend` accepts another bounds.
- **The sr-only summary needs the same treatment** for the same reason: it is gated on `reach` and
  `outerBand` (`MapCanvas.tsx:446-454`), so the invite state would produce no text equivalent at all
  for the one thing on screen. With no local reach it reads `Reachable on foot from ${partnerName}:
  ${formatArea(...)} within ${m} minutes.` With both it reads `${n} places you can both reach within
  ${m} minutes`.
- The canvas `aria-label` in meet mode: `Map of what is reachable on foot from ${originName} and from
  ${partnerName}`; with no local reach, from `${partnerName}` alone.
- **No new layer id may collide with `basemap.ts`.** MapLibre throws on a duplicate layer id and this
  has bitten the project once already (`place-label` is the basemap's, hence `picked-place-label`).
  Check both files. `partner-band-line`'s width goes through `weighted()` like every other width in
  this file, so the expression shape cannot drift from the ones already known to work.


**`src/styles/app.css` — modified.** No new tokens, no new hue, no new radius, no keyframes.

```css
.origin-marker.is-partner { background: transparent; border-color: var(--accent-soft);
  box-shadow: none; cursor: default; }
.origin-marker.is-partner.is-hidden { display: none; }
.meet-chip { /* .origin-chip's metrics, non-interactive: cursor default, no hover */ }
.meet-hint { font-size: 12px; color: var(--ink-3); margin: 0; }
.result-split { display: grid; gap: 8px; margin: 0; }
.result-split-row { display: grid; grid-template-columns: 1fr auto auto; gap: 4px 10px;
  align-items: baseline; }
.result-split-who { font-family: var(--mono); font-size: 10px; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--ink-3); }
.result-split-both { margin: 0; font-size: 12.5px; color: var(--ink-2); }
.result-split-gap { margin: 0; font-size: 12.5px; color: var(--ink-3); }
```

**`src/lib/sound.ts` — unchanged.** No new cue. The rule the app already follows, stated most clearly
by `shareable-spins`, is that *a cue answers a gesture, not an outcome* — which is why that spec ships
no cue on a successful copy. A partner's ladder landing, an overlap appearing and a link being joined
are all outcomes. `playPress` answers the buttons, `playTap` answers the options, `playLanding` stays
reserved as the app's one weighted moment. **Rejected** (and named so nobody re-invents them): an
"invite sent" rising pair, a "they joined" latch, and a two-voice landing for a shared spin. The last
is the tempting one, and it is refused because on this device the landing is not shared — the other
person is not here, and a sound claiming they are would be the app's first dishonest cue.

**Not touched:** `server/proxy.ts`, `worker/index.ts`, `server/vite-plugin.ts`, `wrangler.toml`,
`.env.example`, `scripts/build-reach.mjs`, `public/reach/*`, `src/lib/route.ts`,
`src/lib/geometry.ts` (no new primitive — `contains` is enough and `subtract` is forbidden here),
`src/app/reel.ts`, `src/app/useSpin.ts`, `src/data/places.ts`, `knip.json` (every new export is reached
from `App.tsx` or a test). `README.md` gains a paragraph.

## Algorithm

### The pool clause, inside `explainPlace`

Inserted in the geometry section, immediately after the existing outer/floor test and before the
terrain clause:

```
inside = contains(outer.polygons, place)
if not inside:
    if floorPolygons and contains(floorPolygons, place): reasons.push("inside-floor")
    else: reasons.push("out-of-reach")

// NEW. Only when there is a partner reach to test against. A null partnerReach
// means either no partner or a ladder that has not warmed to this rung, and in
// both cases the reason is not applied at all - the pool is your own reach and
// the panel says the other side is still working. A reason with no data is
// inactive, never "excludes everything".
if conditions.partnerReach:
    theirOuter = conditions.partnerReach.bands.at(-1)
    if theirOuter and not contains(theirOuter.polygons, place):
        reasons.push("out-of-their-reach")
```

`contains` now runs at most three times per place instead of twice. The `WeakMap` memo removes it
entirely on any render that is not a dial or filter move. The cost at `places-expansion`'s 250-place
cap is **assumed acceptable and must be measured before shipping** — *Open questions* 3.

**Note what `partnerReach` is, back in App: `cachedReach(partner, outbound, 0)`, with no floor.** The
clause above tests `theirOuter` for containment only, and the floor's `inside-floor` reason is decided
against *your* `floorPolygons` on the line above it. If the partner's reach were assembled with your
floor, `theirOuter` would carry a hole around their own front door and this clause would report
`out-of-their-reach` — *"Outside the other person's reach."* — for the places nearest them. Exactly
backwards, in confident copy, about a real person.

**`PoolReport.inReach` keeps its current meaning: *your* reach.** A place you can walk to that they
cannot is still in reach — it is in the pool's `verdicts` with `out-of-their-reach`, it is counted by
`.pool-summary`'s clause, and it is grouped in the drawer under *Only in your reach*. What the
readout names in meet mode is `included.length`, which is the both-count. Two different numbers, each
named once, exactly as `pool-reasoning` composes `.readout` and `.pool-summary` today.

### `conditionsSignature`

One term is appended, before the rules:

```
conditionsSignature(c) = [terrain, vibes.join("+"), edgeOnly,
                          floorPolygons ? "f" : "-",
                          partnerSignature(c.partnerReach),          // NEW
                          ...c.rules.filter(active).map(r => r.reason + US + r.signature)].join(US)

partnerSignature(r) = r === null ? "-"
  : [pointKey(r.origin), r.budgetMinutes, r.bands.length, Math.round(r.areaSqMeters)].join(",")
```

Every component is read off the assembled `Reach`, whose identity the assembled-reach LRU keeps stable
per origin + budget + floor. It changes when the partner moves, when the dial moves, when the floor
moves and when the ladder warms into a new rung — which is exactly the set of moments the partner
verdicts could change — and it changes at no other time. `US` is the unit separator `""`, and
`pointKey` cannot contain one.

### `suggestFix`, step 1.5

Inserted between the existing step 1 (droppable causes) and step 2 (`lower-floor`), and reached only
when step 1 recovered nothing:

```
if conditions.partnerReach !== null and counts["out-of-their-reach"] > 0:
    if not (warmed >= 1 and partnerWarmed >= 1):  return { kind: "meet-warming" }
    m = cachedMeetMinimum({ you, them, places, roundTrip, floorPolygons, floorMinutes,
                            contourAt: cachedContour })
    if m.kind === "found":
        recovers = places passing BOTH contains tests at m.budgetMinutes,
                   minus your floor, exactly as the pool computes it
        return { kind: "widen-to-meet", budgetMinutes: m.budgetMinutes,
                 nearest: m.placeName, recovers, hedged: m.unmeasuredBelow > 0 }
    return { kind: "no-overlap", hedged: m.unmeasuredRungs > 0 }
```

**`meet-warming` is returned only by the gate, never by the scan, and the gate is a state that ends.**
`warmed`/`partnerWarmed` reach 1 exactly when `prefetchLadder` resolves, whether or not every rung
landed (`isochrone.ts:582-598`), so this branch cannot become permanent. Everything the scan itself
cannot read becomes `unmeasuredRungs` and one word of hedging, never an indefinite spinner. The first
draft got this wrong in the direction that matters: it answered *"Waiting on their side."* forever
whenever Valhalla had dropped a single degenerate contour anywhere in either ladder.

**Which floor goes where.** `floorPolygons` is *your* floor contour, passed straight through from the
pool's own conditions, and it is applied to your side of the scan only. The partner's side never has
one. This is the same asymmetry as `partnerReach`'s missing floor argument, and it is what makes step
1.5 answer the *same* question the pool is answering: without it, the notice could promise "At 42
minutes, Byrd Park comes into both your reaches" for a place that sits inside your floor hole and will
still be excluded — as `inside-floor` — the moment the button moves the dial. The button's own face
would be a lie about a state the app can already compute.

**This branch may carry a `recovers` count, and the solo `widen-budget` branch still may not.** That
looks like an inconsistency and is not, and the difference is worth writing down because a later
reader will try to make them the same. `widen-budget` refuses a number because its only evidence is a
cached *route duration* while pool membership is decided by polygon *containment*, and contour
generalisation makes the two disagree at the margin. Here the evidence and the membership test are the
same operation on the same polygons, so the count is measured rather than inferred. The ±1 minute
wobble at the boundary is real, which is why the *copy* offers a budget and never promises the named
place — but the number itself is honest.

### `meetMinimum`

```
unmeasured = 0
for m of LADDER ascending:                       // up to 96 rungs, 5..100, DIAL_STEP 1
    yo = contourAt(you,  m)
    to = contourAt(them, m)
    if yo is null or to is null:
        unmeasured += 1                          // the engine has no answer here
        continue                                 // NOT "incomplete": see below
    for place of places:
        if contains(yo, place)
           and not (floorPolygons and contains(floorPolygons, place))
           and contains(to, place):
            raw = roundTrip ? m * 2 : m
            if raw > MAX_MINUTES -> return { kind: "none", unmeasuredRungs: unmeasured }
            return { kind: "found", budgetMinutes: clampBudget(raw, roundTrip),
                     placeId: place.id, placeName: place.name, unmeasuredBelow: unmeasured }
return { kind: "none", unmeasuredRungs: unmeasured }
```

Four things this deliberately does:

- **It skips a rung it cannot read, and says how many.** This is the reversal from the first draft,
  and the reasoning is the whole of decision 7: `prefetchLadder` is best effort per contour and
  resolves anyway, so "null at rung 34" after a completed warm-up means *the engine has no contour
  there*, not *wait longer*. Returning `incomplete` made an unrecoverable state look like a temporary
  one. Skipping silently would be the opposite dishonesty — reporting 41 as "the smallest" when 34 was
  never checked — so the count is carried out and one word of copy changes.
- **No binary search.** A per-place binary search over both ladders would be several times cheaper and
  is probably safe: the ladders *should* nest. But a stock Valhalla makes the proxy chunk the ladder
  into `ceil(96 / contourLimit)` requests (`proxy.ts:196-215`, `STOCK_MAX_CONTOURS = 4`), each
  building its own grid from its own `max_distance`, so nesting across a chunk boundary is not
  guaranteed by construction. An earlier draft cited "4,400 point-vs-ladder tests across 11 snapshots,
  zero non-monotone points" as evidence; there is no such script in the repo and the claim is
  withdrawn. The linear scan assumes nothing, exits early, and runs once per pair. Take the slower one.
- **No `clampBudget` before the `MAX_MINUTES` check.** `clampBudget` ends in `Math.min(MAX_MINUTES,
  …)`, so a post-clamp comparison can never fire and the app would cheerfully offer "Widen to 100 min"
  for a walk that needs 160. This is the identical trap `pool-reasoning` documents for `widen-budget`,
  and it is repeated here because the two branches are written in different files.
- **No claim of exactness anywhere in the copy it feeds.**

`cachedMeetMinimum` memoises on `${pointKey(you)}|${pointKey(them)}|${roundTrip}|${floorMinutes ?? "-"}`
in a module-level `Map` capped at `MEET_MEMO_LIMIT = 8` entries (FIFO eviction). It is called only
from the `emptyPool` branch and only once both warm-ups report done, so a cached answer cannot be a
snapshot of a half-warm ladder.

**`contourAt` is `cachedContour`, and it must not be `cachedReach`.** A full scan touches up to 192
rungs across two origins; `cachedReach` would insert an assembled entry for each into an LRU that
holds 192 total (`ASSEMBLED_LIMIT`), evicting the reader's current dial position and the partner's
reach in the process. Both would then re-assemble as new objects on the next render, re-uploading
every contour to MapLibre and missing the pool memo — a visible stutter produced by a notice
explaining why there is nothing to spin. `cachedContour` peeks and stores nothing.


### `meetSplit`, `describeBothBy`, `describeGap`

```
yourMinutes  = yourSeconds  === null ? null : (roundTrip ? yourSeconds  * 2 : yourSeconds)  / 60
theirMinutes = theirSeconds === null ? null : (roundTrip ? theirSeconds * 2 : theirSeconds) / 60
bothBy = both non-null ? max(yours, theirs) : null
gap    = both non-null ? abs(yours - theirs) : null

describeBothBy: bothBy === null ? null : `You'd both be there by ${formatMinutes(bothBy * 60)}.`
describeGap:    gap === null or gap < MEET_GAP_MINUTES ? null
                : yours < theirs
                  ? `You get there ${formatMinutes(gap * 60)} before them.`
                  : `They get there ${formatMinutes(gap * 60)} before you.`
```

Both go through `formatMinutes`, so the card, the announcement and the notice cannot drift from each
other or from the rest of the app's number voice.

### The empty-pool notices

`EmptyPoolNotice` gains three branches on `PoolFix.kind`:

- **`widen-to-meet`** — *"Nothing is inside {outerMinutes} min of both of you. At {budgetMinutes} min,
  {nearest} comes into both your reaches."* + `<button className="link-button">Widen to
  {budgetMinutes} min</button>` dispatching `{ type: "budget", minutes: budgetMinutes }`. When
  `hedged`, the second sentence becomes *"The smallest we could measure is {budgetMinutes} min, where
  {nearest} comes into both your reaches."*
- **`no-overlap`** — *"Nothing is inside 100 minutes' walk of both of you — the widest the dial
  goes."* + `<button className="link-button">Spin from just your side</button>` dispatching
  `{ type: "leaveMeet" }`. When `hedged`: *"Nothing we could measure is inside 100 minutes' walk of
  both of you."*
- **`meet-warming`** — *"Waiting on their side."* and no button. Not an answer yet, so not a fix yet.
  **This state ends**: it is gated on `warmed`/`partnerWarmed`, which `prefetchLadder` drives to 1
  whether or not every contour landed. A rung the engine never answers becomes `hedged`, not a
  permanent wait — see *Algorithm*.

## Failure and degradation

| Situation | What the reader sees |
| --- | --- |
| No partner (the ordinary case) | Nothing in this feature renders. `partnerReach` is null, `explainPlace`'s new clause does not run, `MeetPanel` returns null, the partner marker carries `is-hidden`, `partner-band` holds `EMPTY`, the readout names an area. The app is exactly the app it is today, and criterion 1 is that assertion. |
| Partner set, their ladder still warming | `partnerReach` is null, so **the pool is your own reach**, the reason is not applied, `MeetPanel` shows the warming line, and **the readout keeps naming your area with "their side still working" appended** — it must not say "you can both reach" over a one-person pool. This is `pool-reasoning`'s "a rule with no data is inactive, never excludes everything", and getting it backwards produces an empty pool with a confident-sounding reason. |
| Their ladder fails (engine error on the second leg) | `dispatch({ type: "partnerFailed" })` — **not `failed`.** `Session.failure` is read by the on-demand fetch gate (`App.tsx:194-195`) and by `status` (`App.tsx:441-447`), which shows `error`/`not-configured` whenever `reach` is null, so routing their leg's error there would blank *your* answer at any dial position of yours that had not warmed. `MeetPanel` shows the warning; the pool falls back to your own reach; their contour is simply absent. |
| Partner origin outside `RICHMOND_BOUNDS` | Refused by `applyShare` before any request exists: `partner` is null and `meet.partnerOutOfBounds` is true (`multiplayer-links` owns the check, using `geolocate`'s `insideRichmond`). `MeetPanel` renders a `.notice.is-warn`: *"Their start is outside Richmond. This app only measures walks here."* Nothing to spin from just your side is needed — the session already is one person's. |
| Partner origin has no snapshot (the common case — a link almost always carries a pin) | The full engine warm-up: 96 contours, one client request, `ceil(96 / contourLimit)` upstream expansions. `MeetPanel` says which side is working. `hasSnapshot(partner)` decides whether the wait is worth mentioning at all. |
| `originChosen` is false and the reader never chooses | No contours, no Spin, no origin marker, `status: "idle"` so no skeleton, and the invite panel stays. The app never guesses an origin on somebody's behalf. |
| Overlap empty at this budget, both warm-ups done | `widen-to-meet` or `no-overlap`, above, hedged by one word when rungs were unmeasurable. Spin is disabled with the notice wired to `aria-describedby`, as `EmptyPoolNotice` already is. |
| Overlap empty and a warm-up still running | `meet-warming`. No number is offered, because the app does not have one — and this state ends when `prefetchLadder` resolves, which it does whether or not every contour landed. |
| Valhalla dropped contours from one or both ladders | The scan skips those rungs, counts them, and every sentence it feeds gains *"we could measure"*. The app never claims completeness it does not have and never waits for a rung that is not coming. |
| A place grazes the shared boundary | It flickers between adjacent dial minutes, because `contains` is a crossing-number test with no on-edge guarantee and it is now called on two contours that meet exactly there. Accepted and stated: every sentence about the meet minimum is worded to survive ±1 minute, and the notice moves the dial rather than promising the place. |
| Partner's route to the picked place fails or is slow | Their column shows a skeleton, then a dash. `describeBothBy` and `describeGap` return null and the lines do not render. Your half of the card is complete and correct throughout. The failure reaches neither `failure` nor `partnerFailure`. |
| The reader drags their own origin during a meet session | The `origin` action fires as usual, `partner` is untouched, `partnerFailure` clears, both reaches re-derive at the new position, and the meet-minimum memo simply misses on the new key. |
| **The two devices show different counts** | Possible, and it must be said rather than discovered. `multiplayer-links` writes both origins at three decimals; until the sender adopts its own coarsened coordinate, A computes from a five-decimal start and B from A's three-decimal one — up to ~70 m apart, wider than the ~25 m grid Valhalla cuts contours on — so a place within about a minute of the boundary can be in one person's pool and not the other's. Amendment 3 in *The contract* asks for the sender to adopt the coarse coordinate at mint time, which removes this entirely. If that amendment is refused, this row is the disclosure and criterion 5 becomes a per-device claim. The *outcome* never depends on it, because the answer link carries `p`. |
| A third origin's worth of cache pressure | The contour cache is `CACHE_LIMIT = 3 × LADDER.length` = 288 = exactly three ladders, so two simultaneous origins fit with one to spare; a *third* (moving your own start twice in a meet session) evicts the oldest, and the consequence is a re-warm visible as dial shading, not a wrong answer. The **assembled**-reach cache is the tighter one — see *Cost*. |
| Offline | No new network call exists that was not already possible. Whatever is in the contour and route caches produces a complete two-sided verdict. |
| MapLibre rejects a new layer | A duplicate id throws at `addLayer`, which is a development-time failure caught by criterion 12's load check (`map.on("error")` must stay silent). Ids are checked against `basemap.ts`; widths go through `weighted()`. |

## Cost

- **Bundle — estimated, and the estimate is not the gate.** The per-file byte figures an earlier draft
  gave were guesses and are withdrawn as measurements; as a *budget* the working number is **+2.5 KB
  gzipped**, and the binding figure is criterion 13: record `gzip -9 -c dist/assets/index-*.js | wc -c`
  (MapLibre's chunk excluded) before and after, and if the delta exceeds **3 KB**, stop and find out
  why. **No new dependency.** No clipper. That refusal is the largest single cost decision here.
- **Requests per session.** One additional ladder, for the partner: one client request to
  `/api/isochrone`, costing `ceil(96 / contourLimit)` upstream graph expansions — **1** against a
  configured instance (`VALHALLA_MAX_CONTOURS` ≥ 96) and **24** against a stock one
  (`STOCK_MAX_CONTOURS = 4`, `proxy.ts:68,196-201`), under the `MAX_UPSTREAM_QUERIES = 30` ceiling.
  **The limiter is charged per expansion, not per request** — verified: `worker/index.ts:192-207`
  calls `limiter.limit({ key: ip })` `isochroneQueryCost(payload, env)` times, and that cost is
  `Math.ceil(minutes.length / contourLimit(env))` (`proxy.ts:203-215`). Plus one `/api/route` per pick.
  **The engine cost of a session genuinely doubles, and it doubles in the expensive direction**,
  because `PRESET_SNAPSHOTS` is a closed set of 11 filenames and a link almost always carries a pin.
- **Latency, which is the cost the request arithmetic hides.** The two legs are sequential by design,
  so on a cold pair — two pins, no snapshots, a stock Valhalla — **the overlap, which is the entire
  feature, cannot appear until two full ladders have completed one after the other.** Your side comes
  up first and is true on its own, which is why yours goes first; but "both in reach" is the second
  half of a serial wait. That is the strongest practical argument for putting `PRESET_ORIGINS` where
  the second person can find it: a preset has a baked snapshot, costs the engine nothing, and collapses
  its half of the wait to a file download.
- **Cost is charged per person, not per session.** The limiter charges `cf-connecting-ip`, and in the
  common flow each device warms its own side plus one partner ladder. There is no design here where
  one device pays for both people's engine work.
- **The assembled-reach cache is the tight one, and this feature is what tightens it.**
  `ASSEMBLED_LIMIT = LADDER.length * 2` = 192, sized by its own comment as "two whole dials" for **one**
  origin, specifically so that a scrub to the end of the dial does not evict the position it started
  from. In meet mode two origins share those 192 entries, and with a floor set the key space doubles
  again (the key is `${cacheKey}|${floorMinutes}`). A full-dial scrub in a meet session with a floor
  can therefore evict the positions it started from — the exact regression that comment exists to
  prevent. **Two acceptable resolutions, and the implementer must pick one in the PR body:** raise
  `ASSEMBLED_LIMIT` to `LADDER.length * 4` (the entries are three references and a number; the cost is
  bookkeeping, not geometry), or measure a full scrub in meet mode with a floor and show that
  re-assembly is not visible. Doing neither is not an option. Separately, `meetMinimum` must not
  contribute to this at all — it reads `cachedContour`, which stores nothing.
- **Build time.** Zero. No generator, no new script, no snapshot regeneration, `SNAPSHOT_VERSION`
  untouched.
- **Render.** One extra `contains` per place when a partner reach exists, removed on non-dial renders
  by the existing `WeakMap` memo. `meetMinimum` runs once per pair, behind the memo, only when the
  pool is empty and both warm-ups are done. Both costs are **assumed acceptable and unmeasured** —
  *Open questions* 3 is the check.
- **Map.** One new source and two new layers, each with its own effect on its own dependency, so a
  reel tick still re-uploads nothing. Slots 1 and 2 are fed `EMPTY` in meet mode, so the *net* number
  of contour uploads goes **down**.
- **Hosting.** Nothing new. No binding, no KV, no Durable Object, no `wrangler.toml` line. `/s` keeps
  its uncharged, unmetered property because this feature adds nothing to it.
- **Mobile re-framing.** `framePadding` and the rail `ResizeObserver` measure `.rail` live with 180 ms
  of debounce, and the invite is a multi-state block. Each state must render at a **fixed height** so
  the sheet does not resize on every transition and trigger repeated 400 ms camera re-frames. This is
  a real constraint on `MeetPanel`'s markup, not a nicety.


## Tests

### `src/app/meet.test.ts` — new (`node --test`, `.ts` import extensions)

Fixtures at the top, declared once:

```ts
import type { MultiPolygon, Ring } from "../lib/geometry.ts";

/** An axis-aligned square as a one-polygon MultiPolygon, in degrees. */
const square = (cx: number, cy: number, half: number): MultiPolygon => {
  const ring: Ring = [[cx - half, cy - half], [cx + half, cy - half],
    [cx + half, cy + half], [cx - half, cy + half], [cx - half, cy - half]];
  return [[ring]];
};

const YOU  = { lng: 0, lat: 0 };
const THEM = { lng: 1, lat: 0 };
/** A contour reader: side -> minute -> outermost polygon. Missing = the engine has none. */
const ladder = (centre: LngLat, radiusAt: (m: number) => number | null) =>
  (o: LngLat, m: number): MultiPolygon | null => {
    if (o.lng !== centre.lng) return null;
    const r = radiusAt(m);
    return r === null ? null : square(centre.lng, centre.lat, r);
  };

const MIDPOINT = { id: "mid", name: "Midpoint", lng: 0.5, lat: 0, tags: ["park"] };
const NEAR_YOU = { id: "near", name: "Near You", lng: 0.1, lat: 0, tags: ["park"] };
```

1. **"the pool is the intersection"** — `derivePool` with `reach` = square(0,0,1) and `partnerReach` =
   square(1,0,1): `MIDPOINT` (at 0.5) is included; `NEAR_YOU` (at 0.1) is excluded with
   `reasons === ["out-of-their-reach"]`.
2. **"a null partner reach applies no reason at all"** — same places, `partnerReach: null`: both
   included, `counts["out-of-their-reach"] === 0`. The single most important assertion in this file.
3. **"out-of-reach beats out-of-their-reach in the order"** — a place outside both reports
   `["out-of-reach", "out-of-their-reach"]`, in that order, and `counts` increments `out-of-reach`
   only.
4. **"inReach still means your reach"** — three places inside yours, two of them outside theirs:
   `inReach === 3`, `included.length === 1`.
5. **`REASON_ORDER` / `REASON_COPY` totality** — the existing `pool-reasoning` test 1 must still pass
   with nine members, and `REASON_ORDER.indexOf("out-of-their-reach") === 2`.
6. **"partnerSignature is stable across renders and moves with the reach"** — two calls with the same
   `Reach` object give the same string; a `Reach` at a different budget, a different origin, a
   different band count or a materially different area gives a different one.
7. **"a partner change churns the pool memo exactly once"** — `poolReport` returns the identical
   object for two calls with the same partner reach reference, and a different object when only the
   partner reach changes.
8. **`meetMinimum` finds the first overlapping rung** — your radius `m / 100`, theirs `m / 100`
   centred at lng 1: the squares first both contain `MIDPOINT` at a computable minute; assert the
   returned `budgetMinutes` equals that minute for `roundTrip: false` and twice it for `roundTrip:
   true`, `placeId === "mid"`, and `unmeasuredBelow === 0`.
9. **`meetMinimum` returns `none` when nothing ever overlaps** — a place at lng 5 with radii capped
   below reach; `unmeasuredRungs === 0`.
10. **`meetMinimum` returns `none` rather than a budget over the dial** — `roundTrip: true` with a
    first overlap at 60 outbound minutes (raw 120 > `MAX_MINUTES`). This is the case a post-clamp
    check silently passes, because `clampBudget(120, true)` is 100.
11. **`meetMinimum` skips a rung the engine has no answer for and says so** — a reader returning null
    at minute 12 while the true first overlap is 40: assert `kind === "found"`, `budgetMinutes` 40,
    **and `unmeasuredBelow === 1`**. This is the regression test for the first draft's bug, where the
    same input produced a permanent *"Waiting on their side."* The assertion has two halves and both
    matter: the answer is given, and the gap is disclosed.
12. **`meetMinimum` applies the floor to your side only** — `floorPolygons` = square(0,0,0.2)
    containing `NEAR_YOU`: with only `NEAR_YOU` in `places`, the scan never reports it however wide
    both squares grow. Then the mirror assertion, which is the one that pins the asymmetry: a place
    inside a hypothetical floor *around the partner* — square(1,0,0.2) — **is** reported, because the
    partner has no floor.
13. **`meetMinimum` early-exits** — instrument the reader with a call counter and assert it is not
    called for rungs above the answer.
14. **`cachedMeetMinimum` memoises on the pair and the floor** — the same two origins hit the memo;
    swapping which is which does not (the scan is symmetric in result but the key is not, and
    asserting this pins the key shape); the same pair with a different `floorMinutes` misses; a ninth
    distinct key evicts the first (`MEET_MEMO_LIMIT = 8`).
15. **`cachedMeetMinimum` stores nothing in the reach caches** — call it with a reader that counts
    calls, then assert `cachedReach(you, 30, 0)` returns the **same object reference** it returned
    before the scan. This is the test for the eviction hazard in *Cost*; it fails if anybody swaps
    `cachedContour` back to `cachedReach`.
16. **`meetSplit` doubles for a round trip and nulls through** — one side null gives `bothByMinutes ===
    null` and `gapMinutes === null`.
17. **`describeBothBy` uses `formatMinutes`** — the string for 1440 seconds contains exactly what
    `formatMinutes(1440)` produces, asserted by composition rather than by a literal.
18. **`describeGap` is silent below the threshold** — a 7-minute gap returns null; an 8-minute gap
    returns a sentence naming who waits, and the 19-minute case names the other direction when
    reversed.
19. **`describeMeetClause` returns null with no split**, so the announcement array does not gain an
    empty clause.

### `src/app/eligibility.test.ts` — extended

20. **`suggestFix` prefers a droppable cause over widening** — an empty pool with a vibe chip
    recovering 3 and an overlap that also exists: returns `drop-rule`, not `widen-to-meet`. The
    reader's own chip is the thing they meant.
21. **`suggestFix` returns `widen-to-meet` with a measured `recovers`** — nothing overlaps at the
    current budget, the scan finds one at 42: the returned `recovers` equals the number of places
    passing both `contains` tests *and* the floor test at that budget, `hedged === false`, and the
    branch is reached only after step 1 recovers nothing.
22. **`suggestFix` returns `meet-warming` only while a warm-up is running** — `partnerWarmed: 0.5`
    gives `meet-warming`; the same conditions with `partnerWarmed: 1` and a ladder full of holes give
    `no-overlap` with `hedged: true`, **never `meet-warming`**. The pair is the point: the first draft
    would have returned `meet-warming` for both.
23. **`suggestFix` returns `no-overlap` when nothing overlaps under the dial's maximum.**
24. **`suggestFix`'s proposed budget survives the floor** — with a floor set, every place counted in
    `recovers` is a place `derivePool` at `budgetMinutes` actually includes. Asserted by calling
    `derivePool` at the proposed budget and comparing `included.length` to `recovers`. This is the
    test that the notice and the pool answer the same question.

### `src/app/session.test.ts` — extended

25. **`partnerWarmProgress` writes only `partnerWarmed`** — in particular it does not move `warmed`,
    which is the scalar the on-demand fetch gate reads, nor `failure`.
26. **`partnerFailed` writes only `partnerFailure`** — and `status` computed from the resulting
    session is unaffected. This is the assertion that a failure on their leg cannot blank your answer.
27. **`leaveMeet` returns a session that differs from a never-partnered one only in `framingKey`**,
    and clears `pickedId`, `spinning`, `spinAborted`, `routeAttempt`.
28. **`origin` sets `originChosen`, preserves `partner`, and clears `partnerFailure`.**
29. **`clearFilters` preserves `partner`** — README §3's rule, asserted.

Existing suites must pass unchanged. `reel.test.ts` and `useSpin`'s coverage in particular are
untouched, which is the check that this did not leak into the draw.

## Acceptance criteria

Each is observable by a named action with a named result. "Verified by" means someone can do it.

1. **With `partner === null`, every rendered byte and every request is identical to before this
   change.** Verified by: load `/` on a default session, save the `.readout` text, the sr-only summary
   and the network panel's request list; compare against the same three captured on the previous
   build. Zero differences.
2. Opening a meet link with no `mb` shows the invite panel with *Use my location*, *Pick on the map*
   and the preset reveal in that order, and: **no `/api/isochrone` request is issued at all** (network
   panel), **no origin marker is on the map** (only the partner's, and it does not drag), the readout
   area is **empty, not a skeleton**, and the camera has framed the partner's contour — verified by
   the map centre being within the partner's outer band, not at `DEFAULT_ORIGIN`.
3. Choosing an origin from the invite panel issues your `/api/isochrone` call and **the partner's does
   not start until yours has responded** — verified in the network panel: the two calls do not overlap
   in time.
4. During the partner's warm-up the pool is your own reach, `counts["out-of-their-reach"]` is 0, and
   the readout shows **the area line plus "their side still working"** — never a "you can both reach"
   count. It is never the case that a warming partner empties the pool.
5. With both ladders warm, `.readout` reads `N places you can both reach · 30 min each`, where `N`
   equals `PoolReport.included.length` and equals the number of amber dots on the map. (If contract
   amendment 3 is refused, this is asserted per device and the divergence row in *Failure and
   degradation* is required copy.)
6. A place inside your reach and outside theirs is dimmed, still clickable, opens a result card, and
   the card carries exactly one `.result-warning` reading *"Outside the other person's reach."*
7. The drawer groups those places under a `field-label` heading reading `Only in your reach (N)`, and
   `.pool-summary` carries the clause `N out of their reach`.
8. **With a floor set, no place within the floor of the *partner's* start is reported as
   `out-of-their-reach`.** Verified by: set a floor of 10 minutes, pick a partner preset, and click a
   place two minutes' walk from *their* start — the card shows `inside-floor` (it is inside *your*
   floor only if it is), and never "Outside the other person's reach." This is the criterion for the
   `cachedReach(partner, outbound, 0)` line.
9. The result card in meet mode shows two rows of stats, a *"You'd both be there by …"* line whose
   number equals `max` of the two out-and-back figures on screen, a gap line only when the gap is at
   least 8 minutes, and **one** set of directions buttons — `.result-actions` still holds three rows
   and does not scroll horizontally at 320 px.
10. Emptying the overlap by shrinking the dial, with both warm-ups done, produces a notice naming a
    budget; pressing the button moves the dial to exactly the number on the button's face, and **the
    pool at that budget is non-empty** — the promise the button made is kept — with no further request.
11. With two origins whose reaches never meet under 100 minutes, the notice reads *"Nothing is inside
    100 minutes' walk of both of you"* and offers **Spin from just your side**, which restores the
    one-person app.
12. **A meet session in which the engine dropped a contour never shows a permanent wait.** Verified in
    dev by stubbing one ladder rung to reject: the panel reaches a `no-overlap` or `widen-to-meet`
    sentence containing *"we could measure"*, and *"Waiting on their side."* is gone within one
    warm-up.
13. A partner origin outside `RICHMOND_BOUNDS` produces no `/api/isochrone` call for it (network
    panel) and a notice naming Richmond rather than a generic engine failure.
14. **An engine failure on the partner's leg leaves your side working.** Verified by stubbing the
    second `/api/isochrone` to 500 while the dial sits on a position of yours that has not warmed:
    `MeetPanel` shows the warning, and the readout shows loading-then-ready rather than `error`.
15. Both markers are visible and distinguishable on a 390 px viewport; the partner's cannot be
    dragged, cannot be focused, and does not respond to arrow keys. The map draws two outlines and no
    inner bands, and `map.on("error")` fires nothing on load.
16. `npm run build`'s gzipped app JS grew by **no more than 3 KB**, with before and after figures in
    the PR body, and the PR body names which of *Cost*'s two `ASSEMBLED_LIMIT` resolutions was taken.
    No new dependency appears in `package.json`.
17. `npm run typecheck` is clean, and adding `"out-of-their-reach"` to `ExclusionReason` without
    adding it to `REASON_COPY` fails it. `npm test` is clean, and omitting it from `REASON_ORDER`
    fails `pool-reasoning`'s test 1.
18. `npm run lint` (eslint + oxlint anti-slop + knip) is clean: no `unknown` at a boundary, no type
    assertion without a `SAFETY:` comment, no dead export.
19. `subtract()` appears nowhere in `src/app/meet.ts` and no polygon boolean operation exists anywhere
    in the diff. Verified by grep, and stated as a criterion because an implementer will be tempted.
20. The screen-reader line for a meet result reads once per settled pick and includes both walks;
    scrubbing the dial still announces once per commit.


## Contract amendments

Each of these changes a document another person owns. They are stated as amendments, with the spec,
the section and the change named, because a spec that quietly invalidates a sibling is how two
implementers produce two pools.

### `pool-reasoning` — five amendments

1. **§Data and types, `ExclusionReason`.** Add `"out-of-their-reach"`. Nine members, not eight.
   (README §2.3c struck `hours-unknown` to get to eight; this restores the count for a different
   reason, and that reason is geometry.)
2. **§Data and types, `REASON_ORDER`.** Insert it in third position, immediately after
   `inside-floor` and before `wrong-terrain`. The stated rationale — geometry first, then the
   reader's own chips — decides this; a partner's reach is geometry the walker cannot argue with.
3. **§Data and types, `REASON_COPY`.** Add the row in *Data and types* above.
4. **§Data and types, `PoolConditions`.** Add `readonly partnerReach: Reach | null` as a first-class
   sibling of `reach`. **Not** a `PoolRule`: a rule is evaluated after the reader's chips and would
   report "wrong terrain" as the primary reason for a place three miles from the other person.
5. **§Algorithm, `explainPlace` / `conditionsSignature` / `suggestFix`.** One clause in the geometry
   section, one term in the signature, one branch (step 1.5) in `suggestFix`, and three new `PoolFix`
   variants. The `widen-budget` branch keeps its refusal to carry a `recovers`; `widen-to-meet`
   carries one, and *Algorithm* above states why the two are not inconsistent.

### `multiplayer-links` — three amendments

These are restated from *The contract*, where the reasoning lives.

6. **§Data and types, `src/app/session.ts`.** Add `partnerWarmed: number` and `partnerFailure: Failure
   | null` to `Session`, the actions `partnerWarmProgress` and `partnerFailed`, and their
   initialisation in `applyShare` and `initialSession`. Extend the `leaveMeet` case to reset both and
   to clear `pickedId` / `spinning` / `spinAborted` / `routeAttempt`; extend the `origin` case to clear
   `partnerFailure`.
7. **§What this hands to `meet-in-the-middle`, item 2.** Strike the "96 duplicate contour requests"
   claim. The gate it describes (`missing = reach === null && warmed >= 1`) calls `fetchReach`, which
   asks for `bandMinutes(budget, floor)` — a handful of contours for one dial position — and
   `ensureContours` deduplicates per contour key against `inFlight`, so a collision costs nothing.
   The instruction (sequence the legs, keep `warmed` single-meaning) stands; the arithmetic is wrong
   by roughly 24× and would otherwise become a code comment.
8. **§Decision 4 / §Cost.** The sender adopts its own coarsened coordinate when a meet link is minted,
   so both devices compute from the same premises. If refused, the divergence is required copy on both
   sides — see *The contract*, amendment 3, and the divergence row in *Failure and degradation*.

### `shareable-spins` — two amendments and one correction

9. **§Data and types, `src/app/session.ts`.** `applyShare` gains responsibility for the meet fields.
   The mechanics and the field definitions belong to `multiplayer-links`; the two extra scalars are
   this spec's, per amendment 6. `applyShare` remains the lazy `useReducer` initialiser and must
   remain atomic — restoring a partner through a later dispatch would frame the map twice.
10. **§The availability contract.** `shareCacheKey` still returns `null` for any pin origin, and a meet
    link almost always carries at least one pin, so nearly every meet link is rendered fresh at the
    edge and never stored. **Accept that and say so in `multiplayer-links`' cost section. Do not relax
    the rule to start caching coordinates** — an unbounded key space a scraper can mint entries in is
    exactly what that rule exists to prevent.
11. **Correction, not a request:** `shareable-spins` §Algorithm states that "`clampBudget` and
    `clampFloor` stay module-private in `session.ts`". That sentence is **superseded by
    `pool-reasoning`**, which exports `clampBudget` (its §Changes, file by file) so `suggestFix` can
    snap a proposed budget onto the dial's notches. `pool-reasoning` builds first, so the export
    exists by the time either of these chunks lands. **An implementer must not un-export it while
    working from the stale sentence.** `clampFloor` is unaffected and stays private.

### `docs/plans/README.md` — two amendments

12. **§2.5, `ResultLine`.** The `key` union gains `"meet"`, ordered last: `conditions`, `light`,
    `hours`, `handoff`, `meet`. Its one line is *"Both walks are measured at the same pace."* with
    `tier: "assumed"`, and it renders only in meet mode.
13. **§2.8, the announcement clause array.** One clause from `describeMeetClause` is **inserted
    between duration-and-distance and climb** — position 3 of what becomes 9, not appended. (The first
    draft said "appended after duration-and-distance", which named two different positions in one
    sentence; §2.8's order is tier, duration-and-distance, climb, light, hours, conditions, pool
    verdict, shared prefix.) It sits with the duration facts because it *is* one: the two walks to the
    same place. It returns `null` outside meet mode, so the worst-case sentence grows by one clause
    only for a reader in a two-person session. §2.8 already flags that somebody must listen to the
    worst case out loud before v0.5 ships; this adds one clause to that listen.

### `README.md` (the repo's own) — one paragraph

Under the feature list: *"Two people can compare reachable areas from a shared link — the pool
becomes what you can both walk to, both walks are shown, and when nothing overlaps the app says the
smallest budget at which something does."* Plus, in the honesty section, the sentence about one pace.


## Open questions

Items 3 to 8 are **unverified claims this document previously stated as fact.** Each is now written as
an assumption with the check that must precede the work that depends on it. Nothing in the design
rests on a number nobody produced.

1. **Should the dial carry a tick at the meet minimum?** A single unlabelled mark, named in the dial's
   `aria-valuetext`, would turn the threshold from a notice into a persistent instrument. It is also
   the only part of this design that *adds* an instrument, it moves whenever either origin moves, and
   it lives on the app's most heavily tuned control. **Deliberately not specified.** If it is built it
   is built last, behind everything else, and it should be cut at the first sign of jitter.
2. **Is `MEET_GAP_MINUTES = 8` the right threshold?** A judgement, not a measurement. Eight minutes is
   roughly half a kilometre at 3.69 km/h and is the point at which one person is plausibly waiting
   outside. A person should look at the card with a 6-minute gap and a 12-minute gap and decide.
   Nothing else depends on the number.
3. **Unverified: the cost of the two-sided sweep and of `meetMinimum`.** The withdrawn figures were
   0.040 ms for 61 places × 2 `contains`, and 12.8 ms / 3–4 ms for the scan. No script, machine or
   method was ever named for them. **Check before shipping:** bracket `derivePool` with
   `performance.now()` at `places-expansion`'s 250-place cap with a partner reach and every sibling
   rule active during a dial scrub, and bracket `cachedMeetMinimum`'s first (uncached) call on a real
   pair of pins. Record both in the PR body. The memo is the mitigation, not the proof. If the scan
   turns out to be tens of milliseconds, it is still once per pair and off the scrub path — but the
   *number* has to exist before the sentence claiming it is small does.
4. **Unverified: the clipper bundle sizes** (~16.4 KB for `@turf/intersect`, ~9.3 KB for
   `polygon-clipping`, ~5–7 KB for `martinez`). **Check only if the refusal is ever reopened:**
   `npx esbuild --bundle --minify` each entry point and `gzip -9` the output. The refusal itself
   stands on the failure mode, which *is* verified — the "Unable to complete output ring" issue class
   ([#49](https://github.com/mfogel/polygon-clipping/issues/49),
   [#105](https://github.com/mfogel/polygon-clipping/issues/105),
   [#139](https://github.com/mfogel/polygon-clipping/issues/139),
   [#140](https://github.com/mfogel/polygon-clipping/issues/140)) against snapshots this repo ships
   with 2–17 consecutive-duplicate vertices per 100-minute ring, reproducible by the one-liner in
   *The decision* item 4.
5. **Unverified: every claim in the Canvas2D upgrade path** — evenodd's agreement with `contains`,
   `destination-in`'s pixel fidelity, `ImageSource.setCoordinates`' Mercator projection of the quad,
   and single-zoom magnification. Nothing in `src/map/` exercises any of them. They are the checklist
   for question 6, not a costing.
6. **Should the overlap ever be drawn as a real region?** The raster mask is the only refused option
   refused on taste rather than on correctness or weight. The trigger to reopen it: if readers in
   testing cannot tell where the shared region is from two outlines and a cluster of dots. That is a
   look-at-it decision and it belongs to a person, not to an implementer. Item 5's four checks come
   first.
7. **Unverified: `line-dasharray` legibility.** Does the dash read as "theirs" at a phone's pixel
   density, or as noise? The alternative within the locked palette is a solid `--accent-soft` line at
   lower opacity. **Check:** render both on a 390 px viewport at the 30-minute rung with two real
   preset origins and pick one. Ten minutes with a phone settles it.
8. **Unverified: does the mobile sheet stay still through the invite panel's states?** The
   `ResizeObserver` debounces 180 ms and the camera eases 400 ms, so a block that grows twice during a
   cold start can re-frame the map twice while the reader is reading. **Check:** open a meet link on a
   390 px viewport with a cold pin partner and watch the camera. If it moves, fix it by giving the
   states one height, not by lengthening the debounce.
9. **Also carried, not resolved: the route LRU's size.** `elevation-profile` proposes `MAX_ENTRIES
   600`; the checked-in `src/lib/route-store.ts:41` is **800**. This spec's decision 3 (one partner
   route per pick, no prefetch) is what makes the number not matter here — one extra entry per pick
   against either figure. Named so nobody re-derives a doubled-route-cache argument from a value that
   has not landed.
10. **Does the "same pace" admission need to be louder than one assumed line?** One person walks at
    5 km/h and another at 2.5, and the app's answer is wrong for both of them by the same amount in
    opposite directions. The honest fix is a per-person speed, which is a `server/proxy.ts` policy
    change and new abuse surface on the one endpoint that costs real graph expansions. Somebody has to
    decide whether the admission is enough or whether this feature should not ship until the policy
    layer can express two walkers. This spec's position is that the admission is enough, because the
    overlap is a blunt region and one pinned pace is a stated assumption rather than a hidden one — but
    it is a position, not a fact.
