/**
 * Same-origin proxy for the Valhalla routing engine.
 *
 * The browser never talks to Valhalla directly. Everything goes through
 * `/api/isochrone`, `/api/route` and `/api/health`, which both the Vite dev
 * server and the Cloudflare Worker mount, so dev and prod exercise the
 * identical request path. The proxy is also the policy layer: it fixes the
 * costing model, the walking speed and the geographic bounds server-side, so
 * a scraped endpoint cannot be turned into a general-purpose worldwide
 * routing service.
 */

import {
  isFiniteNumber,
  isJsonArray,
  isJsonObject,
  isString,
  parseJson,
  readJson,
  type Json,
  type JsonObject,
} from "../src/lib/json.ts";

export type ProxyEnv = {
  /** Base URL of a Valhalla instance, e.g. http://localhost:8002 */
  VALHALLA_URL?: string | undefined;
  /**
   * Highest number of contours the instance accepts per /isochrone call.
   * Stock Valhalla ships `service_limits.isochrone.max_contours: 4`; the
   * self-hosted config in valhalla/ raises it to 100 so the whole dial
   * ladder comes back in one query. 100 is the number every other file in
   * this repo names — wrangler.toml, .env.example, valhalla/README.md,
   * LAUNCH.md — and they have to agree, because setting this higher than the
   * instance allows gets the whole batch rejected upstream. Left unset, the
   * proxy assumes the stock limit and splits the request, which works
   * against any instance.
   */
  VALHALLA_MAX_CONTOURS?: string | undefined;
};

/**
 * Walking speed, km/h, applied to isochrones and routes alike so the contour
 * on the map and the minutes on the result card are answers to the same
 * question.
 *
 * 3.69 is not arbitrary: it is the pace at which Valhalla's 25 minute area
 * from Monroe Park matched Google's isochrone during the provider comparison
 * (see LAUNCH.md), i.e. the pace the app's shipped contours have always
 * implied. Changing it moves every contour, every ETA and every candidate
 * pool, so treat it as a product decision to be measured, not a constant to
 * be tweaked.
 */
export const WALKING_SPEED_KMH = 3.69;

/** Valhalla accepts up to 120 min; we cap lower: this is a walking app. */
const MIN_MINUTES = 1;
// Matches the client ladder's ceiling. Public Valhalla instances cap this
// themselves (FOSSGIS refuses past 100), so asking for more just earns a 400.
export const MAX_MINUTES = 100;

/**
 * Most contour minutes accepted in one client request. The dial ladder is
 * every minute from 5 to 100, so this has to clear 96; the rest is headroom
 * before it becomes an abuse limit rather than a correctness one.
 */
export const MAX_LADDER = 120;

const STOCK_MAX_CONTOURS = 4;

/**
 * Most upstream graph expansions one client request is allowed to cost.
 *
 * The rate limiter in front of this counts client requests; the engine pays
 * per query, and one `/api/isochrone` call is `ceil(minutes / max_contours)`
 * of the most expensive operation Valhalla performs. Against the stock limit
 * of 4 the full 96-rung ladder is 24 queries, which is the honest warm-up
 * this app was built around. 30 clears that with headroom and still means a
 * misconfigured `VALHALLA_MAX_CONTOURS=1` cannot turn one client request
 * into 120 sequential expansions.
 */
const MAX_UPSTREAM_QUERIES = 30;

/**
 * How long one upstream query gets before it is abandoned. A 100 minute
 * pedestrian isochrone on a cold instance genuinely takes seconds, so this
 * is generous; the point is only that a box which accepts the socket and
 * never answers is otherwise indistinguishable from a slow one, and the app
 * would sit in `status: "loading"` forever.
 */
const UPSTREAM_TIMEOUT_MS = 20_000;

/**
 * Whole-request budget for a chunked ladder. Without it, 24 chunks against a
 * hung engine would be 24 x UPSTREAM_TIMEOUT_MS before the client heard
 * anything. When the budget runs out the proxy answers with the contours it
 * did gather, which is what the client wants anyway.
 */
const LADDER_BUDGET_MS = 60_000;

/**
 * Bumped when the meaning of a cached isochrone changes for a reason the key
 * cannot see — a tile rebuild, or a change to the costing options below. The
 * walking speed is part of the key itself, so that one invalidates on its own.
 */
const CACHE_VERSION = "v1";

/**
 * Requests outside this box are rejected. The app is about one city; without
 * a bound, a leaked endpoint is a free worldwide routing service on whatever
 * box hosts the engine.
 */
const BOUNDS = { south: 37.3, west: -77.9, north: 37.8, east: -77.1 };

type LatLng = { latitude: number; longitude: number };

