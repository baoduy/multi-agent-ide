import fs from "node:fs";
import path from "node:path";
import { sanitizeWorktreeName } from "@magenta/shared/sanitize";
import type { GitGateway, WorktreeEntry } from "../../repos/infra/GitGateway";
import type { RepoRepository } from "../../repos/persistence/RepoRepository";
import { requireNonEmpty } from "../../../core/errors/validation";
import { wrapErrorAsync } from "../../../core/errors/wrapError";
import { AppError } from "../../../core/errors/AppError";

/**
 * WorktreeApplicationService orchestrates worktree operations.
 * Delegates to GitGateway for actual git operations.
 *
 * All methods are async — GitGateway no longer blocks the event loop.
 */
export class WorktreeApplicationService {
  constructor(
    private readonly gitGateway: GitGateway,
    private readonly repoRepository: RepoRepository,
  ) {}

  async listWorktrees(repoPath?: string): Promise<WorktreeEntry[]> {
    if (!repoPath) {
      return [];
    }

    // If the repo directory no longer exists, remove it from the database
    if (!fs.existsSync(repoPath)) {
      console.warn(`[worktree-service] Repo path no longer exists, removing from DB: ${repoPath}`);
      this.repoRepository.deleteByPath(repoPath);
      return [];
    }

    return this.gitGateway.listWorktrees(repoPath);
  }

  async getWorktreeStatus(repoPath: string, worktreePath: string): Promise<{
    files: Array<{ path: string; status: "added" | "modified" | "deleted" | "renamed" | "copied" | "untracked"; mtimeMs?: number }>;
    ahead: number;
    behind: number;
  }> {
    requireNonEmpty(worktreePath, "worktreePath");

    return wrapErrorAsync(
      () => this.gitGateway.getWorktreeStatus(worktreePath),
      "GIT_ERROR",
      "get worktree status",
    );
  }

  async mergeWorktree(
    repoPath: string,
    worktreePath: string,
    worktreeBranch: string,
    targetBranch: string,
  ): Promise<{ success: boolean; message: string }> {
    requireNonEmpty(repoPath, "repoPath");
    requireNonEmpty(worktreeBranch, "worktreeBranch");
    requireNonEmpty(targetBranch, "targetBranch");

    if (worktreeBranch === targetBranch) {
      throw new AppError("VALIDATION_ERROR", "Cannot merge a branch into itself");
    }

    return wrapErrorAsync(
      () => this.gitGateway.mergeWorktree(repoPath, worktreeBranch, targetBranch),
      "GIT_ERROR",
      "merge worktree",
    );
  }

  async listLocalBranches(repoPath: string): Promise<{ branches: string[]; current: string }> {
    requireNonEmpty(repoPath, "repoPath");

    return wrapErrorAsync(
      () => this.gitGateway.listLocalBranches(repoPath),
      "GIT_ERROR",
      "list branches",
    );
  }

  async deleteWorktree(repoPath: string, worktreePath: string): Promise<{ success: boolean; message: string }> {
    requireNonEmpty(repoPath, "repoPath");
    requireNonEmpty(worktreePath, "worktreePath");

    return wrapErrorAsync(
      async () => {
        await this.gitGateway.removeWorktree(repoPath, worktreePath);
        return { success: true, message: "Worktree removed successfully." };
      },
      "GIT_ERROR",
      "remove worktree",
    );
  }

  async createWorktree(repoPath: string, branch: string, name: string): Promise<{ worktreePath: string; success: boolean }> {
    requireNonEmpty(repoPath, "repoPath");
    requireNonEmpty(branch, "branch");
    requireNonEmpty(name, "name");

    const safeName = sanitizeWorktreeName(name);
    if (!safeName) {
      throw new AppError("VALIDATION_ERROR", "Invalid worktree name after sanitization");
    }

    const worktreeDir = path.join(repoPath, ".worktrees");
    const worktreePath = path.join(worktreeDir, safeName);

    return wrapErrorAsync(
      async () => {
        await this.gitGateway.createWorktree(repoPath, worktreePath, branch, safeName);
        this.gitGateway.ensureGitignoreEntry(repoPath, ".worktrees");
        return { worktreePath, success: true };
      },
      "GIT_ERROR",
      "create worktree",
    );
  }
}
