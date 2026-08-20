import { isFiniteNumber, isJsonArray, isJsonObject, isString, parseJson } from "./json.ts";

/**
 * Walking routes that survive a reload.
 *
 * A route between two fixed points is deterministic for the life of a tile
 * build, and the app asks for the same few dozen of them every single time it
 * starts: sixty-two destinations from whichever origin you left it on. Holding
 * them only in memory meant every reload was a fresh burst at the engine,
 * which against a shared instance is how you meet its rate limiter - and the
 * limiter answers slowly, so the reel sits waiting on routes it already had
 * yesterday.
 *
 * What is stored is the engine's own encoded polyline per leg, not the decoded
 * coordinates. The wire form is roughly a twentieth of the size and decoding
 * it is the same work the fetch path already does, so this costs bytes the
 * browser was going to spend anyway and saves the request entirely.
 */

const STORAGE_KEY = "walk-roulette:routes";

/**
 * Bumped when the shape below changes, or when something upstream makes old
 * answers wrong - a new tile build, a change to the walking speed the proxy
 * pins. An unrecognised version is dropped rather than migrated.
 */
const SCHEMA_VERSION = 1;

/**
 * How long an answer stays good. A week is well inside the life of a tile
 * build and short enough that a rebuilt graph works its way through without
 * anyone clearing anything.
 */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Roughly a dozen origins' worth. Far under the 5 MB localStorage typically
 * allows at about 700 bytes an entry, and bounded so a long-lived browser
 * cannot grow this without limit.
 */
const MAX_ENTRIES = 800;

/**
 * Writes are batched. A warm-up settles sixty routes in a couple of seconds,
 * and serialising the whole store on each one is quadratic work on the thread
 * the map is drawing on.
 */
const FLUSH_DELAY_MS = 1500;

/**
 * `encodedLegs: null` is the engine saying there is no walking route between these
 * two points - a fact about the city, worth keeping. A failed attempt is never
 * stored: it is a fact about one request, and reading it back tomorrow as an
 * answer is exactly the confusion `FAILED` exists to prevent.
 */
export type StoredRoute = {
  at: number;
  encodedLegs: string[] | null;
  distanceMeters: number;
  durationSeconds: number;
};

let entries: Map<string, StoredRoute> | null = null;
let flushTimer = 0;

function readStorage(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // Private mode, or storage disabled. The app runs, it just re-asks.
    return null;
  }
}

function hydrate(): Map<string, StoredRoute> {
  if (entries) return entries;
  const loaded = new Map<string, StoredRoute>();
  entries = loaded;

  const raw = readStorage();
  if (raw === null) return loaded;

  const parsed = parseJson(raw);
  if (!isJsonObject(parsed)) return loaded;
  if (parsed["version"] !== SCHEMA_VERSION) return loaded;

  const routes = parsed["routes"];
  if (!isJsonObject(routes)) return loaded;

  const oldest = Date.now() - TTL_MS;
  for (const [key, value] of Object.entries(routes)) {
    if (!isJsonObject(value)) continue;

    const at = value["at"];
    if (!isFiniteNumber(at) || at < oldest) continue;

    const distanceMeters = value["distanceMeters"];
    const durationSeconds = value["durationSeconds"];
    if (!isFiniteNumber(distanceMeters) || !isFiniteNumber(durationSeconds)) continue;

    const encodedLegs = value["encodedLegs"];
    if (encodedLegs === null) {
      loaded.set(key, { at, encodedLegs: null, distanceMeters, durationSeconds });
      continue;
    }
    if (!isJsonArray(encodedLegs)) continue;
    const walked = encodedLegs.filter((leg) => isString(leg));
    // Every leg or none: a route missing a middle section would draw a line
    // that jumps, which is worse than asking the engine again.
    if (walked.length !== encodedLegs.length) continue;

    loaded.set(key, { at, encodedLegs: walked, distanceMeters, durationSeconds });
  }
  return loaded;
}

/** The stored answer for this pair, or undefined if there is not a fresh one. */
export function storedRoute(key: string): StoredRoute | undefined {
  return hydrate().get(key);
}

/** Records an answer. Written to storage on the next flush, not immediately. */
export function rememberRoute(key: string, route: Omit<StoredRoute, "at">): void {
  const store = hydrate();
  // Re-inserted rather than updated, so the map's own insertion order is
  // oldest-first and trimming is a walk from the front.
  store.delete(key);
  store.set(key, { at: Date.now(), ...route });
  scheduleFlush();
}

function scheduleFlush(): void {
  if (flushTimer !== 0) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = 0;
    flush();
  }, FLUSH_DELAY_MS);
}

/**
 * Exported for the page-hide handler: a tab closed inside the flush delay
 * would otherwise throw away everything it just learned.
 */
export function flush(): void {
  const store = entries;
  if (!store) return;

  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next();
    if (oldest.done === true) break;
    store.delete(oldest.value);
  }

  const routes: Record<string, StoredRoute> = {};
  for (const [key, value] of store) routes[key] = value;

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: SCHEMA_VERSION, routes }),
    );
  } catch {
    // Over quota, or storage disabled. Halve what is held and let the next
    // flush try again with less rather than losing the lot.
    const keep = Math.floor(store.size / 2);
    while (store.size > keep) {
      const oldest = store.keys().next();
      if (oldest.done === true) break;
      store.delete(oldest.value);
    }
  }
}
