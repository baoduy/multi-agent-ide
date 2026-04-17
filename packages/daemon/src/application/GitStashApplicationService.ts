import type { StashEntry } from "@magenta/shared/ipc";
import { requireNonEmpty } from "../errors/validation";
import { wrapErrorAsync } from "../errors/wrapError";
import type { GitStashRemoteGateway } from "../infrastructure/GitStashRemoteGateway";

export class GitStashApplicationService {
  constructor(private readonly gateway: GitStashRemoteGateway) {}

  async list(repoPath: string): Promise<StashEntry[]> {
    requireNonEmpty(repoPath, "repoPath");
    return wrapErrorAsync(() => this.gateway.listStashes(repoPath), "GIT_ERROR", "list stashes");
  }

  async push(repoPath: string, message?: string, includeUntracked?: boolean): Promise<{ success: boolean; message: string }> {
    requireNonEmpty(repoPath, "repoPath");
    return wrapErrorAsync(async () => {
      const res = await this.gateway.stashPush(repoPath, message, includeUntracked);
      return { success: true, message: res.message };
    }, "GIT_ERROR", "push stash");
  }

  async pop(repoPath: string, index: number): Promise<{ success: boolean; message: string }> {
    requireNonEmpty(repoPath, "repoPath");
    return wrapErrorAsync(async () => {
      const res = await this.gateway.stashPop(repoPath, index);
      return { success: true, message: res.message };
    }, "GIT_ERROR", "pop stash");
  }

  async apply(repoPath: string, index: number): Promise<{ success: boolean; message: string }> {
    requireNonEmpty(repoPath, "repoPath");
    return wrapErrorAsync(async () => {
      const res = await this.gateway.stashApply(repoPath, index);
      return { success: true, message: res.message };
    }, "GIT_ERROR", "apply stash");
  }

  async drop(repoPath: string, index: number): Promise<{ success: boolean }> {
    requireNonEmpty(repoPath, "repoPath");
    return wrapErrorAsync(async () => {
      await this.gateway.stashDrop(repoPath, index);
      return { success: true };
    }, "GIT_ERROR", "drop stash");
  }

  async show(repoPath: string, index: number): Promise<{ diff: string }> {
    requireNonEmpty(repoPath, "repoPath");
    return wrapErrorAsync(() => this.gateway.stashShow(repoPath, index), "GIT_ERROR", "show stash");
  }
}
