import { useEffect, useRef } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import type { FeatureCollection, MultiPolygon as MultiPolygonGeometry } from "geojson";
import { darkBasemap } from "./basemap";
import type { LngLat, MultiPolygon } from "../lib/geometry";
import { isString, type Json } from "../lib/json";
import type { Reach } from "../lib/isochrone";
import type { WalkingRoute } from "../lib/route";
import type { Place } from "../data/places";

/** Slot 0 renders at the bottom and always holds the outermost contour. */
const SLOTS = [0, 1, 2] as const;
const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

const ACCENT = "#ffb043";
const ACCENT_SOFT = "#ffd7a0";

export type MapCanvasProps = {
  origin: LngLat;
  reach: Reach | null;
  places: readonly Place[];
  inReachIds: ReadonlySet<string>;
  pickedId: string | null;
  /** Changes when the map should re-frame: origin change or dial commit. */
  framingKey: number;
  route: WalkingRoute | null;
  pickingOrigin: boolean;
  onPickPlace: (id: string) => void;
  onMoveOrigin: (at: LngLat) => void;
};

export function MapCanvas(props: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const readyRef = useRef(false);
  /** Bounds of the last framed contour, replayed when the rail resizes. */
  const boundsRef = useRef<maplibregl.LngLatBounds | null>(null);
  /**
   * Latest props for the map event handlers, which are registered once on
   * mount and would otherwise close over the first render's props. Declared
   * before every other effect so it is refreshed first.
   */
  const handlers = useRef(props);
  useEffect(() => {
    handlers.current = props;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = new maplibregl.Map({
      container,
      style: darkBasemap(),
      center: [handlers.current.origin.lng, handlers.current.origin.lat],
      zoom: 13.4,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    mapRef.current = map;

    // The vector source carries the OpenFreeMap and OpenStreetMap credit and
    // the control collects it; passing it again here would render it twice.
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.touchZoomRotate.disableRotation();

    const element = document.createElement("div");
    element.className = "origin-marker";
    element.setAttribute("aria-hidden", "true");
    const marker = new maplibregl.Marker({ element, draggable: true, anchor: "center" })
      .setLngLat([handlers.current.origin.lng, handlers.current.origin.lat])
      .addTo(map);
    marker.on("dragend", () => {
      const { lng, lat } = marker.getLngLat();
      handlers.current.onMoveOrigin({ lng, lat });
    });
    markerRef.current = marker;

    map.on("load", () => {
      for (const slot of SLOTS) {
        map.addSource(`band-${slot}`, { type: "geojson", data: EMPTY });
        map.addLayer({
          id: `band-fill-${slot}`,
          type: "fill",
          source: `band-${slot}`,
          // Uniform opacity on purpose: the contours are nested, so stacking
          // them builds a gradient that gets hotter toward the origin without
          // any per-slot tuning. Kept low so the street grid stays readable
          // underneath, which is the whole reason for a real isochrone.
          paint: { "fill-color": ACCENT, "fill-opacity": 0.085 },
        });
      }
      for (const slot of SLOTS) {
        map.addLayer({
          id: `band-line-${slot}`,
          type: "line",
          source: `band-${slot}`,
          paint: {
            // Slot 0 is the budget itself, the one contour that answers the
            // question, so it is the only bright line.
            "line-color": slot === 0 ? ACCENT : ACCENT_SOFT,
            "line-width": slot === 0 ? 1.8 : 1,
            "line-opacity": slot === 0 ? 0.9 : 0.45,
          },
        });
      }

      map.addSource("route", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "route-casing",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#05090e", "line-width": 7, "line-opacity": 0.9 },
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ffffff", "line-width": 2.6 },
      });

      map.addSource("places", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "places",
        type: "circle",
        source: "places",
        paint: {
          "circle-radius": ["match", ["get", "state"], "picked", 8, "in", 4.5, 3],
          "circle-color": ["match", ["get", "state"], "picked", "#ffffff", "in", ACCENT, "#4a5c6d"],
          "circle-stroke-width": ["match", ["get", "state"], "picked", 3, "in", 1.5, 0],
          "circle-stroke-color": ["match", ["get", "state"], "picked", ACCENT, "#0b1014"],
        },
      });
      map.addLayer({
        // Not "place-label": the basemap already owns that id, and MapLibre
        // throws on a duplicate rather than warning.
        id: "picked-place-label",
        type: "symbol",
        source: "places",
        filter: ["==", ["get", "state"], "picked"],
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 13,
          "text-offset": [0, 1.4],
          "text-anchor": "top",
        },
        paint: { "text-color": "#ffffff", "text-halo-color": "#05090e", "text-halo-width": 1.6 },
      });

      readyRef.current = true;
      const p = handlers.current;
      sync(map, p.reach, p.places, p.inReachIds, p.pickedId, p.route);
    });

    map.on("click", "places", (event) => {
      // SAFETY: MapLibre parses feature properties out of the GeoJSON this
      // component sets on the source, so they are Json values; isString then
      // narrows to the string id the places source actually carries.
      const id = event.features?.[0]?.properties?.["id"] as Json | undefined;
      if (isString(id) && !handlers.current.pickingOrigin) {
        event.preventDefault();
        handlers.current.onPickPlace(id);
      }
    });
    map.on("mouseenter", "places", () => {
      if (!handlers.current.pickingOrigin) map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "places", () => {
      map.getCanvas().style.cursor = handlers.current.pickingOrigin ? "crosshair" : "";
    });
    map.on("click", (event) => {
      if (!handlers.current.pickingOrigin || event.defaultPrevented) return;
      handlers.current.onMoveOrigin({ lng: event.lngLat.lng, lat: event.lngLat.lat });
    });

    return () => {
      readyRef.current = false;
      marker.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Keep the marker on the origin, including when the origin changes from a
  // preset rather than from dragging the marker itself.
  useEffect(() => {
    markerRef.current?.setLngLat([props.origin.lng, props.origin.lat]);
  }, [props.origin.lng, props.origin.lat]);

  const { reach, places, inReachIds, pickedId, route } = props;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    sync(map, reach, places, inReachIds, pickedId, route);
  }, [reach, places, inReachIds, pickedId, route]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = props.pickingOrigin ? "crosshair" : "";
  }, [props.pickingOrigin]);

  /**
   * Frame the reachable area when the caller says the choice is settled, not
   * on every contour. The dial now repaints per input frame, so re-framing on
   * each value would restart a 700ms camera animation on every pixel of a drag
   * and fight the very responsiveness the prefetch bought.
   *
   * `framingKey` changes on origin change and on dial commit (pointer up, key
   * up, blur). The bounds are read at that moment from whatever contour is
   * current.
   */
  const outerBand = props.reach?.bands.at(-1);
  const framedStampRef = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !outerBand) return;
    // Frame once per key, at the first render where the contour actually
    // exists. A new origin bumps the key while the reach is still null, so
    // keying on the signal alone would skip that frame entirely.
    const stamp = `${props.framingKey}`;
    if (framedStampRef.current === stamp) return;

    const bounds = boundsOfBand(outerBand.polygons);
    if (!bounds) return;
    framedStampRef.current = stamp;
    boundsRef.current = bounds;
    map.fitBounds(bounds, { padding: framePadding(map), duration: 700, maxZoom: 15.5 });
  }, [props.framingKey, outerBand]);

  /**
   * The rail's height is part of the framing, and on mobile it changes without
   * any contour changing: opening Filters or showing a result grows the sheet
   * and can swallow the bloom. Re-frame the current bounds when that happens.
   */
  useEffect(() => {
    const rail = document.querySelector(".rail");
    if (!rail || !("ResizeObserver" in window)) return;

    let timer = 0;
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer);
      // The sheet animates open, so wait for it to settle before measuring.
      timer = window.setTimeout(() => {
        const map = mapRef.current;
        const bounds = boundsRef.current;
        if (map && bounds) {
          map.fitBounds(bounds, { padding: framePadding(map), duration: 400, maxZoom: 15.5 });
        }
      }, 180);
    });
    observer.observe(rail);
    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="map-shell">
      <div ref={containerRef} className="map-canvas" />
      {/*
        The contours and routes are computed by Valhalla from OpenStreetMap
        data, and OSM's ODbL asks derived works to credit the contributors.
        The basemap credit belongs to the map's own attribution control; this
        one is for the reachable area, visually separated from it.
      */}
      <p className="gmp-attribution">
        <span className="gmp-source">Reachable area</span>
        <span className="gmp-brand">Valhalla / OpenStreetMap</span>
      </p>
    </div>
  );
}

