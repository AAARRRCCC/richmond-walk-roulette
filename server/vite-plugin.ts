import type { Plugin } from "vite";
import { handleApiRequest, type ProxyEnv } from "./proxy";

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
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();

        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          const request = new Request(`http://localhost${req.url}`, {
            method: req.method ?? "GET",
            headers: { "content-type": req.headers["content-type"] ?? "application/json" },
            body: chunks.length > 0 ? Buffer.concat(chunks) : null,
          });

          handleApiRequest(request, env)
            .then(async (response) => {
              if (!response) return next();
              res.statusCode = response.status;
              response.headers.forEach((value, key) => res.setHeader(key, value));
              res.end(await response.text());
            })
            .catch((cause: unknown) => {
              res.statusCode = 500;
              res.setHeader("content-type", "application/json");
              res.end(JSON.stringify({ error: "proxy failed", detail: String(cause) }));
            });
        });
      });
    },
  };
}
