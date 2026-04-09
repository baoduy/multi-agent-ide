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

  bridge.handle("repo:list", async () => ({
    type: "repo:list:result",
    repos: repository.listAll(),
  }));

  bridge.handle("repo:scan", async () => {
    const config = configManager.getConfig();
    void queue.requestScan(config.workingDirs);

    return {
      type: "repo:scan:started",
    };
  });
}