/** Smallest strip of map worth framing a contour into. */
const MIN_VISIBLE_PX = 140;

/**
 * Keeps the bloom out from under the control rail. The rail is measured rather
 * than assumed: on mobile it is a bottom sheet that grows with its contents up
 * to 72dvh, so a fixed inset would frame half the contour underneath it.
 *
 * The only clamp is the one MapLibre needs (padding must leave a positive
 * viewport) plus a floor on the visible strip. Capping the padding at some
 * fraction of the canvas would be worse than a cramped frame: it would put the
 * contour under the sheet while looking like it had been framed correctly.
 */
function framePadding(map: MapLibreMap) {
  const edge = 48;
  const canvas = map.getCanvas();
  const rail = document.querySelector(".rail")?.getBoundingClientRect();
  if (!rail) return { top: edge, right: edge, bottom: edge, left: edge };

  if (window.matchMedia("(min-width: 900px)").matches) {
    const left = Math.min(rail.right + 24, canvas.clientWidth - edge - MIN_VISIBLE_PX);
    return { top: edge, right: edge, bottom: edge, left: Math.max(edge, Math.round(left)) };
  }
  const bottom = Math.min(canvas.clientHeight - rail.top + 16, canvas.clientHeight - edge - MIN_VISIBLE_PX);
  return { top: edge, right: edge, bottom: Math.max(edge, Math.round(bottom)), left: edge };
}

