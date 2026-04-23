import { create } from "zustand";
import { sendOrThrow } from "../services/ipcClient";
import { ipc } from "../utils/ipc";
import type { ChatMessage } from "./aiChatStore";

/**
 * Per-spec chat thread used by the spec-folder review bubble. Visually
 * mirrors `aiChatStore` (reusing `ChatMessage`) but collapsed to one mode:
 * Ask-only. Streams tokens live and persists the Claude `session_id` per
 * spec so follow-up questions skip the agent's file-rediscovery tax.
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
  sessionId: string | null;
  pendingStreamId: string | null;
  pendingAssistantId: string | null;
};

function emptyThread(): SpecChatThread {
  return {
    open: false,
    messages: [],
    sending: false,
    lastError: null,
    sessionId: null,
    pendingStreamId: null,
    pendingAssistantId: null,
  };
}

function nextId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function newStreamId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `stream-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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

    const streamId = newStreamId();
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
    let resumeSessionId: string | undefined;
    set((s) => {
      const thread = s.threadsBySpec[specPath] ?? emptyThread();
      historyForApi = thread.messages
        .filter((m) => (m.role === "user" || m.role === "assistant") && m.status === "done")
        .slice(-MAX_HISTORY)
        .map((m) => ({ role: m.role as "user" | "assistant", text: m.text }));
      resumeSessionId = thread.sessionId ?? undefined;
      return {
        threadsBySpec: {
          ...s.threadsBySpec,
          [specPath]: {
            ...thread,
            sending: true,
            lastError: null,
            messages: [...thread.messages, userMsg, assistantMsg],
            pendingStreamId: streamId,
            pendingAssistantId: assistantMsg.id,
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
        streamId,
        resumeSessionId,
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
              pendingStreamId: null,
              pendingAssistantId: null,
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
              pendingStreamId: null,
              pendingAssistantId: null,
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

/* ─── Streaming subscriptions ────────────────────────────────────────── */

/**
 * Subscribe once to the shared AI-chat streaming events. Each event carries
 * a `streamId`; we match it against every thread's `pendingStreamId`.
 * Events whose streamId doesn't match any thread (e.g. belonging to a
 * file-chat turn handled by `aiChatStore`) are silently ignored — both
 * stores subscribe, each routes its own.
 */
ipc.on("ai-chat:stream:delta", (event) => {
  const { streamId, delta } = event;
  useAiSpecChatStore.setState((s) => {
    const entry = Object.entries(s.threadsBySpec).find(
      ([, t]) => t.pendingStreamId === streamId,
    );
    if (!entry) return s;
    const [specPath, thread] = entry;
    const assistantId = thread.pendingAssistantId;
    if (!assistantId) return s;
    return {
      threadsBySpec: {
        ...s.threadsBySpec,
        [specPath]: {
          ...thread,
          messages: thread.messages.map((m) =>
            m.id === assistantId ? { ...m, text: m.text + delta } : m,
          ),
        },
      },
    };
  });
});

ipc.on("ai-chat:stream:session", (event) => {
  const { streamId, sessionId } = event;
  useAiSpecChatStore.setState((s) => {
    const entry = Object.entries(s.threadsBySpec).find(
      ([, t]) => t.pendingStreamId === streamId,
    );
    if (!entry) return s;
    const [specPath, thread] = entry;
    return {
      threadsBySpec: {
        ...s.threadsBySpec,
        [specPath]: { ...thread, sessionId },
      },
    };
  });
});
