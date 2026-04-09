import type { SpecSyncService } from "../services/SpecSyncService";
import { SpecReader } from "../services/SpecReader";

/**
 * SpecApplicationService orchestrates spec operations.
 */
export class SpecApplicationService {
  private specReader: SpecReader;

  constructor(private specSyncService: SpecSyncService) {
    this.specReader = new SpecReader();
  }

  listSpecs(repoPath: string) {
    const specs = this.specSyncService.getSpecsFromDb(repoPath);
    return specs;
  }

  readGitFile(repoPath: string, ref: string, relativePath: string): string | null {
    return this.specReader.readGitFile(repoPath, ref, relativePath);
  }
}
