import type { IPCBridge } from "../IPCBridge";
import type { GitHistoryApplicationService } from "../../application/GitHistoryApplicationService";
import { safeHandle } from "../createHandler";

type GitHistoryHandlerContext = {
  bridge: IPCBridge;
  historyService: GitHistoryApplicationService;
};

export function registerGitHistoryHandlers({ bridge, historyService }: GitHistoryHandlerContext): void {
  safeHandle(bridge, "git:log", async (msg) => {
    const result = await historyService.log(msg.repoPath, {
      branch: msg.branch,
      path: msg.path,
      limit: msg.limit,
      skip: msg.skip,
      search: msg.search,
    });
    return {
      type: "git:log:result",
      repoPath: msg.repoPath,
      commits: result.commits,
      hasMore: result.hasMore,
    };
  });

  safeHandle(bridge, "git:commit-detail", async (msg) => {
    const result = await historyService.commitDetail(msg.repoPath, msg.sha);
    return {
      type: "git:commit-detail:result",
      repoPath: msg.repoPath,
      commit: result.commit,
      files: result.files,
    };
  });

  safeHandle(bridge, "git:diff", async (msg) => {
    const result = await historyService.diff(msg.repoPath, {
      fromRef: msg.fromRef,
      toRef: msg.toRef,
      path: msg.path,
    });
    return {
      type: "git:diff:result",
      repoPath: msg.repoPath,
      oldContent: result.oldContent,
      newContent: result.newContent,
      oldPath: result.oldPath,
      newPath: result.newPath,
      isBinary: result.isBinary,
    };
  });
}
