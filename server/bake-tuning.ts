import { readFile, writeFile } from "node:fs/promises";
import { isFiniteNumber, isJsonObject, type Json } from "../src/lib/json.ts";
import { TUNING_DEFAULTS, TUNING_RANGE, type Tuning } from "../src/app/tuning.ts";

/**
 * Writes the panel's current settings into the source as the new defaults.
 *
 * The tuning panel saves to localStorage, and a stored value beats the
 * default forever after - which is right while dialling something in and
 * wrong once it is dialled in. Until now the only way to promote a setting
 * from "what this browser does" to "what the app does" was to read the
 * numbers off the panel and retype them into tuning.ts, which is exactly the
 * kind of transcription that quietly ends up one digit out.
 *
 * Dev only, and structurally so: this is reachable only through the Vite dev
 * server's middleware, which does not exist in a build. It writes to a source
 * file, so it must never be anything a deployed server could route to.
 */

const SOURCE = new URL("../src/app/tuning.ts", import.meta.url);

/**
 * Matches the whole `TUNING_DEFAULTS` literal. `[^}]*` is enough because the
 * object is flat - a nested object would need a real parse, and would be a
 * sign this had outgrown a regex.
 */
const DEFAULTS_BLOCK = /export const TUNING_DEFAULTS: Tuning = \{[^}]*\};/;

export type BakeResult = { ok: true; tuning: Tuning } | { ok: false; error: string };

/**
 * Reads the posted settings against the shape and bounds the panel itself
 * uses. Anything missing keeps the value already in the source, so a partial
 * body cannot silently blank a setting.
 */
function readTuning(payload: Json): BakeResult {
  if (!isJsonObject(payload)) {
    return { ok: false, error: "expected an object of tuning values" };
  }

  const next: Tuning = { ...TUNING_DEFAULTS };
  // SAFETY: TUNING_DEFAULTS is a local object literal declared as Tuning, so
  // its own enumerable keys are exactly Tuning's. Object.keys is typed
  // string[] only because a wider object could be passed in; none can here.
  const keys = Object.keys(TUNING_DEFAULTS) as (keyof Tuning)[];

  for (const key of keys) {
    const value = payload[key];
    if (value === undefined) continue;

    if (key === "soundEnabled" || key === "spinCircularOrder") {
      if (value !== true && value !== false) {
        return { ok: false, error: `${key} must be true or false` };
      }
      next[key] = value;
      continue;
    }

    const { min, max } = TUNING_RANGE[key];
    if (!isFiniteNumber(value)) return { ok: false, error: `${key} must be a number` };
    if (value < min || value > max) {
      return { ok: false, error: `${key} must be between ${min} and ${max}` };
    }
    next[key] = value;
  }

  return { ok: true, tuning: next };
}

/** Rebuilds the literal, one key per line, in the order the type declares. */
function render(next: Tuning): string {
  // SAFETY: as above - the keys of a Tuning literal are Tuning's keys.
  const keys = Object.keys(TUNING_DEFAULTS) as (keyof Tuning)[];
  const lines = keys.map((key) => `  ${key}: ${JSON.stringify(next[key])},`);
  return `export const TUNING_DEFAULTS: Tuning = {\n${lines.join("\n")}\n};`;
}

export async function bakeTuning(payload: Json): Promise<BakeResult> {
  const read = readTuning(payload);
  if (!read.ok) return read;

  const source = await readFile(SOURCE, "utf8");
  if (!DEFAULTS_BLOCK.test(source)) {
    return { ok: false, error: "could not find TUNING_DEFAULTS in src/app/tuning.ts" };
  }

  // The comment above the literal, and everything else in the file, is left
  // exactly as it was: only the values move.
  await writeFile(SOURCE, source.replace(DEFAULTS_BLOCK, render(read.tuning)), "utf8");
  return read;
}
