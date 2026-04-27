# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This file is the authoritative reference for AI agents (and human contributors) working on the Magenta IDE codebase. Follow these rules when implementing new features, fixing bugs, or refactoring.

***

## Common Commands

Run from the repo root unless noted. The repo is a pnpm workspace (`pnpm@10.33.2`); install with `pnpm install` (postinstall rebuilds `node-pty` and `lmdb` for Electron's ABI).

```bash
# Develop the Electron app (builds all packages, then launches the main process)
pnpm dev

# Watch mode across all packages in parallel (rebuilds on file change)
pnpm dev:watch

# Build / typecheck / lint / test across all packages (recursive)
pnpm build
pnpm typecheck
pnpm lint
pnpm test

# Per-package work (use -C to scope a script to one package)
pnpm -C packages/daemon typecheck
pnpm -C packages/ui dev          # esbuild watch
pnpm -C packages/ui dev:css      # Tailwind v4 watch (separate process)

# E2E (Playwright) — requires a fresh build first; the script handles that
pnpm test:e2e                    # all projects
pnpm test:e2e:headed             # show the Electron window
pnpm test:e2e:debug              # Playwright Inspector
pnpm -C packages/e2e test:smoke  # smoke project only
pnpm -C packages/e2e exec playwright test path/to/file.spec.ts   # single file

# Electron debug helpers (packages/e2e/scripts, run via tsx)
pnpm debug:launch                                  # launch Electron with CDP attached
pnpm -C packages/e2e debug:click '<selector>'
pnpm -C packages/e2e debug:eval '<expression>'
pnpm -C packages/e2e debug:snapshot
pnpm -C packages/e2e debug:stop

# Distribution
pnpm pack            # unpacked app dir
pnpm dist[:mac|:win|:linux]
```

**Verification scope per project convention:** stop at `pnpm typecheck` + `pnpm build`. Don't launch the app — the user tests UI changes manually (see `feedback_verification.md`).

**Linters/unit tests are not wired up in&#x20;**`packages/daemon`**,&#x20;**`packages/main`**, or&#x20;**`packages/ui`**&#x20;today** — their `lint`/`test` scripts echo placeholders. Automated tests live in `packages/e2e` (Playwright + Playwright-BDD).

***

## Coding Behavior (Read First)

These four principles govern *how* you work in this repo. The architecture rules below govern *where* things go. When they conflict, behavior wins — a clean architecture built on wrong assumptions is still wrong. Bias toward caution over speed; for trivial edits, use judgment.

### 1. Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs before touching code.

* State assumptions explicitly. If you're uncertain, ask — don't guess.

* If multiple valid interpretations exist, list them and let the user pick. Don't silently choose.

* If a simpler approach exists than what was requested, say so and push back when warranted.

* If something is unclear, stop. Name what's confusing. Ask one concrete question.

This project has layered architecture with strict rules — a wrong assumption here usually means rewriting across `shared` → `daemon` → `ui`. Cheaper to ask.

### 2. Simplicity First

Write the minimum code that solves the problem. Nothing speculative.

* No features beyond what was asked.

* No abstractions for single-use code. Three similar lines beats a premature helper.

* No "flexibility" or configurability that wasn't requested.

* No error handling for scenarios that can't happen (trust internal invariants; validate only at system boundaries — IPC, `fs`, user input).

* If you wrote 200 lines and 50 would do, rewrite it.

Senior-engineer test: would they say this is overcomplicated? If yes, simplify.

### 3. Surgical Changes

Touch only what the task requires. Clean up only your own mess.

* Don't "improve" adjacent code, comments, formatting, or imports you didn't need to change.

* Don't refactor working code that isn't in scope. If you spot unrelated dead code or tech debt, **mention it** — don't delete it. (`mcp__ccd_session__spawn_task` is the right venue for out-of-scope cleanups.)

* Match existing style even if you'd do it differently. Consistency beats personal preference.

* Remove imports/variables/functions that *your* changes orphaned. Don't remove pre-existing dead code unless asked.

Test: every changed line should trace directly to the user's request. Drive-by edits expand review surface and cause regressions.

### 4. Goal-Driven Execution

Turn vague tasks into verifiable success criteria, then loop until they're met.

* "Add validation" → "Inputs X, Y, Z rejected with error code V; typecheck + build clean."

* "Fix the bug" → "Reproduce steps no longer produce the error; related behavior unchanged."

* "Refactor X" → "Public API unchanged; typecheck + build clean; no new warnings."

For multi-step work, state a brief plan up front:

```text
1. [step] → verify: [check]
2. [step] → verify: [check]
```

Per project convention, verification stops at **typecheck + build** — don't launch the app; the user tests manually (see `feedback_verification.md`). Strong criteria let you finish without check-ins; weak criteria ("make it work") produce thrash.

**These guidelines are working when:** diffs contain no unrelated changes, no rewrites triggered by overcomplication, and clarifying questions come *before* implementation rather than after mistakes.

***

## Architecture at a Glance

Magenta IDE is an Electron 41.2.0 + React 19 desktop app with four packages:

* **packages/shared** — Zod schemas, TypeScript types, IPC contracts, constants

* **packages/daemon** — Node.js background service (layered architecture)

* **packages/main** — Electron main process (thin IPC router + lifecycle)

* **packages/ui** — React 19 renderer (Zustand stores, services, components)

Full architecture documentation lives in `docs/architecture/architecture-overview.md`.

***

## Daemon Rules (packages/daemon)

### Layer Order (dependencies flow downward only)

```text
IPC Layer  →  Application Layer  →  Domain / Infrastructure  →  Data Access  →  shared
```

Upper layers may call lower layers. **Never the reverse.**

### Source Layout (Feature Modules)

The daemon is organized by feature module, not by architectural layer. Top-level structure:

```text
packages/daemon/src/
├── core/                # cross-cutting infra (ipc, db, errors, config, utils, observability)
├── modules/
│   ├── agent-cli/       # Claude/Copilot CLI integrations
│   │   ├── core/        # provider-agnostic interfaces & shared logic
│   │   ├── claude/      # Claude-specific (argv, sessionParser, ClaudeSession, ClaudeAgentsGateway)
│   │   ├── copilot/     # Copilot-specific (argv, sessionParser, builtinAgents, CopilotSession)
│   │   ├── sessions/    # BaseAISession, SessionFactory
│   │   ├── infra/       # AiCliGateway, CliVersionProbe, AiConfigRepository, PermissionPromptMcpServer
│   │   ├── app/         # AISession/AiEdit/AiBareRun/AIRunOnce/CliVersion/AiPreset/Agent ApplicationServices
│   │   ├── persistence/ # AiPresetRepository
│   │   └── handlers/    # ai*Handlers, agentsHandlers, cliVersionHandlers
│   ├── repos/           # Git*ApplicationServices, Git*Gateways, RepoRepository, repo+git handlers
│   ├── worktrees/       # Worktree app/persistence/mappers/handlers
│   ├── specs/           # SpecApplicationService, SpecGitGateway, SpecParser, SpecReader, SpecRepository
│   ├── synced-sessions/ # SessionSyncApplicationService, SessionSyncGateway, SyncedSessionRepository
│   ├── filesystem/      # FileSystemGateway, FileWatcherGateway, TempFileGateway, file handlers
│   ├── terminal/        # TerminalApplicationService, SessionCore (PTY), terminalHandlers
│   ├── chat/            # ChatThreadService + ChatThreadRepository + chatThreadHandlers
│   ├── config/          # OnboardApplicationService, PluginDirService + handlers (user config)
│   └── jobs/            # BackgroundJobManager, IpcEventSink
├── DaemonContainer.ts   # composition root
├── daemon-ipc-worker.ts # entry point
└── index.ts             # bootstrapDaemon export
```

Each module owns its full vertical slice (`core/` → `infra/` → `app/` → `handlers/`). Subfolder names encode the architectural layer.

### Adding a New IPC Endpoint

1. **Define the schema** in `packages/shared/src/ipc.ts` — add a new variant to both `IpcRequestSchema` and `IpcResponseSchema` discriminated unions.

2. **Create or extend an Application Service** in the relevant module's `app/` folder (e.g. `packages/daemon/src/modules/repos/app/`). The service method should contain all orchestration logic.

3. **Add a thin handler** in the module's `handlers/` folder (e.g. `packages/daemon/src/modules/repos/handlers/`) using `safeHandle()`:

```typescript
safeHandle(bridge, "my-new-request", async (req) => {
  return myAppService.doSomething(req.someField);
});
```

1. **Wire dependencies** in `packages/daemon/src/core/ipc/registerHandlers.ts` — instantiate any new application services there and pass them to the handler registration function.

2. **Update&#x20;**`ResponseForRequest` in `packages/ui/src/renderer/services/ipcClient.ts` so the renderer gets typed responses.

### Handler Rules

* Handlers are **thin adapters**: receive typed request, call one service method, return typed response.

* Handlers **never** access `fs`, `git`, or the database directly.

* Handlers **never** contain `try/catch` — the `createHandler` wrapper handles all error normalization.

* Handlers **never** cast payloads (`payload as Record<string, unknown>` is banned).

### Error Handling

* Application services throw `AppError` with a domain-specific code from `AppErrorCode`:

```typescript
throw new AppError("FILE_NOT_FOUND", `File not found: ${filePath}`);
```

* The `createHandler` wrapper catches errors and normalizes them via `toAppError()`.

* Valid error codes: `INTERNAL_ERROR`, `VALIDATION_ERROR`, `NOT_FOUND`, `IPC_ERROR`, `REPO_NOT_FOUND`, `SPEC_PARSE_ERROR`, `FILE_TOO_LARGE`, `FILE_NOT_FOUND`, `WORKTREE_CONFLICT`, `GIT_ERROR`, `CONFIG_ERROR`.

* Add new codes to `packages/daemon/src/core/errors/AppError.ts` when needed.

### Domain / `core/` Logic

* **Pure logic only** — no `fs`, no `git`, no network, no database.

* Functions receive data, return data. Side-effect free.

* Lives in each module's `core/` subfolder (e.g. `modules/specs/core/SpecParser.ts`, `modules/agent-cli/core/streamJsonParser.ts`).

* Example: `SpecParser.parseTasksContent(content: string)` parses markdown, returns structured data.

### Infrastructure (`infra/`) Layer

* **I/O adapters** — wrap external systems (`fs`, `git`, network) behind clean interfaces.

* Lives in each module's `infra/` subfolder.

* `GitGateway` (`modules/repos/infra/`) — worktree operations (create, list, gitignore management).

* `FileSystemGateway` (`modules/filesystem/infra/`) — file read/write/list with `AppError` wrapping.

* `SpecGitGateway` (`modules/specs/infra/`) — git commands for spec access (branches, file reading).

* Mappers — each module owns its own `mappers/` folder for persistence ↔ model conversion helpers.

### Composition Root

* `DaemonContainer` is the **single wiring point**. All service construction and dependency injection happens here.

* No service constructs another service internally — dependencies are passed through constructors.

* To add a new service: instantiate it in `DaemonContainer`, expose it as a `readonly` property.

***

## Renderer Rules (packages/ui)

### Layer Order

```text
React Components + Hooks  →  Services  →  Zustand Stores  →  IPC Bridge
```

### Stores Are Pure State Containers

* Stores own state and expose actions. They **do not** orchestrate multi-store updates.

* **Stores never import each other.** Cross-store coordination goes through `SessionCoordinator`.

* No `Promise.resolve().then(() => import('./otherStore'))` patterns — these are banned.

### Adding a New Store Action

1. Use `sendOrThrow()` for IPC calls — it returns the typed success response or throws `IpcError`:

```typescript
const response = await sendOrThrow({ type: "my-request", ... });
```

1. For standardized loading/error patterns, use `createAsyncAction()` from `services/createStoreAction.ts`.

2. **Never** check `if (response.type === 'error')` manually — `sendOrThrow` handles this.

### Cross-Store Operations

All cross-store coordination goes through `SessionCoordinator` (`services/SessionCoordinator.ts`):

* `SessionCoordinator.selectRepo(path)` — updates repoStore + sessionStore atomically

* `SessionCoordinator.selectSpec(path)` — updates specStore + sessionStore atomically

* `SessionCoordinator.restoreSession()` — boot-time restoration across all stores

* `SessionCoordinator.validateSpecSelection()` — ensures spec selection is still valid

To add a new cross-store operation: add a method to `SessionCoordinator`, not to a store.

### Session State Updates

Use `sessionStore.patchSession(partial)` for all session state updates:

```typescript
useSessionStore.getState().patchSession({ selectedRepoPath: path, selectedSpecPath: null });
```

Do **not** add individual `updateX()` methods to sessionStore.

### IPC Client

* `sendOrThrow<T>(request)` — typed, throws `IpcError` on failure

* `sendCommand(request)` — fire-and-forget (no return value needed)

* Type map `ResponseForRequest` in `services/ipcClient.ts` must stay in sync with shared schemas

***

## Shared Package Rules (packages/shared)

* All IPC message types are defined as Zod discriminated unions in `src/ipc.ts`.

* `IpcRequestSchema` validates every incoming daemon request (validation happens once, at the boundary, in `IPCBridge.invoke()`).

* When adding a new message type, update **both** `IpcRequestSchema` and `IpcResponseSchema`.

* TypeScript model types (`Repository`, `SpecFolder`, `SessionState`, etc.) live here.

* Constants and configuration shared between daemon and renderer live here.

***

## Anti-Patterns (Do Not Do)

| Anti-Pattern                                          | Correct Approach                                                        |
| ----------------------------------------------------- | ----------------------------------------------------------------------- |
| `payload as Record<string, unknown>` in handlers      | Handlers receive typed `IpcRequest` variants via `safeHandle()`         |
| `try/catch` in IPC handlers                           | `createHandler` wrapper handles errors automatically                    |
| Store A imports Store B                               | Use `SessionCoordinator` for cross-store operations                     |
| `Promise.resolve().then(() => import(...))` in stores | Use `SessionCoordinator`                                                |
| `fs.readFile()` in a handler                          | Delegate to `FileSystemGateway` via an Application Service              |
| `git.raw(...)` in a handler                           | Delegate to `GitGateway` or `SpecGitGateway` via an Application Service |
| Manual `if (response.type === 'error')` in UI         | Use `sendOrThrow()` which throws `IpcError`                             |
| Adding `updateSpecificField()` to sessionStore        | Use `patchSession({ field: value })`                                    |
| Constructing services inside other services           | Wire dependencies in `DaemonContainer`                                  |

***

## Testing Guidelines

* **Domain layer** — Unit test pure functions directly. No mocks needed.

* **Application services** — Mock infrastructure gateways and repositories. Test orchestration logic.

* **IPC handlers** — Test through the handler function with mock application services. Verify they are thin (no logic to test beyond delegation).

* **Stores** — Test state transitions. Mock `sendOrThrow` for IPC calls.

* **Components** — Prefer integration tests that exercise real stores with mocked IPC.

***

## File Organization Checklist

When adding a new feature, verify these locations:

* [ ] Zod schemas added to `packages/shared/src/ipc.ts`
* [ ] Application Service created/extended in the relevant module's `app/` folder (e.g. `packages/daemon/src/modules/repos/app/`)
* [ ] Handler added in the module's `handlers/` folder (e.g. `packages/daemon/src/modules/repos/handlers/`) using `safeHandle()`
* [ ] Handler registered in `packages/daemon/src/core/ipc/registerHandlers.ts`
* [ ] `ResponseForRequest` updated in `packages/ui/src/renderer/services/ipcClient.ts`
* [ ] Store action uses `sendOrThrow()` (not manual error checking)
* [ ] Cross-store operations go through `SessionCoordinator`
* [ ] New daemon services wired in `DaemonContainer`
* [ ] Infrastructure I/O wrapped in a Gateway class
* [ ] Row mappers used for any new database tables

***

## Tech Stack Reference

Electron 41.2.0 · React 19 · Vite · shadcn/ui · Tailwind CSS v4 · Zustand · CodeMirror 6 · Node.js 22 · LMDB (embedded, memory-mapped key-value store) · simple-git · Zod · Vitest · Playwright · electron-builder

***

## Superpowers Preferences

These override defaults in the `obra/superpowers` plugin. Per its `using-superpowers` skill, CLAUDE.md instructions take precedence over skill defaults.

* **Plan location:** Save plans written by the `writing-plans` skill to `supers/plans/YYYY-MM-DD-<feature-name>.md` (repo-relative), **not** the default `docs/superpowers/plans/`. All references to the plan path in subsequent skills (`executing-plans`, `subagent-driven-development`, etc.) should use this location.

# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**Always prefix commands with&#x20;**`rtk`. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with `&&`, use `rtk`:

```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
rtk git add . && rtk git commit -m "msg" && rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)

```bash
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file (80%)
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
rtk next build          # Next.js build with route metrics (87%)
```

### Test (60-99% savings)

```bash
rtk cargo test          # Cargo test failures only (90%)
rtk go test             # Go test failures only (90%)
rtk jest                # Jest failures only (99.5%)
rtk vitest              # Vitest failures only (99.5%)
rtk playwright test     # Playwright failures only (94%)
rtk pytest              # Python test failures only (90%)
rtk rake test           # Ruby test failures only (90%)
rtk rspec               # RSpec test failures only (60%)
rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)

