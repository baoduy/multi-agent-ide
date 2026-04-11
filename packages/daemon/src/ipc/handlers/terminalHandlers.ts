import type { IPCBridge } from "../IPCBridge";
import type { TerminalApplicationService } from "../../application/TerminalApplicationService";
import { safeHandle } from "../createHandler";
import { ulid } from "ulid";

type TerminalHandlerContext = {
  bridge: IPCBridge;
  terminalService: TerminalApplicationService;
};

export function registerTerminalHandlers({ bridge, terminalService }: TerminalHandlerContext): void {
  safeHandle(bridge, "terminal:spawn", async (msg) => {
    const sessionId = ulid();
    terminalService.spawn(sessionId, msg.cwd, msg.cols, msg.rows);
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
}
