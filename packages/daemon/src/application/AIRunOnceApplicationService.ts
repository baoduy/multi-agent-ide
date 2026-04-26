import fs from "node:fs";
import type { AiCliGateway } from "../infrastructure/AiCliGateway";
import type { IPCBridge } from "../ipc/IPCBridge";
import { AppError } from "../errors/AppError";
import type { AIProvider } from "@magenta/shared/aiTerminal";
import type { AISpawnOptions } from "@magenta/shared/aiSpawnOptions";
import type { AIStreamEvent, TokenUsage } from "@magenta/shared/aiStreamEvent";
import {
  getProviderCapability,
  type SpawnOptionKey,
} from "@magenta/shared/providerCapabilities";
import {
  createParserState,
  feedLine,
  flush,
  type ParserState,
} from "../domain/streamJsonParser";
import { enrichSpawnOptions } from "../domain/enrichSpawnOptions";
import { applyAgentToPrompt } from "../domain/agentPromptInjector";
import type { PluginDirService } from "./PluginDirService";

export interface RunOnceArgs {
  provider: AIProvider;
  repoPath: string;
  worktreePath?: string;
  prompt: string;
  spawn: AISpawnOptions;
  timeoutMs?: number;
}

export interface RunOnceResult {
  sessionId?: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  structuredOutput?: unknown;
  tokenUsage?: TokenUsage;
  costUsd?: number;
  retriesSeen: number;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export class AIRunOnceApplicationService {
  constructor(
    private readonly gateway: AiCliGateway,
    private readonly bridge: IPCBridge,
    private readonly pluginDirService?: PluginDirService,
  ) {}

  async runOnce(args: RunOnceArgs): Promise<RunOnceResult> {
    // Phase 6 — resolve settings-driven spawn fields before capability check
    // so the enriched payload is what we validate against the manifest.
    const enrichedSpawn: AISpawnOptions = this.pluginDirService
      ? enrichSpawnOptions(args.provider, args.repoPath, args.spawn, {
          listPluginDirs: () => this.pluginDirService!.list(),
          readFileIfExists: (p) => {
            try {
              return fs.readFileSync(p, "utf-8");
            } catch (err) {
              if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
              throw err;
            }
          },
        })
      : args.spawn;

    const caps = getProviderCapability(args.provider);
    const supported = new Set<SpawnOptionKey>(caps.supportedKeys);
    for (const key of Object.keys(enrichedSpawn) as SpawnOptionKey[]) {
      if ((enrichedSpawn as Record<string, unknown>)[key] === undefined) continue;
      if (!supported.has(key)) {
        throw new AppError(
          "UNSUPPORTED_SPAWN_OPTION",
          `Provider '${args.provider}' does not support AISpawnOptions key '${key}'.`,
          { provider: args.provider, field: key },
        );
      }
    }

    // Phase 6 — Copilot agent injection at the prompt layer (Claude uses
    // `--agent` flag rendered by toArgv).
    const finalPrompt = applyAgentToPrompt(args.prompt, enrichedSpawn.agent, args.provider);

    const cwd = args.worktreePath ?? args.repoPath;
    const useStreamParser =
      args.provider === "claude" && enrichedSpawn.outputFormat === "stream-json";

    let parser: ParserState = createParserState();
    let sessionId: string | undefined;
    let tokenUsage: TokenUsage | undefined;
    let costUsd: number | undefined;
    let structuredOutput: unknown;
    let capExceeded: "budget" | "turns" | undefined;
    let retriesSeen = 0;

    const handleEvent = (ev: AIStreamEvent) => {
      this.bridge.emit({ type: "ai-session:event", event: ev });
      if (ev.kind === "session-init") {
        sessionId = ev.sessionId;
      } else if (ev.kind === "retry") {
        retriesSeen += 1;
      } else if (ev.kind === "result") {
        if (ev.tokenUsage) tokenUsage = ev.tokenUsage;
        if (typeof ev.costUsd === "number") costUsd = ev.costUsd;
        if (ev.output !== undefined) structuredOutput = ev.output;
        if (ev.capExceeded) capExceeded = ev.capExceeded;
      }
    };

    const onStdoutLine = (line: string) => {
      if (!useStreamParser) return;
      const r = feedLine(parser, line);
      parser = r.state;
      for (const ev of r.events) handleEvent(ev);
    };

    const gatewayResult = await this.gateway.runOnceWithSpawn(
      args.provider,
      finalPrompt,
      enrichedSpawn,
      {
        cwd,
        timeoutMs: args.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        onStdoutLine,
      },
    );

    if (useStreamParser) {
      const f = flush(parser);
      parser = f.state;
      for (const ev of f.events) handleEvent(ev);
      if (parser.sessionId && !sessionId) sessionId = parser.sessionId;
    }

    if (capExceeded === "budget") {
      throw new AppError(
        "AI_BUDGET_EXCEEDED",
        `Run terminated: max budget reached.`,
        { tokenUsage, costUsd, sessionId },
      );
    }
    if (capExceeded === "turns") {
      throw new AppError(
        "AI_TURN_LIMIT",
        `Run terminated: max turns reached.`,
        { tokenUsage, costUsd, sessionId },
      );
    }

    return {
      sessionId,
      exitCode: gatewayResult.exitCode,
      stdout: gatewayResult.stdout,
      stderr: gatewayResult.stderr,
      structuredOutput,
      tokenUsage,
      costUsd,
      retriesSeen: retriesSeen + gatewayResult.retriesSeen,
    };
  }
}
