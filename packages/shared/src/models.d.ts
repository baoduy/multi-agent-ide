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
}
export interface PipelineStageMetadata {
    taskCount?: number;
    completedCount?: number;
    worktreeCount?: number;
    implementationProgress?: number;
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
    stages: PipelineStage[];
    files: string[];
    createdAt: number;
}
export interface SessionState {
    selectedRepoPath: string | null;
    selectedSpecPath: string | null;
    selectedFilePath: string | null;
    sidebarWidth: number | null;
    activityPanelWidth: number | null;
    activityPanelOpen: boolean;
    mainTab: MainTab;
    updatedAt: number;
}
export interface WorkingDir {
    id: string;
    path: string;
}
//# sourceMappingURL=models.d.ts.map