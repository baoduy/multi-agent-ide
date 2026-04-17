import type { AISessionRecord } from "@magenta/shared/aiTerminal";
import type { SyncedSessionRecord } from "@magenta/shared/syncedSession";
import type { HistoryItem } from "./sessionTreeBuilder";

// Pin keys are stable across the live→synced lifecycle: a live session keeps
// the same key after it ends and reappears as a synced record, because the
// provider's agent UUID (providerSessionId / sessionId) is preserved.
export function livePinKey(s: AISessionRecord): string {
  return `${s.provider}:${s.providerSessionId || s.id}`;
}

export function syncedPinKey(s: SyncedSessionRecord): string {
  // SyncedSessionRecord.provider is "claude-code" | "copilot"; normalise to
  // the live provider namespace ("claude" | "copilot") so the same key
  // matches a live session that later becomes a synced record.
  const provider = s.provider === "claude-code" ? "claude" : s.provider;
  return `${provider}:${s.sessionId}`;
}

export function itemPinKey(item: HistoryItem): string {
  return item.kind === "live" ? livePinKey(item.session) : syncedPinKey(item.session);
}
