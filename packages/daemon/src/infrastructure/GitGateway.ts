import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createGit } from "./utils/createGit";
import { AppError } from "../errors/AppError";

/**
 * Info about a single git worktree discovered on disk.
 */
export interface WorktreeEntry {
  repoPath: string;
  worktreePath: string;
  branch: string;
  name: string;
  createdAt: number;
}

/**
 * GitGateway wraps git worktree operations.
 * Encapsulates all git-related I/O and parsing logic.
 *
 * Uses simple-git for all git operations — fully async, never blocks the event loop.
 */
export class GitGateway {
  /**
   * Parse the output of `git worktree list --porcelain` into structured entries.
   * Each worktree block looks like:
   *   worktree /path/to/worktree
   *   HEAD <sha>
   *   branch refs/heads/<name>
   *   <blank line>
   *
   * For detached HEADs the "branch" line is replaced with "detached".
   *
   * Uses a single `git worktree list --porcelain` invocation (previously two).
   */
  async listWorktrees(repoPath: string): Promise<WorktreeEntry[]> {
    if (!repoPath) {
      return [];
    }

    const resolved = path.resolve(repoPath);
    const git = createGit(resolved);
    const raw = await git.raw(["worktree", "list", "--porcelain"]);

    // Extract main worktree path from the first block (avoids a second git call)
    const mainPath = this.extractMainWorktreePath(raw, resolved);
    return this.parseWorktreeList(raw, resolved, mainPath);
  }

  /**
   * Extract the main worktree path from the first block of `git worktree list --porcelain` output.
   * Falls back to the resolved repoPath if parsing fails.
   */
  private extractMainWorktreePath(raw: string, repoPath: string): string {
    const first = raw.split("\n")[0]; // "worktree /path/to/main"
    if (first && first.startsWith("worktree ")) {
      return first.slice("worktree ".length);
    }
    return path.resolve(repoPath);
  }

  /**
   * Parse the output of `git worktree list --porcelain` into structured entries.
   */
  private parseWorktreeList(raw: string, repoPath: string, mainWorktreePath: string): WorktreeEntry[] {
    const entries: WorktreeEntry[] = [];
    const blocks = raw.trim().split("\n\n");

    for (const block of blocks) {
      const lines = block.trim().split("\n");
      let wtPath = "";
      let branch = "";

      for (const line of lines) {
        if (line.startsWith("worktree ")) {
          wtPath = line.slice("worktree ".length);
        } else if (line.startsWith("branch refs/heads/")) {
          branch = line.slice("branch refs/heads/".length);
        } else if (line === "detached") {
          branch = "(detached)";
        }
      }

      // Skip the main worktree (the repo itself)
      if (!wtPath || wtPath === mainWorktreePath) continue;

      // Derive a human-friendly name from the directory name
      const name = path.basename(wtPath);

      // Use directory mtime as createdAt
      let createdAt = Date.now();
      try {
        const stat = fs.statSync(wtPath);
        createdAt = Math.floor(stat.mtimeMs);
      } catch {
        // directory may have been removed
      }

      entries.push({ repoPath, worktreePath: wtPath, branch, name, createdAt });
    }

    return entries;
  }

  /**
   * Create a new git worktree with fallback strategies.
   * Uses multiple strategies if the primary approach fails.
   */
  async createWorktree(repoPath: string, worktreePath: string, branch: string, safeName: string): Promise<void> {
    // If the worktree directory already exists, verify it and return
    if (fs.existsSync(worktreePath) && fs.existsSync(path.join(worktreePath, ".git"))) {
      return;
    }

    // Ensure the .worktrees directory exists
    const worktreeDir = path.dirname(worktreePath);
    if (!fs.existsSync(worktreeDir)) {
      fs.mkdirSync(worktreeDir, { recursive: true });
    }

    const git = createGit(repoPath);

    // Create a new local branch from the remote tracking branch, then create worktree.
    // If the branch already exists locally, just create the worktree from it.
    try {
      // Try to create worktree tracking the remote branch
      await git.raw(["worktree", "add", worktreePath, "-b", safeName, `origin/${branch}`]);
    } catch {
      // If local branch already exists, try creating worktree from it
      try {
        await git.raw(["worktree", "add", worktreePath, branch]);
      } catch {
        // If both fail, try creating worktree with detached HEAD from the ref
        await git.raw(["worktree", "add", "--detach", worktreePath, `origin/${branch}`]);
      }
    }
  }

  /**
   * Get the status of changed files in a worktree relative to its tracking branch.
   * Returns list of changed files with their status.
   */
  async getWorktreeStatus(worktreePath: string): Promise<{
    files: Array<{ path: string; status: "added" | "modified" | "deleted" | "renamed" | "copied" | "untracked"; mtimeMs?: number }>;
    ahead: number;
    behind: number;
  }> {
    const resolved = path.resolve(worktreePath);
    const git = createGit(resolved);

    // Use simple-git's structured status output
    const statusResult = await git.status();

    const files: Array<{ path: string; status: "added" | "modified" | "deleted" | "renamed" | "copied" | "untracked"; mtimeMs?: number }> = [];

    // Map simple-git FileStatusResult to our simplified status
    for (const f of statusResult.not_added) {
      files.push({ path: f, status: "untracked" });
    }
    for (const f of statusResult.created) {
      files.push({ path: f, status: "added" });
    }
    for (const f of statusResult.deleted) {
      files.push({ path: f, status: "deleted" });
    }
    for (const f of statusResult.modified) {
      files.push({ path: f, status: "modified" });
    }
    for (const f of statusResult.renamed) {
      files.push({ path: (f as any).to ?? f, status: "renamed" });
    }
    // Staged files that aren't in the above categories
    for (const f of statusResult.staged) {
      // Avoid duplicates — staged files may already appear in created/modified/deleted
      if (!files.some((entry) => entry.path === f)) {
        files.push({ path: f, status: "modified" });
      }
    }

    await Promise.all(
      files.map(async (f) => {
        if (f.status === "deleted") return;
        try {
          const stat = await fsp.stat(path.join(resolved, f.path));
          f.mtimeMs = stat.mtimeMs;
        } catch {
          // ignore
        }
      }),
    );

    return {
      files,
      ahead: statusResult.ahead,
      behind: statusResult.behind,
    };
  }

