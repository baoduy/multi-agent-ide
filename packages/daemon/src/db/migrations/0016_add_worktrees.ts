import type { SqliteCompat } from "../SqliteCompat";

/**
 * Migration 16: Create `worktrees` table.
 *
 * Caches `git worktree list` output for every active repo so the renderer
 * can read worktree state from the DB instead of shelling out to git on
 * every view mount. Rows are upserted on a 1-minute interval by
 * WorktreeSyncApplicationService, and hard-deleted when the worktree is
 * no longer returned by git (CLI removal, manual `rm -rf`, etc.).
 */
export function run(sqlite: SqliteCompat): void {
  sqlite.exec(`
    CREATE TABLE worktrees (
      worktree_path  TEXT PRIMARY KEY,
      repo_path      TEXT NOT NULL,
      branch         TEXT NOT NULL,
      name           TEXT NOT NULL,
      created_at     INTEGER NOT NULL,
      last_synced_at INTEGER NOT NULL
    );

    CREATE INDEX idx_worktrees_repo_path ON worktrees(repo_path);
  `);
}
