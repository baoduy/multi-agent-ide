import type { IPCBridge } from "../IPCBridge";
import type { GitStashApplicationService } from "../../application/GitStashApplicationService";
import { safeHandle } from "../createHandler";

type Context = {
  bridge: IPCBridge;
  stashService: GitStashApplicationService;
};

export function registerGitStashHandlers({ bridge, stashService }: Context): void {
  safeHandle(bridge, "stash:list", async (msg) => {
    const stashes = await stashService.list(msg.repoPath);
    return { type: "stash:list:result", repoPath: msg.repoPath, stashes };
  });

  safeHandle(bridge, "stash:push", async (msg) => {
    const res = await stashService.push(msg.repoPath, msg.message, msg.includeUntracked);
    return { type: "stash:push:result", repoPath: msg.repoPath, ...res };
  });

  safeHandle(bridge, "stash:pop", async (msg) => {
    const res = await stashService.pop(msg.repoPath, msg.index);
    return { type: "stash:pop:result", repoPath: msg.repoPath, ...res };
  });

  safeHandle(bridge, "stash:apply", async (msg) => {
    const res = await stashService.apply(msg.repoPath, msg.index);
    return { type: "stash:apply:result", repoPath: msg.repoPath, ...res };
  });

  safeHandle(bridge, "stash:drop", async (msg) => {
    const res = await stashService.drop(msg.repoPath, msg.index);
    return { type: "stash:drop:result", repoPath: msg.repoPath, ...res };
  });

  safeHandle(bridge, "stash:show", async (msg) => {
    const res = await stashService.show(msg.repoPath, msg.index);
    return { type: "stash:show:result", repoPath: msg.repoPath, diff: res.diff };
  });
}
