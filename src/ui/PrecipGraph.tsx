import { formatClock } from "../lib/format";
import type { WeatherSlot } from "../lib/weather";

export type PrecipGraphProps = {
  /** Hourly slots in order. Only the next few hours are drawn. */
  hours: readonly WeatherSlot[];
  /** Epoch ms the report was observed, so a slot's offset becomes a clock time. */
  observedAtMs: number;
  /** Minutes from now at which the dial is capped, drawn as a line. Null when nothing caps. */
  capMinutes: number | null;
};

/** viewBox units; the element is width 100%. */
const W = 300;
const H = 44;
const HORIZON_MINUTES = 360;
/** Floor on the vertical window, in inches per hour, so drizzle does not draw as a downpour. */
const MIN_RANGE_INCHES = 0.1;

// Draws amount, not probability: a rising wedge at 1am says more than a flat 40% band.
export function PrecipGraph(props: PrecipGraphProps) {
  const slots = props.hours.filter(
    (slot) => slot.atMinutes >= 0 && slot.atMinutes <= HORIZON_MINUTES,
  );
  if (slots.length < 2) return null;

  const amounts = slots.map((slot) => slot.precipInches ?? 0);
  const peak = Math.max(MIN_RANGE_INCHES, ...amounts);
  // Nothing forecast is a flat line, and the conditions line already says the sky is clear.
  if (peak <= MIN_RANGE_INCHES && amounts.every((inches) => inches === 0)) return null;

  const span = Math.max(1, HORIZON_MINUTES);
  const x = (minutes: number) => (minutes / span) * W;
  const y = (inches: number) => H - (inches / peak) * H;

  const points = slots.map((slot, i) => `${x(slot.atMinutes)},${y(amounts[i] ?? 0)}`);
  const area = `M0,${H} L${points.join(" L")} L${x(slots.at(-1)?.atMinutes ?? 0)},${H} Z`;
  const line = `M${points.join(" L")}`;

  const capX = props.capMinutes === null ? null : x(Math.min(props.capMinutes, span));
  const wettest = slots[amounts.indexOf(Math.max(...amounts))];

  return (
    <figure className="precip">
      <svg
        className="precip-chart"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={
          wettest === undefined
            ? "Rain forecast for the next six hours."
            : `Rain forecast: heaviest around ${formatClock(props.observedAtMs + wettest.atMinutes * 60_000)}.`
        }
      >
        <path className="precip-area" d={area} />
        <path className="precip-line" d={line} />
        {capX !== null && <line className="precip-cap" x1={capX} y1="0" x2={capX} y2={H} />}
      </svg>
      {/* The dashed cap line is named by the dial's cap note above, not here. */}
      <figcaption className="precip-caption">
        <span>{formatClock(props.observedAtMs)}</span>
        <span>{formatClock(props.observedAtMs + span * 60_000)}</span>
      </figcaption>
    </figure>
  );
}
