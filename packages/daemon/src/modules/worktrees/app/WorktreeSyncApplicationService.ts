import { DEFAULT_WORKTREE_SYNC_INTERVAL_MINUTES } from "@magenta/shared/config";
import type { IPCBridge } from "../../../core/ipc/IPCBridge";
import type { BackgroundJobManager } from "../../jobs/BackgroundJobManager";
import type { RepoRepository } from "../../repos/persistence/RepoRepository";
import type { GitGateway } from "../../repos/infra/GitGateway";
import type { WorktreeRepository } from "../persistence/WorktreeRepository";
import type { WorktreeRecord } from "../mappers/worktreeMapper";

const TAG = "[WorktreeSync]";
const JOB_NAME = "worktree-sync";

/**
 * Periodically scans `git worktree list --porcelain` for every active repo
 * and mirrors the result into the `worktrees` table, so the renderer can
 * read worktree state from the DB instead of shelling out on every view
 * mount.
 *
 * Unlike the AI session sync, this service is NOT gated on any UI-tab flag:
 * pinned-repo worktrees surface in the dock/sidebar as well as the
 * Worktrees view, so we always keep the cache fresh while the daemon runs.
 */
export class WorktreeSyncApplicationService {
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly repository: WorktreeRepository,
    private readonly gitGateway: GitGateway,
    private readonly repoRepository: RepoRepository,
    private readonly bridge: IPCBridge,
    private readonly jobManager: BackgroundJobManager,
  ) {}

  /**
   * Start the recurring sweep and kick an immediate sync so the DB is
   * populated by the time the renderer reads from it at boot.
   */
  start(): void {
    const intervalMs = DEFAULT_WORKTREE_SYNC_INTERVAL_MINUTES * 60 * 1000;
    this.scheduleInterval(intervalMs);
    this.triggerSync();
  }

  stop(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /**
   * Enqueue a one-shot sync job. Deduplicated by name — if a sync is already
   * running or queued, this call is a no-op.
   *
   * When `repoPath` is provided, the sweep is scoped to that repo only.
   * Other repos' rows in the DB are left untouched. Used by the manual
   * "sync this view" button, which should never refresh repos the user
   * isn't looking at.
   */
  triggerSync(repoPath?: string): void {
    if (repoPath) {
      const jobName = `${JOB_NAME}:${repoPath}`;
      this.jobManager.enqueue(jobName, async () => {
        await this.executeSyncForRepo(repoPath);
      });
      return;
    }
    this.jobManager.enqueue(JOB_NAME, async () => {
      await this.executeSyncAll();
    });
  }

  /**
   * Read-side helper. Used by both `worktree:list` (DB-backed) and callers
   * that want an immediate synchronous snapshot of what's currently cached.
   */
  listWorktrees(repoPath?: string): WorktreeRecord[] {
    if (repoPath) {
      return this.repository.listByRepo(repoPath);
    }
    return this.repository.list();
  }

  private scheduleInterval(intervalMs: number): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
    }
    this.intervalHandle = setInterval(() => this.triggerSync(), intervalMs);
    console.log(`${TAG} Scheduled worktree sync every ${Math.round(intervalMs / 1000)}s`);
  }

  private async executeSyncAll(): Promise<void> {
    const startTime = Date.now();

    const activeRepos = this.repoRepository
      .listAll()
      .filter((r) => r.status === "active");

    if (activeRepos.length === 0) {
      this.bridge.emit({
        type: "worktree:sync:complete",
        upsertedCount: 0,
        deletedCount: 0,
      });
      return;
    }

    const now = Date.now();
    const scannedRepoPaths: string[] = [];
    const seenPaths: string[] = [];
    let upsertedCount = 0;

    for (const repo of activeRepos) {
      try {
        const entries = await this.gitGateway.listWorktrees(repo.path);
        scannedRepoPaths.push(repo.path);

        for (const entry of entries) {
          this.repository.upsert({
            repoPath: entry.repoPath,
            worktreePath: entry.worktreePath,
            branch: entry.branch,
            name: entry.name,
            createdAt: entry.createdAt,
            lastSyncedAt: now,
          });
          seenPaths.push(entry.worktreePath);
          upsertedCount++;
        }
      } catch (err) {
        // Per-repo failures (missing directory, stale NFS mount, corrupt
        // .git) must not abort the sweep. Log and move on; this repo's
        // rows are left untouched because we didn't add it to
        // scannedRepoPaths.
        console.error(`${TAG} listWorktrees failed for ${repo.path}:`, err);
      }
    }

    const deletedCount = this.repository.deleteStale(scannedRepoPaths, seenPaths);

    this.repository.flush();

    const elapsed = Date.now() - startTime;
    if (upsertedCount > 0 || deletedCount > 0) {
      console.log(
        `${TAG} Sync complete in ${elapsed}ms — upserted: ${upsertedCount}, deleted: ${deletedCount}`,
      );
    }

    this.bridge.emit({
      type: "worktree:sync:complete",
      upsertedCount,
      deletedCount,
    });
  }

  /**
   * Sync just one repo's worktrees. Rows for other repos are not touched.
   */
  private async executeSyncForRepo(repoPath: string): Promise<void> {
    const now = Date.now();
    let upsertedCount = 0;
    let entries: Awaited<ReturnType<GitGateway["listWorktrees"]>> = [];

    try {
      entries = await this.gitGateway.listWorktrees(repoPath);
    } catch (err) {
      console.error(`${TAG} scoped listWorktrees failed for ${repoPath}:`, err);
      // Emit so the UI can clear its spinner even on failure.
      this.bridge.emit({
        type: "worktree:sync:complete",
        upsertedCount: 0,
        deletedCount: 0,
      });
      return;
    }

    for (const entry of entries) {
      this.repository.upsert({
        repoPath: entry.repoPath,
        worktreePath: entry.worktreePath,
        branch: entry.branch,
        name: entry.name,
        createdAt: entry.createdAt,
        lastSyncedAt: now,
      });
      upsertedCount++;
    }

    const seenPaths = entries.map((e) => e.worktreePath);
    const deletedCount = this.repository.deleteStale([repoPath], seenPaths);

    this.repository.flush();

    this.bridge.emit({
      type: "worktree:sync:complete",
      upsertedCount,
      deletedCount,
    });
  }
}
