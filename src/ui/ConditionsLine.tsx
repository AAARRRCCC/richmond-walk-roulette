import type { WeatherReport } from "../lib/weather";
import type { WeatherRule, WeatherVerdict } from "../lib/weather-rules";

export type ConditionsLineProps = {
  report: WeatherReport | null;
  /** True when the last attempt failed and nothing is in flight. */
  unavailable: boolean;
  /** True when this build does not call the forecast at all. See `WEATHER_ENABLED`. */
  disabled: boolean;
  verdict: WeatherVerdict;
  /** Ids of the rules `derivePool` set aside rather than applied. */
  withdrawn: readonly string[];
  /** The budget the map is actually drawn at, or null when nothing is capping. */
  appliedBudget: number | null;
  /** The pool size, for the withdrawal sentence. */
  keptCount: number;
  /** The rule's sentence, once the budget is settled. */
  describe: (rule: WeatherRule, appliedBudget: number | null) => string;
};

/**
 * What the weather is, and what the app did about it.
 *
 * The last thing read before the decision to press Spin, which is why it sits
 * under the readout rather than in the drawer: the cause of a shrunken pool has
 * to be visible on a phone with the filters collapsed.
 *
 * No weather glyph is imported at all. A sun and a cloud and a raindrop are
 * three kilobytes for something the sentence already says, and the house note
 * about rotating a caret rather than importing a second shape applies here too.
 *
 * Not a live region, deliberately. The page already carries `role="alert"` on
 * the location and failure notices and `role="status"` on the short-reel notice
 * and the sr-only result line; a fifth announcer competing with those is how a
 * page becomes unusable with a screen reader. This is ordinary static text in
 * the panel, reachable by navigation.
 */
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

      {/* Neutral, not `is-warn`: an absent forecast is not a failure of this
          app's promise, and nothing is waiting on it. Only when there is no
          report at all - saying "no forecast" beside a real headline is a
          contradiction, and the staleness line below covers that case. */}
      {props.report === null &&
        (props.disabled ? (
          <p className="conditions is-quiet">Forecast is switched off in this build.</p>
        ) : (
          props.unavailable && <p className="conditions is-quiet">No forecast right now.</p>
        ))}

      {/* Fires whether or not refreshes are currently failing. It is the line
          that keeps a cap derived from hours-old data honest. */}
      {verdict.staleMinutes !== null && (
        <p className="conditions is-quiet">Forecast is {verdict.staleMinutes} min old.</p>
      )}

      {shown.map((rule) => (
        <p key={rule.id} className="notice is-warn">
          {props.describe(rule, props.appliedBudget)}
        </p>
      ))}

      {/* The "never silently hide" promise, made visible from the other
          direction: a rule that would have emptied the pool is not shown as if
          it had bitten, and its absence is stated rather than left to be
          noticed. */}
      {withdrewSome && (
        <p className="conditions is-quiet">
          Kept the {props.keptCount} places that were left — some weather rules would have emptied
          the pool.
        </p>
      )}
    </>
  );
}
