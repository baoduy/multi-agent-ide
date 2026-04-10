import type { SpecFolder } from "@magenta/shared/models";

import type { IPCBridge } from "../ipc/IPCBridge";
import type { BackgroundJobManager } from "./BackgroundJobManager";
import type { RepoRepository } from "./RepoRepository";
import type { SpecRepository } from "./SpecRepository";
import { SpecReader } from "./SpecReader";

const SYNC_INTERVAL_MS = 5 * 60 * 1000;
const TAG = "[SpecSync]";

export class SpecSyncService {
  private readonly specReader: SpecReader;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly specRepository: SpecRepository,
    private readonly repoRepository: RepoRepository,
    private readonly bridge: IPCBridge,
    private readonly jobManager: BackgroundJobManager,
  ) {
    this.specReader = new SpecReader();
  }

  start(): void {
    this.syncAllRepos();
    this.intervalHandle = setInterval(() => this.syncAllRepos(), SYNC_INTERVAL_MS);
    console.log(`${TAG} Scheduled spec sync every 5 minutes`);
  }

  stop(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  syncAllRepos(): void {
    this.jobManager.enqueue("spec-sync-all", () => this.executeSyncAll());
  }

  private async executeSyncAll(): Promise<void> {
    const activeRepos = this.repoRepository.listAll().filter((r) => r.status === "active");
    console.log(`${TAG} Syncing specs for ${activeRepos.length} active repos`);

    for (const repo of activeRepos) {
      await this.syncRepo(repo.path);
    }

    console.log(`${TAG} Completed sync for all repos`);
  }

  async syncRepo(repoPath: string): Promise<void> {
    this.bridge.emit({ type: "spec:sync:started" as const, repoPath });

    try {
      const freshSpecs = await this.specReader.listAllBranchSpecs(repoPath);
      const result = this.specRepository.syncSpecs(repoPath, freshSpecs);

      console.log(
        `${TAG} Synced ${repoPath}: inserted=${result.inserted}, updated=${result.updated}, deleted=${result.deleted}`,
      );

      this.bridge.emit({ type: "spec:sync:complete" as const, repoPath });
    } catch (error) {
      console.error(`${TAG} Failed to sync specs for ${repoPath}:`, error);
      this.bridge.emit({ type: "spec:sync:complete" as const, repoPath });
    }
  }

  getSpecsFromDb(repoPath: string): SpecFolder[] {
    return this.specRepository.getByRepoPath(repoPath);
  }
}
