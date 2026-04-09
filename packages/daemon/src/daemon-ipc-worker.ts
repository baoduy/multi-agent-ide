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
import { SessionManager } from "./services/SessionManager";
import { SpecRepository } from "./services/SpecRepository";
import { SpecSyncService } from "./services/SpecSyncService";

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
    const sessionManager = new SessionManager(databaseService);

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

    // Directory watcher for auto-detecting new/removed repos
    const dirWatcher = new DirWatcher(scanQueue, configManager);

    registerHandlers(ipcBridge, {
      databaseService,
      configManager,
      sessionManager,
      specSyncService,
      jobManager,
      repoRepository,
      scanQueue,
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
    for (const dir of configManager.getConfig().workingDirs) {
      dirWatcher.watchDir(dir);
    }

    // 2. Start the 5-minute spec sync schedule (runs immediately on first call)
    specSyncService.start();

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
