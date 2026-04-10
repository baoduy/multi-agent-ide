import * as fs from "fs";
import * as path from "path";
import { ulid } from "ulid";

import type { PipelineStage, PipelineStageMetadata, SpecFolder } from "@magenta/shared/models";
import type { PipelineStageName, StageStatus } from "@magenta/shared/constants";
import { PIPELINE_STAGES } from "@magenta/shared/constants";
import { SpecParser } from "../domain/SpecParser";
import { SpecGitGateway } from "../infrastructure/SpecGitGateway";

interface ParsedStageMetadata {
  taskCount?: number;
  completedCount?: number;
  worktreeCount?: number;
  implementationProgress?: number;
  approvedBy?: string;
  approvedAt?: string;
}

/**
 * SpecReader reads and parses spec folder structures from a repository.
 * Supports reading specs from the working tree (current branch) and from
 * other branches via `git show` / `git ls-tree` without checking out.
 */
export class SpecReader {
  private readonly parser = new SpecParser();
  private readonly gitGateway = new SpecGitGateway();

  /* ═══════════════════════════════════════════════════════
     Public API
     ═══════════════════════════════════════════════════════ */

  /**
   * Lists spec folders from the current working tree (filesystem).
   * Each spec gets `isCurrentBranch: true`.
   */
  listSpecs(repoPath: string, branch?: string): SpecFolder[] {
    const specsDir = path.join(repoPath, "specs");

    if (!fs.existsSync(specsDir)) {
      return [];
    }

    const specs: SpecFolder[] = [];

    try {
      const entries = fs.readdirSync(specsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith(".")) {
          continue;
        }

        const specPath = path.join(specsDir, entry.name);
        const spec = this.parseSpecFolder(repoPath, specPath, entry.name);

        if (spec) {
          spec.isCurrentBranch = true;
          if (branch) {
            spec.branch = branch;
          }
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
   * Lists specs from ALL local branches, deduplicating specs that appear on the
   * current branch (which are read from the working tree for full metadata).
   *
   * Specs from non-current branches use `git ls-tree` / `git show` and get
   * virtual file paths in the form `gitref://<branch>/specs/<name>/<file>`.
   */
  async listAllBranchSpecs(repoPath: string): Promise<SpecFolder[]> {
    const currentBranch = this.gitGateway.getCurrentBranch(repoPath);

    // 1. Specs from working tree (current branch) — full filesystem parsing
    const currentSpecs = this.listSpecs(repoPath, currentBranch);

    // Current-branch specs always win — no need to compare timestamps
    const currentSpecNames = new Set(currentSpecs.map((s) => s.name));

    // 2. List all local branches
    const branches = this.gitGateway.listLocalBranches(repoPath);

    // 3. For each non-current branch, collect candidate specs.
    //    When the same spec name appears on multiple non-current branches,
    //    keep the one from the branch with the newest commit.
    const bestCandidates = new Map<string, { branch: string; timestamp: number }>();

    for (const branch of branches) {
      if (branch === currentBranch) continue;

      try {
        const specNames = this.gitGateway.gitListSpecDirs(repoPath, branch);

        for (const specName of specNames) {
          // Current-branch specs always take priority
          if (currentSpecNames.has(specName)) continue;

          const ts = this.gitGateway.getLatestCommitTimestamp(
            repoPath,
            branch,
            `specs/${specName}`,
          );

          const existing = bestCandidates.get(specName);
          if (!existing || ts > existing.timestamp) {
            bestCandidates.set(specName, { branch, timestamp: ts });
          }
        }
      } catch {
        // Branch might be corrupt or inaccessible — skip
      }
    }

    // 4. Parse only the winning branch for each spec
    const otherSpecs: SpecFolder[] = [];
    for (const [specName, { branch }] of bestCandidates) {
      const spec = this.parseGitSpecFolder(repoPath, branch, specName);
      if (spec) {
        otherSpecs.push(spec);
      }
    }

    // Current branch specs first, then other branches
    return [...currentSpecs, ...otherSpecs];
  }

  /**
   * Reads a file from a git ref (branch) without checkout.
   * @param repoPath Repository root
   * @param ref Branch or ref name
   * @param relativePath Path relative to repo root (e.g. "specs/001-foo/spec.md")
   * @returns File content as string, or null if not found
   */
  readGitFile(repoPath: string, ref: string, relativePath: string): string | null {
    return this.gitGateway.readGitFile(repoPath, ref, relativePath);
  }


  /* ═══════════════════════════════════════════════════════
     Git-based spec parsing (non-current branches)
     ═══════════════════════════════════════════════════════ */

  /**
   * Parses a spec folder from a non-current branch using git commands.
   * File paths use the virtual scheme: `gitref://<branch>/path`
   */
  private parseGitSpecFolder(
    repoPath: string,
    branch: string,
    specName: string,
  ): SpecFolder | null {
    try {
      const stages = this.parseGitStages(repoPath, branch, specName);
      const fileNames = this.gitGateway.gitListSpecFiles(repoPath, branch, specName);

      // Virtual file paths with gitref:// prefix
      const files = fileNames.map(
        (f) => `gitref://${branch}/specs/${specName}/${f}`,
      );

      return {
        id: ulid(),
        repoPath,
        name: specName,
        path: `gitref://${branch}/specs/${specName}`,
        branch,
        isCurrentBranch: false,
        stages,
        files,
        createdAt: Date.now(),
      };
    } catch (error) {
      console.error(`Failed to parse git spec ${specName} on ${branch}:`, error);
      return null;
    }
  }

  private parseGitStages(
    repoPath: string,
    branch: string,
    specName: string,
  ): PipelineStage[] {
    const stages: PipelineStage[] = [];

    for (const stageName of PIPELINE_STAGES) {
      const stage = this.parseGitStage(repoPath, branch, specName, stageName);
      stages.push(stage);
    }

    return stages;
  }

  private parseGitStage(
    repoPath: string,
    branch: string,
    specName: string,
    stageName: PipelineStageName,
  ): PipelineStage {
    let relativePath: string;
    if (stageName === "constitution") {
      relativePath = ".specify/memory/constitution.md";
    } else {
      const stageFileMap: Record<string, string> = {
        spec: "spec.md",
        plan: "plan.md",
        tasks: "tasks.md",
        implementation: "implementation",
      };
      relativePath = `specs/${specName}/${stageFileMap[stageName]}`;
    }

    const exists = this.gitGateway.gitPathExists(repoPath, branch, relativePath);

    if (!exists) {
      return {
        name: stageName,
        status: "missing",
        filePath: null,
      };
    }

    const virtualPath = `gitref://${branch}/${relativePath}`;

    let status: StageStatus = "draft";
    let metadata: PipelineStageMetadata | undefined;

    if (stageName === "tasks") {
      const content = this.gitGateway.readGitFile(repoPath, branch, relativePath);
      if (content) {
        const parsed = SpecParser.parseTasksContent(content);
        metadata = parsed.metadata;
        status = parsed.status;
      }
    } else if (stageName === "implementation") {
      // Can't easily parse implementation folder metadata from git — mark as idle
      status = "idle";
    } else {
      status = "review";
    }

    // Check for approval marker in file content (not implementation)
    if (stageName !== "implementation") {
      const content = this.gitGateway.readGitFile(repoPath, branch, relativePath);
      if (content) {
        const approval = SpecParser.parseApprovalMarkerFromContent(content);
        if (approval) {
          status = "approved";
          metadata = {
            ...metadata,
            approvedBy: approval.approvedBy,
            approvedAt: approval.approvedAt,
          };
        }
      }
    }

    return {
      name: stageName,
      status,
      filePath: virtualPath,
      metadata,
    };
  }

  /* ═══════════════════════════════════════════════════════
     Filesystem-based spec parsing (current branch)
     ═══════════════════════════════════════════════════════ */

  private parseSpecFolder(repoPath: string, specPath: string, specName: string): SpecFolder | null {
    try {
      const stages = this.parseStages(repoPath, specPath);
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

  private parseStages(repoPath: string, specPath: string): PipelineStage[] {
    const stages: PipelineStage[] = [];

    for (const stageName of PIPELINE_STAGES) {
      const stage = this.parseStage(repoPath, specPath, stageName);
      stages.push(stage);
    }

    return stages;
  }

  private parseStage(repoPath: string, specPath: string, stageName: PipelineStageName): PipelineStage {
    // Constitution lives at the repo level: .specify/memory/constitution.md
    // All other stages live inside the spec folder.
    let stagePath: string;
    if (stageName === "constitution") {
      stagePath = path.join(repoPath, ".specify", "memory", "constitution.md");
    } else {
      const stageFileMap: Record<string, string> = {
        spec: "spec.md",
        plan: "plan.md",
        tasks: "tasks.md",
        implementation: "implementation/",
      };
      stagePath = path.join(specPath, stageFileMap[stageName]);
    }

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
      status = "review";
    }

    // Check for approval marker in any file-based stage (not implementation folder)
    if (stageName !== "implementation") {
      const approval = this.parseApprovalMarker(stagePath);
      if (approval) {
        status = "approved";
        metadata = {
          ...metadata,
          approvedBy: approval.approvedBy,
          approvedAt: approval.approvedAt,
        };
      }
    }

    return {
      name: stageName,
      status,
      filePath: stagePath,
      metadata,
    };
  }

  /* ═══════════════════════════════════════════════════════
     Content parsers (shared by filesystem & git paths)
     ═══════════════════════════════════════════════════════ */

  /**
   * Parses tasks metadata from a file on disk.
   */
  private parseTasksMetadata(
    tasksFilePath: string,
  ): { metadata: PipelineStageMetadata; status: StageStatus } {
    try {
      if (!fs.existsSync(tasksFilePath) || fs.statSync(tasksFilePath).isDirectory()) {
        return { metadata: {}, status: "draft" };
      }

      const content = fs.readFileSync(tasksFilePath, "utf-8");
      return SpecParser.parseTasksContent(content);
    } catch (error) {
      console.error(`Failed to parse tasks metadata from ${tasksFilePath}:`, error);
      return { metadata: {}, status: "draft" };
    }
  }

  private parseImplementationMetadata(
    implementationFolderPath: string,
  ): { metadata: PipelineStageMetadata; status: StageStatus } {
    try {
      if (!fs.existsSync(implementationFolderPath)) {
        return { metadata: {}, status: "idle" };
      }

      const entries = fs.readdirSync(implementationFolderPath, { withFileTypes: true });

      // Build entry objects for SpecParser
      const parsedEntries: { name: string; isDirectory: boolean; content?: string }[] = [];

      for (const entry of entries) {
        const entryData: { name: string; isDirectory: boolean; content?: string } = {
          name: entry.name,
          isDirectory: entry.isDirectory(),
        };

        if (entry.name === "progress.json") {
          try {
            entryData.content = fs.readFileSync(path.join(implementationFolderPath, entry.name), "utf-8");
          } catch {
            // Silently ignore read errors
          }
        }

        parsedEntries.push(entryData);
      }

      return SpecParser.parseImplementationEntries(parsedEntries);
    } catch (error) {
      console.error(`Failed to parse implementation metadata from ${implementationFolderPath}:`, error);
      return { metadata: {}, status: "idle" };
    }
  }

  /**
   * Parses the approval marker from a file on disk.
   */
  private parseApprovalMarker(
    filePath: string,
  ): { approvedBy: string; approvedAt: string } | null {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      return SpecParser.parseApprovalMarkerFromContent(content);
    } catch {
      return null;
    }
  }

  private listSpecFiles(specPath: string): string[] {
    try {
      const entries = fs.readdirSync(specPath, { withFileTypes: true });
      const files: string[] = [];

      for (const entry of entries) {
        if (entry.name.startsWith(".")) {
          continue;
        }
        files.push(path.join(specPath, entry.name));
      }

      return files;
    } catch (error) {
      console.error(`Failed to list files in ${specPath}:`, error);
      return [];
    }
  }
}
