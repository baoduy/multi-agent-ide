# Magenta IDE — Implementation Plan

**Version:** 1.0  
**Status:** Ready for Development  
**Last Updated:** April 2026  
**Target Completion:** Week 14–16  

---

## Executive Summary

This document outlines a detailed, actionable implementation plan for **Magenta IDE**, a desktop-first orchestration tool for AI-assisted multi-repository development. The project spans six phases over approximately 12–14 weeks, delivering incrementally from foundational infrastructure through full product release.

The plan emphasizes:
- **Phased delivery** with working sub-features at each checkpoint
- **Class-first OOP design** with clear service boundaries
- **Rigorous testing** at each phase (unit, integration, e2e)
- **Risk mitigation** for cross-repo isolation, IPC reliability, and concurrent agent execution
- **Actionable success criteria** suitable for retrospective validation

---

## 1. Architecture Overview

### 1.1 Three-Process Model

```
┌────────────────────────────────────────────────────────┐
│                   Main Process (Electron.js)           │
│  • Window lifecycle management                         │
│  • IPC broker (UI ↔ Daemon)                            │
│  • System tray integration                             │
└──────────────────────┬─────────────────────────────────┘
                       │
         ┌─────────────┴─────────────┐
         │ Preload Script            │
         │ (Context isolation)       │
         │                           │
    ┌────▼───────────────┐      ┌───▼──────────────────┐
    │ Renderer (React)   │      │ Daemon (Node.js)     │
    │ • Spec editor     │      │ • Repo lifecycle     │
    │ • Kanban board    │      │ • Task scheduler     │
    │ • Log viewer      │      │ • Agent spawning     │
    │ • Diff viewer     │      │ • SQLite DB access   │
    │ • Settings UI     │      │ • Git operations     │
    │ • IPC client      │◄────►│ • IPC server         │
    │ • Zustand store   │      │ • Log buffering      │
    └───────────────────┘      └──────────────────────┘
                                      │
                                      ├─ Agent Process 1 (Claude)
                                      ├─ Agent Process 2 (Copilot)
                                      └─ ...Agent Process N
```

### 1.2 Data Flow Architecture

```
User Action (Spec Edit)
    ↓
React Component → Zustand Store
    ↓
IPC Message: { method: 'spec.update', params: {...} }
    ↓
IPC Channel (Authenticated Token)
    ↓
Daemon IPC Server → Service Dispatcher
    ↓
SpecService.updateSpec() → SpecRepository (ORM)
    ↓
SQLite Write
    ↓
IPC Event: { event: 'spec.updated', data: {...} }
    ↓
Renderer Receives Event → Zustand Update
    ↓
React Re-render (UI reflects change)
```

### 1.3 IPC Security & Authentication

- **Token-based auth:** Daemon generates random token at startup; Electron main process receives via stdin/stdout handshake
- **Message validation:** Every IPC message validated against Zod schema before processing
- **Rate limiting:** 1,000 messages/minute per client (configurable)
- **Encryption:** Sensitive response data (API keys) encrypted before transmission
- **Audit trail:** All IPC calls logged (method, params hash, response code)

### 1.4 Class-First OOP Design Principles

The daemon and UI are organized as **layered services** with clear separation of concerns:

**Daemon Architecture (Class-Based):**
```
DaemonServer (singleton)
├── RepositoryService (manages repo lifecycle)
├── SpecService (manages specs and approvals)
├── TaskService (queue, scheduling, persistence)
├── AgentRunner (abstract base; dispatches to Claude/Copilot runners)
├── GitService (git operations wrapper)
├── DatabaseService (SQLite + Drizzle)
└── IPCServer (message routing and authentication)

AgentRunner (abstract)
├── ClaudeCodeRunner
└── CopilotRunner

Repository (ORM model)
Specification (ORM model)
Task (ORM model)
AgentExecution (ORM model)
```

**UI Architecture (State + Components):**
```
Zustand Stores (pure state, no side effects)
├── RepoStore (repo registry)
├── SpecStore (current spec in editor)
├── TaskStore (board state, filters)
├── UIStore (theme, sidebar collapse, etc)

React Components
├── Pages (full-page layouts)
├── Features (composite components with hooks)
├── UI (reusable primitives from shadcn/ui)

Custom Hooks
├── useIPCMessage(method, params) → data, loading, error
├── useTask(taskId) → Task | null, updates
└── useRealtimeLog(taskId) → LogEvent[], isStreaming
```

---

## 2. Dependency Graph

### 2.1 Phase Sequencing

```
Phase 1: Foundation ──┐
                      │
Phase 2: Repo & Spec ─┼──┐
                      │  │
Phase 3: Worktree    ◄┴──┼──┐
         & Agents       │  │
                        │  │
Phase 4: Task Board  ◄──┴──┼──┐
         & Monitor       │  │
                         │  │
Phase 5: Multi-Repo  ◄───┴──┼─┐
                            │ │
Phase 6: Polish &       ◄───┴─┴─ Release
         Package
```

**Critical Dependencies:**
- Phase 1 **must** complete before Phase 2 (IPC, DB schema foundational)
- Phase 2 **must** complete before Phase 3 (tasks must exist to dispatch)
- Phase 3 **must** complete before Phase 4 (agent execution logs agents must produce output for board)
- Phase 4 can **partially** parallel Phase 5 (board works for single repo; multi-repo enhances it)
- Phase 6 **requires** Phase 4 complete (cannot polish incomplete features)

### 2.2 Inter-Service Dependencies

```
IPCServer
├── requires: DaemonServer, AuthService
├── exposes: all service methods via RPC

SpecService
├── requires: DatabaseService, TaskService
├── on approval: calls TaskService.generateFromSpec()

TaskService
├── requires: DatabaseService, AgentRunner, GitService
├── on dispatch: calls AgentRunner.execute()

AgentRunner
├── requires: GitService, TaskService
├── spawns: child processes (Claude, Copilot)

GitService
├── requires: system `git` binary
├── provides: worktree creation/cleanup, branch ops

DatabaseService
├── requires: SQLite driver, Drizzle ORM
├── singleton: no concurrent Daemon instances allowed
```

---

## 3. Detailed Phase Breakdown

### Phase 1: Foundation (Weeks 1–2)

#### 3.1.1 Objectives

Establish the core infrastructure: monorepo structure, IPC plumbing, database schema, and proof-of-concept for daemon ↔ UI communication.

#### 3.1.2 Deliverables

| Item | Ownership | Success Criteria |
|------|-----------|------------------|
| pnpm monorepo scaffold | DevOps | `pnpm install` resolves all packages; TypeScript project references work |
| Electron shell (3-panel layout) | Frontend Lead | App launches, renders sidebar/editor/main panes, no React errors in console |
| Daemon process bootstrapping | Backend Lead | Daemon starts, listens on TCP port, prints ready message within 2s |
| IPC authentication handshake | Backend Lead | Electron → Daemon token exchange succeeds; encrypted channel established |
| SQLite schema & Drizzle ORM setup | Database Lead | Schema creation idempotent; Drizzle migrations apply without error |
| IPC ping/ack proof-of-concept | Full Stack | Round-trip latency < 100ms; concurrent requests handled correctly |

#### 3.1.3 Module Structure Created

```
packages/shared/
├── src/types/
│   ├── index.ts               # Re-exports all types
│   ├── models.ts              # Repository, Spec, Task, etc (TS interfaces)
│   ├── ipc.ts                 # IPC message contracts (Zod schemas)
│   └── config.ts              # Configuration interfaces
├── src/utils/
│   ├── id-generator.ts        # UUID v4 generation (ulid for lexical sort)
│   ├── validators.ts          # Zod schemas for input validation
│   └── constants.ts           # Magic numbers, retry counts, timeouts
└── package.json

packages/daemon/
├── src/index.ts               # Main entry point, server bootstrap
├── src/daemon.ts              # DaemonServer class (coordinator)
├── src/ipc/
│   ├── server.ts              # IPCServer (Koa-like message routing)
│   ├── auth.ts                # AuthService (token generation, validation)
│   └── types.ts               # IPC type guards
├── src/services/
│   ├── repository.service.ts  # RepositoryService class
│   ├── spec.service.ts        # SpecService class
│   ├── task.service.ts        # TaskService class
│   ├── agents/                # Agent runners
│   │   ├── base.runner.ts     # AgentRunner abstract class
│   │   ├── claude.runner.ts   # ClaudeCodeRunner
│   │   └── copilot.runner.ts  # CopilotRunner
│   ├── git.service.ts         # GitService class
│   ├── database.service.ts    # DatabaseService class (singleton)
│   └── config.service.ts      # ConfigService for settings
├── src/db/
│   ├── index.ts               # Drizzle instance export
│   ├── schema.ts              # Drizzle schema definitions
│   ├── migrations/
│   │   └── 001_init.sql       # Initial schema
│   └── seed.ts                # Optional seed data for dev
├── src/utils/
│   ├── logger.ts              # Logging service
│   ├── errors.ts              # Custom error classes
│   └── retry.ts               # Retry logic utility
└── package.json

packages/ui/
├── src/main.ts                # Electron main entry
├── src/preload.ts             # Context isolation preload
├── src/App.tsx                # Root React component
├── src/pages/
│   ├── dashboard.tsx          # Placeholder landing page
│   └── index.tsx              # Route root
├── src/components/
│   ├── sidebar/
│   │   ├── sidebar.tsx        # Sidebar layout
│   │   └── repo-list.tsx      # Repo item list (placeholder)
│   ├── editor/
│   │   └── editor.tsx         # Placeholder editor pane
│   └── main/
│       └── main.tsx           # Main content pane
├── src/store/
│   ├── repo.store.ts          # Zustand repo store
│   ├── ui.store.ts            # Zustand UI state
│   └── index.ts               # Store exports
├── src/hooks/
│   ├── useIPC.ts              # Custom hook for IPC calls
│   └── useStore.ts            # Convenience hook wrapper
├── src/types/
│   └── index.ts               # Re-export shared types
├── electron.vite.config.ts    # Vite + Electron config
├── tsconfig.json              # TypeScript config
└── package.json

// Root workspace
pnpm-workspace.yaml
tsconfig.base.json
.gitignore
README.md
```

