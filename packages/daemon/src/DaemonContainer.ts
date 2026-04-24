import { ConfigManager } from "./config/ConfigManager";
import { DatabaseService } from "./db/DatabaseService";
import { IPCBridge } from "./ipc/IPCBridge";
import { registerHandlers } from "./ipc/registerHandlers";

import { BackgroundJobManager } from "./services/BackgroundJobManager";
import { DirWatcher } from "./services/DirWatcher";
import { RepoRepository } from "./services/RepoRepository";
import { RepoScanner } from "./services/RepoScanner";
import { ScanQueue } from "./services/ScanQueue";

import { SpecRepository } from "./services/SpecRepository";
import { SpecSyncService } from "./services/SpecSyncService";
import { TerminalApplicationService } from "./application/TerminalApplicationService";
import { AISessionApplicationService } from "./application/AISessionApplicationService";
import { SessionSyncApplicationService } from "./application/SessionSyncApplicationService";
import { WorktreeSyncApplicationService } from "./application/WorktreeSyncApplicationService";
import { SyncedSessionRepository } from "./services/SyncedSessionRepository";
import { WorktreeRepository } from "./services/WorktreeRepository";
import { SessionSyncGateway } from "./infrastructure/SessionSyncGateway";
import { SessionFileWatcher } from "./infrastructure/SessionFileWatcher";
import { GitGateway } from "./infrastructure/GitGateway";
import { FileSystemGateway } from "./infrastructure/FileSystemGateway";
import { SpecGitGateway } from "./infrastructure/SpecGitGateway";
import { SpecReader } from "./services/SpecReader";
import { GitBatchGateway } from "./infrastructure/GitBatchGateway";
import { GitRepoWatcher } from "./infrastructure/GitRepoWatcher";
import { LruCache } from "./infrastructure/utils/LruCache";
import type { LogResult, CommitDetailResult } from "./infrastructure/GitHistoryGateway";
import { GitHubReleasesGateway } from "./infrastructure/GitHubReleasesGateway";
import { NpmRegistryGateway } from "./infrastructure/NpmRegistryGateway";
import { CliVersionApplicationService } from "./application/CliVersionApplicationService";
import { SpecifyExtensionApplicationService } from "./application/SpecifyExtensionApplicationService";
import { AiConfigRepository } from "./infrastructure/AiConfigRepository";
import { AiCliGateway } from "./infrastructure/AiCliGateway";
import { AiEditApplicationService } from "./application/AiEditApplicationService";
import { FileWatcherGateway } from "./infrastructure/FileWatcherGateway";
import { FileWatchService } from "./application/FileWatchService";

/**
 * DaemonContainer is the single composition root for the daemon process.
 * It constructs all infrastructure, services, and wires them together.
 *
 * Bootstrap only needs to:
 *   1. Call DaemonContainer.create() (async, initializes WASM/DB)
 *   2. Call container.registerAllHandlers()
 *   3. Start lifecycle services
 */
export class DaemonContainer {
  // Infrastructure
  readonly databaseService: DatabaseService;
  readonly configManager: ConfigManager;
  readonly bridge: IPCBridge;

  // Services
  readonly jobManager: BackgroundJobManager;
  readonly repoRepository: RepoRepository;
  readonly specRepository: SpecRepository;
  readonly scanner: RepoScanner;
  readonly scanQueue: ScanQueue;
  readonly specSyncService: SpecSyncService;
  readonly dirWatcher: DirWatcher;
  readonly terminalService: TerminalApplicationService;
  readonly aiSessionService: AISessionApplicationService;
  readonly gitGateway: GitGateway;
  readonly sessionSyncGateway: SessionSyncGateway;
  readonly syncedSessionRepository: SyncedSessionRepository;
  readonly sessionSyncService: SessionSyncApplicationService;
  readonly sessionFileWatcher: SessionFileWatcher;
  readonly worktreeRepository: WorktreeRepository;
  readonly worktreeSyncService: WorktreeSyncApplicationService;
  readonly fileSystemGateway: FileSystemGateway;
  readonly specGitGateway: SpecGitGateway;
  readonly specReader: SpecReader;
  readonly gitBatchGateway: GitBatchGateway;
  readonly gitRepoWatcher: GitRepoWatcher;
  readonly logCache: LruCache<string, LogResult>;
  readonly commitDetailCache: LruCache<string, CommitDetailResult>;
  readonly githubReleasesGateway: GitHubReleasesGateway;
  readonly npmRegistryGateway: NpmRegistryGateway;
  readonly specifyExtensionService: SpecifyExtensionApplicationService;
  readonly cliVersionService: CliVersionApplicationService;
  readonly aiConfigRepository: AiConfigRepository;
  readonly aiCliGateway: AiCliGateway;
  readonly aiEditService: AiEditApplicationService;
  readonly fileWatcherGateway: FileWatcherGateway;
  readonly fileWatchService: FileWatchService;

