import { ulid } from "ulid";

import type { Repository } from "@magenta/shared/models";
import type { DatabaseService } from "../db/DatabaseService";
import type { LmdbDatabase } from "../db/LmdbStore";

/**
 * LMDB-backed repository for `repos`.
 *
 * Layout:
 *   repos sub-db:  repo:${id}                → Repository
 *                  repo:path:${path}         → id  (secondary index for findByPath)
 *
 * Primary keyspace is prefixed with `repo:` and a secondary index with
 * `repo:path:` so both live in the same sub-db and we can iterate the
 * primary index with a simple prefix scan that stops before the secondary
 * (because `repo:0...9|A...Z|a...z` sorts before `repo:p`... no — IDs are
 * ULIDs so they sort before `repo:path:`? No. ULIDs use Crockford base32,
 * all uppercase 0-9 + A-Z. The char 'p' is > ULID chars, so
 * `repo:${ulid}` sorts before `repo:path:`.). Confirmed: ULID alphabet is
 * `0-9A-HJKMNP-TV-Z`; lowercase 'p' (0x70) is greater than any ULID char,
 * so the primary-index prefix scan stops before the secondary entries.
 *
 * To keep the code robust we use explicit start/end bounds rather than
 * relying on that ordering: `start = "repo:"`, `end = "repo:z"` for all,
 * and `start = "repo:path:"` for the secondary index.
 */
export class RepoRepository {
  private readonly db: LmdbDatabase<unknown>;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getDb("repos");
  }

  /** No-op — LMDB commits are durable on transaction boundary. */
  flush(): void {
    // intentional no-op
  }

  listAll(): Repository[] {
    const repos: Repository[] = [];
    for (const entry of this.db.range({ start: "repo:", end: "repo:path:" })) {
      // Guard against any stray secondary-index key accidentally falling in
      // this range (shouldn't happen given the end bound, but cheap to
      // double-check).
      if (entry.key.startsWith("repo:path:")) continue;
      repos.push(entry.value as Repository);
    }
    // Match the old `ORDER BY name ASC` surface from the SQL repo.
    repos.sort((a, b) => a.name.localeCompare(b.name));
    return repos;
  }

  findByPath(path: string): Repository | null {
    const id = this.db.get(`repo:path:${path}`) as string | undefined;
    if (!id) return null;
    const repo = this.db.get(`repo:${id}`) as Repository | undefined;
    return repo ?? null;
  }

  upsert(
    repo: Omit<Repository, "id" | "createdAt"> & { id?: string; createdAt?: number },
  ): Repository {
    const existing = this.findByPath(repo.path);

    if (existing) {
      const merged: Repository = {
        ...existing,
        name: repo.name,
        branch: repo.branch,
        hasSpecs: repo.hasSpecs,
        specCount: repo.specCount,
        status: repo.status,
        scannedAt: repo.scannedAt,
        specifyWorkingDir:
          repo.specifyWorkingDir !== undefined
            ? repo.specifyWorkingDir
            : existing.specifyWorkingDir ?? null,
        specifyAgent:
          repo.specifyAgent !== undefined
            ? repo.specifyAgent
            : existing.specifyAgent ?? null,
      };
      this.databaseService.transactionSync(() => {
        this.db.putSync(`repo:${merged.id}`, merged);
        // Path → id pointer never changes for an existing row.
      });
      return merged;
    }

    const createdAt = repo.createdAt ?? Date.now();
    const id = repo.id ?? ulid();
    const record: Repository = {
      id,
      name: repo.name,
      path: repo.path,
      branch: repo.branch,
      hasSpecs: repo.hasSpecs,
      specCount: repo.specCount,
      status: repo.status,
      scannedAt: repo.scannedAt,
      createdAt,
      specifyWorkingDir: repo.specifyWorkingDir ?? null,
      specifyAgent: repo.specifyAgent ?? null,
    };

    this.databaseService.transactionSync(() => {
      this.db.putSync(`repo:${id}`, record);
      this.db.putSync(`repo:path:${record.path}`, id);
    });

    return record;
  }

  deleteByPath(repoPath: string): void {
    const id = this.db.get(`repo:path:${repoPath}`) as string | undefined;
    if (!id) return;
    this.databaseService.transactionSync(() => {
      this.db.removeSync(`repo:${id}`);
      this.db.removeSync(`repo:path:${repoPath}`);
    });
  }

  /**
   * Mark every repo whose path is NOT in `activePaths` and whose status is
   * not already "missing" as missing. Returns the number updated.
   */
  markMissingAbsentPaths(activePaths: Set<string>, scannedAt: number): number {
    const existing = this.listAll();
    const missing = existing.filter(
      (repo) => !activePaths.has(repo.path) && repo.status !== "missing",
    );
    if (missing.length === 0) return 0;

    this.databaseService.transactionSync(() => {
      for (const repo of missing) {
        const updated: Repository = { ...repo, status: "missing", scannedAt };
        this.db.putSync(`repo:${repo.id}`, updated);
      }
    });

    return missing.length;
  }
}
