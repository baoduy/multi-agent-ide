import * as fs from "fs";
import * as path from "path";
import { ulid } from "ulid";

import type { PipelineStage, PipelineStageMetadata, SpecFolder } from "@magenta/shared/models";
import type { PipelineStageName, StageStatus } from "@magenta/shared/constants";
import { PIPELINE_STAGES } from "@magenta/shared/constants";

interface ParsedStageMetadata {
  taskCount?: number;
  completedCount?: number;
  worktreeCount?: number;
  implementationProgress?: number;
}

/**
 * SpecReader reads and parses spec folder structures from a repository.
 * It extracts metadata from stage files and returns a list of SpecFolder objects.
 */
export class SpecReader {
  /**
   * Lists all spec folders in a repository's specs/ directory.
   * @param repoPath The root path of the repository
   * @returns Array of SpecFolder objects, or empty array if specs/ doesn't exist
   */
  listSpecs(repoPath: string): SpecFolder[] {
    const specsDir = path.join(repoPath, "specs");

    // If specs directory doesn't exist, return empty array
    if (!fs.existsSync(specsDir)) {
      return [];
    }

    const specs: SpecFolder[] = [];

    try {
      const entries = fs.readdirSync(specsDir, { withFileTypes: true });

      for (const entry of entries) {
        // Only process directories, skip files
        if (!entry.isDirectory()) {
          continue;
        }

        if (entry.name.startsWith(".")) {
          continue;
        }

        const specPath = path.join(specsDir, entry.name);
        const spec = this.parseSpecFolder(repoPath, specPath, entry.name);

        if (spec) {
          specs.push(spec);
        }
      }
    } catch (error) {
      console.error(`Failed to list specs in ${repoPath}:`, error);
      return [];
    }

    return specs;
  }

  /**
   * Parses a single spec folder and returns a SpecFolder object.
   * @param repoPath The root path of the repository
   * @param specPath The path to the spec folder
   * @param specName The name of the spec folder
   * @returns SpecFolder object or null if parsing fails
   */
  private parseSpecFolder(repoPath: string, specPath: string, specName: string): SpecFolder | null {
    try {
      const stages = this.parseStages(specPath);
      const files = this.listSpecFiles(specPath);

      return {
        id: ulid(),
        repoPath,
        name: specName,
        path: specPath,
        stages,
        files,
        createdAt: Date.now(),
      };
    } catch (error) {
      console.error(`Failed to parse spec folder at ${specPath}:`, error);
      return null;
    }
  }

  /**
   * Parses the pipeline stages within a spec folder.
   * @param specPath The path to the spec folder
   * @returns Array of PipelineStage objects
   */
  private parseStages(specPath: string): PipelineStage[] {
    const stages: PipelineStage[] = [];

    for (const stageName of PIPELINE_STAGES) {
      const stage = this.parseStage(specPath, stageName);
      stages.push(stage);
    }

    return stages;
  }

  /**
   * Parses a single pipeline stage.
   * @param specPath The path to the spec folder
   * @param stageName The name of the stage (e.g., 'spec', 'plan')
   * @returns PipelineStage object
   */
  private parseStage(specPath: string, stageName: PipelineStageName): PipelineStage {
    const stageFileMap: Record<PipelineStageName, string> = {
      constitution: "constitution.md",
      spec: "spec.md",
      plan: "plan.md",
      tasks: "tasks.md",
      implementation: "implementation/",
    };

    const stageIdentifier = stageFileMap[stageName];
    const stagePath = path.join(specPath, stageIdentifier);

    // Check if stage exists
    const exists = fs.existsSync(stagePath);

    if (!exists) {
      return {
        name: stageName,
        status: "missing",
        filePath: null,
      };
    }

    // Determine status and extract metadata
    let status: StageStatus = "draft";
    let metadata: PipelineStageMetadata | undefined;

    if (stageName === "tasks") {
      const parsed = this.parseTasksMetadata(stagePath);
      metadata = parsed.metadata;
      status = parsed.status;
    } else if (stageName === "implementation") {
      const parsed = this.parseImplementationMetadata(stagePath);
      metadata = parsed.metadata;
      status = parsed.status;
    } else {
      // For constitution, spec, plan files: check if they're approved (non-empty)
      // Default to 'review' status since file exists
      status = "review";
    }

    return {
      name: stageName,
      status,
      filePath: stagePath,
      metadata,
    };
  }

