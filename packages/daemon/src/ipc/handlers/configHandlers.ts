import type { IPCBridge } from "../IPCBridge";
import type { ConfigManager } from "../../config/ConfigManager";

type ConfigHandlerContext = {
  bridge: IPCBridge;
  configManager: ConfigManager;
};

export function registerConfigHandlers({ bridge, configManager }: ConfigHandlerContext): void {
  /**
   * Handles "config:get" requests.
   * Returns the current configuration.
   */
  bridge.handle("config:get", async () => {
    try {
      const config = configManager.getConfig();

      return {
        type: "config:response" as const,
        config,
      };
    } catch (error) {
      console.error("Failed to get config:", error);

      return {
        type: "error" as const,
        message: `Failed to get config: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });

  /**
   * Handles "config:add-working-dir" requests.
   * Adds a working directory and triggers a scan.
   */
  bridge.handle("config:add-working-dir", async (payload) => {
    try {
      const path = (payload as Record<string, unknown>).path as string | undefined;

      if (!path) {
        return {
          type: "error" as const,
          message: "Missing path in config:add-working-dir request",
        };
      }

      const config = configManager.addWorkingDir(path);

  // Emit config update event to all listeners
  bridge.emit({
        type: "config:updated" as const,
        config,
      });

      return {
        type: "config:response" as const,
        config,
      };
    } catch (error) {
      console.error("Failed to add working directory:", error);

      return {
        type: "error" as const,
        message: `Failed to add working directory: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });

  /**
   * Handles "config:remove-working-dir" requests.
   * Removes a working directory.
   */
  bridge.handle("config:remove-working-dir", async (payload) => {
    try {
      const path = (payload as Record<string, unknown>).path as string | undefined;

      if (!path) {
        return {
          type: "error" as const,
          message: "Missing path in config:remove-working-dir request",
        };
      }

      const config = configManager.removeWorkingDir(path);

  // Emit config update event to all listeners
  bridge.emit({
        type: "config:updated" as const,
        config,
      });

      return {
        type: "config:response" as const,
        config,
      };
    } catch (error) {
      console.error("Failed to remove working directory:", error);

      return {
        type: "error" as const,
        message: `Failed to remove working directory: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });
}
