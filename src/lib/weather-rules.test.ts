/**
 * The rule table, at a fixed clock.
 *
 * Every case here is one this app would otherwise have to wait for weather to
 * see: a null probability past the model's horizon, a report an hour stale, a
 * rain onset three minutes out, a heat index in the NWS Danger band. None of
 * them is reachable in Richmond on demand, and all of them change what the app
 * puts on screen, so all of them are constructed.
 *
 * `nowMs` is injected everywhere and `Date.now()` appears nowhere.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeCaps } from "../app/conditions.ts";
import { derivePool, type PoolConditions } from "../app/eligibility.ts";
import type { Place } from "../data/places.ts";
import type { Band, Reach } from "./isochrone.ts";
import type { MultiPolygon, Ring } from "./geometry.ts";
import {
  CAP_GRID_MINUTES,
  CAP_MARGIN_MINUTES,
  COLD_CAP_F,
  HEAT_DANGER_F,
  HEAT_SHELTER_F,
  MIN_SURVIVORS,
  RAIN_CHANCE,
  RAIN_CHANCE_FLOOR,
  RAIN_INCHES,
  SHORT_WALK_MINUTES,
  STALE_MULTIPLE,
  STORM_MARGIN_MINUTES,
  UV_SHELTER,
  WMO_THUNDER,
  deriveWeatherRules,
  describeWeatherRule,
  toPoolRules,
  weatherCaps,
  type WeatherInputs,
  type WeatherRuleId,
  type WeatherVerdict,
} from "./weather-rules.ts";
import type { WeatherReport, WeatherSlot } from "./weather.ts";

const NOW_MS = Date.parse("2026-08-21T18:00:00Z");
const MINUTE = 60_000;

const INPUTS: WeatherInputs = {
  nowMs: NOW_MS,
  budgetMinutes: 50,
  dialMinimumMinutes: 10,
  weatherAware: true,
};

/** A benign slot: 72°F, dry, low sun. Everything below overrides one field. */
const slot = (over: Partial<WeatherSlot> = {}): WeatherSlot => ({
  atMinutes: 0,
  temperatureF: 72,
  feelsLikeF: 74,
  precipInches: 0,
  precipChance: 8,
  weatherCode: 3,
  windMph: 6,
  uvIndex: 2,
  isDay: true,
  ...over,
});

/**
 * A benign report, observed exactly now, with hourly slots on the quarter hour.
 *
 * Quarter-hour slots rather than the real hourly ones, deliberately: the rules
 * are about minutes to an onset and the fixture should be able to place one at
 * 40 minutes without pretending the model has that resolution. Nothing in
 * `deriveWeatherRules` reads the spacing.
 */
function baseReport(hours: WeatherSlot[] = [], observedAtMs = NOW_MS): WeatherReport {
  return {
    observedAtMs,
    refreshSeconds: 900,
    now: slot(),
    hours:
      hours.length > 0
        ? hours
        : [-15, 15, 45, 75].map((atMinutes) => slot({ atMinutes })),
    source: "open-meteo",
  };
}

/** Benign slots, plus one that carries the hazard, at `atMinutes`. */
function withSlotAt(atMinutes: number, over: Partial<WeatherSlot>): WeatherSlot[] {
  return [slot({ atMinutes: -15 }), slot({ atMinutes, ...over }), slot({ atMinutes: atMinutes + 60 })];
}

/** Every slot the same, which is how a heat or cold case is stated. */
function everySlot(over: Partial<WeatherSlot>): WeatherSlot[] {
  return [-15, 15, 45].map((atMinutes) => slot({ atMinutes, ...over }));
}

const ids = (verdict: WeatherVerdict): WeatherRuleId[] => verdict.rules.map((rule) => rule.id);
const ruleNamed = (verdict: WeatherVerdict, id: WeatherRuleId) =>
  verdict.rules.find((rule) => rule.id === id);

test("no report means no rules, no cap and no headline", () => {
  const verdict = deriveWeatherRules(null, INPUTS);
  assert.equal(verdict.headline, null);
  assert.equal(verdict.staleMinutes, null);
  assert.deepEqual(verdict.rules, []);
});

