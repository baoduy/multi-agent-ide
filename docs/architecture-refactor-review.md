# Architecture Refactor Review

This report is based on a read-only review of the current codebase. No source files were changed.

## Executive Summary

The codebase already has a sensible package split between `shared`, `daemon`, `main`, and `ui`, and the daemon leans toward class-based services, which is a good base for incremental refactoring. The main architectural cost today comes from duplicated transport logic, weak separation between IPC and business orchestration, and renderer state coordination that relies on cross-store coupling.

The highest-value refactor is not a rewrite. It is to introduce a thin application-service layer between IPC handlers and domain/services, then standardize request validation and error mapping at the boundary. After that, the renderer stores can be simplified around reusable IPC action patterns and a clearer ownership model for session state.

## Findings

### 1. IPC handlers mix transport, validation, orchestration, and infrastructure access

Severity: High

Why it matters:
The handler layer currently owns too many responsibilities. Several handlers both parse payloads, call infrastructure directly, and assemble response objects. That makes the IPC boundary hard to test and increases the risk of inconsistent behavior between handlers.

Evidence:
- Service construction happens inside the handler registration in [packages/daemon/src/ipc/handlers/repoHandlers.ts](../packages/daemon/src/ipc/handlers/repoHandlers.ts#L18-L20).
- Manual payload extraction appears in [packages/daemon/src/ipc/handlers/specHandlers.ts](../packages/daemon/src/ipc/handlers/specHandlers.ts#L29), [packages/daemon/src/ipc/handlers/fileHandlers.ts](../packages/daemon/src/ipc/handlers/fileHandlers.ts#L16), and [packages/daemon/src/ipc/handlers/sessionHandlers.ts](../packages/daemon/src/ipc/handlers/sessionHandlers.ts#L38).
- Direct filesystem and git operations live in handlers in [packages/daemon/src/ipc/handlers/fileHandlers.ts](../packages/daemon/src/ipc/handlers/fileHandlers.ts#L29-L52) and [packages/daemon/src/ipc/handlers/worktreeHandlers.ts](../packages/daemon/src/ipc/handlers/worktreeHandlers.ts#L106-L201).

SOLID impact:
- Violates SRP because handlers do more than request/response adaptation.
- Weakens DIP because handlers depend on concrete infrastructure details instead of application-facing abstractions.

Recommended refactor:
- Keep handlers as thin adapters only.
- Introduce application services such as `RepoApplicationService`, `SpecApplicationService`, `FileApplicationService`, and `WorktreeApplicationService`.
- Move orchestration and infrastructure calls into those services, injected through constructors.
- Have `registerHandlers` receive fully constructed dependencies instead of creating them internally.

### 2. The project defines validation and typed error abstractions, but the boundary does not use them consistently

Severity: High

Why it matters:
The cleanest path to a stable IPC boundary already exists in the codebase, but it is only partially adopted. The result is repeated casts, generic string errors, and a transport layer that does not fully benefit from the shared contract package.

Evidence:
- Shared request/response schemas already exist in [packages/shared/src/ipc.ts](../packages/shared/src/ipc.ts#L59-L125).
- IPC validators already exist in [packages/daemon/src/ipc/validators.ts](../packages/daemon/src/ipc/validators.ts#L8-L12).
- `AppError` and `toAppError` already exist in [packages/daemon/src/errors/AppError.ts](../packages/daemon/src/errors/AppError.ts#L7-L19).
- Despite that, handlers still cast raw payloads and build ad hoc error responses in [packages/daemon/src/ipc/handlers/specHandlers.ts](../packages/daemon/src/ipc/handlers/specHandlers.ts#L29-L44), [packages/daemon/src/ipc/handlers/fileHandlers.ts](../packages/daemon/src/ipc/handlers/fileHandlers.ts#L16-L20), and [packages/daemon/src/ipc/handlers/sessionHandlers.ts](../packages/daemon/src/ipc/handlers/sessionHandlers.ts#L37-L56).

SOLID impact:
- Violates SRP because every handler repeats validation and error formatting.
- Weakens OCP because changing the error contract requires touching every handler.

Recommended refactor:
- Validate every incoming request once at the `IPCBridge.invoke` boundary or in a shared handler wrapper.
- Normalize thrown errors through `toAppError` and map them to typed IPC error responses in one place.
- Replace manual `payload as Record<string, unknown>` extraction with schema-validated request objects.

### 3. Renderer stores repeat the same IPC response and async-state pattern

Severity: High

Why it matters:
The renderer duplicates the same request lifecycle logic across stores: set loading state, send request, branch on success/error response type, then update state. This is a major DRY problem and will keep spreading as the app adds features.

Evidence:
- Repeated response branching in [packages/ui/src/renderer/store/configStore.ts](../packages/ui/src/renderer/store/configStore.ts#L29-L74).
- The same pattern appears in [packages/ui/src/renderer/store/repoStore.ts](../packages/ui/src/renderer/store/repoStore.ts#L86-L107), [packages/ui/src/renderer/store/sessionStore.ts](../packages/ui/src/renderer/store/sessionStore.ts#L46-L63), [packages/ui/src/renderer/store/specStore.ts](../packages/ui/src/renderer/store/specStore.ts#L88-L114), and [packages/ui/src/renderer/store/worktreeStore.ts](../packages/ui/src/renderer/store/worktreeStore.ts#L46-L92).
- `sessionStore` also repeats almost identical optimistic update plus `ipc.send({ type: "session:update" ... })` methods in [packages/ui/src/renderer/store/sessionStore.ts](../packages/ui/src/renderer/store/sessionStore.ts#L69-L147).

SOLID impact:
- Violates DRY directly.
- Weakens SRP because each store reimplements transport concerns instead of focusing on state ownership.

Recommended refactor:
- Add a renderer-side IPC client layer with helpers such as `sendOrThrow`, `expectResponse`, and typed command/query wrappers.
- Consolidate shared async store behavior into reusable action factories or a small store utility.
- Replace the repeated session update methods with one generic `patchSessionState` command plus focused selectors/helpers.

### 4. Renderer state ownership is blurred by cross-store coupling and out-of-band coordination

Severity: Medium-High

Why it matters:
Some stores coordinate with each other through dynamic imports and side effects rather than through a clear ownership model. That introduces hidden dependencies and makes state restoration harder to reason about.

Evidence:
- Dynamic import of `sessionStore` in [packages/ui/src/renderer/store/repoStore.ts](../packages/ui/src/renderer/store/repoStore.ts#L66) and [packages/ui/src/renderer/store/specStore.ts](../packages/ui/src/renderer/store/specStore.ts#L45).
- Module-level mutable timer state in [packages/ui/src/renderer/store/specStore.ts](../packages/ui/src/renderer/store/specStore.ts#L29).
- Session restoration and reconciliation logic sits outside the session store in [packages/ui/src/renderer/hooks/useSessionRestoration.ts](../packages/ui/src/renderer/hooks/useSessionRestoration.ts#L16-L64).

SOLID impact:
- Weakens SRP because ownership of session-related decisions is split across multiple modules.
- Weakens DIP because store interactions depend on concrete store imports and timing behavior.

Recommended refactor:
- Define one store or coordinator as the source of truth for session-driven selection state.
- Move restoration rules into a dedicated orchestrator class or a single renderer application service.
- Replace module-level timer state with instance-owned store state or a dedicated async controller.

### 5. Several services combine domain logic with blocking infrastructure operations

Severity: Medium

Why it matters:
There is a repeated pattern of synchronous filesystem and git calls embedded directly into high-level services. That keeps the design simple in the short term, but it makes these classes harder to test, harder to mock, and more tightly coupled to one execution model.

Evidence:
- `SpecReader` mixes parsing rules with synchronous file and git access in [packages/daemon/src/services/SpecReader.ts](../packages/daemon/src/services/SpecReader.ts#L43-L217) and additional filesystem parsing later in the file at [packages/daemon/src/services/SpecReader.ts](../packages/daemon/src/services/SpecReader.ts#L481-L571).
- Worktree creation uses direct `execSync` and `.gitignore` mutation inside the handler in [packages/daemon/src/ipc/handlers/worktreeHandlers.ts](../packages/daemon/src/ipc/handlers/worktreeHandlers.ts#L176-L201).
- File access policy and file I/O are mixed in [packages/daemon/src/ipc/handlers/fileHandlers.ts](../packages/daemon/src/ipc/handlers/fileHandlers.ts#L29-L52).

SOLID impact:
- Weakens SRP because policy, orchestration, and infrastructure are bundled together.
- Weakens DIP because parsing logic depends directly on `fs` and shell execution details.

Recommended refactor:
- Split `SpecReader` into a repository gateway for git/filesystem access plus a pure parser for spec metadata extraction.
- Move worktree operations behind a `WorktreeService` or `GitWorktreeGateway`.
- Move file policy checks into a dedicated file service so handlers remain thin.

### 6. Data mapping and persistence rules are duplicated across repositories and managers

Severity: Medium

Why it matters:
The data access layer works, but column mapping and persistence rules are repeated manually. That increases change cost whenever the schema evolves.

Evidence:
- Repeated repo projections and boolean conversion in [packages/daemon/src/services/RepoRepository.ts](../packages/daemon/src/services/RepoRepository.ts#L20-L48).
- Manual update assembly in `SessionManager` in [packages/daemon/src/services/SessionManager.ts](../packages/daemon/src/services/SessionManager.ts#L90-L150).
- Save policy is spread between periodic auto-save and manual flush calls in [packages/daemon/src/db/DatabaseService.ts](../packages/daemon/src/db/DatabaseService.ts#L24-L25), [packages/daemon/src/db/DatabaseService.ts](../packages/daemon/src/db/DatabaseService.ts#L52), and [packages/daemon/src/db/DatabaseService.ts](../packages/daemon/src/db/DatabaseService.ts#L93-L101).

SOLID impact:
- Mostly a DRY issue, but it also obscures persistence responsibilities.

Recommended refactor:
- Extract reusable row mappers and query fragments for repository/session persistence.
- Introduce a clearer persistence policy: either explicit unit-of-work style flush points or a dedicated persistence scheduler, but not both spread across multiple classes.
- If the project stays on raw SQL, centralize SQL snippets and mapping helpers instead of embedding them in every method.

### 7. Bootstrap and composition are still manual enough to become a scaling problem

Severity: Medium

Why it matters:
The current bootstrap path is manageable now, but it is already assembling concrete services manually and passing them through a broad context object. As features grow, this pattern will produce larger constructors and more incidental coupling.

Evidence:
- Manual service composition in [packages/daemon/src/index.ts](../packages/daemon/src/index.ts#L18-L31).
- Broad handler context in [packages/daemon/src/ipc/registerHandlers.ts](../packages/daemon/src/ipc/registerHandlers.ts#L14-L45).

Recommended refactor:
- Add a dedicated composition root class for the daemon, such as `DaemonContainer` or `DaemonCompositionRoot`.
- Construct concrete services once there and pass only the minimal application services into handler registration.
- Keep bootstrap focused on lifecycle only: start, stop, flush, and wiring.

## Strengths Worth Preserving

- Shared contracts are already centralized in `packages/shared`, which is the right foundation for IPC stability.
- The daemon already uses class-based services such as `DatabaseService`, `ConfigManager`, `SessionManager`, and `SpecCacheService`, which fits an incremental OOP refactor well.
- `ScanQueue` is a good separation point between repo scanning requests and scan execution in [packages/daemon/src/services/ScanQueue.ts](../packages/daemon/src/services/ScanQueue.ts).
- `ConfigManager` already encapsulates config persistence cleanly and uses an atomic temp-file rename pattern in [packages/daemon/src/config/ConfigManager.ts](../packages/daemon/src/config/ConfigManager.ts#L72-L79).
- `IPCBridge` is a small, focused abstraction and is a good place to introduce standardized validation and error mapping in [packages/daemon/src/ipc/IPCBridge.ts](../packages/daemon/src/ipc/IPCBridge.ts).

## Recommended Refactor Sequence

### Phase 1: Stabilize the IPC boundary

1. Introduce a shared handler wrapper that performs request validation, error normalization, and response shaping.
2. Start using `validateIpcRequest` and `AppError` consistently.
3. Move direct infrastructure access out of handlers and into application services.

### Phase 2: Simplify renderer state management

1. Add a typed renderer IPC client abstraction.
2. Consolidate repeated async request patterns across stores.
3. Replace cross-store dynamic imports with a dedicated selection/session coordinator.

### Phase 3: Separate domain rules from infrastructure

1. Split `SpecReader` into parsing and I/O collaborators.
2. Introduce dedicated file and worktree services.
3. Centralize repository/session SQL mapping and persistence decisions.

### Phase 4: Clean up composition

1. Introduce a single daemon composition root.
2. Register handlers with application-facing services only.
3. Keep lifecycle management separate from service wiring.

## Suggested Target Architecture

A pragmatic target for this codebase is:

- `shared`: schemas, DTOs, contracts
- `daemon/application`: use-case oriented services called by handlers
- `daemon/domain`: pure business rules and parsing logic
- `daemon/infrastructure`: sqlite, git, filesystem, process adapters
- `daemon/ipc`: request/response adapters only
- `ui/services`: typed IPC client and orchestration helpers
- `ui/store`: state containers only

That structure would improve SRP and DIP without forcing a framework-heavy rewrite.

## Conclusion

The codebase is not structurally broken, but it is at the point where adding more features without boundary cleanup will amplify duplication and coupling. The best next move is to standardize the IPC boundary and renderer request patterns first, because that will remove the most repeated code and create cleaner seams for later refactors.
