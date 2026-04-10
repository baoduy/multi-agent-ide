import type { IPCBridge } from "../IPCBridge";
import type { RepoApplicationService } from "../../application/RepoApplicationService";
import { safeHandle } from "../createHandler";

type RepoHandlerContext = {
  bridge: IPCBridge;
  repoService: RepoApplicationService;
};

export function registerRepoHandlers({ bridge, repoService }: RepoHandlerContext): void {
  safeHandle(bridge, "repo:list", async () => {
    const repos = repoService.listRepos();
    return { type: "repo:list:result", repos };
  });

  safeHandle(bridge, "repo:scan", async () => {
    void repoService.triggerScan();
    return { type: "repo:scan:started" };
  });

  safeHandle(bridge, "branch:list", async (msg) => {
    const { branches, current } = await repoService.listBranches(msg.repoPath);
    return { type: "branch:list:result", repoPath: msg.repoPath, branches, current };
  });

  safeHandle(bridge, "branch:checkout", async (msg) => {
    const success = await repoService.checkoutBranch(msg.repoPath, msg.branch);
    return { type: "branch:checkout:result", repoPath: msg.repoPath, branch: msg.branch, success };
  });

  safeHandle(bridge, "repo:force-reload", async (msg) => {
    repoService.forceReload(msg.repoPath);
    return { type: "repo:force-reload:started", repoPath: msg.repoPath };
  });
}
