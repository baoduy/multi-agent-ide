import { create } from "zustand";

import type { SpecFolder } from "@magenta/shared/models";
import { ipc } from "../utils/ipc";

type SpecStoreState = {
  specs: SpecFolder[];
  selectedSpecPath: string | null;
  currentRepoPath: string | null;
  isLoading: boolean;
  error: string | null;
  subscriptionsReady: boolean;
  setSpecs: (specs: SpecFolder[]) => void;
  setSelectedSpecPath: (path: string | null) => void;
  fetchSpecs: (repoPath: string) => Promise<void>;
  setCurrentRepoPath: (path: string | null) => void;
  initializeSubscriptions: () => void;
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
    // Persist to session store via dynamic import to avoid circular deps
    Promise.resolve().then(async () => {
      const { useSessionStore } = await import("./sessionStore");
      const updateSelectedSpecPath = useSessionStore.getState().updateSelectedSpecPath;
      void updateSelectedSpecPath(path);
    });
  },

  setCurrentRepoPath: (path) => set({ currentRepoPath: path }),

  async fetchSpecs(repoPath: string) {
    set({ isLoading: true, error: null, currentRepoPath: repoPath });

    try {
      const response = await ipc.send({ type: "spec:list", repoPath });

      if (response.type === "spec:list:result") {
        set({ specs: response.specs, error: null, isLoading: false });
        return;
      }

      if (response.type === "error") {
        set({ error: response.message, isLoading: false, specs: [] });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ error: errorMessage, isLoading: false, specs: [] });
    }
  },

  initializeSubscriptions() {
    if (get().subscriptionsReady) {
      return;
    }

    // Subscribe to spec:list:updated events for real-time updates (Phase 6)
    ipc.on("spec:list:updated", (payload) => {
      const currentRepoPath = get().currentRepoPath;

      // Only update if the event is for the currently loaded repo
      if (payload.repoPath === currentRepoPath) {
        set({ specs: payload.specs });
      }
    });

    set({ subscriptionsReady: true });
  },
}));
