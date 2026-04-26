# Spec: Chat Bubble Unification & Resumable Threads

**Status:** Draft
**Author:** Steven (with Claude)
**Created:** 2026-04-25
**Related plans:**
- [`supers/plans/2026-04-25-phase2-runonce-and-stream-parser.md`](../plans/2026-04-25-phase2-runonce-and-stream-parser.md) — gains 1 task
- [`supers/plans/2026-04-25-phase5-session-lifecycle.md`](../plans/2026-04-25-phase5-session-lifecycle.md) — gains 1 task
- [`supers/plans/2026-04-25-phase8-resumable-chat-threads.md`](../plans/2026-04-25-phase8-resumable-chat-threads.md) — new
**Parent specs:**
- [`specs/2026-04-24-cli-programmatic-improvements.md`](../../specs/2026-04-24-cli-programmatic-improvements.md)
- [`specs/2026-04-24-unified-ai-cli-interface.md`](../../specs/2026-04-24-unified-ai-cli-interface.md)

---

## 1. Summary

The unified-AI-CLI work introduces a single `AISpawnOptions` schema, capability manifests, and `AIRunOnceApplicationService` as the one-shot engine. The Bubble Chat feature (`ai-chat:ask`, `ai-chat:edit-selection`, `ai-chat:modify-document`) currently bypasses that engine — its handlers call `AiCliGateway.run()` directly with a bespoke `RunOptions` shape. This spec extends the unification down to the chat surface and adds resumable threads keyed by `(filePath, provider)`.

The user-visible payoff: reopen an MD file you were chatting about, the conversation resumes where it left off. Chat inherits Phase 2 stream events, Phase 5 session-id semantics, and Phase 7 cost accounting at no extra cost.

## 2. Goals

- **G1.** One application service (`AIRunOnceApplicationService`) drives every one-shot AI call in the app — chat, spec review, programmatic batch.
- **G2.** Chat threads survive Electron restart and rehydrate automatically when the same MD file is reopened.
- **G3.** The user can start a fresh chat without losing the old thread (history archived, future picker UI possible).
- **G4.** Existing chat IPC names (`ai-chat:ask` etc.) keep their shapes; new fields are additive optional.

## 3. Non-goals

- **NG1.** Replacing the `ai-chat:*` IPC variants with `ai:run-once` directly (Option C from brainstorming). IPC contracts stay; engine unifies.
- **NG2.** Building a thread-picker UI for archived threads. The persistence layer supports it; the UI is future work.
- **NG3.** Resumable Spec-Review chat (`ai-chat:ask-spec`). Stays Claude-only and stateless per memory S642.
- **NG4.** Cross-device thread sync. Threads live in local LMDB only.

## 4. Architecture

### 4.1 Three-layer change

```
┌─────────── Layer 3: Renderer (Phase 8) ───────────┐
│ aiChatStore: thread persistence + rehydrate hook   │
│ ChatPanel: "New session" menu replaces "Clear"     │
└────────────────────────┬───────────────────────────┘
                         │ ai-chat:* (extended)
┌────────────────────────▼───────────────────────────┐
│ Layer 2: IPC + Application Service                 │
│ ai-chat:* schemas gain { sessionId?, spawn? }      │ (Phase 5 task)
│ AiEditApplicationService → AIRunOnceApplicationSvc │ (Phase 2 task)
└────────────────────────┬───────────────────────────┘
                         │ AISpawnOptions
┌────────────────────────▼───────────────────────────┐
│ Layer 1: Engine (Phase 1 + 2 — already designed)   │
│ getToArgv() · streamJsonParser · sessionIdResolver │
└────────────────────────────────────────────────────┘
```

### 4.2 Persistence model

New LMDB sub-store `chat_threads`, keyed by `${filePath}::${provider}::${threadId}` where `threadId` is the canonical `sessionId` for that thread. Per-file-per-provider an "active" pointer identifies which thread auto-resumes on file open.

```ts
// packages/shared/src/chatThread.ts
interface ChatThreadRecord {
  threadId: string;           // canonical UUID v4 — same as AISpawnOptions.sessionId
  filePath: string;           // absolute path of the MD file the chat is bound to
  provider: AIProvider;
  providerSessionId: string | null;  // resume token (Copilot disk-scan reconciled; Claude == threadId)
  title: string | null;       // synthesized from first user message
  messages: ChatMessage[];    // existing message shape from aiChatStore
  createdAt: number;          // epoch ms
  updatedAt: number;
  archivedAt: number | null;  // when "New session" was clicked
}

interface ChatThreadActivePointer {
  filePath: string;
  provider: AIProvider;
  activeThreadId: string;
}
```

### 4.3 Auto-resume flow

```
User opens MD file → ChatPanel mounts
                  → aiChatStore.openThreadForFile(filePath, provider)
                  → IPC ai-chat:get-active-thread({filePath, provider})
                  → daemon: read active pointer → read thread row
                     → return { threadId, messages, sessionId, providerSessionId }
                     → if none: return null
                  → store hydrates UI; if null, creates blank thread with fresh UUID
User sends message → aiChatStore.sendAsk()
                  → IPC ai-chat:ask({ ..., sessionId: thread.threadId, spawn: { ... } })
                  → daemon: AiEditApplicationService → AIRunOnceApplicationService.run()
                     → sessionId resolver (Phase 5) → --resume <token> for follow-ups
                  → response streamed back, appended to messages
                  → daemon persists thread row (updatedAt, messages, providerSessionId)
```

### 4.4 "New session" flow

```
User clicks New Session menu
  → aiChatStore.archiveActiveAndStartNew(filePath, provider)
  → IPC ai-chat:start-new-thread({filePath, provider})
     → daemon: mark current thread.archivedAt = now()
              → create new thread row { threadId: uuid(), messages: [] }
              → update active pointer
              → return new thread
  → store replaces in-memory thread; UI clears
```

