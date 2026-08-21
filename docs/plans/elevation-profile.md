# Elevation, and the route profile chart

**Status:** spec — not implemented
**Slug:** `elevation-profile`

## Depends on

- **`pool-reasoning`** — for the visible half only. `selectCandidates` is deleted by that spec, so
  the split into `selectCandidates` + `applyClimb` described below does not happen: the climb
  filter is one `PoolRule` with `deferred: true`, and the base pool this spec's decision 4 rests on
  is `PoolReport.baseIncluded` / `baseKey` (`docs/plans/README.md` §2.3b). The three-part rule —
  unmeasured passes, settled-unmeasurable is excluded, the gate is `routesWarming` and not
  `reelIsShort` — survives intact; only its expression changes.

This spec is **split across two chunks**, which is why it appears twice in the build order.
**Chunk 1** is everything below the UI — `build_elevation=True` and the graph rebuild, the smoke
check, `elevation_interval: 30`, `src/lib/elevation.ts`, `WalkingRoute.profile`,
`elevationAvailable`, `route-store` v2, the contour-drift measurement and the snapshot
regeneration. It runs **first in the whole plan**, before `pool-reasoning`, because the graph
rebuild is the only irreversible act in v0.5 and it moves the contours under every other spec's
"snapshots untouched" claim. **Chunk 3** is the chart, the Climb stat, the Climb filter and the
deletion of `Terrain`, and needs `pool-reasoning` landed.

**Two specs depend on this one:** `places-expansion` loses its entire terrain-derivation pipeline
because `Place.terrain` is deleted here (`docs/plans/README.md` §2.4 — the relief ring, the nine
`/locate` probes and the elevation prerequisite all come out of that spec), and
`shareable-spins` serialises `climb`, not `terrain`. The `POST /api/height` contract that spec
asks for is void.

## What and why

Today the result card says `Terrain: Flat` because someone typed `terrain: "flat"` next to a
coordinate. That field is a fact about a dot on a map, and a walk is not a dot. Libby Hill Park is
tagged `hilly` and it is hilly from everywhere; Capitol Square is tagged `flat` and getting to it
from Shockoe Bottom is a hundred vertical feet of Governor Street. The tag cannot express the thing
the walker actually feels, because the thing the walker feels is a property of the *route*, and the
route is something this app already asks the engine for and already draws on the map.

So: real elevation. Valhalla returns an elevation profile inline on the same `/route` response the
app already makes — one extra parameter, no new endpoint, no second round trip, documented in the
route API reference and quoted in decision 1. From that array the card gets a **Climb** stat (total ascent
over the walk, in feet), and underneath it a hand-drawn SVG profile of the walk: a filled area chart
with a min/max/ascent/descent readout, a keyboard- and touch-scrubbable cursor, and a text
alternative that states the same numbers, because a chart is a picture of a walk and not a
description of one. The hand-tagged `Terrain` field is deleted, and the terrain filter becomes a
**Climb** filter that means what it says: it filters on measured ascent per kilometre of the actual
route from *your* origin.

What it does not do. It does not give you a profile before the route exists — a climb filter is a
promise about a walk, and the app will not make that promise until it has measured it, so turning
the filter on makes the Spin button wait for the pool to finish warming rather than offering a short
reel. It does not sync the map's hover back into the chart (the chart drives the map, not the other
way round — see The decision). It does not work against the offline stub, which invents shapes and
will not be taught to invent hills; against an engine with no elevation in its graph the profile
block says so and the Climb filter is disabled rather than lying. And it does not pretend to
survey-grade accuracy: the source is 30 m SRTM, which in a city with about 70 m of total relief is
enough to tell a wall from a sidewalk and not enough to tell you about a kerb.

## The decision

**1. Elevation comes from `/route`, inline, at a 30 m interval.** `server/proxy.ts`'s `route()`
handler adds `elevation_interval: 30` to the body it already POSTs. Valhalla's route API reference
documents the parameter as *"Elevation interval (meters) for requesting elevation along the route.
Valhalla data must have been generated with elevation data. If no `elevation_interval` is specified,
no elevation will be returned for the route. An elevation interval of 30 meters is recommended when
elevation along the route is desired, matching the default data source's resolution."* and the
response as *"If `elevation_interval` is specified, each leg of the trip will return `elevation`
along the route as a JSON array. The `elevation_interval` is also returned. Units for both
`elevation` and `elevation_interval` are either meters or feet based on the input units specified."*
(`valhalla/docs/docs/api/route/api-reference.md`, lines 368 and 438.) Note what that settles: 30 is
the documented recommendation for exactly the reason this spec wants it, the array is per leg, and
the units follow the `units` the proxy pins. Note also what it corrects — the switch is *omission*,
not `elevation_interval: 0`; an earlier draft of this spec claimed `0` suppresses the field, which
the documentation does not say. Nothing in this design depends on `0` doing anything.

Rejected: a `/api/height` endpoint against Valhalla's skadi service. It would double engine calls on
the hottest path, need a new pathname guard, its own Worker cost function (or be billed as one unit
while carrying a whole polyline of vertices — a free worldwide DEM service for a scraper), a new
edge-cache branch and TTL, per-vertex bounds enforcement that `readLatLng` does not provide, and a
third async module cache with its own bump counter and attempt field in `Session`. That structural
list is the argument; it does not rest on skadi's configured `max_shape`, which this spec has not
measured on the instances in question and no longer cites. Also rejected: Open-Meteo (90 m GLO-90 —
coarser than the engine's own 30 m source, and a second source disagreeing with the hills the engine
routed over is worse than one source declining to answer), OpenTopoData (documented on
opentopodata.org as max 1 call/second, 1000 calls/day and 100 locations per request — all
per-deployment behind a Worker, so one enthusiastic visitor spends the day), and USGS 3DEP EPQS (the
best data there is, and a point-query service — a 200-sample profile is a request per sample to a
federal endpoint).

**2. Sample distance is `i * interval`, not haversine.** The samples are evenly spaced by the
interval from the leg start, so distance-along-route for sample `i` is `i * intervalMeters`, and the
profile's own span is `(n - 1) * intervalMeters`. That span is the axis the chart, the scrubber and
the map cursor all use — **not** `trip.summary.length`, which is the engine's own measured length and
differs from the sampled span by up to one interval. Mixing the two is how a scrubber reads
`undefined ft` off the end of the array. One length, used everywhere. This is also the
cumulative-distance array the repo did not have, arriving free.

*Assumption, not verified:* that the array length is exactly `ceil(leg_length_m / interval) + 1`.
The documentation does not state it and this spec does not depend on it — the reader takes the array
it is given, derives its own span from `samples.length`, and never computes an expected count.

**3. `Place.terrain` is deleted, not supplemented.** Keeping a hand-tagged hint alongside a measured
figure means two answers to one question, and the hint is the wrong answer — that is the whole
complaint this feature exists to fix. `Terrain` (the type), `terrain` (the field on all 62 places),
`Session.terrain`, the `terrain` action and the Terrain stat all go. Rejected: keeping `terrain` as
a pre-measurement fallback for the filter. It would make the filter silently mean two different
things depending on cache warmth, which is exactly the class of bug the repo's "absence-plus-flag"
loading model exists to make impossible.

**4. The central problem — what the filter means before the pool is routed — is solved by a stable
base pool, provisional membership, and a gate on `routesWarming` itself.** Three moving parts, and
all three are needed; an earlier draft got each of them wrong, so the mechanism is spelled out
exactly.

*The base pool is what the gate counts.* `selectCandidates` is split into two passes. The first
applies every filter that is knowable synchronously — vibes, `edgeOnly`, containment — and yields
`baseCandidates`. The second applies the climb filter on top and yields `candidates`. **Route
prefetch, `settledRoutes`, `routesPending`, `poolKey` and the warm grace all key on
`baseCandidates`, never on `candidates`.** This is the fix for the churn the old design created:
with the gate keyed on `candidateKey`, every route that settled as hilly left the pool, changed
`candidateKey` (App.tsx:181), re-ran the prefetch effect (App.tsx:217-223), restarted the 12-second
timer (App.tsx:278-281) and decremented the denominator of `Measuring climb n/total` while the user
watched it. Keyed on `baseCandidates` the denominator is fixed the moment the contour lands, the
timer runs once, and the prefetch wave fires once. It is also the *correct* set on its own terms:
the gate's question is "has every place the climb filter is deciding about been measured", and that
set is the base pool, not the survivors.

