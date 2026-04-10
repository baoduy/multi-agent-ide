import type { PipelineStageMetadata } from "@magenta/shared/models";
import type { StageStatus } from "@magenta/shared/constants";

/**
 * SpecParser contains pure parsing logic with no I/O dependencies.
 * All methods are static and operate on strings or plain objects.
 */
export class SpecParser {
  /**
   * Parses task counts from markdown checkbox syntax in tasks.md content.
   * Returns raw counts only — callers decide which stage gets the metadata.
   */
  static parseTaskCounts(
    content: string,
  ): { taskCount: number; completedCount: number } {
    const totalMatches = content.match(/^-\s+\[\s*[\sxX]\s*\]/gm) || [];
    const completedMatches = content.match(/^-\s+\[[xX]\]/gm) || [];
    return {
      taskCount: totalMatches.length,
      completedCount: completedMatches.length,
    };
  }

  /**
   * Derives the Implementation stage status from task completion counts.
   *   - "pending"     → no tasks completed (or no tasks at all)
   *   - "in-progress" → some tasks completed
   *   - "done"        → all tasks completed
   */
  static deriveImplementationStatus(
    taskCount: number,
    completedCount: number,
  ): { metadata: PipelineStageMetadata; status: StageStatus } {
    let status: StageStatus;
    if (taskCount === 0 || completedCount === 0) {
      status = "pending";
    } else if (completedCount >= taskCount) {
      status = "done";
    } else {
      status = "in-progress";
    }

    return {
      metadata: { taskCount, completedCount },
      status,
    };
  }

  /**
   * Parses the approval marker from file content string.
   * Looks for: **Approved by:** <name> | **Date:** <date>
   */
  static parseApprovalMarkerFromContent(
    content: string,
  ): { approvedBy: string; approvedAt: string } | null {
    const match = content.match(
      /\*\*Approved by:\*\*\s*([^|]+?)\s*\|\s*\*\*Date:\*\*\s*(\S+)/,
    );
    if (match) {
      return {
        approvedBy: match[1].trim(),
        approvedAt: match[2].trim(),
      };
    }
    return null;
  }

  /**
   * Parses implementation folder metadata from directory entries.
   * Pure version that doesn't read the filesystem directly.
   * @param entries Array of directory entries with name, isDirectory, and optional content
   */
  static parseImplementationEntries(entries: {
    name: string;
    isDirectory: boolean;
    content?: string;
  }[]): { metadata: PipelineStageMetadata; status: StageStatus } {
    let worktreeCount = 0;
    let implementationProgress: number | undefined;

    for (const entry of entries) {
      if (entry.name === "progress.json") {
        try {
          const progressData = JSON.parse(entry.content || "{}");
          if (typeof progressData.progress === "number") {
            implementationProgress = progressData.progress;
          }
        } catch {
          // Silently ignore progress.json parse errors
        }
      } else if (entry.isDirectory && !entry.name.startsWith(".")) {
        worktreeCount++;
      }
    }

    const metadata: PipelineStageMetadata = { worktreeCount };

    if (implementationProgress !== undefined) {
      metadata.implementationProgress = implementationProgress;
    }

    const status = implementationProgress !== undefined && implementationProgress > 0 ? "running" : "idle";
    return { metadata, status };
  }
}
