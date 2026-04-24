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
  /**
   * Tools to pre-approve. In `claude -p` mode, tools that aren't explicitly
   * allowed will block waiting for interactive approval (which never comes),
   * so this list is essential for agent-style read-only usage.
   */
  allowedTools?: readonly string[];
  /**
   * Tools to remove from the model's tool palette entirely — stronger than
   * just not approving them, this also stops the model from attempting them.
   */
  disallowedTools?: readonly string[];
  /**
   * Called once per text delta as the agent streams output. When set,
   * enables `--output-format stream-json` on the Claude adapter. Ignored
   * by providers that don't support structured streaming.
   */
  /**
   * Called for each streamed chunk. `kind` distinguishes the final
   * assistant reply (`"text"`) from intermediate reasoning + tool activity
   * (`"thinking"`). Callers that don't care can ignore `kind`.
   */
  onChunk?: (delta: string, kind: "text" | "thinking") => void;
  /**
   * Called once with the provider-assigned session id the first time it
   * appears in the stream. Used by the caller to persist the id for
   * `--resume` on subsequent turns.
   */
  onSessionId?: (sessionId: string) => void;
  /**
   * Provider session id from a prior turn. When set, the Claude adapter
   * adds `--resume <id>` so the agent continues where it left off.
   */
  resumeSessionId?: string;
}

/**
 * Per-adapter extras that the gateway may pass through when the caller
 * opts in (spec review chat uses these; the basic chat endpoints do not).
 */
interface AdapterExtras {
  systemPromptAppend?: string;
  permissionMode?: RunOptions["permissionMode"];
  allowedTools?: readonly string[];
  disallowedTools?: readonly string[];
  streaming?: boolean;
  resumeSessionId?: string;
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
  /**
   * When true, stdout is parsed as line-delimited JSON events instead of
   * plain text. The gateway extracts `session_id` + text deltas from the
   * stream and surfaces them via `onSessionId` / `onChunk`.
   */
  streamJsonSupported: boolean;
}

/**
 * `claude -p "<prompt>"` is the documented non-interactive mode of Claude Code.
 * We prefer stdin because prompts can contain the user's document text and
 * exceed the shell's argv limits.
 */
const claudeAdapter: CliAdapter = {
  command: "claude",
  promptChannel: "stdin",
  streamJsonSupported: true,
  buildArgs(model, _prompt, extraArgs, extras) {
    const args: string[] = ["-p", "--model", model];
    if (extras?.systemPromptAppend) {
      args.push("--append-system-prompt", extras.systemPromptAppend);
    }
    if (extras?.permissionMode) {
      args.push("--permission-mode", extras.permissionMode);
    }
    if (extras?.allowedTools && extras.allowedTools.length > 0) {
      args.push("--allowedTools", ...extras.allowedTools);
    }
    if (extras?.disallowedTools && extras.disallowedTools.length > 0) {
      args.push("--disallowedTools", ...extras.disallowedTools);
    }
    if (extras?.resumeSessionId) {
      args.push("--resume", extras.resumeSessionId);
    }
    if (extras?.streaming) {
      // stream-json emits one NDJSON event per stdout line. Requires
      // --verbose per the Claude Code reference so full event payloads are
      // produced (without it, the CLI errors or prints minimal output).
      args.push("--verbose", "--output-format", "stream-json");
    }
    args.push(...extraArgs);
    return args;
  },
};

/**
 * GitHub Copilot CLI has a `copilot -p "<prompt>"` non-interactive mode.
 * Copilot does not currently expose a per-call model flag in the public CLI,
 * so `model` is passed only via `extraArgs` if the user wires one up.
 * Copilot ignores streaming / resume extras in v1.
 */
const copilotAdapter: CliAdapter = {
  command: "copilot",
  // Copilot's `-p, --prompt <text>` requires the prompt as an argv value;
  // it does not read the prompt from stdin like Claude does.
  promptChannel: "argv",
  streamJsonSupported: false,
  buildArgs(_model, prompt, extraArgs, _extras) {
    return ["-p", prompt, ...extraArgs];
  },
};

const ADAPTERS: Record<AIProvider, CliAdapter> = {
  claude: claudeAdapter,
  copilot: copilotAdapter,
};

