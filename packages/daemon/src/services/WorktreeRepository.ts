import type { DatabaseService } from "../db/DatabaseService";
import type { LmdbDatabase } from "../db/LmdbStore";
import type { WorktreeRecord } from "../infrastructure/mappers/worktreeMapper";

export type { WorktreeRecord };

/**
 * LMDB-backed repository for `worktrees`.
 *
 * Sub-db layout:
 *   worktrees:
 *     worktree:${path}                             → WorktreeRecord
 *     worktree:repo:${repoPath}:${name}            → path (secondary index for listByRepo)
 *
 * The primary key is the worktree path (git can't have two worktrees at the
 * same on-disk path), so no separate id is needed.
 */
export class WorktreeRepository {
  private readonly db: LmdbDatabase<unknown>;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getDb("worktrees");
  }

  list(): WorktreeRecord[] {
    const out: WorktreeRecord[] = [];
    for (const entry of this.db.range({ start: "worktree:", end: "worktree:repo:" })) {
      // Skip any accidental secondary-key overlap (defensive).
      if (entry.key.startsWith("worktree:repo:")) continue;
      out.push(entry.value as WorktreeRecord);
    }
    out.sort((a, b) => {
      const byRepo = a.repoPath.localeCompare(b.repoPath);
      if (byRepo !== 0) return byRepo;
      return a.name.localeCompare(b.name);
    });
    return out;
  }

  listByRepo(repoPath: string): WorktreeRecord[] {
    const out: WorktreeRecord[] = [];
    for (const entry of this.db.range({ prefix: `worktree:repo:${repoPath}:` })) {
      const wtPath = entry.value as string;
      const row = this.db.get(`worktree:${wtPath}`) as WorktreeRecord | undefined;
      if (row) out.push(row);
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }

  getByPath(worktreePath: string): WorktreeRecord | null {
    const row = this.db.get(`worktree:${worktreePath}`) as WorktreeRecord | undefined;
    return row ?? null;
  }

  /**
   * Upsert a row keyed by `worktreePath`. Existing `createdAt` is preserved
   * — git doesn't record when a worktree was created, so we keep the first
   * observed timestamp.
   */
  upsert(record: WorktreeRecord): void {
    this.databaseService.transactionSync(() => {
      const existing = this.db.get(`worktree:${record.worktreePath}`) as
        | WorktreeRecord
        | undefined;

      const toWrite: WorktreeRecord = existing
        ? { ...record, createdAt: existing.createdAt }
        : record;

      // If the repoPath / name of an existing row changed, clear the stale
      // secondary-index entry.
      if (
        existing &&
        (existing.repoPath !== toWrite.repoPath || existing.name !== toWrite.name)
      ) {
        this.db.removeSync(`worktree:repo:${existing.repoPath}:${existing.name}`);
      }

      this.db.putSync(`worktree:${toWrite.worktreePath}`, toWrite);
      this.db.putSync(
        `worktree:repo:${toWrite.repoPath}:${toWrite.name}`,
        toWrite.worktreePath,
      );
    });
  }

  deleteByPath(worktreePath: string): boolean {
    const existing = this.db.get(`worktree:${worktreePath}`) as
      | WorktreeRecord
      | undefined;
    if (!existing) return false;
    this.databaseService.transactionSync(() => {
      this.db.removeSync(`worktree:${worktreePath}`);
      this.db.removeSync(`worktree:repo:${existing.repoPath}:${existing.name}`);
    });
    return true;
  }

  /**
   * Hard-delete rows whose worktree_path is not in `keepPaths`, scoped to
   * `scannedRepoPaths`. Mirrors the SQL semantics: if a repo failed to scan
   * this tick, its rows are left untouched.
   */
  deleteStale(
    scannedRepoPaths: readonly string[],
    keepPaths: readonly string[],
  ): number {
    if (scannedRepoPaths.length === 0) return 0;
    const keep = new Set(keepPaths);

    const candidates: WorktreeRecord[] = [];
    for (const repoPath of scannedRepoPaths) {
      for (const entry of this.db.range({ prefix: `worktree:repo:${repoPath}:` })) {
        const wtPath = entry.value as string;
        const row = this.db.get(`worktree:${wtPath}`) as WorktreeRecord | undefined;
        if (row) candidates.push(row);
      }
    }

    const toDelete = candidates.filter((r) => !keep.has(r.worktreePath));
    if (toDelete.length === 0) return 0;

    this.databaseService.transactionSync(() => {
      for (const r of toDelete) {
        this.db.removeSync(`worktree:${r.worktreePath}`);
        this.db.removeSync(`worktree:repo:${r.repoPath}:${r.name}`);
      }
    });

    return toDelete.length;
  }

  flush(): void {
    // no-op
  }
}
