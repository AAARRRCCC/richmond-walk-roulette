# Self-hosting Valhalla

The app's contours and walking routes come from a [Valhalla](https://github.com/valhalla/valhalla)
instance named by `VALHALLA_URL`. This directory holds everything needed to
run one. The engine is open source and the data is OpenStreetMap, so unlike
the Google setup this replaces, there is no API key, no per-request bill, and
no terms clause about non-Google basemaps.

`./data/` is gitignored: it holds the OSM extract, the clipped extract and
the built graph. Everything else here is tracked.

## Run it

Three scripts, in order. Plain Linux shell reading one settings file, so the
machine you develop on and the machine you deploy to are set up by the same
commands.

```bash
cd valhalla
./scripts/install-engine.sh   # once per machine
./scripts/clip-extract.sh     # fetches Virginia once, cuts Richmond out of it
./scripts/build-graph.sh      # builds the graph, fixes the limits, starts it
```

Then `./scripts/run-engine.sh [start|logs|stop]` day to day.

Valhalla is not packaged for Debian or Ubuntu, so it runs as the project's own
container image. That means Docker Engine, which is what a Linux server runs -
Docker Desktop is a Windows and macOS product and is not involved. Everything
else the scripts need (`osmium-tool`, `curl`, `python3`) is in the archives.

`clip-extract.sh` is why this is quick. The Virginia extract is about 900 MB
and nearly none of it is within walking distance of Richmond; clipped to a box
reaching roughly 15 km from downtown it is a fraction of that, and the graph
builds in about a minute instead of fifteen. The dial tops out at a 100 minute
walk, about 6.2 km at the pace the proxy pins, so there is graph well past
anywhere a walk could reach. Widen the box in `richmond.env` if the preset
origins ever move. The state extract is deliberately kept in `./extracts`
rather than `./data`: the engine builds from every `.osm.pbf` in the directory
it is given, so leaving it beside the clipped one would build the whole state.

`build-graph.sh` also corrects the setting that is easiest to get wrong and
silent when it is: the image ships isochrone limits far below what this app's
ladder asks for - 96 contours in one query, the longest 100 minutes - and
below them the warm-up is rejected outright rather than answered slowly. The
only symptom in the app is a dial that never warms.

Then point the app at it:

- dev: in `.env.local`, `VALHALLA_URL=http://127.0.0.1:8002` and
  `VALHALLA_MAX_CONTOURS=100`. The literal address rather than `localhost`:
  some clients try `::1` first and wait out a connection that nothing
  answers, which reads as the engine being slow when it is not.
- prod: the same two values in `wrangler.toml` `[vars]`, with the URL of
  wherever this runs

## On Windows

Valhalla's HTTP service does not build natively on Windows. Run these scripts
in WSL2 instead - they are the same scripts the server runs, so nothing here
is a Windows-only detour.

```powershell
wsl --install -d Ubuntu
```

Then open Ubuntu and work from the checkout, which WSL sees under `/mnt/c/`.
A service bound to loopback inside WSL2 is reachable from Windows on
`localhost`, so `.env.local` still says `http://localhost:8002`.

Adding yourself to the `docker` group only takes effect at the next login. On
WSL that means `wsl --shutdown` from PowerShell, then reopening Ubuntu.

The pip-installed `pyvalhalla` wheel ships `valhalla_service.exe`, but only
its one-shot mode works; the HTTP loop (prime_server) is compiled out.
Verified 2026-07-28: it prints usage and exits when given a concurrency
argument. That is why WSL rather than a native build.

## Keeping it running

No systemd unit here on purpose. The compose file says
`restart: unless-stopped` and `install-engine.sh` enables `docker` at boot, so
the engine comes back after a crash or a reboot on its own. A unit wrapping
`docker compose up` would only be a second thing to keep in sync with the
first.

If the engine ever does run as a bare binary rather than a container, that is
when it needs a unit - and the config the scripts write already carries the
listen address and tile paths it would need.

## Where to run it

- **A small VPS:** the whole stack fits comfortably in 1-2 GB of RAM once
  built. The Cloudflare Worker needs to reach it, so give it a hostname and
  front it with TLS (Caddy is the least ceremony), and firewall it so only
  the Worker's traffic gets through - the engine itself enforces no bounds;
  the app's proxy does.
- **Stadia Maps** runs hosted Valhalla with the same API, if operating a box
  is not worth it. Their contour limit applies; set `VALHALLA_MAX_CONTOURS`
  to whatever their plan allows and the proxy chunks accordingly. Leave it
  unset or set it to anything that is not a positive integer and the proxy
  assumes the stock limit of 4, which works against any instance.

## The evaluation fallback

`https://valhalla1.openstreetmap.de` is FOSSGIS's community instance. It is
fine for evaluating the app locally, and this repo's `.env.local` starts
there so the map works before any of the above exists. It is shared
infrastructure run by volunteers. Its stock `max_contours` of 4 means one
origin warm-up costs 24 sequential isochrone calls, plus a route per reachable
place, and it rate-limits to about one call a second. It also caps pedestrian
isochrones at 100 minutes, which is where this app's dial ceiling comes from:
ask for more and it answers `Exceeded max time: 100`. Their policy asks apps
to identify themselves, so the proxy sends `X-Client-Id: walk-roulette`. Do
not leave it configured under a deployed URL.

## Walking speed

The proxy pins `walking_speed` to 3.69 km/h for both isochrones and routes
(`WALKING_SPEED_KMH` in `server/proxy.ts`). That is the pace at which
Valhalla's 25 minute area from Monroe Park matched the Google contours the
app shipped with, so the cutover preserved the assumed pace (the contour
shapes still differ where the engines do; see LAUNCH.md). It is a product decision now. Change it deliberately, and if you do,
re-measure the README's area figures and regenerate `public/reach/` - every
precomputed snapshot was built at this pace and nothing detects a stale
one. The pace is part of the Worker's isochrone cache key, so changing it
does at least empty the edge cache on its own.

## Local development without any engine

`node valhalla/stub.mjs` serves a fake Valhalla on port 8003: concentric,
lightly irregular contours and near-straight routes, instantly. Its routes are
a straight line from A to B with a small sway, and its contours are noise
around a circle. It speaks
just enough of the API for the app (POST /isochrone, /route, /status). Point
`.env.local` at it (`VALHALLA_URL=http://localhost:8003`,
`VALHALLA_MAX_CONTOURS=100`) to work on UI, dial feel, or map rendering
offline. The shapes are invented. Never judge reachability with it, and never
judge a route line by it.
