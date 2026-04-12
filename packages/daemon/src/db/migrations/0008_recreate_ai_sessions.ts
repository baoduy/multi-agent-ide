import type { SqliteCompat } from "../SqliteCompat";

/**
 * Migration 8: Recreate ai_sessions table.
 *
 * Migration 7 may have been recorded as applied while the table was
 * created with a stale schema (missing columns). This migration drops
 * and recreates the table with the correct schema.
 */
export function run(sqlite: SqliteCompat): void {
  sqlite.exec(`DROP TABLE IF EXISTS ai_sessions`);

  sqlite.exec(`
    CREATE TABLE ai_sessions (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      repo_path TEXT,
      repo_name TEXT,
      branch TEXT,
      worktree_path TEXT,
      worktree_name TEXT,
      cwd TEXT NOT NULL,
      provider_session_id TEXT,
      status TEXT NOT NULL DEFAULT 'idle',
      created_at INTEGER NOT NULL,
      last_active_at INTEGER NOT NULL
    );

    CREATE INDEX idx_ai_sessions_last_active ON ai_sessions(last_active_at DESC);
  `);
}
