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

  bridge.handle("branch:list", async (msg) => {
    console.log(`[repo-handler] branch:list → ${msg.repoPath}`);
    const { branches, current } = await scanner.listBranches(msg.repoPath);
    return {
      type: "branch:list:result",
      repoPath: msg.repoPath,
      branches,
      current,
    };
  });

  bridge.handle("branch:checkout", async (msg) => {
    console.log(`[repo-handler] branch:checkout → ${msg.repoPath} → ${msg.branch}`);
    const success = await scanner.checkoutBranch(msg.repoPath, msg.branch);

    // Update the branch in the database if checkout succeeded
    if (success) {
      const existing = repository.findByPath(msg.repoPath);
      if (existing) {
        repository.upsert({ ...existing, branch: msg.branch, scannedAt: Date.now() });
        repository.flush();
      }
    }

    return {
      type: "branch:checkout:result",
      repoPath: msg.repoPath,
      branch: msg.branch,
      success,
    };
  });
}
