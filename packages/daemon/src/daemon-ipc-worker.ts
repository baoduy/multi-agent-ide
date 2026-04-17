/**
 * Daemon IPC Worker
 *
 * This file is the entry point when the daemon runs as a forked child process
 * of the Electron main process. It bootstraps all daemon services and
 * communicates with the parent via Node.js IPC (process.send / process.on).
 *
 * Protocol:
 *   Parent → Child:  { kind: "request", id: number, payload: IpcRequest }
 *   Child → Parent:  { kind: "response", id: number, payload: IpcResponse }
 *   Child → Parent:  { kind: "event", payload: IpcResponse }   (push events)
 *   Child → Parent:  { kind: "ready" }                          (startup done)
 */

import { ConfigManager } from "./config/ConfigManager";
import { DatabaseService } from "./db/DatabaseService";
import { IPCBridge } from "./ipc/IPCBridge";
import type { IpcResponse } from "@magenta/shared/ipc";
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
import { FileSystemGateway } from "./infrastructure/FileSystemGateway";
import { SpecGitGateway } from "./infrastructure/SpecGitGateway";
import { SpecReader } from "./services/SpecReader";
import { GitHubReleasesGateway } from "./infrastructure/GitHubReleasesGateway";
import { NpmRegistryGateway } from "./infrastructure/NpmRegistryGateway";
import { CliVersionApplicationService } from "./application/CliVersionApplicationService";

// Track services for graceful shutdown
let shutdownServices: {
  dirWatcher?: DirWatcher;
  specSyncService?: SpecSyncService;
  sessionSyncService?: SessionSyncApplicationService;
  sessionFileWatcher?: SessionFileWatcher;
  databaseService?: DatabaseService;
  terminalService?: TerminalApplicationService;
  aiSessionService?: AISessionApplicationService;
} = {};
let isShuttingDown = false;

/**
 * Gracefully shut down all daemon services.
 * Called on SIGTERM, SIGINT, or disconnect from parent.
 */
async function gracefulShutdown(reason: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`[daemon-worker] Graceful shutdown initiated (reason: ${reason})`);

  try {
    // 1. Stop file watchers (chokidar)
    if (shutdownServices.dirWatcher) {
      console.log("[daemon-worker] Closing file watchers...");
      shutdownServices.dirWatcher.unwatchAll();
    }

    // 2. Close active AI sessions
    if (shutdownServices.aiSessionService) {
      console.log("[daemon-worker] Closing AI terminal sessions...");
      shutdownServices.aiSessionService.destroyAll();
    }

    // 3. Close active PTY sessions
    if (shutdownServices.terminalService) {
      console.log("[daemon-worker] Closing terminal sessions...");
      shutdownServices.terminalService.closeAll();
    }

    // 2. Stop spec sync interval
    if (shutdownServices.specSyncService) {
      console.log("[daemon-worker] Stopping spec sync service...");
      shutdownServices.specSyncService.stop();
    }

    // 2b. Stop session sync interval
    if (shutdownServices.sessionSyncService) {
      console.log("[daemon-worker] Stopping session sync service...");
      shutdownServices.sessionSyncService.stop();
    }

    // 2c. Stop session file watcher
    if (shutdownServices.sessionFileWatcher) {
      console.log("[daemon-worker] Stopping session file watcher...");
      shutdownServices.sessionFileWatcher.stop();
    }

    // 3. Flush and close database
    if (shutdownServices.databaseService) {
      console.log("[daemon-worker] Flushing and closing database...");
      shutdownServices.databaseService.flush();
      shutdownServices.databaseService.close();
    }

    console.log("[daemon-worker] Graceful shutdown complete");
  } catch (error) {
    console.error("[daemon-worker] Error during shutdown:", error);
  }

  process.exit(0);
}

// Register shutdown handlers
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("disconnect", () => gracefulShutdown("parent disconnected"));

