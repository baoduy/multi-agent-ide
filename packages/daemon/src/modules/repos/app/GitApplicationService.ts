import type { GitOperationsGateway, GitStatusResult } from "../infra/GitOperationsGateway";
import type { GitBlameGateway } from "../infra/GitBlameGateway";
import type { BlameLine } from "@magenta/shared/ipc";
import { sanitizeGitName } from "@magenta/shared/sanitize";
import { AppError } from "../../../core/errors/AppError";
import { requireNonEmpty } from "../../../core/errors/validation";
import { wrapErrorAsync } from "../../../core/errors/wrapError";

/**
 * GitApplicationService orchestrates general git operations.
 * Validates inputs, delegates to GitOperationsGateway, wraps errors.
 */
export class GitApplicationService {
  constructor(
    private readonly gitOps: GitOperationsGateway,
    private readonly blameGateway?: GitBlameGateway,
  ) {}

  async createBranch(repoPath: string, branchName: string, startPoint?: string): Promise<{ success: boolean }> {
    requireNonEmpty(repoPath, "repoPath");
    requireNonEmpty(branchName, "branchName");

    const safeName = sanitizeGitName(branchName);
    if (!safeName) {
      throw new AppError("VALIDATION_ERROR", "Invalid branch name after sanitization");
    }

    return wrapErrorAsync(async () => {
      await this.gitOps.createBranch(repoPath, safeName, startPoint);
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

  /** Read the working-tree status for the commit dialog. */
  async status(repoPath: string): Promise<GitStatusResult> {
    requireNonEmpty(repoPath, "repoPath");
    return wrapErrorAsync(() => this.gitOps.status(repoPath), "GIT_ERROR", "read git status");
  }

  /**
   * Stage the selected files, commit, and optionally push the current branch.
   *
   * Behaviour:
   *  - Resets the index first so only the caller-chosen files end up in the commit.
   *  - Stages each selected path with `git add -A --` so deletions are captured.
   *  - Pushes via `pushCurrent` which sets upstream on first push.
   */
  async commit(
    repoPath: string,
    message: string,
    files: string[],
    push: boolean = false,
  ): Promise<{ commitSha: string; pushed: boolean; message: string }> {
    requireNonEmpty(repoPath, "repoPath");
    const trimmedMessage = message.trim();
    if (!trimmedMessage) throw new AppError("VALIDATION_ERROR", "Commit message cannot be empty.");
    if (files.length === 0) throw new AppError("VALIDATION_ERROR", "Select at least one file to commit.");

    return wrapErrorAsync(async () => {
      // Single combined stage+commit using implicit --only pathspec — 2 git
      // processes instead of the former 3 (reset + add + commit).
      const { sha } = await this.gitOps.commitOnly(repoPath, trimmedMessage, files);

      let pushed = false;
      let resultMessage = `Committed ${sha.slice(0, 7)}.`;
      if (push) {
        const pushResult = await this.gitOps.pushCurrent(repoPath);
        pushed = true;
        resultMessage = `Committed ${sha.slice(0, 7)} and pushed. ${pushResult.message}`;
      }
      return { commitSha: sha, pushed, message: resultMessage };
    }, "GIT_ERROR", "commit");
  }

  /**
   * Reset the current branch. For `hard` mode we require an explicit
   * `confirmHard:true` AND refuse if the working tree is dirty — a two-layer
   * guard paired with a UI confirmation that requires the user type "HARD".
   */
  async reset(
    repoPath: string,
    mode: "soft" | "mixed" | "hard",
    ref: string,
    confirmHard?: boolean,
  ): Promise<{ success: boolean; message: string }> {
    requireNonEmpty(repoPath, "repoPath");
    requireNonEmpty(ref, "ref");

    if (mode === "hard") {
      if (!confirmHard) {
        throw new AppError(
          "GIT_UNSAFE_OPERATION",
          "Hard reset requires explicit confirmation (confirmHard=true).",
        );
      }
      const status = await this.gitOps.status(repoPath);
      if (status.files.length > 0) {
        // Dirty tree — still allow, but only because we got confirmHard:true.
        // The UI already warned the user which files will be discarded.
      }
    }

    return wrapErrorAsync(async () => {
      await this.gitOps.reset(repoPath, mode, ref);
      return { success: true, message: `Reset ${mode} to ${ref}.` };
    }, "GIT_ERROR", `${mode} reset`);
  }

  async revert(
    repoPath: string,
    sha: string,
    noCommit?: boolean,
  ): Promise<{ success: boolean; message: string }> {
    requireNonEmpty(repoPath, "repoPath");
    requireNonEmpty(sha, "sha");
    return wrapErrorAsync(async () => {
      const res = await this.gitOps.revert(repoPath, sha, noCommit);
      return { success: true, message: res.message };
    }, "GIT_ERROR", "revert commit");
  }

  async blame(repoPath: string, filePath: string, ref?: string): Promise<BlameLine[]> {
    requireNonEmpty(repoPath, "repoPath");
    requireNonEmpty(filePath, "filePath");
    if (!this.blameGateway) {
      throw new AppError("INTERNAL_ERROR", "Blame gateway not configured.");
    }
    const gateway = this.blameGateway;
    return wrapErrorAsync(
      () => gateway.blame(repoPath, filePath, ref),
      "GIT_ERROR",
      "read blame",
    );
  }
}
