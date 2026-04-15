import type { IPCBridge } from "../IPCBridge";
import type { SpecApplicationService } from "../../application/SpecApplicationService";
import { safeHandle } from "../createHandler";

type SpecHandlerContext = {
  bridge: IPCBridge;
  specService: SpecApplicationService;
};

export function registerSpecHandlers({ bridge, specService }: SpecHandlerContext): void {
  safeHandle(bridge, "spec:list", async (msg) => {
    const specs = specService.listSpecs(msg.repoPath);
    return {
      type: "spec:list:result",
      repoPath: msg.repoPath,
      specs,
    };
  });

  safeHandle(bridge, "git:user", async (msg) => {
    const { name, email } = await specService.getGitUser(msg.repoPath);
    return { type: "git:user:result", name, email };
  });

  safeHandle(bridge, "gitfile:read", async (msg) => {
    const content = await specService.readGitFileOrThrow(msg.repoPath, msg.ref, msg.relativePath);
    return {
      type: "gitfile:read:result",
      filePath: `gitref://${msg.ref}/${msg.relativePath}`,
      content,
    };
  });
}
