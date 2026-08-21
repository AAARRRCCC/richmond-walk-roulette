import { test } from "node:test";
import assert from "node:assert/strict";
import { describeResult, walkClauses } from "./announce.ts";
import type { WalkingRoute } from "../lib/route.ts";

const route = (durationSeconds: number, distanceMeters: number): WalkingRoute => ({
  durationSeconds,
  distanceMeters,
  coords: [],
});

test("announce: the clauses are joined and the sentence is terminated", () => {
  assert.equal(
    describeResult(["Belle Isle", "24 min on foot", "1.1 mi"]),
    "Belle Isle, 24 min on foot, 1.1 mi.",
  );
});

test("announce: a feature with nothing to say costs the sentence nothing", () => {
  // This is what lets App pass a fixed-length array in a fixed order without
  // every caller having to filter first - which is how a clause ends up in the
  // wrong place.
  assert.equal(describeResult(["Belle Isle", "", "1.1 mi"]), "Belle Isle, 1.1 mi.");
  assert.equal(describeResult(["", ""]), "");
  assert.equal(describeResult([]), "");
});

test("announce: a round trip doubles both the time and the distance it announces", () => {
  const there = route(1500, 2000);
  assert.deepEqual(walkClauses(there, false, false), ["25 min on foot", "1.2 mi"]);
  assert.deepEqual(walkClauses(there, false, true), ["50 min out and back", "2.5 mi"]);
});

test("announce: a route that failed says so, and one still coming says something different", () => {
  // Both are one clause, not zero: a skeleton means "still coming", and once
  // the attempts are spent, saying nothing would be a lie.
  assert.deepEqual(walkClauses(null, true, false), ["walk time unavailable"]);
  assert.deepEqual(walkClauses(null, false, false), ["no walking route"]);
});
