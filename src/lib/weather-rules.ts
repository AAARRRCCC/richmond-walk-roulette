/**
 * What the weather means for a walk.
 *
 * `weather.ts` fetches the forecast; this decides what to do about it. The
 * split is the same one `solar.ts` and `daylight.ts` already draw: one side is
 * data that can be checked against a source, the other is a set of product
 * decisions that cannot, and only the second one is worth arguing about.
 *
 * Pure, and importing only types beyond `format.ts`, so `node --test` can
 * type-strip it and every awkward state — a null probability, a report four
 * hours old, a cap three minutes out — is reachable by construction rather than
 * by waiting for weather.
 *
 * **Two passes, and the split is the point: facts first, prose second.** A
 * rule's sentence names the budget the app actually applied, which is only
 * known after every cap — including `daylight-budget`'s, which this module
 * never sees — has been merged and clamped. Composing the sentence from the
 * rule's own candidate cap is how a line reading "Trimmed to 35 min" ends up
 * beside a contour drawn at 20. So this module produces `detail` and App calls
 * `describeWeatherRule` once the number is settled.
 */
import type { Place, Vibe } from "../data/places.ts";
import type { PoolRule } from "../app/eligibility.ts";
import type { CapReason, TimeCap } from "../app/conditions.ts";
import { formatFahrenheit, formatHorizon, formatUv } from "./format.ts";
import type { WeatherReport, WeatherSlot } from "./weather.ts";

/** Every rule this app is willing to change the pool or the dial for. */
export type WeatherRuleId =
  | "rain-window"
  | "storm-window"
  | "heat-shelter"
  | "heat-flat"
  | "uv-shelter"
  | "cold-cap";

/** Apparent temperature at which shade, water and doors start to matter. */
export const HEAT_SHELTER_F = 90;
/** The NWS heat-index Danger band. Above this the hills come out of the pool. */
export const HEAT_DANGER_F = 103;
/** EPA UV index at which a roof or a canopy is worth steering toward. */
export const UV_SHELTER = 8;
/**
 * Apparent temperature at which the walk gets shortened.
 *
 * Deliberately single digits, and deliberately not 28°F. `apparent_temperature`
 * already folds wind chill in, so there is no second formula, and NWS's own
 * frostbite guidance is a wind chill of −19°F for thirty minutes of exposure.
 * 28°F is Tuesday. Filtering places out of a pool at 28°F would be the app
 * inventing a hazard, and this codebase does not do that.
 */
export const COLD_CAP_F = 10;
/** Percent chance at which a slot counts as rain on the strength of odds alone. */
export const RAIN_CHANCE = 55;
/**
 * Inches in the hour at which a slot counts as rain on the strength of amount.
 *
 * **Raised from 0.01, which was a trace and a mistake.** The two tests are
 * OR'd, so at 0.01 any hour carrying a rounding error of precipitation capped
 * the dial no matter how unlikely the forecast said it was - observed live at
 * 0.189 in with a 40% chance, which is a forecast more likely to be wrong than
 * right, shortening somebody's walk on the strength of it.
 *
 * 0.05 in/hr is light but unmistakable rain rather than a damp reading, and it
 * still has to clear {@link RAIN_CHANCE_FLOOR} before it counts.
 */
export const RAIN_INCHES = 0.05;
/**
 * The odds an amount forecast must also clear before it may cap a walk.
 *
 * Capping is a strong action - it takes reach away from somebody who asked for
 * it - so it should need a signal in both dimensions: enough rain to matter AND
 * enough chance to believe. Below this the amount is reported in the conditions
 * line, where it informs, and changes nothing about the dial.
 */
export const RAIN_CHANCE_FLOOR = 35;
/** Minutes of headroom between the walk ending and the rain starting. */
export const CAP_MARGIN_MINUTES = 5;
/** More headroom for a storm than for rain: getting wet is not being outdoors in one. */
export const STORM_MARGIN_MINUTES = 15;
/** How short a heat or cold cap makes the outing. */
export const SHORT_WALK_MINUTES = 30;
/**
 * The anti-ratchet quantiser.
 *
 * A raw `onsetMinutes - CAP_MARGIN_MINUTES` falls by one minute every minute as
 * the rain approaches: the contour would redraw, the readout would change, and
 * `candidateKey` would churn once a minute, resetting the route warm-up timer
 * each time. Quantised down to five, the cap still moves — the rain is still
 * coming — but at most once every five minutes, which is slow enough for a
 * warm-up to finish between steps.
 */
export const CAP_GRID_MINUTES = 5;
/** Refresh windows a report may be behind before its age is a line on screen. */
export const STALE_MULTIPLE = 3;
/** WMO codes for thunderstorm, with and without hail. */
export const WMO_THUNDER: ReadonlySet<number> = new Set([95, 96, 99]);

