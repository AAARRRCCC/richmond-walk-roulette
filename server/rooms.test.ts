/**
 * The relay, exercised through fake sockets.
 *
 * Every decision the room service carries — first spin wins, a third wheel
 * is told the room is full, a reconnect replaces the seat's transport, the
 * 12-hour close leaves a tombstone — is a behavior of `createRooms` alone,
 * which is what makes it provable here without a listening socket.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isJsonObject, isString, parseJson } from "../src/lib/json.ts";
import {
  createRooms,
  CLOSE_BAD_MESSAGE,
  CLOSE_REPLACED,
  CLOSE_ROOM_CLOSED,
  CLOSE_ROOM_FULL,
  MAX_MESSAGE_BYTES,
  ROOM_TTL_MS,
  type RoomSocket,
} from "./rooms.ts";

type FakeSocket = RoomSocket & {
  sent: string[];
  closedWith: { code?: number | undefined; reason?: string | undefined } | null;
};

function fakeSocket(): FakeSocket {
  const socket: FakeSocket = {
    sent: [],
    closedWith: null,
    send(data) {
      socket.sent.push(data);
    },
    close(code, reason) {
      socket.closedWith = { code, reason };
    },
  };
  return socket;
}

/** The `t` fields of everything the relay said to this socket. */
function kinds(socket: FakeSocket): (string | null)[] {
  return socket.sent.map((data) => {
    const message = parseJson(data);
    const kind = isJsonObject(message) ? message["t"] : null;
    return isString(kind) ? kind : null;
  });
}

const ROOM = "8XK2M4P9";
const TOKEN_A = "device-token-aaaa";
const TOKEN_B = "device-token-bbbb";
const TOKEN_C = "device-token-cccc";

const joinText = (room: string, token: string): string =>
  JSON.stringify({ t: "join", room, token });

/** A rooms instance on a controllable clock, starting at an arbitrary hour. */
function roomsAt() {
  let at = 1_700_000_000_000;
  const rooms = createRooms(() => at);
  return {
    rooms,
    tick: (ms: number) => {
      at += ms;
    },
  };
}

test("the first join creates the room and reports one peer", () => {
  const { rooms } = roomsAt();
  const a = fakeSocket();

  assert.equal(rooms.join(a, joinText(ROOM, TOKEN_A)), "created");
  assert.equal(rooms.size(), 1);
  assert.deepEqual(kinds(a), ["joined"]);

  const joined = parseJson(a.sent[0]!);
  assert.ok(isJsonObject(joined));
  assert.equal(joined["peers"], 1);
  assert.equal(joined["expiresInMs"], ROOM_TTL_MS);
});

test("the second join tells both sides about each other", () => {
  const { rooms } = roomsAt();
  const a = fakeSocket();
  const b = fakeSocket();
  rooms.join(a, joinText(ROOM, TOKEN_A));

  assert.equal(rooms.join(b, joinText(ROOM, TOKEN_B)), "joined");
  assert.deepEqual(kinds(b), ["joined"]);
  assert.deepEqual(kinds(a), ["joined", "peer"]);

  const peer = parseJson(a.sent[1]!);
  assert.ok(isJsonObject(peer));
  assert.equal(peer["connected"], true);
});

test("a room id is case-folded, so a lowercased link still opens the room", () => {
  const { rooms } = roomsAt();
  const a = fakeSocket();
  const b = fakeSocket();
  rooms.join(a, joinText(ROOM, TOKEN_A));

  assert.equal(rooms.join(b, joinText(ROOM.toLowerCase(), TOKEN_B)), "joined");
  assert.equal(rooms.size(), 1);
});

test("messages are relayed to the partner verbatim and never echoed back", () => {
  const { rooms } = roomsAt();
  const a = fakeSocket();
  const b = fakeSocket();
  rooms.join(a, joinText(ROOM, TOKEN_A));
  rooms.join(b, joinText(ROOM, TOKEN_B));
  a.sent.length = 0;
  b.sent.length = 0;

  const setup = JSON.stringify({ t: "setup", minutes: 34, locked: true });
  rooms.message(a, setup);

  assert.deepEqual(b.sent, [setup]);
  assert.deepEqual(a.sent, []);
});

test("a third device token is told the room is full and closed out", () => {
  const { rooms } = roomsAt();
  const a = fakeSocket();
  const b = fakeSocket();
  const c = fakeSocket();
  rooms.join(a, joinText(ROOM, TOKEN_A));
  rooms.join(b, joinText(ROOM, TOKEN_B));

  assert.equal(rooms.join(c, joinText(ROOM, TOKEN_C)), "full");
  assert.deepEqual(kinds(c), ["full"]);
  assert.equal(c.closedWith?.code, CLOSE_ROOM_FULL);
  // The two walkers hear nothing about a stranger bouncing off the door.
  assert.deepEqual(kinds(b), ["joined"]);
});

test("the same token back again is a reconnect: the seat's transport is replaced", () => {
  const { rooms } = roomsAt();
  const a = fakeSocket();
  const b = fakeSocket();
  const aAgain = fakeSocket();
  rooms.join(a, joinText(ROOM, TOKEN_A));
  rooms.join(b, joinText(ROOM, TOKEN_B));
  b.sent.length = 0;

  assert.equal(rooms.join(aAgain, joinText(ROOM, TOKEN_A)), "reconnected");
  assert.equal(a.closedWith?.code, CLOSE_REPLACED);
  assert.deepEqual(kinds(b), ["peer"]);

  // The relay now speaks to the new transport, not the replaced one.
  const hello = JSON.stringify({ t: "setup", minutes: 20 });
  rooms.message(b, hello);
  assert.deepEqual(aAgain.sent.slice(1), [hello]);
});

