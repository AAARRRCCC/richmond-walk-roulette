/**
 * Protocol tests for the Valhalla proxy, run with a stubbed `fetch` so no
 * engine is needed: `npm test` (node --test, Node >= 23).
 *
 * These defend the contract the client and the engine each rely on: the
 * fan-out respects the instance's contour limit, the costing is pinned
 * server-side, bad requests never reach the engine, and failures map onto
 * the status classes the client's retry logic keys on.
 *
 * The second half is the failure edges, which is where this slice's risk
 * actually lives: a chunk that dies mid-ladder, an engine answering 200 with
 * nonsense, a misconfigured contour limit, and what the visitor-facing body
 * is allowed to say about the engine's address.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { RICHMOND_BOUNDS } from "../src/lib/bounds.ts";
import {
  handleApiRequest,
  isochroneCacheKey,
  isochroneQueryCost,
  locateCacheKey,
  routeCacheKey,
  MAX_LADDER,
  MAX_MINUTES,
  WALKING_SPEED_KMH,
} from "./proxy.ts";
import {
  contourResponse,
  stubConsoleError,
  stubFetch,
  timeoutError,
  type UpstreamBody,
} from "./test-stubs.ts";
import { isJsonObject, readJson, type Json } from "../src/lib/json.ts";

const MONROE = { latitude: 37.5464, longitude: -77.4517 };
const VMFA = { latitude: 37.556058, longitude: -77.474895 };
const LADDER = Array.from({ length: 56 }, (_, i) => i + 5);
/** The real dial ladder: every minute from 5 to 100. */
const FULL_LADDER = Array.from({ length: 96 }, (_, i) => i + 5);

