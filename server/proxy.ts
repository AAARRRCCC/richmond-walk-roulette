/**
 * Same-origin proxy for the Valhalla routing engine.
 *
 * The browser never talks to Valhalla directly. Everything goes through
 * `/api/isochrone` and `/api/route`, which both the Vite dev server and the
 * Cloudflare Worker mount, so dev and prod exercise the identical request
 * path. The proxy is also the policy layer: it fixes the costing model, the
 * walking speed and the geographic bounds server-side, so a scraped endpoint
 * cannot be turned into a general-purpose worldwide routing service.
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
   * self-hosted config in valhalla/ raises it to 60 so the whole dial ladder
   * comes back in one query. Left unset, the proxy assumes the stock limit
   * and splits the request, which works against any instance.
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
const MAX_MINUTES = 90;

/** Most contour minutes accepted in one client request: the full dial ladder. */
const MAX_LADDER = 60;

const STOCK_MAX_CONTOURS = 4;

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

function notConfigured(detail: string): Response {
  return json({ error: "not-configured", detail }, 503);
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
 * Calls Valhalla and translates failure into this proxy's own vocabulary.
 *
 * A network-level failure is reported as "not configured" rather than a
 * generic 502: the by-far most common cause is that the engine simply is not
 * running (locally: `valhalla/README.md`; deployed: VALHALLA_URL points at a
 * dead box), and the setup panel is the remediation that fixes it.
 */
async function callValhalla(base: string, path: string, body: Json): Promise<Response> {
  let upstream: Response;
  try {
    upstream = await fetch(`${base.replace(/\/+$/, "")}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return notConfigured(
      `Valhalla is not reachable at ${base}. Start the engine (see valhalla/README.md) or fix VALHALLA_URL.`,
    );
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
 */
async function isochrone(env: ProxyEnv, base: string, payload: JsonObject): Promise<Response> {
  const location = readLatLng(payload.location);
  if (!location) return badRequest("location must be a lat/lng inside the Richmond area");

  const minutes = readMinutes(payload.minutes);
  if (!minutes) {
    return badRequest(`minutes must be 1 to ${MAX_LADDER} integers between ${MIN_MINUTES} and ${MAX_MINUTES}`);
  }

  const configured = Number(env.VALHALLA_MAX_CONTOURS);
  const limit = Number.isInteger(configured) && configured >= 1
    ? Math.min(configured, MAX_LADDER)
    : STOCK_MAX_CONTOURS;

  const features: Json[] = [];
  for (let start = 0; start < minutes.length; start += limit) {
    const slice = minutes.slice(start, start + limit);
    const response = await callValhalla(base, "/isochrone", {
      locations: [{ lat: location.latitude, lon: location.longitude }],
      costing: "pedestrian",
      costing_options: { pedestrian: { walking_speed: WALKING_SPEED_KMH } },
      contours: slice.map((time) => ({ time })),
      polygons: true,
      denoise: 0.2,
      generalize: 10,
    });
    if (response.status !== 200) return response;

    const body = await readJson(response);
    if (isJsonObject(body) && isJsonArray(body.features)) features.push(...body.features);
  }

  return json({ type: "FeatureCollection", features }, 200);
}

/** `POST /api/route { origin, destination }`. Forwards Valhalla's trip JSON. */
async function route(base: string, payload: JsonObject): Promise<Response> {
  const origin = readLatLng(payload.origin);
  const destination = readLatLng(payload.destination);
  if (!origin || !destination) {
    return badRequest("origin and destination must be lat/lngs inside the Richmond area");
  }

  return callValhalla(base, "/route", {
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
  });
}

/**
 * Routes `POST /api/isochrone` and `POST /api/route`. Returns null for paths
 * this proxy does not own so the caller can fall through to static serving.
 *
 * The request is validated before the engine URL is looked up: a malformed
 * request is a client bug whatever the server is configured with, and
 * reporting it as "not configured" sends the reader hunting for the wrong
 * problem. It also means the guards above are exercisable without an engine.
 */
export async function handleApiRequest(request: Request, env: ProxyEnv): Promise<Response | null> {
  const { pathname } = new URL(request.url);
  const isIsochrone = pathname === "/api/isochrone";
  if (!isIsochrone && pathname !== "/api/route") return null;

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
