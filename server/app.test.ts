/**
 * The Node app server, exercised through `createApp` against a fixture
 * `dist/` on disk — the same seam `worker.test.ts` used, minus the platform
 * fakes it needed: no HTMLRewriter stub, no edge-cache stub, no rate-limit
 * binding. What those proved moves here against the real replacements.
 */
import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { contourResponse, stubConsoleError, stubFetch } from "./test-stubs.ts";
import type { Json } from "../src/lib/json.ts";
import { createApp, clientIp, type AppOptions } from "./app.ts";

/**
 * The head as Vite actually builds it: multi-line tags and all, because the
 * anchor patterns have to survive the real formatting, not a tidied one.
 */
const INDEX_FIXTURE = [
  "<!doctype html><html><head>",
  "<title>Walk Roulette | Richmond</title>",
  '<meta\n  name="description"\n  content="generic"\n/>',
  '<meta property="og:title" content="Walk Roulette | Richmond" />',
  '<meta\n  property="og:description"\n  content="generic"\n/>',
  '<meta property="og:url" content="/" />',
  '<meta property="og:image" content="/og.png" />',
  '<meta property="og:image:width" content="1200" />',
  '<link rel="canonical" />',
  "</head><body></body></html>",
].join("\n");

async function fixtureDist(t: TestContext, indexHtml: string = INDEX_FIXTURE): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "walk-app-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, "index.html"), indexHtml);
  await mkdir(join(dir, "assets"));
  await writeFile(join(dir, "assets", "app-abc123.js"), "console.log('app')");
  return dir;
}

const ENV = { VALHALLA_URL: "http://engine.local:8002" };

async function app(t: TestContext, options: Partial<AppOptions> = {}) {
  return createApp({ distDir: await fixtureDist(t), env: ENV, ...options });
}

const get = (path: string, ip = "203.0.113.7"): Request =>
  new Request(`http://app.local${path}`, { headers: { "x-forwarded-for": ip } });

