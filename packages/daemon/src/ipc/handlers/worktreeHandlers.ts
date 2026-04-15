import type { IPCBridge } from "../IPCBridge";
import type { WorktreeApplicationService } from "../../application/WorktreeApplicationService";
import { safeHandle } from "../createHandler";

type WorktreeHandlerContext = {
  bridge: IPCBridge;
  worktreeService: WorktreeApplicationService;
};

export function registerWorktreeHandlers({ bridge, worktreeService }: WorktreeHandlerContext): void {
  safeHandle(bridge, "worktree:list", async (msg) => {
    const worktrees = await worktreeService.listWorktrees(msg.repoPath);
    return {
      type: "worktree:list:result",
      worktrees,
    };
  });

  safeHandle(bridge, "worktree:create", async (msg) => {
    const { worktreePath } = await worktreeService.createWorktree(msg.repoPath, msg.branch, msg.name);

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

  safeHandle(bridge, "worktree:status", async (msg) => {
    const { files, ahead, behind } = await worktreeService.getWorktreeStatus(msg.repoPath, msg.worktreePath);
    return {
      type: "worktree:status:result" as const,
      worktreePath: msg.worktreePath,
      files,
      ahead,
      behind,
    };
  });

  safeHandle(bridge, "worktree:merge", async (msg) => {
    const result = await worktreeService.mergeWorktree(
      msg.repoPath,
      msg.worktreePath,
      msg.worktreeBranch,
      msg.targetBranch,
    );
    return {
      type: "worktree:merge:result" as const,
      success: result.success,
      message: result.message,
    };
  });

  safeHandle(bridge, "worktree:delete", async (msg) => {
    const result = await worktreeService.deleteWorktree(msg.repoPath, msg.worktreePath);

    // Emit refresh signal so the UI can update worktree list
    bridge.emit({
      type: "worktree:list:result",
      worktrees: [],
    });

    return {
      type: "worktree:delete:result" as const,
      success: result.success,
      message: result.message,
    };
  });

  safeHandle(bridge, "worktree:branches", async (msg) => {
    const { branches, current } = await worktreeService.listLocalBranches(msg.repoPath);
    return {
      type: "worktree:branches:result" as const,
      repoPath: msg.repoPath,
      branches,
      current,
    };
  });
}
