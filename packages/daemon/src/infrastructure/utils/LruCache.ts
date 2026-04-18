/**
 * Bounded LRU cache with per-entry byte accounting.
 *
 * Insert order is maintained by re-inserting keys on access (Map preserves
 * insertion order). Eviction is O(1) amortized — we always evict the oldest
 * entry, which is the first key in the underlying Map.
 *
 * Entries can carry an optional byte weight so the cache can cap total memory
 * in addition to entry count. When either cap is exceeded, the oldest entries
 * are evicted until both are satisfied.
 */
export interface LruCacheOptions {
  /** Maximum number of entries retained. Ignored when <= 0. */
  maxEntries?: number;
  /** Maximum total byte weight retained. Ignored when <= 0. */
  maxBytes?: number;
}

type Entry<V> = { value: V; bytes: number };

export class LruCache<K, V> {
  private readonly map = new Map<K, Entry<V>>();
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private totalBytes = 0;

  constructor(options: LruCacheOptions = {}) {
    this.maxEntries = options.maxEntries && options.maxEntries > 0 ? options.maxEntries : 0;
    this.maxBytes = options.maxBytes && options.maxBytes > 0 ? options.maxBytes : 0;
  }

  get size(): number {
    return this.map.size;
  }

  get bytes(): number {
    return this.totalBytes;
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    // Refresh recency by reinserting.
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  set(key: K, value: V, bytes = 0): void {
    const existing = this.map.get(key);
    if (existing) {
      this.totalBytes -= existing.bytes;
      this.map.delete(key);
    }
    this.map.set(key, { value, bytes });
    this.totalBytes += bytes;
    this.evictIfNeeded();
  }

  delete(key: K): boolean {
    const existing = this.map.get(key);
    if (!existing) return false;
    this.totalBytes -= existing.bytes;
    this.map.delete(key);
    return true;
  }

  clear(): void {
    this.map.clear();
    this.totalBytes = 0;
  }

  /**
   * Remove every entry whose key passes `predicate`. Useful for invalidating
   * all entries tied to a given repo path without scanning externally.
   */
  invalidateWhere(predicate: (key: K) => boolean): number {
    let removed = 0;
    for (const key of Array.from(this.map.keys())) {
      if (predicate(key)) {
        const e = this.map.get(key);
        if (e) this.totalBytes -= e.bytes;
        this.map.delete(key);
        removed++;
      }
    }
    return removed;
  }

  private evictIfNeeded(): void {
    if (this.maxEntries > 0) {
      while (this.map.size > this.maxEntries) {
        const oldest = this.map.keys().next();
        if (oldest.done) break;
        const e = this.map.get(oldest.value);
        if (e) this.totalBytes -= e.bytes;
        this.map.delete(oldest.value);
      }
    }
    if (this.maxBytes > 0) {
      while (this.totalBytes > this.maxBytes) {
        const oldest = this.map.keys().next();
        if (oldest.done) break;
        const e = this.map.get(oldest.value);
        if (e) this.totalBytes -= e.bytes;
        this.map.delete(oldest.value);
      }
    }
  }
}
