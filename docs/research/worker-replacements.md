# What replaces the Worker's platform features on k3s

Research for [#11](https://github.com/AAARRRCCC/richmond-walk-roulette/issues/11). The
production runtime is moving from a Cloudflare Worker to a Node service on a k3s
cluster with traefik as the ingress and cert-manager for TLS. `server/proxy.ts` is
already runtime-agnostic — plain `Request`/`Response`, mounted identically by the Vite
dev server and the Worker — so it moves as-is. What needs replacing is the ~150 lines
of orchestration in `worker/index.ts` that lean on three Workers-only platform
features: the `[[unsafe.bindings]]` rate-limit binding, the `caches.open()` edge
cache, and `HTMLRewriter`. This note evaluates the credible replacements for each
against primary sources and ends each section with one recommendation.

A framing fact that matters for all three: every one of these features was
**per-Cloudflare-data-center**, not global. The rate-limit binding keeps "a unique
limit per Cloudflare location" ([Workers rate-limiting binding docs](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)),
and the Cache API's "cache contents do not replicate outside of the originating data
center" ([Workers Cache API docs](https://developers.cloudflare.com/workers/runtime-apis/cache/)).
A single Node process replacing them is not a downgrade from "global" to "local"; it
is a move from many small independent scopes to one shared one, which for a
one-city app is strictly warmer.

## 1. The rate limit on `/api/*`

### What the Worker actually does

`wrangler.toml` declares `[[unsafe.bindings]] type = "ratelimit"` with
`simple = { limit = 240, period = 60 }`, and `worker/index.ts` (lines 372–393) charges
it per client IP (`cf-connecting-ip`) — but not per request. The unit is **one
upstream graph expansion**: an isochrone request is charged
`isochroneQueryCost` = `ceil(minutes / max_contours)` calls against the binding (up
to `MAX_UPSTREAM_QUERIES = 30`), because "that is what stops a scraper from simply
choosing the expensive endpoint" (wrangler.toml's own comment). Two orderings are
load-bearing:

- **The cache is consulted before the limiter is charged**, and a hit costs 1 — the
  charge is meant to be what the request costs the engine, and a hit costs it
  nothing (`worker/index.ts` lines 356–370, 384).
- **The 429 carries a `Retry-After` of 60–65 s (window + jitter)**, which must match
  the binding's `period`: "a shorter hint makes the client retry inside the same
  window, burn its attempts and fail" (`worker/index.ts` lines 49–56). The client's
  retry loop widens the jitter and caps the wait at 70 s, so the hint's range is
  part of the client contract, not a nicety.

The binding itself is coarse: `limit({ key })` takes no weight argument (hence the
`Promise.all` of N calls), `period` "must be either 10 or 60" seconds, and the limit
is scoped per Cloudflare location ([Cloudflare docs](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)).

### Candidate: traefik's RateLimit middleware

Traefik ships a `rateLimit` HTTP middleware in open source: a token bucket where
"the `average` and `period` parameters define the rate at which the bucket refills,
and the `burst` is the size (volume) of the bucket", with `sourceCriterion.ipStrategy`
(`depth`, `excludedIPs`, `ipv6Subnet`) to pick the client IP out of
`X-Forwarded-For` ([traefik RateLimit reference](https://doc.traefik.io/traefik/reference/routing-configuration/http/middlewares/ratelimit/)).
By default the counters are in-memory per traefik instance; since v3.4 a `redis`
block makes them cluster-wide ([same page](https://doc.traefik.io/traefik/reference/routing-configuration/http/middlewares/ratelimit/);
[Traefik 3.4 release coverage](https://linuxiac.com/traefik-proxy-3-4-debuts-with-distributed-rate-limiting-and-smarter-load-balancing/)).
On k3s with one traefik replica, in-memory is fine and Redis is unnecessary.

When the limit trips, traefik answers 429 and does set the header the client needs:
`w.Header().Set("Retry-After", fmt.Sprintf("%.0f", math.Ceil(delay.Seconds())))`
([traefik source, `pkg/middlewares/ratelimiter/rate_limiter.go`](https://github.com/traefik/traefik/blob/master/pkg/middlewares/ratelimiter/rate_limiter.go)).
Requests inside `maxDelay` are slept rather than rejected, which is a smoothing
behavior the Worker never had — harmless here.

What traefik **cannot** do is the two load-bearing orderings above. It counts
requests, not graph expansions: it cannot read a POST body, compute
`ceil(minutes / max_contours)`, and charge 24 tokens for one request. And it runs
before the Node process, so it cannot know a request is about to be a cache hit
and charge it 1 instead. A traefik-only limit set at 240/min would let a scraper
send 240 full ladders a minute — 5,760 stock-limit graph expansions, the exact
inflation the weighted charge exists to prevent; set low enough to stop that, it
would throttle honest warm-ups.

### Candidate: in-process limiting in the Node server

[rate-limiter-flexible](https://github.com/animir/node-rate-limiter-flexible) is the
established Node library for exactly this shape: `RateLimiterMemory` with a
points-based `consume(key, points)` where one call can consume multiple points —
weighted costs are a first-class example in its README (`consume(remoteAddress, 2)`).
The rejection carries `msBeforeNext`, from which the proxy can derive the same
jittered `Retry-After` contract. It runs in-process (README: "Average request takes
0.7ms in Cluster"), needs no store for a single pod, and has Redis/Memcached/
Postgres backends plus an "Insurance Strategy" fallback if the service ever runs
more than one replica ([README](https://github.com/animir/node-rate-limiter-flexible)).

Porting is nearly mechanical: the `Promise.all` of N `limit({ key: ip })` calls
becomes one `consume(ip, cost)` — and becomes *atomic*, which the N parallel binding
calls never were. The cache-before-charge ordering and the 60–65 s `Retry-After`
survive untouched because they live in code this repo already owns.

One deployment prerequisite for any IP-keyed limiter behind traefik: the Node
process keys on `X-Forwarded-For`, which traefik appends the client's `RemoteAddr`
to by default ([traefik entrypoints reference](https://doc.traefik.io/traefik/reference/install-configuration/entrypoints/),
`forwardedHeaders.notAppendXForwardedFor`), and traefik itself must see a real
client address: the k8s default `externalTrafficPolicy: Cluster` "obscures the
client source IP", while `Local` "preserves the client source IP"
([Kubernetes docs](https://kubernetes.io/docs/tasks/access-application-cluster/create-external-load-balancer/)).
k3s ships its LoadBalancer traffic through klipper-lb, so this is worth verifying
with a one-line log of the resolved key at deploy time, whatever the limiter.

### Recommendation

**In-process `rate-limiter-flexible` carries the policy; a loose traefik
`rateLimit` in front is an optional blunt backstop.** The weighted charge, the
cache-hit discount, and the `Retry-After` contract are the rate limit — they can
only live where the body is parsed and the cache is visible, which is the Node
process. `RateLimiterMemory` with `points: 240, duration: 60` keyed on the resolved
client IP reproduces `wrangler.toml` exactly, and `consume(ip, cost)` replaces the
binding's N-call workaround with something strictly better. If a traefik `rateLimit`
is layered in front, set it well above the honest ceiling (it is protection for the
Node process against raw floods, not policy) so it can never fire before the
in-process limiter does.

## 2. The edge cache for `/api` answers

### What the Worker actually does

Not `caches.default`, in fact: two **named** caches via `caches.open()` —
`walk-roulette-isochrone` for the four API endpoints and `walk-roulette-share` for
rendered `/s` documents (`worker/index.ts` lines 93, 229–239). The design is a
POST-answer cache wearing HTTP-cache clothes: the cacheable endpoints are POSTs, so
`server/proxy.ts` builds **canonical synthetic GET keys** from the request body —
`isochroneCacheKey` (5-decimal origin + normalised minute list + version segment
carrying the walking speed), `routeCacheKey`, `locateCacheKey` (4 decimals, an
anti-mint bound: ~5 million possible keys instead of 10^10), `weatherCacheKey` (one
constant key, null for any query string). TTLs: isochrone 1 day, route 7 days,
locate 30 days, weather 900 s, share HTML 1 hour. Two guards matter: a partial
ladder (`x-ladder-dropped`) is never stored, and the copy handed to the browser is
always `no-store` — the entry exists for the *next visitor*, not the same browser.

### Candidate: HTTP `Cache-Control` plus a caching layer

This is the weakest fit, for a structural reason: per RFC 9111 the cache key "is
composed from, at a minimum, the request method and target URI", and "many HTTP
caches in common use today only cache GET responses and therefore only use the URI
as the cache key" ([RFC 9111 §2](https://httpwg.org/specs/rfc9111.html)). These
entries are answers to POSTs whose identity lives in the body — a generic HTTP
cache cannot key them without re-inventing the synthetic-GET trick outside the
process that knows how to build the key. Traefik OSS ships no cache middleware at
all — the [middleware overview](https://doc.traefik.io/traefik/reference/routing-configuration/http/middlewares/overview/)
lists 25 and none cache. [Souin](https://github.com/darkweak/souin) exists as a
traefik plugin (RFC-7234-compliant, can be configured to key on bodies), but wiring
it to reproduce version segments, the walking-speed key component, the
ladder-dropped refusal, and the 4-decimal locate rounding means moving app policy
into ingress config — and it would sit on the wrong side of the limiter, breaking
"a hit costs 1".

### Candidate: dropping the cache

Valhalla is ~36 ms away in-cluster, so the network argument for caching is gone.
But the network was never the cost. The repo's own accounting: one ladder is the
engine's "most expensive operation" repeated — `ceil(96 / max_contours)` graph
expansions, ~1.7 MB of contours, bounded at `MAX_UPSTREAM_QUERIES = 30` per request
precisely because the cost is engine CPU (`server/proxy.ts` lines 80–92,
`wrangler.toml` comments). A 100-minute pedestrian isochrone "genuinely takes
seconds" (`server/proxy.ts` line 95). Proximity makes a cache *miss* cheaper; it
does nothing for what a warm entry saves. Weather is the other keeper: the 900 s
TTL matches Open-Meteo's own `current.interval` and is what turns every visitor
into one upstream call per refresh — a courtesy to a free API, not a latency
optimisation. Route and locate answers are the only defensible drops (each is one
cheap expansion), but they cost almost nothing to keep.

### Candidate: in-process LRU

[lru-cache](https://github.com/isaacs/node-lru-cache) (isaacs, v11, actively
maintained) covers every requirement the edge cache actually exercised: `max` for
entry-count bounds, `maxSize` + `sizeCalculation` for "a safe limit on the maximum
storage consumed" — essential when one isochrone entry is ~1.7 MB — and per-cache
`ttl` (lazily evicted unless `ttlAutopurge`, which is fine: a stale hit is checked
on read) ([README](https://github.com/isaacs/node-lru-cache)). The existing key
strings become `Map` keys verbatim; the versioned-key invalidation story
(`CACHE_VERSION`, `ROUTE_CACHE_VERSION`, walking speed in the key) transfers
unchanged. Its `fetchMethod` also offers request coalescing — concurrent misses on
one key deduplicated into one upstream call — which the edge cache never had and
which is worth having when the expensive operation is 24 sequential expansions.

### Recommendation

**In-process `lru-cache`, one instance per named cache, keyed by the existing key
strings; no external caching layer.** Byte-bound the isochrone cache with
`maxSize`/`sizeCalculation` (a few hundred MB holds a city's worth of warm
ladders), entry-count-bound the small ones, carry each TTL over as `ttl`, and keep
the two guards (ladder-dropped never stored; browser copy `no-store`) exactly where
they are. The `hit costs 1` limiter ordering survives because cache and limiter now
share a process. Per-pod scope is acceptable at one replica — and one warm process
beats Cloudflare's many independently-cold colos for this app's traffic. Drop
nothing: route/locate/weather entries are nearly free and keep the engine and
Open-Meteo quiet.

## 3. `HTMLRewriter` on `/s` share pages

### What the Worker actually does

`shareResponse` (`worker/index.ts` lines 119–179) fetches the app's own built
`index.html` and rewrites seven things in the head: `<title>` inner content, and the
`content`/`href` attributes of `meta[name="description"]`, `og:title`,
`og:description`, `og:url`, `og:image`, and `link[rel="canonical"]` — values from
`shareMeta` (`server/share-meta.ts`), computed per query at request time. Two facts
shrink the problem: the Worker already **buffers** the rewritten document
("Buffered rather than streamed, which costs HTMLRewriter's famous property and is
the right trade for a 2 KB head", lines 157–160), so streaming fidelity is not
something a replacement must preserve; and the null path ("serve the app's document
unmodified") is a designed degradation, not an error.

### Candidates

- **A ported HTMLRewriter.** `HTMLRewriter` is a Workers-runtime API
  ([Cloudflare docs](https://developers.cloudflare.com/workers/runtime-apis/html-rewriter/)).
  The Node port, [html-rewriter-wasm](https://github.com/mrbbot/html-rewriter-wasm)
  (lol-html compiled to WASM, built for Miniflare), last published **0.4.1 in
  February 2022** ([npm registry](https://registry.npmjs.org/html-rewriter-wasm)).
  A four-years-stale WASM dependency to keep six method calls API-compatible is a
  bad trade.
- **A real HTML parser.** [cheerio](https://github.com/cheeriojs/cheerio) ("the
  fast, flexible, and elegant library for parsing and manipulating HTML and XML",
  parse5-backed, actively maintained) does this robustly. It is the right answer if
  the head were third-party or unpredictable. It is neither: `index.html` lives in
  this repo, one directory up from the server that would parse it.
- **A build-time templating step.** Cannot do this job alone: the values are
  per-spin, derived from `decodeShare(url.search)` at request time — a crawler
  fetching `/s?place=X` and `/s?place=Y` must get different documents from the
  same build. Build time can at most guarantee stable anchors for a runtime step.
- **String substitution in the Node server.** Read `dist/index.html` once at
  startup, locate the seven known tags, splice the values in per request. The repo
  owns the file, so the tag shapes are guaranteed by the build — the same
  reasoning the Worker already uses when it declares only the six-method slice of
  HTMLRewriter it needs (`worker/index.ts` lines 22–43).

### Recommendation

**Runtime string substitution in the Node server, verified at boot.** On startup,
read the built `index.html`, find each of the seven anchors, and refuse to start
(or log loudly and permanently fall back to unmodified serving — the existing null
degradation) if any is missing, so a future edit to `index.html` fails the deploy
rather than silently un-unfurling every share link. Two details are load-bearing:
**escape the injected values** — `ShareMeta.url` embeds the canonical query, whose
`&` must become `&amp;` inside an attribute; a parser API did that serialization
for free, `String.replace` does not (and replacement values' `$` patterns need a
function replacement or escaping too); and keep `shareCacheKey` + the share LRU
from section 2, including the "HEAD never fills the cache" guard. Reach for cheerio
only if the head ever stops being repo-owned.

## Summary

| Worker feature | Replacement | Why |
| --- | --- | --- |
| `[[unsafe.bindings]]` ratelimit | `rate-limiter-flexible` in-process (`consume(ip, cost)`), optional loose traefik `rateLimit` backstop | Weighted per-expansion charging and the cache-hit discount can only live where the body and cache are visible; traefik counts requests only |
| `caches.open()` edge cache | `lru-cache` per named cache, byte-bounded, existing keys and TTLs | Entries are POST answers under app-built keys; RFC 9111 caches key on method+URI and mostly cache GET; the cost being saved is engine CPU, which 36 ms of proximity does not touch |
| `HTMLRewriter` on `/s` | String substitution against the built `index.html`, anchors verified at boot, values escaped | The head is repo-owned and already buffered; the Node port is stale (Feb 2022); a parser dependency buys robustness against a drift the boot check catches for free |
