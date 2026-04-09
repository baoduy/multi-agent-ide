# Feature Specification: Kick-Start Feature — Repo Scanner & Spec Flow Diagram

**Feature Branch**: `001-kickstart-repo-spec`  
**Created**: 2026-04-08  
**Status**: Draft  
**Input**: Spec the Kick-Start Feature with foundation setup and end-to-end implementation with mockup UI

---

## Overview

The Kick-Start Feature is the first working feature of Magenta IDE. It establishes the core three-process architecture (Main, Daemon, Renderer), SQLite persistence, and the primary user interface for repository management and spec pipeline visualization.

Users can scan working directories for git repositories, browse specs organized by project, and visualize the Spec → Plan → Task → Implementation pipeline stages using a node-based React Flow diagram. Session state is automatically persisted and restored on app launch, providing a seamless continuity of work context.

---

## Clarifications

### Session 2026-04-08

- Q: What exact status rule set should be used for Constitution/Spec/Plan/Tasks/Implementation? → A: Infer statuses from file/folder presence and content; mark approved only when downstream stage exists; mark implementation running only with active execution evidence.
- Q: What qualifies Implementation as running? → A: Running requires either an active worktree process for the spec or a heartbeat/progress update newer than 30 seconds.
- Q: How should concurrent scans be resolved (startup scan, manual scan, config-triggered scan)? → A: Single-flight scanner per repo root; additional scan requests are coalesced into one pending run.
- Q: How should symlinks be handled during repository scans? → A: Do not follow directory symlinks during recursive scanning.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Scan and Register Git Repositories (Priority: P1)

A developer wants to point Magenta IDE at their project directories to automatically discover all git repositories. They should see instantly cached results on app launch, with a background sync updating the list as they work.

**Why this priority**: Core prerequisite. No other features work without repository registration. Immediate visual feedback (cached data) is critical for user perception of performance.

**Independent Test**: Testing repository scanner in isolation (add working directory, trigger scan, verify DB state, verify sidebar updates) delivers complete value by itself.

**Acceptance Scenarios**:

1. **Given** app has been launched, **When** user adds a working directory via settings, **Then** the UI shows a scanning indicator and completes within 5 seconds (typical case: 50-100 repos).
2. **Given** background scan is in progress, **When** user navigates the UI, **Then** navigation is responsive and does not block (scan runs in daemon process).
3. **Given** app launches after previous session, **When** the window opens, **Then** cached repos from SQLite appear immediately (< 100ms).
4. **Given** a repo existed in the DB but has been deleted from disk, **When** background scan completes, **Then** repo is marked `status = 'missing'` (not deleted from DB).
5. **Given** a new repo is found on disk during scan, **When** scan completes, **Then** repo appears in sidebar with correct branch name and spec count.
6. **Given** user edits `.git/HEAD` to change branch (e.g., main → feature/x), **When** background scan runs, **Then** repo's branch field in DB and sidebar is updated.

---

### User Story 2 — Browse Specs with Folder Convention (Priority: P1)

A developer selects a repository and expects to see all specs organized in the `specs/` folder. Each spec folder represents a distinct feature/task, and the UI shows a tree view with quick visual indicators of which pipeline stages exist (via progress dots).

**Why this priority**: Required for spec flow diagram to be meaningful. Enables users to navigate their spec library.

**Independent Test**: Selecting a repo and seeing its spec list works independently of the flow diagram. Users get value immediately by understanding their spec inventory.

**Acceptance Scenarios**:

1. **Given** a repo is selected, **When** the repo has a `specs/` folder with multiple subfolders, **Then** all spec folders are listed in sidebar with correct names.
2. **Given** a spec folder contains `spec.md`, `plan.md`, and `tasks.md`, **When** user views the spec tree, **Then** three progress dots are displayed (filled for existing stages, hollow for missing).
3. **Given** a spec folder has only `spec.md` (missing plan and tasks), **When** user views progress dots, **Then** Spec dot is filled, Plan and Tasks dots are hollow.
4. **Given** a repo exists but has no `specs/` folder, **When** user views the sidebar, **Then** "No specs found" message is shown with "Create spec" prompt.
5. **Given** a spec folder is added to disk while app is running, **When** file watcher detects the change, **Then** sidebar spec tree updates within 500ms without full page reload.

