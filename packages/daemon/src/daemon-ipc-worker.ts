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
import { AISessionRepository } from "./services/AISessionRepository";
import { SessionSyncApplicationService } from "./application/SessionSyncApplicationService";
import { SyncedSessionRepository } from "./services/SyncedSessionRepository";
import { SessionSyncGateway } from "./infrastructure/SessionSyncGateway";
import { GitGateway } from "./infrastructure/GitGateway";

// Track services for graceful shutdown
let shutdownServices: {
  dirWatcher?: DirWatcher;
  specSyncService?: SpecSyncService;
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
    );

    // Wire spec sync into scan queue so repo scans trigger spec sync
    // for newly added repos (avoids circular dependency at construction time)
    scanQueue.setSpecSyncService(specSyncService);

    // Directory watcher for auto-detecting new/removed repos
    const dirWatcher = new DirWatcher(scanQueue, configManager);

    // Terminal PTY service
    const terminalService = new TerminalApplicationService(ipcBridge);

    // AI Terminal session service
    const aiSessionRepository = new AISessionRepository(databaseService);
    const aiSessionService = new AISessionApplicationService(ipcBridge, aiSessionRepository);

    // Git gateway (shared across services)
    const gitGateway = new GitGateway();

    // Session sync service (scans Claude Code JSONL from disk, filtered by known paths)
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

    // Store references for graceful shutdown
    shutdownServices = { dirWatcher, specSyncService, databaseService, terminalService, aiSessionService };

    registerHandlers(ipcBridge, {
      databaseService,
      configManager,
      specSyncService,
      jobManager,
      repoRepository,
      scanQueue,
      terminalService,
      aiSessionService,
      sessionSyncService,
      gitGateway,
    });
    console.log("[daemon-worker] All handlers registered");

    // Forward push events from the bridge to the parent process
    const pushEventTypes = [
      "repo:scan:started",
      "repo:scan:progress",
      "repo:scan:complete",
      "spec:sync:started",
      "spec:sync:complete",
      "config:updated",
      "repo:onboard:output",
      "repo:onboard:complete",
      "repo:upgrade-specify:output",
      "repo:upgrade-specify:complete",
      "repo:onboard:cancelled",
      "terminal:data",
      "terminal:exited",
      "ai-session:data",
      "ai-session:status",
      "ai-session:exited",
      "synced-session:sync:complete",
    ];

    for (const eventType of pushEventTypes) {
      (ipcBridge as any).on(eventType, (payload: unknown) => {
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

    // 3. Start the 5-minute spec sync schedule (runs immediately on first call).
    //    Because the repo scan was enqueued first, the initial "spec-sync-all"
    //    will see any newly discovered repos.
    specSyncService.start();

    // 3. Trigger one-time session sync (scans ~/.claude + ~/.copilot)
    sessionSyncService.triggerSync();

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
