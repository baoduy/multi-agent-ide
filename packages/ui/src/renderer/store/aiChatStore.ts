import { create } from "zustand";
import { sendOrThrow } from "../services/ipcClient";

/**
 * A single chat turn. `pending` is transient UI state — renders a loading
 * bubble until the IPC response flips it to `done` or `error`.
 */
export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  status: "pending" | "done" | "error";
  /** Used for "✓ Applied" / "✓ Updated" confirmation bubbles. */
  kind?: "plain" | "applied-edit" | "applied-document";
  createdAt: number;
};

export type ChatMode = "ask" | "edit-selection" | "modify-document";

/**
 * Lightweight selection record mirrored from `EditorSelection` in the
 * NotionEditor. Stored in the chat thread so the panel can show the user
 * what they'll edit and re-use the same coords on Apply.
 */
export type CapturedSelection = {
  blockId: string;
  localStart: number;
  localEnd: number;
  text: string;
};

export type ChatThread = {
  open: boolean;
  mode: ChatMode;
  messages: ChatMessage[];
  pendingSelection: CapturedSelection | null;
  sending: boolean;
  lastError: string | null;
};

const MAX_HISTORY = 20;

function emptyThread(): ChatThread {
  return {
    open: false,
    mode: "ask",
    messages: [],
    pendingSelection: null,
    sending: false,
    lastError: null,
  };
}

function nextId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

type State = {
  threadsByFile: Record<string, ChatThread>;

  /** Open or close the panel for a file. */
  setOpen: (filePath: string, open: boolean) => void;
  /** Switch mode (Ask / Edit selection / Modify document). */
  setMode: (filePath: string, mode: ChatMode) => void;
  /** Update the captured selection chip shown above the input. */
  setPendingSelection: (filePath: string, selection: CapturedSelection | null) => void;
  /** Clear the thread's messages and error state. */
  clear: (filePath: string) => void;

  /** Send an "Ask" message — appends user + assistant bubbles. */
  sendAsk: (
    filePath: string,
    repoPath: string,
    text: string,
    documentText: string,
  ) => Promise<void>;

  /**
   * Request an edit-selection rewrite. Does NOT mutate the editor — returns
   * the replacement text to the caller so it can show a preview dialog.
   * Also records a user message + pending assistant bubble so the chat
   * reflects the exchange.
   */
  requestEditSelection: (
    filePath: string,
    repoPath: string,
    instruction: string,
    documentText: string,
    selection: CapturedSelection,
  ) => Promise<string | null>;

  /**
   * Request a whole-document modification. Returns the new full-document
   * text; caller applies it directly via the editor's `setMarkdown`.
   */
  requestModifyDocument: (
    filePath: string,
    repoPath: string,
    instruction: string,
    documentText: string,
  ) => Promise<string | null>;

  /** Append a system bubble (e.g. "✓ Applied edit") to the thread. */
  appendSystemMessage: (filePath: string, text: string, kind: ChatMessage["kind"]) => void;
};

/**
 * Per-file chat thread store for the AI chat bubble. Does not import other
 * stores; callers read `selectedRepoPath` / document text and pass them in.
 * History is in-memory only for v1 — a file-close clears the thread, and
 * app restart loses everything.
 */
