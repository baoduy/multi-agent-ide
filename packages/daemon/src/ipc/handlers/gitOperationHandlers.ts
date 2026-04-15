import type { IPCBridge } from "../IPCBridge";
import type { GitApplicationService } from "../../application/GitApplicationService";
import { safeHandle } from "../createHandler";

type GitOperationHandlerContext = {
  bridge: IPCBridge;
  gitService: GitApplicationService;
};

export function registerGitOperationHandlers({ bridge, gitService }: GitOperationHandlerContext): void {
  safeHandle(bridge, "branch:create", async (msg) => {
    const result = await gitService.createBranch(msg.repoPath, msg.branchName, msg.startPoint);
    return { type: "branch:create:result", repoPath: msg.repoPath, branchName: msg.branchName, success: result.success };
  });

  safeHandle(bridge, "git:fetch", async (msg) => {
    const result = await gitService.fetch(msg.repoPath, msg.remote);
    return { type: "git:fetch:result", repoPath: msg.repoPath, ...result };
  });

  safeHandle(bridge, "git:pull", async (msg) => {
    const result = await gitService.pull(msg.repoPath, msg.remote, msg.branch);
    // Refresh repo state after pull (branch may have moved, specs may have changed)
    bridge.emit({ type: "repo:force-reload:started", repoPath: msg.repoPath });
    return { type: "git:pull:result", repoPath: msg.repoPath, ...result };
  });

  safeHandle(bridge, "git:push", async (msg) => {
    const result = await gitService.push(msg.repoPath, msg.remote, msg.branch, msg.force);
    return { type: "git:push:result", repoPath: msg.repoPath, ...result };
  });
}
