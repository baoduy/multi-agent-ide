import type { GitOperationsGateway } from "../infrastructure/GitOperationsGateway";
import { requireNonEmpty } from "../errors/validation";
import { wrapErrorAsync } from "../errors/wrapError";

/**
 * GitApplicationService orchestrates general git operations.
 * Validates inputs, delegates to GitOperationsGateway, wraps errors.
 */
export class GitApplicationService {
  constructor(private readonly gitOps: GitOperationsGateway) {}

  async createBranch(repoPath: string, branchName: string, startPoint?: string): Promise<{ success: boolean }> {
    requireNonEmpty(repoPath, "repoPath");
    requireNonEmpty(branchName, "branchName");
    return wrapErrorAsync(async () => {
      await this.gitOps.createBranch(repoPath, branchName, startPoint);
      return { success: true };
    }, "GIT_ERROR", "create branch");
  }

  async fetch(repoPath: string, remote?: string): Promise<{ success: boolean; message: string }> {
    requireNonEmpty(repoPath, "repoPath");
    return wrapErrorAsync(async () => {
      const result = await this.gitOps.fetch(repoPath, remote);
      return { success: true, message: result.message };
    }, "GIT_ERROR", "fetch");
  }

  async pull(repoPath: string, remote?: string, branch?: string): Promise<{ success: boolean; message: string; conflicts?: string[] }> {
    requireNonEmpty(repoPath, "repoPath");
    return wrapErrorAsync(
      () => this.gitOps.pull(repoPath, remote, branch),
      "GIT_ERROR",
      "pull",
    );
  }

  async push(repoPath: string, remote?: string, branch?: string, force?: boolean): Promise<{ success: boolean; message: string }> {
    requireNonEmpty(repoPath, "repoPath");
    return wrapErrorAsync(async () => {
      const result = await this.gitOps.push(repoPath, remote, branch, force);
      return { success: true, message: result.message };
    }, "GIT_ERROR", "push");
  }
}
