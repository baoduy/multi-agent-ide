import path from "node:path";
import type { GitFileStatus } from "@magenta/shared/ipc";
import { createGit } from "./utils/createGit";

/** Result of reading the working tree status. */
export type GitStatusResult = {
  files: GitFileStatus[];
  branch: string;
  ahead: number;
  behind: number;
  hasUpstream: boolean;
};

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

  /**
   * Push the current branch, setting upstream if it hasn't been published yet.
   * Returns the remote/branch it pushed to so callers can report it.
   */
  async pushCurrent(repoPath: string): Promise<{ message: string; branch: string }> {
    const git = createGit(path.resolve(repoPath));
    const status = await git.status();
    const branch = status.current;
    if (!branch) throw new Error("Detached HEAD — cannot push.");

    const remotes = await git.getRemotes();
    if (remotes.length === 0) throw new Error("No git remote configured.");
    const remote = remotes.find((r) => r.name === "origin")?.name ?? remotes[0]!.name;

    if (status.tracking) {
      await git.push([remote, branch]);
    } else {
      // First-time push — set upstream.
      await git.push(["--set-upstream", remote, branch]);
    }
    return { message: `Pushed to ${remote}/${branch}.`, branch };
  }

  /**
   * Read the porcelain status of the working tree.
   * Staged + unstaged entries for the same path both appear (with `staged` flag).
   */
  async status(repoPath: string): Promise<GitStatusResult> {
    const git = createGit(path.resolve(repoPath));
    const s = await git.status();

    const files: GitFileStatus[] = [];

    // Staged entries: created/modified/deleted/renamed
    for (const f of s.created) files.push({ path: f, status: "added", staged: true });
    for (const f of s.staged) {
      // `staged` in simple-git is staged-modified; skip if already captured as created
      if (!s.created.includes(f)) files.push({ path: f, status: "modified", staged: true });
    }
    for (const f of s.deleted) {
      // simple-git lumps staged-deleted + unstaged-deleted; we split below using raw file list.
      files.push({ path: f, status: "deleted", staged: true });
    }
    for (const r of s.renamed) {
      files.push({ path: r.to, oldPath: r.from, status: "renamed", staged: true });
    }

    // Unstaged modifications (staged list comes from `s.staged` above; `s.modified` is working-tree diff).
    for (const f of s.modified) {
      // Avoid double-listing: if this path is already present (staged), mark an additional unstaged row.
      files.push({ path: f, status: "modified", staged: false });
    }

    // Conflicted
    for (const f of s.conflicted) {
      files.push({ path: f, status: "conflicted", staged: false });
    }

    // Untracked
    for (const f of s.not_added) {
      files.push({ path: f, status: "untracked", staged: false });
    }

    return {
      files,
      branch: s.current ?? "",
      ahead: s.ahead ?? 0,
      behind: s.behind ?? 0,
      hasUpstream: Boolean(s.tracking),
    };
  }

  /**
   * Reset the index so that only explicitly-selected files end up staged for the commit.
   * Uses `git reset HEAD -- .` (unstage everything) rather than the destructive `--hard`.
   */
  async resetIndex(repoPath: string): Promise<void> {
    const git = createGit(path.resolve(repoPath));
    // If the repo has no commits yet, `git reset HEAD` fails — skip in that case.
    try {
      await git.raw(["reset", "HEAD", "--", "."]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("ambiguous argument 'HEAD'") || msg.includes("unknown revision")) {
        return; // empty repo — nothing staged yet
      }
      throw err;
    }
  }

  /** Stage the given paths. Handles deletions too (`git add -A <path>`). */
  async stageFiles(repoPath: string, files: string[]): Promise<void> {
    if (files.length === 0) return;
    const git = createGit(path.resolve(repoPath));
    await git.raw(["add", "-A", "--", ...files]);
  }

  /** Commit staged changes. Returns the new commit SHA. */
  async commit(repoPath: string, message: string): Promise<{ sha: string }> {
    const git = createGit(path.resolve(repoPath));
    const result = await git.commit(message);
    return { sha: result.commit };
  }

  /**
   * Commit exactly the given files using implicit `--only` semantics.
   *
   * `git commit -- <paths>` commits only those paths (same as `--only`),
   * leaving the rest of the index untouched. That means we can drop the
   * preceding `git reset HEAD` step and still guarantee only the caller's
   * files land in the commit. Result: 2 git processes (add + commit) instead
   * of 3 (reset + add + commit).
   */
  async commitOnly(repoPath: string, message: string, files: string[]): Promise<{ sha: string }> {
    const git = createGit(path.resolve(repoPath));
    await git.raw(["add", "-A", "--", ...files]);
    const result = await git.commit(message, files);
    return { sha: result.commit };
  }

  /**
   * Reset the current branch to a ref. Mode controls whether the working tree
   * and index are also rewound:
   *  - soft:  keep index + working tree
   *  - mixed: reset index, keep working tree (default `git reset`)
   *  - hard:  discard BOTH index and working tree changes — destructive
   */
  async reset(repoPath: string, mode: "soft" | "mixed" | "hard", ref: string): Promise<void> {
    const git = createGit(path.resolve(repoPath));
    const flag = mode === "soft" ? "--soft" : mode === "hard" ? "--hard" : "--mixed";
    await git.raw(["reset", flag, ref]);
  }

  /**
   * Revert a commit by generating a new commit that reverses its changes.
   * `noCommit` stages the revert without committing (for review).
   */
  async revert(repoPath: string, sha: string, noCommit?: boolean): Promise<{ message: string }> {
    const git = createGit(path.resolve(repoPath));
    const args = ["revert"];
    if (noCommit) args.push("--no-commit");
    args.push(sha);
    const out = await git.raw(args);
    return { message: out.trim() || `Reverted ${sha.slice(0, 7)}.` };
  }
}
