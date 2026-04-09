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
   * Returns all specs found in the specs/ folder of a repository.
   */
  bridge.handle("spec:list", async (payload) => {
    // Extract repoPath from the payload
    const repoPath = (payload as Record<string, unknown>).repoPath as string;

    try {
      const specs = specReader.listSpecs(repoPath);

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
}
