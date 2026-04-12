import { z } from "zod";

export const AI_PROVIDERS = ["claude", "copilot"] as const;
export type AIProvider = (typeof AI_PROVIDERS)[number];

export const AI_SESSION_STATUSES = ["idle", "running", "waiting-input", "error", "exited"] as const;
export type AISessionStatus = (typeof AI_SESSION_STATUSES)[number];

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

export interface SlashCommand {
  command: string;
  aliases?: string[];
  description: string;
  category: SlashCommandCategory;
  args?: string;
  providers: AIProvider[];
}

export interface CliFlag {
  flag: string;
  short?: string;
  aliases?: string[];
  description: string;
  valueHint?: string;
  category: SlashCommandCategory;
  providers: AIProvider[];
}

export interface ProviderMeta {
  name: string;
  icon: string;
  binaryName: string;
  defaultArgs: string[];
  slashCommands: SlashCommand[];
  cliFlags: CliFlag[];
}
