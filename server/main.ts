/**
 * The process the cluster runs: `node server/main.ts`.
 *
 * Everything with behavior worth testing lives in `app.ts` (requests),
 * `rooms.ts` (the relay) and `relay.ts` (its transport); this file is the
 * wiring that cannot run under `node --test`.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { clientIp, createApp } from "./app.ts";
import { attachRelay } from "./relay.ts";
import { createRooms } from "./rooms.ts";

const PORT = Number(process.env["PORT"] ?? "8080");
const DIST_DIR = process.env["DIST_DIR"] ?? fileURLToPath(new URL("../dist", import.meta.url));

/** Same cap as the dev proxy: validation happens after the body is in memory. */
const MAX_BODY_BYTES = 256 * 1024;

const app = await createApp({
  distDir: DIST_DIR,
  env: {
    VALHALLA_URL: process.env["VALHALLA_URL"],
    VALHALLA_MAX_CONTOURS: process.env["VALHALLA_MAX_CONTOURS"],
    WEATHER_URL: process.env["WEATHER_URL"],
    WALK_TAG: process.env["WALK_TAG"],
  },
});

function readBody(req: IncomingMessage): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let received = 0;
    let settled = false;
    const finish = (value: Buffer | null): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    req.on("data", (chunk: Buffer) => {
      if (settled) return;
      received += chunk.length;
      if (received > MAX_BODY_BYTES) {
        chunks.length = 0;
        finish(null);
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => finish(Buffer.concat(chunks)));
    req.on("error", () => finish(Buffer.alloc(0)));
  });
}

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  void (async () => {
    const method = req.method ?? "GET";
    const withBody = method !== "GET" && method !== "HEAD";
    const body = withBody ? await readBody(req) : Buffer.alloc(0);
    if (body === null) {
      res.statusCode = 413;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: `request body must be under ${MAX_BODY_BYTES} bytes` }));
      return;
    }

    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      headers.set(name, Array.isArray(value) ? value.join(", ") : value);
    }
    // Share heads print absolute og:url/og:image, so the origin has to be the
    // one the browser used: traefik's forwarded headers, then Host.
    const proto = headers.get("x-forwarded-proto") ?? "http";
    const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? "walk.internal";
    const request = new Request(`${proto}://${host}${req.url ?? "/"}`, {
      method,
      headers,
      body: withBody && body.byteLength > 0 ? new Uint8Array(body) : null,
    });

    const response = await app.handle(request);
    res.statusCode = response.status;
    response.headers.forEach((value, name) => res.setHeader(name, value));
    const answer = Buffer.from(await response.arrayBuffer());
    // Node writes whatever it is handed even on a HEAD.
    if (method === "HEAD") {
      res.setHeader("content-length", String(answer.byteLength));
      res.end();
    } else {
      res.end(answer);
    }
  })().catch((cause: unknown) => {
    // The cause can carry filesystem paths and the engine's URL; pod log only.
    console.error("[server] request failed", cause);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json; charset=utf-8");
    }
    res.end(JSON.stringify({ error: "server failed" }));
  });
});

const relay = attachRelay(server, {
  rooms: createRooms(),
  // The join path is covered by the same limiter as /api (#14).
  charge: (req) => {
    const forwarded = req.headers["x-forwarded-for"];
    return app.charge(clientIp(Array.isArray(forwarded) ? forwarded[0] : forwarded));
  },
  otherPaths: "destroy",
});

server.listen(PORT, () => {
  console.log(
    JSON.stringify({ at: "boot", port: PORT, tag: process.env["WALK_TAG"] ?? "dev", dist: DIST_DIR }),
  );
});

/** Probes get their failure fast; k8s restarts are the recovery story. */
process.on("SIGTERM", () => {
  relay.close();
  server.close(() => process.exit(0));
});
