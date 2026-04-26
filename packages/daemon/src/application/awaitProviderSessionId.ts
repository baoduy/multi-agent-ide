import { AppError } from "../errors/AppError";

export interface AwaitProviderSessionIdInput {
  sessionId: string;
  /** Synchronous lookup of the current providerSessionId, or null if absent. */
  lookup: (sessionId: string) => string | null;
  /** Subscribe to reconciliation events; returns unsubscribe. */
  subscribe: (sessionId: string, cb: (providerSessionId: string) => void) => () => void;
  /** Default 5_000 ms per FR-7.2.c. */
  timeoutMs: number;
}

/**
 * Bounded wait for a provider-assigned session ID. Resolves immediately if the
 * sync layer has already reconciled it; otherwise subscribes to a single
 * notification and rejects with `AI_RESUME_PENDING_RECONCILIATION` after the
 * configured timeout.
 */
export async function awaitProviderSessionId({
  sessionId,
  lookup,
  subscribe,
  timeoutMs,
}: AwaitProviderSessionIdInput): Promise<string> {
  const existing = lookup(sessionId);
  if (existing) return existing;

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      unsubscribe();
      reject(
        new AppError(
          "AI_RESUME_PENDING_RECONCILIATION",
          `Session ${sessionId} not yet reconciled with provider after ${timeoutMs}ms`,
        ),
      );
    }, timeoutMs);

    const unsubscribe = subscribe(sessionId, (providerSessionId) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(providerSessionId);
    });
  });
}
