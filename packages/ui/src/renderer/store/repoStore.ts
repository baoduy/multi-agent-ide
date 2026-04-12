import { create } from "zustand";

import type { Repository } from "@magenta/shared/models";
import { ipc } from "../utils/ipc";
import { sendOrThrow } from "../services/ipcClient";
import { createSubscriptionInitializer } from "../services/createSubscriptionInitializer";
import { localStore } from "../services/localStorage";

type ScanProgress = {
  scanned: number;
  total: number;
  currentDir: string;
};

type RepoStoreState = {
  repos: Repository[];
  activeRepoPath: string | null;
  pinnedPaths: Set<string>;
  isScanning: boolean;
  scanProgress: ScanProgress | null;
  error: string | null;
  subscriptionsReady: boolean;
  searchQuery: string;
  setRepos: (repos: Repository[]) => void;
  setActiveRepoPath: (path: string | null) => void;
  togglePin: (repoPath: string) => void;
  isPinned: (repoPath: string) => boolean;
  fetchRepos: () => Promise<void>;
  triggerScan: () => Promise<void>;
  initializeSubscriptions: () => void;
  setSearchQuery: (query: string) => void;
};

// Persist pinned repos using the shared localStorage utility
const pinnedStore = localStore<string[]>({
  key: "magenta:pinned-repos",
  fallback: [],
  debounceMs: 300,
});

function loadPinnedPaths(): Set<string> {
  return new Set(pinnedStore.get());
}

function savePinnedPaths(paths: Set<string>): void {
  pinnedStore.set([...paths]);
}

export const useRepoStore = create<RepoStoreState>((set, get) => ({
  repos: [],
  activeRepoPath: null,
  pinnedPaths: loadPinnedPaths(),
  isScanning: false,
  scanProgress: null,
  error: null,
  subscriptionsReady: false,
  searchQuery: "",
  setRepos: (repos) => set({ repos }),
  setActiveRepoPath(path: string | null) {
    set({ activeRepoPath: path });
  },
  togglePin(repoPath: string) {
    const current = get().pinnedPaths;
    const next = new Set(current);
    if (next.has(repoPath)) {
      next.delete(repoPath);
    } else {
      next.add(repoPath);
    }
    savePinnedPaths(next);
    set({ pinnedPaths: next });
  },
  isPinned(repoPath: string) {
    return get().pinnedPaths.has(repoPath);
  },
  async fetchRepos() {
    try {
      const response = await sendOrThrow({ type: "repo:list" });
      set({ repos: response.repos, error: null });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },
  setSearchQuery(query: string) {
    set({ searchQuery: query });
  },
  async triggerScan() {
    set({ isScanning: true, scanProgress: null, error: null });
    try {
      await sendOrThrow({ type: "repo:scan" });
    } catch (error) {
      set({ isScanning: false, error: error instanceof Error ? error.message : String(error) });
    }
  },
  initializeSubscriptions: createSubscriptionInitializer(get, set, () => {
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
  }),
}));
