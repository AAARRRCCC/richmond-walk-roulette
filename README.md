# Walk Roulette, Richmond

Pick how long you want to walk. See how far you can actually get. Spin for
somewhere to go.

A circle drawn around your front door knows nothing about the James, which you
can only cross at a bridge. It knows nothing about the interstate, or about
which streets have a pavement. So it offers you places you cannot walk to.
This app asks the [Valhalla](https://github.com/valhalla/valhalla) routing
engine for the area you can really reach, and draws it as nested time
contours.

The gap is worth measuring rather than asserting. At the 3.69 km/h this app
pins, a 25 minute circle covers 2.87 sq mi. Here is what you can actually
reach:

| From | 25 min | A circle claims | Overstated by |
| --- | --- | --- | --- |
| Monroe Park | 2.03 sq mi | 2.87 sq mi | 1.42× |
| downtown, by the river | 1.48 sq mi | 2.87 sq mi | 1.94× |

The closer you start to the water, the more a circle lies to you. That is the
whole argument for the app.

## How it works

- **A time budget, not a distance.** The dial is minutes, 5 to 100. Round trip
  is on by default. It halves the outbound leg, which cuts the reachable area
  by much more than half, because area grows roughly with the square of time.
- **The whole dial is fetched up front.** Picking an origin asks for every
  contour the dial can reach: 96 of them, one per minute. Valhalla builds one
  graph expansion and cuts all 96 out of it, so a properly configured instance
  answers in a single query. After that the dial is a cache read. Scrubbing it
  sends no requests and repaints the contour and the readout every frame.
- **The presets skip the engine.** Each preset origin's ladder is precomputed
  into `public/reach/` and served as a static file. A cold start on a preset is
  one cached fetch: 3–7 ms and no engine calls, against about eight seconds of
  queries without it.
- **Three contours per budget.** All three follow the budget minute by minute,
  so the inner rings move with the outer one instead of jumping between fixed
  marks.
- **Spin picks from inside the polygon.** It runs a point-in-polygon test
  against the real isochrone, holes included, not a radius check. The amber
  dots are exactly the pool Spin can land on.
- **The reel draws real routes.** As it ticks through names, the map draws each
  one's real walking route. Only places whose route is already cached go on the
  reel. The winner is still drawn from the full candidate list, because picking
  from the warmed subset would favour whatever loaded first.
- **The reel arrives at its answer.** It slows onto the winner one slot at a
  time and rests there before the result card replaces it. If a route is still
  loading it keeps turning rather than parking on a name. A wheel that has
  stopped has already decided, and it should not have.
- **Far edge only** narrows the pool to places between the last two contours.
- **The panel always says how many places are in reach, and why the rest are
  not.** Every place gets a verdict rather than a yes-or-no, so the line under
  the readout reads "6 to spin - 12 shut - 20 wrong terrain" instead of leaving
  you to guess which of the things you touched did it. When nothing is left it
  names the single change that recovers the most places and puts the button
  right there, with the number it measured written on it.
  Go as far as the time allows.

## Sound

Every control answers with a short cue, built by code at the moment it plays.
Oscillators and filtered noise. Nothing is loaded and nothing is fetched.

The dial's detents are pitched to the value, so scrubbing is audibly
directional. Chips tap, switches latch, and each reel flip clicks a ratchet
whose pitch falls as the throw slows. One low thump is kept for the landing.
Everything sits at whisper level. Under `prefers-reduced-motion` the reel is
skipped and only the landing plays.

It is closer to haptics than to a soundtrack. One gesture, one cue. Only the
throw earns a run of them.

## What it costs

Nothing per request. The engine is open source and the data is OpenStreetMap.
You pay for whatever box runs it (`valhalla/README.md`).

The walking speed is pinned server-side at 3.69 km/h. That is the pace at
which Valhalla's 25 minute area from Monroe Park matched the Google Isochrones
the app used to ship with, so the cutover kept the assumed pace. It did not
keep the contour shapes: the two engines differ on edge access, penalties and
origin snapping, and `LAUNCH.md` records where. Changing the speed is a
product decision. It rescales every figure above and makes every precomputed
snapshot wrong.

## Stack

- React 18 + TypeScript + Vite 7, no UI framework
- MapLibre GL v5 over [OpenFreeMap](https://openfreemap.org) vector tiles, with
  a hand-written dark map style (`src/map/basemap.ts`). The basemap needs no
  key.
- Valhalla for isochrones and walking routes, behind a same-origin proxy
- Cloudflare Worker in production. The Vite dev server mounts the same handler.
- 70 KB gzipped of app JavaScript, plus MapLibre's own 277 KB. Both measured by
  `node scripts/verify-bundle.mjs` rather than remembered; the line used to claim
  64 KB and 276 KB and had been wrong for some number of commits

## The engine never faces the browser

Both endpoints live in `server/proxy.ts`, which the dev server and the Worker
each mount at `/api/isochrone` and `/api/route`. `VALHALLA_URL` names the
instance. There is no `VITE_` prefix, so Vite will not inline it.

The proxy forces pedestrian costing, pins the walking speed, clamps the
duration, and rejects origins outside a Richmond-area bounding box. A scraped
endpoint therefore cannot be turned into a free worldwide routing service that
saturates your box. The Worker adds a per-IP rate limit on top.

`npm test` runs 24 tests. Some cover the proxy's protocol with `fetch` stubbed:
contour fan-out against the instance's limit, costing pinned server-side, and
failure statuses mapped onto the classes the client's retry logic keys on. The
rest cover the spin reel's timing, which is a pure function precisely so the
way it feels can be asserted instead of eyeballed.

## Develop

```bash
npm install
npm run dev                    # http://localhost:5173
npm run build                  # tsc --noEmit && vite build
npm test                       # proxy protocol + spin reel
npm run typecheck
npm run lint                   # eslint (type-checked) + oxlint + knip
```

`npm run lint` runs three tools. ESLint on the type-checked tier. Oxlint with
a vendored [anti-slop](tools/oxlint/anti-slop) plugin, which rejects unparsed
`unknown` at boundaries and type assertions with no stated reason. Knip for
dead exports. All three should be clean.

`.env.local` decides which engine the proxy talks to. Three options, best
first:

1. **Self-hosted.** Follow `valhalla/README.md`, then set
   `VALHALLA_URL=http://localhost:8002` and `VALHALLA_MAX_CONTOURS=100`. The
   one-query warm-up needs this.
2. **FOSSGIS's public instance.** Set
   `VALHALLA_URL=https://valhalla1.openstreetmap.de`. This is community
   infrastructure for evaluation. It caps pedestrian isochrones at 100
   minutes, its stock contour limit turns each warm-up into 24 sequential
   queries, and it rate-limits to about one call a second. Fine for looking at
   real shapes. It must never sit under a deployed URL.
3. **No engine at all.** `node valhalla/stub.mjs` serves synthetic contours on
   port 8003 for offline UI work. The shapes are invented. Never judge
   reachability with it.

With none of them the app still runs. The map, the dial and the filters work,
the presets still draw from their snapshots, and the panel says what is
missing instead of failing silently.

### Feel controls

In development only, `` ` `` or the **TUNE** tab opens a panel for the things
you judge by ear and eye: spin length, the flip interval at each end, the
slowdown curve, how long the reel rests on the winner, and the cue level.
Changes take effect mid-throw and are saved per browser. Production builds
strip the panel and everything it touches.

### Precomputing the snapshots

```bash
npm run dev                     # in another terminal
node scripts/build-reach.mjs
```

This writes one file per preset origin into `public/reach/`. It goes through
the app's own `/api/isochrone` rather than straight at the engine, so a
snapshot cannot disagree with the costing the app asks for at runtime.
Regenerate them whenever the walking speed, the dial ladder or the contour
settings change. Nothing detects a stale snapshot for you.

## Deploy

```bash
npm run build
npx wrangler deploy
```

`wrangler.toml` wires the built `dist/` as static assets, the rate-limit
binding, and `VALHALLA_URL`, which must point at a Valhalla instance the
Worker can reach. Read [`LAUNCH.md`](./LAUNCH.md) first.

## Layout

```
src/
├── app/
│   ├── App.tsx            composition, data fetching, derived state
│   ├── session.ts         one reducer for the whole session
│   ├── useSpin.ts         the reel's animation loop
│   ├── reel.ts            where the reel is at each moment: a pure phase
│   │                      machine, so "it lands on the winner" is testable
│   ├── reel.test.ts       its tests
│   └── tuning.ts          live-adjustable feel settings
├── lib/
│   ├── isochrone.ts       contour ladder, snapshot seeding, batched fetch
│   ├── geometry.ts        GeoJSON parsing, point-in-polygon, area, point keys
│   ├── route.ts           Valhalla routes + polyline6 decoder
│   ├── sound.ts           the cue palette, built at trigger time
│   ├── json.ts            the JSON domain, and the only place `any` enters it
│   ├── lru.ts             the cache both fetch layers share
│   ├── http.ts            retry and backoff, and what counts as transient
│   ├── pool.ts            bounded concurrency for prefetching
│   └── format.ts
├── map/
│   ├── basemap.ts         the dark style, written out rather than recoloured
│   ├── MapCanvas.tsx      contours, place dots, route, draggable origin
│   └── smooth.ts          rounds the engine's raster staircase, drawing only
├── ui/                    TimeDial, OriginPicker, Filters, ResultCard,
│                          ReachReadout, TuningPanel
├── data/places.ts         62 destinations and 11 preset origins
└── styles/app.css         tokens and every rule; the locked design decisions
                           are documented at the top
public/reach/              precomputed contour ladders, one per preset origin
scripts/build-reach.mjs    what writes them
server/proxy.ts            the shared request handler; policy lives here
server/proxy.test.ts       its protocol tests (node --test, fetch stubbed)
server/vite-plugin.ts      mounts it on the dev server
worker/index.ts            mounts it on Cloudflare, serves dist/
tools/oxlint/anti-slop/    vendored lint plugin, run by npm run lint
valhalla/                  self-hosting: compose recipe, docs, offline stub
docs/history/              how the app got here; nothing current depends on it
```

## The data

62 walking destinations and 11 starting points, in `src/data/places.ts`.
Coordinates were geocoded once from OpenStreetMap through Overpass and baked
into the file. Map data © OpenStreetMap contributors, ODbL. Where OSM had no
entry the source is named in a comment on that entry. The Confederate Pyramid
is the one such case.

For large features like parks and cemeteries, the point is a public entrance
or a recognisable spot inside, not the middle of the polygon. That way a
walking route ends somewhere a person can actually stand.

A place carries a name, a terrain (flat or hilly), and any number of tags from
a fixed six: river, park, museum, history, food, scenic. It carries no
description. The name is the whole offer and the walk is the point.

> One consequence is worth knowing. Several places are seasonal or weekly, such
> as both markets, the Pump House and the Railroad Museum, and nothing on
> screen says so. A spin can send you to a closed lot.

Businesses are deliberately thin on the ground. A pass that tried to add
several found one that had closed and two that had moved, all still listed in
OSM, so the list leans on neighbourhoods and institutions instead.

## History

The app has changed contour provider once. Google's Isochrones API (Preview)
drew the reachable area before Valhalla did. What settled it was Google
contradicting itself: from Manchester, its 60 minute contour held no
north-bank destination at any fidelity, while its own Routes API put Canal
Walk 28 minutes away across the bridge. Valhalla's contour crossed where
Valhalla's router did. The full comparison is in [`LAUNCH.md`](./LAUNCH.md).

Before that the app was a curved-arc roulette wheel over a straight-line
radius, built through fifty iterations of an autonomous improvement loop.
Those notes are kept in [`docs/history/`](./docs/history/). None of it is
wired into the current build.
