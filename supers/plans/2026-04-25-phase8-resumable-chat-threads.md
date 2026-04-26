# Phase 8 — Resumable Chat Bubble Threads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the AI Chat Bubble's per-file conversation across Electron restarts and provider switches. Open `notes.md`, send "summarize this", quit, reopen — the panel rehydrates the prior turns within 200 ms (LMDB read) and the next message resumes the same provider session via Phase 5's `--resume` semantics. Replace the header **Clear conversation** menu item with **New session**, which atomically archives the active thread and starts a blank one.

**Architecture:**

```
Renderer
  aiChatStore.openThreadForFile(filePath, provider)        ◀─ auto-called on file open / provider switch
  aiChatStore.archiveActiveAndStartNew(filePath, provider) ◀─ "New session" menu
  aiChatStore.listThreadsForFile(filePath)                 ◀─ data layer for future picker
       │ sendOrThrow
       ▼
IPC (Phase 8 additions to discriminated union)
  ai-chat:get-active-thread   { filePath, provider }              → ChatThreadRecord | null
  ai-chat:list-threads        { filePath, provider? }             → ChatThreadRecord[]
  ai-chat:start-new-thread    { filePath, provider, sessionId? }  → ChatThreadRecord
  ai-chat:archive-thread      { threadId }                        → { ok: true }
       │ safeHandle
       ▼
Application: ChatThreadService            (orchestration)
       │
       ▼
Data: ChatThreadRepository                (LMDB CRUD + active pointer)
       │
       ▼
LMDB sub-db: chat_threads
   row:${filePath}::${provider}::${threadId}  → ChatThreadRecord
   active:${filePath}::${provider}            → threadId        (active pointer)
```

`AiEditApplicationService` (already migrated to `AIRunOnceApplicationService` in Phase 2) gains a single new dependency — `ChatThreadService` — and on every successful `ask` / `editSelection` / `modifyDocument` it calls `chatThreadService.persistTurn(threadId, userMessage, assistantText)`. The renderer never writes thread rows directly.

**Tech Stack:** TypeScript 5.x · Zod 3.x · LMDB (existing `LmdbStore` / `DatabaseService`) · Vitest · Zustand · React 19 · pnpm workspace.

**Spec references:** `supers/specs/2026-04-25-chat-bubble-unification.md` §4.2 (persistence model), §4.3 (auto-resume flow), §4.4 (new-session flow), §5 (IPC contract changes), §6 (UI changes), §7 FR-1 … FR-8, §8 NFR-1 … NFR-4, §9 AC-1 … AC-6.

**Out of scope for this phase:**
- Thread-picker UI for archived threads (data layer supports it; spec §3 NG-2).
- `ai-chat:ask-spec` thread persistence — stays stateless (spec §3 NG-3).
- Cross-device sync (spec §3 NG-4).
- Token / cost persistence onto thread rows — Phase 7 owns cost on `ai_sessions`; thread-level rollup is a follow-up (spec §8 NFR-4 deferred).
- Replacing `ai-chat:*` with `ai:run-once` directly — IPC names stay (spec §3 NG-1).

**Dependencies on prior phases (must land first):**
- **Phase 1** — `AISpawnOptions` schema in `packages/shared/src/aiSpawnOptions.ts`. Phase 8 quotes `Partial<AISpawnOptions>` in the new `spawn?` field but does not redefine it.
- **Phase 2** — `AIRunOnceApplicationService` exists; `AiEditApplicationService.ask` / `editSelection` / `modifyDocument` route through it instead of `AiCliGateway.run()`. Phase 8's persistence call lives at the bottom of those three methods, after the engine returns.
- **Phase 5** — `ai-chat:ask` / `ai-chat:edit-selection` / `ai-chat:modify-document` IPC schemas already gained `sessionId?: UUID` and `spawn?: Partial<AISpawnOptions>` fields, and `sessionIdResolver` translates `sessionId` → provider-specific resume token. Phase 8 sets `sessionId = thread.threadId` on every send; Phase 5 owns the resume mechanics.

---

## File structure

| Action | Path | Responsibility |
|---|---|---|
| Create | `packages/shared/src/chatThread.ts` | `ChatThreadRecordSchema`, `ChatMessageSchema` (mirrors renderer `ChatMessage`), Zod-derived types, IPC variant schemas (`AiChatGetActiveThreadRequestSchema` etc.). |
| Create | `packages/shared/src/chatThread.test.ts` | Round-trip + `.strict()` rejection + threadId/UUID format tests. |
| Modify | `packages/shared/src/ipc.ts` | Extend `IpcRequestSchema` discriminated union with 4 new variants; extend `IpcResponseSchema` with their result variants. |
| Create | `packages/daemon/src/data/ChatThreadRepository.ts` | LMDB CRUD: `getById`, `getActive`, `setActive`, `upsert`, `archive`, `listForFile`. Uses sub-db `chat_threads` via `DatabaseService.getDb()`. |
| Create | `packages/daemon/src/data/ChatThreadRepository.test.ts` | Real LMDB (in-memory tmp dir) round-trip + active-pointer + archive + prefix scan. |
| Create | `packages/daemon/src/application/ChatThreadService.ts` | Orchestration: `resolveOrCreate`, `archiveAndStartNew`, `listForFile`, `persistTurn`, `cancelInFlight`. |
| Create | `packages/daemon/src/application/ChatThreadService.test.ts` | Mock repository; verify resolveOrCreate / archive transitions / title synthesis. |
| Create | `packages/daemon/src/ipc/handlers/chatThreadHandlers.ts` | 4 thin `safeHandle()` adapters. |
| Modify | `packages/daemon/src/ipc/registerHandlers.ts` | Wire `chatThreadService` into the context type and registration list. |
| Modify | `packages/daemon/src/DaemonContainer.ts` | Instantiate `ChatThreadRepository` + `ChatThreadService`; expose as `readonly` and pass into `AiEditApplicationService` constructor + `registerAllHandlers`. |
| Modify | `packages/daemon/src/application/AiEditApplicationService.ts` | New constructor arg `chatThreadService`; on each successful chat call, persist turn. New optional `sessionId?: string` on `AskArgs` / `EditSelectionArgs` / `ModifyDocumentArgs` so the persistence write knows which thread to attach to. |
| Modify | `packages/daemon/src/ipc/handlers/aiEditHandlers.ts` | Forward `msg.sessionId` and `msg.spawn` (already accepted post-Phase 5) to `AiEditApplicationService` calls; no other changes. |
| Modify | `packages/ui/src/renderer/services/ipcClient.ts` | 4 new entries in `ResponseForRequest` map. |
| Modify | `packages/ui/src/renderer/store/aiChatStore.ts` | Add `openThreadForFile`, `archiveActiveAndStartNew`, `listThreadsForFile`; thread now carries `threadId`; `sendAsk` passes `sessionId = thread.threadId`; `setProvider` / `openWithProvider` re-resolve threads instead of resetting. |
| Modify | `packages/ui/src/renderer/store/aiChatStore.test.ts` (create if absent) | Mock `sendOrThrow`; verify auto-resume flow and archive-and-start-new flow. |
| Modify | `packages/ui/src/renderer/components/main/aiChat/ChatPanel.tsx` | Replace **Clear conversation** menu item with **New session**; mount-effect calls `openThreadForFile(filePath, thread.provider)`. |

---

## Task 1: Define `ChatThreadRecord` schema in shared

**Files:**
- Create: `packages/shared/src/chatThread.ts`
- Create: `packages/shared/src/chatThread.test.ts`

- [ ] **Step 1: Write the failing schema test**

