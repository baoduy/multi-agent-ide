"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IpcResponseSchema = exports.IpcRequestSchema = exports.SessionStateSchema = exports.SpecFolderSchema = exports.PipelineStageSchema = exports.RepositorySchema = void 0;
const zod_1 = require("zod");
const constants_1 = require("./constants");
const config_1 = require("./config");
exports.RepositorySchema = zod_1.z.object({
    id: zod_1.z.string(),
    name: zod_1.z.string(),
    path: zod_1.z.string(),
    branch: zod_1.z.string(),
    hasSpecs: zod_1.z.boolean(),
    specCount: zod_1.z.number().int().nonnegative(),
    status: zod_1.z.enum(constants_1.REPO_STATUSES),
    scannedAt: zod_1.z.number().int().nonnegative(),
    createdAt: zod_1.z.number().int().nonnegative(),
});
exports.PipelineStageSchema = zod_1.z.object({
    name: zod_1.z.enum(constants_1.PIPELINE_STAGES),
    status: zod_1.z.enum(constants_1.STAGE_STATUSES),
    filePath: zod_1.z.string().nullable(),
    metadata: zod_1.z
        .object({
        taskCount: zod_1.z.number().int().nonnegative().optional(),
        completedCount: zod_1.z.number().int().nonnegative().optional(),
        worktreeCount: zod_1.z.number().int().nonnegative().optional(),
        implementationProgress: zod_1.z.number().min(0).max(100).optional(),
    })
        .optional(),
});
exports.SpecFolderSchema = zod_1.z.object({
    id: zod_1.z.string(),
    repoPath: zod_1.z.string(),
    name: zod_1.z.string(),
    path: zod_1.z.string(),
    stages: zod_1.z.array(exports.PipelineStageSchema),
    files: zod_1.z.array(zod_1.z.string()),
    createdAt: zod_1.z.number().int().nonnegative(),
});
exports.SessionStateSchema = zod_1.z.object({
    selectedRepoPath: zod_1.z.string().nullable(),
    selectedSpecPath: zod_1.z.string().nullable(),
    selectedFilePath: zod_1.z.string().nullable(),
    sidebarWidth: zod_1.z.number().int().positive().nullable(),
    activityPanelWidth: zod_1.z.number().int().positive().nullable(),
    activityPanelOpen: zod_1.z.boolean(),
    mainTab: zod_1.z.enum(constants_1.MAIN_TABS),
    updatedAt: zod_1.z.number().int().nonnegative(),
});
exports.IpcRequestSchema = zod_1.z.discriminatedUnion("type", [
    zod_1.z.object({ type: zod_1.z.literal("repo:list") }),
    zod_1.z.object({ type: zod_1.z.literal("repo:scan") }),
    zod_1.z.object({ type: zod_1.z.literal("spec:list"), repoPath: zod_1.z.string() }),
    zod_1.z.object({ type: zod_1.z.literal("session:get") }),
    zod_1.z.object({ type: zod_1.z.literal("session:update"), state: exports.SessionStateSchema.partial() }),
    zod_1.z.object({ type: zod_1.z.literal("config:get") }),
    zod_1.z.object({ type: zod_1.z.literal("config:add-working-dir"), path: zod_1.z.string() }),
    zod_1.z.object({ type: zod_1.z.literal("config:remove-working-dir"), path: zod_1.z.string() }),
]);
exports.IpcResponseSchema = zod_1.z.discriminatedUnion("type", [
    zod_1.z.object({ type: zod_1.z.literal("repo:list:result"), repos: zod_1.z.array(exports.RepositorySchema) }),
    zod_1.z.object({ type: zod_1.z.literal("repo:scan:started") }),
    zod_1.z.object({
        type: zod_1.z.literal("repo:scan:progress"),
        scanned: zod_1.z.number().int().nonnegative(),
        total: zod_1.z.number().int().nonnegative(),
        currentDir: zod_1.z.string(),
    }),
    zod_1.z.object({
        type: zod_1.z.literal("repo:scan:complete"),
        repos: zod_1.z.array(exports.RepositorySchema),
        added: zod_1.z.number().int().nonnegative(),
        updated: zod_1.z.number().int().nonnegative(),
        missing: zod_1.z.number().int().nonnegative(),
    }),
    zod_1.z.object({ type: zod_1.z.literal("spec:list:result"), repoPath: zod_1.z.string(), specs: zod_1.z.array(exports.SpecFolderSchema) }),
    zod_1.z.object({ type: zod_1.z.literal("spec:list:updated"), repoPath: zod_1.z.string(), specs: zod_1.z.array(exports.SpecFolderSchema) }),
    zod_1.z.object({ type: zod_1.z.literal("session:response"), state: exports.SessionStateSchema }),
    zod_1.z.object({ type: zod_1.z.literal("session:updated") }),
    zod_1.z.object({ type: zod_1.z.literal("config:response"), config: config_1.MagentaConfigSchema }),
    zod_1.z.object({ type: zod_1.z.literal("config:updated"), config: config_1.MagentaConfigSchema }),
    zod_1.z.object({ type: zod_1.z.literal("error"), message: zod_1.z.string() }),
]);
