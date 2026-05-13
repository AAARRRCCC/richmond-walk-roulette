import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type Map as MaplibreMap, type Popup } from "maplibre-gl";
import type { POI, StartLocation } from "../data/pois";
import {
  MONROE_PARK_LAT,
  MONROE_PARK_LNG,
  WALK_FACTOR,
  fromLngLat,
  toLngLat,
  type LngLat,
  type MileXY,
  type Range,
} from "../lib/geo";
import type { WalkingRoute } from "../lib/route";

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const RING_SRC = "walk-rings";
const RING_LAYER = "walk-rings-line";
const ROUTE_SRC = "route";
const ROUTE_LAYER = "route-line";
const POI_SRC = "pois";
const POI_LAYER = "pois-circle";
const START_SRC = "start";
const START_LAYER = "start-circle";

export type RichmondMapProps = {
  pois: readonly POI[];
  eligibleIds: ReadonlySet<string>;
  startLocation: StartLocation;
  destination: POI | null;
  walkRange: Range;
  roundTrip: boolean;
  showRoute: boolean;
  /** Real walking route from Google Routes API, when configured. Falls back to a stylized Bezier if null. */
  walkingRoute: WalkingRoute | null;
  pickingStart: boolean;
  /** Called when user clicks the map in pickingStart mode. If the click
   *  landed on a POI dot, `name` is the POI's display name; caller can
   *  use it instead of the generic coordinate label. */
  onPickStart: (miles: MileXY, name?: string) => void;
  onPoiClick: (poiId: string) => void;
};

export function RichmondMap(props: RichmondMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const onPickStartRef = useRef(props.onPickStart);
  const onPoiClickRef = useRef(props.onPoiClick);
  const pickingStartRef = useRef(props.pickingStart);
  onPickStartRef.current = props.onPickStart;
  onPoiClickRef.current = props.onPoiClick;
  pickingStartRef.current = props.pickingStart;
  const [loaded, setLoaded] = useState(false);

  // Stable POI feature collection (POI list is static; recomputes only on identity change)
  const poiFeatures = useMemo<GeoJSON.FeatureCollection<GeoJSON.Point>>(
    () => buildPoiFeatures(props.pois),
    [props.pois],
  );

  // Init the map exactly once
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [MONROE_PARK_LNG, MONROE_PARK_LAT],
      zoom: 13.2,
      attributionControl: { compact: true },
      hash: false,
    });
    mapRef.current = map;

    const setBaseCursor = () => {
      map.getCanvas().style.cursor = pickingStartRef.current ? "crosshair" : "";
    };
    setBaseCursor();

    const onLoad = () => {
      installLayers(map, poiFeatures);
      map.on("mouseenter", POI_LAYER, () => {
        map.getCanvas().style.cursor = pickingStartRef.current ? "crosshair" : "pointer";
      });
      map.on("mouseleave", POI_LAYER, setBaseCursor);
      setLoaded(true);
    };

    const onMapClick = (e: maplibregl.MapMouseEvent) => {
      const ll = e.lngLat;
      // Picking-start mode: any click sets the custom start, including
      // on POIs. If the click DID land on a POI dot, forward its name
      // so the start label is "<POI name>" instead of generic coords.
      if (pickingStartRef.current) {
        const features = map.queryRenderedFeatures(e.point, { layers: [POI_LAYER] });
        const hit = features[0];
        const name =
          hit && hit.properties && typeof hit.properties.name === "string"
            ? hit.properties.name
            : undefined;
        onPickStartRef.current(fromLngLat({ lng: ll.lng, lat: ll.lat }), name);
        return;
      }
      // Otherwise: only POI clicks do anything (empty-map clicks are ignored)
      const features = map.queryRenderedFeatures(e.point, { layers: [POI_LAYER] });
      const hit = features[0];
      if (hit && hit.properties && typeof hit.properties.id === "string") {
        onPoiClickRef.current(hit.properties.id);
      }
    };

    map.on("load", onLoad);
    map.on("click", onMapClick);

    return () => {
      map.off("load", onLoad);
      map.off("click", onMapClick);
      map.remove();
      mapRef.current = null;
      // No setLoaded(false) here: setState on an unmounting component is a
      // no-op (the state instance is being thrown away with the component).
      // Skipping it also clears react-doctor's no-cascading-set-state on
      // this effect.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cursor reflects the current picking-start mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = props.pickingStart ? "crosshair" : "";
  }, [props.pickingStart]);

  useMapLayerSync(mapRef, loaded, props);

  return <div className="map-container" ref={containerRef} />;
}

