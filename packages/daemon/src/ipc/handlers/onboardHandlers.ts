import type { IPCBridge } from "../IPCBridge";
import type { OnboardApplicationService } from "../../application/OnboardApplicationService";
import { safeHandle } from "../createHandler";

type OnboardHandlerContext = {
  bridge: IPCBridge;
  onboardService: OnboardApplicationService;
};

/**
 * Guard against unhandled rejections on fire-and-forget onboard flows.
 *
 * Onboard handlers return immediately with a `*:started` event and stream
 * progress via bridge events. If the work promise rejects *before* any
 * completion event has a chance to fire (e.g. `createOnboardWorktree()`
 * throws synchronously on an invalid path), the rejection would otherwise
 * be swallowed and the UI would wait forever for a completion event.
 *
 * We attach a catch here so that pre-spawn failures are surfaced as a
 * `repo:onboard:complete` (or similarly shaped) event with `success:false`.
 */
function emitFailure(
  bridge: IPCBridge,
  type: "repo:onboard:complete",
  repoPath: string,
  error: unknown,
): void {
  const message = error instanceof Error ? error.message : String(error);
  bridge.emit({ type, repoPath, success: false, error: message });
}

export function registerOnboardHandlers({ bridge, onboardService }: OnboardHandlerContext): void {
  safeHandle(bridge, "repo:onboard", async (msg) => {
    // Fire-and-forget: the process streams output via bridge events
    onboardService
      .onboard(msg.repoPath, msg.aiAgent, msg.useWorktree)
      .catch((err) => emitFailure(bridge, "repo:onboard:complete", msg.repoPath, err));
    return { type: "repo:onboard:started", repoPath: msg.repoPath };
  });

  safeHandle(bridge, "repo:onboard:cancel", async (msg) => {
    onboardService.cancel(msg.repoPath);
    return { type: "repo:onboard:cancelled", repoPath: msg.repoPath };
  });

  safeHandle(bridge, "repo:specify-switch", async (msg) => {
    // Fire-and-forget: streams output via repo:onboard:output/complete events
    onboardService
      .switchIntegration(msg.repoPath, msg.aiAgent)
      .catch((err) => emitFailure(bridge, "repo:onboard:complete", msg.repoPath, err));
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
