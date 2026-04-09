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
