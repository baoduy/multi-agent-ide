import type { IPCBridge } from "../IPCBridge";
import type { FileSystemGateway } from "../../infrastructure/FileSystemGateway";
import { safeHandle } from "../createHandler";

type FileHandlerContext = {
  bridge: IPCBridge;
  fileSystemGateway: FileSystemGateway;
};

export function registerFileHandlers({ bridge, fileSystemGateway }: FileHandlerContext): void {
  /**
   * Handles "file:read" requests.
   * Reads and returns the text content of a file.
   */
  safeHandle(bridge, "file:read", async (msg) => {
    const { content } = fileSystemGateway.readFile(msg.filePath);
    return {
      type: "file:read:result",
      filePath: msg.filePath,
      content,
    };
  });

  /**
   * Handles "file:write" requests.
   * Writes text content to a file (creates or overwrites).
   */
  safeHandle(bridge, "file:write", async (msg) => {
    fileSystemGateway.writeFile(msg.filePath, msg.content);
    return {
      type: "file:write:result",
      filePath: msg.filePath,
      success: true,
    };
  });

  /**
   * Handles "file:write-binary" requests.
   * Decodes a base64 payload and writes the resulting bytes to disk.
   * Used by the markdown editor's image-paste/drop flow.
   */
  safeHandle(bridge, "file:write-binary", async (msg) => {
    const buffer = Buffer.from(msg.contentBase64, "base64");
    fileSystemGateway.writeBuffer(msg.filePath, buffer);
    return {
      type: "file:write-binary:result",
      filePath: msg.filePath,
      success: true,
    };
  });

  /**
   * Handles "file:delete" requests.
   * Deletes a file from disk.
   */
  safeHandle(bridge, "file:delete", async (msg) => {
    fileSystemGateway.deleteFile(msg.filePath);
    return {
      type: "file:delete:result",
      filePath: msg.filePath,
      success: true,
    };
  });

  /**
   * Handles "file:rename" requests.
   * Renames (moves) a file on disk.
   */
  safeHandle(bridge, "file:rename", async (msg) => {
    fileSystemGateway.renameFile(msg.oldPath, msg.newPath);
    return {
      type: "file:rename:result",
      oldPath: msg.oldPath,
      newPath: msg.newPath,
      success: true,
    };
  });

  /**
   * Handles "dir:list" requests.
   * Lists the entries (files and subdirectories) of a directory.
   */
  safeHandle(bridge, "dir:list", async (msg) => {
    const entries = fileSystemGateway.listDirectory(msg.dirPath);
    return {
      type: "dir:list:result",
      dirPath: msg.dirPath,
      entries,
    };
  });

  safeHandle(bridge, "file:create", async (msg) => {
    fileSystemGateway.createFile(msg.filePath, msg.content ?? "");
    return {
      type: "file:create:result",
      filePath: msg.filePath,
      success: true,
    };
  });

  safeHandle(bridge, "dir:create", async (msg) => {
    fileSystemGateway.createDirectory(msg.dirPath);
    return {
      type: "dir:create:result",
      dirPath: msg.dirPath,
      success: true,
    };
  });
}
