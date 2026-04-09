# Magenta IDE — Feature Specification

**Version:** 1.0  
**Status:** Active Development  
**Last Updated:** April 2026  
**Target Release:** Phase 6 Complete

---

## 1. Overview

### Product Vision

**Magenta IDE** is a desktop-first developer tool that orchestrates the full software development lifecycle—from specification through code review—across multiple repositories simultaneously. It bridges the gap between high-level requirements and implementation by managing an end-to-end workflow: **Spec → Plan → Task → Implement → Review**.

The tool dispatches implementation work to AI agents (Claude Code, GitHub Copilot) in isolated git worktrees, enabling safe, parallel development without source tree conflicts. Developers retain full visibility and control through live-streaming agent logs, real-time diff viewers, and a Kanban-based task board.

### Target Users

- **Senior engineers** who design technical specifications and oversee multi-agent workflows
- **Development teams** managing multiple repositories with complex interdependencies
- **Organizations** leveraging AI-assisted development while maintaining code review standards

### Core Value Proposition

1. **Unified workspace** for managing N repositories without context switching
2. **Spec-driven automation** eliminates manual task creation and assignment
3. **Safe AI dispatch** using git worktrees prevents conflicts and enables rollback
4. **Full observability** into agent work via real-time logs, diffs, and progress tracking
5. **Native code review** with PR generation and approval workflows

---

## 2. Scope

### In Scope

- Desktop application (Electron) running on macOS, Windows, and Linux
- Multi-repository registration and lifecycle management
- Rich markdown specification editor with approval workflow
- AI agent task dispatch to Claude Code and GitHub Copilot
- Isolated git worktree creation and lifecycle management
- Task queue with configurable concurrency limits
- Real-time log streaming from agent processes
- Diff viewer with file-level and hunks highlighting
- Kanban-style task board with drag-and-drop workflow
- Pull request creation and tracking
- Global and per-repository concurrency controls
- Basic settings and configuration persistence
- System tray integration for background daemon
- Application packaging and distribution via electron-builder

### Out of Scope

- Web-based version (desktop-only initially)
- Proprietary AI model integration (uses OpenAI-compatible APIs only)
- Advanced code analytics or metrics dashboards
- Complex merge conflict resolution UI (delegated to Git)
- Third-party Git hosting beyond GitHub (extensible in later versions)
- IDE extensions or language server integrations (future consideration)
- Time tracking or team collaboration features

---

## 3. Key Features

### 3.1 Multi-Repository Management

**Objective:** Enable seamless workflow across N registered repositories within a single IDE window.

#### Requirements

- **Repository Registration**
  - Add repositories via file browser or Git URL
  - Store repository metadata (name, path, default branch, clone URL)
  - Support both local on-disk and remote (Git) repositories
  - Display repository registry in a sidebar with search/filter
  - Indicate repository health (Git status, last updated, agent activity)

- **Repository Lifecycle**
  - Clone remote repositories on-demand with progress tracking
  - Maintain local metadata index (SQLite)
  - Support repository removal and re-registration
  - Validate Git configuration and permissions at registration time

- **Repository Context Switching**
  - Quick-switch between active repository contexts
  - Preserve view state per repository (spec, tasks, board position)
  - Display current repository in header and breadcrumb

#### Acceptance Criteria

- [ ] Register 10+ repositories without UI degradation
- [ ] Switch repository context in < 200ms
- [ ] Display repository list with search in < 500ms
- [ ] Handle repository removal without cascading errors

---

### 3.2 Spec-Driven Development

**Objective:** Enable engineers to author detailed specifications that drive task automation and AI agent dispatch.

#### Requirements

- **Specification Editor**
  - Rich markdown editor (CodeMirror 6) with syntax highlighting
  - Live preview pane with rendered markdown
  - Embedded YAML frontmatter for metadata (title, acceptance criteria, estimation)
  - Auto-save with durable persistence (SQLite)
  - Undo/redo support
  - Search and replace within spec

- **Specification Metadata**
  - Title, description, owner, created/updated timestamps
  - Status: Draft, Pending Approval, Approved, Implemented, Archived
  - Acceptance criteria (free-form markdown list)
  - Estimation (story points, hours, or complexity level)
  - Custom tags and categories for organization