/**
 * Thin wrapper around `child_process.spawn` that runs an AI provider CLI
 * in non-interactive mode, pipes the prompt in via stdin, and returns the
 * full assistant text.
 *
 * Supports streaming mode (see `onChunk`, `onSessionId` in `RunOptions`).
 * When the caller opts in, stdout is parsed as NDJSON (one event per line)
 * and the gateway dispatches text deltas + the first session-id it sees.
 * If the stream produces zero text deltas by close (unexpected CLI output
 * format), we fall back to firing `onChunk(allStdout)` once so the caller
 * still gets the full response.
 *
 * `resumeSessionId` passes `--resume <id>` so subsequent turns continue a
 * prior agent session. If that fails (session expired / invalidated), the
 * gateway retries the call once without `--resume`.
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

    const streaming =
      adapter.streamJsonSupported && (options.onChunk !== undefined || options.onSessionId !== undefined);

    try {
      return await this.runOnce(adapter, provider, model, prompt, options, streaming, options.resumeSessionId);
    } catch (err) {
      // If --resume failed, try once more without a session id. This handles
      // the common case where the agent's session was GC'd between turns.
      if (
        options.resumeSessionId &&
        err instanceof AppError &&
        err.code === "AI_CLI_FAILED" &&
        looksLikeResumeFailure(err.message)
      ) {
        return this.runOnce(adapter, provider, model, prompt, options, streaming, undefined);
      }
      throw err;
    }
  }

  private async runOnce(
    adapter: CliAdapter,
    provider: AIProvider,
    model: string,
    prompt: string,
    options: RunOptions,
    streaming: boolean,
    resumeSessionId: string | undefined,
  ): Promise<string> {
    const args = adapter.buildArgs(model, prompt, options.extraArgs, {
      systemPromptAppend: options.systemPromptAppend,
      permissionMode: options.permissionMode,
      allowedTools: options.allowedTools,
      disallowedTools: options.disallowedTools,
      streaming,
      resumeSessionId,
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

      // Streaming state — used only when `streaming === true`.
      let streamAccum = "";
      let streamBuf = "";
      let sessionIdSeen = false;
      let deltaFired = false;

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

      const handleJsonLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        let event: unknown;
        try {
          event = JSON.parse(trimmed);
        } catch {
          return; // skip malformed line
        }
        if (!event || typeof event !== "object") return;
        const e = event as Record<string, unknown>;

        // Session id appears at the top level of most Claude stream-json events.
        // Capture the first one we see.
        if (!sessionIdSeen && typeof e.session_id === "string" && options.onSessionId) {
          sessionIdSeen = true;
          try {
            options.onSessionId(e.session_id as string);
          } catch {
            /* consumer-side errors must not crash the stream */
          }
        }

        // Claude stream-json surfaces assistant content inside
        //   { type: "assistant", message: { content: [{ type: "text" | "thinking" | "tool_use", … }] } }
        // events. content_block_delta events also carry deltas on newer versions;
        // handle both shapes defensively.
        const { text, thinking } = extractDeltas(e);
        if (text && options.onChunk) {
          deltaFired = true;
          streamAccum += text;
          try {
            options.onChunk(text, "text");
          } catch {
            /* consumer-side errors must not crash the stream */
          }
        }
        if (thinking && options.onChunk) {
          // Don't set deltaFired — thinking alone shouldn't suppress the
          // full-stdout fallback below if no assistant text ever arrives.
          try {
            options.onChunk(thinking, "thinking");
          } catch {
            /* consumer-side errors must not crash the stream */
          }
        }
      };

      child.stdout.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        stdout += text;
        if (streaming) {
          streamBuf += text;
          let nl = streamBuf.indexOf("\n");
          while (nl !== -1) {
            const line = streamBuf.slice(0, nl);
            streamBuf = streamBuf.slice(nl + 1);
            handleJsonLine(line);
            nl = streamBuf.indexOf("\n");
          }
        }
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

        if (code !== 0) {
          const snippet = stderr.trim() || stdout.trim() || `exit code ${code}`;
          reject(
            new AppError(
              "AI_CLI_FAILED",
              `${adapter.command} failed (exit ${code}): ${truncate(snippet, 500)}`,
            ),
          );
          return;
        }

        if (streaming) {
          // Flush any trailing line that didn't end with \n.
          if (streamBuf.trim()) handleJsonLine(streamBuf);
          // Fallback: no text deltas reached the caller. Fire the raw stdout
          // once so downstream stores still get a body — better than a
          // silent empty bubble if the CLI output format ever shifts.
          if (!deltaFired && options.onChunk) {
            const body = stdout.trim();
            if (body) {
              streamAccum = body;
              try {
                options.onChunk(body, "text");
              } catch {
                /* ignore */
              }
            }
          }
          resolve(streamAccum.trim());
          return;
        }

        resolve(stdout.trim());
      });

      if (adapter.promptChannel === "stdin") {
        child.stdin.end(prompt, "utf8");
      } else {
        child.stdin.end();
      }
    });
  }
}

