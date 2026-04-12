import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
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
   */
  listWorktrees(repoPath: string): WorktreeEntry[] {
    if (!repoPath) {
      return [];
    }

    const resolved = path.resolve(repoPath);
    const raw = execSync("git worktree list --porcelain", {
      cwd: resolved,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const mainPath = this.getMainWorktreePath(resolved);
    return this.parseWorktreeList(raw, resolved, mainPath);
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
   * Get the main worktree path for a repo.
   * This is the path shown in the first block of `git worktree list --porcelain`.
   */
  private getMainWorktreePath(repoPath: string): string {
    try {
      const raw = execSync("git worktree list --porcelain", { cwd: repoPath, encoding: "utf-8" });
      const first = raw.split("\n")[0]; // "worktree /path/to/main"
      if (first.startsWith("worktree ")) {
        return first.slice("worktree ".length);
      }
    } catch {
      // fallback
    }
    return path.resolve(repoPath);
  }

  /**
   * Create a new git worktree with fallback strategies.
   * Uses multiple strategies if the primary approach fails.
   */
  createWorktree(repoPath: string, worktreePath: string, branch: string, safeName: string): void {
    // If the worktree directory already exists, verify it and return
    if (fs.existsSync(worktreePath) && fs.existsSync(path.join(worktreePath, ".git"))) {
      return;
    }

    // Ensure the .worktrees directory exists
    const worktreeDir = path.dirname(worktreePath);
    if (!fs.existsSync(worktreeDir)) {
      fs.mkdirSync(worktreeDir, { recursive: true });
    }

    // Create a new local branch from the remote tracking branch, then create worktree.
    // If the branch already exists locally, just create the worktree from it.
    try {
      // Try to create worktree tracking the remote branch
      execSync(
        `git worktree add "${worktreePath}" -b "${safeName}" "origin/${branch}"`,
        { cwd: repoPath, stdio: "pipe" },
      );
    } catch {
      // If local branch already exists, try creating worktree from it
      try {
        execSync(
          `git worktree add "${worktreePath}" "${branch}"`,
          { cwd: repoPath, stdio: "pipe" },
        );
      } catch {
        // If both fail, try creating worktree with detached HEAD from the ref
        execSync(
          `git worktree add --detach "${worktreePath}" "origin/${branch}"`,
          { cwd: repoPath, stdio: "pipe" },
        );
      }
    }
  }

  /**
   * File status entry from a worktree's git status.
   */

  /**
   * Get the status of changed files in a worktree relative to its tracking branch.
   * Returns list of changed files with their status.
   */
  getWorktreeStatus(worktreePath: string): { files: Array<{ path: string; status: "added" | "modified" | "deleted" | "renamed" | "copied" | "untracked" }>; ahead: number; behind: number } {
    const resolved = path.resolve(worktreePath);

    // Get changed files (staged + unstaged + untracked)
    const raw = execSync("git status --porcelain=v1", {
      cwd: resolved,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const files: Array<{ path: string; status: "added" | "modified" | "deleted" | "renamed" | "copied" | "untracked" }> = [];

    for (const line of raw.trim().split("\n")) {
      if (!line) continue;
      const xy = line.substring(0, 2);
      const filePath = line.substring(3).trim();

      // Map git status codes to our simplified status.
      // XY columns: X = index (staging) status, Y = working-tree status.
      // If Y='D' the file is deleted from the working tree and does NOT exist
      // on disk — must be checked first regardless of what X says (e.g. "AD").
      const workTreeCol = xy[1];
      let status: "added" | "modified" | "deleted" | "renamed" | "copied" | "untracked";
      if (xy === "??") {
        status = "untracked";
      } else if (workTreeCol === "D") {
        // File deleted from working tree — doesn't exist on disk
        status = "deleted";
      } else if (xy.includes("R")) {
        status = "renamed";
      } else if (xy.includes("C")) {
        status = "copied";
      } else if (xy.includes("A")) {
        status = "added";
      } else if (xy.includes("D")) {
        // Deleted from index only (staged deletion) — file may still exist in working tree
        status = "deleted";
      } else {
        status = "modified";
      }

      files.push({ path: filePath, status });
    }

    // Get ahead/behind counts relative to tracking branch
    let ahead = 0;
    let behind = 0;
    try {
      const revList = execSync("git rev-list --left-right --count HEAD...@{upstream}", {
        cwd: resolved,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
      const parts = revList.split("\t");
      if (parts.length === 2) {
        ahead = parseInt(parts[0], 10) || 0;
        behind = parseInt(parts[1], 10) || 0;
      }
    } catch {
      // No upstream configured — that's fine
    }

    return { files, ahead, behind };
  }

  /**
   * Merge a worktree's branch into a target branch locally (no push).
   * Steps:
   *   1. Checkout target branch in the main repo
   *   2. Attempt fast-forward merge first
   *   3. Fall back to regular merge if fast-forward is not possible
   *   4. If merge conflicts arise but both trees are identical, fast-forward to the worktree branch
   */
  mergeWorktree(repoPath: string, worktreeBranch: string, targetBranch: string): { success: boolean; message: string } {
    const resolved = path.resolve(repoPath);
    const execOpts = { cwd: resolved, encoding: "utf-8" as const, stdio: ["pipe", "pipe", "pipe"] as ["pipe", "pipe", "pipe"] };

    try {
      // Save current branch to restore later
      const currentBranch = execSync("git branch --show-current", execOpts).trim();

      // Checkout target branch
      execSync(`git checkout "${targetBranch}"`, execOpts);

      const restoreOriginalBranch = () => {
        if (currentBranch) {
          try {
            execSync(`git checkout "${currentBranch}"`, { cwd: resolved, stdio: "pipe" });
          } catch {
            // best effort
          }
        }
      };

      try {
        // Attempt merge allowing fast-forward (--ff is default, explicit for clarity)
        const output = execSync(`git merge --ff --no-edit "${worktreeBranch}"`, execOpts).trim();

        // "Already up to date" is a successful no-op
        if (output.includes("Already up to date")) {
          restoreOriginalBranch();
          return { success: true, message: `'${targetBranch}' is already up to date with '${worktreeBranch}'.` };
        }

        restoreOriginalBranch();
        return { success: true, message: `Merged '${worktreeBranch}' into '${targetBranch}' successfully.` };
      } catch (mergeError) {
        // Abort the failed merge first
        try {
          execSync("git merge --abort", { cwd: resolved, stdio: "pipe" });
        } catch {
          // merge --abort may fail if there's nothing to abort
        }

        // Check if both branches result in the same tree (identical content).
        // This handles the case where the same changes exist on both branches
        // (e.g., cherry-picked commits, independent but identical work).
        try {
          const targetTree = execSync(`git rev-parse "${targetBranch}^{tree}"`, execOpts).trim();
          const worktreeTree = execSync(`git rev-parse "${worktreeBranch}^{tree}"`, execOpts).trim();

          if (targetTree === worktreeTree) {
            // Trees are identical — the branches have the same content.
            // Fast-forward target to worktree branch tip so history is unified.
            execSync(`git merge --ff-only "${worktreeBranch}"`, execOpts);
            restoreOriginalBranch();
            return {
              success: true,
              message: `Merged '${worktreeBranch}' into '${targetBranch}' (branches had identical content).`,
            };
          }

          // Trees differ but merge conflicted — try merge with
          // "-X theirs" strategy option to auto-resolve in favour of the worktree branch
          // only when the tree comparison shows the worktree branch is strictly ahead
          const mergeBase = execSync(`git merge-base "${targetBranch}" "${worktreeBranch}"`, execOpts).trim();
          const targetCommit = execSync(`git rev-parse "${targetBranch}"`, execOpts).trim();

          if (mergeBase === targetCommit) {
            // Target is an ancestor of worktree — this is a pure fast-forward case
            // that somehow failed above (e.g., dirty index). Force fast-forward.
            execSync(`git merge --ff-only "${worktreeBranch}"`, execOpts);
            restoreOriginalBranch();
            return {
              success: true,
              message: `Fast-forwarded '${targetBranch}' to '${worktreeBranch}'.`,
            };
          }
        } catch {
          // Tree comparison or ff-only fallback failed — fall through to error
        }

        restoreOriginalBranch();

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
  listLocalBranches(repoPath: string): { branches: string[]; current: string } {
    const resolved = path.resolve(repoPath);

    const raw = execSync("git branch --format='%(refname:short)'", {
      cwd: resolved,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const branches = raw
      .trim()
      .split("\n")
      .map((b) => b.trim().replace(/^'|'$/g, ""))
      .filter(Boolean);

    let current = "";
    try {
      current = execSync("git branch --show-current", {
        cwd: resolved,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
    } catch {
      // detached HEAD
    }

    return { branches, current };
  }

  /**
   * Remove a git worktree.
   * Uses `git worktree remove` with --force to handle dirty worktrees.
   */
  removeWorktree(repoPath: string, worktreePath: string): void {
    const resolved = path.resolve(repoPath);
    const wtResolved = path.resolve(worktreePath);

    try {
      execSync(`git worktree remove "${wtResolved}" --force`, {
        cwd: resolved,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      // Fallback: prune stale worktrees if remove failed
      try {
        // Remove the directory manually, then prune
        if (fs.existsSync(wtResolved)) {
          fs.rmSync(wtResolved, { recursive: true, force: true });
        }
        execSync("git worktree prune", {
          cwd: resolved,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        });
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
