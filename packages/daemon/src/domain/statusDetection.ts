import type { AISessionStatus } from "@magenta/shared/aiTerminal";

/**
 * Detects Claude Code session status from PTY output.
 * Returns a new status if a transition is detected, or null if no change.
 */
export function detectClaudeStatus(data: string, currentStatus: AISessionStatus): AISessionStatus | null {
  // Detect prompt patterns indicating waiting for input
  if (/^>\s*$/m.test(data) || /\?\s*$/m.test(data)) {
    if (currentStatus !== "waiting-input") return "waiting-input";
  }

  // Detect error patterns
  if (/error:/i.test(data) && currentStatus !== "error") {
    return "error";
  }

  // If we see substantial output and status is idle or waiting, transition to running
  if (data.length > 10 && (currentStatus === "idle" || currentStatus === "waiting-input")) {
    return "running";
  }

  return null;
}

/**
 * Detects GitHub Copilot CLI session status from PTY output.
 * Returns a new status if a transition is detected, or null if no change.
 */
export function detectCopilotStatus(data: string, currentStatus: AISessionStatus): AISessionStatus | null {
  // Detect prompt patterns indicating waiting for input
  if (/^>\s*$/m.test(data) || /\?\s*$/m.test(data)) {
    if (currentStatus !== "waiting-input") return "waiting-input";
  }

  // Detect GitHub OAuth device flow
  if (/device code/i.test(data) || /github\.com\/login\/device/i.test(data)) {
    if (currentStatus !== "waiting-input") return "waiting-input";
  }

  // Detect error patterns
  if (/error:/i.test(data) && currentStatus !== "error") {
    return "error";
  }

  // If we see substantial output and status is idle or waiting, transition to running
  if (data.length > 10 && (currentStatus === "idle" || currentStatus === "waiting-input")) {
    return "running";
  }

  return null;
}
