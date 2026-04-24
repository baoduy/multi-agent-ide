import type { IPCBridge } from "../IPCBridge";
import type { FileWatchService } from "../../application/FileWatchService";
import { safeHandle } from "../createHandler";

type FileWatchHandlerContext = {
  bridge: IPCBridge;
  fileWatchService: FileWatchService;
};

/**
 * Thin IPC adapters for the file-watch feature.
 *
 * All orchestration (id minting, self-write suppression, push fan-out)
 * lives in FileWatchService — these handlers just delegate.
 */
export function registerFileWatchHandlers({
  bridge,
  fileWatchService,
}: FileWatchHandlerContext): void {
  safeHandle(bridge, "file:watch", async (msg) => {
    const watchId = fileWatchService.watch(msg.filePath);
    return {
      type: "file:watched" as const,
      filePath: msg.filePath,
      watchId,
    };
  });

  safeHandle(bridge, "file:unwatch", async (msg) => {
    await fileWatchService.unwatch(msg.watchId);
    return {
      type: "file:unwatched" as const,
      watchId: msg.watchId,
    };
  });
}
