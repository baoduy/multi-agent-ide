import { AppError } from "../errors/AppError";
import { requireNonEmpty } from "../errors/validation";
import { wrapErrorAsync } from "../errors/wrapError";
import type { GitHistoryGateway, LogArgs } from "../infrastructure/GitHistoryGateway";
import type { CommitSummary, CommitFile } from "@magenta/shared/ipc";

const SHA_REGEX = /^[a-f0-9]{4,40}$/;

export class GitHistoryApplicationService {
  constructor(private readonly gateway: GitHistoryGateway) {}

  async log(
    repoPath: string,
    args: Partial<LogArgs>,
  ): Promise<{ commits: CommitSummary[]; hasMore: boolean }> {
    requireNonEmpty(repoPath, "repoPath");
    const limit = Math.min(Math.max(1, args.limit ?? 100), 500);
    const skip = Math.max(0, args.skip ?? 0);
    return wrapErrorAsync(
      () =>
        this.gateway.log(repoPath, {
          branch: args.branch,
          path: args.path,
          search: args.search,
          limit,
          skip,
        }),
      "GIT_ERROR",
      "read git log",
    );
  }

  async commitDetail(
    repoPath: string,
    sha: string,
  ): Promise<{ commit: CommitSummary; files: CommitFile[] }> {
    requireNonEmpty(repoPath, "repoPath");
    if (!SHA_REGEX.test(sha)) {
      throw new AppError("VALIDATION_ERROR", `Invalid commit sha: ${sha}`);
    }
    return wrapErrorAsync(
      () => this.gateway.commitDetail(repoPath, sha),
      "GIT_ERROR",
      "load commit detail",
    );
  }

  async diff(
    repoPath: string,
    args: { fromRef?: string; toRef?: string; path: string },
  ): Promise<{
    oldContent: string | null;
    newContent: string | null;
    oldPath: string | null;
    newPath: string | null;
    isBinary: boolean;
  }> {
    requireNonEmpty(repoPath, "repoPath");
    requireNonEmpty(args.path, "path");
    return wrapErrorAsync(() => this.gateway.diff(repoPath, args), "GIT_ERROR", "read git diff");
  }
}
