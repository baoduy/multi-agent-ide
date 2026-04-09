import fs from "node:fs";
import path from "node:path";

import type { IPCBridge } from "../IPCBridge";

type FileHandlerContext = {
  bridge: IPCBridge;
};

export function registerFileHandlers({ bridge }: FileHandlerContext): void {
  /**
   * Handles "file:read" requests.
   * Reads and returns the text content of a file.
   */
  bridge.handle("file:read", async (payload) => {
    const filePath = (payload as Record<string, unknown>).filePath as string | undefined;

    if (!filePath) {
      return {
        type: "error" as const,
        message: "Missing filePath in file:read request",
      };
    }

    try {
      // Resolve to absolute path
      const resolved = path.resolve(filePath);

      if (!fs.existsSync(resolved)) {
        return {
          type: "error" as const,
          message: `File not found: ${resolved}`,
        };
      }

      const stat = fs.statSync(resolved);
      if (stat.isDirectory()) {
        return {
          type: "error" as const,
          message: `Path is a directory, not a file: ${resolved}`,
        };
      }

      // Limit to 2MB to avoid memory issues
      if (stat.size > 2 * 1024 * 1024) {
        return {
          type: "error" as const,
          message: `File too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Maximum is 2MB.`,
        };
      }

      const content = fs.readFileSync(resolved, "utf-8");

      return {
        type: "file:read:result" as const,
        filePath: resolved,
        content,
      };
    } catch (error) {
      console.error(`Failed to read file ${filePath}:`, error);
      return {
        type: "error" as const,
        message: `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });

  /**
   * Handles "file:write" requests.
   * Writes text content to a file (creates or overwrites).
   */
  bridge.handle("file:write", async (payload) => {
    const filePath = (payload as Record<string, unknown>).filePath as string | undefined;
    const content = (payload as Record<string, unknown>).content as string | undefined;

    if (!filePath || content === undefined) {
      return {
        type: "error" as const,
        message: "Missing filePath or content in file:write request",
      };
    }

    try {
      const resolved = path.resolve(filePath);
      fs.writeFileSync(resolved, content, "utf-8");
      return {
        type: "file:write:result" as const,
        filePath: resolved,
        success: true,
      };
    } catch (error) {
      console.error(`Failed to write file ${filePath}:`, error);
      return {
        type: "error" as const,
        message: `Failed to write file: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });

  /**
   * Handles "dir:list" requests.
   * Lists the entries (files and subdirectories) of a directory.
   */
  bridge.handle("dir:list", async (payload) => {
    const dirPath = (payload as Record<string, unknown>).dirPath as string | undefined;

    if (!dirPath) {
      return {
        type: "error" as const,
        message: "Missing dirPath in dir:list request",
      };
    }

    try {
      const resolved = path.resolve(dirPath);

      if (!fs.existsSync(resolved)) {
        return {
          type: "error" as const,
          message: `Directory not found: ${resolved}`,
        };
      }

      const stat = fs.statSync(resolved);
      if (!stat.isDirectory()) {
        return {
          type: "error" as const,
          message: `Path is not a directory: ${resolved}`,
        };
      }

      const rawEntries = fs.readdirSync(resolved, { withFileTypes: true });
      const entries = rawEntries
        .filter((e) => !e.name.startsWith(".")) // skip hidden files
        .map((e) => ({
          name: e.name,
          path: path.join(resolved, e.name),
          isDirectory: e.isDirectory(),
        }))
        .sort((a, b) => {
          // Directories first, then alphabetical
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });

      return {
        type: "dir:list:result" as const,
        dirPath: resolved,
        entries,
      };
    } catch (error) {
      console.error(`Failed to list directory ${dirPath}:`, error);
      return {
        type: "error" as const,
        message: `Failed to list directory: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  });
}
