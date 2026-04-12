import type { FileSystemGateway } from "../infrastructure/FileSystemGateway";
import { requireNonEmpty } from "../errors/validation";

/**
 * FileApplicationService orchestrates file operations.
 * Throws AppError for error conditions instead of returning error responses.
 */
export class FileApplicationService {
  constructor(private readonly fileSystemGateway: FileSystemGateway) {}

  readFile(filePath: string): string {
    requireNonEmpty(filePath, "filePath");
    const { content } = this.fileSystemGateway.readFile(filePath);
    return content;
  }

  writeFile(filePath: string, content: string): void {
    requireNonEmpty(filePath, "filePath");
    if (content === undefined) {
      throw new Error("Missing content");
    }
    this.fileSystemGateway.writeFile(filePath, content);
  }

  listDirectory(dirPath: string): Array<{
    name: string;
    path: string;
    isDirectory: boolean;
  }> {
    requireNonEmpty(dirPath, "dirPath");
    return this.fileSystemGateway.listDirectory(dirPath);
  }
}
