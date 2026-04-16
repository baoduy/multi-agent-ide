import type { IPCBridge } from "../IPCBridge";
import type { SpecApplicationService } from "../../application/SpecApplicationService";
import type { SpecGitGateway } from "../../infrastructure/SpecGitGateway";
import { safeHandle } from "../createHandler";

/**
 * Read-only git metadata handlers — things the renderer needs to display
 * alongside specs (committer identity, file contents at a ref) but that are
 * not themselves spec business logic.
 *
 * These used to live in specHandlers.ts but were co-located only because
 * `SpecApplicationService` happened to own a `SpecGitGateway`. Keeping them
 * there made the spec handler module a grab bag of unrelated read paths,
 * which violated single-responsibility and made it harder to find the git
 * endpoints.
 */
type GitMetadataHandlerContext = {
  bridge: IPCBridge;
  specService: SpecApplicationService;
  specGitGateway: SpecGitGateway;
};

export function registerGitMetadataHandlers({ bridge, specService, specGitGateway }: GitMetadataHandlerContext): void {
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

  safeHandle(bridge, "git:ls-files", async (msg) => {
    const files = await specGitGateway.listFilesByPattern(msg.repoPath, msg.pattern, msg.ref);
    return { type: "git:ls-files:result", repoPath: msg.repoPath, files };
  });
}
