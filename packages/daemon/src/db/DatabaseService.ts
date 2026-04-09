import os from "node:os";
import path from "node:path";

import { SqliteCompat } from "./SqliteCompat";
import { runInitialMigration } from "./migrations/0001_initial";

/**
 * DatabaseService wraps sql.js (pure WASM SQLite) with a better-sqlite3-compatible
 * API. Using WASM eliminates all native module compilation / ABI issues.
 *
 * Because sql.js initialization is async, use `DatabaseService.create()` instead
 * of `getInstance()` for the first initialization.
 */
export class DatabaseService {
  private static instance: DatabaseService | null = null;

  private readonly sqlite: SqliteCompat;
  private saveTimer: ReturnType<typeof setInterval> | null = null;

  private constructor(sqlite: SqliteCompat) {
    this.sqlite = sqlite;

    // Auto-save every 5 seconds if there are pending changes
    this.saveTimer = setInterval(() => {
      this.sqlite.save();
    }, 5000);
  }

  /**
   * Async factory — creates the singleton instance.
   * Must be called once at startup before getInstance().
   */
  static async create(databasePath?: string): Promise<DatabaseService> {
    if (DatabaseService.instance !== null) {
      return DatabaseService.instance;
    }

    const resolvedPath = databasePath ?? DatabaseService.getDefaultDatabasePath();
    console.log(`[DatabaseService] Opening database at: ${resolvedPath}`);

    const sqlite = await SqliteCompat.open(resolvedPath);

    // Set pragmas
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    sqlite.pragma("busy_timeout = 5000");

    // Run migrations
    runInitialMigration(sqlite);

    // Persist after migration
    sqlite.save();

    DatabaseService.instance = new DatabaseService(sqlite);
    return DatabaseService.instance;
  }

  /**
   * Returns the existing singleton. Throws if create() hasn't been called yet.
   */
  static getInstance(): DatabaseService {
    if (DatabaseService.instance === null) {
      throw new Error("DatabaseService not initialized. Call DatabaseService.create() first.");
    }
    return DatabaseService.instance;
  }

  static resetInstanceForTesting(): void {
    if (DatabaseService.instance !== null) {
      DatabaseService.instance.close();
      DatabaseService.instance = null;
    }
  }

  static getDefaultDatabasePath(): string {
    return path.join(os.homedir(), ".magenta", "magenta.db");
  }

  /**
   * Returns the SqliteCompat instance for raw queries.
   * This provides the same prepare().all() / .get() / .run() API as better-sqlite3.
   */
  getSqlite(): SqliteCompat {
    return this.sqlite;
  }

  /**
   * Run a function inside a transaction.
   */
  transaction<T>(run: () => T): T {
    const wrapped = this.sqlite.transaction(run);
    const result = wrapped();
    this.sqlite.save();
    return result as T;
  }

  /**
   * Persist pending changes to disk immediately.
   */
  flush(): void {
    this.sqlite.save();
  }

  close(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }
    this.sqlite.close();
  }
}
