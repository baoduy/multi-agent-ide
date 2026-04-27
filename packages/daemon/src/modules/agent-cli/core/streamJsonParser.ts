import type { AIStreamEvent, TokenUsage } from "@magenta/shared/aiStreamEvent";

/**
 * Pure reducer over Claude `--output-format stream-json` lines. The caller
 * owns I/O: it splits stdout into lines (or feeds a raw buffer for `flush`)
 * and emits the resulting `AIStreamEvent`s upstream. State is immutable —
 * each `feedLine` returns a fresh state.
 *
 * Spec FR-5.1, FR-5.3. Phase 2 covers Claude only; Copilot stream support is
 * tracked as a separate task and currently emits raw-pty frames upstream.
 */
export interface ParserState {
  /** Monotonic counter for emitted events (becomes `event.seq`). */
  seq: number;
  /** First session_id seen on any event; never overwritten. */
  sessionId: string | null;
  /** Map from `tool_use.id` to its `name`, used to label tool-result events. */
  toolNames: Record<string, string>;
  /** Buffer for a trailing partial line (no newline) — drained via `flush`. */
  partial: string;
  /** Injectable clock for deterministic tests. */
  now: () => number;
}

export interface ParserOptions {
  now?: () => number;
}

export function createParserState(opts: ParserOptions = {}): ParserState {
  return {
    seq: 0,
    sessionId: null,
    toolNames: {},
    partial: "",
    now: opts.now ?? (() => Date.now()),
  };
}

interface FeedResult {
  state: ParserState;
  events: AIStreamEvent[];
}

function bumpSeq(state: ParserState): { state: ParserState; seq: number } {
  const seq = state.seq + 1;
  return { state: { ...state, seq }, seq };
}

function ensureSessionId(state: ParserState, candidate: unknown): ParserState {
  if (state.sessionId !== null) return state;
  if (typeof candidate !== "string" || candidate.length === 0) return state;
  return { ...state, sessionId: candidate };
}

function summarizeToolInput(input: unknown): string {
  if (input == null) return "";
  if (typeof input === "string") return input.slice(0, 200);
  try {
    const s = JSON.stringify(input);
    return s.length > 200 ? `${s.slice(0, 200)}…` : s;
  } catch {
    return "";
  }
}

function summarizeToolResult(content: unknown): string | undefined {
  if (content == null) return undefined;
  if (typeof content === "string") return content.slice(0, 200);
  if (Array.isArray(content)) {
    const text = content
      .map((c) => (c && typeof c === "object" && "text" in c ? String((c as { text: unknown }).text) : ""))
      .join("");
    return text ? text.slice(0, 200) : undefined;
  }
  try {
    return JSON.stringify(content).slice(0, 200);
  } catch {
    return undefined;
  }
}

function parseUsage(raw: unknown): TokenUsage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const input = typeof o.input_tokens === "number" ? o.input_tokens : 0;
  const output = typeof o.output_tokens === "number" ? o.output_tokens : 0;
  const usage: TokenUsage = { inputTokens: input, outputTokens: output };
  if (typeof o.cache_creation_input_tokens === "number")
    usage.cacheCreationInputTokens = o.cache_creation_input_tokens;
  if (typeof o.cache_read_input_tokens === "number")
    usage.cacheReadInputTokens = o.cache_read_input_tokens;
  return usage;
}

/**
 * Feed a single line (no trailing newline) to the parser.
 * Returns the new state plus zero or more emitted events.
 */
