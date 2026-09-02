import type { WeatherReport } from "../lib/weather";
import type { WeatherRule, WeatherVerdict } from "../lib/weather-rules";

import { PrecipGraph } from "./PrecipGraph";

export type ConditionsLineProps = {
  report: WeatherReport | null;
  /** True when the last attempt failed and nothing is in flight. */
  unavailable: boolean;
  /** True when this build does not call the forecast at all. */
  disabled: boolean;
  verdict: WeatherVerdict;
  /** Ids of the rules `derivePool` set aside rather than applied. */
  withdrawn: readonly string[];
  /** The budget the map is drawn at, or null when nothing is capping. */
  appliedBudget: number | null;
  keptCount: number;
  describe: (rule: WeatherRule, appliedBudget: number | null) => string;
  /** Minutes from now the walk must finish by, drawn on the graph. Null when nothing caps. */
  capMinutes: number | null;
};

// Ordinary static text, not a live region: the page already has enough announcers.
export function ConditionsLine(props: ConditionsLineProps) {
  const { verdict } = props;
  const shown = verdict.rules.filter((rule) => !props.withdrawn.includes(rule.id));
  const withdrewSome = verdict.rules.length > shown.length;

  return (
    <>
      {verdict.headline !== null && (
        <p className="conditions">
          {verdict.headline}
          <span className="conditions-credit">
            <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
              Open-Meteo
            </a>
          </span>
        </p>
      )}

      {props.report === null &&
        (props.disabled ? (
          <p className="conditions is-quiet">Forecast is switched off in this build.</p>
        ) : (
          props.unavailable && <p className="conditions is-quiet">No forecast right now.</p>
        ))}

      {props.report !== null && (
        <PrecipGraph
          hours={props.report.hours}
          observedAtMs={props.report.observedAtMs}
          capMinutes={props.capMinutes}
        />
      )}

      {verdict.staleMinutes !== null && (
        <p className="conditions is-quiet">Forecast is {verdict.staleMinutes} min old.</p>
      )}

      {shown.map((rule) => (
        <p key={rule.id} className="notice is-warn">
          {props.describe(rule, props.appliedBudget)}
        </p>
      ))}

      {withdrewSome && (
        <p className="conditions is-quiet">
          Kept the {props.keptCount} places that were left. Some weather rules would have emptied
          the pool.
        </p>
      )}
    </>
  );
}
