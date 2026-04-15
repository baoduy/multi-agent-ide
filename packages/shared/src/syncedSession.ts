import { z } from "zod";

export const SYNCED_SESSION_PROVIDERS = ["claude-code", "copilot"] as const;
export type SyncedSessionProvider = (typeof SYNCED_SESSION_PROVIDERS)[number];

export const SYNCED_SESSION_STATUSES = ["active", "completed"] as const;

/**
 * Live activity for a synced session.
 * - `processing` — the agent is currently producing output (an assistant turn or tool execution is in flight).
 * - `idle`       — the session is alive but waiting for the next user input.
 * - `completed`  — the session has been shut down or otherwise finished.
 *
 * `activity` is a refinement of `status`: any session with `status === "completed"`
 * also has `activity === "completed"`. Active sessions split into `processing` vs `idle`.
 */
export const SYNCED_SESSION_ACTIVITIES = ["processing", "idle", "completed"] as const;
export type SyncedSessionActivity = (typeof SYNCED_SESSION_ACTIVITIES)[number];

export const TokenUsageSchema = z.object({
  inputTokens: z.number().nonnegative().default(0),
  outputTokens: z.number().nonnegative().default(0),
  cacheCreationInputTokens: z.number().nonnegative().default(0),
  cacheReadInputTokens: z.number().nonnegative().default(0),
});

export type TokenUsage = z.infer<typeof TokenUsageSchema>;

export const SyncedSessionRecordSchema = z.object({
  id: z.string(),
  provider: z.enum(SYNCED_SESSION_PROVIDERS),
  sessionId: z.string(),
  projectDir: z.string().nullable(),
  cwd: z.string().nullable(),
  gitBranch: z.string().nullable(),
  model: z.string().nullable(),
  tokenUsage: TokenUsageSchema.nullable(),
  messageCount: z.number().int().nonnegative(),
  subagentCount: z.number().int().nonnegative(),
  status: z.enum(SYNCED_SESSION_STATUSES),
  activity: z.enum(SYNCED_SESSION_ACTIVITIES),
  slug: z.string().nullable(),
  version: z.string().nullable(),
  entrypoint: z.string().nullable(),
  title: z.string().nullable(),
  startedAt: z.number().int().nonnegative(),
  endedAt: z.number().int().nonnegative().nullable(),
  createdAt: z.number().int().nonnegative(),
});

export type SyncedSessionRecord = z.infer<typeof SyncedSessionRecordSchema>;

/**
 * Sessions grouped by directory path for the UI.
 * The key is a display-friendly project name,
 * and each group contains the cwd path and its sessions.
 */
export interface SyncedSessionGroup {
  /** Display name (repo folder name or project dir name) */
  name: string;
  /** The cwd or project directory path */
  path: string;
  /** Provider breakdown */
  provider: SyncedSessionProvider | "mixed";
  /** Sessions in this group, sorted by startedAt DESC */
  sessions: SyncedSessionRecord[];
}
