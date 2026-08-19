/**
 * The JSON value domain, the two functions that bring data into it, and the
 * guards that narrow it.
 *
 * `JSON.parse` and `Response.json()` are typed `any`, so every call site that
 * annotated their result was really laundering an `any` into a domain type.
 * `parseJson` and `readJson` are the only places that widening happens: they
 * state what those functions actually guarantee — a value somewhere in the
 * JSON domain, nothing more — and everything downstream narrows from there.
 *
 * The guards avoid `typeof` on purpose. Each one compares the value's own
 * class tag, which names the domain it belongs to rather than tagging its
 * machine representation, and unlike `typeof` it tells an array apart from an
 * object.
 */

export type Json = null | boolean | number | string | readonly Json[] | JsonObject;

export type JsonObject = { readonly [key: string]: Json };

function classOf(value: Json | undefined): string {
  return Object.prototype.toString.call(value);
}

/** Non-array JSON object. */
export function isJsonObject(value: Json | undefined): value is JsonObject {
  return classOf(value) === "[object Object]";
}

/** Finite number: JSON admits no NaN or Infinity, so neither does this. */
export function isFiniteNumber(value: Json | undefined): value is number {
  return classOf(value) === "[object Number]" && Number.isFinite(value);
}

export function isString(value: Json | undefined): value is string {
  return classOf(value) === "[object String]";
}

/**
 * JSON array. `Array.isArray` is declared `arg is any[]`, so narrowing with
 * it would put `any` back into a parsed payload; this keeps the element type
 * in the Json domain.
 */
export function isJsonArray(value: Json | undefined): value is readonly Json[] {
  return classOf(value) === "[object Array]";
}

/**
 * The JSON text boundary. Throws on malformed input, like `JSON.parse` — the
 * callers that tolerate that catch it and answer with their own error.
 */
export function parseJson(text: string): Json {
  // SAFETY: JSON.parse is typed `any` but returns only JSON values, which is
  // exactly the Json domain. This is the one place that fact is asserted.
  return JSON.parse(text) as Json;
}

/**
 * The HTTP body boundary: the JSON payload of a request or a response, in
 * the Json domain. Both sides of the proxy read bodies this way.
 */
export async function readJson(message: Request | Response): Promise<Json> {
  // SAFETY: as parseJson — .json() is typed `any` and yields the parse of a
  // JSON body, so its values are Json by construction.
  return (await message.json()) as Json;
}
