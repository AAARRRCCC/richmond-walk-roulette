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

- [ ] **Result-pane action stack is ugly when the pane is short.**
      "Open in Maps / Reroll / Clear" are stacked vertically with
      200px min-width. On wide screens, an inline row with smaller
      buttons would feel tighter. On narrow screens, keep stacked.

### Polish — mobile

- [ ] **<900px breakpoint is half-baked.** Stacks wheel + map but
      doesn't re-tune anything: wheel pane is cramped, chips wrap
      awkwardly, controls bar is too tall (it stacks 5 cells into
      2 columns × 3 rows). A real mobile pass:
      - Controls bar collapses to a drawer/sheet behind a button
      - Wheel becomes a tap-friendly vertical picker OR keeps SVG
        but at a fixed height that doesn't squeeze
      - Result pane stays full-width at the bottom

### Accessibility

- [ ] **Color contrast on `.ink-soft` (#4a4843) against `--paper`**
      reads at ~9:1 which is fine, but the dim variants used in
      ineligible POI strokes (#c4bcaa on #faf7ee) are below 3:1.
      Probably acceptable for decorative shapes; flag if any
      a11y audit complains.

### Performance + quality

- [ ] **`no-cascading-set-state`** still flagged in RichmondMap
      feature-state useEffect (3 setStates). After the layer-sync
      refactor in a future iter, may need to be folded into one
      effect with computed state.
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