- **Approval Workflow**
  - Specs marked "Pending Approval" are visible to approvers
  - Approval requires reviewer role and optional comments
  - Approved specs trigger automatic task generation
  - Rejection with feedback loops back to author
  - Audit trail of all approvals and rejections

- **Task Generation**
  - Parse approved spec into discrete tasks
  - Extract task descriptions from spec sections
  - Auto-assign dependencies based on spec structure
  - Populate task queue with generated items
  - Track lineage between spec and generated tasks

#### Acceptance Criteria

- [ ] Create and save spec with 5,000+ characters without lag
- [ ] Editor handles 20+ markdown includes without performance issue
- [ ] Approval workflow completes in < 1 second
- [ ] Task generation from spec produces > 95% accurate task descriptions
- [ ] Undo stack maintains 50+ operations

---

### 3.3 AI Agent Task Dispatch

**Objective:** Safely dispatch implementation work to isolated AI agents with full observability.

#### Requirements

- **Agent Integration**
  - Support Claude Code via Command-Line Interface (CLI)
  - Support GitHub Copilot via `gh copilot` command
  - Extensible runner interface for future agents
  - Validate agent availability at dispatch time

- **Task Queue**
  - Queue tasks for dispatch to agents
  - Per-repository concurrency limits (e.g., max 3 agents per repo)
  - Global concurrency ceiling (e.g., max 10 agents total)
  - Pause/resume global and per-repo task execution
  - Priority-based task ordering (P0 → P3)
  - Retry logic with exponential backoff for failed tasks

- **Worktree Management**
  - Create isolated git worktree per task
  - Branch naming convention: `agent/<task-id>/<branch-name>`
  - Worktree cleanup after agent completion or failure
  - Prevent worktree collisions and stale worktree detection

- **Task Execution**
  - Spawn agent process with task context (spec, acceptance criteria, file paths)
  - Stream stdout/stderr to realtime log viewer
  - Capture exit code and completion status
  - Set timeout per task (configurable, default 30 minutes)
  - Support task cancellation and graceful shutdown

- **Agent Communication**
  - Pass task via command-line arguments or stdin JSON
  - Receive task result via stdout JSON with:
    - Status (success/failure)
    - Changed files and line counts
    - Summary of changes
    - Confidence score and notes
  - Handle agent crashes and timeouts

#### Acceptance Criteria

- [ ] Dispatch task to agent in < 2 seconds
- [ ] Stream agent logs with < 100ms latency
- [ ] Support 10+ simultaneous agents without resource exhaustion
- [ ] Task retry recovers from transient failures 90% of the time
- [ ] Worktree cleanup succeeds 99% of the time

---

### 3.4 Live Monitoring & Progress Tracking

**Objective:** Provide real-time visibility into agent work and task progress.

#### Requirements

- **Task Board (Kanban)**
  - Columns: Queue, In Progress, Review Pending, Approved, Merged, Failed
  - Drag-and-drop task card movement (manual override)
  - Task cards show: ID, title, assignee, status, estimated vs actual time
  - Real-time status updates from daemon
  - Filter by priority, assignee, status, tag
  - Grouping options: by repository, assignee, sprint (optional)

- **Live Log Viewer**
  - Display agent stdout/stderr in real-time as task executes
  - Color-coded output (errors in red, warnings in yellow, info in blue)
  - Search within logs
  - Pause/resume log capture
  - Download full log transcript
  - Timestamp each log line

- **Diff Viewer**
  - Display unified diff of agent changes
  - File-level navigation (previous/next file)
  - Syntax highlighting per file type
  - Side-by-side or unified view options
  - Highlight new, modified, deleted lines
  - Copy-to-clipboard for individual hunks
  - Review controls: approve, request changes, comment

- **Progress Dashboard**
  - Summary stats: total tasks, completed, in-progress, failed
  - Time tracking: estimated vs actual per task
  - Burn-down chart (optional, Phase 5+)
  - Repository overview: repos, active agents, queued tasks
  - Quick access to pending approvals

#### Acceptance Criteria

- [ ] Log updates appear within 200ms of agent output
- [ ] Diff viewer renders files up to 50KB without lag
- [ ] Board updates support 100+ simultaneous dragging operations
- [ ] Search logs across 10K+ lines in < 500ms
- [ ] Kanban state persists across application reload

---

