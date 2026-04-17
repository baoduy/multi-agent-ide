import { create } from "zustand";

import type { MagentaConfig } from "@magenta/shared/config";
import {
  DEFAULT_SPECIFY_COMMAND,
  DEFAULT_SPEC_SYNC_INTERVAL_MINUTES,
  DEFAULT_SESSION_SYNC_INTERVAL_MINUTES,
} from "@magenta/shared/config";
import { ipc } from "../utils/ipc";
import { sendOrThrow } from "../services/ipcClient";
import { createAsyncAction } from "../services/createStoreAction";
import { createSubscriptionInitializer } from "../services/createSubscriptionInitializer";

type ConfigStoreState = {
  workingDirs: string[];
  specifyCommand: string;
  specSyncIntervalMinutes: number;
  sessionSyncIntervalMinutes: number;
  fallbackApproverName: string;
  isLoading: boolean;
  error: string | null;
  subscriptionsReady: boolean;
  addWorkingDir: (path: string) => Promise<void>;
  removeWorkingDir: (path: string) => Promise<void>;
  updateSpecifyCommand: (command: string) => Promise<void>;
  updateSpecSyncInterval: (minutes: number) => Promise<void>;
  updateSessionSyncInterval: (minutes: number) => Promise<void>;
  updateFallbackApproverName: (name: string) => Promise<void>;
  fetchConfig: () => Promise<void>;
  initializeSubscriptions: () => void;
};

function applyConfig(config: MagentaConfig): Partial<ConfigStoreState> {
  return {
    workingDirs: config.workingDirs,
    specifyCommand: config.specifyCommand ?? DEFAULT_SPECIFY_COMMAND,
    specSyncIntervalMinutes:
      config.specSyncIntervalMinutes ?? DEFAULT_SPEC_SYNC_INTERVAL_MINUTES,
    sessionSyncIntervalMinutes:
      config.sessionSyncIntervalMinutes ?? DEFAULT_SESSION_SYNC_INTERVAL_MINUTES,
    fallbackApproverName: config.fallbackApproverName ?? "",
  };
}

export const useConfigStore = create<ConfigStoreState>((set, get) => ({
  workingDirs: [],
  specifyCommand: DEFAULT_SPECIFY_COMMAND,
  specSyncIntervalMinutes: DEFAULT_SPEC_SYNC_INTERVAL_MINUTES,
  sessionSyncIntervalMinutes: DEFAULT_SESSION_SYNC_INTERVAL_MINUTES,
  fallbackApproverName: "",
  isLoading: false,
  error: null,
  subscriptionsReady: false,

  fetchConfig: createAsyncAction<ConfigStoreState, { config: MagentaConfig }>({
    set,
    action: () => sendOrThrow({ type: "config:get" }),
    onSuccess: (response) => applyConfig(response.config),
  }),

  addWorkingDir(path: string) {
    return createAsyncAction<ConfigStoreState, { config: MagentaConfig }>({
      set,
      action: () => sendOrThrow({ type: "config:add-working-dir", path }),
      onSuccess: (response) => applyConfig(response.config),
    })();
  },

  removeWorkingDir(path: string) {
    return createAsyncAction<ConfigStoreState, { config: MagentaConfig }>({
      set,
      action: () => sendOrThrow({ type: "config:remove-working-dir", path }),
      onSuccess: (response) => applyConfig(response.config),
    })();
  },

  updateSpecifyCommand(command: string) {
    return createAsyncAction<ConfigStoreState, { config: MagentaConfig }>({
      set,
      action: () => sendOrThrow({ type: "config:update", config: { specifyCommand: command } }),
      onSuccess: (response) => applyConfig(response.config),
    })();
  },

  updateSpecSyncInterval(minutes: number) {
    return createAsyncAction<ConfigStoreState, { config: MagentaConfig }>({
      set,
      action: () =>
        sendOrThrow({
          type: "config:update",
          config: { specSyncIntervalMinutes: minutes },
        }),
      onSuccess: (response) => applyConfig(response.config),
    })();
  },

  updateSessionSyncInterval(minutes: number) {
    return createAsyncAction<ConfigStoreState, { config: MagentaConfig }>({
      set,
      action: () =>
        sendOrThrow({
          type: "config:update",
          config: { sessionSyncIntervalMinutes: minutes },
        }),
      onSuccess: (response) => applyConfig(response.config),
    })();
  },

  updateFallbackApproverName(name: string) {
    return createAsyncAction<ConfigStoreState, { config: MagentaConfig }>({
      set,
      action: () =>
        sendOrThrow({
          type: "config:update",
          config: { fallbackApproverName: name },
        }),
      onSuccess: (response) => applyConfig(response.config),
    })();
  },

  initializeSubscriptions: createSubscriptionInitializer(get, set, () => {
    // Listen for config updates from daemon
    ipc.on("config:updated", (payload) => {
      const config = (payload as Record<string, unknown>).config as MagentaConfig | undefined;
      if (config) {
        set(applyConfig(config));
      }
    });
  }),
}));
