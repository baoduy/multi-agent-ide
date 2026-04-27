import { ulid } from "ulid";

import type { SpecFolder } from "@magenta/shared/models";
import type { DatabaseService } from "../../../core/db/DatabaseService";
import type { LmdbDatabase } from "../../../core/db/LmdbStore";

/**
 * Stored shape for a spec row. Mirrors the old SQL table columns, with
 * `stages` persisted separately in the `spec_stages` sub-db.
 */
interface SpecRow {
  id: string;
  repoId: string;
  name: string;
  path: string;
  branch: string;
  isCurrentBranch: boolean;
  files: string[];
  syncedAt: number;
  createdAt: number;
}

interface SpecStageRow {
  id: string;
  specId: string;
  name: string;
  status: string;
  filePath: string | null;
  metadata: unknown;
  /** Monotonic insertion counter so we can reproduce the SQL `rowid ASC` order. */
  order: number;
}

/**
 * LMDB-backed repository for `specs` + `spec_stages`.
 *
 * Sub-db layout:
 *   specs:
 *     spec:${id}                                   → SpecRow
 *     spec:repo:${repoId}:${branch}:${name}        → id  (unique per repo/branch/name)
 *     spec:byRepo:${repoId}:${id}                  → id  (list-by-repo index)
 *
 *   spec_stages:
 *     stage:${id}                                  → SpecStageRow
 *     stage:spec:${specId}:${order}:${id}          → id  (ordered per spec)
 */
export class SpecRepository {
  private readonly specs: LmdbDatabase<unknown>;
  private readonly stages: LmdbDatabase<unknown>;

  constructor(private readonly databaseService: DatabaseService) {
    this.specs = databaseService.getDb("specs");
    this.stages = databaseService.getDb("spec_stages");
  }