---

### User Story 3 — Visualize Spec Pipeline with React Flow (Priority: P1)

A developer clicks on a spec folder and sees a node-based pipeline diagram showing the five stages: Constitution → Spec → Plan → Tasks → Implementation. Missing stages appear as grayed-out nodes; completed stages appear as green. The diagram is interactive (pan, zoom, fit-to-view).

**Why this priority**: Core visualization. Enables developers to understand spec completion status at a glance and serves as the primary navigation hub for specs.

**Independent Test**: Flow diagram renders correctly for different spec states (all stages, partial stages, no stages) and provides interactive navigation. Works independently as a visualization tool.

**Acceptance Scenarios**:

1. **Given** a spec folder is selected, **When** React Flow diagram renders, **Then** five nodes appear in correct positions (Constitution top, Spec/Plan/Tasks in row, Implementation right).
2. **Given** a spec folder contains `constitution.md`, `spec.md`, and `plan.md`, **When** diagram renders, **Then** Constitution, Spec, and Plan nodes show green borders (approved), Tasks and Implementation show gray dashed borders (missing).
3. **Given** a spec folder contains `tasks.md` with checkboxes (e.g., 8 completed, 12 total), **When** Tasks node renders, **Then** progress bar shows 67% completion.
4. **Given** an `implementation/` folder contains a `progress.json` file, **When** Implementation node renders, **Then** progress is read from the JSON and displayed as a percentage.
5. **Given** diagram is rendered, **When** user pans, zooms, or uses fit-to-view, **Then** React Flow controls work smoothly without lag.
6. **Given** a spec folder is deleted from disk, **When** user returns to the app, **Then** app falls back to repo's spec list (not the deleted spec's diagram).

---

### User Story 4 — Persist Session State Across App Launches (Priority: P1)

A developer navigates to a specific repo, selects a spec, and resizes panels. On app quit and relaunch, the exact same view is restored (repo selected, spec diagram shown, panel widths restored).

**Why this priority**: Critical UX: developers expect their context to be preserved. Without this, the tool feels non-professional and interrupts workflow.

**Independent Test**: Session state persistence can be tested independently: navigate, resize, close, reopen, verify restoration. This works without any other features.

**Acceptance Scenarios**:

1. **Given** user selects a repo, spec folder, and file in the editor, **When** app quits and relaunches, **Then** the same repo, spec, and file are automatically selected and displayed.
2. **Given** user resizes sidebar and right panel, **When** app quits and relaunches, **Then** panel widths are restored to the previous positions.
3. **Given** user switches the main tab from "Spec Flow" to "Worktrees", **When** app quits and relaunches, **Then** the Worktrees tab is selected on startup.
4. **Given** selected repo path has been deleted from disk, **When** app launches, **Then** app falls back to welcome screen and clears stale `selectedRepoPath` from DB.
5. **Given** selected spec path has been deleted, **When** app launches, **Then** app falls back to repo's spec list (shows sidebar correctly).
6. **Given** selected file path has been deleted, **When** app launches, **Then** app falls back to spec flow diagram (file not shown, but other context preserved).

---

### User Story 5 — Configure Working Directories (Priority: P2)

A developer opens settings and wants to add/remove working directories that Magenta IDE should monitor for repos. Settings dialog shows the current list, allows adding directories via native folder picker, removing entries, and triggering a manual re-scan.

**Why this priority**: Essential for multi-directory workflows. Not strictly required for MVP (single directory works), but highly valuable for real-world use.

**Independent Test**: Settings panel can be tested independently: add dir, remove dir, re-scan, verify sidebar updates. UI responiveness isolated from other features.

**Acceptance Scenarios**:

1. **Given** user clicks settings gear icon, **When** settings dialog opens, **Then** current working directories are listed with remove buttons.
2. **Given** settings dialog is open, **When** user clicks "Add Directory", **Then** native OS folder picker appears.
3. **Given** user selects a directory in the folder picker, **When** user confirms, **Then** directory is added to config, scan is triggered, and new repos from that directory appear in sidebar after scan.
4. **Given** user removes a directory from settings and confirms, **When** removal is saved, **Then** repos from that directory keep their current state in the sidebar but new repos in that directory won't be added on future scans.
5. **Given** settings dialog shows last scan timestamp and repo count, **When** user clicks "Scan Now", **Then** background scan runs and results update immediately upon completion.

