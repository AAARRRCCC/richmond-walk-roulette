import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  initialRoom,
  joinFrame,
  readSocketFrame,
  reduceRoom,
  type PeerFrame,
} from "./room";

/** Policy closes from the relay. Anything else is a transport loss and gets a reconnect. */
const CLOSE_FULL = 4001;
const CLOSE_CLOSED = 4002;
const CLOSE_BAD = 4003;
const CLOSE_REPLACED = 4004;

const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 15_000;

function socketUrl(): string {
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${window.location.host}/ws`;
}

/**
 * The socket behind a room. Joins on mount, reconnects with backoff on a
 * transport loss, never on a 4xxx close. `spin` and `settle` frames go to
 * `onPeer` as they arrive; everything else lands in `state`.
 */
export function useRoom(args: {
  room: string | null;
  token: string;
  onPeer: (frame: PeerFrame) => void;
}) {
  const [state, dispatch] = useReducer(reduceRoom, initialRoom);
  const socketRef = useRef<WebSocket | null>(null);
  const onPeerRef = useRef(args.onPeer);
  useEffect(() => {
    onPeerRef.current = args.onPeer;
  });

  const { room, token } = args;
  useEffect(() => {
    if (room === null) return;
    dispatch({ type: "reset" });
    let closed = false;
    let attempt = 0;
    let timer = 0;

    const connect = (): void => {
      if (closed) return;
      const ws = new WebSocket(socketUrl());
      socketRef.current = ws;
      ws.addEventListener("open", () => ws.send(joinFrame(room, token)));
      ws.addEventListener("message", (event: MessageEvent<unknown>) => {
        // A binary frame stringifies to "[object Blob]" and is dropped as not JSON.
        const frame = readSocketFrame(String(event.data));
        if (frame === null) return;
        switch (frame.t) {
          case "joined":
            attempt = 0;
            dispatch({ type: "joined", peers: frame.peers, expiresInMs: frame.expiresInMs, nowMs: Date.now() });
            return;
          case "full":
            dispatch({ type: "full" });
            return;
          case "closed":
            dispatch({ type: "closed" });
            return;
          case "peer":
            dispatch({ type: "peer", connected: frame.connected, nowMs: Date.now() });
            return;
          case "setup":
            dispatch({ type: "partnerSetup", side: frame.side });
            return;
          case "spin":
          case "settle":
            onPeerRef.current(frame);
            return;
        }
      });
      ws.addEventListener("close", (event: CloseEvent) => {
        if (socketRef.current === ws) socketRef.current = null;
        if (closed) return;
        if (event.code === CLOSE_REPLACED) {
          dispatch({ type: "replaced" });
          return;
        }
        if (event.code === CLOSE_FULL || event.code === CLOSE_CLOSED || event.code === CLOSE_BAD) return;
        dispatch({ type: "lost" });
        // Exponential with jitter; a relay restart brings everyone back at once otherwise.
        const wait = Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * 2 ** attempt) * (0.7 + Math.random() * 0.6);
        attempt += 1;
        timer = window.setTimeout(connect, wait);
      });
    };

    // A backgrounded phone loses its socket silently; coming back should not wait out the backoff.
    const onVisible = (): void => {
      if (document.visibilityState !== "visible" || closed) return;
      if (socketRef.current === null) {
        window.clearTimeout(timer);
        connect();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    connect();

    return () => {
      closed = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      socketRef.current?.close(1000, "leaving");
      socketRef.current = null;
    };
  }, [room, token]);

  /** Dropped when the socket is down: the next join re-asserts setup anyway. */
  const send = useCallback((text: string): void => {
    const ws = socketRef.current;
    if (ws !== null && ws.readyState === WebSocket.OPEN) ws.send(text);
  }, []);

  return { state, send };
}
