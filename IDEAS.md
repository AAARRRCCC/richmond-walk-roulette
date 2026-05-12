# Walk Roulette — improvement backlog

Issues for the autonomous improvement loop to work through, roughly
by priority. Top-down order is rough preference, not strict.

- New ideas go anywhere; the loop re-reads this file each iteration.
- Items get checked off as they ship.
- Shipped items move to the "Done" section with the commit SHA.
- Off-limits without explicit user OK: `src/data/pois.ts`, spin
  animation timing/easing, share-state shape.

## Open

### High impact

- [ ] **App.tsx still 423 lines** even after the filter-reducer
      pass. `prefer-useReducer` is still flagged (6 remaining useState
      for animation + UI state). To fully clear, either extract a
      sub-component (e.g. `<WheelPane>` owns rotation/spinning/etc.)
      or fold animation state into a second reducer. Lower priority
      than the perf/a11y items.

### Polish — desktop


### Polish — mobile

- [ ] **Controls drawer/sheet on mobile** (future). Iter 22 fixed
      the worst squeeze (panes have min-heights, single-col controls
      at <600px) but didn't redesign the controls UI itself. A real
      mobile pass would hide the controls behind a "Filter" button
      and show them in a slide-up sheet.

### Accessibility

- [ ] **Color contrast on `.ink-soft` (#4a4843) against `--paper`**
      reads at ~9:1 which is fine, but the dim variants used in
      ineligible POI strokes (#c4bcaa on #faf7ee) are below 3:1.
      Probably acceptable for decorative shapes; flag if any
      a11y audit complains.

### Performance + quality

- [ ] **`rerender-state-only-in-handlers`** flag in RichmondMap on
      the `loaded` flag — false positive (it IS read in dependent
      hooks, not in JSX). If react-doctor adds a way to suppress
      per-rule, do that; otherwise live with it.

## Done

(Shipped items append here with the iteration commit SHA.)

- `fbac414` — Vendor audit skills from Owl-Listener/designer-skills
- `c5d864e` — Seed IDEAS.md backlog
- `e3bf098` — Focus styles + keyboard-operable toggle
- `d0b0e17` — Wheel-edge label fade
- `efb0447` — Remove unused isRoutesApiConfigured export
- `3168734` — Toast position no longer occludes result-pane stats
- `20267f1` — Collapse filter state into a reducer (score 96→97)
- `b1c7822` — Subtle 1px chrome rule under pane labels
- `830d459` — Start-pick restyled as a chip-pill
- `ec27613` — aria-live announcement on pick + aria-busy on wheel
- `6eb1018` — Code-split MapLibre (main bundle 273→54 KB gzipped)
- `d02b8b4` — Real <label> pairing for Start dropdown
- `b47b6c3` — Group label (role=group + aria-labelledby) for range slider
- `b398cd0` — Touch tap-target sizes via @media (pointer: coarse)
- `f33f283` — Defer MapLibre chunk via IntersectionObserver
- `60e63fe` — Screen-reader POI list (keyboard equivalent of map clicks)
- `c9ffde5` — Extract <MapPane> sub-component (App.tsx 455→432 lines)
- `c51a957` — Verified MAP label / attribution overlap is not a real bug
- `6d1f429` — Verified result-pane action stack is not actually ugly
- `fec7db5` — Extract <WheelPane> sub-component (App.tsx 432→409 lines)
- `f055f0b` — Drop dead setLoaded(false) in RichmondMap unmount (score 97→98)
- `43e3219` — Mobile breakpoint pass (pane min-heights, 1-col controls)
- `5d92ba6` — Discoverability title attrs on ambiguous controls
- `f821155` — Empty-wheel Clear Filters action button
- `ad12d4c` — Document idle-state destination tracking as intentional
- `011ef8c` — Bound the walking-route cache (LRU, limit 50)
- `6e318fc` — Open in Maps uses precise lat/lng instead of name geocoding
- `0cf83b2` — Dedupe share-state payload (3 inline literals → 1 builder)
- `716e060` — Clear walkingRoute eagerly to avoid stale-route flash
- `b22d3c5` — Error boundary around the lazy map chunk
- `5846fff` — Cancel previous toast clear-timer on re-trigger
- `f95fd8b` — Single CLEAR_FILTERS reducer action (was 3 dispatches)