function sync(
  map: MapLibreMap,
  reach: Reach | null,
  places: readonly Place[],
  inReachIds: ReadonlySet<string>,
  pickedId: string | null,
  route: WalkingRoute | null,
): void {
  const bands = reach?.bands ?? [];
  for (const slot of SLOTS) {
    // bands runs innermost first; slot 0 is drawn first and must be outermost.
    const band = bands[bands.length - 1 - slot];
    setData(map, `band-${slot}`, band ? multiPolygonCollection(band.polygons) : EMPTY);
  }

  setData(map, "places", {
    type: "FeatureCollection",
    features: places.map((place) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [place.lng, place.lat] },
      properties: {
        id: place.id,
        name: place.name,
        state: place.id === pickedId ? "picked" : inReachIds.has(place.id) ? "in" : "out",
      },
    })),
  });

  setData(
    map,
    "route",
    route
      ? {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                coordinates: route.coords.map((point) => [point.lng, point.lat]),
              },
            },
          ],
        }
      : EMPTY,
  );
}

/**
 * Throws rather than no-opping on a missing source. A silent miss here means
 * the map renders an empty style with no error anywhere, which is exactly the
 * failure that a duplicate layer id already caused once.
 */
function setData(map: MapLibreMap, id: string, data: FeatureCollection): void {
  const source = map.getSource(id);
  if (!(source instanceof maplibregl.GeoJSONSource)) {
    throw new Error(`Map source "${id}" is missing or is not GeoJSON`);
  }
  source.setData(data);
}

function multiPolygonCollection(polygons: MultiPolygon): FeatureCollection {
  // Position tuples are structurally assignable to GeoJSON's number[]
  // positions, so the geometry needs no copy and no assertion.
  const geometry: MultiPolygonGeometry = { type: "MultiPolygon", coordinates: polygons };
  return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry }] };
}

function boundsOfBand(polygons: MultiPolygon): maplibregl.LngLatBounds | null {
  const bounds = new maplibregl.LngLatBounds();
  for (const rings of polygons) {
    for (const position of rings[0] ?? []) bounds.extend([position[0], position[1]]);
  }
  return bounds.isEmpty() ? null : bounds;
}
