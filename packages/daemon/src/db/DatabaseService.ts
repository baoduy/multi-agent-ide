import os from "node:os";
import path from "node:path";

import { SqliteCompat } from "./SqliteCompat";
import { runMigrations } from "./MigrationRunner";
import { AppError } from "../errors/AppError";

/**
 * DatabaseService wraps sql.js (pure WASM SQLite) with the project's synchronous
 * statement API. Using WASM eliminates all native module compilation / ABI issues.
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

    // Run migrations (applies any pending schema changes)
    runMigrations(sqlite);

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
      throw new AppError("INTERNAL_ERROR", "DatabaseService not initialized. Call DatabaseService.create() first.");
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
   */
  getSqlite(): SqliteCompat {
    return this.sqlite;
  }

  /**
   * Run a function inside a transaction.
   *
   * Note: no explicit `save()` here. Every transaction used to force a
   * full `db.export()` + `writeFileSync`, which is wasted work for minor
   * writes (lastActiveAt updates, status flips). The 5-second auto-save
   * timer in the constructor covers durability, and callers that need a
   * synchronous flush can still call `flush()` explicitly.
   */
  transaction<T>(run: () => T): T {
    const wrapped = this.sqlite.transaction(run);
    const result = wrapped();
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