---

### User Story 6 — React to Spec Folder Changes in Real-Time (Priority: P2)

A developer is editing spec files in an external text editor while Magenta IDE is open. When they save changes (create/edit/delete files in `specs/` folder), the sidebar spec tree and flow diagram automatically update without requiring a page refresh or manual action.

**Why this priority**: Valuable for real-world workflows where users edit specs externally. Not P1 because users can work around by closing/reopening the app.

**Independent Test**: File watcher can be tested independently: add/edit/delete spec files on disk, verify UI updates within 500ms.

**Acceptance Scenarios**:

1. **Given** a repo is selected and file watcher is active, **When** a new spec folder is created in `specs/`, **Then** sidebar updates within 500ms showing the new spec.
2. **Given** spec flow diagram is displayed, **When** `spec.md` is created in the spec folder, **Then** Spec node changes from gray (missing) to orange (review) without full page reload.
3. **Given** a spec folder is being watched, **When** `spec.md` is deleted, **Then** Spec node transitions back to gray (missing) within 500ms.

---

### Edge Cases

- What happens when user adds a directory that contains no repos? → "No repositories found" message, empty repo list. Re-scan button available.
- What happens when a working directory is on an external drive that gets unmounted? → Repos marked `status = 'missing'`. If remounted, next scan re-discovers them without data loss.
- What happens when user has many repos (1000+) in working directories? → Scan completes with progress events, UI remains responsive. Sidebar virtualization handles large repo lists.
- What happens when two instances of Magenta IDE write to the same SQLite DB file simultaneously? → SQLite WAL mode ensures safety. One instance gets lock, other waits. No corruption.
- What happens when user opens settings while background scan is running? → Settings dialog works independently. Scan continues in background. Results update sidebar when complete.
- What happens when a spec folder contains no stage files at all? → All nodes shown as gray dashed (missing). No errors. User can create stages as needed.
- What happens when multiple scans are triggered at the same time? → Scanner runs in single-flight mode; overlapping requests are coalesced into one follow-up scan.
- What happens when scanner encounters symlink loops? → Directory symlinks are ignored during recursion to prevent infinite traversal.


## Requirements *(mandatory)*

### Functional Requirements

**Repo Management**:
- **FR-001**: System MUST scan user-provided working directories for git repositories (.git folders) with configurable depth (default max 3 levels deep).
- **FR-002**: System MUST store scan results in SQLite with repo name, path, current branch, spec count, and status (active/missing/archived).
- **FR-003**: System MUST perform background scan on app launch without blocking UI, rendering cached repo list first.
- **FR-004**: System MUST allow users to add/remove working directories via native file picker in settings dialog.
- **FR-005**: System MUST display repos in sidebar grouped by status: active repos listed first, missing repos collapsed into "N unavailable" section.
- **FR-006**: System MUST show repo metadata: name, current git branch, status badge (active/missing), and spec count.
- **FR-006a**: System MUST execute scans in single-flight mode per repository root and coalesce overlapping scan triggers into at most one pending follow-up run.
- **FR-006b**: System MUST skip directory symlinks during recursive scanning.

**Spec Discovery & Organization**:
- **FR-007**: System MUST auto-detect spec folders by reading the `specs/` directory convention (each subdirectory = one spec).
- **FR-008**: System MUST detect pipeline stages based on file presence: constitution.md, spec.md, plan.md, tasks.md, implementation/ folder.
- **FR-009**: System MUST parse task checkboxes (`- [ ]` and `- [x]`) in tasks.md to calculate completion percentage for progress bars.
- **FR-010**: System MUST read `implementation/progress.json` if present to determine implementation stage progress.
- **FR-011**: System MUST display spec folders in sidebar with visual quick indicators (5 progress dots showing which stages exist).