// ---------- internals ----------

function buildPoiFeatures(
  pois: readonly POI[],
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: pois.map((p) => {
      const ll = toLngLat(p);
      return {
        type: "Feature",
        id: p.id,
        properties: { id: p.id, name: p.name },
        geometry: { type: "Point", coordinates: [ll.lng, ll.lat] },
      };
    }),
  };
}

function installLayers(
  map: MaplibreMap,
  poiFeatures: GeoJSON.FeatureCollection<GeoJSON.Point>,
) {
  map.addSource(RING_SRC, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addLayer({
    id: RING_LAYER,
    type: "line",
    source: RING_SRC,
    paint: {
      "line-color": "#2a4d56",
      "line-opacity": 0.35,
      "line-width": 1,
      "line-dasharray": [3, 4],
    },
  });

  map.addSource(ROUTE_SRC, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addLayer({
    id: ROUTE_LAYER,
    type: "line",
    source: ROUTE_SRC,
    paint: {
      "line-color": "#b6332a",
      "line-width": 2.4,
      // Three coordinated signals tell the user when the route is an
      // approximation (badge + opacity + dash pattern). Real route gets
      // the tighter dasharray + full opacity; approx is muted and uses
      // a more spaced dash pattern to read as "tentative" without
      // looking broken.
      "line-dasharray": [
        "case",
        ["boolean", ["get", "approx"], false],
        ["literal", [2, 4]],
        ["literal", [3, 1.5]],
      ],
      "line-opacity": [
        "case",
        ["boolean", ["get", "approx"], false],
        0.65,
        1,
      ],
    },
  });

  map.addSource(POI_SRC, { type: "geojson", data: poiFeatures, promoteId: "id" });
  map.addLayer({
    id: POI_LAYER,
    type: "circle",
    source: POI_SRC,
    paint: {
      "circle-radius": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        7,
        4.5,
      ],
      "circle-color": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        "#b6332a",
        "#faf7ee",
      ],
      "circle-stroke-color": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        "#b6332a",
        ["boolean", ["feature-state", "eligible"], false],
        "#4a4843",
        "#c4bcaa",
      ],
      "circle-stroke-width": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        2,
        1.4,
      ],
    },
  });

  map.addSource(START_SRC, {
    type: "geojson",
    data: { type: "FeatureCollection", features: [] },
  });
  map.addLayer({
    id: START_LAYER,
    type: "circle",
    source: START_SRC,
    paint: {
      "circle-radius": 8,
      "circle-color": "#2a4d56",
      "circle-stroke-color": "#faf7ee",
      "circle-stroke-width": 2.5,
    },
  });
}

