import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
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
