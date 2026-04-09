import { z } from "zod";
import { MAIN_TABS, PIPELINE_STAGES, REPO_STATUSES, STAGE_STATUSES } from "./constants";
import { MagentaConfigSchema } from "./config";

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
  z.object({ type: z.literal("dir:list"), dirPath: z.string() }),
  z.object({ type: z.literal("session:get") }),
  z.object({ type: z.literal("session:update"), state: SessionStateSchema.partial() }),
  z.object({ type: z.literal("config:get") }),
  z.object({ type: z.literal("config:add-working-dir"), path: z.string() }),
  z.object({ type: z.literal("config:remove-working-dir"), path: z.string() }),
  z.object({ type: z.literal("branch:list"), repoPath: z.string() }),
  z.object({ type: z.literal("branch:checkout"), repoPath: z.string(), branch: z.string() }),
  z.object({ type: z.literal("gitfile:read"), repoPath: z.string(), ref: z.string(), relativePath: z.string() }),
  z.object({ type: z.literal("worktree:create"), repoPath: z.string(), branch: z.string(), name: z.string() }),
]);

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
  z.object({ type: z.literal("spec:list:updated"), repoPath: z.string(), specs: z.array(SpecFolderSchema) }),
  z.object({ type: z.literal("session:response"), state: SessionStateSchema }),
  z.object({ type: z.literal("session:updated") }),
  z.object({ type: z.literal("config:response"), config: MagentaConfigSchema }),
  z.object({ type: z.literal("config:updated"), config: MagentaConfigSchema }),
  z.object({ type: z.literal("file:read:result"), filePath: z.string(), content: z.string() }),
  z.object({ type: z.literal("file:write:result"), filePath: z.string(), success: z.boolean() }),
  z.object({
    type: z.literal("dir:list:result"),
    dirPath: z.string(),
    entries: z.array(z.object({ name: z.string(), path: z.string(), isDirectory: z.boolean() })),
  }),
  z.object({ type: z.literal("branch:list:result"), repoPath: z.string(), branches: z.array(z.string()), current: z.string() }),
  z.object({ type: z.literal("branch:checkout:result"), repoPath: z.string(), branch: z.string(), success: z.boolean() }),
  z.object({ type: z.literal("gitfile:read:result"), filePath: z.string(), content: z.string() }),
  z.object({ type: z.literal("worktree:create:result"), repoPath: z.string(), worktreePath: z.string(), branch: z.string(), success: z.boolean() }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);

export type IpcRequest = z.infer<typeof IpcRequestSchema>;
export type IpcResponse = z.infer<typeof IpcResponseSchema>;