```bash
rtk git status          # Compact status
rtk git log             # Compact log (works with all git flags)
rtk git diff            # Compact diff (80%)
rtk git show            # Compact show (80%)
rtk git add             # Ultra-compact confirmations (59%)
rtk git commit          # Ultra-compact confirmations (59%)
rtk git push            # Ultra-compact confirmations
rtk git pull            # Ultra-compact confirmations
rtk git branch          # Compact branch list
rtk git fetch           # Compact fetch
rtk git stash           # Compact stash
rtk git worktree        # Compact worktree
```

Note: Git passthrough works for ALL subcommands, even those not explicitly listed.

### GitHub (26-87% savings)

```bash
rtk gh pr view <num>    # Compact PR view (87%)
rtk gh pr checks        # Compact PR checks (79%)
rtk gh run list         # Compact workflow runs (82%)
rtk gh issue list       # Compact issue list (80%)
rtk gh api              # Compact API responses (26%)
```

### JavaScript/TypeScript Tooling (70-90% savings)

```bash
rtk pnpm list           # Compact dependency tree (70%)
rtk pnpm outdated       # Compact outdated packages (80%)
rtk pnpm install        # Compact install output (90%)
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
rtk prisma              # Prisma without ASCII art (88%)
```

### Files & Search (60-75% savings)

