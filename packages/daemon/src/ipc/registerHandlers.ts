import type { ConfigManager } from "../config/ConfigManager";
import type { DatabaseService } from "../db/DatabaseService";
import type { SpecSyncService } from "../services/SpecSyncService";
import type { BackgroundJobManager } from "../services/BackgroundJobManager";
import type { RepoRepository } from "../services/RepoRepository";
import type { ScanQueue } from "../services/ScanQueue";
import type { TerminalApplicationService } from "../application/TerminalApplicationService";
import type { AISessionApplicationService } from "../application/AISessionApplicationService";
import type { SessionSyncApplicationService } from "../application/SessionSyncApplicationService";
import { registerRepoHandlers } from "./handlers/repoHandlers";
import { registerSpecHandlers } from "./handlers/specHandlers";

import { IPCBridge } from "./IPCBridge";
import { registerConfigHandlers } from "./handlers/configHandlers";
import { registerFileHandlers } from "./handlers/fileHandlers";
import { registerWorktreeHandlers } from "./handlers/worktreeHandlers";
import { registerOnboardHandlers } from "./handlers/onboardHandlers";
import { registerTerminalHandlers } from "./handlers/terminalHandlers";
import { registerAISessionHandlers } from "./handlers/aiSessionHandlers";
import { registerSyncedSessionHandlers } from "./handlers/syncedSessionHandlers";
import { registerGitOperationHandlers } from "./handlers/gitOperationHandlers";

import { RepoApplicationService } from "../application/RepoApplicationService";
import { SpecApplicationService } from "../application/SpecApplicationService";
import { WorktreeApplicationService } from "../application/WorktreeApplicationService";
import { OnboardApplicationService } from "../application/OnboardApplicationService";

import type { GitGateway } from "../infrastructure/GitGateway";
import { GitOperationsGateway } from "../infrastructure/GitOperationsGateway";
import { GitApplicationService } from "../application/GitApplicationService";
import { SpecGitGateway } from "../infrastructure/SpecGitGateway";
import { FileSystemGateway } from "../infrastructure/FileSystemGateway";
import { SpecReader } from "../services/SpecReader";
import { RepoScanner } from "../services/RepoScanner";

export type HandlerContext = {
  databaseService: DatabaseService;
  configManager: ConfigManager;
  specSyncService: SpecSyncService;
  jobManager: BackgroundJobManager;
  repoRepository: RepoRepository;
  scanQueue: ScanQueue;
  terminalService: TerminalApplicationService;
  aiSessionService: AISessionApplicationService;
  sessionSyncService: SessionSyncApplicationService;
  gitGateway: GitGateway;
};

export function registerHandlers(bridge: IPCBridge, context: HandlerContext): void {
  // Use shared infrastructure gateways
  const gitGateway = context.gitGateway;
  const specGitGateway = new SpecGitGateway();
  const fileSystemGateway = new FileSystemGateway(context.configManager);
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
  const worktreeService = new WorktreeApplicationService(gitGateway, context.repoRepository);

  registerRepoHandlers({ bridge, repoService });
  registerSpecHandlers({ bridge, specService });
  registerConfigHandlers({ bridge, configManager: context.configManager });
  registerFileHandlers({ bridge, fileSystemGateway });
  registerWorktreeHandlers({ bridge, worktreeService });

  const onboardService = new OnboardApplicationService(bridge, context.configManager);
  registerOnboardHandlers({ bridge, onboardService });

  registerTerminalHandlers({ bridge, terminalService: context.terminalService, allowlistProvider: context.configManager });

  registerAISessionHandlers({ bridge, aiSessionService: context.aiSessionService });

  registerSyncedSessionHandlers({ bridge, sessionSyncService: context.sessionSyncService });

  const gitOpsGateway = new GitOperationsGateway();
  const gitService = new GitApplicationService(gitOpsGateway);
  registerGitOperationHandlers({ bridge, gitService });
}