### 3.5 Pull Request Workflow

**Objective:** Integrate completed agent work into PR workflow for code review.

#### Requirements

- **PR Creation**
  - Auto-generate PR title from task spec and agent summary
  - Auto-populate PR description with:
    - Link to original spec
    - List of changed files
    - Agent execution log excerpt
    - Acceptance criteria checklist
  - Support custom PR title/description override
  - Create PR against specified target branch (default: `main`)

- **PR Tracking**
  - Display PR status in task board (e.g., "PR #123 open")
  - Link to GitHub PR
  - Sync PR review state back to Magenta IDE
  - Show PR approval status and required reviewers
  - Auto-merge on approval (configurable)

- **Review Controls**
  - View PR details without leaving Magenta IDE (optional, Phase 4+)
  - Manual review approval/rejection within CLI
  - Merge PR and create subsequent task if needed

#### Acceptance Criteria

- [ ] PR creation completes in < 5 seconds
- [ ] PR description auto-population has > 95% accuracy
- [ ] PR status syncs within 10 seconds of GitHub update
- [ ] Auto-merge respects branch protection rules

---

### 3.6 Concurrency & Flow Control

**Objective:** Enable safe, observable control of multi-agent execution without resource exhaustion.

#### Requirements

- **Global Concurrency Control**
  - Hard limit on total simultaneous agents (e.g., 10)
  - Pause/resume all agent execution globally
  - Display current vs max agent count in UI
  - Graceful shutdown with pending task cancellation

- **Per-Repository Limits**
  - Configurable max agents per repository (default: 3)
  - Pre-approve allocations before dispatch
  - Prevent single repo from monopolizing global slot budget
  - Display per-repo utilization

- **Task Prioritization**
  - Priority levels: P0 (critical), P1 (high), P2 (medium), P3 (low)
  - Queue ordering respects priority + FIFO within priority
  - Allow runtime priority override

- **Throttling & Backpressure**
  - Detect and suppress burst task creation
  - Gradual rollout for large batches (50+ tasks)
  - Database connection pooling to prevent saturation

#### Acceptance Criteria

- [ ] Pause/resume toggles complete in < 500ms
- [ ] Global hard limit prevents exceeding max agents
- [ ] Per-repo limits enforced within 1 second of config change
- [ ] Task priority order maintained with < 100ms deviation

---

### 3.7 Configuration & Settings

**Objective:** Provide flexible, persistent configuration for diverse user workflows.

#### Requirements

- **Application Settings**
  - Default repository directory
  - Default Git branch (main/develop/etc)
  - Agent priority (Claude Code vs Copilot)
  - Global concurrency limit and task timeout
  - Auto-save interval (seconds)
  - Theme preference (light/dark/system)
  - Keyboard shortcuts (customizable)

- **Repository Settings**
  - Per-repo agent concurrency limit
  - Default task priority
  - Branch naming prefix
  - Post-merge cleanup (auto-delete worktrees)
  - Notification preferences

- **Agent Configuration**
  - Claude Code: API key, model selection, temperature, max tokens
  - GitHub Copilot: auth token, Copilot API endpoint
  - Agent timeout per task
  - Retry attempts and backoff strategy

- **Persistence**
  - Store settings in SQLite (user_settings table)
  - Encrypt sensitive data (API keys)
  - Version and migrate settings across app updates
  - Export/import settings (JSON format)

#### Acceptance Criteria

- [ ] Settings save and reload without data loss
- [ ] Sensitive data encrypted in database
- [ ] Settings UI responsive with 20+ configuration items
- [ ] Export/import round-trip preserves all data

---

## 4. Technical Architecture

### 4.1 System Architecture

**Three-Process Model:**

1. **Main Process (Electron)**
   - Lifecycle management (app launch, window creation, shutdown)
   - IPC bridge between UI and Daemon
   - Menu and system tray integration
   - File system access (sandboxed)
   - Window state persistence

2. **Daemon Process (Node.js)**
   - Repository lifecycle management
   - Git operations (worktree creation, branch management)
   - Task queue and scheduling
   - Agent process spawning and monitoring
   - Log streaming and buffer management
   - SQLite database access
   - IPC server (listening on localhost:port with auth token)

