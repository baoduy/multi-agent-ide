import { ConfigManager } from "./config/ConfigManager";
import { DatabaseService } from "./db/DatabaseService";
import { IPCBridge } from "./ipc/IPCBridge";
import { registerHandlers } from "./ipc/registerHandlers";

import { SessionManager } from "./services/SessionManager";

type DaemonBootstrapResult = {
  startedAt: number;
  services: string[];
};

class DaemonApp {
  private readonly databaseService: DatabaseService;
  private readonly configManager: ConfigManager;
  private readonly ipcBridge: IPCBridge;
  private readonly sessionManager: SessionManager;
  private readonly services: string[];

  constructor() {
    this.databaseService = DatabaseService.getInstance();
    this.configManager = ConfigManager.getInstance();
    this.ipcBridge = new IPCBridge();
    this.sessionManager = new SessionManager(this.databaseService);

    registerHandlers(this.ipcBridge, {
      databaseService: this.databaseService,
      configManager: this.configManager,
      sessionManager: this.sessionManager,
    });

    this.services = [
      "DatabaseService",
      "ConfigManager",
      "IPCBridge",
      "IPCHandlers",
      "SessionManager",
    ];
  }

  start(): DaemonBootstrapResult {
    const startedAt = Date.now();

    // Phase 1 bootstrap placeholder: concrete service wiring follows in Phase 2.
    return {
      startedAt,
      services: [...this.services],
    };
  }
}

export function bootstrapDaemon(): DaemonBootstrapResult {
  const app = new DaemonApp();
  return app.start();
}

// Run daemon if this is the entry point
if (require.main === module) {
  const result = bootstrapDaemon();
  console.log(
    `Daemon bootstrap initialized at ${result.startedAt} with ${result.services.length} services`
  );
  
  // Keep daemon running
  console.log("Daemon listening...");
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
