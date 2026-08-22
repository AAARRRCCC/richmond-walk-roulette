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

/**
 * Both place layers answer a click. Out-of-reach dots are drawn dimmer, not
 * made inert: the dial is a question, and asking one about a place outside the
 * current answer is reasonable. The result card says the walk exceeds the
 * budget rather than the map refusing to respond.
 */
// `picked-place-dot` is in the list so the winner stays clickable: it draws
// over the ordinary dot, and a click that only hit `places` underneath would be
// a target the reader can see and cannot press.
const PLACE_LAYERS = ["places", "places-out", "picked-place-dot"];

/** Slot 0 renders at the bottom and always holds the outermost contour. */
const SLOTS = [0, 1, 2] as const;
const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

const ACCENT = "#ffb043";
const ACCENT_SOFT = "#ffd7a0";

/**
 * Everything the app fills or strokes goes underneath the basemap's labels.
 * The route casing is a 7px near-black line, so where it crossed a
 * neighbourhood name it painted the name out - and neighbourhood names are
 * what let a contour be read as territory ("the 20 minute ring reaches Church
 * Hill") rather than as a blob. The place dots and the picked label are the
 * answer to the question, so they stay on top.
 */
const UNDER_LABELS = "water-label";

/** How far one arrow-key press moves the origin marker, in metres. */
const NUDGE_METERS = 15;
/** Metres per degree of latitude, near enough for a nudge. */
const METERS_PER_DEGREE = 111_320;
/**
 * A run of arrow presses commits once, the way a drag does. Committing per
 * keystroke would fire a whole 96-contour warm-up for every tap.
 */
const NUDGE_COMMIT_MS = 500;
const NUDGES = new Map<string, [number, number]>([
  ["ArrowUp", [0, 1]],
  ["ArrowDown", [0, -1]],
  ["ArrowLeft", [-1, 0]],
  ["ArrowRight", [1, 0]],
]);

/**
 * The stylesheet does not own this node. It is a failure state belonging to
 * the map rather than a part of the instrument panel, and it exists only for
 * as long as the tiles are missing.
 */
const NOTICE_STYLE = {
  position: "absolute",
  left: 8,
  bottom: 8,
  zIndex: 2,
  margin: 0,
  maxWidth: "17rem",
  padding: "5px 9px",
  borderRadius: 5,
  background: "rgba(11, 16, 20, 0.82)",
  color: "#93a6b5",
  fontSize: 11,
  pointerEvents: "none",
} as const;

export type MapCanvasProps = {
  origin: LngLat;
  reach: Reach | null;
  places: readonly Place[];
  inReachIds: ReadonlySet<string>;
  pickedId: string | null;
  /** Changes when the map should re-frame: origin change or dial commit. */
  framingKey: number;
  route: WalkingRoute | null;
  /** Metres along the elevation profile the reader is scrubbing, or null. */
  hoverMeters: number | null;
  pickingOrigin: boolean;
  /**
   * True while the reel is turning. `pickedId` then changes on every tick, and
   * MapLibre places symbols on its own asynchronous cadence, so the name on the
   * map strobes and lags a tick behind the name in the rail - two different
   * answers on screen during the one moment the app asks you to watch. The
   * circle highlight keeps ticking; the label waits for the landing.
   *
   * Optional so the prop can be adopted without a lockstep change; the label
   * simply never hides until it is passed.
   */
  spinning?: boolean;
  /** The other person's start, or null. Renders a second, undraggable marker. */
  partnerOrigin?: LngLat | null;
  /** Their outermost contour at the current budget, or null while warming. */
  partnerBand?: MultiPolygon | null;
  /** Their display name, for the text equivalent. Never free text from a link. */
  partnerName?: string;
  /**
   * False before the reader of an invite has chosen their own start.
   *
   * The local marker is created unconditionally in the mount-once effect and
   * positioned from `props.origin`, so without this a draggable pin sits on
   * DEFAULT_ORIGIN throughout the invite state — a house in the Fan offered as
   * the reader's own start, which is the exact lie the invite state exists to
   * refuse.
   */
  originVisible?: boolean;
  onPickPlace: (id: string) => void;
  onMoveOrigin: (at: LngLat) => void;
};

