/**
 * SqliteCompat - A compatibility layer that provides a better-sqlite3-like API
 * on top of sql.js (pure WASM SQLite). This eliminates native module compilation
 * issues and ABI mismatches with Electron.
 *
 * Supports the subset of better-sqlite3 API used by this project:
 * - prepare(sql).all(...params) → array of row objects
 * - prepare(sql).get(...params) → single row object or undefined
 * - prepare(sql).run(...params) → { changes: number }
 * - exec(sql) → void
 * - pragma(statement) → void
 * - transaction(fn) → wrapped function
 * - close() → void
 */

import fs from "node:fs";
import path from "node:path";

import type initSqlJs from "sql.js";
import type { Database as SqlJsDatabase } from "sql.js";

type SqlJsStatic = Awaited<ReturnType<typeof initSqlJs>>;

export interface CompatStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown | undefined;
  run(...params: unknown[]): { changes: number; lastInsertRowid: number };
}

export class SqliteCompat {
  private db: SqlJsDatabase;
  private readonly filePath: string;
  private dirty = false;

  private constructor(db: SqlJsDatabase, filePath: string) {
    this.db = db;
    this.filePath = filePath;
  }

  /**
   * Create or open a database file. Must be called as async factory since
   * sql.js initialization is asynchronous.
   */
  static async open(filePath: string): Promise<SqliteCompat> {
    // Dynamic import to handle WASM loading
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const initSqlJsFn = require("sql.js") as typeof initSqlJs;

    // In a packaged Electron app the WASM binary lives in the resources
    // directory (placed there by electron-builder's extraResources config).
    // The main process passes the path via the MAGENTA_RESOURCES_PATH env var
    // since the daemon runs as a forked child process on system Node.js
    // (not Electron) and doesn't have process.resourcesPath.
    const resourcesPath = process.env["MAGENTA_RESOURCES_PATH"];

    const initConfig: Record<string, unknown> = {};
    if (resourcesPath) {
      initConfig.locateFile = (file: string) => path.join(resourcesPath, file);
    }

    const SQL: SqlJsStatic = await initSqlJsFn(initConfig as Parameters<typeof initSqlJs>[0]);

    let db: SqlJsDatabase;

    if (fs.existsSync(filePath)) {
      const buffer = fs.readFileSync(filePath);
      db = new SQL.Database(buffer);
    } else {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      db = new SQL.Database();
    }

    return new SqliteCompat(db, filePath);
  }

  /**
   * Prepare a SQL statement and return a statement-like object.
   */
  prepare(sql: string): CompatStatement {
    return {
      all: (...params: unknown[]): unknown[] => {
        return this.execAsObjects(sql, this.normalizeParams(sql, params));
      },

      get: (...params: unknown[]): unknown | undefined => {
        const rows = this.execAsObjects(sql, this.normalizeParams(sql, params));
        return rows.length > 0 ? rows[0] : undefined;
      },

      run: (...params: unknown[]): { changes: number; lastInsertRowid: number } => {
        const bindParams = this.normalizeParams(sql, params);
        this.db.run(sql, bindParams as any);
        this.dirty = true;

        // Get changes count
        const changesResult = this.db.exec("SELECT changes() as c");
        const changes = changesResult.length > 0 ? (changesResult[0].values[0][0] as number) : 0;

        const rowidResult = this.db.exec("SELECT last_insert_rowid() as id");
        const lastInsertRowid = rowidResult.length > 0 ? (rowidResult[0].values[0][0] as number) : 0;

        return { changes, lastInsertRowid };
      },
    };
  }

  /**
   * Execute raw SQL (can be multiple statements).
   */
  exec(sql: string): void {
    this.db.exec(sql);
    this.dirty = true;
  }

  /**
   * Execute a PRAGMA statement.
   */
  pragma(statement: string): unknown {
    const results = this.db.exec(`PRAGMA ${statement}`);
    if (results.length > 0 && results[0].values.length > 0) {
      return results[0].values[0][0];
    }
    return undefined;
  }

  /**
   * Wraps a function in a BEGIN/COMMIT transaction, just like better-sqlite3's
   * Database.transaction().
   */
  transaction<TFn extends (...args: unknown[]) => unknown>(fn: TFn): TFn {
    const wrapper = ((...args: unknown[]) => {
      this.db.exec("BEGIN");
      try {
        const result = fn(...args);
        this.db.exec("COMMIT");
        this.dirty = true;
        return result;
      } catch (err) {
        this.db.exec("ROLLBACK");
        throw err;
      }
    }) as unknown as TFn;

    return wrapper;
  }

  /**
   * Persist the in-memory database to disk.
   * Call this after writes if you want durability.
   */
  save(): void {
    if (!this.dirty) {
      return;
    }

    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.filePath, buffer);
    this.dirty = false;
  }

  /**
   * Close the database, saving any pending changes.
   */
  close(): void {
    this.save();
    this.db.close();
  }

  // ── Internal helpers ──

  /**
   * Execute a SELECT statement and return results as an array of plain objects.
   */
  private execAsObjects(sql: string, params: unknown): Record<string, unknown>[] {
    try {
      const stmt = this.db.prepare(sql);

      if (params !== undefined && params !== null) {
        stmt.bind(params as any);
      }

      const rows: Record<string, unknown>[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        rows.push(row as Record<string, unknown>);
      }

      stmt.free();
      return rows;
    } catch (error) {
      console.error("[SqliteCompat] Query failed:", sql, params, error);
      throw error;
    }
  }

  /**
   * Normalize parameters from better-sqlite3 calling conventions to sql.js conventions.
   *
   * better-sqlite3 uses:
   *   .run(val1, val2)          → positional  ?
   *   .run({ name: val })       → named       @name
   *
   * sql.js uses:
   *   .run([val1, val2])        → positional  ?
   *   .run({ "$name": val })    → named       $name / :name / @name
   *
   * sql.js actually supports @name directly in bindings, so we just need to
   * convert the parameter format.
   */
  private normalizeParams(sql: string, params: unknown[]): unknown {
    if (params.length === 0) {
      return undefined;
    }

    // If the first param is an object (named parameters), convert keys to @-prefixed
    if (params.length === 1 && typeof params[0] === "object" && params[0] !== null && !Array.isArray(params[0])) {
      const obj = params[0] as Record<string, unknown>;
      const converted: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(obj)) {
        // sql.js needs $, :, or @ prefix on named params.
        // better-sqlite3 uses @name in SQL but passes {name: value} in JS.
        // We prefix with @ to match the SQL parameter markers already in the queries.
        const prefixedKey = key.startsWith("@") || key.startsWith("$") || key.startsWith(":")
          ? key
          : `@${key}`;
        converted[prefixedKey] = value;
      }

      return converted;
    }

    // Positional parameters — sql.js accepts an array
    if (params.length === 1 && Array.isArray(params[0])) {
      return params[0];
    }

    // Multiple positional params → wrap in array
    return params;
  }
}
