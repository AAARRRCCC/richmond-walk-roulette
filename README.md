# Richmond Walk Roulette

Spin a wheel for a random walking destination in downtown Richmond, Virginia.

Single-page React app. Pick a start location, set a distance range, optionally filter by terrain and vibe, then spin a curved-arc roulette wheel of curated POIs. Result panel shows distance, walk time, terrain, and a "Open in Maps" link. Real walking routes are rendered on a MapLibre map when a Google Maps API key is configured; falls back to a stylized curve otherwise.

## Stack

- React 18 + TypeScript + Vite
- MapLibre GL with OpenFreeMap tiles (no API key required for the base map)
- Google Routes API for walking polylines (optional)
- No backend — POI data is static, state lives in the URL hash

## Develop

```bash
npm install
npm run dev          # Vite dev server on http://localhost:5173
npm run build        # Type-check + production bundle to ./dist
npm run typecheck    # Type-check only
npm run lint         # ESLint
```

## Walking routes (optional)

Without an API key, the map shows a stylized curved line between start and destination. To render real walking polylines:

1. Create a Google Cloud project and enable the **Routes API**
2. Create an API key. Restrict it to HTTP referrers for your deployed domain (e.g. `https://walk.example.com/*`) and to the Routes API only
3. Copy `.env.example` to `.env.local` and paste the key into `VITE_GOOGLE_MAPS_API_KEY`

Vite inlines the key at build time. `.env.local` is gitignored.

## Deploy

Build target is a plain static site (`dist/`). The intended deployment is self-hosted on a Mac Mini behind a Cloudflare Tunnel:

```bash
npm run build
# serve ./dist with Caddy or nginx, expose via `cloudflared tunnel`
```

Any static host works. **Before exposing the app to the public web, run through [`LAUNCH.md`](./LAUNCH.md)** — it covers the Routes API key restriction, the OG image asset, the mobile phone-test gate, and optional Cloudflare Web Analytics setup.

## Project layout

```
src/
├── App.tsx                       # State (two reducers + a few useStates) + spin/rotate animation + wiring
├── main.tsx                      # Entry point; optional Cloudflare Web Analytics beacon
├── styles.css                    # All styles (no preprocessor)
├── data/pois.ts                  # 34 POIs + 10 preset starts (mile offsets from Monroe Park)
├── lib/
│   ├── geo.ts                    # distance, mile-offset ↔ lat/lng, eligibility filter
│   ├── route.ts                  # Google Routes API + polyline decoder + bounded LRU
│   ├── url-state.ts              # share/restore via location.hash
│   ├── wheel-layout.ts           # curved-arc geometry constants
│   ├── filter-state.ts           # filter useReducer + URL-hash hydration
│   └── wheel-state.ts            # wheel/spin useReducer (rotation, spinning, selectedId)
└── components/
    ├── Header.tsx
    ├── Controls.tsx              # start, range, round-trip, difficulty, vibe chips
    ├── RangeSlider.tsx
    ├── ChipGroup.tsx
    ├── Wheel.tsx                 # curved-arc SVG roulette
    ├── WheelPane.tsx              # desktop wheel container; overlay on mobile during spin
    ├── RichmondMap.tsx            # MapLibre + walking-radius rings, route, POI dots
    ├── DeferredMap.tsx            # IntersectionObserver-gated lazy mount for RichmondMap
    ├── MapPane.tsx                # map container + sr-only POI list
    ├── MapErrorBoundary.tsx       # falls back gracefully if the lazy map chunk fails
    ├── MobileDrawer.tsx           # bottom-sheet at <900px: peek + open states
    └── ResultPane.tsx
```

The original design handoff (spec + reference prototype) is preserved in [`design_handoff_walk_roulette/`](./design_handoff_walk_roulette/). Detailed iteration history lives in [`iter-log.html`](./iter-log.html) and [`IDEAS.md`](./IDEAS.md).
