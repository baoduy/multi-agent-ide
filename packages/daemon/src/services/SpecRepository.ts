import { ulid } from "ulid";

import type { SpecFolder } from "@magenta/shared/models";
import type { PipelineStageName, StageStatus } from "@magenta/shared/constants";
import type { DatabaseService } from "../db/DatabaseService";

export class SpecRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  getByRepoPath(repoPath: string): SpecFolder[] {
    const repoRow = this.databaseService
      .getSqlite()
      .prepare(`SELECT id FROM repos WHERE path = @path`)
      .get({ path: repoPath }) as Record<string, unknown> | undefined;

    if (!repoRow) {
      return [];
    }

    const repoId = repoRow.id as string;

    // Single query with LEFT JOIN — previously this did N+1 queries,
    // issuing one extra SELECT per spec to load its stages. `spec:list` is
    // called on tab switches / repo selection / every sync completion, so
    // even a small N amplifies. Rows are then grouped by spec id in-app.
    const rows = this.databaseService
      .getSqlite()
      .prepare(
        `SELECT s.id as specId,
                s.name as specName,
                s.path as specPath,
                s.branch as specBranch,
                s.is_current_branch as isCurrentBranch,
                s.files_json as filesJson,
                s.created_at as specCreatedAt,
                st.name as stageName,
                st.status as stageStatus,
                st.file_path as stageFilePath,
                st.metadata_json as stageMetadataJson
         FROM specs s
         LEFT JOIN spec_stages st ON st.spec_id = s.id
         WHERE s.repo_id = @repoId
         ORDER BY s.is_current_branch DESC, s.name ASC, st.rowid ASC`
      )
      .all({ repoId }) as Array<Record<string, unknown>>;

    const specsById = new Map<string, SpecFolder>();
    for (const row of rows) {
      const specId = row.specId as string;
      let spec = specsById.get(specId);
      if (!spec) {
        spec = {
          id: specId,
          repoPath,
          name: row.specName as string,
          path: row.specPath as string,
          branch: row.specBranch as string,
          isCurrentBranch: Boolean(row.isCurrentBranch),
          stages: [],
          files: JSON.parse((row.filesJson as string) || "[]"),
          createdAt: row.specCreatedAt as number,
        };
        specsById.set(specId, spec);
      }
      // LEFT JOIN produces a row with null stage columns for specs that
      // have no stage rows; skip those rather than materializing a bogus
      // stage entry.
      if (row.stageName !== null && row.stageName !== undefined) {
        spec.stages.push({
          name: row.stageName as PipelineStageName,
          status: row.stageStatus as StageStatus,
          filePath: (row.stageFilePath as string | null) ?? null,
          metadata: row.stageMetadataJson
            ? JSON.parse(row.stageMetadataJson as string)
            : undefined,
        });
      }
    }

    return [...specsById.values()];
  }

  syncSpecs(
    repoPath: string,
    freshSpecs: SpecFolder[]
  ): { inserted: number; updated: number; deleted: number } {
    const repoRow = this.databaseService
      .getSqlite()
      .prepare(`SELECT id FROM repos WHERE path = @path`)
      .get({ path: repoPath }) as Record<string, unknown> | undefined;

    if (!repoRow) {
      return { inserted: 0, updated: 0, deleted: 0 };
    }

    const repoId = repoRow.id as string;
    const syncedAt = Date.now();

    const sqlite = this.databaseService.getSqlite();
    const transaction = sqlite.transaction(((specs: SpecFolder[]) => {
      let inserted = 0;
      let updated = 0;

      for (const spec of specs) {
        const existingRow = sqlite
          .prepare(
            `SELECT id FROM specs WHERE repo_id = @repoId AND branch = @branch AND name = @name`
          )
          .get({ repoId, branch: spec.branch ?? "", name: spec.name }) as
          | Record<string, unknown>
          | undefined;

        if (existingRow) {
          const specId = existingRow.id as string;

          sqlite
            .prepare(
              `UPDATE specs
               SET path = @path,
                   is_current_branch = @isCurrentBranch,
                   files_json = @filesJson,
                   synced_at = @syncedAt,
                   created_at = @createdAt
               WHERE id = @specId`
            )
            .run({
              specId,
              path: spec.path,
              isCurrentBranch: spec.isCurrentBranch ? 1 : 0,
              filesJson: JSON.stringify(spec.files),
              syncedAt,
              createdAt: spec.createdAt,
            });

          sqlite.prepare(`DELETE FROM spec_stages WHERE spec_id = @specId`).run({ specId });

          for (const stage of spec.stages) {
            sqlite
              .prepare(
                `INSERT INTO spec_stages (id, spec_id, name, status, file_path, metadata_json)
                 VALUES (@id, @specId, @name, @status, @filePath, @metadataJson)`
              )
              .run({
                id: ulid(),
                specId,
                name: stage.name,
                status: stage.status,
                filePath: stage.filePath,
                metadataJson: stage.metadata ? JSON.stringify(stage.metadata) : null,
              });
          }

          updated += 1;
        } else {
          const specId = ulid();

          sqlite
            .prepare(
              `INSERT INTO specs (id, repo_id, name, path, branch, is_current_branch, files_json, synced_at, created_at)
               VALUES (@id, @repoId, @name, @path, @branch, @isCurrentBranch, @filesJson, @syncedAt, @createdAt)`
            )
            .run({
              id: specId,
              repoId,
              name: spec.name,
              path: spec.path,
              branch: spec.branch ?? "",
              isCurrentBranch: spec.isCurrentBranch ? 1 : 0,
              filesJson: JSON.stringify(spec.files),
              syncedAt,
              createdAt: spec.createdAt,
            });

          for (const stage of spec.stages) {
            sqlite
              .prepare(
                `INSERT INTO spec_stages (id, spec_id, name, status, file_path, metadata_json)
                 VALUES (@id, @specId, @name, @status, @filePath, @metadataJson)`
              )
              .run({
                id: ulid(),
                specId,
                name: stage.name,
                status: stage.status,
                filePath: stage.filePath,
                metadataJson: stage.metadata ? JSON.stringify(stage.metadata) : null,
              });
          }

          inserted += 1;
        }
      }

      const deleteResult = sqlite
        .prepare(`DELETE FROM specs WHERE repo_id = @repoId AND synced_at < @syncedAt`)
        .run({ repoId, syncedAt }) as Record<string, unknown>;

      const deleted = (deleteResult.changes as number) || 0;

      sqlite
        .prepare(`UPDATE repos SET spec_count = @specCount, has_specs = @hasSpecs WHERE id = @repoId`)
        .run({
          repoId,
          specCount: specs.length,
          hasSpecs: specs.length > 0 ? 1 : 0,
        });

      return { inserted, updated, deleted };
    }) as unknown as (...args: unknown[]) => unknown);

    return transaction(freshSpecs) as unknown as { inserted: number; updated: number; deleted: number };
  }

  deleteByRepoId(repoId: string): void {
    this.databaseService
      .getSqlite()
      .prepare(`DELETE FROM specs WHERE repo_id = @repoId`)
      .run({ repoId });
  }
}