const post = (path: string, body: Json, ip = "203.0.113.7"): Request =>
  new Request(`http://app.local${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });

const MONROE = { latitude: 37.5464, longitude: -77.4517 };
const SPIN = "?o=carytown&b=34&rt=1&p=shiplock";

test("boot refuses a document missing a share anchor, and names it", async (t) => {
  const broken = INDEX_FIXTURE.replace('<meta property="og:url" content="/" />', "");
  const dir = await fixtureDist(t, broken);
  await assert.rejects(
    () => createApp({ distDir: dir, env: ENV }),
    (error: Error) => error.message.includes('meta[property="og:url"]'),
  );
});

test("/health reports the running tag, uncached", async (t) => {
  const dir = await fixtureDist(t);
  const server = await createApp({ distDir: dir, env: { ...ENV, WALK_TAG: "abc123def456" } });
  const response = await server.handle(get("/health"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { ok: true, tag: "abc123def456" });
});

test("a share link is rewritten with a place-specific head", async (t) => {
  const server = await app(t);
  const response = await server.handle(get(`/s${SPIN}`));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/html; charset=utf-8");

  const html = await response.text();
  assert.match(html, /<title>Great Shiplock Park — inside 34 min<\/title>/);
  assert.match(html, /og:title" content="Great Shiplock Park — inside 34 min"/);
  assert.match(html, /og:description" content="[^"]*Carytown/);
  // The multi-line description tag was replaced, not left beside a new one.
  assert.doesNotMatch(html, /content="generic"/);
  // Absolute, both of them, because a crawler has no base to resolve against.
  assert.match(html, /og:url" content="http:\/\/app\.local\/s\?o=carytown/);
  assert.match(html, /rel="canonical" href="http:\/\/app\.local\/s\?o=carytown/);
  // The neighbours the anchors must not swallow are untouched.
  assert.match(html, /og:image:width" content="1200"/);
});

test("a share link that names nothing serves the document untouched", async (t) => {
  const server = await app(t);
  const response = await server.handle(get("/s?o=carytown&b=34&rt=1&p=gone"));
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>Walk Roulette \| Richmond<\/title>/);
});

test("the document and hashed assets carry their own cache policies", async (t) => {
  const server = await app(t);

  const document = await server.handle(get("/"));
  assert.equal(document.status, 200);
  assert.equal(document.headers.get("cache-control"), "no-cache");
  assert.match(await document.text(), /<title>Walk Roulette/);

  const asset = await server.handle(get("/assets/app-abc123.js"));
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal(asset.headers.get("content-type"), "text/javascript; charset=utf-8");
});

test("a path that walks out of dist is a 404, encoded or not", async (t) => {
  const server = await app(t);
  for (const path of ["/%2e%2e%2fpackage.json", "/assets/%2e%2e/%2e%2e/package.json"]) {
    const response = await server.handle(get(path));
    assert.equal(response.status, 404, path);
  }
});

test("a missing asset is a 404, not the document", async (t) => {
  const server = await app(t);
  const response = await server.handle(get("/assets/gone.js"));
  assert.equal(response.status, 404);
});

test("an isochrone is served from cache on the second ask, one upstream call total", async (t) => {
  stubConsoleError(t);
  const calls = stubFetch(t, (call) => contourResponse(call.body));
  const server = await app(t);
  const body = { location: MONROE, minutes: [5, 10, 15, 20] };

  const first = await server.handle(post("/api/isochrone", body));
  assert.equal(first.status, 200);
  const second = await server.handle(post("/api/isochrone", body));
  assert.equal(second.status, 200);

  assert.equal(calls.length, 1, "the second answer came from the LRU");
  assert.deepEqual(await second.json(), await first.json());
  assert.equal(second.headers.get("cache-control"), "no-store");
});

test("the limiter charges per graph expansion, discounts hits, and answers 429", async (t) => {
  stubConsoleError(t);
  const calls = stubFetch(t, (call) => contourResponse(call.body));
  // Eight minutes against the stock contour limit of 4 costs 2 expansions;
  // a budget of 3 fits one cold ask plus one hit, and refuses the next.
  const server = await app(t, { limit: { points: 3, duration: 60 } });
  const body = { location: MONROE, minutes: [5, 10, 15, 20, 25, 30, 35, 40] };

  assert.equal((await server.handle(post("/api/isochrone", body))).status, 200);
  assert.equal((await server.handle(post("/api/isochrone", body))).status, 200);

  const limited = await server.handle(post("/api/isochrone", body));
  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), { error: "rate-limited" });
  const retryAfter = Number(limited.headers.get("retry-after"));
  assert.ok(retryAfter >= 60 && retryAfter <= 65, `retry-after ${retryAfter}`);
  assert.equal(calls.length, 2, "chunked once upstream, then never again");
});

test("the budget is per forwarded client, not per process", async (t) => {
  stubConsoleError(t);
  stubFetch(t, (call) => contourResponse(call.body));
  const server = await app(t, { limit: { points: 1, duration: 60 } });

  const first = await server.handle(post("/api/weather/here", null, "198.51.100.1"));
  const second = await server.handle(post("/api/weather/here", null, "198.51.100.2"));
  const exhausted = await server.handle(post("/api/weather/here", null, "198.51.100.1"));
  // Distinct clients each got their point; the repeat client is refused.
  assert.notEqual(first.status, 429);
  assert.notEqual(second.status, 429);
  assert.equal(exhausted.status, 429);
});

test("the ws join path draws from the same budget", async (t) => {
  const server = await app(t, { limit: { points: 2, duration: 60 } });
  assert.equal(await server.charge("198.51.100.9"), true);
  assert.equal(await server.charge("198.51.100.9"), true);
  assert.equal(await server.charge("198.51.100.9"), false);
  assert.equal(await server.charge("198.51.100.10"), true, "a different client is not caught");
});

test("clientIp takes the first hop and folds absence into one bucket", () => {
  assert.equal(clientIp("198.51.100.7"), "198.51.100.7");
  assert.equal(clientIp("198.51.100.7, 10.0.0.2"), "198.51.100.7");
  assert.equal(clientIp(null), "unknown");
  assert.equal(clientIp("  "), "unknown");
});
