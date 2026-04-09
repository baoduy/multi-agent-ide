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
import { SessionManager } from "./services/SessionManager";

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
    const sessionManager = new SessionManager(databaseService);

    registerHandlers(ipcBridge, {
      databaseService,
      configManager,
      sessionManager,
    });
    console.log("[daemon-worker] All handlers registered");

    // Forward push events from the bridge to the parent process
    const pushEventTypes = [
      "repo:scan:started",
      "repo:scan:progress",
      "repo:scan:complete",
      "spec:list:updated",
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
