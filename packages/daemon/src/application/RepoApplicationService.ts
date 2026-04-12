import type { ConfigManager } from "../config/ConfigManager";
import type { RepoRepository } from "../services/RepoRepository";
import type { ScanQueue } from "../services/ScanQueue";
import type { SpecSyncService } from "../services/SpecSyncService";
import type { RepoScanner } from "../services/RepoScanner";

/**
 * RepoApplicationService orchestrates repository operations.
 * Receives injected dependencies and provides business logic for repo management.
 */
export class RepoApplicationService {
  constructor(
    private readonly repoRepository: RepoRepository,
    private readonly configManager: ConfigManager,
    private readonly scanQueue: ScanQueue,
    private readonly specSyncService: SpecSyncService,
    private readonly scanner: RepoScanner,
  ) {}

  listRepos() {
    return this.repoRepository.listAll();
  }

  async triggerScan(): Promise<void> {
    const config = this.configManager.getConfig();
    void this.scanQueue.requestScan(config.workingDirs).catch((err) => {
      console.error("[repo-service] Scan failed:", err);
    });
  }

  /**
   * Force-reload a single repo: re-scan it, refresh its spec info.
   * Runs as a background job so the UI is notified via the notification bell.
   */
  forceReload(repoPath: string): void {
    this.scanQueue.requestSingleRepoReload(repoPath);
  }

  async listBranches(repoPath: string) {
    return await this.scanner.listBranches(repoPath);
  }

  async checkoutBranch(repoPath: string, branch: string): Promise<boolean> {
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
