import { useEffect, useId, useMemo, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap } from "maplibre-gl";
import type { FeatureCollection, MultiPolygon as MultiPolygonGeometry } from "geojson";
import { darkBasemap } from "./basemap";
import { weighted } from "./weight";
import { smoothedForDisplay } from "./smooth";
import {
  cumulativeMeters,
  pointAtMeters,
  pointKey,
  type LngLat,
  type MultiPolygon,
} from "../lib/geometry";
import { formatArea, pluralize } from "../lib/format";
import { isString, type Json } from "../lib/json";
import type { Reach } from "../lib/isochrone";
import type { WalkingRoute } from "../lib/route";
import { PRESET_ORIGINS, type Place } from "../data/places";

// Out-of-reach dots stay clickable; the result card explains the overrun.
// The picked dot is listed because it draws over the ordinary one.
const PLACE_LAYERS = ["places", "places-out", "picked-place-dot"];

/** Slot 0 is drawn first and holds the outermost contour. */
const SLOTS = [0, 1, 2] as const;
const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

const ACCENT = "#ffb043";
const ACCENT_SOFT = "#ffd7a0";

// Fills and routes go beneath the basemap labels so the 7px route casing
// cannot paint out a neighbourhood name. Place dots and the picked label stay on top.
const UNDER_LABELS = "water-label";

const NUDGE_METERS = 15;
const METERS_PER_DEGREE = 111_320;
/** A run of arrow presses commits once, like a drag, instead of one warm-up per key. */
const NUDGE_COMMIT_MS = 500;
const NUDGES = new Map<string, [number, number]>([
  ["ArrowUp", [0, 1]],
  ["ArrowDown", [0, -1]],
  ["ArrowLeft", [-1, 0]],
  ["ArrowRight", [1, 0]],
]);

const FIT_MAX_ZOOM = 15.5;

export type MapCanvasProps = {
  origin: LngLat;
  reach: Reach | null;
  places: readonly Place[];
  inReachIds: ReadonlySet<string>;
  pickedId: string | null;
  /** Bumps when the map should re-frame: origin change or dial commit. */
  framingKey: number;
  route: WalkingRoute | null;
  /** Metres along the elevation profile being scrubbed, or null. */
  hoverMeters: number | null;
  pickingOrigin: boolean;
  /** While the reel turns the picked label is hidden; symbol placement lags a tick behind the rail. */
  spinning: boolean;
  partnerOrigin: LngLat | null;
  /** The partner's outermost contour at the current budget, or null while warming. */
  partnerBand: MultiPolygon | null;
  partnerName: string;
  /** False until the reader of an invite has chosen their own start. */
  originVisible: boolean;
  onPickPlace: (id: string) => void;
  onMoveOrigin: (at: LngLat) => void;
};

