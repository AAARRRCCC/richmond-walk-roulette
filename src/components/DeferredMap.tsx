import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { RichmondMapProps } from "./RichmondMap";

// The MapLibre chunk only downloads once this lazy element actually mounts.
const RichmondMap = lazy(() =>
  import("./RichmondMap").then((m) => ({ default: m.RichmondMap })),
);

/**
 * Renders <RichmondMap> only after a sentinel element enters (or nears) the
 * viewport. On desktop layouts where the map is above the fold, the
 * IntersectionObserver fires on first paint so this is effectively a no-op —
 * the map loads as fast as it did before. On narrow viewports where the map
 * starts off-screen (stacked layout under the wheel), the MapLibre chunk
 * download is deferred until the user scrolls toward it.
 */
export function DeferredMap(props: RichmondMapProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    if (shouldLoad) return;
    const el = sentinelRef.current;
    if (!el) return;

    // Fallback: if IntersectionObserver isn't available, just load.
    if (typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [shouldLoad]);

  if (!shouldLoad) {
    return (
      <div
        ref={sentinelRef}
        className="map-loading"
        aria-label="Map will load when visible"
      />
    );
  }

  return (
    <Suspense fallback={<div className="map-loading" aria-label="Loading map" />}>
      <RichmondMap {...props} />
    </Suspense>
  );
}
