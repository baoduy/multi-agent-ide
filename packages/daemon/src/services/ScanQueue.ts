import type { IPCBridge } from "../ipc/IPCBridge";
import type { BackgroundJobManager } from "./BackgroundJobManager";

import type { RepoRepository } from "./RepoRepository";
import type { RepoScanCandidate } from "./RepoScanner";
import type { SpecSyncService } from "./SpecSyncService";
import { RepoScanner } from "./RepoScanner";

export type RepoScanSummary = {
  repos: RepoScanCandidate[];
  added: number;
  updated: number;
  missing: number;
};

const JOB_NAME = "repo-scan";

/**
 * ScanQueue delegates scanning work to the central BackgroundJobManager.
 *
 * Calling `requestScan()` enqueues a single "repo-scan" job.
 * If a scan is already queued or running, the duplicate is silently ignored
 * by the job manager — no `pending` flag needed.
 */
export class ScanQueue {
  private specSyncService: SpecSyncService | null = null;

  constructor(
    private readonly scanner: RepoScanner,
    private readonly repoRepository: RepoRepository,
    private readonly bridge: IPCBridge,
    private readonly jobManager: BackgroundJobManager,
  ) {}

  /**
   * Set the SpecSyncService reference (avoids circular dependency at construction time).
   */
  setSpecSyncService(service: SpecSyncService): void {
    this.specSyncService = service;
  }

  async requestScan(roots: string[]): Promise<void> {
    this.jobManager.enqueue(JOB_NAME, () => this.runScan(roots));
  }

  /**
   * Force-reload a single repo: re-scan it and update its record.
   * Enqueued as a named background job for deduplication and notification.
   */
  requestSingleRepoReload(repoPath: string): void {
    const jobName = `Reload: ${repoPath.split("/").pop() ?? repoPath}`;
    this.jobManager.enqueue(jobName, () => this.runSingleRepoReload(repoPath));
  }

  private async runSingleRepoReload(repoPath: string): Promise<void> {
    console.log(`[scan-queue] Refresh single repo: ${repoPath}`);

    const scanTimestamp = Date.now();
    const { results } = await this.scanner.scan([repoPath], () => {});

    if (results.length > 0) {
      for (const candidate of results) {
        this.repoRepository.upsert({
          name: candidate.name,
          path: candidate.path,
          branch: candidate.branch,
          hasSpecs: candidate.hasSpecs,
          specCount: candidate.specCount,
          status: "active",
          scannedAt: scanTimestamp,
        });
      }
    } else {
      // Repo not found at path — mark as missing
      const existing = this.repoRepository.findByPath(repoPath);
      if (existing) {
        this.repoRepository.upsert({ ...existing, status: "missing", scannedAt: scanTimestamp });
      }
    }

    this.repoRepository.flush();

    // Emit updated repo list so the UI refreshes
    const repos = this.repoRepository.listAll();
    this.bridge.emit({ type: "repo:scan:complete", repos, added: 0, updated: results.length, missing: results.length === 0 ? 1 : 0 });

    // Sync specs after the repo record is updated
    if (this.specSyncService) {
      await this.specSyncService.syncRepo(repoPath);
    }
  }

  private async runScan(roots: string[]): Promise<void> {
    console.log(`[scan-queue] Starting scan for roots:`, roots);
    this.bridge.emit({ type: "repo:scan:started" });

    try {
      const scanTimestamp = Date.now();
      const { results, scanned } = await this.scanner.scan(roots, (progress) => {
        this.bridge.emit({
          type: "repo:scan:progress",
          scanned: progress.scanned,
          total: progress.total,
          currentDir: progress.currentDir,
        });
      });

      console.log(`[scan-queue] Scan complete: found ${results.length} repos in ${scanned} directories`);

      const seenPaths = new Set<string>();
      const newlyAddedPaths: string[] = [];
      let added = 0;
      let updated = 0;

      for (const candidate of results) {
        console.log(`[scan-queue] Found repo: ${candidate.name} at ${candidate.path} (branch: ${candidate.branch})`);
        const existing = this.repoRepository.findByPath(candidate.path);
        if (existing) {
          updated += 1;
        } else {
          added += 1;
          newlyAddedPaths.push(candidate.path);
        }

        this.repoRepository.upsert({
          name: candidate.name,
          path: candidate.path,
          branch: candidate.branch,
          hasSpecs: candidate.hasSpecs,
          specCount: candidate.specCount,
          status: "active",
          scannedAt: scanTimestamp,
        });

        seenPaths.add(candidate.path);
      }

      const missing = this.repoRepository.markMissingAbsentPaths(seenPaths, scanTimestamp);
      const repos = this.repoRepository.listAll();

      // Persist to disk (sql.js is in-memory, needs explicit save)
      this.repoRepository.flush();

      console.log(`[scan-queue] Emitting repo:scan:complete with ${repos.length} repos (added=${added}, updated=${updated}, missing=${missing})`);

      this.bridge.emit({
        type: "repo:scan:complete",
        repos,
        added,
        updated,
        missing,
      });

      // Trigger a spec sync as a separate background job so the repo-scan
      // job completes quickly and doesn't block the IPC event loop.
      // The job manager will run "spec-sync-all" next in the FIFO queue.
      if (this.specSyncService) {
        this.specSyncService.syncAllRepos();
      }
    } catch (error) {
      console.error("[scan-queue] Scan failed:", error);
      throw error;
    }
  }
}