3. **Renderer Process (React + TypeScript)**
   - Repository browser
   - Spec editor (CodeMirror 6)
   - Kanban task board
   - Log viewer and diff viewer
   - Settings panel
   - Progress dashboard

### 4.2 Data Model (SQLite)

**Core Tables:**

```sql
-- Repositories
CREATE TABLE repositories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  clone_url TEXT,
  default_branch TEXT DEFAULT 'main',
  status TEXT DEFAULT 'active', -- active, archived, inactive
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSON
);

-- Specifications
CREATE TABLE specifications (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL, -- Markdown
  status TEXT DEFAULT 'draft', -- draft, pending_approval, approved, implemented, archived
  owner_id TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  approved_at TIMESTAMP,
  approved_by TEXT,
  acceptance_criteria TEXT, -- JSON array
  estimation JSON, -- {story_points, hours, complexity}
  tags TEXT, -- JSON array
  FOREIGN KEY (repo_id) REFERENCES repositories(id)
);

-- Tasks
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  spec_id TEXT,
  repo_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL, -- Markdown
  status TEXT DEFAULT 'queued', -- queued, in_progress, review_pending, approved, merged, failed
  priority TEXT DEFAULT 'p2', -- p0, p1, p2, p3
  assigned_agent TEXT, -- claude_code, copilot, tbd
  worktree_path TEXT,
  branch_name TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  pr_url TEXT,
  pr_status TEXT,
  notes TEXT,
  FOREIGN KEY (repo_id) REFERENCES repositories(id),
  FOREIGN KEY (spec_id) REFERENCES specifications(id)
);

-- Agent Executions
CREATE TABLE agent_executions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  status TEXT DEFAULT 'running', -- running, success, failure, timeout, cancelled
  exit_code INTEGER,
  stdout TEXT, -- Full log (blob)
  stderr TEXT, -- Full log (blob)
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  duration_seconds INTEGER,
  changed_files JSON, -- {file_path, additions, deletions}
  summary TEXT,
  confidence_score REAL,
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

-- User Settings
CREATE TABLE user_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL, -- JSON-serialized
  encrypted BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Approval Audit Trail
CREATE TABLE approvals (
  id TEXT PRIMARY KEY,
  spec_id TEXT NOT NULL,
  approver_id TEXT NOT NULL,
  status TEXT NOT NULL, -- approved, rejected
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (spec_id) REFERENCES specifications(id)
);
```

### 4.3 IPC Contract (Daemon ↔ UI)

**Message Format:**

```json
{
  "id": "uuid",
  "method": "repository.register | repository.list | spec.create | task.queue | ...",
  "params": { ... },
  "timestamp": "ISO-8601"
}
```

**Response Format:**

```json
{
  "id": "uuid (matching request)",
  "result": { ... } | null,
  "error": { "code": -1, "message": "..." } | null,
  "timestamp": "ISO-8601"
}
```

**Real-Time Event Streams (Daemon → UI):**

- `task.status_changed` — Task status transition (queued → in_progress → etc)
- `log.chunk` — Agent log chunk (stdout/stderr with timestamp)
- `agent.started | agent.completed` — Agent process lifecycle
- `worktree.created | worktree.cleaned` — Worktree operations
- `config.updated` — Settings change notification

### 4.4 Module Organization (pnpm Monorepo)

```
packages/
├── shared/              # Shared types, utilities, constants
│   ├── src/models/      # TypeScript interfaces (Repository, Spec, Task, etc)
│   ├── src/utils/       # Helpers (ID generation, validation, formatting)
│   └── src/ipc.ts       # IPC message types and contracts
├── daemon/              # Node.js daemon process
│   ├── src/index.ts     # Entry point, IPC server setup
│   ├── src/services/    # Core business logic
│   │   ├── repo-service.ts
│   │   ├── spec-service.ts
│   │   ├── task-service.ts
│   │   ├── agent-runner.ts
│   │   └── git-service.ts
│   ├── src/db/          # SQLite and Drizzle ORM
│   │   ├── schema.ts    # Table definitions
│   │   └── migrations/
│   ├── src/agents/      # Agent-specific runners
│   │   ├── claude-code-runner.ts
│   │   └── copilot-runner.ts
│   ├── src/server/      # IPC server (Node.js net module)
│   └── src/git/         # Git operations (simple-git)
├── ui/                  # Electron + React frontend
│   ├── src/main.ts      # Electron main process entry
│   ├── src/preload.ts   # Preload script for IPC context isolation
│   ├── src/App.tsx      # Root React component
│   ├── src/pages/       # Page components
│   │   ├── repo-browser.tsx
│   │   ├── spec-editor.tsx
│   │   ├── task-board.tsx
│   │   └── settings.tsx
│   ├── src/components/  # Reusable UI components
│   │   ├── sidebar.tsx
│   │   ├── diff-viewer.tsx
│   │   ├── log-viewer.tsx
│   │   └── kanban-board.tsx
│   ├── src/hooks/       # Custom React hooks
│   │   ├── useIPCMessage.ts
│   │   ├── useTask.ts
│   │   └── useRealtimeLog.ts
│   ├── src/store/       # Zustand state management
│   │   ├── repo-store.ts
│   │   ├── task-store.ts
│   │   └── ui-store.ts
│   └── src/styles/      # Tailwind CSS config
```

