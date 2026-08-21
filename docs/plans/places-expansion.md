# Beyond downtown, and the second tier of places

**Status:** implemented in chunk 8. See *Corrections after implementation* at the end.
**Slug:** places-expansion

## Depends on

- **`pool-reasoning`** — `selectCandidates` is deleted. The tier filter is a `PoolRule` with
  `reason: "kind"`, not a fifth positional argument. The reason code is already in that spec's
  union, so the contract asked for below is met.
- **`elevation-profile`** — `Place.terrain` and the `Terrain` type are **deleted** before this
  spec runs, which removes the single most expensive rung in the proposer.
  `docs/plans/README.md` §2.4: `terrainFromRelief`, the nine `/locate` elevation probes per
  candidate, the 250 m relief ring, the `meanElevation` field on the `/api/locate` response, the
  null-abort, the elevation-tile prerequisite and the four-known-hilly-rows acceptance check all
  come out. `/api/locate` stays as the anchor snapper and is called **once** per candidate, not
  nine times. The `POST /api/height` contract asked of that sibling is void; it declined, and with
  terrain gone there is nothing left to ask for.

This is **chunk 8**. It **blocks `opening-hours`**, and that ordering is deliberate: run the
proposer first and every generated row arrives carrying `osm`, so only the 62 hand-curated rows
need that spec's manual identity backfill.

Amendments from `docs/plans/README.md`: the identity field is `osm` and this spec's declaration of
it wins over `opening-hours`' `osmId` (§2.6) — but the "presence of `osm` discriminates generated
rows" premise does not survive that backfill, so `apply-places.mjs` emits
`export const HAND_CURATED_COUNT` and `places.test.ts` asserts `NAME_MAX` over
`PLACES.slice(HAND_CURATED_COUNT)`. `scripts/harvest-osm.mjs` becomes the **only** Overpass caller
in the repo and gains one query family from `opening-hours` (§2.6). `Place` ends as
`LngLat & { id; name; tags: Vibe[]; detour?; osm? }`. The map layer order is fixed in §3, where
this spec's source split shares a stack with two others.

## What and why

Sixty-two places is a downtown list. Measured about the centroid of the preset origins the
quadrants run SE 29, NW 16, SW 9, NE 8; south of the James there are four places and no preset
origin at all, exactly one place lies west of -77.488, and everything north of 37.56 is five
dots on the Boulevard. The dial goes to a hundred minutes and the outer contours are empty at
the top of it, which is a strange thing for an app whose whole argument is "here is how far you
can really walk". "Far edge only" is the feature that suffers most: it deliberately throws away
everything but the outermost band, and on a thin list that band frequently holds nothing. This
work grows the list to cover Northside, Church Hill east, Southside past Forest Hill, Bryan
Park and the West End, and it does it from OpenStreetMap through a committed, reproducible
pipeline rather than by asking someone to type two hundred more rows.

The second half is a different kind of entry. Everything in `PLACES` today is somewhere to
arrive: a park, a museum, a market. Richmond is also full of things that are a reason to walk a
particular way rather than a place to spend an afternoon — the murals on the flood wall, the
public stairs off Libby Hill, an overlook, a Virginia roadside marker, a bridge. Those are the
best answer this app can give to "twenty minutes, surprise me", and they are precisely what the
outer contours are full of once you stop looking only for destinations. They get a second tier:
`detour`, a distinct class with its own mark on the map, its own word on the result card and
its own segment in the filters, mixed into the same pool by default because the surprise is the
product.

Honest about the limits. This does not add preset origins — a preset costs a 1.7 MB snapshot in
git and a full ladder rebuild, and Southside coverage here is places, not origins. It does not
add opening hours, descriptions, photographs or any per-place prose; the name is still the whole
offer and this spec defends that rule rather than quietly bending it. It does not harvest
commercial POIs: there are 1,223 food amenities inside the bounding box and the data layer's own
comment already records that an earlier pass shipped one closed and two moved storefronts.
Neighbourhoods and institutions outlive shops. And it does not make the harvest automatic — the
pipeline stops at a review page that a human clears by hand, because a script that can write
`src/data/places.ts` unattended is a script that can ship a marker standing in a highway median.

## The decision

**One dataset, three commands, two committed artefacts, one human gate.** `npm run
harvest:osm` hits Overpass about ten times and commits the raw responses to `data/osm/`.
`npm run propose:places` reads *only* those committed files, resolves each candidate to a point
a person can stand on, scores it, dedupes it against the existing 62 and emits
`data/proposals/places.json` plus a self-contained `data/proposals/review.html`. A human skims
that page and writes ids into `data/proposals/accepted.txt`. `npm run apply:places` turns those
ids into a formatted append to `src/data/places.ts`, which then goes through normal code review
as a diff. The build reads the repo, never the internet — the same argument that keeps
`scripts/build-reach.mjs` pointed at a committed snapshot rather than a live engine.

*Rejected:* running the harvest in CI. Overpass's own documentation forbids using a public
instance as an application backend, states a ceiling near 10,000 queries and 1 GB a day, and
returns 429 after a 15 second queue. During research this consistently produced both
`rate_limited` and `timeout` errors when queries were issued back to back. Harvesting on every
push would be exactly the abuse the docs name, would make the build non-reproducible, and would
let a mid-air OSM edit change the destination list without review.

**The second tier is `detour?: DetourKind` on `Place`, not a seventh `Vibe` and not a bare
`kind` string.** A seventh vibe would change the meaning of every existing filter combination
and conflate "what is this" with "what am I in the mood for" — a mural is a mural that happens
to be `scenic`. A bare `kind: "destination" | "detour"` is the right axis but throws away the
one word the result card needs. `detour?: DetourKind` carries both: its *absence* is the
destination tier, so all 62 existing rows are untouched and cost zero extra bytes, and its
*value* — `"mural" | "art" | "overlook" | "stairs" | "marker" | "bridge" | "street"` — is the
label word. Both facts are derivable from OSM tags with no human judgement per row.

**The result card keeps "the name is the whole offer", and the tier is carried by the eyebrow
label, not by a description.** Today the card's first line is a `.field-label` reading "Your
walk". For a detour it reads the tier word — MURAL, OVERLOOK, STAIRS, MARKER, BRIDGE, STREET.
That is one word in a slot that already exists, in the small-caps label style already used
everywhere, and it is a *category*, not a description of this particular thing. The defence:
"the name is the whole offer" works for a destination because the name names a known thing —
"Maymont" is a complete sentence in Richmond. It does not survive contact with "Untitled" or
with a plaque whose name is the first line of its inscription. Rather than answer that with a
description field, this spec answers it at the data layer: the proposer **drops** any candidate
whose name is not self-describing (unnamed, `/^untitled/i`, or shorter than four characters),
and the tier word supplies the category the name alone cannot. A `Place` still has no
`description` field and this spec does not add one. If a future feature genuinely needs prose,
that is a different argument to have on its own merits.

**Mixed pool by default, with a `kind` segment in Filters.** A three-way segmented control —
Any / Places / Detours — built from the existing `.chips` vocabulary exactly like Terrain, with
`playTap`. Default `"any"`. Making detours opt-in would hide the new half of the dataset behind
a control nobody presses; making them a separate mode would fork the spin. One pool, one spin,
a filter for the person who specifically wants one or the other.

**A new `/api/locate` endpoint carries the anchor rule.** The centroid problem is the whole
reason the existing 62 have hand-picked coordinates: `out center` on a park way returns the
bounding-box centre, which is a spot in the middle of a lawn or, for Hollywood Cemetery, a spot
with no path to it. The fix is an anchor ladder ending in Valhalla `/locate` snapping, and the
snap must go through the app's own proxy for the same reason `build-reach.mjs` does: an anchor
is the endpoint of a route this app will later draw, and a snap taken under different costing
can disagree with the route. `/api/locate` reuses `readLatLng`, the `BOUNDS` check and pinned
pedestrian costing; it is strictly cheaper upstream than the `/api/route` already public.

*Rejected:* letting the proposer POST straight at `VALHALLA_URL`, and making the endpoint
dev-only next to `/api/dev/bake-tuning`. The first reintroduces exactly the drift
`build-reach.mjs` was written to prevent. The second would be untestable through the shared
proxy tests and would not exist in the Worker mount, so the pipeline could not be run against a
deployed engine.

**VERIFIED, and it changes the design:** `entrance=*` does *not* solve the centroid problem in
Richmond. `way[leisure=park][name](37.50,-77.55,37.60,-77.38)->.p; node(w.p)[entrance]; out count;`
returns **total 0**. There are 852 entrance nodes in the wider bbox but they sit on building
outlines. The entrance rung stays in the ladder because it is free when it hits, but rungs 2
(shared gate node) and 3 (`/locate` snap) do all the real work.

**VERIFIED, and it is a trap:** Valhalla `/locate`'s `radius` does not bound the answer. A
locate at 37.5200,-77.5400 with `radius: 10` returned an edge whose correlated point is ~30 m
away, on the far side of the James. The proposer must read the verbose `distance` field itself
and reject over threshold. Trusting `radius` silently ships anchors across a river.

**VERIFIED:** `historic=*` is 956 elements in the bbox and 735 of them are building-ish, so
filter `historic` by an explicit value allowlist, never by the bare key. The usable second-tier
source is `historic=memorial` — **200, re-measured independently** — of which ~165 carry
`memorial=plaque` (that split measured once). This is the Virginia roadside-marker tier the
brief asks for, and the single largest detour source in the city.

**VERIFIED:** `wikidata` is useless as a gate — 6 of 200 memorials and 39 of 125 named parks
carry it. It is an additive score bonus, never a predicate, or the marker and mural tiers vanish.

**NOT VERIFIED — check first.** Everything this spec asserts on reasoning rather than
measurement, so nobody inherits a number as if it were a fact:

