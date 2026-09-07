import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import type { Theme } from "../app/theme";

/**
 * Hand-written style over OpenFreeMap's OpenMapTiles vector source, in the
 * plvr.net paper palette with a dark counterpart. Contours and routes sit on
 * top in the site's accent, so the basemap stays quiet. No API key;
 * attribution is rendered by the map control.
 */

const TILES = "https://tiles.openfreemap.org/planet";
const GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";

type Palette = {
  land: string;
  green: string;
  water: string;
  building: string;
  roadMinor: string;
  roadMajor: string;
  path: string;
  boundary: string;
  label: string;
  waterLabel: string;
  labelHalo: string;
};

const PALETTES = {
  light: {
    land: "#f6f1e7",
    green: "#e3e8d6",
    water: "#b7d6f1",
    building: "#e6dcc7",
    roadMinor: "#ffffff",
    roadMajor: "#f3e6cf",
    path: "#d9cfb9",
    boundary: "#cfc6b4",
    label: "#6a6f76",
    waterLabel: "#5c8ea3",
    labelHalo: "#f6f1e7",
  },
  dark: {
    land: "#232a33",
    green: "#25332f",
    water: "#142840",
    building: "#2c343e",
    roadMinor: "#343e4a",
    roadMajor: "#465260",
    path: "#3a4450",
    boundary: "#465260",
    label: "#a7aeb6",
    waterLabel: "#8fb6c6",
    labelHalo: "#1c222a",
  },
} satisfies Record<Theme, Palette>;

/** The paint properties that change between themes, keyed by layer id. */
function paints(palette: Palette) {
  return {
    background: { "background-color": palette.land },
    green: { "fill-color": palette.green },
    landcover: { "fill-color": palette.green },
    water: { "fill-color": palette.water },
    building: { "fill-color": palette.building },
    path: { "line-color": palette.path },
    "road-minor": { "line-color": palette.roadMinor },
    "road-secondary": { "line-color": palette.roadMinor },
    "road-major": { "line-color": palette.roadMajor },
    boundary: { "line-color": palette.boundary },
    "water-label": {
      "text-color": palette.waterLabel,
      "text-halo-color": palette.labelHalo,
    },
    "place-label": {
      "text-color": palette.label,
      "text-halo-color": palette.labelHalo,
    },
  } satisfies Record<string, Record<string, string>>;
}

/** Recolors the basemap in place, keeping every source and layer the app added. */
export function applyBasemapTheme(map: MapLibreMap, theme: Theme): void {
  for (const [layer, props] of Object.entries(paints(PALETTES[theme]))) {
    if (map.getLayer(layer) === undefined) continue;
    for (const [name, value] of Object.entries(props))
      map.setPaintProperty(layer, name, value);
  }
}

export function basemap(theme: Theme): StyleSpecification {
  const COLORS = PALETTES[theme];
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      omt: {
        type: "vector",
        url: TILES,
        attribution:
          '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>',
      },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": COLORS.land } },
      {
        id: "green",
        type: "fill",
        source: "omt",
        "source-layer": "park",
        paint: { "fill-color": COLORS.green },
      },
      {
        id: "landcover",
        type: "fill",
        source: "omt",
        "source-layer": "landcover",
        filter: ["in", "class", "wood", "grass"],
        paint: { "fill-color": COLORS.green, "fill-opacity": 0.7 },
      },
      {
        id: "water",
        type: "fill",
        source: "omt",
        "source-layer": "water",
        paint: { "fill-color": COLORS.water },
      },
      {
        id: "building",
        type: "fill",
        source: "omt",
        "source-layer": "building",
        minzoom: 13,
        paint: {
          "fill-color": COLORS.building,
          "fill-opacity": ["interpolate", ["linear"], ["zoom"], 13, 0, 16, 0.9],
        },
      },
      {
        id: "path",
        type: "line",
        source: "omt",
        "source-layer": "transportation",
        minzoom: 14,
        filter: ["in", "class", "path", "track"],
        paint: {
          "line-color": COLORS.path,
          "line-width": ["interpolate", ["linear"], ["zoom"], 14, 0.4, 18, 1.6],
        },
      },
      {
        id: "road-minor",
        type: "line",
        source: "omt",
        "source-layer": "transportation",
        minzoom: 11,
        filter: ["in", "class", "minor", "service"],
        paint: {
          "line-color": COLORS.roadMinor,
          "line-width": ["interpolate", ["exponential", 1.4], ["zoom"], 11, 0.4, 18, 6],
        },
      },
      {
        id: "road-secondary",
        type: "line",
        source: "omt",
        "source-layer": "transportation",
        filter: ["in", "class", "secondary", "tertiary"],
        paint: {
          "line-color": COLORS.roadMinor,
          "line-width": ["interpolate", ["exponential", 1.4], ["zoom"], 9, 0.6, 18, 9],
        },
      },
      {
        id: "road-major",
        type: "line",
        source: "omt",
        "source-layer": "transportation",
        filter: ["in", "class", "motorway", "trunk", "primary"],
        paint: {
          "line-color": COLORS.roadMajor,
          "line-width": ["interpolate", ["exponential", 1.4], ["zoom"], 7, 0.7, 18, 14],
        },
      },
      {
        id: "boundary",
        type: "line",
        source: "omt",
        "source-layer": "boundary",
        filter: ["<=", "admin_level", 6],
        paint: { "line-color": COLORS.boundary, "line-dasharray": [3, 2], "line-width": 0.8 },
      },
      {
        id: "water-label",
        type: "symbol",
        source: "omt",
        "source-layer": "water_name",
        minzoom: 11,
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
          "text-letter-spacing": 0.14,
          "text-transform": "uppercase",
        },
        paint: {
          "text-color": COLORS.waterLabel,
          "text-halo-color": COLORS.labelHalo,
          "text-halo-width": 1,
        },
      },
      {
        id: "place-label",
        type: "symbol",
        source: "omt",
        "source-layer": "place",
        minzoom: 10,
        filter: ["in", "class", "suburb", "neighbourhood", "quarter"],
        layout: {
          "text-field": ["get", "name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 11, 9.5, 15, 12],
          "text-letter-spacing": 0.16,
          "text-transform": "uppercase",
          "text-max-width": 8,
        },
        paint: {
          "text-color": COLORS.label,
          "text-halo-color": COLORS.labelHalo,
          "text-halo-width": 1.2,
          "text-opacity": 0.7,
        },
      },
    ],
  };
}
