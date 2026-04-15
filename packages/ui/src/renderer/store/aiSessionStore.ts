import { create } from "zustand";
import { sendOrThrow, onEvent } from "../services/ipcClient";
import { createSubscriptionInitializer } from "../services/createSubscriptionInitializer";
import type { AISessionRecord, AIProvider, AISessionStatus, AIPermissionMode, ProviderMeta } from "@magenta/shared/aiTerminal";

/* ── Constants ── */

/** Maximum output size per session (1MB). Older content is truncated. */
const MAX_OUTPUT_SIZE = 1024 * 1024;

/* ── Types ── */

type AISessionStoreState = {
  /** Persisted session records (history list) */
  sessions: AISessionRecord[];
  /** Currently active session (open in terminal) */
  activeSessionId: string | null;
  /** Live PTY output keyed by sessionId (ephemeral) */
  liveOutput: Record<string, string>;
  /** Provider metadata */
  providers: Record<AIProvider, ProviderMeta> | null;
  /** Whether IPC event subscriptions have been initialized */
  subscriptionsReady: boolean;

  // ── Session CRUD ──
  fetchSessions: () => Promise<void>;
  createSession: (config: {
    provider: AIProvider;
    repoPath?: string;
    branch?: string;
    worktreePath?: string;
    permissionMode?: AIPermissionMode;
    args?: string[];
  }, cols: number, rows: number) => Promise<AISessionRecord>;
  resumeSession: (sessionId: string, cols: number, rows: number) => Promise<AISessionRecord>;
  deleteSession: (sessionId: string) => Promise<void>;
  setActiveSession: (sessionId: string | null) => void;
  setPermissionMode: (sessionId: string, mode: AIPermissionMode) => Promise<void>;

  // ── Live PTY operations ──
  sendInput: (sessionId: string, data: string) => Promise<void>;
  resize: (sessionId: string, cols: number, rows: number) => Promise<void>;
  stopSession: (sessionId: string) => Promise<void>;

  // ── Providers ──
  fetchProviders: () => Promise<void>;

  // ── Internal (called by event subscriptions) ──
  appendOutput: (sessionId: string, data: string) => void;
  updateStatus: (sessionId: string, status: AISessionStatus) => void;
  updateTitle: (sessionId: string, title: string) => void;
  updatePermissionMode: (sessionId: string, permissionMode: AIPermissionMode) => void;
  setExited: (sessionId: string, exitCode: number) => void;

  // ── Derived ──
  /** Count of sessions with active PTY (status is "active" or "waiting-input") */
  getRunningSessionCount: () => number;

  // ── Subscription init ──
  initializeSubscriptions: () => void;
};

export const useAISessionStore = create<AISessionStoreState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  liveOutput: {},
  providers: null,
  subscriptionsReady: false,

  fetchSessions: async () => {
    const response = await sendOrThrow({ type: "ai-session:list" });
    set({ sessions: response.sessions });
  },

  createSession: async (config, cols, rows) => {
    const response = await sendOrThrow({
      type: "ai-session:create",
      provider: config.provider,
      repoPath: config.repoPath,
      branch: config.branch,
      worktreePath: config.worktreePath,
      permissionMode: config.permissionMode,
      args: config.args,
      cols,
      rows,
    });
    const session = response.session;
    set((state) => ({
      sessions: [session, ...state.sessions],
      activeSessionId: session.id,
      liveOutput: { ...state.liveOutput, [session.id]: "" },
    }));
    return session;
  },

  resumeSession: async (sessionId, cols, rows) => {
    const response = await sendOrThrow({
      type: "ai-session:resume",
      sessionId,
      cols,
      rows,
    });
    const session = response.session;
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === sessionId ? session : s)),
      activeSessionId: sessionId,
      liveOutput: { ...state.liveOutput, [sessionId]: "" },
    }));
    return session;
  },

  deleteSession: async (sessionId) => {
    await sendOrThrow({ type: "ai-session:delete", sessionId });
    set((state) => {
      const { [sessionId]: _, ...restOutput } = state.liveOutput;
      return {
        sessions: state.sessions.filter((s) => s.id !== sessionId),
        activeSessionId: state.activeSessionId === sessionId ? null : state.activeSessionId,
        liveOutput: restOutput,
      };
    });
  },

  setActiveSession: (sessionId) => {
    set({ activeSessionId: sessionId });
  },

  setPermissionMode: async (sessionId, mode) => {
    await sendOrThrow({
      type: "ai-session:set-permission-mode",
      sessionId,
      permissionMode: mode,
    });
    // Optimistic update — the push event will also update
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, permissionMode: mode } : s
      ),
    }));
  },

  sendInput: async (sessionId, data) => {
    await sendOrThrow({ type: "ai-session:input", sessionId, data });
  },

  resize: async (sessionId, cols, rows) => {
    await sendOrThrow({ type: "ai-session:resize", sessionId, cols, rows });
  },

  stopSession: async (sessionId) => {
    await sendOrThrow({ type: "ai-session:stop", sessionId });
  },

  fetchProviders: async () => {
    const response = await sendOrThrow({ type: "ai-session:providers" });
    set({ providers: response.providers });
  },

  appendOutput: (sessionId, data) => {
    set((state) => {
      const existing = state.liveOutput[sessionId] ?? "";
      let combined = existing + data;
      // Truncate from the front if output exceeds max size
      if (combined.length > MAX_OUTPUT_SIZE) {
        combined = combined.slice(combined.length - MAX_OUTPUT_SIZE);
      }
      return {
        liveOutput: { ...state.liveOutput, [sessionId]: combined },
      };
    });
  },

  updateStatus: (sessionId, status) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, status, lastActiveAt: Date.now() } : s
      ),
    }));
  },

  updateTitle: (sessionId, title) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, title } : s
      ),
    }));
  },

  updatePermissionMode: (sessionId, permissionMode) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, permissionMode } : s
      ),
    }));
  },

  setExited: (sessionId, _exitCode) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, status: "exited" as const, lastActiveAt: Date.now() } : s
      ),
    }));
  },

  getRunningSessionCount: () => {
    return get().sessions.filter(
      (s) => s.status === "active" || s.status === "waiting-input"
    ).length;
  },

  initializeSubscriptions: createSubscriptionInitializer(get, set, () => {
    onEvent("ai-session:data", (event) => {
      get().appendOutput(event.sessionId, event.data);
    });

    onEvent("ai-session:status", (event) => {
      get().updateStatus(event.sessionId, event.status);
    });

    onEvent("ai-session:title", (event) => {
      get().updateTitle(event.sessionId, event.title);
    });

    onEvent("ai-session:permission-mode-changed", (event) => {
      get().updatePermissionMode(event.sessionId, event.permissionMode);
    });

    onEvent("ai-session:exited", (event) => {
      get().setExited(event.sessionId, event.exitCode);
    });
  }),
}));
