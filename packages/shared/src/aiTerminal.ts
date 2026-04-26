import { z } from "zod";

export const AI_PROVIDERS = ["claude", "copilot"] as const;
export type AIProvider = (typeof AI_PROVIDERS)[number];

export const AI_SESSION_STATUSES = ["idle", "active", "waiting-input", "error", "exited"] as const;
export type AISessionStatus = (typeof AI_SESSION_STATUSES)[number];

/**
 * Permission modes available per provider.
 *
 * Claude Code modes: default, acceptEdits, plan, auto, dontAsk, bypassPermissions
 * Copilot modes:     default, auto (maps to --agent-threads-auto-accept)
 *
 * The union is provider-agnostic; the daemon maps each mode to the correct CLI
 * flags in `providerRegistry`.
 */
export const AI_PERMISSION_MODES = [
  "default",
  "acceptEdits",
  "plan",
  "auto",
  "dontAsk",
  "bypassPermissions",
] as const;
export type AIPermissionMode = (typeof AI_PERMISSION_MODES)[number];

/** Which permission modes each provider supports. */
export const PROVIDER_PERMISSION_MODES: Record<AIProvider, readonly AIPermissionMode[]> = {
  claude: ["default", "acceptEdits", "plan", "auto", "dontAsk", "bypassPermissions"],
  copilot: ["default", "auto", "bypassPermissions"],
};

const SLASH_COMMAND_CATEGORIES = [
  "session", "context", "model", "permissions",
  "mcp", "agents", "output", "git", "navigation", "info",
] as const;

export const AISessionRecordSchema = z.object({
  id: z.string(),
  provider: z.enum(AI_PROVIDERS),
  repoPath: z.string().nullable(),
  repoName: z.string().nullable(),
  branch: z.string().nullable(),
  worktreePath: z.string().nullable(),
  worktreeName: z.string().nullable(),
  cwd: z.string(),
  providerSessionId: z.string().nullable(),
  status: z.enum(AI_SESSION_STATUSES),
  /** Current permission mode for this session. */
  permissionMode: z.enum(AI_PERMISSION_MODES),
  /** Human-readable title derived from the user's first input. */
  title: z.string().nullable(),
  createdAt: z.number().int().nonnegative(),
  lastActiveAt: z.number().int().nonnegative(),
});

export type AISessionRecord = z.infer<typeof AISessionRecordSchema>;

export interface AISessionConfig {
  provider: AIProvider;
  repoPath?: string;
  branch?: string;
  worktreePath?: string;
  /** Permission mode to start the session with (defaults to "auto"). */
  permissionMode?: AIPermissionMode;
  env?: Record<string, string>;
  /** Phase 4 — Optional tool allowlist/denylist passed to the CLI. */
  allowedTools?: string[];
  disallowedTools?: string[];
  /** Phase 4 — Resolved preset id (presets merged in by the app service). */
  presetId?: string;
  /** Phase 4 — Claude `--permission-prompt-tool` MCP tool name. */
  permissionPromptTool?: string;
  /** Phase 4 — Copilot `--no-ask-user`; programmatic-only (interactive ignores). */
  noAskUser?: boolean;
  /** Phase 4 — Whether this is a programmatic spawn (gates `noAskUser`). */
  programmatic?: boolean;
  /**
   * Optional explicit agent session UUID, present when the caller is
   * resuming a session that was previously synced from disk.
   *
   * - Claude:  the daemon invokes the CLI with `--resume <id>` (no
   *   `--session-id` — it would require `--fork-session` alongside
   *   `--resume`, which forks the conversation instead of continuing it).
   * - Copilot: the daemon invokes the CLI with `--resume=<id>`.
   *
   * Leave undefined for brand-new sessions. Both CLIs generate their own
   * UUID on disk and the background sync job reconciles the live record's
   * `providerSessionId` once the JSONL/state-dir appears.
   */
  providerSessionId?: string;
}

type SlashCommandCategory = (typeof SLASH_COMMAND_CATEGORIES)[number];

const SlashCommandSchema = z.object({
  command: z.string(),
  aliases: z.array(z.string()).optional(),
  description: z.string(),
  category: z.enum(SLASH_COMMAND_CATEGORIES),
  args: z.string().optional(),
  providers: z.array(z.enum(AI_PROVIDERS)),
});

export type SlashCommand = z.infer<typeof SlashCommandSchema>;

const CliFlagSchema = z.object({
  flag: z.string(),
  short: z.string().optional(),
  aliases: z.array(z.string()).optional(),
  description: z.string(),
  valueHint: z.string().optional(),
  category: z.enum(SLASH_COMMAND_CATEGORIES),
  providers: z.array(z.enum(AI_PROVIDERS)),
});

export type CliFlag = z.infer<typeof CliFlagSchema>;


export const ProviderMetaSchema = z.object({
  name: z.string(),
  icon: z.string(),
  binaryName: z.string(),
  defaultArgs: z.array(z.string()),
  supportedPermissionModes: z.array(z.enum(AI_PERMISSION_MODES)),
  slashCommands: z.array(SlashCommandSchema),
  cliFlags: z.array(CliFlagSchema),
});

export type ProviderMeta = z.infer<typeof ProviderMetaSchema>;

export {
  AISpawnOptionsSchema,
  SPAWN_OPTIONS_SCHEMA_VERSION,
  type AISpawnOptions,
} from "./aiSpawnOptions";
export {
  PROVIDER_CAPABILITIES,
  getProviderCapability,
  type ProviderCapability,
  type SpawnOptionKey,
} from "./providerCapabilities";

export {
  AIStreamEventSchema,
  TokenUsageSchema,
  type AIStreamEvent,
  type TokenUsage,
  type PluginError,
} from "./aiStreamEvent";
