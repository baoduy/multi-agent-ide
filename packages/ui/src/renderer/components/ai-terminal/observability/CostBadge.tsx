import { useAISessionStore } from "../../../store/aiSessionStore";

function fmtTokens(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}

/**
 * Phase 7 — compact cost badge: `12.4k in · 3.2k out · $0.18`.
 * Renders nothing until the daemon emits the first `ai-session:cost-update`
 * for the session.
 */
export function CostBadge({ sessionId }: { sessionId: string }) {
  const slot = useAISessionStore((s) => s.observability[sessionId]);
  if (!slot) return null;
  const { tokenUsage, costUsd } = slot;
  if (
    tokenUsage.inputTokens === 0 &&
    tokenUsage.outputTokens === 0 &&
    costUsd === 0
  ) {
    return null;
  }
  return (
    <span className="inline-flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
      <span>{fmtTokens(tokenUsage.inputTokens)} in</span>
      <span>·</span>
      <span>{fmtTokens(tokenUsage.outputTokens)} out</span>
      <span>·</span>
      <span>${costUsd.toFixed(2)}</span>
    </span>
  );
}