/**
 * One rule that fired.
 *
 * Everything a rule wants is on the rule, so a withdrawal can always be
 * attributed to the rule that caused it — which is the contract
 * `eligibility.ts` is promised. There is deliberately no `withdrawn` field:
 * withdrawal is not knowable here. It is decided by `derivePool` against the
 * pool the reader's own filters produced.
 */
export type WeatherRule = {
  readonly id: WeatherRuleId;
  /**
   * One sentence, sentence case, no trailing period, with no number in it that
   * this module cannot guarantee. `describeWeatherRule` adds the budget.
   */
  readonly detail: string;
  /** The cap this rule asks for, if it asks for one. */
  readonly cap: TimeCap | null;
  /** Non-null when this rule wants candidates carrying one of these tags. */
  readonly preferredTags: readonly Vibe[] | null;
  /** True when this rule wants places up a hill out of the pool. */
  readonly vetoHilly: boolean;
};

export type WeatherVerdict = {
  /** The one-line summary. Null when there is no forecast at all. */
  readonly headline: string | null;
  /**
   * How old the report is, whole minutes, once that age has passed
   * `STALE_MULTIPLE` refresh windows. Null while it is fresh. Non-null is a
   * line on screen: a cap derived from hours-old data has to say so.
   */
  readonly staleMinutes: number | null;
  /** Every rule that fired, in the order evaluated. */
  readonly rules: readonly WeatherRule[];
};

/** What `deriveWeatherRules` needs that is not the forecast. */
export type WeatherInputs = {
  /** Epoch ms. Frozen during a throw. */
  readonly nowMs: number;
  /**
   * The walk the reader asked for, total minutes — both legs, when there are
   * two. `Session.requestedBudgetMinutes`, never the capped one: a window
   * derived from a budget this module's own cap produced is a loop that eats
   * itself, and the rule withdraws the cap that made it.
   */
  readonly budgetMinutes: number;
  /** `dialMinimum(roundTrip)`. A cap is never allowed below this. */
  readonly dialMinimumMinutes: number;
  /** The switch. False means text only: no caps, no preference, no veto. */
  readonly weatherAware: boolean;
};

const EMPTY: WeatherVerdict = { headline: null, staleMinutes: null, rules: [] };

/**
 * A candidate cap, quantised and clamped, or null when it is not a cap at all.
 *
 * A "cap" equal to the dial position is not a cap: reporting null is what keeps
 * a no-op rule from claiming a trim it did not perform, and what keeps the
 * dial's dead zone from appearing over nothing.
 */
function capAt(
  rawMinutes: number,
  untilMs: number,
  reason: CapReason,
  inputs: WeatherInputs,
): TimeCap | null {
  const gridded = CAP_GRID_MINUTES * Math.floor(rawMinutes / CAP_GRID_MINUTES);
  const clamped = Math.min(
    inputs.budgetMinutes,
    Math.max(inputs.dialMinimumMinutes, gridded),
  );
  return clamped < inputs.budgetMinutes ? { minutes: clamped, reason, untilMs } : null;
}

/** Whether a slot is wet enough to walk out of. Null is unknown, never zero. */
function isWet(slot: WeatherSlot): boolean {
  // Likely on its own: the odds are past the point where a walker would take a
  // coat, whatever the amount is forecast to be.
  if (slot.precipChance !== null && slot.precipChance >= RAIN_CHANCE) return true;
  // Or enough rain to matter AND enough chance to believe. Both, not either -
  // see RAIN_INCHES for the live case that proved OR was wrong.
  if (slot.precipInches === null || slot.precipInches < RAIN_INCHES) return false;
  return slot.precipChance === null || slot.precipChance >= RAIN_CHANCE_FLOOR;
}

/**
 * The always-shown sentence, independent of the switch.
 *
 * One or two clauses, never three: "72°F, feels 74. Rain likely in 40 min" is a
 * sentence you act on, and a third clause is the one nobody reads.
 *
 * @public - exported for `weather-rules.test.ts`.
 */
export function composeHeadline(
  now: WeatherSlot,
  onsetMinutes: number | null,
  peakUv: number | null,
): string {
  const parts = [`${formatFahrenheit(now.temperatureF)}, feels ${Math.round(now.feelsLikeF)}°`];
  if (onsetMinutes !== null) parts.push(`Rain likely ${formatHorizon(onsetMinutes)}`);
  else if (peakUv !== null && peakUv >= UV_SHELTER) parts.push(formatUv(peakUv));
  return parts.join(". ");
}

/**
 * The whole rule table.
 *
 * Every rule is evaluated across the *return* time, not just at departure:
 * `budgetMinutes` is already the wall-clock length of the outing, round trip or
 * not, so the window is the walk.
 */
