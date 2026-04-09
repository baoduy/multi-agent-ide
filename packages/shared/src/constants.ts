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
] as const;

export type StageStatus = (typeof STAGE_STATUSES)[number];

export const MAIN_TABS = ["plan", "worktrees", "spec"] as const;

export type MainTab = (typeof MAIN_TABS)[number];
