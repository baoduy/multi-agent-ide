import type { SyncedSessionRecord, SyncedSessionProvider } from "@magenta/shared/syncedSession";
import type { IPCBridge } from "../ipc/IPCBridge";
import type { BackgroundJobManager } from "../services/BackgroundJobManager";
import type { SyncedSessionRepository } from "../services/SyncedSessionRepository";
import type { SessionSyncGateway, SessionFileEntry } from "../infrastructure/SessionSyncGateway";
import type { RepoRepository } from "../services/RepoRepository";
import type { ConfigManager } from "../config/ConfigManager";
import type { GitGateway } from "../infrastructure/GitGateway";
import { parseClaudeSessionLines } from "../domain/claudeSessionParser";
import { isSessionPathRelevant, collectKnownPaths } from "../domain/sessionPathMatcher";

const TAG = "[SessionSync]";
const JOB_NAME = "session-sync";

/**
 * Orchestrates background scanning of Claude Code session files from disk,
 * parsing JSONL, and upserting summaries into the DB.
 *
 * Only syncs sessions whose working directory belongs to a registered
 * repository, working directory, or worktree in the application.
 *
 * Runs automatically on app startup via BackgroundJobManager.
 */
export class SessionSyncApplicationService {
  constructor(
    private readonly repository: SyncedSessionRepository,
    private readonly gateway: SessionSyncGateway,
    private readonly bridge: IPCBridge,
    private readonly jobManager: BackgroundJobManager,
    private readonly repoRepository: RepoRepository,
    private readonly configManager: ConfigManager,
    private readonly gitGateway: GitGateway,
  ) {}

  /**
   * Triggers a one-time session sync job.
   * Called at app startup and can be triggered manually via IPC.
   * Uses BackgroundJobManager for deduplication.
   */
  triggerSync(): void {
    this.jobManager.enqueue(JOB_NAME, async () => {
      await this.executeSyncAll();
    });
  }

  /**
   * List all synced sessions, optionally filtered by provider.
   */
  listSessions(provider?: SyncedSessionProvider): SyncedSessionRecord[] {
    if (provider) {
      return this.repository.listByProvider(provider);
    }
    return this.repository.list();
  }

  /**
   * Main sync orchestration. Collects known application paths,
   * scans Claude Code sessions, filters by path relevance,
   * and cleans up stale entries.
   */
  private async executeSyncAll(): Promise<void> {
    console.log(`${TAG} Starting session sync...`);
    const startTime = Date.now();

    // Collect all known paths from repos, working dirs, and worktrees
    const knownPaths = this.collectApplicationPaths();
    console.log(`${TAG} Known application paths: ${knownPaths.length}`);

    if (knownPaths.length === 0) {
      console.log(`${TAG} No registered repos or working dirs — skipping sync`);
      this.bridge.emit({
        type: "synced-session:sync:complete",
        claudeCount: 0,
        copilotCount: 0,
      });
      return;
    }

    let claudeCount = 0;

    try {
      claudeCount = await this.syncClaudeSessions(knownPaths);
    } catch (err) {
      console.error(`${TAG} Claude sync failed:`, err);
    }

    // Clean up stale sessions whose cwd no longer matches any known path
    try {
      const removed = this.cleanupStaleSessions(knownPaths);
      if (removed > 0) {
        console.log(`${TAG} Removed ${removed} stale synced sessions`);
      }
    } catch (err) {
      console.error(`${TAG} Stale session cleanup failed:`, err);
    }

    this.repository.flush();

    const elapsed = Date.now() - startTime;
    console.log(`${TAG} Sync complete in ${elapsed}ms — Claude: ${claudeCount}`);

    // Push event to UI
    this.bridge.emit({
      type: "synced-session:sync:complete",
      claudeCount,
      copilotCount: 0,
    });
  }

