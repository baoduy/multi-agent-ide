/**
 * markdownManagerStore — Zustand store for the Markdown Manager dock group.
 *
 * Manages repo/branch selection and the list of markdown files independently
 * from the Explorer group's stores. Uses sendOrThrow for IPC calls.
 */

import { create } from "zustand";
import { sendOrThrow } from "../services/ipcClient";

const STORAGE_KEY = "magenta:markdown-manager";

type MarkdownManagerState = {
  selectedRepoPath: string | null;
  selectedBranch: string | null;
  branches: string[];
  currentBranch: string;
  mdFiles: string[];
  isLoadingBranches: boolean;
  isLoadingFiles: boolean;

  selectRepo: (repoPath: string | null) => void;
  selectBranch: (branch: string) => void;
  fetchBranches: (repoPath: string) => Promise<void>;
  fetchMdFiles: (repoPath: string, branch: string) => Promise<void>;
};

function loadPersisted(): { selectedRepoPath: string | null; selectedBranch: string | null } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { selectedRepoPath: null, selectedBranch: null };
    const parsed = JSON.parse(raw);
    return {
      selectedRepoPath: parsed.selectedRepoPath ?? null,
      selectedBranch: parsed.selectedBranch ?? null,
    };
  } catch {
    return { selectedRepoPath: null, selectedBranch: null };
  }
}

function persist(repoPath: string | null, branch: string | null): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ selectedRepoPath: repoPath, selectedBranch: branch }));
  } catch { /* ignore */ }
}

const initial = loadPersisted();

export const useMarkdownManagerStore = create<MarkdownManagerState>((set, get) => ({
  selectedRepoPath: initial.selectedRepoPath,
  selectedBranch: initial.selectedBranch,
  branches: [],
  currentBranch: "",
  mdFiles: [],
  isLoadingBranches: false,
  isLoadingFiles: false,

  selectRepo: (repoPath) => {
    set({ selectedRepoPath: repoPath, selectedBranch: null, branches: [], currentBranch: "", mdFiles: [] });
    persist(repoPath, null);
    if (repoPath) {
      void get().fetchBranches(repoPath);
    }
  },

  selectBranch: (branch) => {
    const { selectedRepoPath } = get();
    set({ selectedBranch: branch });
    persist(selectedRepoPath, branch);
    if (selectedRepoPath) {
      void get().fetchMdFiles(selectedRepoPath, branch);
    }
  },

  fetchBranches: async (repoPath) => {
    set({ isLoadingBranches: true });
    try {
      const res = await sendOrThrow({ type: "worktree:branches", repoPath });
      const { selectedBranch } = get();
      const branch = selectedBranch && res.branches.includes(selectedBranch)
        ? selectedBranch
        : res.current;
      set({
        branches: res.branches,
        currentBranch: res.current,
        selectedBranch: branch,
        isLoadingBranches: false,
      });
      persist(repoPath, branch);
      void get().fetchMdFiles(repoPath, branch);
    } catch {
      set({ isLoadingBranches: false, branches: [], currentBranch: "" });
    }
  },

  fetchMdFiles: async (repoPath, branch) => {
    set({ isLoadingFiles: true });
    try {
      const res = await sendOrThrow({
        type: "git:ls-files",
        repoPath,
        pattern: "*.md",
        ref: branch,
      });
      set({ mdFiles: res.files, isLoadingFiles: false });
    } catch {
      set({ mdFiles: [], isLoadingFiles: false });
    }
  },
}));
