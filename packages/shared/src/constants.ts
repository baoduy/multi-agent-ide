export const PIPELINE_STAGES = [
  "constitution",
  "spec",
  "plan",
  "tasks",
  "implementation",
] as const;

export type PipelineStageName = (typeof PIPELINE_STAGES)[number];

export const REPO_STATUSES = ["active", "missing", "archived"] as const;

export type RepoStatus = (typeof REPO_STATUSES)[number];

export const STAGE_STATUSES = [
  "missing",
  "draft",
  "review",
  "approved",
  "idle",
  "running",
  "pending",
  "in-progress",
  "done",
] as const;

export type StageStatus = (typeof STAGE_STATUSES)[number];

export const MAIN_TABS = ["specs", "workflow", "worktrees"] as const;

export type MainTab = (typeof MAIN_TABS)[number];