test("the switch gates rules, never text", () => {
  const report = baseReport(withSlotAt(40, { precipChance: RAIN_CHANCE + 5 }));
  const off = deriveWeatherRules(report, { ...INPUTS, weatherAware: false });

  assert.ok(off.headline !== null);
  assert.match(off.headline, /Rain likely/);
  assert.deepEqual(off.rules, [], "the forecast is stated whatever the switch says");
  assert.deepEqual(mergeCaps(weatherCaps(off)), null);
});

test("rain 40 minutes out on a 50-minute round trip caps at 35", () => {
  const verdict = deriveWeatherRules(
    baseReport(withSlotAt(40, { precipChance: RAIN_CHANCE + 5 })),
    INPUTS,
  );

  assert.deepEqual(ids(verdict), ["rain-window"]);
  const cap = ruleNamed(verdict, "rain-window")?.cap;
  assert.equal(cap?.minutes, 40 - CAP_MARGIN_MINUTES);
  assert.equal(cap?.reason, "rain");
  assert.equal(cap?.untilMs, NOW_MS + 40 * MINUTE);
});

test("measured precipitation counts as rain only when the chance is believable", () => {
  // REWRITTEN, 2026-08-22, after the old contract shortened a real walk.
  //
  // This used to assert that any amount at or over the threshold counted as
  // rain "even when the chance does not" - the two tests were OR'd. Live
  // forecast: 0.189 in at a 40% chance, which capped the dial on an outcome
  // more likely not to happen than to happen, and the walker had no idea why
  // half their dial had gone. The amount path now has to clear the odds floor
  // as well.
  const believable = deriveWeatherRules(
    baseReport(
      withSlotAt(40, { precipChance: RAIN_CHANCE_FLOOR, precipInches: RAIN_INCHES }),
    ),
    INPUTS,
  );
  assert.deepEqual(ids(believable), ["rain-window"], "enough rain and enough chance");

  const unlikely = deriveWeatherRules(
    baseReport(
      withSlotAt(40, { precipChance: RAIN_CHANCE_FLOOR - 1, precipInches: RAIN_INCHES * 4 }),
    ),
    INPUTS,
  );
  assert.deepEqual(ids(unlikely), [], "a lot of rain nobody expects caps nothing");

  const trace = deriveWeatherRules(
    baseReport(withSlotAt(40, { precipChance: 90, precipInches: RAIN_INCHES / 10 })),
    INPUTS,
  );
  assert.deepEqual(ids(trace), ["rain-window"], "and high odds still stand on their own");

  // And the null case from the other side: unknown is not wet.
  const unknown = deriveWeatherRules(
    baseReport(withSlotAt(40, { precipChance: null, precipInches: null })),
    INPUTS,
  );
  assert.deepEqual(ids(unknown), []);
});

test("rain outside the window caps nothing and is not claimed in the headline", () => {
  const verdict = deriveWeatherRules(
    baseReport(withSlotAt(40, { precipChance: RAIN_CHANCE + 5 })),
    { ...INPUTS, budgetMinutes: 30 },
  );

  assert.deepEqual(ids(verdict), []);
  // The slot is outside the walk, so it is outside the sentence too: a headline
  // naming rain the walk never meets is a reason to shorten a walk for nothing.
  assert.equal(String(verdict.headline).includes("Rain"), false);
});

test("a stale report re-ages its own onset", () => {
  const verdict = deriveWeatherRules(
    baseReport(withSlotAt(40, { precipChance: RAIN_CHANCE + 5 }), NOW_MS - 12 * MINUTE),
    INPUTS,
  );

  const rule = ruleNamed(verdict, "rain-window");
  assert.ok(rule);
  // 40 minutes from the reading, twelve of which have passed: 28 from now, less
  // the margin is 23, quantised down to 20.
  assert.equal(rule.cap?.minutes, 20);
  assert.match(describeWeatherRule(rule, 20), /Trimmed to 20 min$/);
});

test("dangerous heat steers toward shade, water and doors without capping", () => {
  const verdict = deriveWeatherRules(
    baseReport(everySlot({ feelsLikeF: HEAT_SHELTER_F + 6, isDay: true })),
    INPUTS,
  );

  assert.deepEqual(ids(verdict), ["heat-shelter"]);
  const rule = ruleNamed(verdict, "heat-shelter");
  assert.deepEqual(rule?.preferredTags, ["river", "park", "museum", "food"]);
  assert.equal(rule?.vetoHilly, false);
  assert.equal(rule?.cap, null);
});

