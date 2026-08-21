# Daylight and the time budget

**Status:** spec — not implemented
**Slug:** `daylight-budget`

## Depends on

Nothing. This spec **owns** the shared clock, and `docs/plans/README.md` §2.1 rules in its favour
against `weather-filters`' competing `src/app/clock.ts` / `src/lib/sun.ts` design. Its pure
modules — `src/lib/solar.ts`, `src/app/daylight.ts`, `src/app/conditions.ts`,
`src/app/useConditions.ts` — land in the **foundations chunk (0)**, ahead of everything; the
switch, the dial cap and the card line land in **chunk 5**.

**Two specs depend on this one:** `opening-hours` consumes `solarEvents`, `sunTimes`,
`useConditions` and `arrivalMs`; `weather-filters` consumes the same clock and feeds `TimeCap`s
into the same dial cap.

Three amendments from `docs/plans/README.md` §2.1 and §3: `useConditions(origin, frozen)` takes a
second parameter; `CapReason` is the full union across daylight and weather; `Session` carries
`timeCap: TimeCap | null` and the action is `{ type: "timeCap"; cap }`, replacing
`lightCapMinutes` / `lightCap`, so one cap path serves both specs and the dial's note can name
which condition is clamping. `formatClock` returns `"8:21 pm"` (§2.2).

## What and why

The dial promises a walk of N minutes. It has never known whether those minutes exist. Set it to
ninety at seven in the evening in November and the app will cheerfully draw a contour across half
the city and pick you a spot on Belle Isle that you will reach in the dark, on unlit gravel, with
an hour of walking still to do. Sunset is the one constraint on a walking app that is not a
preference — it is the same for every walker, it is knowable to the minute, and it costs nothing to
know. This feature makes the app know it.

It is also the feature `opening-hours` is already waiting on: that spec states, in writing, that it
will not write solar math and expects `src/lib/solar.ts` to hand it sunrise and sunset. That
contract is honoured here verbatim (see **Contracts with sibling specs**).

Three things land. The result card gains a light line under the stats it already prints —
`52 min out and back · sunset in 40` — so the number the user is deciding on and the number that
decides for them sit together. That repeats the duration from the `Out and back` stat directly
above, and it repeats it on purpose: a stat is a label-over-value pair that is *scanned* in a
three-column grid, and a sentence is *read*. `sunset in 40` next to a bare `52 min` in a column is
two facts; `52 min out and back · sunset in 40` is one comparison, which is the entire point of the
line. The stats grid is not touched. The reach readout gains the deadline itself (`dusk 8:21 pm`), because
that is the fact you plan around before you have picked anything. And there is one switch, **Get
back before dark**, which clamps the dial's usable range to the light that is actually left and says
on the dial that it has done so, with a shaded dead zone from the cap to a hundred rather than a
silently shortened track. When the walk on screen does not fit in the light left, the card says so
in the same amber warning vocabulary it already uses for "outside your current time budget".

What it does not do: it does not know about streetlights, so a clamped walk is not a safe walk, only
a lit one on average; it does not filter the candidate pool, ever (that stays the honest uniform draw
over everything inside the contour); it does not know your local sunset, only Richmond's, which is
deliberate — a visitor planning a Richmond walk from California needs Richmond's dusk; and it cannot
tell you that your device's clock is wrong. It also does not fetch anything. There is no endpoint, no
proxy change, no Worker change, no new outbound host. The daylight half of it is sixty lines of
vendored arithmetic and a minute-hand.

The other half is the shared **conditions plumbing**, designed here on purpose and first, because
`weather-filters` and `opening-hours` are the same shape of problem — "what is true right now, and
what will be true when you get there and when you get back" — and three private copies of a clock is
how an app ends up announcing three different values of "now". Be honest about what that costs:
this feature consumes only `atMs` and `light`. `mergeCaps`, `setClockOffset`, `clockOffsetMs` and
`arrivalMs` ship with no in-repo caller, behind `/** @public */` tags, for siblings that do not
exist yet. That is four exported symbols of speculative surface, and it is a deliberate bet that
the seam is cheaper to place now than to retrofit around two features that have each already picked
a clock. If a reviewer would rather not take that bet, the cut is clean: delete `conditions.ts` and
`conditions.test.ts`, inline `atMs` and `light` into `useConditions`'s return type, and nothing else
in this spec changes. The daylight feature does not depend on the plumbing landing.

## The decision

