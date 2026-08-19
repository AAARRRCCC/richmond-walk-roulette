# Launch checklist

## The Google terms question is gone

Earlier versions of this file opened with a blocker. Google's Maps terms
(General Terms 3.2.3(a), (b), (e); Routes 19.2) forbade using Google content
with a non-Google basemap, and forbade the prefetch-and-cache pattern that
makes the dial instant. The 2026-07-28 cutover removed every Google
dependency. Contours and routes now come from a Valhalla instance you run, the
data is OpenStreetMap under ODbL, and the only obligation is attribution. The
map overlay carries it ("Valhalla / OpenStreetMap") next to the basemap's own
credit. Prefetching and caching your own engine's output is nobody's clause.

What replaced it is operational, not legal.

## Blocker: production needs a reachable Valhalla

The Worker forwards `/api/*` to `VALHALLA_URL` (`wrangler.toml` `[vars]`).
Until that names a live instance, a deployed site draws the map and the dial,
and the preset origins still work from their snapshots, but anything else
shows the not-configured panel. Dropped pins and every route need the engine.

- [ ] Stand up the Compose stack from `valhalla/README.md` on a box the Worker
      can reach. A small VPS is plenty. Stadia Maps is fine if you would
      rather not run one.
- [ ] Set `max_contours: 100` and `max_time_contour: 100` in the engine
      config, and `VALHALLA_MAX_CONTOURS=100`. Leave them stock and each
      warm-up becomes 24 chunked queries instead of one.
- [ ] Put TLS in front of the engine, and firewall it so only the Worker
      reaches it. The engine enforces no geographic bounds itself. The proxy
      does.
- [ ] Confirm the FOSSGIS evaluation URL appears nowhere in the deployed
      config. Community infrastructure must not carry a public app's traffic.
- [ ] Regenerate `public/reach/` against the production engine. The committed
      snapshots were built against FOSSGIS. They are close, but they are not
      the engine you will be serving.

## Abuse and cost

The proxy is the only thing between a public URL and your box's CPU. Confirm
each:

- [ ] `server/proxy.ts` rejects origins outside the Richmond bounding box and
      clamps contour minutes. `npm test` covers both against a stubbed engine.
- [ ] It forces pedestrian costing and pins the walking speed. The client
      cannot choose a travel mode.
- [ ] The rate-limit binding in `wrangler.toml` is present and deployed.
      Check that it fires: hit `/api/isochrone` more than 240 times in a
      minute from one IP and expect a `429`.
- [ ] Spot-check a bad request. It should return a status and a short reason,
      never the engine's raw error body.

## Measured: how Valhalla's contours compare to Google's

From the provider evaluation on 2026-07-28: live APIs, two origins, three
fidelity settings, and Valhalla's walking speed matched to Google's implied
pace. Summary here; the history has the full text.

- **Broad agreement.** At matched pace, Google and Valhalla were within 4% on
  area at 25 and 45 minutes from Monroe Park, and picked the same 9 places at
  25 minutes.
- **What settled it.** From Manchester, Google's 60 minute contour held no
  north-bank destination at any fidelity, while Google's own Routes API put
  Canal Walk 28 minutes away across the bridge. Google contradicted Google.
  Valhalla's contour crossed where Valhalla's router did.
- **A known Valhalla wobble.** It was over-generous once: Battery Park inside
  45 minutes where routing says 47. Two origins in one city is not a survey.
  Spot-check contours against `/api/route` times when something looks off.
- The 3.69 km/h pinned in `server/proxy.ts` is what made the areas comparable.
  Changing it is a product decision that rescales every figure in the README
  and invalidates every snapshot in `public/reach/`.

## Verify against the live engine

Done through the dev proxy against FOSSGIS, origins Monroe Park and 15th &
Cary. Re-run against your production instance once it exists.

- [x] Contours return and follow streets. The reachable edge traces the river
      bank and crosses only at bridges.
- [x] Routes return polyline6 with pedestrian costing. Monroe Park to VMFA
      came back 2.597 km against 2.310 km straight-line, a 1.12× detour.
- [x] A preset origin cold-starts from its snapshot: measured 3-7 ms, zero
      `/api/isochrone` calls.
- [x] Full-dial scrub is instant once warm, and the contour and readout track
      every minute.
- [x] Spin end to end: reel, route line, result card with walk time and
      distance.
- [ ] Contours nest and the James notches the polygon on the production
      instance's own tiles. Eyeball 100 minutes from a river-adjacent origin.
- [ ] Mobile framing at 390x844 against real contours.

## Ship

- [x] `npm run build` clean, `npm run typecheck` clean, `npm run lint` clean
      (eslint, oxlint, knip), `npm test` green at 24 tests.
- [ ] `npx wrangler deploy`.
- [ ] Hit the deployed URL once with `VALHALLA_URL` unset, to confirm the
      not-configured panel appears rather than a blank map.
- [ ] A real phone, not a resized desktop window. The bottom sheet, the dial
      drag and the map pan all need thumbs.
- [ ] Screen reader pass over the rail. The hidden list at the bottom is the
      keyboard equivalent of clicking dots on the map.
- [ ] `og:image`. `index.html` declares the OG tags but no image exists yet. A
      1200x630 shot of the bloom over the dark map would do. Add it at
      `/og-image.png` and add the `og:image` meta tag.

## Known gaps

- **Seasonal places are not marked.** Places carry no description now, so
  nothing on screen says that both markets, the Pump House and the Railroad
  Museum are seasonal or weekly. A spin can send someone to a closed lot. The
  data comment in `src/data/places.ts` flags it; the UI does not.
- **Snapshots are heavy.** `public/reach/` is 19 MB on disk, about 391 KB
  gzipped per origin fetched. That is the cost of ungeneralised contours plus
  a 96-rung ladder. Git keeps every version, so regenerating them re-commits
  all of it.
- **Custom origins pay full price.** Only the 11 presets have snapshots. A
  dropped pin still warms the whole ladder from the engine, which against a
  stock-limit instance is 24 sequential queries.
- **The warm-up progress bar is binary.** The ladder arrives as one response,
  so it jumps 0 to 100 rather than filling. Cosmetic. Revisit if a slow engine
  makes the wait feel dead.
- **The contour raster is visible up close.** Valhalla grids isochrones at
  about 25 m and its API exposes no resolution setting, so the reachable edge
  is a staircase. `src/map/smooth.ts` rounds it off when drawing, which does
  not remove the steps, only their corners.
- `valhalla/data/` holds a 406 MB Virginia extract once downloaded. It is
  gitignored. Delete it freely; the README names the URL.
