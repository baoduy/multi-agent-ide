import type { SqliteCompat } from "./SqliteCompat";
import { createLogger } from "../infrastructure/Logger";

const log = createLogger("migration-runner");
import { runInitialMigration } from "./migrations/0001_initial";
import { run as run0002 } from "./migrations/0002_add_spec_panel_height";
import { run as run0003 } from "./migrations/0003_update_main_tab_values";
import { run as run0004 } from "./migrations/0004_add_sidebar_collapse_columns";
import { run as run0005 } from "./migrations/0005_add_spec_cache";
import { run as run0006 } from "./migrations/0006_add_specs_tables";
import { run as run0007 } from "./migrations/0007_add_ai_sessions";
import { run as run0008 } from "./migrations/0008_recreate_ai_sessions";
import { run as run0009 } from "./migrations/0009_drop_ai_session_status";
import { run as run0010 } from "./migrations/0010_add_ai_session_title";
import { run as run0011 } from "./migrations/0011_add_ai_session_permission_mode";
import { run as run0012 } from "./migrations/0012_add_synced_sessions";
import { run as run0013 } from "./migrations/0013_add_spec_created_at";
import { run as run0014 } from "./migrations/0014_add_synced_session_activity";

/**
 * Migration definition: a version number and a function that applies the migration.
 * Migrations MUST be listed in ascending version order.
 */
interface Migration {
  version: number;
  name: string;
  run: (sqlite: SqliteCompat) => void;
}

/**
 * Register all migrations here, in order.
 * Migration 1 is the initial schema — it uses CREATE TABLE IF NOT EXISTS,
 * so it's safe to re-run on an empty database.
 * Migrations 2+ are incremental ALTER TABLE / CREATE INDEX / etc.
 */
const MIGRATIONS: Migration[] = [
  { version: 1, name: "initial_schema", run: runInitialMigration },
  { version: 2, name: "add_spec_panel_height", run: run0002 },
  { version: 3, name: "update_main_tab_values", run: run0003 },
  { version: 4, name: "add_sidebar_collapse_columns", run: run0004 },
  { version: 5, name: "add_spec_cache", run: run0005 },
  { version: 6, name: "add_specs_tables", run: run0006 },
  { version: 7, name: "add_ai_sessions", run: run0007 },
  { version: 8, name: "recreate_ai_sessions", run: run0008 },
  { version: 9, name: "drop_ai_session_status", run: run0009 },
  { version: 10, name: "add_ai_session_title", run: run0010 },
  { version: 11, name: "add_ai_session_permission_mode", run: run0011 },
  { version: 12, name: "add_synced_sessions", run: run0012 },
  { version: 13, name: "add_spec_created_at", run: run0013 },
  { version: 14, name: "add_synced_session_activity", run: run0014 },
];

/**
 * Runs all pending migrations against the database.
 *
 * Tracks applied versions in a `schema_version` table so each migration
 * only runs once. Safe to call on every startup.
 */
export function runMigrations(sqlite: SqliteCompat): void {
  // Ensure the version-tracking table exists
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    )
  `);

  // Read the current max version
  const row = sqlite
    .prepare(`SELECT COALESCE(MAX(version), 0) as currentVersion FROM schema_version`)
    .get() as { currentVersion: number } | undefined;

  const currentVersion = row?.currentVersion ?? 0;

  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) {
      continue;
    }

    log.info(`Applying migration ${migration.version}: ${migration.name}`);
    try {
      migration.run(sqlite);

      // Record that we applied it
      sqlite
        .prepare(`INSERT INTO schema_version (version, name, applied_at) VALUES (?, ?, ?)`)
        .run(migration.version, migration.name, Date.now());

      log.info(`Migration ${migration.version} applied successfully`);
    } catch (err) {
      log.error(`Migration ${migration.version} failed:`, err);
      throw err;
    }
  }
}