```ts
// packages/shared/src/chatThread.test.ts
import { describe, it, expect } from "vitest";
import {
  ChatMessageSchema,
  ChatThreadRecordSchema,
  AiChatGetActiveThreadRequestSchema,
  AiChatStartNewThreadRequestSchema,
  AiChatArchiveThreadRequestSchema,
  AiChatListThreadsRequestSchema,
  CHAT_THREAD_SCHEMA_VERSION,
} from "./chatThread";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

describe("ChatThreadRecord", () => {
  it("exports a schema version constant >= 1", () => {
    expect(typeof CHAT_THREAD_SCHEMA_VERSION).toBe("number");
    expect(CHAT_THREAD_SCHEMA_VERSION).toBeGreaterThanOrEqual(1);
  });

  it("accepts a fully populated record", () => {
    const record = {
      threadId: VALID_UUID,
      filePath: "/tmp/notes.md",
      provider: "claude" as const,
      providerSessionId: "abc-123",
      title: "summarize this document",
      messages: [
        {
          id: "msg-1",
          role: "user" as const,
          text: "summarize this",
          status: "done" as const,
          createdAt: 1714000000000,
        },
      ],
      createdAt: 1714000000000,
      updatedAt: 1714000000001,
      archivedAt: null,
      schemaVersion: CHAT_THREAD_SCHEMA_VERSION,
    };
    expect(ChatThreadRecordSchema.parse(record)).toEqual(record);
  });

  it("rejects non-uuid threadId", () => {
    expect(() =>
      ChatThreadRecordSchema.parse({
        threadId: "not-a-uuid",
        filePath: "/x.md",
        provider: "claude",
        providerSessionId: null,
        title: null,
        messages: [],
        createdAt: 0,
        updatedAt: 0,
        archivedAt: null,
        schemaVersion: 1,
      }),
    ).toThrow();
  });

  it("rejects unknown keys (.strict)", () => {
    expect(() =>
      ChatThreadRecordSchema.parse({
        threadId: VALID_UUID,
        filePath: "/x.md",
        provider: "claude",
        providerSessionId: null,
        title: null,
        messages: [],
        createdAt: 0,
        updatedAt: 0,
        archivedAt: null,
        schemaVersion: 1,
        bogus: true,
      } as unknown),
    ).toThrow();
  });

  it("ChatMessageSchema mirrors the renderer ChatMessage shape", () => {
    expect(
      ChatMessageSchema.parse({
        id: "x",
        role: "assistant",
        text: "hi",
        thinking: "...",
        status: "done",
        kind: "plain",
        createdAt: 1,
      }),
    ).toBeTruthy();
  });

  it("validates IPC variant schemas", () => {
    expect(
      AiChatGetActiveThreadRequestSchema.parse({
        type: "ai-chat:get-active-thread",
        filePath: "/x.md",
        provider: "claude",
      }),
    ).toBeTruthy();

    expect(
      AiChatStartNewThreadRequestSchema.parse({
        type: "ai-chat:start-new-thread",
        filePath: "/x.md",
        provider: "claude",
        sessionId: VALID_UUID,
      }),
    ).toBeTruthy();

    expect(
      AiChatArchiveThreadRequestSchema.parse({
        type: "ai-chat:archive-thread",
        threadId: VALID_UUID,
      }),
    ).toBeTruthy();

    expect(
      AiChatListThreadsRequestSchema.parse({
        type: "ai-chat:list-threads",
        filePath: "/x.md",
      }),
    ).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `pnpm --filter @magenta/shared test chatThread`
Expected: FAIL — module `./chatThread` not found.

- [ ] **Step 3: Write the schema**

```ts
// packages/shared/src/chatThread.ts
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
    threadId: z.string().uuid(),
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
  sessionId: z.string().uuid().optional(),
});

export const AiChatArchiveThreadRequestSchema = z.object({
  type: z.literal("ai-chat:archive-thread"),
  threadId: z.string().uuid(),
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
```

- [ ] **Step 4: Run test and verify it passes**

Run: `pnpm --filter @magenta/shared test chatThread`
Expected: PASS — all 6 cases green.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/chatThread.ts packages/shared/src/chatThread.test.ts
git commit -m "feat(shared): add ChatThreadRecord schema and resumable-thread IPC variants"
```

---

## Task 2: Wire new IPC variants into the discriminated unions

**Files:**
- Modify: `packages/shared/src/ipc.ts`

- [ ] **Step 1: Write the failing union test**

Append to `packages/shared/src/chatThread.test.ts`:

```ts
import { IpcRequestSchema, IpcResponseSchema } from "./ipc";

describe("IpcRequestSchema integration", () => {
  it("accepts ai-chat:get-active-thread", () => {
    expect(
      IpcRequestSchema.parse({
        type: "ai-chat:get-active-thread",
        filePath: "/x.md",
        provider: "claude",
      }),
    ).toBeTruthy();
  });

  it("accepts ai-chat:archive-thread:result", () => {
    expect(
      IpcResponseSchema.parse({
        type: "ai-chat:archive-thread:result",
        ok: true,
      }),
    ).toBeTruthy();
  });
});
```

Run: `pnpm --filter @magenta/shared test chatThread`
Expected: FAIL — `IpcRequestSchema` doesn't include the new variant.

- [ ] **Step 2: Add the variants to `ipc.ts`**

In `packages/shared/src/ipc.ts`, find the existing `ai-chat:ask-spec` block (around line 359) and append after it inside `IpcRequestSchema`:

```ts
import {
  AiChatGetActiveThreadRequestSchema,
  AiChatListThreadsRequestSchema,
  AiChatStartNewThreadRequestSchema,
  AiChatArchiveThreadRequestSchema,
  AiChatGetActiveThreadResultSchema,
  AiChatListThreadsResultSchema,
  AiChatStartNewThreadResultSchema,
  AiChatArchiveThreadResultSchema,
} from "./chatThread";

// (inside IpcRequestSchema z.discriminatedUnion("type", [ ... ]))
  AiChatGetActiveThreadRequestSchema,
  AiChatListThreadsRequestSchema,
  AiChatStartNewThreadRequestSchema,
  AiChatArchiveThreadRequestSchema,

// (inside IpcResponseSchema, alongside the existing ai-chat:*:result entries near line 752)
  AiChatGetActiveThreadResultSchema,
  AiChatListThreadsResultSchema,
  AiChatStartNewThreadResultSchema,
  AiChatArchiveThreadResultSchema,
```

- [ ] **Step 3: Run test and verify it passes**

Run: `pnpm --filter @magenta/shared test chatThread`
Expected: PASS.

Run: `pnpm -w typecheck`
Expected: PASS for all 5 packages — no consumer of `IpcRequest`/`IpcResponse` breaks because the new variants are additive.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/ipc.ts packages/shared/src/chatThread.test.ts
git commit -m "feat(shared): extend IPC discriminated unions with chat-thread variants"
```

---

## Task 3: `ChatThreadRepository` (LMDB CRUD + active pointer)

**Files:**
- Create: `packages/daemon/src/data/ChatThreadRepository.ts`
- Create: `packages/daemon/src/data/ChatThreadRepository.test.ts`

- [ ] **Step 1: Write the failing repository test**

```ts
// packages/daemon/src/data/ChatThreadRepository.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LmdbStore } from "../db/LmdbStore";
import { ChatThreadRepository } from "./ChatThreadRepository";
import type { ChatThreadRecord } from "@magenta/shared/chatThread";
import { CHAT_THREAD_SCHEMA_VERSION } from "@magenta/shared/chatThread";

let tmp: string;
let store: LmdbStore;
let repo: ChatThreadRepository;

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

function makeRecord(over: Partial<ChatThreadRecord> = {}): ChatThreadRecord {
  return {
    threadId: UUID_A,
    filePath: "/tmp/notes.md",
    provider: "claude",
    providerSessionId: null,
    title: null,
    messages: [],
    createdAt: 1,
    updatedAt: 1,
    archivedAt: null,
    schemaVersion: CHAT_THREAD_SCHEMA_VERSION,
    ...over,
  };
}

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "chatthread-"));
  store = LmdbStore.open(tmp);
  repo = new ChatThreadRepository(store);
});

