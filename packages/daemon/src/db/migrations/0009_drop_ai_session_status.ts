import type { SqliteCompat } from "../SqliteCompat";

/**
 * Migration 9: Drop the `status` column from ai_sessions.
 *
 * Session status is now determined at runtime by checking whether the
 * daemon has a live PTY process for the session. Persisting status was
 * unreliable — if the app crashed, sessions would appear "running" on
 * next launch even though the process was long gone.
 *
 * SQLite doesn't support DROP COLUMN prior to 3.35 (and sql.js may
 * lag), so we recreate the table without the column.
 */
export function run(sqlite: SqliteCompat): void {
  sqlite.exec(`
    CREATE TABLE ai_sessions_new (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      repo_path TEXT,
      repo_name TEXT,
      branch TEXT,
      worktree_path TEXT,
      worktree_name TEXT,
      cwd TEXT NOT NULL,
      provider_session_id TEXT,
      created_at INTEGER NOT NULL,
      last_active_at INTEGER NOT NULL
    );

    INSERT INTO ai_sessions_new (id, provider, repo_path, repo_name, branch, worktree_path, worktree_name, cwd, provider_session_id, created_at, last_active_at)
    SELECT id, provider, repo_path, repo_name, branch, worktree_path, worktree_name, cwd, provider_session_id, created_at, last_active_at
    FROM ai_sessions;

    DROP TABLE ai_sessions;
    ALTER TABLE ai_sessions_new RENAME TO ai_sessions;

    CREATE INDEX idx_ai_sessions_last_active ON ai_sessions(last_active_at DESC);
  `);
}
