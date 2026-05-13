import { useState, type ReactNode } from "react";

type Props = {
  /** Label shown on the handle when the drawer is collapsed. */
  label?: string;
  /** Body content — only visible when the drawer is open. */
  children: ReactNode;
  /** Optional content rendered in the peek strip even when collapsed.
   *  Used on mobile to surface the current result + Spin Again button so
   *  the user doesn't need to open the drawer to act on a pick. */
  peekContent?: ReactNode;
};

/**
 * Bottom-sheet drawer that mounts at any viewport but is only made visible
 * by CSS at the mobile breakpoint (<900px).
 *
 * Two states:
 *  - peek: handle + optional peek strip visible; body offscreen below
 *  - open: drawer slid up, body content visible
 *
 * Tap the handle to toggle. Web Claude flagged that gesture-only drag on
 * iOS Safari fights the browser's bottom-edge gesture, so the
 * tap-the-handle interaction is the primary affordance.
 *
 * Desktop renders this as display:none so the existing top-bar controls
 * layout is unchanged.
 */
export function MobileDrawer({ label = "Filters", children, peekContent }: Props) {
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
      {peekContent && (
        <div className="mobile-drawer-peek" aria-hidden={open}>
          {peekContent}
        </div>
      )}
      {/* aria-hidden + inert together so the closed-drawer body is
          skipped by both screen readers AND keyboard tab navigation.
          Without inert the body is just translated offscreen by the
          parent transform — tab focus would still jump to the duplicate
          Controls there, scrolling the user out of the page. inert is
          well-supported (Chrome 102+, Firefox 112+, Safari 15.5+) but
          React's type doesn't expose it on DetailedHTMLProps yet, so we
          spread it from a typed extras object. */}
      <div
        id="mobile-drawer-content"
        className="mobile-drawer-content"
        aria-hidden={!open}
        {...(open ? {} : ({ inert: "" } as Record<string, string>))}
      >
        {children}
      </div>
    </div>
  );
}
