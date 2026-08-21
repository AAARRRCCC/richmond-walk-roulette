import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CAVEAT_ACCURACY_METERS,
  MAX_ACCURACY_METERS,
  describeGeolocationError,
  judgeFix,
  locateActionLabel,
  nearestPreset,
} from "./locate.ts";
import { PRESET_ORIGINS } from "../data/places.ts";

/** Monroe Ward — the fixture `server/proxy.test.ts` already uses. */
const DOWNTOWN = { lat: 37.5464, lng: -77.4517 };

const fixAt = (accuracyMeters: number) => ({ ...DOWNTOWN, accuracyMeters });

test("locate: a good downtown fix is accepted with no caveat", () => {
  const outcome = judgeFix(fixAt(18));

  assert.equal(outcome.kind, "accepted");
  if (outcome.kind !== "accepted") return;
  assert.equal(outcome.origin.id, "me");
  assert.equal(outcome.origin.name, "My location");
  assert.equal(outcome.origin.lat, DOWNTOWN.lat, "coordinates are preserved exactly");
  assert.equal(outcome.origin.lng, DOWNTOWN.lng);
  assert.equal(outcome.caveat, null);
});

test("locate: a merely-fuzzy fix is accepted with a caveat", () => {
  const outcome = judgeFix(fixAt(140));

  assert.equal(outcome.kind, "accepted");
  if (outcome.kind !== "accepted") return;
  assert.notEqual(outcome.caveat, null);
  assert.ok(outcome.caveat?.message.includes("140 m"), outcome.caveat?.message ?? "no caveat");
  // An accepted fix is never a warning: shouting it in amber tells the reader
  // something went wrong when nothing did.
  assert.equal(outcome.caveat?.tone, "info");
  assert.equal(outcome.caveat?.suggest, null);
});

test("locate: the thresholds are boundaries, not ranges", () => {
  // Both halves. The literals lock the numbers the prose argues for, and the
  // constants are what the boundaries are taken from - so moving a threshold
  // without moving the prose fails here, and moving it without moving the
  // boundary cannot happen at all.
  assert.equal(CAVEAT_ACCURACY_METERS, 100);
  assert.equal(MAX_ACCURACY_METERS, 250);

  const atCaveat = judgeFix(fixAt(CAVEAT_ACCURACY_METERS));
  const pastCaveat = judgeFix(fixAt(CAVEAT_ACCURACY_METERS + 1));
  assert.equal(atCaveat.kind, "accepted");
  assert.equal(atCaveat.kind === "accepted" ? atCaveat.caveat : "not accepted", null);
  assert.notEqual(pastCaveat.kind === "accepted" ? pastCaveat.caveat : null, null);

  assert.equal(judgeFix(fixAt(MAX_ACCURACY_METERS)).kind, "accepted");
  assert.equal(judgeFix(fixAt(MAX_ACCURACY_METERS + 1)).kind, "rejected");
});

test("locate: a hopeless fix is refused and states its own accuracy with the unit", () => {
  const outcome = judgeFix(fixAt(3100));

  assert.equal(outcome.kind, "rejected");
  if (outcome.kind !== "rejected") return;
  assert.equal(outcome.error.tone, "warn");
  assert.equal(outcome.error.suggest, null);
  // Asserted with the unit. "3.1" alone would pass for a message reading
  // "within about 3.1 m", which is the exact failure this string exists to
  // avoid.
  assert.ok(outcome.error.message.includes("3.1 km"), outcome.error.message);
});

test("locate: bounds beat accuracy", () => {
  // A wildly inaccurate fix in another state should be told about the state,
  // which is the fact that actually explains why this app cannot help.
  const outcome = judgeFix({ lat: 38.0293, lng: -78.4767, accuracyMeters: 5000 });

  assert.equal(outcome.kind, "rejected");
  if (outcome.kind !== "rejected") return;
  assert.ok(outcome.error.message.includes("only has Richmond"), outcome.error.message);
  assert.notEqual(outcome.error.suggest, null);
});

