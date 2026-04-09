import type { IpcResponse } from "@magenta/shared/ipc";
import type { ConfigManager } from "../config/ConfigManager";
import type { DatabaseService } from "../db/DatabaseService";
import { registerRepoHandlers } from "./handlers/repoHandlers";
import { registerSpecHandlers } from "./handlers/specHandlers";

import { IPCBridge } from "./IPCBridge";
import { registerConfigHandlers } from "./handlers/configHandlers";
import { registerFileHandlers } from "./handlers/fileHandlers";

export type HandlerContext = {
  databaseService: DatabaseService;
  configManager: ConfigManager;
  sessionManager: SessionManager;
};
import type { SessionManager } from "../services/SessionManager";
import { registerSessionHandlers } from "./handlers/sessionHandlers";

export function registerHandlers(bridge: IPCBridge, context: HandlerContext): void {
  registerRepoHandlers({
    bridge,
    databaseService: context.databaseService,
    configManager: context.configManager,
  });

  registerSpecHandlers({
    bridge,
    configManager: context.configManager,
  });

  registerSessionHandlers({
    bridge,
    sessionManager: context.sessionManager,
  });

  registerConfigHandlers({
    bridge,
    configManager: context.configManager,
  });

  registerFileHandlers({
    bridge,
  });
}
