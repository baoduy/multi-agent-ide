import { create } from "zustand";

import type { CliToolId, CliToolStatus } from "@magenta/shared/cliTools";
import { ipc } from "../utils/ipc";
import { sendOrThrow } from "../services/ipcClient";
import { createSubscriptionInitializer } from "../services/createSubscriptionInitializer";

export type CliUpgradePhase = "idle" | "running" | "done";

export interface CliUpgradeState {
  phase: CliUpgradePhase;
  output: string;
  success: boolean | null;
  error: string | null;
}

type CliVersionStoreState = {
  tools: CliToolStatus[];
  upgrades: Partial<Record<CliToolId, CliUpgradeState>>;
  /** True while the upgrade dialog is open */
  dialogOpen: boolean;
  /**
   * Repo the dialog was opened from. Only used to read Specify's current
   * version out of `<repo>/.specify/init-options.json`. `null` when the
   * dialog was opened from a non-repo context.
   */
  sourceRepoPath: string | null;
  /** True while a fresh version check is in flight */
  isChecking: boolean;
  subscriptionsReady: boolean;

  fetchStatus: () => Promise<void>;
  recheck: () => Promise<void>;
  startUpgrade: (tool: CliToolId) => Promise<void>;
  cancelUpgrade: (tool: CliToolId) => Promise<void>;
  setDialogOpen: (open: boolean, repoPath?: string | null) => void;
  dismissUpgrade: (tool: CliToolId) => void;
  initializeSubscriptions: () => void;
};

export const useCliVersionStore = create<CliVersionStoreState>((set, get) => ({
  tools: [],
  upgrades: {},
  dialogOpen: false,
  sourceRepoPath: null,
  isChecking: false,
  subscriptionsReady: false,

  fetchStatus: async () => {
    try {
      const response = await sendOrThrow({
        type: "cli:get-version-status",
        repoPath: get().sourceRepoPath ?? undefined,
      });
      set({ tools: response.tools });
    } catch (err) {
      console.warn("[cli-version] fetchStatus failed:", err);
    }
  },

  recheck: async () => {
    set({ isChecking: true });
    try {
      await sendOrThrow({
        type: "cli:recheck",
        repoPath: get().sourceRepoPath ?? undefined,
      });
    } catch (err) {
      set({ isChecking: false });
      console.warn("[cli-version] recheck failed:", err);
    }
  },

  startUpgrade: async (tool) => {
    set((state) => ({
      upgrades: {
        ...state.upgrades,
        [tool]: { phase: "running", output: "", success: null, error: null },
      },
    }));
    try {
      await sendOrThrow({ type: "cli:upgrade", tool });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      set((state) => ({
        upgrades: {
          ...state.upgrades,
          [tool]: { phase: "done", output: state.upgrades[tool]?.output ?? "", success: false, error: message },
        },
      }));
    }
  },

  cancelUpgrade: async (tool) => {
    try {
      await sendOrThrow({ type: "cli:upgrade:cancel", tool });
    } catch {
      // best-effort
    }
  },

  setDialogOpen: (open, repoPath) => {
    if (open) {
      set({ dialogOpen: true, sourceRepoPath: repoPath ?? null });
    } else {
      set({ dialogOpen: false });
    }
  },

  dismissUpgrade: (tool) => {
    set((state) => {
      const { [tool]: _removed, ...rest } = state.upgrades;
      return { upgrades: rest };
    });
  },

  initializeSubscriptions: createSubscriptionInitializer(get, set, () => {
    ipc.on("cli:version-status-changed", (msg) => {
      set({ tools: msg.tools, isChecking: false });
    });

    ipc.on("cli:upgrade:output", (msg) => {
      set((state) => {
        const prev = state.upgrades[msg.tool] ?? { phase: "running" as const, output: "", success: null, error: null };
        return {
          upgrades: {
            ...state.upgrades,
            [msg.tool]: { ...prev, output: prev.output + msg.data },
          },
        };
      });
    });

    ipc.on("cli:upgrade:complete", (msg) => {
      set((state) => {
        const prev = state.upgrades[msg.tool] ?? { phase: "running" as const, output: "", success: null, error: null };
        return {
          upgrades: {
            ...state.upgrades,
            [msg.tool]: {
              ...prev,
              phase: "done",
              success: msg.success,
              error: msg.success ? null : (msg.error ?? "Upgrade failed"),
            },
          },
        };
      });
    });
  }),
}));

/**
 * Computes the tool rows to render in the upgrade dialog: installed CLIs
 * that either have an update available or a running/completed upgrade.
 *
 * Do NOT pass this to `useCliVersionStore` directly — `.filter()` returns a
 * new array on every call and zustand v5's `useSyncExternalStore` requires
 * stable snapshots. Instead, select `tools`/`upgrades` separately and wrap
 * this call in `useMemo`.
 */
export function computeActionableCliTools(
  tools: CliToolStatus[],
  upgrades: Partial<Record<CliToolId, CliUpgradeState>>,
): CliToolStatus[] {
  return tools.filter(
    (t) => t.installed && (t.updateAvailable || upgrades[t.tool] !== undefined),
  );
}
