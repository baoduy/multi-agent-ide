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

  safeHandle(bridge, "repo:specify-switch", async (msg) => {
    // Fire-and-forget: streams output via repo:onboard:output/complete events
    void onboardService.switchIntegration(msg.repoPath, msg.aiAgent);
    return { type: "repo:specify-switch:started", repoPath: msg.repoPath };
  });

  safeHandle(bridge, "repo:specify-status", async (msg) => {
    const status = onboardService.getSpecifyStatus(msg.repoPath);
    return {
      type: "repo:specify-status:result",
      repoPath: msg.repoPath,
      ...status,
    };
  });
}