1. **The category counts, except two.** `historic=memorial` returns exactly 200 in the harvest
   bbox and the entrance query returns 0 — both re-measured independently. The rest — artwork
   185 / mural 108 / named 81, viewpoint 34, named steps 16, bridges 18, named gardens 63, named
   cemeteries 28, parks 125, and the 165-of-200 `memorial=plaque` split — were measured once and
   have not been reproduced. The two that were reproduced raise confidence in the rest, but the
   harvest itself prints real counts, so treat these as a sanity range and not a contract.
2. **The accepted yield.** How many candidates survive the anchor ladder, the distance gate, the
   self-describing-name rule and dedup is not measured at all. The cap is 250; the yield could be
   140. Run the proposer and read the counts before assuming the outer contours are full.
3. **Whether the gate rung yields anything.** Rung 2 is asserted to be the one that "actually
   works", and nobody has counted shared outline/pedestrian-way nodes — an attempt during review
   got a 429 from Overpass. If gates are as sparse as entrances (which *were* measured at zero),
   every row falls to `snap` and the review page's flag on snapped rows flags everything. One
   gate query answers this in a minute; run it before building the review page.
4. **Whether snapped anchors are actually reachable from the presets.** The gate uses
   `outbound_reach`, which is a graph property, not a walk. Spot-check twenty accepted anchors
   with a real `/api/route` from Home before merging.
5. **Map frame cost at ~250 dots during a spin.** The re-upload fix below is specified from
   first principles; profile a spin at the final count in a throttled profile and confirm the
   reel holds its frame budget.
6. **Every bundle number in Cost.** The `places.ts` raw size and its standalone gzip are
   measured; the per-field extrapolations for `detour` and `osm` are not, and open question 1
   turns on one of them. Build twice and diff before quoting anything in `LAUNCH.md`.

## Data and types

### `src/data/places.ts`

```ts
/**
 * A second tier of place: not somewhere to arrive, but a reason to walk a
 * particular way. Absence of this field IS the destination tier, which is why
 * none of the original sixty-two rows carry it.
 *
 * The value is also the word the result card prints where a destination
 * prints "Your walk". It is a category, not a description - the name is still
 * the whole offer.
 */
export type DetourKind = "mural" | "art" | "overlook" | "stairs" | "marker" | "bridge" | "street";

export type Place = LngLat & {
  id: string;
  name: string;
  terrain: Terrain;
  tags: Vibe[];
  /** Second tier. Absent means a destination. */
  detour?: DetourKind;
  /**
   * The OpenStreetMap element this row came from, as `type/id`, e.g.
   * `way/23456789`. Generated rows ALWAYS carry it and the hand-curated
   * sixty-two NEVER do - not because their OSM ids are unknowable, but
   * because presence of this field is then a clean, testable discriminator
   * for "this row came out of the proposer", which places.test.ts relies on.
   * Backfilling it onto a hand row breaks that and needs a different
   * discriminator first. It is an identity mapping,
   * not data - it exists so a later pass can re-read tags for the same
   * feature without re-matching by name. See the `opening-hours` spec, which
   * consumes exactly this field.
   */
  osm?: string;
};

/** Which tier the spin is drawing from. */
export type PlaceKind = "any" | "destination" | "detour";

/** Segments for the Kind control, in render order. */
export const PLACE_KINDS: { id: PlaceKind; label: string }[];
// { any: "Any" }, { destination: "Places" }, { detour: "Detours" }

/**
 * The tier predicate. It lives HERE, not in osm-rules.ts, and that placement
 * is load-bearing: App.tsx calls it inside selectCandidates, so whichever
 * module holds it is in the app's import graph. Keeping it beside the data it
 * questions is what lets osm-rules.ts stay proposer-and-test-only and ship
 * nothing. See Cost.
 */
export function matchesKind(place: Place, kind: PlaceKind): boolean;

/**
 * The card's eyebrow word per tier. A destination has no entry and prints
 * "Your walk".
 */
export const DETOUR_LABELS: Record<DetourKind, string>;
// mural: "Mural", art: "Public art", overlook: "Overlook", stairs: "Stairs",
// marker: "Marker", bridge: "Bridge", street: "Street"

/** Hard ceiling on the dataset, asserted by places.test.ts. See Cost. */
export const MAX_PLACES = 250;

/**
 * Longest name a GENERATED row may carry. The .result-name is 25px in a
 * fixed-width rail. Thirty-two, because the longest hand-curated name is
 * "White House of the Confederacy" at thirty and this is the ceiling that
 * name already proves the rail can hold. The hand-curated rows are exempt
 * from the assertion: a person naming a real Richmond institution has
 * standing the proposer does not.
 */
export const NAME_MAX = 32;
```

### `src/data/osm-rules.ts` — new, pure, shared by the proposer and the tests

**Every export takes a `@public` JSDoc tag, and that tag is the only thing
keeping knip quiet.** `knip.json` lists `scripts/*.mjs` as an entry point, but
`propose-places.mjs` reaches this module the way `build-reach.mjs` reaches
`places.ts`: `vite.ssrLoadModule("/src/data/osm-rules.ts")`, a bare string
literal knip cannot trace. That is exactly why `LADDER` and `snapshotName` in
`src/lib/isochrone.ts` already carry `@public`, and `knip.json` sets
`"tags": ["-@public"]`. Do not delete these tags on the theory that the script
entry point covers them; it does not.

No export from this file may be imported by an app module. That is what keeps
it out of the bundle — see Cost, and see `matchesKind`, which lives in
`places.ts` for precisely this reason.

```ts
/** One Overpass element, already narrowed at the boundary. */
export type OsmCandidate = {
  /** `node/123`, `way/456`, `relation/789`. */
  osm: string;
  /** Element's own coordinate, or the `out center` centre for a way/relation. */
  seed: LngLat;
  /** Tag key -> value, exactly as Overpass returned it. */
  tags: ReadonlyMap<string, string>;
};

export type Classification = {
  detour: DetourKind | null;
  tags: Vibe[];
  /** Additive notability, 0..100. Not a gate; used only to rank the review page. */
  score: number;
};

/** Why a candidate was thrown away. Rendered verbatim on the review page. */
export type Rejection =
  | "lifecycle"       // disused:/was:/abandoned:/demolished:/removed:/proposed:/construction:
  | "access"          // access=private|no, entrance=no
  | "commercial"      // shop=*, amenity in the food set, marketplace excepted
  | "unnamed"         // no name, /^untitled/i, or under four characters
  | "no-vibe"         // collected zero Vibes, so no chip could ever reach it
  | "out-of-bounds"   // outside PLACE_BOUNDS
  | "duplicate"       // within DEDUP_METERS of an existing or better candidate
  | "not-a-place";    // matched no rule in the classification table

/**
 * The result is a TAGGED union, not `Classification | Rejection`. A bare union
 * of an object with a string literal can only be discriminated by
 * `typeof result === "string"`, and `anti-slop/no-runtime-typeof` is "error"
 * in `.oxlintrc.json` with `allowInTypeGuards` defaulting to false, which bans
 * every `typeof` outside an opted-in type predicate. `scripts/` is not in
 * `ignorePatterns`, so `propose-places.mjs` is linted under the same rule.
 * The `ok` discriminant is how both sides read the result without one.
 */
export type ClassifyResult =
  | { ok: true; classification: Classification }
  | { ok: false; reason: Rejection };

export function classify(candidate: OsmCandidate): ClassifyResult;
export function placeName(candidate: OsmCandidate): string | null;
export function placeId(candidate: OsmCandidate, name: string, taken: ReadonlySet<string>): string;
export function terrainFromRelief(reliefMeters: number): Terrain; // >= 15 -> "hilly"

export const DEDUP_METERS = 90;
export const PLACE_BOUNDS: { south: number; west: number; north: number; east: number };
// { south: 37.44, west: -77.60, north: 37.64, east: -77.34 } - the harvest bbox,
// which sits inside the proxy's BOUNDS (37.3 / -77.9 / 37.8 / -77.1).
```

### `src/lib/geometry.ts` — one addition

```ts
/**
 * Metres between two points, equirectangular. Wrong by well under a percent
 * over a few kilometres at this latitude, which is all any caller here needs:
 * dedup thresholds and "nearest N for prefetch". Deliberately not haversine
 * and deliberately not a geo library - the budget refuses one.
 */
export function metersBetween(a: LngLat, b: LngLat): number;
```

### `POST /api/locate`

Request:

```json
{ "point": { "latitude": 37.5464, "longitude": -77.4517 } }
```

The `{ latitude, longitude }` spelling matches `readLatLng`, which every other
proxy endpoint already uses; the client-side `LngLat` spelling stops at the
network boundary as it does for `/api/route`.

Success `200`:

```json
{
  "point": { "latitude": 37.54651, "longitude": -77.45162 },
  "distanceMeters": 12.4,
  "use": "sidewalk",
  "wayId": 23456789,
  "outboundReach": 812,
  "meanElevation": 43,
  "names": ["West Main Street"]
}
```

`names` may be `[]`. `wayId` may be `null` when upstream omits it.
`meanElevation` is metres and may be `null` — Valhalla writes JSON null for an
invalid value, and the proposer treats null as an abort, not a zero (see
*relief*). Without this field the terrain step has nothing to read, because
the proposer is forbidden from talking to anything but this endpoint.

**Where these live in Valhalla's verbose `/locate` response**, because the
nesting is not uniform and guessing it costs an afternoon
(`src/tyr/locate_serializer.cc`,
`https://github.com/valhalla/valhalla/blob/master/src/tyr/locate_serializer.cc`):

| Response field | Upstream path |
| --- | --- |
| `distanceMeters` | `edges[i].distance` |
| `outboundReach` | `edges[i].outbound_reach` (`inbound_reach` is its sibling) |
| `use` | `edges[i].edge.classification.use` — `DirectedEdge::json` |
| access gate | `edges[i].edge.access.pedestrian` — same object |
| `wayId` | `edges[i].edge_info.way_id` — `EdgeInfo::json` |
| `names` | `edges[i].edge_info.names` |
| `meanElevation` | `edges[i].edge_info.mean_elevation` |

