import { formatClock } from "../lib/format";
import type { WeatherSlot } from "../lib/weather";

export type PrecipGraphProps = {
  /** The forecast's hourly slots, in order. Only the next few hours are drawn. */
  hours: readonly WeatherSlot[];
  /** Epoch ms the report was observed, so a slot's offset becomes a clock time. */
  observedAtMs: number;
  /**
   * Minutes from now at which the dial is capped, or null when nothing is
   * capping it. Drawn as the line the walk has to finish before.
   */
  capMinutes: number | null;
};

/** User units. The element is width 100%; the viewBox keeps the maths whole. */
const W = 300;
const H = 44;
/** How far ahead is worth drawing. Past this it is tomorrow's problem. */
const HORIZON_MINUTES = 360;
/**
 * The vertical window's floor, in inches per hour.
 *
 * The same mechanism as the elevation chart's `PROFILE_MIN_RANGE_M`, for the
 * same reason: without a floor, a drizzle of 0.004 in would be drawn to full
 * height and read as a downpour. A window of 0.1 in/hr means light rain looks
 * light. There is no "flat" branch, because there does not need to be one.
 */
const MIN_RANGE_INCHES = 0.1;

/**
 * What the sky is going to do, drawn.
 *
 * **This exists because somebody lost half their dial to rain and went looking
 * for a bug in a different feature.** The cap was correct, the cap note said
 * so, and neither of those told them that rain was coming at 1am — a sentence
 * about a limit is not the same as seeing the weather arrive. The whole
 * argument for the elevation chart applies here unchanged: a number says how
 * much, a shape says what it is going to be like.
 *
 * Amount, not probability. Probability is what the headline sentence already
 * carries, and it is the wrong thing to draw — a flat 40% band tells a walker
 * nothing about whether to leave now, while a rising wedge at 1am does.
 */
export function PrecipGraph(props: PrecipGraphProps) {
  const slots = props.hours.filter(
    (slot) => slot.atMinutes >= 0 && slot.atMinutes <= HORIZON_MINUTES,
  );
  // Two points make a line; one makes a dot nobody can read.
  if (slots.length < 2) return null;

  const amounts = slots.map((slot) => slot.precipInches ?? 0);
  const peak = Math.max(MIN_RANGE_INCHES, ...amounts);
  // Nothing at all forecast is not a graph, it is a flat line pretending to be
  // one. The conditions line already says the sky is clear.
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
      <figcaption className="precip-caption">
        {/* Both ends named, because a graph with no clock on it is a shape.
            Nothing labels the dashed line here: a caption in the middle of a
            flex row points at the middle of the graph, not at the line, and a
            label indicating a place it does not mark is worse than no label.
            The dial's own cap note sits directly above and names it. */}
        <span>{formatClock(props.observedAtMs)}</span>
        <span>{formatClock(props.observedAtMs + span * 60_000)}</span>
      </figcaption>
    </figure>
  );
}
