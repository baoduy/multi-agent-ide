# CLAUDE.md — Magenta IDE Development Guide

This file is the authoritative reference for AI agents (and human contributors) working on the Magenta IDE codebase. Follow these rules when implementing new features, fixing bugs, or refactoring.

---

## Coding Behavior (Read First)

These four principles govern *how* you work in this repo. The architecture rules below govern *where* things go. When they conflict, behavior wins — a clean architecture built on wrong assumptions is still wrong. Bias toward caution over speed; for trivial edits, use judgment.

### 1. Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs before touching code.

- State assumptions explicitly. If you're uncertain, ask — don't guess.
- If multiple valid interpretations exist, list them and let the user pick. Don't silently choose.
- If a simpler approach exists than what was requested, say so and push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask one concrete question.

This project has layered architecture with strict rules — a wrong assumption here usually means rewriting across `shared` → `daemon` → `ui`. Cheaper to ask.

### 2. Simplicity First

Write the minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code. Three similar lines beats a premature helper.
- No "flexibility" or configurability that wasn't requested.
- No error handling for scenarios that can't happen (trust internal invariants; validate only at system boundaries — IPC, `fs`, user input).
- If you wrote 200 lines and 50 would do, rewrite it.

Senior-engineer test: would they say this is overcomplicated? If yes, simplify.

### 3. Surgical Changes

Touch only what the task requires. Clean up only your own mess.

- Don't "improve" adjacent code, comments, formatting, or imports you didn't need to change.
- Don't refactor working code that isn't in scope. If you spot unrelated dead code or tech debt, **mention it** — don't delete it. (`mcp__ccd_session__spawn_task` is the right venue for out-of-scope cleanups.)
- Match existing style even if you'd do it differently. Consistency beats personal preference.
- Remove imports/variables/functions that *your* changes orphaned. Don't remove pre-existing dead code unless asked.

Test: every changed line should trace directly to the user's request. Drive-by edits expand review surface and cause regressions.

### 4. Goal-Driven Execution

Turn vague tasks into verifiable success criteria, then loop until they're met.

- "Add validation" → "Inputs X, Y, Z rejected with error code V; typecheck + build clean."
- "Fix the bug" → "Reproduce steps no longer produce the error; related behavior unchanged."
- "Refactor X" → "Public API unchanged; typecheck + build clean; no new warnings."

For multi-step work, state a brief plan up front:

```
1. [step] → verify: [check]
2. [step] → verify: [check]
```

Per project convention, verification stops at **typecheck + build** — don't launch the app; the user tests manually (see `feedback_verification.md`). Strong criteria let you finish without check-ins; weak criteria ("make it work") produce thrash.

**These guidelines are working when:** diffs contain no unrelated changes, no rewrites triggered by overcomplication, and clarifying questions come *before* implementation rather than after mistakes.

---

## Architecture at a Glance

Magenta IDE is an Electron 41.2.0 + React 19 desktop app with four packages:

- **packages/shared** — Zod schemas, TypeScript types, IPC contracts, constants
- **packages/daemon** — Node.js background service (layered architecture)
- **packages/main** — Electron main process (thin IPC router + lifecycle)
- **packages/ui** — React 19 renderer (Zustand stores, services, components)

Full architecture documentation lives in `docs/architecture/architecture-overview.md`.

---

## Daemon Rules (packages/daemon)

### Layer Order (dependencies flow downward only)

```
IPC Layer  →  Application Layer  →  Domain / Infrastructure  →  Data Access  →  shared
```

Upper layers may call lower layers. **Never the reverse.**

### Adding a New IPC Endpoint

1. **Define the schema** in `packages/shared/src/ipc.ts` — add a new variant to both `IpcRequestSchema` and `IpcResponseSchema` discriminated unions.
2. **Create or extend an Application Service** in `packages/daemon/src/application/`. The service method should contain all orchestration logic.
3. **Add a thin handler** in `packages/daemon/src/ipc/handlers/` using `safeHandle()`:
   ```typescript
   safeHandle(bridge, "my-new-request", async (req) => {
     return myAppService.doSomething(req.someField);
   });
   ```
4. **Wire dependencies** in `packages/daemon/src/ipc/registerHandlers.ts` — instantiate any new application services there and pass them to the handler registration function.
5. **Update `ResponseForRequest`** in `packages/ui/src/renderer/services/ipcClient.ts` so the renderer gets typed responses.

### Handler Rules

- Handlers are **thin adapters**: receive typed request, call one service method, return typed response.
- Handlers **never** access `fs`, `git`, or the database directly.
- Handlers **never** contain `try/catch` — the `createHandler` wrapper handles all error normalization.
- Handlers **never** cast payloads (`payload as Record<string, unknown>` is banned).

### Error Handling

- Application services throw `AppError` with a domain-specific code from `AppErrorCode`:
  ```typescript
  throw new AppError("FILE_NOT_FOUND", `File not found: ${filePath}`);
  ```
- The `createHandler` wrapper catches errors and normalizes them via `toAppError()`.
- Valid error codes: `INTERNAL_ERROR`, `VALIDATION_ERROR`, `NOT_FOUND`, `IPC_ERROR`, `REPO_NOT_FOUND`, `SPEC_PARSE_ERROR`, `FILE_TOO_LARGE`, `FILE_NOT_FOUND`, `WORKTREE_CONFLICT`, `GIT_ERROR`, `CONFIG_ERROR`.
- Add new codes to `packages/daemon/src/errors/AppError.ts` when needed.

### Domain Layer (packages/daemon/src/domain/)

- **Pure logic only** — no `fs`, no `git`, no network, no database.
- Functions receive data, return data. Side-effect free.
- Example: `SpecParser.parseTasksContent(content: string)` parses markdown, returns structured data.

