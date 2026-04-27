import { EventEmitter } from "node:events";
import type { AIProvider, AISessionConfig, AISessionStatus } from "@magenta/shared/aiTerminal";
import type { AISpawnOptions } from "@magenta/shared/aiSpawnOptions";
import { OTEL_ENV_VAR_NAMES } from "@magenta/shared/aiObservability";

import { SessionCore } from "../../terminal/infra/SessionCore";
import type { AttachResult } from "../../../core/utils/RingBuffer";
import { buildEnrichedPath } from "../../../core/utils/enrichedPath";

/**
 * Phase 7 — pick the 11 documented OTel env vars out of `source`. Used to
 * forward Copilot's OpenTelemetry config from the daemon's env into spawned
 * AI children. Returns only keys present and non-empty so we don't clobber
 * downstream defaults.
 */
export function collectOTelEnv(
  source: NodeJS.ProcessEnv,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of OTEL_ENV_VAR_NAMES) {
    const v = source[name];
    if (typeof v === "string" && v.length > 0) out[name] = v;
  }
  return out;
}

/**
 * Map an AISessionConfig to the unified AISpawnOptions shape consumed by
 * the shared `toArgv()` translator. PTY sessions historically only honour a
 * subset of fields (model, permissionMode, providerSessionId → resume);
 * future phases extend this seam (Phase 4: allowedTools/disallowedTools,
 * Phase 5: sessionId/forkSession).
 */
export function sessionConfigToSpawn(
  _provider: AIProvider,
  config: AISessionConfig & { model?: string; mcpConfig?: AISpawnOptions["mcpConfig"] },
): AISpawnOptions {
  const out: AISpawnOptions = {};
  if (config.model) out.model = config.model;
  if (config.permissionMode) out.permissionMode = config.permissionMode;
  if (config.providerSessionId) out.resumeSessionId = config.providerSessionId;
  if (config.allowedTools && config.allowedTools.length > 0)
    out.allowedTools = config.allowedTools;
  if (config.disallowedTools && config.disallowedTools.length > 0)
    out.disallowedTools = config.disallowedTools;
  if (config.permissionPromptTool)
    out.permissionPromptTool = config.permissionPromptTool;
  // Programmatic-only: drop `noAskUser` for interactive PTY sessions.
  if (config.noAskUser && config.programmatic) out.noAskUser = true;
  if (config.mcpConfig) out.mcpConfig = config.mcpConfig;
  // Phase 5 — lifecycle fields plumbed verbatim into AISpawnOptions; the
  // provider-specific argv builder (claude.ts / copilot.ts) decides which
  // flags to emit.
  if (config.sessionId) out.sessionId = config.sessionId;
  if (config.name) out.sessionName = config.name;
  if (config.resumeFromPR) out.fromPR = config.resumeFromPR;
  if (config.continueRecent) out.continueRecent = true;
  if (config.forkSession) out.forkSession = true;
  // Phase 6 — agent + GitHub MCP toggle.
  if (config.agent) out.agent = config.agent;
  if (config.enableAllGithubMcpTools) out.enableAllGithubMcpTools = true;
  return out;
}

export interface AISessionEvents {
  /** Terminal data with monotonic seq (for attach/replay + UI ack). */
  data: (payload: { data: string; seq: number }) => void;
  status: (status: AISessionStatus) => void;
  exit: (exitCode: number) => void;
  heartbeat: (payload: { headSeq: number; alive: boolean }) => void;
}

/**
 * POSIX shell quoting — wrap each argument in single quotes, escaping any
 * embedded single quotes. Safe for interpolation into a shell -c command.
 */
