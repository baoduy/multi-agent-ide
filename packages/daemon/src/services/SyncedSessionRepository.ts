import path from "node:path";
import type { SyncedSessionRecord, SyncedSessionProvider } from "@magenta/shared/syncedSession";
import type { DatabaseService } from "../db/DatabaseService";
import { mapSyncedSessionRow, toSyncedSessionParams } from "../infrastructure/mappers/syncedSessionMapper";

/**
 * Data access for the synced_sessions table.
 * Stores session metadata scanned from Claude Code and Copilot JSONL files.
 */
export class SyncedSessionRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * List all synced sessions, ordered by started_at DESC.
   */
  list(): SyncedSessionRecord[] {
    const rows = this.databaseService
      .getSqlite()
      .prepare(
        `SELECT id, provider, session_id, project_dir, cwd, git_branch, model,
                token_usage_json, message_count, subagent_count, status, activity,
                slug, version, entrypoint, title, started_at, ended_at, created_at
         FROM synced_sessions
         ORDER BY started_at DESC`
      )
      .all() as Array<Record<string, unknown>>;

    return rows.map(mapSyncedSessionRow);
  }

  /**
   * List synced sessions filtered by provider.
   */
  listByProvider(provider: SyncedSessionProvider): SyncedSessionRecord[] {
    const rows = this.databaseService
      .getSqlite()
      .prepare(
        `SELECT id, provider, session_id, project_dir, cwd, git_branch, model,
                token_usage_json, message_count, subagent_count, status, activity,
                slug, version, entrypoint, title, started_at, ended_at, created_at
         FROM synced_sessions
         WHERE provider = ?
         ORDER BY started_at DESC`
      )
      .all(provider) as Array<Record<string, unknown>>;

    return rows.map(mapSyncedSessionRow);
  }

  /**
   * Get a session by its synced file path (used for incremental sync).
   * Returns the mtime and size, or null if not found.
   */
  getFileSync(filePath: string): { mtime: number; size: number } | null {
    const row = this.databaseService
      .getSqlite()
      .prepare(
        `SELECT synced_file_mtime, synced_file_size FROM synced_sessions WHERE synced_file_path = ?`
      )
      .get(filePath) as { synced_file_mtime: number; synced_file_size: number } | undefined;

    if (!row) return null;
    return { mtime: row.synced_file_mtime, size: row.synced_file_size };
  }

  /**
   * Upsert a synced session record.
   * Uses INSERT OR REPLACE on the unique synced_file_path.
   */
  upsert(record: SyncedSessionRecord & {
    syncedFilePath: string;
    syncedFileMtime: number;
    syncedFileSize: number;
    lastSyncedAt: number;
  }): void {
    const params = toSyncedSessionParams(record);

    this.databaseService
      .getSqlite()
      .prepare(
        `INSERT OR REPLACE INTO synced_sessions (
           id, provider, session_id, project_dir, cwd, git_branch, model,
           token_usage_json, message_count, subagent_count, status, activity,
           slug, version, entrypoint, title, synced_file_path, synced_file_mtime,
           synced_file_size, started_at, ended_at, last_synced_at, created_at
         ) VALUES (
           @id, @provider, @session_id, @project_dir, @cwd, @git_branch, @model,
           @token_usage_json, @message_count, @subagent_count, @status, @activity,
           @slug, @version, @entrypoint, @title, @synced_file_path, @synced_file_mtime,
           @synced_file_size, @started_at, @ended_at, @last_synced_at, @created_at
         )`
      )
      .run(params);
  }

  /**
   * Remove sessions whose synced file no longer exists on disk.
   * Returns the number of deleted rows.
   */
  deleteByProvider(provider: SyncedSessionProvider): number {
    const result = this.databaseService
      .getSqlite()
      .prepare(`DELETE FROM synced_sessions WHERE provider = ?`)
      .run(provider);

    return result.changes ?? 0;
  }

  /**
   * Get count of sessions by provider.
   */
  countByProvider(provider: SyncedSessionProvider): number {
    const row = this.databaseService
      .getSqlite()
      .prepare(`SELECT COUNT(*) as count FROM synced_sessions WHERE provider = ?`)
      .get(provider) as { count: number };

    return row.count;
  }

  /**
   * Delete Claude Code synced sessions whose cwd does not match any of the
   * given known paths. A session matches if its cwd equals or is a subdirectory
   * of any known path. Sessions with null cwd are also removed.
   *
   * Copilot sessions are intentionally excluded — their inclusion is governed
   * by workspace.yaml presence on disk rather than knownPaths membership.
   *
   * Returns the number of deleted rows.
   */
  deleteClaudeWhereNotMatchingPaths(knownPaths: readonly string[]): number {
    if (knownPaths.length === 0) return 0;

    // Fetch only Claude Code rows
    const rows = this.databaseService
      .getSqlite()
      .prepare(`SELECT id, cwd FROM synced_sessions WHERE provider = 'claude-code'`)
      .all() as Array<{ id: string; cwd: string | null }>;

    const normalizedKnownPaths = knownPaths.map((p) => path.normalize(p));

    const idsToDelete: string[] = [];
    for (const row of rows) {
      if (!row.cwd) {
        idsToDelete.push(row.id);
        continue;
      }

      const normalizedCwd = path.normalize(row.cwd);
      const matches = normalizedKnownPaths.some(
        (known) => normalizedCwd === known || normalizedCwd.startsWith(known + path.sep),
      );

      if (!matches) {
        idsToDelete.push(row.id);
      }
    }

    if (idsToDelete.length === 0) return 0;

    // Delete in batches to avoid overly long SQL
    const deleteStmt = this.databaseService
      .getSqlite()
      .prepare(`DELETE FROM synced_sessions WHERE id = ?`);

    for (const id of idsToDelete) {
      deleteStmt.run(id);
    }

    return idsToDelete.length;
  }

  /**
   * Persist pending changes to disk.
   */
  flush(): void {
    this.databaseService.flush();
  }
}
