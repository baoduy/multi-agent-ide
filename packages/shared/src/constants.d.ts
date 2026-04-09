export declare const PIPELINE_STAGES: readonly ["constitution", "spec", "plan", "tasks", "implementation"];
export type PipelineStageName = (typeof PIPELINE_STAGES)[number];
export declare const REPO_STATUSES: readonly ["active", "missing", "archived"];
export type RepoStatus = (typeof REPO_STATUSES)[number];
export declare const STAGE_STATUSES: readonly ["missing", "draft", "review", "approved", "idle", "running"];
export type StageStatus = (typeof STAGE_STATUSES)[number];
export declare const MAIN_TABS: readonly ["flow", "editor", "worktrees"];
export type MainTab = (typeof MAIN_TABS)[number];
