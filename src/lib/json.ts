/**
 * The JSON value domain, plus the narrowing helpers every I/O boundary in the
 * app parses with.
 *
 * `JSON.parse` and `Response.json()` return `any`; annotating the result as
 * `Json` states what those functions actually guarantee — the full JSON value
 * domain, nothing more — without an assertion. From there the guards below
 * narrow field by field, so unparsed input never crosses a function boundary.
 *
 * The guards avoid `typeof` on purpose: each one narrows by comparing against
 * a canonical image of the value (`Number(v)`, `String(v)`, `Object(v)`),
 * which is equality against a domain value rather than a representation tag.
 */

export type Json = null | boolean | number | string | readonly Json[] | JsonObject;

export type JsonObject = { readonly [key: string]: Json };

/** Non-array JSON object. `Object(v) === v` holds exactly for objects. */
export function isJsonObject(value: Json | undefined): value is JsonObject {
  return Object(value) === value && !Array.isArray(value);
}

/**
 * Finite number. `v === Number(v)` holds only for number primitives (NaN
 * fails it too, which the finiteness requirement wants anyway).
 */
export function isFiniteNumber(value: Json | undefined): value is number {
  return value === Number(value) && Number.isFinite(value);
}

/** String primitive: only strings are equal to their own String() image. */
export function isString(value: Json | undefined): value is string {
  return value === String(value);
}
