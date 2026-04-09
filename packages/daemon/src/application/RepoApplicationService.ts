import type { ConfigManager } from "../config/ConfigManager";
import type { RepoRepository } from "../services/RepoRepository";
import type { ScanQueue } from "../services/ScanQueue";
import type { SpecSyncService } from "../services/SpecSyncService";
import { RepoScanner } from "../services/RepoScanner";

/**
 * RepoApplicationService orchestrates repository operations.
 * Receives injected dependencies and provides business logic for repo management.
 */
export class RepoApplicationService {
  private scanner: RepoScanner;

  constructor(
    private repoRepository: RepoRepository,
    private configManager: ConfigManager,
    private scanQueue: ScanQueue,
    private specSyncService: SpecSyncService,
  ) {
    this.scanner = new RepoScanner(3);
  }

  listRepos() {
    const repos = this.repoRepository.listAll();
    console.log(`[repo-service] repo:list → returning ${repos.length} repos`);
    return repos;
  }

  async triggerScan(): Promise<void> {
    const config = this.configManager.getConfig();
    console.log(`[repo-service] repo:scan → scanning ${config.workingDirs.length} dirs:`, config.workingDirs);
    void this.scanQueue.requestScan(config.workingDirs).catch((err) => {
      console.error("[repo-service] Scan failed:", err);
    });
  }

  async listBranches(repoPath: string) {
    console.log(`[repo-service] branch:list → ${repoPath}`);
    return await this.scanner.listBranches(repoPath);
  }

  async checkoutBranch(repoPath: string, branch: string): Promise<boolean> {
    console.log(`[repo-service] branch:checkout → ${repoPath} → ${branch}`);
    const success = await this.scanner.checkoutBranch(repoPath, branch);

    if (success) {
      const existing = this.repoRepository.findByPath(repoPath);
      if (existing) {
        this.repoRepository.upsert({ ...existing, branch, scannedAt: Date.now() });
        this.repoRepository.flush();
      }

      // Trigger a spec re-sync for this repo since the working tree changed
      void this.specSyncService.syncRepo(repoPath);
    }

    return success;
  }
}
