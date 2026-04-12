/**
 * Metadata extracted from a Copilot CLI JSONL session file.
 * Pure data extraction — no I/O or side effects.
 */
export interface CopilotSessionMetadata {
  sessionId: string;
  copilotVersion: string | null;
  model: string | null;
  status: "active" | "completed";
  startTimestamp: number | null;
  endTimestamp: number | null;
  messageCount: number;
  title: string | null;
}

/**
 * Parses an array of raw JSONL lines from a Copilot CLI session file
 * and extracts session metadata.
 *
 * This is a pure function — it receives already-read lines and returns data.
 */
export function parseCopilotSessionLines(lines: string[]): CopilotSessionMetadata {
  let sessionId = "";
  let copilotVersion: string | null = null;
  let model: string | null = null;
  let status: "active" | "completed" = "completed";
  let startTimestamp: number | null = null;
  let endTimestamp: number | null = null;
  let title: string | null = null;

  let userMessageCount = 0;
  let assistantMessageCount = 0;
  let hasError = false;

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

    // Track timestamps
    if (timestamp) {
      const ts = new Date(timestamp).getTime();
      if (!Number.isNaN(ts)) {
        if (startTimestamp === null || ts < startTimestamp) startTimestamp = ts;
        if (endTimestamp === null || ts > endTimestamp) endTimestamp = ts;
      }
    }

    if (type === "session.start" && data) {
      if (data.sessionId) sessionId = data.sessionId as string;
      if (data.copilotVersion) copilotVersion = data.copilotVersion as string;
      if (data.startTime) {
        const ts = new Date(data.startTime as string).getTime();
        if (!Number.isNaN(ts) && (startTimestamp === null || ts < startTimestamp)) {
          startTimestamp = ts;
        }
      }
    }

    if (type === "session.model_change" && data) {
      if (data.newModel) model = data.newModel as string;
    }

    if (type === "session.error") {
      hasError = true;
    }

    if (type === "session.resume") {
      // Session was resumed — it's still active
      status = "active";
    }

    if (type === "user.message") {
      userMessageCount++;
      // Extract title from first user message
      if (!title && data && typeof data.content === "string" && data.content.trim()) {
        const content = data.content.trim();
        title = content.length > 80 ? content.slice(0, 77) + "..." : content;
      }
    }

    if (type === "assistant.message") {
      assistantMessageCount++;
    }
  }

  // If the session has recent resume events, treat it as active
  // Otherwise, if it has messages it's completed
  if (status === "active" && endTimestamp) {
    const age = Date.now() - endTimestamp;
    // If the last event was more than 10 minutes ago, consider it completed
    if (age > 10 * 60 * 1000) {
      status = "completed";
    }
  }

  // If there was an error with no messages, keep as completed
  if (hasError && userMessageCount === 0) {
    status = "completed";
  }

  return {
    sessionId: sessionId || "",
    copilotVersion,
    model,
    status,
    startTimestamp,
    endTimestamp,
    messageCount: userMessageCount + assistantMessageCount,
    title,
  };
}
