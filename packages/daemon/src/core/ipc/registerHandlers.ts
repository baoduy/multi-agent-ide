import type { ConfigManager } from "../config/ConfigManager";
import type { DatabaseService } from "../db/DatabaseService";
import type { SpecSyncService } from "../../modules/specs/persistence/SpecSyncService";
import type { BackgroundJobManager } from "../../modules/jobs/BackgroundJobManager";
import type { RepoRepository } from "../../modules/repos/persistence/RepoRepository";
import type { ScanQueue } from "../../modules/repos/persistence/ScanQueue";
import type { TerminalApplicationService } from "../../modules/terminal/app/TerminalApplicationService";
import type { AISessionApplicationService } from "../../modules/agent-cli/app/AISessionApplicationService";
import type { SessionSyncApplicationService } from "../../modules/synced-sessions/app/SessionSyncApplicationService";
import type { WorktreeSyncApplicationService } from "../../modules/worktrees/app/WorktreeSyncApplicationService";
import { registerRepoHandlers } from "../../modules/repos/handlers/repoHandlers";
import { registerSpecHandlers } from "../../modules/specs/handlers/specHandlers";
import { registerGitMetadataHandlers } from "../../modules/repos/handlers/gitMetadataHandlers";

import { IPCBridge } from "./IPCBridge";
import { registerConfigHandlers } from "../../modules/config/handlers/configHandlers";
import { registerFileHandlers } from "../../modules/filesystem/handlers/fileHandlers";
import { registerWorktreeHandlers } from "../../modules/worktrees/handlers/worktreeHandlers";
import { registerOnboardHandlers } from "../../modules/config/handlers/onboardHandlers";
import { registerTerminalHandlers } from "../../modules/terminal/handlers/terminalHandlers";
import { registerAISessionHandlers } from "../../modules/agent-cli/handlers/aiSessionHandlers";
import { registerSyncedSessionHandlers } from "../../modules/synced-sessions/handlers/syncedSessionHandlers";
import { registerGitOperationHandlers } from "../../modules/repos/handlers/gitOperationHandlers";

import { RepoApplicationService } from "../../modules/repos/app/RepoApplicationService";
import { SpecApplicationService } from "../../modules/specs/app/SpecApplicationService";
import { WorktreeApplicationService } from "../../modules/worktrees/app/WorktreeApplicationService";
import { OnboardApplicationService } from "../../modules/config/app/OnboardApplicationService";

