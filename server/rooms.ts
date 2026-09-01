/**
 * The room relay: the live two-person session behind a meet link.
 *
 * The server's whole role is in CONTEXT.md's glossary line for "Relay": it
 * orders and forwards messages and never computes a pool or picks a winner.
 * The one piece of meaning it holds is serialization — first spin wins, so a
 * `spin` that arrives while another is in flight is dropped rather than
 * forwarded, and the second spinner's client follows the relayed one (#9).
 *
 * State is an in-memory `Map` and nothing else (#8): the 12-hour clock lives
 * in server memory, a restart extends a room's life by up to 12 hours
 * (accepted — clients re-assert their own state on rejoin, so a restart is a
 * reconnect blip rather than "room closed"), and an expired room leaves a
 * tombstone so a stale link reads "room closed" instead of quietly minting a
 * fresh empty room under the old id.
 *
 * This module never imports `ws`: a socket is anything that can `send` and
 * `close`, which is what lets every path here run under `node --test` with a
 * recording fake.
 */
import { isJsonObject, isString, parseJson, type Json } from "../src/lib/json.ts";

/**
 * `parseJson` throws on garbage, and garbage is a state this module handles
 * rather than a bug: a frame that is not JSON reads as null, which every
 * caller already treats as "not a message I understand".
 */
function readFrame(text: string): Json {
  try {
    return parseJson(text);
  } catch {
    return null;
  }
}

/** How long a room lives from the moment its id first opens it. */
export const ROOM_TTL_MS = 12 * 60 * 60 * 1_000;

/**
 * How long a closed room's tombstone survives. As long as a room's own life:
 * by then the link is a day old against a 12-hour promise, and an id is
 * minted, never recycled, so nothing honest comes asking.
 */
const TOMBSTONE_TTL_MS = ROOM_TTL_MS;

/**
 * A room id is 8 Crockford base32 characters (#14): no I, L, O or U, case
 * folded on arrival. 40 bits is deliberately short of unguessable — the id
 * is a credential, and rate limiting on the join path is the real control.
 */
const ROOM_ID = /^[0-9A-HJKMNP-TV-Z]{8}$/;

/**
 * A device token names a seat (glossary: same token = the same walker back
 * again; a third token = a third wheel). Client-minted, so the shape is a
 * bound on garbage rather than a format the server assigns.
 */
const DEVICE_TOKEN = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * Largest client frame the relay will forward. Room traffic is settled
 * setup, a winner id and presence — hundreds of bytes; the biggest honest
 * message is a full-precision origin pair. 16 KB bounds abuse, not use.
 */
export const MAX_MESSAGE_BYTES = 16 * 1024;

/** The socket surface the relay needs. `ws` satisfies it; so does a fake. */
export type RoomSocket = {
  send(data: string): void;
  close(code?: number, reason?: string): void;
};

type Seat = {
  token: string;
  /** Null between a disconnect and the same token's return. */
  socket: RoomSocket | null;
};

type Room = {
  id: string;
  expiresAt: number;
  /** In join order; index 0 spoke first. Never more than two. */
  seats: Seat[];
  /** Token holding the spin lock, or null when no spin is in flight. */
  spinningToken: string | null;
};

/** What `join` did, so the socket layer can react without re-deriving it. */
type JoinOutcome = "created" | "joined" | "reconnected" | "full" | "closed" | "rejected";

/**
 * Close codes in the 4000-4999 application range, so the client can tell a
 * policy close from a transport loss and skip its reconnect loop.
 */
export const CLOSE_ROOM_FULL = 4001;
export const CLOSE_ROOM_CLOSED = 4002;
export const CLOSE_BAD_MESSAGE = 4003;
export const CLOSE_REPLACED = 4004;

export type Rooms = {
  /**
   * The first message on every socket. Anything but a well-formed join —
   * bad id, bad token, not JSON — closes the socket; a full or closed room
   * answers with its own message before closing so the client can render
   * the right screen.
   */
  join(socket: RoomSocket, text: string): JoinOutcome;
  /** Every message after the join: relay, in arrival order. */
  message(socket: RoomSocket, text: string): void;
  /** The transport is gone. The seat survives; the partner hears about it. */
  disconnect(socket: RoomSocket): void;
  /** Expires rooms whose clock has run out. Call on an interval. */
  sweep(): void;
  /** Live room count, for the health line. */
  size(): number;
};

/** JSON the relay writes itself, as one place to keep the vocabulary. */
function frame(t: string, rest: Record<string, string | number | boolean> = {}): string {
  return JSON.stringify({ t, ...rest });
}

/** A send can race a close; a seat that cannot hear just misses the message. */
function say(socket: RoomSocket | null, data: string): void {
  try {
    socket?.send(data);
  } catch {
    // The disconnect handler owns the seat's socket field; here the message
    // is simply lost, and the client re-asserts its state on reconnect.
  }
}

function partnerOf(room: Room, token: string): Seat | null {
  return room.seats.find((seat) => seat.token !== token) ?? null;
}

function hangUp(socket: RoomSocket | null, code: number, reason: string): void {
  try {
    socket?.close(code, reason);
  } catch {
    // Already gone.
  }
}

