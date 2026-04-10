import type { IPCBridge } from "../IPCBridge";
import type { OnboardApplicationService } from "../../application/OnboardApplicationService";
import { safeHandle } from "../createHandler";

type OnboardHandlerContext = {
  bridge: IPCBridge;
  onboardService: OnboardApplicationService;
};

export function registerOnboardHandlers({ bridge, onboardService }: OnboardHandlerContext): void {
  safeHandle(bridge, "repo:onboard", async (msg) => {
    // Fire-and-forget: the process streams output via bridge events
    void onboardService.onboard(msg.repoPath, msg.aiAgent, msg.useWorktree);
    return { type: "repo:onboard:started", repoPath: msg.repoPath };
  });

  safeHandle(bridge, "repo:upgrade-specify", async (msg) => {
    // Fire-and-forget: the process streams output via bridge events
    void onboardService.upgrade(msg.repoPath);
    return { type: "repo:upgrade-specify:started", repoPath: msg.repoPath };
  });

  safeHandle(bridge, "repo:onboard:cancel", async (msg) => {
    onboardService.cancel(msg.repoPath);
    return { type: "repo:onboard:cancelled", repoPath: msg.repoPath };
  });
}
