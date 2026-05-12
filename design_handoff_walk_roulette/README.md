# Handoff: Richmond Walk Roulette

## Overview

Richmond Walk Roulette is a small, focused web tool: pick a start location in downtown Richmond, set a walking-distance range, and spin a roulette wheel to get a random destination from a curated list of POIs that fit your range. Inspired by the layout convention of "spinner + map + details" — a quiet, civic, utilitarian aesthetic.

Three core interactions:
1. **Configure** — set start location, distance range (with round-trip toggle), terrain, and vibe filters
2. **Spin** — wheel rotates ~4s and lands on a random eligible POI
3. **Decide** — see distance, walk time, blurb; open route in Google Maps, or reroll

## About the Design Files

The files under `prototype/` are **design references created in HTML/JSX with React + Babel inline transpilation**. They are working prototypes that show intended look, behavior, and interactions — but they are **not production code to copy directly**. Babel-in-browser, `window.*` globals for component sharing, and inline scripts are prototype scaffolding, not production patterns.

The task is to **recreate these designs in the target codebase's environment** using its established patterns and libraries. If no environment exists yet, the recommended stack is **React + Vite + TypeScript** with a real bundler — the prototype maps 1:1 onto a standard React component tree, no exotic dependencies are needed.

For mapping, the prototype uses a hand-drawn stylized SVG of downtown Richmond. In production you can either:
- Keep the stylized SVG (simplest, on-brand, no API key)
- Swap in a real tile map (Mapbox / MapLibre / Leaflet) using the same POI coordinate model

## Fidelity

**High-fidelity.** Final colors, typography, spacing, and interactions are settled. Recreate pixel-perfectly using the codebase's existing libraries/components where they map cleanly (buttons, selects, range sliders, toggles, chips). Where the codebase has no equivalent (the curved-arc wheel, the stylized SVG map), implement to match the prototype.

## Screens / Views

Single-page application. Layout is a CSS grid with three rows (header / controls / main) and a two-column main area.

### 1. Header

- **Purpose**: brand + global actions
- **Layout**: full-width strip, `padding: 14px 22px`, `border-bottom: 1px solid var(--rule)`, `background: var(--paper)`. Flex row, space-between alignment.
- **Left cluster** (`.brand`):
  - `<h1>` "RICHMOND WALK ROULETTE" — Inter Tight, 16px, 700, `letter-spacing: 0.18em`, uppercase
  - Tag "v1 · downtown · 4-mile radius" — JetBrains Mono, 11px, `--ink-soft`, `letter-spacing: 0.08em`
- **Right cluster** (`.actions`):
  - Weather pill (text, JetBrains Mono 11px) — content is editable via Tweaks; default "67°F · partly cloudy · great for walking"
  - **Share** button (`.btn.ghost`) — writes current state to URL hash and copies link to clipboard, shows toast "LINK COPIED"

### 2. Controls bar

- **Purpose**: filter the wheel
- **Layout**: CSS grid, 5 columns:
  `minmax(180px, 1fr) minmax(260px, 1.4fr) minmax(140px, auto) minmax(200px, 1fr) minmax(240px, 1fr)`
- Each cell `.control`: `padding: 10px 18px`, `border-right: 1px solid var(--rule-soft)` (last cell no border), flex column with 6px gap
- Each cell has a `.label` (mono, 10px, uppercase, `--ink-soft`) above its control

**Cell 1 — Start**
Native `<select>` of preset locations + a special `__custom` option if user has clicked the map. Selecting a preset clears any custom pin. List of presets:
`Monroe Park, Siegel Center, VMFA, Carytown, Capitol Square, Maymont, Belle Isle, Libby Hill, Manchester, Scott's Addition`

**Cell 2 — Distance**
Dual-handle range slider, min 0, max 8, step 0.25 mi. Label dynamically reads "Distance (round-trip, miles)" or "Distance (one-way, miles)" based on the round-trip toggle. Numeric readout left and right of the track. Implementation: two stacked `<input type="range">` with `pointer-events: none` on the track and `pointer-events: auto` on the thumbs; rail is 1px `--rule`, filled section is 3px `--ink`. Thumbs are 14px circles with 2px `--ink` border.

**Cell 3 — Round trip**
A custom toggle. When ON, the distance range applies to the round-trip total (out + back). When OFF, it applies to the one-way distance.

**Cell 4 — Difficulty**
Single-select chip group: `Any / Flat / Hilly`. Active chip has `--ink` background and `--paper` text.

