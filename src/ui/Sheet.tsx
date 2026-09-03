import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

/** Peek shows the head and the bar; half is the tuning state; full is the drawers. */
export type SheetSnap = "peek" | "half" | "full";

export type SheetProps = {
  snap: SheetSnap;
  onSnap: (snap: SheetSnap) => void;
  /** Pixels reserved above the sheet at full, for the status bar and the top sheet. */
  topInset: number;
  head: ReactNode;
  bar: ReactNode;
  className?: string;
  children: ReactNode;
};

const HALF_FRACTION = 0.5;
/** Half always clears the origin chip and the dial, whatever the screen height. */
const HALF_MIN_BODY_PX = 250;
const HALF_MAX_FRACTION = 0.68;
/** Finger travel before a touch is a drag rather than a tap. */
const DRAG_SLOP_PX = 6;
/** px/ms; a flick past this goes with the finger, not the nearest stop. */
const FLICK_VELOCITY = 0.45;

/**
 * A bottom sheet with three stops. The head and bar are drag handles; the body
 * expands the sheet before it scrolls, and collapses it from the top of its
 * scroll. Height is written straight to the element during a drag and settles
 * into React state on release.
 */
/** Past a stop the sheet follows the finger at a quarter of its travel, like a native sheet. */
const withResistance = (height: number, low: number, high: number): number =>
  height > high
    ? high + (height - high) / 4
    : height < low
      ? low - (low - height) / 4
      : height;

export function Sheet(props: SheetProps) {
  const root = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const live = useRef({
    snap: props.snap,
    onSnap: props.onSnap,
    topInset: props.topInset,
  });
  useLayoutEffect(() => {
    live.current = {
      snap: props.snap,
      onSnap: props.onSnap,
      topInset: props.topInset,
    };
  });

  const stops = () => {
    const viewport = window.innerHeight;
    const peek =
      (head.current?.offsetHeight ?? 0) + (bar.current?.offsetHeight ?? 0);
    // The top sheet, when there is one, is the floor on what full leaves uncovered.
    const mirror = document.querySelector(".mirror")?.getBoundingClientRect();
    const inset = Math.max(
      live.current.topInset,
      mirror ? mirror.bottom + 8 : 0,
    );
    return {
      peek,
      half: Math.min(
        Math.round(viewport * HALF_MAX_FRACTION),
        Math.max(peek + HALF_MIN_BODY_PX, Math.round(viewport * HALF_FRACTION)),
      ),
      full: Math.max(peek, viewport - inset),
    };
  };

  const apply = (height: number) => {
    root.current?.style.setProperty("height", `${height}px`);
    document.documentElement.style.setProperty("--sheet-h", `${height}px`);
  };

  // Settle to the current stop on every snap change, resize, or content change in the head or bar.
  useLayoutEffect(() => {
    const settle = () => apply(stops()[live.current.snap]);
    settle();
    const observer = new ResizeObserver(settle);
    if (head.current) observer.observe(head.current);
    if (bar.current) observer.observe(bar.current);
    window.addEventListener("resize", settle);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", settle);
    };
  }, [props.snap, props.topInset]);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let startY = 0;
    let startHeight = 0;
    let lastY = 0;
    let lastT = 0;
    let velocity = 0;
    let mode: "sheet" | "scroll" | null = null;
    let range = stops();

    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      range = stops();
      startY = lastY = touch.clientY;
      lastT = event.timeStamp;
      startHeight = element.getBoundingClientRect().height;
      velocity = 0;
      mode = null;
    };
    const onMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      const travel = startY - touch.clientY;
      if (mode === null) {
        if (Math.abs(travel) < DRAG_SLOP_PX) return;
        const inBody =
          event.target instanceof Node &&
          (body.current?.contains(event.target) ?? false);
        const atTop = (body.current?.scrollTop ?? 0) <= 0;
        mode = !inBody
          ? "sheet"
          : travel > 0
            ? live.current.snap === "full"
              ? "scroll"
              : "sheet"
            : atTop
              ? "sheet"
              : "scroll";
        if (mode === "sheet") element.classList.add("is-dragging");
      }
      if (mode !== "sheet") return;
      event.preventDefault();
      const dt = Math.max(1, event.timeStamp - lastT);
      velocity = (lastY - touch.clientY) / dt;
      lastY = touch.clientY;
      lastT = event.timeStamp;
      apply(withResistance(startHeight + travel, range.peek, range.full));
    };
    const onEnd = () => {
      if (mode !== "sheet") return;
      mode = null;
      element.classList.remove("is-dragging");
      const height = element.getBoundingClientRect().height;
      const order: SheetSnap[] = ["peek", "half", "full"];
      let next: SheetSnap;
      if (Math.abs(velocity) > FLICK_VELOCITY) {
        const index = order.indexOf(live.current.snap);
        next =
          order[Math.min(2, Math.max(0, index + (velocity > 0 ? 1 : -1)))]!;
      } else {
        next = order.reduce((best, stop) =>
          Math.abs(range[stop] - height) < Math.abs(range[best] - height)
            ? stop
            : best,
        );
      }
      apply(range[next]);
      live.current.onSnap(next);
    };

    element.addEventListener("touchstart", onStart, { passive: true });
    element.addEventListener("touchmove", onMove, { passive: false });
    element.addEventListener("touchend", onEnd);
    element.addEventListener("touchcancel", onEnd);
    return () => {
      element.removeEventListener("touchstart", onStart);
      element.removeEventListener("touchmove", onMove);
      element.removeEventListener("touchend", onEnd);
      element.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  return (
    <div
      ref={root}
      className={`rail sheet is-${props.snap}${props.className ? ` ${props.className}` : ""}`}
    >
      <div
        ref={head}
        className="sheet-head"
        onClick={(event) => {
          if (props.snap !== "peek") return;
          if (event.target instanceof Element && event.target.closest("button"))
            return;
          props.onSnap("half");
        }}
      >
        <div className="sheet-grip" aria-hidden="true" />
        {props.head}
      </div>
      <div ref={body} className="sheet-body">
        {props.children}
      </div>
      <div ref={bar} className="sheet-bar">
        {props.bar}
      </div>
    </div>
  );
}