`distance` and the two reach counts are written directly on the edge entry;
everything else is one level down, in either `edge` or `edge_info`. `way_id`
is a top-level edge field **only** in the non-verbose branch, which this
endpoint never uses.

Failures use the existing vocabulary verbatim: `503 {error:"not-configured"}`,
`502 upstream-unreachable`, `504 upstream-timeout`, `400` for a bad body or an
out-of-bounds point, `405` for a non-POST. One new member: `404
{error:"no-pedestrian-edge", detail}` when Valhalla answers but no returned
edge passes the pedestrian gate. 404 is chosen because it is final, is not in
`http.ts`'s retry set, and reads correctly — there is no answer here, and
asking again will not produce one.

### `data/osm/manifest.json`

```json
{
  "version": 1,
  "harvestedAt": "2026-08-21T07:22:11.000Z",
  "endpoint": "https://overpass-api.de/api/interpreter",
  "bbox": { "south": 37.44, "west": -77.60, "north": 37.64, "east": -77.34 },
  "copyright": "The data included in this document is from www.openstreetmap.org. The data is made available under ODbL.",
  "queries": [
    {
      "file": "destinations.json",
      "osmBase": "2026-08-21T07:22:00Z",
      "elements": 249,
      "ql": "[out:json][timeout:180];(...);out center tags;"
    }
  ]
}
```

The full query text is stored in the manifest on purpose: it is the only thing
that makes a later switch from `out center tags;` to `out geom;` — which would
balloon the committed payload — visible in a diff.

### `data/proposals/places.json`

```json
{
  "version": 1,
  "generatedAt": "2026-08-21T09:00:00.000Z",
  "harvestedAt": "2026-08-21T07:22:11.000Z",
  "accepted": [
    {
      "id": "bryan-park",
      "name": "Bryan Park",
      "lat": 37.60122,
      "lng": -77.47003,
      "terrain": "flat",
      "tags": ["park", "scenic"],
      "detour": null,
      "osm": "way/23456789",
      "anchorSource": "gate",
      "anchorDistanceMeters": 8.2,
      "edgeUse": "footway",
      "outboundReach": 1204,
      "reliefMeters": 6,
      "score": 61,
      "seed": { "lat": 37.6031, "lng": -77.47188 }
    }
  ],
  "rejected": [{ "osm": "node/1234", "name": "Untitled", "reason": "unnamed" }]
}
```

`anchorSource` is `"entrance" | "gate" | "snap"`.

### `data/proposals/accepted.txt`

One place id per line. `#` starts a comment. Blank lines ignored. Written by a
human; read by `apply-places.mjs`.

## Changes, file by file

**`src/data/places.ts`** — modified. Add `DetourKind`, `PlaceKind`,
`PLACE_KINDS`, `DETOUR_LABELS`, `MAX_PLACES`; add optional `detour` and `osm`
to `Place`. Append the generated rows below a clearly commented boundary:

```ts
// ---------------------------------------------------------------------------
// Generated by scripts/apply-places.mjs from data/proposals/accepted.txt.
// Everything ABOVE this line is hand-curated and wins every conflict: the
// hand-picked coordinates were chosen by someone who has stood there, and the
// proposer refuses to emit a row within DEDUP_METERS of one. Edit generated
// rows freely - re-running apply never rewrites a row that already exists by
// id, it only appends.
// Map data (c) OpenStreetMap contributors, ODbL.
// ---------------------------------------------------------------------------
```

**`src/data/osm-rules.ts`** — new. The pure classification table and helpers
above. No runtime imports beyond the `LngLat`/`Terrain`/`Vibe`/`DetourKind`
types, so `node --test` runs it by type-stripping alone.

**`src/data/places.test.ts`** — new. See Tests. There is no test over the
dataset today; a generated append is exactly the thing that needs one.

**`src/data/osm-rules.test.ts`** — new.

**`src/lib/geometry.ts`** — modified. Add `metersBetween`. It gets its own
`111_320` metres-per-degree constant with a `cos(lat)` longitude correction and
a comment saying why an approximation is right here. (MapCanvas already carries
its own copy for keyboard nudging; that one stays where it is — it is about
pixels of intent, not about distance between places.)

**`src/lib/geometry.test.ts`** — modified, or new if absent. Cases for
`metersBetween`.

**`src/app/session.ts`** — modified.

- `Session` gains `kind: PlaceKind`, initial `"any"`, documented as the tier
  filter next to `terrain` and `vibes`.
- `Action` gains `| { type: "kind"; kind: PlaceKind }`. The reducer's switch is
  exhaustive with no default, so this is a type error until handled.
- `case "kind": return { ...state, kind: action.kind };`
- `case "clearFilters"` becomes
  `{ ...state, terrain: "any", vibes: [], edgeOnly: false, kind: "any" }`.

**`src/ui/Filters.tsx`** — modified. New props `kind: PlaceKind` and
`onKind: (kind: PlaceKind) => void`. A third `<fieldset className="chips">`
with `<legend className="field-label">Kind</legend>`, rendered **between** the
switch row and Terrain (tier is a coarser question than terrain). Buttons use
`aria-pressed={props.kind === option.id}` and call
`playTap(props.kind !== option.id)` immediately before `props.onKind(option.id)`,
matching the Terrain block exactly. No new CSS: `.chips` and `.chip` already
carry it, and the mobile `.chips` gap already handles a third row.

**`src/app/App.tsx`** — modified.

- Pass `kind={state.kind}` and `onKind={(kind) => dispatch({ type: "kind", kind })}`
  into `<Filters>` (~line 710).
- `selectCandidates(reach, terrain, vibes, edgeOnly, kind)` — a fifth
  positional parameter (the anti-slop `no-object-parameters` rule forbids
  collapsing these into an options object). New clause, placed first because it
  is the cheapest rejection: `if (!matchesKind(place, kind)) return false;`
  `matchesKind` is imported from `src/data/places.ts`, alongside `PLACES`.
- **`activeFilters` must count `kind`.** Today (~line 485) it reads
  `(state.terrain === "any" ? 0 : 1) + state.vibes.length + (state.edgeOnly ? 1 : 0)`
  and it carries a comment saying why: "A phone starts with the drawer shut,
  and a bare 'Filters' over a shrunken count is a cause the reader cannot see."
  A Kind filter that narrows the pool while the summary still reads "Filters"
  is precisely the failure that comment was written to prevent. It becomes
  `+ (state.kind === "any" ? 0 : 1)`, in the same shape as `terrain`.
- The near-route prefetch effect's
  `PLACES.filter((place) => candidateKey.split(",").includes(place.id))`
  becomes a `Set` built once from `candidateKey.split(",")` — the current form
  is O(n²) and at 250 places is ~62,500 string comparisons per effect run.
- The **wide** prefetch wave is capped. Today it routes to every place inside
  the 100-minute contour; at 250 that is up to 250 `/route` calls per origin
  change, each a rate-limit unit, against a route LRU that holds 200. It
  becomes: everything inside the contour, sorted by
  `metersBetween(origin, place)` ascending, sliced to `WIDE_PREFETCH_LIMIT = 90`.
  90 sits under the LRU's 200 with room for the near wave and a spin's worth of
  misses. A comment must say that the cap is about the cache and the limiter,
  not about correctness — a place past the cap simply loads its route when it
  is picked.
- `describeResult` gains the tier: for a detour the sentence opens
  `` `${DETOUR_LABELS[place.detour]}: ${place.name}` ``. The one
  `sr-only role="status"` line is the only screen-reader surface, so a tier
  that is invisible there is invisible.

**`src/ui/ResultCard.tsx`** — modified. The `.result-head`
`<p className="field-label">` renders
`place.detour ? DETOUR_LABELS[place.detour] : "Your walk"`. Nothing else in the
card changes: `.result-stats` stays a hard `repeat(3, 1fr)` grid of
Out-and-back / Distance / Terrain, no description is added, and it remains not
a live region.

**`src/map/MapCanvas.tsx`** — modified, in two independent ways.

1. *Detour mark.* `syncPlaces` writes a fourth property
   `detour: place.detour ?? ""`. The existing `places` layer's paint becomes
   `case` expressions rather than a new layer:
   - `circle-radius`: `weighted(["case", ["!=", ["get","detour"], ""], 3.5, 4.5])`
   - `circle-color`: `["case", ["!=", ["get","detour"], ""], "#0b1014", ACCENT]`
   - `circle-stroke-width`: `["case", ["!=", ["get","detour"], ""], 1.6, 0]`
   - `circle-stroke-color`: `ACCENT_SOFT`

   A destination reads as a filled amber dot; a detour reads as a smaller
   hollow ring in `--accent-soft`. Same layer, same source, one legend-free
   distinction that survives at city zoom. `places-out` is unchanged — a place
   out of reach is a grey dot whatever tier it is. **Every** zoom-scaled value
   still goes through `weighted()`; a bare `["zoom"]` inside arithmetic makes
   MapLibre skip the layer with no throw and no log.
