import path from "node:path";
import { randomUUID } from "node:crypto";

import { AppError } from "../errors/AppError";
import { requireNonEmpty } from "../errors/validation";
import type { ConfigManager } from "../config/ConfigManager";
import type { ScanQueue } from "../services/ScanQueue";
import type { IPCBridge } from "../ipc/IPCBridge";
import type { GitCloneGateway } from "../infrastructure/GitCloneGateway";
import type { FileSystemGateway } from "../infrastructure/FileSystemGateway";

type StartCloneArgs = {
  url: string;
  targetDir: string;
  folderName: string;
  depth?: number;
  cloneId?: string;
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
    private readonly fileSystemGateway: FileSystemGateway,
  ) {}

  /**
   * Lists configured working dirs plus their direct non-git subfolders.
   * Per-root errors are swallowed so the user can still clone into a root
   * whose children are unreadable/missing.
   */
  listCloneDestinations(): { root: string; children: string[] }[] {
    const { workingDirs } = this.configManager.getConfig();
    const results: { root: string; children: string[] }[] = [];
    for (const root of workingDirs) {
      const resolvedRoot = path.resolve(root);
      try {
        const children = this.fileSystemGateway.listDirectNonGitChildren(resolvedRoot);
        results.push({ root: resolvedRoot, children });
      } catch {
        results.push({ root: resolvedRoot, children: [] });
      }
    }
    return results;
  }

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

    // Parent directory must be either a configured working dir OR a direct,
    // non-git subfolder of one. Grandchildren and repos are rejected so the
    // scan allowlist stays stable.
    const config = this.configManager.getConfig();
    const workingDirs = config.workingDirs.map((wd) => path.resolve(wd));
    const isWorkingDir = workingDirs.includes(normalizedParent);
    const isDirectNonGitChild =
      workingDirs.some((wd) => path.dirname(normalizedParent) === wd) &&
      !this.fileSystemGateway.pathExists(path.join(normalizedParent, ".git"));

    if (!isWorkingDir && !isDirectNonGitChild) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Clone target must be a configured working directory or a direct non-git subfolder. Got: ${normalizedParent}`,
      );
    }

    const cloneId = args.cloneId ?? randomUUID();
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

      // Repo is on disk → emit complete immediately so the UI releases.
      // The scan is a cache refresh and must not gate this event.
      this.bridge.emit({
        type: "git:clone:complete",
        cloneId,
        repoPath: targetPath,
        success: true,
      });

      const { workingDirs } = this.configManager.getConfig();
      void this.scanQueue.requestScan(workingDirs).catch(() => {
        // Scan errors are non-fatal — clone already succeeded on disk.
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
