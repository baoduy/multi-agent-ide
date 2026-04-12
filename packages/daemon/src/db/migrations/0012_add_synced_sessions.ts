import type { SqliteCompat } from "../SqliteCompat";

/**
 * Migration 12: Create `synced_sessions` table.
 *
 * Stores session metadata scanned from Claude Code (~/.claude/projects/)
 * and GitHub Copilot CLI (~/.copilot/session-state/) JSONL files.
 * Sessions are grouped by project/repo via the `repo_path` and `cwd` columns.
 */
export function run(sqlite: SqliteCompat): void {
  sqlite.exec(`
    CREATE TABLE synced_sessions (
      id                TEXT PRIMARY KEY,
      provider          TEXT NOT NULL CHECK (provider IN ('claude-code', 'copilot')),
      session_id        TEXT NOT NULL,
      project_dir       TEXT,
      cwd               TEXT,
      git_branch        TEXT,
      model             TEXT,
      token_usage_json  TEXT,
      message_count     INTEGER NOT NULL DEFAULT 0,
      subagent_count    INTEGER NOT NULL DEFAULT 0,
      status            TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('active', 'completed')),
      slug              TEXT,
      version           TEXT,
      entrypoint        TEXT,
      title             TEXT,
      synced_file_path  TEXT NOT NULL UNIQUE,
      synced_file_mtime INTEGER NOT NULL,
      synced_file_size  INTEGER NOT NULL,
      started_at        INTEGER NOT NULL,
      ended_at          INTEGER,
      last_synced_at    INTEGER NOT NULL,
      created_at        INTEGER NOT NULL,

      UNIQUE(provider, session_id)
    );

    CREATE INDEX idx_synced_sessions_provider ON synced_sessions(provider);
    CREATE INDEX idx_synced_sessions_cwd ON synced_sessions(cwd);
    CREATE INDEX idx_synced_sessions_started_at ON synced_sessions(started_at DESC);
  `);
}
