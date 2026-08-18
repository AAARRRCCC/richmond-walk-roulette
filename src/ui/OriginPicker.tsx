import { useEffect, useRef, useState } from "react";
import { CaretDownIcon, CrosshairIcon, MapPinIcon } from "@phosphor-icons/react";
import { PRESET_ORIGINS, type Origin } from "../data/places";

export type OriginPickerProps = {
  origin: Origin;
  pickingOrigin: boolean;
  locating: boolean;
  onSelect: (origin: Origin) => void;
  onBeginPickOnMap: () => void;
  onUseMyLocation: () => void;
};

export function OriginPicker(props: OriginPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="origin" ref={rootRef}>
      <span className="field-label">Starting from</span>
      <button
        type="button"
        className="origin-chip"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        <MapPinIcon size={17} weight="fill" aria-hidden="true" />
        <span className="origin-name">{props.origin.name}</span>
        <CaretDownIcon size={13} weight="bold" aria-hidden="true" className="origin-caret" />
      </button>

      {open && (
        <div className="origin-menu" role="menu">
          <button
            type="button"
            role="menuitem"
            className="origin-action"
            disabled={props.locating}
            onClick={() => {
              props.onUseMyLocation();
              setOpen(false);
            }}
          >
            <CrosshairIcon size={15} aria-hidden="true" />
            {props.locating ? "Locating..." : "Use my location"}
          </button>
          <button
            type="button"
            role="menuitem"
            className="origin-action"
            onClick={() => {
              props.onBeginPickOnMap();
              setOpen(false);
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
                  role="menuitem"
                  className="origin-option"
                  aria-current={preset.id === props.origin.id}
                  onClick={() => {
                    props.onSelect(preset);
                    setOpen(false);
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
          Click the map to set your start, or drag the pin.
        </p>
      )}
    </div>
  );
}
