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
  SHARE_CACHE,
  type Env,
  type WorkerContext,
} from "../worker/index.ts";
import {
  cacheEntries,
  contourResponse,
  stubConsoleError,
  stubEdgeCache,
  stubFetch,
  stubHtmlRewriter,
} from "./test-stubs.ts";
import { readJson, type Json } from "../src/lib/json.ts";
import { SHARE_CACHE_VERSION, shareCacheKey, shareMeta } from "./share-meta.ts";
import type { SharedArrival } from "../src/app/session.ts";

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

/**
 * The forecast at the edge.
 *
 * This is the "unverified, check first" claim the whole cost model rests on:
 * that the Cache API will store an entry under a synthetic GET key derived from
 * a real GET request. Everywhere else in this Worker the key is synthesised
 * from a POST, where the browser's own `Cache-Control` cannot interfere. If
 * this ever stops holding, it is discovered here rather than as an
 * Open-Meteo bill.
 */
const WEATHER_BODY = {
  utc_offset_seconds: -14400,
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
    time: ["2026-08-21T03:00"],
    temperature_2m: [72.1],
    apparent_temperature: [73.8],
    precipitation_probability: [8],
    precipitation: [0],
    weather_code: [3],
    wind_speed_10m: [6],
    uv_index: [0],
    is_day: [0],
  },
};

function weatherGet(path = "/api/weather"): Request {
  return new Request(`http://app.local${path}`, {
    method: "GET",
    headers: { "cf-connecting-ip": "203.0.113.7" },
  });
}