import type { GitGateway } from "../../modules/repos/infra/GitGateway";
import { GitOperationsGateway } from "../../modules/repos/infra/GitOperationsGateway";
import { GitApplicationService } from "../../modules/repos/app/GitApplicationService";
import { GitBlameGateway } from "../../modules/repos/infra/GitBlameGateway";
import { GitCloneGateway } from "../../modules/repos/infra/GitCloneGateway";
import { GitCloneApplicationService } from "../../modules/repos/app/GitCloneApplicationService";
import { registerGitCloneHandlers } from "../../modules/repos/handlers/gitCloneHandlers";
import { GitHistoryGateway } from "../../modules/repos/infra/GitHistoryGateway";
import { GitHistoryApplicationService } from "../../modules/repos/app/GitHistoryApplicationService";
import { registerGitHistoryHandlers } from "../../modules/repos/handlers/gitHistoryHandlers";
import { GitStashRemoteGateway } from "../../modules/repos/infra/GitStashRemoteGateway";
import { GitStashApplicationService } from "../../modules/repos/app/GitStashApplicationService";
import { GitRemoteApplicationService } from "../../modules/repos/app/GitRemoteApplicationService";
import { registerGitStashHandlers } from "../../modules/repos/handlers/gitStashHandlers";
import { registerGitRemoteHandlers } from "../../modules/repos/handlers/gitRemoteHandlers";
import type { SpecGitGateway } from "../../modules/specs/infra/SpecGitGateway";
import type { FileSystemGateway } from "../../modules/filesystem/infra/FileSystemGateway";
import type { SpecReader } from "../../modules/specs/persistence/SpecReader";
import type { RepoScanner } from "../../modules/repos/persistence/RepoScanner";
import type { CliVersionApplicationService } from "../../modules/agent-cli/app/CliVersionApplicationService";
import { registerCliVersionHandlers } from "../../modules/agent-cli/handlers/cliVersionHandlers";
import type { SpecifyExtensionApplicationService } from "../../modules/specs/app/SpecifyExtensionApplicationService";
import type { AiEditApplicationService } from "../../modules/agent-cli/app/AiEditApplicationService";
import { registerAiEditHandlers } from "../../modules/agent-cli/handlers/aiEditHandlers";
import type { ChatThreadService } from "../../modules/chat/app/ChatThreadService";
import { registerChatThreadHandlers } from "../../modules/chat/handlers/chatThreadHandlers";
import type { AIRunOnceApplicationService } from "../../modules/agent-cli/app/AIRunOnceApplicationService";
import { registerAIRunOnceHandlers } from "../../modules/agent-cli/handlers/aiRunOnceHandlers";
import type { AiBareRunApplicationService } from "../../modules/agent-cli/app/AiBareRunApplicationService";
import { registerAiBareRunHandlers } from "../../modules/agent-cli/handlers/aiBareRunHandlers";
import type { FileWatchService } from "../../modules/filesystem/app/FileWatchService";
import { registerFileWatchHandlers } from "../../modules/filesystem/handlers/fileWatchHandlers";
import type { AiPresetService } from "../../modules/agent-cli/app/AiPresetService";
import { registerAiPresetHandlers } from "../../modules/agent-cli/handlers/aiPresetHandlers";
import type { AgentService } from "../../modules/agent-cli/app/AgentService";
import type { PluginDirService } from "../../modules/config/app/PluginDirService";
import { registerAgentsHandlers } from "../../modules/agent-cli/handlers/agentsHandlers";
import type { PermissionPromptCoordinator } from "../../modules/agent-cli/app/PermissionPromptCoordinator";
import type { DebugLogService } from "../observability/DebugLogService";
import { registerDebugLogHandlers } from "../../modules/agent-cli/handlers/aiSessionDebugLog";
import { registerAiEnvOtelStatus } from "../../modules/agent-cli/handlers/aiEnvOtelStatus";
import type { GitBatchGateway } from "../../modules/repos/infra/GitBatchGateway";
import type { GitRepoWatcher } from "../../modules/repos/infra/GitRepoWatcher";
import type { LogResult, CommitDetailResult } from "../../modules/repos/infra/GitHistoryGateway";
import type { LruCache } from "../utils/LruCache";

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
  worktreeSyncService: WorktreeSyncApplicationService;
  gitGateway: GitGateway;
  /** Read-side gateways owned by DaemonContainer. */
  fileSystemGateway: FileSystemGateway;
  specGitGateway: SpecGitGateway;
  specReader: SpecReader;
  cliVersionService: CliVersionApplicationService;
  specifyExtensionService: SpecifyExtensionApplicationService;
  /** Git perf foundation — owned by DaemonContainer. */
  gitBatchGateway: GitBatchGateway;
  gitRepoWatcher: GitRepoWatcher;
  logCache: LruCache<string, LogResult>;
  commitDetailCache: LruCache<string, CommitDetailResult>;
  aiEditService: AiEditApplicationService;
  aiRunOnceService: AIRunOnceApplicationService;
  aiBareRunService: AiBareRunApplicationService;
  fileWatchService: FileWatchService;
  aiPresetService: AiPresetService;
  agentService: AgentService;
  pluginDirService: PluginDirService;
  permissionCoordinator: PermissionPromptCoordinator;
  /** Phase 7 — debug-log allocator/tailer. */
  debugLogService: DebugLogService;
  /** Phase 8 — resumable chat-bubble threads. */
  chatThreadService: ChatThreadService;
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
  registerFileHandlers({ bridge, fileSystemGateway, fileWatchService: context.fileWatchService });
  registerWorktreeHandlers({ bridge, worktreeService, worktreeSyncService: context.worktreeSyncService });

  const onboardService = new OnboardApplicationService(
    bridge,
    context.configManager,
    context.specifyExtensionService,
  );
  registerOnboardHandlers({ bridge, onboardService });

  registerTerminalHandlers({ bridge, terminalService: context.terminalService, allowlistProvider: context.configManager });

  registerAISessionHandlers({
    bridge,
    aiSessionService: context.aiSessionService,
    permissionCoordinator: context.permissionCoordinator,
  });

  registerAIRunOnceHandlers({ bridge, runOnceService: context.aiRunOnceService });

  registerAiBareRunHandlers({
    bridge,
    aiBareRunApplicationService: context.aiBareRunService,
  });

  registerSyncedSessionHandlers({ bridge, sessionSyncService: context.sessionSyncService });

  const gitOpsGateway = new GitOperationsGateway();
  const gitBlameGateway = new GitBlameGateway();
  const gitService = new GitApplicationService(gitOpsGateway, gitBlameGateway);
  registerGitOperationHandlers({ bridge, gitService, gitRepoWatcher: context.gitRepoWatcher });

  const gitCloneGateway = new GitCloneGateway();
  const gitCloneService = new GitCloneApplicationService(
    gitCloneGateway,
    context.configManager,
    context.scanQueue,
    bridge,
    fileSystemGateway,
  );
  registerGitCloneHandlers({ bridge, cloneService: gitCloneService });

  const gitHistoryGateway = new GitHistoryGateway(context.gitBatchGateway, {
    logCache: context.logCache,
    commitDetailCache: context.commitDetailCache,
  });
  const gitHistoryService = new GitHistoryApplicationService(gitHistoryGateway);
  registerGitHistoryHandlers({ bridge, historyService: gitHistoryService, gitRepoWatcher: context.gitRepoWatcher });

  const stashRemoteGateway = new GitStashRemoteGateway();
  const stashService = new GitStashApplicationService(stashRemoteGateway);
  const remoteService = new GitRemoteApplicationService(stashRemoteGateway);
  registerGitStashHandlers({ bridge, stashService });
  registerGitRemoteHandlers({ bridge, remoteService });

  registerCliVersionHandlers({ bridge, cliVersionService: context.cliVersionService });

  registerAiEditHandlers({ bridge, aiEditService: context.aiEditService });

  registerChatThreadHandlers({ bridge, chatThreadService: context.chatThreadService });

  registerFileWatchHandlers({ bridge, fileWatchService: context.fileWatchService });

  registerAiPresetHandlers({ bridge, service: context.aiPresetService });

  registerAgentsHandlers({
    bridge,
    agentService: context.agentService,
    pluginDirService: context.pluginDirService,
  });

  // Phase 7 — debug-log tail-follow + OTel env-status panel.
  registerDebugLogHandlers(bridge, context.debugLogService);
  registerAiEnvOtelStatus(bridge);
}
