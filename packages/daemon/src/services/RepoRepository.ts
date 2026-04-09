import { ulid } from "ulid";

import type { Repository } from "@magenta/shared/models";
import type { DatabaseService } from "../db/DatabaseService";

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

    // SQLite returns 0/1 for booleans; convert to proper boolean
    return rows.map((row) => ({
      ...row,
      hasSpecs: Boolean(row.hasSpecs),
    })) as Repository[];
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

    // SQLite returns 0/1 for booleans; convert to proper boolean
    return { ...row, hasSpecs: Boolean(row.hasSpecs) } as Repository;
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
        .run({
          ...repo,
          hasSpecs: repo.hasSpecs ? 1 : 0,
        });

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
        ...repo,
        createdAt,
        hasSpecs: repo.hasSpecs ? 1 : 0,
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

  markMissingAbsentPaths(activePaths: Set<string>, scannedAt: number): number {
    const existing = this.listAll();
    let changed = 0;

    for (const repo of existing) {
      if (activePaths.has(repo.path) || repo.status === "missing") {
        continue;
      }

      this.databaseService
        .getSqlite()
        .prepare(`UPDATE repos SET status = 'missing', scanned_at = ? WHERE path = ?`)
        .run(scannedAt, repo.path);
      changed += 1;
    }

    return changed;
  }
}
