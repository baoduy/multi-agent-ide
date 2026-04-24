# AI Markdown Editor — repo-aware chat + auto-reload on disk change

Status: **Draft, ready for implementation**
Author: Claude (for Steven)
Date: 2026-04-24
Supersedes: the earlier MCP-based draft (parked; referenced in "Future" section).

## Goal

Two small wins for the Markdown editor's AI chat:

1. **Repo-aware Q&A.** The `ask` mode can answer questions using the currently open file *and* its neighbors in the working directory — not just the document text packed into the prompt.
2. **Auto-apply on disk change.** When the AI edits a file on disk (or anything else does), the editor picks up the change without the user closing and reopening the tab. If the user has unsaved edits that don't overlap, auto-merge; otherwise show a banner.

Success criteria (verifiable without launching the app):
- `pnpm typecheck` and `pnpm build` pass across all four packages.
- Unit tests cover: the 3-way merge logic (non-overlap merges, overlap conflicts) and the new file-watch push-event wiring.
- The `ai-chat:ask` handler spawns Claude with `cwd` set to the working-dir root and with the native file tools pre-approved.

## Non-goals (v1)

- No block-level edit ops. Claude writes through its native `Edit`/`Write` tools; we pick up the result via the watcher.
- No MCP server. That's the graduation path if this hits limits (see "Future").
- No `FileSystemGateway` enforcement of Claude's tool calls. Claude's `cwd` + optional `--add-dir`/deny flags are the blast-radius control for v1.
- No Copilot parity. Copilot CLI doesn't have comparable file tools; it keeps the existing packed-prompt flow.
- No changes to `edit-selection` or `modify-document` modes — they already work in-memory without touching disk.

## Current state we're changing

- `aiChatStore.sendAsk` sends `documentText` packed into the prompt. Model has no way to see other files.
- `AiCliGateway` already supports `cwd`, `allowedTools`, `permissionMode`, and streaming. No changes needed in the gateway itself.
- `FileViewer.tsx` reads a file once on open; no watcher, so external changes are invisible until the tab is closed and reopened.

## Design

### Part A — repo-aware `ask` mode

Concretely changes the behavior of `ai-chat:ask` only when the target file is markdown inside a registered working directory:

1. Resolve the working-directory root for the file (existing `RepoService` / working-dirs lookup; we already have this for spec chat).
2. Spawn `claude -p` with:
   - `cwd: <workingDirRoot>` so relative paths make sense and `CLAUDE.md` is loaded.
   - `allowedTools: ["Read", "Glob", "Grep"]` (read-only for `ask`; edits happen in their own path — see Part B).
   - `disallowedTools: ["Edit", "Write", "Bash"]` (defense in depth).
   - `permissionMode: "plan"` — same read-only mode spec-chat uses.
3. Drop `documentText` from the prompt. Replace with a short system-prompt append:
   > "The user is asking about the markdown file `<relativePath>`. Use the Read tool to read it. You may also use Read/Glob/Grep to inspect other files in this working directory."
4. Keep streaming + session resume exactly as today.

Selection context still gets inlined because it's small and the model can't guess what "this part" means otherwise:
> "They have the following text selected in that file: …"

### Part B — edit pipeline uses Write, watcher re-syncs the editor

`edit-selection` and `modify-document` keep working in-memory as today (they don't need repo awareness and they're cheap string replacements).

