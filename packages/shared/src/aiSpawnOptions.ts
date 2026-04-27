import { z } from "zod";

/**
 * Schema version for AISpawnOptions. Bump when a field is renamed or removed
 * (additive changes do not require a bump). Persistence layers should record
 * the version they were written with so future migrations can detect drift.
 */
export const SPAWN_OPTIONS_SCHEMA_VERSION = 1;

const PermissionMode = z.enum([
  "default",
  "acceptEdits",
  "plan",
  "auto",
  "dontAsk",
  "bypassPermissions",
]);

const Effort = z.enum(["low", "medium", "high", "xhigh", "max"]);
const OutputFormat = z.enum(["text", "json", "stream-json"]);
const SettingSource = z.enum(["user", "project", "local"]);

const AgentManifestEntry = z.object({
  description: z.string(),
  prompt: z.string(),
});

export const AISpawnOptionsSchema = z
  .object({
    // I/O
    outputFormat: OutputFormat.optional(),
    jsonSchema: z.record(z.string(), z.unknown()).optional(),
    includePartialMessages: z.boolean().optional(),
    includeHookEvents: z.boolean().optional(),
    silent: z.boolean().optional(),

    // Model / budget
    model: z.string().optional(),
    fallbackModel: z.string().optional(),
    effort: Effort.optional(),
    maxTurns: z.number().int().positive().optional(),
    maxBudgetUsd: z.number().positive().optional(),
    maxAutopilotContinues: z.number().int().positive().optional(),

    // System prompt
    systemPrompt: z.string().optional(),
    systemPromptFile: z.string().optional(),
    appendSystemPrompt: z.string().optional(),
    appendSystemPromptFile: z.string().optional(),
    excludeDynamicSystemPromptSections: z.boolean().optional(),

    // Tools & permissions
    allowedTools: z.array(z.string()).optional(),
    disallowedTools: z.array(z.string()).optional(),
    toolsAvailable: z.array(z.string()).optional(),
    permissionMode: PermissionMode.optional(),
    permissionPromptTool: z.string().optional(),
    noAskUser: z.boolean().optional(),
    allowUrls: z.array(z.string()).optional(),

    // MCP / agents / plugins
    mcpConfig: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
    strictMcpConfig: z.boolean().optional(),
    enableAllGithubMcpTools: z.boolean().optional(),
    agents: z.record(z.string(), AgentManifestEntry).optional(),
    agent: z.string().optional(),
    pluginDirs: z.array(z.string()).optional(),
    settings: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
    settingSources: z.array(SettingSource).optional(),

    // Lifecycle
    sessionId: z.uuid().optional(),
    resumeSessionId: z.string().optional(),
    continueRecent: z.boolean().optional(),
    forkSession: z.boolean().optional(),
    sessionName: z.string().optional(),
    fromPR: z.string().optional(),
    noSessionPersistence: z.boolean().optional(),
    bare: z.boolean().optional(),

    // Workspace
    additionalDirs: z.array(z.string()).optional(),

    // Debug
    debug: z.string().optional(),
    debugFile: z.string().optional(),
    verbose: z.boolean().optional(),

    // Power-user escape hatch (FR-1.3). Appended verbatim AFTER all
    // schema-derived flags. Callers carry the secrets-on-CLI risk (NFR-7).
    extraArgs: z.array(z.string()).optional(),
  })
  .strict();

export type AISpawnOptions = z.infer<typeof AISpawnOptionsSchema>;