export const useAiChatStore = create<State>((set, get) => ({
  threadsByFile: {},

  setOpen(filePath, open) {
    const thread = get().threadsByFile[filePath] ?? emptyThread();
    set((s) => ({
      threadsByFile: { ...s.threadsByFile, [filePath]: { ...thread, open } },
    }));
  },

  setMode(filePath, mode) {
    const thread = get().threadsByFile[filePath] ?? emptyThread();
    set((s) => ({
      threadsByFile: { ...s.threadsByFile, [filePath]: { ...thread, mode } },
    }));
  },

  setPendingSelection(filePath, selection) {
    const thread = get().threadsByFile[filePath] ?? emptyThread();
    set((s) => ({
      threadsByFile: {
        ...s.threadsByFile,
        [filePath]: { ...thread, pendingSelection: selection },
      },
    }));
  },

  clear(filePath) {
    set((s) => ({
      threadsByFile: {
        ...s.threadsByFile,
        [filePath]: { ...emptyThread(), open: s.threadsByFile[filePath]?.open ?? false },
      },
    }));
  },

  appendSystemMessage(filePath, text, kind) {
    const msg: ChatMessage = {
      id: nextId(),
      role: "system",
      text,
      status: "done",
      kind,
      createdAt: Date.now(),
    };
    set((s) => {
      const thread = s.threadsByFile[filePath] ?? emptyThread();
      return {
        threadsByFile: {
          ...s.threadsByFile,
          [filePath]: { ...thread, messages: [...thread.messages, msg] },
        },
      };
    });
  },

  async sendAsk(filePath, repoPath, text, documentText) {
    if (!text.trim()) return;
    const userMsg: ChatMessage = {
      id: nextId(),
      role: "user",
      text,
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
      const thread = s.threadsByFile[filePath] ?? emptyThread();
      historyForApi = thread.messages
        .filter((m) => (m.role === "user" || m.role === "assistant") && m.status === "done")
        .slice(-MAX_HISTORY)
        .map((m) => ({ role: m.role as "user" | "assistant", text: m.text }));
      return {
        threadsByFile: {
          ...s.threadsByFile,
          [filePath]: {
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
        type: "ai-chat:ask",
        repoPath,
        userMessage: text,
        history: historyForApi,
        documentText,
        selection: get().threadsByFile[filePath]?.pendingSelection
          ? {
              start: get().threadsByFile[filePath]!.pendingSelection!.localStart,
              end: get().threadsByFile[filePath]!.pendingSelection!.localEnd,
              text: get().threadsByFile[filePath]!.pendingSelection!.text,
            }
          : undefined,
      });
      set((s) => {
        const thread = s.threadsByFile[filePath];
        if (!thread) return s;
        return {
          threadsByFile: {
            ...s.threadsByFile,
            [filePath]: {
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
        const thread = s.threadsByFile[filePath];
        if (!thread) return s;
        return {
          threadsByFile: {
            ...s.threadsByFile,
            [filePath]: {
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

  async requestEditSelection(filePath, repoPath, instruction, documentText, selection) {
    const userMsg: ChatMessage = {
      id: nextId(),
      role: "user",
      text: instruction,
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
    set((s) => {
      const thread = s.threadsByFile[filePath] ?? emptyThread();
      return {
        threadsByFile: {
          ...s.threadsByFile,
          [filePath]: {
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
        type: "ai-chat:edit-selection",
        repoPath,
        instruction,
        documentText,
        selection: {
          start: selection.localStart,
          end: selection.localEnd,
          text: selection.text,
        },
      });
      set((s) => {
        const thread = s.threadsByFile[filePath];
        if (!thread) return s;
        return {
          threadsByFile: {
            ...s.threadsByFile,
            [filePath]: {
              ...thread,
              sending: false,
              messages: thread.messages.map((m) =>
                m.id === assistantMsg.id
                  ? { ...m, text: "Proposed replacement ready — review before applying.", status: "done" }
                  : m,
              ),
            },
          },
        };
      });
      return response.newText;
    } catch (err) {
      const message = (err as Error).message;
      set((s) => {
        const thread = s.threadsByFile[filePath];
        if (!thread) return s;
        return {
          threadsByFile: {
            ...s.threadsByFile,
            [filePath]: {
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
      return null;
    }
  },

  async requestModifyDocument(filePath, repoPath, instruction, documentText) {
    const userMsg: ChatMessage = {
      id: nextId(),
      role: "user",
      text: instruction,
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
    set((s) => {
      const thread = s.threadsByFile[filePath] ?? emptyThread();
      return {
        threadsByFile: {
          ...s.threadsByFile,
          [filePath]: {
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
        type: "ai-chat:modify-document",
        repoPath,
        instruction,
        documentText,
      });
      set((s) => {
        const thread = s.threadsByFile[filePath];
        if (!thread) return s;
        return {
          threadsByFile: {
            ...s.threadsByFile,
            [filePath]: {
              ...thread,
              sending: false,
              messages: thread.messages.map((m) =>
                m.id === assistantMsg.id ? { ...m, text: "✓ Document updated.", status: "done", kind: "applied-document" } : m,
              ),
            },
          },
        };
      });
      return response.newDocumentText;
    } catch (err) {
      const message = (err as Error).message;
      set((s) => {
        const thread = s.threadsByFile[filePath];
        if (!thread) return s;
        return {
          threadsByFile: {
            ...s.threadsByFile,
            [filePath]: {
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
      return null;
    }
  },
}));

/**
 * Convenience selector — returns the thread for a file, or a default empty
 * thread if none exists yet. Keeps components from having to guard on null.
 */
export function selectThread(filePath: string): (state: State) => ChatThread {
  return (s) => s.threadsByFile[filePath] ?? emptyThread();
}
