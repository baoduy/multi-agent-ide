import { create } from "zustand";

import { ipc } from "../utils/ipc";
import { sendOrThrow } from "../services/ipcClient";
import { createSubscriptionInitializer } from "../services/createSubscriptionInitializer";

export type CloneStatus = "running" | "success" | "error";

export type CloneState = {
  cloneId: string;
  url: string;
  targetPath: string;
  phase: string;
  percent: number;
  status: CloneStatus;
  error: string | null;
  log: string[];
};

type GitCloneStoreState = {
  clones: Map<string, CloneState>;
  /** Latest clone triggered by the UI — handy for the dialog binding. */
  latestId: string | null;
  subscriptionsReady: boolean;
  /**
   * Kick off a clone. Returns the cloneId so the dialog can bind to its progress.
   * Throws on daemon-side validation errors.
   */
  startClone: (args: {
    url: string;
    targetDir: string;
    folderName: string;
    depth?: number;
  }) => Promise<string>;
  clearClone: (cloneId: string) => void;
  initializeSubscriptions: () => void;
};

export const useGitCloneStore = create<GitCloneStoreState>((set, get) => ({
  clones: new Map(),
  latestId: null,
  subscriptionsReady: false,

  async startClone(args) {
    const response = await sendOrThrow({
      type: "git:clone",
      url: args.url,
      targetDir: args.targetDir,
      folderName: args.folderName,
      depth: args.depth,
    });

    const state: CloneState = {
      cloneId: response.cloneId,
      url: args.url,
      targetPath: response.targetPath,
      phase: "Starting",
      percent: 0,
      status: "running",
      error: null,
      log: [],
    };

    const next = new Map(get().clones);
    next.set(response.cloneId, state);
    set({ clones: next, latestId: response.cloneId });

    return response.cloneId;
  },

  clearClone(cloneId) {
    const next = new Map(get().clones);
    next.delete(cloneId);
    set({
      clones: next,
      latestId: get().latestId === cloneId ? null : get().latestId,
    });
  },

  initializeSubscriptions: createSubscriptionInitializer(get, set, () => {
    ipc.on("git:clone:progress", (payload) => {
      const p = payload as {
        cloneId: string;
        phase: string;
        percent: number;
        data: string;
      };
      const current = get().clones.get(p.cloneId);
      if (!current) return;
      const updated: CloneState = {
        ...current,
        phase: p.phase,
        percent: p.percent,
        log: [...current.log, p.data].slice(-100),
      };
      const next = new Map(get().clones);
      next.set(p.cloneId, updated);
      set({ clones: next });
    });

    ipc.on("git:clone:complete", (payload) => {
      const p = payload as {
        cloneId: string;
        repoPath: string;
        success: boolean;
        error?: string;
      };
      const current = get().clones.get(p.cloneId);
      if (!current) return;
      const updated: CloneState = {
        ...current,
        status: p.success ? "success" : "error",
        percent: p.success ? 100 : current.percent,
        error: p.success ? null : (p.error ?? "Clone failed."),
        targetPath: p.repoPath || current.targetPath,
      };
      const next = new Map(get().clones);
      next.set(p.cloneId, updated);
      set({ clones: next });
    });
  }),
}));
