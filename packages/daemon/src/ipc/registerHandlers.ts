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
import { registerGitMetadataHandlers } from "./handlers/gitMetadataHandlers";

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
import { GitBlameGateway } from "../infrastructure/GitBlameGateway";
import { GitCloneGateway } from "../infrastructure/GitCloneGateway";
import { GitCloneApplicationService } from "../application/GitCloneApplicationService";
import { registerGitCloneHandlers } from "./handlers/gitCloneHandlers";
import { GitHistoryGateway } from "../infrastructure/GitHistoryGateway";
import { GitHistoryApplicationService } from "../application/GitHistoryApplicationService";
import { registerGitHistoryHandlers } from "./handlers/gitHistoryHandlers";
import { GitStashRemoteGateway } from "../infrastructure/GitStashRemoteGateway";
import { GitStashApplicationService } from "../application/GitStashApplicationService";
import { GitRemoteApplicationService } from "../application/GitRemoteApplicationService";
import { registerGitStashHandlers } from "./handlers/gitStashHandlers";
import { registerGitRemoteHandlers } from "./handlers/gitRemoteHandlers";
import type { SpecGitGateway } from "../infrastructure/SpecGitGateway";
import type { FileSystemGateway } from "../infrastructure/FileSystemGateway";
import type { SpecReader } from "../services/SpecReader";
import type { RepoScanner } from "../services/RepoScanner";
import type { CliVersionApplicationService } from "../application/CliVersionApplicationService";
import { registerCliVersionHandlers } from "./handlers/cliVersionHandlers";

export type HandlerContext = {
  databaseService: DatabaseService;
  configManager: ConfigManager;
  specSyncService: SpecSyncService;
  jobManager: BackgroundJobManager;
  repoRepository: RepoRepository;
  scanQueue: ScanQueue;
  /** Shared with ScanQueue — do NOT construct another instance here. */
  scanner: RepoScanner;
  terminalService: TerminalApplicationService;
  aiSessionService: AISessionApplicationService;
  sessionSyncService: SessionSyncApplicationService;
  gitGateway: GitGateway;
  /** Read-side gateways owned by DaemonContainer. */
  fileSystemGateway: FileSystemGateway;
  specGitGateway: SpecGitGateway;
  specReader: SpecReader;
  cliVersionService: CliVersionApplicationService;
};

export function registerHandlers(bridge: IPCBridge, context: HandlerContext): void {
  // Every infrastructure gateway is owned by DaemonContainer and passed in
  // via `context`; we no longer construct fresh instances here. This kills
  // the previous duplicate `RepoScanner` instance and keeps a single
  // `FileSystemGateway` with one authoritative allowlist provider.
  const { gitGateway, specGitGateway, fileSystemGateway, specReader } = context;

  // Create application services with injected dependencies
  const repoService = new RepoApplicationService(
    context.repoRepository,
    context.configManager,
    context.scanQueue,
    context.specSyncService,
    context.scanner,
  );
  const specService = new SpecApplicationService(context.specSyncService, specReader, specGitGateway);
  const worktreeService = new WorktreeApplicationService(gitGateway, context.repoRepository);

  registerRepoHandlers({ bridge, repoService });
  registerSpecHandlers({ bridge, specService });
  registerGitMetadataHandlers({ bridge, specService, specGitGateway });
  registerConfigHandlers({ bridge, configManager: context.configManager });
  registerFileHandlers({ bridge, fileSystemGateway });
  registerWorktreeHandlers({ bridge, worktreeService });

  const onboardService = new OnboardApplicationService(bridge, context.configManager);
  registerOnboardHandlers({ bridge, onboardService });

  registerTerminalHandlers({ bridge, terminalService: context.terminalService, allowlistProvider: context.configManager });

  registerAISessionHandlers({ bridge, aiSessionService: context.aiSessionService });

  registerSyncedSessionHandlers({ bridge, sessionSyncService: context.sessionSyncService });

  const gitOpsGateway = new GitOperationsGateway();
  const gitBlameGateway = new GitBlameGateway();
  const gitService = new GitApplicationService(gitOpsGateway, gitBlameGateway);
  registerGitOperationHandlers({ bridge, gitService });

  const gitCloneGateway = new GitCloneGateway();
  const gitCloneService = new GitCloneApplicationService(
    gitCloneGateway,
    context.configManager,
    context.scanQueue,
    bridge,
  );
  registerGitCloneHandlers({ bridge, cloneService: gitCloneService });

  const gitHistoryGateway = new GitHistoryGateway();
  const gitHistoryService = new GitHistoryApplicationService(gitHistoryGateway);
  registerGitHistoryHandlers({ bridge, historyService: gitHistoryService });

  const stashRemoteGateway = new GitStashRemoteGateway();
  const stashService = new GitStashApplicationService(stashRemoteGateway);
  const remoteService = new GitRemoteApplicationService(stashRemoteGateway);
  registerGitStashHandlers({ bridge, stashService });
  registerGitRemoteHandlers({ bridge, remoteService });

  registerCliVersionHandlers({ bridge, cliVersionService: context.cliVersionService });
}
