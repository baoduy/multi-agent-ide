import type { AISessionRecord } from "@magenta/shared/aiTerminal";
import type { DatabaseService } from "../db/DatabaseService";
import { mapAISessionRow } from "../infrastructure/mappers/aiSessionMapper";

export class AISessionRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Persist pending changes to disk (sql.js is in-memory).
   */
  flush(): void {
    this.databaseService.flush();
  }

  /**
   * List all AI sessions ordered by most recently active.
   */
  list(): AISessionRecord[] {
    const rows = this.databaseService
      .getSqlite()
      .prepare(
        `SELECT id, provider, repo_path, repo_name, branch, worktree_path, worktree_name, cwd, provider_session_id, permission_mode, title, created_at, last_active_at
         FROM ai_sessions
         ORDER BY last_active_at DESC`
      )
      .all() as Array<Record<string, unknown>>;

    return rows.map(mapAISessionRow);
  }

  /**
   * Get a session by ID.
   */
  getById(id: string): AISessionRecord | null {
    const row = this.databaseService
      .getSqlite()
      .prepare(
        `SELECT id, provider, repo_path, repo_name, branch, worktree_path, worktree_name, cwd, provider_session_id, permission_mode, title, created_at, last_active_at
         FROM ai_sessions
         WHERE id = ?`
      )
      .get(id) as Record<string, unknown> | undefined;

    if (!row) {
      return null;
    }

    return mapAISessionRow(row);
  }

  /**
   * Create a new AI session.
   */
  create(record: AISessionRecord): void {
    this.databaseService
      .getSqlite()
      .prepare(
        `INSERT INTO ai_sessions (
           id, provider, repo_path, repo_name, branch, worktree_path, worktree_name, cwd, provider_session_id, permission_mode, title, created_at, last_active_at
         ) VALUES (
           @id, @provider, @repoPath, @repoName, @branch, @worktreePath, @worktreeName, @cwd, @providerSessionId, @permissionMode, @title, @createdAt, @lastActiveAt
         )`
      )
      .run({
        id: record.id,
        provider: record.provider,
        repoPath: record.repoPath,
        repoName: record.repoName,
        branch: record.branch,
        worktreePath: record.worktreePath,
        worktreeName: record.worktreeName,
        cwd: record.cwd,
        providerSessionId: record.providerSessionId,
        permissionMode: record.permissionMode,
        title: record.title,
        createdAt: record.createdAt,
        lastActiveAt: record.lastActiveAt,
      });
  }

  /** Maps camelCase AISessionRecord keys to snake_case column names. */
  private static readonly COLUMN_MAP: Record<string, string> = {
    provider: "provider",
    repoPath: "repo_path",
    repoName: "repo_name",
    branch: "branch",
    worktreePath: "worktree_path",
    worktreeName: "worktree_name",
    cwd: "cwd",
    providerSessionId: "provider_session_id",
    permissionMode: "permission_mode",
    title: "title",
    createdAt: "created_at",
    lastActiveAt: "last_active_at",
  };

  /**
   * Update specific fields of a session.
   */
  update(id: string, patch: Partial<AISessionRecord>): void {
    const setClauses: string[] = [];
    const params: Record<string, unknown> = { id };

    for (const [key, column] of Object.entries(AISessionRepository.COLUMN_MAP)) {
      const value = (patch as Record<string, unknown>)[key];
      if (value !== undefined) {
        setClauses.push(`${column} = @${key}`);
        params[key] = value;
      }
    }

    if (setClauses.length === 0) {
      return;
    }

    const sql = `UPDATE ai_sessions SET ${setClauses.join(", ")} WHERE id = @id`;
    this.databaseService.getSqlite().prepare(sql).run(params);
  }

  /**
   * Delete a session by ID.
   */
  delete(id: string): void {
    this.databaseService.getSqlite().prepare(`DELETE FROM ai_sessions WHERE id = ?`).run(id);
  }
}