afterEach(async () => {
  await store.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("ChatThreadRepository", () => {
  it("upsert + getById round-trip", () => {
    const r = makeRecord({ title: "hello" });
    repo.upsert(r);
    expect(repo.getById(r.threadId)).toEqual(r);
  });

  it("setActive + getActive returns the row", () => {
    const r = makeRecord();
    repo.upsert(r);
    repo.setActive(r.filePath, r.provider, r.threadId);
    expect(repo.getActive(r.filePath, r.provider)).toEqual(r);
  });

  it("getActive returns null when no pointer", () => {
    expect(repo.getActive("/missing.md", "claude")).toBeNull();
  });

  it("getActive returns null when pointer dangles", () => {
    repo.setActive("/x.md", "claude", UUID_A);
    expect(repo.getActive("/x.md", "claude")).toBeNull();
  });

  it("listForFile filters by filePath, sorted by updatedAt desc", () => {
    repo.upsert(makeRecord({ threadId: UUID_A, updatedAt: 100 }));
    repo.upsert(makeRecord({ threadId: UUID_B, updatedAt: 200 }));
    repo.upsert(
      makeRecord({
        threadId: "33333333-3333-4333-8333-333333333333",
        filePath: "/other.md",
      }),
    );
    const list = repo.listForFile("/tmp/notes.md");
    expect(list.map((t) => t.threadId)).toEqual([UUID_B, UUID_A]);
  });

  it("listForFile filters by provider when given", () => {
    repo.upsert(makeRecord({ threadId: UUID_A, provider: "claude" }));
    repo.upsert(makeRecord({ threadId: UUID_B, provider: "copilot" }));
    expect(repo.listForFile("/tmp/notes.md", "copilot")).toHaveLength(1);
  });

  it("archive marks archivedAt and clears the active pointer if it pointed to this thread", () => {
    const r = makeRecord();
    repo.upsert(r);
    repo.setActive(r.filePath, r.provider, r.threadId);
    repo.archive(r.threadId, 999);
    const after = repo.getById(r.threadId);
    expect(after?.archivedAt).toBe(999);
    expect(repo.getActive(r.filePath, r.provider)).toBeNull();
  });

  it("archive does NOT clear the active pointer when it points elsewhere", () => {
    repo.upsert(makeRecord({ threadId: UUID_A }));
    repo.upsert(makeRecord({ threadId: UUID_B }));
    repo.setActive("/tmp/notes.md", "claude", UUID_B);
    repo.archive(UUID_A, 999);
    expect(repo.getActive("/tmp/notes.md", "claude")?.threadId).toBe(UUID_B);
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `pnpm --filter @magenta/daemon test ChatThreadRepository`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the repository**

```ts
// packages/daemon/src/data/ChatThreadRepository.ts
import type { LmdbDatabase, LmdbStore } from "../db/LmdbStore";
import type { AIProvider } from "@magenta/shared/aiTerminal";
import type { ChatThreadRecord } from "@magenta/shared/chatThread";

/**
 * LMDB-backed repository for `chat_threads`.
 *
 * Layout (single sub-db so iteration is one prefix scan):
 *   row:${filePath}::${provider}::${threadId}  → ChatThreadRecord
 *   active:${filePath}::${provider}            → threadId        (active pointer)
 *   id:${threadId}                             → row-key         (secondary index for O(1) getById/archive)
 *
 * `id:` keys sort after `active:` and `row:` because 'i' < 'r' but > 'a';
 * the explicit prefix scans below use bounded ranges so iteration never
 * crosses sections.
 */
export class ChatThreadRepository {
  private readonly db: LmdbDatabase<unknown>;

  constructor(private readonly store: LmdbStore) {
    this.db = store.openDb<unknown>("chat_threads");
  }

  private rowKey(filePath: string, provider: AIProvider, threadId: string): string {
    return `row:${filePath}::${provider}::${threadId}`;
  }

  private activeKey(filePath: string, provider: AIProvider): string {
    return `active:${filePath}::${provider}`;
  }

  private idKey(threadId: string): string {
    return `id:${threadId}`;
  }

  getById(threadId: string): ChatThreadRecord | null {
    const rowKey = this.db.get(this.idKey(threadId)) as string | undefined;
    if (!rowKey) return null;
    return (this.db.get(rowKey) as ChatThreadRecord | undefined) ?? null;
  }

  getActive(filePath: string, provider: AIProvider): ChatThreadRecord | null {
    const threadId = this.db.get(this.activeKey(filePath, provider)) as string | undefined;
    if (!threadId) return null;
    return this.getById(threadId);
  }

  setActive(filePath: string, provider: AIProvider, threadId: string): void {
    this.store.transactionSync(() => {
      this.db.putSync(this.activeKey(filePath, provider), threadId);
    });
  }

  upsert(record: ChatThreadRecord): void {
    const rowKey = this.rowKey(record.filePath, record.provider, record.threadId);
    this.store.transactionSync(() => {
      this.db.putSync(rowKey, record);
      this.db.putSync(this.idKey(record.threadId), rowKey);
    });
  }

  /**
   * Mark a thread archived. If the active pointer for its (filePath, provider)
   * still points at it, the pointer is cleared so the next `get-active-thread`
   * call returns null and the renderer creates a fresh one.
   */
  archive(threadId: string, archivedAt: number): void {
    const existing = this.getById(threadId);
    if (!existing) return;
    const updated: ChatThreadRecord = { ...existing, archivedAt, updatedAt: archivedAt };
    const rowKey = this.rowKey(existing.filePath, existing.provider, existing.threadId);
    const activeKey = this.activeKey(existing.filePath, existing.provider);

    this.store.transactionSync(() => {
      this.db.putSync(rowKey, updated);
      const currentActive = this.db.get(activeKey) as string | undefined;
      if (currentActive === threadId) {
        this.db.removeSync(activeKey);
      }
    });
  }

  /**
   * List every thread (active + archived) for a file, optionally narrowed by
   * provider. Sorted by `updatedAt` descending so the freshest appears first
   * — useful for a future picker UI.
   */
  listForFile(filePath: string, provider?: AIProvider): ChatThreadRecord[] {
    const prefix = provider
      ? `row:${filePath}::${provider}::`
      : `row:${filePath}::`;
    const out: ChatThreadRecord[] = [];
    for (const entry of this.db.range({ prefix })) {
      out.push(entry.value as ChatThreadRecord);
    }
    out.sort((a, b) => b.updatedAt - a.updatedAt);
    return out;
  }
}
```

- [ ] **Step 4: Run test and verify it passes**

Run: `pnpm --filter @magenta/daemon test ChatThreadRepository`
Expected: PASS — all 7 cases green.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/data/ChatThreadRepository.ts packages/daemon/src/data/ChatThreadRepository.test.ts
git commit -m "feat(daemon): add LMDB ChatThreadRepository with active-pointer index"
```

---

## Task 4: `ChatThreadService` (orchestration layer)

**Files:**
- Create: `packages/daemon/src/application/ChatThreadService.ts`
- Create: `packages/daemon/src/application/ChatThreadService.test.ts`

- [ ] **Step 1: Write the failing service test**

```ts
// packages/daemon/src/application/ChatThreadService.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChatThreadService } from "./ChatThreadService";
import type { ChatThreadRepository } from "../data/ChatThreadRepository";
import type { ChatThreadRecord } from "@magenta/shared/chatThread";
import { CHAT_THREAD_SCHEMA_VERSION } from "@magenta/shared/chatThread";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

function fakeRepo(): ChatThreadRepository {
  const rows = new Map<string, ChatThreadRecord>();
  const active = new Map<string, string>();
  return {
    getById: vi.fn((id: string) => rows.get(id) ?? null),
    getActive: vi.fn((fp: string, p: string) => {
      const id = active.get(`${fp}::${p}`);
      return id ? rows.get(id) ?? null : null;
    }),
    setActive: vi.fn((fp: string, p: string, id: string) => {
      active.set(`${fp}::${p}`, id);
    }),
    upsert: vi.fn((r: ChatThreadRecord) => rows.set(r.threadId, r)),
    archive: vi.fn((id: string, ts: number) => {
      const r = rows.get(id);
      if (!r) return;
      rows.set(id, { ...r, archivedAt: ts, updatedAt: ts });
      for (const [k, v] of active) if (v === id) active.delete(k);
    }),
    listForFile: vi.fn((fp: string) =>
      [...rows.values()].filter((r) => r.filePath === fp).sort((a, b) => b.updatedAt - a.updatedAt),
    ),
  } as unknown as ChatThreadRepository;
}

let repo: ChatThreadRepository;
let svc: ChatThreadService;

beforeEach(() => {
  repo = fakeRepo();
  svc = new ChatThreadService(repo, { now: () => 1000, uuid: () => UUID_A });
});

describe("ChatThreadService.resolveOrCreate", () => {
  it("returns the active thread when one exists", () => {
    const seed: ChatThreadRecord = {
      threadId: UUID_B,
      filePath: "/x.md",
      provider: "claude",
      providerSessionId: null,
      title: null,
      messages: [],
      createdAt: 1,
      updatedAt: 1,
      archivedAt: null,
      schemaVersion: CHAT_THREAD_SCHEMA_VERSION,
    };
    repo.upsert(seed);
    repo.setActive("/x.md", "claude", UUID_B);
    expect(svc.resolveOrCreate("/x.md", "claude").threadId).toBe(UUID_B);
  });

  it("creates a fresh thread when none active", () => {
    const r = svc.resolveOrCreate("/x.md", "claude");
    expect(r.threadId).toBe(UUID_A);
    expect(r.archivedAt).toBeNull();
    expect(r.messages).toEqual([]);
    expect(repo.upsert).toHaveBeenCalledTimes(1);
    expect(repo.setActive).toHaveBeenCalledWith("/x.md", "claude", UUID_A);
  });
});

describe("ChatThreadService.archiveAndStartNew", () => {
  it("archives the active thread and creates a new one", () => {
    const old = svc.resolveOrCreate("/x.md", "claude");
    const fresh = svc.archiveAndStartNew("/x.md", "claude");
    expect(fresh.threadId).not.toBe(old.threadId);
    expect(repo.archive).toHaveBeenCalledWith(old.threadId, 1000);
  });

  it("creates a new thread even when no prior active exists", () => {
    const fresh = svc.archiveAndStartNew("/y.md", "claude");
    expect(fresh.threadId).toBe(UUID_A);
    expect(repo.archive).not.toHaveBeenCalled();
  });
});

describe("ChatThreadService.persistTurn", () => {
  it("appends user + assistant messages and synthesizes title from first user msg", () => {
    const t = svc.resolveOrCreate("/x.md", "claude");
    svc.persistTurn(t.threadId, {
      userMessage: "Summarize this very long document please continue past the cap easily",
      assistantText: "Here you go.",
      providerSessionId: "prov-1",
    });
    const after = repo.getById(t.threadId)!;
    expect(after.messages).toHaveLength(2);
    expect(after.messages[0].role).toBe("user");
    expect(after.messages[1].role).toBe("assistant");
    expect(after.title).toHaveLength(60);
    expect(after.providerSessionId).toBe("prov-1");
  });

  it("does NOT overwrite the title on subsequent turns", () => {
    const t = svc.resolveOrCreate("/x.md", "claude");
    svc.persistTurn(t.threadId, { userMessage: "first message", assistantText: "ok" });
    svc.persistTurn(t.threadId, { userMessage: "second message changing title", assistantText: "ok" });
    const after = repo.getById(t.threadId)!;
    expect(after.title).toBe("first message");
  });

  it("ignores persistTurn for unknown threadId (silent no-op)", () => {
    expect(() => svc.persistTurn(UUID_B, { userMessage: "x", assistantText: "y" })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `pnpm --filter @magenta/daemon test ChatThreadService`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

```ts
// packages/daemon/src/application/ChatThreadService.ts
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
 * Wraps `ChatThreadRepository` with three concerns the IPC handlers and the
 * `AiEditApplicationService` both need:
 *   1. Resolve-or-create on file open / provider switch.
 *   2. Atomic archive + new-thread on the "New session" menu action.
 *   3. Append-turn on every successful chat send (called from the bottom of
 *      `AiEditApplicationService.ask` / `editSelection` / `modifyDocument`).
 *
 * Title synthesis: the first user message's first 60 chars become the title;
 * subsequent turns must not overwrite it (FR-5). The `assistantText` is
 * persisted as a "done" message — the renderer's transient streaming state
 * is not mirrored into LMDB.
 */
export class ChatThreadService {
  private readonly now: () => number;
  private readonly uuid: () => string;
  /** Tracks in-flight per-thread cancel callbacks (FR-4). */
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

  /**
   * Append (user, assistant) to the thread row. Called by
   * AiEditApplicationService at the end of a successful chat call. If
   * `threadId` is unknown (e.g. a stale session id from before this LMDB was
   * wiped), this is a silent no-op — the chat round still returned to the
   * user; we just don't have a row to attach it to.
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

  /**
   * Register an in-flight cancel callback for `threadId`. Caller passes a
   * function that aborts the underlying `AIRunOnceApplicationService.run`.
   * Called by `AiEditApplicationService` at the start of each chat send;
   * cleared on completion.
   */
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
```

- [ ] **Step 4: Run test and verify it passes**

Run: `pnpm --filter @magenta/daemon test ChatThreadService`
Expected: PASS — all 6 cases green.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/application/ChatThreadService.ts packages/daemon/src/application/ChatThreadService.test.ts
git commit -m "feat(daemon): add ChatThreadService with resolveOrCreate, archive, persistTurn"
```

---

## Task 5: IPC handlers + DaemonContainer wiring

**Files:**
- Create: `packages/daemon/src/ipc/handlers/chatThreadHandlers.ts`
- Modify: `packages/daemon/src/ipc/registerHandlers.ts`
- Modify: `packages/daemon/src/DaemonContainer.ts`

- [ ] **Step 1: Write the failing handler integration test**

```ts
// packages/daemon/src/ipc/handlers/chatThreadHandlers.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { LmdbStore } from "../../db/LmdbStore";
import { ChatThreadRepository } from "../../data/ChatThreadRepository";
import { ChatThreadService } from "../../application/ChatThreadService";
import { registerChatThreadHandlers } from "./chatThreadHandlers";
import type { IPCBridge } from "../IPCBridge";

let tmp: string;
let store: LmdbStore;
let svc: ChatThreadService;
const handlers = new Map<string, (msg: unknown) => Promise<unknown>>();

const fakeBridge: IPCBridge = {
  on: (type: string, fn: (msg: unknown) => Promise<unknown>) => handlers.set(type, fn),
  emit: () => {},
} as unknown as IPCBridge;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "chatthread-h-"));
  store = LmdbStore.open(tmp);
  const repo = new ChatThreadRepository(store);
  svc = new ChatThreadService(repo);
  handlers.clear();
  registerChatThreadHandlers({ bridge: fakeBridge, chatThreadService: svc });
});

afterEach(async () => {
  await store.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe("chatThreadHandlers", () => {
  it("get-active-thread returns null on first call, then the started thread", async () => {
    const r1 = await handlers.get("ai-chat:get-active-thread")!({
      type: "ai-chat:get-active-thread",
      filePath: "/x.md",
      provider: "claude",
    });
    expect((r1 as { thread: unknown }).thread).toBeNull();

    const started = (await handlers.get("ai-chat:start-new-thread")!({
      type: "ai-chat:start-new-thread",
      filePath: "/x.md",
      provider: "claude",
    })) as { thread: { threadId: string } };

    const r2 = (await handlers.get("ai-chat:get-active-thread")!({
      type: "ai-chat:get-active-thread",
      filePath: "/x.md",
      provider: "claude",
    })) as { thread: { threadId: string } };
    expect(r2.thread.threadId).toBe(started.thread.threadId);
  });

  it("archive-thread sets archivedAt and clears the active pointer", async () => {
    const started = (await handlers.get("ai-chat:start-new-thread")!({
      type: "ai-chat:start-new-thread",
      filePath: "/x.md",
      provider: "claude",
    })) as { thread: { threadId: string } };

    const archiveResult = await handlers.get("ai-chat:archive-thread")!({
      type: "ai-chat:archive-thread",
      threadId: started.thread.threadId,
    });
    expect(archiveResult).toMatchObject({ ok: true });

    const r = (await handlers.get("ai-chat:get-active-thread")!({
      type: "ai-chat:get-active-thread",
      filePath: "/x.md",
      provider: "claude",
    })) as { thread: unknown };
    expect(r.thread).toBeNull();
  });

  it("list-threads returns archived + active threads, sorted updatedAt desc", async () => {
    const a = (await handlers.get("ai-chat:start-new-thread")!({
      type: "ai-chat:start-new-thread",
      filePath: "/x.md",
      provider: "claude",
    })) as { thread: { threadId: string } };
    await handlers.get("ai-chat:archive-thread")!({
      type: "ai-chat:archive-thread",
      threadId: a.thread.threadId,
    });
    const b = (await handlers.get("ai-chat:start-new-thread")!({
      type: "ai-chat:start-new-thread",
      filePath: "/x.md",
      provider: "claude",
    })) as { thread: { threadId: string } };

    const list = (await handlers.get("ai-chat:list-threads")!({
      type: "ai-chat:list-threads",
      filePath: "/x.md",
    })) as { threads: { threadId: string }[] };
    expect(list.threads.map((t) => t.threadId)).toContain(a.thread.threadId);
    expect(list.threads.map((t) => t.threadId)).toContain(b.thread.threadId);
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `pnpm --filter @magenta/daemon test chatThreadHandlers`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the handler module**

```ts
// packages/daemon/src/ipc/handlers/chatThreadHandlers.ts
import type { IPCBridge } from "../IPCBridge";
import type { ChatThreadService } from "../../application/ChatThreadService";
import { safeHandle } from "../createHandler";

type ChatThreadHandlerContext = {
  bridge: IPCBridge;
  chatThreadService: ChatThreadService;
};

/**
 * Resumable-thread handlers for the AI Chat Bubble.
 *
 *   - `ai-chat:get-active-thread`  — read the auto-resume target on file open
 *   - `ai-chat:list-threads`        — data source for a future picker UI
 *   - `ai-chat:start-new-thread`    — "New session" menu item
 *   - `ai-chat:archive-thread`      — mark a thread archived (UI cleanup)
 */
export function registerChatThreadHandlers(
  { bridge, chatThreadService }: ChatThreadHandlerContext,
): void {
  safeHandle(bridge, "ai-chat:get-active-thread", async (msg) => ({
    type: "ai-chat:get-active-thread:result" as const,
    thread: chatThreadService.listForFile(msg.filePath, msg.provider).find((t) => t.archivedAt === null) ?? null,
  }));

  safeHandle(bridge, "ai-chat:list-threads", async (msg) => ({
    type: "ai-chat:list-threads:result" as const,
    threads: chatThreadService.listForFile(msg.filePath, msg.provider),
  }));

  safeHandle(bridge, "ai-chat:start-new-thread", async (msg) => ({
    type: "ai-chat:start-new-thread:result" as const,
    thread: chatThreadService.archiveAndStartNew(msg.filePath, msg.provider),
  }));

  safeHandle(bridge, "ai-chat:archive-thread", async (msg) => {
    chatThreadService.archive(msg.threadId);
    return { type: "ai-chat:archive-thread:result" as const, ok: true as const };
  });
}
```

> Note: `get-active-thread` reads via `listForFile + filter` rather than `getActive` directly so a single LMDB scan reflects "first non-archived row" semantics. If profiling shows this is hot, swap back to a dedicated `getActive` call — same result, one extra scan saved.

- [ ] **Step 4: Wire `chatThreadService` into the registry**

In `packages/daemon/src/ipc/registerHandlers.ts`:

```ts
// add import
import type { ChatThreadService } from "../application/ChatThreadService";
import { registerChatThreadHandlers } from "./handlers/chatThreadHandlers";

// extend the context type
  chatThreadService: ChatThreadService;

// register near registerAiEditHandlers
  registerChatThreadHandlers({ bridge, chatThreadService: context.chatThreadService });
```

- [ ] **Step 5: Wire into `DaemonContainer`**

In `packages/daemon/src/DaemonContainer.ts`, in the constructor body alongside `aiEditService`:

```ts
import { ChatThreadRepository } from "./data/ChatThreadRepository";
import { ChatThreadService } from "./application/ChatThreadService";

// readonly fields
  readonly chatThreadRepository: ChatThreadRepository;
  readonly chatThreadService: ChatThreadService;

// constructor body, after databaseService is stored:
    this.chatThreadRepository = new ChatThreadRepository(databaseService.getStore());
    this.chatThreadService = new ChatThreadService(this.chatThreadRepository);

// pass into AiEditApplicationService (Task 6 changes the constructor signature):
    this.aiEditService = new AiEditApplicationService(
      this.aiConfigRepository,
      this.aiCliGateway,
      this.chatThreadService,
    );

// in registerAllHandlers' context object:
      chatThreadService: this.chatThreadService,
```

- [ ] **Step 6: Run handler test + workspace typecheck**

Run: `pnpm --filter @magenta/daemon test chatThreadHandlers`
Expected: PASS — all 3 cases green.

Run: `pnpm -w typecheck`
Expected: PASS. Note: `AiEditApplicationService` constructor mismatch will fail until Task 6 lands — that's expected; if it does fail here, defer this typecheck until Task 6 step 5.

- [ ] **Step 7: Commit**

```bash
git add packages/daemon/src/ipc/handlers/chatThreadHandlers.ts \
        packages/daemon/src/ipc/handlers/chatThreadHandlers.test.ts \
        packages/daemon/src/ipc/registerHandlers.ts \
        packages/daemon/src/DaemonContainer.ts
git commit -m "feat(daemon): wire ChatThreadService and IPC handlers into DaemonContainer"
```

---

## Task 6: `AiEditApplicationService` persists turns post-engine-call

**Files:**
- Modify: `packages/daemon/src/application/AiEditApplicationService.ts`
- Modify: `packages/daemon/src/ipc/handlers/aiEditHandlers.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/daemon/src/application/AiEditApplicationService.persistence.test.ts
import { describe, it, expect, vi } from "vitest";
import { AiEditApplicationService } from "./AiEditApplicationService";
import type { AiConfigRepository } from "../infrastructure/AiConfigRepository";
import type { AiCliGateway } from "../infrastructure/AiCliGateway";
import type { ChatThreadService } from "./ChatThreadService";

const cfg: AiConfigRepository = {
  loadConfig: () => ({
    provider: "claude",
    model: "sonnet",
    timeoutMs: 1000,
    extraArgs: [],
    sourceTrace: {},
    repoConfigPath: "/repo/.magenta/ai/config.json",
    globalConfigPath: "/home/.magenta/ai/config.json",
  }),
} as unknown as AiConfigRepository;

const gateway: AiCliGateway = {
  run: vi.fn(async (_p, _m, _prompt, opts) => {
    opts?.onSessionId?.("provider-session-9");
    return "the assistant reply";
  }),
} as unknown as AiCliGateway;

const persistTurn = vi.fn();
const registerInFlight = vi.fn();
const clearInFlight = vi.fn();
const threadSvc = {
  persistTurn,
  registerInFlight,
  clearInFlight,
} as unknown as ChatThreadService;

const UUID = "11111111-1111-4111-8111-111111111111";

describe("AiEditApplicationService persistence side-effect", () => {
  it("calls persistTurn after a successful ask", async () => {
    const svc = new AiEditApplicationService(cfg, gateway, threadSvc);
    await svc.ask({
      repoPath: "/repo",
      filePath: undefined, // legacy fallback path so test stays decoupled from filesystem
      userMessage: "hi",
      history: [],
      documentText: "doc",
      sessionId: UUID,
    });
    expect(persistTurn).toHaveBeenCalledWith(UUID, expect.objectContaining({
      userMessage: "hi",
      assistantText: "the assistant reply",
      providerSessionId: "provider-session-9",
    }));
  });

  it("does NOT call persistTurn when sessionId is omitted", async () => {
    persistTurn.mockClear();
    const svc = new AiEditApplicationService(cfg, gateway, threadSvc);
    await svc.ask({
      repoPath: "/repo",
      userMessage: "hi",
      history: [],
      documentText: "doc",
    });
    expect(persistTurn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `pnpm --filter @magenta/daemon test AiEditApplicationService.persistence`
Expected: FAIL — `AiEditApplicationService` constructor takes 2 args, not 3; `AskArgs` has no `sessionId`.

- [ ] **Step 3: Extend `AiEditApplicationService`**

In `packages/daemon/src/application/AiEditApplicationService.ts`:

```ts
// add to imports
import type { ChatThreadService } from "./ChatThreadService";

// extend each args interface
export interface AskArgs {
  // ...existing fields...
  /** Thread id (UUID) — when present, the resulting turn is persisted. */
  sessionId?: string;
}

export interface EditSelectionArgs {
  // ...existing fields...
  filePath?: string;
  sessionId?: string;
}

export interface ModifyDocumentArgs {
  // ...existing fields...
  filePath?: string;
  sessionId?: string;
}

// extend constructor
  constructor(
    private readonly configRepo: AiConfigRepository,
    private readonly cliGateway: AiCliGateway,
    private readonly chatThreadService: ChatThreadService,
  ) {}
```

Then wrap each public chat method's success path. The minimal pattern (apply to `ask`, `editSelection`, `modifyDocument`):

```ts
  async ask(args: AskArgs): Promise<string> {
    const config = this.configRepo.loadConfig(args.repoPath);
    const provider: AIProvider = args.provider ?? config.provider;

    let capturedSessionId: string | undefined;
    const wrapOnSessionId = (cb?: (s: string) => void) =>
      (sid: string) => {
        capturedSessionId = sid;
        cb?.(sid);
      };

    // ...existing repo-aware / legacy branches, but replace `onSessionId: args.onSessionId`
    // with `onSessionId: wrapOnSessionId(args.onSessionId)` so we capture the resume token
    // even if the renderer didn't subscribe.

    const text = /* existing return path's awaited value */;

    if (args.sessionId) {
      this.chatThreadService.persistTurn(args.sessionId, {
        userMessage: args.userMessage,
        assistantText: text,
        providerSessionId: capturedSessionId,
      });
    }
    return text;
  }
```

For `editSelection` / `modifyDocument`, persist with `userMessage = args.instruction` and `assistantText = stripOuterFencing(raw)` (the value already returned).

- [ ] **Step 4: Forward `sessionId` from handlers**

In `packages/daemon/src/ipc/handlers/aiEditHandlers.ts`, append `sessionId: msg.sessionId` to each of the three `aiEditService.ask` / `editSelection` / `modifyDocument` call objects. (Phase 5 already accepts `msg.sessionId` on the schema; this just plumbs it through.)

- [ ] **Step 5: Run test and full daemon suite + workspace typecheck**

Run: `pnpm --filter @magenta/daemon test AiEditApplicationService.persistence`
Expected: PASS.

Run: `pnpm --filter @magenta/daemon test`
Expected: PASS — including the existing `aiEditHandlers` tests.

Run: `pnpm -w typecheck`
Expected: PASS for all 5 packages.

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/application/AiEditApplicationService.ts \
        packages/daemon/src/application/AiEditApplicationService.persistence.test.ts \
        packages/daemon/src/ipc/handlers/aiEditHandlers.ts
git commit -m "feat(daemon): persist chat turns to ChatThreadService on every successful send"
```

---

## Task 7: `ResponseForRequest` map in renderer ipcClient

**Files:**
- Modify: `packages/ui/src/renderer/services/ipcClient.ts`

- [ ] **Step 1: Write the failing typecheck assertion**

```ts
// packages/ui/src/renderer/services/ipcClient.types.test.ts
import type { ResponseForRequest } from "./ipcClient";

type AssertExtends<T, U> = T extends U ? true : false;

// These will fail to compile if the map entries are missing.
type _A = AssertExtends<
  ResponseForRequest["ai-chat:get-active-thread"],
  { type: "ai-chat:get-active-thread:result" }
>;
type _B = AssertExtends<
  ResponseForRequest["ai-chat:list-threads"],
  { type: "ai-chat:list-threads:result" }
>;
type _C = AssertExtends<
  ResponseForRequest["ai-chat:start-new-thread"],
  { type: "ai-chat:start-new-thread:result" }
>;
type _D = AssertExtends<
  ResponseForRequest["ai-chat:archive-thread"],
  { type: "ai-chat:archive-thread:result" }
>;

// Force usage so tsc actually evaluates the assertions:
const _check: [_A, _B, _C, _D] = [true, true, true, true];
export {};
```

- [ ] **Step 2: Run typecheck and verify it fails**

Run: `pnpm -w typecheck`
Expected: FAIL — keys missing on `ResponseForRequest`.

- [ ] **Step 3: Add the entries**

In `packages/ui/src/renderer/services/ipcClient.ts`, alongside the existing `ai-chat:*` entries (around line 113):

```ts
  "ai-chat:get-active-thread": Extract<IpcResponse, { type: "ai-chat:get-active-thread:result" }>;
  "ai-chat:list-threads": Extract<IpcResponse, { type: "ai-chat:list-threads:result" }>;
  "ai-chat:start-new-thread": Extract<IpcResponse, { type: "ai-chat:start-new-thread:result" }>;
  "ai-chat:archive-thread": Extract<IpcResponse, { type: "ai-chat:archive-thread:result" }>;
```

- [ ] **Step 4: Run typecheck and verify it passes**

Run: `pnpm -w typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/renderer/services/ipcClient.ts \
        packages/ui/src/renderer/services/ipcClient.types.test.ts
git commit -m "feat(ui): extend ResponseForRequest with chat-thread IPC variants"
```

---

## Task 8: `aiChatStore` — auto-resume + archive-and-start-new actions

**Files:**
- Modify: `packages/ui/src/renderer/store/aiChatStore.ts`
- Create: `packages/ui/src/renderer/store/aiChatStore.test.ts`

- [ ] **Step 1: Write the failing store test**

```ts
// packages/ui/src/renderer/store/aiChatStore.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../services/ipcClient", () => ({
  sendOrThrow: vi.fn(),
}));

import { sendOrThrow } from "../services/ipcClient";
import { useAiChatStore } from "./aiChatStore";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  useAiChatStore.setState({ threadsByFile: {} });
  (sendOrThrow as unknown as ReturnType<typeof vi.fn>).mockReset();
});

describe("aiChatStore.openThreadForFile", () => {
  it("hydrates thread state from a prior persisted record", async () => {
    (sendOrThrow as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      type: "ai-chat:get-active-thread:result",
      thread: {
        threadId: UUID_A,
        filePath: "/x.md",
        provider: "claude",
        providerSessionId: "prov-1",
        title: "old title",
        messages: [
          { id: "m1", role: "user", text: "hi", status: "done", createdAt: 1 },
          { id: "m2", role: "assistant", text: "hello", status: "done", createdAt: 2 },
        ],
        createdAt: 1,
        updatedAt: 2,
        archivedAt: null,
        schemaVersion: 1,
      },
    });

    await useAiChatStore.getState().openThreadForFile("/x.md", "claude");
    const thread = useAiChatStore.getState().threadsByFile["/x.md"];
    expect(thread.threadId).toBe(UUID_A);
    expect(thread.messages).toHaveLength(2);
    expect(thread.sessionId).toBe("prov-1");
  });

  it("starts a fresh blank thread when none exists", async () => {
    (sendOrThrow as unknown as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ type: "ai-chat:get-active-thread:result", thread: null })
      .mockResolvedValueOnce({
        type: "ai-chat:start-new-thread:result",
        thread: {
          threadId: UUID_B,
          filePath: "/x.md",
          provider: "claude",
          providerSessionId: null,
          title: null,
          messages: [],
          createdAt: 1,
          updatedAt: 1,
          archivedAt: null,
          schemaVersion: 1,
        },
      });

    await useAiChatStore.getState().openThreadForFile("/x.md", "claude");
    const thread = useAiChatStore.getState().threadsByFile["/x.md"];
    expect(thread.threadId).toBe(UUID_B);
    expect(thread.messages).toEqual([]);
  });
});

describe("aiChatStore.archiveActiveAndStartNew", () => {
  it("replaces the in-memory thread with the new server-side one", async () => {
    useAiChatStore.setState({
      threadsByFile: {
        "/x.md": {
          open: true,
          provider: "claude",
          mode: "ask",
          messages: [
            { id: "m", role: "user", text: "old", status: "done", createdAt: 1 },
          ],
          pendingSelection: null,
          sending: false,
          lastError: null,
          sessionId: null,
          pendingStreamId: null,
          pendingAssistantId: null,
          threadId: UUID_A,
        },
      },
    });

    (sendOrThrow as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      type: "ai-chat:start-new-thread:result",
      thread: {
        threadId: UUID_B,
        filePath: "/x.md",
        provider: "claude",
        providerSessionId: null,
        title: null,
        messages: [],
        createdAt: 1,
        updatedAt: 1,
        archivedAt: null,
        schemaVersion: 1,
      },
    });

    await useAiChatStore.getState().archiveActiveAndStartNew("/x.md", "claude");
    const thread = useAiChatStore.getState().threadsByFile["/x.md"];
    expect(thread.threadId).toBe(UUID_B);
    expect(thread.messages).toEqual([]);
    expect(thread.open).toBe(true); // panel stays open
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `pnpm --filter @magenta/ui test aiChatStore`
Expected: FAIL — `openThreadForFile` / `archiveActiveAndStartNew` don't exist; `ChatThread` doesn't carry `threadId`.

- [ ] **Step 3: Extend the store**

In `packages/ui/src/renderer/store/aiChatStore.ts`:

```ts
// extend ChatThread
export type ChatThread = {
  // ...existing fields...
  /** UUID of the persisted thread on the daemon side. Null only between mount and the first openThreadForFile resolution. */
  threadId: string | null;
};

// extend State
type State = {
  // ...existing actions...

  /**
   * Resolve the active thread on the daemon side and hydrate UI state. Called
   * automatically when the panel mounts for a file and on provider switch.
   */
  openThreadForFile: (filePath: string, provider: AIProvider) => Promise<void>;

  /** Archive the active thread, server-side, and replace the in-memory one. */
  archiveActiveAndStartNew: (filePath: string, provider: AIProvider) => Promise<void>;

  /** Read-only fetch of all (active + archived) threads for a file. */
  listThreadsForFile: (filePath: string) => Promise<unknown[]>;
};

// in emptyThread()
function emptyThread(): ChatThread {
  return {
    // ...existing...
    threadId: null,
  };
}

// new actions
  async openThreadForFile(filePath, provider) {
    const response = await sendOrThrow({
      type: "ai-chat:get-active-thread",
      filePath,
      provider,
    });
    const wasOpen = get().threadsByFile[filePath]?.open ?? false;

    if (response.thread) {
      const t = response.thread;
      set((s) => ({
        threadsByFile: {
          ...s.threadsByFile,
          [filePath]: {
            ...emptyThread(),
            open: wasOpen,
            provider: t.provider,
            threadId: t.threadId,
            sessionId: t.providerSessionId,
            messages: t.messages,
          },
        },
      }));
      return;
    }

    // No active thread — create one server-side so subsequent sends have a sessionId.
    const created = await sendOrThrow({
      type: "ai-chat:start-new-thread",
      filePath,
      provider,
    });
    set((s) => ({
      threadsByFile: {
        ...s.threadsByFile,
        [filePath]: {
          ...emptyThread(),
          open: wasOpen,
          provider,
          threadId: created.thread.threadId,
        },
      },
    }));
  },

  async archiveActiveAndStartNew(filePath, provider) {
    const wasOpen = get().threadsByFile[filePath]?.open ?? true;
    const created = await sendOrThrow({
      type: "ai-chat:start-new-thread",
      filePath,
      provider,
    });
    set((s) => ({
      threadsByFile: {
        ...s.threadsByFile,
        [filePath]: {
          ...emptyThread(),
          open: wasOpen,
          provider,
          threadId: created.thread.threadId,
        },
      },
    }));
  },

  async listThreadsForFile(filePath) {
    const response = await sendOrThrow({
      type: "ai-chat:list-threads",
      filePath,
    });
    return response.threads;
  },
```

In `sendAsk`, add `sessionId: thread.threadId ?? undefined` to the `sendOrThrow` payload (Phase 5 schema accepts it). Same for `requestEditSelection` and `requestModifyDocument`. Replace the existing `setProvider` body so it calls `openThreadForFile` instead of resetting:

```ts
  setProvider(filePath, provider) {
    const thread = get().threadsByFile[filePath] ?? emptyThread();
    if (thread.provider === provider) return;
    // Switching providers re-resolves to the other provider's active thread for this file.
    void get().openThreadForFile(filePath, provider);
  },
```

Update `openWithProvider` similarly: open the panel, then auto-resume.

- [ ] **Step 4: Run test and verify it passes**

Run: `pnpm --filter @magenta/ui test aiChatStore`
Expected: PASS — all 3 cases green.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/renderer/store/aiChatStore.ts \
        packages/ui/src/renderer/store/aiChatStore.test.ts
git commit -m "feat(ui): aiChatStore auto-resumes per-(file, provider) thread via IPC"
```

---

## Task 9: `ChatPanel` — replace Clear with New session, mount auto-resume

**Files:**
- Modify: `packages/ui/src/renderer/components/main/aiChat/ChatPanel.tsx`

- [ ] **Step 1: Write the failing component test**

```ts
// packages/ui/src/renderer/components/main/aiChat/ChatPanel.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";

vi.mock("../../../services/ipcClient", () => ({ sendOrThrow: vi.fn() }));
import { sendOrThrow } from "../../../services/ipcClient";
import { useAiChatStore } from "../../../store/aiChatStore";
import { ChatPanel } from "./ChatPanel";

beforeEach(() => {
  useAiChatStore.setState({ threadsByFile: {} });
  (sendOrThrow as unknown as ReturnType<typeof vi.fn>).mockReset();
  (sendOrThrow as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    type: "ai-chat:get-active-thread:result",
    thread: null,
  });
});

describe("ChatPanel", () => {
  it("calls openThreadForFile on mount", async () => {
    const spy = vi.spyOn(useAiChatStore.getState(), "openThreadForFile");
    await act(async () => {
      render(
        <ChatPanel
          filePath="/x.md"
          repoPath="/repo"
          documentText=""
          onClose={() => {}}
        />,
      );
    });
    expect(spy).toHaveBeenCalledWith("/x.md", expect.any(String));
  });

  it("renders 'New session' menu item, NOT 'Clear conversation'", async () => {
    await act(async () => {
      render(
        <ChatPanel
          filePath="/x.md"
          repoPath="/repo"
          documentText=""
          onClose={() => {}}
        />,
      );
    });
    fireEvent.click(screen.getByTitle("More"));
    expect(screen.getByText(/New session/i)).toBeInTheDocument();
    expect(screen.queryByText(/Clear conversation/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `pnpm --filter @magenta/ui test ChatPanel`
Expected: FAIL — menu still says "Clear conversation"; no mount effect.

- [ ] **Step 3: Update `ChatPanel.tsx`**

```tsx
// at top of component, alongside other selectors
const openThreadForFile = useAiChatStore((s) => s.openThreadForFile);
const archiveActiveAndStartNew = useAiChatStore((s) => s.archiveActiveAndStartNew);

useEffect(() => {
  void openThreadForFile(filePath, thread.provider);
  // Re-run on provider switch so the panel hydrates the other provider's thread.
}, [filePath, thread.provider, openThreadForFile]);

// replace the existing MoreMenuItem block (around line 226):
              <MoreMenuItem
                label="New session"
                onClick={() => {
                  void archiveActiveAndStartNew(filePath, thread.provider);
                  setMoreOpen(false);
                }}
              />
```

Remove the now-unused `clear` action from the destructure if nothing else references it inside the component (do not remove the `clear` action from the store — it's still used elsewhere; verify with `rtk grep -n "useAiChatStore.*clear" packages/ui/src/renderer` first).

- [ ] **Step 4: Run test and verify it passes**

Run: `pnpm --filter @magenta/ui test ChatPanel`
Expected: PASS.

Run: `pnpm --filter @magenta/ui test`
Expected: PASS — no other ChatPanel tests broken.

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/renderer/components/main/aiChat/ChatPanel.tsx \
        packages/ui/src/renderer/components/main/aiChat/ChatPanel.test.tsx
git commit -m "feat(ui): ChatPanel auto-resumes thread on mount and exposes New session menu"
```

---

## Task 10: Final verification — workspace-wide

- [ ] **Step 1: Confirm no chat handler still calls `AiCliGateway` directly**

Run: `rtk grep -n "cliGateway\.run\|AiCliGateway" packages/daemon/src/ipc/handlers/`
Expected: zero hits — Phase 2 already removed direct gateway calls; this re-verifies the post-Phase-8 invariant (AC-6).

- [ ] **Step 2: Workspace typecheck**

Run: `pnpm -w typecheck`
Expected: PASS for all 5 packages.

- [ ] **Step 3: Workspace build**

Run: `pnpm -w build`
Expected: PASS — all packages build, no dangling exports.

- [ ] **Step 4: Workspace tests**

Run: `pnpm -w test`
Expected: PASS — Tasks 1, 3, 4, 5, 6, 7, 8, 9 tests included.

- [ ] **Step 5: Stop here per `feedback_verification.md`**

Do not launch the app. Steven runs manual E2E:

> AC-1 — open `notes.md`, send "summarize this", close, reopen → prior bubbles render.
> AC-2 — click New session → menu replaces Clear; old thread queryable via `ai-chat:list-threads`.
> AC-3 — switch Claude→Copilot on a file with only a Claude thread → blank Copilot thread; switch back → Claude history restored.
> AC-4 — quit Electron mid-thread, relaunch → conversation resumes.
> AC-5 — spec-review chat behaves identically to before (no thread persistence).

Report after Tasks 1–10 are merged:

> Phase 8 done. New LMDB sub-db `chat_threads` carries (filePath, provider, threadId) thread rows + active pointers; `aiChatStore` auto-resumes on file open and provider switch; ChatPanel header now offers New session. AiEditApplicationService persists every successful chat turn through ChatThreadService. Spec-review chat unchanged.

---

## Spec coverage check (self-review)

| Spec requirement | Covered by |
|---|---|
| §4.2 LMDB `chat_threads` substore + active pointer | Task 3 |
| §4.2 `ChatThreadRecord` shape | Task 1 |
| §4.3 Auto-resume flow on file open | Tasks 8 (`openThreadForFile`), 9 (mount effect) |
| §4.4 New-session flow | Tasks 4 (`archiveAndStartNew`), 5 (handler), 8 (`archiveActiveAndStartNew`), 9 (menu rewire) |
| §5 IPC variant `ai-chat:get-active-thread` | Tasks 1, 2, 5, 7 |
| §5 IPC variant `ai-chat:list-threads` | Tasks 1, 2, 5, 7 |
| §5 IPC variant `ai-chat:start-new-thread` | Tasks 1, 2, 5, 7 |
| §5 IPC variant `ai-chat:archive-thread` | Tasks 1, 2, 5, 7 |
| §6 Remove "Clear" / add "New session" menu item | Task 9 |
| §7 FR-1 ≤200ms rehydration via LMDB | Tasks 3 (single LMDB read), 8, 9 |
| §7 FR-2 Provider switch reuses other-provider thread | Task 8 (`setProvider` calls `openThreadForFile`) |
| §7 FR-3 `sessionId = thread.threadId` on every send | Task 8 (sendAsk patch); Phase 5 owns `--resume` resolution |
| §7 FR-4 Atomic archive + new + cancel in-flight | Task 4 (`archiveAndStartNew`, `inFlight` map); Task 5 |
| §7 FR-5 First-message title synthesis (no overwrite) | Task 4 (`persistTurn`) |
| §7 FR-6 Archived threads queryable, not auto-resumed | Tasks 3 (`listForFile` includes archived), 5 (`get-active-thread` filters `archivedAt === null`) |
| §7 FR-7 Spec-review chat unaffected | Task 6 (only `ask` / `editSelection` / `modifyDocument` persist; `askSpec` left alone) |
| §7 FR-8 Chat sends flow through `AIRunOnceApplicationService` | Phase 2 (already merged); Task 10 step 1 verifies invariant |
| §8 NFR-1 ≤2 LMDB writes per turn | Task 3 (`upsert` writes row + idKey in one transaction; active pointer only changes on create/archive) |
| §8 NFR-2 Backwards compat — `sessionId` is optional | Task 6 (no-op when `sessionId` omitted) |
| §8 NFR-3 No renderer migration on first run | Tasks 8, 9 (empty store → `start-new-thread` creates a fresh row) |
| §9 AC-1 reopen file resumes | Tasks 3, 8, 9 |
| §9 AC-2 New session archives prior | Tasks 4, 5, 8, 9 |
| §9 AC-3 Provider switch restores other-provider history | Task 8 |
| §9 AC-4 Survives Electron quit | Tasks 3 (LMDB durable on commit), 8 |
| §9 AC-5 Spec-review unaffected | Task 6 (askSpec unchanged) |
| §9 AC-6 No `AiCliGateway` calls from chat handlers | Task 10 step 1 (grep guard) |

**Out-of-scope deferrals** (covered elsewhere or intentionally future):
- Thread-picker UI for archived threads → future phase (data layer ready via `ai-chat:list-threads`).
- Token / cost rollup onto `ChatThreadRecord` → future Phase 7+ follow-up (spec §8 NFR-4).
- Cross-device sync → out per §3 NG-4.
- `ai-chat:ask-spec` resumption → out per §3 NG-3.
