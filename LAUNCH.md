# Launch checklist

## The Google terms question is gone

Earlier revisions of this file opened with a blocker: Google's Maps terms
(General Terms 3.2.3(a), (b), (e); Routes 19.2) forbade using Google content
with a non-Google basemap and forbade the pre-fetch/cache pattern that makes
the dial instant. The 2026-07-28 cutover removed every Google dependency:
contours and routes now come from a Valhalla instance you run, the data is
OpenStreetMap under ODbL, and the only obligation is attribution, which the
map overlay carries ("Valhalla / OpenStreetMap") alongside the basemap's own
credit. Prefetching and caching your own engine's output is nobody's clause.

The blocker that replaced it is operational, not legal:

## Blocker: production needs a reachable Valhalla

The Worker forwards `/api/*` to `VALHALLA_URL` (`wrangler.toml` `[vars]`).
Until that names a live instance, a deployed site renders the map and the
dial but shows the not-configured panel instead of contours.

- [ ] Stand up the Compose stack from `valhalla/README.md` on a box the
      Worker can reach (small VPS is plenty; Stadia Maps if hosted is
      preferred).
- [ ] Apply the `max_contours: 60` config edit and set
      `VALHALLA_MAX_CONTOURS=60`, or leave both stock and accept a chunked
      (14-query) warm-up per origin.
- [ ] TLS in front of the engine, and firewall it so only the Worker's
      traffic reaches it. The engine enforces no geographic bounds itself;
      the proxy does.
- [ ] Confirm `.env.local`'s FOSSGIS evaluation URL is nowhere in the
      deployed configuration. Community infrastructure must not carry a
      public app's traffic.

## Abuse and cost

The proxy is the only thing between a public URL and your box's CPU. Confirm
each:

- [ ] `server/proxy.ts` rejects origins outside the Richmond bounding box
      and clamps contour minutes. (`npm test` covers both with a stubbed
      engine.)
- [ ] It forces pedestrian costing and pins the walking speed; the client
      cannot pick a travel mode.
- [ ] The rate-limit binding in `wrangler.toml` is present and deployed.
      Verify it fires: hammer `/api/isochrone` more than 240 times in a
      minute from one IP and expect `429`.
- [ ] Spot-check the response of a bad request. It should return a status
      and a short reason, never the engine's raw error body.

## Measured: how Valhalla's contours compare to Google's

Kept from the provider evaluation (2026-07-28, live APIs, two origins, three
fidelity settings, Valhalla's walking speed matched to Google's implied
pace). Summary; history has the full text.

- **General agreement is good.** At matched pace, Google and Valhalla were
  within 4% on area at 25 and 45 minutes from Monroe Park, and picked the
  same 9 places at 25 minutes.
- **The robust finding favoured the move.** From Manchester, Google's 60
  minute contour contained no north-bank destination at any fidelity, while
  Google's own Routes API put Canal Walk at 28 minutes across the bridge —
  Google contradicting Google. Valhalla's contour crossed where its own
  router did.
- **Known Valhalla wobble.** It was over-generous once: Battery Park inside
  45 minutes where routing says 47. Two origins in one city is not a survey;
  spot-check contours against `/api/route` times when something looks off.
- The walking speed pinned in `server/proxy.ts` (3.69 km/h) is what made the
  areas comparable. Changing it is a product decision that re-scales every
  figure in the README.

## Verify against the live engine

Done 2026-07-28 through the dev proxy against Valhalla (FOSSGIS instance),
origin Monroe Park. Re-run against your production instance once it exists.

- [x] Contours return and follow streets: 10/20/25 minutes in one request,
      three Polygon features tagged with their contour minutes.
- [x] Routes return polyline6 with pedestrian costing: Monroe Park to
      Jackson Ward, 1.78 km, duration consistent with 3.69 km/h.
- [x] Full-dial scrub is instant once warm: 56 positions in 464 ms, one
      `/api/isochrone` call total, readout fresh at every step, area
      monotonic. (Engine protocol via self-hosted-config stub; shapes
      synthetic.)
- [x] Spin end-to-end: reel, route line, result card with walk time and
      distance.
- [ ] Contours nest and the James notches the polygon on the production
      instance's tiles. Eyeball 60 minutes from a river-adjacent origin.
- [ ] Mobile framing at 390x844 against real contours.

## Ship

- [x] `npm run build` clean, `npm run typecheck` clean, `npm run lint`
      clean, `npm test` green.
- [ ] `npx wrangler deploy`.
- [ ] Hit the deployed URL with `VALHALLA_URL` unset once to confirm the
      not-configured panel appears rather than a blank map.
- [ ] Real phone, not a resized desktop window. The bottom sheet, the dial
      drag, and the map pan all need thumbs.
- [ ] Screen reader pass over the rail. The hidden list at the bottom of the
      rail is the keyboard equivalent of clicking dots on the map.
- [ ] `og:image`. `index.html` declares the OG tags but there is no image
      asset yet. A 1200x630 screenshot of the bloom over the dark map would
      do the job; add it at `/og-image.png` and add the `og:image` meta tag.

## Known gaps

- No isochrone caching across users. Every visitor triggers their own
  warm-up even for the ten preset origins, which are the same polygons every
  time. Cheap for a self-hosted engine, but a Workers KV cache keyed on
  origin and minutes would cut latency and box load; it is not built.
- The dial's warm-up progress bar is now binary: the ladder arrives as one
  response, so it jumps 0 to 100 rather than filling. Cosmetic; revisit if a
  slow engine makes the wait feel dead.
- `valhalla/data/` holds a 406 MB Virginia extract once downloaded. It is
  gitignored; delete it freely, the README names the URL.
