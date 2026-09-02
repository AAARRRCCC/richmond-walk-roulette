/**
 * The relay's transport: `/ws` upgrades on an existing HTTP server, handed
 * to `createRooms`. Shared by `main.ts` and the Vite dev plugin so `npm run
 * dev` speaks the same socket production does.
 */
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer, type WebSocket } from "ws";
import { CLOSE_BAD_MESSAGE, type RoomSocket, type Rooms } from "./rooms.ts";

/** Cloudflare drops idle sockets on an undocumented timeout (#14); 30 s keeps them alive. */
const PING_INTERVAL_MS = 30_000;
const SWEEP_INTERVAL_MS = 60_000;

/** The one thing the relay needs from a server; Vite hands over an http2 one in dev. */
type UpgradeServer = {
  on(event: "upgrade", listener: (req: IncomingMessage, socket: Duplex, head: Buffer) => void): void;
};

export type Relay = { close(): void };

export type RelayOptions = {
  rooms: Rooms;
  /** Charged one limiter point per upgrade; false refuses before the handshake. */
  charge: (req: IncomingMessage) => Promise<boolean>;
  /** Production destroys any other upgrade; the dev server must leave Vite's HMR socket alone. */
  otherPaths: "destroy" | "ignore";
};

function frameText(data: Buffer | ArrayBuffer | Buffer[]): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  return data.toString("utf8");
}

export function attachRelay(server: UpgradeServer, options: RelayOptions): Relay {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  const alive = new WeakSet<WebSocket>();

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (new URL(req.url ?? "/", "http://walk.internal").pathname !== "/ws") {
      if (options.otherPaths === "destroy") socket.destroy();
      return;
    }
    void options.charge(req).then((allowed) => {
      if (!allowed) {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws));
    });
  });

  wss.on("connection", (ws: WebSocket) => {
    alive.add(ws);
    ws.on("pong", () => alive.add(ws));
    const seat: RoomSocket = ws;
    let joined = false;
    ws.on("message", (data, isBinary) => {
      if (isBinary) {
        ws.close(CLOSE_BAD_MESSAGE, "text frames only");
        return;
      }
      const text = frameText(data);
      if (!joined) {
        const outcome = options.rooms.join(seat, text);
        joined = outcome === "created" || outcome === "joined" || outcome === "reconnected";
        return;
      }
      options.rooms.message(seat, text);
    });
    ws.on("close", () => options.rooms.disconnect(seat));
    ws.on("error", () => options.rooms.disconnect(seat));
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
  const sweeper = setInterval(() => options.rooms.sweep(), SWEEP_INTERVAL_MS);

  return {
    close() {
      clearInterval(pinger);
      clearInterval(sweeper);
      wss.close();
    },
  };
}
