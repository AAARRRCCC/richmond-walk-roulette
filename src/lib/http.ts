/**
 * Shared transport for the proxied endpoints.
 *
 * The point of this module is one distinction: a response that will never
 * succeed (bad request, no route exists) versus one that failed this time
 * (rate limited, upstream hiccup, network drop). Prefetching warms dozens of
 * requests at once and will occasionally trip the Worker's rate limit, so
 * treating a 429 as a final answer would permanently blank a contour or a
 * route for the rest of the session.
 */

import type { Json } from "./json.ts";

class TransientError extends Error {
  // Declared and assigned rather than a constructor parameter property:
  // `node --test` runs these files by stripping types, and a parameter
  // property is syntax it cannot strip, so anything importing this module
  // becomes untestable.
  readonly status: number;

  constructor(status: number) {
    super(`Request failed with ${status} after retries.`);
    this.name = "TransientError";
    this.status = status;
  }
}

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 600;

/**
 * How long one attempt gets before it is abandoned.
 *
 * Without a deadline the only failure this module models is a refused
 * connection: a server that accepts the socket and never answers leaves the
 * warm-up in `status: "loading"` for the life of the tab. The number has to
 * clear the proxy's own ladder budget — 60 s, after which it answers with
 * whatever contours it gathered — or the client would abandon a request the
 * server is about to complete.
 */
const REQUEST_TIMEOUT_MS = 90_000;

function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

/**
 * 429, 408 and 5xx are worth retrying. Everything else is the server's final
 * word — including 503, which the proxy reserves for "VALHALLA_URL is unset"
 * and no amount of waiting configures. An engine that is configured but not
 * answering comes back as 502 or 504, which do retry.
 */
function isTransient(status: number): boolean {
  return status === 429 || status === 408 || (status >= 500 && status !== 503);
}

/**
 * The cap has to clear the Worker's rate-limit window, currently 60 seconds,
 * plus the jitter the Worker adds to its own Retry-After. Capping below that
 * means every retry lands inside the same window, all three attempts fail,
 * and the contour is lost for no reason. Waiting a minute is not pleasant,
 * but the warm-up runs in the background and a slow contour beats a missing
 * one.
 */
const MAX_BACKOFF_MS = 70_000;

/** Spread added to a server-supplied Retry-After, milliseconds. */
const RETRY_AFTER_JITTER_MS = 3_000;

function backoffMs(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  const seconds = header === null ? Number.NaN : Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    // Honour the hint, then spread it. Everything rate-limited in the same
    // instant is handed the same number, so obeying it exactly means every
    // client wakes in the same millisecond and re-bursts together.
    return Math.min(seconds * 1000 + Math.random() * RETRY_AFTER_JITTER_MS, MAX_BACKOFF_MS);
  }
  // Exponential with jitter, so a burst of parallel retries does not resynchronise.
  return BASE_BACKOFF_MS * 2 ** attempt + Math.random() * 250;
}

/**
 * POSTs JSON, retrying transient failures. Returns the response for the caller
 * to interpret; only exhausted retries and network errors throw.
 *
 * `signal` is the caller's own cancellation — an origin that changed while its
 * ladder was still arriving. It is combined with this module's timeout, and an
 * abort through it is rethrown rather than retried: the caller asking to stop
 * is an answer, not a failure.
 */
export async function postJson(
  url: string,
  body: Json,
  options?: { signal?: AbortSignal | undefined },
): Promise<Response> {
  const caller = options?.signal;
  let lastStatus = 0;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: caller ? AbortSignal.any([caller, timeout]) : timeout,
      });
    } catch (cause) {
      if (caller?.aborted === true) throw cause;
      // Network-level failure or a timed-out attempt. Same treatment as a 5xx.
      lastStatus = 0;
      if (attempt === MAX_ATTEMPTS - 1) throw new TransientError(0);
      await sleep(BASE_BACKOFF_MS * 2 ** attempt + Math.random() * 250);
      continue;
    }

    if (!isTransient(response.status)) return response;

    lastStatus = response.status;
    if (attempt === MAX_ATTEMPTS - 1) break;
    await sleep(backoffMs(response, attempt));
  }

  throw new TransientError(lastStatus);
}
