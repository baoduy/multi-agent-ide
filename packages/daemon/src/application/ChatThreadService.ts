import { randomUUID } from "node:crypto";
import type { ChatThreadRepository } from "../data/ChatThreadRepository";
import type { AIProvider } from "@magenta/shared/aiTerminal";
import {
  CHAT_THREAD_SCHEMA_VERSION,
  MAX_THREAD_TITLE_CHARS,
  type ChatMessage,
  type ChatThreadRecord,
} from "@magenta/shared/chatThread";

export interface PersistTurnInput {
  userMessage: string;
  assistantText: string;
  providerSessionId?: string;
}

export interface ChatThreadServiceOptions {
  /** Injectable for tests. */
  now?: () => number;
  uuid?: () => string;
}

/**
 * Application service for resumable chat threads.
 *
 * Wraps `ChatThreadRepository` with:
 *   1. Resolve-or-create on file open / provider switch.
 *   2. Atomic archive + new-thread on the "New session" menu action.
 *   3. Append-turn on every successful chat send.
 *
 * Title synthesis: the first user message's first 60 chars become the title;
 * subsequent turns must not overwrite it. The `assistantText` is persisted as
 * a "done" message — transient streaming state stays in the renderer.
 */
export class ChatThreadService {
  private readonly now: () => number;
  private readonly uuid: () => string;
  /** Tracks in-flight per-thread cancel callbacks. */
  private readonly inFlight = new Map<string, () => void>();

  constructor(
    private readonly repo: ChatThreadRepository,
    opts: ChatThreadServiceOptions = {},
  ) {
    this.now = opts.now ?? (() => Date.now());
    this.uuid = opts.uuid ?? (() => randomUUID());
  }

  resolveOrCreate(filePath: string, provider: AIProvider): ChatThreadRecord {
    const existing = this.repo.getActive(filePath, provider);
    if (existing) return existing;
    return this.createFresh(filePath, provider);
  }

  archiveAndStartNew(filePath: string, provider: AIProvider): ChatThreadRecord {
    const active = this.repo.getActive(filePath, provider);
    if (active) {
      const cancel = this.inFlight.get(active.threadId);
      if (cancel) {
        cancel();
        this.inFlight.delete(active.threadId);
      }
      this.repo.archive(active.threadId, this.now());
    }
    return this.createFresh(filePath, provider);
  }

  archive(threadId: string): void {
    const cancel = this.inFlight.get(threadId);
    if (cancel) {
      cancel();
      this.inFlight.delete(threadId);
    }
    this.repo.archive(threadId, this.now());
  }

  listForFile(filePath: string, provider?: AIProvider): ChatThreadRecord[] {
    return this.repo.listForFile(filePath, provider);
  }

  getActive(filePath: string, provider: AIProvider): ChatThreadRecord | null {
    return this.repo.getActive(filePath, provider);
  }

  /**
   * Append (user, assistant) to the thread row. Called by
   * AiEditApplicationService at the end of a successful chat call. If
   * `threadId` is unknown, this is a silent no-op.
   */
  persistTurn(threadId: string, input: PersistTurnInput): void {
    const existing = this.repo.getById(threadId);
    if (!existing) return;

    const ts = this.now();
    const userMsg: ChatMessage = {
      id: `msg-${ts}-u`,
      role: "user",
      text: input.userMessage,
      status: "done",
      createdAt: ts,
    };
    const assistantMsg: ChatMessage = {
      id: `msg-${ts}-a`,
      role: "assistant",
      text: input.assistantText,
      status: "done",
      createdAt: ts,
    };

    const updated: ChatThreadRecord = {
      ...existing,
      title: existing.title ?? input.userMessage.slice(0, MAX_THREAD_TITLE_CHARS),
      messages: [...existing.messages, userMsg, assistantMsg],
      providerSessionId: input.providerSessionId ?? existing.providerSessionId,
      updatedAt: ts,
    };
    this.repo.upsert(updated);
  }

  registerInFlight(threadId: string, cancel: () => void): void {
    this.inFlight.set(threadId, cancel);
  }

  clearInFlight(threadId: string): void {
    this.inFlight.delete(threadId);
  }

  private createFresh(filePath: string, provider: AIProvider): ChatThreadRecord {
    const ts = this.now();
    const record: ChatThreadRecord = {
      threadId: this.uuid(),
      filePath,
      provider,
      providerSessionId: null,
      title: null,
      messages: [],
      createdAt: ts,
      updatedAt: ts,
      archivedAt: null,
      schemaVersion: CHAT_THREAD_SCHEMA_VERSION,
    };
    this.repo.upsert(record);
    this.repo.setActive(filePath, provider, record.threadId);
    return record;
  }
}
