import { ulid } from "ulid";

import type { Repository } from "@magenta/shared/models";
import type { DatabaseService } from "../db/DatabaseService";
import { mapRepoRow, toRepoRow } from "../infrastructure/mappers/repoMapper";

export class RepoRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Persist pending changes to disk (sql.js is in-memory).
   */
  flush(): void {
    this.databaseService.flush();
  }

  listAll(): Repository[] {
    const rows = this.databaseService
      .getSqlite()
      .prepare(
        `SELECT id, name, path, branch, has_specs as hasSpecs, spec_count as specCount, status, scanned_at as scannedAt, created_at as createdAt
         FROM repos
         ORDER BY name ASC`
      )
      .all() as Array<Record<string, unknown>>;

    return rows.map(mapRepoRow);
  }

  findByPath(path: string): Repository | null {
    const row = this.databaseService
      .getSqlite()
      .prepare(
        `SELECT id, name, path, branch, has_specs as hasSpecs, spec_count as specCount, status, scanned_at as scannedAt, created_at as createdAt
         FROM repos
         WHERE path = ?`
      )
      .get(path) as Record<string, unknown> | undefined;

    if (!row) {
      return null;
    }

    return mapRepoRow(row);
  }

  upsert(repo: Omit<Repository, "id" | "createdAt"> & { id?: string; createdAt?: number }): Repository {
    const existing = this.findByPath(repo.path);

    if (existing) {
      this.databaseService
        .getSqlite()
        .prepare(
          `UPDATE repos
           SET name = @name,
               branch = @branch,
               has_specs = @hasSpecs,
               spec_count = @specCount,
               status = @status,
               scanned_at = @scannedAt
           WHERE path = @path`
        )
        .run(toRepoRow({
          ...repo,
        }));

      return {
        ...existing,
        ...repo,
      };
    }

    const createdAt = repo.createdAt ?? Date.now();
    const id = repo.id ?? ulid();

    this.databaseService
      .getSqlite()
      .prepare(
        `INSERT INTO repos (
           id, name, path, branch, has_specs, spec_count, status, scanned_at, created_at
         ) VALUES (
           @id, @name, @path, @branch, @hasSpecs, @specCount, @status, @scannedAt, @createdAt
         )`
      )
      .run({
        id,
        ...toRepoRow(repo),
        createdAt,
      });

    return {
      id,
      name: repo.name,
      path: repo.path,
      branch: repo.branch,
      hasSpecs: repo.hasSpecs,
      specCount: repo.specCount,
      status: repo.status,
      scannedAt: repo.scannedAt,
      createdAt,
    };
  }

  deleteByPath(repoPath: string): void {
    this.databaseService
      .getSqlite()
      .prepare(`DELETE FROM repos WHERE path = ?`)
      .run(repoPath);
  }

  markMissingAbsentPaths(activePaths: Set<string>, scannedAt: number): number {
    const existing = this.listAll();
    const missing = existing.filter(
      (repo) => !activePaths.has(repo.path) && repo.status !== "missing",
    );
    if (missing.length === 0) {
      return 0;
    }

    // Batched single-UPDATE — previously this issued one UPDATE per missing
    // repo, which on large workspaces meant dozens of sequential sql.js
    // round-trips and a matching number of auto-save wakeups.
    const placeholders = missing.map(() => "?").join(", ");
    const params = [scannedAt, ...missing.map((r) => r.path)];
    this.databaseService
      .getSqlite()
      .prepare(
        `UPDATE repos SET status = 'missing', scanned_at = ? WHERE path IN (${placeholders})`,
      )
      .run(...params);
    const changed = missing.length;

    return changed;
  }
}
