import type { AISpawnOptions } from "@magenta/shared/aiSpawnOptions";
import type {
  ProviderCapability,
  SpawnOptionKey,
} from "@magenta/shared/providerCapabilities";
import type { ToArgvResult } from "./claude";

const COPILOT_AUTOPILOT_DEFAULT = 50;

export function toArgvCopilot(
  opts: AISpawnOptions,
  caps: ProviderCapability,
): ToArgvResult {
  const args: string[] = [];
  const warnings: string[] = [];
  const drop = (label: string) =>
    warnings.push(`copilot: unsupported AISpawnOptions key '${label}' was dropped`);

  // I/O
  if (opts.silent) args.push("-s");
  if (opts.outputFormat) {
    if (opts.outputFormat === "json") {
      args.push("--output-format", "json");
    } else {
      drop(`outputFormat=${opts.outputFormat}`);
    }
  }

  // Model
  if (opts.model) args.push("--model", opts.model);

  // Permission mode (Copilot vocabulary is reduced)
  if (opts.permissionMode) {
    if (opts.permissionMode === "auto") {
      const cont =
        opts.maxAutopilotContinues ?? COPILOT_AUTOPILOT_DEFAULT;
      args.push("--autopilot", "--yolo", "--max-autopilot-continues", String(cont));
    } else if (opts.permissionMode === "bypassPermissions") {
      args.push("--allow-all");
    } else if (opts.permissionMode !== "default") {
      drop(`permissionMode=${opts.permissionMode}`);
    }
  } else if (opts.maxAutopilotContinues !== undefined) {
    // bare maxAutopilotContinues without auto mode is meaningless
    drop("maxAutopilotContinues");
  }

  if (opts.noAskUser) args.push("--no-ask-user");

  // Tool allow / deny — pattern strings rendered one flag per entry.
  if (opts.allowedTools) {
    for (const t of opts.allowedTools) args.push("--allow-tool", t);
  }
  if (opts.disallowedTools) {
    for (const t of opts.disallowedTools) args.push("--deny-tool", t);
  }
  if (opts.allowUrls) {
    for (const u of opts.allowUrls) args.push("--allow-url", u);
  }

  // MCP — file path only; objects can't be passed without daemon-side materialization (Phase 3).
  if (opts.mcpConfig !== undefined) {
    if (typeof opts.mcpConfig === "string") {
      args.push("--additional-mcp-config", opts.mcpConfig);
    } else {
      drop("mcpConfig (object form requires Phase 3 materialization)");
    }
  }
  if (opts.enableAllGithubMcpTools) args.push("--enable-all-github-mcp-tools");

  // Lifecycle
  if (opts.continueRecent) args.push("--continue");
  if (opts.resumeSessionId) args.push(`--resume=${opts.resumeSessionId}`);

  // Workspace
  if (opts.additionalDirs) {
    for (const d of opts.additionalDirs) args.push("--add-dir", d);
  }

  // Drop everything else with a warning if the caller set it.
  const dropIfSet = (k: SpawnOptionKey) => {
    if ((opts as Record<string, unknown>)[k] !== undefined) drop(k);
  };
  dropIfSet("jsonSchema");
  dropIfSet("includePartialMessages");
  dropIfSet("includeHookEvents");
  dropIfSet("fallbackModel");
  dropIfSet("effort");
  dropIfSet("maxTurns");
  dropIfSet("maxBudgetUsd");
  dropIfSet("systemPrompt");
  dropIfSet("systemPromptFile");
  dropIfSet("appendSystemPrompt");
  dropIfSet("appendSystemPromptFile");
  dropIfSet("excludeDynamicSystemPromptSections");
  dropIfSet("toolsAvailable");
  dropIfSet("permissionPromptTool");
  dropIfSet("strictMcpConfig");
  dropIfSet("agents");
  dropIfSet("agent"); // intent layer prepends /agent to prompt, not here
  dropIfSet("pluginDirs");
  dropIfSet("settings");
  dropIfSet("settingSources");
  dropIfSet("sessionId");
  dropIfSet("sessionName");
  dropIfSet("forkSession");
  dropIfSet("fromPR");
  dropIfSet("noSessionPersistence");
  dropIfSet("bare");
  dropIfSet("debug");
  dropIfSet("debugFile");
  dropIfSet("verbose");

  // Escape hatch
  if (opts.extraArgs) args.push(...opts.extraArgs);

  void caps;
  return { args, warnings };
}
