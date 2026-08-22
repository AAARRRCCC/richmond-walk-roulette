# v0.5 — the eleven specs as one plan

**Status:** plan of record for `docs/plans/`. Eleven specs, one build.

The eleven documents beside this one were each written as if it were the only one. That is the
right way to write a spec and the wrong way to build from eleven of them: four of them delete the
same function, three of them invent the same clock under three different names, two of them add
the same field to `Place` with two different spellings, and seven of them add a line to the same
result card. The last two go further and each concede a naming argument to the other, which leaves
an implementer with two documents that both say "the other one wins" and no answer. This file is
the arbitration. Where two specs disagree it says which one changes, and it says so here rather
than leaving it to whoever lands second — because the failure mode is not a merge conflict, which
is loud, but two implementers each following their own document and producing two candidate pools,
two notions of "now", and a card that contradicts itself.

Read this first. Then read the spec you are implementing, and treat its `## Depends on` section
and this file's **Conflicts** table as amendments to it.

---

## 1. The shape of v0.5

The app today answers one question, and it answers it honestly: **where can you actually walk to
in the time you have.** Not where a circle says you can. That is the whole argument, it is
measured in the README's own table, and it is worth more than everything in this plan put
together.

But it is a question about geometry, and a walk is not a geometry problem. It is a thing you do
at four in the afternoon in August, from where you happen to be standing, with an hour before it
gets dark and a wall of weather coming up the James. The app knows none of that. It will draw a
confident ninety-minute contour at seven in the evening in November and send you to Belle Isle on
unlit gravel. It will pick you a market that shut on Sunday. It will offer a museum in the middle
of a thunderstorm and a hill in a heat advisory. It will tell you the terrain of a *dot* when what
you feel is the terrain of a *route*. And when it has nothing to offer it will say "Nothing
matches inside 25 minutes" and leave you to guess which of the six things you touched did it.

Every one of those is the same shape of failure. The app holds a fact the user has to supply from
memory, and when the app is wrong it is wrong silently.

So v0.5 is not nine features. It is one change made nine times: **the app stops deciding on
geometry alone and starts deciding on conditions, and every condition it applies is named on
screen.** Sunset clamps the dial and says the deadline. The forecast trims the budget and says
what it trimmed and why. Hours are judged at the minute you would arrive, not now, and say
whether they came from OpenStreetMap or from an assumption. Climb is measured from *your* origin
along the route the map is already drawing, not typed next to a coordinate. Every place the pool
dropped is counted, grouped and attributable to one named cause with a button that undoes it. The
list of destinations grows past downtown so the outer contours have something in them, and gains a
second tier for the things that are a reason to walk a particular way rather than a place to spend
an afternoon. Your phone can say where you are, with a refusal when the fix is too coarse to draw.
The spin becomes a link somebody else can open. And the walk hands off to whichever map is on your
phone, admitting that the other app will disagree about the minutes.

The one-sentence version, since it will be needed for a README paragraph: **v0.5 turns "how far
can you walk" into "what walk should you take right now", and refuses to make a single one of
those judgements silently.**

**And then two specs that are a different kind of feature.** `multiplayer-links` and
`meet-in-the-middle` were written after the nine and they do not fit the sentence above, because
they are not about conditions at all. The nine make one person's answer more honest. These two make
the answer belong to two people: one person presses a button and gets a link, the other opens it
and sets their own start on their own device, and the pool stops being *what you can walk to* and
becomes *what you can both walk to*.

It is the same refusal, one level up. The circle is a lie about one walker; the midpoint is the
same lie about two. Every product in this space picks a point halfway between two addresses and
searches around it, and for two Richmonders on opposite banks the halfway point is in the James.
There is no middle. There is an overlap, and the app can already decide membership in it exactly —
`contains()` handles multipolygons and holes, the contour cache is keyed per origin,
`/api/isochrone` is per-location — so the geometry of the whole thing is one extra point-in-polygon
test per place. What it cannot do is draw that overlap as a polygon or state its area, and it says
so plainly rather than buying a clipper that fails on the rings this repo already ships.

Do not let that inflate. It is one feature in two documents, it is two people and never three, it
adds no endpoint, no binding, no dependency and no server that ever holds both coordinates at once,
and it is last in the build order because a second origin is a change to what a `Session` *is*. The
reason it earns a place at all is the sentence it can say when two people share nothing at thirty
minutes: the smallest budget at which they *do* share something, computed in a few milliseconds
from ladders the app has already cached. That is a real number about the real network, and it is
the same argument as the contour — measured, not assumed, and named on screen.

Two things that are *not* the thesis, and must not become it. Nothing in v0.5 ranks or weights the
draw — `randomIndex(candidates.length)` stays uniform in every one of the eleven, and both meet
specs restate it, because a roulette that secretly prefers the museum is not a roulette, and one
that quietly prefers the *fair* place is not one either. And nothing in v0.5 hides a place to make
a story tidier: every exclusion is counted, every withdrawn rule is named, and `unknown` renders as
absence rather than as reassurance.

---

## 2. Shared plumbing

Everything more than one spec needs. Each is built **once**, **first**, and by the spec named as
its owner. Where two specs specified the same thing differently, the resolution is stated and the
loser is named — that spec is amended by this file and does not need rewriting.

### 2.1 The clock and the conditions model

**Owner:** `daylight-budget`. **Consumers:** `weather-filters`, `opening-hours`, `pool-reasoning`
(indirectly, through rule signatures).

Three specs each described a minute-hand. `daylight-budget` calls it `useConditions` in
`src/app/conditions.ts` + `src/app/useConditions.ts`; `weather-filters` calls it `useNow(frozen)`
in `src/app/clock.ts`; `opening-hours` consumes `daylight-budget`'s spelling. Two of three agree,
and the third's version cannot express the thing the other two need (a `Daylight` with a phase, an
`arrivalMs` seam, a clock offset). So:

**`daylight-budget`'s spelling is the one that ships. `weather-filters` is amended.** Its
`src/app/clock.ts` and `src/lib/sun.ts` contracts are deleted from that spec; it reads
`useConditions` and `solarEvents` like everyone else, and its stated fallback of writing
`clock.ts` itself never fires.

The interface, exactly:

```ts
// src/lib/solar.ts — owned by daylight-budget
export type SolarEvents = {
  day: string;                    // Richmond-local YYYY-MM-DD
  civilDawnMs: number | null;
  sunriseMs: number | null;
  solarNoonMs: number;
  sunsetMs: number | null;
  civilDuskMs: number | null;
};
export function solarEvents(atMs: number, lat: number, lng: number): SolarEvents;
export type SunTimes = { sunrise: Date; sunset: Date };
export function sunTimes(at: Date, point: LngLat): SunTimes | null;

// src/app/conditions.ts — owned by daylight-budget
export type Conditions = {
  atMs: number;                       // corrected by clockOffsetMs, advances in whole minutes
  light: Daylight;                    // src/app/daylight.ts
  weather: WeatherReport | null;      // ADDED BY weather-filters; null until it lands
};
export type CapReason = "daylight" | "rain" | "storm" | "heat" | "cold";
export type TimeCap = { minutes: number; reason: CapReason; untilMs: number };
export function mergeCaps(caps: readonly (TimeCap | null)[]): TimeCap | null;
export function setClockOffset(deltaMs: number): void;
export function clockOffsetMs(): number;
export function arrivalMs(atMs: number, outboundSeconds: number): number;

// src/app/useConditions.ts — owned by daylight-budget
export function useConditions(origin: LngLat, frozen: boolean): Conditions;
```

Three amendments to `daylight-budget`, all small:

- `useConditions` takes a second parameter, `frozen`. `weather-filters` needs the clock held
  during a throw (its `useNow(frozen)`) and `opening-hours` needs the arrival instant held for
  the same reason — it currently proposes a private `frozenArrivalRef` latch in App.tsx to do it.
  One `frozen` on the hook replaces both. App passes `state.spinning`.
- `CapReason` is the full union above, not `"daylight"` alone. `weather-filters` routes rain,
  storm, heat and cold onset through `TimeCap`/`mergeCaps` and the `lightCap` action instead of
  through its own `budgetCapMinutes` path, which is what `daylight-budget` already asked of it and
  what keeps one cap on the dial rather than two competing ones. The action is renamed
  `{ type: "timeCap"; cap: TimeCap | null }` and `Session.lightCapMinutes` becomes
  `Session.timeCap: TimeCap | null`, so the dial's cap note can name *which* condition is
  clamping: `Daylight limit 62 min · dusk 8:21 pm` or `Rain limit 35 min · rain likely in 40`.
- `Conditions` carries `weather`. `daylight-budget` already anticipated this in prose; make it a
  field with `null` until `weather-filters` lands, so App has one hook and not two.

And one amendment to `weather-filters`: its `src/lib/conditions.ts` **must be renamed
`src/lib/weather-rules.ts`**, and the type it calls `Conditions` becomes `WeatherVerdict`. Two
modules named `conditions` one directory apart, both exporting a type called `Conditions`, both
imported into App.tsx, is the same trap `pool-reasoning` avoided by naming its module
`eligibility.ts` rather than `pool.ts`. `deriveConditions` becomes `deriveWeatherRules`.

**The clock offset.** `weather-filters` owes exactly one call: `setClockOffset(observedAtMs -
Date.now())` on each successful forecast, which is the only way this app will ever know the
device clock is wrong. Until it ships, the offset is zero and the device is trusted — and
`daylight-budget`'s failure table already says so out loud.

**Every consumer of the clock owes one thing:** no `Date.now()` inside a render, no second
interval, anywhere. `opening-hours` states this as an acceptance criterion; it applies to all
three.

### 2.2 `formatClock`, and one voice for times

**Owner:** whichever of `daylight-budget` / `weather-filters` / `opening-hours` lands first —
which by the build order below is `daylight-budget`, in the foundations chunk. **Consumers:** all
three, plus the dial's cap note.

