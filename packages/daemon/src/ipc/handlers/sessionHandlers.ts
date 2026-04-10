import type { IPCBridge } from "../IPCBridge";
import type { SessionApplicationService } from "../../application/SessionApplicationService";
import { safeHandle } from "../createHandler";

type SessionHandlerContext = {
  bridge: IPCBridge;
  sessionService: SessionApplicationService;
};

export function registerSessionHandlers({ bridge, sessionService }: SessionHandlerContext): void {
  /**
   * Handles "session:get" requests.
   * Returns the current session state from the database.
   */
  safeHandle(bridge, "session:get", async () => {
    const state = sessionService.getSessionState();
    return {
      type: "session:response",
      state,
    };
  });

  /**
   * Handles "session:update" requests.
   * Queues a session state update with debouncing.
   */
  safeHandle(bridge, "session:update", async (msg) => {
    sessionService.updateSessionState(msg.state);
    return {
      type: "session:updated",
    };
  });
}