---

## 5. Technical Constraints & Requirements

### 5.1 Technology Stack (Mandatory)

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Desktop Runtime | Electron 30 | Cross-platform desktop; proven for dev tools |
| UI Framework | React 19 | Type-safe component model; large ecosystem |
| Build Tool | Vite | Fast HMR development; optimized production builds |
| UI Components | shadcn/ui | Accessible, customizable component library |
| Styling | Tailwind CSS v4 | Utility-first CSS; atomic design support |
| State Mgmt | Zustand | Lightweight, TypeScript-first state |
| Editor | CodeMirror 6 | Rich markdown editing with plugins |
| Runtime | Node.js 22 | Latest LTS; stable async/await support |
| Database | SQLite + Drizzle ORM | Zero-config DB; type-safe queries |
| Git | simple-git | Programmatic Git CLI wrapper |
| Validation | Zod | Runtime type checking + inference |
| Testing | Vitest | Fast unit/integration testing |
| E2E Testing | Playwright | Cross-browser automation |
| Packaging | electron-builder | Standard distribution for Electron apps |

### 5.2 Architecture Constraints

- **IPC Isolation:** All Daemon ↔ UI communication must pass through authenticated IPC channel; no direct file system access from Renderer
- **Single SQLite Connection:** Daemon manages exclusive database connection; UI queries via IPC
- **Worktree Per Task:** Each dispatched task creates isolated git worktree; prevent simultaneous edits to source tree
- **Log Buffering:** Daemon buffers agent logs in memory (with disk overflow); UI subscribes to stream, not full history
- **Async-First:** All I/O operations async; no blocking calls in UI thread
- **Error Recovery:** Daemon must handle unclean shutdown gracefully (stale worktrees, orphaned processes)

### 5.3 Performance Requirements

| Metric | Target | Threshold |
|--------|--------|-----------|
| App startup time | < 3 seconds | 5s max |
| Repository list render | < 500ms | 1s max |
| Spec editor responsiveness | < 100ms input lag | 200ms max |
| Task dispatch latency | < 2 seconds | 5s max |
| Log streaming latency | < 100ms | 500ms max |
| Board update latency | < 200ms | 1s max |
| Database query (single) | < 50ms | 200ms max |
| Max simultaneous agents | 10 global | Scale to 20 with optimization |

### 5.4 Security & Compliance

- **IPC Authentication:** Token-based auth for Daemon IPC channel; rotate on launch
- **Credential Storage:** Encrypt sensitive data (API keys, tokens) via system keychain
- **Subprocess Sandboxing:** Agent processes inherit minimal environment; no parent process escalation
- **Git Credentials:** Use system Git config or SSH keys; don't store credentials in Magenta IDE
- **Log Sanitization:** Scrub sensitive data from logs (API keys, tokens) before persistence
- **Code Review:** Require approval before PR merge (enforced via GitHub branch protection)

### 5.5 Compatibility & Versioning

- **OS Support:** macOS 11+, Windows 10 Build 1909+, Linux desktop (Ubuntu 20.04+, Fedora 32+)
- **Node.js:** v22+ (LTS)
- **Git:** v2.30+
- **Database Migration:** Auto-migrate SQLite schema on version upgrade
- **Backward Compatibility:** Maintain 2-version rollback support for data

---

## 6. Success Criteria