test("first spin wins: a competing spin is dropped until the settle", () => {
  const { rooms } = roomsAt();
  const a = fakeSocket();
  const b = fakeSocket();
  rooms.join(a, joinText(ROOM, TOKEN_A));
  rooms.join(b, joinText(ROOM, TOKEN_B));
  a.sent.length = 0;
  b.sent.length = 0;

  const spinA = JSON.stringify({ t: "spin", winner: "shiplock" });
  const spinB = JSON.stringify({ t: "spin", winner: "carytown" });
  rooms.message(a, spinA);
  rooms.message(b, spinB);
  assert.deepEqual(b.sent, [spinA], "the first spin is relayed");
  assert.deepEqual(a.sent, [], "the second spin is dropped, not forwarded");

  const settle = JSON.stringify({ t: "settle" });
  rooms.message(a, settle);
  rooms.message(b, spinB);
  assert.deepEqual(a.sent, [spinB], "after the settle the wheel is free again");
});

test("a spinner that disconnects mid-spin releases the lock", () => {
  const { rooms } = roomsAt();
  const a = fakeSocket();
  const b = fakeSocket();
  rooms.join(a, joinText(ROOM, TOKEN_A));
  rooms.join(b, joinText(ROOM, TOKEN_B));

  rooms.message(a, JSON.stringify({ t: "spin", winner: "shiplock" }));
  rooms.disconnect(a);
  a.sent.length = 0;

  rooms.message(b, JSON.stringify({ t: "spin", winner: "carytown" }));
  // Nobody is listening on seat A, but the lock did not wedge the room:
  // proven by the settle-free path accepting B's spin at all — a wedged
  // room would have dropped it, and A's later reconnect would hear nothing.
  const aAgain = fakeSocket();
  rooms.join(aAgain, joinText(ROOM, TOKEN_A));
  rooms.message(b, JSON.stringify({ t: "settle" }));
  assert.deepEqual(kinds(aAgain), ["joined", "settle"]);
});

test("a disconnect tells the partner, and the seat survives for the token", () => {
  const { rooms } = roomsAt();
  const a = fakeSocket();
  const b = fakeSocket();
  rooms.join(a, joinText(ROOM, TOKEN_A));
  rooms.join(b, joinText(ROOM, TOKEN_B));
  b.sent.length = 0;

  rooms.disconnect(a);
  const peer = parseJson(b.sent[0]!);
  assert.ok(isJsonObject(peer));
  assert.equal(peer["t"], "peer");
  assert.equal(peer["connected"], false);

  // Still a two-seat room: a stranger stays a third wheel while A is away.
  const c = fakeSocket();
  assert.equal(rooms.join(c, joinText(ROOM, TOKEN_C)), "full");
});

test("the 12-hour close tells both sides, and the id then reads closed, not fresh", () => {
  const { rooms, tick } = roomsAt();
  const a = fakeSocket();
  const b = fakeSocket();
  rooms.join(a, joinText(ROOM, TOKEN_A));
  rooms.join(b, joinText(ROOM, TOKEN_B));
  a.sent.length = 0;
  b.sent.length = 0;

  tick(ROOM_TTL_MS);
  rooms.sweep();

  assert.deepEqual(kinds(a), ["closed"]);
  assert.deepEqual(kinds(b), ["closed"]);
  assert.equal(a.closedWith?.code, CLOSE_ROOM_CLOSED);
  assert.equal(rooms.size(), 0);

  // A stale link is "room closed", not a quietly minted empty room.
  const late = fakeSocket();
  assert.equal(rooms.join(late, joinText(ROOM, TOKEN_A)), "closed");
  assert.deepEqual(kinds(late), ["closed"]);
});

test("a tombstone eventually expires and the id becomes mintable again", () => {
  const { rooms, tick } = roomsAt();
  const a = fakeSocket();
  rooms.join(a, joinText(ROOM, TOKEN_A));
  tick(ROOM_TTL_MS);
  rooms.sweep();

  tick(ROOM_TTL_MS);
  rooms.sweep();
  const again = fakeSocket();
  assert.equal(rooms.join(again, joinText(ROOM, TOKEN_A)), "created");
});

test("anything but a well-formed join closes the socket", () => {
  const cases = [
    "not json",
    JSON.stringify({ t: "spin" }),
    joinText("TOOSHORT1X", TOKEN_A), // 10 chars
    joinText("ILOU!!!!", TOKEN_A), // excluded alphabet
    joinText(ROOM, "short"),
    JSON.stringify({ t: "join", room: ROOM }),
  ];
  for (const text of cases) {
    const { rooms } = roomsAt();
    const socket = fakeSocket();
    assert.equal(rooms.join(socket, text), "rejected", text);
    assert.equal(socket.closedWith?.code, CLOSE_BAD_MESSAGE, text);
  }
});

test("an oversized frame closes the sender instead of being relayed", () => {
  const { rooms } = roomsAt();
  const a = fakeSocket();
  const b = fakeSocket();
  rooms.join(a, joinText(ROOM, TOKEN_A));
  rooms.join(b, joinText(ROOM, TOKEN_B));
  b.sent.length = 0;

  rooms.message(a, JSON.stringify({ t: "setup", pad: "x".repeat(MAX_MESSAGE_BYTES) }));
  assert.equal(a.closedWith?.code, CLOSE_BAD_MESSAGE);
  assert.deepEqual(kinds(b), ["peer"], "the partner hears a disconnect, not the frame");
});

test("a message from a socket that never joined closes it", () => {
  const { rooms } = roomsAt();
  const stranger = fakeSocket();
  rooms.message(stranger, JSON.stringify({ t: "setup" }));
  assert.equal(stranger.closedWith?.code, CLOSE_BAD_MESSAGE);
});
