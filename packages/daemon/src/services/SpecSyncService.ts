import type { SpecFolder } from "@magenta/shared/models";
import { DEFAULT_SPEC_SYNC_INTERVAL_MINUTES } from "@magenta/shared/config";

import type { ConfigManager } from "../config/ConfigManager";
import type { IPCBridge } from "../ipc/IPCBridge";
import type { BackgroundJobManager } from "./BackgroundJobManager";
import type { RepoRepository } from "./RepoRepository";
import type { SpecRepository } from "./SpecRepository";
import { SpecReader } from "./SpecReader";

const TAG = "[SpecSync]";

export class SpecSyncService {
  private readonly specReader: SpecReader;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private currentIntervalMs: number | null = null;

  constructor(
    private readonly specRepository: SpecRepository,
    private readonly repoRepository: RepoRepository,
    private readonly bridge: IPCBridge,
    private readonly jobManager: BackgroundJobManager,
    private readonly configManager: ConfigManager | null = null,
  ) {
    this.specReader = new SpecReader();
  }

  start(): void {
    // Don't run immediately — the initial repo scan triggers syncAllRepos()
    // when it completes. Only set up the recurring interval here.
    this.scheduleInterval(this.resolveIntervalMs());
  }

  stop(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      this.currentIntervalMs = null;
    }
  }

  /**
   * Called when config changes so the timer can pick up the new interval
   * without requiring an app restart. No-op if the interval value hasn't
   * actually changed.
   */
  reconfigureFromConfig(): void {
    const nextMs = this.resolveIntervalMs();
    if (this.intervalHandle === null) {
      // Not started yet — nothing to do; start() will pick up the new value.
      return;
    }
    if (nextMs === this.currentIntervalMs) {
      return;
    }
    this.scheduleInterval(nextMs);
  }

  private resolveIntervalMs(): number {
    const minutes =
      this.configManager?.getConfig().specSyncIntervalMinutes ?? DEFAULT_SPEC_SYNC_INTERVAL_MINUTES;
    return minutes * 60 * 1000;
  }

  private scheduleInterval(intervalMs: number): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
    }
    this.intervalHandle = setInterval(() => this.syncAllRepos(), intervalMs);
    this.currentIntervalMs = intervalMs;
    console.log(`${TAG} Scheduled spec sync every ${Math.round(intervalMs / 60000)} minutes`);
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

      this.bridge.emit({ type: "spec:sync:complete" as const, repoPath, success: true });
    } catch (error) {
      console.error(`${TAG} Failed to sync specs for ${repoPath}:`, error);
      const message = error instanceof Error ? error.message : String(error);
      this.bridge.emit({ type: "spec:sync:complete" as const, repoPath, success: false, error: message });
    }
  }

  getSpecsFromDb(repoPath: string): SpecFolder[] {
    return this.specRepository.getByRepoPath(repoPath);
  }
}
