import path from "node:path";
import type { StashEntry, Remote } from "@magenta/shared/ipc";
import { createGit } from "./utils/createGit";

/**
 * Gateway for git stash, remote, and extra branch operations (delete/rename).
 * Uses simple-git for everything — no raw spawns needed.
 */
export class GitStashRemoteGateway {
  async listStashes(repoPath: string): Promise<StashEntry[]> {
    const git = createGit(path.resolve(repoPath));
    // Format: stash@{0}|WIP on main: abc1234 Foo|main|1712345678
    const raw = await git.raw([
      "stash",
      "list",
      `--pretty=format:%gd|%gs|%ct`,
    ]);
    const out: StashEntry[] = [];
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const [ref, message, ts] = line.split("|");
      if (!ref || !message) continue;
      const m = ref.match(/^stash@\{(\d+)\}$/);
      if (!m) continue;
      const index = parseInt(m[1]!, 10);
      // Extract branch name from messages like "WIP on <branch>: …" or "On <branch>: …"
      const branchMatch = message.match(/^(?:WIP )?[oO]n ([^:]+):/);
      out.push({
        index,
        message,
        branch: branchMatch ? branchMatch[1]! : undefined,
        timestamp: parseInt(ts ?? "0", 10) || 0,
      });
    }
    return out;
  }

  async stashPush(
    repoPath: string,
    message?: string,
    includeUntracked?: boolean,
  ): Promise<{ message: string }> {
    const git = createGit(path.resolve(repoPath));
    const args: string[] = ["stash", "push"];
    if (includeUntracked) args.push("--include-untracked");
    if (message && message.trim()) {
      args.push("-m", message.trim());
    }
    const out = await git.raw(args);
    const trimmed = out.trim();
    return { message: trimmed || "Stash created." };
  }

  async stashPop(repoPath: string, index: number): Promise<{ message: string }> {
    const git = createGit(path.resolve(repoPath));
    const out = await git.raw(["stash", "pop", `stash@{${index}}`]);
    return { message: out.trim() || `Popped stash@{${index}}.` };
  }

  async stashApply(repoPath: string, index: number): Promise<{ message: string }> {
    const git = createGit(path.resolve(repoPath));
    const out = await git.raw(["stash", "apply", `stash@{${index}}`]);
    return { message: out.trim() || `Applied stash@{${index}}.` };
  }

  async stashDrop(repoPath: string, index: number): Promise<void> {
    const git = createGit(path.resolve(repoPath));
    await git.raw(["stash", "drop", `stash@{${index}}`]);
  }

  async stashShow(repoPath: string, index: number): Promise<{ diff: string }> {
    const git = createGit(path.resolve(repoPath));
    const diff = await git.raw(["stash", "show", "-p", `stash@{${index}}`]);
    return { diff };
  }

  async listRemotes(repoPath: string): Promise<Remote[]> {
    const git = createGit(path.resolve(repoPath));
    const remotes = await git.getRemotes(true);
    return remotes.map((r) => ({
      name: r.name,
      fetchUrl: r.refs?.fetch ?? "",
      pushUrl: r.refs?.push ?? r.refs?.fetch ?? "",
    }));
  }

  async addRemote(repoPath: string, name: string, url: string): Promise<void> {
    const git = createGit(path.resolve(repoPath));
    await git.addRemote(name, url);
  }

  async renameRemote(repoPath: string, oldName: string, newName: string): Promise<void> {
    const git = createGit(path.resolve(repoPath));
    await git.raw(["remote", "rename", oldName, newName]);
  }

  async removeRemote(repoPath: string, name: string): Promise<void> {
    const git = createGit(path.resolve(repoPath));
    await git.removeRemote(name);
  }

  async setRemoteUrl(repoPath: string, name: string, url: string): Promise<void> {
    const git = createGit(path.resolve(repoPath));
    await git.raw(["remote", "set-url", name, url]);
  }

  async deleteBranch(repoPath: string, branch: string, force?: boolean): Promise<void> {
    const git = createGit(path.resolve(repoPath));
    await git.deleteLocalBranch(branch, Boolean(force));
  }

  async renameBranch(repoPath: string, oldName: string, newName: string): Promise<void> {
    const git = createGit(path.resolve(repoPath));
    await git.raw(["branch", "-m", oldName, newName]);
  }
}
