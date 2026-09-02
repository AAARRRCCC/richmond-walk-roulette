/**
 * The two identifiers a room runs on, minted on the client.
 *
 * A **room id** is the whole credential for a room (CONTEXT.md): eight
 * Crockford base32 characters, 40 bits, deliberately short of unguessable
 * because the join path is rate limited and that is the real control (#14).
 * A **device token** names a seat, so the relay can tell the same walker
 * coming back from a third device arriving.
 *
 * Both take their randomness as an argument so the minting is a pure function
 * a test can pin; `crypto.getRandomValues` is the one production source.
 */

/** Crockford's alphabet: no I, L, O or U, so a read-aloud id has no lookalikes. */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const ROOM_ID_LENGTH = 8;

/** Mirrors the relay's own check in `server/rooms.ts`; case-folded before it is applied. */
const ROOM_ID = /^[0-9A-HJKMNP-TV-Z]{8}$/;

/** Mirrors the relay's bound on a token: 8 to 64 URL-safe characters. */
const DEVICE_TOKEN = /^[A-Za-z0-9_-]{8,64}$/;

/** The id as the relay stores it, or null when the string is not one. */
export function normaliseRoomId(raw: string): string | null {
  const id = raw.toUpperCase();
  return ROOM_ID.test(id) ? id : null;
}

export function isDeviceToken(raw: string): boolean {
  return DEVICE_TOKEN.test(raw);
}

/**
 * Eight characters from five bytes of entropy; the first eight of the array
 * are consumed one per character, masked to five bits each. Three bits of
 * every byte are wasted, which costs nothing and keeps the mapping readable.
 */
export function mintRoomId(random: (length: number) => Uint8Array): string {
  const bytes = random(ROOM_ID_LENGTH);
  let id = "";
  for (let i = 0; i < ROOM_ID_LENGTH; i++) id += CROCKFORD[(bytes[i] ?? 0) & 31];
  return id;
}

/** Sixteen bytes, base64url, 22 characters: comfortably inside the relay's bound. */
export function mintDeviceToken(random: (length: number) => Uint8Array): string {
  const bytes = random(16);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
