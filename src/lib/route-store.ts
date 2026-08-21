import {
  isFiniteNumber,
  isJsonArray,
  isJsonObject,
  isString,
  parseJson,
  type Json,
} from "./json.ts";

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
const SCHEMA_VERSION = 2;

/**
 * How long an answer stays good. A week is well inside the life of a tile
 * build and short enough that a rebuilt graph works its way through without
 * anyone clearing anything.
 */
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Roughly nine origins' worth, down from a dozen, because an entry got bigger.
 *
 * Shown rather than asserted, since the previous figure was a guess. An entry
 * was about 700 bytes; it now also carries a whole-metre elevation sample every
 * 30 m, and Richmond elevations are two or three digits, so each sample costs
 * 3-4 bytes of JSON including its comma and the wrapper keys about 30. A
 * 25-minute leg at 3.69 km/h is ~1,540 m, so ~52 samples: about +240 bytes. The
 * 100-minute ceiling is ~6,150 m, so ~206 samples: about +850 bytes. Entries run
 * ~940 bytes typical and ~1,550 worst case.
 *
 * 600 of those is ~560 KB, which is exactly the budget this store already kept,
 * and an implausible store of nothing but 100-minute walks still lands under
 * 1 MB - far inside the 5 MB localStorage usually allows. Halving to 400 would
 * have thrown away six origins of warm cache to buy headroom the arithmetic
 * does not need.
 */
const MAX_ENTRIES = 600;

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
/**
 * The compact stored form of an `ElevationProfile`. Named rather than inlined
 * so the reader below can return it without dragging `undefined` along from the
 * optional property it eventually lands in.
 */
type StoredProfile = { i: number; e: number[]; up: number; down: number };

export type StoredRoute = {
  at: number;
  encodedLegs: string[] | null;
  distanceMeters: number;
  durationSeconds: number;
  /**
   * Absent when the engine gave no usable profile. Short keys and whole-metre
   * samples: a metre is finer than a chart floored at a 20 m range can show, and
   * rounding halves the bytes. `up`/`down` are computed before the rounding,
   * because deriving them from rounded samples manufactures oscillation.
   */
  profile?: StoredProfile;
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

/**
 * A stored profile, narrowed field by field, or null.
 *
 * Narrowed rather than trusted: this comes back out of localStorage, which any
 * extension or earlier build of this app can have written, and a sample array
 * with a string in it would reach the chart as a NaN in the middle of a line.
 */
function readProfile(value: Json | undefined): StoredProfile | null {
  if (!isJsonObject(value)) return null;
  const interval = value["i"];
  const up = value["up"];
  const down = value["down"];
  const samples = value["e"];
  if (!isFiniteNumber(interval) || interval <= 0) return null;
  if (!isFiniteNumber(up) || !isFiniteNumber(down)) return null;
  if (!isJsonArray(samples) || samples.length < 2) return null;
  const numbers = samples.filter((sample) => isFiniteNumber(sample));
  // Positional data: one bad sample shifts every later one, so it is all or
  // nothing rather than a filtered subset.
  if (numbers.length !== samples.length) return null;
  return { i: interval, e: numbers, up, down };
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

    const profile = readProfile(value["profile"]);
    loaded.set(
      key,
      profile === null
        ? { at, encodedLegs: walked, distanceMeters, durationSeconds }
        : { at, encodedLegs: walked, distanceMeters, durationSeconds, profile },
    );
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
