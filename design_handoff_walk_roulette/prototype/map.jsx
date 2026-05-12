// Stylized SVG of downtown Richmond.
// James River runs from upper-west to lower-east, curving south through downtown.
// Belle Isle / Brown's Island / Mayo Island in the river.
// Faint street grid + neighborhood labels.
//
// Coord system: SVG origin (440, 360) = Monroe Park (mile 0,0). Scale = 80 svg/mile.

const MAP_VB_W = 900;
const MAP_VB_H = 700;
const MAP_OX = 440;
const MAP_OY = 360;
const MAP_SCALE = 80;

window.MAP_OX = MAP_OX;
window.MAP_OY = MAP_OY;
window.MAP_SCALE = MAP_SCALE;
window.MAP_VB_W = MAP_VB_W;
window.MAP_VB_H = MAP_VB_H;

window.svgFor = (p) => ({
  sx: MAP_OX + p.x * MAP_SCALE,
  sy: MAP_OY - p.y * MAP_SCALE,
});

window.svgToMiles = (sx, sy) => ({
  x: (sx - MAP_OX) / MAP_SCALE,
  y: -(sy - MAP_OY) / MAP_SCALE,
});

// James River — flows from upper-west, curves through downtown, exits lower-east.
// Width ~50 svg units (≈0.6 mi). North bank goes W→E, south bank E→W.
const RIVER_PATH = `
  M -20,330
  C 60,322 140,348 220,378
  C 280,402 340,420 396,432
  C 452,440 506,442 560,448
  C 624,456 692,468 760,480
  C 820,490 880,498 920,502
  L 920,548
  C 880,548 820,540 760,532
  C 692,520 624,510 560,502
  C 506,496 452,494 396,488
  C 340,480 280,464 220,442
  C 140,418 60,392 -20,398
  Z
`;

// Belle Isle (mid-river, ~SVG 440,440)
const BELLE_ISLE_PATH = `
  M 410,432
  C 432,428 470,430 488,440
  C 496,448 482,460 458,462
  C 434,464 408,458 402,448
  C 400,440 402,433 410,432 Z
`;

// Brown's Island (smaller, just west/upstream of Belle Isle, near north bank)
const BROWNS_ISLAND_PATH = `
  M 478,418
  C 504,416 524,420 522,428
  C 514,436 488,436 478,430 Z
`;

// Mayo Island (further east)
const MAYO_ISLAND_PATH = `
  M 552,442
  C 576,440 596,444 590,452
  C 584,460 562,460 552,454 Z
`;

// Bridges across the James (W to E)
const BRIDGES = [
  { x1: 312, y1: 408, x2: 318, y2: 462, label: "Boulevard" },     // Boulevard Bridge
  { x1: 416, y1: 420, x2: 422, y2: 478, label: "Lee" },           // Lee Bridge / Robert E Lee Memorial Bridge
  { x1: 440, y1: 422, x2: 446, y2: 480, label: "" },              // T. Pott (pedestrian)
  { x1: 480, y1: 422, x2: 486, y2: 482, label: "Manchester" },    // Manchester Bridge
  { x1: 524, y1: 432, x2: 532, y2: 488, label: "Mayo" },          // Mayo / 14th St
];

// Faint park/landmark fills (decorative, in correct positions vs POI dots)
const PARKS = [
  { d: "M 320,400 C 332,398 350,400 354,420 C 354,432 332,440 318,438 C 304,432 304,408 320,400 Z", name: "MAYMONT" },
  { d: "M 360,400 C 380,396 402,398 404,418 C 402,430 372,432 360,422 Z", name: "HOLLYWOOD" },
  { d: "M 350,360 C 370,358 396,360 396,380 C 392,388 360,388 348,378 Z", name: "BYRD PARK" },
  { d: "M 350,470 C 370,464 392,468 396,484 C 392,494 360,500 350,490 Z", name: "FOREST HILL" },
  { d: "M 600,440 C 620,436 640,440 642,460 C 638,470 612,472 602,462 Z", name: "CHIMBORAZO" },
  { d: "M 510,348 C 520,346 532,346 534,358 C 530,366 514,366 510,358 Z", name: "CAPITOL" },
];

// Street grid hints (very faint)
const STREETS_HORIZONTAL = [
  { y: 320, label: "BROAD ST" },
  { y: 348, label: "" },
  { y: 376, label: "MAIN ST" },
  { y: 392, label: "CARY ST" },
];

const STREETS_VERTICAL = [
  { x: 380, label: "BELVIDERE" },
  { x: 440, label: "" },
  { x: 488, label: "" },
  { x: 540, label: "" },
  { x: 592, label: "" },
];

const NEIGHBORHOOD_LABELS = [
  { sx: 350, sy: 308, text: "THE FAN" },
  { sx: 470, sy: 290, text: "JACKSON WARD" },
  { sx: 545, sy: 332, text: "DOWNTOWN" },
  { sx: 640, sy: 348, text: "CHURCH HILL" },
  { sx: 380, sy: 250, text: "MUSEUM DISTRICT" },
  { sx: 480, sy: 230, text: "SCOTT'S ADDITION" },
  { sx: 280, sy: 358, text: "CARYTOWN" },
  { sx: 460, sy: 528, text: "MANCHESTER" },
  { sx: 705, sy: 470, text: "ROCKETTS" },
  { sx: 320, sy: 530, text: "FOREST HILL" },
];

