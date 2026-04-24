# AI Chat Bubble for Markdown Editor

## Context

The first pass at AI for the markdown editor baked actions into the existing
selection toolbar and slash menu. That turned out to be awkward — prompt
inputs competed with the contenteditable for focus, two separate UX paths
(toolbar action vs `/ai` slash) needed parallel code, and discoverability was
poor. We're replacing that with a single, clearly-bounded surface: a floating
**chat bubble** anchored to the editor that opens a **chat panel** (shape and
style follow the shadcn "chat-bubble" card reference).

Core behaviour:

- One ambient entry point — a circular AI icon button fixed bottom-right of
  the editor surface, always visible while a Markdown file is open.
- Clicking opens a chat panel. The AI always has the current document as
  context. History is kept per-file for the session.
- Three explicit modes (pill toggle above the input):
  - **Ask** — free-form conversation; AI never touches the document.
  - **Edit selection** — requires an active selection in the editor.
    The AI returns replacement text; a **preview dialog** shows before/after
    and only applies on confirm.
  - **Modify document** — whole-doc rewrites, appends, or inserts. The AI
    returns the new document body and the editor **applies it directly**;
    Cmd-Z is the safety net.
- The AI always talks to the editor component (not the filesystem). The
  daemon returns text over IPC; the editor's imperative handle applies it.

## What gets removed

All inline AI from the first pass is stripped. The daemon-side pieces are
reshaped (not deleted) since the chat panel reuses them.

- **Delete** `packages/ui/src/renderer/components/main/notionEditor/SelectionAiMenu.tsx`.
- **Revert** `SelectionToolbar.tsx` — drop the `repoPath` prop and the AI
  button / divider it renders.
- **Revert** `SlashMenu.tsx` — drop the "Ask AI…" discovery row, the
  inline-prompt branch, the `/ai <prompt>` query mode, and the
  `onAiGenerate` prop. Restore its original keydown handler.
- **Revert** `NotionEditor.tsx` — drop `handleAiGenerate`,
  `effectiveRepoPath`, the `useAiEditStore` import, and the pass-throughs
  to `SlashMenu` and `SelectionToolbar`.
- **Drop** unused code from `aiEditStore.ts` (`generate`, `runAction`).
- **Drop** `ai-edit:run-action` and `ai-edit:generate` from `packages/shared/src/ipc.ts`
  and from `ResponseForRequest` in `services/ipcClient.ts`. Keep
  `ai-edit:get-config` and `ai-edit:list-actions` for the settings view.
- **Drop** the `runAction` / `generate` methods from
  `AiEditApplicationService` and the corresponding `safeHandle` entries in
  `aiEditHandlers.ts`. The handlers file shrinks; don't delete it.

## What gets kept

- `AiConfigRepository` (infrastructure): still reads `.magenta/ai/config.json`
  with the same repo → global → built-in fallback chain.
- `AiCliGateway` (infrastructure): unchanged; still spawns `claude -p` /
  `copilot -p` per request with timeout + stderr capture.
- `AiEditApplicationService` (application): renamed internally to group
  concerns but keeps the same wiring point. The three new chat methods
  (see below) live on it so the composition root doesn't grow.
- Built-in templates in `domain/aiActionTemplates.ts`: the existing
  per-action prompts are dropped. **Three new system prompts** are added:
  - `CHAT_SYSTEM` — "answer questions about the document; do not rewrite".
  - `EDIT_SELECTION_SYSTEM` — "rewrite the selected text according to the
    instruction; return only the replacement text, no surrounding content,
    no commentary, preserve any trailing newline".
  - `MODIFY_DOCUMENT_SYSTEM` — "apply the user's instruction to the full
    document; return only the complete new document body in Markdown, no
    commentary, no fencing".
- All new `AppErrorCode` values (`AI_CONFIG_INVALID`,
  `AI_PROVIDER_NOT_AVAILABLE`, `AI_TIMEOUT`, `AI_CLI_FAILED`).
- `AiSettingsView` (settings tab) — unchanged; still the place to see the
  resolved config + action list. Note: the action list is only used by this
  view now; it remains useful for auditing resolved config.

