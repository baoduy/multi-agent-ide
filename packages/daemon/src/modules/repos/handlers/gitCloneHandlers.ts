import type { IPCBridge } from "../../../core/ipc/IPCBridge";
import type { GitCloneApplicationService } from "../app/GitCloneApplicationService";
import { safeHandle } from "../../../core/ipc/createHandler";

type GitCloneHandlerContext = {
  bridge: IPCBridge;
  cloneService: GitCloneApplicationService;
};

export function registerGitCloneHandlers({ bridge, cloneService }: GitCloneHandlerContext): void {
  safeHandle(bridge, "git:clone", async (msg) => {
    const result = await cloneService.startClone({
      url: msg.url,
      targetDir: msg.targetDir,
      folderName: msg.folderName,
      depth: msg.depth,
      cloneId: msg.cloneId,
    });
    return {
      type: "git:clone:started",
      cloneId: result.cloneId,
      targetPath: result.targetPath,
    };
  });

  safeHandle(bridge, "git:list-clone-destinations", async () => {
    const roots = cloneService.listCloneDestinations();
    return { type: "git:clone-destinations", roots };
  });
}
