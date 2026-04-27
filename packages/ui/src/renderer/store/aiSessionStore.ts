import { create } from "zustand";
import { sendOrThrow, onEvent } from "../services/ipcClient";
import { createSubscriptionInitializer } from "../services/createSubscriptionInitializer";
import type { AISessionRecord, AIProvider, AISessionStatus, AIPermissionMode, ProviderMeta } from "@magenta/shared/aiTerminal";
import type { TokenUsage } from "@magenta/shared/aiStreamEvent";
import type {
  CostUpdateEvent,
  DebugLogChunk,
  PluginInstallEvent,
  PluginInstallStatus,
  RetryEvent,
  SessionInitEvent,
} from "@magenta/shared/aiObservability";

/**
 * Phase 7 — per-session observability slice. Stored in a sibling map keyed
 * by session id so we don't touch the existing `sessions: AISessionRecord[]`
 * shape (which is replaced wholesale on `ai-session:updated`).
 */
export interface AiSessionObservability {
  initMetadata?: {
    model: string;
    tools: string[];
    mcpServers: string[];
    pluginErrors?: { name: string; message: string }[];
  };
  lastRetryEvent?: {
    attempt: number;
    max: number;
    delayMs: number;
    category: string;
    status?: number;
    observedAt: number;
  };
  retryCount: number;
  tokenUsage: TokenUsage;
  costUsd: number;
  pluginInstalls: Record<string, { plugin: string; status: PluginInstallStatus; message?: string }>;
  debugLogChunks: { seq: number; bytes: string }[];
}

const ZERO_OBSERVABILITY: AiSessionObservability = {
  retryCount: 0,
  tokenUsage: { inputTokens: 0, outputTokens: 0 },
  costUsd: 0,
  pluginInstalls: {},
  debugLogChunks: [],
};

/** ~5 MB ceiling for retained debug-log bytes per session. */
const DEBUG_LOG_BUDGET_BYTES = 5 * 1024 * 1024;

/**
 * AI session metadata store. Terminal output is owned by TerminalHub —
 * this store holds only list-rendering data (status, title, permissionMode).
 * Status/title/exit events still land here because the app chrome renders
 * them (header pills, tab titles, history list).
 */

type AISessionStoreState = {
  sessions: AISessionRecord[];
  /** Phase 7 — sibling map keyed by session id; populated lazily by push events. */
  observability: Record<string, AiSessionObservability>;
  activeSessionId: string | null;
  providers: Record<AIProvider, ProviderMeta> | null;
  subscriptionsReady: boolean;

  // Phase 7 — observability apply actions, called from coordinator on push events.
  applyInitEvent: (ev: SessionInitEvent) => void;
  applyRetryEvent: (ev: RetryEvent) => void;
  applyCostUpdate: (ev: CostUpdateEvent) => void;
  applyPluginInstall: (ev: PluginInstallEvent) => void;
  appendDebugLogChunk: (chunk: DebugLogChunk) => void;

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
    /** Phase 6 — agent selection (Claude `--agent <v>`). */
    agent?: string;
    /** Phase 6 — Copilot `--enable-all-github-mcp-tools` toggle. */
    enableAllGithubMcpTools?: boolean;
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
  observability: {},
  activeSessionId: null,
  providers: null,
  subscriptionsReady: false,

  applyInitEvent: (ev) => {
    set((state) => ({
      observability: {
        ...state.observability,
        [ev.sessionId]: {
          ...(state.observability[ev.sessionId] ?? ZERO_OBSERVABILITY),
          initMetadata: {
            model: ev.model,
            tools: ev.tools,
            mcpServers: ev.mcpServers,
            pluginErrors: ev.pluginErrors,
          },
        },
      },
    }));
  },

  applyRetryEvent: (ev) => {
    set((state) => {
      const slot = state.observability[ev.sessionId] ?? ZERO_OBSERVABILITY;
      return {
        observability: {
          ...state.observability,
          [ev.sessionId]: {
            ...slot,
            retryCount: slot.retryCount + 1,
            lastRetryEvent: {
              attempt: ev.attempt,
              max: ev.max,
              delayMs: ev.delayMs,
              category: ev.category,
              status: ev.status,
              observedAt: Date.now(),
            },
          },
        },
      };
    });
  },

  applyCostUpdate: (ev) => {
    set((state) => {
      const slot = state.observability[ev.sessionId] ?? ZERO_OBSERVABILITY;
      return {
        observability: {
          ...state.observability,
          [ev.sessionId]: {
            ...slot,
            tokenUsage: ev.tokenUsage,
            costUsd: ev.costUsd,
            retryCount: ev.retryCount,
            lastRetryEvent: undefined, // result observed → spinner stops.
          },
        },
      };
    });
  },

  applyPluginInstall: (ev) => {
    set((state) => {
      const slot = state.observability[ev.sessionId] ?? ZERO_OBSERVABILITY;
      return {
        observability: {
          ...state.observability,
          [ev.sessionId]: {
            ...slot,
            pluginInstalls: {
              ...slot.pluginInstalls,
              [ev.plugin]: {
                plugin: ev.plugin,
                status: ev.status,
                message: ev.message,
              },
            },
          },
        },
      };
    });
  },

  appendDebugLogChunk: (chunk) => {
    set((state) => {
      const slot = state.observability[chunk.sessionId] ?? ZERO_OBSERVABILITY;
      const next = [...slot.debugLogChunks, { seq: chunk.seq, bytes: chunk.bytes }];
      // Trim FIFO once we've exceeded the byte budget.
      let total = next.reduce((n, c) => n + c.bytes.length, 0);
      while (total > DEBUG_LOG_BUDGET_BYTES && next.length > 1) {
        total -= next[0].bytes.length;
        next.shift();
      }
      return {
        observability: {
          ...state.observability,
          [chunk.sessionId]: { ...slot, debugLogChunks: next },
        },
      };
    });
  },

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
      agent: config.agent,
      enableAllGithubMcpTools: config.enableAllGithubMcpTools,
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

    // Phase 7 — observability push events.
    onEvent("ai-session:init", (event) => {
      get().applyInitEvent(event.payload);
    });
    onEvent("ai-session:retry", (event) => {
      get().applyRetryEvent(event.payload);
    });
    onEvent("ai-session:cost-update", (event) => {
      get().applyCostUpdate(event.payload);
    });
    onEvent("ai-session:plugin-install", (event) => {
      get().applyPluginInstall(event.payload);
    });
    onEvent("ai-session:debug-log", (event) => {
      get().appendDebugLogChunk(event.payload);
    });
  }),
}));
