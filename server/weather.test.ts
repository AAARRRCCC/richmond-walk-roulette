/**
 * `GET /api/weather`, its normaliser and its cache key.
 *
 * Two of these are the whole point of the endpoint existing at all. Test 2 is
 * the "not a worldwide weather service" refusal — the same guarantee
 * `/api/isochrone`'s bounds check makes, in the one shape a parameterless GET
 * can make it. Test 12 is the operator-facing half: an Open-Meteo blip must not
 * read, in a visitor's notice *or* in `wrangler tail`, as a routing outage.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { handleApiRequest, normalizeWeather, weatherCacheKey } from "./proxy.ts";
import { stubConsoleError, stubFetch, timeoutError } from "./test-stubs.ts";
import {
  isJsonArray,
  isJsonObject,
  isString,
  parseJson,
  readJson,

  type JsonObject,
} from "../src/lib/json.ts";

const ENV = { VALHALLA_URL: "http://engine.local:8002" };

const HOURS = [
  "2026-08-21T03:00",
  "2026-08-21T04:00",
  "2026-08-21T05:00",
  "2026-08-21T06:00",
  "2026-08-21T07:00",
  "2026-08-21T08:00",
  "2026-08-21T09:00",
  "2026-08-21T10:00",
  "2026-08-21T11:00",
  "2026-08-21T12:00",
  "2026-08-21T13:00",
  "2026-08-21T14:00",
];

/** The two hourly columns Open-Meteo nulls in practice, past a model's horizon. */
type Column = "uv_index" | "apparent_temperature";

type Fixture = {
  /** Null one cell of one column, which is how a horizon arrives on the wire. */
  readonly nulled?: { readonly column: Column; readonly index: number };
};

/**
 * A captured Open-Meteo body, in the units the proxy asks for.
 *
 * `utc_offset_seconds: -14400` with a local `current.time` of 03:15 is the
 * DST-sensitive case: the correct instant is 07:15Z, and every naive reading of
 * the string gets a different one.
 *
 * Parameterised rather than mutated after the fact, so every variant is still a
 * literal whose shape `tsc` can see.
 */
function weatherBody(fixture: Fixture = {}) {
  const column = (name: Column, values: number[]): (number | null)[] =>
    fixture.nulled?.column === name
      ? values.map((value, index) => (index === fixture.nulled?.index ? null : value))
      : values;

  return {
    latitude: 37.55376,
    longitude: -77.44317,
    utc_offset_seconds: -14400,
    timezone: "America/New_York",
    current: {
      time: "2026-08-21T03:15",
      interval: 900,
      temperature_2m: 72.4,
      apparent_temperature: 74.1,
      precipitation: 0,
      precipitation_probability: 8,
      weather_code: 3,
      wind_speed_10m: 6.2,
      uv_index: 0,
      is_day: 0,
    },
    hourly: {
      time: HOURS,
      temperature_2m: HOURS.map(() => 72.1),
      apparent_temperature: column("apparent_temperature", HOURS.map(() => 73.8)),
      precipitation_probability: HOURS.map(() => 8),
      precipitation: HOURS.map(() => 0),
      weather_code: HOURS.map(() => 3),
      wind_speed_10m: HOURS.map(() => 6),
      uv_index: column("uv_index", HOURS.map(() => 0)),
      is_day: HOURS.map((_, index) => (index > 3 ? 1 : 0)),
    },
  } satisfies JsonObject;
}

/**
 * The same body with no `current` block at all: the vendor-drift failure, and
 * the one variant that is a different shape rather than a different value.
 */
function bodyWithoutCurrent() {
  const { current: _dropped, ...rest } = weatherBody();
  void _dropped;
  return rest satisfies JsonObject;
}

const get = (path = "/api/weather"): Request =>
  new Request(`http://app.local${path}`, { method: "GET" });

async function ask(
  t: Parameters<typeof stubFetch>[0],
  body: JsonObject,
): Promise<{ response: Response; calls: ReturnType<typeof stubFetch> }> {
  const calls = stubFetch(t, () => Response.json(body));
  const response = await handleApiRequest(get(), ENV);
  assert.ok(response, "the proxy owns /api/weather");
  return { response, calls };
}

/** The 200 body, as the JSON object every assertion below reads. */
async function report(response: Response): Promise<JsonObject> {
  const parsed = await readJson(response);
  assert.ok(isJsonObject(parsed), "the body is a JSON object");
  return parsed;
}

test("weather calls the pinned coordinates and nothing else", async (t) => {
  const { response, calls } = await ask(t, weatherBody());

  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.method, "GET");
  assert.match(calls[0]?.url ?? "", /latitude=37\.5407/);
  assert.match(calls[0]?.url ?? "", /longitude=-77\.436/);
});

test("a query string is refused without an upstream call", async (t) => {
  const calls = stubFetch(t, () => Response.json(weatherBody()));
  const response = await handleApiRequest(get("/api/weather?latitude=48.85"), ENV);

  assert.equal(response?.status, 400);
  assert.equal(calls.length, 0, "a worldwide weather service is refused before it is one");
});

test("POST /api/weather is 405 without an upstream call", async (t) => {
  const calls = stubFetch(t, () => Response.json(weatherBody()));
  const response = await handleApiRequest(
    new Request("http://app.local/api/weather", { method: "POST", body: "{}" }),
    ENV,
  );

  assert.equal(response?.status, 405);
  assert.equal(calls.length, 0);
});

