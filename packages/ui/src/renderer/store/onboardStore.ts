import { create } from "zustand";

import { ipc } from "../utils/ipc";
import { createSubscriptionInitializer } from "../services/createSubscriptionInitializer";

/* ── Types ── */

export type OnboardProcessKind = "onboard" | "upgrade";
export type OnboardPhase = "select" | "running" | "done";

export type OnboardProcess = {
  kind: OnboardProcessKind;
  repoPath: string;
  repoName: string;
  phase: OnboardPhase;
  output: string;
  success: boolean | null;
  error: string | null;
  /** Whether the user has the dialog open or it's minimized to background */
  dialogOpen: boolean;
};

type OnboardStoreState = {
  /** Active onboard/upgrade processes keyed by repoPath */
  processes: Record<string, OnboardProcess>;
  /** Whether IPC subscriptions have been set up */
  subscriptionsReady: boolean;

  /** Start a new onboard or upgrade process */
  startProcess: (kind: OnboardProcessKind, repoPath: string, repoName: string) => void;
  /** Update process phase to running */
  setRunning: (repoPath: string) => void;
  /** Append output text */
  appendOutput: (repoPath: string, data: string) => void;
  /** Mark process as completed */
  setComplete: (repoPath: string, success: boolean, error?: string) => void;
  /** Toggle dialog open/close (minimize to background) */
  setDialogOpen: (repoPath: string, open: boolean) => void;
  /** Remove a completed process from the store */
  dismiss: (repoPath: string) => void;
  /** Initialize IPC event subscriptions */
  initializeSubscriptions: () => void;
};

export const useOnboardStore = create<OnboardStoreState>((set, get) => ({
  processes: {},
  subscriptionsReady: false,

  startProcess: (kind, repoPath, repoName) => {
    set((state) => ({
      processes: {
        ...state.processes,
        [repoPath]: {
          kind,
          repoPath,
          repoName,
          phase: kind === "onboard" ? "select" : "select",
          output: "",
          success: null,
          error: null,
          dialogOpen: true,
        },
      },
    }));
  },

  setRunning: (repoPath) => {
    set((state) => {
      const proc = state.processes[repoPath];
      if (!proc) return state;
      return {
        processes: {
          ...state.processes,
          [repoPath]: { ...proc, phase: "running", output: "", error: null },
        },
      };
    });
  },

  appendOutput: (repoPath, data) => {
    set((state) => {
      const proc = state.processes[repoPath];
      if (!proc) return state;
      return {
        processes: {
          ...state.processes,
          [repoPath]: { ...proc, output: proc.output + data },
        },
      };
    });
  },

  setComplete: (repoPath, success, error) => {
    set((state) => {
      const proc = state.processes[repoPath];
      if (!proc) return state;
      return {
        processes: {
          ...state.processes,
          [repoPath]: {
            ...proc,
            phase: "done",
            success,
            error: error ?? null,
          },
        },
      };
    });
  },

  setDialogOpen: (repoPath, open) => {
    set((state) => {
      const proc = state.processes[repoPath];
      if (!proc) return state;
      return {
        processes: {
          ...state.processes,
          [repoPath]: { ...proc, dialogOpen: open },
        },
      };
    });
  },

  dismiss: (repoPath) => {
    set((state) => {
      const { [repoPath]: _, ...rest } = state.processes;
      return { processes: rest };
    });
  },

  initializeSubscriptions: createSubscriptionInitializer(get, set, () => {
    // Onboard events
    ipc.on("repo:onboard:output", (msg) => {
      get().appendOutput(msg.repoPath, msg.data);
    });

    ipc.on("repo:onboard:complete", (msg) => {
      get().setComplete(
        msg.repoPath,
        msg.success,
        msg.success ? undefined : msg.error,
      );
    });

    // Upgrade events
    ipc.on("repo:upgrade-specify:output", (msg) => {
      get().appendOutput(msg.repoPath, msg.data);
    });

    ipc.on("repo:upgrade-specify:complete", (msg) => {
      get().setComplete(
        msg.repoPath,
        msg.success,
        msg.success ? undefined : msg.error,
      );
    });
  }),
}));
