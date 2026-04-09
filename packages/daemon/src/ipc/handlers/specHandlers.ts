import type { ConfigManager } from "../../config/ConfigManager";
import type { IPCBridge } from "../IPCBridge";

import { SpecReader } from "../../services/SpecReader";

type SpecHandlerContext = {
  bridge: IPCBridge;
  configManager: ConfigManager;
};

export function registerSpecHandlers({ bridge }: SpecHandlerContext): void {
  const specReader = new SpecReader();

  /**
   * Handles "spec:list" requests.
   * Returns specs from ALL local branches (current branch via filesystem,
   * other branches via git). De-duplicates by spec name so current-branch
   * specs take priority.
   */
  bridge.handle("spec:list", async (payload) => {
    const repoPath = (payload as Record<string, unknown>).repoPath as string;

    try {
      const specs = await specReader.listAllBranchSpecs(repoPath);

      return {
        type: "spec:list:result" as const,
        repoPath,
        specs,
      };
    } catch (error) {
      console.error(`Failed to list specs for repo ${repoPath}:`, error);

      return {
        type: "error" as const,
        message: `Failed to list specs: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });

  /**
   * Handles "gitfile:read" requests.
   * Reads a file from a non-current branch via `git show`.
   */
  bridge.handle("gitfile:read", async (payload) => {
    const { repoPath, ref, relativePath } = payload as Record<string, string>;

    try {
      const content = specReader.readGitFile(repoPath, ref, relativePath);

      if (content === null) {
        return {
          type: "error" as const,
          message: `File not found: ${ref}:${relativePath}`,
        };
      }

      return {
        type: "gitfile:read:result" as const,
        filePath: `gitref://${ref}/${relativePath}`,
        content,
      };
    } catch (error) {
      return {
        type: "error" as const,
        message: `Failed to read git file: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });
}
