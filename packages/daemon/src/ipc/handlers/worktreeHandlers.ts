import type { IPCBridge } from "../IPCBridge";
import type { WorktreeApplicationService } from "../../application/WorktreeApplicationService";
import { safeHandle } from "../createHandler";

type WorktreeHandlerContext = {
  bridge: IPCBridge;
  worktreeService: WorktreeApplicationService;
};

export function registerWorktreeHandlers({ bridge, worktreeService }: WorktreeHandlerContext): void {
  safeHandle(bridge, "worktree:list", async (msg) => {
    const worktrees = worktreeService.listWorktrees(msg.repoPath);
    return {
      type: "worktree:list:result",
      worktrees,
    };
  });

  safeHandle(bridge, "worktree:create", async (msg) => {
    const { worktreePath } = worktreeService.createWorktree(msg.repoPath, msg.branch, msg.name);

    // Emit an event so the UI can refresh its worktree list
    bridge.emit({
      type: "worktree:list:result",
      worktrees: [], // signal to the UI to refetch
    });

    return {
      type: "worktree:create:result",
      repoPath: msg.repoPath,
      worktreePath,
      branch: msg.branch,
      success: true,
    };
  });
}
