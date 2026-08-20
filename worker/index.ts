import {
  handleApiRequest,
  isochroneCacheKey,
  isochroneQueryCost,
  type ProxyEnv,
} from "../server/proxy.ts";
import { readJson, type Json } from "../src/lib/json.ts";

export type Env = ProxyEnv & {
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** Optional binding from `[[unsafe.bindings]] type = "ratelimit"` in wrangler.toml. */
  API_RATE_LIMIT?: { limit(options: { key: string }): Promise<{ success: boolean }> };
};

/** The slice of Cloudflare's ExecutionContext this Worker uses. */
export type WorkerContext = { waitUntil(promise: Promise<unknown>): void };

/**
 * Rate-limit window, seconds. Must match `period` in wrangler.toml: a shorter
 * hint makes the client retry inside the same window, burn its attempts and
 * fail. The jitter is what keeps everything limited in the same instant from
 * waking in the same millisecond and re-bursting together; the client widens
 * it further and caps the wait at 70 s, so the range has to stay under that.
 */
const RETRY_AFTER_SECONDS = 60;
const RETRY_AFTER_JITTER_SECONDS = 5;

/**
 * How long the edge keeps a computed ladder. A day is well inside the life of
 * a tile build, and `isochroneCacheKey` carries a version segment for the
 * rebuild that ends it early.
 */
const ISOCHRONE_CACHE_SECONDS = 86_400;

/**
 * One structured line per non-2xx `/api/*` answer. `wrangler tail` picks it
 * up with no new infrastructure, which is the difference between telling a
 * rate-limit trip from an engine outage with one command and telling them
 * apart by loading the site and reading the visitor-facing notice.
 *
 * Nothing here names the engine or identifies a person beyond the country
 * Cloudflare already attaches to the request.
 */
function logApiFailure(request: Request, path: string, status: number, ms: number): void {
  console.error(
    JSON.stringify({
      at: "api",
      method: request.method,
      path,
      status,
      ms,
      country: request.headers.get("cf-ipcountry") ?? "??",
    }),
  );
}

function rateLimited(): Response {
  const retryAfter = RETRY_AFTER_SECONDS + Math.floor(Math.random() * (RETRY_AFTER_JITTER_SECONDS + 1));
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
 * The edge cache, or null where there is not one — the test harness, and any
 * runtime that is not a Worker. `globalThis.caches` is typed as always
 * present and is not, so this asks before reaching for it.
 */
async function edgeCache(): Promise<Cache | null> {
  if (!("caches" in globalThis)) return null;
  return globalThis.caches.open("walk-roulette-isochrone");
}

/**
 * `/api/isochrone` through the edge cache.
 *
 * A ladder for one origin is deterministic for the life of a tile build,
 * costs the engine its most expensive operation and is about 1.7 MB, which
 * makes it the single most cacheable thing in the system. The POST itself
 * cannot be cached, so the entry is stored under the canonical synthetic GET
 * `isochroneCacheKey` builds. Only a 200 is stored; errors stay `no-store`,
 * and the copy handed back to the browser stays `no-store` too, because the
 * request it is answering was a POST.
 */
async function cachedIsochrone(
  request: Request,
  env: Env,
  ctx: WorkerContext,
  payload: Json,
): Promise<Response | null> {
  const key = isochroneCacheKey(payload);
  const cache = key === null ? null : await edgeCache();
  const cacheKey = cache === null || key === null ? null : new Request(new URL(key, request.url));

  if (cache && cacheKey) {
    const hit = await cache.match(cacheKey);
    if (hit) return contours(await hit.arrayBuffer());
  }

  const response = await handleApiRequest(request, env);
  if (!response || response.status !== 200) return response;

  const body = await response.arrayBuffer();
  if (cache && cacheKey) {
    ctx.waitUntil(
      cache.put(
        cacheKey,
        new Response(body, {
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": `public, max-age=${ISOCHRONE_CACHE_SECONDS}`,
          },
        }),
      ),
    );
  }
  return contours(body);
}

/**
 * What the browser gets either way. The entry the edge keeps is cacheable;
 * this copy is not, because the request it answers is a POST and no browser
 * cache can key one.
 */
function contours(body: ArrayBuffer): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/**
 * The Worker's whole request path, exported so it can be exercised with a
 * fake rate-limit binding and a fake context instead of by deploying and
 * hitting the endpoint 240 times.
 */
export async function handleWorkerRequest(
  request: Request,
  env: Env,
  ctx: WorkerContext,
): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

  const started = Date.now();
  const isIsochrone = url.pathname === "/api/isochrone";

  // Read once and use twice: the ladder's size decides what the request costs
  // the limiter, and its contents decide what it is cached under.
  let payload: Json = null;
  if (isIsochrone && request.method === "POST") {
    payload = await readJson(request.clone()).catch(() => null);
  }

  const limiter = env.API_RATE_LIMIT;
  if (limiter) {
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    // The limiter counts client requests; the engine pays per graph
    // expansion, and one ladder against a stock-limit instance is 24 of
    // them. Charging the real cost is what stops a scraper from simply
    // preferring the expensive endpoint. The binding takes no weight
    // argument, so the charge is that many calls against the same key.
    const cost = isIsochrone ? isochroneQueryCost(payload, env) : 1;
    const charged = await Promise.all(
      Array.from({ length: cost }, () => limiter.limit({ key: ip })),
    );
    if (charged.some(({ success }) => !success)) {
      const limited = rateLimited();
      logApiFailure(request, url.pathname, limited.status, Date.now() - started);
      return limited;
    }
  }

  const response = isIsochrone
    ? await cachedIsochrone(request, env, ctx, payload)
    : await handleApiRequest(request, env);
  if (!response) return env.ASSETS.fetch(request);

  if (response.status >= 300) logApiFailure(request, url.pathname, response.status, Date.now() - started);
  return response;
}

export default { fetch: handleWorkerRequest };