const RichmondMap = ({
  pois,
  eligibleIds,
  startLocation,
  destination,
  walkRange,
  roundTrip,
  onMapClick,
  showRoute,
  showNeighborhoods,
}) => {
  const startSvg = startLocation ? window.svgFor(startLocation) : null;
  const destSvg = destination ? window.svgFor(destination) : null;

  const maxOneWay = roundTrip ? walkRange[1] / 2 : walkRange[1];
  const minOneWay = roundTrip ? walkRange[0] / 2 : walkRange[0];
  const innerR = (minOneWay / window.WALK_FACTOR) * MAP_SCALE;
  const outerR = (maxOneWay / window.WALK_FACTOR) * MAP_SCALE;

  const handleClick = (e) => {
    if (!onMapClick) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width;
    const yRatio = (e.clientY - rect.top) / rect.height;
    const sx = xRatio * MAP_VB_W;
    const sy = yRatio * MAP_VB_H;
    onMapClick(window.svgToMiles(sx, sy), { sx, sy });
  };

  // Curved route via control point pulled perpendicular.
  let routeD = null;
  if (showRoute && startSvg && destSvg) {
    const mx = (startSvg.sx + destSvg.sx) / 2;
    const my = (startSvg.sy + destSvg.sy) / 2;
    const dx = destSvg.sx - startSvg.sx;
    const dy = destSvg.sy - startSvg.sy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const offset = Math.min(40, len * 0.18);
    const cx = mx + (-dy / len) * offset;
    const cy = my + (dx / len) * offset;
    routeD = `M ${startSvg.sx},${startSvg.sy} Q ${cx},${cy} ${destSvg.sx},${destSvg.sy}`;
  }

  return (
    <svg
      className="map-svg"
      viewBox={`0 0 ${MAP_VB_W} ${MAP_VB_H}`}
      preserveAspectRatio="xMidYMid meet"
      onClick={handleClick}
    >
      <rect x={0} y={0} width={MAP_VB_W} height={MAP_VB_H} className="land" />

      {/* River */}
      <path d={RIVER_PATH} className="river" />
      <path d={BELLE_ISLE_PATH} className="land" />
      <path d={BROWNS_ISLAND_PATH} className="land" />
      <path d={MAYO_ISLAND_PATH} className="land" />

      {/* Bridges */}
      {BRIDGES.map((b, i) => (
        <line key={`br${i}`} x1={b.x1} y1={b.y1} x2={b.x2} y2={b.y2}
          stroke="#aab1a4" strokeWidth={1.4} strokeDasharray="3 2" />
      ))}

      {/* Faint street grid */}
      {STREETS_HORIZONTAL.map((s, i) => (
        <line key={`h${i}`} x1={120} x2={820} y1={s.y} y2={s.y} className={`street ${i === 0 || i === 2 ? "major" : ""}`} />
      ))}
      {STREETS_VERTICAL.map((s, i) => (
        <line key={`v${i}`} x1={s.x} x2={s.x} y1={140} y2={400} className="street" />
      ))}

      {/* Park hints */}
      {PARKS.map((p, i) => (
        <path key={`park${i}`} d={p.d} className="park" />
      ))}

      {/* Neighborhood labels */}
      {showNeighborhoods && NEIGHBORHOOD_LABELS.map((n, i) => (
        <text key={`n${i}`} x={n.sx} y={n.sy} textAnchor="middle" className="neighborhood-label">
          {n.text}
        </text>
      ))}

      {/* Walking radius rings */}
      {startSvg && (
        <g>
          <circle cx={startSvg.sx} cy={startSvg.sy} r={outerR} className="start-ring" />
          {innerR > 4 && (
            <circle cx={startSvg.sx} cy={startSvg.sy} r={innerR} className="start-ring" />
          )}
        </g>
      )}

      {/* Route */}
      {routeD && <path d={routeD} className="route" />}

      {/* POI dots */}
      {pois.map((poi) => {
        const { sx, sy } = window.svgFor(poi);
        const eligible = eligibleIds.has(poi.id);
        const isDest = destination && destination.id === poi.id;
        return (
          <circle
            key={poi.id}
            cx={sx}
            cy={sy}
            r={isDest ? 6 : 3.5}
            className={`poi-dot ${isDest ? "selected" : eligible ? "" : "dim"}`}
          />
        );
      })}

      {/* Start pin */}
      {startSvg && (
        <g>
          <circle cx={startSvg.sx} cy={startSvg.sy} r={7} className="start-pin" />
        </g>
      )}

      {/* Destination callout */}
      {destination && destSvg && (() => {
        const text = destination.name;
        const w = Math.max(text.length * 7 + 18, 80);
        const offX = destSvg.sx + 16 + w > MAP_VB_W - 12 ? -16 - w : 16;
        const calloutX = destSvg.sx + offX;
        const calloutY = destSvg.sy - 10;
        return (
          <g>
            <rect x={calloutX} y={calloutY} width={w} height={22} className="destination-callout-bg" />
            <text x={calloutX + w / 2} y={calloutY + 15} textAnchor="middle" className="destination-callout-text">
              {text}
            </text>
          </g>
        );
      })()}
    </svg>
  );
};

window.RichmondMap = RichmondMap;
