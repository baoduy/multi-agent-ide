import { create } from "zustand";

import type { SpecFolder } from "@magenta/shared/models";
import { ipc } from "../utils/ipc";

type SpecStoreState = {
  specs: SpecFolder[];
  selectedSpecPath: string | null;
  currentRepoPath: string | null;
  /**
   * True ONLY when we have NO data and are waiting for the first fetch.
   * Background sync is completely invisible to the user.
   */
  isLoading: boolean;
  error: string | null;
  subscriptionsReady: boolean;
  setSpecs: (specs: SpecFolder[]) => void;
  setSelectedSpecPath: (path: string | null) => void;
  fetchSpecs: (repoPath: string) => Promise<void>;
  setCurrentRepoPath: (path: string | null) => void;
  initializeSubscriptions: () => void;
  /**
   * Optimistically mark a stage as "approved" so the UI updates immediately
   * after the user approves a file, without waiting for the background sync.
   */
  optimisticApproveStage: (specPath: string, stageName: string, approvedBy: string) => void;
};

export const useSpecStore = create<SpecStoreState>((set, get) => ({
  specs: [],
  selectedSpecPath: null,
  currentRepoPath: null,
  isLoading: false,
  error: null,
  subscriptionsReady: false,

  setSpecs: (specs) => set({ specs }),

  setSelectedSpecPath(path: string | null) {
    set({ selectedSpecPath: path });
  },

  setCurrentRepoPath: (path) => set({ currentRepoPath: path }),

  async fetchSpecs(repoPath: string) {
    const state = get();
    const hasData = state.currentRepoPath === repoPath && state.specs.length > 0;

    // Update repo path immediately
    set({ currentRepoPath: repoPath, error: null });

    // Only show loading if we have no data yet
    if (!hasData) {
      set({ isLoading: true });
    }

    try {
      const response = await ipc.send({ type: "spec:list", repoPath });

      // Guard: repo may have changed while we were waiting
      if (get().currentRepoPath !== repoPath) return;

      if (response.type === "spec:list:result") {
        set({
          specs: response.specs,
          error: null,
          isLoading: false,
        });
        return;
      }

      if (response.type === "error") {
        set({ error: response.message, isLoading: false, specs: [] });
      }
    } catch (error) {
      if (get().currentRepoPath !== repoPath) return;
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ error: errorMessage, isLoading: false, specs: [] });
    }
  },

  optimisticApproveStage(specPath: string, stageName: string, approvedBy: string) {
    const dateStr = new Date().toISOString().split("T")[0];
    set({
      specs: get().specs.map((spec) => {
        if (spec.path !== specPath) return spec;
        return {
          ...spec,
          stages: spec.stages.map((stage) => {
            if (stage.name !== stageName) return stage;
            return {
              ...stage,
              status: "approved" as const,
              metadata: {
                ...stage.metadata,
                approvedBy,
                approvedAt: dateStr,
              },
            };
          }),
        };
      }),
    });
  },

  initializeSubscriptions() {
    if (get().subscriptionsReady) {
      return;
    }

    // Subscribe to spec:sync:complete events.
    // Fires when the background sync finishes for a repo.
    // Re-fetch specs from DB silently (no loading indicator).
    ipc.on("spec:sync:complete", (payload) => {
      const currentRepoPath = get().currentRepoPath;

      if (payload.repoPath === currentRepoPath) {
        // Silently re-fetch from DB — background sync may have updated data
        void get().fetchSpecs(currentRepoPath);
      }
    });

    set({ subscriptionsReady: true });
  },
}));
