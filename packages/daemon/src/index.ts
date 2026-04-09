import { ConfigManager } from "./config/ConfigManager";
import { DatabaseService } from "./db/DatabaseService";
import { IPCBridge } from "./ipc/IPCBridge";
import { registerHandlers } from "./ipc/registerHandlers";

import { SessionManager } from "./services/SessionManager";

export type DaemonBootstrapResult = {
  startedAt: number;
  services: string[];
  bridge: IPCBridge;
};

/**
 * Bootstrap the daemon. Now async because sql.js (WASM) initialization is async.
 */
export async function bootstrapDaemon(): Promise<DaemonBootstrapResult> {
  const startedAt = Date.now();

  // DatabaseService.create() is async (sql.js WASM loading)
  const databaseService = await DatabaseService.create();
  const configManager = ConfigManager.getInstance();
  const ipcBridge = new IPCBridge();
  const sessionManager = new SessionManager(databaseService);

  registerHandlers(ipcBridge, {
    databaseService,
    configManager,
    sessionManager,
  });

  const services = [
    "DatabaseService",
    "ConfigManager",
    "IPCBridge",
    "IPCHandlers",
    "SessionManager",
  ];

  return {
    startedAt,
    services,
    bridge: ipcBridge,
  };
}

// Run daemon standalone if this is the entry point
if (require.main === module) {
  bootstrapDaemon()
    .then((result) => {
      console.log(
        `Daemon bootstrap initialized at ${result.startedAt} with ${result.services.length} services`
      );
      console.log("Daemon listening...");
    })
    .catch((err) => {
      console.error("Daemon bootstrap failed:", err);
      process.exit(1);
    });

  process.on("SIGTERM", () => {
    console.log("Daemon shutting down");
    process.exit(0);
  });
  process.on("SIGINT", () => {
    console.log("Daemon shutting down");
    process.exit(0);
  });

  // Keep the process alive
  setInterval(() => {}, 1000);
}