## What gets added

### Shared (`packages/shared/src/ipc.ts`)

Three new IPC requests + responses:

```ts
// Requests
{ type: "ai-chat:ask", repoPath, userMessage, history, documentText, selection? }
{ type: "ai-chat:edit-selection", repoPath, instruction, documentText, selection }
{ type: "ai-chat:modify-document", repoPath, instruction, documentText }

// Responses
{ type: "ai-chat:ask:result", text }
{ type: "ai-chat:edit-selection:result", newText }
{ type: "ai-chat:modify-document:result", newDocumentText }
```

- `history: { role: "user" | "assistant"; text: string }[]` — truncated to
  the last 20 messages by the daemon before rendering into the prompt.
- `selection: { start: number; end: number; text: string }` — document-text
  offsets so the daemon does not need DOM knowledge.

New Zod type exports:

- `AiChatMessageSchema = { role: "user" | "assistant", text: string,
  createdAt: number }` (the UI also adds `status: "pending" | "done" |
  "error"` locally; this is UI-only state).

### Daemon

**`application/AiEditApplicationService.ts`** — add three methods:

- `ask(args)` — compose `CHAT_SYSTEM + history turns + user message + doc`,
  delegate to `AiCliGateway.run`, return text.
- `editSelection(args)` — compose `EDIT_SELECTION_SYSTEM + instruction +
  selected text + (optional surrounding context window)`, delegate, strip
  any stray fenced-code wrappers, return the raw replacement.
- `modifyDocument(args)` — compose `MODIFY_DOCUMENT_SYSTEM + instruction +
  full document`, delegate, strip stray fencing, return full new body.

Each method loads `AiEditConfig` for the repo once (provider + model +
timeout + extraArgs) and reuses the same `AiCliGateway`.

**`ipc/handlers/aiChatHandlers.ts`** (new, or extend `aiEditHandlers.ts`)
— three thin `safeHandle` entries delegating to the service methods. Same
style as existing handlers (no `try/catch`, no payload casts).

Wire the existing service via `DaemonContainer` (no new container slots
needed — the service instance already exists).

### Renderer

**`store/aiChatStore.ts`** (new):

```ts
type ChatState = {
  threadsByFile: Map<string, ChatThread>;
  sendAsk: (filePath, repoPath, text, documentText, selection?) => Promise<void>;
  sendEditSelection: (filePath, repoPath, instruction, documentText, selection) => Promise<string>;
  sendModifyDocument: (filePath, repoPath, instruction, documentText) => Promise<string>;
  setOpen: (filePath, open: boolean) => void;
  clear: (filePath) => void;
};

type ChatThread = {
  open: boolean;
  mode: "ask" | "edit-selection" | "modify-document";
  messages: AiChatMessage[];
  pendingSelection: { start: number; end: number; text: string } | null;
  status: "idle" | "sending" | "error";
  lastError: string | null;
};
```

- Per-file threads, in-memory only (session lifetime).
- `sendAsk` appends a user message, calls `ai-chat:ask`, appends the
  assistant message.
- `sendEditSelection` and `sendModifyDocument` return their text so the
  caller (chat panel) can drive the preview-dialog / direct-apply flows.
- Does not import other stores. Callers pass `repoPath`, `documentText`,
  and `selection` in.

**`components/main/aiChat/` (new folder):**

- `ChatBubble.tsx` — `position: absolute; right: 16; bottom: 16`, circular
  button with `Sparkles` icon (existing lucide import), 44×44. Toggles
  `threadsByFile.get(filePath).open`. Pulses subtly when a new assistant
  message arrives while closed.