// Sync POI feature-state, ring/route geometry, start pin, and destination callout
// to the live map whenever the relevant props change.
function useMapLayerSync(
  mapRef: React.MutableRefObject<MaplibreMap | null>,
  loaded: boolean,
  props: RichmondMapProps,
) {
  const calloutRef = useRef<Popup | null>(null);
  const { pois, eligibleIds, startLocation, destination, walkRange, roundTrip, showRoute, walkingRoute } = props;

  // Feature-state for each POI: eligible + selected
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    pois.forEach((p) => {
      map.setFeatureState(
        { source: POI_SRC, id: p.id },
        {
          eligible: eligibleIds.has(p.id),
          selected: destination?.id === p.id,
        },
      );
    });
  }, [mapRef, loaded, pois, eligibleIds, destination]);

  // Walking-radius rings (inner + outer)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const center = toLngLat(startLocation);
    const minOneWay = roundTrip ? walkRange[0] / 2 : walkRange[0];
    const maxOneWay = roundTrip ? walkRange[1] / 2 : walkRange[1];
    const innerR = minOneWay / WALK_FACTOR;
    const outerR = maxOneWay / WALK_FACTOR;
    const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
    if (outerR > 0.02) {
      features.push(ringFeature(center, outerR));
    }
    if (innerR > 0.05) {
      features.push(ringFeature(center, innerR));
    }
    const src = map.getSource(RING_SRC) as maplibregl.GeoJSONSource | undefined;
    src?.setData({ type: "FeatureCollection", features });
  }, [mapRef, loaded, startLocation, walkRange, roundTrip]);

  // Route line — prefer the real walking route when available, else a stylized Bezier.
  // The `approx` feature property feeds the route layer's line-opacity case
  // expression so the approximate path renders at 0.4 opacity vs the real one's 1.0.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
    if (showRoute && destination) {
      const hasRealRoute = !!walkingRoute?.coords && walkingRoute.coords.length > 1;
      const coords = hasRealRoute
        ? walkingRoute.coords
        : bezierLineCoords(toLngLat(startLocation), toLngLat(destination));
      features.push({
        type: "Feature",
        properties: { approx: !hasRealRoute },
        geometry: { type: "LineString", coordinates: coords },
      });
    }
    const src = map.getSource(ROUTE_SRC) as maplibregl.GeoJSONSource | undefined;
    src?.setData({ type: "FeatureCollection", features });
  }, [mapRef, loaded, showRoute, destination, startLocation, walkingRoute]);

  // Start pin
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const ll = toLngLat(startLocation);
    const src = map.getSource(START_SRC) as maplibregl.GeoJSONSource | undefined;
    src?.setData({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: { type: "Point", coordinates: [ll.lng, ll.lat] },
        },
      ],
    });
  }, [mapRef, loaded, startLocation]);

  // Destination callout (popup-style)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) {
      calloutRef.current?.remove();
      calloutRef.current = null;
      return;
    }
    calloutRef.current?.remove();
    calloutRef.current = null;
    if (!destination) return;
    const ll = toLngLat(destination);
    const popup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      // No explicit anchor — MapLibre auto-flips based on viewport edges,
      // so the callout doesn't get clipped if the user pans so the
      // destination dot is near the top/left/right of the visible map.
      offset: 14,
      className: "destination-callout-popup",
    })
      .setLngLat([ll.lng, ll.lat])
      .setHTML(`<div class="destination-callout">${escapeHtml(destination.name)}</div>`)
      .addTo(map);
    calloutRef.current = popup;
    return () => {
      popup.remove();
      if (calloutRef.current === popup) calloutRef.current = null;
    };
  }, [mapRef, loaded, destination]);

  // Pan to a new custom start (only — preset selections shouldn't yank the view)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    if (startLocation.id !== "custom") return;
    const ll = toLngLat(startLocation);
    map.easeTo({ center: [ll.lng, ll.lat], duration: 600 });
  }, [mapRef, loaded, startLocation]);
}

function ringFeature(center: LngLat, miles: number): GeoJSON.Feature<GeoJSON.LineString> {
  const segments = 64;
  const rLat = miles / 69;
  const rLng = miles / 54.8;
  const coords: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * 2 * Math.PI;
    coords.push([center.lng + rLng * Math.cos(t), center.lat + rLat * Math.sin(t)]);
  }
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: coords },
  };
}

function bezierLineCoords(start: LngLat, end: LngLat): [number, number][] {
  const segments = 48;
  const dx = end.lng - start.lng;
  const dy = end.lat - start.lat;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const offset = Math.min(0.0035, len * 0.12);
  const mx = (start.lng + end.lng) / 2 + (-dy / len) * offset;
  const my = (start.lat + end.lat) / 2 + (dx / len) * offset;
  const out: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const u = 1 - t;
    const x = u * u * start.lng + 2 * u * t * mx + t * t * end.lng;
    const y = u * u * start.lat + 2 * u * t * my + t * t * end.lat;
    out.push([x, y]);
  }
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
