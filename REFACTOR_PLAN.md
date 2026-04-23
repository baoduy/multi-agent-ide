# Magenta IDE — Architecture Refactor Plan

## Review Validation Summary

I walked through every file referenced in the architecture review against the actual codebase. **All 7 findings are confirmed.** A few specifics worth highlighting before diving into the plan:

- **validators.ts is 14 lines and completely unused** — Zod schemas exist in `shared/src/ipc.ts` and validators exist in `daemon/src/ipc/validators.ts`, but zero handlers call them. Every handler does raw `payload as Record<string, unknown>` casting instead.
- **AppError is also unused** — defined in `daemon/src/errors/AppError.ts` but no handler catches or throws it. Errors are ad-hoc string messages.
- **sessionStore has 10 nearly identical update methods** (lines 69–147) that each do: set local state → fire-and-forget IPC send → no response validation, no error handling.
- **repoStore and specStore both use `Promise.resolve().then(() => import(...))` to avoid circular deps** with sessionStore — a clear sign that cross-store ownership needs rethinking.
- **worktreeHandlers.ts at 226 lines** is the worst offender: it contains worktree list parsing logic, `execSync` git calls, `.gitignore` mutation, and IPC event broadcasting all in one handler file.

The existing strengths called out in the review (shared contracts, class-based services, ScanQueue, ConfigManager, IPCBridge) are all confirmed and should be preserved.

---

## Phase 1: Stabilize the IPC Boundary

**Goal:** Every IPC request is validated once, every error is normalized once, handlers become thin adapters.

**Risk: Low** — additive changes, no behavioral changes to the renderer.

### Step 1.1 — Create `createHandler` wrapper

**New file:** `packages/daemon/src/ipc/createHandler.ts`

A higher-order function that wraps every handler registration:

```
request in → validate with Zod schema → call handler fn → catch errors → normalize via toAppError → return typed response
```

This eliminates the repeated `payload as Record<string, unknown>` casts in all 6 handler files and the ad-hoc error formatting. Handlers receive a **validated, typed** request object.

**What changes:**

- Each handler function signature changes from `(payload: unknown) => response` to `(request: ValidatedRequest) => response`
- Error responses are produced by the wrapper, not by individual handlers

### Step 1.2 — Wire `AppError` into the wrapper

**Modified file:** `packages/daemon/src/errors/AppError.ts`

Extend the error code enum to cover domain-specific cases (e.g., `REPO_NOT_FOUND`, `SPEC_PARSE_ERROR`, `WORKTREE_CONFLICT`). The wrapper catches any thrown `AppError` and maps it to a typed IPC error response. Unknown errors fall through as `INTERNAL_ERROR`.

### Step 1.3 — Introduce Application Services (daemon side)

**New files:**

- `packages/daemon/src/application/RepoApplicationService.ts`
- `packages/daemon/src/application/SpecApplicationService.ts`
- `packages/daemon/src/application/FileApplicationService.ts`
- `packages/daemon/src/application/WorktreeApplicationService.ts`
- `packages/daemon/src/application/SessionApplicationService.ts`

Each application service encapsulates the orchestration logic currently living in handlers. For example, `WorktreeApplicationService.createWorktree()` would own the full sequence: validate inputs → create git worktree → update .gitignore → return result. The handler just calls it and returns.

**What moves out of handlers:**

- `repoHandlers.ts`: `new RepoScanner(3)` construction (line 24), direct `repoRepository` / `configManager` calls
- `specHandlers.ts`: `new SpecReader()` construction (line 12), spec listing orchestration
- `fileHandlers.ts`: `fs.existsSync` / `fs.readFileSync` / `fs.statSync` calls (lines 29–52), file size policy
- `worktreeHandlers.ts`: `execSync` git calls (lines 176–193), `.gitignore` mutation (lines 196–202)
- `sessionHandlers.ts`: the `as never` cast (line 47), direct `sessionManager` calls

### Step 1.4 — Slim down `registerHandlers`

**Modified file:** `packages/daemon/src/ipc/registerHandlers.ts`