async function main() {
  console.log("[daemon-worker] Starting...");

  try {
    // Bootstrap services (DatabaseService.create() is async because sql.js WASM init is async)
    console.log("[daemon-worker] Initializing DatabaseService (sql.js WASM)...");
    const databaseService = await DatabaseService.create();
    console.log("[daemon-worker] DatabaseService ready");

    console.log("[daemon-worker] Initializing ConfigManager...");
    const configManager = ConfigManager.getInstance();
    console.log("[daemon-worker] ConfigManager ready, workingDirs:", configManager.getConfig().workingDirs);

    const ipcBridge = new IPCBridge();
    const jobManager = new BackgroundJobManager();
    // Data access layers
    const repoRepository = new RepoRepository(databaseService);
    const specRepository = new SpecRepository(databaseService);

    // Repo scanning
    const scanner = new RepoScanner(3);
    const scanQueue = new ScanQueue(scanner, repoRepository, ipcBridge, jobManager);

    // Spec sync service (replaces SpecCacheService)
    const specSyncService = new SpecSyncService(
      specRepository,
      repoRepository,
      ipcBridge,
      jobManager,
      configManager,
    );

    // Wire spec sync into scan queue so repo scans trigger spec sync
    // for newly added repos (avoids circular dependency at construction time)
    scanQueue.setSpecSyncService(specSyncService);

    // Directory watcher for auto-detecting new/removed repos
    const dirWatcher = new DirWatcher(scanQueue, configManager);

    // Terminal PTY service
    const terminalService = new TerminalApplicationService(ipcBridge);

    // Git gateway (shared across services)
    const gitGateway = new GitGateway();

    // AI Terminal session service — in-memory only; the sync layer owns history.
    const aiSessionService = new AISessionApplicationService(ipcBridge, configManager, gitGateway);

    // Read-side gateways — constructed once and threaded through
    // registerHandlers. Previously registerHandlers built its own copies,
    // which produced e.g. a duplicate RepoScanner instance.
    const fileSystemGateway = new FileSystemGateway(configManager);
    const specGitGateway = new SpecGitGateway();
    const specReader = new SpecReader();

    // Session sync service (scans Claude Code + Copilot JSONL from disk)
    const sessionSyncGateway = new SessionSyncGateway();
    const syncedSessionRepository = new SyncedSessionRepository(databaseService);
    const sessionSyncService = new SessionSyncApplicationService(
      syncedSessionRepository,
      sessionSyncGateway,
      ipcBridge,
      jobManager,
      repoRepository,
      configManager,
      gitGateway,
    );

    // Live activity watcher — pushes single-file re-syncs on JSONL append.
    const sessionFileWatcher = new SessionFileWatcher(
      sessionSyncService,
      sessionSyncGateway.getClaudeProjectsDir(),
      sessionSyncGateway.getCopilotSessionStateDir(),
    );

    // CLI tool version tracking — on-demand check when the user opens the
    // upgrade dialog; no background cadence.
    const githubReleasesGateway = new GitHubReleasesGateway();
    const npmRegistryGateway = new NpmRegistryGateway();
    const cliVersionService = new CliVersionApplicationService(
      ipcBridge,
      githubReleasesGateway,
      npmRegistryGateway,
    );

    // Store references for graceful shutdown
    shutdownServices = { dirWatcher, specSyncService, sessionSyncService, sessionFileWatcher, databaseService, terminalService, aiSessionService };

    registerHandlers(ipcBridge, {
      databaseService,
      configManager,
      specSyncService,
      jobManager,
      repoRepository,
      scanQueue,
      scanner,
      terminalService,
      aiSessionService,
      sessionSyncService,
      gitGateway,
      fileSystemGateway,
      specGitGateway,
      specReader,
      cliVersionService,
    });
    console.log("[daemon-worker] All handlers registered");

    // Forward push events from the bridge to the parent process
    const pushEventTypes: Array<IpcResponse["type"]> = [
      "repo:scan:started",
      "repo:scan:progress",
      "repo:scan:complete",
      "repo:force-reload:started",
      "spec:sync:started",
      "spec:sync:complete",
      "config:updated",
      "repo:onboard:output",
      "repo:onboard:complete",
      "repo:onboard:cancelled",
      "terminal:data",
      "terminal:exited",
      "ai-session:data",
      "ai-session:status",
      "ai-session:exited",
      "ai-session:updated",
      "synced-session:sync:complete",
      "cli:version-status-changed",
      "cli:upgrade:output",
      "cli:upgrade:complete",
    ];

    for (const eventType of pushEventTypes) {
      ipcBridge.on(eventType, (payload) => {
        console.log(`[daemon-worker] Emitting event: ${eventType}`);
        if (process.send) {
          process.send({ kind: "event", payload });
        }
      });
    }

    // Forward background job lifecycle events to the parent process
    for (const jobEvent of ["job:started", "job:completed", "job:failed"] as const) {
      jobManager.on(jobEvent, (payload: unknown) => {
        console.log(`[daemon-worker] Emitting event: ${jobEvent}`);
        if (process.send) {
          process.send({ kind: "event", payload: { type: jobEvent, ...(payload as Record<string, unknown>) } });
        }
      });
    }

    // Handle incoming requests from the parent process
    process.on("message", async (msg: unknown) => {
      const message = msg as { kind: string; id: number; payload: unknown };

      if (message.kind !== "request" || message.id == null) {
        return;
      }

      const requestType = (message.payload as Record<string, unknown>)?.type ?? "unknown";
      console.log(`[daemon-worker] Received request #${message.id}: ${requestType}`);

      try {
        const response = await ipcBridge.invoke(message.payload as any);
        const responseType = (response as Record<string, unknown>)?.type ?? "unknown";
        console.log(`[daemon-worker] Sending response #${message.id}: ${responseType}`);
        if (process.send) {
          process.send({ kind: "response", id: message.id, payload: response });
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[daemon-worker] Request #${message.id} failed:`, errorMsg);
        if (process.send) {
          process.send({
            kind: "response",
            id: message.id,
            payload: { type: "error", message: errorMsg },
          });
        }
      }
    });

    // Start background services after IPC is ready
    // 1. Watch all configured working directories for new/removed repos
    const workingDirs = configManager.getConfig().workingDirs;
    for (const dir of workingDirs) {
      dirWatcher.watchDir(dir);
    }

    // 2. Run an initial full repo scan so that repos added while the app was
    //    closed are discovered *before* spec sync runs. The BackgroundJobManager
    //    is a sequential FIFO queue, so the "repo-scan" job will finish before
    //    the "spec-sync-all" job that start() enqueues next.
    if (workingDirs.length > 0) {
      void scanQueue.requestScan(workingDirs);
    }

    // 3. Start the recurring spec sync interval (configurable, default 15 min).
    //    The initial sync is triggered by the repo-scan job when it completes
    //    (via scanQueue → specSyncService), so start() only sets up the timer.
    specSyncService.start();

    // 4. Session sync is gated on the AI title-bar tab being active. The
    //    renderer sends a "ui:ai-tab-active" IPC on boot and whenever the
    //    active top-level tab changes; sessionSyncService.setAITabActive()
    //    triggers an immediate sync and schedules the recurring interval
    //    (configurable, default 15 min) when the AI tab is shown, and pauses
    //    the sweep when it is hidden. Nothing is scheduled here at startup —
    //    this avoids wasted disk scans when the user never visits the AI tab.

    // 4b. Start the file watcher so live activity (processing/idle/completed)
    //     reflects within ~300ms of any JSONL append. Additive to the recurring
    //     sync — fs.watch is best-effort on some volumes.
    sessionFileWatcher.start();

    // 5. Reconfigure both sync services whenever config changes so users can
    //    change the interval from the Settings dialog without restarting the app.
    ipcBridge.on("config:updated", () => {
      specSyncService.reconfigureFromConfig();
      sessionSyncService.reconfigureFromConfig();
    });

    // Tell parent we're ready
    if (process.send) {
      process.send({ kind: "ready" });
    }

    console.log("[daemon-worker] Ready and listening for requests");
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[daemon-worker] FATAL: Failed to initialize:", errorMsg);

    // Still set up minimal message handler so parent gets error responses
    process.on("message", (msg: unknown) => {
      const message = msg as { kind: string; id: number };
      if (message.kind === "request" && message.id != null && process.send) {
        process.send({
          kind: "response",
          id: message.id,
          payload: { type: "error", message: `Daemon initialization failed: ${errorMsg}` },
        });
      }
    });

    // Still send ready so the parent doesn't hang
    if (process.send) {
      process.send({ kind: "ready" });
    }
  }
}

main().catch((err) => {
  console.error("[daemon-worker] Unhandled error in main():", err);
  if (process.send) {
    process.send({ kind: "ready" });
  }
});
