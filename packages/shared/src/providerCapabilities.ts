import type { AIProvider } from "./aiTerminal";
import type { AISpawnOptions } from "./aiSpawnOptions";

export type SpawnOptionKey = keyof AISpawnOptions;

/**
 * Static description of which AISpawnOptions a provider honours, what
 * tool-allow syntax it expects, and whether the daemon can pre-assign a
 * canonical session UUID. Phases 2+ may extend with version-gated entries.
 */
export interface ProviderCapability {
  id: AIProvider;
  /** Subset of AISpawnOptions keys the provider's toArgv knows how to render. */
  supportedKeys: readonly SpawnOptionKey[];
  /** Discriminator the preset translator branches on. */
  toolAllowSyntax: "claude" | "copilot";
  /** True when the provider's `--session-id` is honoured (Claude today). */
  supportsExplicitSessionId: boolean;
  /** Whether structured stream-json output is parseable for this provider. */
  supportsStreamJson: boolean;
  /** Phase 5 — true when `--fork-session` is honoured (Claude only). */
  supportsForkSession: boolean;
  /** Phase 5 — true when `-n <name>` is honoured (Claude only). */
  supportsName: boolean;
  /** Phase 5 — true when `--continue` / `-c` is honoured (Claude + Copilot). */
  supportsContinueRecent: boolean;
  /** Phase 5 — true when `--from-pr <num|url>` is honoured (Claude only). */
  supportsFromPR: boolean;
}

const CLAUDE_KEYS: readonly SpawnOptionKey[] = [
  "outputFormat",
  "jsonSchema",
  "includePartialMessages",
  "includeHookEvents",
  "model",
  "fallbackModel",
  "effort",
  "maxTurns",
  "maxBudgetUsd",
  "systemPrompt",
  "systemPromptFile",
  "appendSystemPrompt",
  "appendSystemPromptFile",
  "excludeDynamicSystemPromptSections",
  "allowedTools",
  "disallowedTools",
  "toolsAvailable",
  "permissionMode",
  "permissionPromptTool",
  "mcpConfig",
  "strictMcpConfig",
  "agents",
  "agent",
  "pluginDirs",
  "settings",
  "settingSources",
  "sessionId",
  "resumeSessionId",
  "continueRecent",
  "forkSession",
  "sessionName",
  "fromPR",
  "noSessionPersistence",
  "bare",
  "additionalDirs",
  "debug",
  "debugFile",
  "verbose",
  "extraArgs",
];

const COPILOT_KEYS: readonly SpawnOptionKey[] = [
  "outputFormat",
  "silent",
  "model",
  "maxAutopilotContinues",
  "allowedTools",
  "disallowedTools",
  "permissionMode",
  "noAskUser",
  "allowUrls",
  "mcpConfig",
  "enableAllGithubMcpTools",
  "agent",
  "resumeSessionId",
  "continueRecent",
  "additionalDirs",
  "extraArgs",
];

export const PROVIDER_CAPABILITIES: Record<AIProvider, ProviderCapability> = {
  claude: {
    id: "claude",
    supportedKeys: CLAUDE_KEYS,
    toolAllowSyntax: "claude",
    supportsExplicitSessionId: true,
    supportsStreamJson: true,
    supportsForkSession: true,
    supportsName: true,
    supportsContinueRecent: true,
    supportsFromPR: true,
  },
  copilot: {
    id: "copilot",
    supportedKeys: COPILOT_KEYS,
    toolAllowSyntax: "copilot",
    supportsExplicitSessionId: false,
    supportsStreamJson: false,
    supportsForkSession: false,
    supportsName: false,
    supportsContinueRecent: true,
    supportsFromPR: false,
  },
};

export function getProviderCapability(p: AIProvider): ProviderCapability {
  return PROVIDER_CAPABILITIES[p];
}