## 5. IPC contract changes

| Variant | Change | Phase |
|---|---|---|
| `ai-chat:ask` | + `sessionId?: UUID`, + `spawn?: Partial<AISpawnOptions>` | 5 |
| `ai-chat:edit-selection` | + `sessionId?: UUID`, + `spawn?: Partial<AISpawnOptions>` | 5 |
| `ai-chat:modify-document` | + `sessionId?: UUID`, + `spawn?: Partial<AISpawnOptions>` | 5 |
| `ai-chat:ask-spec` | unchanged (Claude-only, stateless) | — |
| `ai-chat:get-active-thread` *(new)* | `{filePath, provider}` → `ChatThreadRecord \| null` | 8 |
| `ai-chat:list-threads` *(new)* | `{filePath, provider?}` → `ChatThreadRecord[]` | 8 |
| `ai-chat:start-new-thread` *(new)* | `{filePath, provider, sessionId?}` → `ChatThreadRecord` | 8 |
| `ai-chat:archive-thread` *(new)* | `{threadId}` → `{ ok: true }` | 8 |

All chat sends route through `AIRunOnceApplicationService` after Phase 2's migration task.

## 6. UI changes

- **Remove:** "Clear" button on ChatPanel header.
- **Add:** Context dropdown menu item "New session" — archives active thread, starts blank.
- **No change:** Provider switcher (already invalidates session per memory S642 — semantics now mean "switch active thread to the other provider's thread for this file").
- **Future (out of scope):** Thread picker showing archived threads.

## 7. Functional requirements

- **FR-1.** Reopening an MD file with an existing active thread for `(filePath, provider)` SHALL rehydrate the chat panel with the prior message history within 200ms (LMDB read).
- **FR-2.** Switching provider on a file with no thread for the new provider SHALL create a blank thread; switching back SHALL restore the original.
- **FR-3.** Sending a message in a thread SHALL pass `sessionId = thread.threadId` to `ai-chat:ask`; the daemon SHALL resolve resume semantics per Phase 5.
- **FR-4.** "New session" SHALL atomically archive the active thread (`archivedAt = now()`) and create a new active one; in-flight requests on the old thread SHALL be cancelled.
- **FR-5.** A first-message thread SHALL synthesize a title from the first 60 chars of the user message; subsequent messages MUST NOT overwrite it.
- **FR-6.** Archived threads SHALL remain queryable via `ai-chat:list-threads`; they SHALL NOT auto-resume.
- **FR-7.** Spec-Review chat (`ai-chat:ask-spec`) SHALL remain stateless and unaffected.
- **FR-8.** All chat sends SHALL flow through `AIRunOnceApplicationService` (no direct `AiCliGateway` calls from chat handlers post-migration).

## 8. Non-functional

- **NFR-1.** LMDB writes per chat turn ≤2 (one for thread row, one for active pointer if it changed).
- **NFR-2.** Backwards compat: existing `ai-chat:*` callers that omit `sessionId` get a fresh thread per call (current behaviour); new fields are additive optional.
- **NFR-3.** No renderer state migration on first run — empty `chat_threads` store implies no prior history; UI starts blank.
- **NFR-4.** Cost / token accounting from Phase 7 SHALL persist to the thread row, not just `ai_sessions`.

## 9. Acceptance criteria

- **AC-1.** Open `notes.md`, send "summarize this", close file, reopen — chat panel shows the previous Q&A. Sending a follow-up references prior turn (verifies resume worked).
- **AC-2.** Click "New session" — chat clears, sending creates a new thread row with a fresh UUID; the old thread is queryable via `ai-chat:list-threads({filePath: "notes.md"})` and has `archivedAt` set.
- **AC-3.** Switch provider Claude→Copilot on a file with only a Claude thread — Copilot thread starts blank; switching back to Claude restores the Claude history.
- **AC-4.** Quit Electron mid-thread, reopen — same conversation resumes.
- **AC-5.** Spec-review chat is unaffected by this change (no thread persistence, no sessionId).
- **AC-6.** No code path under `packages/daemon/src/application/AiEditApplicationService.ts` calls `AiCliGateway` directly after migration; all chat traffic goes through `AIRunOnceApplicationService`.

## 10. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Stale `providerSessionId` after long inactivity (Copilot GC) | Med | Low | Phase 5's resume-fallback already covers — fires `resume-fallback` event, retries without resume |
| LMDB store growth from never-archived threads | Low | Low | Threads small (~few KB each); add cleanup task in future phase if needed |
| Provider switch race with in-flight request | Low | Med | Phase 8 cancels in-flight on archive/switch; daemon ignores late responses for cancelled threads |
| Renderer rehydration flicker on file open | Low | Low | Show skeleton message list until LMDB read resolves (≤200ms NFR-1) |

## 11. Plan deltas

### Phase 2 — adds Task: "Migrate `AiEditApplicationService` to `AIRunOnceApplicationService`"
Effort: +0.5 day. Inserted after the `AIRunOnceApplicationService` is defined.

### Phase 5 — adds Task: "Extend `ai-chat:*` IPC schemas with `sessionId` + `spawn` (additive)"
Effort: +0.5 day. Inserted alongside the existing session-id resolver work.

### Phase 8 — new plan, ~2 days
- LMDB `chat_threads` substore + repository + service
- 4 new IPC variants (`get-active-thread`, `list-threads`, `start-new-thread`, `archive-thread`)
- `aiChatStore` rehydration hook on file open + provider switch
- `ChatPanel` menu rewire (remove Clear, add New Session)
- Title synthesis on first user message

Total addition vs. the original 7-phase plan: ~3 engineer-days.
