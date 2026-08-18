# Self-hosting Valhalla

The app's contours and walking routes come from a [Valhalla](https://github.com/valhalla/valhalla)
instance named by `VALHALLA_URL`. This directory holds everything needed to
run one. The engine is open source and the data is OpenStreetMap, so unlike
the Google setup this replaces, there is no API key, no per-request bill, and
no terms clause about non-Google basemaps.

`./data/` is gitignored: it holds the OSM extract and the built graph
(roughly 1 GB for Virginia). Everything else here is tracked.

## Run it (any machine with Docker)

```bash
cd valhalla
curl -L -o data/virginia-latest.osm.pbf https://download.geofabrik.de/north-america/us/virginia-latest.osm.pbf
docker compose up -d
docker logs -f walk-roulette-valhalla   # first run builds tiles, ~10-20 min
```

When the log says it is serving, raise the isochrone contour limit so the
whole 5-60 minute dial ladder comes back in one query. Edit
`data/valhalla.json` (the container generates it on first run):

```json
"service_limits": { "isochrone": { "max_contours": 60 } }
```

then `docker compose restart`. A config edit does not rebuild the tiles.

Point the app at it:

- dev: in `.env.local` set `VALHALLA_URL=http://localhost:8002` and
  `VALHALLA_MAX_CONTOURS=60`
- prod: same two values in `wrangler.toml` `[vars]`, with the URL of wherever
  this Compose stack actually runs

Sanity check:

```bash
curl 'http://localhost:8002/status'
```

## Where to run it

- **This Windows machine:** Docker Desktop (or a WSL2 distro with Docker)
  is required. Valhalla's HTTP service does not build natively on Windows:
  the pip-installed `pyvalhalla` wheel ships `valhalla_service.exe`, but only
  its one-shot mode works; the HTTP loop (prime_server) is compiled out.
  Verified 2026-07-28: it prints usage and exits when given a concurrency
  argument. Until Docker is installed, `.env.local` points at FOSSGIS's
  public instance (below).
- **A small VPS:** the whole stack fits comfortably in 1-2 GB of RAM once
  built. The Cloudflare Worker needs to reach it, so give it a hostname and
  front it with TLS (Caddy is the least ceremony), and firewall it so only
  the Worker's traffic gets through - the engine itself enforces no bounds;
  the app's proxy does.
- **Stadia Maps** runs hosted Valhalla with the same API, if operating a box
  is not worth it. Their contour limit applies; set `VALHALLA_MAX_CONTOURS`
  to whatever their plan allows and the proxy chunks accordingly.

## The evaluation fallback

`https://valhalla1.openstreetmap.de` is FOSSGIS's community instance. It is
fine for evaluating the app locally, and this repo's `.env.local` starts
there so the map works before any of the above exists. It is shared
infrastructure run by volunteers: its stock `max_contours` of 4 means one
origin warm-up costs 14 sequential isochrone calls, plus a route per
reachable place. Do not leave it configured under a deployed URL.

## Walking speed

The proxy pins `walking_speed` to 3.69 km/h for both isochrones and routes
(`WALKING_SPEED_KMH` in `server/proxy.ts`). That is the pace at which
Valhalla's 25 minute area from Monroe Park matched the Google contours the
app shipped with, so the cutover preserved the assumed pace (the contour
shapes still differ where the engines do; see LAUNCH.md). It is
a product decision now; change it deliberately and re-measure the README's
area figures if you do.

## Local development without any engine

`node valhalla/stub.mjs` serves a fake Valhalla on port 8003: concentric,
lightly irregular contours and straight-ish routes, instantly. It speaks
just enough of the API for the app (POST /isochrone, /route, /status). Point
`.env.local` at it (`VALHALLA_URL=http://localhost:8003`,
`VALHALLA_MAX_CONTOURS=60`) to work on UI, dial feel, or map rendering
offline. The shapes are synthetic - never judge reachability with it.
