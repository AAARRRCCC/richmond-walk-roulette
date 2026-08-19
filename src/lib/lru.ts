/**
 * Fixed-size map with least-recently-used eviction.
 *
 * Reads come in two flavours on purpose. `get` marks an entry as recently
 * used; `peek` leaves the eviction order alone. The contour and route caches
 * are read during render — a dial scrub reads the same few entries every
 * frame — and spending that on queue reordering would be pure overhead, so
 * the render path peeks and only the fetch path promotes.
 *
 * `undefined` is never stored. A caller that needs to distinguish "stored,
 * and the answer is nothing" from "never fetched" stores null and asks `has`.
 */
export class LruMap<K, V> {
  readonly #entries = new Map<K, V>();
  readonly #limit: number;

  constructor(limit: number) {
    this.#limit = limit;
  }

  get size(): number {
    return this.#entries.size;
  }

  has(key: K): boolean {
    return this.#entries.has(key);
  }

  /** Read without affecting eviction order. */
  peek(key: K): V | undefined {
    return this.#entries.get(key);
  }

  /** Read and promote to most-recently-used. */
  get(key: K): V | undefined {
    const value = this.#entries.get(key);
    if (value !== undefined) {
      // Map iterates in insertion order, so deleting and re-inserting moves
      // this entry to the tail, which is what keeps eviction honest.
      this.#entries.delete(key);
      this.#entries.set(key, value);
    }
    return value;
  }

  /** Insert as most-recently-used, evicting the oldest entry past the limit. */
  set(key: K, value: V): void {
    // Refreshing a key already present must not cost an unrelated entry.
    this.#entries.delete(key);
    if (this.#entries.size >= this.#limit) {
      const oldest = this.#entries.keys().next();
      if (!oldest.done) this.#entries.delete(oldest.value);
    }
    this.#entries.set(key, value);
  }
}