2. *Picked-state re-upload.* `syncPlaces` currently rebuilds and re-uploads the
   entire FeatureCollection on any change of `places`/`inReachIds`/`pickedId`,
   and `pickedId` changes on **every reel tick**. At 250 features that is a
   full re-serialise and re-tile dozens of times a second in exactly the moment
   this app spends its budget on feel. Split it: the `places` source loses the
   `"picked"` state entirely (its `state` becomes `"in" | "out"`) and its
   effect drops `pickedId` from its dependency array; a new source
   `place-picked` holds zero or one feature, fed by a new
   `syncPicked(map, place)` on a `[pickedId]` effect. Two layers over it —
   a new `picked-place-dot` (circle, `weighted(8)`, `#ffffff`, stroke
   `weighted(3)` in ACCENT) and the existing `picked-place-label` symbol layer
   re-pointed at the new source, keeping its imperative `setPaintProperty`
   opacity handling for spins because MapLibre places symbols asynchronously.
   Both are added with no `beforeId`, above basemap labels, after `places`.

   **`syncAll` must call `syncPicked` too.** There are two paths into place
   rendering, not one: the `[places, inReachIds, pickedId]` effect (~line 384)
   *and* `syncAll` (~line 586), which runs once the style is ready and again on
   a style reload. Dropping `pickedId` from the effect while adding a separate
   `[pickedId]` effect leaves `syncAll` calling only `syncPlaces`, so on the
   initial sync — or a style reload with a pick already in state — the picked
   dot and its label are simply absent until something happens to change
   `pickedId`. `syncAll` gains
   `syncPicked(map, props.places.find((p) => p.id === props.pickedId) ?? null)`
   immediately after its `syncPlaces` call, and `syncPlaces` there loses its
   `pickedId` argument like everywhere else.

   **The winner is drawn twice, and that is accepted.** The `places` layer's
   filter is `["!=", ["get","state"], "out"]`, so once `"picked"` is no longer
   a `state` value the winner still renders from `places` as an ordinary 4.5 px
   amber dot underneath the new 8 px opaque white `picked-place-dot`. It costs
   one circle and is invisible. The behaviour change worth naming is the
   out-of-reach pick: today `"picked"` overrode `"out"` and the grey dot
   vanished; after the split the grey `places-out` dot stays and the white
   picked dot draws over it. That is the better reading — a pick outside the
   contour should still look outside the contour underneath its marker — but it
   is a change, not an accident.

   *Rejected:* `promoteId` + `setFeatureState`. It is the more general answer,
   but nothing in the app sets `promoteId` today, feature-state expressions
   would have to replace every paint `case`, and the volatile thing here is
   genuinely one feature. A one-feature source is smaller and its failure mode
   is obvious.

   `PLACE_LAYERS` becomes `["places", "places-out", "picked-place-dot"]` so a
   picked dot stays clickable, and the picked feature keeps its `id` property
   for that handler.

**`server/proxy.ts`** — modified.

- Guard: `const isLocate = pathname === "/api/locate";` added to the early
  return, method-gated POST alongside the others; dispatch becomes a three-way.
- `export function locateCacheKey(payload: Json): string | null` returning
  `` `/api/locate/${CACHE_VERSION}-${WALKING_SPEED_KMH}/${lat.toFixed(4)},${lng.toFixed(4)}` ``,
  null on an unreadable or out-of-bounds payload. Four decimals, not five: see
  *"`/api/locate` is scraped"* under Failure — the coarser key is what turns
  "the worst case is a warm edge cache" into a bounded ~5 million keys for the
  whole Richmond box, and an anchor is a graph property that does not vary over
  11 metres.
- Module-local `async function locate(base: string, payload: JsonObject): Promise<Response>`
  calling `callValhalla(base, "/locate", { locations: [{ lat, lon, radius: LOCATE_RADIUS_M }], costing: "pedestrian", costing_options: { pedestrian: { walking_speed: WALKING_SPEED_KMH } }, verbose: true }, UPSTREAM_TIMEOUT_MS)`.
- New module constants: `LOCATE_RADIUS_M = 60`, `LOCATE_MAX_DISTANCE_M = 150`
  (a server-side ceiling; the proposer applies its own tighter, feature-shaped
  gate), and `LOCATE_USES = new Set(["sidewalk","footway","path","steps","pedestrian","living_street","road"])`.

  Every name in that set is a literal Valhalla `Use` string from
  `valhalla/baldr/graphconstants.h` (`UseStrings`), not an OSM `highway` value,
  and the two vocabularies differ where it matters: Valhalla spells the service
  road `"service_road"`, never `"service"`; `"steps"` and `"pedestrian"` are
  distinct `Use` values from `"footway"` and `"path"` and all four must be
  listed separately. Note also that `"road"` admits any ordinary street, which
  is most of what a bad snap lands on — the allowlist is therefore a weak gate
  on its own, and the real protection is the distance ceiling plus the
  review page's flag on `snap`-anchored rows. `driveway`, `parking_aisle` and
  `alley` are refused by omission and asserted by a test.
- The upstream body is narrowed through `isJsonObject` / `isJsonArray` /
  `isFiniteNumber` / `isString` in the house style of `requestRoute` — no
  `typeof`, no unparsed `unknown`, a `// SAFETY:` comment on any assertion.
- The engine base URL must never reach the response body; the existing
  `proxy.test.ts` secrecy assertion is extended to cover `/api/locate`.

**`worker/index.ts`** — modified. Import `locateCacheKey`. Add
`const isLocate = url.pathname === "/api/locate";`, extend the body pre-read
condition to `(isIsochrone || isRoute || isLocate) && request.method === "POST"`
keeping the `request.clone()` discipline, and add
`else if (isLocate) cache = await edgeEntry(request, payload, locateCacheKey, LOCATE_CACHE_SECONDS);`
with `const LOCATE_CACHE_SECONDS = 30 * 86_400` — an anchor is a property of
the graph, not of a moment, and it changes only when tiles are rebuilt, which
`CACHE_VERSION` covers. Cost stays 1: `/locate` is a single correlation, not a
graph expansion, so `isochroneQueryCost` is not involved.

**`server/vite-plugin.ts`** — unchanged. The dev middleware forwards every
`/api/*` URL already.

**`wrangler.toml`, `.env.example`, `vite.config.ts`** — unchanged. No new env
var: the Overpass endpoint is a constant in the harvest script (it is never
called at request time) and `/api/locate` reuses `VALHALLA_URL`.

**`scripts/harvest-osm.mjs`** — new. See Algorithm.

**`scripts/propose-places.mjs`** — new. Boots a throwaway Vite SSR server with
its own `cacheDir` (`node_modules/.vite-propose-places`) to import
`src/data/osm-rules.ts`, `src/data/places.ts` and `src/lib/geometry.ts`,
exactly as `build-reach.mjs` does, so classification cannot drift from what the
tests assert. Talks to the running dev server's `/api/locate`.

**`scripts/apply-places.mjs`** — new.

**`package.json`** — modified. Scripts `harvest:osm`, `propose:places`,
`apply:places`. No new runtime dependency and no new devDependency: Overpass is
`fetch`, and the review page is a string template.

**`data/osm/README.md`** — new. Carries the ODbL notice where a database user
would naturally look, per the OSMF attribution guidelines: "Map data ©
OpenStreetMap contributors, made available under the Open Database License
(ODbL)" linking `https://www.openstreetmap.org/copyright`, plus the harvest
date, the endpoint, and an explicit instruction not to wire the harvest into
CI.

**`README.md`** — modified. A "Where the places come from" section: the three
commands, the human gate, the ODbL notice, and the sentence that the
hand-curated rows win every conflict.

**`LAUNCH.md`** — modified. One line noting the dataset size and the
`MAX_PLACES` ceiling with its bundle arithmetic, next to the existing budget
numbers.

**`knip.json`** — unchanged, but only because every `osm-rules.ts` export
carries `@public`. `scripts/*.mjs` being an entry point does **not** cover
them: the proposer reaches the module through
`vite.ssrLoadModule("/src/data/osm-rules.ts")`, a string literal knip cannot
follow, exactly as `build-reach.mjs` does today — which is why `LADDER` and
`snapshotName` in `src/lib/isochrone.ts` carry the tag and why `knip.json` sets
`"tags": ["-@public"]`. The tags are the mechanism, not decoration.

**`public/reach/*.json`** — **unchanged, and this is worth stating plainly
because the brief asks.** Snapshots contain contours only. Adding, moving or
removing a `Place` does not invalidate any snapshot, does not require a
regeneration and does not need a `SNAPSHOT_VERSION` bump. The cost of
regenerating the 11 presets for this feature is **zero**. What *would* cost a
rebuild is a new `PRESET_ORIGIN`, and this spec deliberately adds none: each
one is a 1.4–2.0 MB file in git, ~24 upstream graph expansions against a stock
`max_contours` of 4, and a `SNAPSHOT_VERSION` bump (the `/reach/*` immutable
one-year cache header means a regeneration without one reaches nobody). A
Southside or Northside preset is a separate, arguable change.

## Algorithm

### 1. Harvest — `scripts/harvest-osm.mjs`

Sequential, one request per category, `out center tags;` so no geometry comes
back and the committed payload stays small.

```
for each category in CATEGORIES:
  body = "data=" + encodeURIComponent(category.ql)
  POST https://overpass-api.de/api/interpreter
    headers: user-agent "walk-roulette/0.4 (+<repo url>; <contact>)"
  on 429, or an `osm3s` body mentioning rate_limited:
    sleep 30s, retry, at most 3 times, then abort the whole run non-zero
  write data/osm/<category.file>.json (formatted, elements sorted by id)
  record { file, osmBase: osm3s.timestamp_osm_base, elements, ql } in the manifest
  sleep OVERPASS_PAUSE_MS = 5000 before the next category
write data/osm/manifest.json, including osm3s.copyright verbatim
```

Two harvest families. Destinations:

```
[out:json][timeout:180];
(
  nwr[leisure=park][name](BBOX);
  nwr[leisure=garden][name](BBOX);
  nwr[leisure=nature_reserve][name](BBOX);
  nwr[landuse=cemetery][name](BBOX);
  nwr[tourism~"^(museum|gallery|zoo|aquarium|theme_park)$"][name](BBOX);
  nwr[amenity=marketplace][name](BBOX);
  nwr[historic~"^(monument|fort|archaeological_site|city_gate|aqueduct)$"][name](BBOX);
);
out center tags;
```

Detours:

```
[out:json][timeout:180];
(
  nwr[tourism=artwork][name](BBOX);
  nwr[tourism=viewpoint](BBOX);
  nwr[man_made~"^(bridge|pier|water_tower|lighthouse|obelisk)$"][name](BBOX);
  way[highway=steps][name](BBOX);
  nwr[natural~"^(peak|cliff|spring|waterfall)$"][name](BBOX);
  nwr[historic=memorial][memorial](BBOX);
);
out center tags;
```