Two shapes were specified. `daylight-budget` and `opening-hours` want `"8:21 pm"` / `"closes 5:00
pm"`; `weather-filters` wants `"7:54p"`. **`"8:21 pm"` wins** — two consumers to one, and the
compressed form exists only to fit a middot-separated mono line that this plan is rebuilding
anyway (see 2.5). `weather-filters`' `.result-conditions` reads `Feels 96°F · UV 9 · Sunset 7:54
pm`.

```ts
// src/lib/format.ts
export const RICHMOND_TZ = "America/New_York";
/** "8:21 pm" — lowercase meridiem, no leading zero, Richmond time always. */
export function formatClock(atMs: number): string;
```

One module-scope `Intl.DateTimeFormat`, constructed once, `formatToParts`, no `try`/`catch` —
`daylight-budget`'s argument for failing loudly on a platform without full-ICU `Intl` stands.

`format.ts` also gains, from their respective owners: `formatFahrenheit`, `formatHorizon`,
`formatUv` (`weather-filters`), `formatFeet` (`elevation-profile`), `formatAccuracy`
(`geolocate`). No conflict between those; they are listed here only so nobody adds a second one.

### 2.3 The exclusion-reason contract

**Owner:** `pool-reasoning`. **Consumers:** `opening-hours`, `weather-filters`,
`places-expansion`, `elevation-profile`, `shareable-spins` (reads a verdict for its "you cannot do
this right now" line), `meet-in-the-middle` (adds a reason that is deliberately **not** a rule —
see (d) below and §2.9d).

`pool-reasoning` deletes `selectCandidates` and replaces it with `derivePool(places, conditions):
PoolReport` in `src/app/eligibility.ts`. Four sibling specs still instruct an implementer to add
an argument to `selectCandidates`; **all four are superseded**, and `pool-reasoning`'s own
*Contracts asked of siblings* table is ratified here as written. Siblings contribute a `PoolRule`
instead.

`pool-reasoning` needs four amendments of its own, because three things it did not anticipate come
out of the other specs — and the fourth arrived last, from a spec that needed to remove places for a
reason that is neither a rule nor a switch:

**(a) Rule identity, so two weather rules can be told apart.** `weather-filters` can fire several
pool-affecting rules at once (`heat-shelter`, `heat-flat`, `uv-shelter`, `cold-cap`) and needs
each withdrawal attributable, but `pool-reasoning` tells it to collapse to a single `weather`
reason. Both are right; the fix is that a `PoolRule` gets an identity separate from its reason:

```ts
export type PoolRule = {
  /** Unique per rule instance. Two rules may share a `reason`. */
  readonly id: string;
  readonly reason: ExclusionReason;
  readonly active: boolean;
  readonly clearLabel: string;
  readonly clear: () => void;
  readonly signature: string;
  readonly minSurvivors?: number;
  /**
   * True when this rule decides on data that arrives asynchronously per place.
   * Places it has not measured yet are held OUT of `included` but stay IN
   * `baseIncluded`. See (b).
   */
  readonly deferred?: boolean;
  readonly excludes: (place: Place) => boolean;
  /** One sentence naming this rule specifically, for the drawer and the notice. */
  readonly detail?: string;
};

// PoolReport.withdrawn becomes readonly string[] — rule ids, not reasons.
```

`REASON_ORDER`, `REASON_COPY` and `counts` stay keyed on `ExclusionReason`; a verdict's `reasons`
array is deduplicated, so two weather rules firing on one place produce one `"weather"`.

**(b) The base pool, so the Spin gate has a stable denominator.** `elevation-profile`'s decision 4
is load-bearing and `pool-reasoning` cannot express it: route prefetch, `settledRoutes`,
`routesPending`, `poolKey` and the warm grace must all key on the pool **before** the async
filter, or the denominator of `Measuring climb n/total` counts downward while the user watches it
and the prefetch re-waves on every settling route. So:

```ts
// PoolReport gains:
/**
 * `included`, plus every place excluded ONLY by rules marked `deferred`. This
 * is what the route prefetch, the settlement count and the warm grace count —
 * never `included`, which shrinks as measurements land.
 */
