import type { ConfigManager } from "../config/ConfigManager";
import type { DatabaseService } from "../db/DatabaseService";
import type { SessionManager } from "../services/SessionManager";
import type { SpecSyncService } from "../services/SpecSyncService";
import type { BackgroundJobManager } from "../services/BackgroundJobManager";
import type { RepoRepository } from "../services/RepoRepository";
import type { ScanQueue } from "../services/ScanQueue";
import type { TerminalApplicationService } from "../application/TerminalApplicationService";
import type { AISessionApplicationService } from "../application/AISessionApplicationService";
import { registerRepoHandlers } from "./handlers/repoHandlers";
import { registerSpecHandlers } from "./handlers/specHandlers";

import { IPCBridge } from "./IPCBridge";
import { registerConfigHandlers } from "./handlers/configHandlers";
import { registerFileHandlers } from "./handlers/fileHandlers";
import { registerWorktreeHandlers } from "./handlers/worktreeHandlers";
import { registerSessionHandlers } from "./handlers/sessionHandlers";
import { registerOnboardHandlers } from "./handlers/onboardHandlers";
import { registerTerminalHandlers } from "./handlers/terminalHandlers";
import { registerAISessionHandlers } from "./handlers/aiSessionHandlers";

import { RepoApplicationService } from "../application/RepoApplicationService";
import { SpecApplicationService } from "../application/SpecApplicationService";
import { FileApplicationService } from "../application/FileApplicationService";
import { WorktreeApplicationService } from "../application/WorktreeApplicationService";
import { SessionApplicationService } from "../application/SessionApplicationService";
import { ConfigApplicationService } from "../application/ConfigApplicationService";
import { OnboardApplicationService } from "../application/OnboardApplicationService";

import { GitGateway } from "../infrastructure/GitGateway";
import { SpecGitGateway } from "../infrastructure/SpecGitGateway";
import { FileSystemGateway } from "../infrastructure/FileSystemGateway";
import { SpecReader } from "../services/SpecReader";
import { RepoScanner } from "../services/RepoScanner";

export type HandlerContext = {
  databaseService: DatabaseService;
  configManager: ConfigManager;
  sessionManager: SessionManager;
  specSyncService: SpecSyncService;
  jobManager: BackgroundJobManager;
  repoRepository: RepoRepository;
  scanQueue: ScanQueue;
  terminalService: TerminalApplicationService;
  aiSessionService: AISessionApplicationService;
};

export function registerHandlers(bridge: IPCBridge, context: HandlerContext): void {
  // Instantiate infrastructure gateways
  const gitGateway = new GitGateway();
  const specGitGateway = new SpecGitGateway();
  const fileSystemGateway = new FileSystemGateway();
  const specReader = new SpecReader();
  const repoScanner = new RepoScanner(3);

  // Create application services with injected dependencies
  const repoService = new RepoApplicationService(
    context.repoRepository,
    context.configManager,
    context.scanQueue,
    context.specSyncService,
    repoScanner,
  );
  const specService = new SpecApplicationService(context.specSyncService, specReader, specGitGateway);
  const fileService = new FileApplicationService(fileSystemGateway);
  const worktreeService = new WorktreeApplicationService(gitGateway);
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

  registerAISessionHandlers({ bridge, aiSessionService: context.aiSessionService });
}