A third family harvests **gate nodes** for the anchor ladder — nodes shared
between a candidate outline and a pedestrian way. It runs **once per outline
family**, not once for everything, because a node-set recursion over the whole
bbox at once is what produced a `timeout` error during research. The outline
families are the four that have area geometry and therefore a centroid problem:
`leisure=park`, `leisure=garden`, `leisure=nature_reserve` and
`landuse=cemetery`. The earlier draft of this spec queried only parks while
claiming rung 2 "actually works for parks and cemeteries"; cemeteries, gardens
and reserves got no gate query at all, and Hollywood Cemetery is the single
worst centroid in the dataset.

Per family, with `KEY=VALUE` substituted:

```
[out:json][timeout:180];
way[KEY=VALUE][name](BBOX)->.p;
way[highway~"^(footway|path|steps|pedestrian|cycleway|residential|service)$"](BBOX)->.f;
node(w.p)->.pn;
node(w.f)->.fn;
node.pn.fn;
out;
```

`BBOX` is `37.44,-77.60,37.64,-77.34` everywhere. `out;` (body verbosity) is
required rather than `out ids;` — the gate node's own coordinate is the whole
point, and `ids` prints nothing else.

**Gate nodes are matched to a candidate by proximity, not by parentage.** The
nearest gate node within **250 m** of the seed wins. The earlier draft made
id-matching against the parent way's node list the primary rule and proximity
the fallback; that is backwards on two counts. First, it does not work as
written: `out ids;` on a way suppresses its member node list entirely, and only
`out skel;` or `out body;` include it
(`https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL`, output
verbosity), so the id-matching step had nothing to match against. Second,
proximity is the answer we actually want — a gate on a *neighbouring* park's
outline 40 m away is a fine place to stand, and parentage would reject it.
The id path is dropped; proximity is the rule.

### 2. Propose — `scripts/propose-places.mjs`

Reads `data/osm/*.json` only. Per element:

```
1. tags = Map(element.tags); seed = element.center ?? { lat: element.lat, lng: element.lon }
2. name = placeName(candidate)             -> Rejection "unnamed" on null
3. c = classify(candidate)                 -> a Rejection short-circuits here
4. anchor = await resolveAnchor(candidate) -> null drops the row
5. relief = await relief(anchor)           -> terrainFromRelief
6. dedup against PLACES and against already-accepted proposals
7. emit
```

`classify` is a pure table, in this order (first match wins for `detour`;
vibes accumulate across all matching rules):

*Rejections, checked first.* Any tag key beginning `disused:`, `was:`,
`abandoned:`, `demolished:`, `removed:`, `proposed:` or `construction:`, or a
lifecycle *value* of `construction` / `proposed` / `razed` → `"lifecycle"`.
`access=private|no` or `entrance=no` → `"access"`. `shop=*`, or `amenity` in
`{cafe, restaurant, bar, pub, fast_food, ice_cream}` → `"commercial"`
(`amenity=marketplace` is the sole commercial category kept — a market outlives
its vendors). Seed outside `PLACE_BOUNDS` → `"out-of-bounds"`.

*Detour assignment.* `tourism=artwork` with `artwork_type=mural|graffiti` →
`"mural"`; other `tourism=artwork` → `"art"`; `tourism=viewpoint` or
`natural=peak|cliff` → `"overlook"`; `highway=steps` → `"stairs"`;
`historic=memorial` with any `memorial=*` subtype → `"marker"`;
`man_made=bridge|pier` → `"bridge"`; `man_made=water_tower|lighthouse|obelisk`
→ `"art"`. Everything else → `null`, i.e. a destination. (`"street"` has no
automatic rule: it exists for the handful of notable streets — Monument Avenue
is already in the hand list — and is only ever set by hand.)

*Vibes* (OR semantics; a candidate collecting zero vibes is dropped as
`"no-vibe"`, because with no vibe it is unreachable under any chip):
`river` ← `waterway=*`, `man_made=pier`, `leisure=slipway`, or a name matching
`/James|Canal|River|Kanawha|Floodwall/`. `park` ← `leisure` in
`park|garden|nature_reserve|dog_park`, `landuse=recreation_ground`.
`museum` ← `tourism` in `museum|gallery`, `amenity` in
`arts_centre|theatre|library`. `history` ← any allowlisted `historic=*`,
`heritage=*`, `ref:nrhp=*`, `memorial=*`, `landuse=cemetery`. `food` ←
`amenity=marketplace` only. `scenic` ← `tourism=viewpoint`, `tourism=artwork`,
`man_made=bridge`, `natural` in `peak|cliff|waterfall`, `highway=steps`, or a
park/garden that also collected `river`.

*Score* (additive, ranking only, never a gate — verified that only 6 of 200
memorials carry `wikidata`): `+30` `wikidata`, `+20` `wikipedia`, `+15`
`heritage` or `ref:nrhp`, `+10` `website`, `+10` `name:en` or a name over 12
characters, `+10` `wikimedia_commons`, `+5` `description`, `+5` `artwork_type`.
Clamp to 100.

**`resolveAnchor` — the ladder. First hit wins; the rung used is recorded as
`anchorSource` so a reviewer can distrust a fallback.**

1. **entrance** — an `entrance=main`, else `entrance=yes`, node on this
   feature's own way. Verified ~0% on Richmond park outlines; kept because it
   is free when it hits.
2. **gate** — from the gate-node harvest for this feature's family, the nearest
   gate node to `seed` within 250 m by `metersBetween`. **Unmeasured:** how
   often this rung hits. The entrance rung was measured at 0 (below); nobody
   has counted shared park-outline/pedestrian-way nodes, and an attempt to do
   so during review got a 429 from Overpass. If gates turn out as sparse as
   entrances, every row falls to rung 3 and the review page's "flag the
   `snap`-anchored rows" flags everything, which is the same as flagging
   nothing. **Check before implementing:** run one gate query for
   `leisure=park` and read the element count. If it is near zero, the review
   page needs a different discriminator (rank by
   `anchorDistanceMeters` and `edgeUse` instead of by rung) and that is a
   change to section 3, not a surprise to discover mid-run.
3. **snap** — `POST /api/locate` with the rung-2 candidate coordinate if there
   is one, else `seed`. Accept only when
   `distanceMeters <= (element is a node ? 60 : 120)` **and**
   `outboundReach >= 50`. The distance test is done here, on the returned
   `distance`, and never by trusting `radius` — verified that a `radius: 10`
   locate returned a correlated point ~30 m away, across the James.
4. **fail** — drop the candidate. A point nobody can stand on is worse than a
   missing row.

Rungs 1 and 2 still pass their result through `/api/locate` for the gate checks
— the endpoint has already applied `edges[i].edge.access.pedestrian === true`
and `edges[i].edge.classification.use ∈ LOCATE_USES` before answering 200, so
the proposer reads the flattened `use` and `outboundReach` and nothing deeper —
but keep their own coordinate rather than the correlated one — an entrance node
is a better answer than a snap to the nearest sidewalk segment.

**`relief`.** This spec does **not** add a height endpoint. Terrain is assigned
from the `edge_info.mean_elevation` values `/locate` already returns verbosely:
one locate for the anchor plus eight probe locates on a 250 m ring, then
`terrainFromRelief(max - min)`, `>= 15 m` → `"hilly"`. That is nine `/locate`
calls per candidate, which is one reason the whole proposer run is a rare,
manual, local act.

**This rung has a prerequisite the repo does not currently meet, and it must be
met before a propose run is trusted.** `valhalla/docker-compose.yml` sets
`build_admins=False` and `build_time_zones=False` and never sets
`build_elevation`; `valhalla/richmond.env` names no elevation source; and
`valhalla/data/valhalla.json` points `additional_data.elevation` at an empty
`/custom_files/elevation_data`. Against that graph every edge's
`mean_elevation` is the invalid sentinel, and Valhalla serialises it as JSON
`null` (`src/baldr/edgeinfo.cc`, `EdgeInfo::json`: "add the mean_elevation
depending on its validity" — `if (elev == kNoElevationData) writer("mean_elevation", nullptr);`,
`https://github.com/valhalla/valhalla/blob/master/src/baldr/edgeinfo.cc`).

Nine nulls coerced to zero give a relief of 0 and a terrain of `"flat"` for
every generated row, with no error, no counter and no visible symptom until
someone walks up Church Hill and the card says flat. That is exactly the hidden
degraded state this app's whole argument refuses. So:

- **Setup work, in scope of this spec:** the Valhalla setup must build with
  elevation — `build_elevation` enabled in `valhalla/docker-compose.yml` and a
  populated elevation tile directory under `valhalla/data/`, documented in
  `valhalla/README.md` alongside the extract. Elevation tiles are a separate
  download and a separate few hundred megabytes; that cost is real and belongs
  in the README next to the extract size.
- **The proposer aborts loudly.** `meanElevation === null` from any of the nine
  locates is a fatal error for the whole run, not a per-candidate drop: it
  prints `mean_elevation is null - the Valhalla graph was built without
  elevation. See valhalla/README.md.` and exits non-zero having written no
  proposals file. A partial run here is worse than none, because "flat" is a
  plausible answer and nobody would look twice at it.
- **`terrainFromRelief` takes a number and only a number.** It has no null
  branch and no default; the null check happens at the boundary, where the
  response is narrowed, so the pure function cannot become the place a silent
  zero enters.
- **The four known-hilly hand rows are the acceptance test** — Church Hill,
  Libby Hill, Chimborazo, Forest Hill must all come back `"hilly"` from a real
  run before any proposal is accepted. That check is the difference between an
  elevation-enabled graph and a convincing-looking one.

**Contract asked of the `elevation-profile` sibling:** if you add a height
endpoint, expose it as `POST /api/height { shape: { latitude, longitude }[] }`
returning `{ heights: number[] }` in metres and input order, honouring the
existing `BOUNDS` check and the shared failure vocabulary. This pipeline will
then send one 9-point shape per candidate instead of nine locates, and the
nine-locate path can be deleted. That endpoint has the same prerequisite: a
graph built without elevation makes `/height` useless too, so the
elevation-tile setup above is needed either way.

