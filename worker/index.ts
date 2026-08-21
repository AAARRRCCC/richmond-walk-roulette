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
} from "../server/proxy.ts";
import { readJson, type Json } from "../src/lib/json.ts";
import { shareCacheKey, shareMeta } from "../server/share-meta.ts";
import { SHARE_PATH } from "../src/app/share.ts";

export type Env = ProxyEnv & {
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** Optional binding from `[[unsafe.bindings]] type = "ratelimit"` in wrangler.toml. */
  API_RATE_LIMIT?: { limit(options: { key: string }): Promise<{ success: boolean }> };
};

/**
 * The slice of Cloudflare's HTMLRewriter this Worker uses.
 *
 * Declared rather than depended on: `@cloudflare/workers-types` would be a
 * devDependency for six method signatures, and this repo already declares the
 * one slice of `ExecutionContext` it needs for the same reason. Narrow on
 * purpose - if a later change needs `text` or `comments` handlers, it adds
 * them here and the addition is visible.
 */
type RewriterElement = {
  setInnerContent(content: string): void;
  setAttribute(name: string, value: string): void;
};

type RewriterHandlers = { element(element: RewriterElement): void };

type HtmlRewriter = {
  on(selector: string, handlers: RewriterHandlers): HtmlRewriter;
  transform(response: Response): Response;
};

declare const HTMLRewriter: { new (): HtmlRewriter };

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
 * A single walk keeps longer than a ladder. It is a few hundred bytes rather
 * than a couple of megabytes, and the same handful are asked for by every
 * visitor who picks the same preset, so the hit rate is what makes the engine
 * quiet rather than the size saved.
 */
const ROUTE_CACHE_SECONDS = 7 * 86_400;

/**
 * An anchor keeps a month. It is a property of the graph rather than of a
 * moment - it changes only when tiles are rebuilt, which `CACHE_VERSION`
 * already covers - and the proposer asks for the same few hundred of them every
 * time somebody runs it.
 */
const LOCATE_CACHE_SECONDS = 30 * 86_400;

/**
 * How long the edge keeps a rendered share document, and how long the browser
 * keeps its copy.
 *
 * An hour at the edge because the document is a function of the query and
 * nothing else; five minutes in the browser because a person who reloads a share
 * link is usually reloading it for a reason.
 */
const SHARE_HTML_CACHE_SECONDS = 3_600;
const SHARE_CLIENT_CACHE_SECONDS = 300;

/** Its own cache, so a test can prove it is not the isochrone one. */
export const SHARE_CACHE = "walk-roulette-share";

/**
 * The app's own document.
 *
 * `env.ASSETS.fetch(request)` cannot stand in for this. `not_found_handling`
 * defaults to "none", so a `/s` request matches no asset and comes back **404**
 * - which would turn every one of this feature's careful degradations into a
 * broken link. The URL is "/" and not "/index.html" because `html_handling`
 * defaults to "auto-trailing-slash" and answers the latter with a 307. The
 * method is forced to GET so a crawler's HEAD does not fetch an empty body for
 * the rewriter to work on.
 */
function indexDocument(request: Request, env: Env): Promise<Response> {
  return env.ASSETS.fetch(new Request(new URL("/", request.url), { method: "GET" }));
}

/**
 * `/s`, with the head rewritten for this spin - or null, meaning "serve the
 * app's document unmodified", which is a correct answer rather than a failure.
 *
 * It never calls the engine, never reaches `handleApiRequest`, and is not
 * charged against the rate limiter, because it costs the engine nothing. Abuse
 * control is the query-length cap in `decodeShare`, a canonical cache key, and
 * no cache entry at all for a dropped-pin origin.
 */
