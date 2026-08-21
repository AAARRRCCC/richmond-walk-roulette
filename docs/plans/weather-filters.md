# Weather, and weather-conscious filters

**Status:** spec — not implemented
**Slug:** `weather-filters`

## Depends on

- **`daylight-budget`** — owns the clock and wins the arbitration in `docs/plans/README.md` §2.1.
  The `src/app/clock.ts` and `src/lib/sun.ts` contracts asked for below are **deleted**: this spec
  reads `useConditions(origin, frozen)`, `solarEvents` and `arrivalMs` from that spec's modules,
  never writes `clock.ts` itself, and never ships with `civilDuskMs: null` because the solar module
  lands in the foundations chunk ahead of it. It owes `setClockOffset(observedAtMs - Date.now())`
  on each successful forecast, which is the only way this app learns the device clock is wrong.
- **`pool-reasoning`** — `selectCandidates` is deleted. `applyConditionRules` and its own
  withdrawal loop are superseded: this spec contributes one `PoolRule` per firing pool rule, each
  with `minSurvivors: 3` and a unique `id`, and `derivePool` performs the withdrawal.
  `ConditionRuleId` stays internal to this spec for its prose; the boundary reason is `"weather"`.

This is **chunk 7**. Two renames are binding (`docs/plans/README.md` §2.1): `src/lib/conditions.ts`
becomes `src/lib/weather-rules.ts` and its `Conditions` type becomes `WeatherVerdict`, because
`src/app/conditions.ts` already exports a type of that name and App imports both; and
`deriveConditions` becomes `deriveWeatherRules`. `budgetCapMinutes` / `effectiveBudget` /
`effectiveFloor` are replaced by `TimeCap`s merged through `daylight-budget`'s single `timeCap`
action, so one cap governs the dial. `formatClock` returns `"8:21 pm"`, not `"7:54p"` (§2.2). The
conditions line on the card is a `ResultLine` with `key: "conditions"` (§2.5). `clearFilters` does
not touch `weatherAware` and `activeFilters` does not count it — ratified in §3.

## What and why

Right now the app answers one question honestly and completely: what can you actually walk to
in the time you have. It answers it with no idea whether it is 96°F in full sun, whether a
thunderstorm is thirty minutes out, or whether the fifty-minute round trip you just asked for
ends after dark. Every one of those changes the answer, and the app currently makes the user
supply the correction from memory. This feature supplies it.

Three things ship together. First, a proxied `/api/weather` — GET, no parameters, Richmond's
coordinates pinned server-side next to `WALKING_SPEED_KMH`, edge-cached for fifteen minutes on a
single constant key. Second, a conditions line, in the panel and on the result card, written so
it changes a decision rather than decorating one: "72°F, feels 74. Rain likely in 40 min" is a
sentence you act on; "Partly cloudy, 72°" is wallpaper. Third — the actual ask — a small set of
rules that change the candidate pool when the weather says they should: trim the time budget so
the round trip finishes before the rain, prefer shade and water and doors in dangerous heat,
refuse the hills when the heat index is in the NWS Danger band.

Be clear about what this does not do. It does not forecast for anywhere but Richmond, by
construction — the endpoint takes no coordinates, which is the same reason `/api/isochrone`
clamps to a bounding box. It does not rank or weight the draw; `randomIndex(candidates.length)`
stays uniform, because a roulette that secretly prefers the museum is not a roulette. It does not
filter on cold: 28°F is a perfectly normal temperature to walk in and there is no safety-grade
argument for deleting places from a pool over it, so cold gets a sentence and not a rule until
the apparent temperature is in single digits. It does not silently shrink anything: every rule
that bites is named in prose on screen, every rule that was withdrawn is named too, and the
report's own age is named once it goes stale. And it never blocks a spin. The forecast is
the one async source in this app that is allowed to simply not arrive.

## The decision

**Source: Open-Meteo, called only by the proxy.** It is key-free, needs no sign-up, returns
current *and* hourly `temperature_2m`, `apparent_temperature`, `precipitation`,
`precipitation_probability`, `weather_code`, `wind_speed_10m`, `uv_index` and `is_day` in one
request, and will serve °F / mph / inch directly so no unit arithmetic crosses the wire. A live
call was verified against the exact query below and returns 200 with every field populated —
including `uv_index` and `precipitation_probability` inside `current=`, which the docs table does
not list. Do not trust the docs table on that; the check has been done, but re-run it before
implementing, because it is the one field-availability fact this whole design leans on.

