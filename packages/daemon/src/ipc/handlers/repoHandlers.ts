import type { ConfigManager } from "../../config/ConfigManager";
import type { IPCBridge } from "../IPCBridge";

import { RepoRepository } from "../../services/RepoRepository";
import { RepoScanner } from "../../services/RepoScanner";
import { ScanQueue } from "../../services/ScanQueue";
import type { DatabaseService } from "../../db/DatabaseService";

type RepoHandlerContext = {
  bridge: IPCBridge;
  databaseService: DatabaseService;
  configManager: ConfigManager;
};

export function registerRepoHandlers({ bridge, databaseService, configManager }: RepoHandlerContext): void {
  const repository = new RepoRepository(databaseService);
  const scanner = new RepoScanner(3);
  const queue = new ScanQueue(scanner, repository, bridge);

  bridge.handle("repo:list", async () => {
    const repos = repository.listAll();
    console.log(`[repo-handler] repo:list → returning ${repos.length} repos`);
    return {
      type: "repo:list:result",
      repos,
    };
  });

  bridge.handle("repo:scan", async () => {
    const config = configManager.getConfig();
    console.log(`[repo-handler] repo:scan → scanning ${config.workingDirs.length} dirs:`, config.workingDirs);
    void queue.requestScan(config.workingDirs).catch((err) => {
      console.error("[repo-handler] Scan failed:", err);
    });

    return {
      type: "repo:scan:started",
    };
  });
}