  private constructor(databaseService: DatabaseService) {
    this.databaseService = databaseService;
    this.configManager = ConfigManager.getInstance();
    this.bridge = new IPCBridge();
    this.jobManager = new BackgroundJobManager();

    // Data access
    this.repoRepository = new RepoRepository(databaseService);
    this.specRepository = new SpecRepository(databaseService);

    // Scanning
    this.scanner = new RepoScanner(3);
    this.scanQueue = new ScanQueue(
      this.scanner,
      this.repoRepository,
      this.bridge,
      this.jobManager
    );

    // Spec sync
    this.specSyncService = new SpecSyncService(
      this.specRepository,
      this.repoRepository,
      this.bridge,
      this.jobManager,
      this.configManager,
    );

    // Wire spec sync into scan queue (avoids circular dep at construction)
    this.scanQueue.setSpecSyncService(this.specSyncService);

    // Directory watcher
    this.dirWatcher = new DirWatcher(this.scanQueue, this.configManager);

    // Terminal PTY service
    this.terminalService = new TerminalApplicationService(this.bridge);

    // Git gateway (shared across services that need git operations)
    this.gitGateway = new GitGateway();

    // AI Session service — purely in-memory; the disk-backed sync layer is
    // the source of truth for session history.
    this.aiSessionService = new AISessionApplicationService(this.bridge, this.configManager, this.gitGateway);

    // Git performance foundation — owned once here, shared everywhere:
    //   - batch gateway holds one long-lived `git cat-file --batch` per repo
    //   - logCache + commitDetailCache avoid re-spawning git for cold reads
    //   - repoWatcher proactively invalidates both when `.git/` changes
    this.gitBatchGateway = new GitBatchGateway();
    this.logCache = new LruCache<string, LogResult>({ maxEntries: 500 });
    this.commitDetailCache = new LruCache<string, CommitDetailResult>({ maxEntries: 500 });
    this.gitRepoWatcher = new GitRepoWatcher(this.bridge, this.gitBatchGateway, {
      logCache: this.logCache,
      commitDetailCache: this.commitDetailCache,
    });

    // Read-side gateways shared across handler registrations. Keeping a
    // single instance here prevents duplicate construction in
    // registerHandlers and ensures the FileSystemGateway has a single
    // authoritative allowlist provider.
    this.fileSystemGateway = new FileSystemGateway(this.configManager);
    this.specGitGateway = new SpecGitGateway(this.gitBatchGateway);
    this.specReader = new SpecReader(this.gitBatchGateway);

    // Session sync (scans Claude Code + Copilot JSONL files from disk)
    this.sessionSyncGateway = new SessionSyncGateway();
    this.syncedSessionRepository = new SyncedSessionRepository(databaseService);
    this.sessionSyncService = new SessionSyncApplicationService(
      this.syncedSessionRepository,
      this.sessionSyncGateway,
      this.bridge,
      this.jobManager,
      this.repoRepository,
      this.configManager,
      this.gitGateway,
    );

    // Live activity watcher — watches both provider directories and pushes
    // single-file re-syncs when JSONL files are appended.
    this.sessionFileWatcher = new SessionFileWatcher(
      this.sessionSyncService,
      this.sessionSyncGateway.getClaudeProjectsDir(),
      this.sessionSyncGateway.getCopilotSessionStateDir(),
    );

    // Worktree sync — scans `git worktree list` for every active repo on
    // a 1-minute interval, mirrors results into SQLite, and pushes
    // `worktree:sync:complete` events so the renderer can refresh from DB.
    this.worktreeRepository = new WorktreeRepository(databaseService);
    this.worktreeSyncService = new WorktreeSyncApplicationService(
      this.worktreeRepository,
      this.gitGateway,
      this.repoRepository,
      this.bridge,
      this.jobManager,
    );

    // CLI tool version tracking — on-demand check when the user opens
    // the upgrade dialog; no background cadence.
    this.githubReleasesGateway = new GitHubReleasesGateway();
    this.npmRegistryGateway = new NpmRegistryGateway();
    // Specify extension auto-installer — runs after onboard success and
    // after specify template refresh. Shares the single GitHub releases
    // gateway so extension version lookups follow the same timeout/error
    // handling as CLI version checks.
    this.specifyExtensionService = new SpecifyExtensionApplicationService(
      this.configManager,
      this.githubReleasesGateway,
    );
    this.cliVersionService = new CliVersionApplicationService(
      this.bridge,
      this.githubReleasesGateway,
      this.npmRegistryGateway,
      this.configManager,
      this.specifyExtensionService,
    );

    // AI-assisted markdown editor — config/action files + CLI spawn.
    this.aiConfigRepository = new AiConfigRepository();
    this.aiCliGateway = new AiCliGateway();
    this.aiEditService = new AiEditApplicationService(
      this.aiConfigRepository,
      this.aiCliGateway,
    );

    // File watcher — the markdown editor opens one watcher per open tab so
    // external writes (AI CLI edits, teammate edits, git checkout) get folded
    // into the editor via 3-way merge without the user reopening the file.
    this.fileWatcherGateway = new FileWatcherGateway();
    this.fileWatchService = new FileWatchService(this.fileWatcherGateway, this.bridge);
  }