**Dedup.** Sort accepted candidates by score descending. Reject as
`"duplicate"` any candidate within `DEDUP_METERS = 90` of an entry in `PLACES`
**or** of an already-accepted candidate. The hand-curated 62 are seeded into
the accepted set first and never removed, so they win every conflict by
construction — this is where "the hand-picked coordinates are better than
anything generated" is actually enforced rather than merely asserted.

**Cap.** Take the top `MAX_PLACES - PLACES.length` by score, interleaved so
each tier keeps a share: alternate destination / detour while both remain. This
prevents 165 plaques from eating the whole budget.

`PLACES.length` here is the **current** length read from the module the
proposer just SSR-loaded, not the constant 62. `apply:places` is append-only
and re-runnable, so a second run's budget is `250 - (62 + whatever the first
run appended)`, and reading the number rather than assuming it is the
difference between a second run that fits and one that silently overshoots.
`apply-places.mjs` enforces the same wall independently: if appending the
accepted ids would take `PLACES.length` past `MAX_PLACES` it prints the
arithmetic and exits non-zero, appending nothing. Leaving that to
`places.test.ts` would mean discovering the overshoot from a red test against
a file already rewritten.

### 3. Review

`data/proposals/review.html` is one self-contained file — no CDN, no fetch —
written by the proposer. One row per candidate: name, tier word, vibes,
terrain, score, `anchorSource`, `anchorDistanceMeters`, `edgeUse`, an
OpenStreetMap link, and the seed→anchor distance so a big move is visible at a
glance. `j`/`k` move, `a` toggles accept, `c` copies the accepted ids to the
clipboard. Rows anchored by `"snap"` are visually flagged, because a snapped
anchor can be technically walkable and socially wrong — a park anchored to a
service road behind a maintenance yard passes every automated gate.

### 4. Apply — `scripts/apply-places.mjs`

Reads `accepted.txt` and `places.json`, refuses to run if any accepted id is
already present in `PLACES` (that is a `propose` bug, not something to silently
skip), formats each row on one line in the file's existing style, appends below
the generated-boundary comment, and prints the new total plus an estimated
gzipped delta. It **never** rewrites or reorders an existing row.

### Pure functions to extract and test

`classify`, `placeName`, `placeId`, `terrainFromRelief`, `PLACE_BOUNDS` and
`DEDUP_METERS` in `src/data/osm-rules.ts` (imported only by the proposer and by
tests, never by an app module); `matchesKind` in `src/data/places.ts`, which
App.tsx does import; `metersBetween` in `src/lib/geometry.ts`; `locateCacheKey`
in `server/proxy.ts`.

## Failure and degradation

**Overpass is down, rate-limited or slow during a harvest.** The harvest is a
manual command, not a build step; it prints the status and exits non-zero
without touching `data/osm/`. The committed responses from the last successful
harvest stay exactly as they are, so `propose` and `apply` still work and the
app is entirely unaffected. On a 429 it sleeps 30 s and retries at most three
times, then aborts — the documented etiquette.

**`/api/locate` returns 503 `not-configured` during a propose run.** The
proposer stops at the first one and prints the same advice the app does
(`VALHALLA_URL is unset. See .env.example and valhalla/README.md.`). It writes
no partial proposals file: a half-anchored dataset is the failure mode where
someone accepts the rows that happened to resolve.

**`/api/locate` returns 404 `no-pedestrian-edge`.** Normal and expected. That
candidate is dropped, counted, and listed under `rejected` in the proposals
file so the reviewer can see the shape of what was thrown away.

**A generated row is wrong in production** — the anchor is in a lawn, the place
no longer exists. No runtime signal, and this spec does not invent one: it is a
data bug, fixed by editing the row like any other line of code. The mitigations
are all upstream — the review page, the rejection rules, `places.test.ts`.

**The dataset grows past `MAX_PLACES`.** `places.test.ts` fails. This is a
deliberate build-time wall rather than a runtime discovery, because at 600
places the cost is ~+19 KB gzipped, about 30% of the entire app JS budget, and
that must be a decision someone argues for rather than something that happens.

**A duplicate id, an out-of-bounds coordinate, an empty `tags` array, or a name
too long for the 25 px `.result-name`.** All are `places.test.ts` failures.
Nothing catches any of them today, at build time or at runtime.

**Every place filtered out.** Unchanged behaviour, and it now has one more
cause: Kind = Detours with a short budget. App's existing `emptyNotice` path
covers it. The `pool-reasoning` sibling owns making that notice say *which*
filter emptied the pool; this spec only guarantees that `kind` participates in
`candidates`, and therefore in `candidateKey`, exactly like every other filter,
so that sibling gets it for free. **Contract asked of `pool-reasoning`:** if
you introduce a per-filter rejection tally, the tier filter is a positional
fifth argument to `selectCandidates`, not an options object, and its rejection
reason is named `"kind"`.

**Routes never settle for a big pool.** Unchanged mechanics: the 12 s
`ROUTE_WARM_GRACE_MS` timer splits `routesWarming` from `reelIsShort`. The
wide-wave cap makes this *less* likely at 250 places than an uncapped wave
would, and the spin still draws its winner from the full `candidates`.

**A place beyond `WIDE_PREFETCH_LIMIT` gets picked.** Its route is not warm, so
`cachedRoute` returns `undefined`, the `ResultCard` shows skeletons, and the
existing picked-place retry effect (`ROUTE_ATTEMPTS = 3`) fetches it. If that
fails, the card shows "Could not measure this walk" with "Try again". This is
the existing failure surface, reached slightly more often.

**Offline.** Unchanged: the places module is in the bundle, so dots and filters
work from cache; contours and routes fail through the existing `postJson` /
`TransientError` path and the panel says so.

**`/api/locate` is scraped.** It is bounded to Richmond by `BOUNDS`, pinned to
pedestrian costing, charged a rate-limit unit, and cheaper upstream than the
`/api/route` already exposed. It cannot be turned into a worldwide service.

The cache is the part that needed bounding rather than asserting. At the
5-decimal key an earlier draft specified, the Richmond box holds on the order
of 10^10 distinct keys, so "the worst case is a warm edge cache" was a hope,
not a bound — a scraper could fill it indefinitely with distinct keys. **The
cache key therefore rounds to 4 decimals** (~11 m at this latitude):
`` `/api/locate/${CACHE_VERSION}-${WALKING_SPEED_KMH}/${lat.toFixed(4)},${lng.toFixed(4)}` ``.
That is ~2,200 × ~2,300 ≈ **5 million** possible keys for the whole box, a real
ceiling, and it costs the caller nothing: an anchor is a property of the graph,
not a metre-precise measurement, and two points 11 m apart correlate to the
same edge in nearly every case. The response still carries the *exact*
correlated point Valhalla returned for the un-rounded input of whichever
request warmed the entry — so the proposer must treat `point` as "an anchor
near where I asked", which it already does, and must read `distanceMeters` as
the authority on how far the anchor moved. Test 34 asserts the 4-decimal
collapse.

## Cost

**Bundle. Every number here is an estimate from a standalone file measurement,
and the whole paragraph must be re-measured against a real build before any of
it is quoted in `LAUNCH.md`.** `src/data/places.ts` is 10,681 bytes raw
(verified) and gzips standalone to ~3.1 KB (verified: `gzip -c` gives 3,099
bytes) — roughly **50 bytes gzipped per row**, not the 36 an earlier draft of
this spec claimed off a bad baseline. On that basis 188 more rows is ≈ **+9 KB
gzipped**, and the true figure will be lower, because in a real bundle these
rows are gzipped in the same window as the rest of the app JS and share a
dictionary with it, which a standalone file cannot. That is exactly why the
build measurement is the one that counts.

Three further line items, all **unmeasured estimates**, flagged as such:

- `detour` on maybe 45% of new rows at ~12 raw bytes each ≈ +0.3 KB gzipped.
- `osm` on every generated row at ~16 raw bytes ≈ +1.4 KB gzipped. This is the
  line worth arguing about — it is identity, not data, and the `opening-hours`
  sibling is its only consumer. Open question 1 turns on this number, so
  **measure it** rather than deciding on the estimate: build once with the
  field and once without, and compare gzipped app JS.
- `DETOUR_LABELS`, `PLACE_KINDS`, `matchesKind`, the fifth `selectCandidates`
  parameter, `metersBetween`, the extra Filters fieldset and the new map source
  and layers together, **under 1 KB gzipped**.

Order-of-magnitude conclusion: **roughly +10 KB gzipped, on the order of a
sixth of the 64 KB budget** — enough that this feature is a real budget
decision and not a rounding error, which is the point the number has to carry.
Replace the range with the measured delta before it goes in `LAUNCH.md`.

`src/data/osm-rules.ts` ships **nothing**, and that is now a design constraint
rather than an observation: `matchesKind`, `PlaceKind` and `PLACE_KINDS` live
in `places.ts` precisely so that no app module has a reason to import
`osm-rules.ts`, leaving the classification table, `PLACE_BOUNDS` and
`DEDUP_METERS` reachable only from the proposer and the tests. If a build ever
shows osm-rules bytes in the bundle, an app import crept in — find it rather
than adding a budget line.

**Requests per session.** Zero new endpoints called by the browser —
`/api/locate` is a build-time endpoint that happens to be public. Route
prefetch per origin change goes from "everything inside the 100-minute contour"
(today at most 62, tomorrow at most 250) to a hard 90, so at 250 places the
wide wave is **cheaper than today's uncapped wave would be** and roughly 1.5x
today's actual traffic.

**The route LRU quietly loses half its guarantee, and that is the honest cost.**
`src/lib/route.ts` sets `CACHE_LIMIT = 200` with the comment "Every destination
for a few origins, so revisiting a start stays instant." At today's 62
destinations "a few" is about three origins. At a 90-cap wide wave plus a near
wave it is about two. Nothing thrashes — one origin's waves fit comfortably —
but the constant was sized for revisiting a *start*, and after this change it
holds fewer starts. Either accept that (two is still more than one, and the
sole symptom is a slower second visit to a third origin) or raise `CACHE_LIMIT`
to 320 in a separate one-line change with its own argument. This spec does not
raise it; it just refuses to pretend the guarantee is unchanged.

**Build time.** The app build is unchanged. The pipeline is three manual
commands: harvest ≈ 10 requests with 5 s pauses ≈ 1–2 minutes; propose ≈ 9
`/locate` calls per candidate over ~600 candidates ≈ 5,400 requests against a
local Valhalla, a few minutes warm; apply is instant.

**Engine load.** `/locate` is a single graph correlation, far cheaper than
either the isochrone expansion or the route already exposed, charged 1
rate-limit unit and edge-cached 30 days. A propose run against production would
be ~5,400 units, well past the 240-per-60 s limiter — so the pipeline is
documented as a **local dev-server** operation.

**Nothing enforces that locally, and the spec should not claim otherwise.** The
limiter lives only in `worker/index.ts`, behind the optional `API_RATE_LIMIT`
binding; `server/vite-plugin.ts` has no limiter at all, and the dev server is
exactly where the pipeline is meant to run. So the limiter constrains a propose
run pointed at *production* (it would stall after ~240 calls, which is the
useful part) and constrains nothing at all locally, where the constraint is a
local engine's own patience. The enforcement that does exist is
`propose-places.mjs` refusing to start unless its `/api/locate` base is
`localhost` or `127.0.0.1` — a one-line check with a message naming why, which
is a comment with teeth rather than the limiter doing work it cannot do here.
An operator who wants to run against a remote engine passes an explicit
`--allow-remote` flag and owns the 5,400 calls.

**Hosting.** None. No new binding, no KV, no R2, no env var. `data/osm/` adds
roughly 0.5–1 MB of committed JSON — `out center tags;` returns tags plus one
coordinate per element, so ~1,500 elements stays comfortably under a megabyte.
That is small next to the 19 MB already in `public/reach/`.

**Snapshots.** Zero — see the `public/reach/*.json` entry above.

## Tests

`node --test "server/*.test.ts" "src/**/*.test.ts"`.

