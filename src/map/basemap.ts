import type { StyleSpecification } from "maplibre-gl";

/**
 * A hand-written dark cartographic style over OpenFreeMap's OpenMapTiles
 * vector source. Written out rather than fetched-and-recoloured: the isochrone
 * bloom is the only saturated thing on screen, and that only works if every
 * basemap colour is deliberately chosen to sit underneath it.
 *
 * OpenFreeMap needs no API key. Attribution is required and is rendered by the
 * map control.
 */

const TILES = "https://tiles.openfreemap.org/planet";
const GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";

export const COLORS = {
  land: "#0b1014",
  green: "#0e1715",
  water: "#05090e",
  building: "#141c23",
  roadMinor: "#19222b",
  roadMajor: "#28343f",
  path: "#1b2630",
  boundary: "#243039",
  label: "#7c8fa0",
  labelHalo: "#080d12",
} as const;

export function darkBasemap(): StyleSpecification {
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
          "text-color": "#4d6070",
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
          "text-opacity": 0.55,
        },
      },
    ],
  };
}
