import type { IPCBridge } from "../ipc/IPCBridge";
import type { BackgroundJobManager } from "./BackgroundJobManager";

import type { RepoRepository } from "./RepoRepository";
import type { RepoScanCandidate } from "./RepoScanner";
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
  constructor(
    private readonly scanner: RepoScanner,
    private readonly repoRepository: RepoRepository,
    private readonly bridge: IPCBridge,
    private readonly jobManager: BackgroundJobManager,
  ) {}

  async requestScan(roots: string[]): Promise<void> {
    this.jobManager.enqueue(JOB_NAME, () => this.runScan(roots));
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
      let added = 0;
      let updated = 0;

      for (const candidate of results) {
        console.log(`[scan-queue] Found repo: ${candidate.name} at ${candidate.path} (branch: ${candidate.branch})`);
        const existing = this.repoRepository.findByPath(candidate.path);
        if (existing) {
          updated += 1;
        } else {
          added += 1;
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
    } catch (error) {
      console.error("[scan-queue] Scan failed:", error);
      throw error;
    }
  }
}