The current broad context object (lines 17–25) with selective slicing gets replaced. Each handler registration receives only its corresponding application service. The context object shrinks to `{ bridge, services: { repo, spec, file, worktree, session, config } }`.

### Phase 1 Deliverables

| Before | After |
|---|---|
| 15+ raw `payload as Record<string, unknown>` casts | 0 — wrapper validates with Zod |
| 6 handler files with ad-hoc error formatting | 1 central error normalizer in wrapper |
| Service construction inside handlers | Constructor injection via application services |
| `validators.ts` unused | Deleted — validation lives in wrapper using shared schemas |
| `AppError` unused | Used by all application services, caught by wrapper |

---

## Phase 2: Simplify Renderer State Management

**Goal:** Kill the duplicated async/IPC boilerplate across stores, eliminate cross-store dynamic imports.

**Risk: Medium** — touches renderer behavior, needs manual testing of all store interactions.

### Step 2.1 — Create Typed IPC Client

**New file:** `packages/ui/src/renderer/services/ipcClient.ts`

Wraps the existing `ipc.send()` from `utils/ipc.ts` with typed helpers:

- `sendOrThrow<Req, Res>(request): Promise<Res>` — sends request, validates response type, throws on error response. Eliminates the repeated `if (response.type === 'error')` branching in every store.
- `query<Res>(type, params?): Promise<Res>` — shorthand for read-only requests
- `command(type, params?): Promise<void>` — shorthand for fire-and-forget mutations

### Step 2.2 — Create Action Factories

**New file:** `packages/ui/src/renderer/services/createStoreAction.ts`

A factory that generates the repeated async lifecycle pattern:

```typescript
createStoreAction({
  set,
  loadingKey: 'isLoading',
  action: async () => ipcClient.query<Repo[]>('repo:list'),
  onSuccess: (repos) => ({ repos }),
  onError: (err) => ({ error: err.message }),
})
```

This eliminates the ~18 lines of boilerplate repeated 3 times in `configStore`, the incomplete pattern in `repoStore`, and the inconsistent error handling across all stores.

### Step 2.3 — Create SessionCoordinator

**New file:** `packages/ui/src/renderer/services/SessionCoordinator.ts`

Replaces the three places that currently coordinate session state:

1. `repoStore.setActiveRepoPath()` lines 65–69 (dynamic import of sessionStore)
2. `specStore.setSelectedSpecPath()` lines 37–41 (dynamic import of sessionStore)
3. `useSessionRestoration.ts` lines 16–64 (orchestrates all three stores)

The coordinator is a standalone module that imports all stores and provides:

- `selectRepo(path)` — updates repoStore + sessionStore atomically
- `selectSpec(path)` — updates specStore + sessionStore atomically
- `restoreSession()` — replaces the hook's restoration logic

Stores no longer import each other. Components call the coordinator for cross-cutting actions.

### Step 2.4 — Consolidate sessionStore update methods

**Modified file:** `packages/ui/src/renderer/store/sessionStore.ts`

Replace the 10 nearly identical `updateSelectedRepoPath`, `updateSelectedSpecPath`, etc. methods with a single:

```typescript
patchSession(patch: Partial<SessionState>): void
```

that sets local state and sends one `session:update` IPC message. Focused selectors remain for reading.

### Phase 2 Deliverables

| Before | After |
|---|---|
| ~90 lines of duplicated async/IPC boilerplate across 5 stores | ~15 lines using `createStoreAction` per store |
| 2 dynamic imports to avoid circular deps | 0 — SessionCoordinator owns cross-store coordination |
| 10 identical session update methods | 1 generic `patchSession` + selectors |
| Inconsistent error handling (some `instanceof Error`, some `response.message`) | Uniform via `sendOrThrow` |
| `useSessionRestoration` hook with multi-store orchestration | `SessionCoordinator.restoreSession()` |

---

## Phase 3: Separate Domain Rules from Infrastructure

**Goal:** Pure business logic becomes testable without mocking `fs`, `git`, or `execSync`.

**Risk: Medium** — refactors core services, needs unit tests to verify no regressions.

### Step 3.1 — Split SpecReader

