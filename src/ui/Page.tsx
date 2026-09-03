import { useEffect, useId, useRef, type ReactNode } from "react";
import { XIcon } from "@phosphor-icons/react";
import { playTap } from "../lib/sound";

export type PageProps = {
  title: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
};

/** A full-height page over the map and sheet, for a drawer's worth of controls on a phone. */
export function Page(props: PageProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const onClose = useRef(props.onClose);
  useEffect(() => {
    onClose.current = props.onClose;
  });
  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div
      className="page"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <header className="page-head">
        <h2 id={titleId} className="field-label">
          {props.title}
        </h2>
        <button
          ref={closeRef}
          type="button"
          className="icon-button"
          aria-label="Close"
          onClick={() => {
            playTap(false);
            props.onClose();
          }}
        >
          <XIcon size={16} weight="bold" aria-hidden="true" />
        </button>
      </header>
      <div className="page-body">{props.children}</div>
      {props.footer !== undefined && (
        <div className="page-foot">{props.footer}</div>
      )}
    </div>
  );
}
