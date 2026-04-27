import type { IPCBridge } from "../../../core/ipc/IPCBridge";
import type { AIRunOnceApplicationService } from "../app/AIRunOnceApplicationService";
import { safeHandle } from "../../../core/ipc/createHandler";

type AIRunOnceHandlerContext = {
  bridge: IPCBridge;
  runOnceService: AIRunOnceApplicationService;
};

export function registerAIRunOnceHandlers({
  bridge,
  runOnceService,
}: AIRunOnceHandlerContext): void {
  safeHandle(bridge, "ai:run-once", async (msg) => {
    const result = await runOnceService.runOnce({
      provider: msg.provider,
      repoPath: msg.repoPath,
      worktreePath: msg.worktreePath,
      prompt: msg.prompt,
      spawn: msg.spawn,
      timeoutMs: msg.timeoutMs,
    });
    return {
      type: "ai:run-once:result",
      sessionId: result.sessionId,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      structuredOutput: result.structuredOutput,
      tokenUsage: result.tokenUsage,
      costUsd: result.costUsd,
      retriesSeen: result.retriesSeen,
    };
  });
}