function shellQuote(arg: string): string {
  if (arg === "") return "''";
  if (/^[a-zA-Z0-9_\-./:=@%+,]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

/**
 * Build the argv to spawn the AI binary.
 *
 * On macOS / Linux we spawn the user's login shell (`$SHELL -l -i -c
 * 'exec <binary> <args>'`) so the shell's rc files run first. This is
 * critical in packaged Electron apps: when the app is launched from
 * Finder / Dock / a desktop file, the process inherits a minimal PATH
 * and none of the shell's init env (nvm, pyenv, homebrew shellenv,
 * asdf, etc.). Without running through the login shell, `claude` /
 * `copilot` (which are usually Node CLI shebangs installed under nvm
 * or a user-local prefix) cannot be resolved.
 */
function buildSpawnArgv(
  binaryName: string,
  binaryArgs: string[],
): { command: string; args: string[]; viaLoginShell: boolean } {
  const platform = process.platform;

  if (platform === "win32") {
    return { command: binaryName, args: binaryArgs, viaLoginShell: false };
  }

  const userShell = process.env.SHELL || "/bin/bash";
  const quoted = [binaryName, ...binaryArgs].map(shellQuote).join(" ");
  const script = `exec ${quoted}`;
  return {
    command: userShell,
    args: ["-l", "-i", "-c", script],
    viaLoginShell: true,
  };
}

/**
 * BaseAISession composes a SessionCore (PTY + ring buffer + batching +
 * heartbeat) with provider-specific status detection. Subclasses only
 * implement `getBinaryName()` and `detectStatus()`.
 *
 * Output is seq-numbered and replayable: the UI can reattach after a
 * reload without the PTY noticing.
 */
export abstract class BaseAISession extends EventEmitter {
  readonly id: string;
  readonly provider: AIProvider;
  private readonly core: SessionCore;
  private currentStatus: AISessionStatus = "idle";

  constructor(id: string, provider: AIProvider) {
    super();
    this.id = id;
    this.provider = provider;
    this.core = new SessionCore(id);
    this.wireCore();
  }

  protected abstract getBinaryName(): string;
  protected abstract detectStatus(
    data: string,
    currentStatus: AISessionStatus
  ): AISessionStatus | null;

  start(cwd: string, args: string[], cols: number, rows: number): void {
    const binaryName = this.getBinaryName();
    const enrichedPath = buildEnrichedPath();
    const { command, args: spawnArgs, viaLoginShell } = buildSpawnArgv(
      binaryName,
      args,
    );

    try {
      this.core.start({
        command,
        args: spawnArgs,
        cwd,
        cols,
        rows,
        env: {
          ...process.env,
          // Phase 7 — forward Copilot's OTel env vars (no-op for Claude).
          ...collectOTelEnv(process.env),
          PATH: enrichedPath,
          TERM: "xterm-256color",
          COLORTERM: "truecolor",
        } as Record<string, string>,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const hint = viaLoginShell
        ? `\r\n\x1b[31mFailed to start AI session via '${command}': ${message}\x1b[0m\r\n` +
          `\x1b[33mMake sure '${binaryName}' is installed and on your shell PATH (try running '${binaryName} --version' in your terminal).\x1b[0m\r\n`
        : `\r\n\x1b[31mFailed to start '${binaryName}': ${message}\x1b[0m\r\n` +
          `\x1b[33mMake sure '${binaryName}' is installed and on your PATH.\x1b[0m\r\n`;
      setImmediate(() => {
        this.core.injectOutput(hint);
        // Spawn itself threw — the binary couldn't be started at all.
        // Mirror the post-exit non-zero path: terminal "error" status.
        this.setStatus("error");
        this.emit("exit", 127);
      });
      return;
    }

    this.setStatus("active");
  }

  sendInput(text: string): void {
    this.core.write(text);
  }

  resize(cols: number, rows: number): void {
    this.core.resize(cols, rows);
  }

  stop(): void {
    this.core.kill();
  }

  dispose(): void {
    this.core.dispose();
    this.removeAllListeners();
  }

  getStatus(): AISessionStatus {
    return this.currentStatus;
  }

  /** Return chunks newer than fromSeq (or snapshot on cold attach). */
  attach(fromSeq = 0): AttachResult & { alive: boolean; status: AISessionStatus } {
    return {
      ...this.core.attach(fromSeq),
      alive: this.core.isAlive,
      status: this.currentStatus,
    };
  }

  // ─── Internals ────────────────────────────────────────────────

  private wireCore(): void {
    this.core.on("chunk", ({ data, seq }) => {
      // Status detection operates on the latest chunk string
      const newStatus = this.detectStatus(data, this.currentStatus);
      if (newStatus !== null && newStatus !== this.currentStatus) {
        this.setStatus(newStatus);
      }
      this.emit("data", { data, seq });
    });

    this.core.on("exit", ({ exitCode }) => {
      const binaryName = this.getBinaryName();
      if (exitCode === 127) {
        this.core.injectOutput(
          `\r\n\x1b[31m'${binaryName}' was not found in your shell PATH.\x1b[0m\r\n` +
            `\x1b[33mOpen a terminal and run '${binaryName} --version' to verify it's installed. ` +
            `If you use nvm/volta/asdf, make sure your rc file (~/.zshrc or ~/.bashrc) ` +
            `activates the right node version.\x1b[0m\r\n`,
        );
      }
      // `"error"` is a terminal status set only when the PTY child exits
      // with a non-zero code. A clean exit (code 0) is `"exited"`. This is
      // the only reliable error signal — text-based detection of "Error:"
      // in PTY output produced rampant false positives and was removed.
      // See packages/daemon/src/domain/statusDetection.ts for context.
      const finalStatus: AISessionStatus = exitCode === 0 ? "exited" : "error";
      this.setStatus(finalStatus);
      this.emit("exit", exitCode);
    });

    this.core.on("heartbeat", (payload) => {
      this.emit("heartbeat", payload);
    });
  }

  private setStatus(status: AISessionStatus): void {
    this.currentStatus = status;
    this.emit("status", status);
  }
}
