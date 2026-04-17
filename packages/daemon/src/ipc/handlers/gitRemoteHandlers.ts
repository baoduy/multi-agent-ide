import type { IPCBridge } from "../IPCBridge";
import type { GitRemoteApplicationService } from "../../application/GitRemoteApplicationService";
import { safeHandle } from "../createHandler";

type Context = {
  bridge: IPCBridge;
  remoteService: GitRemoteApplicationService;
};

export function registerGitRemoteHandlers({ bridge, remoteService }: Context): void {
  safeHandle(bridge, "remote:list", async (msg) => {
    const remotes = await remoteService.list(msg.repoPath);
    return { type: "remote:list:result", repoPath: msg.repoPath, remotes };
  });

  safeHandle(bridge, "remote:add", async (msg) => {
    const res = await remoteService.add(msg.repoPath, msg.name, msg.url);
    return { type: "remote:add:result", repoPath: msg.repoPath, ...res };
  });

  safeHandle(bridge, "remote:rename", async (msg) => {
    const res = await remoteService.rename(msg.repoPath, msg.oldName, msg.newName);
    return { type: "remote:rename:result", repoPath: msg.repoPath, ...res };
  });

  safeHandle(bridge, "remote:remove", async (msg) => {
    const res = await remoteService.remove(msg.repoPath, msg.name);
    return { type: "remote:remove:result", repoPath: msg.repoPath, ...res };
  });

  safeHandle(bridge, "remote:set-url", async (msg) => {
    const res = await remoteService.setUrl(msg.repoPath, msg.name, msg.url);
    return { type: "remote:set-url:result", repoPath: msg.repoPath, ...res };
  });

  safeHandle(bridge, "branch:delete", async (msg) => {
    const res = await remoteService.deleteBranch(msg.repoPath, msg.branch, msg.force);
    return { type: "branch:delete:result", repoPath: msg.repoPath, branch: msg.branch, success: res.success };
  });

  safeHandle(bridge, "branch:rename", async (msg) => {
    const res = await remoteService.renameBranch(msg.repoPath, msg.oldName, msg.newName);
    return {
      type: "branch:rename:result",
      repoPath: msg.repoPath,
      oldName: msg.oldName,
      newName: msg.newName,
      success: res.success,
    };
  });
}
