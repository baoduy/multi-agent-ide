import { create } from "zustand";
import { sendOrThrow, onEvent } from "../services/ipcClient";
import { createSubscriptionInitializer } from "../services/createSubscriptionInitializer";
import type { AISessionRecord, AIProvider, AISessionStatus, ProviderMeta } from "@magenta/shared/aiTerminal";

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
    args?: string[];
  }, cols: number, rows: number) => Promise<AISessionRecord>;
  resumeSession: (sessionId: string, cols: number, rows: number) => Promise<AISessionRecord>;
  deleteSession: (sessionId: string) => Promise<void>;
  setActiveSession: (sessionId: string | null) => void;

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
  setExited: (sessionId: string, exitCode: number) => void;

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
      return {
        liveOutput: { ...state.liveOutput, [sessionId]: existing + data },
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

  setExited: (sessionId, _exitCode) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, status: "exited" as const, lastActiveAt: Date.now() } : s
      ),
    }));
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

    onEvent("ai-session:exited", (event) => {
      get().setExited(event.sessionId, event.exitCode);
    });
  }),
}));
