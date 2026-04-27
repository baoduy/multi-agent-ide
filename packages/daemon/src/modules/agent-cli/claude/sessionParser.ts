import type { TokenUsage, SyncedSessionActivity } from "@magenta/shared/syncedSession";

/**
 * Metadata extracted from a Claude Code JSONL session file.
 * Pure data extraction — no I/O or side effects.
 */
export interface ClaudeSessionMetadata {
  sessionId: string;
  cwd: string | null;
  gitBranch: string | null;
  model: string | null;
  tokenUsage: TokenUsage;
  messageCount: number;
  status: "active" | "completed";
  /**
   * Live activity derived from the last events in the JSONL stream.
   * - `processing`: last entry is a user message, or an assistant tool_use that has no following tool_result
   * - `idle`: last entry is an assistant text message and no pending tool calls
   * - `completed`: a `last-prompt` event (or equivalent shutdown marker) was seen
   */
  activity: SyncedSessionActivity;
  startTimestamp: number | null;
  endTimestamp: number | null;
  slug: string | null;
  version: string | null;
  entrypoint: string | null;
  title: string | null;
}

/**
 * Parses an array of raw JSONL lines from a Claude Code session file
 * and extracts session metadata.
 *
 * This is a pure function — it receives already-read lines and returns data.
 */
export function parseClaudeSessionLines(lines: string[]): ClaudeSessionMetadata {
  let sessionId = "";
  let cwd: string | null = null;
  let gitBranch: string | null = null;
  let model: string | null = null;
  let slug: string | null = null;
  let version: string | null = null;
  let entrypoint: string | null = null;
  let status: "active" | "completed" = "active";
  let startTimestamp: number | null = null;
  let endTimestamp: number | null = null;
  let title: string | null = null;

  const tokenUsage: TokenUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
  };

  let userCount = 0;
  let assistantCount = 0;

  // Activity tracking — walk in order; the last meaningful event determines activity.
  // - "user" event:        lastMeaningful = "user"
  // - "assistant" event:   lastMeaningful = "assistant" (or "assistant-tool" if it contains tool_use blocks)
  // - tool_result inside a "user" event: clears the pending tool from outstandingToolIds
  let lastMeaningful: "user" | "assistant" | "assistant-tool" = "user";
  const outstandingToolIds = new Set<string>();

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

    // Track first and last timestamps
    if (timestamp) {
      const ts = new Date(timestamp).getTime();
      if (!Number.isNaN(ts)) {
        if (startTimestamp === null || ts < startTimestamp) startTimestamp = ts;
        if (endTimestamp === null || ts > endTimestamp) endTimestamp = ts;
      }
    }

    // Extract sessionId
    if (event.sessionId && !sessionId) {
      sessionId = event.sessionId as string;
    }

    if (type === "user") {
      userCount++;
      lastMeaningful = "user";
      // Extract cwd, gitBranch, version, entrypoint, slug from first user event
      if (!cwd && event.cwd) cwd = event.cwd as string;
      if (!gitBranch && event.gitBranch) gitBranch = event.gitBranch as string;
      if (!version && event.version) version = event.version as string;
      if (!entrypoint && event.entrypoint) entrypoint = event.entrypoint as string;
      if (!slug && event.slug) slug = event.slug as string;

      // Extract title from first user message content
      if (!title && userCount === 1) {
        const message = event.message as Record<string, unknown> | undefined;
        if (message) {
          const content = message.content;
          if (typeof content === "string") {
            title = extractTitleFromContent(content);
          }
        }
      }

      // A "user" event may carry tool_result blocks (responses to prior tool_use).
      // Clear any matching outstanding tool ids so we know the assistant turn can resume.
      const message = event.message as Record<string, unknown> | undefined;
      if (message && Array.isArray(message.content)) {
        for (const block of message.content as Array<Record<string, unknown>>) {
          if (block && block.type === "tool_result" && typeof block.tool_use_id === "string") {
            outstandingToolIds.delete(block.tool_use_id);
          }
        }
      }
    }

    if (type === "assistant") {
      assistantCount++;
      const message = event.message as Record<string, unknown> | undefined;
      let hasToolUse = false;
      if (message) {
        // Extract model from first assistant message
        if (!model && message.model) {
          model = message.model as string;
        }

        // Accumulate token usage
        const usage = message.usage as Record<string, unknown> | undefined;
        if (usage) {
          tokenUsage.inputTokens += (usage.input_tokens as number) || 0;
          tokenUsage.outputTokens += (usage.output_tokens as number) || 0;
          tokenUsage.cacheCreationInputTokens += (usage.cache_creation_input_tokens as number) || 0;
          tokenUsage.cacheReadInputTokens += (usage.cache_read_input_tokens as number) || 0;
        }

        // Track tool_use blocks — they create outstanding tool calls.
        if (Array.isArray(message.content)) {
          for (const block of message.content as Array<Record<string, unknown>>) {
            if (block && block.type === "tool_use" && typeof block.id === "string") {
              outstandingToolIds.add(block.id);
              hasToolUse = true;
            }
          }
        }
      }
      lastMeaningful = hasToolUse ? "assistant-tool" : "assistant";
    }

    if (type === "last-prompt") {
      status = "completed";
    }
  }

  // Derive activity from the trailing event sequence.
  // Order matters: completed wins over processing/idle.
  let activity: SyncedSessionActivity;
  if (status === "completed") {
    activity = "completed";
  } else if (lastMeaningful === "user") {
    // User just sent a turn, assistant hasn't responded yet.
    activity = "processing";
  } else if (outstandingToolIds.size > 0) {
    // Assistant invoked tools that have not been resolved yet.
    activity = "processing";
  } else {
    // Last meaningful event was an assistant text message with no pending tools.
    activity = "idle";
  }

  return {
    sessionId,
    cwd,
    gitBranch,
    model,
    tokenUsage,
    messageCount: userCount + assistantCount,
    status,
    activity,
    startTimestamp,
    endTimestamp,
    slug,
    version,
    entrypoint,
    title,
  };
}

/**
 * Extracts a short title from user message content.
 * Strips command tags and truncates to ~80 chars.
 */
export function extractTitleFromContent(content: string): string | null {
  // Remove XML-like command tags
  let cleaned = content
    .replace(/<command-message>.*?<\/command-message>/gs, "")
    .replace(/<command-name>.*?<\/command-name>/gs, "")
    .replace(/<command-args>(.*?)<\/command-args>/gs, "$1")
    .trim();

  if (!cleaned) return null;

  // Take first line, truncate
  const firstLine = cleaned.split("\n")[0].trim();
  if (firstLine.length > 80) {
    return firstLine.slice(0, 77) + "...";
  }
  return firstLine || null;
}
