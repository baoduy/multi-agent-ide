import type { ConfigManager } from "../config/ConfigManager";
import type { DatabaseService } from "../db/DatabaseService";
import type { SessionManager } from "../services/SessionManager";
import type { SpecSyncService } from "../services/SpecSyncService";
import type { BackgroundJobManager } from "../services/BackgroundJobManager";
import type { RepoRepository } from "../services/RepoRepository";
import type { ScanQueue } from "../services/ScanQueue";
import type { TerminalApplicationService } from "../application/TerminalApplicationService";
import { registerRepoHandlers } from "./handlers/repoHandlers";
import { registerSpecHandlers } from "./handlers/specHandlers";

import { IPCBridge } from "./IPCBridge";
import { registerConfigHandlers } from "./handlers/configHandlers";
import { registerFileHandlers } from "./handlers/fileHandlers";
import { registerWorktreeHandlers } from "./handlers/worktreeHandlers";
import { registerSessionHandlers } from "./handlers/sessionHandlers";
import { registerOnboardHandlers } from "./handlers/onboardHandlers";
import { registerTerminalHandlers } from "./handlers/terminalHandlers";

import { RepoApplicationService } from "../application/RepoApplicationService";
import { SpecApplicationService } from "../application/SpecApplicationService";
import { FileApplicationService } from "../application/FileApplicationService";
import { WorktreeApplicationService } from "../application/WorktreeApplicationService";
import { SessionApplicationService } from "../application/SessionApplicationService";
import { ConfigApplicationService } from "../application/ConfigApplicationService";
import { OnboardApplicationService } from "../application/OnboardApplicationService";

export type HandlerContext = {
  databaseService: DatabaseService;
  configManager: ConfigManager;
  sessionManager: SessionManager;
  specSyncService: SpecSyncService;
  jobManager: BackgroundJobManager;
  repoRepository: RepoRepository;
  scanQueue: ScanQueue;
  terminalService: TerminalApplicationService;
};

export function registerHandlers(bridge: IPCBridge, context: HandlerContext): void {
  // Create application services
  const repoService = new RepoApplicationService(
    context.repoRepository,
    context.configManager,
    context.scanQueue,
    context.specSyncService,
  );
  const specService = new SpecApplicationService(context.specSyncService);
  const fileService = new FileApplicationService();
  const worktreeService = new WorktreeApplicationService();
  const sessionService = new SessionApplicationService(context.sessionManager);
  const configService = new ConfigApplicationService(context.configManager);

  registerRepoHandlers({ bridge, repoService });
  registerSpecHandlers({ bridge, specService });
  registerSessionHandlers({ bridge, sessionService });
  registerConfigHandlers({ bridge, configService });
  registerFileHandlers({ bridge, fileService });
  registerWorktreeHandlers({ bridge, worktreeService });

  const onboardService = new OnboardApplicationService(bridge, context.configManager);
  registerOnboardHandlers({ bridge, onboardService });

  registerTerminalHandlers({ bridge, terminalService: context.terminalService });
}
