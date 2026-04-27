import type { IPCBridge } from "../../../core/ipc/IPCBridge";
import type { FileWatchService } from "../app/FileWatchService";
import { safeHandle } from "../../../core/ipc/createHandler";

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
