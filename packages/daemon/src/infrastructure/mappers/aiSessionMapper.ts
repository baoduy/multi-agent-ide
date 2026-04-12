import type { AISessionRecord } from "@magenta/shared/aiTerminal";

export function mapAISessionRow(row: Record<string, unknown>): AISessionRecord {
  return {
    id: row.id as string,
    provider: row.provider as AISessionRecord["provider"],
    repoPath: (row.repo_path as string) ?? null,
    repoName: (row.repo_name as string) ?? null,
    branch: (row.branch as string) ?? null,
    worktreePath: (row.worktree_path as string) ?? null,
    worktreeName: (row.worktree_name as string) ?? null,
    cwd: row.cwd as string,
    providerSessionId: (row.provider_session_id as string) ?? null,
    // Status is no longer persisted — default to "idle".
    // The application service enriches this with real-time status
    // by checking whether a live PTY process exists.
    status: "idle",
    title: (row.title as string) ?? null,
    createdAt: row.created_at as number,
    lastActiveAt: row.last_active_at as number,
  };
}
