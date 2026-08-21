/**
 * The fake engine and the fake console the server tests run against.
 *
 * Shared by `proxy.test.ts` and `worker.test.ts` because both need the same
 * two things: an upstream that answers whatever the case is about, and a way
 * to read the structured lines the proxy writes to stderr without those lines
 * scrolling through the test output.
 */
import type { TestContext } from "node:test";
import { parseJson, type Json } from "../src/lib/json.ts";

/** The request body the proxy sends upstream; the stub parses it back. */
export type UpstreamBody = {
  contours?: { time: number }[];
  costing?: string;
  costing_options?: Json;
  locations?: Json[];
  units?: string;
  /** Metres, because the proxy pins `units: "kilometers"`. */
  elevation_interval?: number;
  /** `/locate` only, and not optional in practice: every field that endpoint
   *  reads lives in the verbose branch of Valhalla's serialiser. */
  verbose?: boolean;
};

export type Upstream = { url: string; method: string; body: UpstreamBody };

/** Replaces fetch for one test; returns the log of upstream calls. */
export function stubFetch(
  t: TestContext,
  respond: (call: Upstream) => Response | Error,
): Upstream[] {
  const calls: Upstream[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    // Round-tripping through Request normalises every BodyInit the proxy
    // could send into the JSON text it actually sends.
    const request = new Request("http://stub.local", init);
    const sent = await request.text();
    // SAFETY: that body was just serialized by the proxy from the request
    // fields UpstreamBody names and these tests assert on. A GET carries no
    // body at all, which is not JSON and is not meant to be read as any.
    const call: Upstream = {
      url: input instanceof Request ? input.url : String(input),
      method: request.method,
      body: sent === "" ? {} : (parseJson(sent) as UpstreamBody),
    };
    calls.push(call);
    const out = respond(call);
    if (out instanceof Error) throw out;
    return out;
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  return calls;
}

/**
 * Captures `console.error` for one test. The proxy and the Worker both log a
 * structured line per upstream problem, and several cases below are about
 * what that line does and does not carry.
 */
export function stubConsoleError(t: TestContext): string[] {
  const lines: string[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    lines.push(args.map((arg) => String(arg)).join(" "));
  };
  t.after(() => {
    console.error = original;
  });
  return lines;
}

/** Every Cache and CacheStorage method the Worker never reaches for. */
const unused = (): Promise<never> => Promise.reject(new Error("not used by the Worker"));

/**
 * Stands `caches` up for one test, since Node has no edge cache and the
 * Worker's isochrone path is built around one. Returns a map of cache name to
 * that cache's entries, so a test can see what was stored, under which key, and
 * - the part that used to be untestable - in which cache.
 *
 * One Map per name. `open()` previously handed every caller the same Map, which
 * made "the share cache is not the isochrone cache" a claim no test could check:
 * a feature could open the wrong cache by name and every assertion would still
 * pass. `shareable-spins` (chunk 10) opens a cache of its own, and this is what
 * lets it prove it.
 *
 * Every method the Worker does not call rejects rather than pretending: a
 * stub that answers a question the code never asks is a stub that can quietly
 * stop matching the code.
 */
export function stubEdgeCache(t: TestContext): Map<string, Map<string, Response>> {
  const byName = new Map<string, Map<string, Response>>();

  const cacheNamed = (name: string): Cache => {
    let entries = byName.get(name);
    if (entries === undefined) {
      entries = new Map<string, Response>();
      byName.set(name, entries);
    }
    const stored = entries;
    return {
      match: (request) => Promise.resolve(stored.get(new Request(request).url)?.clone()),
      put: (request, response) => {
        stored.set(new Request(request).url, response);
        return Promise.resolve();
      },
      add: unused,
      addAll: unused,
      delete: unused,
      keys: unused,
      matchAll: unused,
    };
  };

  globalThis.caches = {
    open: (name) => Promise.resolve(cacheNamed(name)),
    has: unused,
    delete: unused,
    keys: unused,
    match: unused,
  };
  t.after(() => {
    Reflect.deleteProperty(globalThis, "caches");
  });
  return byName;
}

/**
 * The entries of one named cache. An empty map when nothing was stored there,
 * which is the assertion "this went into some other cache" needs to be able to
 * make without a null check at every call.
 */
export function cacheEntries(
  byName: Map<string, Map<string, Response>>,
  name: string,
): Map<string, Response> {
  return byName.get(name) ?? new Map<string, Response>();
}

/** What fetch rejects with when an `AbortSignal.timeout` fires. */
export function timeoutError(): Error {
  const error = new Error("The operation was aborted due to timeout");
  error.name = "TimeoutError";
  return error;
}

/** A FeatureCollection shaped like Valhalla's, one feature per asked contour. */
export function contourResponse(body: UpstreamBody): Response {
  return Response.json({
    type: "FeatureCollection",
    features: (body.contours ?? []).map(({ time }) => ({
      type: "Feature",
      properties: { contour: time, metric: "time" },
      geometry: { type: "Polygon", coordinates: [[]] },
    })),
  });
}
