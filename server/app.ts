/**
 * The Worker's replacement: one Node process serving the built app, the
 * `/api` proxy, the `/s` share head and `/health`, with the room relay
 * mounted beside it by `main.ts`.
 *
 * The Worker's three platform pieces land here as the #11 research decided:
 * the edge cache becomes in-process `lru-cache` instances under the existing
 * synthetic keys and TTLs; the rate-limit binding becomes an in-process
 * `rate-limiter-flexible` memory limiter charging the same weighted cost in
 * one atomic `consume`; HTMLRewriter becomes string substitution against the
 * built `index.html`, read once at boot with its anchors verified so a
 * drifted document fails the deploy instead of silently un-unfurling shares.
 *
 * Two #7 corrections live in this file rather than in any manifest: the
 * limiter keys on `X-Forwarded-For` (LAN-only means no Cloudflare in the
 * path, so `CF-Connecting-IP` is absent and every client would hash to the
 * same empty key), and `/health` reports the running image tag, which is
 * what the probes and the "which tag is actually live" check both read.
 */
import { readFile } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import { LRUCache } from "lru-cache";
import { RateLimiterMemory } from "rate-limiter-flexible";
import {
  handleApiRequest,
  isochroneCacheKey,
  isochroneQueryCost,
  locateCacheKey,
  routeCacheKey,
  weatherCacheKey,
  LADDER_DROPPED_HEADER,
  WEATHER_REFRESH_SECONDS,
  type ProxyEnv,
} from "./proxy.ts";
import { readJson, type Json } from "../src/lib/json.ts";
import { shareCacheKey, shareMeta } from "./share-meta.ts";
import { injectMeta, missingAnchors } from "./inject-meta.ts";
import { SHARE_PATH } from "../src/app/share.ts";

/**
 * Cache lifetimes, carried over from the Worker verbatim — the reasoning
 * lives with each number in `worker/index.ts` and did not change by moving
 * processes: a ladder outlives a day, a route a week, an anchor a month, a
 * rendered share an hour, and weather exactly its refresh window.
 */
const ISOCHRONE_CACHE_SECONDS = 86_400;
const ROUTE_CACHE_SECONDS = 7 * 86_400;
const LOCATE_CACHE_SECONDS = 30 * 86_400;
const SHARE_HTML_CACHE_SECONDS = 3_600;
const SHARE_CLIENT_CACHE_SECONDS = 300;

/**
 * The isochrone cache is the one that must be byte-bound rather than
 * entry-bound: entries are ~1.7 MB ladders, and an entry count that looked
 * safe would still be a heap number nobody chose. 256 MB holds ~150 origins
 * — every preset and a city of dropped pins — inside the container's memory
 * request with room for the process itself.
 */
const ISOCHRONE_CACHE_BYTES = 256 * 1024 * 1024;

/**
 * The Worker's rate-limit policy, now in-process (#11): 240 points a minute
 * per client, one atomic `consume(ip, cost)` instead of the binding's
 * `Promise.all` of unit calls.
 */
const LIMIT_POINTS = 240;
const LIMIT_DURATION_SECONDS = 60;

/** Matches the Worker: the hint must not retry inside the same window. */
const RETRY_AFTER_SECONDS = 60;
const RETRY_AFTER_JITTER_SECONDS = 5;

const CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".geojson", "application/geo+json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".ico", "image/x-icon"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".woff2", "font/woff2"],
  [".txt", "text/plain; charset=utf-8"],
]);

type AppEnv = ProxyEnv & {
  /** The image tag this process was built from; `/health` reports it. */
  WALK_TAG?: string | undefined;
};

export type AppOptions = {
  /** The built site: `dist/` from `npm run build`. */
  distDir: string;
  env: AppEnv;
  /**
   * Test override for the limiter budget. Production always wants the
   * policy numbers; a test proving the 429 does not want to send 241
   * requests to reach it.
   */
  limit?: { points: number; duration: number };
};

export type App = {
  handle(request: Request): Promise<Response>;
  /**
   * Charges one point against an address and says whether it fit. The `/ws`
   * upgrade path goes through this (#14: the limiter covers the join path)
   * — it cannot go through `handle`, because an upgrade is not a request
   * the fetch model can answer.
   */
  charge(ip: string): Promise<boolean>;
};

/**
 * The client's address, from the first hop of `X-Forwarded-For` — which on
 * this cluster is written by traefik and is trustworthy exactly because the
 * service reaches traefik with `externalTrafficPolicy: Local` (#11's deploy
 * note). "unknown" collapses the clients of a misconfigured ingress into
 * one shared budget, which fails toward protecting the engine.
 */
export function clientIp(forwarded: string | null | undefined): string {
  if (forwarded === null || forwarded === undefined) return "unknown";
  const first = forwarded.split(",", 1)[0]?.trim() ?? "";
  return first === "" ? "unknown" : first;
}

function jsonResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function rateLimited(): Response {
  const retryAfter =
    RETRY_AFTER_SECONDS + Math.floor(Math.random() * (RETRY_AFTER_JITTER_SECONDS + 1));
  return new Response(JSON.stringify({ error: "rate-limited" }), {
    status: 429,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "retry-after": String(retryAfter),
    },
  });
}

/**
 * A Node Buffer under fetch types: `new Uint8Array` copies into a fresh
 * ArrayBuffer, which is what the Response constructor's typing wants. The
 * copy is deliberate — a cached buffer must not share bytes with a body a
 * consumer may transfer.
 */
function toBytes(body: Buffer): Uint8Array<ArrayBuffer> {
  return new Uint8Array(body);
}

/** What the browser gets: a POST answer no browser cache can key. */
function cachedJson(body: Buffer): Response {
  return new Response(toBytes(body), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/**
 * One structured line per non-2xx `/api/*` answer, same shape as the
 * Worker's so the reading habit transfers; `kubectl logs` is the new
 * `wrangler tail`. No country field: nothing upstream attaches one.
 */
function logApiFailure(method: string, path: string, status: number, ms: number): void {
  console.error(JSON.stringify({ at: "api", method, path, status, ms }));
}

type NamedCache = LRUCache<string, Buffer>;

/** The Worker's `EdgeEntry`, re-homed onto an LRU. */
type CacheEntry = {
  hit: Buffer | null;
  fill(response: Response): Promise<Response>;
};

function cacheEntry(
  cache: NamedCache,
  request: Request,
  payload: Json,
  keyFor: (payload: Json, request: Request) => string | null,
): CacheEntry {
  const key = keyFor(payload, request);
  const hit = key === null ? null : (cache.get(key) ?? null);
  return {
    hit,
    async fill(response) {
      if (response.status !== 200) return response;
      // A ladder the engine only partly answered is a truncation, not a
      // cheaper answer; storing it would serve one blip for a day.
      if (response.headers.has(LADDER_DROPPED_HEADER)) return response;
      const body = Buffer.from(await response.arrayBuffer());
      if (key !== null && body.byteLength > 0) cache.set(key, body);
      return cachedJson(body);
    },
  };
}

/**
 * Resolves a URL path inside `distDir`, or null for anything that walks out
 * of it. Decoding happens before normalising, so an encoded `..` is caught
 * by the same containment check as a literal one.
 */
function assetPath(distDir: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const resolved = normalize(join(distDir, decoded));
  if (resolved !== distDir && !resolved.startsWith(distDir + sep)) return null;
  return resolved;
}

/**
 * The static cache policy `dist/_headers` used to hand Workers Assets, now
 * applied by the process itself: reach snapshots and Vite's hashed assets
 * are immutable because their URLs change when their content does; the
 * document revalidates every visit so a tag bump shows up on reload.
 */
function staticCacheControl(pathname: string): string | null {
  if (pathname.startsWith("/reach/") || pathname.startsWith("/assets/")) {
    return "public, max-age=31536000, immutable";
  }
  return null;
}

export async function createApp(options: AppOptions): Promise<App> {
  const distDir = normalize(options.distDir);
  const env = options.env;
  const tag = env.WALK_TAG ?? "dev";

  const indexHtml = await readFile(join(distDir, "index.html"), "utf8");
  const missing = missingAnchors(indexHtml);
  if (missing.length > 0) {
    // Refusing to boot is the point: a share head that cannot be written is
    // a build problem, and the deploy should fail where somebody is looking.
    throw new Error(`dist/index.html is missing share anchors: ${missing.join(", ")}`);
  }

  const limit = options.limit ?? { points: LIMIT_POINTS, duration: LIMIT_DURATION_SECONDS };
  const limiter = new RateLimiterMemory({ points: limit.points, duration: limit.duration });

  const isochroneCache: NamedCache = new LRUCache({
    maxSize: ISOCHRONE_CACHE_BYTES,
    sizeCalculation: (body) => Math.max(1, body.byteLength),
    ttl: ISOCHRONE_CACHE_SECONDS * 1_000,
  });
  const routeCache: NamedCache = new LRUCache({ max: 10_000, ttl: ROUTE_CACHE_SECONDS * 1_000 });
  const locateCache: NamedCache = new LRUCache({ max: 10_000, ttl: LOCATE_CACHE_SECONDS * 1_000 });
  const weatherCache: NamedCache = new LRUCache({ max: 64, ttl: WEATHER_REFRESH_SECONDS * 1_000 });
  const shareCache = new LRUCache<string, string>({ max: 512, ttl: SHARE_HTML_CACHE_SECONDS * 1_000 });

  function shareResponse(request: Request): Response {
    const url = new URL(request.url);
    const meta = shareMeta(url.search, url.origin);
    const headers = {
      "content-type": "text/html; charset=utf-8",
      "cache-control": `public, max-age=${SHARE_CLIENT_CACHE_SECONDS}`,
    };
    // Null is not a failure: the document goes out untouched and the unfurl
    // is the site's own generic card.
    if (meta === null) return new Response(indexHtml, { status: 200, headers });

    const key = shareCacheKey(url.search);
    const cached = key === null ? null : (shareCache.get(key) ?? null);
    if (cached !== null) return new Response(cached, { status: 200, headers });

    const html = injectMeta(indexHtml, meta);
    // GET only, same reason the Worker had: the key is derived from the
    // query, not the method — though here a HEAD renders the same string,
    // so what is being kept out of the cache is only the eviction churn.
    if (key !== null && request.method === "GET") shareCache.set(key, html);
    return new Response(html, { status: 200, headers });
  }

  async function staticResponse(request: Request, pathname: string): Promise<Response> {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return jsonResponse(405, JSON.stringify({ error: "method not allowed" }));
    }
    const target = pathname === "/" ? "/index.html" : pathname;
    const resolved = assetPath(distDir, target);
    if (resolved === null) return jsonResponse(404, JSON.stringify({ error: "not found" }));
    let body: Buffer;
    try {
      body = await readFile(resolved);
    } catch {
      return jsonResponse(404, JSON.stringify({ error: "not found" }));
    }
    const dot = target.lastIndexOf(".");
    const extension = dot === -1 ? "" : target.slice(dot);
    const headers = new Headers({
      "content-type": CONTENT_TYPES.get(extension) ?? "application/octet-stream",
    });
    const cacheControl = target === "/index.html" ? "no-cache" : staticCacheControl(target);
    if (cacheControl !== null) headers.set("cache-control", cacheControl);
    return new Response(toBytes(body), { status: 200, headers });
  }

  async function apiResponse(request: Request, url: URL): Promise<Response> {
    const started = Date.now();
    const isIsochrone = url.pathname === "/api/isochrone";
    const isRoute = url.pathname === "/api/route";
    const isWeather = url.pathname === "/api/weather";
    const isLocate = url.pathname === "/api/locate";

    // Read once and use twice: the ladder's size decides what the request
    // costs the limiter, and its contents decide what it is cached under.
    let payload: Json = null;
    if ((isIsochrone || isRoute || isLocate) && request.method === "POST") {
      payload = await readJson(request.clone()).catch(() => null);
    }

    // Consulted before the limiter is charged, because the charge is meant
    // to be what the request costs the engine and a hit costs it nothing.
    let cache: CacheEntry | null = null;
    if (isIsochrone) {
      cache = cacheEntry(isochroneCache, request, payload, isochroneCacheKey);
    } else if (isRoute) {
      cache = cacheEntry(routeCache, request, payload, routeCacheKey);
    } else if (isLocate) {
      cache = cacheEntry(locateCache, request, payload, locateCacheKey);
    } else if (isWeather) {
      cache = cacheEntry(weatherCache, request, null, weatherCacheKey);
    }

    const cost = cache?.hit ? 1 : isIsochrone ? isochroneQueryCost(payload, env) : 1;
    try {
      await limiter.consume(clientIp(request.headers.get("x-forwarded-for")), cost);
    } catch {
      // rate-limiter-flexible rejects with its own result object, not an
      // Error; either way the answer to the client is the same 429.
      const limited = rateLimited();
      logApiFailure(request.method, url.pathname, limited.status, Date.now() - started);
      return limited;
    }

    if (cache?.hit) return cachedJson(cache.hit);

    const upstream = await handleApiRequest(request, env);
    if (!upstream) return jsonResponse(404, JSON.stringify({ error: "not found" }));
    const response = cache ? await cache.fill(upstream) : upstream;

    if (response.status >= 300) {
      logApiFailure(request.method, url.pathname, response.status, Date.now() - started);
    }
    return response;
  }

  return {
    async handle(request) {
      const url = new URL(request.url);

      if (url.pathname === "/health") {
        return jsonResponse(200, JSON.stringify({ ok: true, tag }));
      }

      // Before the /api/ check, and never through it: /s produces HTML,
      // costs the engine nothing, and is not charged against the limiter.
      if (url.pathname === SHARE_PATH) {
        if (request.method === "GET" || request.method === "HEAD") return shareResponse(request);
        return jsonResponse(405, JSON.stringify({ error: "method not allowed" }));
      }

      if (url.pathname.startsWith("/api/")) return apiResponse(request, url);

      return staticResponse(request, url.pathname);
    },

    async charge(ip) {
      try {
        await limiter.consume(ip, 1);
        return true;
      } catch {
        return false;
      }
    },
  };
}