async function shareResponse(
  request: Request,
  env: Env,
  ctx: WorkerContext,
): Promise<Response | null> {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  // The type says this is always here and it is not - the same guard
  // `edgeCache()` makes about `caches`.
  if (!("HTMLRewriter" in globalThis)) return null;

  const url = new URL(request.url);
  const meta = shareMeta(url.search, url.origin);
  if (meta === null) return null;

  const key = shareCacheKey(url.search);
  const cache = key === null ? null : await edgeCacheNamed(SHARE_CACHE);
  const cacheKey = cache === null || key === null ? null : new Request(new URL(key, request.url));

  if (cache !== null && cacheKey !== null) {
    const hit = await cache.match(cacheKey);
    if (hit) return shareHtml(await hit.arrayBuffer());
  }

  const asset = await indexDocument(request, env);
  if (asset.status !== 200) return null;

  const rewritten = new HTMLRewriter()
    .on("title", { element: (e) => e.setInnerContent(meta.title) })
    .on('meta[name="description"]', { element: (e) => e.setAttribute("content", meta.description) })
    .on('meta[property="og:title"]', { element: (e) => e.setAttribute("content", meta.title) })
    .on('meta[property="og:description"]', {
      element: (e) => e.setAttribute("content", meta.description),
    })
    .on('meta[property="og:url"]', { element: (e) => e.setAttribute("content", meta.url) })
    .on('meta[property="og:image"]', { element: (e) => e.setAttribute("content", meta.image) })
    .on('link[rel="canonical"]', { element: (e) => e.setAttribute("href", meta.url) })
    .transform(asset);

  // Buffered rather than streamed, which costs HTMLRewriter's famous property
  // and is the right trade for a 2 KB head: one body cannot be both served and
  // stored without it.
  const body = await rewritten.arrayBuffer();

  // **HEAD never fills the cache.** The key is derived from the query, not the
  // method, so a HEAD that stored its empty body would serve an empty document
  // to the next GET of the same spin. Crawlers do issue HEAD.
  if (cache !== null && cacheKey !== null && request.method === "GET") {
    ctx.waitUntil(
      cache.put(
        cacheKey,
        new Response(body, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": `public, max-age=${SHARE_HTML_CACHE_SECONDS}`,
          },
        }),
      ),
    );
  }
  return shareHtml(body);
}

function shareHtml(body: ArrayBuffer): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": `public, max-age=${SHARE_CLIENT_CACHE_SECONDS}`,
    },
  });
}

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
export const ISOCHRONE_CACHE = "walk-roulette-isochrone";

async function edgeCache(): Promise<Cache | null> {
  return edgeCacheNamed(ISOCHRONE_CACHE);
}

