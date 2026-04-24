import type { IPCBridge } from "../IPCBridge";
import type { GitCloneApplicationService } from "../../application/GitCloneApplicationService";
import { safeHandle } from "../createHandler";

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
