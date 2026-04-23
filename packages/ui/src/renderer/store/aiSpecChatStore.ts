import { create } from "zustand";
import { sendOrThrow } from "../services/ipcClient";
import type { ChatMessage } from "./aiChatStore";

/**
 * Per-spec chat thread used by the spec-folder review bubble. Visually
 * mirrors `aiChatStore` (reusing `ChatMessage`) but collapsed to one mode:
 * Ask-only. No selection, no edit preview, no mode switching.
 *
 * Keyed by `specPath` (absolute spec folder path). Threads live in memory
 * for the session — switching specs preserves history; restarting the app
 * clears it. Matches the scope decision for the single-file chat.
 *
 * Per CLAUDE.md rules: this store does NOT import other stores. Callers
 * pass `repoPath`, `specName`, `specRelPath`, and `currentFileName` in
 * explicitly at send time.
 */

const MAX_HISTORY = 20;

export type SpecChatThread = {
  open: boolean;
  messages: ChatMessage[];
  sending: boolean;
  lastError: string | null;
};

function emptyThread(): SpecChatThread {
  return { open: false, messages: [], sending: false, lastError: null };
}

function nextId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface SendAskArgs {
  specPath: string;
  repoPath: string;
  specName: string;
  specRelPath: string;
  currentFileName?: string;
  userMessage: string;
}

type State = {
  threadsBySpec: Record<string, SpecChatThread>;

  setOpen: (specPath: string, open: boolean) => void;
  clear: (specPath: string) => void;
  sendAsk: (args: SendAskArgs) => Promise<void>;
};

export const useAiSpecChatStore = create<State>((set, get) => ({
  threadsBySpec: {},

  setOpen(specPath, open) {
    const thread = get().threadsBySpec[specPath] ?? emptyThread();
    set((s) => ({
      threadsBySpec: { ...s.threadsBySpec, [specPath]: { ...thread, open } },
    }));
  },

  clear(specPath) {
    set((s) => ({
      threadsBySpec: {
        ...s.threadsBySpec,
        [specPath]: {
          ...emptyThread(),
          open: s.threadsBySpec[specPath]?.open ?? false,
        },
      },
    }));
  },

  async sendAsk(args) {
    const { specPath, repoPath, specName, specRelPath, currentFileName, userMessage } = args;
    if (!userMessage.trim()) return;

    const userMsg: ChatMessage = {
      id: nextId(),
      role: "user",
      text: userMessage,
      status: "done",
      createdAt: Date.now(),
    };
    const assistantMsg: ChatMessage = {
      id: nextId(),
      role: "assistant",
      text: "",
      status: "pending",
      createdAt: Date.now(),
    };

    let historyForApi: { role: "user" | "assistant"; text: string }[] = [];
    set((s) => {
      const thread = s.threadsBySpec[specPath] ?? emptyThread();
      historyForApi = thread.messages
        .filter((m) => (m.role === "user" || m.role === "assistant") && m.status === "done")
        .slice(-MAX_HISTORY)
        .map((m) => ({ role: m.role as "user" | "assistant", text: m.text }));
      return {
        threadsBySpec: {
          ...s.threadsBySpec,
          [specPath]: {
            ...thread,
            sending: true,
            lastError: null,
            messages: [...thread.messages, userMsg, assistantMsg],
          },
        },
      };
    });

    try {
      const response = await sendOrThrow({
        type: "ai-chat:ask-spec",
        repoPath,
        specName,
        specRelPath,
        currentFileName,
        userMessage,
        history: historyForApi,
      });
      set((s) => {
        const thread = s.threadsBySpec[specPath];
        if (!thread) return s;
        return {
          threadsBySpec: {
            ...s.threadsBySpec,
            [specPath]: {
              ...thread,
              sending: false,
              messages: thread.messages.map((m) =>
                m.id === assistantMsg.id ? { ...m, text: response.text, status: "done" } : m,
              ),
            },
          },
        };
      });
    } catch (err) {
      const message = (err as Error).message;
      set((s) => {
        const thread = s.threadsBySpec[specPath];
        if (!thread) return s;
        return {
          threadsBySpec: {
            ...s.threadsBySpec,
            [specPath]: {
              ...thread,
              sending: false,
              lastError: message,
              messages: thread.messages.map((m) =>
                m.id === assistantMsg.id ? { ...m, text: message, status: "error" } : m,
              ),
            },
          },
        };
      });
    }
  },
}));
