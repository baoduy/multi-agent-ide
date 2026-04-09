import type { IPCBridge } from "../ipc/IPCBridge";

import type { RepoRepository } from "./RepoRepository";
import type { RepoScanCandidate } from "./RepoScanner";
import { RepoScanner } from "./RepoScanner";

export type RepoScanSummary = {
  repos: RepoScanCandidate[];
  added: number;
  updated: number;
  missing: number;
};

export class ScanQueue {
  private running = false;
  private pending = false;

  constructor(
    private readonly scanner: RepoScanner,
    private readonly repoRepository: RepoRepository,
    private readonly bridge: IPCBridge
  ) {}

  async requestScan(roots: string[]): Promise<void> {
    if (this.running) {
      this.pending = true;
      return;
    }

    await this.runScan(roots);

    if (this.pending) {
      this.pending = false;
      await this.runScan(roots);
    }
  }

  private async runScan(roots: string[]): Promise<void> {
    this.running = true;
    this.bridge.emit({ type: "repo:scan:started" });

    try {
      const scanTimestamp = Date.now();
      const { results } = await this.scanner.scan(roots, (progress) => {
        this.bridge.emit({
          type: "repo:scan:progress",
          scanned: progress.scanned,
          total: progress.total,
          currentDir: progress.currentDir,
        });
      });

      const seenPaths = new Set<string>();
      let added = 0;
      let updated = 0;

      for (const candidate of results) {
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

      this.bridge.emit({
        type: "repo:scan:complete",
        repos,
        added,
        updated,
        missing,
      });
    } finally {
      this.running = false;
    }
  }
}
