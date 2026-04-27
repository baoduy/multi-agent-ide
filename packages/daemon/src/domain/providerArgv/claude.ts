import type { AISpawnOptions } from "@magenta/shared/aiSpawnOptions";
import type {
  ProviderCapability,
  SpawnOptionKey,
} from "@magenta/shared/providerCapabilities";

export interface ToArgvResult {
  args: string[];
  warnings: string[];
}

/**
 * Pure translation of AISpawnOptions to Claude CLI argv. The caller is
 * responsible for passing the correct Claude capability manifest. Order is
 * deterministic (NFR-6): execution-mode flags first, then I/O, model/budget,
 * system prompt, tools/permissions, MCP/agents/settings, lifecycle,
 * workspace, debug, finally extraArgs verbatim.
 */
export function toArgvClaude(
  opts: AISpawnOptions,
  caps: ProviderCapability,
): ToArgvResult {
  const args: string[] = [];
  const warnings: string[] = [];
  const supported = new Set<SpawnOptionKey>(caps.supportedKeys);

  const drop = (key: SpawnOptionKey) => {
    warnings.push(`claude: unsupported AISpawnOptions key '${key}' was dropped`);
  };

  // Execution mode
  if (opts.bare !== undefined) supported.has("bare") && opts.bare ? args.push("--bare") : opts.bare && drop("bare");
  if (opts.verbose) args.push("--verbose");

  // I/O
  if (opts.outputFormat) {
    args.push("--output-format", opts.outputFormat);
    if (opts.outputFormat === "stream-json" && !opts.verbose) {
      // Claude CLI requires --verbose with stream-json to emit full payloads.
      args.push("--verbose");
    }
  }
  if (opts.jsonSchema !== undefined) {
    args.push("--json-schema", JSON.stringify(opts.jsonSchema));
  }
  if (opts.includePartialMessages) args.push("--include-partial-messages");
  if (opts.includeHookEvents) args.push("--include-hook-events");
  if (opts.silent !== undefined && opts.silent) drop("silent");

  // Model / budget
  if (opts.model) args.push("--model", opts.model);
  if (opts.fallbackModel) args.push("--fallback-model", opts.fallbackModel);
  if (opts.effort) args.push("--effort", opts.effort);
  if (opts.maxTurns !== undefined) args.push("--max-turns", String(opts.maxTurns));
  if (opts.maxBudgetUsd !== undefined)
    args.push("--max-budget-usd", String(opts.maxBudgetUsd));
  if (opts.maxAutopilotContinues !== undefined) drop("maxAutopilotContinues");

  // System prompt
  if (opts.systemPrompt) args.push("--system-prompt", opts.systemPrompt);
  if (opts.systemPromptFile)
    args.push("--system-prompt-file", opts.systemPromptFile);
  if (opts.appendSystemPrompt)
    args.push("--append-system-prompt", opts.appendSystemPrompt);
  if (opts.appendSystemPromptFile)
    args.push("--append-system-prompt-file", opts.appendSystemPromptFile);
  if (opts.excludeDynamicSystemPromptSections)
    args.push("--exclude-dynamic-system-prompt-sections");

  // Tools & permissions
  if (opts.permissionMode) {
    if (opts.permissionMode === "bypassPermissions") {
      args.push("--dangerously-skip-permissions");
    } else if (opts.permissionMode === "auto") {
      args.push("--permission-mode", "auto", "--enable-auto-mode");
    } else if (opts.permissionMode !== "default") {
      args.push("--permission-mode", opts.permissionMode);
    }
  }
  if (opts.permissionPromptTool)
    args.push("--permission-prompt-tool", opts.permissionPromptTool);
  if (opts.allowedTools && opts.allowedTools.length > 0)
    args.push("--allowedTools", ...opts.allowedTools);
  if (opts.disallowedTools && opts.disallowedTools.length > 0)
    args.push("--disallowedTools", ...opts.disallowedTools);
  if (opts.toolsAvailable && opts.toolsAvailable.length > 0)
    args.push("--tools", opts.toolsAvailable.join(","));
  if (opts.noAskUser) drop("noAskUser");
  if (opts.allowUrls && opts.allowUrls.length > 0) drop("allowUrls");

  // MCP / agents / plugins / settings
  if (opts.mcpConfig !== undefined) {
    const v =
      typeof opts.mcpConfig === "string"
        ? opts.mcpConfig
        : JSON.stringify(opts.mcpConfig);
    args.push("--mcp-config", v);
  }
  if (opts.strictMcpConfig) args.push("--strict-mcp-config");
  if (opts.enableAllGithubMcpTools) drop("enableAllGithubMcpTools");
  if (opts.agents) args.push("--agents", JSON.stringify(opts.agents));
  if (opts.agent) args.push("--agent", opts.agent);
  if (opts.pluginDirs) {
    for (const p of opts.pluginDirs) args.push("--plugin-dir", p);
  }
  if (opts.settings !== undefined) {
    const v =
      typeof opts.settings === "string"
        ? opts.settings
        : JSON.stringify(opts.settings);
    args.push("--settings", v);
  }
  if (opts.settingSources && opts.settingSources.length > 0)
    args.push("--setting-sources", opts.settingSources.join(","));

  // Lifecycle
  if (opts.continueRecent) args.push("-c");
  if (opts.resumeSessionId) args.push("--resume", opts.resumeSessionId);
  if (opts.sessionName) args.push("-n", opts.sessionName);
  if (opts.forkSession) args.push("--fork-session");
  if (opts.fromPR) args.push("--from-pr", opts.fromPR);
  if (opts.noSessionPersistence) args.push("--no-session-persistence");
  if (opts.sessionId) args.push("--session-id", opts.sessionId);

  // Workspace
  if (opts.additionalDirs) {
    for (const d of opts.additionalDirs) args.push("--add-dir", d);
  }

  // Debug
  if (opts.debug) args.push("--debug", opts.debug);
  if (opts.debugFile) args.push("--debug-file", opts.debugFile);

  // Escape hatch — verbatim, last
  if (opts.extraArgs && opts.extraArgs.length > 0) args.push(...opts.extraArgs);

  void supported; // capability gating live above per-key; manifest reserved for FR-2.3 enforcement layer
  return { args, warnings };
}
