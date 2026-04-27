import fs from "node:fs";
import { open, type Database, type RootDatabase, type RangeOptions } from "lmdb";

/**
 * Options for opening a logical sub-database.
 *
 * Each logical "table" is a named sub-db inside the single shared LMDB env.
 * Keys are strings. Values are encoded with msgpack by default.
 */
export interface OpenDbOptions {
  /** Encoding for values. Defaults to `"msgpack"`. */
  encoding?: "msgpack" | "json" | "string" | "binary";
}

export interface LmdbRange {
  /** Inclusive start key. */
  start?: string;
  /** Exclusive end key. */
  end?: string;
  /**
   * Convenience: iterate all keys that begin with this prefix.
   * Expands to `start = prefix`, `end = prefix + '\uffff'`.
   */
  prefix?: string;
  /** Reverse iteration order. */
  reverse?: boolean;
  /** Hard cap on emitted entries. */
  limit?: number;
}

export interface LmdbEntry<V> {
  key: string;
  value: V;
}

/**
 * Thin wrapper around an LMDB environment exposing the minimum API the
 * daemon's repository layer needs: string-keyed typed get / put / remove,
 * range iteration (incl. prefix scans), and write batching via transactions.
 *
 * Single shared env across the daemon process — one LMDB env per on-disk
 * directory. Sub-dbs are logical partitions inside that env, each behaving
 * like a separate key space.
 */
export class LmdbStore {
  private readonly env: RootDatabase;
  private readonly dbs = new Map<string, Database<unknown, string>>();

  constructor(env: RootDatabase) {
    this.env = env;
  }

  /**
   * Open the LMDB environment at `directoryPath`. LMDB uses a directory
   * (containing `data.mdb` and `lock.mdb`), not a single file.
   */
  static open(directoryPath: string): LmdbStore {
    fs.mkdirSync(directoryPath, { recursive: true });
    const env = open({
      path: directoryPath,
      // Root env; actual data lives in named sub-dbs opened via openDB().
      encoding: "msgpack",
      // Keep a reasonable default mmap size. LMDB auto-grows in recent
      // versions of the node-lmdb binding, so this is more of an initial
      // hint than a hard cap.
      mapSize: 256 * 1024 * 1024,
      compression: false,
      // We want named sub-databases (one per logical table).
      maxDbs: 32,
    });
    return new LmdbStore(env);
  }

  /**
   * Open (or reuse) a named logical sub-db.
   */
  openDb<V = unknown>(name: string, options: OpenDbOptions = {}): LmdbDatabase<V> {
    let handle = this.dbs.get(name);
    if (!handle) {
      handle = this.env.openDB<unknown, string>({
        name,
        encoding: options.encoding ?? "msgpack",
        keyEncoding: "ordered-binary",
      });
      this.dbs.set(name, handle);
    }
    return new LmdbDatabase<V>(handle as Database<V, string>);
  }

  /**
   * Run `fn` inside a single write transaction. All writes inside `fn` are
   * atomic. LMDB commits are durable on transaction boundary, so the return
   * value is only resolved once the commit has flushed.
   */
  async transaction<T>(fn: () => T): Promise<T> {
    return this.env.transaction(fn);
  }

  /**
   * Synchronous transaction — batches writes but does not await durability.
   * Use when callers are inside already-synchronous repository methods and
   * the durability comes from a later `flush()` or LMDB's own fsync cadence.
   */
  transactionSync<T>(fn: () => T): T {
    return this.env.transactionSync(fn);
  }

  /**
   * Drop every named sub-db. Used by the cache-schema manager when the
   * version number has advanced — the cache is rebuildable, so wiping and
   * letting background jobs rehydrate is simpler than writing migrations.
   */
  async dropAll(names: readonly string[]): Promise<void> {
    for (const name of names) {
      const db = this.env.openDB<unknown, string>({ name });
      await db.drop();
      this.dbs.delete(name);
    }
  }

  async close(): Promise<void> {
    await this.env.close();
    this.dbs.clear();
  }

  /** Test hook — exposes the raw env for advanced assertions. */
  getEnvForTesting(): RootDatabase {
    return this.env;
  }
}

/**
 * Typed handle for a single named sub-db. Keys are always strings.
 */
export class LmdbDatabase<V> {
  constructor(private readonly db: Database<V, string>) {}

  get(key: string): V | undefined {
    return this.db.get(key);
  }

  async put(key: string, value: V): Promise<void> {
    await this.db.put(key, value);
  }

  /** Synchronous put — only valid inside a sync transaction. */
  putSync(key: string, value: V): void {
    this.db.putSync(key, value);
  }

  async remove(key: string): Promise<boolean> {
    return this.db.remove(key);
  }

  removeSync(key: string): boolean {
    return this.db.removeSync(key);
  }

  has(key: string): boolean {
    return this.db.doesExist(key);
  }

  /**
   * Iterate keys/values. When `prefix` is given, the iteration is scoped to
   * that prefix via `start` / `end` bounds.
   */
  *range(options: LmdbRange = {}): IterableIterator<LmdbEntry<V>> {
    const rangeOpts: RangeOptions = {};

    if (options.prefix !== undefined) {
      rangeOpts.start = options.prefix;
      // '\uffff' is the highest BMP code point — safe upper bound for any
      // reasonable string prefix scan used as a secondary-index key format.
      rangeOpts.end = options.prefix + "\uffff";
    } else {
      if (options.start !== undefined) rangeOpts.start = options.start;
      if (options.end !== undefined) rangeOpts.end = options.end;
    }

    if (options.reverse) rangeOpts.reverse = true;
    if (options.limit !== undefined) rangeOpts.limit = options.limit;

    for (const entry of this.db.getRange(rangeOpts)) {
      yield { key: String(entry.key), value: entry.value as V };
    }
  }

  /** Convenience — collect a range into an array (materializes the scan). */
  rangeToArray(options: LmdbRange = {}): LmdbEntry<V>[] {
    return [...this.range(options)];
  }

  /** Count entries in a range. Uses LMDB's native range counting. */
  countRange(options: LmdbRange = {}): number {
    const rangeOpts: RangeOptions = {};
    if (options.prefix !== undefined) {
      rangeOpts.start = options.prefix;
      rangeOpts.end = options.prefix + "\uffff";
    } else {
      if (options.start !== undefined) rangeOpts.start = options.start;
      if (options.end !== undefined) rangeOpts.end = options.end;
    }
    return this.db.getCount(rangeOpts);
  }
}
