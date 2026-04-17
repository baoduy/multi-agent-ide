import { z } from "zod";
import { MAIN_TABS, PIPELINE_STAGES, REPO_STATUSES, STAGE_STATUSES } from "./constants";
import { MagentaConfigSchema } from "./config";
import { AI_PROVIDERS, AI_SESSION_STATUSES, AI_PERMISSION_MODES, AISessionRecordSchema, ProviderMetaSchema } from "./aiTerminal";
import { SYNCED_SESSION_PROVIDERS, SyncedSessionRecordSchema } from "./syncedSession";
import { CliToolIdSchema, CliToolStatusSchema } from "./cliTools";

export const RepositorySchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  branch: z.string(),
  hasSpecs: z.boolean(),
  specCount: z.number().int().nonnegative(),
  status: z.enum(REPO_STATUSES),
  scannedAt: z.number().int().nonnegative(),
  createdAt: z.number().int().nonnegative(),
});

export const PipelineStageSchema = z.object({
  name: z.enum(PIPELINE_STAGES),
  status: z.enum(STAGE_STATUSES),
  filePath: z.string().nullable(),
  metadata: z
    .object({
      taskCount: z.number().int().nonnegative().optional(),
      completedCount: z.number().int().nonnegative().optional(),
      worktreeCount: z.number().int().nonnegative().optional(),
      implementationProgress: z.number().min(0).max(100).optional(),
      approvedBy: z.string().optional(),
      approvedAt: z.string().optional(),
    })
    .optional(),
});

export const SpecFolderSchema = z.object({
  id: z.string(),
  repoPath: z.string(),
  name: z.string(),
  path: z.string(),
  branch: z.string().optional(),
  isCurrentBranch: z.boolean().optional(),
  stages: z.array(PipelineStageSchema),
  files: z.array(z.string()),
  createdAt: z.number().int().nonnegative(),
});

export const SessionStateSchema = z.object({
  selectedRepoPath: z.string().nullable(),
  selectedSpecPath: z.string().nullable(),
  selectedFilePath: z.string().nullable(),
  sidebarWidth: z.number().int().positive().nullable(),
  activityPanelWidth: z.number().int().positive().nullable(),
  activityPanelOpen: z.boolean(),
  sidebarCollapsed: z.boolean(),
  activityCollapsed: z.boolean(),
  specPanelHeight: z.number().int().positive().nullable(),
  mainTab: z.enum(MAIN_TABS),
  updatedAt: z.number().int().nonnegative(),
});

