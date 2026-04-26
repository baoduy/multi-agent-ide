import { create } from "zustand";
import { sendOrThrow, onEvent } from "../services/ipcClient";
import { createSubscriptionInitializer } from "../services/createSubscriptionInitializer";
import type { AISessionRecord, AIProvider, AISessionStatus, AIPermissionMode, ProviderMeta } from "@magenta/shared/aiTerminal";

/**
 * AI session metadata store. Terminal output is owned by TerminalHub —
 * this store holds only list-rendering data (status, title, permissionMode).
 * Status/title/exit events still land here because the app chrome renders
 * them (header pills, tab titles, history list).
 */

type AISessionStoreState = {
  sessions: AISessionRecord[];
  activeSessionId: string | null;
  providers: Record<AIProvider, ProviderMeta> | null;
  subscriptionsReady: boolean;

  // ── Session CRUD ──
  fetchSessions: () => Promise<void>;
  createSession: (config: {
    provider: AIProvider;
    repoPath?: string;
    branch?: string;
    worktreePath?: string;
    permissionMode?: AIPermissionMode;
    /** Reuse an existing agent session UUID (resume of a synced session). */
    providerSessionId?: string;
    /** Phase 4 — tool/permission granularity. */
    allowedTools?: string[];
    disallowedTools?: string[];
    presetId?: string;
    permissionPromptTool?: string;
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
  updateStatus: (sessionId: string, status: AISessionStatus) => void;
  updateTitle: (sessionId: string, title: string) => void;
  updatePermissionMode: (sessionId: string, permissionMode: AIPermissionMode) => void;
  setExited: (sessionId: string, exitCode: number) => void;

  // ── Derived ──
  getRunningSessionCount: () => number;

  initializeSubscriptions: () => void;
};

export const useAISessionStore = create<AISessionStoreState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
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
      providerSessionId: config.providerSessionId,
      allowedTools: config.allowedTools,
      disallowedTools: config.disallowedTools,
      presetId: config.presetId,
      permissionPromptTool: config.permissionPromptTool,
      cols,
      rows,
    });
    const session = response.session;
    set((state) => ({
      sessions: [session, ...state.sessions],
      activeSessionId: session.id,
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
    }));
    return session;
  },

  deleteSession: async (sessionId) => {
    await sendOrThrow({ type: "ai-session:delete", sessionId });
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== sessionId),
      activeSessionId: state.activeSessionId === sessionId ? null : state.activeSessionId,
    }));
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
    // "in-progress" means the agent is actively processing (PTY output
    // streaming) — not merely alive. A session at `waiting-input` is
    // parked at a prompt with no work to lose, so we don't include it.
    // This drives the close-warning dialog: we only nag the user when
    // quitting would actually interrupt work.
    return get().sessions.filter((s) => s.status === "active").length;
  },

  initializeSubscriptions: createSubscriptionInitializer(get, set, () => {
    // Output (ai-session:data) is handled by TerminalHub — not this store.
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

    // A session record was mutated daemon-side (e.g. Copilot's providerSessionId
    // was reconciled after spawn). Replace the store record so the tree dedup
    // in buildUnifiedGroups picks up the new identity immediately.
    onEvent("ai-session:updated", (event) => {
      set((state) => ({
        sessions: state.sessions.some((s) => s.id === event.session.id)
          ? state.sessions.map((s) => (s.id === event.session.id ? event.session : s))
          : [event.session, ...state.sessions],
      }));
    });
  }),
}));
