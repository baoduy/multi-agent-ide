import type { IPCBridge } from "../IPCBridge";
import type { ConfigApplicationService } from "../../application/ConfigApplicationService";
import { safeHandle } from "../createHandler";

type ConfigHandlerContext = {
  bridge: IPCBridge;
  configService: ConfigApplicationService;
};

export function registerConfigHandlers({ bridge, configService }: ConfigHandlerContext): void {
  /**
   * Handles "config:get" requests.
   * Returns the current configuration.
   */
  safeHandle(bridge, "config:get", async () => {
    const config = configService.getConfig();
    return {
      type: "config:response",
      config,
    };
  });

  /**
   * Handles "config:add-working-dir" requests.
   * Adds a working directory and triggers a scan.
   */
  safeHandle(bridge, "config:add-working-dir", async (msg) => {
    console.log("[config-handler] config:add-working-dir → path:", msg.path);
    const config = configService.addWorkingDir(msg.path);
    console.log("[config-handler] Working dirs now:", config.workingDirs);

    // Emit config update event to all listeners
    bridge.emit({
      type: "config:updated",
      config,
    });

    return {
      type: "config:response",
      config,
    };
  });

  /**
   * Handles "config:remove-working-dir" requests.
   * Removes a working directory.
   */
  safeHandle(bridge, "config:remove-working-dir", async (msg) => {
    const config = configService.removeWorkingDir(msg.path);

    // Emit config update event to all listeners
    bridge.emit({
      type: "config:updated",
      config,
    });

    return {
      type: "config:response",
      config,
    };
  });

  /**
   * Handles "config:update" requests.
   * Merges partial config updates (e.g. specifyCommand).
   */
  safeHandle(bridge, "config:update", async (msg) => {
    const config = configService.updateConfig(msg.config as Record<string, unknown>);

    bridge.emit({
      type: "config:updated",
      config,
    });

    return {
      type: "config:response",
      config,
    };
  });
}