  /**
   * Collects all known filesystem paths from the application:
   * - Registered repository paths
   * - Configured working directories
   * - Active git worktree paths for each repo
   */
  private collectApplicationPaths(): string[] {
    const repos = this.repoRepository.listAll();
    const repoPaths = repos
      .filter((r) => r.status === "active")
      .map((r) => r.path);

    const config = this.configManager.getConfig();
    const workingDirs = config.workingDirs;

    // Collect worktree paths for each active repo
    const worktreePaths: string[] = [];
    for (const repoPath of repoPaths) {
      try {
        const worktrees = this.gitGateway.listWorktrees(repoPath);
        for (const wt of worktrees) {
          worktreePaths.push(wt.worktreePath);
        }
      } catch {
        // Repo may not be accessible — skip its worktrees
      }
    }

    return collectKnownPaths(repoPaths, workingDirs, worktreePaths);
  }

  /**
   * Scans and syncs Claude Code session files.
   * Only upserts sessions whose cwd matches a known application path.
   * Returns the total number of relevant sessions found.
   */
  private async syncClaudeSessions(knownPaths: string[]): Promise<number> {
    const projectsDir = this.gateway.getClaudeProjectsDir();
    const fileEntries = this.gateway.listClaudeSessionFiles(projectsDir);

    console.log(`${TAG} Found ${fileEntries.length} Claude session files`);

    let synced = 0;
    let skipped = 0;

    for (const entry of fileEntries) {
      try {
        const changed = this.hasFileChanged(entry);
        if (!changed) {
          // File unchanged — check if already in DB (it's relevant if it was synced before)
          const existing = this.repository.getFileSync(entry.filePath);
          if (existing) {
            synced++;
          }
          continue;
        }

        const wasRelevant = await this.syncClaudeSessionIfRelevant(entry, knownPaths);
        if (wasRelevant) {
          synced++;
        } else {
          skipped++;
        }
      } catch (err) {
        console.error(`${TAG} Failed to sync Claude session ${entry.sessionId}:`, err);
      }
    }

    if (skipped > 0) {
      console.log(`${TAG} Skipped ${skipped} Claude sessions (not matching any registered path)`);
    }

    return synced;
  }

  /**
   * Parse a single Claude Code session file and upsert only if its cwd
   * matches a known application path. Returns true if the session was relevant.
   */
  private async syncClaudeSessionIfRelevant(
    entry: SessionFileEntry,
    knownPaths: string[],
  ): Promise<boolean> {
    const lines = await this.gateway.readJsonlLines(entry.filePath);
    const metadata = parseClaudeSessionLines(lines);

    // Filter: only sync sessions belonging to registered repos/worktrees
    if (!isSessionPathRelevant(metadata.cwd, knownPaths)) {
      return false;
    }

    const now = Date.now();

    this.repository.upsert({
      id: `claude-code:${metadata.sessionId || entry.sessionId}`,
      provider: "claude-code",
      sessionId: metadata.sessionId || entry.sessionId,
      projectDir: entry.projectDir,
      cwd: metadata.cwd,
      gitBranch: metadata.gitBranch,
      model: metadata.model,
      tokenUsage: metadata.tokenUsage,
      messageCount: metadata.messageCount,
      subagentCount: entry.subagentCount,
      status: metadata.status,
      slug: metadata.slug,
      version: metadata.version,
      entrypoint: metadata.entrypoint,
      title: metadata.title,
      startedAt: metadata.startTimestamp ?? now,
      endedAt: metadata.endTimestamp,
      createdAt: metadata.startTimestamp ?? now,
      syncedFilePath: entry.filePath,
      syncedFileMtime: entry.mtime,
      syncedFileSize: entry.size,
      lastSyncedAt: now,
    });

    return true;
  }

  /**
   * Removes synced sessions whose cwd no longer matches any known application path.
   * This handles the case where a repo is unregistered or a working dir is removed.
   * Returns the number of deleted sessions.
   */
  private cleanupStaleSessions(knownPaths: string[]): number {
    return this.repository.deleteWhereNotMatchingPaths(knownPaths);
  }

  /**
   * Checks whether a file has changed since last sync by comparing
   * mtime and size against what's in the database.
   */
  private hasFileChanged(entry: SessionFileEntry): boolean {
    const existing = this.repository.getFileSync(entry.filePath);
    if (!existing) return true;

    return existing.mtime !== entry.mtime || existing.size !== entry.size;
  }
}