test("the Danger band takes the hills out and shortens the walk", () => {
  const verdict = deriveWeatherRules(
    baseReport(everySlot({ feelsLikeF: HEAT_DANGER_F + 2, isDay: true })),
    INPUTS,
  );

  const flat = ruleNamed(verdict, "heat-flat");
  assert.equal(flat?.vetoHilly, true);
  assert.equal(flat?.cap?.minutes, SHORT_WALK_MINUTES);
  assert.equal(flat?.cap?.reason, "heat");
});

test("UV fires on its own rule, not merged into the heat one", () => {
  const verdict = deriveWeatherRules(
    baseReport(everySlot({ feelsLikeF: HEAT_SHELTER_F + 6, uvIndex: UV_SHELTER + 1 })),
    INPUTS,
  );

  const uv = ruleNamed(verdict, "uv-shelter");
  assert.deepEqual(uv?.preferredTags, ["park", "museum", "food"]);
  // Separate rules, separate allow-lists: merging them into one flat set is how
  // a withdrawal stops being attributable to anything.
  assert.deepEqual(ruleNamed(verdict, "heat-shelter")?.preferredTags, [
    "river",
    "park",
    "museum",
    "food",
  ]);
});

test("a null UV is unknown, not zero and not eleven", () => {
  const verdict = deriveWeatherRules(baseReport(everySlot({ uvIndex: null })), INPUTS);

  assert.equal(ids(verdict).includes("uv-shelter"), false);
  assert.equal(String(verdict.headline).includes("UV"), false);
});

test("28°F produces no rules at all", () => {
  // The explicit no-op. `apparent_temperature` already folds wind chill in, and
  // 28°F is Tuesday: filtering places out of a pool over it would be this app
  // inventing a hazard.
  const report = { ...baseReport(everySlot({ feelsLikeF: 28, temperatureF: 33, uvIndex: 0 })) };
  const verdict = deriveWeatherRules({ ...report, now: slot({ temperatureF: 33, feelsLikeF: 28 }) }, INPUTS);

  assert.deepEqual(verdict.rules, []);
  assert.equal(verdict.headline, "33°F, feels 28°");
});

test("single-digit apparent cold keeps it short and indoors", () => {
  const verdict = deriveWeatherRules(
    baseReport(everySlot({ feelsLikeF: COLD_CAP_F - 5, temperatureF: 14, isDay: true })),
    INPUTS,
  );

  const cold = ruleNamed(verdict, "cold-cap");
  assert.equal(cold?.cap?.minutes, SHORT_WALK_MINUTES);
  assert.equal(cold?.cap?.reason, "cold");
  assert.deepEqual(cold?.preferredTags, ["museum", "food"]);
});

test("two caps take the binding one, and every reason names it", () => {
  // Rain and thunder at the same hour: the storm's wider margin makes it the
  // binding cap even though the rain's onset is identical.
  const verdict = deriveWeatherRules(
    baseReport(withSlotAt(40, { precipChance: RAIN_CHANCE + 5, weatherCode: 95 })),
    INPUTS,
  );

  const cap = mergeCaps(weatherCaps(verdict));
  assert.equal(cap?.minutes, 40 - STORM_MARGIN_MINUTES);

  const sentences = verdict.rules.map((rule) => describeWeatherRule(rule, cap?.minutes ?? null));
  assert.equal(sentences.length, 2);
  for (const sentence of sentences) {
    assert.match(sentence, /Trimmed to 25 min$/, sentence);
    assert.equal(sentence.includes("35"), false, `it must not advertise a 35 that never happened: ${sentence}`);
  }
});

test("a cap below the dial minimum clamps, and no sentence shows a negative", () => {
  const verdict = deriveWeatherRules(
    baseReport(withSlotAt(3, { precipChance: RAIN_CHANCE + 5 })),
    INPUTS,
  );

  const cap = mergeCaps(weatherCaps(verdict));
  assert.equal(cap?.minutes, INPUTS.dialMinimumMinutes);
  for (const rule of verdict.rules) {
    assert.equal(describeWeatherRule(rule, cap?.minutes ?? null).includes("-"), false);
  }
});