export function createRooms(now: () => number = Date.now): Rooms {
  const rooms = new Map<string, Room>();
  /** Room id -> when it closed. */
  const tombstones = new Map<string, number>();
  const memberships = new Map<RoomSocket, { room: Room; seat: Seat }>();

  function closeRoom(room: Room): void {
    for (const seat of room.seats) {
      say(seat.socket, frame("closed"));
      hangUp(seat.socket, CLOSE_ROOM_CLOSED, "room closed");
      if (seat.socket) memberships.delete(seat.socket);
      seat.socket = null;
    }
    rooms.delete(room.id);
    tombstones.set(room.id, now());
  }

  function disconnect(socket: RoomSocket): void {
    const membership = memberships.get(socket);
    if (!membership) return;
    memberships.delete(socket);
    const { room, seat } = membership;
    if (seat.socket !== socket) return; // A reconnect already took the seat.
    seat.socket = null;
    // A spinner that vanishes mid-spin must not wedge the room shut.
    if (room.spinningToken === seat.token) room.spinningToken = null;
    const partner = partnerOf(room, seat.token);
    if (partner) say(partner.socket, frame("peer", { connected: false }));
  }

  function join(socket: RoomSocket, text: string): JoinOutcome {
    const message = readFrame(text);
    if (!isJsonObject(message) || message["t"] !== "join") {
      hangUp(socket, CLOSE_BAD_MESSAGE, "expected a join");
      return "rejected";
    }
    const rawRoom = message["room"];
    const token = message["token"];
    if (!isString(rawRoom) || !isString(token) || !DEVICE_TOKEN.test(token)) {
      hangUp(socket, CLOSE_BAD_MESSAGE, "malformed join");
      return "rejected";
    }
    const id = rawRoom.toUpperCase();
    if (!ROOM_ID.test(id)) {
      hangUp(socket, CLOSE_BAD_MESSAGE, "malformed join");
      return "rejected";
    }

    if (tombstones.has(id)) {
      say(socket, frame("closed"));
      hangUp(socket, CLOSE_ROOM_CLOSED, "room closed");
      return "closed";
    }

    let room = rooms.get(id);
    let outcome: JoinOutcome;
    if (!room) {
      room = { id, expiresAt: now() + ROOM_TTL_MS, seats: [], spinningToken: null };
      rooms.set(id, room);
      outcome = "created";
    } else {
      outcome = "joined";
    }

    const existing = room.seats.find((seat) => seat.token === token);
    if (existing) {
      // Same token: the same walker back again. The old transport, if any,
      // is replaced rather than doubled — one seat never speaks twice.
      if (existing.socket && existing.socket !== socket) {
        memberships.delete(existing.socket);
        hangUp(existing.socket, CLOSE_REPLACED, "replaced by a reconnect");
      }
      existing.socket = socket;
      memberships.set(socket, { room, seat: existing });
      outcome = "reconnected";
    } else if (room.seats.length >= 2) {
      // A third device. The client renders "this room already has two
      // walkers" with its solo escape hatch (#10); the relay only names
      // the fact.
      say(socket, frame("full"));
      hangUp(socket, CLOSE_ROOM_FULL, "room is full");
      return "full";
    } else {
      const seat: Seat = { token, socket };
      room.seats.push(seat);
      memberships.set(socket, { room, seat });
    }

    const connected = room.seats.filter((seat) => seat.socket !== null).length;
    say(socket, frame("joined", { peers: connected, expiresInMs: Math.max(0, room.expiresAt - now()) }));
    const partner = partnerOf(room, token);
    if (partner) say(partner.socket, frame("peer", { connected: true }));
    return outcome;
  }

  function relay(socket: RoomSocket, text: string): void {
    const membership = memberships.get(socket);
    if (!membership) {
      hangUp(socket, CLOSE_BAD_MESSAGE, "not in a room");
      return;
    }
    if (Buffer.byteLength(text, "utf8") > MAX_MESSAGE_BYTES) {
      hangUp(socket, CLOSE_BAD_MESSAGE, "message too large");
      disconnect(socket);
      return;
    }
    const { room, seat } = membership;
    if (now() >= room.expiresAt) {
      closeRoom(room);
      return;
    }

    // The one read the relay performs on a payload: the spin lock. The
    // payload itself is forwarded verbatim either way — the server never
    // learns what a winner is, only that one is in flight.
    const message = readFrame(text);
    const kind = isJsonObject(message) && isString(message["t"]) ? message["t"] : null;
    if (kind === "spin") {
      if (room.spinningToken !== null && room.spinningToken !== seat.token) {
        // Second spin while one is in flight: first spin wins, this one is
        // dropped, and the losing client follows the relayed winner.
        return;
      }
      room.spinningToken = seat.token;
    } else if (kind === "settle") {
      room.spinningToken = null;
    }

    const partner = partnerOf(room, seat.token);
    if (partner) say(partner.socket, text);
  }

  function sweep(): void {
    const at = now();
    // Deleting the entry under iteration is defined behavior for a Map.
    for (const room of rooms.values()) {
      if (at >= room.expiresAt) closeRoom(room);
    }
    for (const [id, closedAt] of tombstones) {
      if (at - closedAt >= TOMBSTONE_TTL_MS) tombstones.delete(id);
    }
  }

  return { join, message: relay, disconnect, sweep, size: () => rooms.size };
}