export function deriveWeatherRules(
  report: WeatherReport | null,
  inputs: WeatherInputs,
): WeatherVerdict {
  if (report === null) return EMPTY;

  // Re-age against the tick: the edge may have held this payload for a whole
  // refresh window before the browser ever saw it.
  const ageMinutes = (inputs.nowMs - report.observedAtMs) / 60_000;
  const staleAfter = (STALE_MULTIPLE * report.refreshSeconds) / 60;
  const staleMinutes = ageMinutes > staleAfter ? Math.round(ageMinutes) : null;

  const window = inputs.budgetMinutes;
  // -60 keeps the hour already in progress, which is the one you walk out into.
  const slots = report.hours.filter((slot) => {
    const at = slot.atMinutes - ageMinutes;
    return at >= -60 && at <= window;
  });
  const hasHourly = slots.length > 0;
  const usable = hasHourly ? slots : [report.now];

  /** Minutes from now to a slot, which is what every horizon in here means. */
  const fromNow = (slot: WeatherSlot): number => Math.round(slot.atMinutes - ageMinutes);

  const wet = hasHourly ? slots.find(isWet) : undefined;
  const onsetMinutes = wet === undefined ? null : Math.max(0, fromNow(wet));

  const daylit = usable.filter((slot) => slot.isDay);
  const uvSlots = usable.filter((slot) => slot.uvIndex !== null);
  const peakUv =
    uvSlots.length === 0
      ? null
      : Math.max(...uvSlots.map((slot) => slot.uvIndex ?? 0));

  const headline = composeHeadline(
    report.now,
    onsetMinutes !== null && onsetMinutes < window ? onsetMinutes : null,
    peakUv,
  );

  if (!inputs.weatherAware) return { headline, staleMinutes, rules: [] };

  const rules: WeatherRule[] = [];

  if (onsetMinutes !== null && onsetMinutes < window) {
    rules.push({
      id: "rain-window",
      detail: `Rain likely ${formatHorizon(onsetMinutes)}`,
      cap: capAt(
        onsetMinutes - CAP_MARGIN_MINUTES,
        inputs.nowMs + onsetMinutes * 60_000,
        "rain",
        inputs,
      ),
      preferredTags: null,
      vetoHilly: false,
    });
  }

  const storm = hasHourly
    ? slots.find((slot) => WMO_THUNDER.has(slot.weatherCode))
    : undefined;
  if (storm !== undefined) {
    const stormMinutes = Math.max(0, fromNow(storm));
    if (stormMinutes < window) {
      rules.push({
        id: "storm-window",
        detail: `Thunderstorms ${formatHorizon(stormMinutes)}`,
        cap: capAt(
          stormMinutes - STORM_MARGIN_MINUTES,
          inputs.nowMs + stormMinutes * 60_000,
          "storm",
          inputs,
        ),
        preferredTags: null,
        vetoHilly: false,
      });
    }
  }

  // The daylit slots, when there are any: 96°F at 3am is a number nobody is
  // walking out into, and the peak that matters is the one in the sun.
  const heatSlots = daylit.length > 0 ? daylit : usable;
  const peakFeels = Math.max(...heatSlots.map((slot) => slot.feelsLikeF));
  if (peakFeels >= HEAT_SHELTER_F) {
    rules.push({
      id: "heat-shelter",
      detail: `Feels ${Math.round(peakFeels)}°F. Steering toward shade, water and doors`,
      cap: null,
      preferredTags: ["river", "park", "museum", "food"],
      vetoHilly: false,
    });
  }
  if (peakFeels >= HEAT_DANGER_F) {
    rules.push({
      id: "heat-flat",
      detail: "Heat index in the danger band. Flat routes only",
      cap: capAt(
        SHORT_WALK_MINUTES,
        inputs.nowMs + SHORT_WALK_MINUTES * 60_000,
        "heat",
        inputs,
      ),
      preferredTags: null,
      vetoHilly: true,
    });
  }

  if (peakUv !== null && peakUv >= UV_SHELTER && usable.some((slot) => slot.isDay)) {
    rules.push({
      id: "uv-shelter",
      detail: `${formatUv(peakUv)}. Somewhere with a roof or a canopy`,
      cap: null,
      preferredTags: ["park", "museum", "food"],
      vetoHilly: false,
    });
  }

  const lowFeels = Math.min(...usable.map((slot) => slot.feelsLikeF));
  if (lowFeels <= COLD_CAP_F) {
    rules.push({
      id: "cold-cap",
      detail: `Feels ${Math.round(lowFeels)}°F. Kept it short`,
      cap: capAt(
        SHORT_WALK_MINUTES,
        inputs.nowMs + SHORT_WALK_MINUTES * 60_000,
        "cold",
        inputs,
      ),
      preferredTags: ["museum", "food"],
      vetoHilly: false,
    });
  }

  return { headline, staleMinutes, rules };
}