```bash
rtk ls <path>           # Tree format, compact (65%)
rtk read <file>         # Code reading with filtering (60%)
rtk grep <pattern>      # Search grouped by file (75%)
rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)

```bash
rtk err <cmd>           # Filter errors only from any command
rtk log <file>          # Deduplicated logs with counts
rtk json <file>         # JSON structure without values
rtk deps                # Dependency overview
rtk env                 # Environment variables compact
rtk summary <cmd>       # Smart summary of command output
rtk diff                # Ultra-compact diffs
```

### Infrastructure (85% savings)

```bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
rtk kubectl get         # Compact resource list
rtk kubectl logs        # Deduplicated pod logs
```

### Network (65-70% savings)

```bash
rtk curl <url>          # Compact HTTP responses (70%)
rtk wget <url>          # Compact download output (65%)
```

### Meta Commands

```bash
rtk gain                # View token savings statistics
rtk gain --history      # View command history with savings
rtk discover            # Analyze Claude Code sessions for missed RTK usage
rtk proxy <cmd>         # Run command without filtering (for debugging)
rtk init                # Add RTK instructions to CLAUDE.md
rtk init --global       # Add RTK to ~/.claude/CLAUDE.md
```

## Token Savings Overview

| Category         | Commands                       | Typical Savings |
| ---------------- | ------------------------------ | --------------- |
| Tests            | vitest, playwright, cargo test | 90-99%          |
| Build            | next, tsc, lint, prettier      | 70-87%          |
| Git              | status, log, diff, add, commit | 59-80%          |
| GitHub           | gh pr, gh run, gh issue        | 26-87%          |
| Package Managers | pnpm, npm, npx                 | 70-90%          |
| Files            | ls, read, grep, find           | 60-75%          |
| Infrastructure   | docker, kubectl                | 85%             |
| Network          | curl, wget                     | 65-70%          |

Overall average: **60-90% token reduction** on common development operations.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->