#### 3.1.4 Key Implementation Details

**DaemonServer (Class):**
```typescript
// packages/daemon/src/daemon.ts
export class DaemonServer {
  private ipcServer: IPCServer;
  private repositoryService: RepositoryService;
  private specService: SpecService;
  private taskService: TaskService;
  private databaseService: DatabaseService;
  private configService: ConfigService;

  constructor(configPath: string) {
    this.configService = new ConfigService(configPath);
    this.databaseService = new DatabaseService(this.configService.dbPath);
    this.repositoryService = new RepositoryService(this.databaseService);
    this.specService = new SpecService(this.databaseService, this.taskService);
    this.taskService = new TaskService(this.databaseService, this.agentRunner, this.gitService);
    this.ipcServer = new IPCServer(3000, this.configService.ipcToken);
  }

  async start(): Promise<void> {
    await this.databaseService.initialize();
    this.ipcServer.registerHandler('repository.list', (params) =>
      this.repositoryService.listAll()
    );
    // ... more handlers
    await this.ipcServer.listen();
  }

  async shutdown(): Promise<void> {
    await this.ipcServer.close();
    await this.databaseService.close();
  }
}
```

**IPCServer (Class):**
```typescript
// packages/daemon/src/ipc/server.ts
export class IPCServer {
  private server: net.Server;
  private handlers: Map<string, Handler> = new Map();
  private authService: AuthService;

  constructor(port: number, token: string) {
    this.authService = new AuthService(token);
    this.server = net.createServer(this.handleConnection.bind(this));
  }

  registerHandler(method: string, handler: Handler): void {
    this.handlers.set(method, handler);
  }

  async listen(): Promise<void> {
    // Listen on TCP + Unix socket for cross-platform IPC
  }

  private async handleConnection(socket: net.Socket): Promise<void> {
    // Authenticate, parse JSON, route to handler, send response
  }
}
```

**DatabaseService (Singleton):**
```typescript
// packages/daemon/src/services/database.service.ts
export class DatabaseService {
  private static instance: DatabaseService;
  private db: ReturnType<typeof drizzle>;

  private constructor(dbPath: string) {
    this.db = drizzle(bettersqlite3(dbPath));
  }

  static getInstance(dbPath: string): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService(dbPath);
    }
    return DatabaseService.instance;
  }

  async initialize(): Promise<void> {
    // Run migrations
  }

  getConnection(): Database {
    return this.db;
  }
}
```

**Electron IPC Preload:**
```typescript
// packages/ui/src/preload.ts
import { contextBridge, ipcMain } from 'electron';

contextBridge.exposeInMainWorld('daemon', {
  async call(method: string, params: unknown): Promise<unknown> {
    // Connect to Daemon IPC, send message, receive response
    // Validates response schema
  },
  subscribe(event: string, callback: (data: unknown) => void): void {
    // Subscribe to daemon events
  },
  unsubscribe(event: string): void {
    // Cleanup subscription
  },
});

declare global {
  interface Window {
    daemon: DaemonAPI;
  }
}
```

#### 3.1.5 Testing Strategy (Phase 1)

| Test Type | Coverage | Tool | Examples |
|-----------|----------|------|----------|
| Unit | 90%+ for utils | Vitest | ID generation, validators, error handling |
| Integration | IPC channel | Vitest + mock net module | Daemon startup, IPC handshake, DB init |
| E2E | Smoke test | Playwright | App launch, window visible, no errors in logs |

**Example Test:**
```typescript
// packages/daemon/__tests__/ipc.server.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IPCServer } from '../src/ipc/server';

describe('IPCServer', () => {
  let server: IPCServer;

  beforeEach(() => {
    server = new IPCServer(3000, 'test-token');
  });

  afterEach(async () => {
    await server.close();
  });

  it('should authenticate valid tokens', async () => {
    server.registerHandler('test.ping', () => ({ ack: true }));
    await server.listen();
    
    const result = await callDaemon('test.ping', {}, 'test-token');
    expect(result).toEqual({ ack: true });
  });

  it('should reject invalid tokens', async () => {
    await expect(callDaemon('test.ping', {}, 'wrong-token'))
      .rejects.toThrow('Unauthorized');
  });
});
```

#### 3.1.6 Definition of Done

- [ ] Monorepo builds successfully: `pnpm install && pnpm build` (all packages)
- [ ] Electron app launches without errors: `pnpm dev` (ui package)
- [ ] Daemon process starts and prints "Server listening on port 3000"
- [ ] IPC handshake completes: token exchanged, authenticated channel established
- [ ] SQLite database created with schema: `sqlite3 magenta.db ".schema"`
- [ ] Ping/ack IPC round-trip < 100ms (measured 10 times)
- [ ] All Phase 1 unit tests passing: `pnpm test` (90%+ coverage)
- [ ] E2E smoke test passes: app launch → daemon ready → IPC connected
- [ ] README updated with setup instructions and architecture overview

---

### Phase 2: Repo & Spec (Weeks 3–5)

#### 3.2.1 Objectives

Enable repository registration, metadata management, and rich markdown spec authoring with approval workflow.

#### 3.2.2 Deliverables

| Item | Ownership | Success Criteria |
|------|-----------|------------------|
| Repository registration UI + service | Frontend + Backend | Register 5 repos, see list in sidebar, filter works |
| Repository metadata persistence | Backend | Repos survive daemon restart; metadata queries < 50ms |
| CodeMirror 6 spec editor integration | Frontend | Edit 5000+ char spec; markdown preview renders; undo/redo 50+ steps |
| Spec approval workflow service | Backend | Draft → Pending → Approved path; rejection with feedback; audit trail |
| Automatic task generation from spec | Backend | Parse approved spec; generate 5+ tasks; task descriptions accurate |
| Spec search and filtering | Frontend | Search 50 specs; filter by status/owner; results < 500ms |

#### 3.2.3 Module Structure Created

```
packages/daemon/
├── src/services/
│   ├── repository.service.ts          # NEW: RepositoryService (class)
│   ├── spec.service.ts                # NEW: SpecService (class)
│   └── task.service.ts                # NEW (partial): TaskService init
├── src/db/
│   ├── schema.ts                      # UPDATED: add repo, spec, approval tables
│   └── migrations/
│       └── 002_repos_specs.sql        # NEW

packages/ui/
├── src/pages/
│   ├── repo-browser.tsx               # NEW: repo list + register modal
│   ├── spec-editor.tsx                # NEW: CodeMirror + preview
│   └── index.tsx                      # UPDATED: route management
├── src/components/
│   ├── sidebar/
│   │   ├── sidebar.tsx                # UPDATED: repo switching
│   │   ├── repo-list.tsx              # NEW: actual repo listing
│   │   └── repo-register.tsx          # NEW: registration modal
│   └── editor/
│       ├── spec-editor.tsx            # NEW: CodeMirror integration
│       └── approval-panel.tsx         # NEW: approval UI
├── src/store/
│   ├── repo.store.ts                  # UPDATED: register, list, switch
│   ├── spec.store.ts                  # NEW: edit, save, approval state
│   └── index.ts                       # UPDATED
├── src/hooks/
│   ├── useIPC.ts                      # UPDATED: better error handling
│   ├── useRepository.ts               # NEW: repo CRUD hooks
│   └── useSpec.ts                     # NEW: spec CRUD + approval hooks
└── src/components/markdown/
    └── markdown-preview.tsx           # NEW: rendered markdown display
```

#### 3.2.4 Key Implementation Details

**RepositoryService (Class):**
```typescript
// packages/daemon/src/services/repository.service.ts
export class RepositoryService {
  constructor(private db: DatabaseService) {}

  async register(input: RegisterRepoInput): Promise<Repository> {
    // Validate path exists or clone from Git URL
    // Create repo entry in DB
    // Return repo object
  }

  async list(filter?: RepoFilter): Promise<Repository[]> {
    // Query DB with optional filters
    // Return paginated results
  }

  async get(repoId: string): Promise<Repository | null> {
    // Single repo lookup
  }

  async remove(repoId: string): Promise<void> {
    // Delete repo from registry (don't delete files)
  }
}
```

**SpecService (Class):**
```typescript
// packages/daemon/src/services/spec.service.ts
export class SpecService {
  constructor(
    private db: DatabaseService,
    private taskService: TaskService
  ) {}

  async create(input: CreateSpecInput): Promise<Specification> {
    // Create draft spec
    // Validate markdown, metadata
    // Return spec object
  }

  async update(specId: string, input: UpdateSpecInput): Promise<Specification> {
    // Update spec content, metadata
    // Emit event for UI refresh
  }

  async approve(specId: string, approverId: string, comment?: string): Promise<void> {
    // Validate approver role
    // Create approval record
    // Invoke taskService.generateFromSpec()
  }

  async reject(specId: string, reviewerId: string, feedback: string): Promise<void> {
    // Create rejection record
    // Revert status to draft
  }

  async generateTasks(specId: string): Promise<Task[]> {
    // Parse markdown sections
    // Extract tasks from structured content
    // Delegate to taskService.createBatch()
  }
}
```

