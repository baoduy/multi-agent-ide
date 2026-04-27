import type { IPCBridge } from "../../../core/ipc/IPCBridge";
import type { ChatThreadService } from "../app/ChatThreadService";
import { safeHandle } from "../../../core/ipc/createHandler";

type ChatThreadHandlerContext = {
  bridge: IPCBridge;
  chatThreadService: ChatThreadService;
};

/**
 * Resumable-thread handlers for the AI Chat Bubble.
 *
 *   - `ai-chat:get-active-thread`  — read the auto-resume target on file open
 *   - `ai-chat:list-threads`        — data source for a future picker UI
 *   - `ai-chat:start-new-thread`    — "New session" menu item
 *   - `ai-chat:archive-thread`      — mark a thread archived (UI cleanup)
 */
export function registerChatThreadHandlers(
  { bridge, chatThreadService }: ChatThreadHandlerContext,
): void {
  safeHandle(bridge, "ai-chat:get-active-thread", async (msg) => {
    const active = chatThreadService.getActive(msg.filePath, msg.provider);
    return {
      type: "ai-chat:get-active-thread:result" as const,
      thread: active && active.archivedAt === null ? active : null,
    };
  });

  safeHandle(bridge, "ai-chat:list-threads", async (msg) => ({
    type: "ai-chat:list-threads:result" as const,
    threads: chatThreadService.listForFile(msg.filePath, msg.provider),
  }));

  safeHandle(bridge, "ai-chat:start-new-thread", async (msg) => ({
    type: "ai-chat:start-new-thread:result" as const,
    thread: chatThreadService.archiveAndStartNew(msg.filePath, msg.provider),
  }));

  safeHandle(bridge, "ai-chat:archive-thread", async (msg) => {
    chatThreadService.archive(msg.threadId);
    return { type: "ai-chat:archive-thread:result" as const, ok: true as const };
  });
}
