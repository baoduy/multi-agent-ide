import type { MainTab, PipelineStageName, RepoStatus, StageStatus } from "./constants";

export interface Repository {
  id: string;
  name: string;
  path: string;
  branch: string;
  hasSpecs: boolean;
  specCount: number;
  status: RepoStatus;
  scannedAt: number;
  createdAt: number;
  /**
   * Absolute path to the directory containing `.specify/` for this repo.
   * Discovered by walking up to 3 levels from the repo root. `null` when
   * no `.specify/` folder is found. Constraint: one per repo.
   */
  specifyWorkingDir?: string | null;
  /** AI agent configured for Specify (from .specify/integration.json or init-options.json). */
  specifyAgent?: string | null;
}

export interface PipelineStageMetadata {
  taskCount?: number;
  completedCount?: number;
  worktreeCount?: number;
  implementationProgress?: number;
  approvedBy?: string;
  approvedAt?: string;
}

export interface PipelineStage {
  name: PipelineStageName;
  status: StageStatus;
  filePath: string | null;
  metadata?: PipelineStageMetadata;
}

export interface SpecFolder {
  id: string;
  repoPath: string;
  name: string;
  path: string;
  /** The branch this spec lives on. Undefined or empty = current (working tree). */
  branch?: string;
  /** True when this spec is from the currently checked-out branch. */
  isCurrentBranch?: boolean;
  stages: PipelineStage[];
  files: string[];
  createdAt: number;
}

export type ComponentDensity = "xs" | "sm";

export interface SessionState {
  selectedRepoPath: string | null;
  selectedSpecPath: string | null;
  selectedFilePath: string | null;
  sidebarWidth: number | null;
  activityPanelWidth: number | null;
  activityPanelOpen: boolean;
  sidebarCollapsed: boolean;
  activityCollapsed: boolean;
  specPanelHeight: number | null;
  mainTab: MainTab;
  componentDensity: ComponentDensity;
  updatedAt: number;
}

export type { AISessionRecord, AISessionConfig, AIProvider, AISessionStatus, ProviderMeta, SlashCommand, CliFlag } from "./aiTerminal";
