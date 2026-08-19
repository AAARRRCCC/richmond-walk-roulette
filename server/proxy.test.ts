/**
 * Protocol tests for the Valhalla proxy, run with a stubbed `fetch` so no
 * engine is needed: `npm test` (node --test, Node >= 23).
 *
 * These defend the contract the client and the engine each rely on: the
 * fan-out respects the instance's contour limit, the costing is pinned
 * server-side, bad requests never reach the engine, and failures map onto
 * the status classes the client's retry logic keys on.
 */
import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { handleApiRequest, WALKING_SPEED_KMH } from "./proxy.ts";
import { parseJson, readJson, type Json } from "../src/lib/json.ts";

const MONROE = { latitude: 37.5464, longitude: -77.4517 };
const LADDER = Array.from({ length: 56 }, (_, i) => i + 5);

function post(path: string, body: Json): Request {
  return new Request(`http://app.local${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** The request body this proxy sends upstream; the stub parses it back. */
type UpstreamBody = {
  contours?: { time: number }[];
  costing?: string;
  costing_options?: Json;
  locations?: Json[];
  units?: string;
};

type Upstream = { url: string; body: UpstreamBody };

/** The proxy's own reply vocabulary: {error, detail} plus GeoJSON features. */
type ProxyReply = {
  error?: string;
  detail?: string;
  features?: { properties: { contour: number } }[];
};

async function reply(response: Response | null): Promise<ProxyReply> {
  assert.ok(response);
  // SAFETY: the proxy under test emits only its own JSON vocabulary — {error,
  // detail} failure bodies and GeoJSON FeatureCollections — and these tests
  // read just the fields that vocabulary guarantees.
  return (await readJson(response)) as ProxyReply;
}

/** Replaces fetch for one test; returns the log of upstream calls. */
function stubFetch(t: TestContext, respond: (call: Upstream) => Response | Error): Upstream[] {
  const calls: Upstream[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    // Round-tripping through Request normalises every BodyInit the proxy
    // could send into the JSON text it actually sends.
    const sent = await new Request("http://stub.local", init).text();
    // SAFETY: that body was just serialized by the proxy from the request
    // fields UpstreamBody names and these tests assert on.
    const call: Upstream = {
      url: input instanceof Request ? input.url : String(input),
      body: parseJson(sent) as UpstreamBody,
    };
    calls.push(call);
    const out = respond(call);
    if (out instanceof Error) throw out;
    return out;
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  return calls;
}

function contourResponse(body: UpstreamBody): Response {
  return Response.json({
    type: "FeatureCollection",
    features: (body.contours ?? []).map(({ time }) => ({
      type: "Feature",
      properties: { contour: time, metric: "time" },
      geometry: { type: "Polygon", coordinates: [[]] },
    })),
  });
}

const ENV = { VALHALLA_URL: "http://engine.local:8002" };

test("full ladder is one upstream query when the limit allows", async (t) => {
  const calls = stubFetch(t, (call) => contourResponse(call.body));

  const response = await handleApiRequest(
    post("/api/isochrone", { location: MONROE, minutes: LADDER }),
    { ...ENV, VALHALLA_MAX_CONTOURS: "60" },
  );

  assert.equal(response?.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, "http://engine.local:8002/isochrone");

  const sent = calls[0]!.body;
  assert.equal(sent.costing, "pedestrian");
  assert.deepEqual(sent.costing_options, { pedestrian: { walking_speed: WALKING_SPEED_KMH } });
  assert.deepEqual(
    (sent.contours ?? []).map((c) => c.time),
    LADDER,
  );

  const payload = await reply(response);
  assert.equal((payload.features ?? []).length, LADDER.length);
});

test("stock contour limit splits the ladder and merges the features", async (t) => {
  const calls = stubFetch(t, (call) => contourResponse(call.body));

  const response = await handleApiRequest(
    post("/api/isochrone", { location: MONROE, minutes: LADDER }),
    ENV, // no VALHALLA_MAX_CONTOURS: assume Valhalla's default of 4
  );

  assert.equal(response?.status, 200);
  assert.equal(calls.length, Math.ceil(LADDER.length / 4));
  for (const call of calls) {
    assert.ok((call.body.contours ?? []).length <= 4);
  }

  const payload = await reply(response);
  assert.deepEqual(
    (payload.features ?? []).map((f) => f.properties.contour),
    LADDER,
  );
});

test("duplicate and unordered minutes are normalised before the engine sees them", async (t) => {
  const calls = stubFetch(t, (call) => contourResponse(call.body));

  const response = await handleApiRequest(
    post("/api/isochrone", { location: MONROE, minutes: [25, 5, 25, 15] }),
    { ...ENV, VALHALLA_MAX_CONTOURS: "60" },
  );

  assert.equal(response?.status, 200);
  assert.deepEqual(
    (calls[0]!.body.contours ?? []).map((c) => c.time),
    [5, 15, 25],
  );
});

test("an origin outside the Richmond box never reaches the engine", async (t) => {
  const calls = stubFetch(t, () => Response.json({}));

  const response = await handleApiRequest(
    post("/api/isochrone", { location: { latitude: 48.8566, longitude: 2.3522 }, minutes: [25] }),
    { ...ENV, VALHALLA_MAX_CONTOURS: "60" },
  );

  assert.equal(response?.status, 400);
  assert.equal(calls.length, 0);
});

test("malformed minutes are rejected without an upstream call", async (t) => {
  const calls = stubFetch(t, () => Response.json({}));

  for (const minutes of [[], [2.5], [0], [91], "25", null]) {
    const response = await handleApiRequest(post("/api/isochrone", { location: MONROE, minutes }), ENV);
    assert.equal(response?.status, 400);
  }
  assert.equal(calls.length, 0);
});

test("no VALHALLA_URL means 503 not-configured, before any fetch", async (t) => {
  const calls = stubFetch(t, () => Response.json({}));

  const response = await handleApiRequest(post("/api/isochrone", { location: MONROE, minutes: [25] }), {});

  assert.equal(response?.status, 503);
  const payload = await reply(response);
  assert.equal(payload.error, "not-configured");
  assert.equal(calls.length, 0);
});

test("an unreachable engine reads as not-configured, naming the URL", async (t) => {
  stubFetch(t, () => new Error("ECONNREFUSED"));

  const response = await handleApiRequest(post("/api/isochrone", { location: MONROE, minutes: [25] }), ENV);

  assert.equal(response?.status, 503);
  const payload = await reply(response);
  assert.ok(payload.detail?.includes("http://engine.local:8002"));
});

test("route forwards the trip and pins the pedestrian costing", async (t) => {
  const trip = { trip: { legs: [{ "shape": "abc" }], summary: { length: 1.2, time: 900 } } };
  const calls = stubFetch(t, () => Response.json(trip));

  const response = await handleApiRequest(
    post("/api/route", { origin: MONROE, destination: { latitude: 37.5407, longitude: -77.4361 } }),
    ENV,
  );

  assert.equal(response?.status, 200);
  assert.ok(response);
  assert.deepEqual(await readJson(response), trip);

  const sent = calls[0]!.body;
  assert.equal(calls[0]!.url, "http://engine.local:8002/route");
  assert.equal(sent.costing, "pedestrian");
  assert.equal(sent.units, "kilometers");
  assert.deepEqual(sent.costing_options, { pedestrian: { walking_speed: WALKING_SPEED_KMH } });
  assert.equal((sent.locations ?? []).length, 2);
});

test("engine 4xx stays final (400); 429 and 5xx read transient", async (t) => {
  let status = 400;
  stubFetch(t, () =>
    Response.json(
      { error: "No path could be found", error_code: 442 },
      { status, headers: status === 429 ? { "retry-after": "7" } : {} },
    ),
  );

  const noPath = await handleApiRequest(
    post("/api/route", { origin: MONROE, destination: MONROE }),
    ENV,
  );
  assert.equal(noPath?.status, 400);
  const payload = await reply(noPath);
  assert.equal(payload.detail, "No path could be found");

  status = 429;
  const limited = await handleApiRequest(
    post("/api/route", { origin: MONROE, destination: MONROE }),
    ENV,
  );
  assert.equal(limited?.status, 429);
  assert.equal(limited?.headers.get("retry-after"), "7");

  status = 500;
  const flaky = await handleApiRequest(
    post("/api/route", { origin: MONROE, destination: MONROE }),
    ENV,
  );
  assert.equal(flaky?.status, 502);
});

test("non-API paths fall through, non-POST is rejected", async (t) => {
  stubFetch(t, () => Response.json({}));

  assert.equal(await handleApiRequest(new Request("http://app.local/index.html"), ENV), null);
  const got = await handleApiRequest(new Request("http://app.local/api/isochrone"), ENV);
  assert.equal(got?.status, 405);
});
