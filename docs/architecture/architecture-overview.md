# Magenta IDE — Architecture Overview

This document describes the current layered architecture of Magenta IDE after the April 2026 refactor. It is the authoritative reference for how packages are structured, where new code should go, and what invariants must hold.

## Package Structure

```
packages/
  shared/          Zod schemas, TS types, IPC contracts, constants
  daemon/          Node.js background service (layered architecture below)
  main/            Electron main process (thin IPC router + lifecycle)
  ui/              React 19 renderer (layered architecture below)
```

## Daemon Architecture (packages/daemon)

The daemon follows a strict layered architecture. Dependencies flow downward only — upper layers may call lower layers, never the reverse.

```
┌─────────────────────────────────────────────────────────────┐
│  IPC Layer          (thin adapters, no business logic)       │
│  IPCBridge → createHandler() → handlers/*                    │
├─────────────────────────────────────────────────────────────┤
│  Application Layer  (orchestration, use-case services)       │
│  RepoAppService, SpecAppService, FileAppService,             │
│  WorktreeAppService, SessionAppService, ConfigAppService     │
├──────────────────────────┬──────────────────────────────────┤
│  Domain Layer            │  Infrastructure Layer             │
│  (pure logic, no I/O)   │  (I/O adapters)                   │
│  SpecParser              │  GitGateway                       │
│  AppError + toAppError() │  FileSystemGateway                │
│  ScanQueue               │  SpecGitGateway                   │
├──────────────────────────┴──────────────────────────────────┤
│  Data Access                                                 │
│  DatabaseService, RepoRepository, SpecRepository,            │
│  SessionManager, ConfigManager, mappers/*                    │
├─────────────────────────────────────────────────────────────┤
│  packages/shared                                             │
│  Zod schemas, TypeScript models, constants, config           │
└─────────────────────────────────────────────────────────────┘
```

### Directory Layout

```
packages/daemon/src/
  DaemonContainer.ts              Composition root (single wiring point)
  index.ts                        Bootstrap + lifecycle only

  application/                    Use-case orchestration
    RepoApplicationService.ts
    SpecApplicationService.ts
    FileApplicationService.ts
    WorktreeApplicationService.ts
    SessionApplicationService.ts
    ConfigApplicationService.ts

  domain/                         Pure logic, no I/O
    SpecParser.ts

  infrastructure/                 I/O adapters
    GitGateway.ts
    FileSystemGateway.ts
    SpecGitGateway.ts
    mappers/
      repoMapper.ts
      sessionMapper.ts

  ipc/                            Request/response transport
    IPCBridge.ts
    createHandler.ts
    registerHandlers.ts
    handlers/
      repoHandlers.ts
      specHandlers.ts
      fileHandlers.ts
      worktreeHandlers.ts
      sessionHandlers.ts
      configHandlers.ts

  services/                       Existing services (data access + background)
    DatabaseService, RepoRepository, SpecRepository,
    SessionManager, SpecReader, SpecSyncService,
    ScanQueue, RepoScanner, BackgroundJobManager,
    DirWatcher, FileWatcher

  config/
    ConfigManager.ts

  db/
    DatabaseService.ts, schema.ts, migrations/

  errors/
    AppError.ts
```

### Key Invariants

**IPC handlers are thin adapters.** They receive a validated, typed request from the bridge, call one application service method, and return the typed response. Handlers never access `fs`, `git`, or the database directly. They never contain try/catch — the `createHandler` wrapper handles errors.

**Request validation happens once at the boundary.** `IPCBridge.invoke()` validates every incoming payload against `IpcRequestSchema` from `packages/shared`. Handlers receive typed objects, not `unknown`.

**Errors are normalized.** Application services throw `AppError` with domain-specific codes (`FILE_NOT_FOUND`, `GIT_ERROR`, `WORKTREE_CONFLICT`, etc.). The `createHandler` wrapper catches them and returns typed IPC error responses via `toAppError()`.

**DaemonContainer is the single composition root.** All service construction and dependency injection happens here. No service constructs another service internally — dependencies are passed through constructors.

## Renderer Architecture (packages/ui)

```
┌─────────────────────────────────────────────────────────────┐
│  React Components + Hooks                                    │
│  Sidebar, RepoList, MainLayout, SpecTree,                    │
│  useSessionRestoration                                       │
├─────────────────────────────────────────────────────────────┤
│  Services (cross-cutting coordination)                       │
│  SessionCoordinator, ipcClient (sendOrThrow),                │
│  createStoreAction                                           │
├─────────────────────────────────────────────────────────────┤
│  Zustand Stores (state containers only)                      │
│  configStore, repoStore, specStore, sessionStore,            │
│  worktreeStore                                               │
├─────────────────────────────────────────────────────────────┤
│  IPC Bridge (Electron preload)                               │
│  ipc.send(), ipc.on(), selectFolder(), openInFileManager()   │
└─────────────────────────────────────────────────────────────┘
```

### Directory Layout

```
packages/ui/src/renderer/
  services/                       Cross-cutting coordination
    ipcClient.ts                  sendOrThrow, sendCommand, IpcError
    createStoreAction.ts          Async action factory for stores
    SessionCoordinator.ts         Cross-store coordination

  store/                          State containers (Zustand)
    configStore.ts
    repoStore.ts
    specStore.ts
    sessionStore.ts
    worktreeStore.ts

  hooks/
    useSessionRestoration.ts      App boot restoration (uses SessionCoordinator)

  utils/
    ipc.ts                        Low-level IPC bridge wrapper

  components/                     React components
```

### Key Invariants

**Stores never import each other.** Cross-store coordination goes through `SessionCoordinator`. This eliminates circular dependency workarounds (no more `Promise.resolve().then(() => import(...))` patterns).

**Stores are pure state containers.** They own state and expose actions. They do not orchestrate multi-store updates.

**`sendOrThrow` eliminates response branching.** Instead of checking `if (response.type === 'error')` in every store action, stores use `sendOrThrow()` which returns the typed success response or throws `IpcError`.

**`sessionStore.patchSession(partial)` replaces individual update methods.** One method handles all session state updates instead of 10 nearly identical methods.

**`SessionCoordinator` is the single point for cross-store operations.** Methods: `selectRepo()`, `selectSpec()`, `restoreSession()`, `validateSpecSelection()`.

## Shared Contracts (packages/shared)

All IPC communication is typed through Zod schemas defined in `packages/shared/src/ipc.ts`. The `IpcRequestSchema` and `IpcResponseSchema` are discriminated unions that provide compile-time type safety and runtime validation.

When adding a new IPC message type, update `IpcRequestSchema` and `IpcResponseSchema` in shared, then add the corresponding `ResponseForRequest` entry in `packages/ui/src/renderer/services/ipcClient.ts`.

## Architecture Diagrams

Visual diagrams are maintained as draw.io XML files in `docs/architecture/`:

- `daemon-layers.drawio.xml` — Daemon layer architecture (IPC → Application → Domain/Infrastructure → Data Access)
- `renderer-layers.drawio.xml` — Renderer layer architecture (Components → Services → Stores → IPC Bridge)
- `architecture-flow.drawio.xml` — Data flow between renderer, main process, and daemon
- `database-schema.drawio.xml` — SQLite database schema
