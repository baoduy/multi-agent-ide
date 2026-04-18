import type { DatabaseService } from "../db/DatabaseService";
import { mapWorktreeRow, toWorktreeParams, type WorktreeRecord } from "../infrastructure/mappers/worktreeMapper";

/**
 * Data access for the `worktrees` table.
 *
 * Caches the output of `git worktree list --porcelain` on a 1-minute cadence
 * via WorktreeSyncApplicationService. Rows are keyed by `worktree_path`
 * (a natural primary key: two worktrees can't share the same on-disk path).
 */
export class WorktreeRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  list(): WorktreeRecord[] {
    const rows = this.databaseService
      .getSqlite()
      .prepare(
        `SELECT worktree_path, repo_path, branch, name, created_at, last_synced_at
         FROM worktrees
         ORDER BY repo_path, name`
      )
      .all() as Array<Record<string, unknown>>;

    return rows.map(mapWorktreeRow);
  }

  listByRepo(repoPath: string): WorktreeRecord[] {
    const rows = this.databaseService
      .getSqlite()
      .prepare(
        `SELECT worktree_path, repo_path, branch, name, created_at, last_synced_at
         FROM worktrees
         WHERE repo_path = ?
         ORDER BY name`
      )
      .all(repoPath) as Array<Record<string, unknown>>;

    return rows.map(mapWorktreeRow);
  }

  getByPath(worktreePath: string): WorktreeRecord | null {
    const row = this.databaseService
      .getSqlite()
      .prepare(
        `SELECT worktree_path, repo_path, branch, name, created_at, last_synced_at
         FROM worktrees
         WHERE worktree_path = ?`
      )
      .get(worktreePath) as Record<string, unknown> | undefined;

    if (!row) return null;
    return mapWorktreeRow(row);
  }

  /**
   * Upsert a worktree row keyed by `worktree_path`. The existing `created_at`
   * is preserved if a row already exists — git does not record when the
   * worktree was created, so we stick with the first timestamp we observed.
   */
  upsert(record: WorktreeRecord): void {
    const existing = this.databaseService
      .getSqlite()
      .prepare(`SELECT created_at FROM worktrees WHERE worktree_path = ?`)
      .get(record.worktreePath) as { created_at: number } | undefined;

    const toWrite: WorktreeRecord = existing
      ? { ...record, createdAt: existing.created_at }
      : record;

    const params = toWorktreeParams(toWrite);

    this.databaseService
      .getSqlite()
      .prepare(
        `INSERT OR REPLACE INTO worktrees (
           worktree_path, repo_path, branch, name, created_at, last_synced_at
         ) VALUES (
           @worktree_path, @repo_path, @branch, @name, @created_at, @last_synced_at
         )`
      )
      .run(params);
  }

  deleteByPath(worktreePath: string): boolean {
    const result = this.databaseService
      .getSqlite()
      .prepare(`DELETE FROM worktrees WHERE worktree_path = ?`)
      .run(worktreePath);

    return (result.changes ?? 0) > 0;
  }

  /**
   * Hard-delete rows whose worktree_path is not in `keepPaths`, scoped to
   * the repos we actually scanned this tick (`scannedRepoPaths`). The scope
   * matters: if a repo failed to scan, we must not wipe its rows — they
   * might still be valid on disk.
   */
  deleteStale(scannedRepoPaths: readonly string[], keepPaths: readonly string[]): number {
    if (scannedRepoPaths.length === 0) return 0;

    const keep = new Set(keepPaths);

    const repoPlaceholders = scannedRepoPaths.map(() => "?").join(",");
    const rows = this.databaseService
      .getSqlite()
      .prepare(`SELECT worktree_path FROM worktrees WHERE repo_path IN (${repoPlaceholders})`)
      .all(...scannedRepoPaths) as Array<{ worktree_path: string }>;

    const toDelete = rows
      .map((r) => r.worktree_path)
      .filter((p) => !keep.has(p));

    if (toDelete.length === 0) return 0;

    const deleteStmt = this.databaseService
      .getSqlite()
      .prepare(`DELETE FROM worktrees WHERE worktree_path = ?`);

    for (const p of toDelete) {
      deleteStmt.run(p);
    }

    return toDelete.length;
  }

  flush(): void {
    this.databaseService.flush();
  }
}
