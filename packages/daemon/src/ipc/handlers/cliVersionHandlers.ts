import type { IPCBridge } from "../IPCBridge";
import type { CliVersionApplicationService } from "../../application/CliVersionApplicationService";
import { safeHandle } from "../createHandler";

type CliVersionHandlerContext = {
  bridge: IPCBridge;
  cliVersionService: CliVersionApplicationService;
};

export function registerCliVersionHandlers({
  bridge,
  cliVersionService,
}: CliVersionHandlerContext): void {
  safeHandle(bridge, "cli:get-version-status", async () => {
    const tools = cliVersionService.getStatus();
    return { type: "cli:get-version-status:result", tools };
  });

  safeHandle(bridge, "cli:recheck", async (msg) => {
    // Fire-and-forget — the refresh pushes a `cli:version-status-changed`
    // event when it completes, which is how the UI stays in sync.
    cliVersionService.refresh(msg.repoPath).catch((err) => {
      console.warn("[cli-version] manual recheck failed:", err);
    });
    return { type: "cli:recheck:started" };
  });

  safeHandle(bridge, "cli:upgrade", async (msg) => {
    cliVersionService.startUpgrade(msg.tool);
    return { type: "cli:upgrade:started", tool: msg.tool };
  });

  safeHandle(bridge, "cli:upgrade:cancel", async (msg) => {
    cliVersionService.cancelUpgrade(msg.tool);
    return { type: "cli:upgrade:cancel:ack", tool: msg.tool };
  });
}