/** Any named edge cache, or null where there is not one. */
async function edgeCacheNamed(name: string): Promise<Cache | null> {
  if (!("caches" in globalThis)) return null;
  return globalThis.caches.open(name);
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
type EdgeEntry = {
  /** The stored answer, already found. Null means the edge has nothing. */
  hit: Response | null;
  /** Stores a fresh answer under the same key. A no-op when there is no cache. */
  fill(response: Response, ctx: WorkerContext): Promise<Response>;
};

/**
 * `keyFor` sees the request as well as the body, so a key can refuse to exist
 * for a request that must not be cached at all - a GET endpoint with a query
 * string on it, say, where the body says nothing about what was asked for. The
 * existing key functions take one parameter and stay that way: a narrower
 * function is assignable, so this widening costs no call site anything.
 */
async function edgeEntry(
  request: Request,
  payload: Json,
  keyFor: (payload: Json, request: Request) => string | null,
  seconds: number,
): Promise<EdgeEntry> {
  const key = keyFor(payload, request);
  const cache = key === null ? null : await edgeCache();
  const cacheKey = cache === null || key === null ? null : new Request(new URL(key, request.url));
  const hit = cache && cacheKey ? ((await cache.match(cacheKey)) ?? null) : null;

  return {
    hit: hit ? cachedJson(await hit.arrayBuffer()) : null,
    async fill(response, ctx) {
      if (response.status !== 200) return response;
      // A ladder the engine only partly answered is a truncation, not a
      // cheaper answer. Storing it would serve one blip to every later
      // visitor for a day, indistinguishable from a complete ladder.
      if (response.headers.has(LADDER_DROPPED_HEADER)) return response;

      const body = await response.arrayBuffer();
      if (cache && cacheKey) {
        ctx.waitUntil(
          cache.put(
            cacheKey,
            new Response(body, {
              headers: {
                "content-type": "application/json; charset=utf-8",
                "cache-control": `public, max-age=${seconds}`,
              },
            }),
          ),
        );
      }
      return cachedJson(body);
    },
  };
}

/**
 * What the browser gets either way. The entry the edge keeps is cacheable;
 * this copy is not — for a POST because no browser cache can key one, and for
 * weather because a fifteen-minute forecast held in a private cache outlives
 * its own accuracy.
 *
 * Named for what it carries rather than for contours: three endpoints go
 * through it now and the old name would lie in two of them.
 */
function cachedJson(body: ArrayBuffer): Response {
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

  // Before the /api/ check, and never through it: /s produces HTML, costs the
  // engine nothing, and its fallback is the app's own document rather than
  // `env.ASSETS.fetch(request)`, which for this path is a 404.
  if (url.pathname === SHARE_PATH) {
    return (await shareResponse(request, env, ctx)) ?? (await indexDocument(request, env));
  }

  if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

  const started = Date.now();
  const isIsochrone = url.pathname === "/api/isochrone";

  const isRoute = url.pathname === "/api/route";
  const isWeather = url.pathname === "/api/weather";
  const isLocate = url.pathname === "/api/locate";

  // Read once and use twice: the ladder's size decides what the request costs
  // the limiter, and its contents decide what it is cached under.
  let payload: Json = null;
  if ((isIsochrone || isRoute || isLocate) && request.method === "POST") {
    payload = await readJson(request.clone()).catch(() => null);
  }

  // Consulted before the limiter is charged, because the charge is meant to
  // be what the request costs the engine and a hit costs it nothing.
  let cache: EdgeEntry | null = null;
  if (isIsochrone) {
    cache = await edgeEntry(request, payload, isochroneCacheKey, ISOCHRONE_CACHE_SECONDS);
  } else if (isRoute) {
    cache = await edgeEntry(request, payload, routeCacheKey, ROUTE_CACHE_SECONDS);
  } else if (isLocate) {
    cache = await edgeEntry(request, payload, locateCacheKey, LOCATE_CACHE_SECONDS);
  } else if (isWeather) {
    // The body pre-read above stays POST-only; weather has none. The key
    // refuses to exist for a query string, which is what makes the 400 in the
    // proxy reachable in production rather than only in proxy.test.ts.
    cache = await edgeEntry(request, null, weatherCacheKey, WEATHER_REFRESH_SECONDS);
  }

  const limiter = env.API_RATE_LIMIT;
  if (limiter) {
    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    // The limiter counts client requests; the engine pays per graph
    // expansion, and one ladder against a stock-limit instance is 24 of
    // them. Charging the real cost is what stops a scraper from simply
    // preferring the expensive endpoint. The binding takes no weight
    // argument, so the charge is that many calls against the same key.
    // An answer already at the edge still costs one, so a cache the whole
    // internet can reach is not a way around the limit. Weather costs one
    // because one upstream call serves every visitor to this colo for fifteen
    // minutes.
    const cost = cache?.hit ? 1 : isIsochrone ? isochroneQueryCost(payload, env) : 1;
    const charged = await Promise.all(
      Array.from({ length: cost }, () => limiter.limit({ key: ip })),
    );
    if (charged.some(({ success }) => !success)) {
      const limited = rateLimited();
      logApiFailure(request, url.pathname, limited.status, Date.now() - started);
      return limited;
    }
  }

  if (cache?.hit) return cache.hit;

  const upstream = await handleApiRequest(request, env);
  if (!upstream) return env.ASSETS.fetch(request);
  const response = cache ? await cache.fill(upstream, ctx) : upstream;

  if (response.status >= 300) logApiFailure(request, url.pathname, response.status, Date.now() - started);
  return response;
}

export default { fetch: handleWorkerRequest };
