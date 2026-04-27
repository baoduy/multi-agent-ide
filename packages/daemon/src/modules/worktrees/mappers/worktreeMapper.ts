import type { WorktreeEntry } from "../../repos/infra/GitGateway";

/** Row → WorktreeEntry (+ lastSyncedAt). */
export interface WorktreeRecord extends WorktreeEntry {
  lastSyncedAt: number;
}

export function mapWorktreeRow(row: Record<string, unknown>): WorktreeRecord {
  return {
    repoPath: row.repo_path as string,
    worktreePath: row.worktree_path as string,
    branch: row.branch as string,
    name: row.name as string,
    createdAt: row.created_at as number,
    lastSyncedAt: row.last_synced_at as number,
  };
}

export function toWorktreeParams(record: WorktreeRecord): Record<string, unknown> {
  return {
    repo_path: record.repoPath,
    worktree_path: record.worktreePath,
    branch: record.branch,
    name: record.name,
    created_at: record.createdAt,
    last_synced_at: record.lastSyncedAt,
  };
}