  /**
   * Async factory — creates the container (DB initialization is async).
   */
  static async create(): Promise<DaemonContainer> {
    const databaseService = await DatabaseService.create();
    return new DaemonContainer(databaseService);
  }

  /**
   * Register all IPC handlers with the bridge.
   */
  registerAllHandlers(): void {
    registerHandlers(this.bridge, {
      databaseService: this.databaseService,
      configManager: this.configManager,
      specSyncService: this.specSyncService,
      jobManager: this.jobManager,
      repoRepository: this.repoRepository,
      scanQueue: this.scanQueue,
      scanner: this.scanner,
      terminalService: this.terminalService,
      aiSessionService: this.aiSessionService,
      sessionSyncService: this.sessionSyncService,
      worktreeSyncService: this.worktreeSyncService,
      gitGateway: this.gitGateway,
      fileSystemGateway: this.fileSystemGateway,
      specGitGateway: this.specGitGateway,
      specReader: this.specReader,
      cliVersionService: this.cliVersionService,
      specifyExtensionService: this.specifyExtensionService,
      gitBatchGateway: this.gitBatchGateway,
      gitRepoWatcher: this.gitRepoWatcher,
      logCache: this.logCache,
      commitDetailCache: this.commitDetailCache,
      aiEditService: this.aiEditService,
      fileWatchService: this.fileWatchService,
    });
  }

  /**
   * Closes all active PTY sessions and cleans up daemon resources.
   * Called during daemon shutdown before the process exits.
   */
  shutdown(): void {
    this.aiSessionService.destroyAll();
    this.terminalService.closeAll();
    this.dirWatcher.unwatchAll();
    this.sessionFileWatcher.stop();
    this.sessionSyncService.stop();
    this.worktreeSyncService.stop();
    this.gitRepoWatcher.stop();
    this.gitBatchGateway.dispose();
    // Fire-and-forget; shutdown doesn't await async cleanup.
    void this.fileWatchService.closeAll();
  }

  /**
   * Returns the list of initialized service names (for logging).
   */
  get serviceNames(): string[] {
    return [
      "DatabaseService",
      "ConfigManager",
      "IPCBridge",
      "IPCHandlers",
      "SpecSyncService",
      "DirWatcher",
      "TerminalApplicationService",
      "AISessionApplicationService",
      "SessionSyncApplicationService",
    ];
  }
}
