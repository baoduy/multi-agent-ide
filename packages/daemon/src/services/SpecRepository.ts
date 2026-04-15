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

    const specRows = this.databaseService
      .getSqlite()
      .prepare(
        `SELECT id, name, path, branch, is_current_branch as isCurrentBranch, files_json as filesJson, created_at as createdAt
         FROM specs
         WHERE repo_id = @repoId
         ORDER BY is_current_branch DESC, name ASC`
      )
      .all({ repoId }) as Array<Record<string, unknown>>;

    const specs: SpecFolder[] = [];

    for (const specRow of specRows) {
      const specId = specRow.id as string;

      const stageRows = this.databaseService
        .getSqlite()
        .prepare(
          `SELECT name, status, file_path as filePath, metadata_json as metadataJson
           FROM spec_stages
           WHERE spec_id = @specId`
        )
        .all({ specId }) as Array<Record<string, unknown>>;

      const stages = stageRows.map((s) => ({
        name: s.name as PipelineStageName,
        status: s.status as StageStatus,
        filePath: (s.filePath as string | null) ?? null,
        metadata: s.metadataJson ? JSON.parse(s.metadataJson as string) : undefined,
      }));

      specs.push({
        id: specId,
        repoPath,
        name: specRow.name as string,
        path: specRow.path as string,
        branch: specRow.branch as string,
        isCurrentBranch: Boolean(specRow.isCurrentBranch),
        stages,
        files: JSON.parse((specRow.filesJson as string) || "[]"),
        createdAt: specRow.createdAt as number,
      });
    }

    return specs;
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
