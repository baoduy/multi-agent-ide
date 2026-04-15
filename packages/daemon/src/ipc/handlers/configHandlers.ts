import type { IPCBridge } from "../IPCBridge";
import type { ConfigManager } from "../../config/ConfigManager";
import { safeHandle } from "../createHandler";

type ConfigHandlerContext = {
  bridge: IPCBridge;
  configManager: ConfigManager;
};

export function registerConfigHandlers({ bridge, configManager }: ConfigHandlerContext): void {
  safeHandle(bridge, "config:get", async () => {
    const config = configManager.getConfig();
    return { type: "config:response", config };
  });

  safeHandle(bridge, "config:add-working-dir", async (msg) => {
    const config = configManager.addWorkingDir(msg.path);

    bridge.emit({ type: "config:updated", config });

    return { type: "config:response", config };
  });

  safeHandle(bridge, "config:remove-working-dir", async (msg) => {
    const config = configManager.removeWorkingDir(msg.path);

    bridge.emit({ type: "config:updated", config });

    return { type: "config:response", config };
  });

  safeHandle(bridge, "config:update", async (msg) => {
    const config = configManager.updateConfig(msg.config);

    bridge.emit({ type: "config:updated", config });

    return { type: "config:response", config };
  });
}
