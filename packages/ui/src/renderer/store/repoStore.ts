import { create } from "zustand";

import type { Repository } from "@magenta/shared/models";
import { ipc } from "../utils/ipc";

type ScanProgress = {
  scanned: number;
  total: number;
  currentDir: string;
};

type RepoStoreState = {
  repos: Repository[];
  activeRepoPath: string | null;
  isScanning: boolean;
  scanProgress: ScanProgress | null;
  error: string | null;
  subscriptionsReady: boolean;
  setRepos: (repos: Repository[]) => void;
    setActiveRepoPath: (path: string | null) => void;
  fetchRepos: () => Promise<void>;
  triggerScan: () => Promise<void>;
  initializeSubscriptions: () => void;
};

export const useRepoStore = create<RepoStoreState>((set, get) => ({
  repos: [],
  activeRepoPath: null,
  isScanning: false,
  scanProgress: null,
  error: null,
  subscriptionsReady: false,
  setRepos: (repos) => set({ repos }),
  setActiveRepoPath(path: string | null) {
    set({ activeRepoPath: path });
    // Persist to session store via dynamic import to avoid circular deps
    Promise.resolve().then(async () => {
      const { useSessionStore } = await import("./sessionStore");
      const updateSelectedRepoPath = useSessionStore.getState().updateSelectedRepoPath;
      void updateSelectedRepoPath(path);
    });
  },
  async fetchRepos() {
    const response = await ipc.send({ type: "repo:list" });

    if (response.type === "repo:list:result") {
      set({ repos: response.repos, error: null });
      return;
    }

    if (response.type === "error") {
      set({ error: response.message });
    }
  },
  async triggerScan() {
    set({ isScanning: true, scanProgress: null, error: null });
    const response = await ipc.send({ type: "repo:scan" });

    if (response.type === "error") {
      set({ isScanning: false, error: response.message });
    }
  },
  initializeSubscriptions() {
    if (get().subscriptionsReady) {
      return;
    }

    ipc.on("repo:scan:started", () => {
      set({ isScanning: true, scanProgress: { scanned: 0, total: 0, currentDir: "Starting scan" } });
    });

    ipc.on("repo:scan:progress", (payload) => {
      set({
        isScanning: true,
        scanProgress: {
          scanned: payload.scanned,
          total: payload.total,
          currentDir: payload.currentDir,
        },
      });
    });

    ipc.on("repo:scan:complete", (payload) => {
      set({
        repos: payload.repos,
        isScanning: false,
        scanProgress: null,
      });
    });

    set({ subscriptionsReady: true });
  },
}));
