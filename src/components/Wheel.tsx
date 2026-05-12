import type { POI } from "../data/pois";
import {
  CX,
  CY,
  R,
  INDICATOR_X,
  VISIBLE_HALF,
  WHEEL_VB_W,
  WHEEL_VB_H,
  wheelLayout,
  normalizeAngle,
} from "../lib/wheel-layout";

type Props = {
  pois: POI[];
  rotation: number;
  pickedId: string | null;
};

type FilledEntry = { poi: POI; srcIndex: number; rep: number };

export function Wheel({ pois, rotation, pickedId }: Props) {
  if (pois.length === 0) return null;

  const { reps, step } = wheelLayout(pois.length);
  const filled: FilledEntry[] = [];
  for (let r = 0; r < reps; r++) {
    pois.forEach((p, i) => filled.push({ poi: p, srcIndex: i, rep: r }));
  }

  let bestEntry = -1;
  let bestAbs = Infinity;
  filled.forEach((entry, i) => {
    const theta = normalizeAngle(i * step + rotation);
    const abs = Math.abs(theta);
    if (abs < bestAbs) {
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
      role="img"
      aria-label="Destination wheel"
    >
      <line
        className="indicator-line"
        x1={CX + R - 80}
        y1={CY}
        x2={INDICATOR_X + 12}
        y2={CY}
      />
      <circle className="indicator-dot" cx={INDICATOR_X + 12} cy={CY} r={6} />

      {filled.map((entry, i) => {
        const theta = normalizeAngle(i * step + rotation);
        if (Math.abs(theta) > VISIBLE_HALF) return null;

        const rad = (theta * Math.PI) / 180;
        const x = CX + R * Math.cos(rad);
        const y = CY + R * Math.sin(rad);
        // Highlight whichever label is currently at the indicator, even mid-spin —
        // gives the wheel a "live cursor" feel as it slows down.
        const isSelected = i === bestEntry;
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
}
