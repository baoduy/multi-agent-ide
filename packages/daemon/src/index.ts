import { DaemonContainer } from "./DaemonContainer";
import { ConfigManager } from "./config/ConfigManager";
import type { IPCBridge } from "./ipc/IPCBridge";
import type { SpecSyncService } from "./services/SpecSyncService";
import type { DirWatcher } from "./services/DirWatcher";

export type DaemonBootstrapResult = {
  startedAt: number;
  services: string[];
  bridge: IPCBridge;
  specSyncService: SpecSyncService;
  dirWatcher: DirWatcher;
  container: DaemonContainer;
};

/**
 * Bootstrap the daemon using the composition root.
 */
export async function bootstrapDaemon(): Promise<DaemonBootstrapResult> {
  const startedAt = Date.now();

  const container = await DaemonContainer.create();
  container.registerAllHandlers();

  return {
    startedAt,
    services: container.serviceNames,
    bridge: container.bridge,
    specSyncService: container.specSyncService,
    dirWatcher: container.dirWatcher,
    container,
  };
}

// Run daemon standalone if this is the entry point
if (require.main === module) {
  bootstrapDaemon()
    .then((result) => {
      console.log(
        `Daemon bootstrap initialized at ${result.startedAt} with ${result.services.length} services`
      );

      // Start background services
      const configManager = ConfigManager.getInstance();
      for (const dir of configManager.getConfig().workingDirs) {
        result.dirWatcher.watchDir(dir);
      }
      result.specSyncService.start();

      // Trigger one-time session sync (scans ~/.claude + ~/.copilot)
      result.container.sessionSyncService.triggerSync();

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