readonly baseIncluded: readonly Place[];
readonly baseKey: string;   // the id join, replacing baseCandidateKey
```

`elevation-profile` keeps its three-part rule intact — unmeasured places pass provisionally,
settled-unmeasurable places are excluded, and the gate is `routesWarming` and not `reelIsShort` —
but expresses it as one `deferred` `PoolRule` with `reason: "wrong-terrain"` rather than as
`applyClimb` plus a split `selectCandidates`. `applyClimb` is deleted from that spec; `climbOf`
survives as the closure the rule closes over.

**(c) `hours-unknown` is struck from `ExclusionReason`.** `opening-hours` states plainly that
`unknown` is always kept and never filtered; the strict mode that would use this member is not
specified anywhere and `pool-reasoning`'s own open question 1 doubts it. A union member no rule
ever activates is a permanently dead branch asserted total by two tests. Eight members, not nine.

**(d) `out-of-their-reach` is added, and it is a condition rather than a rule.**
`meet-in-the-middle` puts the count back to nine, for a reason that is geometry rather than a
switch. `PoolConditions` gains `readonly partnerReach: Reach | null` as a first-class sibling of
`reach`, and the test is evaluated inline in `explainPlace`'s geometry section — **not** as a
`PoolRule`, because a rule is evaluated after the reader's own chips, so a place three miles from
the other person that also happens to be hilly would report `wrong-terrain` as its primary reason.
That is a nonsense sentence in a drawer heading. `REASON_ORDER` gains it in third position,
immediately after `inside-floor`, which is what its own stated rationale — how fundamental the
obstacle is — requires. It carries no `id`, no `clear` and no `clearLabel`, because there is
nothing to switch off: the way out is the *Spin from just your side* button on the empty-pool
notice, which drops the partner entirely. Its contribution to `conditionsSignature` is one
`partnerSignature(partnerReach)` term appended before the rules, derived entirely from the
assembled `Reach` and never from a fetch counter, a timestamp or a render count — the churn
`pool-reasoning` warns about at length kills the `WeakMap` memo *and* makes spinning impossible.
`activeFilters` does not count it; a second person is not a filter. That is `meet-in-the-middle`'s
amendments 1–5 to `pool-reasoning`, ratified here as written.

**The clause that matters most in the whole contract applies here verbatim:** a null `partnerReach`
means the reason is **not applied at all**, never "excludes everything". A partner whose ladder has
not warmed yet leaves the pool as your own reach, and the readout says their side is still working
rather than counting a two-sided number nothing has checked.

### 2.4 The elevation data path

**Owner:** `elevation-profile`. **Consumers:** `pool-reasoning` (the climb rule),
`places-expansion` (was a consumer; **is not any more**), `shareable-spins` (serialises the band,
never the profile).

Elevation rides the `/route` response the app already makes — `elevation_interval: 30` on the body
`server/proxy.ts` already POSTs. There is no `/api/height`, no skadi call, no second source.

**`places-expansion` is amended, and this is the largest single simplification in the plan.** That
spec derives `Place.terrain` from nine `/api/locate` probes per candidate reading
`edge_info.mean_elevation`, aborts the whole run on a null, and therefore requires an
elevation-built graph before a propose run is trustworthy — roughly 5,400 locate calls and a hard
prerequisite. `elevation-profile` **deletes `Place.terrain` entirely**, because a tag on a dot
cannot express a property of a route. So the relief ring, `terrainFromRelief`, the nine-probe
rung, the null-abort, the elevation prerequisite and the "four known-hilly hand rows" acceptance
check all come out of `places-expansion`. `/api/locate` stays — it is the anchor snapper, which is
the rung that actually matters — but it is called once per candidate, not nine times, and
`meanElevation` comes out of the response shape.

The `elevation-profile` → `places-expansion` contract in that spec ("if you add a height endpoint,
expose it as `POST /api/height`") is therefore void, and `elevation-profile`'s refusal to add one
stands unopposed.

**The graph rebuild is the one irreversible act in this plan.** `build_elevation=True` requires
`REBUILD=1`, and because pedestrian `use_hills` defaults to 0.5 over a graph that now has grades,
contours in a city with 70 m of relief will move. `elevation-profile` says to measure the drift
and bump `SNAPSHOT_VERSION` to 3 with all 11 snapshots regenerated if it exceeds 1%. Treat that as
the expected path, not the unlucky one, and schedule it **before** anything else that would want
to regenerate a snapshot — which is why it is chunk 1 below.

### 2.5 The result card's shared line block

**Owner:** the foundations chunk (2.7). **Consumers:** `daylight-budget`, `weather-filters`,
`opening-hours`, `apple-maps`.

Four specs add a small grey line to `ResultCard` under the stats, each with its own class:
`.result-light`, `.result-conditions`, `.result-hours`, `.result-note`. `apple-maps` foresaw
exactly this and wrote down the right answer: *"If three of you end up wanting a line, the right
move is one spec that introduces a shared list, not three specs sharing one class by accident."*
Three of them do. So build the list.

```tsx
// src/ui/ResultCard.tsx
export type ResultLine = {
  /** Stable, for React keys and for tests. */
  key: "conditions" | "light" | "hours" | "handoff" | "meet";
  text: string;
  /** "assumed" renders in --ink-3; a fact renders in --ink-2. */
  tier: "fact" | "assumed";
};
// New prop: lines: readonly ResultLine[]
```

Rendered as one `<div className="result-lines">` of `<p className="result-line">` (plus
`.is-assumed`), placed **after** `</dl>` and after the elevation figure, **before** the warning
rows. Order is the array's order, and App builds it in this order: `conditions`, `light`, `hours`,
`handoff`, `meet`. The last is `meet-in-the-middle`'s single line — *"Both walks are measured at
the same pace."* with `tier: "assumed"` — rendered only in meet mode, and it is last because it is an
admission about the method rather than a fact about tonight. Each contributing spec supplies a
**string**, composed in its own pure module and
asserted by `node --test` — `describeLight`, `deriveWeatherRules`' headline clause,
`evaluateHours`' `note` — and no component composes copy. `.result-note` retires as a
single-purpose class; `apple-maps`' caveat is `{ key: "handoff", text: "Other apps will
recalculate — their walk times will differ.", tier: "assumed" }`.

Every spec independently defends `.result-stats` staying `grid-template-columns: repeat(3, 1fr)`.
That is unanimous and it is the reason the lines are prose and not a fourth `Stat`. The third
stat's label changes from `Terrain` to `Climb` (`elevation-profile`) and nothing else moves.

**Warnings stay separate rows** and keep the `.result-warning` icon-plus-text layout. Their order
is fixed: geometry (the existing budget row, made reason-aware by `pool-reasoning`), then the
remaining verdict reasons in `REASON_ORDER`, then `fitsLight` (`daylight-budget`), then
`unavailableReason` (`shareable-spins`), then the route failure. A single ordering, stated once,
so four specs do not each insert "above the existing warnings".

### 2.6 The generated-data pipeline

**Owner:** `places-expansion` owns the harvester. **Consumers:** `opening-hours`.

Both specs call Overpass, both write to `data/osm/`, both carry a user-agent, a pause, a 429
retry, an ODbL notice and a manifest, and both were written as if they were the only one. There is
one harvester:

- **`scripts/harvest-osm.mjs`** (places-expansion) is the *only* thing in this repo that talks to
  Overpass. It owns the endpoint constant, the committed user-agent with the repo URL, the 5 s
  pause, the 30 s/3-try 429 retry, `data/osm/manifest.json` with verbatim QL per query, and
  `data/osm/README.md` with the ODbL notice. It gains one query family from `opening-hours` —
  a batched element lookup over every `place.osm`, written to `data/osm/hours.json`.
- **`scripts/build-hours.mjs`** (opening-hours) stops fetching. It reads `data/osm/hours.json`
  from the tree, exactly as `propose-places.mjs` reads only committed files and for the same
  reason: a bake that reaches the network is a bake whose output depends on the day it ran.
  This deletes that spec's "keep the previous table on an Overpass failure, exit 1" machinery
  outright — the harvest owns failure now, and a missing input file is a build error.

`data/osm/` is committed. Neither script ever runs in CI. `check:hours` — the calendar-dependent
lint `opening-hours` agonises over — **is not added to `npm run lint`**. This repo's lint chain is
three pure functions of the tree and a fourth that goes red on a date with no code change is how a
developer learns to ignore the chain. It runs in the scheduled CI job only, and the coverage
window is two calendar years wide, so the warning arrives a year early.

**The `Place` identity field.** `places-expansion` calls it `osm?: string`; `opening-hours` calls
it `osmId?: string`. **`osm` wins** — `places-expansion` declares it, defines its format
(`node|way|relation/\d+`) and emits it for free on every generated row, so it is the cheaper
declaration and the one with a test already written for it. `opening-hours` uses it as-is and
backfills the hand-curated rows by hand, which is that spec's stated expensive afternoon.

That backfill breaks one thing `places-expansion` relies on: it uses the *presence* of `osm` as
the discriminator for "this row came out of the proposer", which its `NAME_MAX` assertion needs.
Once `opening-hours` backfills, every row has `osm`. **Resolution:** `apply-places.mjs` is
append-only, so the generated rows are always a suffix. It emits one constant beside the boundary
comment — `export const HAND_CURATED_COUNT = 62;` — and `places.test.ts` asserts `NAME_MAX` over
`PLACES.slice(HAND_CURATED_COUNT)`. One number, exact, and it survives the backfill.

**Corrected 2026-08-21: `PLACES` holds 62 entries, and every `78` in these documents is wrong.**
An earlier audit counted `{ id:` lines across the whole of `places.ts` and swept up the 11
`PRESET_ORIGINS` and the 6 `VIBES` along with the places. The figure to trust is the array itself:
lines 27–113 of `src/data/places.ts`, 62 rows, which is exactly what the repo's own README has said
all along. A second miscount in the other direction — 61 — came from a throwaway script whose regex
skipped `pyramid`, the one entry written across multiple lines because it carries a source comment;
that number is wrong too, and anything counting `PLACES` should parse the module rather than scrape
it.

The correction is not cosmetic. It deflates three pieces of planned work by sixteen rows each:
`elevation-profile`'s deletion of `terrain:` from every place, `opening-hours`' backfill of `osm`
identifiers (specified as "a human confirming 78 OSM elements one at a time" — it is 62), and the
`HAND_CURATED_COUNT` boundary above, which would have silently excluded the first sixteen generated
rows from `NAME_MAX` had it shipped at 78. Each spec's implementer fixes its own prose figures;
`places-expansion`'s cap arithmetic reads `PLACES.length` at run time and was never affected.

### 2.7 New proxy endpoints, the Worker, and caching

**Owner of the shared plumbing:** the foundations chunk. **Owners of the endpoints:** as named.

| Endpoint | Owner | Method | Cache | Limiter | Notes |
| --- | --- | --- | --- | --- | --- |
| `GET /api/weather` | `weather-filters` | GET only, 405 otherwise, 400 on any query string | edge, 900 s, one constant key | 1 | `weatherCacheKey` returns `null` for a non-GET or any query string, which is what makes the "not a worldwide weather service" refusal true in the Worker and not only in `proxy.test.ts` |
| `POST /api/locate` | `places-expansion` | POST only | edge, 30 days, key rounded to 4 decimals | 1 | Build-time endpoint that happens to be public. `meanElevation` is **removed** from its response — see 2.4 |
| `GET\|HEAD /s` | `shareable-spins` | Worker only, never `handleApiRequest` | its own named cache `walk-roulette-share`, 3600 s, no entry for a pin origin | 0 | Not a proxy endpoint; it produces HTML |
| `GET\|HEAD /s?m=1…` | `multiplayer-links` (an **amendment** to the row above, not a second path) | identical | same cache, and `shareCacheKey` now also returns `null` for a pin under `ma` **or** `mb` — so nearly every meet link is rendered fresh and never stored | 0 | `shareMeta` gains an invite branch (the first shape that unfurls with **no** place) and an answer branch. `worker/index.ts` gains **zero lines**; `run_worker_first = ["/api/*", "/s"]` already covers it. `SHARE_CACHE_VERSION` stays `"v1"` — new keys cannot collide with old ones — and is pinned by a literal-string test over a solo key |
| `POST /api/route` | `elevation-profile` | unchanged | `ROUTE_CACHE_VERSION` (new) | unchanged | body gains `elevation_interval: 30` |
| `POST /api/isochrone` | unchanged | unchanged | `CACHE_VERSION` (now isochrone-only) | unchanged | |

Three shared changes, all in the foundations chunk so three specs do not each half-make them:

- **`edgeEntry`'s `keyFor` widens** to `(payload: Json, request: Request) => string | null`, with
  `request` threaded through. `weather-filters` specified this; `isochroneCacheKey`,
  `routeCacheKey` and `locateCacheKey` keep their one-parameter signatures because a narrower
  function is assignable, so it is a one-line change with no call-site churn. It is what lets a
  cache key refuse to exist for a request that must not be cached at all.
- **`CACHE_VERSION` splits.** `elevation-profile`'s argument is correct and applies to everyone:
  one shared constant feeding both `isochroneCacheKey` and `routeCacheKey` means a route-body
  change evicts every 1.7 MB isochrone ladder. `CACHE_VERSION` stays `"v1"` and versions
  isochrones and `/api/locate`; a new `ROUTE_CACHE_VERSION = "v2"` versions routes. A proxy test
  asserts both prefixes so they cannot be conflated again.
- **`stubEdgeCache(t)` keys by cache name.** `shareable-spins` needs it to prove the share cache is
  not the isochrone cache; today `open()` hands every caller the same `Map` and the claim is
  untestable. One `Map` per name, returning the outer map.

`server/proxy.ts` also imports `RICHMOND_BOUNDS` from `src/lib/bounds.ts` (`geolocate`), which is
the one place a `server/ → src/` import is allowed and gets a comment saying why: bounds are
geography both sides must agree on so the client can refuse a fix before the engine does. Costing
stays duplicated, deliberately — the client must never see policy.

`wrangler.toml` accumulates three edits across the plan: `WEATHER_URL` under `[vars]`
(`weather-filters`) and `run_worker_first = ["/api/*", "/s"]` under `[assets]`
(`shareable-spins`). `not_found_handling` is left unset in every case.

### 2.8 One announcement, and the growing sentence

**Owner:** the foundations chunk.

Every one of the nine independently refuses to add a live region and routes its text into the
single `sr-only role="status"` line through `describeResult`. That is unanimously right and
mechanically impossible as specified: `describeResult` would take ten positional parameters, and
`anti-slop/no-object-parameters` forbids the obvious fix.

**Resolution:** `describeResult` moves to `src/app/announce.ts` and becomes
`describeResult(clauses: readonly string[]): string` — one parameter, one array, joined with `, `
and terminated. App builds the array in a fixed order, each spec appending exactly one clause:
tier (`places-expansion`), duration and distance (existing), **the two walks
(`meet-in-the-middle`'s `describeMeetClause`)**, climb (`elevation-profile`), light
(`daylight-budget`), hours (`opening-hours`), conditions (`weather-filters`), pool verdict
(`pool-reasoning`), shared-arrival prefix (`shareable-spins`). Every clause is a string a pure,
tested function already produced for the visible UI, so the announcement cannot drift from the
card.

The meet clause is **inserted at position 3, not appended**, because it sits with the duration
facts — it *is* one, the two walks to the same place — and it returns `null` outside meet mode, so
it costs a one-person reader nothing.

Be honest about what this line becomes: a screen-reader user landing a spin in August at dusk with
filters on will hear a sentence with eight clauses in it, and nine in a two-person session. That is
the cost of refusing a second live region, and it is still the right trade — five competing
announcers is worse — but somebody should listen to the worst case out loud before v0.5 ships and
decide whether the tail clauses earn their place.

### 2.9 The second origin

**Owners, split down one seam:** `multiplayer-links` owns the link — the `m`/`ma`/`mb`/`d` keys,
`applyShare`'s meet branch, `shareMeta`, coordinate coarsening, and every word of privacy copy that
appears before a coordinate leaves a device. `meet-in-the-middle` owns the meeting — the geometry,
the pool, the map, the result card, the panel and `src/app/meet.ts`. **Consumers:**
`pool-reasoning` (§2.3d), `shareable-spins` (the link format it froze), `geolocate`
(`insideRichmond`, and `hasSnapshot` to say which side will be slow).

**(a) The session vocabulary, decided once, because the two specs conceded to each other and the
concessions do not compose.** `multiplayer-links`' *Depends on* item 2 adopts `Partner`,
`awaitingOrigin` and `clearPartner` from `meet-in-the-middle`; `meet-in-the-middle`'s *The contract*
withdraws exactly those and adopts `partner: Origin | null`, `originChosen` and `leaveMeet` from
`multiplayer-links`. Two files that each say "the other one wins" leave an implementer with no
answer at all, and this is the one place in the plan where politeness produced a hole.

**`meet-in-the-middle`'s later text is the one that ships**, on its own arguments: a plain `Origin`
needs no adapter at `cachedReach`, `pointKey`, `prefetchLadder` or `snapshotName`; `originChosen`
reads as a fact about the reader rather than about the app's mood; `leaveMeet` says what pressing
the button means; and whether the partner arrived coarsened is *derived* (`partner.id ===
"partner"` means a pin, because a preset resolves to its own `PRESET_ORIGINS` entry) rather than
stored in a `coarse` field that could disagree with the coordinate beside it. The final shape,
stated here so neither file has to be read for it:

```ts
partner: Origin | null;          // multiplayer-links writes it in applyShare; meet-in-the-middle reads it
originChosen: boolean;           // false for exactly one state: a fresh invite before the reader answers
partnerWarmed: number;           // meet-in-the-middle
partnerFailure: Failure | null;  // meet-in-the-middle
meet: MeetArrival | null;        // multiplayer-links: kind, mintedDay, partnerOutOfBounds, selfOutOfBounds
```

Actions: `leaveMeet` and `dismissMeet` (`multiplayer-links`), `partnerWarmProgress` and
`partnerFailed` (`meet-in-the-middle`). **`multiplayer-links` is the document that must change**:
strike its reconciliation item 2; rename `awaitingOrigin` to `!originChosen` throughout — its
`applyShare` pseudocode, its handoff table, tests 12–17 and criteria 5, 6 and 13 — noting the sense
inverts; rename `clearPartner` to `leaveMeet`; delete the `Partner` wrapper and its `coarse` field;
and correct every `state.partner.origin` to `state.partner`. `MeetArrival` keeps all **four** of its
fields — `meet-in-the-middle`'s contract table omits `selfOutOfBounds`, and that omission is the
amendment running the other way: `MeetPanel` renders its line too.

The id trap `multiplayer-links` names survives the rename and is worth repeating: when `ma` and `mb`
name the same preset, `state.partner` and `state.origin` are the **same object**. Nothing may
distinguish the two sides by `origin.id`.

**(b) `warmed` keeps one meaning, and the two legs are sequential.** `Session.warmed` means "this
device's own reach is ready" — it gates the on-demand `fetchReach` and shades the dial — so the
partner's progress goes to `partnerWarmed`, which no existing gate reads, and an engine error on
the partner's leg goes to `partnerFailure`, which only `MeetPanel` reads. Routing their leg's
failure into `failure` would blank *your* answer at any dial position of yours that had not warmed.
One prefetch effect, yours awaited before theirs, which halves the peak burst against a limiter
charged **per graph expansion**. `meet-in-the-middle` amendment 7 is ratified: `multiplayer-links`
must **strike its "96 duplicate contour requests" claim**, which is wrong by roughly 24× —
`fetchReach` asks for `bandMinutes(budget, floor)`, a handful of contours, and `ensureContours`
deduplicates per contour key against `inFlight`. The instruction stands; only the arithmetic goes,
and it goes because this plan's sentences become code comments.

**(c) The ladder caches, and the one number this plan changes for them.** The contour cache is
`CACHE_LIMIT = 3 × LADDER.length` = 288 — three whole ladders — so two simultaneous origins fit
with one to spare, and a third (moving your own start twice in a meeting) evicts the oldest and
costs a re-warm, not a wrong answer. The **assembled**-reach cache is the tight one:
`ASSEMBLED_LIMIT = LADDER.length * 2` = 192 was sized by its own comment as "two whole dials" for
*one* origin, and in meet mode two origins share it while a floor doubles the key space again, so a
full-dial scrub can evict the position it started from — the exact regression that comment exists
to prevent. `meet-in-the-middle` leaves the implementer a choice between raising the limit and
measuring the scrub. **This plan picks the raise: `ASSEMBLED_LIMIT` becomes `LADDER.length * 4`**,
because an entry is three references and a number, the cost is bookkeeping rather than geometry,
and two implementers should not each spend an afternoon measuring a stutter. Separately,
`meetMinimum` must read `cachedContour` — a peek that neither promotes nor writes — and never
`cachedReach`, which would insert up to 192 assembled entries during one scan and evict everything
on screen.

**(d) The exclusion-reason contract** is amended in §2.3d, not here. The short version: nine
members again, `out-of-their-reach` third in `REASON_ORDER`, a `PoolConditions` field rather than a
`PoolRule`, `partnerSignature` as its signature term, and a null partner reach applying no reason
at all.

**(e) The URL and the Worker stay `shareable-spins`'.** No second encoder, no second path, no
version byte, no new Worker branch, and `SHARE_QUERY_MAX` is not raised — a full meet link is ~160
characters against a 512 cap. What that spec must accept: `ShareInput.placeId` widens from `string`
to `string | null` (an invite names no destination because there is not one yet, and a solo link
still always writes `p`); `canonicalQuery` gains a **fixed total key order**, `m, ma, mb, o, b, f,
rt, e, c, v, k, p, d`, whose solo subset must be byte-identical to what chunk 10 emits; and
`shareCacheKey` returns `null` for a pin under `ma` or `mb`. That last one is not relaxed to
recover a hit rate — an unbounded key space a scraper can mint entries in is precisely what the
rule exists to prevent, and the cost is a handful of milliseconds of Worker CPU per unfurl. A meet
link never carries `o`, so an older build opening one falls back to a cold start rather than
adopting a stranger's front door as the reader's own origin; that is a correctness decision and it
is why the keys are new letters rather than a reused one.

**(f) The coarse-coordinate divergence — resolved, and resolved against the spec that asked.**
`meet-in-the-middle` amendment 8 asks `multiplayer-links` to have the sender adopt its own
three-decimal coordinate the moment a meet link is minted, so that both devices compute from the
same premises and cannot show different counts. **Refused here.** Dispatching a new `origin` on a
Share press moves the sender's own start by up to ~70 m, changes the answer they are looking at,
and invalidates their warm ladder — 96 contours re-warmed as a side effect of pressing a button, on
the one endpoint that costs real graph expansions. That is making one person's answer *less*
accurate so that two screens agree, which is the wrong direction for this app: the divergence is a
fact about a blunt disclosure, and the honest response to a fact is to say it, not to degrade a
measurement until it goes away. So `multiplayer-links`' decision 4 stands as written, and
`meet-in-the-middle` is the document that changes: the divergence row in its *Failure and
degradation* is **required copy on both sides**, and its acceptance criterion 5 is a per-device
claim. The *outcome* never diverges, because the answer link carries `p` and opening a link
restores a pick rather than replaying the reel. What stays open is the precision itself — see §6.

---

## 3. Conflicts and collisions

Every case where two specs edit the same thing incompatibly. **The resolution is binding**; the
losing spec is amended by this file.

### `src/app/App.tsx` — `selectCandidates`

| Specs | Conflict | Resolution |
| --- | --- | --- |
| `pool-reasoning` vs `opening-hours`, `weather-filters`, `places-expansion`, `elevation-profile` | One deletes the function; four add arguments to it | `pool-reasoning` wins; its *Contracts asked of siblings* table is ratified verbatim. Each sibling contributes a `PoolRule`. `elevation-profile`'s `applyClimb` is deleted and becomes a `deferred` rule; its base-pool requirement is met by `PoolReport.baseIncluded` (§2.3b) |

### `src/data/places.ts` — the `Place` type

| Specs | Conflict | Resolution |
| --- | --- | --- |
| `elevation-profile` vs `places-expansion` | One deletes `terrain`; the other keeps it and builds a nine-probe elevation pipeline to populate it | `terrain` is deleted. `places-expansion` loses `terrainFromRelief`, the relief ring, the null-abort and its elevation prerequisite (§2.4). `Place` becomes `LngLat & { id; name; tags: Vibe[]; detour?: DetourKind; osm?: string }` |
| `places-expansion` vs `opening-hours` | `osm?: string` vs `osmId?: string`; and presence-of-field used as a generated-row discriminator that the other spec's backfill destroys | `osm` wins. The discriminator becomes `HAND_CURATED_COUNT` (§2.6) |
| `places-expansion` vs `shareable-spins` | Place ids must be permanent and never reused | No conflict — ratified. `apply-places.mjs` never rewrites a row; `placeId`'s `-2` suffix rule makes collisions additive |

### `src/app/session.ts` — the reducer

| Specs | Conflict | Resolution |
| --- | --- | --- |
| All nine but `apple-maps` add fields and actions | Not a conflict, but eight simultaneous edits to one exhaustive switch | Land them in build order; each is a compile error until handled, which is the point of the exhaustive switch. Final shape: `climb` (replacing `terrain`), `kind`, `vibes`, `edgeOnly`, `beforeDark`, `timeCap`, `weatherAware`, `hideClosed`, `locationNotice` (replacing `locationError`), `shared`, and from chunk 11 `partner`, `originChosen`, `partnerWarmed`, `partnerFailure`, `meet` |
| `multiplayer-links` vs `meet-in-the-middle` | Each concedes the session vocabulary to the other, so both files name fields the other has withdrawn | `meet-in-the-middle`'s shape ships: `partner: Origin \| null`, `originChosen`, `leaveMeet`. `multiplayer-links` is amended throughout — no `Partner` type, no `coarse` field, no `awaitingOrigin`, no `clearPartner`. Full statement and the rename list in §2.9a |
| `multiplayer-links` + `meet-in-the-middle` vs everything | Five more fields and four more actions on the switch, and one of them (`leaveMeet`) has to clear state five other cases own | `leaveMeet` resets `partner`, `meet`, `partnerWarmed`, `partnerFailure`, `originChosen: true`, bumps `framingKey`, **and** clears `pickedId`, `spinning`, `spinAborted`, `routeAttempt` — the pool is about to change, and a pick surviving a pool change is the bug `pool-reasoning` spends a section on. `origin` sets `originChosen`, clears `partnerFailure`, and leaves `partner` and `meet` alone: moving your own start is how you *answer* an invite, not how you cancel one |
| `pool-reasoning`'s `clearFilters` rule vs chunk 11 | Does clearing filters drop the other person? | **No**, and it is the same rule, not an exception to it: `clearFilters` resets exactly what `activeFilters` counts, and `activeFilters` counts the reader's choices about *places*. A second person is not a filter. `partner` is dropped only by `leaveMeet`, which is a named button |
| `daylight-budget` + `weather-filters` vs `opening-hours` + `places-expansion` + `pool-reasoning` | What `clearFilters` resets. Two specs insist their switch must survive it; one resets `hideClosed`; one resets `kind`; `pool-reasoning` demands *every* sibling filter field be reset there | **One rule, stated once: `clearFilters` resets exactly what `activeFilters` counts, and `activeFilters` counts exactly the reader's choices about *places* — `climb`, `vibes`, `edgeOnly`, `kind`.** The three condition switches (`hideClosed`, `weatherAware`, `beforeDark`) are safety defaults, not filters. They are undone by their own `PoolRule.clear` through `EmptyPoolNotice`, never by a button labelled "Clear filters". `opening-hours` is amended (remove `hideClosed` from `clearFilters`); `pool-reasoning`'s contract sentence is amended (a sibling owes a `clear` callback, not a `clearFilters` reset) |
| `pool-reasoning` vs `opening-hours` + `weather-filters` | `activeFilters` gains `+ rules.filter(active).length`, which with two default-on switches makes the drawer read "Filters (2 active)" from first paint — the exact trap both other specs argue against | `pool-reasoning` is amended: drop that line. `activeFilters` counts the four reader-chosen filters only. The cause of a shrunken pool is named in prose by `.pool-summary` and `EmptyPoolNotice`, which that spec already builds and which is always visible rather than hidden behind a collapsed drawer |
| `daylight-budget` vs `weather-filters` | Two independent budget-cap paths: `Session.lightCapMinutes` + `{type:"lightCap"}` vs `Conditions.budgetCapMinutes` + `effectiveBudget` in App | One path. `Session.timeCap: TimeCap \| null`, action `{ type: "timeCap"; cap }`, fed by `mergeCaps` over both specs' caps (§2.1). The dial's cap note names the winning reason. `weather-filters` loses `budgetCapMinutes`/`effectiveBudget`/`effectiveFloor` and gains a `TimeCap` per firing time rule |

### `src/ui/ResultCard.tsx`

| Specs | Conflict | Resolution |
| --- | --- | --- |
| `daylight-budget`, `weather-filters`, `opening-hours`, `apple-maps` | Four grey lines, four classes, four insertion points all described as "under the stats" | One `.result-lines` block fed by a `ResultLine[]` prop (§2.5). `.result-note` retires |
| `daylight-budget`, `opening-hours`, `pool-reasoning`, `shareable-spins`, `elevation-profile` | Five specs insert a `.result-warning` row "above the existing warnings" | One fixed order, stated in §2.5 |
| `shareable-spins` vs `apple-maps` | `.result-actions` becomes `1fr auto auto` vs `1fr 1fr` with `.is-primary` spanning | `apple-maps`' shape, extended: row 1 `Spin again` (`grid-column: 1 / -1`), row 2 `Google Maps` \| `Apple Maps`, row 3 `Share` (`1 / -1`). `apple-maps`' 320px arithmetic — `.button` is `white-space: nowrap`, min-content ≈ 140px against ≈ 128px of cell — stands, so under 899px the whole grid is `1fr` and everything stacks. `shareable-spins`' separate `@media (max-width: 380px)` rule is deleted as redundant |
| `elevation-profile` vs `places-expansion` | Stat 3 becomes `Climb`; the eyebrow becomes the tier word | No conflict, both land. The grid stays three columns |
| `meet-in-the-middle` vs the four specs that fought over `.result-stats` staying three columns | In meet mode the three-column `<dl>` is **replaced** by a two-row `.result-split`, one row per person | It lands, and it does not reopen the three-column argument, because it is a swap rather than a fourth column: `.result-stats` is unchanged in every one-person session, which is every session in chunks 0–10. The `.result-lines` block, the warning rows and `.result-actions` are untouched underneath it |
| `meet-in-the-middle` vs `apple-maps` + `shareable-spins` on `.result-actions` | Does a second person mean a fourth row — directions from *their* start? | **No.** Only your directions buttons render, on your device. A link that opened navigation from somebody else's house on your phone is chrome pretending to be a feature. The grid stays at the three rows §3 already resolved, and the 320 px arithmetic is untouched |
| `meet-in-the-middle` vs the warning order | A sixth `.result-warning`, *"Outside the other person's reach."* | It is not a sixth insertion point: it arrives through the existing reason-aware geometry row, in `REASON_ORDER`, which now has `out-of-their-reach` in third position. §2.5's fixed order is unchanged |

### `src/ui/Filters.tsx`

| Specs | Conflict | Resolution |
| --- | --- | --- |
| `weather-filters` + `opening-hours` each add "a third `<Switch>`" | Both cannot be third | Four switches, in this order: Round trip, Far edge only, Skip closed places, Mind the weather. `.switch-row` is already a single-column flex at every width, so no CSS change is needed — which both specs independently verified |
| `daylight-budget` | Its switch goes outside Filters | Ratified and load-bearing: the Filters drawer starts shut on a phone, and a control that moves the dial cannot live behind a disclosure. `DaylightSwitch` sits in `.panel` immediately after `TimeDial` |
| `elevation-profile` vs `places-expansion` | Terrain fieldset becomes Climb; a Kind fieldset is inserted "between the switch row and Terrain" | Both land. Chip order: Kind (coarsest question), Climb, then vibes |
| `meet-in-the-middle` vs the filter row | Nothing. Stated because it is the obvious wrong guess | **The partner is not a control in `Filters.tsx`.** No fifth switch, no chip, no fieldset, and `clearFilters` does not touch it. `MeetPanel` is its own `<section className="origin meet">` in `.panel`, immediately after `OriginPicker` — which fixes the panel's final order: `TimeDial`, `DaylightSwitch`, `OriginPicker`, `MeetPanel`, `Filters`. The `origin` class is load-bearing: `.shell.is-picking` dims the rail and kills its pointer events while exempting `.origin`, and *Pick on the map* is unusable from a dimmed panel |

### `src/map/MapCanvas.tsx`

| Specs | Conflict | Resolution |
| --- | --- | --- |
| `places-expansion` (splits `places` / `place-picked` sources, adds `picked-place-dot`) vs `pool-reasoning` (adds a transparent hit halo to `places-out`) vs `elevation-profile` (adds `route-hover-dot` after the places layers) | Three specs edit the layer stack and its paint expressions | All three land and none contradicts another, but the **layer order is fixed here** so three implementers do not each guess: `places-out` (+ halo), `places`, `place-picked` → `picked-place-dot`, `picked-place-label`, `route-hover-dot`. Every layer after `places-out` is added with no `beforeId`. `PLACE_LAYERS` ends as `["places", "places-out", "picked-place-dot"]`. `places-expansion`'s `syncAll` must call `syncPicked` — that is the subtle one and it is already written down in that spec |
| `meet-in-the-middle` vs the fixed layer order above | One new source and two new layers for the partner's contour | They go at the **bottom**, not the top: `partner-band-fill` and `partner-band-line` are created **first in the mount sequence, before `band-0`**, both with `beforeId: UNDER_LABELS`, so the partner draws beneath your contour. The order above is otherwise unchanged. The net number of contour uploads goes **down** in meet mode, because both sides lose their inner bands — `band-1` and `band-2` are fed `EMPTY`, since a ladder answers "how much further with ten more minutes" and that question has no two-person form. Ids must be checked against `basemap.ts`; widths go through `weighted()` |
| `meet-in-the-middle` vs the framing effect and the origin marker | The invite state has no local `reach` and must not show a local marker | Two guard changes, both required and neither optional: the framing effect early-returns on `!outerBand` today, so it must become `!outerBand && !partnerBand` with the bounds extended over whichever exist; and the local marker is created unconditionally in the mount-once effect and positioned from `props.origin`, so `originVisible` must toggle an `is-hidden` class on it. Without the second, a draggable pin sits on `DEFAULT_ORIGIN` — a house in the Fan — offered as a stranger's start, which is the one thing the invite state exists to refuse. The partner's marker is created in the **same** mount-once effect and hidden the same way; a second create/destroy effect would race `readyRef` for no benefit. The sr-only summary and the canvas `aria-label` need the same treatment, or the invite state has no text equivalent at all |

### `server/proxy.ts` and `worker/index.ts`

| Specs | Conflict | Resolution |
| --- | --- | --- |
| `elevation-profile` vs `places-expansion` | One splits `CACHE_VERSION`; the other's `locateCacheKey` interpolates it | Split lands first (foundations). `locateCacheKey` uses `CACHE_VERSION`, which is now isochrone-and-locate |
| `weather-filters` vs `places-expansion` | Both edit the Worker's cache branch and `edgeEntry` | `keyFor` widening lands in foundations; both specs then add one `else if` |
| `geolocate` vs everything | Deletes the local `BOUNDS` literal | No conflict. Lands in foundations so `places-expansion`'s `/api/locate` bounds check reads the shared constant from day one |
| `multiplayer-links` vs both | Nothing. Both files are **unchanged** by the whole multiplayer half | Worth stating, because it is the surprising part: no new endpoint, no `[vars]` line, no binding, no `run_worker_first` entry. `POST /api/isochrone` is already per-location, so the partner's ladder is a second call through the bounds check, the cost function and the edge cache that already exist. `WALKING_SPEED_KMH` stays pinned and is **not** parameterised — see §6 |

### The `/s` route

| Specs | Conflict | Resolution |
| --- | --- | --- |
| `shareable-spins` vs `multiplayer-links` | A second link grammar on one path: `shareMeta` must unfurl a link that names no place, and `shareCacheKey` must refuse two more keys | One path, one encoder, one Worker branch, amended in place. Details in §2.9e and the §2.7 table row. The three link shapes are total and there are only three: solo (`o`…`p`), invite (`m=1`, `ma`, no `mb`, no `p`), answer (`m=1`, `ma`, `mb`, `p`) |
| `shareable-spins`' URL-clearing effect vs a meet arrival | In a link being *minted* `ma` is the sender's start; in a link being *read* it is the partner's. Comparing the live `shareInput` against `shared.linkQuery` therefore differs on **every** meet arrival, and the effect wipes the address bar on the first paint — the exact inverse of that spec's criterion 11b | `multiplayer-links` fixes it with a **mirrored** `ShareInput` that re-states the link as it arrived (`origin: state.partner`, `partner: originChosen ? state.origin : null`, `mintedDay` from the arrival and never `Date.now()`). Ratified. Nothing there writes a coordinate anywhere: the mirror is a string compared in memory, and the only value ever passed to `replaceState` is the literal `"/"` |
| `shareable-spins`' "a link always names a place" vs an invite | `ShareInput.placeId` was declared required | Widened to `string \| null`. `placeId === null` implies `meet === true`, and `meet === false` implies `placeId !== null` — asserted by tests rather than by a discriminated union, which would fork every call site in `App.tsx` |

### `src/lib/format.ts`

| Specs | Conflict | Resolution |
| --- | --- | --- |
| `daylight-budget` + `opening-hours` vs `weather-filters` | `formatClock` returning `"8:21 pm"` vs `"7:54p"` | `"8:21 pm"`. See §2.2 |

### `src/lib/geometry.ts`

| Specs | Conflict | Resolution |
| --- | --- | --- |
| `elevation-profile` (`cumulativeMeters`, `pointAtMeters`) vs `places-expansion` (`metersBetween`) | Three additions, no overlap | No conflict. `metersBetween` and `cumulativeMeters` should share the one `111_320` metres-per-degree constant and its `cos(lat)` correction rather than declaring it twice; whichever lands first declares it |

### The snapshot

| Specs | Conflict | Resolution |
| --- | --- | --- |
| `elevation-profile` (probably bumps `SNAPSHOT_VERSION` to 3 and regenerates 11 files) vs `places-expansion`, `daylight-budget`, `weather-filters`, `opening-hours`, `pool-reasoning`, `shareable-spins`, `geolocate`, `apple-maps` (all say "snapshots untouched") | The eight are right about their own changes and wrong about the release: the graph rebuild moves the contours under all of them | Do the graph rebuild and the regeneration **first**, as chunk 1, so it is paid once and everything after it is measured against the graph that ships. An implementer of chunk 6 who reads "snapshots untouched" in their spec is reading a true statement about their diff |

---

## 4. Build order

Eleven chunks. Each is shippable on its own — it typechecks, it lints, it tests, and it leaves the
app working — which is a real constraint and the reason chunk 0 exists at all. Chunk 11 is the one
exception, and it says so.

### Chunk 0 — Foundations (no user-visible change)

`src/lib/bounds.ts` and the `proxy.ts` import. `formatClock` + `RICHMOND_TZ`. `src/lib/solar.ts`,
`src/app/daylight.ts`, `src/app/conditions.ts`, `src/app/useConditions.ts` (pure modules and the
hook; nothing consumes them yet, so every export carries `/** @public */`). `edgeEntry`'s `keyFor`
widening. The `CACHE_VERSION` / `ROUTE_CACHE_VERSION` split. `stubEdgeCache` keyed by name.
`describeResult` → `src/app/announce.ts` taking a clause array. The `.result-lines` block and its
`ResultLine` type, rendering an empty array.

Pure refactor plus dead-but-tested code. **Unblocks:** everything.
Extracted from `daylight-budget`, `weather-filters`, `geolocate`, `elevation-profile`,
`shareable-spins`.

### Chunk 1 — Elevation on the wire, and the graph

`build_elevation=True`, `REBUILD=1`, the extended smoke check in `build-graph.sh`,
`valhalla/README.md`. `elevation_interval: 30` in `route()`. `src/lib/elevation.ts` (pure).
`WalkingRoute.profile`, `noteElevation`/`elevationAvailable`, `route-store` `SCHEMA_VERSION` 2 and
`MAX_ENTRIES` 600. The contour-drift measurement, and the snapshot regeneration if it exceeds 1%.

Nothing renders a profile yet; the data arrives and is cached. **Unblocks:** chunk 3, and every
later chunk's snapshot assumptions.

*Why first:* it is the only irreversible act in the plan, it invalidates snapshots, and paying it
once at the start is cheaper than discovering the drift under chunk 8.

### Chunk 2 — `pool-reasoning`

`src/app/eligibility.ts`, `PoolList`, `EmptyPoolNotice`, the `.pool-summary` line, the `places-out`
hit halo, `clearVibes`, `clampBudget` exported. Ships against today's filters (climb does not exist
yet; the terrain chip is still `terrain`) with an empty `rules` array.

**Unblocks:** chunks 3, 6, 7, 8 — every spec that wants to remove a place from the pool.

*Why second:* four specs are told to contribute a `PoolRule`. The rule registry has to exist
before any of them can. Landing it against today's three filters also proves the counts line and
the empty-pool fix on a pool nobody has changed yet, which is the honest way to test it.

### Chunk 3 — `elevation-profile` (the visible half)

`ElevationProfile.tsx`, the Climb stat, the map hover dot, `cumulativeMeters`/`pointAtMeters`,
`formatFeet`. `Terrain` and `Place.terrain` deleted across 62 rows; `Session.terrain` → `climb`.
The climb `PoolRule` with `deferred: true` and `routesWarming` gated on it.

**Unblocks:** chunk 8 (`places-expansion` no longer has a terrain field to populate), chunk 10
(the share link serialises `climb`).

### Chunk 4 — `apple-maps`

`src/lib/handoff.ts`, two anchors, the recompute caveat as a `ResultLine`, the `.result-actions`
grid. Needs chunk 0 for `.result-lines`.

**This is the afternoon.** It is one pure module, eight assertions, two anchors and a CSS
declaration. Nothing depends on it and nothing it touches is contested except a grid template that
chunk 0 already reshaped. Ship it early for the morale, or last for the tidiness; it does not
matter, which is the definition of a small change.

### Chunk 5 — `daylight-budget`

`capFromLight`, `fitsInLight`, the three describe functions, `DaylightSwitch`, `Session.timeCap`
and the `timeCap` action, the dial's dead zone and cap note, the `light` `ResultLine`, the dusk
segment in the readout. The pure modules already landed in chunk 0; this is the wiring and the UI.

**Unblocks:** chunk 7 (the `TimeCap` path and `mergeCaps` have an in-app caller), chunk 9
(`sunTimes` and `solarEvents` have a proven consumer).

### Chunk 6 — `geolocate`

`src/lib/locate.ts`, `judgeFix`, the notice block with its preset offer, `hasSnapshot`,
`permissionHint`, `locationNotice` replacing `locationError`, `dev:lan` *if* the iOS
self-signed-certificate check passes. `bounds.ts` already landed in chunk 0.

Independent of everything except chunk 0. Slot it wherever there is a gap.

### Chunk 7 — `weather-filters`

`GET /api/weather` and its Worker branch, `src/lib/weather.ts`, `src/lib/weather-rules.ts`
(renamed from that spec's `conditions.ts`), `ConditionsLine`, the `conditions` `ResultLine` and
`.result-conditions`, the Mind-the-weather switch, `setClockOffset`, and one `PoolRule` per firing
pool rule with `minSurvivors: 3`. Its time rules produce `TimeCap`s and go through chunk 5's
`timeCap` action.

Needs chunk 0 (endpoint plumbing, clock), chunk 2 (`PoolRule`), chunk 5 (`TimeCap`).

### Chunk 8 — `places-expansion`

`harvest-osm.mjs`, `propose-places.mjs`, `apply-places.mjs`, the review page, `POST /api/locate`,
`osm-rules.ts`, `DetourKind`, the Kind fieldset as a `PoolRule`, the map's detour mark and the
`place-picked` source split, `HAND_CURATED_COUNT`, `places.test.ts`, `WIDE_PREFETCH_LIMIT = 90`.
Minus everything §2.4 removed.

Needs chunk 2 (`kind` as a rule) and chunk 3 (no terrain to derive). **Blocks chunk 9**, because
running it first means the generated rows arrive carrying `osm` and only the 62 hand-curated rows
need the manual backfill.

### Chunk 9 — `opening-hours`

The `osm` backfill for the hand-curated rows (the afternoon of human confirmation), the harvest
family added to `harvest-osm.mjs`, `build-hours.mjs` reading committed JSON, `src/data/hours.ts`,
`src/lib/hours.ts`, the `closed` `PoolRule`, the Skip-closed-places switch, the `hours`
`ResultLine`.

Needs chunk 0 (clock, `arrivalMs`, `formatClock`), chunk 2 (`PoolRule`), chunk 5 (`solarEvents`
proven), chunk 8 (`osm` on generated rows, the shared harvester).

### Chunk 10 — `shareable-spins`

`src/app/share.ts`, `applyShare`, `server/share-meta.ts`, the `/s` Worker branch,
`run_worker_first`, the Share button and its note, `unavailableReason`.

**Last, and necessarily so.** Every earlier chunk changes what a session *is*: `climb` replaces
`terrain`, `kind` appears, `osm` appears, the condition switches appear. A share format frozen
before those land is a format that needs a migration on the day after it ships, and this spec's
whole argument for a readable query string over an opaque token is that it never needs one.

**What the link carries, decided here since three specs have opinions:** the walk (`o`, `b`, `f`,
`rt`, `p`) and the *place filters* (`c` for climb — not `t` — `v`, `e`, `k`). It does **not**
carry `beforeDark`, `weatherAware` or `hideClosed`. Those are about the recipient's here-and-now,
not about the walk that was sent; a link that switched off somebody's daylight guard would be a
trap, and one that switched it on would be a lie about what the sender did. `shareable-spins` is
amended accordingly.

### Chunk 11 — `multiplayer-links` + `meet-in-the-middle`, in that order, as one landing

**11a, the link.** `share.ts` grows `m`/`ma`/`mb`/`d`, `MEET_PIN_PRECISION`, `INVITE_STALE_DAYS`,
`epochDay`, `meetShape`, `describeInvite`, `describeMeetResult`, the fixed total key order, and a
`placeId` widened to `string | null`. `session.ts` grows `partnerOrigin`, `MeetArrival`, the meet
branch of `applyShare` (which is where a partner arrives — never through a later dispatch, because
restoring one through a dispatch frames the map twice), and `dismissMeet`. `share-meta.ts` grows
two branches and one cache clause. App grows the mint expressions, the mirrored URL comparison and
the `originChosen` gate on minting.

**11b, the meeting.** `src/app/meet.ts` (`meetMinimum`, `cachedMeetMinimum`, `meetSplit`,
`partnerSignature`, the describe functions), `cachedContour` in `isochrone.ts`, the
`out-of-their-reach` clause and `suggestFix` step 1.5 in `eligibility.ts`, `partnerWarmed` /
`partnerFailure` and their two actions, `MeetPanel.tsx`, the partner source and layers, the framing
and marker guards, `.result-split`, the readout's count-instead-of-area, and the sequential
prefetch effect.

**The empty overlap is the arrival state, not a failure state, and 11b must be built that way.**
Measured over four real preset pairs at 20, 30 and 45 outbound minutes: at 20 minutes all four pairs
share nothing at all, and at 30 minutes three of the four still do. Only at 45 does every pair have
something. The dial's default sits below that, so the ordinary experience of opening an invite is an
empty pool — which makes `meetMinimum` and its `widen-to-meet` copy the feature's opening move rather
than its recovery path. Two consequences are written into `meet-in-the-middle` decision 7: the
suggestion must land on the same beat as the warm-up finishing rather than after a visible dead
Spin button, and `meetMinimum`'s cost can no longer be waved through as rare — it runs on essentially
every arrival, and must be timed at chunk 8's 250-place cap before this ships.

**Depends on:** chunk 10 for the whole link surface (it cannot amend a share format the session does
not yet have), chunk 2 for the reason contract and `clampBudget`, chunk 6 for `insideRichmond` and
`hasSnapshot`, chunk 3 for `climb` in the query, chunk 8 for `k` and for the 250-place cap the
two-sided sweep has to be measured against. **Unblocks:** nothing. It is the leaf of the plan, which
is the other reason it is last: if the release runs out of room, this is the chunk that comes out
whole.

**This is the one chunk that is not shippable in halves, and the constraint is worth naming rather
than discovering.** 11a alone adds `partner` and `originChosen` to the session and nothing reads
them — knip fails on the dead exports, and worse, a link would decode into a session the UI does not
render, which is an invite that silently does nothing. Land them as one PR, or as two PRs behind one
merge. The two specs' joint acceptance criteria (`multiplayer-links` 5, 6, 6b and 13) are written to
be verified once, on the pair, for exactly this reason.

**Sequence within the chunk is fixed:** the link half first, because it is what puts a partner in
the session, and the meeting half is meaningless without one.

**Size, honestly: L for `meet-in-the-middle`, S–M for `multiplayer-links`, and the chunk together is
the third-largest in the plan** — behind `places-expansion` and `elevation-profile`, ahead of
`weather-filters`. That is not a surprise and it should not be argued down. Two of its pieces are
each a chunk-sized argument on their own: the invite state, which has to suppress three artefacts
the app renders by default (the origin marker, the readout skeleton, the sr-only summary) because
answering a stranger's question from `DEFAULT_ORIGIN` is the same lie as the circle; and the
empty-overlap escalation, which is the whole reason the feature is worth building and is a linear
scan across two 96-rung ladders with a memo, a hedge count and a button whose face must not be able
to disagree with the dial.

**One forward cost, named and not specified.** "Other cities" is deferred to a later version by
explicit decision, and this chunk raises its price by a little: `insideRichmond` now gates a
*link's* partner coordinate at decode time, so a meet link minted in one city would be refused in
another and any future multi-city build has to carry the city in the link rather than inferring it —
one more key, decided then, not now.

### Honest sizes

| | Chunk | Size |
| --- | --- | --- |
| Biggest | `places-expansion` (8) | **XL.** Three scripts, a review UI with a keyboard interface, a human acceptance gate, a new endpoint with its own cache and seven upstream nesting paths to get right, a map re-upload rewrite, and ~10 KB of bundle — a sixth of the stated budget in one feature. It is also the one chunk whose output is *reviewed data*, so the work is not done when the code passes |
| | `elevation-profile` (1 + 3) | **XL**, and split across two chunks for exactly that reason. A graph rebuild that may need two passes, a snapshot regeneration of 11 files, a type deleted across 62 rows, a hand-drawn SVG chart with a scrubber and a keyboard story, and a spin gate whose failure mode is an app that will not spin |
| | `meet-in-the-middle` (11b) | **L.** A new pure module with a two-ladder scan, a ninth exclusion reason threaded through five places in `eligibility.ts`, a new panel with four states at one fixed height, a map that drops three layers and adds three, a result card that swaps its stat grid, and an invite state that has to un-render three things the app draws by default |
| | `weather-filters` (7) | L |
| | `opening-hours` (9) | L — small runtime, expensive setup: the `osm` backfill is a human confirming 62 OSM elements one at a time |
| | `pool-reasoning` (2) | L |
| | `shareable-spins` (10) | L |
| | `daylight-budget` (5) | M — sixty lines of vendored arithmetic and a minute-hand, and no network at all |
| | `geolocate` (6) | M |
| | `multiplayer-links` (11a) | **S–M.** Four query keys, two describe functions, one `applyShare` branch, two `shareMeta` branches and a mirrored-input comparison that is three lines and prevents the address bar wiping itself on first paint. Small because it refuses a room: no binding, no socket, no server-held state, and therefore no second dev implementation of anything |
| Smallest | `apple-maps` (4) | **S. An afternoon.** One pure module, two anchors, one CSS declaration, eight assertions. There is no algorithm in it worth the name and the spec says so |

---

## 5. Total cost

Every bundle figure below is the owning spec's own **estimate**, not a measurement, and each spec
carries an acceptance criterion requiring the real number from `npm run build` before and after.
They are added up here so the total is visible in one place, because nine features each spending
"about 2% of the budget" is how a budget disappears.

| Chunk | Bundle (gz, est.) | New outbound deps | Hosting | Build steps | Engine load |
| --- | --- | --- | --- | --- | --- |
| 0 Foundations | +0.9 KB (solar + conditions, dead until 5) | — | — | — | — |
| 1 Elevation wire | +0.7 KB | — | — | Graph rebuild, 1–2 passes; snapshot regen ×11 if drift >1% | ~1 KB more JSON per `/route`; no extra queries |
| 2 `pool-reasoning` | +1.4 KB | — | — | — | — |
| 3 `elevation-profile` UI | +1.2 KB (net of deleting `terrain` from 62 rows) | — | — | — | — |
| 4 `apple-maps` | +0.3 KB | — | — | — | — |
| 5 `daylight-budget` | +1.5 KB | **none — no endpoint, no host, no request** | — | — | — |
| 6 `geolocate` | +1.1 KB | — | — | — | More cold ladders, in proportion to phone use. The honest ongoing cost of the feature |
| 7 `weather-filters` | +4.0 KB | **Open-Meteo** (proxy only; CC-BY, free tier is non-commercial) | `WEATHER_URL` var | — | Zero — different upstream. ~96 upstream calls/day/colo |
| 8 `places-expansion` | **+10 KB** | **Overpass** (build only, human-invoked) | — | 3 manual commands; harvest ~2 min, propose a few min | `/api/locate` ×~600 per propose run, local only. Runtime prefetch **falls** — the wide wave is capped at 90 |
| 9 `opening-hours` | +1.6 KB (up to +4 at full coverage) | Overpass, via chunk 8's harvester | — | `build:hours`, seconds; annual cadence | Zero |
| 10 `shareable-spins` | +1.8 KB | — | `run_worker_first`, one named edge cache | — | Zero — `/s` never reaches `handleApiRequest` |
| 11a `multiplayer-links` | +1.0 KB | — | **none** — no binding, no KV, no Durable Object | — | Zero of its own. What it does is *cause* 11b's load, one meeting at a time. Also a lower `/s` cache hit rate: nearly every meet link carries a pin and is rendered fresh |
| 11b `meet-in-the-middle` | +2.5 KB | **none — no clipper, and that refusal is the largest single cost decision in the chunk** | — | — | **Doubles per meeting, in the expensive direction.** One extra ladder for the partner: 96 contours, 1 upstream expansion against a configured instance and **24** against a stock one, charged per expansion. A link almost always carries a pin, and `PRESET_SNAPSHOTS` is a closed set of 11, so the snapshot path almost never helps. Plus one `/api/route` per pick. Charged per person, not per session |
| **Total** | **≈ +28 KB gzipped** | 2 (both proxied or build-time; the browser still talks to nothing but this origin) | 1 var, 1 assets line, 1 cache | 1 rebuild + 4 manual scripts | Net roughly flat for one walker; doubled for a meeting |

**The budget line, said plainly.** README line 91 claims 64 KB gzipped of app JavaScript. The
checked-in build is **71.2 KB** — `weather-filters` and `elevation-profile` each measured it
independently and each says so. The claim has been stale for some number of commits. v0.5 as
specified lands just under **100 KB**, which is roughly 1.55× a number the README already
overstates by 7 KB.

That number moved when chunk 11 joined, and it moved by 3.5 KB for a feature that adds an entire
second person to the app without a single new dependency. That is the right shape of cost and it is
still cost.

That is the single most important number in this document and no spec in the eleven fixes it.
Three consequences, all binding:

1. **No spec may claim to fit inside the 64 KB budget.** Each claims a *delta* and each records
   the measured before/after in its PR. An unmeetable criterion is one an implementer learns to
   ignore, which is the exact failure the budget exists to prevent.
2. **README line 91 is corrected in chunk 1**, to the measured figure, and re-measured at the end
   of chunk 11. (MapLibre is 284.5 KB, not the 276 the line claims.) A pride-point that is quietly
   wrong is worse than a bigger honest one.
3. **Getting back under 64 KB is its own piece of work with its own lever** — the obvious one
   being that `index-*.js` at 225 KB raw for an app this size wants a look at what
   `@phosphor-icons/react` is pulling in — and it is not smuggled into any of the eleven.
   `places-expansion`'s open question 2 (is 250 the right wall?) and its open question 1 (does
   `osm` earn its 1.4 KB?) are the two places where a v0.5 decision could give some of it back.

---

## 6. What this does not do

After all eleven ship, these are still true. They are listed because a plan that only names its
wins is a sales document.

**The budget is broken and stays broken.** ~99 KB against a 64 KB promise. Nothing in v0.5 pays it
down; three specs each explain why paying it down is not their job, and all three are right.

**The map is still downtown-shaped.** `places-expansion` adds places, not preset origins. There is
still no baked snapshot south of the James, so a Southside or Northside walker — precisely the
walker the expansion is for — pays a full cold ladder while the presets answer in 3–7 ms. Every
spec that touches this defers it, and the cost (~1.7 MB in git and a `SNAPSHOT_VERSION` bump per
origin) is real. It is the largest unaddressed asymmetry in the app.

**Most places will never have hours.** OSM coverage is thin — the research sample put it near 15
of 62 — and `unknown` renders as nothing. So the honest reading of `opening-hours` is that it fixes
the market and museum cases loudly and leaves the majority of the list exactly as it is today. The
README's confession is narrowed, not deleted.

**Two people share one walking pace.** `WALKING_SPEED_KMH` is pinned in the proxy and stamped into
every snapshot, and there is no per-request speed parameter — adding one would put a costing knob
on the one endpoint that costs real graph expansions, on a rate-limited path, and invalidate all
eleven baked ladders. So "both in reach" measures both walks at the same pace. One person walking
at 5 km/h and another at 2.5 makes the app wrong for both of them by the same amount in opposite
directions. The app admits this in a line on the card rather than implying otherwise, and no label
in the feature says "their pace" — but an admission is not a fix, and this is the one place where
what the app shows two people is a shared assumption rather than a measurement of either.

**The two devices in a meeting can disagree at the margin.** A meet link publishes both starts at
three decimals while the sender's own device keeps its start at five, up to ~70 m apart — wider
than the ~25 m grid the engine cuts contours on. A place within about a minute of the overlap
boundary can therefore be in one person's pool and not the other's. The *outcome* never depends on
it, because the answer link carries the pick; the counts on the two screens can still differ, and
that is stated rather than papered over.

**Nothing knows about the pavement.** No streetlights, so a daylight-clamped walk is a lit one on
average and not a safe one. No sidewalk quality, no kerb cuts, no crossings, no traffic. The app
can tell you a walk is 112 feet of climb and cannot tell you it is 112 feet of climb along a road
with no footway.

**Weather is one point in the middle of Richmond.** No radar, no per-place microclimate, no
"it is raining on Belle Isle and dry in Scott's Addition". The endpoint takes no coordinates by
construction, and that is the right call for abuse, but it means the forecast is a city-wide
average applied to a 6 × 7 km area.

**The device clock is trusted.** `weather-filters` corrects it once per forecast refresh via
`setClockOffset`; between refreshes, and entirely before that spec ships, a wrong clock produces a
plausible and wrong dusk time with no way to detect it. `daylight-budget` names this as its one
honest gap and it stays one.

**Nothing is remembered.** No preference persists across sessions — not the daylight guard, not
the weather switch, not your last origin. `daylight-budget`'s open question 1 raises it and defers
it. A walker who turns the guard on at 7pm turns it on again tomorrow.

**Two people can meet. Three cannot, and the app will not pretend otherwise.** The geometry
generalises for free — the pool test is an `AND` over N containments — and nothing else does: N cold
ladders against a per-IP limiter charged per graph expansion, N markers on a map with one accent
hue, N rows on a card, a list-shaped share key, and an empty-overlap curve that gets brutal faster
than linearly because every added person can only shrink the region. Three people in a river city
share nothing at any budget the dial has. So the partner is a single `Origin | null` and the keys
are `ma`/`mb`, singular. A `readonly Origin[]` with a length invariant of exactly one is a lie told
in a type.

**There is no overlap polygon and no overlap area.** The app draws two outlines whose fills happen
to composite where they cross, and names a **count** — "11 places you can both reach" — because a
count is exact and an area is not computable without either a clipper that fails on this repo's own
rings, a grid sample with a stated error bar, or an unbuilt raster mask. The densest patch on screen
is alpha compositing, not a measurement, and nothing anywhere names it.

**Both walkers walk at 3.69 km/h.** One pace is pinned in `server/proxy.ts` and stamped into every
snapshot; there is no per-request speed parameter and adding one is a policy change plus new abuse
surface on the one endpoint that costs real graph expansions. So the app is wrong for a 5 km/h
walker and a 2.5 km/h walker by the same amount in opposite directions, and all it does about that
is say so, once, in a `tier: "assumed"` line. No sentence in the feature may say "their pace".

**A meet link cannot be revoked and does not expire, and it says so in those words.** It is
stateless by design — no room, no socket, no account, no server that ever holds both coordinates at
once — so anyone holding the URL can read a coordinate out of it with a text editor forever. What
ships instead is a date, not a deadline, and copy that tells the sender to treat it like a text
message rather than a secret. An advisory expiry would look like a guarantee and be none.

**Opening an *answer* link warms two ladders with no gesture at all.** An invite costs the
recipient's browser nothing until they answer it; an answer names both starts, so `originChosen` is
false-to-true on the first paint and a full meeting's worth of engine work runs on open — including
for a third party the answer was forwarded to. It is one burst per open against the 240/minute
limiter, it is the same order as any cold pin origin, and it is not gated, because a link that
opened to a *Measure this* button is the ceremony this app refuses everywhere else.

**The two devices can show different counts.** Meet links carry a coordinate at three decimals, so
until an answer link comes back the two sides measure the shared start from points up to ~70 m
apart — wider than the ~25 m grid Valhalla cuts contours on — and a place within about a minute of
the boundary can be in one person's pool and not the other's. §2.9f refuses the fix that would
remove it, on the grounds that degrading a measurement to make two screens agree is the wrong
direction, so this is required copy on both sides. The *outcome* never diverges, because the answer
link carries the pick.

**Meet links are Richmond-shaped too.** `insideRichmond` now refuses a partner coordinate at decode
time, which is right today and is one more thing "other cities" will have to carry in the link when
somebody specs it.

**There is still no way to test the UI.** Every visual and interaction claim in nine specs — the
dial's dead zone, the reel's deceleration, the chart's focus ring, the counts line at 320px, the
result card's line order — is checked by a human looking at it. `node --test` covers the pure
layer beautifully and covers no component at all. That gap gets wider with every chunk, and v0.5
adds four new components and three new pure-to-visible seams to it.

**The reel still cannot show a cold place.** Only places whose route is already cached go on the
reel, which is the right call and unchanged. At 250 places with a 90-cap prefetch wave it happens
more often, and the "n of m routes are ready" notice does more work than it used to.

**The screen-reader line grows.** One `role="status"` sentence now carries up to eight clauses, and
nine in a two-person session. Refusing a second live region is right; nobody has listened to the
worst case.

**Seven decisions in the eleven need a person, not an implementer,** and none of them is settled by
this file: Richmond's actual park-hours ordinance (`opening-hours` Q1); the two climb thresholds
(`elevation-profile` Q1); whether refusing a 250 m fix is the trade we want, given it refuses most
desktop visitors (`geolocate` Q1); whether a dropped-pin share should publish somebody's front
door at 1 m precision (`shareable-spins` Q2); and whether this app will ever carry advertising or
a subscription, which is what decides whether Open-Meteo's free tier is licensed for it
(`weather-filters` Q1); and whether one pinned pace for two walkers is a stated assumption or a
reason not to ship this feature yet (`meet-in-the-middle` Q10). Open-Meteo's licence is the only one
left that can stop a launch.

**One of them is now closed.** How coarse a meet link's pin should be was the decision that got
harder to change after a link existed in somebody's messages, so it was measured rather than argued:
`MEET_PIN_PRECISION = 3`. Two decimals can flip an entire sixteen-place shared pool between the
sender's device and the recipient's, which is not a boundary that is wrong at the edges but two
devices answering the same question with disjoint sets. `multiplayer-links` Q2 carries the table and
the method. Two things that run learned along the way, both recorded there: the measurement needs a
live engine and cannot run "against the shipped snapshots and no network" — a displaced origin is a
different coordinate, and `public/reach/` holds the eleven exact preset points only — and the same
run is where the 78-versus-62 place count above came apart.

**And the thing v0.5 is proudest of is the thing it can most easily get wrong.** Ten features that
each remove places from a pool, each for a reason — the meeting is now one of them, and the
bluntest, because it can empty the pool completely for two people who simply live too far apart.
`pool-reasoning` exists precisely for that and lands second precisely for that, and the empty
overlap is the case it has to carry furthest: not a shrug, but the smallest budget at which there
is an answer. If one chunk in this plan is under-built, `pool-reasoning` is still the one that
costs the most.
