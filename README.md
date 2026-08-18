# Walk Roulette, Richmond

Pick how long you want to walk. See exactly how far you can actually get. Spin
for somewhere to go.

The old version measured a straight-line radius from your start. A circle knows
nothing about the James, which you can only cross at a bridge, so it offers you
places you cannot actually walk to. This version asks the
[Valhalla](https://github.com/valhalla/valhalla) routing engine for the real
reachable area and draws it as nested time contours.

The gap is not small. A 25 minute walk from Monroe Park covers about 2 sq mi.
The circle you would draw at the same walking speed covers 4.91. The old model
was offering two and a half times more of Richmond than it could deliver.

## How it works

- **A time budget, not a distance.** The dial is minutes. Round trip halves the
  outbound leg, which cuts the reachable area by rather more than half: area
  grows roughly with the square of time.
- **The whole dial is fetched up front.** Choosing an origin asks Valhalla for
  every contour the dial can reach, 5 through 60 minutes. Valhalla computes one
  graph expansion and cuts all 56 contours out of it, so against a self-hosted
  instance the warm-up is a single query. After that the dial is a cache read:
  scrubbing 5 to 60 minutes issues zero requests and repaints the contour and
  the readout per frame (measured: 56 positions in 464 ms, one API call).
- **Three contours per budget.** The outer one is the budget itself; the two
  inner ones snap to a 5 minute ladder, so they are shared across dial
  positions.
- **Spin picks from inside the polygon.** Point-in-polygon against the real
  isochrone, holes included, not a radius check. Amber dots on the map are
  exactly the pool Spin can land on.
- **The reel draws real routes.** As the spinner ticks through names, the map
  draws each one's actual walking route. Only places whose route is already
  cached appear on the reel; the winner is still drawn from the full candidate
  list, because picking from the warmed subset would bias the result toward
  places that happened to load first.
- **Far edge only** narrows the pool to places between the last two contours:
  go as far as the time allows.

### What it costs

Nothing per request. The engine is open source and the data is OpenStreetMap;
you pay for whatever box runs it (`valhalla/README.md`). The walking speed is
pinned at 3.69 km/h server-side — the pace at which Valhalla's 25 minute area
from Monroe Park matched the Google Isochrones the app previously shipped
with. That preserved the assumed pace across the cutover, not the contour
shapes: the engines differ in edge access, penalties and origin snapping, and
LAUNCH.md documents where. Changing the speed is a product decision;
re-measure the numbers above if you do.

## Stack

- React 18 + TypeScript + Vite 7, no UI framework
- MapLibre GL v5 over [OpenFreeMap](https://openfreemap.org) vector tiles, with
  a hand-written dark cartographic style (`src/map/basemap.ts`). No key needed
  for the basemap.
- Valhalla for isochrones and walking routes, behind a same-origin proxy
- Cloudflare Worker for production; the Vite dev server mounts the same handler

## The engine never faces the browser

Both endpoints are served by `server/proxy.ts`, which the dev server and the
Worker both mount at `/api/isochrone` and `/api/route`. The Valhalla instance
is named by `VALHALLA_URL` (no `VITE_` prefix, so Vite will not inline it).

The proxy forces pedestrian costing, pins the walking speed, clamps the
duration, and rejects origins outside a Richmond-area bounding box, so a
scraped endpoint cannot be turned into a free worldwide routing service that
saturates your box. The Worker adds a per-IP rate limit on top.

`npm test` runs the proxy's protocol tests (Node's built-in runner, `fetch`
stubbed): contour fan-out against the instance's limit, costing pinned
server-side, and failure statuses mapped onto the classes the client's retry
logic keys on.

## Develop

```bash
npm install
npm run dev                    # http://localhost:5173
npm run build                  # tsc --noEmit && vite build
npm test                       # proxy protocol tests
npm run typecheck
npm run lint
```

`.env.local` decides which engine the proxy talks to. Three options, best
first:

1. **Self-hosted** — `valhalla/README.md`, then `VALHALLA_URL=http://localhost:8002`
   and `VALHALLA_MAX_CONTOURS=60`. The instant full-ladder warm-up needs this.
2. **FOSSGIS's public instance** — `VALHALLA_URL=https://valhalla1.openstreetmap.de`.
   Community evaluation infrastructure: the warm-up is 14 chunked queries
   instead of one, and it must never sit under a deployed URL.
3. **No engine at all** — `node valhalla/stub.mjs` serves synthetic contours
   on port 8003 for offline UI work.

Without any of them the app still runs: the map, the dial, and the filters all
work, and the panel explains what is missing instead of failing silently.

## Deploy

```bash
npm run build
npx wrangler deploy
```

`wrangler.toml` wires the built `dist/` as static assets, the rate-limit
binding, and `VALHALLA_URL` — which must point at a Valhalla instance the
Worker can reach. Read [`LAUNCH.md`](./LAUNCH.md) before making the site
public.

## Layout

```
src/
├── app/
│   ├── App.tsx            composition, data fetching, derived state
│   ├── session.ts         one reducer for the whole session
│   └── useSpin.ts         the shuffle; winner is drawn before the animation
├── lib/
│   ├── isochrone.ts       contour ladder, batched fetch, LRU + in-flight dedupe
│   ├── geometry.ts        GeoJSON parsing, point-in-polygon, area
│   ├── route.ts           Valhalla routes + polyline6 decoder
│   └── format.ts
├── map/
│   ├── basemap.ts         the dark style, written out rather than recoloured
│   └── MapCanvas.tsx      contours, place dots, route, draggable origin
├── ui/                    TimeDial, OriginPicker, Filters, ResultCard, ReachReadout
├── data/places.ts         51 curated destinations; coordinates from OSM,
│                          with exceptions documented inline
└── styles/app.css         tokens and every rule; the locked design decisions
                           are documented at the top
server/proxy.ts            the shared request handler; policy lives here
server/proxy.test.ts       its protocol tests (node --test, fetch stubbed)
server/vite-plugin.ts      mounts it on the dev server
worker/index.ts            mounts it on Cloudflare, serves dist/
valhalla/                  self-hosting: compose recipe, docs, offline stub
```

Place coordinates were geocoded once from OpenStreetMap via Overpass and baked
into `src/data/places.ts`. Map data (c) OpenStreetMap contributors, ODbL. Where
OSM had no entry, the source is named in a comment on that entry; the
Confederate Pyramid is the one such case today.

Businesses are deliberately thin on the ground here. A pass that added several
turned up one that had closed and two that had moved, all still listed in OSM,
so the list leans on neighbourhoods and institutions instead. Anything with a
schedule says so in its blurb.

## History

The app has moved contour provider once: Google's Isochrones API (Preview)
drew the reachable area before Valhalla did. The comparison that justified the
move — matched walking speed, two origins, the measured southbank gap — is
preserved in `LAUNCH.md`. The pre-isochrone version (curved-arc roulette
wheel, straight-line radius, 50 iterations of an autonomous improvement loop)
is in the git history and its notes are preserved in `IDEAS.md`,
`HANDBACK.md`, `iter-log.html`, and `design_handoff_walk_roulette/`. None of
it is wired into the current build.