**Task Generation Logic (ORM-based):**
```typescript
// packages/daemon/src/services/spec.service.ts (continued)
private parseSpecToTasks(spec: Specification): TaskInput[] {
  // Structured parsing of markdown:
  // ## Task: <title>
  // - Description
  // - Acceptance criteria
  // - Priority (optional)
  const tasks: TaskInput[] = [];
  const lines = spec.content.split('\n');
  
  let currentTask: Partial<TaskInput> | null = null;

  for (const line of lines) {
    if (line.startsWith('## Task:')) {
      if (currentTask) tasks.push(currentTask as TaskInput);
      currentTask = {
        specId: spec.id,
        repoId: spec.repoId,
        title: line.replace('## Task:', '').trim(),
        description: '',
        priority: 'p2',
      };
    } else if (currentTask && line.trim()) {
      currentTask.description += line + '\n';
    }
  }

  if (currentTask) tasks.push(currentTask as TaskInput);
  return tasks;
}
```

**Spec Editor Hook (React):**
```typescript
// packages/ui/src/hooks/useSpec.ts
export function useSpec(specId: string) {
  const [spec, setSpec] = useState<Specification | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const specStore = useSpecStore();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.daemon.call('spec.get', { specId });
      setSpec(data);
      setIsDirty(false);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [specId]);

  const save = useCallback(async (content: string) => {
    try {
      await window.daemon.call('spec.update', { specId, content });
      setIsDirty(false);
      specStore.updateSpec({ ...spec, content });
    } catch (err) {
      setError(err as Error);
    }
  }, [spec, specId, specStore]);

  return { spec, loading, error, isDirty, save, load };
}
```

#### 3.2.5 Testing Strategy (Phase 2)

| Test Type | Coverage | Tool | Examples |
|-----------|----------|------|----------|
| Unit | 85%+ | Vitest | RepositoryService, SpecService methods |
| Integration | Repo ↔ DB, Spec ↔ Approval | Vitest | Register repo, create spec, approve, generate tasks |
| Component | 80%+ | Vitest + React Testing Library | Spec editor, approval modal, repo list |
| E2E | Full workflow | Playwright | Register repo → Create spec → Approve → See tasks |

**Example Integration Test:**
```typescript
// packages/daemon/__tests__/spec.service.test.ts
describe('SpecService', () => {
  let specService: SpecService;
  let db: DatabaseService;

  beforeEach(async () => {
    db = new DatabaseService(':memory:'); // SQLite in-memory
    await db.initialize();
    specService = new SpecService(db, mockTaskService);
  });

  it('should generate tasks from approved spec', async () => {
    const spec = await specService.create({
      repoId: 'repo-1',
      title: 'Build dashboard',
      content: `## Task: Create header component\nDisplay user info\n## Task: Add auth`,
    });

    await specService.approve(spec.id, 'reviewer-1');

    const tasks = await specService.generateTasks(spec.id);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].title).toBe('Create header component');
  });
});
```

#### 3.2.6 Definition of Done

- [ ] Register >= 5 repos via UI; repos persist after restart
- [ ] Repository list renders with metadata (name, branch, status) in < 500ms
- [ ] Spec editor accepts >= 5000 chars without lag
- [ ] Markdown preview renders correctly with syntax highlighting
- [ ] Full approval workflow: draft → pending → approved → auto-generate tasks
- [ ] Rejection with feedback resets spec to draft
- [ ] Task generation produces >= 3 tasks per spec; descriptions match parsed sections
- [ ] Spec and task search works; results in < 500ms
- [ ] Undo/redo supports >= 50 operations in editor
- [ ] All Phase 2 tests passing (85%+ coverage)
- [ ] E2E test: register repo → author spec → approve → see 3+ generated tasks in queue
- [ ] Approval audit trail visible in DB: timestamps, approver ID, comments

---

### Phase 3: Worktree & Agents (Weeks 6–9)

#### 3.3.1 Objectives

Implement safe, isolated git worktree creation and AI agent dispatch with real-time log streaming.

#### 3.3.2 Deliverables

| Item | Ownership | Success Criteria |
|------|-----------|------------------|
| Git worktree service (create/cleanup) | Backend | Create 10 worktrees; cleanup removes all; stale detection works |
| Task queue with priority/concurrency | Backend | Queue 50 tasks; respect global limit (max 10); per-repo limits enforced |
| Claude Code runner | Backend | Dispatch task; stream logs; capture exit code, file changes, summary |
| GitHub Copilot runner | Backend | Dispatch task; stream logs; capture output same as Claude |
| Real-time log streaming | Full Stack | Logs appear in UI < 100ms after output; search across 10K lines < 500ms |
| Task status state machine | Backend | Transitions: queued → in_progress → review_pending → merged (with validation) |
| Agent process monitoring | Backend | Detect crashes, timeouts (30 min default), graceful shutdown |

#### 3.3.3 Module Structure Created

```
packages/daemon/
├── src/services/
│   ├── task.service.ts                # UPDATED: full queue + dispatch
│   ├── git.service.ts                 # NEW: worktree operations
│   ├── agent-runner.ts                # NEW: abstract base class
│   ├── agents/
│   │   ├── claude-code.runner.ts      # NEW: Claude integration
│   │   ├── copilot.runner.ts          # NEW: Copilot integration
│   │   └── index.ts                   # Exports
│   ├── log-streamer.ts                # NEW: log buffering + broadcast
│   └── concurrency-manager.ts         # NEW: slot allocation + enforcement
├── src/db/
│   ├── schema.ts                      # UPDATED: task, agent_execution tables
│   └── migrations/
│       └── 003_tasks_agents.sql       # NEW

packages/ui/
├── src/pages/
│   ├── task-board.tsx                 # NEW (partial): Kanban layout
│   └── index.tsx                      # UPDATED: router
├── src/components/
│   ├── board/
│   │   ├── kanban-board.tsx           # NEW: drag-drop columns
│   │   ├── task-card.tsx              # NEW: status, priority, title
│   │   └── column.tsx                 # NEW: droppable area
│   ├── logs/
│   │   ├── log-viewer.tsx             # NEW: real-time log display
│   │   └── log-search.tsx             # NEW: search + filter logs
│   └── sidebar/
│       └── queue-summary.tsx          # NEW: queued/running count
├── src/store/
│   ├── task.store.ts                  # NEW: board state, filters, drags
│   ├── log.store.ts                   # NEW: active logs, streaming state
│   └── index.ts                       # UPDATED
├── src/hooks/
│   ├── useTask.ts                     # NEW: fetch, update, dispatch
│   └── useRealtimeLog.ts              # NEW: subscribe to log stream
```

#### 3.3.4 Key Implementation Details

**GitService (Class):**
```typescript
// packages/daemon/src/services/git.service.ts
export class GitService {
  constructor(private logger: Logger) {}

  async createWorktree(repoPath: string, taskId: string, baseBranch: string): Promise<string> {
    // Branch name: agent/<taskId>/<base-branch-hash>
    const branchName = `agent/${taskId}/${shortHash(baseBranch)}`;
    const worktreePath = path.join(path.dirname(repoPath), `worktree-${taskId}`);

    // Create worktree
    await this.exec('git', ['worktree', 'add', worktreePath, '-b', branchName, baseBranch], {
      cwd: repoPath,
    });

    return worktreePath;
  }

  async cleanupWorktree(repoPath: string, worktreePath: string): Promise<void> {
    // Remove worktree and prune stale entries
    await this.exec('git', ['worktree', 'remove', worktreePath, '--force'], {
      cwd: repoPath,
    });
    await this.exec('git', ['worktree', 'prune']);
  }

  async getChangedFiles(worktreePath: string, baseBranch: string): Promise<FileChange[]> {
    // Diff HEAD..baseBranch to get changed files
    // Return file list with additions/deletions counts
  }

  private async exec(cmd: string, args: string[], options: ExecOptions): Promise<string> {
    // Execute git command, handle errors
  }
}
```

**AgentRunner Abstract Base:**
```typescript
// packages/daemon/src/services/agents/base.runner.ts
export abstract class AgentRunner {
  protected logger: Logger;
  protected logStreamer: LogStreamer;

  abstract get name(): string;

  abstract async execute(taskContext: TaskContext): Promise<AgentResult>;

  protected async streamLog(taskId: string, line: string, level: 'info' | 'error' | 'warn'): Promise<void> {
    this.logStreamer.emit({
      taskId,
      timestamp: new Date(),
      level,
      line,
    });
  }

  protected parseAgentResult(output: string): AgentResult {
    // Parse JSON-formatted agent output
    // Extract summary, confidence, changed files
  }
}
```

**ClaudeCodeRunner (Class):**
```typescript
// packages/daemon/src/services/agents/claude-code.runner.ts
export class ClaudeCodeRunner extends AgentRunner {
  get name(): string {
    return 'claude_code';
  }