export function MapCanvas(props: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const partnerMarkerRef = useRef<maplibregl.Marker | null>(null);
  /** The last MultiPolygon handed to the partner source, for the same reason `bandsRef` exists. */
  const partnerBandRef = useRef<MultiPolygon | null>(null);
  const readyRef = useRef(false);
  /** Bounds of the last framed contour, replayed when the rail resizes. */
  const boundsRef = useRef<maplibregl.LngLatBounds | null>(null);
  /**
   * The last MultiPolygon handed to each band source. `cachedReach` returns
   * the same object for a given origin and minute, which is the identity the
   * display smoothing already keys its WeakMap on, so comparing references
   * here is what stops a reel tick from re-serialising and re-tiling three
   * contours that did not change.
   */
  const bandsRef = useRef<(MultiPolygon | null)[]>([null, null, null]);
  const [basemapDown, setBasemapDown] = useState(false);
  const [summary, setSummary] = useState("");
  const summaryId = useId();
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
      // Belt and braces beside the keyboard call below: pitch breaks the
      // fixed-size circles the places layer assumes.
      maxPitch: 0,
    });
    mapRef.current = map;

    // The vector source carries the OpenFreeMap and OpenStreetMap credit and
    // the control collects it; passing it again here would render it twice.
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.touchZoomRotate.disableRotation();
    // The last rotation path left open. MapLibre's keyboard handler binds
    // shift+arrow to bearing and pitch, and the compass was deliberately
    // removed, so north-up would be unrecoverable short of a reload.
    map.keyboard.disableRotation();

    const element = document.createElement("button");
    element.type = "button";
    element.className = "origin-marker";
    // A real name and a real keyboard path. It used to be an aria-hidden div,
    // so the one control that moves the origin on the map was reachable only
    // by dragging it, and announced as nothing.
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

    /**
     * The partner's marker, created here and hidden by a class rather than in a
     * later effect.
     *
     * The local marker, its drag handler, its nudge listener and the map click
     * handler are all registered inside this one mount effect reading props
     * through the `handlers` ref; a second create/destroy effect would
     * introduce an ordering problem against `readyRef` for no benefit.
     *
     * Not focusable and not draggable: it arrived from a link and the person it
     * belongs to is not here to move it.
     */
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

    // Arrow keys move the marker the way a drag does: freely, committing once
    // the movement stops, so a run of presses is one origin change and one
    // warm-up rather than a ladder request per keystroke.
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
      // The marker lives inside the canvas container, so MapLibre's own
      // keyboard handler is upstream of this one: without stopping here, one
      // arrow press both nudges the origin and pans the map away from it.
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
      /**
       * The partner's contour, added FIRST so it renders beneath yours.
       *
       * One fill and one outline, and deliberately no inner bands on either
       * side in meet mode: three nested amber fills already stack to roughly
       * 0.24, and a second set of three would be six overlapping strata of one
       * hue that the eye separates none of. Where the two outermost fills
       * cross, alpha compositing makes the region visibly denser than either
       * alone — and **that density is compositing, not a computed polygon.**
       * The app never measures it and never names it.
       *
       * Distinctness comes from fill and lightness, never from a second hue:
       * amber is the only accent, and that is locked in the stylesheet's own
       * header.
       */
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
            // Uniform opacity on purpose: the contours are nested, so stacking
            // them builds a gradient that gets hotter toward the origin without
            // any per-slot tuning. Kept low so the street grid stays readable
            // underneath, which is the whole reason for a real isochrone.
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
              // Slot 0 is the budget itself, the one contour that answers the
              // question, so it is the only bright line.
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
      // Two layers over one source so out-of-reach places can be drawn dimmer.
      // Both are interactive: a place beyond the budget is still a place, and
      // asking about one is a fair question. The card answers it honestly by
      // saying the walk is longer than the dial allows.
      map.addLayer({
        id: "places-out",
        type: "circle",
        source: "places",
        filter: ["==", ["get", "state"], "out"],
        paint: {
          "circle-radius": weighted(3),
          "circle-color": "#4a5c6d",
          // A transparent halo that paints nothing and widens the hit test.
          // A 3px dot is a target nobody lands on a phone, and this dot is now
          // the thing a reader taps to ask why the place is not in the pool -
          // so it has to be hittable from a thumb's width away.
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
          // A destination is a filled amber dot; a detour is a smaller hollow
          // ring. One legend-free distinction that survives at city zoom, drawn
          // from the same source and the same layer - a second layer would be
          // a second thing to keep in step.
          //
          // Every zoom-scaled value goes through `weighted()`. A bare `["zoom"]`
          // inside arithmetic makes MapLibre skip the layer with no throw and
          // no log, which is a bad hour.
          "circle-radius": weighted(["case", ["!=", ["get", "detour"], ""], 3.5, 4.5]),
          "circle-color": ["case", ["!=", ["get", "detour"], ""], "#0b1014", ACCENT],
          "circle-stroke-width": ["case", ["!=", ["get", "detour"], ""], 1.6, 0],
          "circle-stroke-color": ACCENT_SOFT,
        },
      });
      /**
       * The winner, in a source of its own, holding zero or one feature.
       *
       * `pickedId` changes on every reel tick. While the winner was a `state`
       * value on the shared source, every tick re-serialised and re-tiled the
       * whole FeatureCollection - at 250 features, dozens of times a second, in
       * exactly the moment this app spends its budget on feel. One feature
       * changes instead.
       *
       * Rejected: `promoteId` + `setFeatureState`, the more general answer.
       * Nothing here sets `promoteId` today, feature-state expressions would
       * have to replace every paint `case`, and the volatile thing is genuinely
       * one feature. A one-feature source is smaller and fails obviously.
       */
      map.addSource("place-picked", { type: "geojson", data: EMPTY });
      map.addLayer({
        id: "picked-place-dot",
        type: "circle",
        source: "place-picked",
        paint: {
          "circle-radius": weighted(8),
          "circle-color": "#ffffff",
          // The accent rather than a dark cut-out: a halo the colour of the
          // background reads as a hole punched in the contour it sits on.
          "circle-stroke-width": weighted(3),
          "circle-stroke-color": ACCENT,
        },
      });
      map.addLayer({
        // Not "place-label": the basemap already owns that id, and MapLibre
        // throws on a duplicate rather than warning.
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
          "text-opacity": handlers.current.spinning ? 0 : 1,
        },
      });

      // Added after the place layers, and with no beforeId, so it paints on top
      // of them. Registered next to the route source instead, it would slide
      // under the picked-place marker at the exact moment the scrubber reached
      // it - which is the moment the dot exists to answer.
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

      readyRef.current = true;
      syncAll(map, handlers.current, bandsRef.current);
      // Keep the reference the effect compares against in step with what
      // `syncAll` just uploaded, or the next real change is skipped as a
      // repeat of itself.
      partnerBandRef.current = handlers.current.partnerBand ?? null;
    });

    /**
     * The basemap is a third-party tile host with no SLA, and losing it is not
     * losing the app: the contours, the route and the dots are GeoJSON this
     * component owns and they draw perfectly well over the bare background.
     * So this is a notice, not a failure. Raised only when the basemap is
     * actually missing, because one dropped tile is not an outage.
     */
    map.on("error", () => {
      setBasemapDown(basemapMissing(map));
    });
    map.on("sourcedata", (event) => {
      if (event.sourceId === "omt" && event.isSourceLoaded) setBasemapDown(false);
    });

    map.on("click", PLACE_LAYERS, (event) => {
      // SAFETY: MapLibre parses feature properties out of the GeoJSON this
      // component sets on the source, so they are Json values; isString then
      // narrows to the string id the places source actually carries.
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
      readyRef.current = false;
      window.clearTimeout(nudgeTimer);
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

  // Hidden rather than destroyed, so the mount-once effect above stays the one
  // place either marker is created.
  useEffect(() => {
    markerRef.current
      ?.getElement()
      .classList.toggle("is-hidden", props.originVisible === false);
  }, [props.originVisible]);

  useEffect(() => {
    const marker = partnerMarkerRef.current;
    if (!marker) return;
    const at = props.partnerOrigin ?? null;
    if (at !== null) marker.setLngLat([at.lng, at.lat]);
    marker.getElement().classList.toggle("is-hidden", at === null);
  }, [props.partnerOrigin]);

  // Its own effect on its own dependency, like every other sync in this file:
  // batching them re-uploads geometry nothing asked to change, and a reel tick
  // must not re-serialise a contour.
  const partnerBand = props.partnerBand ?? null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    if (partnerBandRef.current === partnerBand) return;
    partnerBandRef.current = partnerBand;
    setData(
      map,
      "partner-band",
      partnerBand ? multiPolygonCollection(partnerBand) : EMPTY,
    );
  }, [partnerBand]);

  /**
   * One effect per source, on its own dependencies. They used to share one,
   * so a reel tick - which changes `pickedId` and `route` many times a second
   * - re-uploaded all three contour geometries byte for byte, and a dial
   * scrub re-uploaded the 62-feature places collection and the whole route on
   * every frame. Those are precisely the two moments this app budgets its
   * feel for.
   */
  const { reach, places, inReachIds, pickedId, route } = props;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    syncBands(map, reach, bandsRef.current, partnerBand !== null);
  }, [reach, partnerBand]);

  // Its own effect, for the same reason every other sync in this file is: they
  // fire on different inputs and batching them re-uploads geometry nothing asked
  // to change.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    syncHover(map, route, props.hoverMeters);
  }, [route, props.hoverMeters]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    syncPlaces(map, places, inReachIds);
  }, [places, inReachIds]);

  /**
   * The winner, on its own effect and its own source.
   *
   * Split from the one above so a reel tick re-uploads one feature rather than
   * every place in the city.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    syncPicked(map, places.find((place) => place.id === pickedId) ?? null);
  }, [places, pickedId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    syncRoute(map, route);
  }, [route]);

  const spinning = props.spinning ?? false;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    map.setPaintProperty("picked-place-label", "text-opacity", spinning ? 0 : 1);
  }, [spinning]);

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
    // A GUARD CHANGE, not just an extra extend. This used to early-return on
    // `!outerBand`, and in the invite state `reach` is null by design - so as
    // written the camera would never move and the map would sit wherever it
    // initialised, which makes the whole "frame on their contour alone" state
    // unimplementable.
    if (!map || (!outerBand && !partnerBand)) return;
    // Frame once per key, at the first render where the contour actually
    // exists. A new origin bumps the key while the reach is still null, so
    // keying on the signal alone would skip that frame entirely.
    //
    // The partner's presence is part of the stamp because their ladder lands
    // AFTER yours - the two legs are sequential by design - and `framingKey`
    // does not bump again when it does. Without this the camera frames your
    // contour alone and their half of the answer sits off-screen, which is the
    // one thing a two-person map has to get right.
    const stamp = `${props.framingKey}|${partnerBand === null ? 0 : 1}`;
    if (framedStampRef.current === stamp) return;

    // The union of both outermost contours, so both starts and the shared
    // region are on screen at once. No bbox helper is added to `geometry.ts`:
    // MapLibre's own `LngLatBounds.extend` accepts another bounds.
    const yours = outerBand ? boundsOfBand(outerBand.polygons) : null;
    const theirs = partnerBand ? boundsOfBand(partnerBand) : null;
    const bounds = yours && theirs ? yours.extend(theirs) : (yours ?? theirs);
    if (!bounds) return;
    framedStampRef.current = stamp;
    boundsRef.current = bounds;
    map.fitBounds(bounds, {
      padding: framePadding(map),
      duration: cameraDuration(700),
      maxZoom: 15.5,
    });
  }, [props.framingKey, outerBand, partnerBand]);

  /**
   * The isochrone is what this app exists to show and it lives entirely in
   * canvas pixels, so it needs a text equivalent. Written on the same commit
   * edge that re-frames the camera rather than on every scrub frame: the point
   * is the settled answer, not a running commentary.
   */
  const originName = useMemo(() => originLabel(props.origin), [props.origin]);
  const summaryStampRef = useRef<string | null>(null);
  const partnerName = props.partnerName ?? "their start";
  useEffect(() => {
    const stamp = `${props.framingKey}|${partnerBand === null ? 0 : 1}`;
    // The invite state has no local reach and is the one thing on screen, so
    // the guard asks whether EITHER side has something to say. Gated on yours
    // alone, a screen-reader user would get no text equivalent at all for the
    // one thing the map is showing them.
    if ((!reach || !outerBand) && !partnerBand) return;
    if (summaryStampRef.current === stamp) return;
    summaryStampRef.current = stamp;
    setSummary(
      !reach || !outerBand
        ? `Reachable on foot from ${partnerName}, shown on the map.`
        : partnerBand
          ? `${pluralize(inReachIds.size, "place")} you can both reach within ${outerBand.minutes} minutes.`
          : `Reachable on foot from ${originName}: ${formatArea(reach.areaSqMeters)} within ` +
            `${outerBand.minutes} minutes, ${pluralize(inReachIds.size, "place")} in reach.`,
    );
  }, [props.framingKey, reach, outerBand, partnerBand, inReachIds, originName, partnerName]);

  /**
   * The rail's height is part of the framing, and on mobile it changes without
   * any contour changing: opening Filters or showing a result grows the sheet
   * and can swallow the bloom. Re-frame the current bounds when that happens.
   */
  useEffect(() => {
    const rail = document.querySelector(".rail");
    if (!rail || !("ResizeObserver" in window)) return;

    let timer = 0;
    let lastSize = "";
    const observer = new ResizeObserver((entries) => {
      // The observer fires on observe() and on every box change, including the
      // rail's own content settling during the first load's 700ms fitBounds.
      // Re-framing then cut the opening ease off mid-flight - racing the very
      // framing this exists to correct.
      const box = entries.at(-1)?.contentRect;
      const size = box ? `${Math.round(box.width)}x${Math.round(box.height)}` : "";
      if (size === lastSize) return;
      lastSize = size;

      window.clearTimeout(timer);
      // The sheet animates open, so wait for it to settle before measuring.
      timer = window.setTimeout(() => {
        const map = mapRef.current;
        const bounds = boundsRef.current;
        if (!map || !bounds || map.isEasing()) return;
        map.fitBounds(bounds, {
          padding: framePadding(map),
          duration: cameraDuration(400),
          maxZoom: 15.5,
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
          props.partnerOrigin == null
            ? `Map of what is reachable on foot from ${originName}`
            : props.originVisible === false
              ? `Map of what is reachable on foot from ${partnerName}`
              : `Map of what is reachable on foot from ${originName} and from ${partnerName}`
        }
        aria-describedby={summaryId}
      />
      <p id={summaryId} className="sr-only">
        {summary}
      </p>
      {basemapDown && (
        <p className="map-notice" role="status" style={NOTICE_STYLE}>
          Basemap unavailable. The reachable area is still shown.
        </p>
      )}
      {/*
        The contours and routes are computed by Valhalla from OpenStreetMap
        data, and OSM's ODbL asks derived works to credit the contributors.
        The basemap credit belongs to the map's own attribution control; this
        one is for the reachable area, visually separated from it.
      */}
      <p className="reach-attribution">
        <span className="reach-source">Reachable area</span>
        <span className="reach-brand">Valhalla / OpenStreetMap</span>
      </p>
    </div>
  );
}

/**
 * True when the basemap is not on screen at all: either its style never
 * arrived or its vector source is holding no tiles. Asked rather than assumed,
 * so a single failed tile request does not raise a notice.
 */
function basemapMissing(map: MapLibreMap): boolean {
  if (!map.isStyleLoaded()) return true;
  return map.getSource("omt") ? !map.isSourceLoaded("omt") : true;
}

/**
 * Read per call, never once at module load. Someone can turn the setting on
 * mid-session, and a value captured at startup would keep flying the camera at
 * them for the rest of it.
 */
function cameraDuration(ms: number): number {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : ms;
}

/**
 * Names the origin for the map's accessible name. A preset is named; anything
 * else is a dropped pin and its coordinates are the only honest label for it.
 */
function originLabel(origin: LngLat): string {
  const key = pointKey(origin);
  const preset = PRESET_ORIGINS.find((candidate) => pointKey(candidate) === key);
  return preset ? preset.name : `${origin.lat.toFixed(4)}, ${origin.lng.toFixed(4)}`;
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

function syncAll(map: MapLibreMap, props: MapCanvasProps, lastBands: (MultiPolygon | null)[]): void {
  syncBands(map, props.reach, lastBands, props.partnerBand != null);
  // The partner's contour belongs here for the same reason every other source
  // does: each per-source effect returns early until the style is ready, so a
  // value that was ALREADY set when `load` fired would never be uploaded - its
  // dependency never changes again. That is not hypothetical; it is what left
  // the second contour missing on an answer link, with the readout cheerfully
  // naming both sides.
  setData(
    map,
    "partner-band",
    props.partnerBand ? multiPolygonCollection(props.partnerBand) : EMPTY,
  );
  syncPlaces(map, props.places, props.inReachIds);
  // Both, not only the first. There are two paths into place rendering - the
  // effects above and this, which runs once the style is ready and again on a
  // style reload - and calling only `syncPlaces` here would leave the picked dot
  // and its label absent on first paint whenever a pick was already in state.
  syncPicked(map, props.places.find((place) => place.id === props.pickedId) ?? null);
  syncRoute(map, props.route);
}

function syncBands(
  map: MapLibreMap,
  reach: Reach | null,
  lastBands: (MultiPolygon | null)[],
  meet: boolean,
): void {
  const bands = reach?.bands ?? [];
  for (const slot of SLOTS) {
    // bands runs innermost first; slot 0 is drawn first and must be outermost.
    //
    // In meet mode the inner bands are dropped. The contour ladder is a
    // single-person instrument - it answers "how much further with ten more
    // minutes" - and that question has no two-person form; keeping them would
    // put six strata of one hue on screen and make the only stratification that
    // means something, the overlap, unreadable. The NET number of contour
    // uploads therefore goes down.
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
        // "picked" is gone from this vocabulary: the winner lives in its own
        // source now. Two values, and the filters below read them.
        state: inReachIds.has(place.id) ? "in" : "out",
        // Empty string rather than absent, because a MapLibre `["get"]` on a
        // missing property yields null and `["!=", null, ""]` is true - which
        // would draw every destination as a detour.
        detour: place.detour ?? "",
      },
    })),
  });
}

/**
 * The winner, alone in its own source.
 *
 * **The winner is drawn twice, and that is accepted.** The `places` layer keeps
 * its `state != "out"` filter, so an in-reach winner still renders there as an
 * ordinary dot underneath this one. It costs one circle and is invisible.
 *
 * The behaviour worth naming is the out-of-reach pick: while "picked" was a
 * `state` value it overrode "out" and the grey dot vanished. Now the grey dot
 * stays and the white one draws over it - which is the better reading, since a
 * pick outside the contour should still look outside the contour underneath its
 * marker, but it is a change rather than an accident.
 */
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

/**
 * The dot that answers "where on the walk is this?".
 *
 * No round-trip fold: the chart draws the outbound leg whatever the switch says,
 * so a scrub position is always a distance along the line the map is drawing. An
 * earlier version mirrored the profile and had to fold `m > L` back to `2L - m`
 * here; the fold went when the mirror did.
 */
function syncHover(
  map: MapLibreMap,
  route: WalkingRoute | null,
  hoverMeters: number | null,
): void {
  if (route === null || hoverMeters === null) {
    setData(map, "route-hover", EMPTY);
    return;
  }

  const cumulative = cumulativeMeters(route.coords);
  const at = pointAtMeters(route.coords, cumulative, hoverMeters);
  if (at === null) {
    setData(map, "route-hover", EMPTY);
    return;
  }

  setData(map, "route-hover", {
    type: "FeatureCollection",
    features: [
      { type: "Feature", geometry: { type: "Point", coordinates: [at.lng, at.lat] }, properties: {} },
    ],
  });
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
  // Smoothed here and nowhere else: the raster staircase is an artefact of how
  // the engine computes contours, so it is worth rounding off the drawing, but
  // the reach itself is still decided against the engine's own geometry.
  // Position tuples are structurally assignable to GeoJSON's number[]
  // positions, so the geometry needs no copy and no assertion.
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
