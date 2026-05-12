# CLAUDE.md

Authoritative reference for AI agents (and human contributors) working on the Magenta IDE codebase.

***

## Common Commands

Repo is a pnpm workspace (`pnpm@10.33.2`); `pnpm install` rebuilds `node-pty` and `lmdb` for Electron's ABI.

```bash
pnpm dev                                  # build all packages, launch Electron
pnpm dev:watch                            # watch mode, parallel
pnpm build | typecheck | lint | test      # recursive across packages

pnpm -C packages/daemon typecheck
pnpm -C packages/ui dev                   # esbuild watch
pnpm -C packages/ui dev:css               # Tailwind v4 watch

# E2E (Playwright) — handles its own build
pnpm test:e2e [:headed | :debug]
pnpm -C packages/e2e test:smoke
pnpm -C packages/e2e exec playwright test path/to/file.spec.ts

# Electron debug helpers (packages/e2e/scripts via tsx)
pnpm debug:launch
pnpm -C packages/e2e debug:click '<sel>' | debug:eval '<expr>' | debug:snapshot | debug:stop

# Distribution
pnpm pack                                 # unpacked app dir
pnpm dist[:mac|:win|:linux]
```

**Verification stops at `pnpm typecheck` + `pnpm build`.** Don't launch the app — Steven tests UI manually.

`lint`/`test` scripts are placeholders in `daemon`, `main`, `ui`. Real tests live in `packages/e2e` (Playwright + Playwright-BDD).

***

## Coding Behavior

1. **Think before coding.** State assumptions; ask if unclear; surface tradeoffs and simpler alternatives. Wrong assumptions cascade across `shared` → `daemon` → `ui`.
2. **Simplicity first.** Minimum code that solves the problem. No speculative abstractions, no error handling for impossible cases, no flexibility nobody asked for.
3. **Surgical changes.** Touch only what the task requires. Don't refactor adjacent code, reformat, or fix unrelated tech debt — mention it instead. Match existing style.
4. **Goal-driven execution.** Convert vague tasks into verifiable success criteria, then loop until typecheck + build are clean.

***

## Architecture

Electron 41.2.0 + React 19 desktop app, four packages:

* `packages/shared` — Zod schemas, types, IPC contracts, constants
* `packages/daemon` — Node.js background service (feature-module layout)
* `packages/main` — Electron main process (thin IPC router + lifecycle)
* `packages/ui` — React 19 renderer (Zustand stores, services, components)

Full docs: `docs/architecture/architecture-overview.md`.

**Layer order (deps flow downward only):**

```
[ui]      React + Hooks → Services → Zustand Stores → IPC Bridge
[daemon]  IPC → Application → Domain/Infra → Data Access → shared
```

***

## Daemon (`packages/daemon`)

### Source layout (feature modules)

```
packages/daemon/src/
├── core/                   # cross-cutting infra (ipc, db, errors, config, utils, observability)
├── modules/
│   ├── agent-cli/          # Claude/Copilot CLI integrations
│   │   ├── core/           # provider-agnostic interfaces
│   │   ├── claude/         # Claude-specific
│   │   ├── copilot/        # Copilot-specific
│   │   ├── sessions/       # BaseAISession, SessionFactory
│   │   ├── infra/          # AiCliGateway, CliVersionProbe, AiConfigRepository, PermissionPromptMcpServer
│   │   ├── app/            # ApplicationServices
│   │   ├── persistence/    # AiPresetRepository
│   │   └── handlers/       # ai*/agents*/cliVersion handlers
│   ├── repos/              # Git ApplicationServices, GitGateways, RepoRepository, repo+git handlers
│   ├── worktrees/
│   ├── specs/
│   ├── synced-sessions/
│   ├── filesystem/         # FileSystemGateway, FileWatcherGateway, TempFileGateway
│   ├── terminal/
│   ├── chat/
│   ├── config/             # OnboardApplicationService, PluginDirService
│   └── jobs/               # BackgroundJobManager, IpcEventSink
├── DaemonContainer.ts      # composition root (sole wiring point)
├── daemon-ipc-worker.ts    # entry point
└── index.ts
```

