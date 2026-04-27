import type { AIStreamEvent } from "@magenta/shared/aiStreamEvent";
import type { IpcResponse } from "@magenta/shared/ipc";
import type { IPCBridge } from "../ipc/IPCBridge";
import { SessionCostAccumulator } from "../../modules/agent-cli/core/SessionCostAccumulator";

type AISessionEventPush = Extract<IpcResponse, { type: "ai-session:event" }>;

/**
 * Callback used to persist the rolling usage counters back onto the in-memory
 * `AISessionRecord` map owned by `AISessionApplicationService`. The daemon DB
 * is a cache (LMDB) — authoritative session state lives in memory + on-disk
 * provider files, so we don't go through a repository here.
 */
export type UpdateUsageFn = (
  sessionId: string,
  partial: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostUsd: number;
    retryCount: number;
  },
) => void;

/**
 * Phase 7 — subscribes to the daemon's `ai-session:event` push stream
 * (produced by Phase 2's parser inside the run-once / live-session paths),
 * runs a per-session `SessionCostAccumulator`, and fans out four typed push
 * events plus a persistence callback on `result`.
 *
 * Spec FR-10.1, FR-10.2, FR-10.3.
 */
export class SessionObservabilityService {
  private readonly accumulators = new Map<string, SessionCostAccumulator>();

  constructor(
    private readonly bridge: IPCBridge,
    private readonly updateUsage: UpdateUsageFn,
  ) {
    this.bridge.on<AISessionEventPush>("ai-session:event", (msg) => {
      this.handleStreamEvent(msg.event);
    });
  }

  /**
   * Eagerly create an accumulator for a known session id. Optional — the
   * service auto-creates an accumulator on the first observed event for any
   * session id. Useful for tests + explicit lifecycle tracking.
   */
  attach(sessionId: string): void {
    if (this.accumulators.has(sessionId)) return;
    this.accumulators.set(sessionId, new SessionCostAccumulator(sessionId));
  }

  detach(sessionId: string): void {
    this.accumulators.delete(sessionId);
  }

  private handleStreamEvent(ev: AIStreamEvent): void {
    let acc = this.accumulators.get(ev.sessionId);
    if (!acc) {
      acc = new SessionCostAccumulator(ev.sessionId);
      this.accumulators.set(ev.sessionId, acc);
    }
    const out = acc.consume(ev);
    if (out.init) {
      this.bridge.emit({ type: "ai-session:init", payload: out.init });
    }
    if (out.retry) {
      this.bridge.emit({ type: "ai-session:retry", payload: out.retry });
    }
    if (out.pluginInstall) {
      this.bridge.emit({
        type: "ai-session:plugin-install",
        payload: out.pluginInstall,
      });
    }
    if (out.costUpdate) {
      this.bridge.emit({
        type: "ai-session:cost-update",
        payload: out.costUpdate,
      });
      const snap = acc.snapshot();
      this.updateUsage(ev.sessionId, {
        totalInputTokens: snap.tokenUsage.inputTokens,
        totalOutputTokens: snap.tokenUsage.outputTokens,
        totalCostUsd: snap.costUsd,
        retryCount: snap.retryCount,
      });
    }
  }
}
