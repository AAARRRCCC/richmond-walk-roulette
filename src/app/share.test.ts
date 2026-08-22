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
  dialMinimum,
  initialSession,
  liveLinkQuery,
  meetLinks,
  partnerOrigin,
  reduce,
} from "./session.ts";
import {
  PIN_PRECISION,
  SHARE_BUDGET_MAX,
  SHARE_BUDGET_MIN,
  SHARE_QUERY_MAX,
  canonicalQuery,
  decodeShare,
  describeInvite,
  describeMeetResult,
  epochDay,
  meetKind,
  describeShare,
  encodeShare,
  isEmptyLink,
  shareUrl,
  type ShareInput,
  type SharedOrigin,
} from "./share.ts";

const CARYTOWN = PRESET_ORIGINS.find((origin) => origin.id === "carytown");
const HOME = PRESET_ORIGINS[0];

const input = (over: Partial<ShareInput> = {}): ShareInput => ({
  origin: CARYTOWN ?? HOME!,
  meet: false,
  partner: null,
  mintedDay: null,
  lockedMinutes: null,
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
    input({ origin: { id: "custom", name: "Dropped pin", lat: 37.53371, lng: -77.4336 } }),
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
    input({ origin: { id: "custom", name: "Dropped pin", lat: 37.533712, lng: -77.431351 } }),
  );
  assert.match(encoded, /^o=37\.534%2C-77\.431&/);

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
  const preset: SharedOrigin = { kind: "preset", id: "home" };
  const pin: SharedOrigin = { kind: "pin", lat: 37.5, lng: -77.4 };
  assert.equal(preset.kind === "preset" ? preset.id : null, "home");
  assert.equal(pin.kind === "pin" ? pin.lat : null, 37.5);
});

// ---------------------------------------------------------------------------
// Meet links
// ---------------------------------------------------------------------------

const PIN_A = { id: "custom", name: "Dropped pin", lat: 37.5407012, lng: -77.4360987 };
const PIN_B = partnerOrigin({ lat: 37.512, lng: -77.402 });

test("a meet link never carries `o`", () => {
  // The test that protects the old-build degradation. A meet key that changed
  // the meaning of an existing key would let a stale bundle read `o` as the
  // READER's own origin and answer a stranger's question from a stranger's
  // front door, with no notice at all.
  const link = encodeShare(input({ meet: true, origin: PIN_A, placeId: null }));
  assert.match(link, /(^|&)m=1(&|$)/);
  assert.match(link, /(^|&)ma=/);
  assert.equal(/(^|&)o=/.test(link), false);
});

test("an older build reads a meet link as a cold start", () => {
  const query = encodeShare(input({ meet: true, origin: PIN_A, placeId: null }));
  const decoded = decodeShare(query);
  assert.equal(decoded.origin, null, "there is no `o` for an old build to misread");
  // An old decoder ignores m/ma/mb entirely, which is this shape:
  const asOldBuild = { ...decoded, meet: false, originA: null, originB: null };
  const session = applyShare(initialSession, asOldBuild, PLACES, PRESET_ORIGINS);
  assert.equal(session.origin.id, initialSession.origin.id);
  assert.equal(session.partner, null);
});

test("a meet pin is written at three decimals", () => {
  const link = encodeShare(input({ meet: true, origin: PIN_A, placeId: null }));
  assert.match(link, /ma=37\.541%2C-77\.436/);
});

test("a preset in a meet link is still an id", () => {
  const link = encodeShare(input({ meet: true, placeId: null }));
  assert.match(link, /ma=carytown/);
  assert.equal(/\d+\.\d+/.test(link), false, "no coordinate anywhere in the query");
});

test("canonicalQuery is idempotent under coarsening", () => {
  // chunk 10's round-trip identity, extended to the shapes that round.
  const cases: ShareInput[] = [
    input({ meet: true, origin: PIN_A, placeId: null, mintedDay: 20690 }),
    input({ meet: true, origin: PIN_A, partner: PIN_B, mintedDay: 20690 }),
    input({ meet: true, partner: PRESET_ORIGINS[0]! }),
    input({ meet: true, placeId: null }),
  ];
  for (const one of cases) {
    const encoded = encodeShare(one);
    assert.equal(canonicalQuery(decodeShare(encoded)), encoded, encoded);
  }
});

