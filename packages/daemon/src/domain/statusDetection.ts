import type { AISessionStatus } from "@magenta/shared/aiTerminal";

/**
 * Status detection notes
 * ─────────────────────
 * `"error"` is intentionally NOT inferred from PTY text content. Earlier
 * heuristics (`/error:/i`, `/^\s*(?:Error:|\[error\]|FAIL:)/mi`, etc.)
 * produced rampant false positives — Claude Code and Copilot routinely
 * emit "Error:" / "[error]" / "FAIL:" in normal conversation (compiler
 * diagnostics, prose explanations, log lines, lint output on files the
 * agent is reading, etc.) and the status was never reset, so sessions
 * got stuck on an "error" badge for the rest of their life.
 *
 * `"error"` is now a terminal status set by `BaseAISession` only when the
 * PTY child process exits with a non-zero exit code. The on-data detectors
 * below only resolve `"waiting-input"` ↔ `"active"` transitions.
 */

/**
 * Detects Claude Code session status from PTY output.
 * Returns a new status if a transition is detected, or null if no change.
 */
export function detectClaudeStatus(data: string, currentStatus: AISessionStatus): AISessionStatus | null {
  // Terminal statuses are sticky — never transition out of them on text.
  if (currentStatus === "error" || currentStatus === "exited") {
    return null;
  }

  // Detect prompt patterns indicating waiting for input
  if (/^>\s*$/m.test(data) || /\?\s*$/m.test(data)) {
    if (currentStatus !== "waiting-input") return "waiting-input";
  }

  // If we see substantial output and status is idle or waiting, transition to active
  if (data.length > 10 && (currentStatus === "idle" || currentStatus === "waiting-input")) {
    return "active";
  }

  return null;
}

/**
 * Detects GitHub Copilot CLI session status from PTY output.
 * Returns a new status if a transition is detected, or null if no change.
 */
export function detectCopilotStatus(data: string, currentStatus: AISessionStatus): AISessionStatus | null {
  // Terminal statuses are sticky — never transition out of them on text.
  if (currentStatus === "error" || currentStatus === "exited") {
    return null;
  }

  // Detect prompt patterns indicating waiting for input
  if (/^>\s*$/m.test(data) || /\?\s*$/m.test(data)) {
    if (currentStatus !== "waiting-input") return "waiting-input";
  }

  // Detect GitHub OAuth device flow
  if (/device code/i.test(data) || /github\.com\/login\/device/i.test(data)) {
    if (currentStatus !== "waiting-input") return "waiting-input";
  }

  // If we see substantial output and status is idle or waiting, transition to active
  if (data.length > 10 && (currentStatus === "idle" || currentStatus === "waiting-input")) {
    return "active";
  }

  return null;
}
