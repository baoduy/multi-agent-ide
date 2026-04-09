import type { IPCBridge } from "../IPCBridge";
import type { SpecApplicationService } from "../../application/SpecApplicationService";
import { safeHandle } from "../createHandler";
import { AppError } from "../../errors/AppError";

type SpecHandlerContext = {
  bridge: IPCBridge;
  specService: SpecApplicationService;
};

export function registerSpecHandlers({ bridge, specService }: SpecHandlerContext): void {
  /**
   * Handles "spec:list" requests.
   *
   * Returns specs directly from the database — no cache logic.
   * The SpecSyncService keeps the DB up-to-date via background jobs.
   */
  safeHandle(bridge, "spec:list", async (msg) => {
    const specs = specService.listSpecs(msg.repoPath);
    return {
      type: "spec:list:result",
      repoPath: msg.repoPath,
      specs,
    };
  });

  /**
   * Handles "gitfile:read" requests.
   * Reads a file from a non-current branch via `git show`.
   */
  safeHandle(bridge, "gitfile:read", async (msg) => {
    const content = specService.readGitFile(msg.repoPath, msg.ref, msg.relativePath);

    if (content === null) {
      throw new AppError("FILE_NOT_FOUND", `File not found: ${msg.ref}:${msg.relativePath}`);
    }

    return {
      type: "gitfile:read:result",
      filePath: `gitref://${msg.ref}/${msg.relativePath}`,
      content,
    };
  });
}
