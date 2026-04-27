import { randomUUID } from "node:crypto";
import { AppError } from "../../../core/errors/AppError";

type PermissionScope = "once" | "session" | "always";

type PendingEntry = {
  sessionId: string;
  resolve: (r: { allow: boolean; scope?: PermissionScope }) => void;
  reject: (e: unknown) => void;
  timer: NodeJS.Timeout;
};

/**
 * Minimal event-emitter shape for the permission-request push event.
 * The IPCBridge implements this via its `emit` method; we model it here
 * as a tagged-payload sink so tests can stub without pulling in EventEmitter.
 */
export interface PermissionEventBus {
  emit(payload: {
    type: "ai-session:permission-request";
    sessionId: string;
    requestId: string;
    tool: string;
    scope: string;
  }): void;
}

/**
 * Owns the request → response correlation table for Claude permission
 * prompts. The MCP server (PermissionPromptMcpServer) calls
 * `requestApproval` whenever Claude invokes the `approve` tool; the
 * renderer answers via the `ai-session:permission-response` IPC, which
 * routes back through `resolveResponse`.
 */
export class PermissionPromptCoordinator {
  private readonly pending = new Map<string, PendingEntry>();
  private readonly timeoutMs: number;

  constructor(
    private readonly bus: PermissionEventBus,
    opts: { timeoutMs?: number } = {},
  ) {
    this.timeoutMs = opts.timeoutMs ?? 60_000;
  }

  requestApproval(args: {
    sessionId: string;
    tool: string;
    scope: string;
  }): Promise<{ allow: boolean; scope?: PermissionScope; requestId: string }> {
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(
          new AppError(
            "PERMISSION_PROMPT_TIMEOUT",
            `Permission prompt for tool '${args.tool}' timed out`,
          ),
        );
      }, this.timeoutMs);
      this.pending.set(requestId, {
        sessionId: args.sessionId,
        resolve: (r) => resolve({ ...r, requestId }),
        reject,
        timer,
      });
      this.bus.emit({
        type: "ai-session:permission-request",
        sessionId: args.sessionId,
        requestId,
        tool: args.tool,
        scope: args.scope,
      });
    });
  }

  resolveResponse(r: {
    sessionId: string;
    requestId: string;
    allow: boolean;
    scope?: PermissionScope;
  }): void {
    const entry = this.pending.get(r.requestId);
    if (!entry || entry.sessionId !== r.sessionId) return;
    clearTimeout(entry.timer);
    this.pending.delete(r.requestId);
    entry.resolve({ allow: r.allow, scope: r.scope });
  }

  cancelSession(sessionId: string): void {
    for (const [reqId, entry] of this.pending) {
      if (entry.sessionId !== sessionId) continue;
      clearTimeout(entry.timer);
      entry.reject(
        new AppError(
          "PERMISSION_PROMPT_TIMEOUT",
          `Session ${sessionId} closed before permission was answered`,
        ),
      );
      this.pending.delete(reqId);
    }
  }
}
