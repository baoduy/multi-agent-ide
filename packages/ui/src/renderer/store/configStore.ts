import { create } from "zustand";

import type { MagentaConfig } from "@magenta/shared/config";
import { ipc } from "../utils/ipc";

type ConfigStoreState = {
  workingDirs: string[];
  isLoading: boolean;
  error: string | null;
  subscriptionsReady: boolean;
  addWorkingDir: (path: string) => Promise<void>;
  removeWorkingDir: (path: string) => Promise<void>;
  fetchConfig: () => Promise<void>;
  initializeSubscriptions: () => void;
};

export const useConfigStore = create<ConfigStoreState>((set, get) => ({
  workingDirs: [],
  isLoading: false,
  error: null,
  subscriptionsReady: false,

  async fetchConfig() {
    set({ isLoading: true, error: null });

    try {
      const response = await ipc.send({ type: "config:get" });

      if (response.type === "config:response") {
        set({ workingDirs: response.config.workingDirs, isLoading: false, error: null });
        return;
      }

      if (response.type === "error") {
        set({ error: response.message, isLoading: false });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ error: errorMessage, isLoading: false });
    }
  },

  async addWorkingDir(path: string) {
    set({ isLoading: true, error: null });

    try {
      const response = await ipc.send({ type: "config:add-working-dir", path });

      if (response.type === "config:response") {
        set({ workingDirs: response.config.workingDirs, isLoading: false, error: null });
        return;
      }

      if (response.type === "error") {
        set({ error: response.message, isLoading: false });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ error: errorMessage, isLoading: false });
    }
  },

  async removeWorkingDir(path: string) {
    set({ isLoading: true, error: null });

    try {
      const response = await ipc.send({ type: "config:remove-working-dir", path });

      if (response.type === "config:response") {
        set({ workingDirs: response.config.workingDirs, isLoading: false, error: null });
        return;
      }

      if (response.type === "error") {
        set({ error: response.message, isLoading: false });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      set({ error: errorMessage, isLoading: false });
    }
  },

  initializeSubscriptions() {
    if (get().subscriptionsReady) {
      return;
    }

    // Listen for config updates from daemon
    ipc.on("config:updated", (payload) => {
      const config = (payload as Record<string, unknown>).config as MagentaConfig | undefined;
      if (config) {
        set({ workingDirs: config.workingDirs });
      }
    });

    set({ subscriptionsReady: true });
  },
}));