- `ChatPanel.tsx` — the card from the screenshot:
  - **Header**: small AI avatar circle, title "AI", subtitle = file
    basename, overflow `…` menu (reset thread), close `×`.
  - **Message list**: scrollable; user messages right-aligned dark bubble
    (`background: colors.primary`, white text, `border-radius: 14px 14px
    2px 14px`), assistant messages left-aligned muted bubble
    (`background: colors.bgMuted`, `border-radius: 14px 14px 14px 2px`).
    Loading assistant turn shows three pulsing dots.
  - **Selection chip**: when `pendingSelection` is set, a small chip shows
    above the input: `✂ "first 40 chars…" ×`; × clears the selection.
  - **Mode pill row**: three small segmented-control buttons:
    `Ask` · `Edit selection` · `Modify document`. "Edit selection" is
    disabled with a tooltip ("Select text in the editor first") when there
    is no selection.
  - **Input row**: shadcn-style rounded textarea + square send button
    with paper-plane icon. Enter sends, Shift+Enter newline.
  - Card sized ≈ 360×520, floats above editor, `position: absolute`
    inside the editor wrapper (not portal'd to body — keeps it bounded to
    the editor and hidden when the file tab is inactive).
- `ChatMessageBubble.tsx` — renders one message (user/assistant/error).
  Markdown-renders assistant text using the same renderer the editor
  preview uses (or a lightweight inline renderer) to keep code snippets
  readable.
- `RewritePreviewDialog.tsx` — modal shown only for `edit-selection`. Two
  panels side-by-side: current selected text vs proposed replacement (uses
  existing `DiffViewer` with an inline diff). Buttons: **Apply** / **Cancel**.

**`components/main/notionEditor/NotionEditor.tsx`** additions:

- Extend `NotionEditorMethods` with:
  - `getSelection(): { start: number; end: number; text: string } | null`
    — flattens the current DOM selection to document-text offsets using
    the existing `textOffset` helper (moved from `SelectionToolbar.tsx`
    into `blockModel.ts` or a shared util).
  - `replaceRange(start: number, end: number, newText: string): void`
    — computes the block(s) spanned by the range, builds a new markdown
    string with the splice, calls `parseMarkdown` and `setBlocks`.
- These are the two handles `ChatPanel` uses to wire Apply for the two
  edit paths. `setMarkdown` already exists for `modify-document`.

**`components/main/FileViewer.tsx` integration**:

- Wrap `<MarkdownEditor>` in a `position: relative` div so the bubble
  anchors relative to the editor area.
- Render `<ChatBubble editorRef={editorRef} filePath={filePath} repoPath={repoPath} />`
  inside that wrapper, only when `!readOnly` and the file is `.md`.
- Bubble reads/writes the thread through `useAiChatStore(filePath)`.

### Apply flows

| Mode | What the panel does on send |
|---|---|
| **Ask** | `store.sendAsk(...)` — append user message, call IPC, append assistant message. No editor change. |
| **Edit selection** | Capture selection via `editorRef.getSelection()` at send time (also set as `pendingSelection` when the panel opens). Call `sendEditSelection`. On success, open `RewritePreviewDialog`. On **Apply** → `editorRef.replaceRange(start, end, newText)`. Chat appends a "✓ Applied edit" assistant message. |
| **Modify document** | Call `sendModifyDocument` with the full markdown from `editorRef.getMarkdown()`. On success, **directly** call `editorRef.setMarkdown(newDocumentText)`. Chat appends a "✓ Updated document" assistant message with a `[Undo]` quick-action that calls an `onUndoRequested` callback (fires `Cmd-Z` programmatically). |

### Selection capture semantics

The chat panel snapshots selection **when the panel opens** and **when the
input gains focus** — whichever happens with an active DOM selection. The
snapshot is displayed as the "✂ Editing:" chip. Users can:

- Clear the chip to drop the captured selection.
- Re-select text in the editor; the chip auto-updates on next focus.
- Send in **Edit selection** mode only when the chip is present.

This mirrors what we tried to do before (preserving selection through
`mousedown` preventDefault) but cleanly: capture once, show the capture,
never depend on live DOM selection at send time.

## Critical files to touch

**Delete**
- `packages/ui/src/renderer/components/main/notionEditor/SelectionAiMenu.tsx`

