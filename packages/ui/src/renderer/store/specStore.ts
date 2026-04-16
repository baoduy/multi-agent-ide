import { create } from "zustand";

import type { SpecFolder } from "@magenta/shared/models";
import { ipc } from "../utils/ipc";
import { sendOrThrow } from "../services/ipcClient";
import { getErrorMessage } from "../utils/getErrorMessage";
import { createSubscriptionInitializer } from "../services/createSubscriptionInitializer";

type SpecStoreState = {
  specs: SpecFolder[];
  selectedSpecPath: string | null;
  currentRepoPath: string | null;
  /**
   * True ONLY when we have NO data and are waiting for the first fetch.
   * Background sync is completely invisible to the user.
   */
  isLoading: boolean;
  /**
   * True once we have completed at least one fetch for the current repo.
   * Prevents re-showing the loading indicator on background syncs when
   * the repo genuinely has zero specs.
   */
  hasFetchedForRepo: boolean;
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
  hasFetchedForRepo: false,
  error: null,
  subscriptionsReady: false,

  setSpecs: (specs) => set({ specs }),

  setSelectedSpecPath(path: string | null) {
    set({ selectedSpecPath: path });
  },

  setCurrentRepoPath: (path) => set({ currentRepoPath: path }),

  async fetchSpecs(repoPath: string) {
    const state = get();
    const isSameRepo = state.currentRepoPath === repoPath;
    const alreadyFetched = isSameRepo && state.hasFetchedForRepo;

    // When switching repos, reset the fetched flag
    if (!isSameRepo) {
      set({ currentRepoPath: repoPath, error: null, hasFetchedForRepo: false });
    } else {
      set({ error: null });
    }

    // Only show loading if we haven't completed a fetch for this repo yet.
    // This prevents flashing "loading → empty" on background syncs when
    // the repo genuinely has zero specs.
    if (!alreadyFetched) {
      set({ isLoading: true });
    }

    try {
      const response = await sendOrThrow({ type: "spec:list", repoPath });

      // Guard: repo may have changed while we were waiting
      if (get().currentRepoPath !== repoPath) return;

      // Guard: skip state write if specs haven't actually changed
      // (avoids new array reference → unnecessary re-renders)
      const prev = get().specs;
      const specsChanged =
        prev.length !== response.specs.length ||
        response.specs.some((s, i) => {
          const p = prev[i];
          return !p || s.path !== p.path || s.name !== p.name || s.files.length !== p.files.length ||
            s.stages.length !== p.stages.length ||
            s.stages.some((st, j) => st.status !== p.stages[j]?.status);
        });

      set({
        ...(specsChanged ? { specs: response.specs } : {}),
        error: null,
        isLoading: false,
        hasFetchedForRepo: true,
      });
    } catch (error) {
      if (get().currentRepoPath !== repoPath) return;
      const errorMessage = getErrorMessage(error);
      set({ error: errorMessage, isLoading: false, hasFetchedForRepo: true, specs: [] });
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

  initializeSubscriptions: createSubscriptionInitializer(get, set, () => {
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
  }),
}));
