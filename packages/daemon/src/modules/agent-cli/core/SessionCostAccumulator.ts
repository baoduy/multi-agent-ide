import type {
  CostUpdateEvent,
  PluginInstallEvent,
  RetryEvent,
  SessionInitEvent,
} from "@magenta/shared/aiObservability";
import type { AIStreamEvent, TokenUsage } from "@magenta/shared/aiStreamEvent";

export interface CostSnapshot {
  sessionId: string;
  tokenUsage: TokenUsage;
  costUsd: number;
  retryCount: number;
}

export interface AccumulatorEmit {
  init?: SessionInitEvent;
  retry?: RetryEvent;
  pluginInstall?: PluginInstallEvent;
  costUpdate?: CostUpdateEvent;
}

const ZERO_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
};

/**
 * Pure per-session reducer. No I/O. Given a sequence of `AIStreamEvent`s,
 * tracks rolling usage / cost / retry counters and produces typed push-event
 * payloads on each interesting input. The application layer is responsible
 * for fanning the emits out to the IPC bridge and persisting the final
 * snapshot on `result`.
 *
 * Phase 7 / spec FR-10.1 / FR-10.2 / FR-10.3.
 */
export class SessionCostAccumulator {
  private state: CostSnapshot;

  constructor(sessionId: string) {
    this.state = {
      sessionId,
      tokenUsage: { ...ZERO_USAGE },
      costUsd: 0,
      retryCount: 0,
    };
  }

  snapshot(): CostSnapshot {
    return {
      ...this.state,
      tokenUsage: { ...this.state.tokenUsage },
    };
  }

  consume(ev: AIStreamEvent): AccumulatorEmit {
    switch (ev.kind) {
      case "session-init":
        return {
          init: {
            sessionId: this.state.sessionId,
            model: ev.model,
            tools: ev.tools,
            mcpServers: ev.mcpServers,
            pluginErrors: ev.pluginErrors,
          },
        };
      case "retry": {
        this.state.retryCount += 1;
        return {
          retry: {
            sessionId: this.state.sessionId,
            attempt: ev.attempt,
            max: ev.max,
            delayMs: ev.delayMs,
            category: ev.category,
            status: ev.status,
          },
        };
      }
      case "plugin-install":
        return {
          pluginInstall: {
            sessionId: this.state.sessionId,
            plugin: ev.plugin,
            status: ev.status,
            message: ev.error,
          },
        };
      case "result": {
        if (ev.tokenUsage) this.state.tokenUsage = { ...ev.tokenUsage };
        if (typeof ev.costUsd === "number") this.state.costUsd = ev.costUsd;
        return {
          costUpdate: {
            sessionId: this.state.sessionId,
            tokenUsage: { ...this.state.tokenUsage },
            costUsd: this.state.costUsd,
            retryCount: this.state.retryCount,
          },
        };
      }
      default:
        return {};
    }
  }
}
