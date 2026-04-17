import type { Remote } from "@magenta/shared/ipc";
import { AppError } from "../errors/AppError";
import { requireNonEmpty } from "../errors/validation";
import { wrapErrorAsync } from "../errors/wrapError";
import type { GitStashRemoteGateway } from "../infrastructure/GitStashRemoteGateway";

export class GitRemoteApplicationService {
  constructor(private readonly gateway: GitStashRemoteGateway) {}

  async list(repoPath: string): Promise<Remote[]> {
    requireNonEmpty(repoPath, "repoPath");
    return wrapErrorAsync(() => this.gateway.listRemotes(repoPath), "GIT_ERROR", "list remotes");
  }

  async add(repoPath: string, name: string, url: string): Promise<{ success: boolean }> {
    requireNonEmpty(repoPath, "repoPath");
    requireNonEmpty(name, "name");
    requireNonEmpty(url, "url");
    return wrapErrorAsync(async () => {
      await this.gateway.addRemote(repoPath, name, url);
      return { success: true };
    }, "GIT_ERROR", "add remote");
  }

  async rename(repoPath: string, oldName: string, newName: string): Promise<{ success: boolean }> {
    requireNonEmpty(repoPath, "repoPath");
    if (oldName === newName) {
      throw new AppError("VALIDATION_ERROR", "Old and new remote names must differ.");
    }
    return wrapErrorAsync(async () => {
      await this.gateway.renameRemote(repoPath, oldName, newName);
      return { success: true };
    }, "GIT_ERROR", "rename remote");
  }

  async remove(repoPath: string, name: string): Promise<{ success: boolean }> {
    requireNonEmpty(repoPath, "repoPath");
    requireNonEmpty(name, "name");
    return wrapErrorAsync(async () => {
      await this.gateway.removeRemote(repoPath, name);
      return { success: true };
    }, "GIT_ERROR", "remove remote");
  }

  async setUrl(repoPath: string, name: string, url: string): Promise<{ success: boolean }> {
    requireNonEmpty(repoPath, "repoPath");
    requireNonEmpty(name, "name");
    requireNonEmpty(url, "url");
    return wrapErrorAsync(async () => {
      await this.gateway.setRemoteUrl(repoPath, name, url);
      return { success: true };
    }, "GIT_ERROR", "set remote url");
  }

  async deleteBranch(repoPath: string, branch: string, force?: boolean): Promise<{ success: boolean }> {
    requireNonEmpty(repoPath, "repoPath");
    requireNonEmpty(branch, "branch");
    return wrapErrorAsync(async () => {
      await this.gateway.deleteBranch(repoPath, branch, force);
      return { success: true };
    }, "GIT_ERROR", "delete branch");
  }

  async renameBranch(repoPath: string, oldName: string, newName: string): Promise<{ success: boolean }> {
    requireNonEmpty(repoPath, "repoPath");
    if (oldName === newName) {
      throw new AppError("VALIDATION_ERROR", "Old and new branch names must differ.");
    }
    return wrapErrorAsync(async () => {
      await this.gateway.renameBranch(repoPath, oldName, newName);
      return { success: true };
    }, "GIT_ERROR", "rename branch");
  }
}
