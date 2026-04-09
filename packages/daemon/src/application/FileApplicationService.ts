import { AppError } from "../errors/AppError";
import { FileSystemGateway } from "../infrastructure/FileSystemGateway";

/**
 * FileApplicationService orchestrates file operations.
 * Throws AppError for error conditions instead of returning error responses.
 */
export class FileApplicationService {
  private readonly fileSystemGateway = new FileSystemGateway();

  readFile(filePath: string): string {
    if (!filePath) {
      throw new AppError("VALIDATION_ERROR", "Missing filePath");
    }

    const { content } = this.fileSystemGateway.readFile(filePath);
    return content;
  }

  writeFile(filePath: string, content: string): void {
    if (!filePath || content === undefined) {
      throw new AppError("VALIDATION_ERROR", "Missing filePath or content");
    }

    this.fileSystemGateway.writeFile(filePath, content);
  }

  listDirectory(dirPath: string): Array<{
    name: string;
    path: string;
    isDirectory: boolean;
  }> {
    if (!dirPath) {
      throw new AppError("VALIDATION_ERROR", "Missing dirPath");
    }

    return this.fileSystemGateway.listDirectory(dirPath);
  }
}