### MVP Criteria (Phase 1–3)

1. ✅ **Application Launch**
   - Electron app launches without errors
   - Daemon process starts and stabilizes
   - IPC round-trip (ping/ack) completes in < 100ms
   - SQLite database initializes and schema validates

2. ✅ **Repository Management**
   - Register 5+ repositories without data loss
   - Display repo list with metadata refresh in < 500ms
   - Switch between repos with preserved UI state

3. ✅ **Specification Authoring**
   - Create, edit, save specs with > 3,000 characters
   - Markdown rendering matches preview
   - Approval workflow executes without race conditions
   - Task generation from spec produces > 90% accurate items

4. ✅ **Agent Dispatch & Execution**
   - Dispatch task to Claude Code or Copilot in < 2 seconds
   - Stream agent logs in real-time (< 100ms latency)
   - Capture and display agent exit code and output
   - Graceful timeout on long-running agents (30 min default)

5. ✅ **Progress Tracking**
   - Kanban board reflects task status changes in real-time
   - Diff viewer renders 50KB+ files without lag
   - Log viewer searches 10K+ line logs in < 500ms

### Stability Criteria (Phase 4–5)

6. ✅ **Reliability**
   - Daemon uptime > 99% during normal operation
   - Task retry succeeds > 90% after transient failure
   - Worktree cleanup success > 99%
   - No data loss on ungraceful shutdown

7. ✅ **Scalability**
   - Support 50+ repositories in registry
   - Handle 100+ queued tasks without degradation
   - Support 10 simultaneous agents without resource exhaustion

8. ✅ **Code Quality**
   - Test coverage > 80% for critical paths
   - Zero critical security vulnerabilities on launch
   - Linting and type-checking pass 100%
   - E2E smoke tests cover 5+ core workflows

### Release Criteria (Phase 6)

9. ✅ **User Experience**
   - First-time onboarding completes in < 5 minutes
   - Settings UI functional and discoverable
   - Error messages are actionable and localized
   - Help/documentation available in-app

10. ✅ **Distribution**
    - electron-builder packaging creates distributable (.dmg, .exe, .AppImage)
    - Auto-update mechanism functional for minor versions
    - Release notes generation automated

---

## 7. Implementation Phases

### Phase 1: Foundation (1–2 weeks)

**Deliverables:**
- pnpm monorepo scaffold with TypeScript project references
- Electron shell with three-panel layout (sidebar, editor, main)
- Daemon process with authenticated IPC server
- SQLite database with core schema (repositories, specs, tasks, agents)
- Proof-of-concept: IPC ping/ack round-trip

**Definition of Done:** Electron app launches, daemon starts, IPC works, UI renders three-panel layout, database creation verified.

---

### Phase 2: Repo & Spec (2–3 weeks)

**Deliverables:**
- Repository registration UI (file browser, Git URL input)
- Repository metadata persistence and retrieval
- Rich markdown spec editor (CodeMirror 6) with preview
- Spec approval workflow (pending → approved → rejected)
- Automatic task generation from approved spec
- Spec search and filtering

**Definition of Done:** Register repos, author spec, approve to generate tasks, view generated tasks in queue.

---

### Phase 3: Worktree & Agents (3–4 weeks)

**Deliverables:**
- Git worktree creation and cleanup logic
- Task queue with priority ordering and concurrency limits
- Claude Code and GitHub Copilot runner implementations
- Real-time log streaming from agent processes
- Agent process spawning, monitoring, and error handling
- Log persistence and disk overflow handling
- Task status updates (queued → in_progress → etc)

**Definition of Done:** Dispatch task to agent, stream logs in real-time, complete task with status update and output capture.

---

### Phase 4: Task Board & Monitor (2–3 weeks)

**Deliverables:**
- Kanban-style task board with drag-and-drop (`queued → in_progress → review_pending → approved → merged`)
- Real-time task board updates via event stream
- Diff viewer with file-level navigation and hunks
- Log viewer with search, pause/resume, download
- PR creation from agent work with auto-populated description
- PR status tracking and sync
- Pause/resume global and per-repo task execution

**Definition of Done:** View task board, monitor agent progress with logs, review diffs, create PR, merge.

---

### Phase 5: Multi-Repo (2–3 weeks)

