# Magenta IDE

**Multi-Repo · Multi-Agent · Full IDE**

A desktop-first developer tool that manages the full software development lifecycle across multiple repositories simultaneously. Magenta IDE orchestrates the **Spec → Plan → Task → Implement → Review** pipeline, dispatching implementation work to AI agents (Claude Code, GitHub Copilot) in dedicated git worktrees.

![Magenta IDE](App.png)

---

## Table of Contents

- [Why Magenta IDE](#why-magenta-ide)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Pipeline Stages](#pipeline-stages)
- [Data Model](#data-model)
- [IPC Contract](#ipc-contract)
- [Getting Started](#getting-started)
- [Development](#development)
- [Testing](#testing)
- [Building & Distribution](#building--distribution)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

---

## Why Magenta IDE

Modern software teams work across multiple repositories, and AI coding agents are becoming an integral part of the development workflow. However, orchestrating AI agents across repos, tracking their progress, reviewing their output, and turning completed work into pull requests is a fragmented experience today. Magenta IDE solves this by providing a single desktop application that ties together the entire spec-driven development lifecycle — from authoring a specification to merging a PR — across as many repositories as you need, with AI agents doing the heavy lifting in isolated git worktrees.

---

## Features

**Multi-repo management** — Register and work across N repositories in a single window. Magenta scans your working directories, discovers git repositories, detects spec folders, and tracks each repo's branch, status, and spec count in a persistent SQLite database. Pin your most-used repos for quick access.

**Spec-driven development** — Author specs in a rich markdown editor powered by CodeMirror 6 with syntax highlighting via `highlight.js` and diagram rendering via Mermaid. Each spec progresses through a structured pipeline (Constitution → Spec → Plan → Tasks → Implementation), with stage-level status tracking and approval workflows.

**AI agent dispatch** — Send tasks to Claude Code or GitHub Copilot in isolated git worktrees. Each agent runs in its own worktree branch, preventing conflicts with your main working tree. The onboarding flow lets you choose your preferred AI agent and optionally use worktree isolation per repository.

**Live monitoring** — Stream agent logs, view diffs in real-time, and track progress through an interactive flow diagram built with React Flow. The pipeline visualization shows each stage's status with colour-coded indicators (blue for pending, yellow for in-review, green for approved).

**PR workflow** — Create pull requests directly from completed agent work. Worktree management includes creation, listing, and cleanup, with git operations handled through a dedicated `GitGateway` infrastructure layer.

**Configurable concurrency** — Per-repo agent limits and global pause controls. Background job management tracks scanning operations, spec syncing, and directory watching with real-time progress reporting through push events.

**Session persistence** — Your workspace layout is remembered across sessions: selected repo, selected spec, sidebar and activity panel widths, collapsed states, and the active tab. Everything is restored on launch.

**File browsing & editing** — Browse repository file trees and view file contents directly within the IDE. The directory tree component supports nested folder expansion, and the file viewer renders content with appropriate formatting.

**Settings management** — Configure working directories, AI agent command paths (e.g., `specify` command path), and other application-level preferences through a dedicated settings dialog.

---

## Tech Stack

| Category | Technology |
|---|---|
| Desktop shell | Electron 41 |
| Frontend framework | React 19 |
| Build tool | Vite + esbuild |
| UI components | shadcn/ui + Tailwind CSS v4 |
| State management | Zustand 5 |
| Code editor | CodeMirror 6 |
| Flow diagrams | React Flow |
| Markdown rendering | marked + marked-highlight |
| Diagram rendering | Mermaid |
| Runtime | Node.js 22 |
| Database | SQLite via sql.js (WASM) |
| Git operations | simple-git |
| Schema validation | Zod 4 |
| IDs | ULID |
| File watching | chokidar 5 |
| Testing | Vitest + Playwright |
| Packaging | electron-builder |
| Package manager | pnpm 9 (monorepo workspaces) |

---

## Architecture

Magenta IDE is structured as a **four-package monorepo** with clear separation of concerns. The architecture enforces strict layering — dependencies flow downward only — and uses a composition-root pattern for dependency injection.

```
┌──────────────────────────────────────────────────────────────────────┐
│                         Electron Main Process                        │
│                     (packages/main — thin IPC router)                │
│                                                                      │
│   ┌──────────────────────┐              ┌──────────────────────────┐ │
│   │   Renderer (BrowserWindow)          │   Daemon (child_process) │ │
│   │   packages/ui                       │   packages/daemon        │ │
│   │                      │              │                          │ │
│   │   React 19 + Zustand │◄── IPC ────►│   Node.js service        │ │
│   │   Components + Stores│   (invoke/  │   Layered architecture   │ │
│   │   Services           │    push)    │   SQLite + git + fs      │ │
│   └──────────────────────┘              └──────────────────────────┘ │
│                                                                      │
│   ┌──────────────────────────────────────────────────────────────┐   │
│   │                    packages/shared                            │   │
│   │         Zod schemas · TypeScript types · IPC contracts        │   │
│   └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

### Package Responsibilities

**`packages/shared`** — The contract layer. Contains Zod schemas (`IpcRequestSchema`, `IpcResponseSchema` as discriminated unions), TypeScript model interfaces (`Repository`, `SpecFolder`, `SessionState`, `PipelineStage`), constants (pipeline stages, repo statuses, stage statuses, main tabs), and shared configuration schemas. Both the daemon and UI depend on this package for type-safe communication.

**`packages/daemon`** — The backend service, forked as a `child_process` from the Electron main process. Follows a strict layered architecture:

```
IPC Layer           Thin adapters (safeHandle) — no business logic
    ↓
Application Layer   Use-case orchestration services
    ↓
Domain Layer        Pure logic, no I/O (e.g., SpecParser)
Infrastructure      I/O adapters (GitGateway, FileSystemGateway, SpecGitGateway)
    ↓
Data Access         DatabaseService, repositories, session manager, mappers
    ↓
shared              Zod schemas, types, constants
```

**`packages/main`** — The Electron main process. Intentionally thin: it handles application lifecycle (window creation, quit behaviour), preload script injection, and routes IPC messages between the renderer and the daemon. No business logic lives here.

**`packages/ui`** — The React 19 renderer process. Follows its own layered architecture:

```
React Components + Hooks    Visual layer
    ↓
Services                    SessionCoordinator, ipcClient (sendOrThrow)
    ↓
Zustand Stores              Pure state containers (never import each other)
    ↓
IPC Bridge                  Electron preload API
```

---

## Project Structure

```
magenta-ide/
├── packages/
│   ├── shared/                          # Contract layer
│   │   └── src/
│   │       ├── ipc.ts                   # Zod schemas for all IPC messages
│   │       ├── models.ts                # TypeScript interfaces
│   │       ├── constants.ts             # Pipeline stages, statuses, tabs
│   │       └── config.ts                # Configuration schema
│   │
│   ├── daemon/                          # Backend service (child_process)
│   │   └── src/
│   │       ├── DaemonContainer.ts       # Composition root (DI wiring)
│   │       ├── index.ts                 # Bootstrap + lifecycle
│   │       ├── application/             # Use-case services
│   │       │   ├── RepoApplicationService.ts
│   │       │   ├── SpecApplicationService.ts
│   │       │   ├── FileApplicationService.ts
│   │       │   ├── WorktreeApplicationService.ts
│   │       │   ├── SessionApplicationService.ts
│   │       │   ├── ConfigApplicationService.ts
│   │       │   └── OnboardApplicationService.ts
│   │       ├── domain/                  # Pure logic (no I/O)
│   │       │   └── SpecParser.ts
│   │       ├── infrastructure/          # I/O adapters
│   │       │   ├── GitGateway.ts        # Worktree + git operations
│   │       │   ├── FileSystemGateway.ts # File read/write with error wrapping
│   │       │   ├── SpecGitGateway.ts    # Git commands for spec access
│   │       │   └── mappers/             # SQLite row ↔ model conversion
│   │       │       ├── repoMapper.ts
│   │       │       └── sessionMapper.ts
│   │       ├── ipc/                     # IPC transport layer
│   │       │   ├── IPCBridge.ts         # Message routing + validation
│   │       │   ├── createHandler.ts     # Handler wrapper (error normalization)
│   │       │   ├── registerHandlers.ts  # Handler registration + DI wiring
│   │       │   └── handlers/            # Thin handler adapters
│   │       │       ├── repoHandlers.ts
│   │       │       ├── specHandlers.ts
│   │       │       ├── fileHandlers.ts
│   │       │       ├── worktreeHandlers.ts
│   │       │       ├── sessionHandlers.ts
│   │       │       ├── configHandlers.ts
│   │       │       └── onboardHandlers.ts
│   │       ├── services/                # Data access + background services
│   │       │   ├── DatabaseService.ts   # sql.js WASM database
│   │       │   ├── RepoRepository.ts    # Repo CRUD operations
│   │       │   ├── SpecRepository.ts    # Spec CRUD operations
│   │       │   ├── SessionManager.ts    # Session state persistence
│   │       │   ├── SpecReader.ts        # Spec file reading
│   │       │   ├── SpecSyncService.ts   # Spec synchronization
│   │       │   ├── RepoScanner.ts       # Repository discovery
│   │       │   ├── ScanQueue.ts         # Scan job queuing
│   │       │   ├── BackgroundJobManager.ts
│   │       │   ├── DirWatcher.ts        # Directory change detection
│   │       │   └── FileWatcher.ts       # File change detection
│   │       ├── db/
│   │       │   ├── DatabaseService.ts
│   │       │   ├── schema.ts            # Schema documentation
│   │       │   └── migrations/          # SQL migrations
│   │       ├── errors/
│   │       │   └── AppError.ts          # Domain error codes
│   │       └── config/
│   │           └── ConfigManager.ts
│   │
│   ├── main/                            # Electron main process
│   │   └── src/
│   │       ├── index.ts                 # App lifecycle + window creation
│   │       └── preload.ts               # IPC bridge exposed to renderer
│   │
│   └── ui/                              # React renderer
│       └── src/renderer/
│           ├── services/                # Cross-cutting coordination
│           │   ├── ipcClient.ts         # sendOrThrow, sendCommand, IpcError
│           │   ├── createStoreAction.ts # Async action factory
│           │   └── SessionCoordinator.ts# Cross-store operations
│           ├── store/                   # Zustand state containers
│           │   ├── repoStore.ts         # Repository state + actions
│           │   ├── specStore.ts         # Spec state + actions
│           │   ├── sessionStore.ts      # Session/layout state
│           │   ├── worktreeStore.ts     # Worktree state + actions
│           │   ├── configStore.ts       # Configuration state
│           │   └── onboardStore.ts      # Onboarding flow state
│           ├── hooks/
│           │   └── useSessionRestoration.ts
│           ├── components/
│           │   ├── layouts/             # MainLayout
│           │   ├── sidebar/             # Sidebar, RepoList, SpecTree, etc.
│           │   ├── main/                # SpecsListView, WorkflowView, etc.
│           │   ├── flow/                # Pipeline FlowDiagram (React Flow)
│           │   ├── activity/            # ActivityPanel, SpecFileList
│           │   ├── titlebar/            # TitleBar, BackgroundJobsPopover
│           │   ├── settings/            # SettingsDialog, WorkingDirList
│           │   ├── dialogs/             # Onboard, Worktree, Upgrade dialogs
│           │   ├── worktree/            # WorktreeInlinePanel
│           │   └── common/              # ErrorBoundary, FileTree, etc.
│           └── utils/
│               └── ipc.ts              # Low-level IPC bridge wrapper
│
├── docs/                                # Architecture & phase documentation
│   ├── architecture/
│   │   └── architecture-overview.md     # Authoritative architecture reference
│   ├── phase-1-foundation.md
│   ├── phase-2-repo-and-spec.md
│   ├── phase-3-worktree-and-agents.md
│   ├── phase-4-task-board-and-monitor.md
│   ├── phase-5-multi-repo.md
│   └── phase-6-polish-and-package.md
│
├── App.png                              # Application screenshot
├── CLAUDE.md                            # AI agent development guide
├── package.json                         # Root monorepo configuration
└── pnpm-workspace.yaml                  # pnpm workspace definition
```

---

## Pipeline Stages

Every spec in Magenta IDE progresses through a five-stage pipeline. Each stage has its own status tracking and file output:

```
Constitution  →  Spec  →  Plan  →  Tasks  →  Implementation
```

**Constitution** — The foundational document that defines the project's guiding principles, constraints, and high-level goals. This is the "why" behind the spec.

**Spec** — The detailed specification authored in the markdown editor. Describes what needs to be built, including requirements, acceptance criteria, and design decisions.

**Plan** — A structured breakdown of the spec into an implementation plan. Generated or authored to bridge the gap between "what" and "how."

**Tasks** — Discrete, actionable work items extracted from the plan. Each task is a unit of work that can be dispatched to an AI agent.

**Implementation** — The actual code changes produced by AI agents working in isolated git worktrees. Tracked by worktree count and implementation progress percentage.

Each stage can be in one of these statuses: `missing`, `draft`, `review`, `approved`, `idle`, `running`, `pending`, `in-progress`, or `done`.

---

## Data Model

Magenta IDE persists state in a SQLite database (via sql.js WASM, running entirely in-process with no native binary dependency). The schema consists of five tables:

**`repos`** — Registered git repositories. Tracks name, path, current branch, whether specs exist, spec count, status (`active` | `missing` | `archived`), and timestamps.

**`working_dirs`** — Root directories that Magenta scans for git repositories. These are the top-level folders you register in settings.

**`session_state`** — Single-row table preserving the UI state across sessions: selected repo/spec/file, panel widths, collapsed states, and active tab.

**`specs`** — Discovered spec folders within repositories. Linked to repos via `repo_id`, with branch tracking and a JSON-serialized file list.

**`spec_stages`** — Individual pipeline stages for each spec. Tracks stage name, status, output file path, and JSON-serialized metadata (task counts, progress percentages, approval info).

Booleans are stored as `0`/`1` integers (SQLite convention) and converted via dedicated mapper functions (`repoMapper`, `sessionMapper`).

---

## IPC Contract

All communication between the renderer and daemon flows through a typed IPC contract defined as Zod discriminated unions in `packages/shared/src/ipc.ts`. The contract currently includes:

**Request types (21):** `repo:list`, `repo:scan`, `repo:onboard`, `repo:upgrade-specify`, `repo:onboard:cancel`, `repo:force-reload`, `spec:list`, `file:read`, `file:write`, `dir:list`, `session:get`, `session:update`, `config:get`, `config:add-working-dir`, `config:remove-working-dir`, `config:update`, `branch:list`, `branch:checkout`, `gitfile:read`, `worktree:create`, `worktree:list`

**Push event types (daemon → renderer):** Push events enable real-time updates without polling — the daemon pushes notifications for repo changes, spec updates, scan progress, background job status, and more.

Every request is validated at the IPC boundary by `IPCBridge.invoke()` before reaching any handler. The `safeHandle()` utility ensures handlers are thin adapters that delegate to application services.

---

## Getting Started

### Prerequisites

- **Node.js 22+** — runtime for the daemon and build tooling
- **pnpm 9+** — package manager (monorepo workspaces)
- **Git 2.30+** — required for repository operations and worktree support
- **Claude Code CLI** (`claude`) and/or **GitHub CLI** (`gh`) — for AI agent dispatch

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/magenta-ide.git
cd magenta-ide

# Install all dependencies across the monorepo
pnpm install
```

### Running in Development

```bash
# Build all packages and launch Electron
pnpm dev

# Or, for hot-reload during active development (parallel watch mode)
pnpm dev:watch
```

On first launch, Magenta IDE will prompt you to add a working directory. This is a folder on your machine that contains one or more git repositories. Magenta will scan it, discover repos, and display them in the sidebar.

---

## Development

### Available Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Build all packages, then launch Electron |
| `pnpm dev:watch` | Run all packages in parallel watch mode |
| `pnpm build` | Build all packages for production |
| `pnpm typecheck` | Run TypeScript type checking across all packages |
| `pnpm lint` | Run linters across all packages |
| `pnpm test` | Run test suites across all packages |

### Adding a New IPC Endpoint

Magenta has a well-defined checklist for adding new IPC endpoints. This ensures type safety from the renderer all the way through to the database:

1. **Define the schema** — Add a new variant to both `IpcRequestSchema` and `IpcResponseSchema` in `packages/shared/src/ipc.ts`
2. **Create/extend an Application Service** — Add the business logic in `packages/daemon/src/application/`
3. **Add a thin handler** — Create the handler in `packages/daemon/src/ipc/handlers/` using `safeHandle()`
4. **Wire dependencies** — Register the handler in `packages/daemon/src/ipc/registerHandlers.ts` and wire any new services in `DaemonContainer.ts`
5. **Update the UI type map** — Add the response mapping to `ResponseForRequest` in `packages/ui/src/renderer/services/ipcClient.ts`

### Key Patterns

**`safeHandle(bridge, type, handler)`** — Registers a typed IPC handler. The bridge validates the request, the handler delegates to a service, and errors are automatically normalized.

**`sendOrThrow(request)`** — The renderer's typed IPC client. Returns the success response or throws `IpcError`. Eliminates manual `if (response.type === 'error')` branching.

**`SessionCoordinator`** — The single point for cross-store operations in the renderer. Stores never import each other; multi-store updates go through the coordinator.

**`DaemonContainer`** — The composition root for the daemon. All service construction and dependency injection is wired here. No service constructs another service internally.

**`createAsyncAction()`** — Factory for standardized loading/error state management in Zustand store actions.

**`AppError`** — Domain-specific error type with codes like `FILE_NOT_FOUND`, `GIT_ERROR`, `WORKTREE_CONFLICT`, `VALIDATION_ERROR`, etc. The `createHandler` wrapper catches these and normalizes them into typed IPC error responses.

### Anti-Patterns to Avoid

- **`payload as Record<string, unknown>`** in handlers — use typed `safeHandle()` instead
- **`try/catch` in IPC handlers** — the `createHandler` wrapper handles errors
- **Store A imports Store B** — use `SessionCoordinator`
- **`fs.readFile()` or `git.raw()` in handlers** — delegate to gateway classes via application services
- **Manual error response checking in the UI** — use `sendOrThrow()`
- **Constructing services inside other services** — wire in `DaemonContainer`

---

## Testing

Magenta IDE follows a layered testing strategy that mirrors the architecture:

**Domain layer** — Unit test pure functions directly. No mocks needed since there's no I/O.

**Application services** — Mock infrastructure gateways and repositories. Test the orchestration logic.

**IPC handlers** — Test with mock application services. Verify they are thin (no logic beyond delegation).

**Zustand stores** — Test state transitions with mocked `sendOrThrow` for IPC calls.

**React components** — Prefer integration tests that exercise real stores with mocked IPC.

```bash
# Run all tests
pnpm test
```

---

## Building & Distribution

Magenta IDE uses `electron-builder` for packaging and distribution.

```bash
# Create an unpacked build (for testing)
pnpm pack

# Build distributable for the current platform
pnpm dist

# Platform-specific builds
pnpm dist:mac       # macOS (.dmg)
pnpm dist:win       # Windows (.exe / .msi)
pnpm dist:linux     # Linux (.AppImage / .deb)

# Publish a release
pnpm release
```

---

## Documentation

Detailed implementation documentation is organized into six phases:

| Phase | Document | Scope |
|---|---|---|
| 1 | [Foundation](docs/phase-1-foundation.md) | Monorepo scaffold, Electron shell, daemon IPC, SQLite schema |
| 2 | [Repo & Spec](docs/phase-2-repo-and-spec.md) | Repo registration, spec editor, approval workflow, task generation |
| 3 | [Worktree & Agents](docs/phase-3-worktree-and-agents.md) | Git worktrees, Claude/Copilot runners, task queue, log streaming |
| 4 | [Task Board & Monitor](docs/phase-4-task-board-and-monitor.md) | Kanban board, diff viewer, PR creation, pause/resume |
| 5 | [Multi-Repo](docs/phase-5-multi-repo.md) | Parallel repos, cross-repo overview, per-repo settings |
| 6 | [Polish & Package](docs/phase-6-polish-and-package.md) | Settings, onboarding, testing, electron-builder packaging |

The authoritative architecture reference is at [`docs/architecture/architecture-overview.md`](docs/architecture/architecture-overview.md).

The AI agent development guide is at [`CLAUDE.md`](CLAUDE.md) — this is the go-to reference for any AI agent (or human contributor) working on the codebase.

---

## Contributing

1. Fork the repository and create a feature branch
2. Follow the architecture rules in [`CLAUDE.md`](CLAUDE.md) — especially the layering constraints and anti-pattern list
3. Add tests appropriate for the layer you're modifying
4. Run `pnpm typecheck && pnpm test` before submitting
5. Open a pull request with a clear description of the change

---

## License

MIT
