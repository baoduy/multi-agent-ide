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
 *
 * All regex matching operates on ANSI-stripped text. Raw PTY data contains
 * escape codes for colours, cursor control, etc. that would break prompt
 * detection patterns (e.g. `\x1b[32m>\x1b[0m ` vs plain `> `).
 */

/* eslint-disable no-control-regex */
const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07|\x1b[()][A-B012]/g;
/* eslint-enable no-control-regex */

/** Strip ANSI escape sequences so regex matching operates on visible text. */
function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "");
}

/**
 * Detects Claude Code session status from PTY output.
 * Returns a new status if a transition is detected, or null if no change.
 */
export function detectClaudeStatus(data: string, currentStatus: AISessionStatus): AISessionStatus | null {
  // Terminal statuses are sticky — never transition out of them on text.
  if (currentStatus === "error" || currentStatus === "exited") {
    return null;
  }

  const visible = stripAnsi(data);

  // Detect prompt patterns indicating waiting for input.
  // Return early so the length check below cannot override a detected prompt.
  if (/^>\s*$/m.test(visible) || /\?\s*$/m.test(visible)) {
    return currentStatus !== "waiting-input" ? "waiting-input" : null;
  }

  // If we see substantial *visible* output and status is idle or waiting, transition to active
  if (visible.length > 10 && (currentStatus === "idle" || currentStatus === "waiting-input")) {
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

  const visible = stripAnsi(data);

  // Detect prompt patterns indicating waiting for input.
  // Return early so the length check below cannot override a detected prompt.
  if (/^>\s*$/m.test(visible) || /\?\s*$/m.test(visible)) {
    return currentStatus !== "waiting-input" ? "waiting-input" : null;
  }

  // Detect GitHub OAuth device flow
  if (/device code/i.test(visible) || /github\.com\/login\/device/i.test(visible)) {
    return currentStatus !== "waiting-input" ? "waiting-input" : null;
  }

  // If we see substantial *visible* output and status is idle or waiting, transition to active
  if (visible.length > 10 && (currentStatus === "idle" || currentStatus === "waiting-input")) {
    return "active";
  }

  return null;
}