test("a hand-edited five-decimal meet pin canonicalises to three", () => {
  // Canonical is allowed to differ from requested, and here that is the point:
  // a five-decimal coordinate cannot be smuggled through the URL a crawler
  // stores.
  const canonical = canonicalQuery(decodeShare("?m=1&ma=37.54070,-77.43600&b=30&rt=1"));
  assert.match(canonical, /ma=37\.541%2C-77\.436/);
  assert.equal(canonical.includes("37.54070"), false);
});

test("key order is fixed", () => {
  const ordered = "m=1&ma=carytown&mb=home&b=30&rt=1&e=1&c=easy&v=park&k=detour&p=shiplock&d=20690";
  const shuffled = "p=shiplock&k=detour&b=30&d=20690&ma=carytown&v=park&m=1&rt=1&mb=home&c=easy&e=1";
  assert.equal(canonicalQuery(decodeShare(ordered)), canonicalQuery(decodeShare(shuffled)));
});

test("meetKind distinguishes the three shapes", () => {
  assert.equal(meetKind(decodeShare("o=carytown&b=30&rt=1&p=shiplock")), "none");
  assert.equal(meetKind(decodeShare("m=1&ma=carytown&b=30&rt=1")), "invite");
  assert.equal(meetKind(decodeShare("m=1&ma=carytown&mb=home&b=30&rt=1&p=shiplock")), "answer");
  // An `m` with no `ma` is not a meeting: a link naming a second person and
  // not a first is not a shape this app mints.
  assert.equal(meetKind(decodeShare("m=1&b=30")), "none");
});

test("an invite carries no `mb` and no `p`", () => {
  // The encoder writes whatever `partner` it is given and does not throw: it is
  // a pure encoder, and a throwing branch would fork that discipline for an
  // invariant the one call site holds trivially. `meetLinks` is what holds it.
  const link = encodeShare(input({ meet: true, partner: null, placeId: null }));
  assert.match(link, /m=1/);
  assert.match(link, /ma=/);
  assert.equal(/(^|&)mb=/.test(link), false);
  assert.equal(/(^|&)p=/.test(link), false);
});

test("`d` is written only when a pin is present", () => {
  assert.match(
    encodeShare(input({ meet: true, origin: PIN_A, placeId: null, mintedDay: 20690 })),
    /d=20690/,
  );
  // A preset-to-preset invite discloses nothing, has nothing to go stale, and
  // keeps a date-free key the edge can cache.
  assert.equal(
    encodeShare(input({ meet: true, placeId: null, mintedDay: 20690 })).includes("d="),
    false,
  );
});

test("`d` out of range decodes to null", () => {
  for (const raw of ["-1", "abc", "999999999", ""]) {
    assert.equal(decodeShare(`m=1&ma=carytown&b=30&rt=1&d=${raw}`).mintedDay, null, raw);
  }
  assert.equal(decodeShare("m=1&ma=carytown&b=30&rt=1&d=20690").mintedDay, 20690);
});

test("neither describe function contains a coordinate", () => {
  const invite = describeInvite({ originName: "a dropped pin", minutes: 30, roundTrip: true });
  const answer = describeMeetResult({
    placeName: "Great Shiplock Park",
    minutes: 30,
    roundTrip: true,
  });
  for (const text of [invite, answer]) {
    assert.equal(/37\.|-77\./.test(text), false, text);
  }
});

