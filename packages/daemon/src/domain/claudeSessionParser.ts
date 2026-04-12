import type { TokenUsage } from "@magenta/shared/syncedSession";

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
    }

    if (type === "assistant") {
      assistantCount++;
      const message = event.message as Record<string, unknown> | undefined;
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
      }
    }

    if (type === "last-prompt") {
      status = "completed";
    }
  }

  return {
    sessionId,
    cwd,
    gitBranch,
    model,
    tokenUsage,
    messageCount: userCount + assistantCount,
    status,
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
function extractTitleFromContent(content: string): string | null {
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

/**
 * Resolves the original filesystem path from a Claude Code project directory name.
 * Claude Code stores projects under hashed directory names like:
 *   -Users-steven--CODE-GIT-multi-agent-ide
 * This converts it back to: /Users/steven/_CODE/GIT/multi-agent-ide
 *
 * Note: This is best-effort. Double hyphens (--) represent path separators
 * and single hyphens (-) represent directory name hyphens OR separators.
 * The cwd field from inside the JSONL is more reliable.
 */
export function resolveProjectPathFromDirName(dirName: string): string {
  // Replace leading hyphen with /
  // Double hyphens are path separators
  return dirName
    .replace(/^-/, "/")
    .replace(/--/g, "/");
}
