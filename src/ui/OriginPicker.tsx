import { playPress } from "../lib/sound";
import { locateActionLabel, type PermissionHint } from "../lib/locate";
import { useCallback, useEffect, useRef, useState } from "react";
import { CaretDownIcon, CrosshairIcon, MapPinIcon } from "@phosphor-icons/react";
import { PRESET_ORIGINS, type Origin } from "../data/places";

export type OriginPickerProps = {
  origin: Origin;
  pickingOrigin: boolean;
  locating: boolean;
  /** What the Permissions API says, if anything. A hint for the label, never a gate. */
  permissionHint: PermissionHint;
  onSelect: (origin: Origin) => void;
  onBeginPickOnMap: () => void;
  onCancelPickOnMap: () => void;
  onUseMyLocation: () => void;
};

/**
 * The popup is a labelled group of plain buttons, not an ARIA menu.
 *
 * It used to claim `role="menu"` with `menuitem` children, which promises
 * arrow navigation, a single tab stop and focus management none of it had -
 * and `aria-current` is not a state `menuitem` supports, so the selected
 * preset was invisible to a reader. Buttons in a group are already tabbable
 * and Enter-activatable, which is the whole of what this needs. What is left
 * is the part that was genuinely missing: focus goes back to the trigger on
 * every close the reader caused, and tabbing out of the group closes it
 * rather than leaving it open behind them.
 */
export function OriginPicker(props: OriginPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    // Only when the reader closed it from inside. Stealing focus back on an
    // outside click would fight whatever they were reaching for.
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    const onPointerDown = (event: PointerEvent) => {
      const inside = event.target instanceof Node && root?.contains(event.target);
      if (!inside) close(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(true);
    };
    // Pointerdown alone left the menu open behind a reader who tabbed past the
    // last preset. Focus moving out of the group is the same intent.
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      // Null means focus left the document entirely, which is a window
      // switch, not a dismissal.
      if (next === null || (next instanceof Node && root?.contains(next))) return;
      close(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    root?.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      root?.removeEventListener("focusout", onFocusOut);
    };
  }, [open, close]);

  return (
    <div className="origin" ref={rootRef}>
      <span className="field-label">Starting from</span>
      <button
        type="button"
        ref={triggerRef}
        className="origin-chip"
        aria-expanded={open}
        aria-haspopup="true"
        // The press closes the popup, so the action's own label is gone by the
        // time the call is in flight. The chip is what is left on screen, and a
        // reader deserves to know it is waiting on something.
        aria-busy={props.locating}
        onClick={() => setOpen((value) => !value)}
      >
        <MapPinIcon size={17} weight="fill" aria-hidden="true" />
        <span className="origin-name">{props.origin.name}</span>
        <CaretDownIcon size={13} weight="bold" aria-hidden="true" className="origin-caret" />
      </button>

      {open && (
        <div className="origin-menu" role="group" aria-label="Starting point">
          <button
            type="button"
            className="origin-action"
            disabled={props.locating}
            onClick={() => {
              playPress();
              props.onUseMyLocation();
              close(true);
            }}
          >
            <CrosshairIcon size={15} aria-hidden="true" />
            {props.locating ? "Locating..." : locateActionLabel(props.permissionHint)}
          </button>
          <button
            type="button"
            className="origin-action"
            onClick={() => {
              props.onBeginPickOnMap();
              close(true);
            }}
          >
            <MapPinIcon size={15} aria-hidden="true" />
            Drop a pin on the map
          </button>

          <div className="origin-divider" role="separator" />

          <ul className="origin-list">
            {PRESET_ORIGINS.map((preset) => (
              <li key={preset.id}>
                <button
                  type="button"
                  className="origin-option"
                  aria-current={preset.id === props.origin.id}
                  onClick={() => {
                    props.onSelect(preset);
                    close(true);
                  }}
                >
                  {preset.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {props.pickingOrigin && (
        <p className="origin-hint" role="status">
          Click the map to set your start, or drag the pin. Escape cancels.{" "}
          <button type="button" className="link-button" onClick={props.onCancelPickOnMap}>
            Cancel
          </button>
        </p>
      )}
    </div>
  );
}
