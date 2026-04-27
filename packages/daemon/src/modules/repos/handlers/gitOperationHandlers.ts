import type { IPCBridge } from "../../../core/ipc/IPCBridge";
import type { GitApplicationService } from "../app/GitApplicationService";
import type { GitRepoWatcher } from "../infra/GitRepoWatcher";
import { safeHandle } from "../../../core/ipc/createHandler";

type GitOperationHandlerContext = {
  bridge: IPCBridge;
  gitService: GitApplicationService;
  gitRepoWatcher: GitRepoWatcher;
};

export function registerGitOperationHandlers({ bridge, gitService, gitRepoWatcher }: GitOperationHandlerContext): void {
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

  safeHandle(bridge, "git:status", async (msg) => {
    // Lazily register the `.git/` watcher so the renderer stops having to
    // poll for file-status updates once it has hit this endpoint once.
    gitRepoWatcher.ensureWatching(msg.repoPath);
    const result = await gitService.status(msg.repoPath);
    return {
      type: "git:status:result",
      repoPath: msg.repoPath,
      files: result.files,
      branch: result.branch,
      ahead: result.ahead,
      behind: result.behind,
      hasUpstream: result.hasUpstream,
    };
  });

  safeHandle(bridge, "git:commit", async (msg) => {
    const result = await gitService.commit(msg.repoPath, msg.message, msg.files, msg.push);
    // Refresh repo state after commit — ahead/behind count and branch tip both change.
    bridge.emit({ type: "repo:force-reload:started", repoPath: msg.repoPath });
    return {
      type: "git:commit:result",
      repoPath: msg.repoPath,
      commitSha: result.commitSha,
      pushed: result.pushed,
      message: result.message,
    };
  });

  safeHandle(bridge, "git:reset", async (msg) => {
    const result = await gitService.reset(msg.repoPath, msg.mode, msg.ref, msg.confirmHard);
    bridge.emit({ type: "repo:force-reload:started", repoPath: msg.repoPath });
    return {
      type: "git:reset:result",
      repoPath: msg.repoPath,
      success: result.success,
      message: result.message,
    };
  });

  safeHandle(bridge, "git:revert", async (msg) => {
    const result = await gitService.revert(msg.repoPath, msg.sha, msg.noCommit);
    bridge.emit({ type: "repo:force-reload:started", repoPath: msg.repoPath });
    return {
      type: "git:revert:result",
      repoPath: msg.repoPath,
      success: result.success,
      message: result.message,
    };
  });

  safeHandle(bridge, "git:blame", async (msg) => {
    const lines = await gitService.blame(msg.repoPath, msg.path, msg.ref);
    return {
      type: "git:blame:result",
      repoPath: msg.repoPath,
      path: msg.path,
      lines,
    };
  });
}
