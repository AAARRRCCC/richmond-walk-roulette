/**
 * The client half of the room: frames, presence, and what a reload keeps.
 * All pure; the socket is `useRoom.ts` and is not under test here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PRESET_ORIGINS } from "../data/places.ts";
import {
  describePresence,
  deviceToken,
  formatAgo,
  formatRemaining,
  initialRoom,
  joinFrame,
  presenceOf,
  readSocketFrame,
  recallSelf,
  reduceRoom,
  rememberSelf,
  setupFrame,
  settleFrame,
  spinFrame,
  wireOrigin,
  type KeyStore,
  type RoomState,
  type SideSetup,
} from "./room.ts";
import { isDeviceToken, mintDeviceToken, mintRoomId, normaliseRoomId } from "./room-id.ts";
import { customOrigin } from "./session.ts";

const CARYTOWN = PRESET_ORIGINS.find((origin) => origin.id === "carytown")!;

const side = (over: Partial<SideSetup> = {}): SideSetup => ({
  origin: { id: "carytown" },
  budgetMinutes: 30,
  roundTrip: true,
  floorMinutes: 10,
  edgeOnly: false,
  climb: "any",
  kind: "any",
  vibes: ["river"],
  weatherAware: true,
  locked: false,
  ...over,
});

const bytes = (fill: number) => (length: number) => new Uint8Array(length).fill(fill);

// ------------------------------------------------------------------- ids

test("a room id is eight Crockford characters the relay accepts", () => {
  const id = mintRoomId(bytes(0xff));
  assert.equal(id, "ZZZZZZZZ");
  assert.equal(normaliseRoomId(id.toLowerCase()), id);
  assert.equal(normaliseRoomId("8XK2M4PI"), null, "I is not in the alphabet");
  assert.equal(normaliseRoomId("8XK2M4P"), null);
});

test("a device token fits the relay's bound", () => {
  const token = mintDeviceToken(bytes(0x00));
  assert.equal(token.length, 22);
  assert.ok(isDeviceToken(token));
  assert.ok(isDeviceToken(mintDeviceToken(bytes(0xfb))), "base64url, no + or /");
});

// ---------------------------------------------------------------- frames

test("the join frame is what the relay expects first", () => {
  assert.deepEqual(JSON.parse(joinFrame("8xk2m4p9", "tok-aaaaaaa")), {
    t: "join",
    room: "8xk2m4p9",
    token: "tok-aaaaaaa",
  });
});

test("a setup frame round-trips through the reader", () => {
  const frame = readSocketFrame(setupFrame(side({ locked: true, climb: "easy", kind: "detour" })));
  assert.ok(frame !== null && frame.t === "setup");
  assert.equal(frame.side.origin, CARYTOWN, "a preset resolves to its own entry");
  assert.equal(frame.side.budgetMinutes, 30);
  assert.equal(frame.side.locked, true);
  assert.equal(frame.side.climb, "easy");
  assert.equal(frame.side.kind, "detour");
  assert.deepEqual(frame.side.vibes, ["river"]);
  assert.equal(frame.side.originOutOfBounds, false);
});

test("a pin crosses at full precision and lands as a literal name", () => {
  const mine = customOrigin({ lat: 37.5407012, lng: -77.4360987 });
  assert.deepEqual(wireOrigin(mine), { lat: 37.5407012, lng: -77.4360987 });
  const frame = readSocketFrame(setupFrame(side({ origin: wireOrigin(mine) })));
  assert.ok(frame !== null && frame.t === "setup");
  assert.equal(frame.side.origin?.lat, 37.5407012);
  assert.equal(frame.side.origin?.id, "partner");
  assert.equal(frame.side.origin?.name, "Their start");
});

test("an unshared or refused origin never becomes one", () => {
  const unshared = readSocketFrame(setupFrame(side({ origin: null })));
  assert.ok(unshared !== null && unshared.t === "setup");
  assert.equal(unshared.side.origin, null);

  const elsewhere = readSocketFrame(setupFrame(side({ origin: { lat: 40.712, lng: -74.006 } })));
  assert.ok(elsewhere !== null && elsewhere.t === "setup");
  assert.equal(elsewhere.side.origin, null);
  assert.equal(elsewhere.side.originOutOfBounds, true);

  const unknown = readSocketFrame(setupFrame(side({ origin: { id: "nowhere" } })));
  assert.ok(unknown !== null && unknown.t === "setup");
  assert.equal(unknown.side.origin, null);
});

test("a setup frame with garbage in it is dropped, not guessed", () => {
  const text = setupFrame(side()).replace('"c":"any"', '"c":"vertical"');
  assert.equal(readSocketFrame(text), null);
  assert.equal(readSocketFrame("not json"), null);
  assert.equal(readSocketFrame("[]"), null);
  assert.equal(readSocketFrame(JSON.stringify({ t: "setup", b: "30" })), null);
  const vibes = readSocketFrame(setupFrame(side()).replace('["river"]', '["park","bogus","river"]'));
  assert.ok(vibes !== null && vibes.t === "setup");
  assert.deepEqual(vibes.side.vibes, ["river", "park"], "app order, unknowns gone");
});

test("spin and settle carry one field each", () => {
  assert.deepEqual(readSocketFrame(spinFrame("shiplock")), { t: "spin", winnerId: "shiplock" });
  assert.equal(readSocketFrame(JSON.stringify({ t: "spin", p: "" })), null);
  assert.deepEqual(readSocketFrame(settleFrame(true)), { t: "settle", aborted: true });
  assert.deepEqual(readSocketFrame(settleFrame(false)), { t: "settle", aborted: false });
});

test("the relay's own frames read", () => {
  assert.deepEqual(readSocketFrame('{"t":"joined","peers":1,"expiresInMs":100}'), {
    t: "joined",
    peers: 1,
    expiresInMs: 100,
  });
  assert.deepEqual(readSocketFrame('{"t":"peer","connected":true}'), { t: "peer", connected: true });
  assert.deepEqual(readSocketFrame('{"t":"full"}'), { t: "full" });
  assert.deepEqual(readSocketFrame('{"t":"closed"}'), { t: "closed" });
  assert.equal(readSocketFrame('{"t":"joined"}'), null);
});

// -------------------------------------------------------------- presence

const T0 = 1_700_000_000_000;

function run(events: Parameters<typeof reduceRoom>[1][]): RoomState {
  return events.reduce(reduceRoom, initialRoom);
}

test("a first join alone is waiting; a partner arriving is here", () => {
  const alone = run([{ type: "joined", peers: 1, expiresInMs: 1000, nowMs: T0 }]);
  assert.equal(presenceOf(alone), "waiting");
  assert.equal(alone.expiresAt, T0 + 1000);
  assert.equal(alone.joins, 1);

  const together = reduceRoom(alone, { type: "peer", connected: true, nowMs: T0 + 5 });
  assert.equal(presenceOf(together), "here");
  assert.equal(describePresence(together, T0 + 5), "They're here.");
});

test("a partner who leaves is away, dated from when they went", () => {
  const state = run([
    { type: "joined", peers: 2, expiresInMs: 1000, nowMs: T0 },
    { type: "peer", connected: false, nowMs: T0 + 60_000 },
  ]);
  assert.equal(presenceOf(state), "away");
  assert.equal(describePresence(state, T0 + 60_000), "Last seen just now.");
  assert.equal(describePresence(state, T0 + 5 * 60_000), "Last seen 4 min ago.");
});

test("joining with a partner already there is here, not waiting", () => {
  const state = run([{ type: "joined", peers: 2, expiresInMs: 1000, nowMs: T0 }]);
  assert.equal(presenceOf(state), "here");
  assert.equal(state.peerEverSeen, true);
});

test("a lost transport is reconnecting and keeps their side", () => {
  const theirs = readSocketFrame(setupFrame(side()));
  assert.ok(theirs !== null && theirs.t === "setup");
  const state = run([
    { type: "joined", peers: 2, expiresInMs: 1000, nowMs: T0 },
    { type: "partnerSetup", side: theirs.side },
    { type: "lost" },
  ]);
  assert.equal(presenceOf(state), "reconnecting");
  assert.equal(state.partner?.budgetMinutes, 30, "held, dimmed, not dropped");
  const back = reduceRoom(state, { type: "joined", peers: 2, expiresInMs: 900, nowMs: T0 + 100 });
  assert.equal(presenceOf(back), "here");
  assert.equal(back.joins, 2, "the rejoin re-asserts this side's setup");
});

test("a policy close is final; a lost transport after it does not reconnect", () => {
  for (const type of ["full", "closed", "replaced"] as const) {
    const state = run([{ type: "joined", peers: 1, expiresInMs: 1000, nowMs: T0 }, { type }, { type: "lost" }]);
    assert.equal(state.status, type);
    assert.equal(presenceOf(state), type);
  }
});

test("reset forgets the last room entirely", () => {
  const state = run([{ type: "joined", peers: 2, expiresInMs: 1000, nowMs: T0 }, { type: "reset" }]);
  assert.deepEqual(state, initialRoom);
});

test("remaining and ago read as a person would say them", () => {
  assert.equal(formatRemaining(11 * 3_600_000 + 40 * 60_000), "11h 40m");
  assert.equal(formatRemaining(2 * 3_600_000), "2h");
  assert.equal(formatRemaining(7 * 60_000), "7m");
  assert.equal(formatRemaining(30_000), "under a minute");
  assert.equal(formatRemaining(-5), "under a minute");
  assert.equal(formatAgo(90 * 60_000), "1 h ago");
});

// ------------------------------------------------------------ the device

function store(): KeyStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

test("a device token is minted once and kept", () => {
  const kept = store();
  let minted = 0;
  const mint = () => `token-${++minted}xxxx`;
  assert.equal(deviceToken(kept, mint), "token-1xxxx");
  assert.equal(deviceToken(kept, mint), "token-1xxxx");
  assert.equal(deviceToken(null, mint), "token-2xxxx", "no store still yields a token");
});

test("a remembered start comes back as the same origin, by kind", () => {
  const kept = store();
  rememberSelf(kept, "8XK2M4P9", CARYTOWN);
  assert.equal(recallSelf(kept, "8XK2M4P9", customOrigin), CARYTOWN);

  rememberSelf(kept, "8XK2M4P9", customOrigin({ lat: 37.541, lng: -77.436 }));
  const pin = recallSelf(kept, "8XK2M4P9", customOrigin);
  assert.equal(pin?.id, "custom");
  assert.equal(pin?.lat, 37.541);

  assert.equal(recallSelf(kept, "OTHER123", customOrigin), null, "consent is per room");
  kept.map.set("walk.room.8XK2M4P9", JSON.stringify({ id: "custom", lat: 40.7, lng: -74 }));
  assert.equal(recallSelf(kept, "8XK2M4P9", customOrigin), null, "a stored pin is still bounds-checked");
});
