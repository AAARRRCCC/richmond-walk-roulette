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

- [ ] **Bundle size.** MapLibre is ~970 KB / 273 KB gzipped, dominating
      the JS bundle. Code-split it so the header, controls, and wheel
      can paint before MapLibre arrives. Suspense fallback on the map
      pane while it streams in.
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
- [ ] **Map "MAP" label overlaps attribution** on tall narrow panes
      (the OpenFreeMap attribution sits bottom-right; not actually
      colliding most of the time, but the muted gray of the
      attribution gets visually busy near the pane chrome). Verify
      and adjust z-order/positioning.
- [ ] **Start-pick "or pick on map" link feels disconnected from the
      select** — it's small, dashed, off to the left. Consider an
      inline icon button beside the dropdown, or a "pick" mode chip.
- [ ] **Pane labels (DESTINATIONS / MAP) and meta text float at the
      top with no panel chrome,** which works but looks unmoored.
      Try a subtle 1px bottom border on the top 36px of each pane.

### Polish — mobile

- [ ] **<900px breakpoint is half-baked.** Stacks wheel + map but
      doesn't re-tune anything: wheel pane is cramped, chips wrap
      awkwardly, controls bar is too tall (it stacks 5 cells into
      2 columns × 3 rows). A real mobile pass:
      - Controls bar collapses to a drawer/sheet behind a button
      - Wheel becomes a tap-friendly vertical picker OR keeps SVG
        but at a fixed height that doesn't squeeze
      - Result pane stays full-width at the bottom
- [ ] **Tap targets are too small.** Chips are 3px × 8px padding
      (probably ~22px tall total). iOS HIG / WCAG 2.5.5 want ≥ 44px.
      Bump on touch devices via `(pointer: coarse)`.
- [ ] **Range slider thumbs are 14px** — fine on desktop, hard to
      grab on touch. Increase to 22px on coarse pointers.

### Accessibility

- [ ] **Wheel SVG has no accessible name or live region.** When a
      spin completes, screen readers get nothing. Add `aria-live`
      announcement of the picked POI to the wheel pane.
- [ ] **Map has no keyboard-only path to "pick a destination."**
      Mouse users can click POI dots; keyboard users have no
      equivalent. The wheel itself is technically the keyboard
      version of picking, but the map's POI dots should at least
      be skip-linked.
- [ ] **The Start dropdown has no associated `<label>` element** —
      uses an `aria-label` on the select, which is OK, but a real
      label would be better for the form-control pairing.
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
- [ ] **MapLibre is downloaded on every page load** even when the
      map is off-screen on narrow viewports. After the code-split
      lands, defer the import behind an IntersectionObserver on the
      map pane.

## Done

(Shipped items append here with the iteration commit SHA.)

- `fbac414` — Vendor audit skills from Owl-Listener/designer-skills
- `c5d864e` — Seed IDEAS.md backlog
- `e3bf098` — Focus styles + keyboard-operable toggle
- `d0b0e17` — Wheel-edge label fade
- `efb0447` — Remove unused isRoutesApiConfigured export
- `3168734` — Toast position no longer occludes result-pane stats
