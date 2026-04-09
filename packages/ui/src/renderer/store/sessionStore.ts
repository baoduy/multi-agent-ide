import { create } from "zustand";

import type { SessionState } from "@magenta/shared/models";
import { ipc } from "../utils/ipc";

type SessionStoreState = SessionState & {
  isLoading: boolean;
  error: string | null;
  initialized: boolean;
  loadSessionState: () => Promise<void>;
  patchSession: (patch: Partial<SessionState>) => Promise<void>;
};

export const useSessionStore = create<SessionStoreState>((set, get) => ({
  // SessionState fields
  selectedRepoPath: null,
  selectedSpecPath: null,
  selectedFilePath: null,
  sidebarWidth: null,
  activityPanelWidth: null,
  activityPanelOpen: true,
  sidebarCollapsed: false,
  activityCollapsed: false,
  specPanelHeight: null,
  mainTab: "specs",
  updatedAt: Date.now(),

  // Store state
  isLoading: false,
  error: null,
  initialized: false,

  async loadSessionState() {
    set({ isLoading: true, error: null });

    try {
      const response = await ipc.send({ type: "session:get" });
      console.log("[session] loadSessionState response:", response.type);

      if (response.type === "session:response") {
        set({
          ...response.state,
          initialized: true,
          isLoading: false,
        });
        return;
      }

      // Any non-success response (including "error") — mark as initialized anyway
      const errorMsg = response.type === "error" ? (response as any).message : `Unexpected response: ${response.type}`;
      console.warn("[session] loadSessionState error:", errorMsg);
      set({ error: errorMsg, isLoading: false, initialized: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[session] loadSessionState exception:", errorMessage);
      set({ error: errorMessage, isLoading: false, initialized: true });
    }
  },

  async patchSession(patch: Partial<SessionState>) {
    // Optimistically update local state
    set(patch as Partial<SessionStoreState>);
    // Fire and forget the persistence
    try {
      await ipc.send({ type: "session:update", state: patch });
    } catch (error) {
      console.warn(
        "[session] patchSession failed:",
        error instanceof Error ? error.message : String(error)
      );
    }
  },
}));
