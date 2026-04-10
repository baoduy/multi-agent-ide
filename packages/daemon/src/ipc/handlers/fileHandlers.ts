import type { IPCBridge } from "../IPCBridge";
import type { FileApplicationService } from "../../application/FileApplicationService";
import { safeHandle } from "../createHandler";

type FileHandlerContext = {
  bridge: IPCBridge;
  fileService: FileApplicationService;
};

export function registerFileHandlers({ bridge, fileService }: FileHandlerContext): void {
  /**
   * Handles "file:read" requests.
   * Reads and returns the text content of a file.
   */
  safeHandle(bridge, "file:read", async (msg) => {
    const content = fileService.readFile(msg.filePath);
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
    fileService.writeFile(msg.filePath, msg.content);
    return {
      type: "file:write:result",
      filePath: msg.filePath,
      success: true,
    };
  });

  /**
   * Handles "dir:list" requests.
   * Lists the entries (files and subdirectories) of a directory.
   */
  safeHandle(bridge, "dir:list", async (msg) => {
    const entries = fileService.listDirectory(msg.dirPath);
    return {
      type: "dir:list:result",
      dirPath: msg.dirPath,
      entries,
    };
  });
}
