import fs from "node:fs";

import type { AIProvider } from "@magenta/shared/aiTerminal";
import type { AISpawnOptions } from "@magenta/shared/aiSpawnOptions";
import { getProviderCapability } from "@magenta/shared/providerCapabilities";

import type { ConfigManager } from "../config/ConfigManager";
import { AppError } from "../errors/AppError";
import { resolveMcpConfig } from "../domain/mcpConfigResolver";
import { resolveSystemPrompts } from "../domain/systemPromptResolver";
import { getToArgv } from "../domain/providerArgv";
import { TempFileGateway } from "../infrastructure/TempFileGateway";
import type { AiCliGateway } from "../infrastructure/AiCliGateway";

export interface AiBareRunRequest {
  provider: AIProvider;
  workingDirPath: string;
  taskSpecDir: string | undefined;
  prompt: string;
  spawn: Pick<
    AISpawnOptions,
    | "model"
    | "mcpConfig"
    | "strictMcpConfig"
    | "systemPromptFile"
    | "appendSystemPromptFile"
    | "maxTurns"
    | "maxBudgetUsd"
    | "allowedTools"
    | "disallowedTools"
    | "settings"
  >;
  timeoutMs: number;
}

export interface AiBareRunResolution {
  mcpConfigSource: "spawn" | "working-dir" | "none";
  systemPromptFileSource: "spawn" | "task" | "working-dir" | "none";
  appendSystemPromptFileSource: "spawn" | "task" | "working-dir" | "none";
}

export interface AiBareRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  argv: string[];
  resolution: AiBareRunResolution;
}

export interface AiBareRunDeps {
  configManager: ConfigManager;
  aiCliGateway: AiCliGateway;
  /** Factory so tests can swap a fake. */
  tempFileFactory: () => TempFileGateway;
}

/**
 * Phase 3 application service. Orchestrates a reproducible non-interactive
 * Claude (or Copilot) run:
 *
 *  1. Resolve the working-dir entry; reject unknown working dirs.
 *  2. Resolve effective MCP config (spawn → working-dir → none).
 *  3. Resolve effective system-prompt files (spawn → per-task → working-dir).
 *  4. Materialize any inline JSON (mcpConfig object, settings object) to
 *     temp files (NFR-7: secrets stay off argv).
 *  5. Fail-fast existence checks on every file path we plan to pass to the
 *     CLI (FR-9.3).
 *  6. Translate the merged AISpawnOptions to argv via Phase 1's `toArgv()`,
 *     forcing `bare: true` for Claude.
 *  7. Spawn via AiCliGateway.run; collect stdout / exitCode.
 *  8. Always dispose the temp file gateway (idempotent) in `finally`.
 */
export class AiBareRunApplicationService {
  constructor(private readonly deps: AiBareRunDeps) {}

  async runBareOnce(req: AiBareRunRequest): Promise<AiBareRunResult> {
    const wd = this.deps.configManager.getWorkingDirEntry(req.workingDirPath);
    if (!wd) {
      throw new AppError(
        "CONFIG_ERROR",
        `${req.workingDirPath} is not a registered working dir`,
      );
    }

    const tmp = this.deps.tempFileFactory();
    try {
      // 1. MCP
      const mcp = resolveMcpConfig(req.spawn, wd);
      let mcpEffective: string | undefined;
      let mcpSource: AiBareRunResolution["mcpConfigSource"] = "none";
      if (mcp.effective !== undefined) {
        mcpSource = mcp.source ?? "none";
        if (typeof mcp.effective === "string") {
          if (!fs.existsSync(mcp.effective)) {
            throw new AppError(
              "MCP_CONFIG_INVALID",
              `MCP config file not found: ${mcp.effective}`,
            );
          }
          mcpEffective = mcp.effective;
        } else {
          mcpEffective = tmp.writeFile(
            "mcp.json",
            JSON.stringify(mcp.effective),
          );
        }
      }

      // 2. System prompt files
      const sys = resolveSystemPrompts(
        req.provider,
        req.spawn,
        wd,
        req.taskSpecDir,
      );
      const checkExists = (
        p: string | undefined,
        kind: "primary" | "append",
      ): string | undefined => {
        if (p === undefined) return undefined;
        if (!fs.existsSync(p)) {
          // Per-task / per-working-dir fallbacks are best-effort: missing
          // optional file → silently drop. Only explicit spawn paths raise.
          const wasExplicit =
            (kind === "primary" && req.spawn.systemPromptFile === p) ||
            (kind === "append" && req.spawn.appendSystemPromptFile === p);
          if (wasExplicit) {
            throw new AppError(
              "SYSTEM_PROMPT_FILE_MISSING",
              `${kind} system prompt file not found: ${p}`,
            );
          }
          return undefined;
        }
        return p;
      };
      const systemPromptFile = checkExists(sys.systemPromptFile, "primary");
      const appendSystemPromptFile = checkExists(
        sys.appendSystemPromptFile,
        "append",
      );

      const systemPromptFileSource: AiBareRunResolution["systemPromptFileSource"] =
        req.spawn.systemPromptFile
          ? "spawn"
          : systemPromptFile
            ? "working-dir"
            : "none";
      const appendSystemPromptFileSource: AiBareRunResolution["appendSystemPromptFileSource"] =
        req.spawn.appendSystemPromptFile
          ? "spawn"
          : appendSystemPromptFile && req.taskSpecDir
            ? "task"
            : appendSystemPromptFile
              ? "working-dir"
              : "none";

      // 3. Settings (Claude)
      let settingsEffective: string | undefined;
      if (req.spawn.settings !== undefined) {
        if (typeof req.spawn.settings === "string") {
          settingsEffective = req.spawn.settings;
        } else {
          settingsEffective = tmp.writeFile(
            "settings.json",
            JSON.stringify(req.spawn.settings),
          );
        }
      }

      // 4. Build merged AISpawnOptions for toArgv. The provider determines
      //    which mcp flag is used (Claude: --mcp-config; Copilot:
      //    --additional-mcp-config); both are produced by the per-provider
      //    toArgv from the same `mcpConfig` field, with a path string here.
      const merged: AISpawnOptions = {
        ...req.spawn,
        mcpConfig: mcpEffective,
        strictMcpConfig: mcp.strict ? true : undefined,
        systemPromptFile,
        appendSystemPromptFile,
        settings: settingsEffective,
        // Bare mode is Claude-only; toArgv drops it for Copilot.
        bare: req.provider === "claude" ? true : undefined,
      };

      const toArgv = getToArgv(req.provider);
      const caps = getProviderCapability(req.provider);
      const { args } = toArgv(merged, caps);

      // 5. Spawn via AiCliGateway.runOnceWithSpawn using the fully merged options.
      const result = await this.deps.aiCliGateway.runOnceWithSpawn(
        req.provider,
        req.prompt,
        merged,
        {
          timeoutMs: req.timeoutMs,
          cwd: req.workingDirPath,
        },
      );

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        argv: args,
        resolution: {
          mcpConfigSource: mcpSource,
          systemPromptFileSource,
          appendSystemPromptFileSource,
        },
      };
    } finally {
      tmp.dispose();
    }
  }
}
