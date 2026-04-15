import type { SpecSyncService } from "../services/SpecSyncService";
import type { SpecReader } from "../services/SpecReader";
import type { SpecGitGateway } from "../infrastructure/SpecGitGateway";
import { AppError } from "../errors/AppError";

/**
 * SpecApplicationService orchestrates spec operations.
 */
export class SpecApplicationService {
  constructor(
    private readonly specSyncService: SpecSyncService,
    private readonly specReader: SpecReader,
    private readonly gitGateway: SpecGitGateway,
  ) {}

  listSpecs(repoPath: string) {
    const specs = this.specSyncService.getSpecsFromDb(repoPath);

    // If DB has no specs for this repo, trigger a background sync so the
    // next fetch (via spec:sync:complete event) will return fresh data.
    if (specs.length === 0) {
      void this.specSyncService.syncRepo(repoPath);
    }

    return specs;
  }

  readGitFile(repoPath: string, ref: string, relativePath: string): string | null {
    return this.specReader.readGitFile(repoPath, ref, relativePath);
  }

  /**
   * Reads a git file or throws FILE_NOT_FOUND if not found.
   * Use this from handlers that need a guaranteed non-null result.
   */
  readGitFileOrThrow(repoPath: string, ref: string, relativePath: string): string {
    const content = this.specReader.readGitFile(repoPath, ref, relativePath);
    if (content === null) {
      throw new AppError("FILE_NOT_FOUND", `File not found: ${ref}:${relativePath}`);
    }
    return content;
  }

  getGitUser(repoPath: string): { name: string; email: string } {
    return this.gitGateway.getGitUser(repoPath);
  }
}