**Pipeline Visualization**:
- **FR-012**: System MUST render a React Flow node diagram with five stages: Constitution, Spec, Plan, Tasks, Implementation.
- **FR-013**: System MUST auto-detect and display stage status (missing/draft/review/approved/running) with corresponding border colors and styles using these rules: `missing` if file/folder absent; `draft` if present and content length < 50 chars; `review` if present with content; `approved` only when the immediate downstream stage exists; for Implementation, `running` requires active execution evidence.
- **FR-014**: System MUST show task count and progress bars on Tasks and Implementation nodes when applicable.
- **FR-015**: System MUST support interactive diagram controls: pan, zoom, fit-to-view, and mini-map.
- **FR-016**: System MUST display stage file names and size on hover (optional information layer).

**Persistence & State Management**:
- **FR-017**: System MUST persist session state (selected repo path, selected spec path, selected file path, panel widths, active tab) to SQLite on every meaningful user action.
- **FR-018**: System MUST restore the complete session on app launch, falling back gracefully if selected items have been deleted.
- **FR-019**: System MUST debounce session state writes (500ms) to avoid excessive DB churn during rapid interactions (e.g., panel resizing).
- **FR-020**: System MUST enforce single-row session_state table via database constraint to prevent duplicate session records.

**File Watching & Real-Time Updates**:
- **FR-021**: System MUST watch the `specs/` directory of the selected repo for file changes (creation, modification, deletion).
- **FR-022**: System MUST trigger spec tree and flow diagram updates within 500ms when spec files change on disk.
- **FR-023**: System MUST stop watching when a different repo is selected or when the app is idle.
- **FR-023a**: System MUST classify Implementation as `running` only when either an active worktree/task process exists for the selected spec or the latest implementation heartbeat/progress update is newer than 30 seconds; otherwise classify as `idle`.

**Configuration**:
- **FR-024**: System MUST initialize `~/.magenta/config.json` on first run with `{ "workingDirs": [] }`.
- **FR-025**: System MUST validate config file on load; if corrupt, reset to defaults gracefully.
- **FR-026**: System MUST expand tilde (`~`) to user home directory for all path values.
- **FR-027**: System MUST store working directories in config.json; all scanned data lives in SQLite (strict separation).

**UI Layout & Responsiveness**:
- **FR-028**: System MUST organize UI into three main sections: Sidebar (repos/specs), Main Panel (spec flow or editor), Activity Panel (agent status, quick actions).
- **FR-029**: System MUST allow sidebar and activity panel to be resizable via draggable dividers.
- **FR-030**: System MUST make all sections responsive: no blocking operations on UI thread, smooth animations for state transitions.
- **FR-031**: System MUST display welcome screen on first launch or when no repos have been registered.

---

### Key Entities

**Repository**:
- Scanned git repository with metadata: name, path, current branch, spec count, status (active/missing/archived), scan timestamp, creation timestamp.

**Spec Folder**:
- Project/feature represented by a subdirectory in `specs/` containing stage files (constitution.md, spec.md, plan.md, tasks.md, implementation/).

**Pipeline Stage**:
- One of five stages in the pipeline: Constitution, Spec, Plan, Tasks, Implementation. Each stage has a status (missing, draft, review, approved, running) and optional metadata (progress percentage, task counts).

**Session State**:
- Single-row record in DB capturing user's navigation context: selected repo path, selected spec path, selected file, panel widths, active tab. Restored on app launch.

**Configuration**:
- User preferences stored in `~/.magenta/config.json`: list of working directories to scan.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: App launches with cached repo list visible within 100ms on the screen (users perceive it as instant).
- **SC-002**: Background scan completes for small directory (< 100 repos) within 5 seconds without blocking UI.
- **SC-003**: Session state is restored on app relaunch with 100% accuracy for selected repo, spec, file, and panel dimensions.
- **SC-004**: Fallback behavior (deleted items) works without errors: selected repo deleted → welcome screen; selected spec deleted → repo spec list; selected file deleted → spec diagram.
- **SC-005**: Spec tree and flow diagram update within 500ms when spec files are created, edited, or deleted on disk.
- **SC-006**: Sidebar virtualization supports 1000+ repos without performance degradation (scrolling remains smooth).
- **SC-007**: All IPC messages (repo:list, repo:scan, spec:list, session:get, session:update) complete within 200ms in normal operation.
- **SC-008**: SQLite database remains uncorrupted when multiple operations occur concurrently (repo scan, session state writes, file watcher updates).
- **SC-009**: 95% of user workflows involve repo selection, spec viewing, and session restoration working smoothly (no crashes or data loss).
- **SC-010**: All UI components render without console errors or warnings (100% clean console on app startup).
- **SC-011**: During overlapping scan triggers, at most one active scan and one pending coalesced scan exist per repository root.

