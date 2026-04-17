import type { SyncedSessionRecord, TokenUsage } from "@magenta/shared/syncedSession";

/**
 * Maps a raw SQLite row (snake_case) to a SyncedSessionRecord (camelCase).
 */
export function mapSyncedSessionRow(row: Record<string, unknown>): SyncedSessionRecord {
  let tokenUsage: TokenUsage | null = null;

  if (row.token_usage_json && typeof row.token_usage_json === "string") {
    try {
      tokenUsage = JSON.parse(row.token_usage_json) as TokenUsage;
    } catch {
      tokenUsage = null;
    }
  }

  return {
    id: row.id as string,
    provider: row.provider as SyncedSessionRecord["provider"],
    sessionId: row.session_id as string,
    projectDir: (row.project_dir as string) ?? null,
    cwd: (row.cwd as string) ?? null,
    gitBranch: (row.git_branch as string) ?? null,
    model: (row.model as string) ?? null,
    tokenUsage,
    messageCount: (row.message_count as number) ?? 0,
    subagentCount: (row.subagent_count as number) ?? 0,
    status: (row.status as SyncedSessionRecord["status"]) ?? "completed",
    activity: (row.activity as SyncedSessionRecord["activity"]) ?? "idle",
    slug: (row.slug as string) ?? null,
    version: (row.version as string) ?? null,
    entrypoint: (row.entrypoint as string) ?? null,
    title: (row.title as string) ?? null,
    syncedFilePath: (row.synced_file_path as string) ?? null,
    startedAt: row.started_at as number,
    endedAt: (row.ended_at as number) ?? null,
    createdAt: row.created_at as number,
    isArchived: (row.is_archived as number) === 1,
  };
}

/**
 * Converts a SyncedSessionRecord (camelCase) to a params object
 * matching the SQL insert/update column names.
 */
export function toSyncedSessionParams(record: SyncedSessionRecord & {
  syncedFilePath: string;
  syncedFileMtime: number;
  syncedFileSize: number;
  lastSyncedAt: number;
}): Record<string, unknown> {
  return {
    id: record.id,
    provider: record.provider,
    session_id: record.sessionId,
    project_dir: record.projectDir,
    cwd: record.cwd,
    git_branch: record.gitBranch,
    model: record.model,
    token_usage_json: record.tokenUsage ? JSON.stringify(record.tokenUsage) : null,
    message_count: record.messageCount,
    subagent_count: record.subagentCount,
    status: record.status,
    activity: record.activity,
    slug: record.slug,
    version: record.version,
    entrypoint: record.entrypoint,
    title: record.title,
    synced_file_path: record.syncedFilePath,
    synced_file_mtime: record.syncedFileMtime,
    synced_file_size: record.syncedFileSize,
    started_at: record.startedAt,
    ended_at: record.endedAt,
    last_synced_at: record.lastSyncedAt,
    created_at: record.createdAt,
    is_archived: record.isArchived ? 1 : 0,
  };
}
