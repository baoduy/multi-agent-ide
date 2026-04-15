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
import { SyncedSessionRepository } from "./services/SyncedSessionRepository";
import { SessionSyncGateway } from "./infrastructure/SessionSyncGateway";
import { SessionFileWatcher } from "./infrastructure/SessionFileWatcher";
import { GitGateway } from "./infrastructure/GitGateway";

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

    // AI Session service — purely in-memory; the disk-backed sync layer is
    // the source of truth for session history.
    this.aiSessionService = new AISessionApplicationService(this.bridge, this.configManager);

    // Git gateway (shared across services that need git operations)
    this.gitGateway = new GitGateway();

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
      terminalService: this.terminalService,
      aiSessionService: this.aiSessionService,
      sessionSyncService: this.sessionSyncService,
      gitGateway: this.gitGateway,
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
