import { playPress } from "../lib/sound";
import { locateActionLabel, type PermissionHint } from "../lib/locate";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CaretDownIcon,
  CrosshairIcon,
  MapPinIcon,
} from "@phosphor-icons/react";
import { PRESET_ORIGINS, type Origin } from "../data/places";

export type OriginPickerProps = {
  origin: Origin;
  pickingOrigin: boolean;
  locating: boolean;
  /** A hint for the label, never a gate. */
  permissionHint: PermissionHint;
  onSelect: (origin: Origin) => void;
  onBeginPickOnMap: () => void;
  onCancelPickOnMap: () => void;
  onUseMyLocation: () => void;
  /** Phone layout: the chip opens a page instead of a dropdown. */
  onOpenPage?: (() => void) | undefined;
};

export type OriginMenuProps = Pick<
  OriginPickerProps,
  | "origin"
  | "locating"
  | "permissionHint"
  | "onSelect"
  | "onBeginPickOnMap"
  | "onUseMyLocation"
> & { onDone: () => void };

/** The picker's choices: locate, drop a pin, or a landmark. Shared by the dropdown and the page. */
export function OriginMenu(props: OriginMenuProps) {
  return (
    <>
      <button
        type="button"
        className="origin-action"
        disabled={props.locating}
        onClick={() => {
          playPress();
          props.onUseMyLocation();
          props.onDone();
        }}
      >
        <CrosshairIcon size={15} aria-hidden="true" />
        {props.locating
          ? "Locating..."
          : locateActionLabel(props.permissionHint)}
      </button>
      <button
        type="button"
        className="origin-action"
        onClick={() => {
          props.onBeginPickOnMap();
          props.onDone();
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
                props.onDone();
              }}
            >
              {preset.name}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

// A labelled group of plain buttons, not an ARIA menu: `menuitem` does not
// support `aria-current` and promises arrow navigation this does not have.
export function OriginPicker(props: OriginPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    // Only when closed from inside; an outside click keeps its own focus target.
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const root = rootRef.current;
    const onPointerDown = (event: PointerEvent) => {
      const inside =
        event.target instanceof Node && root?.contains(event.target);
      if (!inside) close(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(true);
    };
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      // Null means focus left the document, which is a window switch.
      if (next === null || (next instanceof Node && root?.contains(next)))
        return;
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
        aria-busy={props.locating}
        onClick={() =>
          props.onOpenPage ? props.onOpenPage() : setOpen((value) => !value)
        }
      >
        <MapPinIcon size={17} weight="fill" aria-hidden="true" />
        <span className="origin-name">{props.origin.name}</span>
        <CaretDownIcon
          size={13}
          weight="bold"
          aria-hidden="true"
          className="origin-caret"
        />
      </button>

      {open && (
        <div className="origin-menu" role="group" aria-label="Starting point">
          <OriginMenu {...props} onDone={() => close(true)} />
        </div>
      )}

      {props.pickingOrigin && (
        <p className="origin-hint" role="status">
          Click the map to set your start, or drag the pin. Escape cancels.{" "}
          <button
            type="button"
            className="link-button"
            onClick={props.onCancelPickOnMap}
          >
            Cancel
          </button>
        </p>
      )}
    </div>
  );
}
