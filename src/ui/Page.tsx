import { useEffect, useId, useRef, type ReactNode } from "react";
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
  const root = useRef<HTMLDivElement>(null);
  const onClose = useRef(props.onClose);
  useEffect(() => {
    onClose.current = props.onClose;
  });
  useEffect(() => {
    root.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose.current();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div
      ref={root}
      tabIndex={-1}
      className="page win"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <header className="bar">
        <span className="dots" aria-hidden="true">
          <i className="dot" />
          <i className="dot" />
        </span>
        <h2 id={titleId} className="title">
          {props.title}
        </h2>
        <button
          type="button"
          className="close"
          aria-label="close"
          onClick={() => {
            playTap(false);
            props.onClose();
          }}
        >
          ×
        </button>
      </header>
      <div className="page-body">{props.children}</div>
      {props.footer !== undefined && (
        <div className="page-foot">{props.footer}</div>
      )}
    </div>
  );
}