function json(body: Json, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function badRequest(message: string): Response {
  return json({ error: message }, 400);
}

/**
 * One structured line on stderr per upstream problem. `wrangler tail` and the
 * dev server's terminal both pick it up, which is the difference between
 * diagnosing a deploy with one command and diagnosing it by loading the site
 * and reading the visitor-facing notice.
 */
function logUpstream(event: string, fields: JsonObject): void {
  console.error(JSON.stringify({ at: "valhalla", event, ...fields }));
}

/**
 * 503 means one thing: nobody has told this deployment where the engine is.
 * That is the state the client's setup panel exists for, and the one status
 * its retry loop deliberately does not retry, because no amount of waiting
 * configures a variable. A configured engine that is not answering is 502 or
 * 504 — see `unreachable`.
 */
function notConfigured(detail: string): Response {
  return json({ error: "not-configured", detail }, 503);
}

/**
 * A configured engine that did not answer.
 *
 * The base URL goes to the log and never into the body. It names an internal
 * host, and during an outage the body is what every visitor reads. A timeout
 * stays distinct from a refusal because they are different diagnoses: one box
 * is overloaded, the other is not running.
 */
function unreachable(base: string, path: string, timedOut: boolean): Response {
  logUpstream(timedOut ? "upstream-timeout" : "upstream-unreachable", { base, path });
  return timedOut
    ? json({ error: "upstream-timeout", detail: "The routing engine did not answer in time." }, 504)
    : json({ error: "upstream-unreachable", detail: "The routing engine is not answering." }, 502);
}

function readLatLng(value: Json | undefined): LatLng | null {
  if (!isJsonObject(value)) return null;
  const { latitude, longitude } = value;
  if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) return null;
  if (latitude < BOUNDS.south || latitude > BOUNDS.north) return null;
  if (longitude < BOUNDS.west || longitude > BOUNDS.east) return null;
  return { latitude, longitude };
}

/** Validated minute marks for one isochrone request: deduped, ascending. */
function readMinutes(value: Json | undefined): number[] | null {
  if (!isJsonArray(value) || value.length === 0 || value.length > MAX_LADDER) return null;
  const seen = new Set<number>();
  for (const mark of value) {
    if (!isFiniteNumber(mark) || !Number.isInteger(mark)) return null;
    if (mark < MIN_MINUTES || mark > MAX_MINUTES) return null;
    seen.add(mark);
  }
  return [...seen].toSorted((a, b) => a - b);
}

/**
 * Contours this instance accepts per query. Anything that is not a positive
 * integer — unset, empty, "abc", "0", "-5" — falls back to the stock limit,
 * because splitting a ladder that did not need splitting is merely slow while
 * failing to split one that did is the difference between working and not.
 */
function contourLimit(env: ProxyEnv): number {
  const configured = Number(env.VALHALLA_MAX_CONTOURS);
  return Number.isInteger(configured) && configured >= 1
    ? Math.min(configured, MAX_LADDER)
    : STOCK_MAX_CONTOURS;
}

/**
 * How many upstream graph expansions one isochrone request will cost, so the
 * Worker can charge its rate limiter per query rather than per client
 * request. An unreadable payload costs 1: it is about to be rejected as a 400
 * without touching the engine.
 */
export function isochroneQueryCost(payload: Json, env: ProxyEnv): number {
  if (!isJsonObject(payload)) return 1;
  const minutes = readMinutes(payload.minutes);
  if (!minutes) return 1;
  return Math.ceil(minutes.length / contourLimit(env));
}

/**
 * The canonical GET form of an isochrone request, for the Worker's edge
 * cache. A ladder is deterministic for the life of a tile build and is the
 * most expensive thing the engine computes, so two people who drop a pin on
 * the same block should not each pay for one.
 *
 * The origin is rounded to 5 decimals — about a metre, far finer than the
 * engine's own 25 m grid — the minute list is the normalised one the engine
 * will actually be asked for, and the version segment carries the walking
 * speed, so changing the pace invalidates every entry at once. Returns null
 * for a payload that is not a valid request: those must not be cached under
 * any key.
 */
export function isochroneCacheKey(payload: Json): string | null {
  if (!isJsonObject(payload)) return null;
  const location = readLatLng(payload.location);
  const minutes = readMinutes(payload.minutes);
  if (!location || !minutes) return null;
  const at = `${location.latitude.toFixed(5)},${location.longitude.toFixed(5)}`;
  return `/api/isochrone/${CACHE_VERSION}-${WALKING_SPEED_KMH}/${at}/${minutes.join(",")}`;
}

/**
 * Calls Valhalla and translates failure into this proxy's own vocabulary.
 *
 * Every attempt carries a deadline. Without one the only failure modelled is
 * a refused connection, and a box that accepts the socket and never answers
 * produces no error anywhere: the chunk loop never advances and the browser
 * sits in `status: "loading"` indefinitely.
 */
