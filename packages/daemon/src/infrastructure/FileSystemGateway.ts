import fs from "node:fs";
import path from "node:path";
import { AppError } from "../errors/AppError";

/**
 * FileSystemGateway wraps all filesystem operations.
 * Encapsulates file I/O with consistent error handling.
 */
export class FileSystemGateway {
  /**
   * Read a file from disk with size and type validation.
   * @returns Object with content string and resolved absolute path
   */
  readFile(filePath: string): { content: string; resolvedPath: string } {
    const resolved = path.resolve(filePath);

    if (!fs.existsSync(resolved)) {
      throw new AppError("FILE_NOT_FOUND", `File not found: ${resolved}`);
    }

    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      throw new AppError("VALIDATION_ERROR", `Path is a directory, not a file: ${resolved}`);
    }

    if (stat.size > 2 * 1024 * 1024) {
      throw new AppError(
        "FILE_TOO_LARGE",
        `File too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Maximum is 2MB.`,
      );
    }

    const content = fs.readFileSync(resolved, "utf-8");
    return { content, resolvedPath: resolved };
  }

  /**
   * Write content to a file.
   * @returns The resolved absolute path
   */
  writeFile(filePath: string, content: string): string {
    const resolved = path.resolve(filePath);
    fs.writeFileSync(resolved, content, "utf-8");
    return resolved;
  }

  /**
   * List directory contents, excluding hidden files.
   * Sorted with directories first, then alphabetically.
   */
  listDirectory(dirPath: string): { name: string; path: string; isDirectory: boolean }[] {
    const resolved = path.resolve(dirPath);

    if (!fs.existsSync(resolved)) {
      throw new AppError("FILE_NOT_FOUND", `Directory not found: ${resolved}`);
    }

    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      throw new AppError("VALIDATION_ERROR", `Path is not a directory: ${resolved}`);
    }

    const rawEntries = fs.readdirSync(resolved, { withFileTypes: true });
    return rawEntries
      .filter((e) => !e.name.startsWith("."))
      .map((e) => ({
        name: e.name,
        path: path.join(resolved, e.name),
        isDirectory: e.isDirectory(),
      }))
      .sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
  }

}
