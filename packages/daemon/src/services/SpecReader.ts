import * as fs from "fs";
import * as path from "path";
import { ulid } from "ulid";

import type { PipelineStage, PipelineStageMetadata, SpecFolder } from "@magenta/shared/models";
import type { PipelineStageName, StageStatus } from "@magenta/shared/constants";
import { PIPELINE_STAGES } from "@magenta/shared/constants";
import { SpecParser } from "../domain/SpecParser";
import { SpecGitGateway } from "../infrastructure/SpecGitGateway";
import type { GitBatchGateway } from "../infrastructure/GitBatchGateway";

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
 *
 * All git-based methods are async to avoid blocking the event loop.
 */
export class SpecReader {
  private readonly parser = new SpecParser();
  private readonly gitGateway: SpecGitGateway;

  constructor(batchGateway?: GitBatchGateway) {
    this.gitGateway = new SpecGitGateway(batchGateway);
  }

  /* ═══════════════════════════════════════════════════════
     Public API
     ═══════════════════════════════════════════════════════ */

  /**
   * Lists spec folders from the current working tree (filesystem).
   * Each spec gets `isCurrentBranch: true`.
   * Note: This method reads from the filesystem (not git), so it remains synchronous.
   */
  listSpecs(repoPath: string, branch?: string, specifyRoot?: string): SpecFolder[] {
    const root = specifyRoot ?? repoPath;
    const specsDir = path.join(root, "specs");

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
        const spec = this.parseSpecFolder(repoPath, specPath, entry.name, root);

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
  async listAllBranchSpecs(repoPath: string, specifyRoot?: string): Promise<SpecFolder[]> {
    const currentBranch = await this.gitGateway.getCurrentBranch(repoPath);
    const root = specifyRoot ?? repoPath;
    // Git paths are relative to repo root; derive the "specs" prefix inside the tree.
    const relRoot = path.relative(repoPath, root);
    const gitSpecsPrefix = relRoot ? `${relRoot.split(path.sep).join("/")}/` : "";

    // 1. Specs from working tree (current branch) — full filesystem parsing
    const currentSpecs = this.listSpecs(repoPath, currentBranch, root);

    // Current-branch specs always win — no need to compare timestamps
    const currentSpecNames = new Set(currentSpecs.map((s) => s.name));

    // 2. List all local branches
    const branches = await this.gitGateway.listLocalBranches(repoPath);

    // 3. For each non-current branch, collect candidate specs.
    //    When the same spec name appears on multiple non-current branches,
    //    keep the one from the branch with the newest commit.
    const bestCandidates = new Map<string, { branch: string; timestamp: number }>();

    for (const branch of branches) {
      if (branch === currentBranch) continue;

      try {
        const specNames = await this.gitGateway.gitListSpecDirs(repoPath, branch, gitSpecsPrefix);

        for (const specName of specNames) {
          // Current-branch specs always take priority
          if (currentSpecNames.has(specName)) continue;

          const ts = await this.gitGateway.getLatestCommitTimestamp(
            repoPath,
            branch,
            `${gitSpecsPrefix}specs/${specName}`,
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
      const spec = await this.parseGitSpecFolder(repoPath, branch, specName, gitSpecsPrefix);
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
  async readGitFile(repoPath: string, ref: string, relativePath: string): Promise<string | null> {
    return this.gitGateway.readGitFile(repoPath, ref, relativePath);
  }


  /* ═══════════════════════════════════════════════════════
     Git-based spec parsing (non-current branches)
     ═══════════════════════════════════════════════════════ */

  /**
   * Parses a spec folder from a non-current branch using git commands.
   * File paths use the virtual scheme: `gitref://<branch>/path`
   */
  private async parseGitSpecFolder(
    repoPath: string,
    branch: string,
    specName: string,
    prefix: string = "",
  ): Promise<SpecFolder | null> {
    try {
      const stages = await this.parseGitStages(repoPath, branch, specName, prefix);
      const fileNames = await this.gitGateway.gitListSpecFiles(repoPath, branch, specName, prefix);

      // Virtual file paths with gitref:// prefix (still scheme-relative to repo)
      const files = fileNames.map(
        (f) => `gitref://${branch}/${prefix}specs/${specName}/${f}`,
      );

      // Parse the "Created: YYYY-MM-DD" line from spec.md content on this branch
      let createdAt = Date.now();
      const specMdRelPath = `${prefix}specs/${specName}/spec.md`;
      const specMdContent = await this.gitGateway.readGitFile(repoPath, branch, specMdRelPath);
      if (specMdContent) {
        createdAt = SpecReader.parseCreatedDate(specMdContent) ?? Date.now();
      }

      return {
        id: ulid(),
        repoPath,
        name: specName,
        path: `gitref://${branch}/${prefix}specs/${specName}`,
        branch,
        isCurrentBranch: false,
        stages,
        files,
        createdAt,
      };
    } catch (error) {
      console.error(`Failed to parse git spec ${specName} on ${branch}:`, error);
      return null;
    }
  }

  private async parseGitStages(
    repoPath: string,
    branch: string,
    specName: string,
    prefix: string = "",
  ): Promise<PipelineStage[]> {
    const stages: PipelineStage[] = [];

    for (const stageName of PIPELINE_STAGES) {
      const stage = await this.parseGitStage(repoPath, branch, specName, stageName, prefix);
      stages.push(stage);
    }

    return stages;
  }

  private async parseGitStage(
    repoPath: string,
    branch: string,
    specName: string,
    stageName: PipelineStageName,
    prefix: string = "",
  ): Promise<PipelineStage> {
    // ── Implementation — derived from tasks.md checkbox progress ──
    if (stageName === "implementation") {
      return this.buildGitImplementationStage(repoPath, branch, specName, prefix);
    }

    // ── File-based stages (constitution, spec, plan, tasks) ──────
    let relativePath: string;
    if (stageName === "constitution") {
      relativePath = `${prefix}.specify/memory/constitution.md`;
    } else {
      const stageFileMap: Record<string, string> = {
        spec: "spec.md",
        plan: "plan.md",
        tasks: "tasks.md",
      };
      relativePath = `${prefix}specs/${specName}/${stageFileMap[stageName]}`;
    }

    const exists = await this.gitGateway.gitPathExists(repoPath, branch, relativePath);

    if (!exists) {
      return {
        name: stageName,
        status: "missing",
        filePath: null,
      };
    }

    const virtualPath = `gitref://${branch}/${relativePath}`;

    let status: StageStatus = "review";
    let metadata: PipelineStageMetadata | undefined;

    // Check for approval marker
    const content = await this.gitGateway.readGitFile(repoPath, branch, relativePath);
    if (content) {
      const approval = SpecParser.parseApprovalMarkerFromContent(content);
      if (approval) {
        status = "approved";
        metadata = {
          approvedBy: approval.approvedBy,
          approvedAt: approval.approvedAt,
        };
      }
    }

    return {
      name: stageName,
      status,
      filePath: virtualPath,
      metadata,
    };
  }

  /**
   * Builds the Implementation stage for a git branch by reading tasks.md content.
   */
  private async buildGitImplementationStage(
    repoPath: string,
    branch: string,
    specName: string,
    prefix: string = "",
  ): Promise<PipelineStage> {
    const tasksRelPath = `${prefix}specs/${specName}/tasks.md`;
    const exists = await this.gitGateway.gitPathExists(repoPath, branch, tasksRelPath);

    if (!exists) {
      return { name: "implementation", status: "pending", filePath: null };
    }

    const virtualPath = `gitref://${branch}/${tasksRelPath}`;
    const content = await this.gitGateway.readGitFile(repoPath, branch, tasksRelPath);

    if (!content) {
      return { name: "implementation", status: "pending", filePath: virtualPath };
    }

    const { taskCount, completedCount } = SpecParser.parseTaskCounts(content);
    const { metadata, status } = SpecParser.deriveImplementationStatus(taskCount, completedCount);
    return { name: "implementation", status, filePath: virtualPath, metadata };
  }

  /* ═══════════════════════════════════════════════════════
     Filesystem-based spec parsing (current branch)
     ═══════════════════════════════════════════════════════ */

  private parseSpecFolder(
    repoPath: string,
    specPath: string,
    specName: string,
    specifyRoot: string,
  ): SpecFolder | null {
    try {
      const stages = this.parseStages(specifyRoot, specPath);
      const files = this.listSpecFiles(specPath);

      // Parse the "Created: YYYY-MM-DD" line from spec.md content
      let createdAt = Date.now();
      const specMdPath = path.join(specPath, "spec.md");
      try {
        if (fs.existsSync(specMdPath)) {
          const content = fs.readFileSync(specMdPath, "utf-8");
          createdAt = SpecReader.parseCreatedDate(content) ?? Date.now();
        }
      } catch {
        // If read fails, keep Date.now()
      }

      return {
        id: ulid(),
        repoPath,
        name: specName,
        path: specPath,
        stages,
        files,
        createdAt,
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
    // ── Implementation stage ──────────────────────────────────────
    // Implementation derives its status from the tasks.md checkbox counts,
    // not from a folder on disk.  Clicking the node opens tasks.md.
    if (stageName === "implementation") {
      return this.buildImplementationStage(specPath);
    }

    // ── All other stages are file-based ───────────────────────────
    // Constitution lives at the repo level: .specify/memory/constitution.md
    // Spec / Plan / Tasks live inside the spec folder.
    let stagePath: string;
    if (stageName === "constitution") {
      stagePath = path.join(repoPath, ".specify", "memory", "constitution.md");
    } else {
      const stageFileMap: Record<string, string> = {
        spec: "spec.md",
        plan: "plan.md",
        tasks: "tasks.md",
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

    // Determine status — "review" by default (tasks included, same as spec/plan)
    let status: StageStatus = "review";
    let metadata: PipelineStageMetadata | undefined;

    // Check for approval marker
    const approval = this.parseApprovalMarker(stagePath);
    if (approval) {
      status = "approved";
      metadata = {
        approvedBy: approval.approvedBy,
        approvedAt: approval.approvedAt,
      };
    }

    return {
      name: stageName,
      status,
      filePath: stagePath,
      metadata,
    };
  }

  /**
   * Builds the Implementation stage by reading tasks.md for checkbox progress.
   * The filePath points to tasks.md so clicking the node opens it.
   * Status: pending → in-progress → done (based on completed tasks).
   */
  private buildImplementationStage(specPath: string): PipelineStage {
    const tasksPath = path.join(specPath, "tasks.md");

    if (!fs.existsSync(tasksPath)) {
      return { name: "implementation", status: "pending", filePath: null };
    }

    try {
      const content = fs.readFileSync(tasksPath, "utf-8");
      const { taskCount, completedCount } = SpecParser.parseTaskCounts(content);
      const { metadata, status } = SpecParser.deriveImplementationStatus(taskCount, completedCount);
      return { name: "implementation", status, filePath: tasksPath, metadata };
    } catch {
      return { name: "implementation", status: "pending", filePath: tasksPath };
    }
  }

  /* ═══════════════════════════════════════════════════════
     Content parsers (shared by filesystem & git paths)
     ═══════════════════════════════════════════════════════ */

  /**
   * Parses the "Created: YYYY-MM-DD" line from spec.md content.
   * Handles optional markdown bold markers, e.g. `**Created**: 2026-04-11`.
   * Returns a Unix timestamp in milliseconds, or null if not found / invalid.
   */
  static parseCreatedDate(content: string): number | null {
    const match = content.match(/^\*{0,2}Created\*{0,2}:\s*(\d{4}-\d{2}-\d{2})/m);
    if (!match) return null;
    const ts = new Date(match[1] + "T00:00:00").getTime();
    return Number.isFinite(ts) ? ts : null;
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