**`src/data/places.test.ts`** (new — no test covers the dataset today):

1. `every place id is unique` — a `Set` over `PLACES.map(p => p.id)` has the
   same size.
2. `every origin id is unique` — the same over `PRESET_ORIGINS`. Note that ids
   are unique *within* each array and deliberately collide across them
   (`siegel`, `vmfa`, `carytown`, `capitol`, `maymont`, `belle-isle`,
   `libby-hill`, `scotts-add` exist in both), so this must not be a cross-array
   assertion.
3. `every place is inside PLACE_BOUNDS`.
4. `every place has at least one vibe` — otherwise no chip can reach it.
5. `every vibe on a place is a member of VIBES`.
6. `every detour value is a key of DETOUR_LABELS`.
7. `no GENERATED place name exceeds NAME_MAX = 32 characters` — the
   `.result-name` is 25 px in a fixed-width rail. **The hand-curated rows are
   exempt and the ceiling is measured from them, not guessed.** Verified
   against the current file: the longest existing name is "White House of the
   Confederacy" at **30** characters, followed by "Virginia Museum of History"
   (26), "South of the James Market" (25), "Virginia Holocaust Museum" (25) and
   "Richmond Railroad Museum" (24). An earlier draft of this spec set
   `NAME_MAX = 28` and justified it with "the longest existing name is
   Manchester Floodwall (20)", which is simply false and would have failed on
   day one against untouched hand-curated data. So: `NAME_MAX = 32`, giving the
   real longest name two characters of headroom, and the assertion runs over
   rows carrying `osm` — i.e. exactly the generated ones — because a
   generated name is the only kind this rule can actually govern. A
   hand-curated row longer than 32 is a deliberate human choice about a real
   Richmond institution; the proposer has no such standing, and `placeName`
   rejects an over-length OSM name at source rather than shipping one for the
   test to catch.
8. `PLACES.length <= MAX_PLACES`.
9. `no two places are within DEDUP_METERS` — catches a generated row landing on
   a hand-curated one. Must look at `PLACES` only: the `manchester` **origin**
   and the `manch-flood` **place** deliberately share coordinates.
10. `every osm id is well-formed and unique` — every `osm` present matches
    `/^(node|way|relation)\/\d+$/`, and no two rows share one. Paired with
    `every place with a detour carries an osm id`, since the detour tier exists
    only through the proposer.

**`src/data/osm-rules.test.ts`** (new). Fixtures are hand-written
`OsmCandidate` objects; no network. Throughout, "→ `"lifecycle"`" is shorthand
for `{ ok: false, reason: "lifecycle" }` and "a `Classification`" for
`{ ok: true, classification: … }` — the tagged union, never a `typeof` check.

11. `classify rejects a lifecycle-tagged element` — tags
    `{ "disused:amenity": "marketplace", name: "Old Market" }` → `"lifecycle"`.
12. `classify rejects access=private` — `{ leisure: "park", name: "Private Green", access: "private" }`.
13. `classify rejects a cafe but keeps a marketplace` — the two-case pair that
    encodes the commercial rule: `{ amenity: "cafe", name: "Lamplighter" }` →
    `"commercial"`; `{ amenity: "marketplace", name: "17th Street Market" }` →
    a `Classification` with `tags` containing `"food"`.
14. `classify drops an element that collects no vibe` — `{ historic: "city_gate", name: "West Gate" }`
    is not in the vibe table beyond `history`… so use a genuinely vibe-less
    fixture, `{ man_made: "obelisk", name: "The Obelisk" }` minus the `art`
    rule's `scenic`, and assert the returned reason is exactly `"no-vibe"`.
    (If the vibe table as written makes every classified element carry a vibe,
    this test documents that fact by asserting the drop path is unreachable —
    say so in the test name rather than deleting the branch.)
15. `classify assigns mural for artwork_type=mural and art otherwise`.
16. `classify assigns marker for historic=memorial + memorial=plaque` — the
    ~165-element case, the largest detour source in the city.
17. `classify assigns no detour to leisure=park` — the destination tier.
18. `classify never gates on wikidata` — the same park fixture with and without
    a `wikidata` tag classifies identically apart from `score`.
19. `score is additive and clamped to 100` — a fixture carrying `wikidata`,
    `wikipedia`, `heritage`, `website`, `wikimedia_commons` and `description`
    sums past 100 and returns exactly 100.
20. `placeName rejects an untitled artwork` — `name: "Untitled"` → null; also
    `name: "RVA"` (three characters) → null; also a 40-character OSM name →
    null, so an over-long generated name never reaches the file for test 7 to
    catch. `NAME_MAX` is exported from `places.ts` and shared by both.
21. `terrainFromRelief` — 14 → `"flat"`, 15 → `"hilly"`, 40 → `"hilly"`.
22. `placeId is stable, slugged and deduped` — "St. John's Church" →
    `st-johns-church`; with `st-johns-church` already in `taken` →
    `st-johns-church-2`.
23. `matchesKind` — **in `places.test.ts`, not here**, because that is where the
    function lives. A destination passes `"any"` and `"destination"` and fails
    `"detour"`; a `detour: "mural"` place does the inverse; both pass `"any"`.

**`src/lib/geometry.test.ts`** (modified, or new):

24. `metersBetween is zero for identical points`.
25. `metersBetween matches a known Richmond pair` — downtown
    (37.5388, -77.4336) to St. John's Church (37.5306, -77.4197): the walking
    route measures 1,085 m, so the straight line must land between 1,000 and
    1,120 m.
26. `metersBetween is symmetric`.

**`server/proxy.test.ts`** (modified), using the existing `stubFetch` /
`stubConsoleError` / `post(path, body)` helpers and the `MONROE` fixture:

27. `locate pins pedestrian costing and the walking speed` — `calls[0].url`
    ends `/locate` and the body carries `costing: "pedestrian"`,
    `verbose: true` and `walking_speed: 3.69`.
28. `locate rejects a point outside the Richmond bounds without calling upstream`
    — 400 **and** `calls.length === 0`.
29. `locate rejects a non-POST` — 405, `calls.length === 0`.
30. `locate returns 404 when no returned edge is pedestrian-accessible` — stub
    an upstream body whose only edge has `access.pedestrian: false`.
31. `locate returns 404 when every edge is a driveway` —
    `classification.use: "driveway"`, proving the use allowlist and not just
    the access flag.
32. `locate rejects an edge beyond LOCATE_MAX_DISTANCE_M` — a verbose
    `distance` of 400 yields 404, encoding the verified `radius` trap.
33. `locate never leaks the engine URL` — extend the existing secrecy assertion
    to the new path, including the failure bodies. Pair it with
    `stubConsoleError(t)`.
34. `locateCacheKey rounds to 4 decimals and is null on bad input` — two
    payloads about 8 m apart (differing in the 5th decimal) produce the same
    key, which is the bound on cache growth, not an accident of formatting; two
    payloads 200 m apart produce different keys; an out-of-bounds payload
    produces null.
35. `locate is unconfigured without VALHALLA_URL` — 503, `calls.length === 0`.
38. `locate reads the verbose nesting` — one stubbed upstream body with
    `distance` and `outbound_reach` on the edge, `access`/`classification`
    under `edge`, and `way_id`/`names`/`mean_elevation` under `edge_info`
    produces the full documented 200 body. This is the test that catches the
    wrong nesting, which is the easiest mistake in the whole endpoint.
39. `locate passes a null mean_elevation through as null` — upstream
    `"mean_elevation": null` (what a graph built without elevation returns for
    every edge) yields `meanElevation: null` and **not** 0. The proxy does not
    decide what a missing elevation means; the proposer aborts on it.

**`server/worker.test.ts`** (modified):

36. `a locate request is edge-cached` — with `stubEdgeCache(t)`, a second
    identical request is served from the cache and never reaches upstream.
37. `a locate request costs one rate-limit unit` — exactly one `limiter.limit`
    call.