---

## Assumptions

- **User Environment**: Users have Node.js 22+, pnpm 9+, and Git 2.30+ installed locally.
- **Repository Structure**: Users' projects follow a standard git workflow with typical branch names (main, develop, feature/*). Branching strategy is not enforced.
- **Spec Folder Convention**: Specs are organized in `specs/` folder at repo root, following the documented stage file naming convention (constitution.md, spec.md, etc.). Non-conforming repos will have limited visibility (missing stages shown as gray).
- **File System**: Working directories are on local or network-mounted file systems with reasonable access times (< 1s per repo). Very slow file systems (e.g., FUSE-based) may impact scan performance but won't break functionality.
- **Database**: SQLite WAL mode provides sufficient concurrency for single-machine use. Multi-machine concurrent access to the same DB file is not supported.
- **External Editors**: Specs may be edited in external text editors (VS Code, etc.) while Magenta IDE is open. File watcher will detect changes (operating system file system events are available).
- **Scope Boundaries**: Multi-repository features (parallel repo management, cross-repo coordination) are **out of scope for Phase 1** (Kick-Start). Phase 5 will introduce true multi-repo features.
- **Credential Storage**: No credentials are stored by the Kick-Start feature. Git operations assume user has configured git credentials locally (SSH keys, git credential helper, etc.).
- **Offline Mode**: App works offline; network access only required for future agent dispatch features (out of scope for Phase 1).

---

## Technical Architecture

### Three-Process Model

```
┌─────────────────────────────────────────────────────────────┐
│                      Main Process                            │
│              (Electron, window management)                   │
│                                                              │
│       ┌─────────────────────────────────────────┐           │
│       │   Preload Script (IPC bridge)            │           │
│       │   - Exposes ipc.send() and ipc.on()     │           │
│       └─────────────────────────────────────────┘           │
└──────────────────────┬──────────────────────────────────────┘
                       │ IPC (Unix socket)
                       │
┌──────────────────────┴──────────────────────────────────────┐
│                    Daemon Process                            │
│           (Node.js, background services)                     │
│                                                              │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │  SQLite DB │  │ Repo Scanner │  │ Spec Reader/Watcher│  │
│  │  (Drizzle) │  │ (background) │  │ (chokidar)         │  │
│  └────────────┘  └──────────────┘  └────────────────────┘  │
│  ┌──────────────┐  ┌─────────────────────────────────────┐  │
│  │ Config Mgr   │  │ IPC Message Handlers                │  │
│  └──────────────┘  │ - repo:list, repo:scan              │  │
│                    │ - spec:list, spec:list:updated      │  │
│                    │ - config:*, session:*               │  │
│                    └─────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘

                       │ IPC (Unix socket)
                       │
┌──────────────────────┴──────────────────────────────────────┐
│                  Renderer Process                            │
│              (React, UI components)                          │
│                                                              │
│  ┌──────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │   Zustand    │  │  React Components │  │  React Flow   │ │
│  │   Store      │  │  (Sidebar, Flow)  │  │  Diagram      │ │
│  └──────────────┘  └──────────────────┘  └───────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**IPC Contract**:
- **Request/Response**: Renderer sends `{ type: 'repo:list' }`, Daemon responds with `{ type: 'repo:list:result', repos: [...] }`.
- **Async Operations**: Long-running scans emit progress events (`repo:scan:progress`) and complete event (`repo:scan:complete`) to keep UI responsive.
- **Subscriptions**: File watcher emits `spec:list:updated` when spec files change on disk; UI listens and updates without re-requesting.

---

## Data Model: SQLite Schema

```sql
-- Scanned repositories
CREATE TABLE repos (
  id          TEXT PRIMARY KEY,     -- ulid
  name        TEXT NOT NULL,        -- directory name
  path        TEXT NOT NULL UNIQUE, -- absolute path
  branch      TEXT NOT NULL,        -- current branch (e.g., "main")
  has_specs   INTEGER NOT NULL DEFAULT 0,  -- boolean: specs/ dir exists
  spec_count  INTEGER NOT NULL DEFAULT 0,  -- number of spec folders
  status      TEXT NOT NULL DEFAULT 'active', -- active | missing | archived
  scanned_at  INTEGER NOT NULL,     -- last scan timestamp
  created_at  INTEGER NOT NULL      -- first seen timestamp
);

