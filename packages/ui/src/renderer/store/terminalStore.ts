import { create } from "zustand";
import { sendOrThrow, onEvent } from "../services/ipcClient";

/* ── Types ── */

export type TerminalSessionStatus = "connecting" | "active" | "closed";

export type TerminalSession = {
  sessionId: string;
  cwd: string;
  output: string;
  status: TerminalSessionStatus;
};

type TerminalStoreState = {
  /** Active terminal sessions keyed by sessionId */
  sessions: Record<string, TerminalSession>;
  /** Whether IPC event subscriptions have been initialized */
  subscriptionsReady: boolean;

  /** Spawn a new PTY session and return its sessionId */
  spawn: (cwd: string, cols: number, rows: number) => Promise<string>;
  /** Write input to a session's stdin */
  write: (sessionId: string, data: string) => Promise<void>;
  /** Resize a session's PTY */
  resize: (sessionId: string, cols: number, rows: number) => Promise<void>;
  /** Close and clean up a session */
  close: (sessionId: string) => Promise<void>;
  /** Append streamed output to a session */
  appendOutput: (sessionId: string, data: string) => void;
  /** Mark a session as exited/closed */
  setExited: (sessionId: string) => void;
  /** Set up IPC event listeners (idempotent) */
  initializeSubscriptions: () => void;
};

export const useTerminalStore = create<TerminalStoreState>((set, get) => ({
  sessions: {},
  subscriptionsReady: false,

  spawn: async (cwd, cols, rows) => {
    const response = await sendOrThrow({ type: "terminal:spawn", cwd, cols, rows });
    const { sessionId } = response;
    set((state) => ({
      sessions: {
        ...state.sessions,
        [sessionId]: { sessionId, cwd, output: "", status: "active" },
      },
    }));
    return sessionId;
  },

  write: async (sessionId, data) => {
    await sendOrThrow({ type: "terminal:input", sessionId, data });
  },

  resize: async (sessionId, cols, rows) => {
    await sendOrThrow({ type: "terminal:resize", sessionId, cols, rows });
  },

  close: async (sessionId) => {
    const session = get().sessions[sessionId];
    if (!session || session.status === "closed") return;
    await sendOrThrow({ type: "terminal:close", sessionId });
    set((state) => ({
      sessions: {
        ...state.sessions,
        [sessionId]: { ...state.sessions[sessionId], status: "closed" },
      },
    }));
  },

  appendOutput: (sessionId, data) => {
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) return state;
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, output: session.output + data },
        },
      };
    });
  },

  setExited: (sessionId) => {
    set((state) => {
      const session = state.sessions[sessionId];
      if (!session) return state;
      return {
        sessions: {
          ...state.sessions,
          [sessionId]: { ...session, status: "closed" },
        },
      };
    });
  },

  initializeSubscriptions: () => {
    if (get().subscriptionsReady) return;
    set({ subscriptionsReady: true });

    onEvent("terminal:data", (event) => {
      get().appendOutput(event.sessionId, event.data);
    });

    onEvent("terminal:exited", (event) => {
      get().setExited(event.sessionId);
    });
  },
}));