  async execute(taskContext: TaskContext): Promise<AgentResult> {
    const command = `claude ${JSON.stringify(taskContext)}`;
    const process = spawn('sh', ['-c', command], {
      cwd: taskContext.worktreePath,
      env: { ...process.env, CLAUDE_API_KEY: this.apiKey },
    });

    const stdout: string[] = [];
    const stderr: string[] = [];

    process.stdout.on('data', (data) => {
      const line = data.toString().trim();
      stdout.push(line);
      this.streamLog(taskContext.id, line, 'info');
    });

    process.stderr.on('data', (data) => {
      const line = data.toString().trim();
      stderr.push(line);
      this.streamLog(taskContext.id, line, 'error');
    });

    return new Promise((resolve, reject) => {
      process.on('close', (code) => {
        if (code === 0) {
          const result = this.parseAgentResult(stdout.join('\n'));
          resolve(result);
        } else {
          reject(new Error(`Agent exited with code ${code}`));
        }
      });

      setTimeout(() => {
        process.kill();
        reject(new Error('Agent timeout (30 min)'));
      }, 30 * 60 * 1000);
    });
  }
}
```

**TaskService with Queue Management (Class):**
```typescript
// packages/daemon/src/services/task.service.ts
export class TaskService {
  private queue: PriorityQueue<Task> = new PriorityQueue();
  private concurrencyManager: ConcurrencyManager;
  private running: Map<string, AgentRunner> = new Map();

  constructor(
    private db: DatabaseService,
    private agentRunner: AgentRunner,
    private gitService: GitService,
    private logStreamer: LogStreamer
  ) {}

  async queue(taskInput: CreateTaskInput): Promise<Task> {
    // Validate priority, repo concurrency
    // Insert into DB
    // Add to in-memory queue
    // Trigger dispatch loop
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    while (this.queue.size() > 0 && this.concurrencyManager.canAllocate()) {
      const task = this.queue.dequeue();
      if (task) {
        this.dispatch(task);
      }
    }
  }

  private async dispatch(task: Task): Promise<void> {
    const slot = this.concurrencyManager.allocate(task.repoId);
    task.status = 'in_progress';
    this.db.update(task);

    try {
      const worktree = await this.gitService.createWorktree(
        task.repoPath,
        task.id,
        task.baseBranch
      );

      const result = await this.agentRunner.execute({
        id: task.id,
        title: task.title,
        spec: task.spec,
        worktreePath: worktree,
      });

      task.status = 'review_pending';
      task.summary = result.summary;
      task.changedFiles = result.changedFiles;
      this.db.update(task);
    } catch (error) {
      task.status = 'failed';
      this.logStreamer.emit({ taskId: task.id, level: 'error', line: String(error) });
    } finally {
      this.concurrencyManager.release(slot);
      this.processQueue(); // Process next queued task
    }
  }
}
```

**ConcurrencyManager (Class):**
```typescript
// packages/daemon/src/services/concurrency-manager.ts
export class ConcurrencyManager {
  private globalLimit: number = 10;
  private perRepoLimit: number = 3;
  private globalSlots: Slot[] = [];
  private repoSlots: Map<string, Slot[]> = new Map();

  canAllocate(repoId?: string): boolean {
    const globalAvailable = this.globalSlots.filter(s => s.available).length > 0;
    if (!repoId) return globalAvailable;

    const repoAvailable = (this.repoSlots.get(repoId) || []).filter(s => s.available).length > 0;
    return globalAvailable && repoAvailable;
  }

  allocate(repoId: string): Slot {
    const global = this.globalSlots.find(s => s.available);
    const repo = (this.repoSlots.get(repoId) || []).find(s => s.available);

    if (!global || !repo) throw new Error('No available slots');

    global.available = false;
    repo.available = false;

    return { globalId: global.id, repoId };
  }

  release(slot: Slot): void {
    this.globalSlots.find(s => s.id === slot.globalId).available = true;
    this.repoSlots.get(slot.repoId).find(s => s.id === slot.repoId).available = true;
  }
}
```

**LogStreamer (Class):**
```typescript
// packages/daemon/src/services/log-streamer.ts
export class LogStreamer {
  private buffer: Map<string, LogEvent[]> = new Map();
  private subscribers: Map<string, Set<LogCallback>> = new Map();

  emit(event: LogEvent): void {
    this.buffer.set(event.taskId, [...(this.buffer.get(event.taskId) || []), event]);
    this.subscribers.get(event.taskId)?.forEach(cb => cb(event));
  }

  subscribe(taskId: string, callback: LogCallback): void {
    if (!this.subscribers.has(taskId)) {
      this.subscribers.set(taskId, new Set());
    }
    this.subscribers.get(taskId).add(callback);
  }

  getHistory(taskId: string): LogEvent[] {
    return this.buffer.get(taskId) || [];
  }
}
```

**Real-Time Log Hook (React):**
```typescript
// packages/ui/src/hooks/useRealtimeLog.ts
export function useRealtimeLog(taskId: string) {
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    setIsStreaming(true);

    const unsubscribe = window.daemon.subscribe(`log.${taskId}`, (event: LogEvent) => {
      setLogs(prev => [...prev, event]);
    });

    return () => {
      unsubscribe();
      setIsStreaming(false);
    };
  }, [taskId]);

  const search = (query: string): LogEvent[] => {
    return logs.filter(log => log.line.toLowerCase().includes(query.toLowerCase()));
  };

  return { logs, isStreaming, search };
}
```

#### 3.3.5 Testing Strategy (Phase 3)

| Test Type | Coverage | Tool | Examples |
|-----------|----------|------|----------|
| Unit | 85%+ | Vitest | GitService, AgentRunner, ConcurrencyManager |
| Integration | Agent dispatch pipeline | Vitest | Task queue → dispatch → agent runner → log stream |
| Agent simulation | Mock agent runner | Vitest | Verify agent contract, result parsing |
| E2E | Full agent flow | Playwright | Dispatch task → see logs in real-time → complete |

**Example Integration Test:**
```typescript
// packages/daemon/__tests__/task-dispatch.test.ts
describe('Task Dispatch Pipeline', () => {
  let taskService: TaskService;
  let gitService: GitService;
  let mockAgentRunner: MockAgentRunner;

  beforeEach(async () => {
    mockAgentRunner = new MockAgentRunner();
    taskService = new TaskService(db, mockAgentRunner, gitService, logStreamer);
  });

  it('should dispatch queued task and stream logs', async () => {
    const task = await taskService.queue({
      repoId: 'repo-1',
      title: 'Implement feature X',
      description: 'Detailed spec',
    });

    expect(task.status).toBe('queued');

    const logsSeen: LogEvent[] = [];
    logStreamer.subscribe(task.id, (event) => {
      logsSeen.push(event);
    });

    // Mock agent produces output
    mockAgentRunner.simulateOutput('Building...\nDone.');

    // Wait for completion
    await waitFor(() => {
      expect(task.status).toBe('review_pending');
    });

    expect(logsSeen).toHaveLength(2);
    expect(logsSeen[0].line).toContain('Building');
  });
});
```

#### 3.3.6 Definition of Done

- [ ] Create 10 git worktrees; all cleanup successfully without orphaned processes
- [ ] Stale worktree detection runs on daemon startup; prunes old entries
- [ ] Queue 50 tasks; global limit (max 10 running) enforced; respects per-repo limits
- [ ] Dispatch task to Claude Code; stream logs in real-time (< 100ms latency)
- [ ] Dispatch task to Copilot; same behavior as Claude
- [ ] Agent timeout (30 min) triggers gracefully; process killed; task marked failed
- [ ] Task status state machine: Validation passes for valid transitions (queued → in_progress); rejects invalid (queued → approved)
- [ ] Log viewer search across 10,000 lines; results in < 500ms
- [ ] Process crashes detected and logged; task retried if within retry limit
- [ ] All Phase 3 tests passing (85%+ coverage)
- [ ] E2E test: Queue 5 tasks → Observe all dispatch within 10s → See logs stream → All complete with statuses

---

### Phase 4: Task Board & Monitor (Weeks 10–12)

#### 3.4.1 Objectives

Deliver visual task monitoring, code review tools, and PR integration.

#### 3.4.2 Deliverables

| Item | Ownership | Success Criteria |
|------|-----------|------------------|
| Kanban board UI with drag-drop | Frontend | Move cards between columns; persist order; no lag |
| Real-time board updates | Full Stack | Task status reflected in UI < 200ms after change |
| Diff viewer with hunks | Frontend | Display 50KB file; syntax highlighting; side-&-unified modes |
| PR creation automation | Backend | Auto-generate title, description, link to spec; < 5s creation time |
| PR tracking and sync | Backend | Fetch PR status from GitHub; sync back to Magenta (reviewer count, etc) |
| Pause/resume global & per-repo | Backend | Toggle execution; queued tasks don't dispatch; UI reflects state |

#### 3.4.3 Module Structure Created

```
packages/daemon/
├── src/services/
│   ├── pr.service.ts                  # NEW: PR operations
│   ├── github.service.ts              # NEW: GitHub API client
│   └── flow-control.service.ts        # NEW: Pause/resume logic

packages/ui/
├── src/pages/
│   ├── task-board.tsx                 # UPDATED: full Kanban
│   ├── monitor.tsx                    # NEW: progress dashboard
│   └── review.tsx                     # NEW: PR + diff viewer
├── src/components/
│   ├── board/
│   │   ├── kanban-board.tsx           # UPDATED: full drag-drop
│   │   ├── task-card.tsx              # UPDATED: add PR status
│   │   └── column.tsx                 # UPDATED: drag handlers
│   ├── monitor/
│   │   ├── dashboard.tsx              # NEW: stats, charts
│   │   ├── agent-activity.tsx         # NEW: live agent list
│   │   └── queue-status.tsx           # NEW: pause/resume controls
│   ├── review/
│   │   ├── diff-viewer.tsx            # NEW: file diff display
│   │   ├── pr-panel.tsx               # NEW: PR details
│   │   └── hunk-viewer.tsx            # NEW: individual hunks
│   └── sidebar/
│       └── flow-control.tsx           # NEW: pause/resume toggle
├── src/store/
│   └── board.store.ts                 # NEW: board card positions, filters
```

#### 3.4.4 Key Implementation Details

**PRService (Class):**
```typescript
// packages/daemon/src/services/pr.service.ts
export class PRService {
  constructor(
    private db: DatabaseService,
    private githubService: GithubService,
    private taskService: TaskService
  ) {}