test("a weather miss fills the edge and the next visitor never reaches upstream", async (t) => {
  const caches = stubEdgeCache(t);
  const calls = stubFetch(t, () => Response.json(WEATHER_BODY));

  const first = await handleWorkerRequest(weatherGet(), env({}), CTX);
  assert.equal(first.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(cacheEntries(caches, ISOCHRONE_CACHE).size, 1);

  const second = await handleWorkerRequest(weatherGet(), env({}), CTX);
  assert.equal(second.status, 200);
  assert.equal(calls.length, 1, "one upstream call serves every visitor for fifteen minutes");
  assert.deepEqual(await readJson(second), await readJson(first));
  // A fifteen-minute forecast held in a private cache outlives its accuracy.
  assert.equal(second.headers.get("cache-control"), "no-store");
});

test("a query string is a 400 even with a warm edge entry", async (t) => {
  stubEdgeCache(t);
  const calls = stubFetch(t, () => Response.json(WEATHER_BODY));

  await handleWorkerRequest(weatherGet(), env({}), CTX);
  assert.equal(calls.length, 1);

  // The whole reason `weatherCacheKey` refuses a key rather than ignoring the
  // query string: the Worker consults the edge before it ever calls the proxy,
  // so an ignoring key would serve warm Richmond data for Paris with a 200 and
  // the proxy's 400 would be unreachable in production.
  const paris = await handleWorkerRequest(weatherGet("/api/weather?latitude=48.85"), env({}), CTX);
  assert.equal(paris.status, 400);
  assert.equal(calls.length, 1, "and it did not go upstream either");
});

test("weather costs the limiter exactly one", async (t) => {
  stubEdgeCache(t);
  stubFetch(t, () => Response.json(WEATHER_BODY));
  const weather = limiter();

  await handleWorkerRequest(weatherGet(), env({ API_RATE_LIMIT: weather.binding }), CTX);
  assert.equal(weather.charged(), 1);
});

test("a failed forecast is not stored", async (t) => {
  const lines = stubConsoleError(t);
  const caches = stubEdgeCache(t);
  stubFetch(t, () => new Response("nope", { status: 500 }));

  const response = await handleWorkerRequest(weatherGet(), env({}), CTX);

  assert.equal(response.status, 502);
  assert.equal(cacheEntries(caches, ISOCHRONE_CACHE).size, 0);
  assert.ok(lines.some((line) => line.includes('"at":"api"')));
});

/**
 * `/api/locate` at the edge.
 *
 * An anchor is a graph property, so a month is a conservative TTL, and the
 * proposer asks for the same few hundred every run. The cost is one unit
 * because a locate is a single correlation rather than a graph expansion -
 * `isochroneQueryCost` is not involved.
 */
const LOCATE_BODY = [
  {
    input_lat: 37.5388,
    input_lon: -77.4336,
    edges: [
      {
        distance: 3.8,
        outbound_reach: 50,
        correlated_lat: 37.53372,
        correlated_lon: -77.43141,
        edge: {
          access: { pedestrian: true },
          classification: { use: "sidewalk" },
        },
        edge_info: { way_id: 1422377342, names: ["East Cary Street"] },
      },
    ],
    nodes: [],
  },
];

test("an anchor is asked for once, however many runs want it", async (t) => {
  const caches = stubEdgeCache(t);
  const calls = stubFetch(t, () => Response.json(LOCATE_BODY));
  const at = { point: { latitude: 37.5388, longitude: -77.4336 } };

  const first = await handleWorkerRequest(post("/api/locate", at), env({}), CTX);
  assert.equal(first.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(cacheEntries(caches, ISOCHRONE_CACHE).size, 1);

  const second = await handleWorkerRequest(post("/api/locate", at), env({}), CTX);
  assert.equal(second.status, 200);
  assert.equal(calls.length, 1, "the second run never reached the engine");
  assert.deepEqual(await readJson(second), await readJson(first));
});

test("a locate costs the limiter exactly one", async (t) => {
  stubEdgeCache(t);
  stubFetch(t, () => Response.json(LOCATE_BODY));
  const anchor = limiter();

  await handleWorkerRequest(
    post("/api/locate", { point: { latitude: 37.5388, longitude: -77.4336 } }),
    env({ API_RATE_LIMIT: anchor.binding }),
    CTX,
  );
  assert.equal(anchor.charged(), 1);
});

/**
 * `/s`, the share path.
 *
 * The routing is the part no unit test can prove - `run_worker_first` lives in
 * `wrangler.toml` and only a deployed curl can check it, which is why
 * `LAUNCH.md` carries that check. What is testable is everything after the
 * request arrives: which document is fetched, what gets rewritten, what is
 * cached and what is deliberately not.
 */
const HEAD_FIXTURE = [
  "<!doctype html><html><head>",
  "<title>Walk Roulette | Richmond</title>",
  '<meta name="description" content="generic" />',
  '<meta property="og:title" content="Walk Roulette | Richmond" />',
  '<meta property="og:description" content="generic" />',
  '<meta property="og:url" content="/" />',
  '<meta property="og:image" content="/og.png" />',
  '<link rel="canonical" href="/" />',
  "</head><body></body></html>",
].join("");

/** An asset binding that answers the index document, and counts the asks. */
function assetEnv(extra: Partial<Env> = {}) {
  const asked: string[] = [];
  const bindings: Env = {
    VALHALLA_URL: "http://engine.local:8002",
    ASSETS: {
      fetch: (request: Request) => {
        asked.push(new URL(request.url).pathname);
        return Promise.resolve(
          new Response(HEAD_FIXTURE, {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
          }),
        );
      },
    },
    ...extra,
  };
  return { env: bindings, asked };
}

const shareGet = (search: string, method = "GET"): Request =>
  new Request(`http://app.local/s${search}`, {
    method,
    headers: { "cf-connecting-ip": "203.0.113.7" },
  });

const SPIN = "?o=carytown&b=34&rt=1&p=shiplock";

test("a share link is rewritten with a place-specific head", async (t) => {
  stubHtmlRewriter(t);
  stubEdgeCache(t);
  const { env: assets, asked } = assetEnv();

  const response = await handleWorkerRequest(shareGet(SPIN), assets, CTX);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");

  const html = await response.text();
  assert.match(html, /<title>Great Shiplock Park — inside 34 min<\/title>/);
  assert.match(html, /og:title" content="Great Shiplock Park — inside 34 min"/);
  assert.match(html, /og:description" content="[^"]*Carytown/);
  // Absolute, both of them, because a crawler has no base to resolve against.
  assert.match(html, /og:url" content="http:\/\/app\.local\/s\?o=carytown/);
  assert.match(html, /og:image" content="http:\/\/app\.local\/og\.png"/);
  assert.match(html, /rel="canonical" href="http:\/\/app\.local\/s\?o=carytown/);

  // "/" and never "/index.html": html_handling defaults to auto-trailing-slash
  // and answers the latter with a 307, which would trip the status guard and
  // degrade every share.
  assert.deepEqual(asked, ["/"]);
});

test("a share link that names nothing is still the app, never a 404", async (t) => {
  stubHtmlRewriter(t);
  stubEdgeCache(t);

  for (const search of ["?x=1", "", "?o=carytown&b=34&rt=1&p=a-deleted-place"]) {
    const { env: assets } = assetEnv();
    const response = await handleWorkerRequest(shareGet(search), assets, CTX);
    assert.equal(response.status, 200, search);
    const html = await response.text();
    // The generic head, untouched. A share link that cannot be described is
    // still the app.
    assert.match(html, /<title>Walk Roulette \| Richmond<\/title>/, search);
  }
});

test("a second identical share is served from its own cache, not the isochrone one", async (t) => {
  stubHtmlRewriter(t);
  const caches = stubEdgeCache(t);
  const first = assetEnv();
  await handleWorkerRequest(shareGet(SPIN), first.env, CTX);

  const second = assetEnv();
  const response = await handleWorkerRequest(shareGet(SPIN), second.env, CTX);
  assert.equal(response.status, 200);
  assert.deepEqual(second.asked, [], "the document was not fetched again");
  assert.match(await response.text(), /Great Shiplock Park/);

  assert.equal(cacheEntries(caches, SHARE_CACHE).size, 1);
  assert.equal(
    cacheEntries(caches, ISOCHRONE_CACHE).size,
    0,
    "and nothing landed in the isochrone cache",
  );
});

test("two spins differing only in a filter are two documents", async (t) => {
  stubHtmlRewriter(t);
  const caches = stubEdgeCache(t);

  await handleWorkerRequest(shareGet(SPIN + "&c=easy"), assetEnv().env, CTX);
  await handleWorkerRequest(shareGet(SPIN + "&c=hilly"), assetEnv().env, CTX);

  // Keying them together would hand the second sender's crawler the first
  // sender's og:url - a share link resolving to somebody else's filters.
  assert.equal(cacheEntries(caches, SHARE_CACHE).size, 2);
});

test("a dropped-pin share is rendered every time and never stored", async (t) => {
  stubHtmlRewriter(t);
  const caches = stubEdgeCache(t);
  const { env: assets, asked } = assetEnv();

  const pin = "?o=37.534,-77.431&b=30&rt=1&p=shiplock";
  await handleWorkerRequest(shareGet(pin), assets, CTX);
  await handleWorkerRequest(shareGet(pin), assets, CTX);

  // Coordinates are the one field with an unbounded value space, so a scraper
  // could otherwise mint entries forever. A pin link is sent by one person
  // anyway, so there is nothing to amortise.
  assert.equal(cacheEntries(caches, SHARE_CACHE).size, 0);
  assert.deepEqual(asked, ["/", "/"]);
});

test("a HEAD never fills the cache", async (t) => {
  stubHtmlRewriter(t);
  const caches = stubEdgeCache(t);

  const head = await handleWorkerRequest(shareGet(SPIN, "HEAD"), assetEnv().env, CTX);
  assert.equal(head.status, 200);
  // Crawlers do issue HEAD. A stored empty body would serve an empty document
  // to the next GET of the same spin.
  assert.equal(cacheEntries(caches, SHARE_CACHE).size, 0);

  const get = assetEnv();
  const response = await handleWorkerRequest(shareGet(SPIN), get.env, CTX);
  assert.match(await response.text(), /Great Shiplock Park/, "and the next GET is still rewritten");
});

test("a share costs the limiter nothing", async (t) => {
  stubHtmlRewriter(t);
  stubEdgeCache(t);
  const share = limiter();
  const { env: assets } = assetEnv({ API_RATE_LIMIT: share.binding });

  await handleWorkerRequest(shareGet(SPIN), assets, CTX);
  // It never calls the engine, so charging it would be charging for nothing.
  assert.equal(share.charged(), 0);
});

test("without HTMLRewriter a share is the app's document, not an error", async (t) => {
  stubEdgeCache(t);
  const { env: assets, asked } = assetEnv();

  const response = await handleWorkerRequest(shareGet(SPIN), assets, CTX);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<title>Walk Roulette \| Richmond<\/title>/);
  assert.deepEqual(asked, ["/"]);
  void t;
});

test("shareMeta refuses to name a walk it cannot describe", () => {
  // Null is not a failure - the Worker then serves the generic document, which
  // is the right unfurl for a link naming a place that no longer exists.
  const origin = "https://walk.example";
  assert.equal(shareMeta("?o=carytown&b=34&rt=1&p=gone", origin), null, "unknown place");
  assert.equal(shareMeta("?o=carytown&rt=1&p=shiplock", origin), null, "no budget");
  assert.equal(shareMeta("?b=34&rt=1&p=shiplock", origin), null, "no origin");
  assert.equal(shareMeta("?o=not-a-preset&b=34&rt=1&p=shiplock", origin), null, "unknown preset");
});

test("shareMeta names a dropped pin without publishing it in the sentence", () => {
  const meta = shareMeta("?o=37.534,-77.431&b=30&rt=1&p=shiplock", "https://walk.example");
  assert.ok(meta !== null);
  assert.match(meta.description, /a dropped pin/);
  // The coordinate is in the URL, which the recipient needs, and not in the
  // sentence a group chat renders in full.
  assert.equal(/37.5/.test(meta.description), false);
});

test("the share cache key carries the whole query and refuses a pin", () => {
  const key = shareCacheKey("?o=carytown&b=34&rt=1&c=easy&p=shiplock");
  assert.ok(String(key).startsWith("/__share/" + SHARE_CACHE_VERSION + "?"), String(key));
  assert.match(String(key), /c=easy/, "a filter is part of the document, so part of the key");

  // Order and vibe permutations of one walk are one entry.
  assert.equal(
    shareCacheKey("?b=34&o=carytown&rt=1&p=shiplock&v=park.river"),
    shareCacheKey("?o=carytown&v=river.park&b=34&p=shiplock&rt=1"),
  );

  assert.equal(shareCacheKey("?o=37.534,-77.431&b=30&rt=1&p=shiplock"), null, "a pin");
  assert.equal(shareCacheKey("?o=carytown&b=34&rt=1"), null, "no place");
});

test("a SharedArrival carries what the notices and the URL rule each need", () => {
  // Three fields, three consumers: the missing-place notice, the clamp notice,
  // and App's address-bar comparison. They are separate because they expire at
  // different moments.
  const arrival: SharedArrival = {
    missingPlaceId: null,
    clampedFromMinutes: 7,
    linkQuery: "o=home&b=7&rt=1&p=capitol",
  };
  assert.equal(arrival.clampedFromMinutes, 7);
  assert.equal(arrival.missingPlaceId, null);
  assert.match(arrival.linkQuery, /^o=home/);
});

// ---------------------------------------------------------------------------
// Meet links
// ---------------------------------------------------------------------------

const SITE = "https://walk.example";

test("an invite unfurls as a question", () => {
  // The one case the old rule refused outright, by returning null for a link
  // naming no place. An invite's whole content IS the question, and a generic
  // card in the thread would mean the recipient taps blind.
  const meta = shareMeta("?m=1&ma=carytown&b=30&rt=1", SITE);
  assert.ok(meta !== null);
  assert.match(meta.title, /both/i);
  assert.match(meta.title, /30 min/);
});

test("an invite from a pin never leaks a coordinate or a neighbourhood", () => {
  const meta = shareMeta("?m=1&ma=37.541,-77.436&b=30&rt=1", SITE);
  assert.ok(meta !== null);
  for (const text of [meta.title, meta.description]) {
    assert.equal(/37\.5|-77\.4/.test(text), false, text);
  }
  assert.match(meta.description, /a dropped pin/);
  // No preset name guessed from a coordinate, either.
  assert.equal(/Carytown|Manchester|Scott/.test(meta.description), false);
});

test("an invite title does not name the sender's neighbourhood", () => {
  // A solo share says "from Carytown" because the origin is the walk's
  // premise. An invite is about a PERSON, and a message-app preview is
  // rendered by a third-party crawler and cached on its servers - so the
  // title names no origin at all. The description may, because naming a
  // landmark is what the sender chose by picking one.
  const meta = shareMeta("?m=1&ma=carytown&b=30&rt=1", SITE);
  assert.ok(meta !== null);
  assert.equal(meta.title.includes("Carytown"), false);
  assert.match(meta.description, /Carytown|both/);
});

test("an answer names the place and says inside, not a walk", () => {
  const meta = shareMeta("?m=1&ma=37.512,-77.402&mb=carytown&b=30&rt=1&p=shiplock", SITE);
  assert.ok(meta !== null);
  assert.match(meta.title, /Great Shiplock Park/);
  assert.match(meta.title, /inside 30 min/);
  assert.equal(meta.title.includes("a 30 min walk"), false);
});

test("an answer with an unknown place has no preview", () => {
  // Same rule as a solo link: the site's own generic card, rather than an
  // invented one.
  assert.equal(shareMeta("?m=1&ma=carytown&mb=home&b=30&rt=1&p=nowhere", SITE), null);
});

test("a meet link with any pin is never cached", () => {
  // Coordinates are an unbounded key space and a scraper minting entries in it
  // is the reason this rule exists.
  assert.equal(shareCacheKey("?m=1&ma=37.541,-77.436&b=30&rt=1&p=shiplock"), null);
  assert.equal(shareCacheKey("?m=1&ma=carytown&mb=37.512,-77.402&b=30&rt=1&p=shiplock"), null);
  assert.equal(shareCacheKey("?m=1&ma=37.5,-77.4&mb=37.6,-77.5&b=30&rt=1&p=shiplock"), null);
});

test("a preset-to-preset meet link is cached", () => {
  // And these are exactly the ones that repeat.
  const key = shareCacheKey("?m=1&ma=carytown&mb=home&b=30&rt=1&p=shiplock");
  assert.ok(key !== null);
  assert.match(key, /^\/__share\/v1\?/);
});

test("an invite and an answer between the same two starts are different documents", () => {
  const invite = shareCacheKey("?m=1&ma=carytown&mb=home&b=30&rt=1");
  const answer = shareCacheKey("?m=1&ma=carytown&mb=home&b=30&rt=1&p=shiplock");
  assert.notEqual(invite, answer);
  assert.notEqual(
    shareMeta("?m=1&ma=carytown&mb=home&b=30&rt=1", SITE)?.url,
    shareMeta("?m=1&ma=carytown&mb=home&b=30&rt=1&p=shiplock", SITE)?.url,
  );
});

test("a meet cache key and a solo cache key cannot collide", () => {
  assert.notEqual(
    shareCacheKey("?o=carytown&b=30&rt=1&p=shiplock"),
    shareCacheKey("?m=1&ma=carytown&b=30&rt=1&p=shiplock"),
  );
});

test("og:url carries the canonical coarse coordinate", () => {
  const meta = shareMeta("?m=1&ma=37.54070,-77.43600&b=30&rt=1", SITE);
  assert.ok(meta !== null);
  assert.match(meta.url, /ma=37\.541%2C-77\.436/);
  assert.equal(meta.url.includes("37.54070"), false);
});

test("this chunk does not re-key a single warm solo entry", () => {
  // Asserted against a LITERAL, and the same literal is the reason
  // SHARE_CACHE_VERSION can stay "v1". If this fails, the fix is to match the
  // bytes chunk 10 already emits - never to bump the version, which would
  // silently re-key every warm entry at deploy.
  assert.equal(
    shareCacheKey("?o=carytown&b=34&rt=1&e=1&c=easy&v=park.river&k=detour&p=shiplock"),
    "/__share/v1?o=carytown&b=34&rt=1&e=1&c=easy&k=detour&v=river.park&p=shiplock",
  );
});

/**
 * `/s` for the two meet shapes.
 *
 * The Worker gains **zero** lines for this feature: `/s` already fetches `/`,
 * rewrites the head and caches by `shareCacheKey`, and every meet-specific
 * decision lives inside the two pure modules it already imports. These tests
 * exist to prove exactly that — that the branch behaves, not that it was
 * rewritten.
 */
test("an invite never touches the engine", (t) => {
  stubHtmlRewriter(t);
  stubEdgeCache(t);
  const fetches = stubFetch(t, () => new Error("the engine must not be called for an invite"));
  const invited = assetEnv({ API_RATE_LIMIT: limiter().binding });

  return handleWorkerRequest(shareGet("?m=1&ma=carytown&b=30&rt=1"), invited.env, CTX).then(
    async (response) => {
      assert.equal(response.status, 200);
      assert.equal(fetches.length, 0);
      assert.match(await response.text(), /both/i);
    },
  );
});

test("an invite with a pin is rendered and not stored", async (t) => {
  stubHtmlRewriter(t);
  const caches = stubEdgeCache(t);
  const pin = "?m=1&ma=37.541,-77.436&b=30&rt=1";

  const first = assetEnv();
  await handleWorkerRequest(shareGet(pin), first.env, CTX);
  const second = assetEnv();
  await handleWorkerRequest(shareGet(pin), second.env, CTX);

  assert.equal(cacheEntries(caches, SHARE_CACHE).size, 0);
  assert.deepEqual(first.asked, ["/"]);
  assert.deepEqual(second.asked, ["/"], "rendered fresh every time, by design");
});

test("a preset-to-preset meet link is served from the edge on the second GET", async (t) => {
  stubHtmlRewriter(t);
  const caches = stubEdgeCache(t);
  const both = "?m=1&ma=carytown&mb=home&b=30&rt=1&p=shiplock";

  const first = assetEnv();
  await handleWorkerRequest(shareGet(both), first.env, CTX);
  const second = assetEnv();
  const response = await handleWorkerRequest(shareGet(both), second.env, CTX);

  assert.equal(response.status, 200);
  assert.deepEqual(second.asked, [], "the document was not fetched again");
  assert.equal(cacheEntries(caches, SHARE_CACHE).size, 1);
  assert.equal(cacheEntries(caches, ISOCHRONE_CACHE).size, 0);
});

test("the asset fetched for a meet link is always `/`", async (t) => {
  stubHtmlRewriter(t);
  stubEdgeCache(t);
  for (const search of [
    "?m=1&ma=carytown&b=30&rt=1",
    "?m=1&ma=37.541,-77.436&b=30&rt=1",
    "?m=1&ma=carytown&mb=home&b=30&rt=1&p=shiplock",
  ]) {
    const one = assetEnv();
    const asked = one.asked;
    await handleWorkerRequest(shareGet(search), one.env, CTX);
    // Never `/s` (which `not_found_handling: "none"` answers with a 404) and
    // never `/index.html` (which `html_handling` answers with a 307).
    assert.deepEqual(asked, ["/"], search);
  }
});
