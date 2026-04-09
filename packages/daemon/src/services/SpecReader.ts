import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { ulid } from "ulid";

import type { PipelineStage, PipelineStageMetadata, SpecFolder } from "@magenta/shared/models";
import type { PipelineStageName, StageStatus } from "@magenta/shared/constants";
import { PIPELINE_STAGES } from "@magenta/shared/constants";

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
    const currentBranch = this.getCurrentBranch(repoPath);

    // 1. Specs from working tree (current branch) — full filesystem parsing
    const currentSpecs = this.listSpecs(repoPath, currentBranch);
    const currentSpecNames = new Set(currentSpecs.map((s) => s.name));

    // 2. List all local branches
    const branches = this.listLocalBranches(repoPath);

    // 3. For each non-current branch, list specs via git
    const otherSpecs: SpecFolder[] = [];

    for (const branch of branches) {
      if (branch === currentBranch) continue;

      try {
        const specNames = this.gitListSpecDirs(repoPath, branch);

        for (const specName of specNames) {
          // Skip if this spec already exists on current branch
          if (currentSpecNames.has(specName)) continue;

          const spec = this.parseGitSpecFolder(repoPath, branch, specName);
          if (spec) {
            otherSpecs.push(spec);
          }
        }
      } catch {
        // Branch might be corrupt or inaccessible — skip
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
    try {
      return execSync(`git show "${ref}:${relativePath}"`, {
        cwd: repoPath,
        encoding: "utf-8",
        maxBuffer: 5 * 1024 * 1024,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch {
      return null;
    }
  }

  /* ═══════════════════════════════════════════════════════
     Git helpers
     ═══════════════════════════════════════════════════════ */

  private getCurrentBranch(repoPath: string): string {
    try {
      return execSync("git rev-parse --abbrev-ref HEAD", {
        cwd: repoPath,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
    } catch {
      return "unknown";
    }
  }

  private listLocalBranches(repoPath: string): string[] {
    try {
      const output = execSync("git branch --format='%(refname:short)'", {
        cwd: repoPath,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      return output
        .split("\n")
        .map((b) => b.trim().replace(/^'|'$/g, ""))
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Lists spec directory names under `specs/` on the given branch via `git ls-tree`.
   */
  private gitListSpecDirs(repoPath: string, branch: string): string[] {
    try {
      const output = execSync(
        `git ls-tree --name-only "${branch}" -- specs/`,
        {
          cwd: repoPath,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      // git ls-tree returns "specs/001-foo", "specs/002-bar" etc.
      return output
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.replace(/^specs\//, ""));
    } catch {
      return [];
    }
  }

  /**
   * Lists files inside a spec directory on the given branch via `git ls-tree`.
   */
  private gitListSpecFiles(repoPath: string, branch: string, specName: string): string[] {
    try {
      const output = execSync(
        `git ls-tree --name-only "${branch}" -- "specs/${specName}/"`,
        {
          cwd: repoPath,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      return output
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.replace(`specs/${specName}/`, ""));
    } catch {
      return [];
    }
  }

  /**
   * Checks if a file/tree exists on a given branch.
   */
  private gitPathExists(repoPath: string, branch: string, relativePath: string): boolean {
    try {
      execSync(`git cat-file -e "${branch}:${relativePath}"`, {
        cwd: repoPath,
        stdio: ["pipe", "pipe", "pipe"],
      });
      return true;
    } catch {
      return false;
    }
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
      const fileNames = this.gitListSpecFiles(repoPath, branch, specName);

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

    const exists = this.gitPathExists(repoPath, branch, relativePath);

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
      const content = this.readGitFile(repoPath, branch, relativePath);
      if (content) {
        const parsed = this.parseTasksContent(content);
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
      const content = this.readGitFile(repoPath, branch, relativePath);
      if (content) {
        const approval = this.parseApprovalMarkerFromContent(content);
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
   * Parses tasks metadata from file content string.
   */
  private parseTasksContent(
    content: string,
  ): { metadata: PipelineStageMetadata; status: StageStatus } {
    const totalMatches = content.match(/^-\s+\[\s*[\sx]\s*\]/gm) || [];
    const completedMatches = content.match(/^-\s+\[[xX]\]/gm) || [];

    const taskCount = totalMatches.length;
    const completedCount = completedMatches.length;

    return {
      metadata: { taskCount, completedCount },
      status: taskCount > 0 ? "draft" : "draft",
    };
  }

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
      return this.parseTasksContent(content);
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

      let worktreeCount = 0;
      let implementationProgress: number | undefined;

      for (const entry of entries) {
        if (entry.name === "progress.json") {
          try {
            const progressData = JSON.parse(
              fs.readFileSync(path.join(implementationFolderPath, entry.name), "utf-8"),
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

      const metadata: PipelineStageMetadata = { worktreeCount };

      if (implementationProgress !== undefined) {
        metadata.implementationProgress = implementationProgress;
      }

      const status = implementationProgress !== undefined && implementationProgress > 0 ? "running" : "idle";
      return { metadata, status };
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
      return this.parseApprovalMarkerFromContent(content);
    } catch {
      return null;
    }
  }

  /**
   * Parses the approval marker from file content string.
   */
  private parseApprovalMarkerFromContent(
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