test("observedAt is a true UTC instant across the offset", async (t) => {
  const { response } = await ask(t, weatherBody());
  assert.equal((await report(response)).observedAt, "2026-08-21T07:15:00.000Z");
});

test("atMinutes is relative to observedAt", async (t) => {
  const { response } = await ask(t, weatherBody());
  const hours = (await report(response)).hours;
  assert.ok(isJsonArray(hours));
  // 03:00 local is 07:00Z, fifteen minutes before the 07:15Z reading.
  assert.equal(isJsonObject(hours[0]) ? hours[0].atMinutes : null, -15);
  assert.equal(isJsonObject(hours[1]) ? hours[1].atMinutes : null, 45);
});

test("units survive: no conversion is applied anywhere", async (t) => {
  const { response } = await ask(t, weatherBody());
  const now = (await report(response)).now;
  assert.ok(isJsonObject(now));
  assert.equal(now.temperatureF, 72.4);
  assert.equal(now.feelsLikeF, 74.1);
  assert.equal(now.windMph, 6.2);
});

test("a null tolerated field keeps its slot", async (t) => {
  const { response } = await ask(t, weatherBody({ nulled: { column: "uv_index", index: 5 } }));
  const hours = (await report(response)).hours;

  assert.ok(isJsonArray(hours));
  assert.equal(hours.length, 12, "a null past the model's horizon is not a missing hour");
  const slot = hours[5];
  assert.equal(isJsonObject(slot) ? slot.uvIndex : "missing", null);
});

test("a null required field drops its slot", async (t) => {
  const { response } = await ask(t, weatherBody({ nulled: { column: "apparent_temperature", index: 5 } }));
  const hours = (await report(response)).hours;

  assert.ok(isJsonArray(hours));
  assert.equal(hours.length, 11);
});

test("is_day crosses the wire as a boolean, not a 0 or a 1", async (t) => {
  const { response } = await ask(t, weatherBody());
  const body = await report(response);
  const hours = body.hours;
  assert.ok(isJsonArray(hours));

  assert.equal(isJsonObject(body.now) ? body.now.isDay : "missing", false);
  assert.equal(isJsonObject(hours[0]) ? hours[0].isDay : "missing", false);
  assert.equal(isJsonObject(hours[5]) ? hours[5].isDay : "missing", true);
});

test("a missing current block is 502 upstream-empty", async (t) => {
  const lines = stubConsoleError(t);
  const { response } = await ask(t, bodyWithoutCurrent());

  assert.equal(response.status, 502);
  assert.equal((await report(response)).error, "upstream-empty");
  assert.ok(lines.length > 0);
});

test("a refusal is 502 and a timeout is 504", async (t) => {
  stubConsoleError(t);

  const refused = stubFetch(t, () => new Error("ECONNREFUSED"));
  const down = await handleApiRequest(get(), ENV);
  assert.equal(down?.status, 502);
  assert.equal(refused.length, 1);

  const slow = stubFetch(t, () => timeoutError());
  const late = await handleApiRequest(get(), ENV);
  assert.equal(late?.status, 504);
  assert.equal(slow.length, 1);
});

test("weather failures log at:weather and never at:valhalla", async (t) => {
  const lines = stubConsoleError(t);
  stubFetch(t, () => new Error("ECONNREFUSED"));
  const response = await handleApiRequest(get(), ENV);

  assert.ok(lines.length > 0);
  for (const line of lines) {
    const parsed = parseJson(line);
    assert.ok(isJsonObject(parsed));
    assert.equal(parsed.at, "weather");
  }
  assert.equal(lines.join("").includes("valhalla"), false);

  // And the visitor's half of the same guarantee: the body names the forecast
  // service, not the routing engine.
  const detail = (await report(response ?? new Response("{}"))).detail;
  assert.ok(isString(detail));
  assert.match(detail, /forecast service/);
  assert.equal(detail.includes("routing engine"), false);
});

test("the upstream host never appears in a response body", async (t) => {
  stubConsoleError(t);
  const env = { ...ENV, WEATHER_URL: "https://secret-forecast.internal/v1/forecast" };

  for (const outcome of [
    () => new Error("ECONNREFUSED"),
    () => timeoutError(),
    () => new Response("nope", { status: 500 }),
    () => Response.json({ nothing: true }),
  ]) {
    stubFetch(t, outcome);
    const response = await handleApiRequest(get(), env);
    const text = await (response ?? new Response("")).text();
    assert.equal(text.includes("secret-forecast.internal"), false, text);
  }
});

test("weatherCacheKey is constant for the request that may be cached, and null otherwise", () => {
  const key = weatherCacheKey(null, get());
  assert.equal(key, weatherCacheKey(null, get()), "one origin, one entry");
  assert.match(String(key), /^\/api\/weather\/v1-12\/richmond$/);

  assert.equal(weatherCacheKey(null, get("/api/weather?latitude=48.85")), null);
  assert.equal(
    weatherCacheKey(null, new Request("http://app.local/api/weather", { method: "POST" })),
    null,
  );
});

test("normalizeWeather rejects a shape it does not recognise", () => {
  assert.equal(normalizeWeather(null), null);
  assert.equal(normalizeWeather({ current: {} }), null);
  // The vendor-drift case: a 200 whose `current` carries no temperature.
  assert.equal(normalizeWeather({ current: { time: "2026-08-21T03:15" } }), null);
});
