import path from "node:path";
import { createGit } from "./utils/createGit";

/**
 * GitOperationsGateway wraps general git operations (branch, fetch, pull, push).
 * Distinct from GitGateway which focuses on worktree lifecycle.
 *
 * Uses simple-git via createGit() — fully async, never blocks the event loop.
 */
export class GitOperationsGateway {
  async createBranch(repoPath: string, branchName: string, startPoint?: string): Promise<void> {
    const git = createGit(path.resolve(repoPath));
    const args = startPoint ? [branchName, startPoint] : [branchName];
    await git.branch(args);
  }

  async fetch(repoPath: string, remote = "origin"): Promise<{ message: string }> {
    const git = createGit(path.resolve(repoPath));
    const result = await git.fetch(remote);
    // simple-git returns FetchSummary — build a human-readable message
    const updates = result.updated?.length ?? 0;
    const message = updates > 0 ? `Fetched ${updates} update(s) from ${remote}.` : "Already up to date.";
    return { message };
  }

  async pull(
    repoPath: string,
    remote = "origin",
    branch?: string,
  ): Promise<{ success: boolean; message: string; conflicts?: string[] }> {
    const git = createGit(path.resolve(repoPath));
    try {
      const args = ["--no-rebase", remote];
      if (branch) args.push(branch);
      const result = await git.pull(args);
      const summary = result.summary;
      const message =
        summary.changes || summary.insertions || summary.deletions
          ? `Pulled ${summary.changes} change(s), +${summary.insertions} -${summary.deletions}.`
          : "Already up to date.";
      return { success: true, message };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("CONFLICT") || msg.includes("Automatic merge failed")) {
        // Abort the failed merge to leave the working tree clean
        try { await git.merge(["--abort"]); } catch { /* best effort */ }
        return { success: false, message: "Pull resulted in merge conflicts. Merge aborted.", conflicts: [] };
      }
      throw error;
    }
  }

  async push(
    repoPath: string,
    remote = "origin",
    branch?: string,
    force = false,
  ): Promise<{ message: string }> {
    const git = createGit(path.resolve(repoPath));
    const args: string[] = [remote];
    if (branch) args.push(branch);
    if (force) args.push("--force-with-lease");
    await git.push(args);
    return { message: `Pushed to ${remote}${branch ? `/${branch}` : ""} successfully.` };
  }
}