## Acceptance criteria

1. `npm run harvest:osm` writes `data/osm/*.json` and `data/osm/manifest.json`,
   pauses at least 5 s between requests, sends a `user-agent` naming the app
   and a contact, and retries a 429 after 30 s at most three times before
   exiting non-zero.
2. `data/osm/manifest.json` records, per query, the verbatim Overpass QL, the
   `osm3s.timestamp_osm_base` and the element count; `data/osm/README.md`
   carries the ODbL notice and a link to `openstreetmap.org/copyright`.
3. `npm run propose:places` reads only files under `data/osm/` — verifiable by
   running it with no network beyond `localhost` and observing that the only
   outbound call is `/api/locate`.
4. Every proposed row records `anchorSource`, `anchorDistanceMeters`,
   `edgeUse` and `outboundReach`, and no proposed row has
   `anchorDistanceMeters` above 120 for an area feature or 60 for a point one.
5. No proposed row is within 90 m of any entry in the hand-curated `PLACES`,
   and no hand-curated row's coordinates, name, tags or terrain change anywhere
   in the diff.
6. `data/proposals/review.html` opens with no network access, lists every
   candidate with its rejection reason where applicable, visually flags
   `snap`-anchored rows, and supports `j` / `k` / `a` / `c`.
7. `npm run apply:places` appends below the generated-boundary comment, never
   modifies an existing row, refuses to run on an already-present id, refuses
   to run when the append would take `PLACES.length` past `MAX_PLACES` (with
   the arithmetic printed and nothing written), and prints the new total plus
   the estimated gzipped delta.
8. `PLACES.length` is at most 250, `src/data/places.test.ts` fails if it is
   not, and `npm test` passes with every case named above.
9. `POST /api/locate` behaves identically under `npm run dev` and under
   `wrangler dev`, and answers 503 / 400 / 404 / 405 exactly as specified.
10. Filters shows a Kind fieldset with Any / Places / Detours between the switch
    row and Terrain; each button sets `aria-pressed`, plays `playTap` with the
    *next* state, and "Clear filters" returns it to Any. With the drawer shut
    on a phone-width viewport, Kind = Detours makes the summary read
    "Filters (1 active)", and with Terrain = Hilly as well it reads 2 — a
    filter that shrinks the reel while the summary says "Filters" is the bug
    `activeFilters` exists to prevent.
11. Setting Kind to Detours changes the candidate pool, the map dots, the
    `candidateKey` and therefore the spin pool, with no other filter touched;
    changing it mid-spin cancels the throw through the existing abort effect.
12. A detour on the map is a smaller hollow `--accent-soft` ring; a destination
    is a filled `--accent` dot; an out-of-reach place is the existing grey dot
    in both tiers; every zoom-scaled value goes through `weighted()`, and every
    new layer id is absent from `basemap.ts`.
13. During a spin at ~250 places, `syncPlaces` is not called: only the
    one-feature `place-picked` source is re-uploaded per reel tick. Observable
    with a counter or a breakpoint, and by profiling a spin against the frame
    budget. Separately: reload the page with a pick already in state and the
    white picked dot and its label are present on first paint — the `syncAll`
    style-ready path calls `syncPicked`, not only `syncPlaces`.
14. The result card's eyebrow reads the tier word for a detour and "Your walk"
    for a destination; the card gains no description, no fourth stat and no
    `aria-live`.
15. The single `sr-only role="status"` line names the tier for a detour, e.g.
    "Mural: Flood Wall Murals, 14 min on foot, 0.7 mi."
16. The wide route-prefetch wave never exceeds 90 destinations per origin
    change, chosen nearest-first by `metersBetween`.
17. `npm run typecheck`, `npm run lint` (eslint, oxlint with anti-slop, knip)
    and `npm run build` are clean — including over `scripts/`, which
    `.oxlintrc.json` does not ignore: no `unknown` at a boundary, **no `typeof`
    anywhere**, `classify` discriminated by its `ok` tag, a `// SAFETY:` comment
    above every assertion, and no dead export (every `osm-rules.ts` export
    tagged `@public`).
18. `public/reach/*.json` is untouched, `SNAPSHOT_VERSION` is unchanged, and
    the diff adds no `PRESET_ORIGIN`.
19. README documents the three commands, the human gate and the ODbL notice;
    LAUNCH.md records the new dataset size against the budget.
20. The Valhalla graph is built with elevation, `valhalla/README.md` documents
    the tile source and its size, and a propose run against a graph without it
    exits non-zero on the first null `mean_elevation` having written no
    proposals file. Positive check: Church Hill, Libby Hill, Chimborazo and
    Forest Hill all resolve to `"hilly"` from real `/api/locate` data.
21. `src/data/osm-rules.ts` contributes zero bytes to the built bundle,
    verifiable by grepping `dist/assets/*.js` for a string only it contains
    (e.g. `"parking_aisle"`). `matchesKind` lives in `places.ts`.
22. `npm run propose:places` refuses to start against a non-localhost
    `/api/locate` base without an explicit `--allow-remote` flag.

## Open questions

1. **Does `osm` earn its ~1.4 KB gzipped?** That figure is an estimate, not a
   measurement, and the decision should not be made on it — build once with the
   field and once without first. It is dead weight unless the
   `opening-hours` sibling ships, and that spec's own measurement is that only
   24% of destinations have hours in OSM at all. Someone has to decide whether
   to carry the identity mapping speculatively or drop the field and pay to
   rebuild it later.
2. **Where does the accepted yield actually land, and is 250 the right wall?**
   The cap comes from bundle arithmetic, not from how many good places Richmond
   has. If the proposer yields 180 usable rows the question is moot; if it
   yields 400, someone must choose between raising the wall and raising the
   score threshold.
3. **Should Southside get a preset origin?** Out of scope here by explicit
   decision, but the coverage argument that motivates this feature applies just
   as well to origins, and the cost — a ~1.7 MB snapshot, a full ladder
   rebuild, a `SNAPSHOT_VERSION` bump — is a real number someone should weigh
   rather than inherit from this spec's silence.

## Corrections after implementation

Written against the code that shipped. Nine things, in the order they bit.

1. **The terrain half of this spec is gone, and it was the expensive half.**
   `elevation-profile` deleted `Place.terrain` before this ran, so
   `terrainFromRelief`, the 250 m relief ring, the nine `/api/locate` probes per
   candidate, the null-abort, the elevation prerequisite and the four
   known-hilly-rows acceptance check all come out. `/api/locate` is called
   **once** per candidate and returns no `meanElevation` at all. That is roughly
   5,400 upstream calls removed from a propose run, and it is why the run takes
   minutes rather than an afternoon. README section 2.4 called this in advance;
   this section records that it held.

2. **The tier filter is a `PoolRule`, not a fifth positional argument.**
   `selectCandidates` no longer exists. The contract this spec asks of
   `pool-reasoning` - "a positional fifth argument, and its rejection reason is
   named `kind`" - is answered better than it was asked: the reason code is in
   that spec's union already, and contributing a rule gets the summary line, the
   drawer breakdown and the empty-pool fix for free.

3. **`activeFilters` needed no change.** This spec asks for
   `+ (state.kind === "any" ? 0 : 1)`; the count already sums active rules, so
   the tier is counted by existing. Verified on screen: **FILTERS (1 ACTIVE)**
   with Kind = Detours.

4. **`placeName` rejects a street address.** Not anticipated here, and it should
   have been: of 52 markers the first propose run accepted, **38** were Historic
   Richmond house plaques named "2816 E. Grace" or "605 N. 25th Street". This
   spec's own rule is that a name must be self-describing, and an address is
   not. A leading house number is the whole tell; "17th Street Market" and
   "1708 Gallery" survive it.

5. **`memorial=ghost_bike` is refused, and the reason is a product decision.**
   Four are in the box and the first run accepted three, as "Marker: Robyn
   Hightman" - a person's name with no context, drawn at random and presented as
   a small delight. A ghost bike marks where a named cyclist was killed in
   traffic. The card has no room to say what that place is; the refusal is
   written into the rules rather than left for a reviewer to catch.

6. **Community gardens and `tourism=gallery` are refused.** 34 of 63 named
   gardens are `garden:type=community`: a membership of raised beds, usually
   behind a gate. Of 18 galleries, most are commercial art dealers and nothing
   in the tags separates them from The Anderson or Artspace - so all 18 go,
   because unsure is a rejection and this data layer has already shipped one
   closed storefront.

7. **Dedup is by name as well as by distance.** The Canal Walk is tagged as
   several ways more than 90 m apart, so it came through twice on top of the
   hand-curated `canal-walk`: three rows, one place. `placeId` would have papered
   over it as `canal-walk-2`, which is a duplicate wearing a suffix.

8. **The gate rung was measured, and it works - for the features it is for.**
   This spec flags "unmeasured: how often rung 2 hits". One query answers it:
   **195** shared park-outline/pedestrian-way nodes, against the **0** entrance
   nodes that were already measured. In the run 17 of 180 rows anchored by gate
   and 163 by snap, which looks lopsided until you notice most candidates are
   *nodes* - a memorial or a mural has no centroid problem and skips the rung by
   design. The review page's flag on snapped rows is therefore still meaningful.

9. **`apply-places.mjs` counts by importing, and both ways of not doing that are
   already documented mistakes.** It first counted `id:` across the whole file
   and got **81** for 62, sweeping up `PRESET_ORIGINS` and `VIBES` - the exact
   miscount README section 2.6 records. Scoped to the array literal it got
   **61**, missing `pyramid`, the one multiline row - the other documented
   miscount. It SSR-loads the module now.

**Two counts to carry forward.** The yield is **180 accepted against 434
rejections**, which answers open question 2: the wall was not the binding
constraint in the end, though the first run did overflow it by 63 before the
four rules above were written. And `osm` costs **1,288 bytes gzipped**, measured
by building twice - open question 1 asked for exactly that rather than a
decision on the estimate. It stays: `opening-hours` is the next chunk and is its
consumer.
