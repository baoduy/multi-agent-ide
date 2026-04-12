import { z } from "zod";

export const AI_PROVIDERS = ["claude", "copilot"] as const;
export type AIProvider = (typeof AI_PROVIDERS)[number];

export const AI_SESSION_STATUSES = ["idle", "running", "waiting-input", "error", "exited"] as const;
export type AISessionStatus = (typeof AI_SESSION_STATUSES)[number];

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
  args?: string[];
  env?: Record<string, string>;
}

export type SlashCommandCategory =
  | "session" | "context" | "model" | "permissions"
  | "mcp" | "agents" | "output" | "git" | "navigation" | "info";

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
  slashCommands: z.array(SlashCommandSchema),
  cliFlags: z.array(CliFlagSchema),
});

export type ProviderMeta = z.infer<typeof ProviderMetaSchema>;
