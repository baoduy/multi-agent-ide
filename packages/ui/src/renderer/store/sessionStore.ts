import { create } from "zustand";

import type { SessionState } from "@magenta/shared/models";
import type { MainTab } from "@magenta/shared/constants";
import { MAIN_TABS } from "@magenta/shared/constants";
import { localStore } from "../services/localStorage";

/* ── localStorage backing store ── */

const STORAGE_KEY = "magenta:session";

function validateSession(raw: unknown): SessionState | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  // Validate mainTab is a known value
  if (obj.mainTab && !MAIN_TABS.includes(obj.mainTab as MainTab)) {
    obj.mainTab = "specs";
  }
  return obj as unknown as SessionState;
}

const DEFAULT_SESSION: SessionState = {
  selectedRepoPath: null,
  selectedSpecPath: null,
  selectedFilePath: null,
  sidebarWidth: null,
  activityPanelWidth: null,
  activityPanelOpen: true,
  sidebarCollapsed: false,
  activityCollapsed: false,
  specPanelHeight: null,
  mainTab: "specs",
  updatedAt: Date.now(),
};

const sessionStorage = localStore<SessionState>({
  key: STORAGE_KEY,
  fallback: DEFAULT_SESSION,
  debounceMs: 300,
  validate: validateSession,
});

/* ── Zustand store ── */

type SessionStoreState = SessionState & {
  isLoading: boolean;
  error: string | null;
  initialized: boolean;
  loadSessionState: () => void;
  patchSession: (patch: Partial<SessionState>) => void;
};

export const useSessionStore = create<SessionStoreState>((set, get) => ({
  // SessionState fields — initialized from localStorage
  ...DEFAULT_SESSION,

  // Store state
  isLoading: false,
  error: null,
  initialized: false,

  loadSessionState() {
    set({ isLoading: true, error: null });

    try {
      const stored = sessionStorage.get();
      set({
        ...stored,
        initialized: true,
        isLoading: false,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[session] loadSessionState exception:", errorMessage);
      set({ error: errorMessage, isLoading: false, initialized: true });
    }
  },

  patchSession(patch: Partial<SessionState>) {
    // Optimistically update local Zustand state
    set(patch as Partial<SessionStoreState>);
    // Persist to localStorage (debounced)
    const full = extractSessionState(get());
    sessionStorage.set({ ...full, ...patch, updatedAt: Date.now() });
  },
}));

/** Extract only the SessionState fields from the store (drop isLoading, etc.) */
function extractSessionState(state: SessionStoreState): SessionState {
  return {
    selectedRepoPath: state.selectedRepoPath,
    selectedSpecPath: state.selectedSpecPath,
    selectedFilePath: state.selectedFilePath,
    sidebarWidth: state.sidebarWidth,
    activityPanelWidth: state.activityPanelWidth,
    activityPanelOpen: state.activityPanelOpen,
    sidebarCollapsed: state.sidebarCollapsed,
    activityCollapsed: state.activityCollapsed,
    specPanelHeight: state.specPanelHeight,
    mainTab: state.mainTab,
    updatedAt: state.updatedAt,
  };
}

/** Flush any pending writes — call on app shutdown. */
export function flushSessionStorage(): void {
  sessionStorage.flush();
}