  /**
   * Merge a worktree's branch into a target branch locally (no push).
   * Steps:
   *   1. Checkout target branch in the main repo
   *   2. Attempt fast-forward merge first
   *   3. Fall back to regular merge if fast-forward is not possible
   *   4. If merge conflicts arise but both trees are identical, fast-forward to the worktree branch
   */
  async mergeWorktree(repoPath: string, worktreeBranch: string, targetBranch: string): Promise<{ success: boolean; message: string }> {
    const resolved = path.resolve(repoPath);
    const git = createGit(resolved);

    try {
      // Save current branch to restore later
      const currentBranch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim();

      // Refuse to merge if the working tree has uncommitted changes — the
      // subsequent `checkout(targetBranch)` would either fail with a
      // confusing git error or silently carry the dirty state onto the
      // target branch. Surfacing a clear WORKTREE_CONFLICT lets the UI
      // prompt the user to commit or stash first.
      const status = await git.status();
      if (!status.isClean()) {
        throw new AppError(
          "WORKTREE_CONFLICT",
          "Cannot merge: the repository has uncommitted changes. Commit or stash them first.",
        );
      }

      // Checkout target branch
      await git.checkout(targetBranch);

      const restoreOriginalBranch = async () => {
        if (currentBranch) {
          try {
            await git.checkout(currentBranch);
          } catch {
            // best effort
          }
        }
      };

      try {
        // Attempt merge allowing fast-forward
        const mergeResult = await git.merge(["--ff", "--no-edit", worktreeBranch]);

        // Check for "Already up to date" result
        const resultStr = String(mergeResult?.result ?? "");
        if (resultStr.includes("Already up to date") || resultStr.includes("up-to-date")) {
          await restoreOriginalBranch();
          return { success: true, message: `'${targetBranch}' is already up to date with '${worktreeBranch}'.` };
        }

        await restoreOriginalBranch();
        return { success: true, message: `Merged '${worktreeBranch}' into '${targetBranch}' successfully.` };
      } catch (mergeError) {
        // Abort the failed merge first
        try {
          await git.merge(["--abort"]);
        } catch {
          // merge --abort may fail if there's nothing to abort
        }

        // Check if both branches result in the same tree (identical content).
        try {
          const targetTree = (await git.revparse([`${targetBranch}^{tree}`])).trim();
          const worktreeTree = (await git.revparse([`${worktreeBranch}^{tree}`])).trim();

          if (targetTree === worktreeTree) {
            // Trees are identical — fast-forward target to worktree branch tip
            await git.merge(["--ff-only", worktreeBranch]);
            await restoreOriginalBranch();
            return {
              success: true,
              message: `Merged '${worktreeBranch}' into '${targetBranch}' (branches had identical content).`,
            };
          }

          // Check if target is ancestor of worktree — pure fast-forward
          const mergeBase = (await git.raw(["merge-base", targetBranch, worktreeBranch])).trim();
          const targetCommit = (await git.revparse([targetBranch])).trim();

          if (mergeBase === targetCommit) {
            await git.merge(["--ff-only", worktreeBranch]);
            await restoreOriginalBranch();
            return {
              success: true,
              message: `Fast-forwarded '${targetBranch}' to '${worktreeBranch}'.`,
            };
          }
        } catch {
          // Tree comparison or ff-only fallback failed — fall through to error
        }

        await restoreOriginalBranch();

        return {
          success: false,
          message: `Merge conflict: could not merge '${worktreeBranch}' into '${targetBranch}'. ${mergeError instanceof Error ? mergeError.message : String(mergeError)}`,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Failed to checkout '${targetBranch}': ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * List local branches for a repository.
   */
  async listLocalBranches(repoPath: string): Promise<{ branches: string[]; current: string }> {
    const resolved = path.resolve(repoPath);
    const git = createGit(resolved);

    const summary = await git.branchLocal();

    return {
      branches: summary.all,
      current: summary.current,
    };
  }

  /**
   * Remove a git worktree.
   * Uses `git worktree remove` with --force to handle dirty worktrees.
   */
  async removeWorktree(repoPath: string, worktreePath: string): Promise<void> {
    const resolved = path.resolve(repoPath);
    const wtResolved = path.resolve(worktreePath);
    const git = createGit(resolved);

    try {
      await git.raw(["worktree", "remove", wtResolved, "--force"]);
    } catch (error) {
      // Fallback: prune stale worktrees if remove failed
      try {
        // Remove the directory manually, then prune
        if (fs.existsSync(wtResolved)) {
          fs.rmSync(wtResolved, { recursive: true, force: true });
        }
        await git.raw(["worktree", "prune"]);
      } catch {
        throw error; // re-throw original error
      }
    }
  }

  /**
   * Ensure .worktrees is in .gitignore.
   */
  ensureGitignoreEntry(repoPath: string, entry: string): void {
    const gitignorePath = path.join(repoPath, ".gitignore");
    if (fs.existsSync(gitignorePath)) {
      const gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
      if (!gitignoreContent.includes(entry)) {
        fs.appendFileSync(gitignorePath, `\n${entry}/\n`, "utf-8");
      }
    }
  }
}