Each module owns its full vertical slice (`core/` → `infra/` → `app/` → `handlers/`).

### Adding a new IPC endpoint

1. Add variants to **both** `IpcRequestSchema` and `IpcResponseSchema` in `packages/shared/src/ipc.ts`.
2. Put orchestration in an Application Service under the relevant module's `app/` folder.
3. Add a thin handler under the module's `handlers/` folder using `safeHandle()`:
   ```ts
   safeHandle(bridge, "my-new-request", async (req) => myAppService.doSomething(req.someField));
   ```
4. Register and wire deps in `packages/daemon/src/core/ipc/registerHandlers.ts`.
5. Update `ResponseForRequest` in `packages/ui/src/renderer/services/ipcClient.ts`.

### Rules

* **Handlers** are thin adapters: typed request → one service call → typed response. No `fs`/`git`/db. No `try/catch` (the `createHandler` wrapper handles it). No `payload as Record<string, unknown>` casts.
* **Application services** throw `AppError` with a code from `AppErrorCode` (`packages/daemon/src/core/errors/AppError.ts`). Add new codes there when needed.
* **Domain (`core/`)** — pure logic, no I/O, no side effects.
* **Infrastructure (`infra/`)** wraps `fs`/`git`/network behind clean interfaces (`GitGateway`, `FileSystemGateway`, `SpecGitGateway`, etc.). Each module owns its own `mappers/` for persistence ↔ model conversion.
* **`DaemonContainer`** is the sole wiring point — services never construct other services internally.

***

## Renderer (`packages/ui`)

* **Stores are pure state containers.** They never import each other and never orchestrate cross-store updates.
* **Cross-store coordination goes through `SessionCoordinator`** (`services/SessionCoordinator.ts`) — `selectRepo`, `selectSpec`, `restoreSession`, `validateSpecSelection`. Add new cross-store ops as methods there.
* **Session updates** use `useSessionStore.getState().patchSession(partial)`. Don't add `updateX()` methods.
* **IPC calls** use `sendOrThrow<T>(req)` (returns typed success or throws `IpcError`) or `sendCommand(req)` (fire-and-forget). Never check `if (response.type === 'error')` manually. For loading/error patterns use `createAsyncAction()` from `services/createStoreAction.ts`.
* `ResponseForRequest` in `services/ipcClient.ts` must stay in sync with shared schemas.

***

## Shared (`packages/shared`)

* IPC types are Zod discriminated unions in `src/ipc.ts`. `IpcRequestSchema` validates every incoming request once at the boundary in `IPCBridge.invoke()`. Update **both** request and response schemas together.
* Model types (`Repository`, `SpecFolder`, `SessionState`, …) and shared constants live here.

***

## Testing

* **Domain** — unit-test pure functions, no mocks.
* **Application services** — mock gateways and repositories; test orchestration.
* **Handlers** — test through the handler with mock services; verify they're thin.
* **Stores** — test state transitions with `sendOrThrow` mocked.
* **Components** — prefer integration tests against real stores with mocked IPC.

***

## Tech stack

Electron 41.2.0 · React 19 · Vite · shadcn/ui · Tailwind CSS v4 · Zustand · CodeMirror 6 · Node.js 22 · LMDB · simple-git · Zod · Vitest · Playwright · electron-builder

***

## Superpowers preferences

* **Plan location:** save plans from `writing-plans` skill to `supers/plans/YYYY-MM-DD-<feature-name>.md` (repo-relative), not the default `docs/superpowers/plans/`. All downstream skills (`executing-plans`, `subagent-driven-development`) should use this path.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **multi-agent-ide** (7737 symbols, 13766 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/multi-agent-ide/context` | Codebase overview, check index freshness |
| `gitnexus://repo/multi-agent-ide/clusters` | All functional areas |
| `gitnexus://repo/multi-agent-ide/processes` | All execution flows |
| `gitnexus://repo/multi-agent-ide/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