**Deliverables:**
- Cross-repository task overview (all repos in single view)
- Per-repository concurrency settings and enforcement
- Multi-repo search and filtering
- Parallel agent execution across repos (respecting global limits)
- Repository-level burn-down tracking (optional)
- Per-repo agent allocation and utilization dashboard

**Definition of Done:** Register 10+ repos, dispatch agents across multiple repos simultaneously, view unified progress.

---

### Phase 6: Polish & Package (2 weeks)

**Deliverables:**
- Settings UI (app, repo, agent configuration)
- First-time user onboarding workflow
- Keyboard shortcuts and command palette
- Help documentation and in-app guides
- electron-builder packaging (.dmg, .exe, .AppImage)
- Auto-update mechanism
- Error logging and crash reporting
- Unit tests (> 80% coverage for core)
- E2E smoke tests (5+ workflows)
- Release build and CI/CD pipeline

**Definition of Done:** Production-ready distribution package, all tests passing, user onboarding complete, changelog generated.

---

## 8. Integration Points

### External Systems

1. **Claude Code CLI** — Task dispatch via `claude` command; JSON request/response
2. **GitHub CLI** — PR creation via `gh pr create`; PR sync via `gh pr status`
3. **GitHub Web API** — Fallback for PR operations; OAuth token required
4. **System Git** — All repository operations via `git` command
5. **System Keychain** — Credential storage for API keys and tokens

### Configuration Files

- `magenta.config.json` — Per-repository configuration (concurrency, branch prefix, etc)
- `~/.magenta/settings.json` — User-level settings (encrypted sensitive data)
- SQLite database — Central data store

---

## 9. Error Handling & Recovery

### Common Failure Modes

| Scenario | Detection | Recovery |
|----------|-----------|----------|
| Agent timeout (30+ min) | Timer expiration | Cancel task, mark failed, retry queue |
| Git worktree conflict | `git worktree list` shows stale | Auto-prune stale worktrees on daemon startup |
| IPC connection dropped | No heartbeat for 5s | Reconnect with exponential backoff; queue UI updates |
| Agent process crash | Exit code -1 or signal | Capture exit signal, log, mark task failed |
| Spec approval race condition | Concurrent approvals | DB constraint (unique approval per spec per reviewer) |
| Task queue overflow | > 10,000 tasks | Reject new incoming tasks; alert user |
| Database corruption | Query fails repeatedly | Load backup, notify user of data loss risk |

### Graceful Degradation

- **Partial Failure:** Task failure doesn't block other queued tasks
- **Log Overflow:** Old logs rotated to disk; realtime still streams
- **Network Isolation:** Daemon continues local operations; PR sync deferred
- **Agent Unavailable:** Task marked failed; user can retry with different agent

---

## 10. Future Extensibility

### Phase 7+ Opportunities

- **Advanced Merge Strategies** — Multi-agent collaborative approvals
- **Spec Analytics** — Track spec quality and approval rate metrics
- **Code Analytics** — Lines of code, complexity, coverage trends per agent
- **Scheduled Tasks** — Periodic spec updates or nightly test agents
- **Slack/Teams Integration** — Task status notifications to chat
- **Custom Agents** — User-defined runner scripts (e.g., bash, Python)
- **Web Dashboard** — Read-only Kanban and progress view
- **VS Code Extension** — Launch Magenta IDE from editor
- **Team Collaboration** — Shared workspace with permissions
- **Plugin System** — Third-party extensions for custom workflows

---

## Appendix: Terminology

| Term | Definition |
|------|-----------|
| **Spec** | High-level requirement document (markdown) authored by senior engineer |
| **Task** | Discrete, actionable work item auto-generated from approved spec |
| **Agent** | AI language model (Claude, Copilot) that implements task in isolated git branch |
| **Worktree** | Isolated checkout of repository; enables parallel agent work without conflicts |
| **Daemon** | Background Node.js process managing repos, tasks, agents, and database |
| **IPC** | Inter-Process Communication between Electron UI and Daemon |
| **PR** | Pull Request created from agent work; triggers code review workflow |
| **Acceptance Criteria** | List of conditions that must be met for spec/task completion |
| **Concurrency Limit** | Max simultaneous agents: per-repository or global |
| **Kanban Board** | Visual task workflow tracker (columns: queue, in-progress, review, etc) |

---

**End of Specification**