test("locate: the offered preset is the nearest one, pinned by id", () => {
  // Hard-coded winners, computed by hand from PRESET_ORIGINS. A test that
  // recomputes the implementation asserts nothing. If a preset is ever added
  // north of Scott's Addition or east of Libby Hill this fails, which is
  // correct - the offered preset changed.
  const north = judgeFix({ lat: 37.95, lng: -77.44, accuracyMeters: 20 });
  const east = judgeFix({ lat: 37.53, lng: -77.05, accuracyMeters: 20 });

  assert.equal(north.kind === "rejected" ? north.error.suggest?.id : null, "scotts-add");
  assert.equal(east.kind === "rejected" ? east.error.suggest?.id : null, "libby-hill");
});

test("locate: nearestPreset never returns undefined", () => {
  const ids = new Set(PRESET_ORIGINS.map((preset) => preset.id));
  for (let lat = 36.5; lat <= 38.5; lat += 0.5) {
    for (let lng = -78.5; lng <= -76.5; lng += 0.5) {
      const winner = nearestPreset({ lat, lng });
      assert.ok(ids.has(winner.id), `${lat},${lng} produced ${winner.id}`);
    }
  }
});

test("locate: a non-finite fix is refused by name", () => {
  // Without the guard, NaN falls through `insideRichmond` as false and
  // `nearestPreset` reduces to the first preset, so an un-guarded
  // implementation still passes an "is rejected" assertion while confidently
  // saying "you are outside Richmond, start from Home". Asserting the ABSENCE
  // of the suggestion is the part that detects it.
  for (const fix of [
    { lat: Number.NaN, lng: -77.44, accuracyMeters: 20 },
    { lat: 37.54, lng: -77.44, accuracyMeters: Number.POSITIVE_INFINITY },
  ]) {
    const outcome = judgeFix(fix);
    assert.equal(outcome.kind, "rejected");
    if (outcome.kind !== "rejected") continue;
    assert.equal(outcome.error.suggest, null, "not a preset offer");
    assert.ok(!outcome.error.message.includes("only has Richmond"), "not the out-of-bounds sentence");
  }
});

test("locate: the four error codes are four different sentences", () => {
  const blockedInsecure = describeGeolocationError(1, false);
  const blocked = describeGeolocationError(1, true);
  const unavailable = describeGeolocationError(2, true);
  const timeout = describeGeolocationError(3, true);
  const all = [blockedInsecure, blocked, unavailable, timeout];

  assert.equal(new Set(all.map((notice) => notice.message)).size, 4);
  for (const notice of all) {
    assert.ok(notice.message.length > 0);
    assert.equal(notice.suggest, null, "a permission problem is not solved by starting from Maymont");
  }
  assert.ok(blockedInsecure.message.includes("secure connection"));
  assert.ok(!blocked.message.includes("secure connection"));
});

test("locate: an unknown code degrades to unavailable", () => {
  assert.deepEqual(describeGeolocationError(99, true), describeGeolocationError(2, true));
});

test("locate: every message names a way forward", () => {
  // The house rule that the panel always says what to do next, guarded cheaply.
  for (const code of [1, 2, 3, 99]) {
    for (const secure of [true, false]) {
      assert.ok(describeGeolocationError(code, secure).message.includes("pin"), `code ${code}`);
    }
  }
  for (const fix of [fixAt(3100), { lat: Number.NaN, lng: -77.44, accuracyMeters: 20 }]) {
    const outcome = judgeFix(fix);
    if (outcome.kind === "rejected" && outcome.error.suggest === null) {
      assert.ok(outcome.error.message.includes("pin"), outcome.error.message);
    }
  }
});

test("locate: label decoration", () => {
  // Safari reports "prompt" where other browsers report "unknown"; that lie
  // must not produce two different buttons.
  assert.notEqual(locateActionLabel("denied"), locateActionLabel("prompt"));
  assert.equal(locateActionLabel("prompt"), locateActionLabel("unknown"));
});