  async createPRFromTask(taskId: string, targetBranch: string = 'main'): Promise<string> {
    const task = await this.taskService.get(taskId);
    const repo = await this.repositoryService.get(task.repoId);
    const spec = await this.specService.get(task.specId);

    const title = `${task.title} (#${task.id.slice(0, 8)})`;
    const description = this.generatePRDescription(task, spec);

    const branchName = task.branchName; // agent/<taskId>/...

    const pr = await this.githubService.createPR({
      owner: repo.owner,
      repo: repo.name,
      title,
      body: description,
      head: branchName,
      base: targetBranch,
    });

    // Store PR URL in task
    task.prUrl = pr.html_url;
    task.prStatus = pr.state;
    await this.db.update('tasks', task);

    return pr.html_url;
  }

  private generatePRDescription(task: Task, spec: Specification): string {
    return `
# ${task.title}

**Spec:** ${spec.title}
**Link to spec:** [View spec](#)

## Changes
${task.changedFiles.map(f => `- ${f.path} (+${f.additions}, -${f.deletions})`).join('\n')}

## Acceptance Criteria
${spec.acceptanceCriteria.map(c => `- [ ] ${c}`).join('\n')}

## Agent Summary
${task.summary || 'Task completed successfully.'}

---
*Generated by Magenta IDE*
    `;
  }

  async syncPRStatus(taskId: string): Promise<void> {
    const task = await this.taskService.get(taskId);
    if (!task.prUrl) return;

    const [owner, repo, prNum] = this.parsePRUrl(task.prUrl);
    const pr = await this.githubService.getPR(owner, repo, prNum);

    task.prStatus = pr.state;
    // Store additional fields: reviewer count, approve count, etc
    await this.db.update('tasks', task);
  }
}
```

**FlowControlService (Class):**
```typescript
// packages/daemon/src/services/flow-control.service.ts
export class FlowControlService {
  private globalPaused: boolean = false;
  private repoPaused: Map<string, boolean> = new Map();

  pauseGlobal(): void {
    this.globalPaused = true;
    // Stop processing new tasks from queue
    // Log pause event
  }

  resumeGlobal(): void {
    this.globalPaused = false;
    // Resume processing queue
  }

  isPausedGlobal(): boolean {
    return this.globalPaused;
  }

  pauseRepository(repoId: string): void {
    this.repoPaused.set(repoId, true);
  }

