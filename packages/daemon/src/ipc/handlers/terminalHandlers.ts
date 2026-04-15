import type { IPCBridge } from "../IPCBridge";
import type { TerminalApplicationService } from "../../application/TerminalApplicationService";
import { safeHandle } from "../createHandler";
import { ulid } from "ulid";
import { buildAllowlist, resolveAndAssert, type PathAllowlistProvider } from "../../domain/pathGuard";

type TerminalHandlerContext = {
  bridge: IPCBridge;
  terminalService: TerminalApplicationService;
  /**
   * Source of the filesystem allowlist. `terminal:spawn` accepts a cwd from
   * the renderer; without containment any renderer code could spawn a shell
   * inside `/etc` or anywhere else on disk.
   */
  allowlistProvider: PathAllowlistProvider;
};

export function registerTerminalHandlers({ bridge, terminalService, allowlistProvider }: TerminalHandlerContext): void {
  safeHandle(bridge, "terminal:spawn", async (msg) => {
    const sessionId = ulid();
    const cwd = resolveAndAssert(msg.cwd, buildAllowlist(allowlistProvider));
    terminalService.spawn(sessionId, cwd, msg.cols, msg.rows);
    return { type: "terminal:spawned", sessionId };
  });

  safeHandle(bridge, "terminal:input", async (msg) => {
    terminalService.write(msg.sessionId, msg.data);
    return { type: "terminal:input:ack" };
  });

  safeHandle(bridge, "terminal:resize", async (msg) => {
    terminalService.resize(msg.sessionId, msg.cols, msg.rows);
    return { type: "terminal:resize:ack" };
  });

  safeHandle(bridge, "terminal:close", async (msg) => {
    terminalService.close(msg.sessionId);
    return { type: "terminal:close:ack" };
  });

  safeHandle(bridge, "terminal:attach", async (msg) => {
    const result = terminalService.attach(msg.sessionId, msg.fromSeq);
    if (!result) {
      return {
        type: "terminal:attach:result",
        sessionId: msg.sessionId,
        chunks: [],
        snapshot: false,
        headSeq: 0,
        alive: false,
      };
    }
    return {
      type: "terminal:attach:result",
      sessionId: msg.sessionId,
      chunks: result.chunks,
      snapshot: result.snapshot,
      headSeq: result.headSeq,
      alive: result.alive,
    };
  });

  safeHandle(bridge, "terminal:ack", async (msg) => {
    terminalService.ack(msg.sessionId, msg.seq);
    return { type: "terminal:ack:ack" };
  });
}
