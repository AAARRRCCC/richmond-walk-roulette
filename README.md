# Walk Roulette, Richmond

Pick how long you want to walk. See how far you can actually get. Spin for
somewhere to go.

A circle drawn around your front door knows nothing about the James, which you
can only cross at a bridge. It knows nothing about the interstate, or about
which streets have a pavement. So it offers you places you cannot walk to.
This app asks the [Valhalla](https://github.com/valhalla/valhalla) routing
engine for the area you can really reach, and draws it as nested time
contours.

The gap is worth measuring rather than asserting. At the 4.5 km/h this app
pins, a 25 minute circle covers 4.26 sq mi. Here is what you can actually
reach:

| From | 25 min | A circle claims | Overstated by |
| --- | --- | --- | --- |
| Monroe Park | 2.93 sq mi | 4.26 sq mi | 1.46× |
| Shockoe Slip, by the river | 2.24 sq mi | 4.26 sq mi | 1.91× |

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
- **Daylight is computed locally**, from NOAA's algorithm - no API, no key, no
  request. The deadline is civil dusk, not sunset: sunset is when it starts to
  feel dark and is the number people know, so the card quotes it, but civil dusk
  is the last moment you can read a trail without a torch, so that is what the
  clamp uses. **Get back before dark** shades the dial from whatever the light
  allows up to a hundred, rather than shortening the track, so you can see what
  the light is costing. After dark it stops clamping and says so instead.
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

The walking speed is pinned server-side at 4.5 km/h, roughly an average
walker's pace. It replaced a 3.69 that had been calibrated to make Valhalla's
25 minute area from Monroe Park match the Google Isochrones the app used to
ship with — a pin fitted to a contour rather than to anybody walking, and one
that a real walk found slow by about a quarter. `docs/adr/0002` records the
walk and the choice. Changing the speed is a product decision. It rescales
every figure above and makes every precomputed snapshot wrong.

## Stack

- React 18 + TypeScript + Vite 7, no UI framework
- MapLibre GL v5 over [OpenFreeMap](https://openfreemap.org) vector tiles, with
  a hand-written dark map style (`src/map/basemap.ts`). The basemap needs no
  key.
- Valhalla for isochrones and walking routes, behind a same-origin proxy
- Cloudflare Worker in production. The Vite dev server mounts the same handler.
- 87 KB gzipped of app JavaScript, plus MapLibre's own 277 KB. Both measured by
  `node scripts/verify-bundle.mjs` rather than remembered; the line used to claim
  64 KB and 276 KB and had been wrong for some number of commits

## The engine never faces the browser

Both endpoints live in `server/proxy.ts`, which the dev server and the Worker
each mount at `/api/isochrone` and `/api/route`. `VALHALLA_URL` names the
instance. There is no `VITE_` prefix, so Vite will not inline it.

## Where the places come from

Sixty-two of them were typed by hand and win every conflict. The rest came out
of OpenStreetMap through three commands, in this order:

    npm run harvest:osm      # the only thing here that talks to Overpass
    npm run propose:places   # reads only data/osm/, writes a review page
    npm run apply:places     # appends accepted ids to src/data/places.ts

Nothing in that chain runs in CI or at build time. The harvest is committed to
`data/osm/` and everything downstream reads those files, for the same reason
`build-reach.mjs` reads a committed snapshot: a build whose output depends on
the day it ran is not a build, and a mid-air OSM edit should not be able to
change the destination list without review.

**The human gate is real.** `propose` stops at
`data/proposals/review.html` — one self-contained page, no network — and a
person writes ids into `accepted.txt`. A script that can rewrite the
destination list unattended is a script that can ship a marker standing in a
highway median.

Generated rows are an append-only suffix below a boundary comment in
`places.ts`, and `HAND_CURATED_COUNT` is where the hand-written ones stop. The
proposer refuses to emit a row within 90 m of an existing one, so a hand-picked
coordinate — chosen by somebody who has stood there — is never overwritten by a
centroid.

**Map data © OpenStreetMap contributors, ODbL.**
<https://www.openstreetmap.org/copyright>

## The weather never faces the browser either

`GET /api/weather` is the same idea against a different upstream. It takes **no
parameters** — Richmond's coordinates are pinned in the proxy next to the
walking speed — so a scraped endpoint is not a worldwide weather service with
this app's name on it. Any query string is a 400 and anything but `GET` is a
405, both before the request costs anybody anything. The Worker edge-caches it
for 900 seconds under one constant key, which matches the `current.interval`
the upstream reports for itself, so one call serves every visitor to a colo per
refresh.

The proxy normalises the upstream's shape into this app's own rather than
forwarding it, so switching vendors is one module. `WEATHER_URL` names the
upstream and defaults to Open-Meteo.

**Attribution and licence.** Weather data by Open-Meteo, CC-BY 4.0, credited on
screen beside the reading. Their free API tier is sold as **non-commercial use
only** — their boundary is "private or non-profit websites or apps that do not
have subscriptions or advertising". Walk Roulette is free and ad-free, so it is
inside that line and the feature is on. It is gated by one constant,
`WEATHER_ENABLED` in `src/lib/weather.ts`, with a test asserting its value, so
**if this app ever carries a subscription or an advert that constant goes back
to false the same day.** `docs/plans/HUMAN-REVIEW.md` §2.4 has the terms quoted
and the two paid routes onward.

**Operationally, the thing to know:** an unreachable forecast degrades to a
missing line and never blocks a spin — not the Spin button, not the route
warm-up, not the reel — and it logs `at: "weather"`, never `at: "valhalla"`.
A forecast blip must not be diagnosed as an engine outage.

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
├── data/places.ts        242 destinations and 11 preset origins
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

A place carries a name and any number of tags from a fixed six: river, park,
museum, history, food, scenic. It carries no description and no terrain — the
name is the whole offer, the walk is the point, and hilliness is a property of
a route rather than of a dot. A second tier, `detour`, marks the things that
are a reason to walk a particular way rather than somewhere to spend an
afternoon.

## Sharing a spin

A good spin used to be unshareable: the address bar offered the front door of
the app, so the other person landed on a different question with a different
answer.

    /s?o=carytown&b=34&rt=1&p=shiplock

A readable query string, not a token. It costs no codec in the byte budget,
ignores keys it does not understand, falls back to defaults for keys that are
absent, and therefore never needs a version or a migration. Opening one restores
the session and shows the card — it never re-runs the reel, because a replayed
reel is either predetermined theatre or a genuine second draw, and both break
the promise the link makes.

**A preset origin shares as an id. A dropped pin shares as a coordinate rounded
to three decimals**, about 110 m — enough to say "start around here", not enough
to say which door. That is a privacy decision and it is one constant,
`PIN_PRECISION`.

**The link does not carry the condition switches.** Get back before dark, Mind
the weather and Skip closed places are about the recipient's here-and-now, not
about the walk that was sent: a link that switched off somebody's daylight guard
would be a trap, and one that switched it on would be a lie about what the
sender did.

The shared destination is always shown, even when the recipient's conditions
exclude it, with the reason beside it. A link never silently substitutes a
different place.

The Worker rewrites the page's own `<title>` and Open Graph tags for the spin,
so a link unfurls as the place and the walk rather than as the site's generic
card. The picture is the same for every share — runtime image rendering does not
fit the Workers Free plan's 10 ms of CPU per request, and that is a decision
rather than an oversight.

## Both in reach

Two people, two doors, one question: *where can we both walk to in half an hour?*

Press **Invite someone to meet** and you get a link to a **room**. The other person opens
it, chooses their own start on their own device, and shares it into the room. From then on
both screens show the same thing from opposite sides: your setup on your rail, theirs on a
read-only mirror rail, and one spin that lands on the same place on both.

    /s?r=8XK2M4P9

The link carries the room id and nothing else. Starts, budgets and filters travel over a
WebSocket relay inside the app's own server (`server/rooms.ts`), which orders and forwards
messages and never computes a pool or picks a winner. A room lives twelve hours in server
memory, then reads "room closed"; a third device opening the link is told the room already
has two walkers. See `docs/adr/0001` for why the earlier link-only shape was retired.

It is not called "meet in the middle", which is the phrase every competitor uses and is a
lie in this app's own terms. **There is no middle.** There is an overlap, and the midpoint
of two people on opposite banks of the James is in the river — the same refusal as refusing
the circle. Nothing here computes an intersection polygon or prints an overlap area: the
two contours are drawn and where they cross the region simply looks denser, which is
compositing rather than a measurement, and the app never names it. What it names instead is
a count, because the thing two people want to know is how many options they have.

**Most pairs share nothing at a normal budget, and that is the feature's opening move
rather than its failure.** When the overlap is empty the app scans both cached ladders and
says the smallest budget at which something *is* shared — *"At 42 minutes, Byrd Park comes
into both your reaches"* — with a button that moves the dial there.

**Opening a room link costs the person who received it nothing.** Until they choose a start
nothing is drawn, nothing is measured and nothing is sent. Their start reaches the other
person only when they press *Share my start*, at full precision, over the socket, to that
one room — never into a URL. A reload rejoins the same room as the same walker.

**One spin, both screens.** The side that presses Spin draws the winner up front and sends
its id before its reel turns; the other side's reel runs to the same place one hop behind.
The relay serialises: if both press at once, the first spin wins and the second is dropped.
Spin stays disabled until both sides have locked in a budget, and the mirror rail offers
*Match N min* when the budgets differ.

**Both walks are measured at the same pace**, and the card says so. There is one pinned
walking speed in this app and no per-person one; two people who walk differently will find
the app wrong for both of them by the same amount in opposite directions. That is an
assumption, stated, rather than a fact implied.

## Hours, and what the app will not claim

The app says whether a place is likely to be open **when you would get there** —
at the arrival time the route already knows, not at now — and keeps closed
places out of the spin by default.

Coverage is thin and stated rather than hidden: **118 of 242 places**, of which
25 come from OpenStreetMap's own `opening_hours` and 93 from a single category
assumption. Everything else says nothing at all, which is the honest answer and
is why `unknown` is never rendered as "open".

The one assumption is Richmond's park ordinance — open at 5 a.m., closed at
dusk — and it always says the word "assumed" on screen. It is one constant,
`PARK_RULE` in `src/lib/hours.ts`.

**That assumption annotates and never removes anything.** A recorded
`opening_hours` string is a fact about one place, and a museum that shuts at
five is a museum the app will not send you to. The park rule is a regulation
applied to a category of 93 places, none individually checked, and most Richmond
parks have no gate to close — so removing them after dusk would be the app being
confidently wrong about a whole class of place on the strength of a rule nobody
enforces. The card says the hours; the walker decides.

No opening-hours parser ships to the browser. `opening_hours` is 108 KB
gzipped and LGPL-3.0-only; it is a devDependency that runs once, at build time,
and bakes a 336-bit weekly mask per place. The runtime does one array index and
one bit test.

    npm run harvest:hours   # one batched Overpass lookup, by element id
    npm run build:hours     # reads the committed harvest, writes src/data/hours.ts
    npm run check:hours     # fails 60 days before the window runs out

The masks cover a calendar window — currently 2026-01-01 to 2027-12-31 — and
outside it every verdict degrades to `unknown` rather than quietly reading last
year's Thanksgiving. Rebuild annually; `check:hours` is what remembers.

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
