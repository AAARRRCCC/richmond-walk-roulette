/**
 * Tests for the Cloudflare Worker's request path, with a fake rate-limit
 * binding, a fake asset binding and a fake edge cache.
 *
 * The rate-limit branch used to be verified by a manual checkbox in
 * LAUNCH.md — hit the endpoint 240 times and expect a 429 — which meant the
 * hardcoded `retry-after` that must stay in sync with `wrangler.toml` was
 * never checked at all.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  handleWorkerRequest,
  ISOCHRONE_CACHE,
  type Env,
  type WorkerContext,
} from "../worker/index.ts";
import {
  cacheEntries,
  contourResponse,
  stubConsoleError,
  stubEdgeCache,
  stubFetch,
} from "./test-stubs.ts";
import { readJson, type Json } from "../src/lib/json.ts";

const MONROE = { latitude: 37.5464, longitude: -77.4517 };
const FULL_LADDER = Array.from({ length: 96 }, (_, i) => i + 5);

const CTX: WorkerContext = {
  waitUntil(promise) {
    // The real one keeps the Worker alive past the response; here the write
    // just has to have happened before the assertions run.
    void promise;
  },
};

function post(path: string, body: Json): Request {
  return new Request(`http://app.local${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.7" },
    body: JSON.stringify(body),
  });
}

/** Counts what the limiter was charged, and can refuse from any call onward. */
function limiter(refuseFrom = Number.POSITIVE_INFINITY) {
  let calls = 0;
  return {
    binding: {
      limit: () => {
        calls += 1;
        return Promise.resolve({ success: calls < refuseFrom });
      },
    },
    charged: () => calls,
  };
}

function env(extra: Partial<Env>): Env {
  return {
    VALHALLA_URL: "http://engine.local:8002",
    ASSETS: { fetch: () => Promise.resolve(new Response("the built site", { status: 200 })) },
    ...extra,
  };
}

test("the limiter is charged per upstream query, not per client request", async (t) => {
  stubFetch(t, (call) => contourResponse(call.body));
  const route = limiter();
  const ladder = limiter();

  await handleWorkerRequest(
    post("/api/route", { origin: MONROE, destination: MONROE }),
    env({ API_RATE_LIMIT: route.binding }),
    CTX,
  );
  assert.equal(route.charged(), 1);

  // The same one client request, against a stock-limit instance, is 24
  // pedestrian isochrones. Billing it as one is what let a scraper prefer
  // the expensive endpoint.
  await handleWorkerRequest(
    post("/api/isochrone", { location: MONROE, minutes: FULL_LADDER }),
    env({ API_RATE_LIMIT: ladder.binding }),
    CTX,
  );
  assert.equal(ladder.charged(), 24);
});

test("a configured contour limit makes the same ladder cost one", async (t) => {
  stubFetch(t, (call) => contourResponse(call.body));
  const rate = limiter();

  await handleWorkerRequest(
    post("/api/isochrone", { location: MONROE, minutes: FULL_LADDER }),
    env({ API_RATE_LIMIT: rate.binding, VALHALLA_MAX_CONTOURS: "100" }),
    CTX,
  );

  assert.equal(rate.charged(), 1);
});

test("a refused charge is a 429 whose retry-after clears the limiter's window", async (t) => {
  const logs = stubConsoleError(t);
  const calls = stubFetch(t, (call) => contourResponse(call.body));
  const rate = limiter(1);

  const response = await handleWorkerRequest(
    post("/api/route", { origin: MONROE, destination: MONROE }),
    env({ API_RATE_LIMIT: rate.binding }),
    CTX,
  );

  assert.equal(response.status, 429);
  assert.equal(calls.length, 0, "a refused request never reaches the engine");

  // Must clear `period` in wrangler.toml (60 s) so the client's retry does
  // not land inside the same window, and must stay under the client's own
  // 70 s cap so the jitter is not clamped flat again.
  const retryAfter = Number(response.headers.get("retry-after"));
  assert.ok(retryAfter >= 60 && retryAfter <= 65, `retry-after was ${retryAfter}`);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.ok(logs.some((line) => line.includes('"status":429')));
});

test("a mid-ladder refusal stops the request rather than half-charging it", async (t) => {
  stubConsoleError(t);
  const calls = stubFetch(t, (call) => contourResponse(call.body));
  const rate = limiter(10);

  const response = await handleWorkerRequest(
    post("/api/isochrone", { location: MONROE, minutes: FULL_LADDER }),
    env({ API_RATE_LIMIT: rate.binding }),
    CTX,
  );

  assert.equal(response.status, 429);
  assert.equal(calls.length, 0);
});

test("without the binding the Worker still serves; without a match it serves assets", async (t) => {
  stubFetch(t, (call) => contourResponse(call.body));

  const answered = await handleWorkerRequest(
    post("/api/isochrone", { location: MONROE, minutes: [25] }),
    env({}),
    CTX,
  );
  assert.equal(answered.status, 200);

  for (const path of ["/index.html", "/api/nope"]) {
    const asset = await handleWorkerRequest(new Request(`http://app.local${path}`), env({}), CTX);
    assert.equal(await asset.text(), "the built site");
  }
});