export const IpcRequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("repo:list") }),
  z.object({ type: z.literal("repo:scan") }),
  z.object({ type: z.literal("spec:list"), repoPath: z.string() }),
  z.object({ type: z.literal("file:read"), filePath: z.string() }),
  z.object({ type: z.literal("file:write"), filePath: z.string(), content: z.string() }),
  z.object({ type: z.literal("file:delete"), filePath: z.string() }),
  z.object({ type: z.literal("file:rename"), oldPath: z.string(), newPath: z.string() }),
  z.object({ type: z.literal("dir:list"), dirPath: z.string() }),
  // NOTE: session:get / session:update removed — session state now persisted in localStorage
  z.object({ type: z.literal("config:get") }),
  z.object({ type: z.literal("config:add-working-dir"), path: z.string() }),
  z.object({ type: z.literal("config:remove-working-dir"), path: z.string() }),
  // Only known, validated config keys may be updated. Using `.partial()` on
  // the canonical schema prevents callers from smuggling arbitrary keys into
  // the persisted config file via the IPC boundary.
  z.object({ type: z.literal("config:update"), config: MagentaConfigSchema.partial() }),
  z.object({ type: z.literal("branch:list"), repoPath: z.string() }),
  z.object({ type: z.literal("branch:checkout"), repoPath: z.string(), branch: z.string() }),
  // `ref` is passed directly to `git show` — restrict it to characters that
  // can appear in a branch/tag/commit name. `relativePath` must stay inside
  // the repo tree, so reject anything starting with `/`, containing `..`
  // segments, or containing a NUL byte.
  z.object({
    type: z.literal("gitfile:read"),
    repoPath: z.string(),
    ref: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[A-Za-z0-9._/\-]+$/, "ref contains invalid characters"),
    relativePath: z
      .string()
      .min(1)
      .max(1024)
      .refine(
        (p) => !p.startsWith("/") && !p.includes("\0") && !p.split(/[\\/]/).includes(".."),
        "relativePath must be a repo-relative path without .. segments",
      ),
  }),
  z.object({ type: z.literal("worktree:create"), repoPath: z.string(), branch: z.string(), name: z.string() }),
  z.object({ type: z.literal("worktree:list"), repoPath: z.string().optional() }),
  // `aiAgent` is templated into a shell-free spawn command below; restrict
  // it to simple identifiers so no shell metacharacters can be smuggled in.
  z.object({ type: z.literal("repo:onboard"), repoPath: z.string(), aiAgent: z.string().regex(/^[a-z0-9_-]+$/, "aiAgent must be a simple identifier"), useWorktree: z.boolean().optional() }),
  z.object({ type: z.literal("repo:specify-status"), repoPath: z.string() }),
  z.object({ type: z.literal("repo:specify-switch"), repoPath: z.string(), aiAgent: z.string().regex(/^[a-z0-9_-]+$/, "aiAgent must be a simple identifier") }),
  z.object({ type: z.literal("repo:onboard:cancel"), repoPath: z.string() }),
  z.object({ type: z.literal("repo:force-reload"), repoPath: z.string() }),
  z.object({ type: z.literal("git:user"), repoPath: z.string() }),
  z.object({ type: z.literal("worktree:status"), repoPath: z.string(), worktreePath: z.string() }),
  z.object({ type: z.literal("worktree:merge"), repoPath: z.string(), worktreePath: z.string(), worktreeBranch: z.string(), targetBranch: z.string() }),
  z.object({ type: z.literal("worktree:branches"), repoPath: z.string() }),
  z.object({ type: z.literal("worktree:delete"), repoPath: z.string(), worktreePath: z.string() }),
  z.object({ type: z.literal("terminal:spawn"), cwd: z.string(), cols: z.number().int().positive(), rows: z.number().int().positive() }),
  z.object({ type: z.literal("terminal:input"), sessionId: z.string(), data: z.string() }),
  z.object({ type: z.literal("terminal:resize"), sessionId: z.string(), cols: z.number().int().positive(), rows: z.number().int().positive() }),
  z.object({ type: z.literal("terminal:close"), sessionId: z.string() }),
  z.object({ type: z.literal("terminal:attach"), sessionId: z.string(), fromSeq: z.number().int().nonnegative().optional() }),
  z.object({ type: z.literal("terminal:ack"), sessionId: z.string(), seq: z.number().int().nonnegative() }),
  // `args` passthrough removed — any dangerous flag (e.g. Claude's
  // `--dangerously-skip-permissions`) could be smuggled through this vector.
  // Permission controls now go exclusively through `permissionMode`, and the
  // session UUID handoff goes through `providerSessionId`.
  z.object({ type: z.literal("ai-session:create"), provider: z.enum(AI_PROVIDERS), repoPath: z.string().optional(), branch: z.string().optional(), worktreePath: z.string().optional(), permissionMode: z.enum(AI_PERMISSION_MODES).optional(), providerSessionId: z.string().optional(), cols: z.number().int().positive(), rows: z.number().int().positive() }),
  z.object({ type: z.literal("ai-session:resume"), sessionId: z.string(), cols: z.number().int().positive(), rows: z.number().int().positive() }),
  z.object({ type: z.literal("ai-session:input"), sessionId: z.string(), data: z.string() }),
  z.object({ type: z.literal("ai-session:resize"), sessionId: z.string(), cols: z.number().int().positive(), rows: z.number().int().positive() }),
  z.object({ type: z.literal("ai-session:stop"), sessionId: z.string() }),
  z.object({ type: z.literal("ai-session:attach"), sessionId: z.string(), fromSeq: z.number().int().nonnegative().optional() }),
  z.object({ type: z.literal("ai-session:ack"), sessionId: z.string(), seq: z.number().int().nonnegative() }),
  z.object({ type: z.literal("ai-session:list") }),
  z.object({ type: z.literal("ai-session:delete"), sessionId: z.string() }),
  z.object({ type: z.literal("ai-session:providers") }),
  z.object({ type: z.literal("ai-session:set-permission-mode"), sessionId: z.string(), permissionMode: z.enum(AI_PERMISSION_MODES) }),
  z.object({ type: z.literal("ai-session:running-count") }),
  z.object({ type: z.literal("ai-session:check-worktree"), worktreePath: z.string(), repoPath: z.string() }),
  // Synced session scanning
  z.object({ type: z.literal("synced-session:list"), provider: z.enum(SYNCED_SESSION_PROVIDERS).optional() }),
  z.object({ type: z.literal("synced-session:trigger-sync") }),
  z.object({ type: z.literal("synced-session:archive"), id: z.string() }),
  // UI visibility signal — the renderer tells the daemon whether the AI title-bar
  // tab is currently the active top-level tab. The session sync job only runs
  // while the AI tab is active; switching away pauses the recurring sweep.
  z.object({ type: z.literal("ui:ai-tab-active"), active: z.boolean() }),
  // Git operations
  z.object({ type: z.literal("branch:create"), repoPath: z.string(), branchName: z.string(), startPoint: z.string().optional() }),
  z.object({ type: z.literal("git:fetch"), repoPath: z.string(), remote: z.string().optional() }),
  z.object({ type: z.literal("git:pull"), repoPath: z.string(), remote: z.string().optional(), branch: z.string().optional() }),
  z.object({ type: z.literal("git:push"), repoPath: z.string(), remote: z.string().optional(), branch: z.string().optional(), force: z.boolean().optional() }),
  z.object({ type: z.literal("git:status"), repoPath: z.string() }),
  z.object({
    type: z.literal("git:commit"),
    repoPath: z.string(),
    message: z.string(),
    files: z.array(z.string()),
    push: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("git:ls-files"),
    repoPath: z.string(),
    pattern: z.string().min(1).max(200),
    ref: z.string().min(1).max(200).regex(/^[A-Za-z0-9._/\-]+$/, "ref contains invalid characters").optional(),
  }),
  // Git clone. `targetDir` must be an existing allowlisted working-dir; the clone
  // creates a child folder named `folderName` inside it.
  z.object({
    type: z.literal("git:clone"),
    url: z.string().min(1).max(2048),
    targetDir: z.string().min(1),
    folderName: z.string().min(1).max(200).regex(/^[A-Za-z0-9._\-]+$/, "folder name contains invalid characters"),
    depth: z.number().int().positive().max(10000).optional(),
  }),
  // Commit history — paginated. Limit capped at 500 to avoid blocking the daemon.
  z.object({
    type: z.literal("git:log"),
    repoPath: z.string(),
    branch: z.string().optional(),
    path: z.string().optional(),
    limit: z.number().int().positive().max(500).default(100),
    skip: z.number().int().nonnegative().default(0),
    search: z.string().max(200).optional(),
  }),
  // Detailed view of a single commit: message + file list with +/-.
  z.object({
    type: z.literal("git:commit-detail"),
    repoPath: z.string(),
    sha: z.string().regex(/^[a-f0-9]{4,40}$/),
  }),
  // Diff between two refs (or ref vs working tree) for a given path.
  z.object({
    type: z.literal("git:diff"),
    repoPath: z.string(),
    fromRef: z.string().max(200).optional(),
    toRef: z.string().max(200).optional(),
    path: z.string().min(1).max(2048),
  }),
  // Stash
  z.object({ type: z.literal("stash:list"), repoPath: z.string() }),
  z.object({
    type: z.literal("stash:push"),
    repoPath: z.string(),
    message: z.string().max(500).optional(),
    includeUntracked: z.boolean().optional(),
  }),
  z.object({ type: z.literal("stash:pop"), repoPath: z.string(), index: z.number().int().nonnegative() }),
  z.object({ type: z.literal("stash:apply"), repoPath: z.string(), index: z.number().int().nonnegative() }),
  z.object({ type: z.literal("stash:drop"), repoPath: z.string(), index: z.number().int().nonnegative() }),
  z.object({ type: z.literal("stash:show"), repoPath: z.string(), index: z.number().int().nonnegative() }),
  // Remotes
  z.object({ type: z.literal("remote:list"), repoPath: z.string() }),
  z.object({
    type: z.literal("remote:add"),
    repoPath: z.string(),
    name: z.string().min(1).max(100).regex(/^[A-Za-z0-9._\-]+$/, "remote name contains invalid characters"),
    url: z.string().min(1).max(2048),
  }),
  z.object({
    type: z.literal("remote:rename"),
    repoPath: z.string(),
    oldName: z.string().min(1).max(100),
    newName: z.string().min(1).max(100).regex(/^[A-Za-z0-9._\-]+$/, "remote name contains invalid characters"),
  }),
  z.object({ type: z.literal("remote:remove"), repoPath: z.string(), name: z.string().min(1).max(100) }),
  z.object({
    type: z.literal("remote:set-url"),
    repoPath: z.string(),
    name: z.string().min(1).max(100),
    url: z.string().min(1).max(2048),
  }),
  // Branch extras
  z.object({ type: z.literal("branch:delete"), repoPath: z.string(), branch: z.string().min(1), force: z.boolean().optional() }),
  z.object({ type: z.literal("branch:rename"), repoPath: z.string(), oldName: z.string().min(1), newName: z.string().min(1) }),
  // File CRUD extras
  z.object({ type: z.literal("file:create"), filePath: z.string(), content: z.string().optional() }),
  z.object({ type: z.literal("dir:create"), dirPath: z.string() }),
  // Reset / revert / blame
  z.object({
    type: z.literal("git:reset"),
    repoPath: z.string(),
    mode: z.enum(["soft", "mixed", "hard"]),
    ref: z.string().min(1).max(200),
    confirmHard: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("git:revert"),
    repoPath: z.string(),
    sha: z.string().regex(/^[a-f0-9]{4,40}$/),
    noCommit: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("git:blame"),
    repoPath: z.string(),
    path: z.string().min(1).max(2048),
    ref: z.string().max(200).optional(),
  }),
  // CLI tool version tracking — `repoPath` is optional and only used to
  // detect Specify's current version from `<repo>/.specify/init-options.json`.
  z.object({ type: z.literal("cli:get-version-status"), repoPath: z.string().optional() }),
  z.object({ type: z.literal("cli:recheck"), repoPath: z.string().optional() }),
  z.object({ type: z.literal("cli:upgrade"), tool: CliToolIdSchema }),
  z.object({ type: z.literal("cli:upgrade:cancel"), tool: CliToolIdSchema }),
]);

