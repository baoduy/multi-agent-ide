import type { IPCBridge } from "../IPCBridge";
import type { DebugLogService } from "../../application/DebugLogService";
import { safeHandle } from "../createHandler";

/**
 * Phase 7 — open / close adapters for the per-session debug-log tail.
 * The renderer mounts these on the "Debug log" tab; the daemon streams new
 * bytes via `ai-session:debug-log` push events.
 */
export function registerDebugLogHandlers(
  bridge: IPCBridge,
  service: DebugLogService,
): void {
  safeHandle(bridge, "ai-session:debug-log:open", async (req) => {
    const { filePath, seq } = service.open(req.sessionId, (msg) => {
      bridge.emit(msg);
    });
    return { type: "ai-session:debug-log:open:result", filePath, seq };
  });

  safeHandle(bridge, "ai-session:debug-log:close", async (req) => {
    service.close(req.sessionId);
    return { type: "ai-session:debug-log:close:result", ok: true };
  });
}