async function callValhalla(
  base: string,
  path: string,
  body: Json,
  timeoutMs: number,
): Promise<Response> {
  let upstream: Response;
  try {
    upstream = await fetch(`${base.replace(/\/+$/, "")}${path}`, {
      method: "POST",
      // FOSSGIS's community instance asks apps that call it to identify
      // themselves with X-Client-Id. Harmless against a private engine, and
      // the evaluation fallback in valhalla/README.md points here.
      headers: { "content-type": "application/json", "x-client-id": "walk-roulette" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (cause) {
    // AbortSignal.timeout rejects with a TimeoutError. Anything else here is
    // DNS, a refused connection, or a socket that dropped mid-answer.
    return unreachable(base, path, cause instanceof Error && cause.name === "TimeoutError");
  }

  const text = await upstream.text();
  if (upstream.ok) {
    return new Response(text, {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }

  // Valhalla's error body is {error_code, error, status_code} and contains
  // nothing sensitive, but the client only ever needs a short reason.
  let reason = `upstream ${upstream.status}`;
  try {
    const parsed = parseJson(text);
    if (isJsonObject(parsed) && isString(parsed.error)) reason = parsed.error;
  } catch {
    // Non-JSON error body; the status alone will have to do.
  }
  logUpstream("upstream-error", { base, path, status: upstream.status, reason });
  // 429/408 keep their status and Retry-After so the client's retry loop
  // (which treats exactly those as transient) can pace itself against a
  // rate-limited shared instance. Any other 4xx is Valhalla's final word
  // (e.g. "no path" is error_code 442 under HTTP 400) and must stay a 400,
  // or the client would burn retries on an answer that cannot change. 5xx
  // stays transient.
  if (upstream.status === 429 || upstream.status === 408) {
    const headers = new Headers({
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    const retryAfter = upstream.headers.get("retry-after");
    if (retryAfter !== null) headers.set("retry-after", retryAfter);
    return new Response(JSON.stringify({ error: `upstream ${upstream.status}`, detail: reason }), {
      status: upstream.status,
      headers,
    });
  }
  const status = upstream.status < 500 ? 400 : 502;
  return json({ error: `upstream ${upstream.status}`, detail: reason }, status);
}

/**
 * `POST /api/isochrone { location, minutes: number[] }`.
 *
 * Returns one GeoJSON FeatureCollection whose features carry
 * `properties.contour` in minutes. The whole dial ladder is one client
 * request; whether it is also one upstream request depends on the instance's
 * `max_contours` limit. Splitting happens here, server-side and sequentially,
 * so a shared or undersized instance sees a paced trickle rather than a
 * parallel burst of repeated graph expansions.
 *
 * A chunk that fails does not throw the others away. The client is
 * best-effort per contour and re-asks for the minutes it did not get, so
 * discarding 76 computed contours because query 20 blipped is load
 * amplification against an engine that is already struggling. The first
 * failure's status is returned only when no chunk produced anything.
 */
async function isochrone(env: ProxyEnv, base: string, payload: JsonObject): Promise<Response> {
  const location = readLatLng(payload.location);
  if (!location) return badRequest("location must be a lat/lng inside the Richmond area");

  const minutes = readMinutes(payload.minutes);
  if (!minutes) {
    return badRequest(`minutes must be 1 to ${MAX_LADDER} integers between ${MIN_MINUTES} and ${MAX_MINUTES}`);
  }

  const limit = contourLimit(env);
  const queries = Math.ceil(minutes.length / limit);
  if (queries > MAX_UPSTREAM_QUERIES) {
    return badRequest(
      `that ladder needs ${queries} upstream queries and this proxy allows ${MAX_UPSTREAM_QUERIES}; ask for fewer minutes`,
    );
  }

  const deadline = Date.now() + LADDER_BUDGET_MS;
  const features: Json[] = [];
  let firstFailure: Response | null = null;
  let dropped = 0;

  for (let start = 0; start < minutes.length; start += limit) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      dropped += minutes.length - start;
      break;
    }

    const slice = minutes.slice(start, start + limit);
    const response = await callValhalla(
      base,
      "/isochrone",
      {
        locations: [{ lat: location.latitude, lon: location.longitude }],
        costing: "pedestrian",
        costing_options: { pedestrian: { walking_speed: WALKING_SPEED_KMH } },
        contours: slice.map((time) => ({ time })),
        polygons: true,
        denoise: 0.2,
        // Douglas-Peucker tolerance in metres, and 0 means "do not simplify".
        // At 10 the longest single chord came out at 768 m, which is what made
        // contours read as blocky where the reachable edge is long and curved -
        // most visibly along the river. Ungeneralised the longest is under 100 m
        // for the same contour, at roughly 3.6x the vertices.
        generalize: 0,
      },
      Math.min(UPSTREAM_TIMEOUT_MS, remaining),
    );

    if (response.status !== 200) {
      firstFailure ??= response;
      dropped += slice.length;
      continue;
    }

    // A 200 whose body is not a FeatureCollection is the engine answering
    // nonsense. It counts as a chunk that produced nothing, never as one that
    // succeeded.
    const body = await readJson(response).catch(() => null);
    if (isJsonObject(body) && isJsonArray(body.features)) features.push(...body.features);
    else dropped += slice.length;
  }

  if (features.length > 0) {
    if (dropped > 0) logUpstream("ladder-partial", { base, gathered: features.length, dropped });
    return json({ type: "FeatureCollection", features }, 200);
  }
  if (firstFailure) return firstFailure;
  // Every chunk answered 200 and none carried contours. That is a broken
  // engine rather than an unreachable city, and the two have to be
  // distinguishable from the client.
  return json({ error: "upstream-empty", detail: "The routing engine returned no contours." }, 502);
}

/** `POST /api/route { origin, destination }`. Forwards Valhalla's trip JSON. */
async function route(base: string, payload: JsonObject): Promise<Response> {
  const origin = readLatLng(payload.origin);
  const destination = readLatLng(payload.destination);
  if (!origin || !destination) {
    return badRequest("origin and destination must be lat/lngs inside the Richmond area");
  }

  return callValhalla(
    base,
    "/route",
    {
      locations: [
        { lat: origin.latitude, lon: origin.longitude },
        { lat: destination.latitude, lon: destination.longitude },
      ],
      costing: "pedestrian",
      costing_options: { pedestrian: { walking_speed: WALKING_SPEED_KMH } },
      units: "kilometers",
      // The app draws the line and prints distance and time; turn-by-turn prose
      // would be dead weight in every warm-up response.
      directions_type: "none",
    },
    UPSTREAM_TIMEOUT_MS,
  );
}

/**
 * `GET /api/health`. One request that answers "is this deploy working", so
 * the reachability checks in LAUNCH.md stop being manual browser work and an
 * uptime monitor has something to poll.
 *
 * Valhalla's /status carries the engine version and the age of the tileset,
 * which is what a deploy actually needs to confirm. The answer names no URL
 * and forwards nothing else the engine said: this endpoint is public, and a
 * health check is the easiest place to leak infrastructure by accident.
 */
async function health(base: string): Promise<Response> {
  const started = Date.now();
  let upstream: Response;
  try {
    upstream = await fetch(`${base.replace(/\/+$/, "")}/status`, {
      headers: { "x-client-id": "walk-roulette" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (cause) {
    return unreachable(base, "/status", cause instanceof Error && cause.name === "TimeoutError");
  }

  const upstreamMs = Date.now() - started;
  if (!upstream.ok) {
    logUpstream("health-error", { base, status: upstream.status });
    return json({ ok: false, upstreamMs, upstreamStatus: upstream.status }, 502);
  }

  const body = await readJson(upstream).catch(() => null);
  const status = isJsonObject(body) ? body : {};
  const tileset = status.tileset_last_modified;
  return json(
    {
      ok: true,
      upstreamMs,
      version: isString(status.version) ? status.version : null,
      tileset_last_modified: isFiniteNumber(tileset) ? tileset : null,
    },
    200,
  );
}

/**
 * Routes the three `/api/*` endpoints this proxy owns. Returns null for paths
 * it does not, so the caller can fall through to static serving.
 *
 * The request is validated before the engine URL is looked up: a malformed
 * request is a client bug whatever the server is configured with, and
 * reporting it as "not configured" sends the reader hunting for the wrong
 * problem. It also means the guards above are exercisable without an engine.
 */
export async function handleApiRequest(request: Request, env: ProxyEnv): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  const isIsochrone = pathname === "/api/isochrone";
  const isHealth = pathname === "/api/health";
  if (!isIsochrone && !isHealth && pathname !== "/api/route") return null;

  if (isHealth) {
    if (request.method !== "GET") return json({ error: "method not allowed" }, 405);
    const configured = env.VALHALLA_URL;
    if (!configured) {
      return notConfigured("VALHALLA_URL is unset. See .env.example and valhalla/README.md.");
    }
    return health(configured);
  }

  if (request.method !== "POST") return json({ error: "method not allowed" }, 405);

  let payload: JsonObject;
  try {
    const parsed = await readJson(request);
    if (!isJsonObject(parsed)) return badRequest("body must be a JSON object");
    payload = parsed;
  } catch {
    return badRequest("body must be JSON");
  }

  const base = env.VALHALLA_URL;
  if (!base) {
    return notConfigured("VALHALLA_URL is unset. See .env.example and valhalla/README.md.");
  }

  return isIsochrone ? isochrone(env, base, payload) : route(base, payload);
}