**Cell 5 — Vibe**
Multi-select chip group: `River / Park / Museum / History / Food / Scenic`. POI must have at least one matching tag if any chips are active.

### 3. Main split

Two columns: `1.05fr 1fr`. Min-height: 0 so children can scroll/clip cleanly.

#### 3a. Wheel pane (left)

- **Purpose**: the destination spinner
- Background `--paper`, `border-right: 1px solid var(--rule)`, `position: relative`, `overflow: hidden`
- Pane labels (top-left and top-right) in mono 11px:
  - Left: "DESTINATIONS"
  - Right: "{N} of {total} fit" where N = eligible count, total = `POIS.length`
- **The wheel itself** — full-bleed SVG, `viewBox="0 0 720 800"`, `preserveAspectRatio="xMidYMid meet"`. See "Curved-arc wheel" section below for full geometry.
- **Empty state** — when no POIs match: centered text block, "No matches" (22px, 600) over "WIDEN THE RANGE OR CLEAR FILTERS" (mono 12px, uppercase)
- **Spin button** — fixed at bottom, centered:
  - `position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%)`
  - `.btn.primary`: `--highlight` (#b6332a) bg, white text, no border-radius, `padding: 14px 28px`, `font-size: 13px`, `min-width: 200px`
  - Label: "Spin" → "Spinning…" while animating → "Spin Again" after first pick
  - Disabled when spinning or no eligible POIs

#### 3b. Right column

CSS grid, `grid-template-rows: 1fr auto`. Top is the map, bottom is the result panel.

##### Map pane

- Same pane chrome as wheel pane: top-left mono label "MAP", top-right mono meta showing start + arrow + destination uppercase
- Full-bleed `<svg viewBox="0 0 900 700">` — see "Map" section below
- Cursor `crosshair` over the SVG to telegraph clickability
- Clicking anywhere converts pixel coords → mile coords (relative to Monroe Park) and sets a "custom" start location with the formatted label `Custom (x.x, y.y)`

##### Result pane

- `padding: 18px 22px`, `border-top: 1px solid var(--rule)`, `background: --paper`, `min-height: 132px`
- **Empty state**: single line of mono 12px uppercase text in `--ink-soft`:
  - "SPINNING THE WHEEL…" while spinning
  - "ADJUST YOUR FILTERS TO POPULATE THE WHEEL" when 0 eligible
  - "HIT SPIN TO PICK FROM {N} DESTINATIONS" otherwise
- **Populated state**: 2-column grid (`1fr auto`)
  - Left column:
    - `<h2>` POI name — 28px, 700, line-height 1.05, `letter-spacing: -0.01em`
    - Blurb — 14px, `--ink-soft`, max-width 52ch
    - Stats row (24px gap, wrap):
      - Distance — `{total} mi` + "round trip" or "one way"
      - Walk time — `{n} min` or `{h} hr {m} min` (3 mph)
      - Terrain — capitalized difficulty
      - From — start location name
    - Each stat is a `.stat` with mono 10px uppercase label above 16px 600 value
  - Right column (`.result-actions`, min-width 200px, flex column 8px gap):
    - **Open in Maps** (`.btn`) — opens `https://www.google.com/maps/dir/?api=1&origin=...&destination=...&travelmode=walking` in new tab with `{POI name} Richmond VA` encoded
    - **Reroll** (`.btn.ghost`) — same as Spin
    - **Clear** (`.btn.ghost`) — resets `selectedId` and `rotation` to 0

## The Curved-Arc Wheel

Geometric constants (see `wheel.jsx`):

```js
const WHEEL_VB_W = 720;   // viewBox width
const WHEEL_VB_H = 800;   // viewBox height
const CX = -180;          // circle center x (off-screen left)
const CY = 400;           // circle center y
const R = 820;            // radius (huge so visible arc is gently curved)
const VISIBLE_HALF = 28;  // degrees above/below indicator we render
const MIN_FILLED = 48;    // minimum slots to fill around the wheel
const INDICATOR_X = CX + R; // 640 — sits inside the viewBox
```

**Why a giant off-screen radius**: visible labels appear nearly horizontal with a slight per-label tilt (matching the reference site). Each label is rotated by its angular position; with a huge R and small visible arc, tilts are small.

**The fill-and-cycle mechanic** (this matters):
- Take the alphabetically-sorted eligible POI list (length N).
- Compute `reps = ceil(MIN_FILLED / N)` and build a `filled` array repeating the POIs `reps` times. So 5 POIs → 10 reps → 50 slots; 1 POI → 48 reps → 48 slots.
- `step = 360 / filled.length`
- Each slot sits at base angle `i * step`. With current rotation applied, effective angle is `i * step + rotation` normalized to (-180, 180].
- Render only slots with `|theta| <= VISIBLE_HALF`.
- This is what fixes the bug where a small filtered list left huge empty arcs while spinning.

**Indicator**:
- Horizontal line from `(CX + R - 80, CY)` to `(INDICATOR_X + 12, CY)`, 1px `--rule`
- Filled circle (r=6) at `(INDICATOR_X + 12, CY)`, fill `--highlight`

**Label rendering** (per visible slot):
- Position: `translate(CX + R*cos(θ), CY + R*sin(θ))` then `rotate(θ)` (θ in degrees)
- Text `text-anchor="end"`, `x=-8 y=6` — so the right edge of the label sits ~8px left of the radial point
- Font Inter Tight 19px, weight 500, fill `--ink-soft`
- Selected label: weight 700, fill `--highlight`, plus a `--paper`-colored rounded-rect background behind it (width based on `name.length * 13 + 22`)

**Selection logic**:
- The wheel determines the "selected" filled-slot as: the slot with smallest `|theta|`, preferring slots whose `poi.id === pickedId` if a pick is locked in.
- When idle (no pick yet), this means the slot at the indicator is visually highlighted as you scroll/rotate.

**Spin animation**:
- Pick random target POI index `targetIdx` (uniform over N).
- Pick random rep `repToUse` (uniform over `reps`).
- `filledIdx = repToUse * N + targetIdx`
- `targetBase = filledIdx * step`
- Final rotation = `-targetBase + (4 + random*2) * 360` (4–6 full extra turns)
- Animate `rotation` from current to final over **4200ms** with quartic ease-out `1 - (1-t)^4` via `requestAnimationFrame`.
- On completion: set `selectedId = picked.id`, set `spinning = false`, persist state to URL hash.

## The Stylized SVG Map

Constants (see `map.jsx`):

```js
const MAP_VB_W = 900;
const MAP_VB_H = 700;
const MAP_OX = 440;   // Monroe Park's SVG x
const MAP_OY = 360;   // Monroe Park's SVG y
const MAP_SCALE = 80; // SVG units per mile
```

Coordinate model: every POI and start location has `{x, y}` in **miles east/north of Monroe Park**, derived from real lat/lng (1° lat ≈ 69 mi; 1° lng at 37.5° ≈ 54.8 mi). Convert with:
```js
svgFor(p) → { sx: MAP_OX + p.x * MAP_SCALE, sy: MAP_OY - p.y * MAP_SCALE }
```
Note the y is negated — SVG y grows downward but our mile-y is north.

**Layers (bottom to top)**:
1. Background — full-bleed `<rect>` fill `--land` (#ece6d4)
2. **James River** — single closed `<path>` filled `--river` (#c8d6db). Curves from upper-west (entering ~(-20, 330)) down to lower-east (exiting ~(920, 502)) with width 50–70 SVG units. See `RIVER_PATH` in `map.jsx`.
3. **Islands** — three `<path>` shapes filled with `--land` (carving out of the river): Belle Isle (large, center), Brown's Island (smaller, upstream/north), Mayo Island (small, downstream/east)
4. **Bridges** — 5 dashed lines (stroke #aab1a4, 1.4px, dasharray "3 2") crossing the river at Boulevard / Lee / T. Pott pedestrian / Manchester / Mayo bridge positions
5. **Streets** — 4 horizontal lines (Broad, [unlabeled], Main, Cary) and 5 vertical (Belvidere + 4 unlabeled), 1px `--rule`. The Broad and Main lines get `.major` class (1.4px, #c9c0ab).
6. **Parks** — 6 small organic blob `<path>` fills `--park` (#d6dcc4): Maymont, Hollywood, Byrd Park, Forest Hill, Chimborazo, Capitol
7. **Neighborhood labels** — 10 mono 9px uppercase labels (`letter-spacing: 0.18em`, opacity 0.55) placed at neighborhood centroids. Hidden when the Tweaks toggle is off.
8. **Walking-radius rings** — two dashed circles around `startLocation`, radii `(minOneWay / WALK_FACTOR) * MAP_SCALE` and `(maxOneWay / WALK_FACTOR) * MAP_SCALE`. `WALK_FACTOR = 1.25` accounts for grid-walk vs straight-line distance.
9. **Route** — when a destination is picked, a quadratic Bézier from start to destination with a perpendicular offset (= `min(40, len * 0.18)`). Stroke `--highlight` 2.4px, dasharray "5 4".
10. **POI dots** — every POI gets a `<circle>` r=3.5 with `--paper` fill, `--ink-soft` 1.2px stroke. Ineligible POIs get `.dim` (stroke #c4bcaa). Selected destination is r=6 with `--highlight` fill+stroke.
11. **Start pin** — r=7 filled `--pin` (#2a4d56) with 2.5px `--paper` stroke
12. **Destination callout** — solid `--highlight` rect with white text label, anchored to the right of the destination dot, auto-flipping leftward if it would cross the right edge of the map

## Interactions & Behavior

**Filtering** (live, recomputes the wheel and dot opacity instantly):
- A POI is **eligible** iff:
  1. Distance from `start` to POI (one-way × walk-factor) fits the range, doubled if `roundTrip`
  2. `difficulty === "any"` OR `poi.difficulty === difficulty`
  3. `tags` set is empty OR `poi.tags` intersects `tags`

**Spin**:
- Disabled if `spinning` or `wheelPois.length === 0`
- See "Spin animation" above
- Body class `.spinning` disables pointer events on the wheel SVG

**Map click**:
- Always converts to mile coords and sets a custom start location named `Custom (x.x, y.y)`
- Resets `selectedId` and `rotation`

**Filter change → invalidate pick**:
- If filters change such that the currently-picked POI is no longer eligible, clear `selectedId` and reset `rotation` to 0.

**Open in Maps**:
- Build Google Maps directions URL with walking mode, using `${start.name} Richmond VA` and `${poi.name} Richmond VA` as encoded origin/destination strings.

**Share link**:
- Encodes `{start, custom, range, rt, diff, tags, pick}` as a URL-encoded JSON string in `location.hash` (e.g. `#s=%7B...%7D`)
- Clipboard write + 1.8s toast
- On page load, hash is parsed and state is restored.

**Animations**:
- Spin: 4200ms, ease-out quartic
- Toggle switch: 150ms ease
- Chip hover: 120ms color/background
- Toast: 200ms in (no out; removed after 1800ms)

## State Management

All state in the top-level `<App>` component (React `useState` / `useEffect` / `useMemo` / `useRef` / `useCallback`):

| State | Type | Notes |
|---|---|---|
| `startId` | string | Preset location id |
| `customStart` | `{id, name, x, y}` or null | Set when user clicks map; takes precedence over `startId` |
| `range` | `[number, number]` | Distance min/max in miles |
| `roundTrip` | boolean | |
| `difficulty` | `"any" \| "flat" \| "hilly"` | |
| `timeOfDay` | string | Reserved; not yet wired |
| `tags` | `Set<string>` | Selected vibe filter chips |
| `rotation` | number (degrees) | Current wheel rotation |
| `spinning` | boolean | Animation in progress |
| `selectedId` | string or null | Picked POI; null until first spin or after Clear |
| `toast` | string or null | Toast message; auto-cleared after 1.8s |

**Tweaks state** (in `tweaks-panel.jsx` `useTweaks` hook):
- `accent` (color) — drives `--highlight` CSS variable
- `paper` (color) — drives `--paper`
- `showNeighborhoods` (bool)
- `showRoute` (bool)
- `weather` (string) — header pill copy

Persisted via the host's `__edit_mode_set_keys` message protocol; in production, replace with whatever your app's settings/feature-flag system is.

**No backend / no data fetching**. POI data is static.

## Design Tokens

```css
:root {
  --bg:           #f3efe6;  /* page background, warmer than paper */
  --paper:        #faf7ee;  /* card / pane background */
  --ink:          #1c1c1a;  /* primary text */
  --ink-soft:     #4a4843;  /* secondary text */
  --rule:         #d8d2c2;  /* dividers, default */
  --rule-soft:    #e6e0cf;  /* dividers, subtler */
  --river:        #c8d6db;  /* James River fill */
  --river-deep:   #8aa5ad;  /* river edge */
  --land:         #ece6d4;  /* map land fill */
  --park:         #d6dcc4;  /* parks/cemeteries fill */
  --highlight:    #b6332a;  /* Richmond flag red — primary CTA + picks */
  --highlight-soft:#e8c4bf;
  --pin:          #2a4d56;  /* start-location pin */
  --pin-soft:     #6e8a91;

  --font-sans: "Inter Tight", "Helvetica Neue", Helvetica, Arial, sans-serif;
  --font-mono: "JetBrains Mono", "Courier New", monospace;
}
```

**Type scale**:
- `h1` (header brand): 16px / 700 / `letter-spacing: 0.18em` / uppercase
- `h2` (result name): 28px / 700 / `letter-spacing: -0.01em` / `line-height: 1.05`
- Body: 14px / 400
- Stat value: 16px / 600
- Wheel label: 19px / 500 (700 when selected)
- Map neighborhood label: 9px mono / `letter-spacing: 0.18em` / uppercase / opacity 0.55
- Mono micro-label (`.label`): 10px / `letter-spacing: 0.12em` / uppercase
- Tag / meta mono: 11px / `letter-spacing: 0.06–0.08em`
- Chip / button label: 12px / 600 / `letter-spacing: 0.14em` / uppercase

**Spacing scale** (no formal scale; observed values):
- Cell padding: 10px / 18px
- Header padding: 14px / 22px
- Result pane padding: 18px / 22px
- Section gap (stats): 24px
- Inline gap (label/value, chips): 4–8px
- Button padding: 8px 14px (default), 14px 28px (spin)

**Borders**: 1px solid `--rule` or `--rule-soft`. No border-radius anywhere except:
- 50% on toggle, range thumbs, POI/indicator dots
- 999px on chips
- 2px on the wheel's selected-label background

**Shadows**: none. Aesthetic is flat/paper.

## Asset / Library Notes

**Fonts** (Google Fonts):
- Inter Tight: 400, 500, 600, 700
- JetBrains Mono: 400, 500

**No icons used.** The design intentionally avoids decorative iconography.

**No real map tiles.** The map is a hand-drawn stylized SVG. In production, either keep it as-is (recommended for the aesthetic) or swap to MapLibre/Leaflet with a custom muted tile style. If swapping, the `svgFor` / `svgToMiles` coordinate model needs replacing with a real geographic projection — POIs have logical (x, y) mile offsets, but their underlying lat/lng can be reconstructed from Monroe Park (37.5479, -77.4502).

## Production Notes & Suggestions

1. **POI dataset** — the prototype seeds 34 POIs (`pois.js`). The data is real lat/lng-derived and curated. In production, consider storing in a JSON file or DB and admin-editing.
2. **Walking distance** — prototype uses Euclidean × 1.25. For real production, swap in a routing API (Mapbox Directions, Google Routes, or self-hosted OSRM) for accurate walking distance + actual route geometry.
3. **Weather pill** — prototype is static editable text. Wire to a real weather API (OpenWeatherMap, weather.gov for VA) when implementing.
4. **Time-of-day filter** — declared in state but not yet wired. Designed in the original spec; the chip group implementation is straightforward (single-select like difficulty).
5. **Address search** — declared in the original spec (start-location autocomplete) but the prototype only ships dropdown + map-click. Add a search input with autocomplete using a geocoding API.
6. **Mobile** — there's a basic media query at 900px that stacks the panes vertically. A real mobile pass should redesign the controls bar as a sheet/drawer and the wheel as a vertical scroll picker.
7. **Accessibility** — the prototype is mouse/keyboard-functional but not screen-reader audited. The SVG wheel and map need ARIA labels, the chip groups need `role="radiogroup"` / `role="group"`, and the toggle switch needs `role="switch"`.
8. **State in URL** — the prototype puts state in `location.hash`. Production should likely use search params and integrate with the app's routing.

## Files

Inside `prototype/`:
- `index.html` — entry point; loads React 18 UMD + Babel standalone, then the JSX files in order
- `styles.css` — all styles (no preprocessor)
- `pois.js` — POI data + distance helper. `window.POIS`, `window.START_LOCATIONS`, `window.distanceTo`, `window.WALK_FACTOR`
- `map.jsx` — `RichmondMap` component + SVG geometry constants
- `wheel.jsx` — `Wheel` component + `wheelLayout` helper for spin targeting
- `app.jsx` — main `App`, state management, controls, result panel, sub-components (`RangeSlider`, `ChipGroup`)
- `tweaks-panel.jsx` — host-provided helper for the floating settings panel; can be replaced with the app's own settings UI in production

To preview the prototype, open `prototype/index.html` in a browser (it needs internet for the React/Babel CDN and Google Fonts; no local server required).
