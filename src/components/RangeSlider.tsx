import type { Range } from "../lib/geo";

type Props = {
  range: Range;
  onChange: (next: Range) => void;
  min?: number;
  max?: number;
  step?: number;
};

export function RangeSlider({ range, onChange, min = 0, max = 8, step = 0.25 }: Props) {
  const [a, b] = range;
  const fillLeftPct = ((a - min) / (max - min)) * 100;
  const fillWidthPct = ((b - a) / (max - min)) * 100;

  return (
    <div className="range-row">
      <span style={{ minWidth: 36 }}>{a.toFixed(1)}</span>
      <div className="range-track">
        <div className="rail" />
        <div
          className="filled"
          style={{ left: `${fillLeftPct}%`, width: `${fillWidthPct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={a}
          onChange={(e) => {
            const v = Math.min(parseFloat(e.target.value), b - step);
            onChange([v, b]);
          }}
          aria-label="Minimum distance"
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={b}
          onChange={(e) => {
            const v = Math.max(parseFloat(e.target.value), a + step);
            onChange([a, v]);
          }}
          aria-label="Maximum distance"
        />
      </div>
      <span style={{ minWidth: 36, textAlign: "right" }}>{b.toFixed(1)}</span>
    </div>
  );
}