*Unmeasured places pass; settled-without-a-climb places are dropped.* A place whose route has not
settled has unknown climb and stays in the pool, because dropping it would make the pool shrink and
regrow as it warms. But a place whose route **has** settled and still has no climb — a cached `null`
("the engine says there is no walking route here") or a permanently failed attempt, both of which
`cachedRoute`/`routeSettledFailed` count as settled and for both of which `climbOf` returns
`undefined` — is not a promise any more. It is a measured absence, and with a climb filter on it is
**excluded**. Without this rule the old design leaked: the gate would open on a fully settled pool
while provisional passes for unmeasurable places rode through it, and the reel could land on a walk
whose climb was never measured under a filter that claims otherwise. So `climbOf` is not enough on
its own; `selectCandidates` needs to distinguish "not yet" from "never", and the closure App passes
supplies both.

*The gate is `routesWarming`, not `reelIsShort`.* `reelIsShort` (App.tsx:287) only renders the
"n of m routes are ready" notice at App.tsx:641. The Spin button's `disabled` (App.tsx:626-632) and
`spin()`'s early return (App.tsx:344) both read `routesWarming` (App.tsx:285). Forcing `reelIsShort`
false would have left Spin *enabled* 12 seconds after the pool key changed, with the pool half
measured — precisely the state this section claims is impossible. The change is therefore to
`routesWarming` itself:

```ts
const routesWarming = routesPending && (state.climb !== "any" || !warmGraceOver);
```

With a climb filter on, the grace no longer opens the gate; only settlement does. `reelIsShort` is
left exactly as it is and simply cannot be true while a climb filter is on, because `routesPending`
false is its other conjunct. The label at App.tsx:637-639 becomes `Measuring climb n/total` when
`state.climb !== "any"` and stays `Loading routes n/total` otherwise, with `n` and `total` over
`baseCandidates`.

Two things follow, and both are the point. The user cannot spin on a promise the app has not
verified. And because every base candidate is settled before a throw can start, no candidate's climb
can change during a throw, so the `candidateKey` churn that fires the spin-abort effect cannot
happen mid-reel. The 12-second `ROUTE_WARM_GRACE_MS` grace still governs the `climb === "any"` case
exactly as it does today.

*Accepted, not hidden:* with a climb filter on, `ReachReadout`'s `placeCount` (App.tsx:608) counts
down as hilly places are measured and excluded. The alternative — showing the base count until the
pool settles — would be the readout stating a number the filter is about to contradict. Counting
down next to a Spin button that says `Measuring climb n/total` is legible; the readout is not
re-animated by it, because its `commitKey` is `state.framingKey`, which settlement does not touch.

Rejected: baking a per-place climb-from-each-preset figure into `public/reach/*.json`. It is 11
origins × 62 places = 682 route calls per rebuild (versus one parameter on a request the app already
makes), it answers for preset origins only while the draggable pin is a first-class feature, and it
would be a second source that can disagree with the live route drawn on the same card. Also
rejected, and more tempting: baking a single elevation number per place (62 integers, roughly 0.25 KB
gzipped, one build-time `/height` sweep) and using net elevation change origin→place as a cheap
proxy. It is cheap and it is honest about being a proxy, but net change is a different quantity from
ascent — a walk that crosses a valley climbs twice and nets zero — and shipping a number that
disagrees with the chart drawn directly beneath it is not a trade this repo makes. If a future spec
wants a pre-measurement hint for ordering or for `pool-reasoning`'s prose, it can revisit this; v1
does not bake it.

**5. The chart's y-axis zooms, with a floor.** Apple zooms to the profile's own min/max and thereby
exaggerates; an absolute 0–70 m axis would draw every downtown walk as a flat line and waste the
box. The decision is zoom-with-a-floor: the drawn vertical range is
`max(maxMeters - minMeters, PROFILE_MIN_RANGE_M)` with `PROFILE_MIN_RANGE_M = 20`, centred on the
profile's midpoint. A walk with 3 m of relief draws as a nearly-flat trace inside a 20 m window and
reads as flat; a walk with 60 m fills the box. The readout under the chart prints the real min and
max in feet, so the reader can always check the exaggeration against the numbers. A pure zoom would
render 2 m of sidewalk camber as an alpine stage, which is the specific failure the user must not
see.

**6. Ascent is computed with hysteresis, not naively.** Summing every positive delta over a 30 m
DEM turns sampling noise into climb: a genuinely flat two-mile walk can accumulate 30 m of fictional
ascent. `climbFrom(samples, hysteresis)` only banks a rise once it has exceeded
`ELEVATION_HYSTERESIS_M = 2` from the last turning point. This is the standard barometric/GPS
smoothing rule and it is the difference between "Flat" meaning flat and "Flat" never appearing.