export function feedLine(prev: ParserState, line: string): FeedResult {
  const trimmed = line.trim();
  if (!trimmed) return { state: prev, events: [] };

  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return { state: prev, events: [] };
  }
  if (!raw || typeof raw !== "object") return { state: prev, events: [] };
  const e = raw as Record<string, unknown>;

  let state = ensureSessionId(prev, e.session_id);
  const sid = state.sessionId ?? "unknown";
  const ts = state.now();
  const events: AIStreamEvent[] = [];
  const emit = (build: (seq: number) => AIStreamEvent) => {
    const next = bumpSeq(state);
    state = next.state;
    events.push(build(next.seq));
  };

  const type = e.type;

  if (type === "system" && e.subtype === "init") {
    const tools = Array.isArray(e.tools) ? (e.tools as unknown[]).filter((t): t is string => typeof t === "string") : [];
    const servers = Array.isArray(e.mcp_servers)
      ? (e.mcp_servers as unknown[]).map((s) => {
          if (s && typeof s === "object" && "name" in (s as Record<string, unknown>)) {
            const n = (s as Record<string, unknown>).name;
            return typeof n === "string" ? n : null;
          }
          return null;
        }).filter((n): n is string => n !== null)
      : [];
    const pluginErrors = Array.isArray(e.plugin_errors)
      ? (e.plugin_errors as unknown[]).map((p) => {
          const o = (p ?? {}) as Record<string, unknown>;
          return {
            name: typeof o.name === "string" ? o.name : "",
            message: typeof o.message === "string" ? o.message : "",
          };
        })
      : [];
    emit((seq) => ({
      kind: "session-init",
      sessionId: sid,
      seq,
      timestamp: ts,
      model: typeof e.model === "string" ? e.model : "",
      tools,
      mcpServers: servers,
      pluginErrors,
    }));
    return { state, events };
  }

  if (type === "system" && e.subtype === "plugin_install") {
    const status = e.status;
    if (status === "started" || status === "installed" || status === "failed" || status === "completed") {
      emit((seq) => ({
        kind: "plugin-install",
        sessionId: sid,
        seq,
        timestamp: ts,
        plugin: typeof e.plugin === "string" ? e.plugin : "",
        status,
        error: typeof e.error === "string" ? e.error : undefined,
      }));
    }
    return { state, events };
  }

  if (type === "system" && e.subtype === "api_retry") {
    emit((seq) => ({
      kind: "retry",
      sessionId: sid,
      seq,
      timestamp: ts,
      attempt: typeof e.attempt === "number" ? e.attempt : 1,
      max: typeof e.max_retries === "number" ? e.max_retries : 1,
      delayMs: typeof e.retry_delay_ms === "number" ? e.retry_delay_ms : 0,
      category: typeof e.error === "string" ? e.error : "unknown",
      status: typeof e.error_status === "number" ? e.error_status : undefined,
    }));
    return { state, events };
  }

  if (type === "assistant" && e.message && typeof e.message === "object") {
    const content = (e.message as Record<string, unknown>).content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (!block || typeof block !== "object") continue;
        const b = block as Record<string, unknown>;
        if (b.type === "text" && typeof b.text === "string") {
          const text = b.text;
          const partial = b.partial === true;
          emit((seq) => ({
            kind: "assistant-text",
            sessionId: sid,
            seq,
            timestamp: ts,
            text,
            partial,
          }));
        } else if (b.type === "thinking" && typeof b.thinking === "string") {
          const text = b.thinking;
          emit((seq) => ({
            kind: "assistant-think",
            sessionId: sid,
            seq,
            timestamp: ts,
            text,
          }));
        } else if (b.type === "tool_use" && typeof b.id === "string" && typeof b.name === "string") {
          const id = b.id;
          const name = b.name;
          state = { ...state, toolNames: { ...state.toolNames, [id]: name } };
          const summary = summarizeToolInput(b.input);
          emit((seq) => ({
            kind: "tool-use",
            sessionId: sid,
            seq,
            timestamp: ts,
            tool: name,
            id,
            summary,
          }));
        }
      }
    }
    return { state, events };
  }

  if (type === "user" && e.message && typeof e.message === "object") {
    const content = (e.message as Record<string, unknown>).content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (!block || typeof block !== "object") continue;
        const b = block as Record<string, unknown>;
        if (b.type === "tool_result" && typeof b.tool_use_id === "string") {
          const id = b.tool_use_id;
          const ok = b.is_error !== true;
          const summary = summarizeToolResult(b.content);
          emit((seq) => ({
            kind: "tool-result",
            sessionId: sid,
            seq,
            timestamp: ts,
            id,
            ok,
            summary,
          }));
        }
      }
    }
    return { state, events };
  }

  if (type === "result") {
    const subtype = typeof e.subtype === "string" ? e.subtype : "";
    const ok = e.is_error !== true;
    const usage = parseUsage(e.usage);
    const costUsd = typeof e.total_cost_usd === "number" ? e.total_cost_usd : undefined;
    const capExceeded =
      subtype === "error_max_budget" ? "budget" :
      subtype === "error_max_turns" ? "turns" :
      undefined;
    emit((seq) => ({
      kind: "result",
      sessionId: sid,
      seq,
      timestamp: ts,
      ok,
      output: e.result,
      tokenUsage: usage,
      costUsd,
      capExceeded,
    }));
    return { state, events };
  }

  return { state, events };
}

/**
 * Drain a trailing partial line. Callers that batch-read stdout should
 * place any unterminated tail in `state.partial` then call `flush`.
 */
export function flush(prev: ParserState): FeedResult {
  if (!prev.partial) return { state: prev, events: [] };
  const result = feedLine({ ...prev, partial: "" }, prev.partial);
  return result;
}