**Compute the sun locally; do not ask an API.** The NOAA solar position algorithm (Meeus) is about
sixty lines of trigonometry, is accurate to a minute or two at Richmond's latitude, and gives civil
twilight as cheaply as sunset. The formulas below were evaluated by hand against the USNO
`aa.usno.navy.mil/api/rstt/oneday` response for Richmond on 2026-06-21 and reproduced all five
phenomena to under a minute (05:48.7 / 20:34.2 / 05:17.5 / 21:05.4 / transit 13:11.4 EDT against
USNO's 05:49 / 20:34 / 05:18 / 21:06 / 13:12). Rejected: Open-Meteo's
`daily=sunrise,sunset` (free and already in `weather-filters`' response, but it has no civil-twilight
field, which is the number a walker actually needs, and it makes a deterministic constant into a
network dependency that can be down); `suncalc` or any dated-astronomy package (real bytes against a
64 KB budget for arithmetic that fits in one file). The algorithm is **vendored with its provenance
in a comment** — <https://gml.noaa.gov/grad/solcalc/> states that "the NOAA/GML Solar Calculator is
no longer actively supported or maintained by our team" and that "we cannot guarantee its accuracy
or functionality and will not be providing updates or technical support", so a runtime link to it
would be a link to a thing that may move.

**Licence, said out loud.** The NOAA solar calculator page carries no licence statement of any
kind. The vendoring rests on 17 U.S.C. § 105: a work prepared by an officer or employee of the US
government as part of their official duties is not subject to domestic copyright, so it is in the
public domain. The header comment must say exactly that — the statute, the URL, the date fetched —
rather than leaving a future reader to assume it. NOAA's own framing of the calculator as "provided
for research and entertainment purposes only" is a disclaimer of warranty, not a licence term, and
the ±2-minute test tolerance below is this repo taking that disclaimer seriously.

**The port is single-pass, and that is a choice.** NOAA's own page runs the calculation twice,
refining the Julian century from the estimated event time and re-solving. This port computes `T`
once, from 0h UT of the Richmond calendar day, and does not iterate. The second pass moves the
answer by well under a minute at Richmond's latitude — the hand-check above is single-pass and
lands inside a minute on all five phenomena — and one pass keeps the module to one function per
quantity with no fixed-point loop to reason about. So: not "verbatim NOAA", but "NOAA's formulas,
one pass, ±2 minutes asserted". If a fixture ever misses by more than two minutes, adding the
second pass is the first thing to try.

**Civil dusk is the deadline; sunset is the advisory.** These are two different numbers and both are
wanted. Sunset is when it starts to feel dark and is the number people know, so it is what the result
card quotes: `sunset in 40`. Civil dusk (solar zenith 96°, about 25–30 minutes after sunset in
Richmond) is the last moment you can still read a trail without a torch, so it is what the clamp uses
as the hard bound. Using sunset for both would refuse walks that are perfectly fine; using dusk for
both would print a number that reads as more optimistic than the sky looks. Rejected: nautical
twilight, which is dark for a pedestrian; and a single fudged "sunset + 20", which is a made-up
number when the real one is free.

**The mode clamps the dial; it never filters the pool.** Daylight is a property of the clock, not of
a place, so the correct expression of it is a bound on the budget, not a deletion of candidates. This
matters structurally: the candidate pool is recomputed every render from `selectCandidates`, its
identity string `candidateKey` drives the spin-abort effect, and a clock that ticks every minute
into that string would make spinning impossible on a slow route warm-up. The clamp instead moves
`budgetMinutes` — a normal, visible, user-legible state change with an existing re-frame path.
`weather-filters` is asked to respect the same rule for its own time-shaped constraints (rain onset)
and to route them through the shared cap rather than into `selectCandidates`.

**The clamp lives in the reducer, fed by an action, not computed inside it.** `reduce` is pure and
exhaustively switched, and it must stay that way — a reducer that reads `Date.now()` is a reducer
that cannot be tested and that produces a different state for the same action. So the clock lives in
a hook, and a new `{ type: "lightCap"; minutes: number | null }` action carries the derived cap into
the reducer, which re-clamps budget and floor atomically the way `toggleRoundTrip` already does. The
action returns the *same state object* when nothing changed, so the once-a-minute tick costs one
`Object.is` comparison and no re-render.

**The mode defaults OFF.** Clamping a dial the user did not ask to be clamped is exactly the silent
pool-shrinkage failure this repo refuses elsewhere. The always-on half of the feature — the dusk time
in the readout, the light line on the card, the warning when a walk does not fit — is information,
and information is free to be default. The clamp is an action, and actions are opt-in. Rejected:
auto-enabling within 90 minutes of dusk (a state change no one performed), and a modal or toast
(there is no toast vocabulary in this app and there will not be one).

**After dark, the mode cannot clamp, so it stops pretending to.** A cap of zero is not a dial, and a
cap below `dialMinimum(roundTrip)` (5 or 10) is a dial with one position. When the remaining light
falls below the dial minimum, `capFromLight` is dispatched as `null`: the dial returns to its full
range, the switch stays on and stays honest, and its hint changes from "Back before civil dusk,
8:21 pm" to "It is dark. Civil dawn is 6:47 am." The result card's light line switches from a
countdown to a statement — `52 min out and back · after dark` — and the fit warning fires for every
walk, because every walk is now after dark and the card should not go quiet at the exact moment the
constraint is total. This is the honest statement the mode owes: it did not silently disable, and it
did not clamp to a fiction.

This is why `fitsInLight` tests the *phase* first and the countdown second. `daylightAt` rolls to
tomorrow's events once tonight's civil dusk has passed, so at 11pm `minutesToDusk` is a cheerful
`+1400` — tomorrow's dusk, twenty-three hours out — and a bare `totalMinutes <= minutesToDusk`
would say every night walk fits. The rollover is right (the readout must be able to say "dark until
6:47 am") and the fit rule must therefore be explicit about night rather than inferring it from a
positive number.

**Time is computed in UTC and formatted in `America/New_York`, always.** Solar output is epoch
milliseconds — no local-time arithmetic, no hand-rolled DST rules. Display goes through one
memoised `Intl.DateTimeFormat` pinned to the Richmond zone. The Richmond *calendar date* used to
seed the solar day is also derived through `Intl` rather than from the visitor's `Date` accessors,
so a visitor in Tokyo at 3am does not get tomorrow's sun. The 2026-03-20 and 2026-12-21 test
fixtures exist to catch a DST regression.

**Coordinates come from the origin, not from a constant.** The origin is draggable and `geolocate`
will make it more so. `solarEvents` takes lat/lng. The *timezone* stays pinned to Richmond, which is
correct for every origin the bounding box permits — the proxy already rejects origins outside
37.3..37.8 / -77.9..-77.1, a box entirely inside Eastern time.

**The fixtures are verified.** All three rows below were fetched from
`https://aa.usno.navy.mil/api/rstt/oneday?date=…&coords=37.5407,-77.436&tz=…` on 2026-08-21 and are
quoted exactly as returned; they are not transcribed from memory. The `±2 minutes` tolerance absorbs
the single-pass approximation and minute rounding, not an error — if any fixture misses by more than
a minute in practice, the port is wrong, not the tolerance.

## Data and types

### `src/lib/solar.ts`

```ts
/** All fields are epoch milliseconds (UTC). Null when the sun does not cross
 *  that altitude on the given day — impossible at Richmond's latitude, present
 *  because the arithmetic is general and a silent NaN is worse. */
export type SolarEvents = {
  /** The Richmond-local calendar day these events belong to, as YYYY-MM-DD. */
  day: string;
  civilDawnMs: number | null;
  sunriseMs: number | null;
  solarNoonMs: number;
  sunsetMs: number | null;
  civilDuskMs: number | null;
};

export function solarEvents(atMs: number, lat: number, lng: number): SolarEvents;

/** The shape `opening-hours` asked for, and the only reason it exists. */
export type SunTimes = { sunrise: Date; sunset: Date };
/** Sun times for the Richmond-local calendar date containing `at`, at `point`.
 *  Null when either phenomenon does not occur — the honest degradation that
 *  spec relies on. A four-line adapter over `solarEvents`; see Contracts. */
export function sunTimes(at: Date, point: LngLat): SunTimes | null;
```

`ZENITH_SUNRISE` (90.833) and `ZENITH_CIVIL` (96) are **module-private consts, not exports**. Only
`solarEvents` uses them, `knip.json`'s `project` covers `src/**`, and an unreached export fails
`npm run lint`. The `/** @public */` escape hatch is for symbols a named sibling spec will consume;
a zenith constant is not one.

### `src/app/daylight.ts`

```ts
import type { SolarEvents } from "../lib/solar";

export type DaylightPhase =
  | "day"        // before sunset
  | "dusk"       // between sunset and civil dusk: light, but going
  | "night"      // after civil dusk, before civil dawn
  | "dawn";      // between civil dawn and sunrise

export type Daylight = {
  atMs: number;
  phase: DaylightPhase;
  /** Today's events, or tomorrow's once tonight's dusk has passed. */
  events: SolarEvents;
  /** Whole minutes from `atMs` to sunset. Negative after sunset, null if none. */
  minutesToSunset: number | null;
  /** Whole minutes from `atMs` to civil dusk. Negative after it, null if none. */
  minutesToDusk: number | null;
  /** Whole minutes from `atMs` to sunrise, on the same `events` day. Negative
   *  after sunrise, null if none. Present as a field because `describeLight`'s
   *  dawn branch needs it and "derived inline" is not a specification of which
   *  day it is derived from once `events` has rolled over. */
  minutesToSunrise: number | null;
  /** The next civil dawn strictly after `atMs`, epoch ms — the number the night
   *  statement quotes. Null only when `events.civilDawnMs` is null. Note the
   *  word *next*: by day this is tomorrow's dawn, not this morning's. */
  nextDawnMs: number | null;
};

export function daylightAt(atMs: number, lat: number, lng: number): Daylight;

/** The dial cap, in TOTAL budget minutes, or null for "cannot clamp".
 *  Named `capFromLight`, not `lightCapMinutes`, because `Session` already has
 *  a field by that name and App.tsx has both in scope — a cap effect that
 *  appears to call itself is a bad five seconds for the next reader. */
export function capFromLight(
  light: Daylight,
  roundTrip: boolean,
  dialMinimum: number,
  step: number,
): number | null;

/** Does a walk of `totalMinutes` starting now finish before civil dusk?
 *  False at night, always: see Algorithm 4. */
export function fitsInLight(light: Daylight, totalMinutes: number): boolean;

/** The clause the result card and the sr-only line share:
 *  "sunset in 40", "sunset was 12 min ago", "sunrise in 32", "after dark". */
export function describeLight(light: Daylight): string;

/** The deadline as a bare clock phrase, for the readout and the dial's cap
 *  note: "dusk 8:21 pm", or "dark until 6:47 am" at night. */
export function describeDusk(light: Daylight): string;

/** The switch's hint line: a full sentence, and the only string that needs to
 *  know whether the walk comes home. */
export function describeDeadline(light: Daylight, roundTrip: boolean): string;
```

Six exports, one caller shape each. `describeDusk` exists so nothing downstream has to slice a
sentence apart to get a time out of it.

### `src/app/conditions.ts` — the shared plumbing (the contract siblings consume)

```ts
import type { Daylight } from "./daylight";

/**
 * One reading of "right now". `weather-filters` widens this type with its own
 * `weather: Weather | null` field; `opening-hours` reads `atMs` and nothing
 * else. There is exactly one clock in this app and this is it.
 */
export type Conditions = {
  /** Epoch ms, corrected by `clockOffsetMs`. Advances in whole minutes. */
  atMs: number;
  light: Daylight;
};

/** Why a time constraint exists. `weather-filters` adds "rain" and "storm". */
export type CapReason = "daylight";

export type TimeCap = {
  /** Total budget minutes this reason permits, already on the dial's step. */
  minutes: number;
  reason: CapReason;
  /** The instant the reason bites, epoch ms — used to pick the earliest. */
  untilMs: number;
};

/** Earliest deadline wins. Null in, null out; empty array is null. */
export function mergeCaps(caps: readonly (TimeCap | null)[]): TimeCap | null;

/**
 * Device clocks are wrong and we cannot tell. `weather-filters` is asked to
 * return a server timestamp with its forecast and call this once; until it
 * does, the offset is zero and the device is trusted.
 */
export function setClockOffset(deltaMs: number): void;
export function clockOffsetMs(): number;

/** Arrival instant for an outbound leg, for `opening-hours`. */
export function arrivalMs(atMs: number, outboundSeconds: number): number;
```

### `src/app/useConditions.ts`

```ts
/** Ticks on the minute boundary; pauses while the document is hidden and
 *  resynchronises on visibilitychange. One interval for the whole app. */
export function useConditions(origin: LngLat): Conditions;
```

### `src/lib/format.ts` additions

```ts
export const RICHMOND_TZ = "America/New_York";
/** "8:21 pm" — lowercase meridiem, no leading zero, Richmond time always. */
export function formatClock(atMs: number): string;
```

### Session additions

```ts
// on Session
  /** "Get back before dark". Opt-in; never set by the app itself. */
  beforeDark: boolean;
  /**
   * Total budget minutes the remaining light permits, or null for "no usable
   * clamp" — either the mode is off, or it is already dark and a cap would be
   * a fiction. Derived, pushed in by `lightCap`; never persisted.
   */
  lightCapMinutes: number | null;

// added to Action
  | { type: "toggleBeforeDark" }
  | { type: "lightCap"; minutes: number | null }
```

No network shape changes. No file-format changes. `public/reach/*.json` is untouched and
`SNAPSHOT_VERSION` does not move.

### Contracts with sibling specs

**`opening-hours` (already written; this spec honours it).** `docs/plans/opening-hours.md` states
that it will not write solar math and expects `src/lib/solar.ts` to export
`type SunTimes = { sunrise: Date; sunset: Date }` and
`sunTimes(at: Date, point: LngLat): SunTimes | null`, returning null rather than throwing. That is
honoured exactly as written — same names, same shape, same null contract — as a thin adapter:

```
sunTimes(at, point):
  e = solarEvents(at.getTime(), point.lat, point.lng)
  if e.sunriseMs == null or e.sunsetMs == null: return null
  return { sunrise: new Date(e.sunriseMs), sunset: new Date(e.sunsetMs) }
```

`opening-hours` is **not** amended. Note the deliberate asymmetry: `sunTimes` is `Date`-based
because that spec's `WallClock`/`evaluateHours` API is `Date`-based throughout, while everything in
*this* feature is epoch-ms because it does arithmetic. The adapter is where those two worlds meet,
and it is four lines, which is cheaper than making either side convert at every call. Until
`opening-hours` lands, `sunTimes` has no in-repo caller and carries `/** @public */`.

**`weather-filters` is asked for three things.** Route any time-shaped constraint of its own (rain
onset) through `TimeCap`/`mergeCaps` and the `lightCap` action rather than into `selectCandidates`,
for the `candidateKey` reason argued above. Widen `Conditions` with its own `weather` field rather
than starting a second hook. And call `setClockOffset` once with a server timestamp from its
forecast response, which is the only way this app will ever know the device clock is wrong.

**`pool-reasoning` is asked for nothing** and is owed one thing: daylight never removes a candidate,
so it never contributes a `PoolReason`. If that ever changes, it changes here first.

## Changes, file by file

**`src/lib/solar.ts` — NEW.** The vendored NOAA/Meeus port. No runtime imports at all (so
`node --test` type-stripping runs it bare, the `reel.ts` rule); it imports `LngLat` as a type only.
Exports `SolarEvents`, `solarEvents`, `SunTimes`, `sunTimes` (the last two `/** @public */` until
`opening-hours` lands). Module-private: `ZENITH_SUNRISE`, `ZENITH_CIVIL`, `julianDay`, `julianCentury`,
`geomMeanLongSun`, `geomMeanAnomalySun`, `eccentricity`, `sunEqOfCentre`, `sunApparentLong`,
`obliquityCorrected`, `sunDeclination`, `equationOfTime`, `hourAngle(latDeg, decDeg, zenithDeg)`,
`richmondDayParts(atMs)` (via `Intl.DateTimeFormat(RICHMOND_TZ, {…, timeZone})` `formatToParts`).
Header comment carries the provenance (`gml.noaa.gov/grad/solcalc/`, formulas from Meeus,
*Astronomical Algorithms*), the public-domain basis (17 U.S.C. § 105; the page states no licence),
the date fetched, the deliberate single-pass simplification, and NOAA's own "no longer actively
supported or maintained" note as the reason it is copied rather than linked.

**`src/lib/solar.test.ts` — NEW.** See Tests.

**`src/app/daylight.ts` — NEW.** Imports `solar.ts` and `format.ts` only. Exports the six symbols
above. Pure; no `Date.now()` anywhere — `atMs` is always a parameter, which is what makes the
fixtures possible.

**`src/app/daylight.test.ts` — NEW.**

**`src/app/conditions.ts` — NEW.** `Conditions`, `CapReason`, `TimeCap`, `mergeCaps`,
`setClockOffset`, `clockOffsetMs`, `arrivalMs`. Module-level `let offsetMs = 0`. `arrivalMs` and
`clockOffsetMs` will be unreached by `src/` until the siblings land — mark them `/** @public */` or
knip fails the lint gate (`knip.json` honours the tag).

**`src/app/conditions.test.ts` — NEW.**

**`src/app/useConditions.ts` — NEW.** `useConditions(origin)`. One `useState<number>` holding the
minute-truncated `Date.now() + clockOffsetMs()`; a `setTimeout` chain scheduled to the next minute
boundary (not `setInterval`, which drifts and fires twice after a wake); a `visibilitychange`
listener that clears the timer while hidden and re-reads the clock on show. Returns
`{ atMs, light: daylightAt(atMs, origin.lat, origin.lng) }`, **memoised on
`[atMs, origin.lat, origin.lng]`**. This is the one place the house "derived values are not
memoised" rule is bent, and the reason is measurable rather than aesthetic: `daylightAt` calls
`solarEvents` once or twice, and each call runs `Intl.DateTimeFormat.formatToParts` to get the
Richmond calendar date. The trigonometry really is ~200 flops and really is free; `formatToParts`
is not, and a dial scrub re-renders App every frame while `atMs` and the origin sit still. The memo
key is three numbers and the value changes at most once a minute, so the memo is correct by
construction. The formatter instance itself is module-scope in `solar.ts`, constructed once.

**`src/lib/format.ts` — MODIFIED.** Add `RICHMOND_TZ` and `formatClock`, with the formatter
constructed once at module scope (`new Intl.DateTimeFormat("en-US", { hour: "numeric", minute:
"2-digit", timeZone: RICHMOND_TZ })`) and its `am/AM` output lowercased. Comment: why the zone is
pinned rather than local, tied to the proxy's bounding box. No `try`/`catch`: every browser that
runs React 18 and MapLibre ships full-ICU `Intl`, and the fallback the earlier draft proposed would
have printed a confidently wrong wall-clock time, which is the silent degradation this spec refuses
everywhere else. If the constructor throws, the app should fail loudly on a platform it never
claimed to support.

**`src/app/session.ts` — MODIFIED.**
- `Session` gains `beforeDark: boolean` and `lightCapMinutes: number | null`.
- `initialSession` gains `beforeDark: false`, `lightCapMinutes: null`. Its existing
  `clampBudget(DEFAULT_BUDGET_MINUTES, DEFAULT_ROUND_TRIP)` call runs at module scope, where there
  is no state to take a cap from, so it passes `null` — which is also correct, since the mode
  defaults off.
- `Action` gains `toggleBeforeDark` and `lightCap`. The switch is exhaustive with no default, so
  both are compile-time forced.
- `clampBudget(minutes, roundTrip, cap)` and `clampFloor(minutes, budgetMinutes, roundTrip, cap)`
  gain a trailing `cap: number | null` parameter. Every existing call site passes the state's
  effective cap.
- New export `export function dialMaximum(state: Pick<Session, "beforeDark" | "lightCapMinutes" |
  "roundTrip">): number` — returns `MAX_MINUTES` unless the mode is on and the cap is non-null and
  at least `dialMinimum(roundTrip)`, in which case `Math.min(cap, MAX_MINUTES)`.
- New module-private `effectiveCap(state)` returning `number | null`, used by both.
- `toggleBeforeDark` flips the flag, re-clamps budget and floor against the new effective cap,
  clears `failure`, and bumps `framingKey` — same shape as `toggleRoundTrip`, and for the same
  reason: the outbound contour can move with no dial commit to piggyback on.
- `lightCap` stores the minutes and re-clamps budget and floor. **It returns `state` unchanged
  (reference-identical) when the cap and both clamped values are already what they would be** —
  this is what keeps a once-a-minute tick from re-rendering the whole app.
- `toggleRoundTrip`, `budget` and `floor` all thread the effective cap through their existing
  clamps.
- `clearFilters` is **not** touched. The mode is a safety bound, not a filter; "Clear filters"
  removing your daylight guard would be a trap. A `WHY` comment says so at the case.
- `origin` does not reset `beforeDark` (the user's intent survives a pin drop) but the cap will be
  recomputed on the next tick anyway since the solar day is origin-parameterised.

**`src/app/session.test.ts` — NEW** (there is no session test today; this feature is the reason to
start one).

**`src/ui/TimeDial.tsx` — MODIFIED.**
- New required prop `maximum: number` and optional `capNote?: string`. `MAX_MINUTES` stays imported
  because the *track geometry* still spans `minimum..MAX_MINUTES`; only the two range inputs take
  `max={props.maximum}`. This is the point: the clamp is drawn as a dead zone, not as a shorter
  slider, so the user can see how much walk the light is costing them.
- `.dial-track` gains the class `is-capped` when `maximum < MAX_MINUTES`, and an inline style
  carrying the cap position as a custom property. React's `CSSProperties` does not admit custom
  properties, and there is no precedent for this cast anywhere in `src/**/*.tsx` today, so it needs
  an assertion *and* — because `.oxlintrc.json` runs `anti-slop/require-safety-comment-for-type-assertion`
  as an error — a stated reason. Write it as:

  ```tsx
  // SAFETY: React's CSSProperties has no index signature for custom properties,
  // so a `--cap-percent` key cannot be expressed without an assertion. The value
  // is a string this component just built from a number; nothing is being
  // widened or trusted from outside.
  const trackStyle = { "--cap-percent": `${pct(props.maximum)}%` } as CSSProperties;
  ```
- `aria-valuetext` on the budget input appends `, limited by daylight` when capped. `aria-valuemax`
  follows `max` automatically; no manual attribute.
- `capNote` renders as `<p className="dial-cap-note">{capNote}</p>` between `.dial-track` and
  `.dial-scale`, e.g. `Daylight limit 62 min · dusk 8:21 pm`.
- The existing `.dial-scale` right-hand `<span>{MAX_MINUTES}</span>` is unchanged — the scale
  describes the track, and the track is still 100.

**`src/ui/DaylightSwitch.tsx` — NEW.** A single `.switch` in a `.guard-row` wrapper, exporting
`DaylightSwitchProps = { checked: boolean; deadline: string; disabled?: boolean; onToggle: () =>
void }`. Markup is the canonical Switch markup copied from `Filters.tsx` (visually-hidden input,
`.switch-track`/`.switch-thumb`, `.switch-text` with `.switch-label` "Get back before dark" and
`.switch-hint` = `deadline`). Cue: `playThock(!checked)` synchronously before the callback, per the
house convention. It is a separate component rather than a third switch inside `Filters` because the
Filters drawer starts closed on a phone and a control that moves the dial cannot live behind a
disclosure.

**`src/ui/ResultCard.tsx` — MODIFIED.** New props `lightNote: string` (from `describeLight`) and
`fitsLight: boolean`. Directly under `<dl className="result-stats">`, a new line, rendered only
when `!pending && route !== null` — the card's existing "a skeleton means still coming" rule, and
the reason the clause never sits beside a dash:

```tsx
{!pending && route && (
  <p className="result-light">
    {formatMinutes(props.roundTrip ? route.durationSeconds * 2 : route.durationSeconds)}{" "}
    {props.roundTrip ? "out and back" : "on foot"} · {props.lightNote}
  </p>
)}
```

The duration expression is the same one the first `Stat` renders and the wording is the one
`describeResult` already uses, so the repetition argued in **What and why** is one number in one
vocabulary, twice. Below the existing route-failed
and budget warnings, a third `.result-warning` when `!props.fitsLight`: `WarningIcon size={15}
weight="fill"` plus `This walk does not fit in the light left.` The stats grid stays
`repeat(3, 1fr)` — a fourth `Stat` would make a lopsided second row, which is why the light is
prose rather than a stat.

**`src/ui/ReachReadout.tsx` — MODIFIED.** New prop `duskNote: string | null`, the output of
`describeDusk` (`dusk 8:21 pm`, or `dark until 6:47 am` at night). When non-null and
`status === "ready"`, a third segment after a second `.readout-sep`: `<strong>{duskNote}</strong>`.
It is appended to `line` too, so the settled announcement carries it — the dusk time must not be
visible-only.

The announcement effect **must gain `duskNote` as a dependency**, alongside `props.commitKey` and
`ready`, and the existing `eslint-disable-next-line react-hooks/exhaustive-deps` (which is there to
keep `line` itself out of the deps during a scrub) stays, with its comment extended to say why this
one value is listed and `line` is not: `duskNote` changes at most once a minute and only when a
sentence-level fact changed, whereas `line` changes every frame of a drag.

This is the honest part. A passive minute tick can lower the budget, which moves the area, the outer
minutes and the place count on the visible line — and `lightCap` deliberately does not bump
`framingKey`, so `commitKey` does not move and none of that gets announced. Adding `duskNote` to the
deps closes the case that matters (dusk crossing, and the cap arriving with it, do re-announce the
whole settled sentence, because `line` is rebuilt from current props at that moment). A cap tick
that shifts the budget without changing the dusk phrase still moves the visible numbers silently for
one minute. That residue is accepted rather than papered over: the alternative is announcing a
recomputed reach once a minute, unprompted, which is worse for the person who has to listen to it.

**`src/app/App.tsx` — MODIFIED.**
- `const conditions = useConditions(origin);` near the top of the derived section.
- The cap is **derived in render and dispatched by a one-value effect**, so the dependency array is
  complete and no `exhaustive-deps` disable is needed (`npm run lint` runs eslint with
  `--max-warnings 0` and `eslint-plugin-react-hooks` recommended, so a stale dep is fatal, not
  advisory):

  ```tsx
  const lightCap = state.beforeDark
    ? capFromLight(conditions.light, state.roundTrip, dialMinimum(state.roundTrip), budgetStep())
    : null;

  useEffect(() => {
    if (state.spinning) return;
    dispatch({ type: "lightCap", minutes: lightCap });
  }, [lightCap, state.spinning]);
  ```

  `lightCap` is a `number | null`, so the deps compare by value and the effect runs only when the
  cap actually moves — not once a minute. The `spinning` guard is load-bearing: a cap that moves
  the budget mid-throw changes the reach, which changes `candidateKey`, which fires the existing
  spin-abort effect. A throw is at most a few seconds; the minute can wait. Because `state.spinning`
  is in the deps, the pending cap lands on the falling edge of the throw, which is exactly the
  "applied on the next tick after the reel lands" behaviour the failure table promises.
- `dialMaximum(state)` passed to `<TimeDial maximum=… capNote=… />`. `capNote` is
  `` `Daylight limit ${max} min · ${describeDusk(conditions.light)}` `` when
  `max < MAX_MINUTES`, else `undefined`.
- `<DaylightSwitch>` slotted in `.panel` **immediately after `<TimeDial>` and before** the
  readout/notice block, with `deadline={describeDeadline(conditions.light, state.roundTrip)}` and
  `disabled={picking}`.
- `withinBudget` is joined by a light test built from the same measured duration the card renders:

  ```tsx
  const walkMinutes =
    route && Math.ceil((state.roundTrip ? route.durationSeconds * 2 : route.durationSeconds) / 60);
  // Judged only against a measured walk. While the route is pending there is
  // nothing to accuse, and the card is showing skeletons anyway.
  const walkFitsLight = !picked || routePending || !walkMinutes
    ? true
    : fitsInLight(conditions.light, walkMinutes);
  ```

  Three rules, all expressed: no pick and no accusation; pending and no accusation; otherwise the
  measured truth. Note what is *not* here — `state.beforeDark`. The warning fires whether or not the
  mode is on, because the mode is about clamping and the warning is about truth.
- `describeResult(...)` gains two parameters, `lightNote: string` and `fitsLight: boolean`, and
  appends `, ${lightNote}` and `, does not fit in the light left` so the one sr-only line carries
  everything the card shows. No new live region anywhere — that is the double-announcement bug.
- `ReachReadout` gains `duskNote={status === "ready" ? describeDusk(conditions.light) : null}`.
- `selectCandidates` is **not** touched.

**`src/styles/app.css` — MODIFIED.** No new tokens. Additions:
- `.dial-track.is-capped::after` — an absolutely positioned overlay from `var(--cap-percent)` to
  `100%`, `background: rgba(255,255,255,0.05)`, `border-left: 1px dashed var(--line-strong)`,
  `pointer-events: none`, `border-radius: 0 999px 999px 0`. Under `prefers-reduced-transparency`
  nothing changes; it is a flat fill, not a blur.
- `.dial-cap-note` — `font-family: var(--mono); font-size: 11px; letter-spacing: 0.04em; color:
  var(--accent-soft); font-variant-numeric: tabular-nums;` matching the `.dial-warming` weight.
- `.guard-row` — `display: block; padding-top: 2px;` (the `.switch` vocabulary supplies the rest).
- `.result-light` — `font-size: 12.5px; color: var(--ink-2); font-variant-numeric: tabular-nums;`
  with `strong`/number spans inheriting `var(--mono)`; sits in the `.result` column flow with the
  card's 10px gap, no extra margin.
- Under the 900px block: nothing new required; `.guard-row .switch` inherits the sheet's larger
  targets. Confirm the dead-zone overlay still reads at the mobile track height.

**Untouched, and deliberately:** `server/proxy.ts`, `server/vite-plugin.ts`, `worker/index.ts`,
`wrangler.toml`, `.env.example`, `public/_headers`, `index.html`, `scripts/build-reach.mjs`,
`src/lib/isochrone.ts`, `src/lib/route.ts`, `src/map/*`, `src/data/places.ts`. This feature adds no
endpoint, no env var, no outbound host and no build step. Say so in the PR description, because a
"conditions" feature that touches the proxy is the version of this that costs a rate limit.

**`README.md` — MODIFIED.** One paragraph under the feature list: daylight is computed locally from
NOAA's algorithm, no API, and the deadline is civil dusk. **`docs/history/IDEAS.md`** — strike the
line if daylight is listed there.

## Algorithm

### 1. Solar events (`solarEvents`)

NOAA's formulas, single pass (see The decision), all angles in degrees converted to radians at use:

```
parts   = Intl parts of atMs in America/New_York  ->  y, m, d
JD      = floor(365.25*(y+4716)) + floor(30.6001*(m+1)) + d + B - 1524.5
          with  m <= 2  ->  y -= 1; m += 12
          and   A = floor(y/100);  B = 2 - A + floor(A/4)
T       = (JD - 2451545) / 36525
L0      = (280.46646 + T*(36000.76983 + T*0.0003032)) mod 360
M       = 357.52911 + T*(35999.05029 - 0.0001537*T)
e       = 0.016708634 - T*(0.000042037 + 0.0000001267*T)
C       = sin(M)  * (1.914602 - T*(0.004817 + 0.000014*T))
        + sin(2M) * (0.019993 - 0.000101*T)
        + sin(3M) *  0.000289
omega   = 125.04 - 1934.136*T
lambda  = (L0 + C) - 0.00569 - 0.00478*sin(omega)
seconds = 21.448 - T*(46.8150 + T*(0.00059 - T*0.001813))
e0      = 23 + (26 + seconds/60)/60
eps     = e0 + 0.00256*cos(omega)
dec     = asin( sin(eps) * sin(lambda) )
y2      = tan(eps/2)^2
EqTime  = 4 * degrees( y2*sin(2*L0) - 2*e*sin(M) + 4*e*y2*sin(M)*cos(2*L0)
                       - 0.5*y2*y2*sin(4*L0) - 1.25*e*e*sin(2*M) )       [minutes]

hourAngle(zenith) :
  c = cos(zenith)/(cos(lat)*cos(dec)) - tan(lat)*tan(dec)
  if |c| > 1  ->  null            // no crossing that day
  HA = degrees( acos(c) )

riseUTCmin(zenith) = 720 - 4*(lng + HA) - EqTime      // lng EAST-POSITIVE: -77.44
setUTCmin (zenith) = 720 - 4*(lng - HA) - EqTime
noonUTCmin         = 720 - 4*lng - EqTime
```

Each `*UTCmin` is minutes from UTC midnight **of the Richmond calendar day**, and may fall outside
`0..1440` — it is normalised as an instant, never clamped: `msFor(dayUtcMidnightMs, minutes) =
dayUtcMidnightMs + minutes * 60_000`, where `dayUtcMidnightMs = Date.UTC(y, m - 1, d)`. The result
is a correct epoch instant regardless of overflow, which is exactly why the whole calculation is
kept in UTC.

`day` is the `YYYY-MM-DD` of the Richmond parts, so a caller can tell whether it is holding today's
or tomorrow's events.

### 2. Phase and roll-over (`daylightAt`)

```
today = solarEvents(atMs, lat, lng)

if today.civilDuskMs != null and atMs >= today.civilDuskMs:
    events = solarEvents(atMs + 86_400_000, lat, lng)   // tomorrow's numbers
    phase  = "night"
else:
    events = today
    phase  = phaseOf(atMs, today)

// Every field on SolarEvents except solarNoonMs is `number | null` under strict
// TS, so the ladder cannot dereference them bare. A day missing any boundary is
// a day we cannot phase, and the honest answer is the phase that disables the
// clamp rather than a guess:
phaseOf(atMs, d):
    if d.civilDawnMs == null or d.sunriseMs == null
       or d.sunsetMs == null or d.civilDuskMs == null:  return "night"
    if atMs <  d.civilDawnMs:  return "night"
    if atMs <  d.sunriseMs:    return "dawn"
    if atMs <  d.sunsetMs:     return "day"
    return "dusk"

minutesToSunset  = events.sunsetMs    == null ? null : floor((events.sunsetMs    - atMs) / 60_000)
minutesToDusk    = events.civilDuskMs == null ? null : floor((events.civilDuskMs - atMs) / 60_000)
minutesToSunrise = events.sunriseMs   == null ? null : floor((events.sunriseMs   - atMs) / 60_000)
nextDawnMs       = events.civilDawnMs == null ? null
                 : events.civilDawnMs > atMs ? events.civilDawnMs
                 : solarEvents(atMs + 86_400_000, lat, lng).civilDawnMs
```

`nextDawnMs` means *next*, in every phase, as the field doc says: at night `events` has already
rolled to tomorrow so `events.civilDawnMs` is ahead of `atMs` and is returned directly; by day this
morning's dawn is behind us and tomorrow's is computed. Only the night branch is read by any string
in this feature, but a field called "next dawn" that sometimes holds a past instant is a trap for
`weather-filters`, and the extra `solarEvents` call happens once per memoised `daylightAt`.

The `phaseOf` null guard makes the "no crossing" row of the failure table concrete: a day with no
boundaries reads as `night`, `capFromLight` returns null, the dial uncaps. Richmond never reaches
it; `lat 89` in the tests does.

`floor`, not `round`: "sunset in 40" must never be optimistic.

### 3. The cap (`capFromLight`)

```
if light.phase == "night" or light.minutesToDusk == null: return null
usable = light.minutesToDusk
// A round trip must be *home* by dusk; a one-way walk must only *arrive*.
// The dial's units are total minutes in both modes, so no halving is needed:
// the budget IS the wall-clock length of the outing either way.
capped = floorToStep(usable, step, dialMinimum)      // never round up into the dark
if capped < dialMinimum: return null                 // "cannot clamp" -> night statement
return min(capped, MAX_MINUTES)                      // MAX_MINUTES = 100, src/lib/isochrone.ts
```

The final `min` is why the cap is only ever *visible* inside the last hundred minutes of light: six
hours before dusk it equals `MAX_MINUTES`, so there is no shading and no note. The dead zone appears
exactly when the light becomes the binding constraint.

`floorToStep(v, step, low) = low + Math.floor((v - low)/step) * step`. With `DIAL_STEP === 1` this
is `Math.floor(v)`, but the helper is written against the step because `budgetStep()` exists
precisely so the dial's notches, ticks and snap cannot disagree.

Note the asymmetry that is *not* implemented: a one-way walk that arrives at dusk leaves the walker
somewhere dark with no way home, which is a real thing and not this feature's business. The cap uses
the same rule for both, and the switch's hint says "Back before civil dusk" only in round-trip mode
and "Arrive before civil dusk" otherwise.

### 4. Fit (`fitsInLight`)

```
fitsInLight(light, totalMinutes) =
  light.phase == "night"      ? false      // nothing fits in no light
: light.minutesToDusk == null ? false      // no known deadline is not a pass
: totalMinutes <= light.minutesToDusk
```

The night branch carries the whole rule (argued under The decision); it also catches 2am, where
`events` is still today's and dusk is seventeen hours out, because 2am is `phase === "night"` too.
The `minutesToDusk == null` branch returns false so an uncomputable sun does not issue a pass; in
practice `phaseOf` has already said `night` there.

In `App.tsx`, `totalMinutes` is always the *measured* walk —
`Math.ceil((roundTrip ? route.durationSeconds * 2 : route.durationSeconds) / 60)`. There is no
budget fallback: the warning is suppressed entirely while the route is pending, so the card never
accuses a walk it has not measured. This is the same "skeleton means still coming" discipline the
card already applies to its stats.

### 5. Strings (`describeLight`, `describeDusk`, `describeDeadline`)

All three switch on `phase` **first**. That ordering is the fix for a real bug in an earlier draft,
which tested `minutesToSunset > 0` before the dawn branch — and at 6am sunset is thirteen hours
away and comfortably positive, so the dawn branch was unreachable and a pre-dawn walker was told
`sunset in 812`. Phase is the fact; the countdowns are decorations on it.

```
describeLight(light):
  phase "night" -> "after dark"
  phase "dawn"  -> minutesToSunrise == null ? "before sunrise"
                                            : `sunrise in ${minutesToSunrise}`
  phase "dusk"  -> minutesToSunset  == null ? "past sunset"
                                            : `sunset was ${-minutesToSunset} min ago`
  phase "day"   -> minutesToSunset  == null ? "daylight"
                                            : `sunset in ${minutesToSunset}`

describeDusk(light):
  phase "night" -> nextDawnMs == null ? "daylight unknown"
                                      : `dark until ${formatClock(nextDawnMs)}`
  otherwise     -> events.civilDuskMs == null ? "daylight unknown"
                                              : `dusk ${formatClock(events.civilDuskMs)}`

describeDeadline(light, roundTrip):
  phase "night" and nextDawnMs == null
                -> "Daylight is not available for this location."
  phase "night" -> `It is dark. Civil dawn is ${formatClock(nextDawnMs)}.`
  roundTrip     -> `Back before civil dusk, ${formatClock(events.civilDuskMs)}`
  otherwise     -> `Arrive before civil dusk, ${formatClock(events.civilDuskMs)}`
```

`describeDeadline` takes `roundTrip` because it is the only one of the three that has to know
whether the walk comes home — "Back before" and "Arrive before" are different promises, and the Cap
section's stated asymmetry rests on the switch saying which one it is making. The other two never
mention the leg, which is why they take one argument. In `phase "dusk"`, `sunset was 0 min ago` is
possible for exactly one minute; that is accurate, and is left alone.

The result card composes `52 min out and back · sunset in 40` by placing `describeLight` after the
duration it formats through `formatMinutes`. Every number on screen still goes through
`src/lib/format.ts`; `describeLight` returns bare minute counts because the card supplies the unit
in `formatMinutes`' own voice, and clock times go through `formatClock`.

### 6. `mergeCaps`

Filter nulls, return null if empty, otherwise the entry with the smallest `untilMs`, ties broken by
smallest `minutes`. That is the whole function; it exists so `weather-filters` has somewhere to put
rain onset without inventing a second clamp path, and so the dial's cap note can name *which*
condition is doing the clamping.

## Failure and degradation

| What breaks | What the user sees |
| --- | --- |
| Offline / engine down / proxy 503 | Daylight is unaffected — it needs no network. The existing not-configured or error notice covers the reach; the dusk time is not shown because `ReachReadout` only renders its ready branch, and the card is not on screen. Daylight never turns an engine outage into a second complaint. |
| `acos` argument out of range (never in Richmond; possible if a future origin box moves) | `solarEvents` returns nulls. `phaseOf` reports `night` (it cannot phase a day with no boundaries), `minutesToDusk` is null, `capFromLight` returns null, the dial uncaps, `fitsInLight` is false so the card warns rather than reassures, and the switch's hint reads `Daylight is not available for this location.` The switch stays operable, and turning it on does nothing but say that. |
| Device clock wrong | Undetectable today, and the spec says so rather than pretending. Symptom: a plausible but wrong dusk time. Mitigation is the `setClockOffset` seam, which `weather-filters` is asked to fill with a server timestamp. Until then the device is trusted, silently — this is the one honest gap in the feature. |
| Document hidden for hours, then restored | The timer is cleared while hidden and the clock is re-read on `visibilitychange`, so the first visible frame is correct rather than an hour stale. Without this, `setInterval` would fire a burst of catch-up ticks and the cap would jump repeatedly. |
| The tick moves the cap below the current budget | The budget visibly drops to the cap and the dial's dead zone grows. `lightCap` bumps nothing else; the map does not re-frame on a passive tick (only `toggleBeforeDark` bumps `framingKey`), so the camera does not lurch once a minute. The cost is stated rather than hidden: because `framingKey` does not move, `ReachReadout`'s settled sr-only line does not re-announce the smaller reach unless the dusk phrase changed with it. See the ReachReadout note — announcing a recomputed reach once a minute, unprompted, is the worse failure. |
| The tick would clamp during a throw | Suppressed by the `state.spinning` guard; applied on the next tick after the reel lands. A throw is never aborted by the clock. |
| Light runs out with the mode on | The dial uncaps, the switch hint becomes the dawn statement, the card's light clause becomes `after dark`, and the fit warning fires for every walk. No control disables itself and nothing disappears. |
| `Intl` timezone data missing | Not handled, deliberately. Every browser that runs React 18 and MapLibre ships full-ICU `Intl` with IANA zone data; there is no supported target where this fails. A `try`/`catch` falling back to a zone-less formatter would print a confidently wrong wall-clock time, which is strictly worse than not running at all — and this spec refuses silent degradation everywhere else. |
| A pick with no route | The light clause is not rendered (route pending) or the card is already showing "Could not measure this walk"; the fit warning is suppressed because there is nothing measured to judge. |

The panel never goes quiet: in every branch above there is either a visible sentence or an
explicitly-argued absence.

## Cost

- **Bundle. Every number in this bullet is a line-count estimate, not a measured build**, and the
  only one that counts is the one criterion 14 makes the implementer record. `solar.ts` ≈ 3.4 KB raw
  / ≈ 0.9 KB gz (dense arithmetic; the long provenance comment is stripped at build). `daylight.ts`
  ≈ 2.2 KB / ≈ 0.6 KB gz. `conditions.ts` + `useConditions.ts` ≈ 1.6 KB / ≈ 0.5 KB gz.
  `DaylightSwitch.tsx`, the ResultCard/ReachReadout/TimeDial edits and the CSS ≈ 1.2 KB / ≈ 0.4 KB
  gz. **Total ≈ 2.4 KB gzipped**, about 3.7% of the 64 KB budget, for a feature with no dependency
  and no request. `Intl.DateTimeFormat` adds no bytes — it is a platform API — but it is not free at
  runtime, which is a separate line below.
- **Requests per session:** zero. No endpoint, no preconnect, no third-party host.
- **Engine load:** zero directly. Indirectly, turning the mode on can move the budget, which is one
  dial change worth of contour reads — and those come from the prefetched ladder or a snapshot, so
  usually zero upstream queries.
- **Build time:** zero. No snapshot regeneration, no `SNAPSHOT_VERSION` bump.
- **Hosting:** nothing new. `wrangler.toml`, `.env.example` and `public/_headers` are untouched.
- **Runtime:** one timer per app, firing once a minute. `daylightAt` is ~200 flops of trigonometry
  — genuinely free — plus two to four `Intl.DateTimeFormat.formatToParts` calls, which are not: they
  are the reason `useConditions` memoises on `[atMs, origin.lat, origin.lng]` rather than
  recomputing per render, because App re-renders every frame of a dial scrub while all three of
  those sit still. With the memo, the real per-minute cost is one `daylightAt` and one
  `Object.is`-identical `lightCap` dispatch that re-renders nothing.

## Tests

All under the existing `node --test "server/*.test.ts" "src/**/*.test.ts"`, imports carrying
explicit `.ts` extensions.

### `src/lib/solar.test.ts`

Fixtures — Richmond `lat 37.5407, lng -77.436`, USNO local clock times, fetched 2026-08-21 from
`https://aa.usno.navy.mil/api/rstt/oneday?date=<date>&coords=37.5407,-77.436&tz=<tz>` and quoted as
returned:

| Date | tz | civil dawn | sunrise | transit | sunset | civil dusk |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-03-20 | −4 | 06:47 | 07:13 | 13:17 | 19:22 | 19:48 |
| 2026-06-21 | −4 | 05:18 | 05:49 | 13:12 | 20:34 | 21:06 |
| 2026-12-21 | −5 | 06:52 | 07:21 | 12:08 | 16:55 | 17:24 |

1. `solar: matches USNO within two minutes on all five phenomena` — the three rows above,
   asserted by formatting each returned epoch through `formatClock`-equivalent minute arithmetic in
   `America/New_York` and comparing absolute minute difference `<= 2`.
2. `solar: is stable across the DST boundary` — the 2026-03-20 row is after the US spring-forward
   and the 2026-12-21 row is in standard time; both must pass with the same code path and no manual
   offset.
3. `solar: the same instant yields the same day from any caller timezone` — call `solarEvents` for
   `2026-06-21T04:30:00Z` (00:30 Richmond, 13:30 Tokyo) and assert `day === "2026-06-21"`.
4. `solar: civil dusk is later than sunset, sunrise later than civil dawn, noon between` — an
   ordering invariant asserted on all three fixtures.
5. `solar: a latitude with no crossing returns null rather than NaN` — `lat 89`, 2026-06-21,
   `sunsetMs === null` and every field either finite or null.

### `src/app/daylight.test.ts`

Fixture instant: `2026-06-21T22:00:00Z` = 18:00 EDT, sunset 20:34, civil dusk 21:06 → 154 minutes to
sunset, 186 to dusk. Tests that need a specific `minutesToDusk` build a `Daylight` literal rather
than hunting for an instant; the type is a plain record and that is what makes it testable.

6. `daylight: phase is day before sunset, dusk between, night after civil dusk` — three instants.
7. `daylight: minutes are floored, never rounded up` — an instant 90.7 minutes before sunset yields
   `90`.
8. `daylight: after civil dusk it rolls to tomorrow and reports the next civil dawn` — 22:00 EDT on
   2026-06-21 gives `phase === "night"` and `nextDawnMs` formatting to `5:18 am` on the 22nd
   (±2 min).
9. `daylight: the cap is clamped to MAX_MINUTES when dusk is further off than the dial reaches` —
   with `minutesToDusk = 186`, `roundTrip = true`, `dialMinimum = 10`, `step = 1` the cap is
   **`100`**, not 186, because `MAX_MINUTES` is 100 (`src/lib/isochrone.ts`). A second assertion at
   `minutesToDusk = 62` gives `62`, which is the case where the cap is actually visible on the dial.
10. `daylight: the cap floors onto the dial step and is null below the dial minimum` — with
    `minutesToDusk = 8` and `step = 1`: `dialMinimum = 10` → `null`; `dialMinimum = 5` → **`8`**
    (`floorToStep(8, 1, 5) = 5 + floor(3) = 8`, and 8 ≥ 5 so it stands). A third case with
    `minutesToDusk = 8.9` → `8` pins the flooring.
11. `daylight: the cap is null at night` — asserts the mode cannot clamp to zero.
12. `daylight: fitsInLight admits a walk that ends exactly at dusk and refuses one minute more` —
    `minutesToDusk = 60`, `phase "day"`: `60` true, `61` false. The bound is inclusive; a walk that
    finishes on the stroke of civil dusk finished in the light.
13. `daylight: fitsInLight is false at night however much time the rolled-over dusk shows` — a
    `Daylight` with `phase: "night"` and `minutesToDusk: 1400` (tomorrow's dusk, which is what
    `daylightAt` really produces at 11pm) refuses `totalMinutes = 20`. This is the regression test
    for the whole night branch; without it the bug is invisible.
14. `daylight: describeLight switches on phase, not on the sign of minutesToSunset` — a pre-dawn
    `Daylight` (`phase "dawn"`, `minutesToSunset: 812`, `minutesToSunrise: 32`) yields
    `sunrise in 32`, never `sunset in 812`. Plus `after dark` at night and `sunset in 40` by day.
15. `daylight: describeDeadline names arrival for one-way and return for round trip` — same
    `Daylight`, both values of `roundTrip`, asserting the two-argument signature and two distinct
    strings.
16. `daylight: describeDusk is a bare clock phrase in both phases` — `dusk 8:21 pm` by day,
    `dark until 5:18 am` at night. This is the string the readout and the cap note both embed, so it
    must not become a sentence.

### `src/app/session.test.ts` (new file)

17. `session: toggleBeforeDark clamps the budget down to the cap and bumps framingKey`.
18. `session: lightCap returns the same state object when nothing moves` — apply once, then assert
    reference identity of the *second* application against the *result* of the first:

    ```ts
    const once = reduce(s, { type: "lightCap", minutes: 40 });
    assert.equal(reduce(once, { type: "lightCap", minutes: 40 }), once);
    ```

    Calling `reduce(s, …)` twice on the same `s` and comparing the two results would pass only by
    accident: if `s` does not already carry cap 40 both calls allocate fresh objects and
    `assert.equal`'s reference comparison fails. The identity that matters is the *idempotent*
    one — that is what keeps the once-a-minute tick from re-rendering the tree.
19. `session: a cap below the dial minimum does not clamp the dial to an impossible value` — cap
    `null` leaves the budget alone and `dialMaximum` returns `MAX_MINUTES`.
20. `session: clearFilters leaves beforeDark on` — the explicit anti-trap assertion.
21. `session: toggleRoundTrip re-clamps against the cap as well as the round-trip minimum`.

### `src/app/conditions.test.ts`

22. `conditions: mergeCaps picks the earliest deadline, not the smallest budget`.
23. `conditions: mergeCaps of all nulls, and of an empty array, is null`.
24. `conditions: arrivalMs adds the outbound leg in whole milliseconds`.

### `src/lib/solar.test.ts`, continued

25. `solar: sunTimes returns Dates matching solarEvents, and null when the sun does not set` — the
    `opening-hours` contract, asserted here rather than discovered there.

## Acceptance criteria

1. `npm run typecheck`, `npm run lint` (eslint + oxlint anti-slop + knip) and `npm test` are clean;
   any new export reached only by a sibling-spec-to-come carries `/** @public */`.
2. `solarEvents` reproduces all five phenomena on all three USNO fixture dates to within two
   minutes, in both DST states, from a process running in any host timezone.
3. With no route picked and the reach ready, the readout reads e.g. `2.6 sq mi within 25 min · 14
   places in reach · dusk 8:21 pm`, and the settled sr-only line contains the same sentence
   including the dusk phrase — verified by crossing civil dusk (or stubbing the clock past it),
   which changes `duskNote` and therefore re-runs the announcement effect.
4. A landed result card shows the duration and the light clause on one line under the stats —
   `52 min out and back · sunset in 40` — and shows no such line at all while the route is pending
   or failed.
5. Turning **Get back before dark** on when `capFromLight` is below the current budget immediately
   lowers the budget to the cap, plays one `playThock`, and re-frames the map exactly once.
6. With the mode on **and dusk under 100 minutes away**, the dial track still spans 10–100, the
   region above the cap is visibly shaded with a dashed edge, both thumbs refuse to enter it, and
   `.dial-cap-note` reads `Daylight limit 62 min · dusk 8:21 pm`. With dusk further off than that
   the cap equals `MAX_MINUTES`, and there is no shading and no note.
7. A screen reader on the budget slider hears `…minutes, 25 out and 25 back, limited by daylight`
   when capped and no such suffix when not.
8. A walk whose measured round-trip duration exceeds the minutes to civil dusk shows the amber
   `This walk does not fit in the light left.` warning, whether or not the mode is on, and that
   clause appears in the single sr-only status line.
9. After civil dusk with the mode on: the dial is at full range, the switch is still on, its hint
   reads `It is dark. Civil dawn is 5:18 am.`, the card's clause reads `after dark`, and the fit
   warning is showing — for a five-minute walk as much as a ninety-minute one. A build where any
   night walk is reported as fitting has the bug test 13 exists to catch.
10. The cap does not change during a spin; a throw started before a minute boundary lands normally
    and the cap is applied afterwards.
11. Leaving the tab for an hour and returning shows a correct time on the first painted frame, with
    no burst of intermediate values.
12. `git diff --stat` touches no file under `server/`, `worker/`, `scripts/`, `public/` or
    `wrangler.toml`, and the network panel shows no request added on any interaction.
13. `clearFilters` ("Clear filters" in the empty notice) leaves `beforeDark` untouched.
14. Measured gzipped app-JS delta is recorded in the PR — from a real `npm run build`, before and
    after — and is under 3 KB. Every byte figure in **Cost** is an estimate until this number
    exists.
15. `src/lib/solar.ts` exports `SunTimes` and `sunTimes` with exactly the names and shapes
    `docs/plans/opening-hours.md` states, and test 25 asserts them. An implementation that ships
    without these has silently broken a written contract with a sibling spec.
16. Scrubbing the dial does not call `Intl.DateTimeFormat.formatToParts` per frame — check with a
    breakpoint or a counter that `daylightAt` runs at most once per minute plus once per origin
    change, not once per render.

## Open questions

1. **Should `beforeDark` persist across sessions?** Nothing in `Session` is persisted today —
   `route-store.ts` caches answers, not intent — so persisting it would be the first piece of
   remembered user preference in the app and would set a precedent that `shareable-spins` will
   immediately have opinions about. Spec'd as not persisted; a human should confirm that a walker
   who turns the guard on at 7pm is content to turn it on again tomorrow.
2. **Is civil dusk the right deadline for Richmond's unlit walks?** Belle Isle, Buttermilk Trail and
   Reedy Creek have no lighting at all; Cary Street does. A per-place `lit?: boolean` on `Place`
   would let the cap use sunset for unlit destinations and civil dusk for lit ones — a real
   improvement and a real curation cost across the **78** entries in `src/data/places.ts` today
   (App.tsx's comment at the point-in-polygon sweep still says 51 and is stale; fix it in passing),
   and it belongs to `places-expansion` if
   anywhere. Spec'd as one deadline for all destinations; someone who walks these trails should say
   whether that is generous enough to be wrong.
