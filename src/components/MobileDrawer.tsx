import { useState, type ReactNode } from "react";

type Props = {
  /** Label shown on the handle when the drawer is collapsed. */
  label?: string;
  children: ReactNode;
};

/**
 * Bottom-sheet drawer that mounts at any viewport but is only made visible
 * by CSS at the mobile breakpoint (<900px). Two states:
 *  - peek: just the handle is showing, body is offscreen below
 *  - open: drawer slid up, body content visible
 *
 * Used to compress the controls bar on mobile so the map + wheel + result
 * can claim more vertical real estate. The handle stays tappable in both
 * states; tapping toggles open/peek. Desktop renders this as display:none
 * so the existing top-bar controls layout is unchanged.
 */
export function MobileDrawer({ label = "Filters", children }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className={"mobile-drawer" + (open ? " open" : "")}>
      <button
        type="button"
        className="mobile-drawer-handle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="mobile-drawer-content"
      >
        <span className="mobile-drawer-grip" aria-hidden />
        <span className="mobile-drawer-label">
          {open ? "Done" : label}
        </span>
      </button>
      <div
        id="mobile-drawer-content"
        className="mobile-drawer-content"
        // Hide from screen readers when collapsed so they don't see
        // duplicate controls. Sighted users can't reach them anyway.
        aria-hidden={!open}
      >
        {children}
      </div>
    </div>
  );
}