interface ExtractedDeltas {
  text: string;
  thinking: string;
}

/**
 * Classify chunks from a Claude stream-json event into two channels:
 *   - `text`     → visible assistant reply (`{ type: "text", text }` blocks,
 *                  or `content_block_delta` events with a text delta)
 *   - `thinking` → extended-thinking text (`{ type: "thinking", thinking }`)
 *                  plus a compact summary of any tool calls Claude makes
 *                  (`→ Read(foo.md)`), so the UI can show what the model is
 *                  doing between turns without drowning the reply in JSON.
 *
 * Tool_result events (from `{ type: "user", ... }` echoes) are skipped — they
 * are noisy and duplicate what tool_use already communicated.
 */
function extractDeltas(event: Record<string, unknown>): ExtractedDeltas {
  const out: ExtractedDeltas = { text: "", thinking: "" };
  const type = event.type;

  if (type === "assistant") {
    const message = event.message as Record<string, unknown> | undefined;
    const content = message?.content;
    if (Array.isArray(content)) {
      const textParts: string[] = [];
      const thinkingParts: string[] = [];
      for (const part of content) {
        if (!part || typeof part !== "object") continue;
        const p = part as Record<string, unknown>;
        if (p.type === "text" && typeof p.text === "string") {
          textParts.push(p.text);
        } else if (p.type === "thinking" && typeof p.thinking === "string") {
          thinkingParts.push(p.thinking);
        } else if (p.type === "tool_use") {
          thinkingParts.push(formatToolUse(p));
        }
      }
      out.text = textParts.join("");
      out.thinking = thinkingParts.join("");
    }
    return out;
  }

  // Per-block delta events used in some versions.
  if (type === "content_block_delta") {
    const delta = event.delta as Record<string, unknown> | undefined;
    if (delta) {
      if ((delta.type === "text_delta" || delta.type === "text") && typeof delta.text === "string") {
        out.text = delta.text;
      } else if (delta.type === "thinking_delta" && typeof delta.thinking === "string") {
        out.thinking = delta.thinking;
      }
    }
    return out;
  }

  return out;
}

/**
 * Compact one-line summary of a tool_use block, e.g. `→ Read(foo.md)` or
 * `→ Grep(pattern=foo)`. Kept short — the intent is to show *that* Claude
 * is working, not to reproduce the full tool input.
 */
function formatToolUse(block: Record<string, unknown>): string {
  const name = typeof block.name === "string" ? block.name : "tool";
  const input = block.input as Record<string, unknown> | undefined;
  let arg = "";
  if (input && typeof input === "object") {
    // Prefer common path-like fields so the UI shows something useful.
    const preview =
      (typeof input.file_path === "string" && input.file_path) ||
      (typeof input.path === "string" && input.path) ||
      (typeof input.pattern === "string" && `pattern=${input.pattern}`) ||
      "";
    arg = preview ? String(preview) : "";
  }
  const line = arg ? `→ ${name}(${truncate(arg, 80)})` : `→ ${name}`;
  return `${line}\n`;
}

/**
 * Heuristic — does this CLI error look like a session-resume failure?
 * Claude's exact wording varies across versions, so we match the common
 * token ("session", "resume", "not found", "expired"). False positives are
 * acceptable: the cost is one extra spawn without --resume.
 */
function looksLikeResumeFailure(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    (m.includes("session") && (m.includes("not found") || m.includes("expired") || m.includes("invalid"))) ||
    m.includes("no such session") ||
    m.includes("resume failed")
  );
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}
