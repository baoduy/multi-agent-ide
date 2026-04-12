import path from "node:path";
import { sanitizeName } from "../domain/sanitizeName";
import type { GitGateway, WorktreeEntry } from "../infrastructure/GitGateway";
import { requireNonEmpty } from "../errors/validation";
import { wrapError } from "../errors/wrapError";
import { AppError } from "../errors/AppError";

/**
 * WorktreeApplicationService orchestrates worktree operations.
 * Delegates to GitGateway for actual git operations.
 */
export class WorktreeApplicationService {
  constructor(private readonly gitGateway: GitGateway) {}

  listWorktrees(repoPath?: string): WorktreeEntry[] {
    if (!repoPath) {
      return [];
    }

    return this.gitGateway.listWorktrees(repoPath);
  }

  getWorktreeStatus(repoPath: string, worktreePath: string): {
    files: Array<{ path: string; status: "added" | "modified" | "deleted" | "renamed" | "copied" | "untracked" }>;
    ahead: number;
    behind: number;
  } {
    requireNonEmpty(worktreePath, "worktreePath");

    return wrapError(
      () => this.gitGateway.getWorktreeStatus(worktreePath),
      "GIT_ERROR",
      "get worktree status",
    );
  }

  mergeWorktree(
    repoPath: string,
    worktreePath: string,
    worktreeBranch: string,
    targetBranch: string,
  ): { success: boolean; message: string } {
    requireNonEmpty(repoPath, "repoPath");
    requireNonEmpty(worktreeBranch, "worktreeBranch");
    requireNonEmpty(targetBranch, "targetBranch");

    if (worktreeBranch === targetBranch) {
      throw new AppError("VALIDATION_ERROR", "Cannot merge a branch into itself");
    }

    return wrapError(
      () => this.gitGateway.mergeWorktree(repoPath, worktreeBranch, targetBranch),
      "GIT_ERROR",
      "merge worktree",
    );
  }

  listLocalBranches(repoPath: string): { branches: string[]; current: string } {
    requireNonEmpty(repoPath, "repoPath");

    return wrapError(
      () => this.gitGateway.listLocalBranches(repoPath),
      "GIT_ERROR",
      "list branches",
    );
  }

  deleteWorktree(repoPath: string, worktreePath: string): { success: boolean; message: string } {
    requireNonEmpty(repoPath, "repoPath");
    requireNonEmpty(worktreePath, "worktreePath");

    return wrapError(
      () => {
        this.gitGateway.removeWorktree(repoPath, worktreePath);
        return { success: true, message: "Worktree removed successfully." };
      },
      "GIT_ERROR",
      "remove worktree",
    );
  }

  createWorktree(repoPath: string, branch: string, name: string): { worktreePath: string; success: boolean } {
    requireNonEmpty(repoPath, "repoPath");
    requireNonEmpty(branch, "branch");
    requireNonEmpty(name, "name");

    const safeName = sanitizeName(name);
    if (!safeName) {
      throw new AppError("VALIDATION_ERROR", "Invalid worktree name after sanitization");
    }

    const worktreeDir = path.join(repoPath, ".worktrees");
    const worktreePath = path.join(worktreeDir, safeName);

    return wrapError(
      () => {
        this.gitGateway.createWorktree(repoPath, worktreePath, branch, safeName);
        this.gitGateway.ensureGitignoreEntry(repoPath, ".worktrees");
        return { worktreePath, success: true };
      },
      "GIT_ERROR",
      "create worktree",
    );
  }
}
