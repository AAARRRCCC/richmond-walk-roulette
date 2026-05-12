// Curved-arc spinning wheel. Names sit along an arc whose center is
// far off-screen left, so visible text appears nearly horizontal with
// a slight tilt (matches the reference style).
//
// To keep the wheel visually full regardless of how few POIs match,
// we cycle the eligible list around the full circle until we have
// at least MIN_FILLED slots. Each slot has the same angular step.

const WHEEL_VB_W = 720;
const WHEEL_VB_H = 800;
const CX = -180;
const CY = 400;
const R = 820;
const VISIBLE_HALF = 28;
const INDICATOR_X = CX + R;
const MIN_FILLED = 48;

const Wheel = ({ pois, rotation, pickedId, spinning }) => {
  if (!pois.length) return null;

  const reps = Math.max(1, Math.ceil(MIN_FILLED / pois.length));
  const filled = [];
  for (let r = 0; r < reps; r++) {
    pois.forEach((p, i) => filled.push({ poi: p, srcIndex: i, rep: r }));
  }
  const step = 360 / filled.length;

  // Find which filled-entry sits closest to angle 0 (the indicator).
  // Used to highlight the active entry visually.
  let bestEntry = -1;
  let bestAbs = Infinity;
  filled.forEach((entry, i) => {
    const base = i * step;
    let theta = base + rotation;
    while (theta > 180) theta -= 360;
    while (theta < -180) theta += 360;
    const abs = Math.abs(theta);
    if (abs < bestAbs) {
      // If a pick is locked in, prefer copies of that POI
      if (pickedId && entry.poi.id !== pickedId) return;
      bestAbs = abs;
      bestEntry = i;
    }
  });

  return (
    <svg
      className="wheel-svg"
      viewBox={`0 0 ${WHEEL_VB_W} ${WHEEL_VB_H}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Indicator line + dot */}
      <line
        className="indicator-line"
        x1={CX + R - 80}
        y1={CY}
        x2={INDICATOR_X + 12}
        y2={CY}
      />
      <circle className="indicator-dot" cx={INDICATOR_X + 12} cy={CY} r={6} />

      {filled.map((entry, i) => {
        const base = i * step;
        let theta = base + rotation;
        while (theta > 180) theta -= 360;
        while (theta < -180) theta += 360;
        if (Math.abs(theta) > VISIBLE_HALF) return null;

        const rad = (theta * Math.PI) / 180;
        const x = CX + R * Math.cos(rad);
        const y = CY + R * Math.sin(rad);
        const isSelected = i === bestEntry && !spinning;

        const charW = isSelected ? 13 : 11;
        const textW = entry.poi.name.length * charW + 22;

        return (
          <g
            key={`${entry.srcIndex}-${entry.rep}`}
            transform={`translate(${x}, ${y}) rotate(${theta})`}
          >
            {isSelected && (
              <rect
                x={-textW + 8}
                y={-15}
                width={textW}
                height={30}
                rx={2}
                className="poi-bg selected"
              />
            )}
            <text
              x={-8}
              y={6}
              textAnchor="end"
              className={"poi-label" + (isSelected ? " selected" : "")}
            >
              {entry.poi.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

window.Wheel = Wheel;
window.WHEEL_MIN_FILLED = MIN_FILLED;

// Helpers used by the App to compute spin targets that match the wheel layout.
window.wheelLayout = function (poisLength) {
  const reps = Math.max(1, Math.ceil(MIN_FILLED / Math.max(1, poisLength)));
  const totalSlots = poisLength * reps;
  return { reps, totalSlots, step: 360 / totalSlots };
};
