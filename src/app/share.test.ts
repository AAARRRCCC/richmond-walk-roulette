/**
 * The share format, which is the one thing in this app that has to keep working
 * after it stops being edited.
 *
 * A link somebody sent last year has to mean the same thing today, so the
 * properties worth asserting are round-trip identity, never-throws, and that the
 * decoder ignores what it does not understand rather than failing on it. The
 * cases below are written as those properties rather than as a tour of the code.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_MINUTES, MIN_MINUTES } from "../lib/isochrone.ts";
import { PLACES, PRESET_ORIGINS } from "../data/places.ts";
import {
  applyShare,
  customOrigin,
  dialMinimum,
  initialSession,
  liveLinkQuery,
  reduce,
} from "./session.ts";
import {
  PIN_PRECISION,
  SHARE_BUDGET_MAX,
  SHARE_BUDGET_MIN,
  SHARE_QUERY_MAX,
  canonicalQuery,
  decodeShare,
  describeRoom,
  describeShare,
  encodeShare,
  isEmptyLink,
  roomUrl,
  shareUrl,
  type ShareInput,
  type SharedOrigin,
} from "./share.ts";

const CARYTOWN = PRESET_ORIGINS.find((origin) => origin.id === "carytown");
const HOME = PRESET_ORIGINS[0];

const input = (over: Partial<ShareInput> = {}): ShareInput => ({
  origin: CARYTOWN ?? HOME!,
  budgetMinutes: 34,
  floorMinutes: 10,
  dialMinimumMinutes: 10,
  roundTrip: true,
  edgeOnly: false,
  climb: "any",
  kind: "any",
  vibes: [],
  placeId: "shiplock",
  ...over,
});

test("the duplicated dial bounds still match the dial", () => {
  // `share.ts` restates these so the Worker does not have to import the contour
  // cache for two numbers. This is what makes that safe.
  assert.equal(SHARE_BUDGET_MIN, MIN_MINUTES);
  assert.equal(SHARE_BUDGET_MAX, MAX_MINUTES);
});

test("a link carries the walk explicitly and the filters only when set", () => {
  // The four that define the walk are always written, so changing a default
  // later cannot quietly change what an old link means.
  assert.equal(encodeShare(input()), "o=carytown&b=34&rt=1&p=shiplock");

  assert.equal(
    encodeShare(input({ edgeOnly: true, climb: "hilly", kind: "detour", vibes: ["park", "river"] })),
    "o=carytown&b=34&rt=1&e=1&c=hilly&k=detour&v=river.park&p=shiplock",
  );
});

test("vibes are written in VIBES order, whatever order they were toggled in", () => {
  // One selection is one link is one cache entry. Without this, two people who
  // picked the same two chips in a different order get different URLs.
  assert.equal(
    encodeShare(input({ vibes: ["park", "river"] })),
    encodeShare(input({ vibes: ["river", "park"] })),
  );
});

test("a floor is written only when it is actually a floor", () => {
  assert.equal(encodeShare(input({ floorMinutes: 10 })).includes("f="), false);
  assert.match(encodeShare(input({ floorMinutes: 20 })), /f=20/);
});

test("the link carries no condition switch", () => {
  // beforeDark, weatherAware and hideClosed are about the recipient's
  // here-and-now, not the walk that was sent. A link that switched off
  // somebody's daylight guard would be a trap; one that switched it on would be
  // a lie about what the sender did.
  const link = encodeShare(input({ edgeOnly: true, climb: "easy", vibes: ["food"] }));
  for (const key of ["bd=", "wa=", "hc=", "beforeDark", "weatherAware", "hideClosed"]) {
    assert.equal(link.includes(key), false, `${key} must not be in ${link}`);
  }
});

test("canonicalQuery round-trips every link the encoder can produce", () => {
  // The identity the cache key and og:url both rest on, and it is a test rather
  // than a hope: two spins that differ in any field must be two documents.
  const cases: ShareInput[] = [
    input(),
    input({ roundTrip: false }),
    input({ floorMinutes: 25 }),
    input({ edgeOnly: true }),
    input({ climb: "easy" }),
    input({ climb: "hilly", kind: "destination" }),
    input({ kind: "detour" }),
    input({ vibes: ["river", "park", "museum", "history", "food", "scenic"] }),
    input({ budgetMinutes: SHARE_BUDGET_MIN }),
    input({ budgetMinutes: SHARE_BUDGET_MAX }),
    input({ origin: { id: "custom", name: "Dropped pin", lat: 37.53881, lng: -77.43356 } }),
  ];
  for (const one of cases) {
    const encoded = encodeShare(one);
    assert.equal(canonicalQuery(decodeShare(encoded)), encoded, encoded);
  }
});

test("decodeShare never throws, on anything", () => {
  const nasty = [
    "",
    "?",
    "&&&",
    "o=",
    "o=,,,",
    "b=NaN",
    "b=1e9",
    "rt=maybe",
    "v=.....",
    "%%%%",
    "p=" + "x".repeat(400),
    "o=" + "9".repeat(SHARE_QUERY_MAX),
  ];
  for (const search of nasty) {
    assert.doesNotThrow(() => decodeShare(search), search);
  }
});

test("an out-of-range budget decodes as absent, not as itself", () => {
  // So every consumer sees a budget the dial could hold and nothing downstream
  // needs a clamp of its own.
  assert.equal(decodeShare("b=400").budgetMinutes, null);
  assert.equal(decodeShare("b=0").budgetMinutes, null);
  assert.equal(decodeShare("b=-5").budgetMinutes, null);
  assert.equal(decodeShare("b=34").budgetMinutes, 34);
});

test("an over-long query is treated as absent rather than parsed", () => {
  const huge = "o=home&b=50&rt=1&p=capitol&x=" + "y".repeat(SHARE_QUERY_MAX);
  assert.equal(isEmptyLink(decodeShare(huge)), true);
});

test("unknown keys and unknown values are ignored, never an error", () => {
  const link = decodeShare("o=home&b=50&rt=1&p=capitol&zz=1&c=vertical&k=spaceship&v=river.lava");
  assert.equal(link.placeId, "capitol");
  assert.equal(link.climb, null, "an unknown climb is absent, not a failure");
  assert.equal(link.kind, null);
  assert.deepEqual(link.vibes, ["river"], "the known vibe survives, the invented one does not");
});

test("a dropped pin is published at about a hundred metres, not at one", () => {
  // A privacy decision, not a formatting one: five decimals is somebody's front
  // door, in a link that gets forwarded. See HUMAN-REVIEW 2.9.
  assert.equal(PIN_PRECISION, 3);
  const encoded = encodeShare(
    input({ origin: { id: "custom", name: "Dropped pin", lat: 37.538812, lng: -77.433561 } }),
  );
  assert.match(encoded, /^o=37\.539%2C-77\.434&/);

  const origin = decodeShare(encoded).origin;
  assert.equal(origin?.kind, "pin");
});

test("a preset origin shares as an id and leaks no coordinate", () => {
  const encoded = encodeShare(input());
  assert.match(encoded, /o=carytown/);
  assert.equal(/\d+\.\d+/.test(encoded.split("&")[0] ?? ""), false);
});

test("shareUrl is absolute and lands on the share path", () => {
  assert.equal(
    shareUrl("https://walk.example", input()),
    "https://walk.example/s?o=carytown&b=34&rt=1&p=shiplock",
  );
});

test("the shared sentence names the walk both ways round", () => {
  const args = { placeName: "Great Shiplock Park", originName: "Carytown", walkMinutes: 34 };
  assert.equal(
    describeShare({ ...args, roundTrip: true }),
    "Great Shiplock Park — a 34 min round trip from Carytown.",
  );
  assert.equal(
    describeShare({ ...args, roundTrip: false }),
    "Great Shiplock Park — 34 min on foot from Carytown.",
  );
});

// ---------------------------------------------------------------------------
// Restoring
// ---------------------------------------------------------------------------

const restore = (search: string) =>
  applyShare(initialSession, decodeShare(search), PLACES, PRESET_ORIGINS);

test("an empty link restores by identity, so a cold start costs nothing", () => {
  // Identity, not equality: `shared` must stay null rather than becoming an
  // empty arrival, or every ordinary load would show the shared-walk label.
  assert.equal(restore(""), initialSession);
  assert.equal(restore("?"), initialSession);
  assert.equal(restore("?utm_source=whatever"), initialSession);
});

test("a valid link restores the walk, the filters and the pick", () => {
  const session = restore("o=carytown&b=34&rt=1&c=easy&k=detour&v=river.park&p=shiplock");
  assert.equal(session.origin.id, "carytown");
  assert.equal(session.budgetMinutes, 34);
  assert.equal(session.roundTrip, true);
  assert.equal(session.climb, "easy");
  assert.equal(session.kind, "detour");
  assert.deepEqual(session.vibes, ["river", "park"]);
  assert.equal(session.pickedId, "shiplock");
  assert.equal(session.shared?.missingPlaceId, null);
  // The map is told to frame the restored walk rather than the default one.
  assert.ok(session.framingKey > initialSession.framingKey);
});

test("a link naming a place this build no longer has says so and keeps the rest", () => {
  const session = restore("o=carytown&b=34&rt=1&p=a-place-that-was-deleted");
  assert.equal(session.shared?.missingPlaceId, "a-place-that-was-deleted");
  assert.equal(session.pickedId, null, "and never a substitute");
  assert.equal(session.origin.id, "carytown", "everything else about the walk survives");
  assert.equal(session.budgetMinutes, 34);
});

test("a link naming an unknown preset falls back rather than failing", () => {
  const session = restore("o=not-a-preset&b=34&rt=1&p=shiplock");
  assert.equal(session.origin.id, initialSession.origin.id);
  assert.equal(session.pickedId, "shiplock", "the rest of the link is still a walk");
});

test("a budget the dial cannot hold is clamped, and the clamp is reported", () => {
  // `clampBudget` can move a budget up as well as down - a round-trip link
  // asking for 7 lands on 10 - so the notice has to cover both ends.
  const session = restore("o=home&b=7&rt=1&p=capitol");
  assert.equal(session.budgetMinutes, dialMinimum(true));
  assert.equal(session.shared?.clampedFromMinutes, 7);
});

test("a pin origin restores as a dropped pin", () => {
  const session = restore("o=37.534,-77.431&b=30&rt=1&p=capitol");
  assert.equal(session.origin.id, "custom");
  assert.equal(session.origin.lat, 37.534);
});

test("the arrival survives a dial move and dies on a new spin", () => {
  // The distinction the whole `linkQuery` field exists for: moving the dial does
  // not stop this being the walk that was shared, it just makes the address bar
  // wrong - which App handles separately.
  const arrived = restore("o=carytown&b=34&rt=1&p=shiplock");
  assert.ok(arrived.shared !== null);

  const moved = reduce(arrived, { type: "budget", minutes: 60 });
  assert.ok(moved.shared !== null, "still the shared walk");

  for (const action of [
    { type: "spinStart" } as const,
    { type: "spinEnd", pickedId: "capitol" } as const,
    { type: "pickPlace", pickedId: "capitol" } as const,
    { type: "clearPick" } as const,
    { type: "dismissShared" } as const,
    { type: "origin", origin: PRESET_ORIGINS[1]! } as const,
  ]) {
    assert.equal(reduce(arrived, action).shared, null, action.type);
  }
});

test("dismissing an arrival that is already gone changes nothing", () => {
  // So a stray dispatch cannot re-render the tree for no reason.
  assert.equal(reduce(initialSession, { type: "dismissShared" }), initialSession);
});

test("the link's own query is stamped on the arrival", () => {
  // What App compares the live session against to decide the address bar has
  // stopped describing the screen.
  const search = "o=carytown&b=34&rt=1&p=shiplock";
  assert.equal(restore(search).shared?.linkQuery, search);
});

test("a SharedOrigin is one of exactly two things", () => {
  // A narrow union rather than an open shape, so a third kind cannot be
  // introduced without every consumer noticing.
  const preset: SharedOrigin = { kind: "preset", id: "monroe" };
  const pin: SharedOrigin = { kind: "pin", lat: 37.5, lng: -77.4 };
  assert.equal(preset.kind === "preset" ? preset.id : null, "monroe");
  assert.equal(pin.kind === "pin" ? pin.lat : null, 37.5);
});

// ---------------------------------------------------------------------------
// Room pointers
// ---------------------------------------------------------------------------

test("a room pointer carries the id and nothing else", () => {
  const link = decodeShare("?r=8xk2m4p9");
  assert.equal(link.room, "8XK2M4P9", "case-folded to the relay's shape");
  assert.equal(link.origin, null);
  assert.equal(link.budgetMinutes, null);
  assert.equal(isEmptyLink(link), false);
  assert.equal(canonicalQuery(link), "r=8XK2M4P9");
  assert.equal(roomUrl("https://walk.example", "8XK2M4P9"), "https://walk.example/s?r=8XK2M4P9");
});

test("a room pointer ignores anything beside the id", () => {
  // One link, one grammar: the room holds the setup.
  const link = decodeShare("?r=8XK2M4P9&o=carytown&b=30&p=shiplock");
  assert.equal(link.room, "8XK2M4P9");
  assert.equal(link.origin, null);
  assert.equal(link.placeId, null);
});

test("a malformed room id is an empty link", () => {
  for (const raw of ["", "abc", "8XK2M4P", "8XK2M4PI", "8XK2M4P9X", "8XK2-4P9"]) {
    const link = decodeShare(`?r=${raw}`);
    assert.equal(link.room, null, raw);
    assert.ok(isEmptyLink(link), raw);
  }
});

test("the retired ping-pong keys decode as a cold start", () => {
  // docs/adr/0001: roughly two such links exist in the wild.
  const link = decodeShare("?m=1&ma=37.541,-77.436&mb=carytown&b=30&rt=1&l=40&d=20690");
  assert.equal(link.origin, null, "`ma` is never read as anybody's origin");
  const session = applyShare(initialSession, link, PLACES, PRESET_ORIGINS);
  assert.equal(session.partner, null);
  assert.equal(session.room, null);
  assert.equal(session.origin.id, initialSession.origin.id);
  assert.equal(session.budgetMinutes, 30, "the walk's own keys still restore");
});

test("the room description names nobody and carries no coordinate", () => {
  assert.equal(/37\.|-77\./.test(describeRoom()), false);
  assert.match(describeRoom(), /12 hours/);
});

test("the tier survives canonicalisation", () => {
  // The regression guard for `k` being dropped from the total key order.
  // Without it, two links differing only in the tier would collapse into one
  // cached document and nothing would say why.
  const detour = canonicalQuery(decodeShare("?o=carytown&b=30&rt=1&k=detour&p=shiplock"));
  assert.match(detour, /k=detour/);
  assert.notEqual(
    detour,
    canonicalQuery(decodeShare("?o=carytown&b=30&rt=1&k=destination&p=shiplock")),
  );
});

// --------------------------------------------------------------- restoring

test("a room pointer restores the room and nothing else", () => {
  // Opening the link costs the reader nothing until they choose a start.
  const session = applyShare(initialSession, decodeShare("?r=8XK2M4P9"), PLACES, PRESET_ORIGINS);
  assert.equal(session.room, "8XK2M4P9");
  assert.equal(session.originChosen, false);
  assert.equal(session.partner, null);
  assert.equal(session.shared, null);
  assert.equal(session.budgetMinutes, initialSession.budgetMinutes);
});

test("a remembered start makes a reload the same walker back again", () => {
  const mine = customOrigin({ lat: 37.541, lng: -77.436 });
  const session = applyShare(initialSession, decodeShare("?r=8XK2M4P9"), PLACES, PRESET_ORIGINS, mine);
  assert.equal(session.originChosen, true);
  assert.equal(session.origin, mine);
});

test("`origin` does not leave the room", () => {
  const arrived = applyShare(initialSession, decodeShare("?r=8XK2M4P9"), PLACES, PRESET_ORIGINS);
  const chosen = reduce(arrived, { type: "origin", origin: PRESET_ORIGINS[1]! });
  assert.equal(chosen.room, "8XK2M4P9");
  assert.equal(chosen.originChosen, true);
});

test("`partner` moves only when their start moves", () => {
  const inRoom = reduce(initialSession, { type: "enterRoom", room: "8XK2M4P9" });
  const theirs = PRESET_ORIGINS[3]!;
  const met = reduce(inRoom, { type: "partner", origin: theirs });
  assert.equal(met.partner, theirs);
  assert.ok(met.framingKey > inRoom.framingKey, "their contour re-frames the map");
  assert.equal(reduce(met, { type: "partner", origin: { ...theirs } }), met, "same place, same state");
  const gone = reduce(met, { type: "partner", origin: null });
  assert.equal(gone.partner, null);
});

test("`leaveMeet` returns a single-person session", () => {
  const inRoom = reduce(reduce(initialSession, { type: "enterRoom", room: "8XK2M4P9" }), {
    type: "partner",
    origin: PRESET_ORIGINS[3]!,
  });
  const meeting = reduce(inRoom, { type: "partnerWarmProgress", fraction: 0.5 });
  const alone = reduce(meeting, { type: "leaveMeet" });
  assert.equal(alone.room, null);
  assert.equal(alone.partner, null);
  assert.equal(alone.originChosen, true);
  assert.equal(alone.partnerWarmed, 0);
  assert.equal(alone.partnerFailure, null);
  assert.equal(alone.pickedId, null);
  assert.ok(alone.framingKey > meeting.framingKey);
});

test("a spin does not leave the room", () => {
  const meeting = reduce(reduce(initialSession, { type: "enterRoom", room: "8XK2M4P9" }), {
    type: "partner",
    origin: PRESET_ORIGINS[3]!,
  });
  for (const action of [
    { type: "spinStart" } as const,
    { type: "spinEnd", pickedId: "shiplock" } as const,
    { type: "pickPlace", pickedId: "shiplock" } as const,
    { type: "clearPick" } as const,
    { type: "budget", minutes: 40 } as const,
    { type: "clearFilters" } as const,
  ]) {
    const after = reduce(meeting, action);
    assert.equal(after.room, "8XK2M4P9", action.type);
    assert.ok(after.partner !== null, action.type);
  }
});

test("liveLinkQuery matches the arrival on the first paint", () => {
  const query = "o=carytown&b=30&rt=1&p=shiplock";
  const session = applyShare(initialSession, decodeShare(query), PLACES, PRESET_ORIGINS);
  assert.equal(liveLinkQuery(session, session.pickedId), session.shared?.linkQuery);
  const moved = reduce(session, { type: "budget", minutes: 40 });
  assert.notEqual(liveLinkQuery(moved, moved.pickedId), moved.shared?.linkQuery);
});