**Current:** `SpecReader` (587 lines) mixes spec metadata parsing with `fs.readFileSync`, `execSync('git ...')`, and path resolution.

**Target:**

- `packages/daemon/src/domain/SpecParser.ts` — pure functions for parsing spec metadata, extracting frontmatter, task structure, implementation status. No I/O. Fully unit-testable.
- `packages/daemon/src/infrastructure/SpecGitGateway.ts` — wraps git and filesystem access for spec files. Returns raw content strings that the parser consumes.

`SpecApplicationService` (from Phase 1) orchestrates: gateway fetches content → parser extracts metadata → result returned.

### Step 3.2 — Create GitGateway and FileSystemGateway

**New files:**

- `packages/daemon/src/infrastructure/GitGateway.ts` — wraps `simple-git` and `execSync` calls for worktree creation, branch listing, branch checkout. Replaces the inline `execSync` in `worktreeHandlers.ts` (lines 176–193).
- `packages/daemon/src/infrastructure/FileSystemGateway.ts` — wraps `fs` calls with consistent error handling. Replaces inline `fs.existsSync` / `fs.readFileSync` / `fs.statSync` in `fileHandlers.ts` (lines 29–52).

### Step 3.3 — Extract Row Mappers

**New file:** `packages/daemon/src/infrastructure/mappers/` directory

- `repoMapper.ts` — boolean conversion and projection currently in `RepoRepository.ts` (lines 20–48)
- `sessionMapper.ts` — update assembly currently in `SessionManager.ts` (lines 90–150)

Repositories become thinner: query → map → return.

### Step 3.4 — Consolidate persistence policy

**Modified file:** `packages/daemon/src/db/DatabaseService.ts`

Currently, save policy is split between periodic auto-save (line 24–25), manual flush (line 52), and shutdown flush (lines 93–101). Consolidate into one explicit persistence scheduler with a clear contract: auto-save interval + explicit flush on shutdown. Remove the ambiguity of having both scattered across multiple classes.

### Phase 3 Deliverables

| Before | After |
|---|---|
| `SpecReader` 587 lines mixing parsing + I/O | `SpecParser` (~200 lines, pure) + `SpecGitGateway` (~100 lines) |
| `execSync` in worktreeHandlers | `GitGateway.createWorktree()` |
| `fs.*` calls in fileHandlers | `FileSystemGateway.read/stat/exists()` |
| Repeated row mapping in repositories | Shared mappers in `infrastructure/mappers/` |
| Ambiguous save policy across 3 locations | Single `PersistenceScheduler` |

---

## Phase 4: Clean Up Composition

**Goal:** One place to wire everything, bootstrap focused on lifecycle only.

**Risk: Low** — structural cleanup, no behavioral changes.

### Step 4.1 — Create DaemonContainer

**New file:** `packages/daemon/src/DaemonContainer.ts`

A composition root that constructs all infrastructure, domain, and application services once:

```
DatabaseService → Gateways → Parsers → Application Services → Handler Registration
```

### Step 4.2 — Simplify index.ts

**Modified file:** `packages/daemon/src/index.ts`

Bootstrap becomes:

1. Initialize WASM/SQLite
2. Create `DaemonContainer`
3. Start lifecycle (file watchers, background jobs, IPC bridge)
4. Handle shutdown

The current manual service composition (lines 18–31) and broad handler context (lines in registerHandlers) move into the container.

### Phase 4 Deliverables

| Before | After |
|---|---|
| Manual service assembly in `index.ts` (lines 18–31) | `DaemonContainer` constructs everything |
| Broad context object in `registerHandlers` | Handlers receive only their application service |
| Bootstrap mixes wiring + lifecycle | Bootstrap is lifecycle-only |

---

## Target Directory Structure