### Infrastructure Layer (packages/daemon/src/infrastructure/)

- **I/O adapters** — wrap external systems (`fs`, `git`, network) behind clean interfaces.
- `GitGateway` — worktree operations (create, list, gitignore management).
- `FileSystemGateway` — file read/write/list with `AppError` wrapping.
- `SpecGitGateway` — git commands for spec access (branches, file reading).
- Mappers (`infrastructure/mappers/`) — centralize any persistence ↔ model conversion helpers (e.g. legacy SyncedSession and Worktree mapper shapes).

### Composition Root

- `DaemonContainer` is the **single wiring point**. All service construction and dependency injection happens here.
- No service constructs another service internally — dependencies are passed through constructors.
- To add a new service: instantiate it in `DaemonContainer`, expose it as a `readonly` property.

---

## Renderer Rules (packages/ui)

### Layer Order

```
React Components + Hooks  →  Services  →  Zustand Stores  →  IPC Bridge
```

### Stores Are Pure State Containers

- Stores own state and expose actions. They **do not** orchestrate multi-store updates.
- **Stores never import each other.** Cross-store coordination goes through `SessionCoordinator`.
- No `Promise.resolve().then(() => import('./otherStore'))` patterns — these are banned.

### Adding a New Store Action

1. Use `sendOrThrow()` for IPC calls — it returns the typed success response or throws `IpcError`:
   ```typescript
   const response = await sendOrThrow({ type: "my-request", ... });
   ```
2. For standardized loading/error patterns, use `createAsyncAction()` from `services/createStoreAction.ts`.
3. **Never** check `if (response.type === 'error')` manually — `sendOrThrow` handles this.

### Cross-Store Operations

All cross-store coordination goes through `SessionCoordinator` (`services/SessionCoordinator.ts`):

- `SessionCoordinator.selectRepo(path)` — updates repoStore + sessionStore atomically
- `SessionCoordinator.selectSpec(path)` — updates specStore + sessionStore atomically
- `SessionCoordinator.restoreSession()` — boot-time restoration across all stores
- `SessionCoordinator.validateSpecSelection()` — ensures spec selection is still valid

To add a new cross-store operation: add a method to `SessionCoordinator`, not to a store.

### Session State Updates

Use `sessionStore.patchSession(partial)` for all session state updates:
```typescript
useSessionStore.getState().patchSession({ selectedRepoPath: path, selectedSpecPath: null });
```
Do **not** add individual `updateX()` methods to sessionStore.

### IPC Client

- `sendOrThrow<T>(request)` — typed, throws `IpcError` on failure
- `sendCommand(request)` — fire-and-forget (no return value needed)
- Type map `ResponseForRequest` in `services/ipcClient.ts` must stay in sync with shared schemas

---

## Shared Package Rules (packages/shared)

- All IPC message types are defined as Zod discriminated unions in `src/ipc.ts`.
- `IpcRequestSchema` validates every incoming daemon request (validation happens once, at the boundary, in `IPCBridge.invoke()`).
- When adding a new message type, update **both** `IpcRequestSchema` and `IpcResponseSchema`.
- TypeScript model types (`Repository`, `SpecFolder`, `SessionState`, etc.) live here.
- Constants and configuration shared between daemon and renderer live here.

---

## Anti-Patterns (Do Not Do)

| Anti-Pattern | Correct Approach |
|---|---|
| `payload as Record<string, unknown>` in handlers | Handlers receive typed `IpcRequest` variants via `safeHandle()` |
| `try/catch` in IPC handlers | `createHandler` wrapper handles errors automatically |
| Store A imports Store B | Use `SessionCoordinator` for cross-store operations |
| `Promise.resolve().then(() => import(...))` in stores | Use `SessionCoordinator` |
| `fs.readFile()` in a handler | Delegate to `FileSystemGateway` via an Application Service |
| `git.raw(...)` in a handler | Delegate to `GitGateway` or `SpecGitGateway` via an Application Service |
| Manual `if (response.type === 'error')` in UI | Use `sendOrThrow()` which throws `IpcError` |
| Adding `updateSpecificField()` to sessionStore | Use `patchSession({ field: value })` |
| Constructing services inside other services | Wire dependencies in `DaemonContainer` |

---

## Testing Guidelines

- **Domain layer** — Unit test pure functions directly. No mocks needed.
- **Application services** — Mock infrastructure gateways and repositories. Test orchestration logic.
- **IPC handlers** — Test through the handler function with mock application services. Verify they are thin (no logic to test beyond delegation).
- **Stores** — Test state transitions. Mock `sendOrThrow` for IPC calls.
- **Components** — Prefer integration tests that exercise real stores with mocked IPC.

---

## File Organization Checklist

When adding a new feature, verify these locations:

- [ ] Zod schemas added to `packages/shared/src/ipc.ts`
- [ ] Application Service created/extended in `packages/daemon/src/application/`
- [ ] Handler added in `packages/daemon/src/ipc/handlers/` using `safeHandle()`
- [ ] Handler registered in `packages/daemon/src/ipc/registerHandlers.ts`
- [ ] `ResponseForRequest` updated in `packages/ui/src/renderer/services/ipcClient.ts`
- [ ] Store action uses `sendOrThrow()` (not manual error checking)
- [ ] Cross-store operations go through `SessionCoordinator`
- [ ] New daemon services wired in `DaemonContainer`
- [ ] Infrastructure I/O wrapped in a Gateway class
- [ ] Row mappers used for any new database tables

---

## Tech Stack Reference

Electron 41.2.0 · React 19 · Vite · shadcn/ui · Tailwind CSS v4 · Zustand · CodeMirror 6 · Node.js 22 · LMDB (embedded, memory-mapped key-value store) · simple-git · Zod · Vitest · Playwright · electron-builder
