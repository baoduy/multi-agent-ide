import type { IPCBridge } from "../IPCBridge";
import type { WorktreeApplicationService } from "../../application/WorktreeApplicationService";
import type { WorktreeSyncApplicationService } from "../../application/WorktreeSyncApplicationService";
import { safeHandle } from "../createHandler";

type WorktreeHandlerContext = {
  bridge: IPCBridge;
  worktreeService: WorktreeApplicationService;
  worktreeSyncService: WorktreeSyncApplicationService;
};

export function registerWorktreeHandlers({
  bridge,
  worktreeService,
  worktreeSyncService,
}: WorktreeHandlerContext): void {
  // Read from the DB cache populated by WorktreeSyncApplicationService.
  // The 1-minute sync keeps this current; `worktree:trigger-sync` or a
  // post-create/delete trigger refreshes it sooner.
  safeHandle(bridge, "worktree:list", async (msg) => {
    const worktrees = worktreeSyncService.listWorktrees(msg.repoPath);
    return {
      type: "worktree:list:result",
      worktrees,
    };
  });

  safeHandle(bridge, "worktree:trigger-sync", async (msg) => {
    worktreeSyncService.triggerSync(msg.repoPath);
    return { type: "worktree:trigger-sync:ack" as const };
  });

  safeHandle(bridge, "worktree:create", async (msg) => {
    const { worktreePath } = await worktreeService.createWorktree(msg.repoPath, msg.branch, msg.name);

    // Kick a fresh sync so the new worktree shows up in the DB and all
    // subscribed renderers (via worktree:sync:complete) pick it up.
    worktreeSyncService.triggerSync();

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

    // Kick a fresh sync so the deleted worktree disappears from the DB
    // without waiting for the next 1-minute tick.
    worktreeSyncService.triggerSync();

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
