import type { IPCBridge } from "../IPCBridge";
import type { SessionManager } from "../../services/SessionManager";

type SessionHandlerContext = {
  bridge: IPCBridge;
  sessionManager: SessionManager;
};

export function registerSessionHandlers({ bridge, sessionManager }: SessionHandlerContext): void {
  /**
   * Handles "session:get" requests.
   * Returns the current session state from the database.
   */
  bridge.handle("session:get", async () => {
    try {
      const state = sessionManager.getSessionState();

      return {
        type: "session:response" as const,
        state,
      };
    } catch (error) {
      console.error("Failed to get session state:", error);

      return {
        type: "error" as const,
        message: `Failed to get session state: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });

  /**
   * Handles "session:update" requests.
   * Queues a session state update with debouncing.
   */
  bridge.handle("session:update", async (payload) => {
    try {
      const state = (payload as Record<string, unknown>).state as Record<string, unknown> | undefined;

      if (!state) {
        return {
          type: "error" as const,
          message: "Missing state in session:update request",
        };
      }

      sessionManager.updateSessionState(state as never);

      return {
        type: "session:updated" as const,
      };
    } catch (error) {
      console.error("Failed to update session state:", error);

      return {
        type: "error" as const,
        message: `Failed to update session state: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });
}
