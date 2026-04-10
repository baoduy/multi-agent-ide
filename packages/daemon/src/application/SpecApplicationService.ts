import type { SpecSyncService } from "../services/SpecSyncService";
import { SpecReader } from "../services/SpecReader";
import { SpecGitGateway } from "../infrastructure/SpecGitGateway";

/**
 * SpecApplicationService orchestrates spec operations.
 */
export class SpecApplicationService {
  private specReader: SpecReader;
  private gitGateway: SpecGitGateway;

  constructor(private specSyncService: SpecSyncService) {
    this.specReader = new SpecReader();
    this.gitGateway = new SpecGitGateway();
  }

  listSpecs(repoPath: string) {
    const specs = this.specSyncService.getSpecsFromDb(repoPath);
    return specs;
  }

  readGitFile(repoPath: string, ref: string, relativePath: string): string | null {
    return this.specReader.readGitFile(repoPath, ref, relativePath);
  }

  getGitUser(repoPath: string): { name: string; email: string } {
    return this.gitGateway.getGitUser(repoPath);
  }
}
