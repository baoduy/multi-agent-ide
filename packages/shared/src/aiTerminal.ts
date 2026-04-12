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

/** Human-readable labels for each permission mode. */
export const PERMISSION_MODE_LABELS: Record<AIPermissionMode, string> = {
  default: "Default",
  acceptEdits: "Accept Edits",
  plan: "Plan",
  auto: "Auto",
  dontAsk: "Don't Ask",
  bypassPermissions: "Bypass Permissions",
};

/** Which permission modes each provider supports. */
export const PROVIDER_PERMISSION_MODES: Record<AIProvider, readonly AIPermissionMode[]> = {
  claude: ["default", "acceptEdits", "plan", "auto", "dontAsk", "bypassPermissions"],
  copilot: ["default", "auto", "bypassPermissions"],
};

export const SLASH_COMMAND_CATEGORIES = [
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
  args?: string[];
  env?: Record<string, string>;
}

export type SlashCommandCategory = (typeof SLASH_COMMAND_CATEGORIES)[number];

export const SlashCommandSchema = z.object({
  command: z.string(),
  aliases: z.array(z.string()).optional(),
  description: z.string(),
  category: z.enum(SLASH_COMMAND_CATEGORIES),
  args: z.string().optional(),
  providers: z.array(z.enum(AI_PROVIDERS)),
});

export type SlashCommand = z.infer<typeof SlashCommandSchema>;

export const CliFlagSchema = z.object({
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
