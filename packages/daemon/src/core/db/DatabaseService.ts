import os from "node:os";
import path from "node:path";

import { AppError } from "../errors/AppError";
import { LmdbStore, type LmdbDatabase, type OpenDbOptions } from "./LmdbStore";
import { runCacheSchemaCheck } from "./CacheSchemaManager";

/**
 * DatabaseService — LMDB edition.
 *
 * Lifecycle contract exposed to the daemon (daemon-ipc-worker, repositories):
 *
 *   - `static async create(path?)` — one-time async initialization at startup
 *   - `getInstance()` — sync accessor after create() has run
 *   - `resetInstanceForTesting()`
 *   - `close()`
 *   - `flush()` — no-op (LMDB commits are durable on transaction boundary)
 *
 * The DB is a cache for UI responsiveness; authoritative state lives in git,
 * the filesystem, and AI provider session files. No user-data migration runs
 * — see `CacheSchemaManager` for the wipe-on-version-bump cache strategy.
 */
export class DatabaseService {
  private static instance: DatabaseService | null = null;

  private readonly store: LmdbStore;

  private constructor(store: LmdbStore) {
    this.store = store;
  }

  static async create(databasePath?: string): Promise<DatabaseService> {
    if (DatabaseService.instance !== null) {
      return DatabaseService.instance;
    }

    const resolvedPath = databasePath ?? DatabaseService.getDefaultDatabasePath();
    console.log(`[DatabaseService] Opening LMDB env at: ${resolvedPath}`);

    const store = LmdbStore.open(resolvedPath);

    const check = await runCacheSchemaCheck(store);
    if (check.wiped) {
      console.log(
        `[DatabaseService] Cache wiped from v${check.previousVersion ?? "—"} to v${check.currentVersion}.`,
      );
    }

    DatabaseService.instance = new DatabaseService(store);
    return DatabaseService.instance;
  }

  static getInstance(): DatabaseService {
    if (DatabaseService.instance === null) {
      throw new AppError(
        "INTERNAL_ERROR",
        "DatabaseService not initialized. Call DatabaseService.create() first.",
      );
    }
    return DatabaseService.instance;
  }

  static resetInstanceForTesting(): void {
    if (DatabaseService.instance !== null) {
      void DatabaseService.instance.close();
      DatabaseService.instance = null;
    }
  }

  /**
   * Default on-disk path. LMDB uses a directory (containing data.mdb and
   * lock.mdb), NOT a single file — the path here is a directory name.
   */
  static getDefaultDatabasePath(): string {
    return path.join(os.homedir(), ".magenta", "lmdb");
  }

  /** Returns the underlying store for repository wiring. */
  getStore(): LmdbStore {
    return this.store;
  }

  /** Open (or reuse) a typed sub-db handle. */
  getDb<V = unknown>(name: string, options?: OpenDbOptions): LmdbDatabase<V> {
    return this.store.openDb<V>(name, options);
  }

  /**
   * Batched write transaction. All writes inside `fn` are atomic.
   */
  async transaction<T>(run: () => T): Promise<T> {
    return this.store.transaction(run);
  }

  /** Sync transaction variant — see `LmdbStore.transactionSync`. */
  transactionSync<T>(run: () => T): T {
    return this.store.transactionSync(run);
  }

  /**
   * No-op for source compatibility with the old DatabaseService.flush().
   * LMDB commits are durable on transaction boundary — there is no pending
   * in-memory buffer to push out.
   */
  flush(): void {
    // intentional no-op
  }

  async close(): Promise<void> {
    await this.store.close();
  }
}
