import type { IPCBridge } from "../../../core/ipc/IPCBridge";
import type { AiBareRunApplicationService } from "../app/AiBareRunApplicationService";
import { safeHandle } from "../../../core/ipc/createHandler";

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