Net-new capability: a future "apply to file" button (or a new mode we'll call `agent-edit`) lets the model edit via native `Edit`/`Write`. In v1 we prepare the rails but don't ship a new UI mode — the existing auto-apply flow remains. What we ship:

1. **File watcher on the currently open file.** When `FileViewer` mounts a markdown file, it starts a watcher; on unmount, it stops it.
2. **Auto-merge on external change.** Renderer tracks three strings: `lastLoadedDisk`, `editorBuffer`, and — when the push event fires — `newDisk`. Apply 3-way merge (`diff3`-style, line-based). No conflict → silently update `editorBuffer` and `lastLoadedDisk`. Conflict → surface a banner: `[!] This file changed on disk. [Use mine] [Take disk] [Diff]`.
3. **Cursor/scroll preservation.** When auto-merge updates the buffer, map cursor position through the line diff (best-effort; fall back to top-of-doc on failure).

With this in place, any future "let the model Write to disk" path — including us simply pre-approving `Write` on a later mode — gets picked up for free.

### Package-level changes

**packages/shared**
- `src/ipc.ts` — add three variants to the discriminated unions:
  - Request `"file:watch"` `{ filePath }` → `"file:watched"` `{ watchId }`
  - Request `"file:unwatch"` `{ watchId }` → `"file:unwatched"` `{}`
  - Push event `"file:changed-on-disk"` `{ filePath, newContent, mtime }`
- Existing `"ai-chat:ask"` request stays shape-compatible; `documentText` becomes optional (still accepted for non-markdown/cold-start cases).

**packages/daemon**
- New `src/infrastructure/FileWatcherGateway.ts` — thin chokidar wrapper. Adds/removes watches by id; emits debounced change events (300 ms) to avoid firing during partial writes.
- New `src/application/FileWatchService.ts` — maps `watchId → filePath`; exposes `watch(filePath)` / `unwatch(watchId)`; pushes `file:changed-on-disk` via the existing push-event bus.
- New IPC handlers `fileWatchHandlers.ts` with `safeHandle()` — thin adapters calling `FileWatchService`.
- Modify the existing `ai-chat:ask` handler (in `aiEditHandlers.ts`) or its application service:
  - Detect markdown files and working-dir membership.
  - Set `cwd`, `allowedTools`, `disallowedTools`, `permissionMode`.
  - Use `systemPromptAppend` for the "read the file yourself" instruction.
  - Only pack `documentText` when the file is NOT in a working-dir (fallback). Selection still inlined.
- Add `AppErrorCode`: `FILE_WATCH_FAILED`.
- Wire `FileWatcherGateway` + `FileWatchService` in `DaemonContainer`.
- Register `fileWatchHandlers` in `registerHandlers.ts`.

**packages/ui**
- New `src/renderer/services/threeWayMerge.ts` — pure function: `merge(base, ours, theirs) → { ok: true, merged } | { ok: false, conflicts }`. Line-based; use `diff3` (already transitively in dep tree via `diff`; verify and add if missing).
- Modify `FileViewer.tsx`:
  - Register watcher via `sendOrThrow({ type: "file:watch", filePath })` on open; store `watchId`.
  - Unwatch on unmount and on `filePath` change.
  - Listen on `ipc.on("file:changed-on-disk", ...)`; when the event's `filePath` matches the mounted file, run 3-way merge with `lastLoadedDisk` / `editorBuffer` / `newContent`.
  - If `ok`, update `editorBuffer` via a new `BlockNoteEditor` imperative method `replaceMarkdownPreservingCursor(merged)` and update `lastLoadedDisk = newContent`.
  - If conflict, render the banner; user picks an action that either keeps `editorBuffer`, takes `newContent`, or opens a diff dialog.
- `BlockNoteEditor.tsx` — expose `replaceMarkdownPreservingCursor(md)` via `forwardRef`/imperative handle. Implementation: snapshot block-id-based cursor, swap content via existing `setMarkdown` path, find the same block-id (or nearest) and restore cursor.
- `aiChatStore.ts` — no structural change. Optionally trim the `documentText` payload for `sendAsk` when the daemon is expected to ignore it (saves IPC bytes), but acceptable to leave as-is.
- Banner component `FileChangedBanner.tsx` under `components/main/` — three buttons, opens a simple diff modal.

## Risks and mitigations

1. **`claude -p` + `--permission-mode plan` might still prompt on network calls or unfamiliar tools.** We already use this mode for spec chat, so the risk is low. Mitigation: if `ask` starts hanging, add `disallowedTools` more aggressively and fail-fast at 30 s via existing `timeoutMs`.
2. **Watcher fires during an in-progress save from inside the app.** If the app writes the file itself, chokidar will fire. Mitigation: FileWatchService tracks "recent self-writes" — when `file:write` handler runs, it stashes `{ filePath, content, mtime }` for ~1 s; the watcher suppresses the change event if it matches. Avoids the merge running against our own save.
3. **Debounce ≠ atomicity.** chokidar's default emits on every write; 300 ms debounce helps but a slow AI Write can still produce partial content. Mitigation: require file size to be stable for one debounce tick before emitting. If not, the editor will do a second merge when the file settles — idempotent, acceptable.
4. **BlockNote round-trip fidelity.** Re-parsing merged markdown may lose block-level nuances (custom block types). Mitigation: v1 only. Spec files mostly use prose + headings + lists, which round-trip cleanly. Add a regression test with a real sample.
5. **`diff3` may not be in the dep tree.** Check `packages/ui/package.json`; if absent, add `diff3` or use `diff` + a small hand-rolled 3-way. Either is a single dependency.

## Test plan

Unit (Vitest):
- `threeWayMerge`: base/ours/theirs variants — non-overlapping hunks produce merged output; overlapping hunks return conflicts; identical inputs pass through unchanged.
- `FileWatchService`: self-write suppression window works; unwatch is idempotent.
- `AiChatApplicationService`.`ask` path: asserts the right `cwd`, `allowedTools`, `permissionMode`, and that `documentText` is NOT sent for markdown-in-working-dir cases.

Integration:
- Playwright: open a markdown file, have a stub AI response that writes a sibling file; confirm the watcher doesn't fire on the open file; open the sibling → confirm its watcher fires and editor updates.
- Playwright: external `fs.writeFile` to the open file from outside (via a test hook); confirm auto-merge path updates the editor when the user hasn't typed, and shows the banner when the user's edits overlap.

Verification (per project convention): stop at `pnpm typecheck` + `pnpm build`. User tests manually.

## Work breakdown (TaskList)

1. Shared IPC schemas: `file:watch`, `file:unwatch`, `file:changed-on-disk` push.
2. Daemon: `FileWatcherGateway` (chokidar wrapper with debounce + stability check).
3. Daemon: `FileWatchService` (id map + self-write suppression window).
4. Daemon: `fileWatchHandlers` via `safeHandle()`, register in `registerHandlers.ts`.
5. Daemon: wire gateways/services into `DaemonContainer`.
6. Daemon: extend `ai-chat:ask` handler — cwd, tools, permissionMode, drop documentText in markdown+workingdir case.
7. Self-write suppression: hook into `file:write` handler to record recent writes.
8. UI: `threeWayMerge` pure function + tests.
9. UI: `BlockNoteEditor.replaceMarkdownPreservingCursor` imperative method.
10. UI: `FileViewer` watcher registration + change handling (merge or banner).
11. UI: `FileChangedBanner` component + diff modal.
12. UI: `ResponseForRequest` typing updated in `ipcClient.ts`.
13. Tests: unit coverage for merge, watch service, ask handler shape.
14. Verify: `pnpm typecheck` and `pnpm build` pass.

## Future (if v1 isn't enough)

- **Block-level edit ops.** If users complain that whole-file rewrites blow away their cursor or formatting, resurrect the MCP plan and add `magenta.doc.applyEdit` so the model can target block ids. Graduation path, not a rewrite — the file-watcher infrastructure from v1 stays relevant.
- **FileSystemGateway-enforced tool calls.** If security concerns bite, swap Claude's native tools for MCP-routed equivalents that go through the gateway's allowlist.
- **Streaming edits.** Same MCP path; v1's watcher-based update is one-shot.

## What I want confirmed before coding

- "Working directory" = the user's registered `working_dirs` row for the opened file's tree. Confirmed.
- Banner UX: "Use mine / Take disk / Diff" — three buttons, diff opens a modal. OK as v1?
- Self-write suppression window of ~1 s — acceptable, or do you want a stronger signal (e.g., mtime comparison)?
