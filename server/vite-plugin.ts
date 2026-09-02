import type { Plugin } from "vite";
import { handleApiRequest, type ProxyEnv } from "./proxy";
import { bakeTuning, type BakeResult } from "./bake-tuning.ts";
import { parseJson } from "../src/lib/json.ts";
import { attachRelay } from "./relay.ts";
import { createRooms } from "./rooms.ts";

/**
 * The one route here that is not a proxy. It writes to a source file, so it
 * lives in `configureServer` and nowhere else: there is no build in which
 * this exists.
 */
const BAKE_TUNING_PATH = "/api/dev/bake-tuning";

/**
 * Largest request body the dev proxy will buffer.
 *
 * Everything the proxy validates happens after the body is fully in memory,
 * so without a cap the validation is behind the very thing it protects: one
 * large POST is a heap the dev server never gets back. The biggest legitimate
 * body here is a 120-integer minute array and two lat/lngs, comfortably under
 * a kilobyte, so 256 KB is a bound on abuse rather than on use.
 */
const MAX_BODY_BYTES = 256 * 1024;

/**
 * Mounts the API proxy on the Vite dev server so `npm run dev` hits the same
 * code path as production. The env is passed in from the config's `loadEnv`
 * rather than read from `process.env` at request time, so a restart always
 * picks up the current `.env.local` instead of whatever a previous run left
 * behind on the global.
 */
export function apiProxy(env: ProxyEnv): Plugin {
  return {
    name: "walk-roulette-api-proxy",
    configureServer(server) {
      // The room relay rides the dev server's own HTTP listener, beside
      // Vite's HMR socket, so a room works under `npm run dev` unproxied.
      if (server.httpServer) {
        attachRelay(server.httpServer, {
          rooms: createRooms(),
          charge: () => Promise.resolve(true),
          otherPaths: "ignore",
        });
      }
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();

        const chunks: Buffer[] = [];
        let received = 0;
        // Set the moment this request has an answer, or has stopped being
        // one. "end" does not fire on an aborted or errored request, so
        // without it the buffered chunks and the listeners outlive the
        // socket.
        let settled = false;

        const fail = (status: number, error: string): void => {
          if (settled) return;
          settled = true;
          chunks.length = 0;
          res.statusCode = status;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error }));
        };

        req.on("data", (chunk: Buffer) => {
          // Past the cap the stream is drained rather than buffered, so the
          // connection closes on its own without holding the bytes.
          if (settled) return;
          received += chunk.length;
          if (received > MAX_BODY_BYTES) {
            fail(413, `request body must be under ${MAX_BODY_BYTES} bytes`);
            return;
          }
          chunks.push(chunk);
        });

        req.on("aborted", () => {
          settled = true;
          chunks.length = 0;
        });

        req.on("error", (cause) => {
          console.error("[api-proxy] request stream failed", cause);
          fail(400, "request failed");
        });

        req.on("end", () => {
          if (settled) return;
          settled = true;

          const body = chunks.length > 0 ? Buffer.concat(chunks).toString("utf8") : "";

          if (req.url === BAKE_TUNING_PATH) {
            const answer = (status: number, result: BakeResult): void => {
              res.statusCode = status;
              res.setHeader("content-type", "application/json");
              res.end(JSON.stringify(result));
            };
            bakeTuning(parseJson(body))
              .then((result) => {
                if (result.ok) console.log("[tuning] baked new defaults into src/app/tuning.ts");
                answer(result.ok ? 200 : 400, result);
              })
              .catch((cause: unknown) => {
                console.error("[tuning] could not write defaults", cause);
                answer(500, { ok: false, error: "could not write src/app/tuning.ts" });
              });
            return;
          }

          const request = new Request(`http://localhost${req.url}`, {
            method: req.method ?? "GET",
            headers: { "content-type": req.headers["content-type"] ?? "application/json" },
            body: body.length > 0 ? body : null,
          });

          handleApiRequest(request, env)
            .then(async (response) => {
              if (!response) return next();
              res.statusCode = response.status;
              response.headers.forEach((value, key) => res.setHeader(key, value));
              res.end(await response.text());
            })
            .catch((cause: unknown) => {
              // The cause can carry filesystem paths and the engine's URL.
              // It belongs in the terminal running the dev server, not in a
              // response body.
              console.error("[api-proxy] request failed", cause);
              res.statusCode = 500;
              res.setHeader("content-type", "application/json");
              res.end(JSON.stringify({ error: "proxy failed" }));
            });
        });
      });
    },
  };
}
