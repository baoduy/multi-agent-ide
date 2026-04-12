import { create } from "zustand";
import { sendOrThrow, onEvent } from "../services/ipcClient";
import { createSubscriptionInitializer } from "../services/createSubscriptionInitializer";
import type { SyncedSessionRecord, SyncedSessionProvider, SyncedSessionGroup } from "@magenta/shared/syncedSession";
import { extractDisplayName } from "../utils/formatters";

/* ── Types ── */

type SyncedSessionStoreState = {
  /** All synced sessions from disk */
  sessions: SyncedSessionRecord[];
  /** Sessions grouped by cwd/project directory */
  groups: SyncedSessionGroup[];
  /** Whether initial fetch is in progress */
  isLoading: boolean;
  /** Error from last fetch */
  error: string | null;
  /** Whether IPC event subscriptions have been initialized */
  subscriptionsReady: boolean;

  // ── Actions ──
  fetchSessions: (provider?: SyncedSessionProvider) => Promise<void>;
  triggerSync: () => Promise<void>;
  initializeSubscriptions: () => void;
};

/**
 * Groups sessions by their cwd or projectDir, sorted by most recent first.
 */
function groupSessions(sessions: SyncedSessionRecord[]): SyncedSessionGroup[] {
  const groupMap = new Map<string, SyncedSessionRecord[]>();

  for (const session of sessions) {
    // Group key: prefer cwd, fall back to projectDir, then "unknown"
    const key = session.cwd || session.projectDir || "unknown";
    const existing = groupMap.get(key);
    if (existing) {
      existing.push(session);
    } else {
      groupMap.set(key, [session]);
    }
  }

  // Convert to groups and sort
  const groups: SyncedSessionGroup[] = [];

  for (const [groupPath, groupSessions] of groupMap) {
    // Sort sessions within group by startedAt DESC
    groupSessions.sort((a, b) => b.startedAt - a.startedAt);

    // Determine display name from path
    const name = extractDisplayName(groupPath);

    // Determine provider (single or mixed)
    const providers = new Set(groupSessions.map((s) => s.provider));
    const provider: SyncedSessionProvider | "mixed" =
      providers.size === 1 ? [...providers][0] : "mixed";

    groups.push({
      name,
      path: groupPath,
      provider,
      sessions: groupSessions,
    });
  }

  // Sort groups by their most recent session
  groups.sort((a, b) => {
    const aLatest = a.sessions[0]?.startedAt ?? 0;
    const bLatest = b.sessions[0]?.startedAt ?? 0;
    return bLatest - aLatest;
  });

  return groups;
}


export const useSyncedSessionStore = create<SyncedSessionStoreState>((set, get) => ({
  sessions: [],
  groups: [],
  isLoading: false,
  error: null,
  subscriptionsReady: false,

  fetchSessions: async (provider?: SyncedSessionProvider) => {
    // Only show loading on first fetch
    if (get().sessions.length === 0) {
      set({ isLoading: true });
    }

    try {
      const response = await sendOrThrow({
        type: "synced-session:list",
        provider,
      });
      const sessions = response.sessions;
      const groups = groupSessions(sessions);
      set({ sessions, groups, isLoading: false, error: null });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : String(err),
        isLoading: false,
      });
    }
  },

  triggerSync: async () => {
    try {
      await sendOrThrow({ type: "synced-session:trigger-sync" });
    } catch (err) {
      console.error("[SyncedSessionStore] Trigger sync failed:", err);
    }
  },

  initializeSubscriptions: createSubscriptionInitializer(get, set, () => {
    onEvent("synced-session:sync:complete", () => {
      // Refresh sessions when background sync completes
      void get().fetchSessions();
    });
  }),
}));