  /**
   * Parses metadata from a tasks.md file.
   * Counts total and completed checkboxes.
   * @param tasksFilePath Path to tasks.md
   * @returns Object with metadata and status
   */
  private parseTasksMetadata(
    tasksFilePath: string
  ): { metadata: PipelineStageMetadata; status: StageStatus } {
    try {
      if (!fs.existsSync(tasksFilePath) || fs.statSync(tasksFilePath).isDirectory()) {
        return { metadata: {}, status: "draft" };
      }

      const content = fs.readFileSync(tasksFilePath, "utf-8");

      // Count checkboxes: - [ ] or - [x] or - [X]
      const totalMatches = content.match(/^-\s+\[\s*[\sx]\s*\]/gm) || [];
      const completedMatches = content.match(/^-\s+\[[xX]\]/gm) || [];

      const taskCount = totalMatches.length;
      const completedCount = completedMatches.length;

      return {
        metadata: {
          taskCount,
          completedCount,
        },
        status: taskCount > 0 ? "draft" : "draft",
      };
    } catch (error) {
      console.error(`Failed to parse tasks metadata from ${tasksFilePath}:`, error);
      return { metadata: {}, status: "draft" };
    }
  }

  /**
   * Parses metadata from an implementation/ folder.
   * Checks for worktrees and progress.json.
   * @param implementationFolderPath Path to implementation folder
   * @returns Object with metadata and status
   */
  private parseImplementationMetadata(
    implementationFolderPath: string
  ): { metadata: PipelineStageMetadata; status: StageStatus } {
    try {
      if (!fs.existsSync(implementationFolderPath)) {
        return { metadata: {}, status: "idle" };
      }

      const entries = fs.readdirSync(implementationFolderPath, { withFileTypes: true });

      // Count worktrees (or any subdirectories that might represent worktrees)
      let worktreeCount = 0;
      let implementationProgress: number | undefined;

      for (const entry of entries) {
        if (entry.name === "progress.json") {
          try {
            const progressData = JSON.parse(
              fs.readFileSync(path.join(implementationFolderPath, entry.name), "utf-8")
            );
            if (typeof progressData.progress === "number") {
              implementationProgress = progressData.progress;
            }
          } catch {
            // Silently ignore progress.json parse errors
          }
        } else if (entry.isDirectory() && !entry.name.startsWith(".")) {
          worktreeCount++;
        }
      }

      const metadata: PipelineStageMetadata = {
        worktreeCount,
      };

      if (implementationProgress !== undefined) {
        metadata.implementationProgress = implementationProgress;
      }

      // Status: idle if no progress, running if progress > 0
      const status = implementationProgress !== undefined && implementationProgress > 0 ? "running" : "idle";

      return { metadata, status };
    } catch (error) {
      console.error(`Failed to parse implementation metadata from ${implementationFolderPath}:`, error);
      return { metadata: {}, status: "idle" };
    }
  }

  /**
   * Lists all files in a spec folder (non-recursively, excluding hidden files/dirs).
   * @param specPath Path to the spec folder
   * @returns Array of file paths relative to the spec folder
   */
  private listSpecFiles(specPath: string): string[] {
    try {
      const entries = fs.readdirSync(specPath, { withFileTypes: true });
      const files: string[] = [];

      for (const entry of entries) {
        if (entry.name.startsWith(".")) {
          continue;
        }

        const filePath = path.join(specPath, entry.name);
        files.push(filePath);
      }

      return files;
    } catch (error) {
      console.error(`Failed to list files in ${specPath}:`, error);
      return [];
    }
  }
}
