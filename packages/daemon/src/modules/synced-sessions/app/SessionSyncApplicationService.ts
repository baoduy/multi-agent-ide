import fs from "node:fs";
import path from "node:path";
import type { SyncedSessionRecord, SyncedSessionProvider } from "@magenta/shared/syncedSession";
import { DEFAULT_SESSION_SYNC_INTERVAL_MINUTES } from "@magenta/shared/config";
import type { IPCBridge } from "../../../core/ipc/IPCBridge";
import type { BackgroundJobManager } from "../../jobs/BackgroundJobManager";
import type { SyncedSessionRepository } from "../persistence/SyncedSessionRepository";
import type {
  SessionSyncGateway,
  SessionFileEntry,
  CopilotSessionFileEntry,
} from "../infra/SessionSyncGateway";
import type { RepoRepository } from "../../repos/persistence/RepoRepository";
import type { ConfigManager } from "../../../core/config/ConfigManager";
import type { GitGateway } from "../../repos/infra/GitGateway";
import { parseClaudeSessionLines } from "../../agent-cli/claude/sessionParser";
import {
  parseWorkspaceYaml,
  parseCopilotEventLines,
} from "../../agent-cli/copilot/sessionParser";
import { isSessionPathRelevant, collectKnownPaths } from "../../agent-cli/core/sessionPathMatcher";
import { AppError } from "../../../core/errors/AppError";

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
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private currentIntervalMs: number | null = null;
  /**
   * Tracks whether the AI title-bar tab is currently the active top-level tab
   * in the renderer. The recurring session sync sweep only runs while this is
   * `true` — switching away from the AI tab pauses the timer. Manual syncs
   * (via the "synced-session:trigger-sync" IPC handler) still work regardless.
   *
   * Starts `false` so the daemon does not sweep until the renderer has
   * explicitly told us the AI tab is active.
   */
  private aiTabActive = false;

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
   *
   * When `repoPath` is provided, the sweep is scoped to that repo (+ its
   * worktrees) only. Other repos' rows are left untouched and stale-session
   * cleanup is skipped — the next full sync (driven by setAITabActive)
   * handles cleanup. Copilot sessions are also skipped in scoped mode
   * because they have no repo filter in the schema.
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
   * Start the recurring session sync interval — but only if the AI tab is
   * currently active. When the AI tab is not active, this is a no-op; the
   * renderer will call {@link setAITabActive} when the tab becomes visible.
   */
  start(): void {
    if (!this.aiTabActive) {
      console.log(`${TAG} start() called but AI tab is not active — deferring interval`);
      return;
    }
    this.scheduleInterval(this.resolveIntervalMs());
  }

  /**
   * Stop the recurring interval. Does not cancel any in-flight job.
   */
  stop(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      this.currentIntervalMs = null;
    }
  }

  /**
   * Called when the user updates the session sync interval from the UI.
   * Reschedules the timer with the new value if it has actually changed.
   * If the interval is currently paused (AI tab not active) this is a no-op —
   * the new value will be picked up next time the interval is (re)started.
   */
  reconfigureFromConfig(): void {
    const nextMs = this.resolveIntervalMs();
    if (this.intervalHandle === null) {
      return;
    }
    if (nextMs === this.currentIntervalMs) {
      return;
    }
    this.scheduleInterval(nextMs);
  }

  /**
   * Called from the renderer whenever the AI title-bar tab becomes the
   * active top-level tab (or stops being). While the AI tab is active we
   * schedule the recurring sweep (every `sessionSyncIntervalMinutes`, default
   * 15m) and trigger an immediate sync so the panel populates right away.
   * While it is inactive we pause the timer.
   *
   * Manual `triggerSync()` calls (e.g. the "Sync now" button) continue to
   * work regardless of tab state.
   */
  setAITabActive(active: boolean): void {
    if (active === this.aiTabActive) {
      return;
    }
    this.aiTabActive = active;
    if (active) {
      console.log(`${TAG} AI tab became active — starting session sync`);
      // Kick off an immediate sync so the UI has fresh data as soon as the
      // user lands on the AI tab, then schedule the recurring sweep.
      this.triggerSync();
      this.scheduleInterval(this.resolveIntervalMs());
    } else {
      console.log(`${TAG} AI tab became inactive — pausing session sync`);
      this.stop();
    }
  }

  private resolveIntervalMs(): number {
    const minutes =
      this.configManager.getConfig().sessionSyncIntervalMinutes ??
      DEFAULT_SESSION_SYNC_INTERVAL_MINUTES;
    return minutes * 60 * 1000;
  }

  private scheduleInterval(intervalMs: number): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
    }
    this.intervalHandle = setInterval(() => this.triggerSync(), intervalMs);
    this.currentIntervalMs = intervalMs;
    console.log(`${TAG} Scheduled session sync every ${Math.round(intervalMs / 60000)} minutes`);
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
   * Mark a synced session as archived. Archived sessions are filtered out of
   * every read path, so they disappear from the UI. The flag is preserved
   * across resync cycles by the repository's `upsert` pre-select.
   *
   * Throws `AppError("NOT_FOUND")` if no row matched the id.
   */
  archiveSession(id: string): void {
    const archived = this.repository.archiveById(id);
    if (!archived) {
      throw new AppError("NOT_FOUND", `Synced session not found: ${id}`);
    }
    this.repository.flush();
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
    const knownPaths = await this.collectApplicationPaths();
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
    let copilotCount = 0;

    try {
      claudeCount = await this.syncClaudeSessions(knownPaths);
    } catch (err) {
      console.error(`${TAG} Claude sync failed:`, err);
    }

    try {
      // Per product decision: every Copilot session that has a workspace.yaml
      // is synced regardless of whether its git_root matches a registered repo.
      copilotCount = await this.syncCopilotSessions();
    } catch (err) {
      console.error(`${TAG} Copilot sync failed:`, err);
    }

    // Clean up stale Claude sessions whose cwd no longer matches any known path.
    // Copilot sessions are NOT subject to this cleanup — they are gated by
    // workspace.yaml presence on disk, not by knownPaths membership.
    try {
      const removed = this.cleanupStaleClaudeSessions(knownPaths);
      if (removed > 0) {
        console.log(`${TAG} Removed ${removed} stale Claude sessions`);
      }
    } catch (err) {
      console.error(`${TAG} Stale session cleanup failed:`, err);
    }

    this.repository.flush();

    const elapsed = Date.now() - startTime;
    console.log(
      `${TAG} Sync complete in ${elapsed}ms — Claude: ${claudeCount}, Copilot: ${copilotCount}`,
    );

    // Push event to UI
    this.bridge.emit({
      type: "synced-session:sync:complete",
      claudeCount,
      copilotCount,
    });
  }

  /**
   * Sync just Claude Code sessions belonging to one repo (+ its worktrees).
   * No cleanup runs — the next full sweep handles stale rows.
   */
  private async executeSyncForRepo(repoPath: string): Promise<void> {
    const worktrees = await this.gitGateway.listWorktrees(repoPath).catch(() => []);
    const worktreePaths = worktrees.map((w) => w.worktreePath);
    const knownPaths = collectKnownPaths([repoPath], [], worktreePaths);

    let claudeCount = 0;
    try {
      claudeCount = await this.syncClaudeSessions(knownPaths);
    } catch (err) {
      console.error(`${TAG} Scoped Claude sync failed for ${repoPath}:`, err);
    }

    this.repository.flush();

    this.bridge.emit({
      type: "synced-session:sync:complete",
      claudeCount,
      copilotCount: 0,
    });
  }

  /**
   * Re-parse a single session file and upsert. Used by SessionFileWatcher
   * to push live activity changes to the UI without doing a full sweep.
   *
   * `absPath` may point at:
   *   - a Claude Code JSONL: `<claudeProjectsDir>/<projectDir>/<sessionId>.jsonl`
   *   - a Copilot events.jsonl: `<copilotStateDir>/<sessionId>/events.jsonl`
   *   - a Copilot workspace.yaml — handled by re-syncing the parent dir's events.jsonl
   *
   * Anything else is ignored (e.g. write events on subagent files we don't track at this level).
   */
  async syncSingleFile(absPath: string): Promise<void> {
    const claudeDir = this.gateway.getClaudeProjectsDir();
    const copilotDir = this.gateway.getCopilotSessionStateDir();

    try {
      if (absPath.startsWith(claudeDir)) {
        await this.handleClaudeFileChange(absPath);
        this.repository.flush();
        this.bridge.emit({
          type: "synced-session:sync:complete",
          claudeCount: 1,
          copilotCount: 0,
        });
        return;
      }

      if (absPath.startsWith(copilotDir)) {
        await this.handleCopilotFileChange(absPath);
        this.repository.flush();
        this.bridge.emit({
          type: "synced-session:sync:complete",
          claudeCount: 0,
          copilotCount: 1,
        });
        return;
      }
    } catch (err) {
      console.error(`${TAG} Single-file sync failed for ${absPath}:`, err);
    }
  }

  private async handleClaudeFileChange(absPath: string): Promise<void> {
    if (!absPath.endsWith(".jsonl")) return;
    // Skip subagent files: they live under .../<sessionId>/subagents/*.jsonl
    if (absPath.includes(`${path.sep}subagents${path.sep}`)) return;

    const fileName = path.basename(absPath, ".jsonl");
    const projectDir = path.basename(path.dirname(absPath));

    let mtime = 0;
    let size = 0;
    try {
      const stat = fs.statSync(absPath);
      mtime = stat.mtimeMs;
      size = stat.size;
    } catch {
      // File may have been deleted between event and read — nothing to do.
      return;
    }

    const subagentDir = path.join(path.dirname(absPath), fileName, "subagents");
    let subagentCount = 0;
    if (fs.existsSync(subagentDir)) {
      try {
        subagentCount = fs.readdirSync(subagentDir).filter((f) => f.endsWith(".jsonl")).length;
      } catch {
        subagentCount = 0;
      }
    }

    const knownPaths = await this.collectApplicationPaths();
    const entry: SessionFileEntry = {
      filePath: absPath,
      sessionId: fileName,
      projectDir,
      mtime,
      size,
      subagentCount,
    };
    await this.syncClaudeSessionIfRelevant(entry, knownPaths);
  }

  private async handleCopilotFileChange(absPath: string): Promise<void> {
    // Resolve the session directory (events.jsonl or workspace.yaml both live one level deep).
    const sessionDir = path.dirname(absPath);
    const stateDir = this.gateway.getCopilotSessionStateDir();
    if (path.dirname(sessionDir) !== stateDir) {
      // Event from a nested subdir (checkpoints/, files/, …) — ignore.
      return;
    }

    const workspaceYamlPath = path.join(sessionDir, "workspace.yaml");
    const eventsJsonlPath = path.join(sessionDir, "events.jsonl");

    if (!fs.existsSync(workspaceYamlPath) || !fs.existsSync(eventsJsonlPath)) {
      return;
    }

    let mtime = 0;
    let size = 0;
    try {
      const stat = fs.statSync(eventsJsonlPath);
      mtime = stat.mtimeMs;
      size = stat.size;
    } catch {
      return;
    }

    const entry: CopilotSessionFileEntry = {
      sessionId: path.basename(sessionDir),
      sessionDir,
      workspaceYamlPath,
      eventsJsonlPath,
      mtime,
      size,
    };
    await this.syncCopilotSession(entry);
  }

  /**
   * Collects all known filesystem paths from the application:
   * - Registered repository paths
   * - Configured working directories
   * - Active git worktree paths for each repo
   *
   * Now async since GitGateway.listWorktrees() is async.
   */
  private async collectApplicationPaths(): Promise<string[]> {
    const repos = this.repoRepository.listAll();
    const repoPaths = repos
      .filter((r) => r.status === "active")
      .map((r) => r.path);

    const workingDirs = this.configManager.getAllowedRoots();

    // Collect worktree paths for each active repo
    const worktreePaths: string[] = [];
    for (const repoPath of repoPaths) {
      try {
        const worktrees = await this.gitGateway.listWorktrees(repoPath);
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
      activity: this.refineActivityWithMtime(metadata.activity, entry.mtime),
      slug: metadata.slug,
      version: metadata.version,
      entrypoint: metadata.entrypoint,
      title: metadata.title,
      startedAt: metadata.startTimestamp ?? now,
      endedAt: metadata.endTimestamp,
      createdAt: metadata.startTimestamp ?? now,
      isArchived: false,
      syncedFilePath: entry.filePath,
      syncedFileMtime: entry.mtime,
      syncedFileSize: entry.size,
      lastSyncedAt: now,
    });

    return true;
  }

  /**
   * Scans and syncs Copilot CLI sessions. Every session that has both a
   * `workspace.yaml` and an `events.jsonl` is synced — there is no
   * knownPaths filter (per product decision).
   */
  private async syncCopilotSessions(): Promise<number> {
    const stateDir = this.gateway.getCopilotSessionStateDir();
    const entries = this.gateway.listCopilotSessionFiles(stateDir);

    console.log(`${TAG} Found ${entries.length} Copilot session files`);

    let synced = 0;

    for (const entry of entries) {
      try {
        const changed = this.hasCopilotFileChanged(entry);
        if (!changed) {
          if (this.repository.getFileSync(entry.eventsJsonlPath)) {
            synced++;
          }
          continue;
        }

        await this.syncCopilotSession(entry);
        synced++;
      } catch (err) {
        console.error(`${TAG} Failed to sync Copilot session ${entry.sessionId}:`, err);
      }
    }

    return synced;
  }

  /**
   * Parse a single Copilot session and upsert it.
   */
  private async syncCopilotSession(entry: CopilotSessionFileEntry): Promise<void> {
    const yamlContent = this.gateway.readCopilotWorkspaceYaml(entry.workspaceYamlPath);
    const workspace = parseWorkspaceYaml(yamlContent);

    const lines = await this.gateway.readJsonlLines(entry.eventsJsonlPath);
    const metadata = parseCopilotEventLines(lines, workspace);

    const sessionId = metadata.sessionId || entry.sessionId;
    const now = Date.now();

    this.repository.upsert({
      id: `copilot:${sessionId}`,
      provider: "copilot",
      sessionId,
      // Copilot sessions are not grouped under a project_dir like Claude — we leave
      // this null and let the renderer group by cwd.
      projectDir: null,
      cwd: metadata.cwd,
      gitBranch: metadata.gitBranch,
      model: metadata.model,
      tokenUsage: metadata.tokenUsage,
      messageCount: metadata.messageCount,
      subagentCount: 0,
      status: metadata.status,
      activity: this.refineActivityWithMtime(metadata.activity, entry.mtime),
      slug: null,
      version: metadata.version,
      entrypoint: null,
      title: metadata.title,
      startedAt: metadata.startTimestamp ?? now,
      endedAt: metadata.endTimestamp,
      createdAt: metadata.startTimestamp ?? now,
      isArchived: false,
      syncedFilePath: entry.eventsJsonlPath,
      syncedFileMtime: entry.mtime,
      syncedFileSize: entry.size,
      lastSyncedAt: now,
    });
  }

  /**
   * Removes Claude Code synced sessions whose cwd no longer matches any known path.
   * Copilot sessions are excluded from this cleanup because their inclusion is
   * gated by workspace.yaml presence on disk, not knownPaths membership.
   */
  private cleanupStaleClaudeSessions(knownPaths: string[]): number {
    return this.repository.deleteClaudeWhereNotMatchingPaths(knownPaths);
  }

  /**
   * If the file was just written to (mtime within ~3 s), bias an `idle` activity
   * toward `processing` — the parser may have observed a paired turn_end that the
   * agent is about to follow up on. `completed` is never overridden.
   */
  private refineActivityWithMtime(
    activity: SyncedSessionRecord["activity"],
    mtime: number,
  ): SyncedSessionRecord["activity"] {
    if (activity === "completed" || activity === "processing") return activity;
    const ageMs = Date.now() - mtime;
    if (ageMs >= 0 && ageMs < 3000) return "processing";
    return activity;
  }

  /**
   * Checks whether a Copilot events.jsonl file has changed since last sync.
   */
  private hasCopilotFileChanged(entry: CopilotSessionFileEntry): boolean {
    const existing = this.repository.getFileSync(entry.eventsJsonlPath);
    if (!existing) return true;
    return existing.mtime !== entry.mtime || existing.size !== entry.size;
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
