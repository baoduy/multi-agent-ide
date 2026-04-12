import type { SqliteCompat } from "../SqliteCompat";

export function run(sqlite: SqliteCompat): void {
  // Drop any stale table from previous dev iterations
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