test("a cap that does not bind reports no cap at all", () => {
  // A heat cap of 30 against a dial already at 30 is not a trim, and a rule
  // claiming one would put a dead zone on screen over nothing.
  const verdict = deriveWeatherRules(
    baseReport(everySlot({ feelsLikeF: HEAT_DANGER_F + 2, isDay: true })),
    { ...INPUTS, budgetMinutes: SHORT_WALK_MINUTES },
  );

  const flat = ruleNamed(verdict, "heat-flat");
  assert.ok(flat);
  assert.equal(flat.cap, null);
  assert.equal(mergeCaps(weatherCaps(verdict)), null);
  assert.equal(describeWeatherRule(flat, null).includes("Trimmed"), false);
});

test("the cap steps once every five minutes, not once a minute", () => {
  // The anti-ratchet quantiser, which is what keeps `candidateKey` from
  // churning on the tick and restarting the route warm-up every sixty seconds.
  const report = baseReport(withSlotAt(42, { precipChance: RAIN_CHANCE + 5 }));
  const capAt = (offsetMinutes: number): number | null =>
    mergeCaps(
      weatherCaps(deriveWeatherRules(report, { ...INPUTS, nowMs: NOW_MS + offsetMinutes * MINUTE })),
    )?.minutes ?? null;

  const series = Array.from({ length: 20 }, (_, minute) => capAt(minute));
  const steps = series.flatMap((value, index) =>
    index > 0 && value !== series[index - 1] ? [index] : [],
  );

  assert.equal(steps.length, 20 / CAP_GRID_MINUTES, `stepped at ${steps.join(",")}`);
  for (let index = 1; index < steps.length; index++) {
    assert.equal((steps[index] ?? 0) - (steps[index - 1] ?? 0), CAP_GRID_MINUTES);
  }
  // And always downward: an approaching onset never buys the reader more walk.
  for (let index = 1; index < series.length; index++) {
    assert.ok((series[index] ?? 0) <= (series[index - 1] ?? 0));
  }
});

test("a cap does not withdraw itself by shrinking its own window", () => {
  // The loop this feature very nearly shipped with, seen on screen before it
  // was named: the rain cap lowers the budget, the shorter window no longer
  // contains the onset, the rule stops firing, the cap lifts, and the next
  // render starts over. The window is the walk the reader ASKED for, so
  // applying the cap cannot change it.
  const report = baseReport(withSlotAt(40, { precipChance: RAIN_CHANCE + 5 }));
  const first = deriveWeatherRules(report, INPUTS);
  const capped = mergeCaps(weatherCaps(first))?.minutes;
  assert.equal(capped, 35);

  // Feeding the cap back in as the request is what the loop looked like; the
  // app passes `requestedBudgetMinutes`, which does not move.
  const again = deriveWeatherRules(report, INPUTS);
  assert.equal(mergeCaps(weatherCaps(again))?.minutes, capped, "the second pass agrees with the first");
  assert.deepEqual(ids(again), ["rain-window"], "and the rule is still there to explain it");
});

test("darkness is never a weather cap", () => {
  // `daylight-budget` owns the dark deadline and clamps for it through the same
  // `timeCap`. A second one here would put two caps on one dial, and the spec's
  // own `dark-return` rule is deleted for exactly that reason.
  const verdict = deriveWeatherRules(
    baseReport(withSlotAt(40, { precipChance: RAIN_CHANCE + 5, weatherCode: 99 })),
    INPUTS,
  );

  assert.ok(WMO_THUNDER.has(99));
  for (const cap of weatherCaps(verdict)) {
    assert.notEqual(cap?.reason, "daylight");
  }
});

test("staleness is silent inside three refresh windows and stated past them", () => {
  const fresh = deriveWeatherRules(baseReport([], NOW_MS - 10 * MINUTE), INPUTS);
  assert.equal(fresh.staleMinutes, null);

  const stale = deriveWeatherRules(baseReport([], NOW_MS - 50 * MINUTE), INPUTS);
  // Three windows of 900 s is 45 minutes.
  assert.equal((STALE_MULTIPLE * 900) / 60, 45);
  assert.equal(stale.staleMinutes, 50);
});

// ---------------------------------------------------------------------------
// The pool half: the rules as `derivePool` sees them.
// ---------------------------------------------------------------------------

const ring = (half: number): MultiPolygon => {
  const r: Ring = [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
    [-half, -half],
  ];
  return [[r]];
};