export const GitFileStatusSchema = z.object({
  path: z.string(),
  status: z.enum(["modified", "added", "deleted", "renamed", "untracked", "conflicted"]),
  staged: z.boolean(),
  oldPath: z.string().optional(),
});

export const CommitSummarySchema = z.object({
  sha: z.string(),
  shortSha: z.string(),
  authorName: z.string(),
  authorEmail: z.string(),
  timestamp: z.number().int().nonnegative(),
  subject: z.string(),
  body: z.string(),
  parents: z.array(z.string()),
  refs: z.array(z.string()),
});

export const CommitFileSchema = z.object({
  path: z.string(),
  oldPath: z.string().optional(),
  status: z.enum(["added", "modified", "deleted", "renamed", "copied"]),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
});

export type CommitSummary = z.infer<typeof CommitSummarySchema>;
export type CommitFile = z.infer<typeof CommitFileSchema>;

export const StashEntrySchema = z.object({
  index: z.number().int().nonnegative(),
  message: z.string(),
  branch: z.string().optional(),
  timestamp: z.number().int().nonnegative(),
});

export const RemoteSchema = z.object({
  name: z.string(),
  fetchUrl: z.string(),
  pushUrl: z.string(),
});

export type StashEntry = z.infer<typeof StashEntrySchema>;
export type Remote = z.infer<typeof RemoteSchema>;