export function MapCanvas(props: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const partnerMarkerRef = useRef<maplibregl.Marker | null>(null);
  /** Bounds of the last framed contour, replayed when the rail resizes. */
  const boundsRef = useRef<maplibregl.LngLatBounds | null>(null);
  /**
   * Last MultiPolygon uploaded per band slot. `cachedReach` returns the same
   * object for a given origin and minute, so a reference check skips re-tiling
   * contours that did not change on a reel tick.
   */
  const bandsRef = useRef<(MultiPolygon | null)[]>([null, null, null]);
  /** Set once the style has loaded and the sources exist. Every sync effect waits on it. */
  const [loaded, setLoaded] = useState<MapLibreMap | null>(null);
  const [basemapDown, setBasemapDown] = useState(false);
  const [summary, setSummary] = useState("");
  const summaryId = useId();
  // Map event handlers are registered once on mount and read props through this.
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
      maxPitch: 0,
    });
    mapRef.current = map;

    // The vector source carries the OpenFreeMap/OSM credit; the control collects it.
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.touchZoomRotate.disableRotation();
    // No compass, so a shift+arrow rotation would be unrecoverable.
    map.keyboard.disableRotation();

    const element = document.createElement("button");
    element.type = "button";
    element.className = "origin-marker";
    element.setAttribute(
      "aria-label",
      "Start of the walk. Drag it, or nudge it with the arrow keys.",
    );
    const marker = new maplibregl.Marker({ element, draggable: true, anchor: "center" })
      .setLngLat([handlers.current.origin.lng, handlers.current.origin.lat])
      .addTo(map);
    marker.on("dragend", () => {
      const { lng, lat } = marker.getLngLat();
      handlers.current.onMoveOrigin({ lng, lat });
    });
    markerRef.current = marker;

    // The partner's marker: not focusable, not draggable, hidden by class until set.
    const partnerElement = document.createElement("button");
    partnerElement.type = "button";
    partnerElement.className = "origin-marker is-partner is-hidden";
    partnerElement.tabIndex = -1;
    partnerElement.setAttribute("aria-label", "The other person's start.");
    const partnerMarker = new maplibregl.Marker({
      element: partnerElement,
      draggable: false,
      anchor: "center",
    })
      .setLngLat([handlers.current.origin.lng, handlers.current.origin.lat])
      .addTo(map);
    partnerMarkerRef.current = partnerMarker;

    let nudgeTimer = 0;
    const commitNudge = () => {
      window.clearTimeout(nudgeTimer);
      nudgeTimer = 0;
      const { lng, lat } = marker.getLngLat();
      handlers.current.onMoveOrigin({ lng, lat });
    };
    element.addEventListener("keydown", (event) => {
      const step = NUDGES.get(event.key);
      if (!step) return;
      event.preventDefault();
      // Otherwise MapLibre's keyboard handler also pans the map.
      event.stopPropagation();
      const { lng, lat } = marker.getLngLat();
      const meters = NUDGE_METERS * (event.shiftKey ? 8 : 1);
      marker.setLngLat([
        lng + (step[0] * meters) / (METERS_PER_DEGREE * Math.cos((lat * Math.PI) / 180)),
        lat + (step[1] * meters) / METERS_PER_DEGREE,
      ]);
      window.clearTimeout(nudgeTimer);
      nudgeTimer = window.setTimeout(commitNudge, NUDGE_COMMIT_MS);
    });
    element.addEventListener("blur", () => {
      if (nudgeTimer) commitNudge();
    });

    map.on("load", () => {
      // Partner contour first so it renders beneath the local one. One fill and
      // one outline only: two nested ladders of the same hue would be unreadable.
      map.addSource("partner-band", { type: "geojson", data: EMPTY });
      map.addLayer(
        {
          id: "partner-band-fill",
          type: "fill",
          source: "partner-band",
          paint: { "fill-color": ACCENT, "fill-opacity": 0.06 },
        },
        UNDER_LABELS,
      );
      map.addLayer(
        {
          id: "partner-band-line",
          type: "line",
          source: "partner-band",
          paint: {
            "line-color": ACCENT_SOFT,
            "line-width": weighted(1.2),
            "line-opacity": 0.55,
            "line-dasharray": [2, 2],
          },
        },
        UNDER_LABELS,
      );

      for (const slot of SLOTS) {
        map.addSource(`band-${slot}`, { type: "geojson", data: EMPTY });
        map.addLayer(
          {
            id: `band-fill-${slot}`,
            type: "fill",
            source: `band-${slot}`,
            // Uniform opacity: the nested contours stack into a gradient on their own.
            paint: { "fill-color": ACCENT, "fill-opacity": 0.085 },
          },
          UNDER_LABELS,
        );
      }
      for (const slot of SLOTS) {
        map.addLayer(
          {
            id: `band-line-${slot}`,
            type: "line",
            source: `band-${slot}`,
            paint: {
              // Slot 0 is the budget contour, the only bright line.
              "line-color": slot === 0 ? ACCENT : ACCENT_SOFT,
              "line-width": weighted(slot === 0 ? 1.8 : 1),
              "line-opacity": slot === 0 ? 0.9 : 0.45,
            },
          },
          UNDER_LABELS,
        );
      }

      map.addSource("route", { type: "geojson", data: EMPTY });
      map.addLayer(
        {
          id: "route-casing",
          type: "line",
          source: "route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#05090e", "line-width": weighted(7), "line-opacity": 0.9 },
        },
        UNDER_LABELS,
      );
      map.addLayer(
        {
          id: "route-line",
          type: "line",
          source: "route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#ffffff", "line-width": weighted(2.6) },
        },
        UNDER_LABELS,
      );

      map.addSource("places", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "places-out",
        type: "circle",
        source: "places",
        filter: ["==", ["get", "state"], "out"],
        paint: {
          "circle-radius": weighted(3),
          "circle-color": "#4a5c6d",
          // Transparent halo to widen the hit target for thumbs.
          "circle-stroke-width": weighted(7),
          "circle-stroke-color": "rgba(0,0,0,0)",
        },
      });
      map.addLayer({
        id: "places",
        type: "circle",
        source: "places",
        filter: ["!=", ["get", "state"], "out"],
        paint: {
          // Destination: filled amber dot. Detour: smaller hollow ring.
          "circle-radius": weighted(["case", ["!=", ["get", "detour"], ""], 3.5, 4.5]),
          "circle-color": ["case", ["!=", ["get", "detour"], ""], "#0b1014", ACCENT],
          "circle-stroke-width": ["case", ["!=", ["get", "detour"], ""], 1.6, 0],
          "circle-stroke-color": ACCENT_SOFT,
        },
      });
      // The winner has its own one-feature source, so a reel tick re-uploads
      // one point instead of the whole places collection.
      map.addSource("place-picked", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "picked-place-dot",
        type: "circle",
        source: "place-picked",
        paint: {
          "circle-radius": weighted(8),
          "circle-color": "#ffffff",
          "circle-stroke-width": weighted(3),
          "circle-stroke-color": ACCENT,
        },
      });
      map.addLayer({
        // Not "place-label": the basemap owns that id and MapLibre throws on duplicates.
        id: "picked-place-label",
        type: "symbol",
        source: "place-picked",
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 13,
          "text-offset": [0, 1.4],
          "text-anchor": "top",
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": "#05090e",
          "text-halo-width": 1.6,
        },
      });

      // Added last with no beforeId so the scrub dot paints over the picked marker.
      map.addSource("route-hover", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "route-hover-dot",
        type: "circle",
        source: "route-hover",
        paint: {
          "circle-radius": weighted(5),
          "circle-color": "#ffffff",
          "circle-stroke-width": weighted(2),
          "circle-stroke-color": ACCENT,
        },
      });

      setLoaded(map);
    });

    // Losing the tile host is a notice, not a failure: the app's own GeoJSON
    // still draws over the bare background.
    map.on("error", () => {
      setBasemapDown(basemapMissing(map));
    });
    map.on("sourcedata", (event) => {
      if (event.sourceId === "omt" && event.isSourceLoaded) setBasemapDown(false);
    });

    map.on("click", PLACE_LAYERS, (event) => {
      // SAFETY: properties come from GeoJSON this component set, so they are Json.
      const id = event.features?.[0]?.properties?.["id"] as Json | undefined;
      if (isString(id) && !handlers.current.pickingOrigin) {
        event.preventDefault();
        handlers.current.onPickPlace(id);
      }
    });
    map.on("mouseenter", PLACE_LAYERS, () => {
      if (!handlers.current.pickingOrigin) map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", PLACE_LAYERS, () => {
      map.getCanvas().style.cursor = handlers.current.pickingOrigin ? "crosshair" : "";
    });
    map.on("click", (event) => {
      if (!handlers.current.pickingOrigin || event.defaultPrevented) return;
      handlers.current.onMoveOrigin({ lng: event.lngLat.lng, lat: event.lngLat.lat });
    });

    return () => {
      setLoaded(null);
      window.clearTimeout(nudgeTimer);
      marker.remove();
      partnerMarker.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    markerRef.current?.setLngLat([props.origin.lng, props.origin.lat]);
  }, [props.origin.lng, props.origin.lat]);

  useEffect(() => {
    markerRef.current?.getElement().classList.toggle("is-hidden", !props.originVisible);
  }, [props.originVisible]);

  useEffect(() => {
    const marker = partnerMarkerRef.current;
    if (!marker) return;
    const at = props.partnerOrigin;
    if (at !== null) marker.setLngLat([at.lng, at.lat]);
    marker.getElement().classList.toggle("is-hidden", at === null);
  }, [props.partnerOrigin]);

  // One effect per source, each on its own inputs, so a reel tick (pickedId,
  // route) never re-uploads contours and a dial scrub never re-uploads places.
  const { reach, places, inReachIds, pickedId, route, partnerBand, spinning } = props;
  useEffect(() => {
    if (!loaded) return;
    setData(loaded, "partner-band", partnerBand ? multiPolygonCollection(partnerBand) : EMPTY);
  }, [loaded, partnerBand]);

  useEffect(() => {
    if (!loaded) return;
    syncBands(loaded, reach, bandsRef.current, partnerBand !== null);
  }, [loaded, reach, partnerBand]);

  useEffect(() => {
    if (!loaded) return;
    syncHover(loaded, route, props.hoverMeters);
  }, [loaded, route, props.hoverMeters]);

  useEffect(() => {
    if (!loaded) return;
    syncPlaces(loaded, places, inReachIds);
  }, [loaded, places, inReachIds]);

  useEffect(() => {
    if (!loaded) return;
    syncPicked(loaded, places.find((place) => place.id === pickedId) ?? null);
  }, [loaded, places, pickedId]);

  useEffect(() => {
    if (!loaded) return;
    syncRoute(loaded, route);
  }, [loaded, route]);

  useEffect(() => {
    if (!loaded) return;
    loaded.setPaintProperty("picked-place-label", "text-opacity", spinning ? 0 : 1);
  }, [loaded, spinning]);

  useEffect(() => {
    mapRef.current?.getCanvas().style.setProperty("cursor", props.pickingOrigin ? "crosshair" : "");
  }, [props.pickingOrigin]);

  // Frame once per commit, not per contour: the dial repaints every input
  // frame and re-framing each one would restart the camera on every pixel.
  // The partner's presence is part of the stamp because their contour lands
  // after yours without bumping framingKey.
  const outerBand = reach?.bands.at(-1);
  const frameStamp = `${props.framingKey}|${partnerBand === null ? 0 : 1}`;
  const framedStampRef = useRef<string | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || framedStampRef.current === frameStamp) return;
    const yours = outerBand ? boundsOfBand(outerBand.polygons) : null;
    const theirs = partnerBand ? boundsOfBand(partnerBand) : null;
    const bounds = yours && theirs ? yours.extend(theirs) : (yours ?? theirs);
    if (!bounds) return;
    framedStampRef.current = frameStamp;
    boundsRef.current = bounds;
    map.fitBounds(bounds, {
      padding: framePadding(map),
      duration: cameraDuration(700),
      maxZoom: FIT_MAX_ZOOM,
    });
  }, [frameStamp, outerBand, partnerBand]);

  // Text equivalent of the contour, written on the same commit edge as the framing.
  const originName = useMemo(() => originLabel(props.origin), [props.origin]);
  const summaryStampRef = useRef<string | null>(null);
  const partnerName = props.partnerName;
  useEffect(() => {
    if ((!reach || !outerBand) && !partnerBand) return;
    if (summaryStampRef.current === frameStamp) return;
    summaryStampRef.current = frameStamp;
    setSummary(
      !reach || !outerBand
        ? `Reachable on foot from ${partnerName}, shown on the map.`
        : partnerBand
          ? `${pluralize(inReachIds.size, "place")} you can both reach within ${outerBand.minutes} minutes.`
          : `Reachable on foot from ${originName}: ${formatArea(reach.areaSqMeters)} within ` +
            `${outerBand.minutes} minutes, ${pluralize(inReachIds.size, "place")} in reach.`,
    );
  }, [frameStamp, reach, outerBand, partnerBand, inReachIds, originName, partnerName]);

  // On mobile the rail is a bottom sheet that grows with its contents, so
  // re-frame the current bounds when it resizes.
  useEffect(() => {
    const rail = document.querySelector(".rail");
    if (!rail || !("ResizeObserver" in window)) return;

    let timer = 0;
    let lastSize = "";
    const observer = new ResizeObserver((entries) => {
      const box = entries.at(-1)?.contentRect;
      const size = box ? `${Math.round(box.width)}x${Math.round(box.height)}` : "";
      if (size === lastSize) return;
      lastSize = size;

      window.clearTimeout(timer);
      // Let the sheet's open animation settle before measuring.
      timer = window.setTimeout(() => {
        const map = mapRef.current;
        const bounds = boundsRef.current;
        if (!map || !bounds || map.isEasing()) return;
        map.fitBounds(bounds, {
          padding: framePadding(map),
          duration: cameraDuration(400),
          maxZoom: FIT_MAX_ZOOM,
        });
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
      <div
        ref={containerRef}
        className="map-canvas"
        role="region"
        aria-label={
          props.partnerOrigin === null
            ? `Map of what is reachable on foot from ${originName}`
            : !props.originVisible
              ? `Map of what is reachable on foot from ${partnerName}`
              : `Map of what is reachable on foot from ${originName} and from ${partnerName}`
        }
        aria-describedby={summaryId}
      />
      <p id={summaryId} className="sr-only">
        {summary}
      </p>
      {basemapDown && (
        <p className="map-notice" role="status">
          Basemap unavailable. The reachable area is still shown.
        </p>
      )}
      {/* ODbL credit for the contours. The basemap credit is the map's own control. */}
      <p className="reach-attribution">
        <span className="reach-source">Reachable area</span>
        <span className="reach-brand">Valhalla / OpenStreetMap</span>
      </p>
    </div>
  );
}

/** True when the style never arrived or the vector source holds no tiles. */
function basemapMissing(map: MapLibreMap): boolean {
  if (!map.isStyleLoaded()) return true;
  return map.getSource("omt") ? !map.isSourceLoaded("omt") : true;
}

/** Read per call so a mid-session change to the setting takes effect. */
function cameraDuration(ms: number): number {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : ms;
}

/** A preset is named; a dropped pin is labelled by its coordinates. */
function originLabel(origin: LngLat): string {
  const key = pointKey(origin);
  const preset = PRESET_ORIGINS.find((candidate) => pointKey(candidate) === key);
  return preset ? preset.name : `${origin.lat.toFixed(4)}, ${origin.lng.toFixed(4)}`;
}

/** Smallest strip of map worth framing a contour into. */
const MIN_VISIBLE_PX = 140;

/**
 * Padding that keeps the contour out from under the rail. The rail is measured
 * because on mobile it is a sheet that grows with its contents. The only clamp
 * is the floor on the visible strip; capping the padding would hide the contour
 * under the sheet while looking framed.
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

function syncBands(
  map: MapLibreMap,
  reach: Reach | null,
  lastBands: (MultiPolygon | null)[],
  meet: boolean,
): void {
  const bands = reach?.bands ?? [];
  for (const slot of SLOTS) {
    // `bands` runs innermost first; slot 0 must be outermost. In meet mode the
    // inner bands are dropped: the ladder is a one-person instrument.
    const polygons = meet && slot > 0 ? null : (bands[bands.length - 1 - slot]?.polygons ?? null);
    if (lastBands[slot] === polygons) continue;
    lastBands[slot] = polygons;
    setData(map, `band-${slot}`, polygons ? multiPolygonCollection(polygons) : EMPTY);
  }
}

function syncPlaces(
  map: MapLibreMap,
  places: readonly Place[],
  inReachIds: ReadonlySet<string>,
): void {
  setData(map, "places", {
    type: "FeatureCollection",
    features: places.map((place) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [place.lng, place.lat] },
      properties: {
        id: place.id,
        name: place.name,
        state: inReachIds.has(place.id) ? "in" : "out",
        // Empty string, not absent: `["get"]` on a missing property is null,
        // and `["!=", null, ""]` is true.
        detour: place.detour ?? "",
      },
    })),
  });
}

// The winner is also still drawn by the `places` layer underneath; an
// out-of-reach pick keeps its grey dot under the white one, which is the right reading.
function syncPicked(map: MapLibreMap, place: Place | null): void {
  setData(map, "place-picked", {
    type: "FeatureCollection",
    features:
      place === null
        ? []
        : [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: [place.lng, place.lat] },
              properties: { id: place.id, name: place.name },
            },
          ],
  });
}

function syncHover(
  map: MapLibreMap,
  route: WalkingRoute | null,
  hoverMeters: number | null,
): void {
  const at =
    route !== null && hoverMeters !== null
      ? pointAtMeters(route.coords, cumulativeMeters(route.coords), hoverMeters)
      : null;
  setData(
    map,
    "route-hover",
    at === null
      ? EMPTY
      : {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: [at.lng, at.lat] },
              properties: {},
            },
          ],
        },
  );
}

function syncRoute(map: MapLibreMap, route: WalkingRoute | null): void {
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

/** Throws on a missing source: a silent miss renders an empty map with no error anywhere. */
function setData(map: MapLibreMap, id: string, data: FeatureCollection): void {
  const source = map.getSource(id);
  if (!(source instanceof maplibregl.GeoJSONSource)) {
    throw new Error(`Map source "${id}" is missing or is not GeoJSON`);
  }
  source.setData(data);
}

// Smoothed for drawing only; reach membership is still decided on the engine's geometry.
function multiPolygonCollection(polygons: MultiPolygon): FeatureCollection {
  const geometry: MultiPolygonGeometry = {
    type: "MultiPolygon",
    coordinates: smoothedForDisplay(polygons),
  };
  return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry }] };
}

function boundsOfBand(polygons: MultiPolygon): maplibregl.LngLatBounds | null {
  const bounds = new maplibregl.LngLatBounds();
  for (const rings of polygons) {
    for (const position of rings[0] ?? []) bounds.extend([position[0], position[1]]);
  }
  return bounds.isEmpty() ? null : bounds;
}
