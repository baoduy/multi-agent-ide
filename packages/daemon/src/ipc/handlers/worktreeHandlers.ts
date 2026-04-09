import path from "node:path";
import { execSync } from "node:child_process";
import fs from "node:fs";

import type { IPCBridge } from "../IPCBridge";

type WorktreeHandlerContext = {
  bridge: IPCBridge;
};

export function registerWorktreeHandlers({ bridge }: WorktreeHandlerContext): void {
  /**
   * Handles "worktree:create" requests.
   *
   * Creates a git worktree for the given branch so that files from a
   * remote branch can be edited on disk. The worktree is placed under
   * `<repoRoot>/.worktrees/<name>` and checks out the specified branch.
   *
   * If the worktree already exists for that name it returns its path
   * without recreating.
   */
  bridge.handle("worktree:create", async (payload) => {
    const repoPath = (payload as Record<string, unknown>).repoPath as string;
    const branch = (payload as Record<string, unknown>).branch as string;
    const name = (payload as Record<string, unknown>).name as string;

    if (!repoPath || !branch || !name) {
      return {
        type: "error" as const,
        message: "Missing repoPath, branch, or name in worktree:create request",
      };
    }

    // Sanitize name — allow only alphanumeric, dash, underscore
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-{2,}/g, "-");
    if (!safeName) {
      return {
        type: "error" as const,
        message: "Invalid worktree name after sanitization",
      };
    }

    const worktreeDir = path.join(repoPath, ".worktrees");
    const worktreePath = path.join(worktreeDir, safeName);

    try {
      // If the worktree directory already exists, return it directly
      if (fs.existsSync(worktreePath) && fs.existsSync(path.join(worktreePath, ".git"))) {
        return {
          type: "worktree:create:result" as const,
          repoPath,
          worktreePath,
          branch,
          success: true,
        };
      }

      // Ensure the .worktrees directory exists
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
        } catch (innerErr) {
          // If both fail, try creating worktree with detached HEAD from the ref
          execSync(
            `git worktree add --detach "${worktreePath}" "origin/${branch}"`,
            { cwd: repoPath, stdio: "pipe" },
          );
        }
      }

      // Ensure .worktrees is in .gitignore
      const gitignorePath = path.join(repoPath, ".gitignore");
      if (fs.existsSync(gitignorePath)) {
        const gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
        if (!gitignoreContent.includes(".worktrees")) {
          fs.appendFileSync(gitignorePath, "\n.worktrees/\n", "utf-8");
        }
      }

      return {
        type: "worktree:create:result" as const,
        repoPath,
        worktreePath,
        branch,
        success: true,
      };
    } catch (error) {
      console.error(`Failed to create worktree for ${branch} in ${repoPath}:`, error);
      return {
        type: "error" as const,
        message: `Failed to create worktree: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });
}
