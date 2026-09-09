# Walk Roulette, Richmond

Pick how long you want to walk. See how far you can get. Spin for somewhere
to go.

A circle around your start ignores the James, the interstate and which streets
have a pavement, so it includes places you cannot walk to. This app asks a
[Valhalla](https://github.com/valhalla/valhalla) routing engine for the area
you can reach on foot and draws it as time contours. At 4.5 km/h, a 25 minute
circle covers 4.26 sq mi. The reachable area is smaller:

| From | 25 min reachable | Circle | Overstated by |
| --- | --- | --- | --- |
| Monroe Park | 2.93 sq mi | 4.26 sq mi | 1.46× |
| Shockoe Slip | 2.24 sq mi | 4.26 sq mi | 1.91× |

## How it works

- The dial is minutes, 5 to 100. Round trip is on by default and halves the
  outbound leg.
- Picking an origin fetches every contour the dial can reach, 96 of them, in
  one Valhalla query. After that, scrubbing the dial is a cache read.
- The 11 preset origins are precomputed into `public/reach/` and load in a few
  milliseconds with no engine call.
- Spin picks from the places inside the real isochrone polygon, holes
  included. While the reel turns, the map draws each candidate's walking route.
- **Far edge only** limits the pool to the outermost band.
- **Get back before dark** caps the dial at civil dusk, computed locally from
  NOAA's algorithm. **Mind the weather** uses an Open-Meteo forecast. **Skip
  closed places** uses opening hours baked at build time.
- The readout always says how many places are in reach and why the rest are
  excluded. When none are left it names the one change that recovers the most.
- Every control plays a short synthesised cue. Nothing is loaded or fetched.

## Sharing

`/s?o=carytown&b=34&rt=1&p=shiplock` restores a spin and shows its result
card. A preset origin shares as an id; a dropped pin is rounded to three
decimals, about 110 m. The condition switches are not carried, since they
describe the recipient's conditions, not the sender's walk. The Worker rewrites
the page title and Open Graph tags for the link.

`/s?r=8XK2M4P9` is a **room** for two people. Each picks their own start,
both see both contours, and one spin lands on the same place on both screens.
Starts and settings travel over a WebSocket relay in `server/rooms.ts`, never
in the URL. Rooms hold two walkers and last twelve hours. There is no
"middle": the app counts places in both reaches and, when there are none,
says the smallest budget at which one appears. See `docs/adr/0001`.

## Data

`src/data/places.ts` holds 242 destinations and 11 preset origins. 62 were
typed by hand and take precedence; the rest came from OpenStreetMap through a
reviewed pipeline that never runs in CI:

    npm run harvest:osm      # the only command that talks to Overpass
    npm run propose:places   # writes data/proposals/review.html
    npm run apply:places     # appends ids from accepted.txt to places.ts

Opening hours cover 118 of 242 places: 25 from OSM `opening_hours`, 93 from
Richmond's park ordinance, which is labelled "assumed" on screen and never
removes a place. The parser runs at build time only (`npm run build:hours`);
the masks cover 2026-01-01 to 2027-12-31 and `npm run check:hours` fails 60
days before they expire.

Map data © OpenStreetMap contributors, ODbL.
<https://www.openstreetmap.org/copyright>. Weather by Open-Meteo, CC-BY 4.0,
non-commercial tier. If this app ever carries ads or a subscription, set
`WEATHER_ENABLED` in `src/lib/weather.ts` to false.

## Server

The browser never calls Valhalla or Open-Meteo directly. `server/proxy.ts`
serves `/api/isochrone`, `/api/route` and `/api/weather` from both the Vite dev
server and the Cloudflare Worker. It forces pedestrian costing, pins the
walking speed to 4.5 km/h (`src/lib/speed.ts`, see `docs/adr/0002`), clamps
duration, rejects origins outside Richmond, and takes no parameters for
weather. The Worker adds a per-IP rate limit and edge caching.

Changing the walking speed rescales every figure above and invalidates every
snapshot in `public/reach/`.

## Stack

React 18, TypeScript, Vite 7, no UI framework. MapLibre GL v5 over
[OpenFreeMap](https://openfreemap.org) tiles with a hand-written dark style.
Valhalla for isochrones and routes. Cloudflare Worker in production. App
JavaScript is 87 KB gzipped plus MapLibre's 277 KB, measured by
`node scripts/verify-bundle.mjs`.

## Develop

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # proxy protocol + spin reel
npm run lint         # eslint, oxlint (anti-slop plugin), knip
npm run build        # tsc --noEmit && vite build
```

`.env.local` sets `VALHALLA_URL`. Options:

1. Self-hosted, per `valhalla/README.md`: `http://localhost:8002` with
   `VALHALLA_MAX_CONTOURS=100`.
2. FOSSGIS's public instance, `https://valhalla1.openstreetmap.de`, for local
   evaluation only. It is rate-limited and must not sit behind a deployed URL.
3. `node valhalla/stub.mjs` on port 8003, synthetic shapes for offline UI work.

With no engine the map, dial, filters and presets still work.

In development, `` ` `` or the **TUNE** tab opens a panel for spin timing and
cue level. Production builds strip it.

To regenerate preset snapshots after changing the speed, ladder or engine:

```bash
npm run dev                     # in another terminal
node scripts/build-reach.mjs
```

## Deploy

```bash
npm run build
npx wrangler deploy
```

`wrangler.toml` holds the static assets, the rate-limit binding and
`VALHALLA_URL`. Read [`LAUNCH.md`](./LAUNCH.md) first.

## Layout

```
src/app/        App.tsx, session reducer, spin loop, reel phase machine, tuning
src/lib/        isochrone ladder, geometry, routes, hours, weather, sound, http
src/map/        basemap style, MapCanvas, contour smoothing
src/ui/         TimeDial, OriginPicker, Filters, ResultCard, ReachReadout
src/data/       places.ts, hours.ts
server/         proxy.ts (policy), rooms.ts (relay), tests
worker/         Cloudflare entry
scripts/        build-reach, harvest/propose/apply places, hours, verify-*
valhalla/       self-hosting scripts, compose file, offline stub
public/reach/   precomputed contour ladders, one per preset
docs/           ADRs, plans, infra, history
```

## History

Google's Isochrones API drew the contours before Valhalla did. From
Manchester its 60 minute contour reached no north-bank destination while its
own Routes API put Canal Walk 28 minutes away. The comparison is in
[`LAUNCH.md`](./LAUNCH.md). Before that the app was a roulette wheel over a
straight-line radius; those notes are in [`docs/history/`](./docs/history/).