function post(path: string, body: Json): Request {
  return new Request(`http://app.local${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** The proxy's own reply vocabulary: {error, detail} plus GeoJSON features. */
type ProxyReply = {
  error?: string;
  detail?: string;
  ok?: boolean;
  upstreamMs?: number;
  version?: string | null;
  tileset_last_modified?: number | null;
  features?: { properties: { contour: number } }[];
};

async function reply(response: Response | null): Promise<ProxyReply> {
  assert.ok(response);
  // SAFETY: the proxy under test emits only its own JSON vocabulary — {error,
  // detail} failure bodies, the health summary, and GeoJSON FeatureCollections
  // — and these tests read just the fields that vocabulary guarantees.
  return (await readJson(response)) as ProxyReply;
}

function contourMinutes(body: UpstreamBody): number[] {
  return (body.contours ?? []).map((c) => c.time);
}

const ENV = { VALHALLA_URL: "http://engine.local:8002" };

test("full ladder is one upstream query when the limit allows", async (t) => {
  const calls = stubFetch(t, (call) => contourResponse(call.body));

  const response = await handleApiRequest(
    post("/api/isochrone", { location: MONROE, minutes: LADDER }),
    { ...ENV, VALHALLA_MAX_CONTOURS: "100" },
  );

  assert.equal(response?.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, "http://engine.local:8002/isochrone");

  const sent = calls[0]!.body;
  assert.equal(sent.costing, "pedestrian");
  assert.deepEqual(sent.costing_options, { pedestrian: { walking_speed: WALKING_SPEED_KMH } });
  assert.deepEqual(contourMinutes(sent), LADDER);

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
    { ...ENV, VALHALLA_MAX_CONTOURS: "100" },
  );

  assert.equal(response?.status, 200);
  assert.deepEqual(contourMinutes(calls[0]!.body), [5, 15, 25]);
});

test("an origin outside the Richmond box never reaches the engine", async (t) => {
  const calls = stubFetch(t, () => Response.json({}));

  const response = await handleApiRequest(
    post("/api/isochrone", { location: { latitude: 48.8566, longitude: 2.3522 }, minutes: [25] }),
    { ...ENV, VALHALLA_MAX_CONTOURS: "100" },
  );

  assert.equal(response?.status, 400);
  assert.equal(calls.length, 0);
});

test("the shared bounds constant is the one the proxy enforces", async (t) => {
  // Charlottesville is 90 km away and refused; a point at exactly the box's own
  // northern edge is accepted. Taken from `RICHMOND_BOUNDS` rather than from a
  // literal, so a client that refuses a fix and a server that refuses a request
  // cannot drift apart - which is the whole reason the constant moved out of
  // this file and into `src/lib/bounds.ts`.
  const calls = stubFetch(t, (call) => contourResponse(call.body));

  const away = await handleApiRequest(
    post("/api/isochrone", { location: { latitude: 38.0293, longitude: -78.4767 }, minutes: [25] }),
    { ...ENV, VALHALLA_MAX_CONTOURS: "100" },
  );
  assert.equal(away?.status, 400);
  assert.equal(calls.length, 0, "a refusal costs the engine nothing");

  const edge = await handleApiRequest(
    post("/api/isochrone", {
      location: { latitude: RICHMOND_BOUNDS.north, longitude: -77.45 },
      minutes: [25],
    }),
    { ...ENV, VALHALLA_MAX_CONTOURS: "100" },
  );
  assert.equal(edge?.status, 200, "the edge of the box is inside it");
  assert.equal(calls.length, 1);
});

test("malformed minutes are rejected without an upstream call", async (t) => {
  const calls = stubFetch(t, () => Response.json({}));

  // Derived from the caps rather than written out, so raising either ceiling
  // cannot quietly turn a case into a legal request that reaches upstream.
  const tooLong = Array.from({ length: MAX_LADDER + 1 }, () => 25);
  for (const minutes of [[], [2.5], [0], [MAX_MINUTES + 1], tooLong, "25", null]) {
    const response = await handleApiRequest(post("/api/isochrone", { location: MONROE, minutes }), ENV);
    assert.equal(response?.status, 400);
  }
  assert.equal(calls.length, 0);
});

test("garbage VALHALLA_MAX_CONTOURS falls back to the stock limit", async (t) => {
  const calls = stubFetch(t, (call) => contourResponse(call.body));

  // "0" and "-5" are integers and would pass a bare Number.isInteger check;
  // an instance accepting zero or minus five contours a call does not exist.
  for (const VALHALLA_MAX_CONTOURS of ["abc", "0", "-5", "", "4.5"]) {
    calls.length = 0;
    const response = await handleApiRequest(
      post("/api/isochrone", { location: MONROE, minutes: LADDER }),
      { ...ENV, VALHALLA_MAX_CONTOURS },
    );
    assert.equal(response?.status, 200);
    assert.equal(calls.length, Math.ceil(LADDER.length / 4), VALHALLA_MAX_CONTOURS);
  }
});

test("a ladder needing more upstream queries than allowed is refused, not attempted", async (t) => {
  const calls = stubFetch(t, (call) => contourResponse(call.body));

  // One contour per query is a misconfiguration, not a mode: 100 minutes
  // would be 100 sequential graph expansions for one client request.
  const response = await handleApiRequest(
    post("/api/isochrone", { location: MONROE, minutes: Array.from({ length: 100 }, (_, i) => i + 1) }),
    { ...ENV, VALHALLA_MAX_CONTOURS: "1" },
  );

  assert.equal(response?.status, 400);
  assert.equal(calls.length, 0);

  // The honest worst case — the real ladder against a stock instance — still
  // goes through at 24 queries.
  const stock = await handleApiRequest(
    post("/api/isochrone", { location: MONROE, minutes: FULL_LADDER }),
    ENV,
  );
  assert.equal(stock?.status, 200);
  assert.equal(calls.length, 24);
});

test("no VALHALLA_URL means 503 not-configured, before any fetch", async (t) => {
  const calls = stubFetch(t, () => Response.json({}));

  const response = await handleApiRequest(post("/api/isochrone", { location: MONROE, minutes: [25] }), {});

  assert.equal(response?.status, 503);
  const payload = await reply(response);
  assert.equal(payload.error, "not-configured");
  assert.equal(calls.length, 0);
});

test("an unreachable engine is 502 and never names the engine to the visitor", async (t) => {
  const logs = stubConsoleError(t);
  stubFetch(t, () => new Error("ECONNREFUSED"));

  const response = await handleApiRequest(post("/api/isochrone", { location: MONROE, minutes: [25] }), ENV);

  // 502, not 503: 503 is reserved for "VALHALLA_URL is unset", which is the
  // one thing the client must not retry. An engine that is configured but
  // down is worth retrying and is not a setup problem.
  assert.equal(response?.status, 502);
  const payload = await reply(response);
  assert.equal(payload.error, "upstream-unreachable");
  assert.ok(!JSON.stringify(payload).includes("engine.local"));

  // The address the visitor must not see is exactly what the operator needs.
  assert.ok(logs.some((line) => line.includes("http://engine.local:8002")));
  assert.ok(logs.some((line) => line.includes("upstream-unreachable")));
});

test("an engine that accepts the socket and never answers is 504", async (t) => {
  stubConsoleError(t);
  stubFetch(t, () => timeoutError());

  const response = await handleApiRequest(post("/api/route", { origin: MONROE, destination: MONROE }), ENV);

  assert.equal(response?.status, 504);
  const payload = await reply(response);
  assert.equal(payload.error, "upstream-timeout");
  assert.ok(!JSON.stringify(payload).includes("engine.local"));
});

test("one failed chunk does not throw the rest of the ladder away", async (t) => {
  stubConsoleError(t);
  let seen = 0;
  stubFetch(t, (call) => {
    seen += 1;
    // Query 5 of 14 blips. The other thirteen computed fine and the client
    // is best-effort per contour, so discarding them would be pure load
    // amplification against an engine that is already struggling.
    return seen === 5 ? Response.json({ error: "internal" }, { status: 500 }) : contourResponse(call.body);
  });

  const response = await handleApiRequest(
    post("/api/isochrone", { location: MONROE, minutes: LADDER }),
    ENV,
  );

  assert.equal(response?.status, 200);
  const payload = await reply(response);
  const got = (payload.features ?? []).map((f) => f.properties.contour);
  assert.equal(got.length, LADDER.length - 4);
  assert.ok(!got.includes(LADDER[16]!));
  assert.ok(got.includes(LADDER[0]!) && got.includes(LADDER[LADDER.length - 1]!));
});

test("when every chunk fails, the first failure's status is the answer", async (t) => {
  stubConsoleError(t);
  stubFetch(t, () => Response.json({ error: "internal" }, { status: 500 }));

  const response = await handleApiRequest(
    post("/api/isochrone", { location: MONROE, minutes: LADDER }),
    ENV,
  );

  assert.equal(response?.status, 502);
});

test("a 200 that is not a FeatureCollection reads as a broken engine, not an empty city", async (t) => {
  stubConsoleError(t);
  stubFetch(t, () => Response.json({ hello: "world" }));

  const response = await handleApiRequest(
    post("/api/isochrone", { location: MONROE, minutes: [25] }),
    { ...ENV, VALHALLA_MAX_CONTOURS: "100" },
  );

  // 200 with zero features would be indistinguishable from "nothing is
  // reachable", which is a claim the engine never made.
  assert.equal(response?.status, 502);
  const payload = await reply(response);
  assert.equal(payload.error, "upstream-empty");
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

test("route requests elevation", async (t) => {
  // Metres, because the units above are kilometres: the engine echoes the
  // interval in the response's own units, and asking in miles would come back
  // as 98.4 and feet with nothing to say it had.
  const trip = { trip: { legs: [{ "shape": "abc" }], summary: { length: 1.2, time: 900 } } };
  const calls = stubFetch(t, () => Response.json(trip));

  await handleApiRequest(
    post("/api/route", { origin: MONROE, destination: { latitude: 37.5407, longitude: -77.4361 } }),
    ENV,
  );

  assert.equal(calls[0]!.body.elevation_interval, 30);
});

test("the two endpoints version their caches independently", () => {
  // They shared one constant until v0.5. That meant a one-line change to the
  // route body evicted every 1.7 MB contour ladder on the edge - an eviction
  // nobody asked for and nobody would connect to the change that caused it.
  // The prefixes are pinned as literals precisely so the two cannot be quietly
  // conflated again by a refactor that tidies up the versions.
  const isochrone = isochroneCacheKey({ location: MONROE, minutes: [25] });
  const route = routeCacheKey({ origin: MONROE, destination: VMFA });

  assert.ok(route?.startsWith("/api/route/v2-"), `route key was ${route}`);
  assert.ok(isochrone?.startsWith("/api/isochrone/v1-"), `isochrone key was ${isochrone}`);
});

test("engine 4xx stays final (400); 429 and 5xx read transient", async (t) => {
  stubConsoleError(t);
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

test("a 429 with no retry-after keeps its status and sends no header", async (t) => {
  stubConsoleError(t);
  stubFetch(t, () => Response.json({ error: "slow down" }, { status: 429 }));

  const response = await handleApiRequest(
    post("/api/route", { origin: MONROE, destination: MONROE }),
    ENV,
  );

  // The client falls back to its own exponential backoff. Inventing a header
  // here would be asserting a wait the engine never asked for.
  assert.equal(response?.status, 429);
  assert.equal(response?.headers.get("retry-after"), null);
});

test("health forwards /status and answers without naming the engine", async (t) => {
  const calls = stubFetch(t, () =>
    Response.json({ version: "3.5.1", tileset_last_modified: 1_753_660_800, bbox: "secret" }),
  );

  const response = await handleApiRequest(new Request("http://app.local/api/health"), ENV);

  assert.equal(response?.status, 200);
  assert.equal(calls[0]!.url, "http://engine.local:8002/status");
  assert.equal(calls[0]!.method, "GET");

  const payload = await reply(response);
  assert.equal(payload.ok, true);
  assert.equal(payload.version, "3.5.1");
  assert.equal(payload.tileset_last_modified, 1_753_660_800);
  assert.ok(Number.isFinite(payload.upstreamMs));
  // Nothing else the engine said gets forwarded, and never its address.
  const body = JSON.stringify(payload);
  assert.ok(!body.includes("engine.local"));
  assert.ok(!body.includes("secret"));
});

test("health reports a dead engine as not ok, and an unset one as not configured", async (t) => {
  stubConsoleError(t);
  stubFetch(t, () => Response.json({ error: "down" }, { status: 503 }));

  const down = await handleApiRequest(new Request("http://app.local/api/health"), ENV);
  assert.equal(down?.status, 502);
  assert.equal((await reply(down)).ok, false);

  const unset = await handleApiRequest(new Request("http://app.local/api/health"), {});
  assert.equal(unset?.status, 503);
  assert.equal((await reply(unset)).error, "not-configured");
});

test("non-API paths fall through, non-POST is rejected", async (t) => {
  stubFetch(t, () => Response.json({}));

  assert.equal(await handleApiRequest(new Request("http://app.local/index.html"), ENV), null);
  assert.equal(await handleApiRequest(new Request("http://app.local/api/nope"), ENV), null);
  const got = await handleApiRequest(new Request("http://app.local/api/isochrone"), ENV);
  assert.equal(got?.status, 405);
  const health = await handleApiRequest(post("/api/health", {}), ENV);
  assert.equal(health?.status, 405);
});

test("the query cost is what the engine will actually be asked for", () => {
  const payload = { location: MONROE, minutes: FULL_LADDER };
  assert.equal(isochroneQueryCost(payload, ENV), 24);
  assert.equal(isochroneQueryCost(payload, { ...ENV, VALHALLA_MAX_CONTOURS: "100" }), 1);
  // Deduped first: 96 distinct minutes however many times they were listed.
  assert.equal(isochroneQueryCost({ location: MONROE, minutes: [...FULL_LADDER, 5, 25, 100] }, ENV), 24);
  // A request that is about to be a 400 costs one, not nothing and not many.
  assert.equal(isochroneQueryCost({ location: MONROE, minutes: [] }, ENV), 1);
  assert.equal(isochroneQueryCost(null, ENV), 1);
});

test("the cache key is canonical, coarse to 5 decimals, and refuses bad requests", () => {
  const key = isochroneCacheKey({ location: MONROE, minutes: [25, 5, 25] });
  assert.ok(key?.startsWith("/api/isochrone/"));
  assert.ok(key?.includes("37.54640,-77.45170"));
  assert.ok(key?.endsWith("/5,25"));
  // Same request written differently is the same entry.
  assert.equal(isochroneCacheKey({ location: MONROE, minutes: [5, 25] }), key);
  // The walking speed is in the key, so changing the pace empties the cache.
  assert.ok(key?.includes(String(WALKING_SPEED_KMH)));
  // A sixth decimal is a metre-scale difference the engine's 25 m grid cannot
  // express; two pins that close share the ladder.
  assert.equal(
    isochroneCacheKey({ location: { ...MONROE, latitude: MONROE.latitude + 0.000_001 }, minutes: [5, 25] }),
    key,
  );
  assert.equal(isochroneCacheKey({ location: { latitude: 48.8566, longitude: 2.3522 }, minutes: [25] }), null);
  assert.equal(isochroneCacheKey({ location: MONROE, minutes: [] }), null);
});

// ---------------------------------------------------------------------------
// POST /api/locate - the anchor snapper.
//
// The nesting in Valhalla's verbose /locate response is not uniform, and
// getting it wrong fails *silently*: every field reads undefined, every edge is
// rejected, and the endpoint answers a perfectly plausible 404. Test "reads the
// verbose nesting" is the one that catches it. The shape below was captured
// from a real instance rather than reasoned about.
// ---------------------------------------------------------------------------

const HOME = { latitude: 37.5388, longitude: -77.4336 };

type LocateEdge = {
  distance?: number;
  outbound_reach?: number;
  correlated_lat?: number;
  correlated_lon?: number;
  edge?: Json;
  edge_info?: Json;
};

/** One verbose edge entry, in the real nesting, with the parts a case varies. */
function locateEdge(over: LocateEdge = {}): Json {
  return {
    distance: 3.8,
    outbound_reach: 50,
    inbound_reach: 50,
    correlated_lat: 37.53372,
    correlated_lon: -77.43141,
    edge: {
      access: { pedestrian: true, bicycle: true, car: false },
      classification: { classification: "service_other", use: "sidewalk", surface: "compacted" },
    },
    edge_info: {
      way_id: 1422377342,
      names: ["East Cary Street"],
      mean_elevation: 6,
    },
    ...over,
  };
}

const locateBody = (...edges: Json[]): Json => [
  { input_lat: HOME.latitude, input_lon: HOME.longitude, edges, nodes: [] },
];

/** The proxy's own locate reply. */
type LocateReply = {
  error?: string;
  detail?: string;
  point?: { latitude: number; longitude: number };
  distanceMeters?: number;
  use?: string;
  wayId?: number | null;
  outboundReach?: number;
  names?: string[];
};

async function locateReply(response: Response): Promise<LocateReply> {
  const parsed = await readJson(response);
  assert.ok(isJsonObject(parsed), "the proxy answers /api/locate with a JSON object");
  return parsed;
}

test("locate reads the verbose nesting", async (t) => {
  // The whole documented 200 body, from the one shape that gets it wrong.
  const calls = stubFetch(t, () => Response.json(locateBody(locateEdge())));
  const response = await handleApiRequest(post("/api/locate", { point: HOME }), ENV);

  assert.equal(response?.status, 200);
  assert.equal(calls.length, 1);
  const body = await locateReply(response ?? new Response("{}"));
  assert.deepEqual(body.point, { latitude: 37.53372, longitude: -77.43141 });
  assert.equal(body.distanceMeters, 3.8);
  assert.equal(body.use, "sidewalk");
  assert.equal(body.wayId, 1422377342);
  assert.equal(body.outboundReach, 50);
  assert.deepEqual(body.names, ["East Cary Street"]);
});

test("locate pins pedestrian costing, the walking speed and verbose", async (t) => {
  const calls = stubFetch(t, () => Response.json(locateBody(locateEdge())));
  await handleApiRequest(post("/api/locate", { point: HOME }), ENV);

  const sent = calls[0];
  assert.match(sent?.url ?? "", /\/locate$/);
  assert.equal(sent?.body.costing, "pedestrian");
  assert.deepEqual(sent?.body.costing_options, { pedestrian: { walking_speed: WALKING_SPEED_KMH } });
  // Verbose is not optional: every field this endpoint reads lives only there.
  assert.equal(sent?.body.verbose, true);
});

test("locate refuses a point outside Richmond without calling upstream", async (t) => {
  const calls = stubFetch(t, () => Response.json(locateBody(locateEdge())));
  const response = await handleApiRequest(
    post("/api/locate", { point: { latitude: 38.9072, longitude: -77.0369 } }),
    ENV,
  );

  assert.equal(response?.status, 400);
  assert.equal(calls.length, 0);
});

test("locate refuses a non-POST", async (t) => {
  const calls = stubFetch(t, () => Response.json(locateBody(locateEdge())));
  const response = await handleApiRequest(
    new Request("http://app.local/api/locate", { method: "GET" }),
    ENV,
  );

  assert.equal(response?.status, 405);
  assert.equal(calls.length, 0);
});

test("locate is 404 when nothing returned is walkable", async (t) => {
  // Three ways to fail the gate, each on its own edge, so a single 404 proves
  // all three rather than only whichever comes first.
  const inaccessible = locateEdge({
    edge: {
      access: { pedestrian: false },
      classification: { use: "sidewalk" },
    },
  });
  const driveway = locateEdge({
    edge: {
      access: { pedestrian: true },
      classification: { use: "driveway" },
    },
  });
  const tooFar = locateEdge({ distance: 400 });

  for (const [name, edge] of [
    ["pedestrian access is false", inaccessible],
    ["the only edge is a driveway", driveway],
    ["the edge is beyond the distance ceiling", tooFar],
  ] as const) {
    stubFetch(t, () => Response.json(locateBody(edge)));
    const response = await handleApiRequest(post("/api/locate", { point: HOME }), ENV);
    assert.equal(response?.status, 404, name);
    assert.equal((await locateReply(response ?? new Response("{}"))).error, "no-pedestrian-edge", name);
  }
});

test("locate takes the first usable edge, not the first edge", async (t) => {
  // A parking aisle in front of a sidewalk is the ordinary case, and taking
  // edges[0] on faith is how an anchor lands behind a maintenance yard.
  const aisle = locateEdge({
    edge: { access: { pedestrian: true }, classification: { use: "parking_aisle" } },
  });
  stubFetch(t, () => Response.json(locateBody(aisle, locateEdge())));
  const response = await handleApiRequest(post("/api/locate", { point: HOME }), ENV);

  assert.equal(response?.status, 200);
  assert.equal((await locateReply(response ?? new Response("{}"))).use, "sidewalk");
});

test("locate refuses an edge with no correlated point", async (t) => {
  // A zero here would put the place in the Gulf of Guinea, and nothing
  // downstream could tell that from an answer.
  // Built by omission rather than by an explicit `undefined`: what an engine
  // sends is a body with no such key, and `exactOptionalPropertyTypes` is right
  // to say those are different things.
  // SAFETY: `locateEdge` returns an object literal built in this file; the
  // assertion only widens it to the index signature the rest destructures.
  const full = locateEdge() as Record<string, Json>;
  const { correlated_lat: _lat, correlated_lon: _lon, ...nowhere } = full;
  void _lat;
  void _lon;
  stubFetch(t, () => Response.json(locateBody(nowhere)));
  const response = await handleApiRequest(post("/api/locate", { point: HOME }), ENV);

  assert.equal(response?.status, 404);
});

test("locate is not configured without VALHALLA_URL", async (t) => {
  const calls = stubFetch(t, () => Response.json(locateBody(locateEdge())));
  const response = await handleApiRequest(post("/api/locate", { point: HOME }), {});

  assert.equal(response?.status, 503);
  assert.equal(calls.length, 0);
});

test("locate never leaks the engine URL", async (t) => {
  stubConsoleError(t);
  const env = { VALHALLA_URL: "http://engine.internal:8002" };

  for (const outcome of [
    () => new Error("ECONNREFUSED"),
    () => timeoutError(),
    () => new Response("nope", { status: 500 }),
    () => Response.json(locateBody()),
  ]) {
    stubFetch(t, outcome);
    const response = await handleApiRequest(post("/api/locate", { point: HOME }), env);
    const text = await (response ?? new Response("")).text();
    assert.equal(text.includes("engine.internal"), false, text);
  }
});

test("locateCacheKey rounds to four decimals and is null on bad input", () => {
  // The bound on cache growth, not an accident of formatting: at five decimals
  // the Richmond box holds ~10^10 keys and a scraper can fill it forever.
  //
  // Two points a few metres apart inside one cell share an entry. Note the
  // qualifier: this is a grid, so a pair either side of a boundary lands in two
  // cells however close it is. That is not a defect - the bound is on the
  // number of cells, not on any pair - and stating it here stops the next
  // reader from "fixing" it.
  const a = locateCacheKey({ point: { latitude: 37.53368, longitude: -77.43121 } });
  const b = locateCacheKey({ point: { latitude: 37.53372, longitude: -77.43124 } });
  assert.equal(a, b);
  assert.match(String(a), /^\/api\/locate\/v1-3\.69\/37\.5337,-77\.4312$/);

  // Two hundred metres apart is a different anchor and a different key.
  const far = locateCacheKey({ point: { latitude: 37.5355, longitude: -77.43121 } });
  assert.notEqual(a, far);

  assert.equal(locateCacheKey({ point: { latitude: 38.9072, longitude: -77.0369 } }), null);
  assert.equal(locateCacheKey({ nope: true }), null);
  assert.equal(locateCacheKey(null), null);
});