/**
 * The second pass: the rule's sentence, once the budget is settled.
 *
 * **It no longer says "Trimmed to N min", because nothing is trimmed.** Weather
 * stopped moving the dial: a cap that falls as the rain approaches re-clamped
 * the budget on every tick, so a reader dragging the slider up watched it
 * thrown back, repeatedly, over a limit they never asked for. See
 * `effectiveCap`.
 *
 * What replaces it is the same fact stated as a warning the reader can act on
 * or ignore: how long the walk on the dial actually is against how long the
 * weather leaves them. `appliedBudget` is what the map is drawn at, which is
 * now simply the dial - it stays a parameter because the daylight cap can still
 * move it, and a sentence naming a budget nobody is walking is the thing this
 * function exists to avoid.
 */
export function describeWeatherRule(rule: WeatherRule, appliedBudget: number | null): string {
  if (rule.cap === null || appliedBudget === null) return rule.detail;
  return appliedBudget > rule.cap.minutes
    ? `${rule.detail}. A ${appliedBudget} min walk will not be back before it`
    : rule.detail;
}

/**
 * Every cap the fired rules ask for, for `mergeCaps`.
 *
 * @public - consumed by App, which merges them with the daylight cap.
 */
export function weatherCaps(verdict: WeatherVerdict): readonly (TimeCap | null)[] {
  return verdict.rules.map((rule) => rule.cap);
}

/**
 * The smallest pool a weather rule may leave behind.
 *
 * Three is the smallest number where a spin still feels like a spin; at two the
 * reel is a coin flip wearing a costume. Below it the rule sets itself aside and
 * `derivePool` reports which - a `minSurvivors` on the rule rather than a check
 * at the call site, because withdrawal and the reporting that goes with it are
 * one thing and `eligibility.ts` owns both.
 *
 * A cap is deliberately exempt. A cap is the one weather effect you can *see* -
 * the contour shrinks, the readout follows it, the reason is on screen - so it
 * is allowed to empty the pool. The two invisible rules are the guarded ones.
 */
export const MIN_SURVIVORS = 3;

/** What `toPoolRules` needs from the app that this module cannot know. */
export type PoolRuleOptions = {
  /** The budget the map is drawn at, for the rule's sentence. */
  readonly appliedBudget: number | null;
  /**
   * The climb rule's signature half: how many routes have settled. It belongs
   * in the signature and the temperature does not - the veto's verdicts move
   * when a route lands, never when the forecast does.
   */
  readonly climbSignature: string;
  /** Measured per route, from the origin in force. Never a tag on a dot. */
  readonly isHilly: (place: Place) => boolean;
  /** What the empty-pool button and the drawer's fix both press. */
  readonly clear: () => void;
};

/**
 * The weather's contribution to the pool: one `PoolRule` per fired rule that
 * has something to say about a *place*.
 *
 * The time rules say nothing about places - they arrive as `TimeCap`s and go
 * through the dial - so they produce no rule here and cannot remove a
 * candidate. That asymmetry is the design, not an omission.
 *
 * Each preference is an allow-list, intersected with the pool the reader's own
 * vibe chips already produced, one rule at a time. If they have selected
 * `history` and `uv-shelter` prefers park/museum/food, the intersection is
 * empty and the guard withdraws *that rule specifically* - which is exactly why
 * preferences live on the rule rather than merged into one flat set. The
 * reader's stated intent wins, with no special case, and the withdrawal stays
 * attributable to one named rule.
 */
export function toPoolRules(
  verdict: WeatherVerdict,
  options: PoolRuleOptions,
): readonly PoolRule[] {
  return verdict.rules.flatMap((rule): PoolRule[] => {
    const shared = {
      id: rule.id,
      reason: "weather" as const,
      active: true,
      clearLabel: "Ignore the weather",
      clear: options.clear,
      minSurvivors: MIN_SURVIVORS,
      detail: describeWeatherRule(rule, options.appliedBudget),
    };

    if (rule.vetoHilly) {
      return [
        {
          ...shared,
          // Deferred for the same reason the climb chip is: it decides on data
          // that arrives per place, and a place it has not measured yet must
          // stay in the warm-up's denominator rather than fall out of it.
          deferred: true,
          signature: `hilly${options.climbSignature}`,
          excludes: options.isHilly,
        },
      ];
    }

    const tags = rule.preferredTags;
    if (tags === null) return [];
    return [
      {
        ...shared,
        // The tag set, and nothing else. The rule's own sentence carries a
        // temperature that moves with every refresh; its verdicts do not, and a
        // signature that moved with the sentence would churn the memo.
        signature: tags.join("+"),
        excludes: (place) => !place.tags.some((tag) => tags.includes(tag)),
      },
    ];
  });
}