  getByRepoPath(repoPath: string): SpecFolder[] {
    // Find the repo id via the repos sub-db's secondary index.
    const repoId = this.databaseService
      .getDb("repos")
      .get(`repo:path:${repoPath}`) as string | undefined;
    if (!repoId) return [];

    // Prefix-scan the byRepo index for spec ids.
    const specRows: SpecRow[] = [];
    for (const entry of this.specs.range({ prefix: `spec:byRepo:${repoId}:` })) {
      const specId = entry.value as string;
      const row = this.specs.get(`spec:${specId}`) as SpecRow | undefined;
      if (row) specRows.push(row);
    }

    // Sort to mirror SQL: is_current_branch DESC, name ASC.
    specRows.sort((a, b) => {
      if (a.isCurrentBranch !== b.isCurrentBranch) {
        return a.isCurrentBranch ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    // Materialize stages per spec via prefix scan (ordered by `order` thanks
    // to key lexicographic ordering of zero-padded numeric segment).
    return specRows.map((row): SpecFolder => {
      const stageEntries: SpecStageRow[] = [];
      for (const entry of this.stages.range({ prefix: `stage:spec:${row.id}:` })) {
        const stageId = entry.value as string;
        const stage = this.stages.get(`stage:${stageId}`) as SpecStageRow | undefined;
        if (stage) stageEntries.push(stage);
      }
      return {
        id: row.id,
        repoPath,
        name: row.name,
        path: row.path,
        branch: row.branch,
        isCurrentBranch: row.isCurrentBranch,
        stages: stageEntries.map((s) => ({
          name: s.name as SpecFolder["stages"][number]["name"],
          status: s.status as SpecFolder["stages"][number]["status"],
          filePath: s.filePath,
          metadata: s.metadata as SpecFolder["stages"][number]["metadata"],
        })),
        files: row.files ?? [],
        createdAt: row.createdAt,
      };
    });
  }

  syncSpecs(
    repoPath: string,
    freshSpecs: SpecFolder[],
  ): { inserted: number; updated: number; deleted: number } {
    const repoId = this.databaseService
      .getDb("repos")
      .get(`repo:path:${repoPath}`) as string | undefined;
    if (!repoId) return { inserted: 0, updated: 0, deleted: 0 };

    const syncedAt = Date.now();

    return this.databaseService.transactionSync(() => {
      let inserted = 0;
      let updated = 0;

      // Track which spec ids were touched so we can prune stale ones.
      const touched = new Set<string>();

      for (const spec of freshSpecs) {
        const branch = spec.branch ?? "";
        const lookupKey = `spec:repo:${repoId}:${branch}:${spec.name}`;
        const existingId = this.specs.get(lookupKey) as string | undefined;

        if (existingId) {
          const prev = this.specs.get(`spec:${existingId}`) as SpecRow | undefined;
          const row: SpecRow = {
            id: existingId,
            repoId,
            name: spec.name,
            path: spec.path,
            branch,
            isCurrentBranch: Boolean(spec.isCurrentBranch),
            files: spec.files ?? [],
            syncedAt,
            createdAt: prev?.createdAt ?? spec.createdAt,
          };
          this.specs.putSync(`spec:${existingId}`, row);
          // Keep the two secondary indexes fresh (values don't change but
          // put is idempotent).
          this.specs.putSync(lookupKey, existingId);
          this.specs.putSync(`spec:byRepo:${repoId}:${existingId}`, existingId);

          // Wipe and rewrite stages for this spec.
          this.wipeStagesForSpecSync(existingId);
          this.writeStagesSync(existingId, spec.stages);

          touched.add(existingId);
          updated += 1;
        } else {
          const specId = ulid();
          const row: SpecRow = {
            id: specId,
            repoId,
            name: spec.name,
            path: spec.path,
            branch,
            isCurrentBranch: Boolean(spec.isCurrentBranch),
            files: spec.files ?? [],
            syncedAt,
            createdAt: spec.createdAt,
          };
          this.specs.putSync(`spec:${specId}`, row);
          this.specs.putSync(lookupKey, specId);
          this.specs.putSync(`spec:byRepo:${repoId}:${specId}`, specId);

          this.writeStagesSync(specId, spec.stages);

          touched.add(specId);
          inserted += 1;
        }
      }

      // Delete stale specs for this repo (anything not touched this sync).
      let deleted = 0;
      const byRepoEntries: Array<{ key: string; specId: string }> = [];
      for (const entry of this.specs.range({ prefix: `spec:byRepo:${repoId}:` })) {
        byRepoEntries.push({ key: entry.key, specId: entry.value as string });
      }
      for (const { specId } of byRepoEntries) {
        if (touched.has(specId)) continue;
        const row = this.specs.get(`spec:${specId}`) as SpecRow | undefined;
        if (!row) continue;
        this.specs.removeSync(`spec:${specId}`);
        this.specs.removeSync(`spec:repo:${repoId}:${row.branch}:${row.name}`);
        this.specs.removeSync(`spec:byRepo:${repoId}:${specId}`);
        this.wipeStagesForSpecSync(specId);
        deleted += 1;
      }

      // Mirror the SQL side-effect: update repos.spec_count / has_specs.
      const reposDb = this.databaseService.getDb<Record<string, unknown>>("repos");
      const repoKey = `repo:${repoId}`;
      const repo = reposDb.get(repoKey) as Record<string, unknown> | undefined;
      if (repo) {
        reposDb.putSync(repoKey, {
          ...repo,
          specCount: freshSpecs.length,
          hasSpecs: freshSpecs.length > 0,
        });
      }

      return { inserted, updated, deleted };
    });
  }

  deleteByRepoId(repoId: string): void {
    this.databaseService.transactionSync(() => {
      const byRepoEntries: Array<{ specId: string }> = [];
      for (const entry of this.specs.range({ prefix: `spec:byRepo:${repoId}:` })) {
        byRepoEntries.push({ specId: entry.value as string });
      }
      for (const { specId } of byRepoEntries) {
        const row = this.specs.get(`spec:${specId}`) as SpecRow | undefined;
        if (row) {
          this.specs.removeSync(`spec:repo:${repoId}:${row.branch}:${row.name}`);
        }
        this.specs.removeSync(`spec:${specId}`);
        this.specs.removeSync(`spec:byRepo:${repoId}:${specId}`);
        this.wipeStagesForSpecSync(specId);
      }
    });
  }

  // --- internal helpers (call inside an active sync transaction) ---

  private wipeStagesForSpecSync(specId: string): void {
    const indexEntries: Array<{ key: string; stageId: string }> = [];
    for (const entry of this.stages.range({ prefix: `stage:spec:${specId}:` })) {
      indexEntries.push({ key: entry.key, stageId: entry.value as string });
    }
    for (const { key, stageId } of indexEntries) {
      this.stages.removeSync(`stage:${stageId}`);
      this.stages.removeSync(key);
    }
  }

  private writeStagesSync(specId: string, stages: SpecFolder["stages"]): void {
    stages.forEach((stage, idx) => {
      const stageId = ulid();
      const row: SpecStageRow = {
        id: stageId,
        specId,
        name: stage.name,
        status: stage.status,
        filePath: stage.filePath ?? null,
        metadata: stage.metadata ?? undefined,
        order: idx,
      };
      this.stages.putSync(`stage:${stageId}`, row);
      // Zero-pad the order segment so ordered-binary key compare gives the
      // intended numeric sequence when there are more than 10 stages.
      const orderKey = String(idx).padStart(6, "0");
      this.stages.putSync(`stage:spec:${specId}:${orderKey}:${stageId}`, stageId);
    });
  }
}