export const BlameLineSchema = z.object({
  lineNo: z.number().int().positive(),
  sha: z.string(),
  shortSha: z.string(),
  author: z.string(),
  timestamp: z.number().int().nonnegative(),
  content: z.string(),
});

export type BlameLine = z.infer<typeof BlameLineSchema>;

export const IpcResponseSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("repo:list:result"), repos: z.array(RepositorySchema) }),
  z.object({ type: z.literal("repo:scan:started") }),
  z.object({
    type: z.literal("repo:scan:progress"),
    scanned: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    currentDir: z.string(),
  }),
  z.object({
    type: z.literal("repo:scan:complete"),
    repos: z.array(RepositorySchema),
    added: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    missing: z.number().int().nonnegative(),
  }),
  z.object({ type: z.literal("spec:list:result"), repoPath: z.string(), specs: z.array(SpecFolderSchema) }),
  z.object({ type: z.literal("spec:sync:started"), repoPath: z.string() }),
  z.object({ type: z.literal("spec:sync:complete"), repoPath: z.string(), success: z.boolean(), error: z.string().optional() }),
  // NOTE: session:response / session:updated removed — session state now in localStorage
  z.object({ type: z.literal("config:response"), config: MagentaConfigSchema }),
  z.object({ type: z.literal("config:updated"), config: MagentaConfigSchema }),
  z.object({ type: z.literal("file:read:result"), filePath: z.string(), content: z.string() }),
  z.object({ type: z.literal("file:write:result"), filePath: z.string(), success: z.boolean() }),
  z.object({ type: z.literal("file:delete:result"), filePath: z.string(), success: z.boolean() }),
  z.object({ type: z.literal("file:rename:result"), oldPath: z.string(), newPath: z.string(), success: z.boolean() }),
  z.object({
    type: z.literal("dir:list:result"),
    dirPath: z.string(),
    entries: z.array(z.object({ name: z.string(), path: z.string(), isDirectory: z.boolean() })),
  }),
  z.object({ type: z.literal("branch:list:result"), repoPath: z.string(), branches: z.array(z.string()), current: z.string() }),
  z.object({ type: z.literal("branch:checkout:result"), repoPath: z.string(), branch: z.string(), success: z.boolean() }),
  z.object({ type: z.literal("gitfile:read:result"), filePath: z.string(), content: z.string() }),
  z.object({ type: z.literal("worktree:create:result"), repoPath: z.string(), worktreePath: z.string(), branch: z.string(), success: z.boolean() }),
  z.object({
    type: z.literal("worktree:list:result"),
    worktrees: z.array(z.object({
      repoPath: z.string(),
      worktreePath: z.string(),
      branch: z.string(),
      name: z.string(),
      createdAt: z.number().int().nonnegative(),
    })),
  }),
  z.object({ type: z.literal("repo:onboard:started"), repoPath: z.string() }),
  z.object({ type: z.literal("repo:onboard:output"), repoPath: z.string(), data: z.string() }),
  z.object({ type: z.literal("repo:onboard:complete"), repoPath: z.string(), success: z.boolean(), error: z.string().optional() }),
  z.object({ type: z.literal("repo:onboard:cancelled"), repoPath: z.string() }),
  z.object({ type: z.literal("repo:specify-status:result"), repoPath: z.string(), hasSpecs: z.boolean(), currentAgent: z.string().nullable() }),
  z.object({ type: z.literal("repo:specify-switch:started"), repoPath: z.string() }),
  z.object({ type: z.literal("repo:force-reload:started"), repoPath: z.string() }),
  z.object({ type: z.literal("job:started"), name: z.string() }),
  z.object({ type: z.literal("job:completed"), name: z.string(), elapsed: z.number() }),
  z.object({ type: z.literal("job:failed"), name: z.string(), error: z.string() }),
  z.object({ type: z.literal("git:user:result"), name: z.string(), email: z.string() }),
  z.object({
    type: z.literal("worktree:status:result"),
    worktreePath: z.string(),
    files: z.array(z.object({
      path: z.string(),
      status: z.enum(["added", "modified", "deleted", "renamed", "copied", "untracked"]),
    })),
    ahead: z.number().int().nonnegative(),
    behind: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("worktree:merge:result"),
    success: z.boolean(),
    message: z.string(),
  }),
  z.object({
    type: z.literal("worktree:branches:result"),
    repoPath: z.string(),
    branches: z.array(z.string()),
    current: z.string(),
  }),
  z.object({
    type: z.literal("worktree:delete:result"),
    success: z.boolean(),
    message: z.string(),
  }),
  z.object({ type: z.literal("terminal:spawned"), sessionId: z.string() }),
  z.object({ type: z.literal("terminal:input:ack") }),
  z.object({ type: z.literal("terminal:resize:ack") }),
  z.object({ type: z.literal("terminal:close:ack") }),
  z.object({ type: z.literal("terminal:data"), sessionId: z.string(), data: z.string(), seq: z.number().int().nonnegative().optional() }),
  z.object({ type: z.literal("terminal:exited"), sessionId: z.string(), exitCode: z.number().int() }),
  z.object({
    type: z.literal("terminal:attach:result"),
    sessionId: z.string(),
    chunks: z.array(z.object({ seq: z.number().int().nonnegative(), data: z.string() })),
    snapshot: z.boolean(),
    headSeq: z.number().int().nonnegative(),
    alive: z.boolean(),
  }),
  z.object({ type: z.literal("terminal:ack:ack") }),
  z.object({ type: z.literal("terminal:heartbeat"), sessionId: z.string(), headSeq: z.number().int().nonnegative(), alive: z.boolean() }),
  z.object({ type: z.literal("ai-session:created"), session: AISessionRecordSchema }),
  z.object({ type: z.literal("ai-session:resumed"), session: AISessionRecordSchema }),
  /** Push event: a session record changed on the daemon side (e.g. providerSessionId reconciled). */
  z.object({ type: z.literal("ai-session:updated"), session: AISessionRecordSchema }),
  z.object({ type: z.literal("ai-session:input:ack") }),
  z.object({ type: z.literal("ai-session:resize:ack") }),
  z.object({ type: z.literal("ai-session:stop:ack") }),
  z.object({ type: z.literal("ai-session:list:result"), sessions: z.array(AISessionRecordSchema) }),
  z.object({ type: z.literal("ai-session:deleted"), sessionId: z.string() }),
  z.object({ type: z.literal("ai-session:providers:result"), providers: z.record(z.enum(AI_PROVIDERS), ProviderMetaSchema) }),
  z.object({ type: z.literal("ai-session:data"), sessionId: z.string(), data: z.string(), seq: z.number().int().nonnegative().optional() }),
  z.object({ type: z.literal("ai-session:status"), sessionId: z.string(), status: z.enum(AI_SESSION_STATUSES) }),
  z.object({ type: z.literal("ai-session:exited"), sessionId: z.string(), exitCode: z.number().int() }),
  z.object({
    type: z.literal("ai-session:attach:result"),
    sessionId: z.string(),
    chunks: z.array(z.object({ seq: z.number().int().nonnegative(), data: z.string() })),
    snapshot: z.boolean(),
    headSeq: z.number().int().nonnegative(),
    alive: z.boolean(),
    status: z.enum(AI_SESSION_STATUSES),
  }),
  z.object({ type: z.literal("ai-session:ack:ack") }),
  z.object({ type: z.literal("ai-session:heartbeat"), sessionId: z.string(), headSeq: z.number().int().nonnegative(), alive: z.boolean() }),
  z.object({ type: z.literal("ai-session:title"), sessionId: z.string(), title: z.string() }),
  z.object({ type: z.literal("ai-session:permission-mode:ack"), sessionId: z.string(), permissionMode: z.enum(AI_PERMISSION_MODES) }),
  z.object({ type: z.literal("ai-session:permission-mode-changed"), sessionId: z.string(), permissionMode: z.enum(AI_PERMISSION_MODES) }),
  z.object({ type: z.literal("ai-session:running-count:result"), count: z.number().int().nonnegative() }),
  z.object({ type: z.literal("ai-session:check-worktree:result"), valid: z.boolean(), repoPath: z.string(), worktreeName: z.string() }),
  // Synced session responses + push events
  z.object({ type: z.literal("synced-session:list:result"), sessions: z.array(SyncedSessionRecordSchema) }),
  z.object({ type: z.literal("synced-session:sync:triggered") }),
  z.object({ type: z.literal("synced-session:sync:complete"), claudeCount: z.number().int().nonnegative(), copilotCount: z.number().int().nonnegative() }),
  z.object({ type: z.literal("synced-session:archived"), id: z.string() }),
  // UI visibility ack for the AI-tab-active signal.
  z.object({ type: z.literal("ui:ai-tab-active:ack"), active: z.boolean() }),
  z.object({ type: z.literal("error"), message: z.string() }),
  // Git operation responses
  z.object({ type: z.literal("branch:create:result"), repoPath: z.string(), branchName: z.string(), success: z.boolean() }),
  z.object({ type: z.literal("git:fetch:result"), repoPath: z.string(), success: z.boolean(), message: z.string() }),
  z.object({ type: z.literal("git:pull:result"), repoPath: z.string(), success: z.boolean(), message: z.string(), conflicts: z.array(z.string()).optional() }),
  z.object({ type: z.literal("git:push:result"), repoPath: z.string(), success: z.boolean(), message: z.string() }),
  z.object({
    type: z.literal("git:status:result"),
    repoPath: z.string(),
    files: z.array(GitFileStatusSchema),
    branch: z.string(),
    ahead: z.number().int().nonnegative(),
    behind: z.number().int().nonnegative(),
    hasUpstream: z.boolean(),
  }),
  z.object({
    type: z.literal("git:commit:result"),
    repoPath: z.string(),
    commitSha: z.string(),
    pushed: z.boolean(),
    message: z.string(),
  }),
  z.object({ type: z.literal("git:ls-files:result"), repoPath: z.string(), files: z.array(z.string()) }),
  // Clone: fires immediately with a cloneId the UI can use to match progress/complete events.
  z.object({
    type: z.literal("git:clone:started"),
    cloneId: z.string(),
    targetPath: z.string(),
  }),
  // Streaming progress pushed while `git clone --progress` runs.
  z.object({
    type: z.literal("git:clone:progress"),
    cloneId: z.string(),
    phase: z.string(),
    percent: z.number().min(0).max(100),
    data: z.string(),
  }),
  // Terminal event: clone either succeeded and was scanned, or failed.
  z.object({
    type: z.literal("git:clone:complete"),
    cloneId: z.string(),
    repoPath: z.string(),
    success: z.boolean(),
    error: z.string().optional(),
  }),
  z.object({
    type: z.literal("git:log:result"),
    repoPath: z.string(),
    commits: z.array(CommitSummarySchema),
    hasMore: z.boolean(),
  }),
  z.object({
    type: z.literal("git:commit-detail:result"),
    repoPath: z.string(),
    commit: CommitSummarySchema,
    files: z.array(CommitFileSchema),
  }),
  z.object({
    type: z.literal("git:diff:result"),
    repoPath: z.string(),
    oldContent: z.string().nullable(),
    newContent: z.string().nullable(),
    oldPath: z.string().nullable(),
    newPath: z.string().nullable(),
    isBinary: z.boolean(),
  }),
  z.object({ type: z.literal("stash:list:result"), repoPath: z.string(), stashes: z.array(StashEntrySchema) }),
  z.object({ type: z.literal("stash:push:result"), repoPath: z.string(), success: z.boolean(), message: z.string() }),
  z.object({ type: z.literal("stash:pop:result"), repoPath: z.string(), success: z.boolean(), message: z.string() }),
  z.object({ type: z.literal("stash:apply:result"), repoPath: z.string(), success: z.boolean(), message: z.string() }),
  z.object({ type: z.literal("stash:drop:result"), repoPath: z.string(), success: z.boolean() }),
  z.object({ type: z.literal("stash:show:result"), repoPath: z.string(), diff: z.string() }),
  z.object({ type: z.literal("remote:list:result"), repoPath: z.string(), remotes: z.array(RemoteSchema) }),
  z.object({ type: z.literal("remote:add:result"), repoPath: z.string(), success: z.boolean() }),
  z.object({ type: z.literal("remote:rename:result"), repoPath: z.string(), success: z.boolean() }),
  z.object({ type: z.literal("remote:remove:result"), repoPath: z.string(), success: z.boolean() }),
  z.object({ type: z.literal("remote:set-url:result"), repoPath: z.string(), success: z.boolean() }),
  z.object({ type: z.literal("branch:delete:result"), repoPath: z.string(), branch: z.string(), success: z.boolean() }),
  z.object({ type: z.literal("branch:rename:result"), repoPath: z.string(), oldName: z.string(), newName: z.string(), success: z.boolean() }),
  z.object({ type: z.literal("file:create:result"), filePath: z.string(), success: z.boolean() }),
  z.object({ type: z.literal("dir:create:result"), dirPath: z.string(), success: z.boolean() }),
  z.object({ type: z.literal("git:reset:result"), repoPath: z.string(), success: z.boolean(), message: z.string() }),
  z.object({ type: z.literal("git:revert:result"), repoPath: z.string(), success: z.boolean(), message: z.string() }),
  z.object({ type: z.literal("git:blame:result"), repoPath: z.string(), path: z.string(), lines: z.array(BlameLineSchema) }),
  // CLI tool version tracking — request replies
  z.object({
    type: z.literal("cli:get-version-status:result"),
    tools: z.array(CliToolStatusSchema),
  }),
  z.object({ type: z.literal("cli:recheck:started") }),
  z.object({ type: z.literal("cli:upgrade:started"), tool: CliToolIdSchema }),
  z.object({ type: z.literal("cli:upgrade:cancel:ack"), tool: CliToolIdSchema }),
  // CLI tool version tracking — push events (daemon → renderer)
  z.object({
    type: z.literal("cli:version-status-changed"),
    tools: z.array(CliToolStatusSchema),
    updateCount: z.number().int().nonnegative(),
  }),
  z.object({ type: z.literal("cli:upgrade:output"), tool: CliToolIdSchema, data: z.string() }),
  z.object({ type: z.literal("cli:upgrade:complete"), tool: CliToolIdSchema, success: z.boolean(), error: z.string().optional() }),
]);

export type GitFileStatus = z.infer<typeof GitFileStatusSchema>;

export type IpcRequest = z.infer<typeof IpcRequestSchema>;
export type IpcResponse = z.infer<typeof IpcResponseSchema>;
