/**
 * The process the cluster runs: `node server/main.ts`.
 *
 * Everything with behavior worth testing lives in `app.ts` (requests) and
 * `rooms.ts` (the relay); this file is the wiring that cannot run under
 * `node --test` — the listening socket, the upgrade handshake, the
 * intervals — kept thin enough to be read instead of tested.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import { clientIp, createApp } from "./app.ts";
import { createRooms, CLOSE_BAD_MESSAGE, type RoomSocket } from "./rooms.ts";

const PORT = Number(process.env["PORT"] ?? "8080");
const DIST_DIR = process.env["DIST_DIR"] ?? fileURLToPath(new URL("../dist", import.meta.url));

/**
 * Same cap as the dev proxy in `vite-plugin.ts`, for the same reason: every
 * validation happens after the body is in memory, so the cap has to come
 * first. The biggest legitimate body is well under a kilobyte.
 */
const MAX_BODY_BYTES = 256 * 1024;

/**
 * The 30-second application-level keepalive (#14): Cloudflare closes idle
 * WebSockets on an undocumented timeout, and a server ping is the only
 * reliable answer. It doubles as the dead-transport detector — a socket
 * that missed a whole interval's pong is terminated, which is what turns a
 * silently dropped phone into the partner's "reconnecting…" state.
 */
const PING_INTERVAL_MS = 30_000;

/** How often expired rooms are swept. Precision here buys nothing. */
const SWEEP_INTERVAL_MS = 60_000;

const app = await createApp({
  distDir: DIST_DIR,
  env: {
    VALHALLA_URL: process.env["VALHALLA_URL"],
    VALHALLA_MAX_CONTOURS: process.env["VALHALLA_MAX_CONTOURS"],
    WEATHER_URL: process.env["WEATHER_URL"],
    WALK_TAG: process.env["WALK_TAG"],
  },
});
const rooms = createRooms();

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
      // Past the cap the stream drains rather than buffers, and the null
      // becomes a 413 below.
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
    const request = new Request(`http://walk.internal${req.url ?? "/"}`, {
      method,
      headers,
      body: withBody && body.byteLength > 0 ? new Uint8Array(body) : null,
    });

    const response = await app.handle(request);
    res.statusCode = response.status;
    response.headers.forEach((value, name) => res.setHeader(name, value));
    const answer = Buffer.from(await response.arrayBuffer());
    // Node writes whatever it is handed even on a HEAD; the omission is
    // this server's job, and the content-length stays the GET's.
    if (method === "HEAD") {
      res.setHeader("content-length", String(answer.byteLength));
      res.end();
    } else {
      res.end(answer);
    }
  })().catch((cause: unknown) => {
    // The cause can carry filesystem paths and the engine's URL; it belongs
    // in the pod log, not in a response body.
    console.error("[server] request failed", cause);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json; charset=utf-8");
    }
    res.end(JSON.stringify({ error: "server failed" }));
  });
});

/**
 * The relay's transport. `noServer` because the upgrade must pass through
 * the path check first: `/ws` is the only socket this process speaks.
 */
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

/** `ws` hands frames over in three shapes; the relay speaks strings. */
function frameText(data: Buffer | ArrayBuffer | Buffer[]): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  return data.toString("utf8");
}

/** Sockets that answered the last ping. Entries leave with the socket. */
const alive = new WeakSet<WebSocket>();

server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
  if (new URL(req.url ?? "/", "http://walk.internal").pathname !== "/ws") {
    socket.destroy();
    return;
  }
  // The join path is covered by the same limiter as /api (#14): one point
  // per upgrade, refused with a plain close before the handshake.
  const forwarded = req.headers["x-forwarded-for"];
  const ip = clientIp(Array.isArray(forwarded) ? forwarded[0] : forwarded);
  void app.charge(ip).then((allowed) => {
    if (!allowed) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
  });
});

wss.on("connection", (ws: WebSocket) => {
  alive.add(ws);
  ws.on("pong", () => {
    alive.add(ws);
  });

  // The seat the relay sees. `ws.send` never throws for a closed socket
  // (it errors async), so the RoomSocket contract holds without wrapping.
  const seat: RoomSocket = ws;

  let joined = false;
  ws.on("message", (data, isBinary) => {
    if (isBinary) {
      ws.close(CLOSE_BAD_MESSAGE, "text frames only");
      return;
    }
    const text = frameText(data);
    if (!joined) {
      const outcome = rooms.join(seat, text);
      joined = outcome === "created" || outcome === "joined" || outcome === "reconnected";
      return;
    }
    rooms.message(seat, text);
  });
  ws.on("close", () => rooms.disconnect(seat));
  ws.on("error", () => rooms.disconnect(seat));
});

const pinger = setInterval(() => {
  for (const ws of wss.clients) {
    if (!alive.has(ws)) {
      ws.terminate();
      continue;
    }
    alive.delete(ws);
    ws.ping();
  }
}, PING_INTERVAL_MS);

const sweeper = setInterval(() => rooms.sweep(), SWEEP_INTERVAL_MS);

server.listen(PORT, () => {
  console.log(
    JSON.stringify({ at: "boot", port: PORT, tag: process.env["WALK_TAG"] ?? "dev", dist: DIST_DIR }),
  );
});

/** Probes get their failure fast; k8s restarts are the recovery story. */
process.on("SIGTERM", () => {
  clearInterval(pinger);
  clearInterval(sweeper);
  wss.close();
  server.close(() => process.exit(0));
});
