import { create } from "zustand";
import { sendOrThrow } from "../services/ipcClient";

/* ── Types ── */

export type TerminalSessionStatus = "connecting" | "active" | "closed";

/**
 * Metadata-only session record. Terminal output lives in TerminalHub's
 * xterm instances — not here. This store is intentionally tiny and
 * React-friendly (stable across re-renders).
 */
export type TerminalSession = {
  sessionId: string;
  cwd: string;
  status: TerminalSessionStatus;
};

type TerminalStoreState = {
  sessions: Record<string, TerminalSession>;

  spawn: (cwd: string, cols: number, rows: number) => Promise<string>;
  write: (sessionId: string, data: string) => Promise<void>;
  resize: (sessionId: string, cols: number, rows: number) => Promise<void>;
  close: (sessionId: string) => Promise<void>;
  setExited: (sessionId: string) => void;
  /** Kept for backward compatibility — no-op now that the hub handles events. */
  initializeSubscriptions: () => void;
};

export const useTerminalStore = create<TerminalStoreState>((set, get) => ({
  sessions: {},

  spawn: async (cwd, cols, rows) => {
    const response = await sendOrThrow({ type: "terminal:spawn", cwd, cols, rows });
    const { sessionId } = response;
    set((state) => ({
      sessions: {
        ...state.sessions,
        [sessionId]: { sessionId, cwd, status: "active" },
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

  // Output is now owned by TerminalHub; this hook stays for call-site
  // compatibility but performs no subscriptions.
  initializeSubscriptions: () => {},
}));