```
packages/daemon/src/
  DaemonContainer.ts            ← NEW (composition root)
  index.ts                       ← SIMPLIFIED (lifecycle only)
  application/                   ← NEW
    RepoApplicationService.ts
    SpecApplicationService.ts
    FileApplicationService.ts
    WorktreeApplicationService.ts
    SessionApplicationService.ts
  domain/                        ← NEW
    SpecParser.ts
    WorktreeParser.ts
  infrastructure/                ← NEW
    GitGateway.ts
    FileSystemGateway.ts
    SpecGitGateway.ts
    mappers/
      repoMapper.ts
      sessionMapper.ts
  ipc/
    IPCBridge.ts                 ← PRESERVED
    createHandler.ts             ← NEW (validation wrapper)
    registerHandlers.ts          ← SIMPLIFIED
    handlers/                    ← THINNED (adapters only)
      repoHandlers.ts
      specHandlers.ts
      fileHandlers.ts
      worktreeHandlers.ts
      sessionHandlers.ts
      configHandlers.ts
  services/                      ← PRESERVED (existing services)
    ...
  errors/
    AppError.ts                  ← EXTENDED
  db/
    DatabaseService.ts           ← PRESERVED
    ...

packages/ui/src/renderer/
  services/                      ← NEW
    ipcClient.ts
    createStoreAction.ts
    SessionCoordinator.ts
  store/                         ← SIMPLIFIED
    configStore.ts
    repoStore.ts
    sessionStore.ts
    specStore.ts
    worktreeStore.ts
```

---

## Implementation Sequence & Dependencies

```
Phase 1.1  createHandler wrapper         (no deps, start here)
  ↓
Phase 1.2  Wire AppError                 (depends on 1.1)
  ↓
Phase 1.3  Application Services          (depends on 1.1 + 1.2)
  ↓
Phase 1.4  Slim registerHandlers         (depends on 1.3)

Phase 2.1  Typed IPC Client              (independent, can start in parallel with Phase 1)
  ↓
Phase 2.2  Action Factories              (depends on 2.1)
  ↓
Phase 2.3  SessionCoordinator            (depends on 2.2)
  ↓
Phase 2.4  Consolidate sessionStore      (depends on 2.3)

Phase 3.1  Split SpecReader              (depends on Phase 1.3)
  ↓
Phase 3.2  Git + FS Gateways            (depends on Phase 1.3)
  ↓
Phase 3.3  Row Mappers                   (independent)
  ↓
Phase 3.4  Persistence policy            (independent)

Phase 4.1  DaemonContainer              (depends on all Phase 1 + 3)
  ↓
Phase 4.2  Simplify index.ts            (depends on 4.1)
```

**Parallelism:** Phase 1 (daemon) and Phase 2 (renderer) can run concurrently since they touch different packages. Phase 3 follows Phase 1 because application services need to exist first. Phase 4 is the final cleanup.

---

## Testing Strategy

Each phase should include tests before merging:

- **Phase 1:** Unit tests for `createHandler` wrapper (validation, error mapping). Integration tests that send raw IPC payloads and verify validated handling.
- **Phase 2:** Unit tests for `ipcClient` (mock IPC bridge, verify typed responses). Tests for `SessionCoordinator` (verify cross-store coordination without circular imports).
- **Phase 3:** Unit tests for `SpecParser` with fixture files (no `fs` mocking needed — pure functions). Unit tests for gateways with actual temp directories.
- **Phase 4:** Integration test that boots `DaemonContainer` and verifies all services are wired correctly.

---

## Estimated Scope

| Phase | New Files | Modified Files | Estimated Effort |
|---|---|---|---|
| Phase 1 | 6 | 8 | 2–3 days |
| Phase 2 | 3 | 6 | 1–2 days |
| Phase 3 | 5 | 4 | 2–3 days |
| Phase 4 | 1 | 2 | 0.5–1 day |
| **Total** | **15** | **20** | **~6–9 days** |

---

## What This Plan Intentionally Does NOT Do

- **No framework-heavy DI container** — constructor injection and a manual composition root are sufficient at this codebase size.
- **No rewrite of the shared contracts** — the Zod schemas in `packages/shared` are already well-designed.
- **No change to the Electron main process** — `packages/main` is thin and not part of this refactor.
- **No change to the database schema or migrations** — persistence policy cleanup is internal to `DatabaseService`.
- **No change to existing component or hook code** beyond removing `useSessionRestoration` in favor of `SessionCoordinator`.