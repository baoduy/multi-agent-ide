import type { IPCBridge } from "../IPCBridge";
import type { ConfigApplicationService } from "../../application/ConfigApplicationService";
import { safeHandle } from "../createHandler";

type ConfigHandlerContext = {
  bridge: IPCBridge;
  configService: ConfigApplicationService;
};

export function registerConfigHandlers({ bridge, configService }: ConfigHandlerContext): void {
  safeHandle(bridge, "config:get", async () => {
    const config = configService.getConfig();
    return { type: "config:response", config };
  });

  safeHandle(bridge, "config:add-working-dir", async (msg) => {
    const config = configService.addWorkingDir(msg.path);

    bridge.emit({ type: "config:updated", config });

    return { type: "config:response", config };
  });

  safeHandle(bridge, "config:remove-working-dir", async (msg) => {
    const config = configService.removeWorkingDir(msg.path);

    bridge.emit({ type: "config:updated", config });

    return { type: "config:response", config };
  });

  safeHandle(bridge, "config:update", async (msg) => {
    const config = configService.updateConfig(msg.config as Record<string, unknown>);

    bridge.emit({ type: "config:updated", config });

    return { type: "config:response", config };
  });
}
