import { create } from "zustand";

import type { SessionState } from "@magenta/shared/models";
import { ipc } from "../utils/ipc";

type SessionStoreState = SessionState & {
  isLoading: boolean;
  error: string | null;
  initialized: boolean;
  loadSessionState: () => Promise<void>;
  updateSelectedRepoPath: (path: string | null) => Promise<void>;
  updateSelectedSpecPath: (path: string | null) => Promise<void>;
  updateSelectedFilePath: (path: string | null) => Promise<void>;
  updateSidebarWidth: (width: number | null) => Promise<void>;
  updateActivityPanelWidth: (width: number | null) => Promise<void>;
  updateActivityPanelOpen: (open: boolean) => Promise<void>;
  updateMainTab: (tab: "plan" | "worktrees" | "spec") => Promise<void>;
};

export const useSessionStore = create<SessionStoreState>((set, get) => ({
  // SessionState fields
  selectedRepoPath: null,
  selectedSpecPath: null,
  selectedFilePath: null,
  sidebarWidth: null,
  activityPanelWidth: null,
  activityPanelOpen: true,
  mainTab: "plan",
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

  async updateSelectedRepoPath(path: string | null) {
    set({ selectedRepoPath: path });
    await ipc.send({
      type: "session:update",
      state: { selectedRepoPath: path },
    });
  },

  async updateSelectedSpecPath(path: string | null) {
    set({ selectedSpecPath: path });
    await ipc.send({
      type: "session:update",
      state: { selectedSpecPath: path },
    });
  },

  async updateSelectedFilePath(path: string | null) {
    set({ selectedFilePath: path });
    await ipc.send({
      type: "session:update",
      state: { selectedFilePath: path },
    });
  },

  async updateSidebarWidth(width: number | null) {
    set({ sidebarWidth: width });
    await ipc.send({
      type: "session:update",
      state: { sidebarWidth: width },
    });
  },

  async updateActivityPanelWidth(width: number | null) {
    set({ activityPanelWidth: width });
    await ipc.send({
      type: "session:update",
      state: { activityPanelWidth: width },
    });
  },

  async updateActivityPanelOpen(open: boolean) {
    set({ activityPanelOpen: open });
    await ipc.send({
      type: "session:update",
      state: { activityPanelOpen: open },
    });
  },

  async updateMainTab(tab: "plan" | "worktrees" | "spec") {
    set({ mainTab: tab });
    await ipc.send({
      type: "session:update",
      state: { mainTab: tab },
    });
  },
}));
