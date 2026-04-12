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
        `SELECT id, provider, repo_path, repo_name, branch, worktree_path, worktree_name, cwd, provider_session_id, title, created_at, last_active_at
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
        `SELECT id, provider, repo_path, repo_name, branch, worktree_path, worktree_name, cwd, provider_session_id, title, created_at, last_active_at
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
           id, provider, repo_path, repo_name, branch, worktree_path, worktree_name, cwd, provider_session_id, title, created_at, last_active_at
         ) VALUES (
           @id, @provider, @repoPath, @repoName, @branch, @worktreePath, @worktreeName, @cwd, @providerSessionId, @title, @createdAt, @lastActiveAt
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
        title: record.title,
        createdAt: record.createdAt,
        lastActiveAt: record.lastActiveAt,
      });
  }

  /**
   * Update specific fields of a session.
   */
  update(id: string, patch: Partial<AISessionRecord>): void {
    const setClauses: string[] = [];
    const params: Record<string, unknown> = { id };

    if (patch.provider !== undefined) {
      setClauses.push("provider = @provider");
      params.provider = patch.provider;
    }
    if (patch.repoPath !== undefined) {
      setClauses.push("repo_path = @repoPath");
      params.repoPath = patch.repoPath;
    }
    if (patch.repoName !== undefined) {
      setClauses.push("repo_name = @repoName");
      params.repoName = patch.repoName;
    }
    if (patch.branch !== undefined) {
      setClauses.push("branch = @branch");
      params.branch = patch.branch;
    }
    if (patch.worktreePath !== undefined) {
      setClauses.push("worktree_path = @worktreePath");
      params.worktreePath = patch.worktreePath;
    }
    if (patch.worktreeName !== undefined) {
      setClauses.push("worktree_name = @worktreeName");
      params.worktreeName = patch.worktreeName;
    }
    if (patch.cwd !== undefined) {
      setClauses.push("cwd = @cwd");
      params.cwd = patch.cwd;
    }
    if (patch.providerSessionId !== undefined) {
      setClauses.push("provider_session_id = @providerSessionId");
      params.providerSessionId = patch.providerSessionId;
    }
    if (patch.title !== undefined) {
      setClauses.push("title = @title");
      params.title = patch.title;
    }
    if (patch.createdAt !== undefined) {
      setClauses.push("created_at = @createdAt");
      params.createdAt = patch.createdAt;
    }
    if (patch.lastActiveAt !== undefined) {
      setClauses.push("last_active_at = @lastActiveAt");
      params.lastActiveAt = patch.lastActiveAt;
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
