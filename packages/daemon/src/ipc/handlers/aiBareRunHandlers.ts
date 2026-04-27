import type { IPCBridge } from "../IPCBridge";
import type { AiBareRunApplicationService } from "../../application/AiBareRunApplicationService";
import { safeHandle } from "../createHandler";

type Ctx = {
  bridge: IPCBridge;
  aiBareRunApplicationService: AiBareRunApplicationService;
};

export function registerAiBareRunHandlers({
  bridge,
  aiBareRunApplicationService,
}: Ctx): void {
  safeHandle(bridge, "ai:run-bare-once", async (msg) => {
    const result = await aiBareRunApplicationService.runBareOnce({
      provider: msg.provider,
      workingDirPath: msg.workingDirPath,
      taskSpecDir: msg.taskSpecDir,
      prompt: msg.prompt,
      spawn: msg.spawn,
      timeoutMs: msg.timeoutMs,
    });
    return {
      type: "ai:run-bare-once:result",
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      argv: result.argv,
      resolution: result.resolution,
    };
  });
}
