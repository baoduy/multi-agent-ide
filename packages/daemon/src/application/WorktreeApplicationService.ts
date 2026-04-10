import path from "node:path";
import { AppError } from "../errors/AppError";
import { GitGateway, type WorktreeEntry } from "../infrastructure/GitGateway";

/**
 * WorktreeApplicationService orchestrates worktree operations.
 * Delegates to GitGateway for actual git operations.
 */
export class WorktreeApplicationService {
  private readonly gitGateway = new GitGateway();

  listWorktrees(repoPath?: string): WorktreeEntry[] {
    // If a specific repo is given, list only its worktrees.
    // Otherwise we would need access to all repos — the caller
    // should iterate repos on the UI side.
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
    if (!worktreePath) {
      throw new AppError("VALIDATION_ERROR", "Missing worktreePath");
    }

    try {
      return this.gitGateway.getWorktreeStatus(worktreePath);
    } catch (error) {
      throw new AppError(
        "GIT_ERROR",
        `Failed to get worktree status: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  mergeWorktree(
    repoPath: string,
    worktreePath: string,
    worktreeBranch: string,
    targetBranch: string,
  ): { success: boolean; message: string } {
    if (!repoPath || !worktreeBranch || !targetBranch) {
      throw new AppError("VALIDATION_ERROR", "Missing repoPath, worktreeBranch, or targetBranch");
    }

    if (worktreeBranch === targetBranch) {
      throw new AppError("VALIDATION_ERROR", "Cannot merge a branch into itself");
    }

    try {
      return this.gitGateway.mergeWorktree(repoPath, worktreeBranch, targetBranch);
    } catch (error) {
      throw new AppError(
        "GIT_ERROR",
        `Failed to merge worktree: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  listLocalBranches(repoPath: string): { branches: string[]; current: string } {
    if (!repoPath) {
      throw new AppError("VALIDATION_ERROR", "Missing repoPath");
    }

    try {
      return this.gitGateway.listLocalBranches(repoPath);
    } catch (error) {
      throw new AppError(
        "GIT_ERROR",
        `Failed to list branches: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  deleteWorktree(repoPath: string, worktreePath: string): { success: boolean; message: string } {
    if (!repoPath || !worktreePath) {
      throw new AppError("VALIDATION_ERROR", "Missing repoPath or worktreePath");
    }

    try {
      this.gitGateway.removeWorktree(repoPath, worktreePath);
      return { success: true, message: "Worktree removed successfully." };
    } catch (error) {
      throw new AppError(
        "GIT_ERROR",
        `Failed to remove worktree: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  createWorktree(repoPath: string, branch: string, name: string): { worktreePath: string; success: boolean } {
    if (!repoPath || !branch || !name) {
      throw new AppError("VALIDATION_ERROR", "Missing repoPath, branch, or name");
    }

    // Sanitize name — allow only alphanumeric, dash, underscore
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-{2,}/g, "-");
    if (!safeName) {
      throw new AppError("VALIDATION_ERROR", "Invalid worktree name after sanitization");
    }

    const worktreeDir = path.join(repoPath, ".worktrees");
    const worktreePath = path.join(worktreeDir, safeName);

    try {
      this.gitGateway.createWorktree(repoPath, worktreePath, branch, safeName);
      this.gitGateway.ensureGitignoreEntry(repoPath, ".worktrees");

      return { worktreePath, success: true };
    } catch (error) {
      throw new AppError(
        "GIT_ERROR",
        `Failed to create worktree: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
