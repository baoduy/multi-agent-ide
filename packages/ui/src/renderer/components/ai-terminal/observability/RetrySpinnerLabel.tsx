import { useAISessionStore } from "../../../store/aiSessionStore";

/**
 * Phase 7 — `retrying (n/m) — k.ks` spinner shown while the session is in
 * a retry-backoff cycle. Cleared automatically when the next `result` event
 * lands (`applyCostUpdate` zeroes `lastRetryEvent`).
 */
export function RetrySpinnerLabel({ sessionId }: { sessionId: string }) {
  const ev = useAISessionStore((s) => s.observability[sessionId]?.lastRetryEvent);
  if (!ev) return null;
  const seconds = (ev.delayMs / 1000).toFixed(1);
  return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-600">
      <span className="animate-spin">⟳</span>
      retrying ({ev.attempt}/{ev.max}) — {seconds}s
    </span>
  );
}
