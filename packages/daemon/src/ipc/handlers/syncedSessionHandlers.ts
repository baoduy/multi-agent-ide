import type { IPCBridge } from "../IPCBridge";
import type { SessionSyncApplicationService } from "../../application/SessionSyncApplicationService";
import { safeHandle } from "../createHandler";

export function registerSyncedSessionHandlers({
  bridge,
  sessionSyncService,
}: {
  bridge: IPCBridge;
  sessionSyncService: SessionSyncApplicationService;
}): void {
  safeHandle(bridge, "synced-session:list", async (msg) => {
    const sessions = sessionSyncService.listSessions(msg.provider ?? undefined);
    return { type: "synced-session:list:result" as const, sessions };
  });

  safeHandle(bridge, "synced-session:trigger-sync", async (msg) => {
    sessionSyncService.triggerSync(msg.repoPath);
    return { type: "synced-session:sync:triggered" as const };
  });

  safeHandle(bridge, "synced-session:archive", async (msg) => {
    sessionSyncService.archiveSession(msg.id);
    return { type: "synced-session:archived" as const, id: msg.id };
  });

  // Renderer tells us whether the AI title-bar tab is currently visible. The
  // recurring session sync sweep only runs while this is `true`; it pauses
  // when the user switches to another top-level tab.
  safeHandle(bridge, "ui:ai-tab-active", async (msg) => {
    sessionSyncService.setAITabActive(msg.active);
    return { type: "ui:ai-tab-active:ack" as const, active: msg.active };
  });
}
