import { z } from "zod";
import { AI_PROVIDERS } from "./aiTerminal";

/**
 * Schema version for the persisted ChatThreadRecord. Bump when a field is
 * renamed or removed. Cache wipe-on-bump (see CacheSchemaManager) handles
 * cross-version drift — threads are recoverable via provider-side history,
 * so the cache treatment is acceptable.
 */
export const CHAT_THREAD_SCHEMA_VERSION = 1;

export const ChatMessageSchema = z
  .object({
    id: z.string(),
    role: z.enum(["user", "assistant", "system"]),
    text: z.string(),
    thinking: z.string().optional(),
    status: z.enum(["pending", "done", "error"]),
    kind: z.enum(["plain", "applied-edit", "applied-document"]).optional(),
    createdAt: z.number().int().nonnegative(),
  })
  .strict();
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

const AIProviderSchema = z.enum(AI_PROVIDERS);

export const ChatThreadRecordSchema = z
  .object({
    /** Canonical UUID v4 — same value as AISpawnOptions.sessionId for the thread. */
    threadId: z.uuid(),
    /** Absolute path of the markdown file the chat is bound to. */
    filePath: z.string().min(1),
    provider: AIProviderSchema,
    /** Resume token captured from the provider; null until first stream:session event. */
    providerSessionId: z.string().nullable(),
    /** Synthesized from first user message (≤60 chars). null until first send. */
    title: z.string().nullable(),
    messages: z.array(ChatMessageSchema),
    createdAt: z.number().int().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
    /** Set by `ai-chat:archive-thread` / `ai-chat:start-new-thread`. */
    archivedAt: z.number().int().nonnegative().nullable(),
    schemaVersion: z.number().int().positive(),
  })
  .strict();
export type ChatThreadRecord = z.infer<typeof ChatThreadRecordSchema>;

/* ─── IPC variant schemas (additive to IpcRequestSchema in ipc.ts) ──── */

export const AiChatGetActiveThreadRequestSchema = z.object({
  type: z.literal("ai-chat:get-active-thread"),
  filePath: z.string().min(1),
  provider: AIProviderSchema,
});

export const AiChatListThreadsRequestSchema = z.object({
  type: z.literal("ai-chat:list-threads"),
  filePath: z.string().min(1),
  provider: AIProviderSchema.optional(),
});

export const AiChatStartNewThreadRequestSchema = z.object({
  type: z.literal("ai-chat:start-new-thread"),
  filePath: z.string().min(1),
  provider: AIProviderSchema,
  /** Optional UUID — if omitted, daemon generates one. Lets the UI pre-allocate. */
  sessionId: z.uuid().optional(),
});

export const AiChatArchiveThreadRequestSchema = z.object({
  type: z.literal("ai-chat:archive-thread"),
  threadId: z.uuid(),
});

/* ─── IPC result schemas ─────────────────────────────────────────────── */

export const AiChatGetActiveThreadResultSchema = z.object({
  type: z.literal("ai-chat:get-active-thread:result"),
  thread: ChatThreadRecordSchema.nullable(),
});

export const AiChatListThreadsResultSchema = z.object({
  type: z.literal("ai-chat:list-threads:result"),
  threads: z.array(ChatThreadRecordSchema),
});

export const AiChatStartNewThreadResultSchema = z.object({
  type: z.literal("ai-chat:start-new-thread:result"),
  thread: ChatThreadRecordSchema,
});

export const AiChatArchiveThreadResultSchema = z.object({
  type: z.literal("ai-chat:archive-thread:result"),
  ok: z.literal(true),
});

/** First 60 chars of the user message become the thread title. */
export const MAX_THREAD_TITLE_CHARS = 60;