test("a meet link is comfortably inside the query cap", () => {
  const full = encodeShare(
    input({
      meet: true,
      origin: PIN_A,
      partner: PIN_B,
      floorMinutes: 20,
      edgeOnly: true,
      climb: "hilly",
      kind: "detour",
      vibes: ["river", "park", "food"],
      placeId: "shiplock",
      mintedDay: 20690,
    }),
  );
  assert.ok(full.length < 300, `${full.length} characters: ${full}`);
  assert.equal(SHARE_QUERY_MAX, 512, "and the cap is unchanged");
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

test("an out-of-bounds partner is refused without a request", () => {
  // Manhattan. The proxy would have 400'd it, but the client refuses first so
  // a forged link cannot even generate the attempt.
  const session = restore("m=1&ma=40.712,-74.006&b=30&rt=1");
  assert.equal(session.partner, null);
  assert.equal(session.meet?.partnerOutOfBounds, true);
  assert.equal(session.originChosen, false);
});

test("a mangled `mb` is named, not swallowed", () => {
  const session = restore("m=1&ma=carytown&mb=40.712,-74.006&b=30&rt=1");
  assert.equal(session.originChosen, false);
  assert.equal(session.meet?.selfOutOfBounds, true);
  assert.equal(session.origin, initialSession.origin);
});

test("an invite leaves the local origin unchosen", () => {
  // The flag, not a null origin, is what gates: `origin` stays DEFAULT_ORIGIN
  // so every path that reads it keeps working, and nothing draws it.
  const session = restore("m=1&ma=carytown&b=30&rt=1");
  assert.equal(session.originChosen, false);
  assert.equal(session.origin, initialSession.origin);
  assert.equal(session.meet?.kind, "invite");
  assert.equal(session.partner?.id, "carytown");
});

test("an answer restores both starts and the pick", () => {
  const session = restore("m=1&ma=37.512,-77.402&mb=carytown&b=30&rt=1&p=shiplock");
  assert.equal(session.partner?.id, "partner");
  assert.equal(session.partner?.name, "Their start");
  assert.equal(session.origin.id, "carytown");
  assert.equal(session.originChosen, true);
  assert.equal(session.pickedId, "shiplock");
  assert.equal(session.meet?.kind, "answer");
});

test("a preset partner keeps its own identity", () => {
  const session = restore("m=1&ma=carytown&b=30&rt=1");
  assert.equal(session.partner?.id, "carytown");
  assert.equal(session.partner?.name, "Carytown", "not 'Their start'");
});

test("`origin` does not clear the meeting", () => {
  // Choosing your own start is how you ANSWER an invite, so it must not clear
  // either the partner or the link's provenance.
  const invite = restore("m=1&ma=carytown&b=30&rt=1");
  const answered = reduce(invite, { type: "origin", origin: PRESET_ORIGINS[1]! });
  assert.equal(answered.originChosen, true);
  assert.ok(answered.partner !== null);
  assert.ok(answered.meet !== null);
});

test("`leaveMeet` returns a single-person session", () => {
  const meeting = reduce(restore("m=1&ma=carytown&mb=home&b=30&rt=1&p=shiplock"), {
    type: "partnerWarmProgress",
    fraction: 1,
  });
  const alone = reduce(meeting, { type: "leaveMeet" });
  assert.equal(alone.partner, null);
  assert.equal(alone.meet, null);
  assert.equal(alone.originChosen, true);
  assert.equal(alone.partnerWarmed, 0);
  assert.equal(alone.partnerFailure, null);
  // The pool is about to change, so the pick it produced is no longer a pick
  // from this pool.
  assert.equal(alone.pickedId, null);
  assert.ok(alone.framingKey > meeting.framingKey);
});

test("a spin does not dismiss the meeting", () => {
  // Unlike `shared`: the other person is still there after a spin.
  const meeting = restore("m=1&ma=carytown&mb=home&b=30&rt=1&p=shiplock");
  for (const action of [
    { type: "spinStart" } as const,
    { type: "spinEnd", pickedId: "capitol" } as const,
    { type: "pickPlace", pickedId: "capitol" } as const,
  ]) {
    const after = reduce(meeting, action);
    assert.ok(after.meet !== null, action.type);
    assert.ok(after.partner !== null, action.type);
    assert.equal(after.shared, null, action.type);
  }
});

test("a stale invite still opens", () => {
  const days = epochDay(Date.now()) - 3;
  const session = restore(`m=1&ma=37.541,-77.436&b=30&rt=1&d=${days}`);
  assert.equal(session.meet?.mintedDay, days);
  assert.ok(session.partner !== null, "and is in every other respect a working invite");
});

// ----------------------------------------------------------------- minting

test("App never mints a link with a start the reader did not choose", () => {
  const invite = restore("m=1&ma=carytown&b=30&rt=1");
  const locked = meetLinks(invite, "https://walk.example", null, Date.now());
  assert.deepEqual(locked, { invite: null, answer: null });

  const answered = reduce(invite, { type: "origin", origin: PRESET_ORIGINS[1]! });
  const open = meetLinks(answered, "https://walk.example", null, Date.now());
  assert.notEqual(open.invite, null, "a chosen start can mint an invite");
  assert.equal(open.answer, null, "no pick, no answer link");
  // "mb is never a guess": an invite is the first link in a chain, so there is
  // nothing to echo.
  assert.equal(open.invite?.includes("mb="), false);

  const picked = meetLinks(answered, "https://walk.example", "shiplock", Date.now());
  assert.match(picked.answer ?? "", /mb=/);
  assert.match(picked.answer ?? "", /p=shiplock/);
});

test("the URL-clearing comparison is stable across a meet arrival", () => {
  // The test that stops the address bar wiping itself on the first paint.
  for (const query of [
    "m=1&ma=carytown&b=30&rt=1",
    "m=1&ma=37.512,-77.402&mb=carytown&b=30&rt=1&p=shiplock",
  ]) {
    const session = restore(query);
    assert.equal(liveLinkQuery(session, session.pickedId), session.shared?.linkQuery, query);
  }

  // ...and it stops matching at the correct moment: the reader setting their
  // own start makes `mb` appear, and the screen now shows a walk the address
  // bar does not describe.
  const invite = restore("m=1&ma=carytown&b=30&rt=1");
  const answered = reduce(invite, { type: "origin", origin: PRESET_ORIGINS[1]! });
  assert.notEqual(liveLinkQuery(answered, null), invite.shared?.linkQuery);
});

test("a lock-in travels with the link and only on a meet link", () => {
  // The whole of "both settle on a number first", with no server: a commitment
  // is one integer that rides a link somebody was already sending.
  const locked = encodeShare(input({ meet: true, placeId: null, lockedMinutes: 40 }));
  assert.match(locked, /(^|&)l=40(&|$)/);
  assert.equal(decodeShare(locked).lockedMinutes, 40);

  // A solo share has nobody to promise anything to.
  assert.equal(encodeShare(input({ lockedMinutes: 40 })).includes("l="), false);
  assert.equal(decodeShare("o=carytown&b=30&rt=1&l=40&p=shiplock").lockedMinutes, null);

  // Range-checked like `b`, so a forged value cannot name an impossible budget.
  assert.equal(decodeShare("m=1&ma=carytown&b=30&rt=1&l=9999").lockedMinutes, null);
  assert.equal(decodeShare("m=1&ma=carytown&b=30&rt=1&l=abc").lockedMinutes, null);

  // And it survives the round trip the cache key and og:url both rest on.
  assert.equal(canonicalQuery(decodeShare(locked)), locked);
});

test("an arriving lock reaches the session, and an absent one is null", () => {
  const arrived = restore("m=1&ma=carytown&b=30&rt=1&l=40");
  assert.equal(arrived.meet?.partnerLockedMinutes, 40);
  assert.equal(restore("m=1&ma=carytown&b=30&rt=1").meet?.partnerLockedMinutes, null);
});

test("meetLinks commits only when asked", () => {
  const session = reduce(restore("m=1&ma=carytown&b=30&rt=1"), {
    type: "origin",
    origin: PRESET_ORIGINS[1]!,
  });
  const reporting = meetLinks(session, "https://walk.example", null, Date.now());
  assert.equal(reporting.invite?.includes("l="), false, "sharing is not committing");

  const committing = meetLinks(session, "https://walk.example", null, Date.now(), true);
  assert.match(committing.invite ?? "", new RegExp(`l=${session.budgetMinutes}(&|$)`));
});