**7. Hover sync is chart → map only.** Scrubbing the chart moves a dot along the drawn route. That
direction is cheap: the chart already knows metres-along-route for every sample, and turning metres
into a coordinate needs one new pure function over `route.coords` (a cumulative-distance array,
equirectangular, memoised on the route object's identity the way `smooth.ts` memoises contours) plus
one new source/layer pair on the map. The reverse direction — mousemove over a 2.6 px line, needing
`queryRenderedFeatures` across a padded bbox, then projecting the pointer onto the nearest segment,
then a keyboard equivalent, then an answer for touch where hover does not exist — is several times
the work for the weaker half of the interaction, and is **out of scope**. The chart's own scrubber
(a real `<input type="range">`, so keyboard and touch both work) is the single input.

**8. Availability is learned from any settled route with a shape — including a rehydrated one.**
`route.ts` keeps `let sawElevation: boolean | undefined` and exposes
`elevationAvailable(): boolean | undefined`, where `undefined` means nothing has settled yet. The
subtlety that an earlier draft missed: setting the flag only inside `requestRoute` leaves it
`undefined` forever on the path that matters most. `entryFor` serves rehydrated entries straight out
of `route-store` with no network call — that is the whole point of the store, and after one visit it
is the common case. Against an elevation-less engine on a warm reload no request ever fires, so the
flag never becomes `false`, so `ResultCard`'s fallback (gated on `elevationAvailable() === false`)
never renders and the card shows `Climb -` beside a blank where the chart should be. So:

```ts
/** Both settle paths call this. Sticky true: one profile proves capability forever. */
function noteElevation(hasProfile: boolean): void {
  if (sawElevation === true) return;
  sawElevation = hasProfile;
}
```

called from `requestRoute` and from `entryFor`'s rehydration branch, and in **both** cases only for
an entry that actually has a shape. A `null` entry means "no walking route between these points",
which is a fact about the city and says nothing about the engine's DEM; letting it set the flag
`false` would disable the Climb filter because two places happen to be unwalkable. This keeps the
"is this engine capable" question on the plumbing that already exists rather than growing
`/api/health` a field and a new client caller.

**Expect the contours to move.** Whether `build_elevation=True` changes pedestrian costing was an
open worry in the last draft; the route API reference settles it in the *unwelcome* direction.
Pedestrian costing documents a `use_hills` option — *"a range of values from 0 to 1, where 0 attempts
to avoid hills and steep grades even if it means a longer (time and distance) path... penalties are
applied to roads based on elevation change and grade"* — **with a default of 0.5**
(`api/route/api-reference.md` line 242). The proxy does not pin `use_hills`, so it is running at 0.5
today over a graph with no elevation, and will keep running at 0.5 over a graph that has some. Grade
penalties that were inert become live. Contours in a city with 70 m of relief will shift, which puts
`public/reach/*.json` out of agreement with runtime costing — the exact disagreement the precompute
ethos exists to prevent.

So the snapshot regeneration is the expected path, not the unlucky one. The check stays, to size the
move rather than to decide whether there was one: after the rebuild, run `scripts/build-reach.mjs`
for `DEFAULT_ORIGIN` into a scratch directory and compare the 100-minute contour's `areaSqMeters`
against the shipped snapshot. Under 1%, leave the snapshots alone and record the figure. Over, bump
`SNAPSHOT_VERSION` to 3 and regenerate all 11 files as part of this change. The one thing not
allowed is shipping the graph rebuild without running the comparison.

Pinning `use_hills: 0` would make the drift go away by making the engine ignore the hills it just
learned about — a coherent choice, but a decision about what kind of walk the app recommends, not
about measuring one. It goes in its own spec. This one leaves `use_hills` unpinned and pays the
regeneration; see open question 2.

**9. On a round trip the chart draws the round trip.** This closes what was open question 2, and it
closes it by noticing that the question as posed produced a card that contradicts itself. The old
design had the Climb stat show `ascent + descent` on a round trip while the figcaption directly
beneath it printed the one-way `↑ascent / ↓descent`, the SVG's `aria-label` said `over 0.8 miles`
while the Distance stat two inches away said 1.6, and the scrubber ran to half the walk. Four
statements of the same walk, disagreeing on screen. That is exactly the failure this document refuses
in decision 3 when it rejects the cheap elevation proxy — a number that disagrees with the chart
drawn directly beneath it.

**Overturned after implementation, by the reader, on 2026-08-21.** The chart now shows the **outbound
leg only**, on a round trip as much as a one-way, and a line under the figure says so: *"The way out.
You come back the same way."*

The disagreement this decision was written to fix is real, and the fix stands - four statements of one
walk must not contradict each other. What changed is which walk they describe. Mirroring made every
number agree by describing the out-and-back, but it also drew the same hill twice: a symmetric hump
whose second half carries no information, because the return is the outbound backwards and every
reader already knows that. The shape of the climb is the thing worth looking at, and half the pixels
were spent restating it.

So the four statements are reconciled on the outbound instead. The Climb stat, the figcaption, the
`aria-label` and the scrubber all describe the leg the chart draws; the Distance and duration stats
above still describe the whole outing, and the note is what stops that being a contradiction rather
than leaving the reader to infer it from a distance that does not match. `mirrorProfile` and the
`m > L -> 2L - m` fold in `syncHover` are both deleted, along with the two tests that covered them.

The original reasoning is kept below because it is still the argument for *why the numbers must
agree*, which is the part that did not change.

~~The fix is not to pick one of the four. It is to make the profile describe the walk the rest of the
card describes. On a round trip the profile is **mirrored**: `mirrorProfile(p)` returns samples
`[...p.samples, ...p.samples.slice(0, -1).reverse()]`, with `ascentMeters = p.ascentMeters +
p.descentMeters` and `descentMeters` the same, `min`/`max` unchanged, `intervalMeters` unchanged.
Everything then falls out with nothing left to reconcile: the stat is the mirrored profile's
`ascentMeters` (which *is* ascent + descent, now because the chart shows both climbs rather than
because a stat was doubled by hand), the figcaption reads the mirrored totals, the `aria-label` states
the doubled distance that matches the Distance stat, the scrubber spans the doubled length, and the
trace visibly goes out and comes back — which is what an out-and-back walk looks like and is more
honest than a one-way chart under a doubled headline.

The map cursor follows: for `m` past the one-way span `L`, the dot is drawn at `pointAtMeters(coords,
cumulative, 2L - m)`, retracing the drawn line backwards. Correct, because that is the walk.
Mirroring is done in `ElevationProfile.tsx` from the one-way profile and the `roundTrip` flag; the
stored and cached profile is always one-way, so toggling Round trip costs an array build and no
refetch.

## Data and types

### `src/lib/route.ts`

```ts
/**
 * Metres above sea level along the walk, evenly spaced. Sample `i` sits at
 * `i * intervalMeters` from the start, so the profile spans
 * `(samples.length - 1) * intervalMeters` - which is the walk's length as this
 * profile measures it, and is not the same number as the trip summary's.
 * Everything that scrubs, draws or labels this profile uses the span above.
 */
export type ElevationProfile = {
  samples: number[];
  intervalMeters: number;
  /** Metres gained, with small oscillations suppressed. See climbFrom. */
  ascentMeters: number;
  descentMeters: number;
  minMeters: number;
  maxMeters: number;
};

export type WalkingRoute = {
  coords: LngLat[];
  distanceMeters: number;
  durationSeconds: number;
  /** null when the engine answered without usable elevation. */
  profile: ElevationProfile | null;
};

/**
 * Whether this engine can measure hills. undefined until the first route
 * settles; false once one has settled without a plausible profile.
 */
export function elevationAvailable(): boolean | undefined;
```

### `src/lib/elevation.ts` (new, pure, no runtime imports)

```ts
export type ClimbBand = "easy" | "hilly";

export type ClimbTotals = { ascentMeters: number; descentMeters: number };

export function climbFrom(samples: readonly number[], hysteresisMeters: number): ClimbTotals;

/** false for the sentinel (-500), for absurd values, and for < 2 samples. */
export function plausibleProfile(samples: readonly number[]): boolean;

export function classifyClimb(ascentMeters: number, distanceMeters: number): ClimbBand;

// mirrorProfile was here. Deleted when decision 9 was overturned: the chart
// draws the outbound leg on a round trip too, and says so on the figure.

/** Elevation at `meters` along the profile, clamped to both ends of `samples`. */
export function elevationAt(profile: ElevationProfile, meters: number): number;

/** Chart geometry. y is 0 at the top of the box, matching SVG. */
export type ProfilePoint = { x: number; y: number };

export function profilePoints(
  samples: readonly number[],
  width: number,
  height: number,
  minRangeMeters: number,
): ProfilePoint[];

export function areaPath(points: readonly ProfilePoint[], height: number): string;
export function linePath(points: readonly ProfilePoint[]): string;

/** Decimation to at most `maxPoints`, preserving the global min and max. */
export function resample(samples: readonly number[], maxPoints: number): number[];
```

### `src/lib/geometry.ts` (addition)

```ts
/**
 * Metres from the start of the line to each vertex. `out[0]` is 0 and
 * `out.length === coords.length`. Equirectangular, which at city scale is
 * accurate to well under a metre and does not cost a geo library.
 */
export function cumulativeMeters(coords: readonly LngLat[]): number[];

/** The coordinate `meters` along the line, linearly interpolated. */
export function pointAtMeters(
  coords: readonly LngLat[],
  cumulative: readonly number[],
  meters: number,
): LngLat | null;
```

### `src/data/places.ts` (removal)

`export type Terrain` is deleted. `Place` becomes
`LngLat & { id: string; name: string; tags: Vibe[] }`. All 62 entries lose `terrain:`.

### `src/app/session.ts` (change)

`Session.terrain: Terrain | "any"` becomes `Session.climb: ClimbBand | "any"`.
`{ type: "terrain"; terrain }` becomes `{ type: "climb"; climb: ClimbBand | "any" }`.

### Wire shape — `POST /api/route` request to Valhalla (proxy → engine)

Unchanged except for one added top-level key:

```json
{
  "locations": [{ "lat": 37.5388, "lon": -77.4313 }, { "lat": 37.5268, "lon": -77.4174 }],
  "costing": "pedestrian",
  "costing_options": { "pedestrian": { "walking_speed": 3.69 } },
  "units": "kilometers",
  "directions_type": "none",
  "elevation_interval": 30
}
```

The `/api/route` response body is Valhalla's trip JSON, forwarded verbatim as today. The fields the
client now reads in addition to `trip.legs[].shape` and `trip.summary`:

```json
{ "trip": { "legs": [ { "shape": "…", "elevation_interval": 30.0, "elevation": [58.1, 57.9, …] } ] } }
```

`elevation_interval` is echoed in the *response's* units. The proxy pins `units: "kilometers"`, so
the echo is metres and the array is metres. (Verified: with `units: "miles"` the same request echoes
`98.4` and returns feet. If anything ever changes the pinned units, this reader changes with it.)

### `src/lib/route-store.ts` (schema v2)

```ts
export type StoredRoute = {
  at: number;
  encodedLegs: string[] | null;
  distanceMeters: number;
  durationSeconds: number;
  /** Absent when the engine gave no profile. Samples are whole metres. */
  profile?: { i: number; e: number[]; up: number; down: number };
};
```

`e` holds `Math.round(sample)` — 1 m is finer than a 20 m-floored chart can show, and halves the
bytes. `up`/`down` are the ascent and descent computed **before** rounding, because recomputing
`climbFrom` over rounded samples manufactures oscillation. `SCHEMA_VERSION` goes 1 → 2.

Sizing, shown rather than asserted, because the last draft guessed and guessed low. The module's own
comment puts an existing entry at about 700 bytes. Richmond elevations round to two or three digits,
so each sample costs 3–4 bytes of JSON including its comma; the wrapper keys cost about 30. A 25-minute
outbound leg at 3.69 km/h is ~1,540 m, so ~52 samples ≈ **+240 bytes**. The 100-minute ceiling is
~6,150 m, so ~206 samples ≈ **+850 bytes**. Entries therefore run ~940 bytes typical and ~1,550
worst case, not the ~1,100 previously claimed. `MAX_ENTRIES` goes 800 → **600**: at the typical size
that is ~560 KB, which is exactly the budget the store keeps today, and even an implausible store of
nothing but 100-minute walks stays under 1 MB — still far inside the usual 5 MB, which is what the
existing comment promises. Halving to 400 would have thrown away six origins of warm cache to buy
headroom the arithmetic does not need.

## Changes, file by file

**`server/proxy.ts`** — modified.
- New module-private constant `const ELEVATION_INTERVAL_M = 30;` with prose on why 30 (the DEM's own
  resolution; a finer interval buys interpolation, not detail).
- `route()` adds `elevation_interval: ELEVATION_INTERVAL_M` to the body passed to `callValhalla`.
- **A new `ROUTE_CACHE_VERSION`, not a bump of the shared one.** `CACHE_VERSION` (proxy.ts:105) is a
  single constant interpolated into *both* `isochroneCacheKey` (line 235) and `routeCacheKey` (line
  253). Bumping it for a route-only change also evicts every cached isochrone ladder — and
  `worker/index.ts` calls a ladder the most expensive operation there is, about 1.7 MB. Re-warming
  one per distinct custom pin to fix a route body is not "acceptable and cheap", it is the repo's own
  worst case paid for nothing. So: `CACHE_VERSION` stays `"v1"` and feeds `isochroneCacheKey`
  unchanged; a new sibling `const ROUTE_CACHE_VERSION = "v2";` feeds `routeCacheKey`, with prose
  saying why the two are separate and that a change to either endpoint's *body shape* bumps only its
  own. An elevation-bearing answer is a different answer at the same key and `ROUTE_CACHE_SECONDS` is
  seven days, so without this bump the edge serves profile-less bodies for a week after deploy. Preset
  origins are unaffected either way: their ladders ship as static snapshots and never touch the edge
  cache.

**`worker/index.ts`** — unmodified. `/api/route` is already forwarded, billed and cached; the body
grows, nothing else does.

**`server/vite-plugin.ts`** — unmodified.

**`wrangler.toml`**, **`.env.example`**, **`vite.config.ts`** — unmodified. No new environment
variable: the interval is a policy constant, and policy lives in the proxy.

**`valhalla/docker-compose.yml`** — modified. Add to `environment:`

```yaml
      # Elevation is read from the graph, not from skadi at request time, so
      # this is a build setting and not a serving one: turning it on for an
      # existing graph does nothing until the tiles are rebuilt. The image
      # fetches only the SRTM tiles covering the extract, and the clipped
      # Richmond bbox in ../richmond.env (-77.61,37.40 to -77.26,37.68) sits
      # wholly inside the single tile N37W078, so this is one tile.
      - build_elevation=True
```

The bbox claim is checked against `valhalla/richmond.env` lines 14-17, not assumed: N37W078 spans
longitude -78..-77 and latitude 37..38, and the extract's corners are inside it on all four sides.
The *download and disk* figures the last draft gave (~7 MB, ~25 MB) were not measured and are gone;
whoever runs the rebuild records the real ones in `valhalla/README.md`.

**Assumption — verify before running the rebuild.** The image's documentation says only that `True`
*"downloads elevation tiles which are covering the routing graph"* and that `Force` *"will do the
same, but first delete any existing elevation tiles"*
([nilsnolde/docker-valhalla](https://github.com/nilsnolde/docker-valhalla)). "Covering the routing
graph" reads as being driven by a graph that already exists, which would mean a single
`REBUILD=1 ./scripts/build-graph.sh` downloads the tiles *after* the build that needed them and
leaves the first graph elevation-less. This spec does not know the ordering, and the run script could
not be fetched to settle it. The instruction is therefore: run `REBUILD=1 ./scripts/build-graph.sh`
once, then run the smoke check below. If the route comes back without elevation, run it a second time
— the tiles are on disk by then — and record in `valhalla/README.md` which of the two it was. The
smoke check is what makes this safe to be unsure about: a two-pass build costs minutes, and a graph
that silently built without elevation costs a release.

**`valhalla/scripts/build-graph.sh`** — modified. The existing smoke check already demands a real
route across Richmond that answers with a `summary`; extend it to POST that route with
`"elevation_interval": 30` and fail loudly if the leg comes back without an `elevation` array or with
values at or below `-500`. A graph that built without elevation loads and answers routes without
complaint — this check is the only thing that will tell you.

**`valhalla/README.md`** — modified. A section on elevation: what `build_elevation` does, that it
requires `REBUILD=1 ./scripts/build-graph.sh` rather than a restart, the download and disk figures,
and the warning that the rebuild leaves you offline until it finishes.

**`LAUNCH.md`** — modified. One line in the deploy checklist: a self-hosted engine must have been
built with elevation, verified by the health/smoke step; without it the app runs, the card loses its
profile block, and the Climb filter is disabled.

**`valhalla/stub.mjs`** — modified only by a comment. The stub keeps answering `/route` without
elevation; that is a legitimate and *required* client state (pre-3.5 engines, un-rebuilt graphs) and
inventing a fourth fake is not worth the maintenance. The comment says so, and says that a developer
who wants to see the chart needs a graph built with elevation — either the local one after
`REBUILD=1`, or any public instance whose data was generated with elevation. The comment should not
name a specific public instance as verified: this spec has not probed one, and a hostname in a
comment that turns out not to serve elevation is worse than no hostname.

**`src/lib/elevation.ts`** — new. The pure functions above. No runtime imports, so `node --test` runs
it by type-stripping alone. Exports also: `ELEVATION_HYSTERESIS_M = 2`, `PROFILE_MIN_RANGE_M = 20`,
`CLIMB_EASY_MAX_M_PER_KM = 12`, `CLIMB_HILLY_MIN_M = 25`, `CHART_MAX_POINTS = 96`.

**`src/lib/route.ts`** — modified.
- `WalkingRoute` gains `profile: ElevationProfile | null`.
- `requestRoute` reads `leg["elevation"]` with `isJsonArray` and each entry with `isFiniteNumber`
  (never `typeof` — anti-slop `no-runtime-typeof`), and `leg["elevation_interval"]` with
  `isFiniteNumber`, falling back to 30 when the echo is missing but the array is not. It reads **the
  first leg only**: `route()` in `server/proxy.ts` sends exactly two `locations`, so there is exactly
  one leg, always. The last draft carried a multi-leg concatenation loop for a case the proxy cannot
  produce — and one that would have been wrong if it ever ran, since a leg's final interval is a
  partial one and concatenating legs breaks the `i * intervalMeters` rule the scrubber and the map
  cursor are built on. A response with more than one leg takes the first and ignores the rest; if
  some future spec sends a via point, it owns the partial-interval problem and this reader changes
  with it. The array goes through `plausibleProfile`; failure yields `profile: null`, not a throw.
- Module-level `let sawElevation: boolean | undefined;` behind `noteElevation` (decision 8), called
  from `requestRoute` **and** from `entryFor`'s rehydration branch, in both cases only for an entry
  that has a shape. Exported as `elevationAvailable()`; marked `@public` if knip cannot see a
  consumer, though App.tsx will.
- `entryFor` rehydrates `profile` from the stored form; `fetchWalkingRoute` writes it via
  `rememberRoute`.
- No new settlement predicate. App.tsx already imports `routeFailed as routeSettledFailed`
  (App.tsx:39) and pairs it with `cachedRoute`; that pair is what the closure below uses to tell
  "not yet" from "never".

**`src/lib/route-store.ts`** — modified. `SCHEMA_VERSION` 1 → 2, `MAX_ENTRIES` 800 → 600,
`StoredRoute.profile` as above, narrowed field by field with the `json.ts` guards on read. A v1 store
is dropped, not migrated, exactly as the existing comment promises.

**`src/lib/geometry.ts`** — modified. `cumulativeMeters` and `pointAtMeters` as above, plus a
module-level `WeakMap<readonly LngLat[], number[]>` memo keyed on the `coords` array identity, since
`WalkingRoute` objects are stable per pair in the LRU.

**`src/lib/format.ts`** — modified. `export function formatFeet(meters: number): string` —
`${Math.round(meters * 3.28084)} ft`, no decimal, because a foot of precision on a 30 m DEM is a
fiction. Every displayed elevation goes through it.

**`src/data/places.ts`** — modified. `Terrain` and the `terrain` field deleted; the module docstring
gains a sentence explaining that hilliness is now measured per route rather than tagged per place.

**`src/app/session.ts`** — modified. `terrain` → `climb` on `Session`, `initialSession.climb = "any"`,
the `terrain` action becomes `climb`, `clearFilters` resets `climb: "any"`. The exhaustive switch
makes the rename a compile error everywhere it matters.

**`src/ui/Filters.tsx`** — modified. `TERRAINS` becomes
`const CLIMBS: { id: ClimbBand | "any"; label: string }[] = [{ id: "any", label: "Any" }, { id: "easy", label: "Easy" }, { id: "hilly", label: "Hilly" }]`,
the legend becomes `Climb`, props become `climb` / `onClimb`. New prop
`climbAvailable: boolean` — when false the three chips render `disabled` and a `<p className="notice">`
below the fieldset says `Climb needs elevation data from the routing engine.` The chips are
`<button aria-pressed>`, and a disabled button beside an unassociated paragraph tells a screen reader
nothing, so the paragraph takes an id from `useId()` and every chip takes
`aria-describedby={climbAvailable ? undefined : noticeId}`. Cue stays `playTap`.

**`src/ui/ElevationProfile.tsx`** — new. The chart component (structure in Algorithm below).
`export type ElevationProfileProps = { profile: ElevationProfile; distanceMeters: number; roundTrip: boolean; hoverMeters: number | null; onHover: (meters: number | null) => void }`.

**`src/ui/ResultCard.tsx`** — modified.
- The third `<Stat>` changes from `Terrain` (line 69) to `Climb`. Its value is
  `formatFeet(shown.ascentMeters)` where `shown = route.profile` — the outbound leg, on a round trip
  too (decision 9, overturned)
  — the *same* object the chart below it draws, so the stat cannot disagree with the picture
  (decision 9). `null` while pending → the existing skeleton; `"-"` when the profile is absent.
- After `.result-stats` and before the warnings: `{route?.profile ? <ElevationProfile … /> : null}`,
  and when `route && !route.profile && elevationAvailable() === false`, a
  `<p className="profile-empty field-label">No elevation data from this engine.</p>` instead. Never
  an empty gap.
- New props `hoverMeters`, `onHoverRoute`, threaded from App.

**`src/app/App.tsx`** — modified.
- `selectCandidates(reach, vibes, edgeOnly)` loses its terrain argument entirely and becomes the
  synchronous pass. Its result is `baseCandidates`, and `baseCandidateKey` is the id join used by the
  prefetch effect (App.tsx:217-223), `poolKey` (line 277) and the grace timer (lines 278-281) in
  place of `candidateKey`. This *removes* a re-wave that exists today, since the climb filter can no
  longer restart a prefetch.
- New exported `applyClimb(places, climb, climbOf): Place[]` where
  `climbOf: (place: Place) => ClimbBand | "unmeasurable" | undefined`. `candidates = applyClimb(baseCandidates, state.climb, climbOf)`.
  The rule, per decision 4: `"any"` returns the input untouched; `undefined` (not settled) passes
  provisionally; `"unmeasurable"` (settled with no measurable climb) is excluded; anything else must
  equal the selected band. `candidateKey` is still the id join of `candidates` and still drives the
  spin-abort effect, unchanged.
- The closure App passes, read per render from the caches with no memoisation per house rule:
  a `cachedRoute(origin, place)` of `undefined` and no `routeSettledFailed` is `undefined`; a
  settled entry with a plausible `profile` is `classifyClimb(profile.ascentMeters, route.distanceMeters)`;
  anything else that has settled — a `null` entry, a settled failure, a route whose profile is
  `null` — is `"unmeasurable"`. Round trip does not enter into it: the filter bands the outbound
  walk, because doubling ascent and doubling distance leaves m/km unchanged and only the absolute
  `CLIMB_HILLY_MIN_M` floor would move. Banding on the outbound keeps Easy meaning the same thing
  with the Round trip switch either way.
- New `hoverMeters` state. It is **not** in `Session` — it is transient pointer state with no bearing
  on the walk, and putting it in the reducer would re-run every derivation on every scrub frame.
  `const [hoverMeters, setHoverMeters] = useState<number | null>(null);` cleared on `pickedId` change.
- Spin gating, per decision 4, and this is the whole of it:
  `const routesWarming = routesPending && (state.climb !== "any" || !warmGraceOver);` with
  `settledRoutes` and `routesPending` computed over `baseCandidates`. `reelIsShort` is **not**
  touched — it is only the notice at line 641, it never gated anything, and with a climb filter on it
  is false by construction. The button label at lines 637-639 reads
  `Measuring climb ${settledRoutes}/${baseCandidates.length}` when `state.climb !== "any"` and
  `Loading routes …` otherwise.
- `describeResult` gains a climb clause: `112 feet of climb` when a profile exists,
  `climb not measured` when the engine gave none and a route did arrive. This is the only path by
  which the chart's facts reach a screen reader through the rail's one `role="status"` line.
- `<Filters>` gets `climb`, `onClimb`, `climbAvailable={elevationAvailable() !== false}`.
- `<MapCanvas>` gets `hoverMeters`.

**`src/map/MapCanvas.tsx`** — modified.
- New prop `hoverMeters: number | null`.
- On `load`: a `route-hover` GeoJSON source, and a `route-hover-dot` circle layer added **without**
  the `UNDER_LABELS` beforeId (it is the answer; it must not hide behind basemap type) and **after
  the `places` layers at lines 263-290**, not after the `route` source at line 241. Those places
  layers are themselves added with no `beforeId`, so anything registered before them paints beneath
  them — a hover dot added next to the route source would slide under the picked-place marker at the
  exact moment the scrubber reached it. Paint: `circle-radius: weighted(5)`,
  `circle-color: "#ffffff"`, `circle-stroke-width: weighted(2)`, `circle-stroke-color: ACCENT`.
- One more sync effect on `[route, hoverMeters, roundTrip]` calling
  `syncHover(map, route, hoverMeters, roundTrip)`, which uses `cumulativeMeters`/`pointAtMeters`,
  sets `EMPTY` when `hoverMeters` is
  null. Its own effect, for the same reason the file's other effects are each their own.

**`src/styles/app.css`** — modified. New block after the result section:
`.profile` (display grid, gap 8px, margin 2px 0), `.profile-figure` (position relative, so the
scrubber can sit over the SVG), `.profile-chart` (display block, width 100%, height 76px, overflow
visible), `.profile-scrub` (position absolute, inset 0, width 100%, height 100%, opacity 0, margin 0,
cursor col-resize), and — **stated as a rule, not assumed** —
`.profile-figure:has(.profile-scrub:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }`.
The global `:focus-visible` ring at app.css:78 lands on an `opacity: 0` input and is therefore
invisible; without this rule the scrubber is keyboard-focusable with no focus indicator at all, which
is a WCAG failure the last draft asserted its way past. `:has()` rather than `:focus-within` so a
pointer click on the figure does not paint a ring, matching how
`.switch input:focus-visible + .switch-track` (app.css:936) already handles the same
visually-hidden-input problem in this file. `.profile-cursor`
(the SVG line, `stroke: var(--accent-soft)`), `.profile-readout` (display flex, gap 12px,
font-family var(--mono), font-size 11px, font-variant-numeric tabular-nums, color var(--ink-3)),
`.profile-readout b` (color var(--ink-2), font-weight 500), `.profile-empty` (margin 0, color
var(--ink-3)). Colours: `--accent` for the trace, `--accent-wash` → transparent for the fill
gradient, `--line` for the baseline. No new token, no new hue.

**`src/app/App.tsx` rail-collapse list and `inertWhen`** — unchanged; the chart lives inside
`.result`, which is already covered.

**`knip.json`** — unmodified, provided every new export has an in-app consumer. `resample`,
`areaPath` and `linePath` are consumed by `ElevationProfile.tsx`; if any pure helper ends up
test-only it takes an `@public` tag rather than a knip entry.

## Algorithm

### Reading the profile out of a leg

One leg. `route()` sends two locations and Valhalla returns one leg for two locations, so there is
nothing to concatenate — see the `route.ts` entry for why the loop the last draft had here was both
dead and wrong.

```
leg = legs[0]                   // isJsonObject or return null
arr = leg.elevation             // isJsonArray or return null
echoed = leg.elevation_interval
interval = isFiniteNumber(echoed) && echoed > 0 ? echoed : 30
samples = arr.filter(isFiniteNumber)
if samples.length !== arr.length: return null   // a non-number anywhere voids it
if !plausibleProfile(samples): return null
{ up, down } = climbFrom(samples, ELEVATION_HYSTERESIS_M)
return { samples, intervalMeters: interval, ascentMeters: up, descentMeters: down,
         minMeters: min(samples), maxMeters: max(samples) }
```

`plausibleProfile(samples)` is `samples.length >= 2 && samples.every(v => v > -100 && v < 2000)`.
The `-500` sentinel is `kNoElevationData` in Valhalla's `baldr/graphconstants.h`, and is emitted raw
by the serializer when a graph lacks
elevation — it is not null, and a chart that trusted presence rather than plausibility would draw a
confident line five hundred metres below sea level.

### `climbFrom(samples, hysteresis)`

A turning-point walk. Track `pivot` (the last confirmed extreme) and `direction` (0 up until the
first move exceeds the threshold). For each sample `v`:

```
if direction >= 0 and v > pivot: pivot = v                        // extending a rise
else if direction <= 0 and v < pivot: pivot = v                   // extending a fall
else if abs(v - pivot) >= hysteresis:                             // a real reversal
   if direction >= 0: up += pivot - runStart else down += runStart - pivot
   runStart = pivot; pivot = v; direction = -direction
```

with the final open run banked after the loop. Initialise `runStart = pivot = samples[0]`,
`direction = 0`, and treat `direction === 0` as "either", resolving on the first move of at least
`hysteresis`. The property that matters and that the tests assert: a monotone climb of H metres
returns exactly H regardless of how it is sampled, and a sawtooth whose teeth are smaller than
`hysteresis` returns 0.

### `classifyClimb(ascentMeters, distanceMeters)`

```
if ascentMeters >= CLIMB_HILLY_MIN_M: return "hilly"        // 25 m is a hill however far you walked
km = max(distanceMeters, 1) / 1000
return (ascentMeters / km) <= CLIMB_EASY_MAX_M_PER_KM ? "easy" : "hilly"
```

Rate, not total, is the primary test, because 30 m over a 90-minute walk is a gentle ramp and 30 m
over 800 m is Church Hill. The absolute floor stops a short steep climb from being diluted by a long
approach. Both thresholds are exported constants with prose; they are a judgement about this city
and should be tuned by walking, not by argument.

### `resample(samples, maxPoints)`

Return `samples` unchanged when `samples.length <= maxPoints`. Otherwise stride-decimate with
`step = (samples.length - 1) / (maxPoints - 1)`, taking `samples[Math.round(i * step)]`, then force
the global min and max back in: find their indices in the original, map each to its nearest output
slot, and overwrite. Preserving the extremes is what keeps the readout and the drawing agreeing —
a chart whose peak is 8 feet lower than the number printed beneath it is a bug the eye cannot see
but the ear can, once someone reads both aloud.

### `profilePoints(samples, width, height, minRangeMeters)`

```
lo = min(samples); hi = max(samples)
mid = (lo + hi) / 2
range = max(hi - lo, minRangeMeters)
top = mid + range / 2
n = samples.length
for i in 0..n-1:
  x = n === 1 ? 0 : (i / (n - 1)) * width
  y = ((top - samples[i]) / range) * height
```

`areaPath(points, height)` = `M {x0} {y0}` + `L {x} {y}`… + `L {xn} {height} L {x0} {height} Z`.
`linePath(points)` = the same without the closing skirt. Coordinates are emitted with
`.toFixed(2)` so the `d` string is stable across renders and diffable in a test.

### The SVG

Exact structure, in `ElevationProfile.tsx`. `W = 300`, `H = 76` user units; the element is
`width="100%"` with `preserveAspectRatio="none"`, so the box stretches to the card and the stroke is
kept honest by `vector-effect="non-scaling-stroke"`.

```html
<figure class="profile">
  <div class="profile-figure">
    <svg class="profile-chart" viewBox="0 0 300 76" preserveAspectRatio="none"
         role="img" aria-label="{textAlternative}" focusable="false">
      <defs>
        <linearGradient id="{gradientId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0"   stop-color="var(--accent)" stop-opacity="0.28" />
          <stop offset="1"   stop-color="var(--accent)" stop-opacity="0.02" />
        </linearGradient>
      </defs>
      <path d="{areaPath}" fill="url(#{gradientId})" />
      <path d="{linePath}" fill="none" stroke="var(--accent)" stroke-width="1.6"
            stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
      <line x1="0" y1="75.5" x2="300" y2="75.5" stroke="var(--line)" stroke-width="1"
            vector-effect="non-scaling-stroke" />
      {hover && <line class="profile-cursor" x1={hx} y1="0" x2={hx} y2="76"
                      stroke-width="1" vector-effect="non-scaling-stroke" />}
      {hover && <circle cx={hx} cy={hy} r="3" fill="#ffffff" stroke="var(--accent)" stroke-width="2"
                        vector-effect="non-scaling-stroke" />}
    </svg>
    <input class="profile-scrub" type="range" min="0" max="{spanMeters}" step="{intervalMeters}"
           value="{hoverMeters ?? 0}"
           aria-label="Scrub the elevation profile"
           aria-valuetext="{formatMiles(m)} in, {formatFeet(elevationAt(shown, m))}" />
  </div>
  <figcaption class="profile-readout">
    <span><b>↑{formatFeet(ascent)}</b> up</span>
    <span><b>↓{formatFeet(descent)}</b> down</span>
    <span><b>{formatFeet(min)}–{formatFeet(max)}</b> elevation</span>
  </figcaption>
</figure>
```

`gradientId` comes from `useId()`; two result cards in one document must not share a `<defs>` id.
The `role="img"` label is the text alternative and states the same facts as the readout plus the
shape: `"Elevation profile: 112 feet of climb and 40 feet of descent over 0.8 miles, between 24 and
138 feet above sea level."` The readout is visible, the label is for the image, and `describeResult`
carries the headline number into the rail's single `role="status"` line — three statements of the
same fact, none of which is a live region, which is the existing decision about this card.

`spanMeters` is `(shown.samples.length - 1) * shown.intervalMeters` — the profile's own span, per
decision 2 — and never `trip.summary.length`, which is a different measurement of the same walk and
would let the slider's last step index past the end of `samples`. `elevationAt` clamps its index at
both ends regardless, so `aria-valuetext` cannot read `undefined ft` even if a future caller gets the
max wrong.

The range input is the whole input story: pointer drag, touch drag, arrow keys and Home/End all work
for free, and it gets its focus ring from the `:has()` rule above. `onInput` sets
`hoverMeters`; `onPointerUp`, `onBlur` and `onMouseLeave` on `.profile-figure` clear it to `null`.
Sound: `playTap(true)` once when a scrub begins (`onPointerDown` / first keydown) and nothing per
sample — a continuous drag with a cue per step is a zip, not a control. Reduced motion: the chart has
no animation to suppress. The cursor is positioned, not tweened; the `rise` keyframe on `.result`
already covers the card's entrance and is already clamped by the global block.

### Flat walks

A profile whose real range is under 20 m is drawn inside a 20 m window, so its trace sits near the
vertical centre and wanders by a few pixels. It reads as flat because it *is* flat, and the readout
says `↑12 ft up / ↓9 ft down / 41–58 ft elevation` to confirm it. There is no special case and no
"flat" branch in the drawing code; the floor on the range is the whole mechanism.

### Chart → map cursor

`cumulativeMeters(coords)` builds the per-vertex distance array once per route and memoises it on the
`coords` identity. `pointAtMeters` binary-searches for the bracketing pair and lerps. The route's
`distanceMeters` (from the summary) and the polyline's own summed length differ slightly; the scrub
uses the profile's own metres and clamps to `cumulative.at(-1)`, so the dot never runs off the end.

## Failure and degradation

- **Engine graph built without elevation.** `/route` answers with no `elevation` key, or with `-500`
  sentinels. `plausibleProfile` rejects, `profile` is `null`, `elevationAvailable()` becomes `false`.
  The card shows Climb `-` and, in place of the chart, `No elevation data from this engine.` The
  Climb chips render disabled with the notice `Climb needs elevation data from the routing engine.`
  If a climb filter was already selected when this is learned, the reducer is not touched, but the
  filter does **not** silently pass everything: `climbOf` returns `"unmeasurable"` for every settled
  place, so the pool empties and the `emptyNotice` path below explains it, with the disabled chips
  and their notice saying why. That is the correct outcome — a filter that claims to select on
  measured climb, against an engine that measures none, matches nothing. The last draft had it
  passing everything, which is a filter lying about what it did.
- **Offline stub.** Identical to the above, by design. The valhalla README says so.
- **Engine unreachable / 502 / 504 / rate-limited.** Unchanged behaviour: the existing route retry
  ladder and `Could not measure this walk.` warning own this. No profile is a consequence of no
  route, not a separate failure, and gets no second message.
- **`VALHALLA_URL` unset (503).** Unchanged: the existing not-configured notice.
- **A route settles but the profile is implausible on one leg only.** The whole profile is rejected —
  a chart of half a walk is worse than no chart, and the reader has no way to know which half.
- **Stale localStorage.** A v1 store is dropped wholesale on read, as the existing `SCHEMA_VERSION`
  contract promises. First visit after deploy re-fetches; nothing is migrated and nothing is wrong.
- **Stale edge cache.** Prevented by the `ROUTE_CACHE_VERSION` bump. Without it, seven days of
  profile-less bodies at unchanged keys, and the app would correctly but confusingly report that the
  engine has no elevation. Isochrone ladders keep their keys and their warmth.
- **Climb filter with a pool that never finishes warming.** The Spin button stays disabled with
  `Measuring climb n/total`. It cannot stall short of `total`, because the denominator is the base
  pool and every base candidate settles one way or another — a route, a `null`, or a spent attempt
  ladder — so the count always reaches its end. What it does not promise is *speed*: a rate-limited
  engine can make that take a while, and unlike the `climb === "any"` case there is no 12-second
  escape. That is the trade decision 4 makes deliberately. A user who does not want to wait sets
  Climb back to Any and spins, which is one press away in the same drawer, and the button says what
  it is waiting for the whole time.
- **Zero candidates because the climb filter excluded everything.** The existing `emptyNotice` path,
  with copy extended: `Nothing in reach with that much (or that little) climb.` plus the existing
  Clear filters link.
- **Snapshot disagreement after the graph rebuild.** Caught by the check named in The decision, not
  by users. If it is skipped and contours do move, preset origins draw pre-elevation reach against
  post-elevation routes — the failure is quiet, which is precisely why the check is mandatory.

## Cost

**Bundle — and the budget is already blown, before this feature.** `npm run build` on the current
`v0.4` tree reports `dist/assets/index-*.js` at **225.03 kB raw / 71.34 kB gzipped**. `README.md:91`
claims "64 KB gzipped of app JavaScript". That figure is stale by about 7 kB and has been for some
number of commits; a spec that budgeted itself as "3.3% of the 64 KB budget" was spending headroom
that does not exist. Two consequences, both this spec's to carry:

- The measured number goes in the PR, before and after, and `README.md:91` is corrected to the real
  post-change figure in this same change. A pride-point that is quietly wrong is worse than a bigger
  honest one. (While in there: maplibre now gzips to 284.53 kB, not the 276 the line claims.)
- The estimates below are estimates. `elevation.ts` ~1.6 KB raw / ~650 B gzipped (it grew
  `mirrorProfile` and `elevationAt`). `ElevationProfile.tsx` ~2.6 KB raw / ~950 B gzipped.
  `cumulativeMeters` + `pointAtMeters` ~700 B raw / ~300 B gzipped. `formatFeet` ~80 B. The map hover
  source/layer/effect ~500 B raw / ~200 B gzipped. CSS is a separate chunk and does not touch the JS
  budget. Against that, deleting `terrain` from 62 places and the `Terrain` type gives back roughly
  1.1 KB raw / ~250 B gzipped. Net: **roughly +1.9 KB gzipped**, landing near 73.2 kB.

That is the honest number, and it is a real regression on a real problem. What this spec does **not**
do is pretend the 64 KB line is a gate it passes. Restoring the budget is a separate piece of work
with its own lever — the obvious one being that `index-*.js` at 225 kB raw for an app this size wants
a look at what Phosphor is pulling in — and inventing a deletion here to hit a number would be
padding, not engineering. No new dependency, and no Phosphor glyph is imported for this feature (the
arrows are text).

**Requests.** Zero added. Every profile rides a `/route` response the app already makes.

**Bytes over the wire.** ~1 KB of JSON per route at 30 m for a typical walk, ~1.3 KB at the
100-minute ceiling, before gzip — roughly what the encoded shape already costs. The wide prefetch
wave routes to every place inside the 100-minute contour, so a cold origin change costs up to
~60 KB more (well under 20 KB gzipped) spread over 62 responses at concurrency 6. Not free, and
proportionate: this is the data the feature is about. If it ever bites, the lever is a coarser
interval for the prefetch wave and 30 m for the picked route — explicitly **not** taken here, because
two intervals mean two answers at one cache key.

**localStorage.** Entries grow from ~700 bytes to ~940 typical and ~1,550 worst case; `MAX_ENTRIES`
drops 800 → 600, which holds the typical store at ~560 KB — the budget it keeps today — and an
all-100-minute store under 1 MB. Arithmetic in the route-store section above.

**Engine load.** No extra queries. Serving elevation is an EdgeInfo read on edges already being
walked; per-request cost is in the noise.

**Build time.** One-off: the graph rebuild, possibly twice (see the docker-compose note). One SRTM
tile, N37W078, covering the whole clipped bbox; the download and disk figures are recorded during the
rebuild rather than guessed here. Extra `enhance` time over this repo's handful of tiles is seconds —
the known multi-week elevation-enhance complaint is a planet-scale problem at 22,444 tiles and does
not scale down. Plus — and per decision 8 this should be planned for, not hoped against — a full
snapshot regeneration of all 11 preset ladders, because pedestrian `use_hills` defaults to 0.5 and
will start biting the moment the graph has grades.

**Hosting.** None. No new binding, no new env var, no new endpoint, no new outbound host, no CSP
change (nothing new is reached from the browser).

## Tests

New file `src/lib/elevation.test.ts`, under the existing `node --test "src/**/*.test.ts"` glob. It
imports with the explicit extension — `from "./elevation.ts"` — as every existing test in this repo
does (`src/lib/geometry.test.ts:3`); without it `node --test` will not resolve the module.

Fixtures:

```ts
const FLAT   = [41.0, 41.4, 40.8, 41.2, 40.9, 41.3];              // noise, no hill
const RAMP   = [20, 25, 30, 35, 40, 45, 50];                       // +30 monotone
const HILL   = [20, 35, 50, 44, 30, 20];                           // +30 then -30
const VALLEY = [50, 40, 30, 40, 50];                               // -20 then +20
const SENTINEL = [-500, -500, -500];
const LIBBY  = [8, 14, 23, 31, 38, 41, 43];                        // Shockoe -> Libby Hill, ~35 m
```

- `climbFrom: a monotone ramp returns exactly its total rise` — `climbFrom(RAMP, 2)` → `{ up: 30, down: 0 }`.
- `climbFrom: noise below the hysteresis is not climb` — `climbFrom(FLAT, 2)` → `{ up: 0, down: 0 }`.
- `climbFrom: an up-then-down profile banks both halves` — `climbFrom(HILL, 2)` → `{ up: 30, down: 30 }`.
- `climbFrom: a dip is descent then ascent, not zero` — `climbFrom(VALLEY, 2)` → `{ up: 20, down: 20 }`.
- `climbFrom: hysteresis 0 counts every delta` — `climbFrom(FLAT, 0).up` is `> 0`, proving the
  threshold is what suppresses noise and not a rounding accident.
- `climbFrom: a single sample is no climb` — `climbFrom([41], 2)` → `{ up: 0, down: 0 }`.
- `plausibleProfile: the -500 sentinel is rejected` — `plausibleProfile(SENTINEL)` is `false`.
- `plausibleProfile: fewer than two samples is rejected`.
- `plausibleProfile: Richmond elevations pass` — `plausibleProfile(LIBBY)` is `true`.
- `classifyClimb: Libby Hill from Shockoe is hilly` — `classifyClimb(35, 1000)` → `"hilly"`.
- `classifyClimb: a long gentle walk is easy` — `classifyClimb(24, 5000)` → `"easy"` (4.8 m/km, under
  the 25 m absolute floor).
- `classifyClimb: a big total is hilly however far you walked` — `classifyClimb(40, 9000)` → `"hilly"`.
- `classifyClimb: a zero-length walk does not divide by zero` — `classifyClimb(0, 0)` → `"easy"`.
- `resample: a short profile is returned unchanged` — `resample(HILL, 96)` is deep-equal to `HILL`.
- `resample: a long profile is capped` — a 400-sample array resampled to 96 has length 96.
- `resample: the extremes survive decimation` — an array whose single 99 sits at index 137 of 400
  still contains 99 after `resample(_, 96)`.
- `profilePoints: a flat profile draws near the middle of the box` — every `y` from
  `profilePoints(FLAT, 300, 76, 20)` lies within 76×0.15 of 38, i.e. a flat walk does not read as
  terrain.
- `profilePoints: a 60 m profile fills the box` — for `[0, 60]` the y values are 0 and 76.
- `profilePoints: x spans the full width` — first x is 0, last x is 300.
- `profilePoints: a single sample does not produce NaN`.
- `areaPath: the path closes along the baseline` — `areaPath(points, 76)` ends with
  `L 300.00 76.00 L 0.00 76.00 Z`.
- `linePath: no closing skirt` — the string contains no `Z`.
- `mirrorProfile: the out-and-back profile returns to its start` — for `RAMP`, the mirrored samples
  are `2n - 1` long, start and end at 20, and `{ up, down }` are both 30.
- `mirrorProfile: mirroring twice is not the same as mirroring once` — guards against a caller
  mirroring an already-mirrored profile; `mirrorProfile(mirrorProfile(RAMP-profile)).samples.length`
  is `4n - 3`, so the component must mirror from the one-way profile, never from its own state.
- `elevationAt: clamps past both ends` — `elevationAt(p, -50)` is `samples[0]` and
  `elevationAt(p, 1e9)` is the last sample, neither `undefined` nor `NaN`.

Additions to the existing `src/lib/geometry.test.ts`:

- `cumulativeMeters: starts at zero and is monotone`.
- `cumulativeMeters: a known one-kilometre north leg measures 1000 m ± 1 m` — from
  `{ lat: 37.54, lng: -77.45 }` to `{ lat: 37.548993, lng: -77.45 }`.
- `pointAtMeters: zero returns the first vertex; the total returns the last`.
- `pointAtMeters: the midpoint of a two-vertex line interpolates`.
- `pointAtMeters: beyond the end clamps rather than returning null`.

`server/proxy.test.ts` additions. First, a correction to the last draft, which described a test
harness that does not exist: the cache-key test at proxy.test.ts:411-427 asserts only
`key?.startsWith("/api/isochrone/")` and never looks at a version segment, there is **no**
`routeCacheKey` test at all, and `server/worker.test.ts` contains no cache-key string assertions
whatsoever. So nothing here is "the existing assertion updated" — these are new tests. And the old
claim that one of them "fails loudly if someone bumps one and not the other" was impossible against a
single shared constant; it becomes possible only because this spec splits the constants.

- `route requests elevation` — POST `/api/route`, assert `calls[0].body.elevation_interval === 30`
  alongside the existing costing assertions.
- `the two endpoints version their caches independently` — new. Assert
  `routeCacheKey({ origin: MONROE, destination: … })?.startsWith("/api/route/v2-")` and
  `isochroneCacheKey({ location: MONROE, minutes: [25] })?.startsWith("/api/isochrone/v1-")`. This is
  the test that makes the split real: bumping `CACHE_VERSION` for a route change now fails here
  rather than silently evicting every ladder.
- Extend the existing key test at proxy.test.ts:411-427 with one line asserting the isochrone key's
  version segment, so the isochrone version is pinned by something.

`server/worker.test.ts`: unmodified. Its edge-cache tests exercise hit/miss behaviour through
`handleWorkerRequest` and never assert a key string, so a version change cannot break them and no
update is needed.

There is no test over `src/data/places.ts` today and this spec does not add one, but note that
deleting `terrain` from 62 entries is exactly the kind of edit a shape test would have guarded. If
`places-expansion` adds that test, it should assert the absence of a `terrain` key so the tag cannot
creep back.

## Acceptance criteria

1. `POST /api/route` sends `elevation_interval: 30` to the engine, asserted by a proxy test.
2. `CACHE_VERSION` is still `"v1"` and a new `ROUTE_CACHE_VERSION` is `"v2"`; the new proxy test
   asserts both key prefixes, so a shared bump cannot come back.
3. `valhalla/docker-compose.yml` sets `build_elevation=True`, and `build-graph.sh`'s smoke check
   fails when the built graph answers a route without a plausible `elevation` array. Verified by
   running the check against the pre-rebuild graph and watching it fail.
4. The contour-drift comparison has been run against the rebuilt graph and its percentage recorded in
   the PR; if over 1%, `SNAPSHOT_VERSION` is 3 with all 11 snapshots regenerated. `valhalla/README.md`
   records whether one build pass or two were needed, and the real SRTM download and disk figures.
5. `WalkingRoute.profile` is `ElevationProfile | null`, and a `-500` sentinel array yields `null`.
6. **Overturned — see decision 9.** The Climb stat, the figcaption totals, the `aria-label`'s
   distance and the scrubber's maximum all describe the same **outbound** leg, on a round trip as
   much as a one-way, and the figure carries the line that says which leg it is. Checkable by eye on
   one card: the `aria-label` distance is half the Distance stat, and the note explains why.
7. The filled area chart renders under the stats using only `--accent`, `--accent-wash`, `--line`,
   `--ink-2` and `--ink-3` — no new colour token, no charting dependency in `package.json`.
8. A walk with under 20 m of real relief renders as a near-flat trace; a walk with 60 m fills the box.
   Verifiable from `profilePoints` tests and by eye on Canal Walk versus Libby Hill.
9. The chart is scrubbable with the mouse, a finger and the keyboard, and `aria-valuetext` states
   distance and elevation at the cursor.
10. The SVG carries `role="img"` with a label stating ascent, descent, distance and the elevation
    range; `describeResult` includes the climb in the rail's single `role="status"` line; no new
    `aria-live` region exists anywhere on the card.
11. Scrubbing the chart moves a white dot with an amber ring along the drawn route; leaving or
    blurring the chart removes it.
12. Scrubbing plays one `playTap` at the start of a drag and nothing per sample.
13. `Terrain`, `Place.terrain`, `Session.terrain` and the `terrain` action no longer exist anywhere
    in `src/`.
14. The Climb filter's chips read Any / Easy / Hilly. With Easy or Hilly selected on a cold origin,
    Spin is disabled and reads `Measuring climb n/total` — and **stays** disabled past the 12-second
    grace, until `n` reaches `total`. Observable by throttling the network and watching the clock:
    the old behaviour re-enabled Spin at 12 s with the pool half measured.
15. While that gate is closed, `total` never decreases and the button label never restarts its count,
    because both are taken from the base pool. A place whose route has not settled stays in the
    candidate pool; a place that has settled with no measurable climb is out of it.
16. No spin is aborted mid-throw by a candidate's climb landing, because no throw can start before
    every base candidate has settled.
17. Against an engine with no elevation, the chips are disabled, each carries `aria-describedby`
    pointing at the explanatory notice, the card shows `Climb -` and `No elevation data from this
    engine.`, and no skeleton shimmers indefinitely — **including on a reload**, with every route
    served from `route-store` and no network request made. This is the case that catches the
    rehydration path being missed.
18. The scrubber shows a visible focus ring when reached by keyboard, and `aria-valuetext` at its
    maximum position reads a real elevation rather than `undefined ft`.
19. `route-store.ts` is at `SCHEMA_VERSION` 2 with `MAX_ENTRIES` 600, and a v1 store is dropped
    without error.
20. `npm run typecheck`, `npm run lint` (eslint + oxlint anti-slop + knip) and `npm test` are clean.
    `npm run build`'s gzipped app-JS figure is recorded before and after in the PR, the increase is
    under 2.5 kB, and `README.md:91` states the measured post-change number rather than 64 KB.

## Open questions

1. **The two climb thresholds are a judgement about Richmond, not a measurement.**
   `CLIMB_EASY_MAX_M_PER_KM = 12` and `CLIMB_HILLY_MIN_M = 25` were chosen to put Libby Hill,
   Church Hill and Hollywood Cemetery on the hilly side and the Canal Walk on the easy side. Someone
   who walks this city should check them against a dozen real routes before they ship, and decide
   whether a third band ("Steep") earns a fourth chip.
2. **Whether `use_hills` should stay at its 0.5 default.** Decision 8 leaves it unpinned, so a
   rebuilt graph changes what the engine considers a good walk and not merely what it reports. That
   is arguably an improvement — the app would stop routing walkers up Governor Street to save thirty
   seconds — but it is a change to the product that arrives as a side effect of a measurement
   feature, and it costs a snapshot regeneration. Someone should decide deliberately, in its own
   spec, whether this app wants hill-avoiding pedestrian routing.

   *(The old question 2 — ascent + descent versus ascent on a round trip — is closed by decision 9.
   It was the wrong question: both answers left the stat, the figcaption, the `aria-label` and the
   scrubber disagreeing on screen.)*

## Contracts with sibling specs

- **`places-expansion`** — `Place` loses `terrain`. Do not reintroduce a hand-tagged terrain or
  difficulty field; hilliness is measured per route from the origin the user actually chose. New
  places need `id`, `name`, `lat`, `lng`, `tags` only.
- **`pool-reasoning`** — this spec splits pool selection in two: `selectCandidates(reach, vibes,
  edgeOnly)` (synchronous, loses its terrain argument) and `applyClimb(places, climb, climbOf)` with
  `climbOf: (place) => ClimbBand | "unmeasurable" | undefined`. Read that same closure so you can
  tell "excluded: too much climb" from "not measured yet" from "cannot be measured"; do not write a
  private copy of the climb predicate. Note that the base pool, not the climb-filtered one, is what
  the warm-up and the Spin gate count.
- **`shareable-spins`** — the filter field on `Session` is `climb: ClimbBand | "any"`, not `terrain`.
  Serialise that. Do **not** serialise the profile: it is re-derived from the route, which the
  recipient will fetch anyway, and a shared 200-float array is bytes for nothing.
- **`daylight-budget` and `weather-filters`** — if either filters the candidate pool on a value that
  arrives asynchronously, adopt the three-part rule established in decision 4 rather than half of it:
  (a) unmeasured places pass provisionally but places that have *settled unmeasurable* are excluded;
  (b) the warm-up, the settlement count and the grace timer key on the pool **before** the async
  filter, so the denominator cannot count downward and the prefetch cannot re-wave; (c) the gate is
  `routesWarming` — the value the Spin button's `disabled` and `spin()` actually read — and not
  `reelIsShort`, which only renders a notice.
- **Any spec that bumps a cache version** — `CACHE_VERSION` now versions isochrones only.
  `ROUTE_CACHE_VERSION` versions routes. Bump the one whose response body you changed; a proxy test
  asserts both prefixes and will fail if they are conflated again.
- **`geolocate`** — no contract beyond the existing one; a geolocated origin is just another origin
  and its climbs are measured the same way.
