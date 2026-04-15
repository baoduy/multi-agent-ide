import type { TokenUsage, SyncedSessionActivity } from "@magenta/shared/syncedSession";

/**
 * Workspace metadata extracted from a Copilot CLI session's `workspace.yaml`.
 *
 * GitHub Copilot CLI writes this file to `~/.copilot/session-state/{sessionId}/workspace.yaml`
 * once the session is bound to a repository / git worktree. Sessions without a
 * `workspace.yaml` are not associated with any project (e.g. VSCode-only stubs)
 * and are skipped by the sync layer.
 */
export interface CopilotWorkspace {
  id: string;
  cwd: string | null;
  gitRoot: string | null;
  repository: string | null;
  hostType: string | null;
  branch: string | null;
  summary: string | null;
  summaryCount: number;
  createdAt: number | null;
  updatedAt: number | null;
}

/**
 * Metadata extracted from a Copilot CLI session (`workspace.yaml` + `events.jsonl`).
 * Pure data extraction — no I/O or side effects.
 */
export interface CopilotSessionMetadata {
  sessionId: string;
  cwd: string | null;
  gitBranch: string | null;
  repository: string | null;
  model: string | null;
  /** Copilot does not emit per-message token usage in events.jsonl. */
  tokenUsage: TokenUsage | null;
  messageCount: number;
  status: "active" | "completed";
  activity: SyncedSessionActivity;
  startTimestamp: number | null;
  endTimestamp: number | null;
  /** Copilot CLI version (`copilotVersion` from session.start). */
  version: string | null;
  /** First-line summary from workspace.yaml (or null). */
  title: string | null;
}

/**
 * Minimal flat YAML parser tailored to Copilot's `workspace.yaml`.
 * The file has no nesting or arrays — only top-level `key: value` pairs.
 *
 * We intentionally avoid pulling in the `yaml` package for ~5 lines of input.
 */
export function parseWorkspaceYaml(content: string): CopilotWorkspace {
  const out: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx <= 0) continue;

    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();

    // Strip wrapping quotes.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    out[key] = value;
  }

  const parseTimestamp = (s: string | undefined): number | null => {
    if (!s) return null;
    const t = new Date(s).getTime();
    return Number.isNaN(t) ? null : t;
  };

  const parseInteger = (s: string | undefined): number => {
    if (!s) return 0;
    const n = Number.parseInt(s, 10);
    return Number.isNaN(n) ? 0 : n;
  };

  return {
    id: out.id ?? "",
    cwd: out.cwd ?? null,
    gitRoot: out.git_root ?? null,
    repository: out.repository ?? null,
    hostType: out.host_type ?? null,
    branch: out.branch ?? null,
    summary: out.summary ?? null,
    summaryCount: parseInteger(out.summary_count),
    createdAt: parseTimestamp(out.created_at),
    updatedAt: parseTimestamp(out.updated_at),
  };
}

/**
 * Parses Copilot CLI `events.jsonl` lines and combines them with workspace.yaml
 * metadata to produce a unified session record.
 *
 * Activity is derived by walking events in order and tracking the most recent
 * meaningful state — see the decision table in the implementation plan:
 *
 * - `session.shutdown` (with no later `session.resume`) → completed
 * - `assistant.turn_start` not yet matched by `assistant.turn_end` → processing
 * - `tool.execution_start` not yet matched by `tool.execution_complete` → processing
 * - `user.message` with no following `assistant.turn_end` → processing
 * - `assistant.turn_end` is the last decisive event → idle
 */
export function parseCopilotEventLines(
  lines: string[],
  workspace: CopilotWorkspace,
): CopilotSessionMetadata {
  let model: string | null = null;
  let version: string | null = null;
  let userMessageCount = 0;
  let assistantMessageCount = 0;
  let startTimestamp: number | null = workspace.createdAt;
  let endTimestamp: number | null = workspace.updatedAt;

  // Activity tracking
  let shutdownSeen = false;
  let openAssistantTurns = 0;
  let openToolExecutions = 0;
  /** True when the most recent terminal user.message has not yet been answered. */
  let userMessagePendingResponse = false;
  /** True when the last decisive event was assistant.turn_end with no pending tools or user msg. */
  let lastWasAssistantTurnEnd = false;

  for (const line of lines) {
    if (!line.trim()) continue;

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }

    const type = event.type as string | undefined;
    const timestamp = event.timestamp as string | undefined;
    const data = event.data as Record<string, unknown> | undefined;

    if (timestamp) {
      const ts = new Date(timestamp).getTime();
      if (!Number.isNaN(ts)) {
        if (startTimestamp === null || ts < startTimestamp) startTimestamp = ts;
        if (endTimestamp === null || ts > endTimestamp) endTimestamp = ts;
      }
    }

    switch (type) {
      case "session.start": {
        if (data && typeof data.copilotVersion === "string") {
          version = data.copilotVersion;
        }
        shutdownSeen = false;
        break;
      }
      case "session.resume": {
        // Reopens a previously-shutdown session.
        shutdownSeen = false;
        break;
      }
      case "session.shutdown": {
        shutdownSeen = true;
        openAssistantTurns = 0;
        openToolExecutions = 0;
        userMessagePendingResponse = false;
        lastWasAssistantTurnEnd = false;
        break;
      }
      case "session.model_change": {
        if (data && typeof data.newModel === "string") {
          model = data.newModel;
        }
        break;
      }
      case "user.message": {
        userMessageCount++;
        userMessagePendingResponse = true;
        lastWasAssistantTurnEnd = false;
        break;
      }
      case "assistant.message": {
        assistantMessageCount++;
        // An assistant message implies the user message has been answered (at least partially).
        userMessagePendingResponse = false;
        lastWasAssistantTurnEnd = false;
        break;
      }
      case "assistant.turn_start": {
        openAssistantTurns++;
        lastWasAssistantTurnEnd = false;
        break;
      }
      case "assistant.turn_end": {
        if (openAssistantTurns > 0) openAssistantTurns--;
        userMessagePendingResponse = false;
        if (openAssistantTurns === 0 && openToolExecutions === 0) {
          lastWasAssistantTurnEnd = true;
        }
        break;
      }
      case "tool.execution_start": {
        openToolExecutions++;
        lastWasAssistantTurnEnd = false;
        break;
      }
      case "tool.execution_complete": {
        if (openToolExecutions > 0) openToolExecutions--;
        break;
      }
      default:
        break;
    }
  }

  // Derive status + activity.
  let status: "active" | "completed";
  let activity: SyncedSessionActivity;

  if (shutdownSeen) {
    status = "completed";
    activity = "completed";
  } else if (openAssistantTurns > 0 || openToolExecutions > 0 || userMessagePendingResponse) {
    status = "active";
    activity = "processing";
  } else if (lastWasAssistantTurnEnd) {
    status = "active";
    activity = "idle";
  } else {
    // No decisive events seen — treat a session that started but never produced
    // an assistant turn as idle (it's alive, just hasn't been used yet).
    status = "active";
    activity = "idle";
  }

  return {
    sessionId: workspace.id,
    cwd: workspace.cwd,
    gitBranch: workspace.branch,
    repository: workspace.repository,
    model,
    tokenUsage: null,
    messageCount: userMessageCount + assistantMessageCount,
    status,
    activity,
    startTimestamp,
    endTimestamp,
    version,
    title: workspace.summary,
  };
}