const REACH: Reach = (() => {
  const band: Band = { minutes: 25, polygons: ring(1) };
  return { origin: { lat: 0, lng: 0 }, budgetMinutes: 50, bands: [band], areaSqMeters: 1 };
})();

/** Six places, two of which carry a shelter tag. */
const SIX: Place[] = [
  { id: "a", name: "A", lat: 0.1, lng: 0.1, tags: ["park"] },
  { id: "b", name: "B", lat: 0.2, lng: 0.2, tags: ["museum"] },
  { id: "c", name: "C", lat: 0.3, lng: 0.3, tags: ["history"] },
  { id: "d", name: "D", lat: 0.4, lng: 0.4, tags: ["history"] },
  { id: "e", name: "E", lat: 0.5, lng: 0.5, tags: ["history"] },
  { id: "f", name: "F", lat: 0.6, lng: 0.6, tags: ["history"] },
];

const poolWith = (rules: PoolConditions["rules"]): PoolConditions => ({
  reach: REACH,
  partnerReach: null,
  floorPolygons: null,
  vibes: [],
  edgeOnly: false,
  rules,
});

const hotVerdict = (feelsLikeF: number): WeatherVerdict =>
  deriveWeatherRules(baseReport(everySlot({ feelsLikeF, isDay: true })), INPUTS);

const options = (isHilly: (place: Place) => boolean = () => false) => ({
  appliedBudget: null,
  climbSignature: "|6",
  isHilly,
  clear: () => {},
});

test("a preference that would leave fewer than three withdraws itself, by name", () => {
  // heat-shelter prefers river/park/museum/food; only two of the six carry one.
  const rules = toPoolRules(hotVerdict(HEAT_SHELTER_F + 6), options());
  const report = derivePool(SIX, poolWith(rules));

  assert.equal(MIN_SURVIVORS, 3);
  assert.equal(report.included.length, 6, "the rule set itself aside rather than emptying the pool");
  assert.deepEqual(report.withdrawn, ["heat-shelter"]);
});

test("a rule that changes nothing is applied, not withdrawn", () => {
  // Every place carries a preferred tag, so the rule is a no-op - and "Flat
  // routes only" should still be sayable when everything was already flat.
  const everywhere: Place[] = SIX.map((place) => ({ ...place, tags: ["park"] }));
  const rules = toPoolRules(hotVerdict(HEAT_SHELTER_F + 6), options());
  const report = derivePool(everywhere, poolWith(rules));

  assert.deepEqual(report.withdrawn, []);
  assert.equal(report.included.length, 6);
});

test("the preference withdraws and the veto stays, distinguishably", () => {
  // Non-cascading: dropping the preference does not un-drop the veto, and the
  // two ids stay apart in the outcome - the attribution `eligibility.ts` is
  // promised.
  const rules = toPoolRules(hotVerdict(HEAT_DANGER_F + 2), options((place) => place.id === "f"));
  const report = derivePool(SIX, poolWith(rules));

  assert.equal(report.withdrawn.includes("heat-shelter"), true);
  assert.equal(report.withdrawn.includes("heat-flat"), false);
  assert.deepEqual(
    report.included.map((place) => place.id),
    ["a", "b", "c", "d", "e"],
    "the hill is out and the five that are left are the pool",
  );
});

test("deriving twice from identical inputs yields the identical pool", () => {
  // The `candidateKey`-churn guarantee: a rule object is rebuilt every render
  // and only its signature may be compared.
  const first = derivePool(SIX, poolWith(toPoolRules(hotVerdict(HEAT_DANGER_F + 2), options())));
  const second = derivePool(SIX, poolWith(toPoolRules(hotVerdict(HEAT_DANGER_F + 2), options())));

  assert.equal(
    first.included.map((place) => place.id).join(","),
    second.included.map((place) => place.id).join(","),
  );
  assert.deepEqual(first.withdrawn, second.withdrawn);
});

test("a time rule contributes no pool rule and can remove no candidate", () => {
  // The asymmetry that is the design: a cap is visible on the map, so it may
  // empty the pool; a rain rule may not quietly delete a place.
  const rain = deriveWeatherRules(
    baseReport(withSlotAt(40, { precipChance: RAIN_CHANCE + 5 })),
    INPUTS,
  );

  assert.deepEqual(ids(rain), ["rain-window"]);
  assert.deepEqual(toPoolRules(rain, options()), []);
});