  isRepoTaskAllowedToDispatch(repoId: string): boolean {
    return !this.globalPaused && !this.repoPaused.get(repoId);
  }
}
```

**Kanban Board Component (React):**
```typescript
// packages/ui/src/components/board/kanban-board.tsx
export function KanbanBoard() {
  const { tasks, filters } = useTaskStore();
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);

  const columns: Column[] = [
    { id: 'queued', title: 'Queued', status: 'queued' },
    { id: 'in_progress', title: 'In Progress', status: 'in_progress' },
    { id: 'review_pending', title: 'Review Pending', status: 'review_pending' },
    { id: 'approved', title: 'Approved', status: 'approved' },
    { id: 'merged', title: 'Merged', status: 'merged' },
    { id: 'failed', title: 'Failed', status: 'failed' },
  ];

  const getTasksInColumn = (status: string) => {
    return tasks.filter(t => t.status === status && matchesFilters(t, filters));
  };

  const handleDrop = async (task: Task, targetStatus: string) => {
    // Update task status in daemon
    await window.daemon.call('task.updateStatus', {
      taskId: task.id,
      status: targetStatus,
    });
  };

  return (
    <div className="flex gap-4 overflow-x-auto">
      {columns.map(col => (
        <Column
          key={col.id}
          title={col.title}
          tasks={getTasksInColumn(col.status)}
          onDrop={(task) => handleDrop(task, col.status)}
        />
      ))}
    </div>
  );
}
```

**Diff Viewer Component (React):**
```typescript
// packages/ui/src/components/review/diff-viewer.tsx
export function DiffViewer({ taskId }: { taskId: string }) {
  const { changedFiles } = useTask(taskId);
  const [selectedFileIdx, setSelectedFileIdx] = useState(0);
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');

  const currentFile = changedFiles[selectedFileIdx];

  return (
    <div className="flex h-screen flex-col">
      <div className="border-b p-2 flex items-center justify-between">
        <select onChange={e => setSelectedFileIdx(Number(e.target.value))}>
          {changedFiles.map((f, i) => (
            <option key={f.path} value={i}>
              {f.path} (+{f.additions}, -{f.deletions})
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <button
            className={viewMode === 'unified' ? 'bg-blue-500' : ''}
            onClick={() => setViewMode('unified')}
          >
            Unified
          </button>
          <button
            className={viewMode === 'split' ? 'bg-blue-500' : ''}
            onClick={() => setViewMode('split')}
          >
            Split
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-gray-50 p-4 font-mono text-sm">
        {currentFile && <UnifiedDiff file={currentFile} />}
      </div>

      <div className="border-t p-2 flex gap-2">
        <button onClick={() => setSelectedFileIdx(Math.max(0, selectedFileIdx - 1))}>
          ← Previous
        </button>
        <span className="text-sm text-gray-600">
          {selectedFileIdx + 1} / {changedFiles.length}
        </span>
        <button
          onClick={() => setSelectedFileIdx(Math.min(changedFiles.length - 1, selectedFileIdx + 1))}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
```

#### 3.4.5 Testing Strategy (Phase 4)

| Test Type | Coverage | Tool | Examples |
|-----------|----------|------|----------|
| Unit | 80%+ | Vitest | PRService, FlowControlService |
| Component | 80%+ | Vitest + RTL | Kanban board, diff viewer |
| Integration | PR creation, board updates | Vitest | Create task → dispatch → PR creation → sync status |
| E2E | Full review flow | Playwright | Dispatch task → view diff → create PR → see status |

**Example E2E Test:**
```typescript
// packages/ui/__tests__/e2e/review-flow.test.ts
import { test, expect } from '@playwright/test';

test('Complete review flow', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Queue task
  await page.click('[data-testid="queue-task"]');
  await page.fill('[data-testid="task-title"]', 'Implement feature X');
  await page.click('[data-testid="submit"]');

  // Wait for dispatch
  await expect(page.locator('[data-status="in_progress"]')).toBeVisible({ timeout: 5000 });

  // Wait for completion
  await expect(page.locator('[data-status="review_pending"]')).toBeVisible({ timeout: 60000 });

  // View diff
  await page.click('[data-testid="view-diff"]');
  await expect(page.locator('.diff-viewer')).toBeVisible();

  // Create PR
  await page.click('[data-testid="create-pr"]');
  await expect(page.locator('[data-pr-url]')).toBeVisible({ timeout: 10000 });
});
```

#### 3.4.6 Definition of Done

- [ ] Kanban board displays 6 columns; drag-drop tasks between columns in real-time
- [ ] Task status updates appear in UI < 200ms after IPC event
- [ ] Diff viewer renders 50KB+ files without lag; supports syntax highlighting
- [ ] File-level navigation (previous/next) works smoothly
- [ ] PR auto-creation completes in < 5s; description populated with spec link, files, criteria
- [ ] PR status syncs from GitHub within 30s of check
- [ ] Pause/resume global: no new tasks dispatch while paused; queued tasks visible but waiting
- [ ] Pause/resume per-repo: only tasks for paused repo wait; others continue
- [ ] All Phase 4 tests passing (80%+ coverage)
- [ ] E2E test: Dispatch → Complete → View diff → Create PR → See PR status in board

---

### Phase 5: Multi-Repo (Weeks 13–14)

#### 3.5.1 Objectives

Extend Magenta IDE to orchestrate agents across multiple repositories simultaneously with unified visibility.

#### 3.5.2 Deliverables

| Item | Ownership | Success Criteria |
|------|-----------|------------------|
| Cross-repo task overview | Frontend | View tasks from 10+ repos in single board; filter/search by repo |
| Per-repo concurrency controls | Backend | Set max agents per repo; enforce limits; display utilization |
| Multi-repo agent allocation | Backend | Allocate 10 agents across 5 repos; respect per-repo caps |
| Parallel agent execution | Backend | Execute 5+ agents simultaneously across different repos |
| Repository burndown tracking | Frontend | View spec → task → completion per repo; burndown trend |

#### 3.5.3 Module Structure Created

```
packages/daemon/
├── src/services/
│   ├── multi-repo.service.ts          # NEW: cross-repo coordination
│   └── allocation.service.ts          # NEW: agent slot allocation strategy

packages/ui/
├── src/pages/
│   ├── multi-repo-board.tsx           # NEW: unified view
│   └── repo-overview.tsx              # NEW: per-repo dashboard
├── src/components/
│   ├── board/
│   │   └── cross-repo-board.tsx       # NEW: filter by repo overlay
│   ├── overview/
│   │   ├── repo-allocations.tsx       # NEW: slot utilization
│   │   ├── burndown.tsx               # NEW: task progress chart
│   │   └── agent-summary.tsx          # NEW: agents across repos
```

#### 3.5.4 Key Implementation Details

**MultiRepoService (Class - Orchestrator):**
```typescript
// packages/daemon/src/services/multi-repo.service.ts
export class MultiRepoService {
  constructor(
    private taskService: TaskService,
    private allocationService: AllocationService,
    private gitService: GitService
  ) {}

  async getOverview(): Promise<OverviewData> {
    // Fetch high-level stats across all repos
    const repos = await this.repositoryService.list();
    const tasks = await this.taskService.getAllTasks();

    return {
      totalRepos: repos.length,
      activeRepos: repos.filter(r => r.hasActiveTasks).length,
      totalTasks: tasks.length,
      completedTasks: tasks.filter(t => t.status === 'merged').length,
      failedTasks: tasks.filter(t => t.status === 'failed').length,
      runningAgents: this.countRunningAgents(),
      utilizationByRepo: this.calculateUtilization(),
    };
  }

  private calculateUtilization(): Record<string, UtilizationStats> {
    // For each repo: current agents / max agents
    // Returns map of repoId → { current, max, percent }
    const result: Record<string, UtilizationStats> = {};

    for (const repoId of this.allocationService.getAllRepoIds()) {
      const allocation = this.allocationService.getAllocation(repoId);
      result[repoId] = {
        current: allocation.used,
        max: allocation.limit,
        percent: (allocation.used / allocation.limit) * 100,
      };
    }

    return result;
  }

  async allocateParallelAgents(taskIds: string[]): Promise<AllocationResult> {
    // Attempt to allocate slots for multiple tasks across repos
    // Returns allocation map: taskId → { repoId, slot }
    // If any task cannot be allocated, returns partial result + queue rest
  }
}
```

**AllocationService (Class - Strategy):**
```typescript
// packages/daemon/src/services/allocation.service.ts
export class AllocationService {
  private allocations: Map<string, AllocationBudget> = new Map();

  allocateMultiple(taskIds: string[], repoIdMap: Map<string, string>): AllocationResult {
    const allocated: AllocationMap = new Map();
    const queued: string[] = [];

    for (const taskId of taskIds) {
      const repoId = repoIdMap.get(taskId);
      const repoBudget = this.allocations.get(repoId);

      if (repoBudget && this.globalBudget.available > 0 && repoBudget.available > 0) {
        const slot = { globalId: global++, repoId };
        allocated.set(taskId, slot);
        this.globalBudget.available--;
        repoBudget.available--;
      } else {
        queued.push(taskId);
      }
    }

    return { allocated, queued };
  }

  release(slot: Slot): void {
    this.globalBudget.available++;
    this.allocations.get(slot.repoId).available++;
  }

  getUtilization(repoId: string): UtilizationStats {
    const budget = this.allocations.get(repoId);
    return {
      used: budget.limit - budget.available,
      max: budget.limit,
      percent: ((budget.limit - budget.available) / budget.limit) * 100,
    };
  }
}
```

**Cross-Repo Board (React):**
```typescript
// packages/ui/src/components/board/cross-repo-board.tsx
export function CrossRepoBoard() {
  const { tasks, repos } = useTaskStore();
  const [repoFilter, setRepoFilter] = useState<string | null>(null);

  const task List = repoFilter
    ? tasks.filter(t => t.repoId === repoFilter)
    : tasks;

  return (
    <div>
      <div className="border-b p-4">
        <label>Filter by repo:</label>
        <select onChange={e => setRepoFilter(e.target.value || null)}>
          <option value="">All repos</option>
          {repos.map(r => (
            <option key={r.id} value={r.id}>
              {r.name} ({tasks.filter(t => t.repoId === r.id).length} tasks)
            </option>
          ))}
        </select>
      </div>

      <KanbanBoard tasks={taskList} />
    </div>
  );
}
```

**Repository Burndown (React):**
```typescript
// packages/ui/src/components/overview/burndown.tsx
export function BurndownChart() {
  const { repos } = useRepositoryStore();

  const data = repos.map(repo => ({
    name: repo.name,
    total: repo.taskStats.total,
    completed: repo.taskStats.completed,
    remaining: repo.taskStats.total - repo.taskStats.completed,
    completionRate: (repo.taskStats.completed / repo.taskStats.total * 100).toFixed(1),
  }));

  return (
    <div>
      <h3 className="text-lg font-bold">Repository Burndown</h3>
      <table>
        <thead>
          <tr>
            <th>Repository</th>
            <th>Total Tasks</th>
            <th>Completed</th>
            <th>Remaining</th>
            <th>% Complete</th>
          </tr>
        </thead>
        <tbody>
          {data.map(row => (
            <tr key={row.name}>
              <td>{row.name}</td>
              <td>{row.total}</td>
              <td>{row.completed}</td>
              <td>{row.remaining}</td>
              <td>
                <div className="w-20 bg-gray-200 rounded h-4">
                  <div
                    className="bg-blue-500 h-4 rounded"
                    style={{ width: `${row.completionRate}%` }}
                  />
                </div>
                {row.completionRate}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

#### 3.5.5 Testing Strategy (Phase 5)

| Test Type | Coverage | Tool | Examples |
|-----------|----------|------|----------|
| Unit | 80%+ | Vitest | AllocationService (multi-task allocation) |
| Integration | Multi-repo dispatch | Vitest | Allocate to 5 repos; enforce per-repo limits |
| E2E | Full multi-repo workflow | Playwright | Queue tasks across 3 repos → Run in parallel → View unified board |

#### 3.5.6 Definition of Done

- [ ] Cross-repo board displays tasks from 10+ repos; filter/search by repo works
- [ ] Per-repo concurrency limits enforced; agents never exceed repo limit
- [ ] Parallel allocation: dispatch 5 tasks across 3 repos; all respect limits
- [ ] Multi-agent execution: 5+ agents run simultaneously; monitor shows correct count per repo
- [ ] Burndown chart renders; shows completion % by repo
- [ ] All Phase 5 tests passing (80%+ coverage)
- [ ] E2E test: Register 3 repos → Queue tasks across all → Run in parallel → See unified board

---

### Phase 6: Polish & Package (Weeks 15–16)

#### 3.6.1 Objectives

Deliver production-ready application with full testing, documentation, and distribution.

#### 3.6.2 Deliverables

| Item | Ownership | Success Criteria |
|------|-----------|------------------|
| Settings UI (app, repo, agent config) | Frontend | Configure concurrency, timeouts, themes; persist settings |
| First-time user onboarding | Frontend | Guided setup: register first repo, create first spec, dispatch agent |
| Keyboard shortcuts & command palette | Frontend | 10+ shortcuts defined; command palette (`Cmd+K`) searchable |
| Comprehensive user documentation | Docs | In-app guides, video tutorials (optional), README |
| electron-builder packaging | DevOps | Build .dmg (macOS), .exe (Windows), .AppImage (Linux) |
| Auto-update mechanism | DevOps | Check for updates; auto-download; notify user; install on restart |
| Error logging & crash reporting | Backend | Log errors to file; optional Sentry integration |
| Unit test coverage (80%+) | QA | All critical paths tested |
| E2E smoke tests (5+ workflows) | QA | Full workflows automated; pass on every build |
| CI/CD pipeline | DevOps | GitHub Actions: test, lint, build, release |

#### 3.6.3 Module Structure Created

```
packages/daemon/
├── src/services/
│   ├── error-logger.ts                # NEW: error reporting
│   └── crash-handler.ts               # NEW: uncaught exception handler

packages/ui/
├── src/pages/
│   ├── settings.tsx                   # NEW: settings UI
│   ├── onboarding.tsx                 # NEW: first-time flow
│   └── index.tsx                      # UPDATED: route to onboarding
├── src/components/
│   ├── settings/
│   │   ├── app-settings.tsx           # NEW: theme, shortcuts, etc
│   │   ├── repo-settings.tsx          # NEW: concurrency, branch prefix
│   │   └── agent-settings.tsx         # NEW: API keys, model selection
│   └── onboarding/
│       ├── step1-repo.tsx             # NEW: first repo registration
│       ├── step2-spec.tsx             # NEW: create first spec
│       └── step3-dispatch.tsx         # NEW: dispatch first task
├── src/hooks/
│   └── useSettings.ts                 # NEW: settings CRUD
├── docs/
│   ├── user-guide.md                  # NEW: comprehensive guide
│   ├── faq.md                         # NEW: common questions
│   └── troubleshooting.md             # NEW: error solutions

.github/
├── workflows/
│   ├── test.yml                       # NEW: run tests on PR
│   ├── build.yml                      # NEW: build & package on release
│   └── release.yml                    # NEW: create GitHub release

scripts/
├── build-release.sh                   # NEW: build all platforms
├── create-changelog.sh                # NEW: generate changelog
└── sign-macos.sh                      # NEW: code sign .dmg
```

#### 3.6.4 Key Implementation Details

**SettingsUI (React):**
```typescript
// packages/ui/src/pages/settings.tsx
export function Settings() {
  const [activeTab, setActiveTab] = useState<'app' | 'repo' | 'agent'>('app');

  return (
    <div className="flex h-screen">
      <nav className="w-48 border-r p-4">
        <button
          className={activeTab === 'app' ? 'font-bold' : ''}
          onClick={() => setActiveTab('app')}
        >
          App Settings
        </button>
        <button
          className={activeTab === 'repo' ? 'font-bold' : ''}
          onClick={() => setActiveTab('repo')}
        >
          Repository Settings
        </button>
        <button
          className={activeTab === 'agent' ? 'font-bold' : ''}
          onClick={() => setActiveTab('agent')}
        >
          Agent Configuration
        </button>
      </nav>

      <main className="flex-1 overflow-auto p-6">
        {activeTab === 'app' && <AppSettings />}
        {activeTab === 'repo' && <RepositorySettings />}
        {activeTab === 'agent' && <AgentSettings />}
      </main>
    </div>
  );
}

function AppSettings() {
  const { settings, updateSetting } = useSettings();

  return (
    <form className="space-y-4 max-w-2xl">
      <div>
        <label>Theme</label>
        <select value={settings.theme} onChange={e => updateSetting('theme', e.target.value)}>
          <option>light</option>
          <option>dark</option>
          <option>system</option>
        </select>
      </div>

      <div>
        <label>Global Concurrency Limit</label>
        <input
          type="number"
          value={settings.globalConcurrency}
          onChange={e => updateSetting('globalConcurrency', parseInt(e.target.value))}
          min="1"
          max="50"
        />
      </div>

      <div>
        <label>Task Timeout (minutes)</label>
        <input
          type="number"
          value={settings.taskTimeout}
          onChange={e => updateSetting('taskTimeout', parseInt(e.target.value))}
          min="5"
          max="120"
        />
      </div>

      <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded">
        Save Settings
      </button>
    </form>
  );
}
```

**Onboarding Flow (React):**
```typescript
// packages/ui/src/pages/onboarding.tsx
export function Onboarding() {
  const [step, setStep] = useState(1);

  const handleComplete = () => {
    // Mark onboarding as complete in settings
    window.daemon.call('settings.setOnboardingComplete', {});
    // Redirect to dashboard
    window.location.href = '/dashboard';
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-blue-100">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-2xl">
        <h1 className="text-3xl font-bold mb-4">Welcome to Magenta IDE</h1>

        {step === 1 && (
          <Step1Repo onComplete={() => setStep(2)} />
        )}

        {step === 2 && (
          <Step2Spec onComplete={() => setStep(3)} />
        )}

        {step === 3 && (
          <Step3Dispatch onComplete={handleComplete} />
        )}

        <div className="mt-4 flex gap-2">
          {step > 1 && <button onClick={() => setStep(step - 1)}>← Back</button>}
          {step < 3 && <button onClick={() => setStep(step + 1)}>Next →</button>}
        </div>
      </div>
    </div>
  );
}
```

**CI/CD Pipeline:**
```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: '22'
          cache: 'pnpm'

      - run: pnpm install
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build
```

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]

    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: '22'
          cache: 'pnpm'

      - run: pnpm install
      - run: pnpm build
      - run: pnpm package

      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: magenta-ide-${{ matrix.os }}
          path: dist/**/*.{dmg,exe,AppImage}
```

**Error Logging Service:**
```typescript
// packages/daemon/src/services/error-logger.ts
export class ErrorLogger {
  private logPath: string;

  constructor(logPath: string) {
    this.logPath = logPath;
  }

  async captureException(error: Error, context: Record<string, unknown> = {}): Promise<void> {
    const entry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      message: error.message,
      stack: error.stack,
      context,
    };

    await fs.appendFile(
      this.logPath,
      JSON.stringify(entry) + '\n'
    );

    // Optional: send to Sentry
    if (process.env.SENTRY_DSN) {
      // Initialize Sentry and capture
    }
  }

  async captureMessage(message: string, level: 'warn' | 'info' = 'info'): Promise<void> {
    const entry = { timestamp: new Date().toISOString(), level, message };
    await fs.appendFile(this.logPath, JSON.stringify(entry) + '\n');
  }
}
```

#### 3.6.5 Testing Strategy (Phase 6)

| Test Type | Coverage | Tool | Examples |
|-----------|----------|------|----------|
| Unit | 80%+ | Vitest | Settings service, error logger |
| Component | Settings UI, onboarding | Vitest + RTL | Form inputs, data persistence |
| E2E | 5+ smoke tests | Playwright | Onboarding → first dispatch, multi-repo, PR workflow |

**Example Smoke Tests:**
```typescript
// packages/ui/__tests__/e2e/smoke.test.ts
import { test, expect } from '@playwright/test';

test.describe('Smoke Tests', () => {
  test('Onboarding flow', async ({ page }) => {
    await page.goto('http://localhost:3000');
    expect(await page.isVisible('text=Welcome to Magenta')).toBeTruthy();
    
    // Register repo
    await page.fill('[data-testid="repo-path"]', '/tmp/test-repo');
    await page.click('[data-testid="next"]');
    
    // Create spec
    await page.fill('[data-testid="spec-title"]', 'Test spec');
    await page.click('[data-testid="next"]');
    
    // Dispatch
    await page.click('[data-testid="dispatch"]');
    await expect(page.locator('[data-status="in_progress"]')).toBeVisible({ timeout: 5000 });
  });

  test('Multi-repo workflow', async ({ page }) => {
    await page.goto('http://localhost:3000/dashboard');
    
    // Register 3 repos
    for (let i = 1; i <= 3; i++) {
      await page.click('[data-testid="register-repo"]');
      await page.fill('[data-testid="repo-path"]', `/tmp/repo${i}`);
      await page.click('[data-testid="submit"]');
    }
    
    expect(await page.locator('[data-repo-item]').count()).toBe(3);
  });

  test('Settings persistence', async ({ page }) => {
    await page.goto('http://localhost:3000/settings');
    
    await page.fill('[data-testid="concurrency"]', '5');
    await page.click('[data-testid="save"]');
    
    // Reload page
    await page.reload();
    
    const value = await page.inputValue('[data-testid="concurrency"]');
    expect(value).toBe('5');
  });
});
```

#### 3.6.6 Definition of Done

- [ ] Settings page: theme, concurrency, timeout configurable and persistent
- [ ] Onboarding: 3-step flow completes successfully; user dispatches first task
- [ ] Keyboard shortcuts: Cmd+K opens command palette; 10+ shortcuts defined
- [ ] Documentation: user guide, FAQ, troubleshooting in `/docs` and in-app
- [ ] Build artifacts: .dmg, .exe, .AppImage created successfully
- [ ] Auto-update: setup.exe includes update checker; notifies user of new versions
- [ ] Error logging: uncaught exceptions logged to file; optional Sentry integration configured
- [ ] Test coverage >= 80% for critical paths
- [ ] All 5 smoke tests pass on every build
- [ ] CI/CD: GitHub Actions passing for test, build, release workflows
- [ ] CHANGELOG generated from git tags
- [ ] Release published to GitHub Releases

---

## 4. Design Decisions & Rationale

### 4.1 Why Three-Process Architecture?

| Process | Rationale |
|---------|-----------|
| **Main (Electron)** | Lifecycle management, file access, system integration; isolated from business logic |
| **Daemon (Node.js)** | Long-lived background process; manages expensive resources (DB, worktrees); survives UI reload |
| **Renderer (React)** | UI-only; no file I/O; all logic delegated to Daemon via IPC; easy to reason about |

Benefits:
- UI can reload without losing task queue state
- Daemon can restart without killing user experience
- Clear separation of concerns; easy to test each layer

### 4.2 Why Zustand for State?

- **Minimal boilerplate** vs Redux or MobX
- **No actions/dispatchers** — direct state updates
- **TypeScript-first** — great type inference
- **Subscriptions** — efficient re-renders only affected components
- **Multiple stores** by domain — easier to scale than single Redux store

### 4.3 Why SQLite + Drizzle ORM?

- **Zero-config database** — ships with Electron, no external dependency
- **ACID guarantees** — safe concurrent writes from IPC requests
- **Drizzle type-safety** — SQL queries in TypeScript; catch errors at build time
- **Easy migrations** — Drizzle handles schema versioning

### 4.4 Why CodeMirror 6?

- **Composition-based** — extensible with plugins (markdown preview, custom syntax)
- **Active maintenance** — updated regularly for new ES features
- **Performance** — viewport rendering for large files
- **Web Components** — integrates cleanly with React

### 4.5 Why Git Worktrees?

- **Isolation** — each agent works in isolated checkout; no conflicts
- **Rollback** — delete worktree to discard all changes; main branch untouched
- **Performance** — faster than full clone; shares object database
- **Cleanup** — prune stale worktrees on daemon startup to recover disk space

### 4.6 Why Class-First OOP Design?

- **Explicit ownership** — each service owns specific domain (repos, specs, tasks)
- **Testability** — mock dependencies easily; unit tests don't need to spin up entire daemon
- **Separation of concerns** — no module-level procedural logic; all orchestration in class methods
- **Scalability** — new features added as new services; existing services unchanged

---

## 5. Risk Mitigation Strategy

### 5.1 Cross-Repository Safety

**Risk:** Agent modifies file in wrong repository; cascading failures.

**Mitigation:**
- Each agent runs in **isolated git worktree**; cannot access main tree
- **Branch naming** enforces task ID: `agent/<taskId>/...`; prevents collisions
- **Pre-execution validation** checks repo path, branch, file permissions
- **Post-execution integrity check** compares worktree diff against expected files from spec

### 5.2 IPC Reliability

**Risk:** IPC connection drops; UI loses task state; Daemon becomes orphaned.

**Mitigation:**
- **Heartbeat** — UI sends ping every 5s; Daemon responds
- **Reconnection logic** — UI reconnects with exponential backoff (1s → 10s → 60s)
- **Message durability** — queued messages persisted to SQLite until ACK received
- **State reconciliation** — on reconnect, UI fetches full state from Daemon (tasks, logs, PR status)

### 5.3 Concurrent Agent Execution

**Risk:** Resource exhaustion (CPU, memory, file descriptors) with 10+ agents.

**Mitigation:**
- **Global concurrency limit** (max 10 agents) enforced by `ConcurrencyManager`
- **Per-process resource limits** — set ulimits on spawned agents
- **Memory monitoring** — Daemon polls process memory; escalates alert if > threshold
- **Graceful degradation** — new tasks queued instead of rejected; user sees queue depth

### 5.4 Spec Parsing Errors

**Risk:** Malformed spec causes task generation to fail or produce nonsensical tasks.

**Mitigation:**
- **Schema validation** — Zod schema for spec metadata (title, criteria, priority)
- **Markdown parsing** — tested on 100+ real specs; fallback to full spec as single task
- **User feedback** — errors displayed in UI; user can manually create tasks
- **Audit trail** — all generated tasks linked to spec version; easy to rollback

### 5.5 Database Corruption

**Risk:** Ungraceful daemon shutdown corrupts SQLite database.

**Mitigation:**
- **WAL mode** — SQLite write-ahead logging enables safe concurrent writes
- **Graceful shutdown** — on SIGTERM, close all connections, flush writes
- **Backup on startup** — detect corruption; restore from backup
- **Auto-recovery** — minimal schema reset if unrecoverable; user warned of data loss

### 5.6 Agent Process Leaks

**Risk:** Zombie or hung processes consume system resources.

**Mitigation:**
- **Timeout enforcement** — every spawned agent has 30-minute timeout
- **Process tree** — track child processes; kill all descendants on timeout
- **Signal handling** — SIGTERM sent first; SIGKILL after 5s if process still alive
- **Stale process detection** — daemon scans /proc on startup; kills orphaned agents

---

## 6. Testing Strategy (Comprehensive)

### 6.1 Test Pyramid

```
┌────────────────────────┐
│   E2E (5%)             │  Playwright smoke tests
│                        │  - Full workflows
│                        │  - Production-like
├────────────────────────┤
│   Integration (20%)    │  Vitest with mocks
│                        │  - Service ↔ Service
│                        │  - IPC round-trips
│                        │  - Database transactions
├────────────────────────┤
│   Unit (75%)           │  Vitest
│   · Components (25%)   │  - React components
│   · Services (50%)     │  - Business logic
│                        │  - Utilities & helpers
└────────────────────────┘
```

### 6.2 Coverage Targets by Phase

| Phase | Unit | Integration | E2E | Overall |
|-------|------|-------------|-----|---------|
| 1 | 90% | 50% | 0% | 75% |
| 2 | 85% | 70% | 0% | 80% |
| 3 | 85% | 75% | 10% | 82% |
| 4 | 80% | 80% | 20% | 80% |
| 5 | 80% | 80% | 20% | 80% |
| 6 | 85% | 85% | 30% | 85% |

### 6.3 Critical Path Tests (Must-Have)

1. **IPC Authentication** — Token handshake, message validation
2. **Repository Lifecycle** — Register, list, delete repos
3. **Spec Approval** — Draft → Pending → Approved → Task Gen
4. **Agent Dispatch** — Task queue → Worktree → Agent run → Log stream
5. **Concurrent Limits** — Global cap enforced, per-repo limits respected
6. **Error Recovery** — Agent timeout, process crash, DB error

### 6.4 Test Execution

```bash
# Unit tests (fast feedback during development)
pnpm test --watch

# Integration tests (slower; run on CI)
pnpm test:integration

# E2E tests (slowest; run nightly or on release)
pnpm test:e2e

# Coverage report
pnpm test --coverage
```

---

## 7. Success Checkpoints & Validation

### Checkpoint 1: Phase 1 Complete (Week 2)

- [ ] Monorepo builds end-to-end
- [ ] Electron app launches and displays UI
- [ ] Daemon starts and listens on TCP port
- [ ] IPC authentication handshake succeeds
- [ ] SQLite schema created without errors
- [ ] IPC ping/ack round-trip < 100ms
- [ ] All Phase 1 unit tests passing (90%+)

**Sign-Off:** Infra lead confirms all prerequisites met for Phase 2.

### Checkpoint 2: Phase 2 Complete (Week 5)

- [ ] 5+ repositories registered; persist after restart
- [ ] Rich markdown spec editor functional; save/load works
- [ ] Spec approval workflow: draft → approved, triggers task generation
- [ ] 3+ tasks auto-generated from single spec with accurate descriptions
- [ ] Search/filter across 50+ specs returns results < 500ms
- [ ] All Phase 2 tests passing (85%+ coverage)
- [ ] E2E: Register repo → Create & approve spec → See generated tasks

**Sign-Off:** Product lead approves feature correctness.

### Checkpoint 3: Phase 3 Complete (Week 9)

- [ ] Git worktree creates/deletes; stale detection works
- [ ] Task queue accepts 50+ tasks; respects concurrency limits
- [ ] Agent dispatches to Claude Code and Copilot; logs stream in real-time
- [ ] Agent timeout (30 min) works; process killed gracefully
- [ ] Log viewer searches 10K lines < 500ms
- [ ] All Phase 3 tests passing (85%+ coverage)
- [ ] E2E: Dispatch 5 tasks → See logs stream → All complete with status

**Sign-Off:** Backend lead confirms agent integration stability.

### Checkpoint 4: Phase 4 Complete (Week 12)

- [ ] Kanban board: drag-drop tasks between columns; persists order
- [ ] Task status updates appear in UI < 200ms
- [ ] Diff viewer renders 50KB+ files; syntax highlighting works
- [ ] PR auto-created with title, description, spec link
- [ ] PR status syncs from GitHub within 30s
- [ ] Pause/resume: global and per-repo controls work
- [ ] All Phase 4 tests passing (80%+ coverage)
- [ ] E2E: Dispatch → View diff → Create PR → See status

**Sign-Off:** Frontend lead and PM approve UX.

### Checkpoint 5: Phase 5 Complete (Week 14)

- [ ] Cross-repo board displays 10+ repos; filter/search works
- [ ] Per-repo concurrency limits enforced
- [ ] 5+ agents run in parallel across 3+ repos
- [ ] Burndown chart shows completion % per repo
- [ ] All Phase 5 tests passing (80%+ coverage)
- [ ] E2E: Register 3 repos → Queue tasks → Run in parallel → View unified board

**Sign-Off:** Product lead approves multi-repo execution.

### Checkpoint 6: Phase 6 Complete (Week 16)

- [ ] Settings UI: theme, concurrency, timeout configurable
- [ ] Onboarding: 3-step flow completes; user dispatches first task
- [ ] Keyboard shortcuts: 10+ defined, command palette works
- [ ] Documentation: user guide, FAQ, troubleshooting ready
- [ ] Packaging: .dmg, .exe, .AppImage build successfully
- [ ] Auto-update: version check and notification works
- [ ] Error logging: uncaught exceptions logged
- [ ] Test coverage 85%+
- [ ] All 5 smoke tests pass
- [ ] CI/CD: All GitHub Actions workflows passing

**Sign-Off:** Release manager approves production readiness.

---

## 8. Capacity & Resource Allocation

### 8.1 Team Roles

| Role | Responsibilities | Phase Dependencies |
|------|------------------|-------------------|
| **Infra/DevOps** | Monorepo setup, Electron config, CI/CD, packaging | All phases after Phase 1 |
| **Backend Lead** | Services (Repo, Spec, Task), Daemon IPC, DB schema | All phases |
| **Frontend Lead** | React components, Zustand stores, routing | Phase 1 UI scaffolding; active Phases 2–6 |
| **QA/Testing** | Unit, integration, E2E test coverage | All phases incrementally |
| **Product/PM** | Requirements, acceptance criteria, prioritization | Phases 2–6 checkpoint approvals |

### 8.2 Estimated Story Points

| Phase | Estimated | Man-Weeks @ 2 devs |
|-------|-----------|-------------------|
| 1 | 21 pts | 1.5 weeks |
| 2 | 34 pts | 2.5 weeks |
| 3 | 55 pts | 4 weeks |
| 4 | 34 pts | 2.5 weeks |
| 5 | 21 pts | 2 weeks |
| 6 | 34 pts | 2.5 weeks |
| **Total** | **199 pts** | **14–15 weeks** |

---

## 9. Appendix: Glossary & References

| Term | Definition |
|------|-----------|
| **Spec** | High-level markdown requirement document authored by engineer |
| **Task** | Discrete work item auto-generated from approved spec |
| **Worktree** | Isolated git checkout per task; enables parallel agent work |
| **Agent** | AI model (Claude, Copilot) that implements task in worktree |
| **Daemon** | Background Node.js process managing repos, tasks, agents |
| **IPC** | Inter-Process Communication between Electron UI and Daemon |
| **Concurrency Limit** | Max simultaneous agents (global or per-repository) |
| **PR** | Pull Request created from agent's completed work |

### References

- Electron Docs: https://www.electronjs.org/docs
- React Best Practices: https://react.dev/learn
- Zustand: https://github.com/pmndrs/zustand
- Drizzle ORM: https://orm.drizzle.team/
- CodeMirror 6: https://codemirror.net/
- Git Worktrees: https://git-scm.com/docs/git-worktree
- Vitest: https://vitest.dev/
- Playwright: https://playwright.dev/

---

**Plan Version:** 1.0  
**Prepared:** April 2026  
**Next Review:** After Phase 1 completion
