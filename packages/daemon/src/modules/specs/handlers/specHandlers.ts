import type { IPCBridge } from "../../../core/ipc/IPCBridge";
import type { SpecApplicationService } from "../app/SpecApplicationService";
import { safeHandle } from "../../../core/ipc/createHandler";

type SpecHandlerContext = {
  bridge: IPCBridge;
  specService: SpecApplicationService;
};

export function registerSpecHandlers({ bridge, specService }: SpecHandlerContext): void {
  safeHandle(bridge, "spec:list", async (msg) => {
    const specs = specService.listSpecs(msg.repoPath);
    return {
      type: "spec:list:result",
      repoPath: msg.repoPath,
      specs,
    };
  });

}