test("an isochrone answer is served from the edge cache the second time", async (t) => {
  const caches = stubEdgeCache(t);
  const entries = () => cacheEntries(caches, ISOCHRONE_CACHE);
  const calls = stubFetch(t, (call) => contourResponse(call.body));

  const first = await handleWorkerRequest(
    post("/api/isochrone", { location: MONROE, minutes: [5, 25] }),
    env({ VALHALLA_MAX_CONTOURS: "100" }),
    CTX,
  );
  assert.equal(first.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(entries().size, 1);

  // The stored entry is the only cacheable copy; what the browser gets
  // answers a POST and cannot be cached by anything.
  assert.equal(first.headers.get("cache-control"), "no-store");
  assert.ok([...entries().values()][0]?.headers.get("cache-control")?.startsWith("public,"));

  // Same request written differently: same origin to five decimals, same
  // minutes once deduped and sorted.
  const second = await handleWorkerRequest(
    post("/api/isochrone", { location: MONROE, minutes: [25, 5, 25] }),
    env({ VALHALLA_MAX_CONTOURS: "100" }),
    CTX,
  );
  assert.equal(second.status, 200);
  assert.equal(calls.length, 1, "the second request never reached the engine");

  const payload = await readJson(second);
  assert.deepEqual(await readJson(first), payload);
});

test("a failing isochrone is neither cached nor silent", async (t) => {
  const caches = stubEdgeCache(t);
  const entries = () => cacheEntries(caches, ISOCHRONE_CACHE);
  const logs = stubConsoleError(t);
  stubFetch(t, () => new Error("ECONNREFUSED"));

  const response = await handleWorkerRequest(
    post("/api/isochrone", { location: MONROE, minutes: [25] }),
    env({ VALHALLA_MAX_CONTOURS: "100" }),
    CTX,
  );

  assert.equal(response.status, 502);
  assert.equal(entries().size, 0);
  assert.equal(response.headers.get("cache-control"), "no-store");

  // One structured line per non-2xx, which is what `wrangler tail` reads.
  const line = logs.find((entry) => entry.includes('"at":"api"'));
  assert.ok(line);
  assert.ok(line.includes('"path":"/api/isochrone"'));
  assert.ok(line.includes('"status":502'));
  assert.ok(!line.includes("engine.local"), "the log line the visitor cannot see is not the one that names the engine");
});

test("a partial ladder is answered but not kept", async (t) => {
  const caches = stubEdgeCache(t);
  const entries = () => cacheEntries(caches, ISOCHRONE_CACHE);
  // Two chunks against a 50-contour limit; the second one fails, so the
  // answer carries 50 of the 96 rungs asked for.
  let chunk = 0;
  stubFetch(t, (call) => {
    chunk += 1;
    return chunk === 1 ? contourResponse(call.body) : new Response("upstream sulked", { status: 500 });
  });

  const response = await handleWorkerRequest(
    post("/api/isochrone", { location: MONROE, minutes: FULL_LADDER }),
    env({ VALHALLA_MAX_CONTOURS: "50" }),
    CTX,
  );

  // Worth returning - the client warms per minute and asks again for the
  // gaps - but a truncation stored as a whole ladder would serve one blip to
  // every later visitor for a day.
  assert.equal(response.status, 200);
  assert.equal(entries().size, 0, "a partial ladder is not what the edge keeps");
});

test("an answer already at the edge is charged one, not the ladder's cost", async (t) => {
  stubEdgeCache(t);
  stubFetch(t, (call) => contourResponse(call.body));
  const first = limiter();

  await handleWorkerRequest(
    post("/api/isochrone", { location: MONROE, minutes: FULL_LADDER }),
    env({ VALHALLA_MAX_CONTOURS: "50", API_RATE_LIMIT: first.binding }),
    CTX,
  );
  assert.equal(first.charged(), 2, "two chunks of engine work, two charges");

  const second = limiter();
  const hit = await handleWorkerRequest(
    post("/api/isochrone", { location: MONROE, minutes: FULL_LADDER }),
    env({ VALHALLA_MAX_CONTOURS: "50", API_RATE_LIMIT: second.binding }),
    CTX,
  );

  assert.equal(hit.status, 200);
  // The charge is meant to be what the request costs the engine, and a hit
  // costs it nothing. It is still one, so a cache the whole internet can
  // reach is not a way around the limit.
  assert.equal(second.charged(), 1);
});

test("the same walk is asked for once, however many visitors want it", async (t) => {
  const caches = stubEdgeCache(t);
  const entries = () => cacheEntries(caches, ISOCHRONE_CACHE);
  // "shape" is Valhalla's wire key for a leg's encoded polyline, assigned
  // rather than declared so the name stays the engine's without becoming a
  // symbol in this codebase.
  const leg: Record<string, string> = {};
  leg["shape"] = "abc";
  const calls = stubFetch(t, () =>
    Response.json({ trip: { legs: [leg], summary: { length: 1.2, time: 900 } } }),
  );

  const walk = { origin: MONROE, destination: { latitude: 37.5407, longitude: -77.4360 } };
  const first = await handleWorkerRequest(post("/api/route", walk), env({}), CTX);

  assert.equal(first.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(entries().size, 1);
  // The browser's copy answers a POST, so nothing downstream may keep it.
  assert.equal(first.headers.get("cache-control"), "no-store");

  const second = await handleWorkerRequest(post("/api/route", walk), env({}), CTX);
  assert.equal(second.status, 200);
  assert.equal(calls.length, 1, "the second visitor never reached the engine");
  assert.deepEqual(await readJson(second), await readJson(first));
});

test("a route the engine could not answer is not kept", async (t) => {
  const caches = stubEdgeCache(t);
  const entries = () => cacheEntries(caches, ISOCHRONE_CACHE);
  stubFetch(t, () => new Response("no", { status: 500 }));

  const response = await handleWorkerRequest(
    post("/api/route", { origin: MONROE, destination: { latitude: 37.54, longitude: -77.43 } }),
    env({}),
    CTX,
  );

  assert.ok(response.status >= 400);
  assert.equal(entries().size, 0);
});
