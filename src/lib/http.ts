/**
 * Shared transport for the two proxied endpoints.
 *
 * The point of this module is one distinction: a response that will never
 * succeed (bad request, no route exists) versus one that failed this time
 * (rate limited, upstream hiccup, network drop). Prefetching warms dozens of
 * requests at once and will occasionally trip the Worker's rate limit, so
 * treating a 429 as a final answer would permanently blank a contour or a
 * route for the rest of the session.
 */

import type { Json } from "./json";

export class TransientError extends Error {
  constructor(readonly status: number) {
    super(`Request failed with ${status} after retries.`);
    this.name = "TransientError";
  }
}

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 600;

function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

/** 429 and 5xx are worth retrying. Everything else is the server's final word. */
function isTransient(status: number): boolean {
  return status === 429 || status === 408 || (status >= 500 && status !== 503);
}

/**
 * The cap has to clear the Worker's rate-limit window, currently 60 seconds.
 * Capping below it means every retry lands inside the same window, all three
 * attempts fail, and the contour is lost for no reason. Waiting a minute is
 * not pleasant, but the warm-up runs in the background and a slow contour
 * beats a missing one.
 */
const MAX_BACKOFF_MS = 65_000;

function backoffMs(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  const seconds = header === null ? Number.NaN : Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_BACKOFF_MS);
  }
  // Exponential with jitter, so a burst of parallel retries does not resynchronise.
  return BASE_BACKOFF_MS * 2 ** attempt + Math.random() * 250;
}

/**
 * POSTs JSON, retrying transient failures. Returns the response for the caller
 * to interpret; only exhausted retries and network errors throw.
 */
export async function postJson(url: string, body: Json): Promise<Response> {
  let lastStatus = 0;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      // Network-level failure. Same treatment as a 5xx.
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