-- Scan source directories
CREATE TABLE working_dirs (
  id    TEXT PRIMARY KEY,  -- ulid
  path  TEXT NOT NULL UNIQUE
);

-- Session state (single row)
CREATE TABLE session_state (
  id                   INTEGER PRIMARY KEY CHECK (id = 1),
  selected_repo_path   TEXT,        -- FK to repos.path
  selected_spec_path   TEXT,        -- absolute path of spec folder
  selected_file_path   TEXT,        -- absolute path within spec
  sidebar_width        INTEGER,     -- pixels
  activity_panel_width INTEGER,     -- pixels
  activity_panel_open  INTEGER DEFAULT 1,  -- boolean
  main_tab             TEXT DEFAULT 'flow', -- flow | editor | worktrees
  updated_at           INTEGER NOT NULL     -- timestamp
);
```

---

## API / IPC Messages

**From Renderer to Daemon (Requests)**:

```typescript
// Get all repos (instant from DB cache)
{ type: 'repo:list' }
Response: { type: 'repo:list:result', repos: ScannedRepo[] }

// Trigger manual scan
{ type: 'repo:scan' }
Response: { type: 'repo:scan:started' }
// Followed by periodic: { type: 'repo:scan:progress', ... }
// And final: { type: 'repo:scan:complete', repos, added, updated, missing }

// Get specs for a repo
{ type: 'spec:list', repoPath: string }
Response: { type: 'spec:list:result', repoPath, specs: SpecFolder[] }

// Get/update session state
{ type: 'session:get' }
Response: { type: 'session:response', state: SessionState }

{ type: 'session:update', state: SessionState }
Response: { type: 'session:updated' }

// Config management
{ type: 'config:get' }
Response: { type: 'config:response', config: MagentaConfig }

{ type: 'config:add-working-dir', path: string }
Response: { type: 'config:updated' }
// Plus triggers repo:scan

{ type: 'config:remove-working-dir', path: string }
Response: { type: 'config:updated' }
```

**From Daemon to Renderer (Pushes/Events)**:

```typescript
// Repo scan progress
{ type: 'repo:scan:started' }
{ type: 'repo:scan:progress', scanned: number, total: number, currentDir: string }
{ type: 'repo:scan:complete', repos, added, updated, missing }

// Spec updates (from file watcher)
{ type: 'spec:list:updated', repoPath, specs }

// Config updates (for multi-window sync)
{ type: 'config:updated', config }
```

---

## UI Mockup Reference

The implementation follows the provided mockup with three main sections:

1. **Sidebar** (left): Repositories list with status badges, branch names, and spec tree
2. **Main Panel** (center): React Flow spec pipeline diagram with interactive nodes
3. **Activity Panel** (right): Agent status placeholder, quick actions (View diff, Pause agents, New spec, Run queued), legend

All panels are resizable via Resizable (from shadcn/ui).

---

## Definition of Done (Pre-Implementation)

- [ ] All 6 user stories approved by stakeholders
- [ ] Mockup UI approved and matches final design system decisions
- [ ] Constitution of project reviewed and ratified
- [ ] Tech stack (Electron, React, Zustand, Drizzle, simple-git, chokidar) approved
- [ ] SQLite schema reviewed for normalization and query efficiency
- [ ] IPC message contract finalized and documented
- [ ] Testing strategy (unit, integration, E2E) defined
- [ ] 10 tasks generated and estimated for implementation