**Revert / shrink** (inline AI removal)
- `packages/ui/src/renderer/components/main/notionEditor/SelectionToolbar.tsx`
- `packages/ui/src/renderer/components/main/notionEditor/SlashMenu.tsx`
- `packages/ui/src/renderer/components/main/notionEditor/NotionEditor.tsx`
- `packages/ui/src/renderer/store/aiEditStore.ts`
- `packages/ui/src/renderer/services/ipcClient.ts` (drop two mappings,
  add three new ones)
- `packages/shared/src/ipc.ts` (drop two variants, add three pairs)
- `packages/daemon/src/application/AiEditApplicationService.ts`
- `packages/daemon/src/ipc/handlers/aiEditHandlers.ts`

**New**
- `packages/daemon/src/domain/aiActionTemplates.ts` — replace built-in
  actions with three system-prompt constants (or rename file).
- `packages/ui/src/renderer/store/aiChatStore.ts`
- `packages/ui/src/renderer/components/main/aiChat/ChatBubble.tsx`
- `packages/ui/src/renderer/components/main/aiChat/ChatPanel.tsx`
- `packages/ui/src/renderer/components/main/aiChat/ChatMessageBubble.tsx`
- `packages/ui/src/renderer/components/main/aiChat/RewritePreviewDialog.tsx`
- `packages/ui/src/renderer/components/main/notionEditor/notionSelection.ts`
  (extract `textOffset` helper + add `getBlockSelection`, `replaceRangeInBlocks`).

**Modify**
- `packages/ui/src/renderer/components/main/FileViewer.tsx` — wrap
  `<MarkdownEditor>` + mount `<ChatBubble>`.
- `packages/ui/src/renderer/components/main/NotionEditor.tsx` — expose
  `getSelection` and `replaceRange` via the imperative handle.

## Reused existing pieces

- `sendOrThrow`, `IpcError` — all chat store IPC calls.
- `AppError`, `toAppError` — daemon error flow (already wired).
- `BaseDialog`, `DiffViewer` — for `RewritePreviewDialog`.
- `colors`, `useDensityTokens` — styling consistent with sidebar/editor.
- `parseMarkdown`, `blocksToMarkdown`, `makeBlock` — block-model helpers
  for `replaceRange` in `NotionEditor`.
- `Sparkles`, `X`, `Send` (or `SendHorizonal`) — lucide-react icons.

## Verification

Per `feedback_verification.md` — typecheck + build only; manual user testing.

1. `pnpm -w typecheck` passes across all packages.
2. `pnpm -w build` passes across all packages.
3. Manual smoke (user runs):
   - Open an `.md` file in a repo. Circular AI button is at the
     bottom-right of the editor. Selection toolbar no longer shows an AI
     button. Typing `/` no longer shows "Ask AI".
   - Click the bubble → chat panel opens with the filename in the
     header. Close with `×`; the thread is remembered.
   - **Ask**: type "What is this document about?" → spinner → assistant
     bubble appears with a summary. Editor content is unchanged.
   - **Modify document**: switch mode, type "Add a paragraph about safety
     considerations at the end" → editor content updates in place; a
     "✓ Updated document" confirmation appears in the chat. Cmd-Z reverts.
   - **Edit selection**: select a sentence in the editor; chip appears
     above the input with the first 40 chars; mode pill auto-highlights
     "Edit selection". Type "Make this more formal" → preview dialog
     shows before vs after → **Apply** replaces the selected sentence;
     **Cancel** leaves it alone.
   - Switch to another `.md` file → a fresh empty thread. Switch back →
     previous thread restored. Switch to a non-`.md` file → no bubble.
   - Force a provider error (e.g. kill `claude` binary, misconfigure):
     chat shows an inline error bubble with the readable message; panel
     stays usable.

No automated tests are added.

## Out of scope (explicit)

- Streaming token-by-token responses (still per-request spawn; spinner
  until full response).
- Persisting chat threads across app restarts.
- Multi-file context (`@filename` mentions) — chat is scoped to the
  current file only.
- Inline ghost-text suggestions while typing (was dropped in v1; still
  dropped).
- Agentic tool-using chats (filesystem search, git, etc.). This is a
  one-shot prompt/response per turn.
- Undo integration beyond Cmd-Z (no explicit "Undo apply" button in the
  chat for v1).