**The licence is a tripwire and must be written into the code, not this document.** Open-Meteo's
data is CC-BY 4.0 (confirmed on <https://open-meteo.com/en/pricing>) and the API's free tier is
sold as non-commercial use, with a paid subscription carrying the commercial licence. The pricing
page does *not* itself define the commercial boundary — that wording lives in the terms, and it is
an **assumption to re-read before launch** that "websites or apps with subscriptions or
advertisements" is the line. A free, ad-free Walk Roulette is on the safe side of any reading of
it; the day it is not, this needs a paid plan. That is why the proxy normalises Open-Meteo's shape
into an app-owned response type instead of forwarding it: switching vendors becomes one module
rather than a rewrite. The attribution link (`Weather data by Open-Meteo.com`) ships next to the
displayed data.

The fallback, checked rather than assumed
(<https://www.weather.gov/documentation/services-web-api>): `api.weather.gov` is open U.S.
Government data, free for any purpose, but it **requires a self-identifying `User-Agent`**, needs
**two round trips** (`/points/{lat},{lon}` then the gridpoint forecast), publishes **no rate
limit** ("not public information … allows a generous amount"), and its documentation lists **no UV
index**. So the fallback is a module with a header, a two-call sequence, a cache for the
`/points` lookup and a `uvIndex: null` everywhere — half a day of work, not the hour the phrase
"one function in one file" implied. Budget it that way if the licence question ever turns.

**Rejected: fetching Open-Meteo from the browser.** It would work — no key, CORS open — and it
was rejected because it breaks the invariant the whole server layer exists to hold. It also loses
the shared edge cache (see the cost section for what that is actually worth) and it adds a
permanent third-party host to the client's network profile plus a preconnect.

**Rejected: a one-hour edge TTL.** Cheaper upstream, wrong for the only rule that earns its
bytes. "Rain in 40 minutes" is worthless when the forecast is 55 minutes old. 900 s matches the
`current.interval: 900` the API itself reports, so the edge never serves data more than one
refresh stale.

**Rejected: asking the weather API for sunset.** Daylight is deterministic arithmetic and belongs
in `src/lib/sun.ts`, owned by the `daylight-budget` spec. Open-Meteo's `daily=sunset` has no
civil-twilight field, which is the threshold a walker actually cares about, and it cannot answer
"will it be dark at now + 50 minutes" without a round trip. This spec consumes that module; it
does not duplicate it, and it ships perfectly well with `civilDuskMs: null`.

**Rejected: a fourth `<Stat>` on the result card.** `.result-stats` is a hard
`grid-template-columns: repeat(3, 1fr)`, and a fourth cell makes a lopsided second row. The
conditions go on their own line under the stats.

**Rejected: ranking candidates by weather suitability instead of filtering.** The draw is uniform
over `candidates` by design. Weights would reach into the spin's fairness, the reel's display
pool and `reel.ts`'s pure phase machine to buy something a filter already delivers.

**Rejected: two switches (one for time caps, one for pool preferences).** The user's mental model
is one thing — "mind the weather" — and two switches invites the state where caps are on and
preferences are off for no reason anyone can articulate. One switch, defaulting on.

**How a time cap is expressed is the load-bearing choice.** A cap could filter places by their
cached route duration, but route durations arrive asynchronously, so the pool would churn as they
land, `candidateKey` would churn with it, and the spin-abort effect would make spinning
impossible. Instead a cap **lowers the effective budget the reach is built from**. The dial ladder
already holds every minute from 5 to 100, so a capped budget is a rung that is already warm, and
everything downstream follows for free: the contour on the map visibly shrinks, the readout's area
and count change, the "Places in reach" drawer shortens, and the pool narrows — all consistently,
because they all read the same `Reach`. A cap is therefore the one rule allowed to empty the pool,
because a cap is the one rule you can *see*. The two invisible rules are guarded.

**The cap ratchets, and it is quantised so it ratchets slowly.** `deriveConditions` re-runs on
every minute tick, and a raw `onsetMinutes - CAP_MARGIN_MINUTES` would fall by one minute every
minute as the rain approaches: the contour would redraw, the readout would change, and
`candidateKey` would churn once a minute, resetting `poolKey` and restarting the
`ROUTE_WARM_GRACE_MS` timer each time. So every candidate cap is quantised down to a five-minute
grid (`5 * floor(cap / 5)`, floored at `dialMinimum`). The cap still moves — it must, the rain is
still coming — but it moves at most once every five minutes, which is slow enough that a warm-up
completes between steps. This is a deliberate, tested behaviour, not an accident (test 33).

**Freezing.** Conditions derive from a ticking clock and a refreshing forecast, so they can change
between the reel starting and landing. Both sources are held during a throw: `useNow(frozen)`
returns its last value while `state.spinning`, and `holdWeather(true)` makes a completed refresh
stash itself and apply on release.

**Unverified, check first.** (1) That `current.uv_index` and `current.precipitation_probability`
are still accepted — re-run the verification request. (2) That Cloudflare's Cache API will store a
response for a synthetic GET key built from a real GET request without the browser's own
`Cache-Control` interfering; the isochrone path only ever does this from a POST. Assert it in
`server/worker.test.ts` with `stubEdgeCache` before trusting it in prod, and if it does not hold,
**fall back to keying weather on the real request URL** (`new Request(request.url)`) — weather is a
parameterless GET, so its own URL is already canonical; the only thing lost is the version segment,
which then has to be invalidated by hand on a shape change. Say so in the code. Without either
path the cost model degrades from one upstream call per colo per refresh to one per visitor per
refresh, which the free tier still survives (see Cost) but which removes all headroom.

## Data and types

### Endpoint

```
GET /api/weather
```

No body. No query string — any query string is a 400, in the proxy *and* before the Worker's edge
lookup. `HEAD` and everything except `GET` is a 405, matching `/api/health`.

**200 response** (this is the app's own shape, not Open-Meteo's):

```json
{
  "observedAt": "2026-08-21T07:15:00.000Z",
  "refreshSeconds": 900,
  "now": {
    "atMinutes": 0,
    "temperatureF": 72.4,
    "feelsLikeF": 74.1,
    "precipInches": 0,
    "precipChance": 8,
    "weatherCode": 3,
    "windMph": 6.2,
    "uvIndex": 0,
    "isDay": false
  },
  "hours": [
    { "atMinutes": -15, "temperatureF": 72.1, "feelsLikeF": 73.8, "precipInches": 0, "precipChance": 8, "weatherCode": 3, "windMph": 6.0, "uvIndex": 0, "isDay": false }
  ],
  "source": "open-meteo"
}
```

`observedAt` is an absolute UTC instant, reconstructed in the proxy from Open-Meteo's local
`current.time` plus `utc_offset_seconds`, so **no timezone string crosses the wire and the client
does no timezone arithmetic**. `atMinutes` on each hourly slot is whole minutes from `observedAt`
to that slot; the first slot is the hour already in progress, so it is normally negative (down to
-59). The client re-ages both against `Date.now()` because the edge may have held the payload for
up to 900 seconds. `hours` is ascending by `atMinutes` and covers at least the next 12 hours.

**Per-field tolerance, not per-slot.** Open-Meteo returns `null` for fields past a model's
horizon — `precipitation_probability` and `uv_index` are the two that do it in practice — so
dropping a whole slot for one null would quietly stop the rain rule firing on exactly the slots it
exists for. Only `time`, `temperature_2m` and `apparent_temperature` are required; a slot missing
one of those is dropped. `precipChance`, `uvIndex` and `precipInches` are **nullable on the wire
and in the client type**, and a rule reading a null treats it as *unknown* — it does not fire, and
it does not read it as zero. `weather_code`, `wind_speed_10m` and `is_day` fall back to `0`, `0`
and the `now` slot's value respectively, because none of them can invent a hazard.

`is_day` comes back as `0`/`1`, not a JSON boolean, and `src/lib/json.ts` has no boolean guard.
The proxy narrows it with `isFiniteNumber` and coerces with `=== 1`. Do not reach for a type
assertion here; the oxlint anti-slop plugin will reject it and it would be wrong anyway.

**Error responses** reuse the proxy's existing error *codes* — `502 upstream-unreachable`,
`504 upstream-timeout`, `502 upstream-empty`, upstream 429/408 passed through with `retry-after`,
any other upstream 4xx collapsed to 400, upstream 5xx to 502 — so `src/lib/http.ts`'s transient
classification needs no change. They do **not** reuse the routing engine's prose or its log tag;
see `weatherUnreachable` below. There is deliberately no 503 `not-configured` for weather: the
upstream URL has a working default, so there is no configuration state to be in.

### Client types — `src/lib/weather.ts`

```ts
/** One slot of forecast, already in the units this app displays. */
export type WeatherSlot = {
  /** Whole minutes from the report's `observedAt`. Negative for the hour in progress. */
  atMinutes: number;
  temperatureF: number;
  feelsLikeF: number;
  /** Null past a model's horizon. Null is unknown, never zero. */
  precipInches: number | null;
  /** 0..100, or null past a model's horizon. */
  precipChance: number | null;
  /** WMO code. See WMO_THUNDER below; otherwise carried, not interpreted. */
  weatherCode: number;
  windMph: number;
  /** Null past a model's horizon. */
  uvIndex: number | null;
  isDay: boolean;
};

export type WeatherReport = {
  /** Epoch milliseconds. Parsed once from the wire's ISO string. */
  observedAtMs: number;
  refreshSeconds: number;
  now: WeatherSlot;
  hours: WeatherSlot[];
  source: string;
};
```

### Conditions types — `src/lib/conditions.ts`

```ts
import type { Place, Vibe } from "../data/places";

/** Every rule this app is willing to change the pool for. */
export type ConditionRuleId =
  | "rain-window"
  | "storm-window"
  | "heat-shelter"
  | "heat-flat"
  | "uv-shelter"
  | "cold-cap"
  | "dark-return";

/**
 * One fired rule. Everything a rule wants is on the rule, so a withdrawal can
 * always be attributed to the rule that caused it — which is the contract
 * `pool-reasoning` is promised. There is deliberately no `withdrawn` field:
 * withdrawal is not knowable here. It is decided by `applyConditionRules`
 * against the pool the user's own filters produced, and it is reported in
 * `RuleOutcome`.
 */
export type ConditionRule = {
  id: ConditionRuleId;
  /**
   * One sentence, sentence case, no trailing period. Shown verbatim.
   * Composed *after* the budget is decided, so a rule can never claim a
   * trim the app did not perform.
   */
  reason: string;
  /** Non-null when this rule wants candidates that carry one of these tags. */
  preferredTags: readonly Vibe[] | null;
  /** True when this rule wants `hilly` places out of the pool. */
  vetoHilly: boolean;
};

export type Conditions = {
  /**
   * The budget the app will actually build reach from, total minutes, already
   * min-ed across every firing cap, floored to the five-minute grid, clamped
   * into `[inputs.dialMinimumMinutes, inputs.budgetMinutes]`. Null means no
   * cap: `App` uses `state.budgetMinutes` untouched.
   */
  budgetCapMinutes: number | null;
  /** Every rule that fired, in the order evaluated. */
  rules: ConditionRule[];
  /** The one-line summary. Null when there is no forecast at all. */
  headline: string | null;
  /**
   * How old the report is, whole minutes, when that age has passed
   * `STALE_MULTIPLE` refresh windows. Null while it is fresh. Non-null is a
   * line on screen: caps derived from hours-old data must say so.
   */
  staleMinutes: number | null;
};

/** What `deriveConditions` needs that is not the forecast. */
export type ConditionInputs = {
  /** Epoch ms. Frozen during a throw. */
  nowMs: number;
  /** The user's dial position, total minutes. */
  budgetMinutes: number;
  /** `dialMinimum(roundTrip)`. A cap is never allowed below this. */
  dialMinimumMinutes: number;
  roundTrip: boolean;
  /** From `daylight-budget`. Null when that spec is not yet implemented. */
  civilDuskMs: number | null;
  /** The switch. False means text only: no caps, no preference, no veto. */
  weatherAware: boolean;
};
```

The `deriveConditions` signature, and the pure pool helper:

```ts
export function deriveConditions(
  report: WeatherReport | null,
  inputs: ConditionInputs,
): Conditions;

export type RuleOutcome = {
  kept: Place[];
  /** Rule ids that survived the min-survivors guard and were applied. */
  applied: ConditionRuleId[];
  /** Rule ids that fired but were withdrawn because they emptied the pool. */
  withdrawn: ConditionRuleId[];
};

export function applyConditionRules(places: Place[], conditions: Conditions): RuleOutcome;
```

`RuleOutcome` is not an implementation detail. It is what `ConditionsLine` renders and what
`activeFilters` counts, so `App` must hold it rather than discard it — see the `App.tsx` section.

### Wire shape asked of Open-Meteo (proxy-internal)

```
GET https://api.open-meteo.com/v1/forecast
  ?latitude=37.5407&longitude=-77.436
  &timezone=America%2FNew_York
  &forecast_hours=12
  &current=temperature_2m,apparent_temperature,precipitation,precipitation_probability,weather_code,wind_speed_10m,uv_index,is_day
  &hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,uv_index,is_day
  &temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch
```

Note the response's `latitude`/`longitude` are the model grid cell, not what was asked for
(37.55376, -77.44317 for this request). Never key anything off the response coordinates.

## Changes, file by file

### `server/proxy.ts` — modified

- Add to `ProxyEnv`: `WEATHER_URL?: string | undefined`, documented as "the forecast upstream;
  unset means Open-Meteo. Exists so the vendor can be swapped without a code change and so a test
  or a self-host can point somewhere else."
- New module-private constants, with the prose that pins them:
  `const WEATHER_ORIGIN = { latitude: 37.5407, longitude: -77.436 };` (Richmond's centre — pinned
  here for the same reason `BOUNDS` is: an endpoint that takes coordinates is a worldwide weather
  service with this app's name on it), `const WEATHER_TIMEZONE = "America/New_York";`,
  `const WEATHER_HOURS = 12;`, `const DEFAULT_WEATHER_URL = "https://api.open-meteo.com/v1/forecast";`,
  `const WEATHER_TIMEOUT_MS = 8_000;` (shorter than `UPSTREAM_TIMEOUT_MS`: nothing waits on this,
  and a forecast that takes eight seconds has already missed its moment).
- New export: `export const WEATHER_REFRESH_SECONDS = 900;` — the TTL, the `refreshSeconds` in the
  body, and the number the Worker caches for, all one constant so they cannot drift.
- **New failure vocabulary, separate from the engine's.** `unreachable()` hardcodes
  `"The routing engine is not answering."` and `logUpstream()` hardcodes `at: "valhalla"`. Reusing
  either would make an Open-Meteo blip read, in the visitor's notice *and* in `wrangler tail`, as a
  routing outage — the single most expensive wrong diagnosis this system can produce. So add:
  ```ts
  function logWeather(event: string, fields: JsonObject): void {
    console.error(JSON.stringify({ at: "weather", event, ...fields }));
  }
  function weatherUnreachable(base: string, timedOut: boolean): Response {
    logWeather(timedOut ? "upstream-timeout" : "upstream-unreachable", { base });
    return timedOut
      ? json({ error: "upstream-timeout", detail: "The forecast service did not answer in time." }, 504)
      : json({ error: "upstream-unreachable", detail: "The forecast service is not answering." }, 502);
  }
  ```
  The `upstream-empty` case gets its own detail too: `"The forecast service returned nothing we
  recognise."` The base URL still goes to the log and never into the body.
- New export: `export function weatherCacheKey(payload: Json, request: Request): string | null`.
  Returns `null` when `request.method !== "GET"` or `new URL(request.url).search !== ""` —
  **this is the fix that makes the query-string refusal true in production and not just in
  `proxy.test.ts`**. The Worker consults the edge before it ever calls `handleApiRequest`, so a
  key that ignored the query string would serve the warm Richmond entry to
  `GET /api/weather?latitude=48.85` with a 200. A null key skips the cache entirely and the request
  falls through to the proxy's 400. Otherwise it returns
  `` `/api/weather/${CACHE_VERSION}-${WEATHER_HOURS}/richmond` ``; the version segment carries the
  hour count because changing the requested window must not be served from a stale entry. `payload`
  is unused and named `_payload`, kept so the Worker's `keyFor` slot stays one shape.
- New module-private `async function weather(env: ProxyEnv): Promise<Response>` — builds the
  query, calls a new `callUpstream(url, timeoutMs)` (extract the fetch-plus-deadline-plus-
  `TimeoutError`-discrimination half of `callValhalla`, or copy it with a comment saying why;
  do not route weather through `callValhalla`, whose signature is POST-and-Valhalla-shaped and
  whose failure path is `unreachable`), narrows the body with `isJsonObject` / `isJsonArray` /
  `isFiniteNumber` / `isString`, and normalises per the tolerance rules above. A missing `current`
  block is `502 upstream-empty`.
- In `handleApiRequest`: add `const isWeather = pathname === "/api/weather";` to the guard,
  and before the POST-method check:
  ```ts
  if (isWeather) {
    if (request.method !== "GET") return json({ error: "method not allowed" }, 405);
    if (new URL(request.url).search !== "") return badRequest("weather takes no parameters");
    return weather(env);
  }
  ```
  This sits next to the `isHealth` block, which is the existing precedent for a GET endpoint.

### `worker/index.ts` — modified

- Widen `edgeEntry`'s slot to `keyFor: (payload: Json, request: Request) => string | null` and pass
  `request` through. `isochroneCacheKey` and `routeCacheKey` keep their one-parameter signatures —
  a narrower function is assignable — so this is a one-line change with no call-site churn, and it
  is what lets a cache key refuse to exist for a request that should not be cached at all.
- Import `weatherCacheKey` and `WEATHER_REFRESH_SECONDS`.
- `const isWeather = url.pathname === "/api/weather";`
- Extend the cache branch: `else if (isWeather) cache = await edgeEntry(request, null, weatherCacheKey, WEATHER_REFRESH_SECONDS);`
  The body pre-read stays POST-only; weather has no body.
- Rate-limit cost is 1 — the existing `: 1` fallback already covers it; add a clause to that
  comment saying weather costs one because one upstream call serves every visitor for fifteen
  minutes.
- Rename module-private `contours(body)` to `cachedJson(body)`. It is not contours any more and
  the name would lie in three call sites. No test references it by name; if one does, keep it.

### `wrangler.toml` — modified

Add `WEATHER_URL = "https://api.open-meteo.com/v1/forecast"` under `[vars]`, beside
`VALHALLA_URL`.

### `.env.example` — modified

Add `WEATHER_URL=` with the same prose as `ProxyEnv`, plus a line stating the licence position:
free while this app is free and ad-free, `https://api.weather.gov` is the public-domain fallback
the normalised response shape exists to permit.

### `vite.config.ts` — modified

Destructure `WEATHER_URL` out of `loadEnv(mode, cwd, "")` and thread it into `apiProxy({...})`.
**Resolve it with `||`, not `??`.** `loadEnv` with an empty prefix yields `""` — not `undefined` —
for a key that is present-but-blank or absent from `.env.local`, so `WEATHER_URL ?? DEFAULT` would
hand the proxy an empty string and dev would fetch the origin's own root. `VALHALLA_URL` only gets
away with `?? undefined` because it is tested with `if (!base)`. The weather path has a default and
must therefore fall back on falsiness. Forgetting this whole line is the other failure mode:
weather works in the Worker and is silently absent in dev.

### `src/lib/http.ts` — modified

Refactor the retry loop so a GET can share it. Keep `postJson`'s signature untouched and add:

```ts
export function getJson(
  url: string,
  options?: { signal?: AbortSignal | undefined; attempts?: number | undefined },
): Promise<Response>;
```

`attempts` defaults to `MAX_ATTEMPTS`. Weather passes `{ attempts: 2 }` with a comment: this is
the one request nothing waits on, and burning three attempts and seventy seconds of backoff on a
decoration is a waste of the user's radio.

### `src/lib/weather.ts` — new

The whole client-side weather tier. Module state, read synchronously during render, in the shape
`route.ts` and `isochrone.ts` already use.

```ts
/** The current report, or null when there has never been one. */
export function cachedWeather(): WeatherReport | null;
/** True when the last attempt failed and nothing is in flight. */
export function weatherUnavailable(): boolean;
/**
 * Starts a fetch if the cached report is older than its refresh window and
 * nothing is already in flight. Safe to call every render; it is a no-op in
 * the common case. `onSettled` is the App's bump counter.
 */
export function refreshWeather(onSettled: () => void): void;
/**
 * Holds the swap. A refresh that lands while held is stashed and applied on
 * release, so the conditions cannot move under a spin that is mid-flight.
 */
export function holdWeather(hold: boolean): void;
```

Internals: one `WeatherReport | null`, one `fetchedAtMs`, one in-flight promise, one
`failedAtMs`, one stash slot. Backoff on failure is a plain `FAIL_BACKOFF_MS = 120_000` before
`refreshWeather` will try again — no attempt counter in `Session`, deliberately, and the comment
must say why: `routeAttempt` exists because the UI offers a **Try again** button for a route and
something has to make that effect re-run. Weather offers no such button, because a forecast the
user has to ask for twice is worse than no forecast. The clock tick is what re-runs it.

**`cachedWeather()` keeps the last good report forever, and that is a promise about honesty, not a
loophole.** If refreshes start failing after one success, `weatherUnavailable()` is true *and* a
report exists — and the caps keep biting off data that may be hours old. That is why `Conditions`
carries `staleMinutes` and `ConditionsLine` renders it: a stale report is used, and said.

Parsing goes through `readJson` + the `json.ts` guards, exactly as `requestContours` does. The
report is built once per successful fetch and its identity is stable until the next one, so it
can be compared by reference.

### `src/lib/conditions.ts` — new

Pure. No runtime imports beyond types from `places.ts` and `weather.ts`, so `node --test` can
type-strip it. Exports `deriveConditions`, `applyConditionRules`, the types above, and the
threshold constants (`HEAT_SHELTER_F = 90`, `HEAT_DANGER_F = 103`, `UV_SHELTER = 8`,
`COLD_CAP_F = 10`, `RAIN_CHANCE = 55`, `RAIN_INCHES = 0.01`, `MIN_SURVIVORS = 3`,
`CAP_MARGIN_MINUTES = 5`, `STORM_MARGIN_MINUTES = 15`, `CAP_GRID_MINUTES = 5`,
`STALE_MULTIPLE = 3`, `WMO_THUNDER = new Set([95, 96, 99])`) so a test can name them rather than
repeat magic numbers.

### `src/app/clock.ts` — **contract with `daylight-budget`, not owned here**

`weather-filters` requires:

```ts
/** Epoch ms, ticking on the minute. Returns its last value while `frozen`. */
export function useNow(frozen: boolean): number;
export const MINUTE_MS = 60_000;
```

One shared subscription, aligned to the minute boundary, `visibilitychange`-aware so a
backgrounded tab does not tick. `daylight-budget` owns this file and `src/lib/sun.ts`. If
`daylight-budget` lands second, `weather-filters` must write `src/app/clock.ts` itself, at exactly
that path with exactly that signature — **and that is real, uncharged scope**: a shared
subscription with minute alignment, visibility handling and its own test is roughly 1.5 KB raw and
half a day, on top of everything below. `src/lib/sun.ts` stays uncharged either way, because this
spec never needs it: it passes `civilDuskMs: null` and the `dark-return` rule simply does not fire.
**Neither spec may call `Date.now()` inside a render or start its own interval.** Three separate
notions of "now" is the bug this contract exists to prevent.

### `src/lib/sun.ts` — **contract with `daylight-budget`**

Not written here and not consumed here on day one. When it lands, `weather-filters` reads only:

```ts
export function sunEvents(atMs: number): {
  sunriseMs: number; sunsetMs: number; civilDawnMs: number; civilDuskMs: number;
};
```

and the change in `App.tsx` is one line — swapping the literal `null` documented below for
`sunEvents(now).civilDuskMs`.

### `src/app/session.ts` — modified

- New field on `Session`: `weatherAware: boolean;` with the comment that it gates every rule that
  changes the pool, never the conditions line, and that it defaults on because the rules it gates
  are the ones a walker would apply from memory anyway.
- `initialSession`: `weatherAware: true`.
- New action member: `| { type: "toggleWeatherAware" }`. The reducer is an exhaustive switch with
  no default, so this is a type error until handled.
- Handler: `case "toggleWeatherAware": return { ...state, weatherAware: !state.weatherAware };`
  It must **not** clear `pickedId` — a weather rule can move the pool under an existing pick, and
  the result card's "outside your current time budget" warning is already the right answer for
  that.
- **`clearFilters` does not touch `weatherAware`.** The earlier draft had it reset to `true`, which
  is incoherent from both ends: the drawer's `activeFilters` count would not drop when the user
  pressed **Clear filters**, and a user who had deliberately turned the weather rules off would
  have them switched back on by a button that says "clear". `clearFilters` clears the things the
  count counts — terrain, vibes, edgeOnly — and the comment says so.

### `src/app/App.tsx` — modified

- `const now = useNow(state.spinning);`
- `const [, bumpWeather] = useReducer((n: number) => n + 1, 0);` — its **own** counter, next to
  `bumpContours` and `bumpRoutes`, for the reason those two are separate: a landed forecast must
  not invalidate reach or restart route warming.
- An effect on `[now]` calling `refreshWeather(bumpWeather)`, and an effect on `[state.spinning]`
  calling `holdWeather(state.spinning)`.
- `const report = cachedWeather();` read synchronously per render, unmemoised, like `reach`.
- ```ts
  const conditions = deriveConditions(report, {
    nowMs: now,
    budgetMinutes: state.budgetMinutes,
    dialMinimumMinutes: dialMinimum(state.roundTrip),
    roundTrip: state.roundTrip,
    // Literal null until `daylight-budget` ships `src/lib/sun.ts`; the field is
    // nullable precisely so this is the one line that changes then, and so the
    // `dark-return` rule is absent rather than wrong in the meantime.
    civilDuskMs: null,
    weatherAware: state.weatherAware,
  });
  ```
- **Effective budget.** `deriveConditions` has already min-ed the caps, quantised and clamped, so
  `App` only chooses between the cap and the dial:
  ```ts
  const effectiveBudget = conditions.budgetCapMinutes ?? state.budgetMinutes;
  const capped = effectiveBudget < state.budgetMinutes;
  // A floor above the capped budget is a hole with nothing outside it.
  const effectiveFloor = state.floorMinutes >= effectiveBudget ? dialMinimum(state.roundTrip) : state.floorMinutes;
  ```
  Feed `effectiveBudget` / `effectiveFloor` through the existing `outboundMinutes` /
  `outboundFloorMinutes` helpers into `cachedReach`, `isWarm` and the readout. The dial itself
  keeps showing `state.budgetMinutes` — the cap is a condition, not a user preference, and moving
  the thumb without being touched is a UI lie. `framingKey` is **not** bumped: the contour
  redraws in place and the camera stays put.
- `selectCandidates` gains a fifth parameter and **returns a `RuleOutcome`, not a `Place[]`**:
  ```ts
  function selectCandidates(
    reach: Reach | null,
    terrain: Terrain | "any",
    vibes: readonly Vibe[],
    edgeOnly: boolean,
    conditions: Conditions,
  ): RuleOutcome
  ```
  Existing filters and the point-in-polygon tests run unchanged and first; then the whole
  `applyConditionRules(kept, conditions)` result is returned. Order matters: the guard must
  count survivors of the user's own choices, not of all 62 places, or a museum preference would
  look harmless while the user is standing on a `hilly` + `food` filter. With no reach, return
  `{ kept: [], applied: [], withdrawn: [] }`.
- At the call site: `const outcome = selectCandidates(...); const candidates = outcome.kept;` —
  `candidateKey` and everything downstream are unchanged. **`outcome` must be held, not
  discarded**: `applied` and `withdrawn` are the only place withdrawal is known, and both
  `ConditionsLine` and `activeFilters` read them. Wrap the call in `useMemo` keyed on the same
  inputs so `outcome`'s identity is stable across the minute tick when nothing has moved.
- `activeFilters` is unchanged and does **not** count weather. It counts what **Clear filters**
  clears, and the weather switch is not one of those; a count that cannot be cleared by the button
  next to it is worse than no count. The cause of a shrunken pool is instead named in prose by
  `ConditionsLine`, which is always visible in the panel — not hidden behind the collapsed drawer.
- The `emptyNotice` block gains a second, weather-specific button, rendered only when
  `state.weatherAware && (capped || outcome.applied.length > 0)`: **Ignore the weather**,
  dispatching `{ type: "toggleWeatherAware" }`, with `playThock(false)` before it. Without this the
  escape hatch is a lie — when a cap empties the pool, **Clear filters** clears nothing that caused
  it, and the actual remedy is a switch inside a drawer the user cannot see on a phone.
- `describeResult` gains a trailing `conditions: string | null` parameter, appended as a final
  clause, built from the headline plus any applied rule reasons. Note honestly what this is and is
  not: `announcement` is `""` until a pick lands, so this makes conditions audible *with a result*,
  not before one. The pre-spin path for a screen reader is the `ConditionsLine` paragraphs
  themselves, which are ordinary static text in the panel — reachable by navigation, no live region
  involved. **Do not add a live region.** The page already has `role="alert"` on the location and
  failure notices and `role="status"` on the short-reel notice and the `sr-only` result line;
  a fifth announcer competing with those is how a page becomes unusable with a screen reader.
- `<Filters>` block gains `weatherAware={state.weatherAware}` and
  `onToggleWeatherAware={() => dispatch({ type: "toggleWeatherAware" })}`.
- New `<ConditionsLine>` rendered inside `.panel`, immediately after the readout/notice and
  before the Spin button — the last thing read before the decision to press it. It does not need
  `inertWhen(picking)`: it is inside `.panel`, which already carries it.
- `<ResultCard>` gains `conditions={conditions}` and `report={report}`.

### `src/ui/ConditionsLine.tsx` — new

```ts
export type ConditionsLineProps = {
  report: WeatherReport | null;
  unavailable: boolean;
  conditions: Conditions;
  outcome: RuleOutcome;
  capped: boolean;
  /** `candidates.length`, for the withdrawal sentence. */
  keptCount: number;
};
```

Renders, in order:

1. `<p className="conditions">` — `conditions.headline`, plus a `.conditions-credit` anchor:
   `<a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>`. 10px,
   `--ink-3`, `--mono`, the `.field-label` letter-spacing. Rendered only when
   `conditions.headline !== null` — an absent forecast is absent, not a skeleton, because nothing
   is waiting on it.
2. When `unavailable && report === null`: `<p className="conditions is-quiet">No forecast right
   now.</p>`. Neutral, not `.is-warn`. It is not a failure of the app's promise. When
   `unavailable` but a report *does* exist, this line is **not** shown — the headline is real data
   and saying "no forecast" beside it is a contradiction. Step 3 covers that case instead.
3. When `conditions.staleMinutes !== null`: `<p className="conditions is-quiet">Forecast is
   {staleMinutes} min old.</p>`. This fires whether or not refreshes are currently failing, and it
   is the line that keeps a cap derived from hours-old data honest.
4. One `<p className="notice is-warn">` per rule in `conditions.rules` whose `id` is **not** in
   `outcome.withdrawn`. Text is the rule's `reason`, and nothing else: no icon. `.notice.is-warn`
   is `align-items: baseline` and is what `state.locationError` already uses as a text-only warn
   paragraph, which makes it the idiom that fits. `.result-warning` is the icon-plus-text layout
   and it lives on the result card; do not import a `WarningIcon` here to chase it. Bytes saved,
   layout that already works.
5. When `outcome.withdrawn.length > 0`, one `<p className="conditions is-quiet">` reading
   "Kept the {keptCount} places that were left — some weather rules would have emptied the pool."
   This is the "never silently hide" promise made visible from the other direction. The
   `pool-reasoning` spec is expected to replace this line with its own richer surface; see the
   contract below.

No weather glyph is imported at all. The house note in `App.tsx` about rotating a caret rather than
importing a second shape applies: a sun and a cloud and a raindrop are three kilobytes for
something the sentence already says.

### `src/ui/ResultCard.tsx` — modified

New optional props `report: WeatherReport | null` and `conditions: Conditions`. Renders one
`<p className="result-conditions">` between `</dl>` and the warnings: mono, 11.5px, `--ink-2`,
middot-separated — `Feels 96°F · UV 9 · Sunset 7:54p`. A null `uvIndex` drops that segment rather
than printing `UV 0`. The sunset segment appears only once `sun.ts` exists. The stats grid stays
three columns.

### `src/ui/Filters.tsx` — modified

New props `weatherAware: boolean` and `onToggleWeatherAware: () => void`. A third `<Switch>` in
the `.switch-row`, labelled **Mind the weather**, hint **Trim the walk for rain, heat and dark**.
Cue: `playThock(!props.weatherAware)` called synchronously immediately before the callback, per
the house convention. **No CSS change is required**: `.switch-row` (`app.css:889`) is already
`display: flex; flex-direction: column; gap: 12px`, a single column at every width, so a third
switch stacks correctly with no breakpoint and no `flex-wrap` — which would in any case do nothing
on a column flex container.

### `src/lib/format.ts` — modified

```ts
/** "72°F". Rounded; a tenth of a degree is noise on a sidewalk. */
export function formatFahrenheit(f: number): string;
/** "in 40 min", "now", "in 2 hr 10 min". Minutes, not seconds — this is forecast horizon. */
export function formatHorizon(minutes: number): string;
/** "UV 9". Rounded to whole; the EPA scale is integers. */
export function formatUv(index: number): string;
/** "7:54p", Richmond time. */
export function formatClock(atMs: number): string;
```

`formatClock` is not free, and the part handling has to be specified or two implementers will get
two different strings. One module-level formatter, built lazily and reused (construction is the
expensive half of `Intl`):
`new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true })`.
Call `.formatToParts(atMs)`, find the `hour`, `minute` and `dayPeriod` parts, and return
`` `${hour}:${minute}${dayPeriod[0].toLowerCase()}` ``. The locale is pinned to `en-US` and
`hour12` is explicit so `dayPeriod` is `"AM"`/`"PM"` and its first character is meaningful; a
missing part (no engine does this, but the type is `| undefined`) falls back to `""`. Roughly 15
lines. `formatClock` is shared with `daylight-budget` and `opening-hours`; whichever lands first
writes it, at this path, with this signature. Every displayed number in this feature goes through
this module — imperial throughout, as documented.

### `src/styles/app.css` — modified

New rules only, no new tokens. Amber is still the only accent.

- `.conditions` — `display: block; font-size: 13px; color: var(--ink-2); line-height: 1.45;`
  sitting in `.panel`'s 15px column gap.
- `.conditions.is-quiet` — `color: var(--ink-3); font-size: 12.5px;`
- `.conditions-credit` — `font-family: var(--mono); font-size: 10px; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--ink-3);` with `margin-left: 8px`, and its `a` inheriting
  colour with `text-decoration: underline; text-underline-offset: 2px;`
- `.result-conditions` — `font-family: var(--mono); font-size: 11.5px; color: var(--ink-2);
  font-variant-numeric: tabular-nums;`

Nothing else. No `@media (prefers-color-scheme)`, no new hue, no new keyframe, no change to
`.switch-row`. Nothing here animates.

### `server/test-stubs.ts` — modified

Add `weatherResponse(overrides?: Partial<...>): Response` returning a captured Open-Meteo body,
for `server/weather.test.ts` only. The client-side `baseReport()` fixture lives **in
`src/lib/conditions.test.ts` itself** and nowhere else: `server/test-stubs.ts` imports
`node:test`'s `TestContext`, and having a `src/` test import from `server/` would reverse this
repo's one-way `server/ → src/` dependency direction for the sake of one object literal.

### `README.md` / `LAUNCH.md` — modified

One paragraph each: the new endpoint, its fifteen-minute edge TTL, the Open-Meteo attribution and
the licence position, and the sentence that matters operationally — an unreachable forecast
degrades to a missing line and never blocks a spin, and it logs `at: "weather"`, not
`at: "valhalla"`. Also **correct README line 91**: it claims 64 KB gzipped of app JavaScript and
the shipped bundle is 69.5 KB. See Cost.

### Not touched

`scripts/build-reach.mjs`, `public/reach/*`, `SNAPSHOT_VERSION`, `public/_headers`,
`public/site.webmanifest`, `index.html`. Weather cannot be precomputed and the browser never
reaches a weather host, so there is no preconnect to add and no snapshot to bump.

## Algorithm

### `deriveConditions(report, inputs)` — the pure core

Two passes, and the split is the point: **facts first, prose second**. A rule's `reason` names the
budget the app actually applied, which is only known after every cap has been min-ed, quantised
and clamped. Composing it from the rule's own candidate cap is how a line reading "Trimmed to 35
min" ends up beside a contour drawn at 20, and how a rain onset four minutes out puts a negative
number in a sentence.

```
if report is null:
  return { budgetCapMinutes: null, rules: [], headline: null, staleMinutes: null }

# Re-age the report. The edge may have held it for up to 900 s.
ageMinutes  = (inputs.nowMs - report.observedAtMs) / 60000
staleAfter  = STALE_MULTIPLE * report.refreshSeconds / 60
staleMinutes = ageMinutes > staleAfter ? round(ageMinutes) : null

# The trip window, in minutes from now. Round trip is the app's own framing,
# so every rule is evaluated at the RETURN time, not just at departure.
window = inputs.budgetMinutes            # already total minutes for both legs
slots  = report.hours filtered to (slot.atMinutes - ageMinutes) in [-60, window]
        # -60 keeps the hour already in progress, which is the one you walk out into
hasHourly = slots is non-empty
if not hasHourly: slots = [report.now]   # headline still works; window rules below do not fire

headline = composeHeadline(report.now, slots, window)   # always built; see below

if not inputs.weatherAware:
  return { budgetCapMinutes: null, rules: [], headline, staleMinutes }

# ---- pass 1: facts -------------------------------------------------------
staged = []   # { id, capMinutes | null, preferredTags | null, vetoHilly, detail }

# --- rain (needs hourly) --------------------------------------------------
onset = earliest slot with (precipChance != null and precipChance >= RAIN_CHANCE)
                        or (precipInches != null and precipInches >= RAIN_INCHES)
if hasHourly and onset exists and onsetMinutes < window:
  staged.push({ id: "rain-window", capMinutes: onsetMinutes - CAP_MARGIN_MINUTES,
                preferredTags: null, vetoHilly: false,
                detail: `Rain likely ${formatHorizon(onsetMinutes)}` })

# --- storm (needs hourly) -------------------------------------------------
storm = earliest slot with weatherCode in WMO_THUNDER
if hasHourly and storm exists and stormMinutes < window:
  staged.push({ id: "storm-window", capMinutes: stormMinutes - STORM_MARGIN_MINUTES,
                preferredTags: null, vetoHilly: false,
                detail: `Thunderstorms ${formatHorizon(stormMinutes)}` })

# --- heat -----------------------------------------------------------------
peakFeels = max(slot.feelsLikeF for slot in slots where slot.isDay) ?? max over all slots
if peakFeels >= HEAT_SHELTER_F:
  staged.push({ id: "heat-shelter", capMinutes: null,
                preferredTags: ["river","park","museum","food"], vetoHilly: false,
                detail: `Feels ${round(peakFeels)}°F. Steering toward shade, water and doors` })
if peakFeels >= HEAT_DANGER_F:
  staged.push({ id: "heat-flat", capMinutes: 30, preferredTags: null, vetoHilly: true,
                detail: `Heat index in the danger band. Flat routes only` })

# --- UV -------------------------------------------------------------------
peakUv = max(slot.uvIndex for slot in slots where uvIndex != null)   # null when all null
if peakUv != null and peakUv >= UV_SHELTER and any slot.isDay:
  staged.push({ id: "uv-shelter", capMinutes: null,
                preferredTags: ["park","museum","food"], vetoHilly: false,
                detail: `UV ${round(peakUv)}. Somewhere with a roof or a canopy` })

# --- cold -----------------------------------------------------------------
# Deliberately nothing at 28°F. See the note below.
lowFeels = min(slot.feelsLikeF for slot in slots)
if lowFeels <= COLD_CAP_F:
  staged.push({ id: "cold-cap", capMinutes: 30, preferredTags: ["museum","food"],
                vetoHilly: false, detail: `Feels ${round(lowFeels)}°F. Kept it short` })

# --- dark (from daylight-budget's clock, not from the forecast) ------------
if inputs.civilDuskMs is not null:
  toDusk = (inputs.civilDuskMs - inputs.nowMs) / 60000
  if 0 < toDusk < window:
    staged.push({ id: "dark-return", capMinutes: toDusk - CAP_MARGIN_MINUTES,
                  preferredTags: null, vetoHilly: false,
                  detail: `Dark ${formatHorizon(toDusk)}. Trimmed so you get back in the light` })

# ---- the budget, decided once --------------------------------------------
caps = staged.map(s => s.capMinutes).filter(non-null)
if caps is empty:
  budgetCapMinutes = null
else:
  raw = min(caps)
  gridded = CAP_GRID_MINUTES * floor(raw / CAP_GRID_MINUTES)   # the anti-ratchet quantiser
  clamped = clamp(gridded, inputs.dialMinimumMinutes, inputs.budgetMinutes)
  budgetCapMinutes = clamped < inputs.budgetMinutes ? clamped : null
  # A "cap" equal to the dial is not a cap. Reporting null keeps `capped`
  # false and keeps a no-op rule from claiming a trim.

# ---- pass 2: prose -------------------------------------------------------
rules = staged.map(s => ({
  id: s.id,
  preferredTags: s.preferredTags,
  vetoHilly: s.vetoHilly,
  reason: s.capMinutes != null && budgetCapMinutes != null
    ? `${s.detail}. Trimmed to ${budgetCapMinutes} min`   # the budget actually applied
    : s.detail,
}))
```

Every `reason` therefore names either no number or the one number the map is drawn at. A rule
whose own cap was not the binding minimum still says "Trimmed to 20 min" — which is true, and is
what the user is looking at — rather than advertising a 35 that never happened.

**On cold.** `apparent_temperature` already folds wind chill in, so there is no second formula.
NWS's own frostbite guidance is a wind chill of −19°F for thirty minutes of exposure. 28°F is
Tuesday. Filtering places out of a pool at 28°F would be the app inventing a hazard, and this
codebase does not do that — the sentence in the headline is the whole intervention.

**On tag preference and the vibes filter.** Each preference is an allow-list intersected with the
pool the user's own vibe chips already produced, one rule at a time. If the user has selected
`river` and `heat-shelter` prefers `{river,park,museum,food}`, the intersection is fine; if they
have selected `history` and `uv-shelter` prefers `{park,museum,food}`, the intersection is empty
and the min-survivors guard withdraws *that rule specifically* — which is exactly why preferences
live on the rule and not merged into one flat set. The user's stated intent wins, automatically,
with no special case, and the withdrawal is attributable.

`composeHeadline` builds the always-shown sentence, independent of `weatherAware`:
`` `${formatFahrenheit(now.temperatureF)}, feels ${round(now.feelsLikeF)}°` `` plus, when a rain
onset exists inside the window, `` `. Rain likely ${formatHorizon(onsetMinutes)}` ``, plus, when
`peakUv >= UV_SHELTER`, `` `. ${formatUv(peakUv)}` ``. One or two clauses; never three.

### `applyConditionRules(places, conditions)` — the guard

```
kept = places
applied = []
withdrawn = []

# Vetoes first, then preferences: applied in that order and withdrawn in
# reverse, so the cheaper-to-lose rule is the first one dropped. Each staged
# entry carries a real ConditionRuleId, so every outcome is attributable.
staged = []
for rule of conditions.rules:
  if rule.vetoHilly: staged.push([rule.id, p => p.terrain !== "hilly"])
for rule of conditions.rules:
  if rule.preferredTags: staged.push([rule.id, p => p.tags.some(t => rule.preferredTags.includes(t))])

for [id, predicate] of staged:
  next = kept.filter(predicate)
  if next.length >= MIN_SURVIVORS or next.length === kept.length:
    kept = next; applied.push(id)
  else:
    withdrawn.push(id)

# Withdrawal is not cascading: dropping a preference does not un-drop the
# veto, because they are independent statements about the same walk. A rule
# that is both (none today) would appear in staged twice and could be applied
# once and withdrawn once; the renderer treats any appearance in `withdrawn`
# as withdrawn, which is the conservative reading.
return { kept, applied, withdrawn }
```

`MIN_SURVIVORS = 3`. Three is the smallest pool where a spin still feels like a spin; at two the
reel is a coin flip wearing a costume. The `next.length === kept.length` clause is what lets a
rule that changes nothing be recorded as applied rather than withdrawn, which matters for the
prose: "Flat routes only" should be sayable even when every candidate was already flat.

Budget caps are never withdrawn by this function. They are applied upstream, in `App.tsx`, by
lowering the effective budget, and they are visible on the map. That asymmetry is the design.

### Pure functions to extract for testing

- `deriveConditions` — the whole rule table, `src/lib/conditions.ts`.
- `applyConditionRules` — the guard, same file.
- `composeHeadline` — exported for test; knip will need it reached, which the test file does.
- `normalizeWeather(body: Json): WeatherReport | null` — the proxy's Open-Meteo → app-shape
  translation, exported from `server/proxy.ts` so `server/weather.test.ts` can assert the
  normalisation without a network stub as well as with one. Mark it `@public` if knip complains.

## Failure and degradation

The governing rule: **the forecast is never in the critical path.** Nothing about the Spin button,
the route warm-up grace timer, `routesPending` or `reelIsShort` learns that weather exists.

| What breaks | What happens | What the user sees |
| --- | --- | --- |
| Browser offline | `getJson` exhausts 2 attempts, throws `TransientError`, `weatherUnavailable()` becomes true, `refreshWeather` backs off 120 s | "No forecast right now." in `.conditions.is-quiet`. Pool unfiltered, dial uncapped, spin normal. |
| `/api/weather` 502 / 504 (upstream down or slow) | Same path; the proxy has logged one structured `{at:"weather",event:"upstream-unreachable"}` line — **not** `at:"valhalla"`, so a forecast blip cannot be read as an engine outage | Same quiet line, or the stale line below if a report already landed. |
| Open-Meteo 429 | `getJson` honours `retry-after`, gives up after 2 attempts | Same quiet line. Edge caching makes this a colo-level event, not a per-visitor one. |
| Upstream returns 200 with a shape we do not recognise | `normalizeWeather` returns null → `502 upstream-empty`, detail "The forecast service returned nothing we recognise." | Same quiet line. This is the licence-change / vendor-drift failure and it is safe. |
| One hourly slot has `precipitation_probability: null` | That field is null in the slot; the rain rule skips it rather than reading it as 0% | No visible change, and no rule silently stops firing. |
| Refreshes fail after one success | `cachedWeather()` keeps the last report; `weatherUnavailable()` is true and `staleMinutes` becomes non-null | "Forecast is 47 min old." Caps still apply, and their basis is stated. |
| Forecast is stale (edge served a 14-minute-old payload) | `deriveConditions` re-ages every slot against the tick | Correct answers, up to 15 minutes coarse. A rain onset can only be *later* than stated, never earlier by more than the refresh window. |
| A rule empties the pool (preference/veto) | Withdrawn by the guard, its id in `outcome.withdrawn` | That rule's warn line is not shown; a quiet line names the withdrawal instead. |
| A cap empties the pool | Allowed | The contour visibly shrinks, the warn line names the cap, and the empty notice offers **Ignore the weather** beside **Clear filters** — the button that actually undoes the cause. |
| Rain approaches while the tab is open | The cap ratchets down on the five-minute grid | The contour steps in at most once every five minutes; the warn line's number follows it exactly. |
| `daylight-budget` not yet implemented | `civilDuskMs: null` | No `dark-return` rule. Everything else works. |
| Clock frozen mid-spin, forecast lands mid-spin | `holdWeather(true)` stashes it | The reel finishes against the pool it started with. The new forecast applies on landing. |
| Sound muted / reduced motion | `playThock` is silent | The switch's checked state and the conditions text are the feedback. The cue was never the only signal. |
| `VALHALLA_URL` unset (engine misconfigured) | Weather is unaffected — different upstream, no 503 path | The setup notice appears as it does today; the conditions line appears beside it. |

## Cost

**Bundle — and the budget is already blown, which changes what this section is for.** The checked-in
build is `dist/assets/index-D8wJZRp3.js`, 225,030 bytes raw, **71,188 bytes gzipped (69.5 KiB)**,
against a stated ceiling of 64 KB. README line 91 describes a build that no longer exists. So:

- This spec does **not** claim to fit inside headroom that is not there. It claims a delta.
- The estimates below are **unmeasured** and are the numbers carrying the argument, so they are
  written as a budget to be checked, not a fact: `src/lib/conditions.ts` ~3.2 KB raw,
  `src/lib/weather.ts` ~2.6 KB raw, `src/ui/ConditionsLine.tsx` ~1.8 KB raw, `format.ts` additions
  ~0.9 KB raw (`formatClock`'s `formatToParts` handling is not free even though `Intl` itself is),
  `App.tsx` / `Filters.tsx` / `ResultCard.tsx` / `session.ts` deltas ~1.7 KB raw, CSS ~0.35 KB raw.
  Call it **≤ 4.0 KB gzipped**, and add ~0.6 KB gzipped more if this spec has to write
  `src/app/clock.ts` because `daylight-budget` has not landed.
- **The check is mechanical and is acceptance criterion 19**: record
  `gzip -c dist/assets/index-*.js | wc -c` before the branch and after, and fail the review if the
  delta exceeds 4,096 bytes (4,700 with `clock.ts`). Do not restate "under 64 KB"; that criterion
  is unmeetable today and an unmeetable criterion is one an implementer learns to ignore, which is
  the exact failure the budget exists to prevent.
- Getting back under 64 KB is real work that belongs to its own change, not smuggled in here.

No new dependency, no new icon glyph. `src/lib/sun.ts` is charged entirely to `daylight-budget`.

**Requests per session.** One `GET /api/weather` on load, then one per fifteen minutes the tab
stays open and visible. A one-hour session is 4–5 requests, each a few kilobytes. Against the
existing traffic — one 1.7 MB snapshot plus dozens of route POSTs — this is a rounding error.

**Engine load.** Zero. Different upstream.

**Upstream load, stated properly.** Open-Meteo's free tier is 600/min, 5,000/hr, **10,000/day**
(confirmed at <https://open-meteo.com/en/pricing>). The tier is an **account/IP-level limit, not a
per-colo one** — the pricing page does not spell the scope out, so treat "per account" as the
conservative assumption. The Cache API is per-colo *and* its entries are evictable, so the real
daily volume is `96 × (colos that serve this app) + evictions`. At 96/day/colo, 10,000/day is
exhausted at roughly **100 colos**, and Cloudflare has more than that — so the headroom is real but
it is *one order* of magnitude for a city-scale app served from a handful of colos, not two, and it
is not unconditional. If the Cache API assumption in "Unverified, check first" fails entirely, the
floor becomes one call per visitor per 15 minutes and the tier caps the app at ~2,500
tab-hours/day. Both numbers are fine for this app today. Neither is fine unexamined, and a growth
event should be met by adding a `Cache-Control: max-age` on the browser side before it is met by
a paid plan.

**Build time.** Zero. Nothing precomputes.

**Hosting.** No new binding, no KV, no R2, no service worker. One `[vars]` entry.

**Render cost.** The minute tick re-renders `App` once a minute, which re-runs `selectCandidates`
over 62 places (memoised, so a tick with unchanged inputs is free) and, when a rule flips,
re-uploads the places FeatureCollection once. At 62 features that is invisible; it is one more
reason the pool-growth concerns in `places-expansion` matter.

## Tests

### `server/weather.test.ts` (new)

Fixture: `WEATHER_BODY`, a captured Open-Meteo response with `utc_offset_seconds: -14400`,
`current.time: "2026-08-21T03:15"`, `current.interval: 900`, 12 hourly slots from
`"2026-08-21T03:00"`, and `is_day` as `0`/`1` integers.

1. **`GET /api/weather` calls the pinned coordinates and nothing else.** Assert
   `calls[0].url` contains `latitude=37.5407` and `longitude=-77.436`, `calls.length === 1`,
   method GET.
2. **A query string is refused without an upstream call.** `GET /api/weather?latitude=48.85` →
   400, `calls.length === 0`.
3. **`POST /api/weather` is 405 without an upstream call.**
4. **`observedAt` is a true UTC instant.** With the fixture above, expect
   `"2026-08-21T07:15:00.000Z"`. This is the DST-sensitive assertion.
5. **`atMinutes` is relative to `observedAt`.** First hourly slot (`03:00` local) → `-15`.
6. **Units survive.** `now.temperatureF` matches the fixture's `current.temperature_2m` exactly;
   no conversion is applied anywhere.
7. **A null tolerated field keeps its slot.** Null one `hourly.uv_index` entry; expect 200,
   `hours.length === 12`, and that slot's `uvIndex === null`.
8. **A null required field drops its slot.** Null one `hourly.apparent_temperature`; expect 200
   and `hours.length === 11`.
9. **`is_day: 0` becomes `false` and `1` becomes `true`.** The integer-to-boolean coercion.
10. **A missing `current` block is `502 upstream-empty`.** With `stubConsoleError(t)`.
11. **Upstream refusal is 502 `upstream-unreachable`; a `TimeoutError` is 504 `upstream-timeout`.**
    Use `timeoutError` from `test-stubs.ts`. With `stubConsoleError(t)`.
12. **Weather failures log `at: "weather"`, and never `at: "valhalla"`,** and the body detail
    names the forecast service, not the routing engine. Assert on the captured console lines. This
    is the operator-facing half of the whole failure design.
13. **The upstream host never appears in a response body**, for any of the failure cases above.
14. **`weatherCacheKey(null, getRequest)` is constant and carries the version and hour count;
    `weatherCacheKey(null, requestWithSearch)` is null; `weatherCacheKey(null, postRequest)` is
    null.**

### `server/worker.test.ts` (extended)

15. **A `/api/weather` miss fills the edge and a second request is a hit** — `stubEdgeCache(t)`,
    assert `calls.length === 1` across two requests. This is the unverified Cache-API-from-GET
    behaviour; if it does not hold, this test is where it is discovered.
16. **`GET /api/weather?latitude=48.85` is a 400 even with a warm edge entry for
    `/api/weather`.** Prime the cache with test 15, then ask with a query string. This is the
    "not a worldwide weather service" guarantee at the layer that actually decides it — the 400 in
    `proxy.ts` is unreachable in the Worker unless `weatherCacheKey` refuses the key first.
17. **`/api/weather` costs the limiter exactly 1.**
18. **A 502 weather response is not stored** and logs one `{at:"api"}` line from the Worker.

### `src/lib/conditions.test.ts` (new)

Fixtures defined in this file: a `baseReport()` helper producing a benign 72°F report, plus
builders that override slots. All at a fixed `nowMs = Date.parse("2026-08-21T18:00:00Z")`,
`dialMinimumMinutes: 10`.

19. **No report → no rules, no cap, null headline, null `staleMinutes`.**
20. **`weatherAware: false` → headline present, `budgetCapMinutes` null, `rules` empty.** The
    switch gates rules, never text.
21. **Rain 40 min out, 50-minute round trip → `budgetCapMinutes === 35`** (40 − `CAP_MARGIN_MINUTES`,
    already on the 5-grid) and one `rain-window` rule.
22. **Rain 40 min out, 30-minute round trip → no cap.** The onset is outside the window; the
    headline still names it.
23. **Rain onset re-ages with a stale report.** Same fixture with `observedAtMs` 12 minutes older →
    raw cap 23, gridded to **20**, and the rule's `reason` says "Trimmed to 20 min".
24. **96°F apparent, full sun → the `heat-shelter` rule's `preferredTags` is exactly
    `["river","park","museum","food"]`, no rule sets `vetoHilly`, no cap.**
25. **105°F apparent → a `heat-flat` rule with `vetoHilly: true` and `budgetCapMinutes === 30`.**
26. **UV 9 → `uv-shelter` fires with `["park","museum","food"]` on its own rule**, not merged into
    the heat rule's.
27. **All `uvIndex` null → `uv-shelter` never fires** and the headline omits the UV clause. Null is
    unknown, not zero, and not 11.
28. **28°F apparent → zero rules.** The explicit no-op. Headline says "feels 28°".
29. **5°F apparent → `cold-cap`, cap 30, prefers museum/food.**
30. **Two caps take the minimum, and every reason names it.** Rain at 40 and dusk at 25 → cap 20,
    and **both** rules' `reason` strings contain "Trimmed to 20 min" and neither contains "35".
    This is the criterion-13 honesty test.
31. **A cap below the dial minimum clamps and never goes negative.** Rain 3 min out → cap is
    `dialMinimumMinutes`, and no `reason` contains a `-`.
32. **A cap equal to the dial position reports `null`.** A no-op cap must not make `capped` true.
33. **The cap does not move every minute.** Same report, `nowMs` advanced 1, 2, 3, 4 minutes →
    `budgetCapMinutes` identical each time; advanced 5 minutes → it has stepped down exactly once.
34. **`civilDuskMs: null` → no `dark-return` rule and everything else unchanged.**
35. **`staleMinutes` is null at 10 minutes old and non-null at 50** (`STALE_MULTIPLE` × 15).
36. **`applyConditionRules` withdraws a preference when it leaves fewer than `MIN_SURVIVORS`.**
    Six places, preference matching two → `kept.length === 6`, `withdrawn` contains that rule's id
    and `applied` does not.
37. **`applyConditionRules` applies a rule that changes nothing.** Preference matching all six →
    `applied` contains it, `withdrawn` empty.
38. **`applyConditionRules` withdraws the preference but keeps the veto.** Non-cascading, and the
    two ids are distinguishable in the outcome — the attribution `pool-reasoning` depends on.
39. **Rules are stable across two calls with identical inputs** — `kept.map(p => p.id).join(",")`
    is equal, which is the `candidateKey`-churn guarantee that keeps spinning possible.

### `src/lib/format.test.ts` (extended, or new)

40. **`formatClock` renders Richmond time from a UTC instant in both DST states.**
    `2026-08-21T23:54:00Z` → `"7:54p"`; `2026-12-21T21:55:00Z` → `"4:55p"`. Also midnight
    (`04:00Z` in summer) → `"12:00a"`, which is where a naive `hour: "numeric"` reading goes wrong.
41. **`formatHorizon`**: `0 → "now"`, `40 → "in 40 min"`, `130 → "in 2 hr 10 min"`.

## Acceptance criteria

Each of these is checkable by running something or looking at something.

1. `GET /api/weather` returns the normalised shape above in dev (Vite plugin) and in the Worker,
   with no change to `server/vite-plugin.ts`.
2. `GET /api/weather?latitude=48.85` is a 400 and makes no upstream call **in the Worker with a
   warm edge entry present** (test 16), not only in `proxy.test.ts`.
3. Anything other than `GET` on `/api/weather` is a 405, and `weatherCacheKey` returns null for it.
4. The endpoint is edge-cached for 900 s under one constant key and costs the rate limiter 1.
5. `observedAt` is a correct UTC instant on both sides of a DST boundary, proven by test 4.
6. A weather outage logs `at: "weather"` and answers with a body that names the forecast service.
   Grepping `wrangler tail` output for `valhalla` during a weather-only outage returns nothing.
7. A slot with `precipitation_probability: null` is kept, with `precipChance === null`, and no rule
   reads it as 0.
8. The panel shows a conditions line under the readout whenever a forecast exists, with the
   Open-Meteo attribution link beside it; "No forecast right now." only when there is no report at
   all; "Forecast is N min old." once the report passes three refresh windows.
9. The conditions line appears whether or not **Mind the weather** is on.
10. The result card shows a `.result-conditions` line and `.result-stats` is still three columns.
11. `describeResult` includes the conditions clause when a pick has landed, and **no new live
    region is added** — the page still has exactly the `role="alert"` / `role="status"` elements it
    has today.
12. **Mind the weather** is a third `<Switch>` in Filters, defaults on, plays `playThock` with the
    next boolean, and is **not** changed by **Clear filters**. `activeFilters` is unchanged.
13. Every visible rule line names the budget the map is actually drawn at: with rain at 40 min and
    dusk at 25 min on a 50-minute round trip, the contour is at 20 and every warn line says 20.
    No line shows a negative number for any onset.
14. With rain 40 minutes out and a 50-minute round trip, the map contour visibly shrinks, the
    readout's minutes and area follow it, and a `.notice.is-warn` names the cap. The dial thumb
    does not move and the camera does not re-frame.
15. Leaving the tab open through a five-minute window shows the contour step in **once**, not five
    times, and no route warm-up is restarted more than once in that window.
16. With an apparent temperature ≥ 103°F, no `hilly` place is in the pool and the reason is on
    screen.
17. No rule ever produces a pool smaller than `MIN_SURVIVORS` unless a *cap* did it; when a
    preference or veto is withdrawn, its warn line is absent **and** the withdrawal line is
    present, naming the kept count. Both halves are driven by the same `RuleOutcome` the App holds.
18. When a cap empties the pool, the empty notice offers **Ignore the weather**, and pressing it
    restores the full uncapped pool immediately with no refetch.
19. `gzip -c dist/assets/index-*.js | wc -c` grows by no more than 4,096 bytes (4,700 if this
    branch also writes `src/app/clock.ts`) against the pre-branch build. The absolute figure is
    recorded in the PR. The 64 KB headline is *not* claimed, because the pre-branch build is
    already 71,188 bytes and README line 91 is corrected to say so.
20. Killing the network makes the conditions line read "No forecast right now." and changes
    nothing else: the Spin button's enabled state, the grace timer and the reel are identical.
21. Starting a spin and letting a forecast refresh land mid-throw does not abort the spin.
22. `npm run typecheck`, `npm run lint` (eslint + oxlint anti-slop + knip) and `npm test` are all
    clean, with every `as` carrying a `SAFETY:` comment and every parsed field narrowed through
    `src/lib/json.ts` — including `is_day`, which is narrowed with `isFiniteNumber` and coerced,
    never asserted.
23. `WEATHER_URL` appears in `wrangler.toml`, `.env.example`, `ProxyEnv` and the `loadEnv`
    destructure in `vite.config.ts`, and is resolved with `||` so an unset key falls back to the
    default rather than to `""`.

## Contracts asked of sibling specs

- **`daylight-budget`** owns `src/app/clock.ts` (`useNow(frozen: boolean): number`, `MINUTE_MS`)
  and `src/lib/sun.ts` (`sunEvents(atMs)` returning `sunriseMs`, `sunsetMs`, `civilDawnMs`,
  `civilDuskMs`). If it lands second, `weather-filters` writes `clock.ts` at that path and
  signature — and charges itself the extra ~0.6 KB gzipped and half a day for it — but never
  writes `sun.ts`; it ships with `civilDuskMs: null` instead. `daylight-budget` also owns the
  `dark-return` rule's *threshold*; this spec owns the `ConditionRuleId` union that names it, so
  that all three conditions features produce one list of reasons rather than three competing
  notices.
- **`opening-hours`** consumes the same `useNow` and the same `formatClock`. It must not start its
  own timer and must not call `Date.now()` in a render.
- **`formatClock`** — whichever of `weather-filters`, `daylight-budget` and `opening-hours` lands
  first writes it in `src/lib/format.ts` with the signature and the `formatToParts` handling
  specified above. The others import it unchanged.
- **`pool-reasoning`** owns how withdrawals and exclusions are *shown*. This spec exposes
  `applyConditionRules` returning `{ kept, applied, withdrawn }` — with per-rule `preferredTags`
  and `vetoHilly`, so every excluded place is attributable to a single named `ConditionRuleId` —
  precisely so `pool-reasoning` can wrap `selectCandidates` in its own `selectPool()`. Note that
  `selectCandidates` now *returns* a `RuleOutcome` rather than a `Place[]`; `pool-reasoning` should
  build on that shape. When it ships, the withdrawal line in `ConditionsLine` is deleted in favour
  of its surface; until then, the line is the promise being kept.
- **Whoever gets the bundle back under 64 KB** owns README line 91. This spec only promises not to
  make it worse than +4 KB.

## Open questions

1. **Does the app carry advertising or a subscription at any point?** If yes, Open-Meteo requires
   a paid plan and the fallback to `api.weather.gov` must be implemented before launch, not after —
   and it is a module with a required `User-Agent`, two round trips and no UV index, not an
   afternoon. This is a product decision, not an engineering one.
2. **`MIN_SURVIVORS = 3` and `CAP_GRID_MINUTES = 5` are judgement calls** with no data behind
   them. Both should be felt once with real filters on a real dial before they are treated as
   settled.
3. **Does the edge cache actually store a synthetic-GET-keyed entry derived from a real GET?**
   Test 15 answers it. The fallback if not is documented above; the cost model changes but does not
   break.
