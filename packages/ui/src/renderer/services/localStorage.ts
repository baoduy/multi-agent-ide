/**
 * localStorage.ts — Reusable, typed localStorage persistence layer.
 *
 * Provides:
 *   - `localStore<T>()` — a typed accessor for a single localStorage key
 *     with JSON serialization, debounced writes, and a fallback when
 *     localStorage is unavailable (e.g. SSR, certain Electron configs).
 *
 *   - `createPersistedState<T>()` — builds a Zustand-compatible slice
 *     backed by localStorage. Reads on init, writes on every `set()`.
 *
 * All writes are debounced by default (300 ms) so rapid-fire UI updates
 * (panel resizing, tab switching) don't hammer the storage API.
 */

/* ── Low-level typed accessor ── */

export type LocalStore<T> = {
  /** Read the current value (returns `fallback` on error / missing key). */
  get(): T;
  /** Write a value (debounced). */
  set(value: T): void;
  /** Merge a partial update into the stored value (debounced). Objects only. */
  patch(partial: Partial<T>): void;
  /** Remove the key entirely. */
  remove(): void;
  /** Immediately flush any pending debounced write. */
  flush(): void;
};

type LocalStoreOptions<T> = {
  /** localStorage key */
  key: string;
  /** Value returned when the key is missing or unparseable */
  fallback: T;
  /** Debounce interval in ms (default 300) */
  debounceMs?: number;
  /** Optional migration/validation — runs on every `get()`.
   *  Return the cleaned value or `undefined` to fall back to `fallback`. */
  validate?: (raw: unknown) => T | undefined;
};

function storageAvailable(): boolean {
  try {
    return typeof globalThis.localStorage !== "undefined" && globalThis.localStorage !== null;
  } catch {
    return false;
  }
}

export function localStore<T>(opts: LocalStoreOptions<T>): LocalStore<T> {
  const { key, fallback, debounceMs = 300, validate } = opts;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: T | null = null;

  function read(): T {
    if (!storageAvailable()) return fallback;
    try {
      const raw = globalThis.localStorage.getItem(key);
      if (raw === null) return fallback;
      const parsed: unknown = JSON.parse(raw);
      if (validate) {
        const validated = validate(parsed);
        return validated !== undefined ? validated : fallback;
      }
      return parsed as T;
    } catch {
      return fallback;
    }
  }

  function scheduleWrite(value: T): void {
    pending = value;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      flushNow();
    }, debounceMs);
  }

  function flushNow(): void {
    if (pending === null) return;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!storageAvailable()) {
      pending = null;
      return;
    }
    try {
      globalThis.localStorage.setItem(key, JSON.stringify(pending));
    } catch (err) {
      console.warn(`[localStorage] Failed to write key "${key}":`, err);
    }
    pending = null;
  }

  return {
    get: read,
    set(value: T) {
      scheduleWrite(value);
    },
    patch(partial: Partial<T>) {
      const current = pending ?? read();
      const merged = { ...current, ...partial } as T;
      scheduleWrite(merged);
    },
    remove() {
      if (timer) clearTimeout(timer);
      pending = null;
      if (storageAvailable()) {
        try {
          globalThis.localStorage.removeItem(key);
        } catch { /* ignore */ }
      }
    },
    flush: flushNow,
  };
}

/* ── Per-repo scoped store ── */

/**
 * A scoped store that namespaces values by a dynamic key (e.g. repoPath).
 * Each scoped key gets its own debounced localStorage entry.
 *
 * Storage layout: `${prefix}:${scopeKey}` → JSON value
 */
export type ScopedStore<T> = {
  get(scopeKey: string): T;
  set(scopeKey: string, value: T): void;
  patch(scopeKey: string, partial: Partial<T>): void;
  remove(scopeKey: string): void;
  flush(): void;
};

type ScopedStoreOptions<T> = {
  /** Prefix for the localStorage key. Final key = `${prefix}:${scopeKey}` */
  prefix: string;
  /** Fallback when a scoped key is missing */
  fallback: T;
  debounceMs?: number;
  validate?: (raw: unknown) => T | undefined;
};

export function scopedStore<T>(opts: ScopedStoreOptions<T>): ScopedStore<T> {
  const { prefix, fallback, debounceMs = 300, validate } = opts;
  const stores = new Map<string, LocalStore<T>>();

  function getOrCreate(scopeKey: string): LocalStore<T> {
    let store = stores.get(scopeKey);
    if (!store) {
      store = localStore<T>({
        key: `${prefix}:${scopeKey}`,
        fallback,
        debounceMs,
        validate,
      });
      stores.set(scopeKey, store);
    }
    return store;
  }

  return {
    get(scopeKey: string) {
      return getOrCreate(scopeKey).get();
    },
    set(scopeKey: string, value: T) {
      getOrCreate(scopeKey).set(value);
    },
    patch(scopeKey: string, partial: Partial<T>) {
      getOrCreate(scopeKey).patch(partial);
    },
    remove(scopeKey: string) {
      getOrCreate(scopeKey).remove();
      stores.delete(scopeKey);
    },
    flush() {
      for (const store of stores.values()) {
        store.flush();
      }
    },
  };
}
