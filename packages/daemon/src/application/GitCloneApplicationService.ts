import path from "node:path";
import { randomUUID } from "node:crypto";

import { AppError } from "../errors/AppError";
import { requireNonEmpty } from "../errors/validation";
import type { ConfigManager } from "../config/ConfigManager";
import type { ScanQueue } from "../services/ScanQueue";
import type { IPCBridge } from "../ipc/IPCBridge";
import type { GitCloneGateway } from "../infrastructure/GitCloneGateway";

type StartCloneArgs = {
  url: string;
  targetDir: string;
  folderName: string;
  depth?: number;
};

type StartCloneResult = {
  cloneId: string;
  targetPath: string;
};

export class GitCloneApplicationService {
  constructor(
    private readonly cloneGateway: GitCloneGateway,
    private readonly configManager: ConfigManager,
    private readonly scanQueue: ScanQueue,
    private readonly bridge: IPCBridge,
  ) {}

  /**
   * Kick off a clone. Returns immediately with a cloneId the caller uses to
   * match subsequent `git:clone:progress` / `git:clone:complete` push events.
   * Progress and completion are streamed via the IPCBridge rather than returned.
   */
  async startClone(args: StartCloneArgs): Promise<StartCloneResult> {
    requireNonEmpty(args.url, "url");
    requireNonEmpty(args.targetDir, "targetDir");
    requireNonEmpty(args.folderName, "folderName");

    const normalizedParent = path.resolve(args.targetDir);

    // Parent directory must be one of the user's allowlisted working dirs —
    // we validate the parent (since the child doesn't exist yet), and the
    // scanner will pick the new repo up without allowlist updates.
    const config = this.configManager.getConfig();
    const isAllowlisted = config.workingDirs.some(
      (wd) => path.resolve(wd) === normalizedParent,
    );
    if (!isAllowlisted) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Clone target must be inside a configured working directory. Got: ${normalizedParent}`,
      );
    }

    const cloneId = randomUUID();
    const targetPath = path.resolve(normalizedParent, args.folderName);

    // Background job — stream progress, then either scan + emit success, or emit failure.
    void this.runClone({ ...args, targetDir: normalizedParent }, cloneId, targetPath);

    return { cloneId, targetPath };
  }

  private async runClone(
    args: StartCloneArgs,
    cloneId: string,
    targetPath: string,
  ): Promise<void> {
    try {
      await this.cloneGateway.clone({
        url: args.url,
        parentDir: args.targetDir,
        folderName: args.folderName,
        depth: args.depth,
        onProgress: (progress) => {
          this.bridge.emit({
            type: "git:clone:progress",
            cloneId,
            phase: progress.phase,
            percent: progress.percent,
            data: progress.data,
          });
        },
      });

      // Repo is on disk — the scanner walks configured working dirs; requesting
      // a scan picks up the new clone without touching the path allowlist.
      try {
        const { workingDirs } = this.configManager.getConfig();
        await this.scanQueue.requestScan(workingDirs);
      } catch {
        // Scan errors shouldn't fail the clone — clone already succeeded on disk.
      }

      this.bridge.emit({
        type: "git:clone:complete",
        cloneId,
        repoPath: targetPath,
        success: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.bridge.emit({
        type: "git:clone:complete",
        cloneId,
        repoPath: targetPath,
        success: false,
        error: message,
      });
    }
  }
}
