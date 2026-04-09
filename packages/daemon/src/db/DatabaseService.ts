import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import * as schema from "./schema";
import { runInitialMigration } from "./migrations/0001_initial";

export class DatabaseService {
  private static instance: DatabaseService | null = null;

  private readonly sqlite: Database.Database;
  private readonly db: BetterSQLite3Database<typeof schema>;

  private constructor(databasePath?: string) {
    const resolvedPath = databasePath ?? DatabaseService.getDefaultDatabasePath();

    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

    this.sqlite = new Database(resolvedPath);
    this.sqlite.pragma("journal_mode = WAL");
    this.sqlite.pragma("foreign_keys = ON");
    this.sqlite.pragma("busy_timeout = 5000");

    runInitialMigration(this.sqlite);

    this.db = drizzle(this.sqlite, { schema });
  }

  static getInstance(databasePath?: string): DatabaseService {
    if (DatabaseService.instance === null) {
      DatabaseService.instance = new DatabaseService(databasePath);
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

  getDrizzle(): BetterSQLite3Database<typeof schema> {
    return this.db;
  }

  getSqlite(): Database.Database {
    return this.sqlite;
  }

  transaction<T>(run: (db: BetterSQLite3Database<typeof schema>) => T): T {
    const wrapped = this.sqlite.transaction(() => run(this.db));
    return wrapped();
  }

  close(): void {
    this.sqlite.close();
  }
}
