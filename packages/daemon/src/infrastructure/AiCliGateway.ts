import { spawn } from "node:child_process";
import type { AIProvider } from "@magenta/shared/aiTerminal";
import { AppError } from "../errors/AppError";

/**
 * Options that control how a single AI CLI invocation runs.
 */
export interface RunOptions {
  timeoutMs: number;
  extraArgs: readonly string[];
  /**
   * Working directory for the spawned process. Providing the repo path
   * matters for Claude Code / Copilot CLI because they read config files
   * (CLAUDE.md, .github/copilot-instructions.md, etc.) relative to cwd.
   */
  cwd?: string;
  /**
   * Extra text appended to the agent's system prompt. Used by the
   * spec-folder review chat to tell the agent which folder to scope its
   * Read/Glob/Grep calls to. Maps to `claude --append-system-prompt`;
   * ignored by providers that don't support it.
   */
  systemPromptAppend?: string;
  /**
   * Permission mode for tool calls. Only honoured by the Claude adapter;
   * `"plan"` is the read-only mode used by spec review chat. Passing
   * undefined means "leave it to the provider default" so the existing
   * stateless chat endpoints don't change behaviour.
   */
  permissionMode?: "plan" | "default" | "acceptEdits" | "auto" | "dontAsk" | "bypassPermissions";
}

/**
 * Per-adapter extras that the gateway may pass through when the caller
 * opts in (spec review chat uses these; the basic chat endpoints do not).
 */
interface AdapterExtras {
  systemPromptAppend?: string;
  permissionMode?: RunOptions["permissionMode"];
}

/**
 * Shape of a per-provider CLI adapter. Each adapter owns its own argv /
 * stdin-vs-argument convention; the gateway just spawns and collects output.
 */
interface CliAdapter {
  command: string;
  buildArgs(
    model: string,
    prompt: string,
    extraArgs: readonly string[],
    extras?: AdapterExtras,
  ): string[];
  /**
   * How the prompt is delivered. "argv" passes via a CLI argument the adapter
   * already added to `buildArgs`; "stdin" means the gateway writes the prompt
   * to the child's stdin (safer for long prompts).
   */
  promptChannel: "argv" | "stdin";
}

/**
 * `claude -p "<prompt>"` is the documented non-interactive mode of Claude Code.
 * We prefer stdin because prompts can contain the user's document text and
 * exceed the shell's argv limits.
 *
 * Optional extras (used by spec-folder review chat):
 *   - `systemPromptAppend` → `--append-system-prompt <text>`
 *   - `permissionMode`     → `--permission-mode <mode>`
 * Both are omitted when not provided so existing callers see the same argv.
 */
const claudeAdapter: CliAdapter = {
  command: "claude",
  promptChannel: "stdin",
  buildArgs(model, _prompt, extraArgs, extras) {
    const args: string[] = ["-p", "--model", model];
    if (extras?.systemPromptAppend) {
      args.push("--append-system-prompt", extras.systemPromptAppend);
    }
    if (extras?.permissionMode) {
      args.push("--permission-mode", extras.permissionMode);
    }
    args.push(...extraArgs);
    return args;
  },
};

/**
 * GitHub Copilot CLI has a `copilot -p "<prompt>"` non-interactive mode.
 * Copilot does not currently expose a per-call model flag in the public CLI,
 * so `model` is passed only via `extraArgs` if the user wires one up.
 * Copilot ignores `systemPromptAppend` / `permissionMode` (no equivalent).
 */
const copilotAdapter: CliAdapter = {
  command: "copilot",
  promptChannel: "stdin",
  buildArgs(_model, _prompt, extraArgs, _extras) {
    return ["-p", ...extraArgs];
  },
};

const ADAPTERS: Record<AIProvider, CliAdapter> = {
  claude: claudeAdapter,
  copilot: copilotAdapter,
};

/**
 * Thin wrapper around `child_process.spawn` that runs an AI provider CLI
 * in non-interactive mode, pipes the prompt in via stdin, and returns stdout.
 *
 * v1 spawns a fresh subprocess per call — consistent with the decision in
 * `/Users/steven/.claude/plans/currently-we-have-md-purrfect-wombat.md` to
 * skip autocomplete. If latency becomes a problem later, this class is the
 * swap-in point for a long-lived session.
 */
export class AiCliGateway {
  async run(
    provider: AIProvider,
    model: string,
    prompt: string,
    options: RunOptions,
  ): Promise<string> {
    const adapter = ADAPTERS[provider];
    if (!adapter) {
      throw new AppError("AI_PROVIDER_NOT_AVAILABLE", `Unknown provider: ${provider}`);
    }

    const args = adapter.buildArgs(model, prompt, options.extraArgs, {
      systemPromptAppend: options.systemPromptAppend,
      permissionMode: options.permissionMode,
    });

    return new Promise<string>((resolve, reject) => {
      let child;
      try {
        child = spawn(adapter.command, args, {
          cwd: options.cwd,
          env: process.env,
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch (err) {
        reject(
          new AppError(
            "AI_PROVIDER_NOT_AVAILABLE",
            `Could not spawn "${adapter.command}": ${(err as Error).message}. ` +
              `Install the ${provider} CLI and ensure it is on PATH.`,
          ),
        );
        return;
      }

      let stdout = "";
      let stderr = "";
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          child.kill("SIGTERM");
        } catch {
          /* ignore */
        }
        reject(
          new AppError(
            "AI_TIMEOUT",
            `${adapter.command} did not respond within ${options.timeoutMs}ms.`,
          ),
        );
      }, options.timeoutMs);

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });

      child.on("error", (err: NodeJS.ErrnoException) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err.code === "ENOENT") {
          reject(
            new AppError(
              "AI_PROVIDER_NOT_AVAILABLE",
              `"${adapter.command}" not found on PATH. Install the ${provider} CLI first.`,
            ),
          );
          return;
        }
        reject(new AppError("AI_CLI_FAILED", err.message));
      });

      child.on("close", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (code === 0) {
          resolve(stdout.trim());
          return;
        }
        const snippet = stderr.trim() || stdout.trim() || `exit code ${code}`;
        reject(
          new AppError(
            "AI_CLI_FAILED",
            `${adapter.command} failed (exit ${code}): ${truncate(snippet, 500)}`,
          ),
        );
      });

      if (adapter.promptChannel === "stdin") {
        child.stdin.end(prompt, "utf8");
      } else {
        child.stdin.end();
      }
    });
  }
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}
