# Implementation Plan: Kick-Start Feature — Repo Scanner & Spec Flow Diagram

**Approved by:** Steven | **Date:** 2026-04-10

**Document Version**: 1.0  
**Created**: 2026-04-08  
**Branch**: `001-kickstart-repo-spec`  
**Feature Focus**: Multi-process architecture, SQLite persistence, repository scanning, spec visualization  
**Target Duration**: 6-8 weeks (4 phases)

---

## A. Executive Summary & Execution Strategy

### Vision
The Kick-Start Feature establishes Magenta IDE's core technical foundation: a multi-process architecture (Main/Daemon/Renderer), persistent SQLite database, real-time file monitoring, and an intuitive spec pipeline visualization UI. This feature enables developers to instantly scan their project directories, organize specs using a conventional folder structure, and visualize spec completion status through an interactive React Flow diagram.

### High-Level Approach (4 Phases)
Build from the ground up, respecting architectural dependencies and ensuring each phase delivers measurable user value:

1. **Phase 1a: Foundation** (2 weeks) — Database, config management, core data models
2. **Phase 1b: Repo Management** (2 weeks) — Scanner service, persistence, sidebar repo list
3. **Phase 1c: Spec Discovery & Visualization** (2 weeks) — Spec reader, React Flow diagram, tree view
4. **Phase 1d: Polish & Real-Time** (2 weeks) — Session state, file watcher, activity panel, settings

### Dependency Graph

```
Phase 1a (Foundation)
├── SQLite schema + Drizzle ORM
├── Database client service
├── Config manager service
└── Shared models (IPC types, entities)
    │
    ├─→ Phase 1b (Repo Management)
    │   ├── Repo scanner daemon
    │   ├── Scan queue manager
    │   ├── Repo repository (data layer)
    │   └── Sidebar repos UI + store
    │       │
    │       ├─→ Phase 1c (Spec Discovery)
    │       │   ├── Spec reader service
    │       │   ├── Spec repository (data layer)
    │       │   ├── React Flow diagram
    │       │   └── Sidebar spec tree
    │       │       │
    │       │       └─→ Phase 1d (Polish)
    │       │           ├── Session state manager
    │       │           ├── File watcher (chokidar)
    │       │           ├── Activity panel
    │       │           └── Settings dialog
    │       │
    │       └─→ Phase 1d (Parallel)
    │           ├── Session state persistence
    │           └── Real-time sync IPC
    │
    └────→ Phase 1d (Parallel)
           ├── Error handling & resilience
           └── Performance optimization
```

### Technology Stack
- **Desktop Framework**: Electron 30 (three-process model: Main, Daemon, Renderer)
- **Frontend**: React 19 (Renderer process)
- **State Management**: Zustand (UI state), SQLite (persistent state)
- **Database**: SQLite (persistent app state) + Drizzle ORM
- **File System Scanning**: simple-git (repo detection), chokidar (file watcher)
- **UI Components**: shadcn/ui, React Flow v11 (diagram)
- **IPC**: Electron IPC (Main ↔ Daemon ↔ Renderer)

### Core Architecture Decision: Class-First OOP
All daemon logic is organized around service classes with clear responsibilities. No module-level procedural code in daemon services. UI logic is organized into Zustand stores (state) + functional React components (view).

```
packages/daemon/src/services/
├── DatabaseService (singleton, manages SQLite)
├── ConfigManager (singleton, manages ~/.magenta/config.json)
├── RepoScanner (class, encapsulates scan logic)
├── SpecReader (class, encapsulates spec parsing)
├── FileWatcher (class, encapsulates file system monitoring)
└── SessionManager (class, manages session state)

packages/ui/src/store/
├── repoStore (Zustand)
├── specStore (Zustand)
├── sessionStore (Zustand)
├── configStore (Zustand)
└── uiStateStore (Zustand)

packages/ui/src/components/
├── Sidebar (repos list, spec tree)
├── FlowDiagram (React Flow visualization)
├── ActivityPanel (status, quick actions)
└── SettingsDialog (working directories)
```

---

## B. Detailed Phase Breakdown

### Phase 1a: Foundation — Database, Config, Core Models
**Duration**: 2 weeks  
**Owner**: Backend/Infrastructure track  
**Goal**: Establish the fundamental data layer and service infrastructure

#### 1a.1 Objectives & Deliverables
- [ ] SQLite database initialized with schema (repos, working_dirs, session_state tables)
- [ ] Drizzle ORM configured with migrations
- [ ] DatabaseService class implemented (singleton pattern)
- [ ] ConfigManager class implemented (load/save ~/.magenta/config.json)
- [ ] Shared TypeScript models (Repository, SpecFolder, SessionState, IPC message types)
- [ ] IPC message schema validation (Zod)
- [ ] Unit tests for database operations and config management (80% coverage)

#### 1a.2 File Structure & Class Design

```
packages/shared/src/
├── models.ts                    # Core entities: Repository, SpecFolder, PipelineStage
├── ipc.ts                       # IPC message types (Request, Response, Event)
├── config.ts                    # Config schema (Zod validation)
└── constants.ts                 # Enums: RepoStatus, StageStatus, etc.

packages/daemon/src/
├── db/
│   ├── schema.ts                # Drizzle schema definition (repos, working_dirs, session_state)
│   ├── DatabaseService.ts       # Main class: query builder, transaction support
│   └── migrations/
│       └── 0001_initial.ts      # Schema creation
├── config/
│   ├── ConfigManager.ts         # Singleton: load/save ~/.magenta/config.json
│   └── configSchema.ts          # Zod schema for validation
├── ipc/
│   └── validators.ts            # Zod schemas for IPC messages
└── index.ts                     # Daemon entry point (starts services)
```

#### 1a.3 Class Pseudocode

**DatabaseService (packages/daemon/src/db/DatabaseService.ts)**
```typescript
class DatabaseService {
  private static instance: DatabaseService;
  private db: Database;
  private pool: ConnectionPool;

  private constructor(dbPath: string) {
    // Initialize SQLite with WAL mode, journal size, synchronous mode
    // Set up Drizzle ORM
  }

  static getInstance(): DatabaseService {
    if (!instance) instance = new DatabaseService(...);
    return instance;
  }

  // Query methods
  async getRepo(id: string): Promise<Repository | null>
  async listRepos(): Promise<Repository[]>
  async createRepo(data: RepoInsertSchema): Promise<Repository>
  async updateRepo(id: string, data: Partial<Repository>): Promise<Repository>
  async deleteRepo(id: string): Promise<void>
  
  // Batch operations
  async upsertRepos(repos: RepoInsertSchema[]): Promise<Repository[]>
  
  // Session state
  async getSessionState(): Promise<SessionState>
  async updateSessionState(data: Partial<SessionState>): Promise<void>
  
  // Working directories
  async listWorkingDirs(): Promise<WorkingDir[]>
  async addWorkingDir(path: string): Promise<WorkingDir>
  async removeWorkingDir(id: string): Promise<void>
  
  // Transaction support
  async transaction<T>(cb: (tx: Transaction) => Promise<T>): Promise<T>
  
  // Lifecycle
  async initialize(): Promise<void>
  async close(): Promise<void>
}
```

**ConfigManager (packages/daemon/src/config/ConfigManager.ts)**
```typescript
import { z } from 'zod';

const ConfigSchema = z.object({
  workingDirs: z.array(z.string()),
  // Future: editor settings, theme, keyboard shortcuts, etc.
});

type MagentaConfig = z.infer<typeof ConfigSchema>;

class ConfigManager {
  private static instance: ConfigManager;
  private configPath: string; // ~/.magenta/config.json
  private config: MagentaConfig;

  private constructor() {
    this.configPath = this.getConfigPath();
    this.config = this.loadConfig();
  }

  static getInstance(): ConfigManager {
    if (!instance) instance = new ConfigManager();
    return instance;
  }

  private getConfigPath(): string {
    // Expand ~ to user home, construct ~/.magenta/config.json
  }

  private loadConfig(): MagentaConfig {
    // Read from file, validate with Zod, return
    // On file not found: initialize with defaults
    // On corrupt JSON: reset to defaults and log warning
  }

  private saveConfig(): void {
    // Write config to file (atomic: write to temp, rename)
  }

  // Public API
  getWorkingDirs(): string[] {
    return [...this.config.workingDirs]; // Return copy
  }

  addWorkingDir(path: string): void {
    if (!this.config.workingDirs.includes(path)) {
      this.config.workingDirs.push(path);
      this.saveConfig();
    }
  }

  removeWorkingDir(path: string): void {
    this.config.workingDirs = this.config.workingDirs.filter(d => d !== path);
    this.saveConfig();
  }

  // Watch for external config changes (future)
  onConfigChanged(callback: (config: MagentaConfig) => void): void { }
}
```

#### 1a.4 Entity Models (packages/shared/src/models.ts)

```typescript
// Repository discovered by scanner
export interface Repository {
  id: string;              // ULID
  name: string;            // directory name
  path: string;            // absolute path (unique)
  branch: string;          // current git branch
  hasSpecs: boolean;       // has specs/ folder
  specCount: number;       // number of spec subfolders
  status: 'active' | 'missing' | 'archived';
  scannedAt: number;       // timestamp (ms)
  createdAt: number;       // timestamp (ms)
}

// Spec folder in specs/ directory
export interface SpecFolder {
  id: string;              // ULID
  repoPath: string;        // parent repo path
  name: string;            // folder name (e.g., "001-auth-flow")
  path: string;            // absolute path
  stages: PipelineStage[];
  createdAt: number;
}

// Individual pipeline stage (Constitution → Spec → Plan → Tasks → Implementation)
export interface PipelineStage {
  name: 'constitution' | 'spec' | 'plan' | 'tasks' | 'implementation';
  status: 'missing' | 'draft' | 'review' | 'approved' | 'running';
  filePath?: string;       // for file-based stages
  metadata?: {
    taskCount?: number;    // for Tasks stage
    completedCount?: number;
    implementationProgress?: number;
  };
}

// Session state (single row in DB)
export interface SessionState {
  selectedRepoPath?: string;
  selectedSpecPath?: string;
  selectedFilePath?: string;
  sidebarWidth: number;
  activityPanelWidth: number;
  activityPanelOpen: boolean;
  mainTab: 'flow' | 'editor' | 'worktrees';
  updatedAt: number;
}

// Working directory configuration
export interface WorkingDir {
  id: string;
  path: string;
}
```

#### 1a.5 IPC Message Contract (packages/shared/src/ipc.ts)

```typescript
// Base types for all IPC messages
export type IPCRequest = 
  | { type: 'repo:list' }
  | { type: 'repo:scan' }
  | { type: 'spec:list'; repoPath: string }
  | { type: 'session:get' }
  | { type: 'session:update'; state: Partial<SessionState> }
  | { type: 'config:get' }
  | { type: 'config:add-working-dir'; path: string }
  | { type: 'config:remove-working-dir'; path: string };

export type IPCResponse = 
  | { type: 'repo:list:result'; repos: Repository[] }
  | { type: 'repo:scan:started' }
  | { type: 'repo:scan:progress'; scanned: number; total: number; currentDir: string }
  | { type: 'repo:scan:complete'; repos: Repository[]; added: number; updated: number; missing: number }
  | { type: 'spec:list:result'; repoPath: string; specs: SpecFolder[] }
  | { type: 'session:response'; state: SessionState }
  | { type: 'session:updated' }
  | { type: 'config:response'; config: MagentaConfig }
  | { type: 'config:updated' };

export type IPCEvent = 
  | { type: 'repo:scan:started' }
  | { type: 'repo:scan:progress'; scanned: number; total: number; currentDir: string }
  | { type: 'repo:scan:complete'; repos: Repository[]; added: number; updated: number; missing: number }
  | { type: 'spec:list:updated'; repoPath: string; specs: SpecFolder[] }
  | { type: 'config:updated'; config: MagentaConfig };
```

#### 1a.6 SQLite Schema (packages/daemon/src/db/schema.ts)

```typescript
import { sqliteTable, text, integer, check } from 'drizzle-orm/sqlite-core';

export const repos = sqliteTable('repos', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  path: text('path').notNull().unique(),
  branch: text('branch').notNull(),
  hasSpecs: integer('has_specs', { mode: 'boolean' }).notNull().default(false),
  specCount: integer('spec_count').notNull().default(0),
  status: text('status', { enum: ['active', 'missing', 'archived'] }).notNull().default('active'),
  scannedAt: integer('scanned_at').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const workingDirs = sqliteTable('working_dirs', {
  id: text('id').primaryKey(),
  path: text('path').notNull().unique(),
});

export const sessionState = sqliteTable(
  'session_state',
  {
    id: integer('id').primaryKey(),
    selectedRepoPath: text('selected_repo_path'),
    selectedSpecPath: text('selected_spec_path'),
    selectedFilePath: text('selected_file_path'),
    sidebarWidth: integer('sidebar_width').default(300),
    activityPanelWidth: integer('activity_panel_width').default(300),
    activityPanelOpen: integer('activity_panel_open', { mode: 'boolean' }).default(true),
    mainTab: text('main_tab', { enum: ['flow', 'editor', 'worktrees'] }).default('flow'),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    checkSingleRow: check('session_state_single_row', sql`id = 1`),
  })
);
```

#### 1a.7 Dependencies
- Node.js 22+, SQLite3 native bindings
- Drizzle ORM, better-sqlite3 driver
- Zod for schema validation
- ULID generator (ulidx package)

#### 1a.8 Testing Strategy

**Unit Tests (85% target)**:
- DatabaseService: CRUD operations, transactions, connection pooling, WAL mode recovery
- ConfigManager: load defaults, save config, expand tilde, handle corrupt JSON
- IPC validators: Zod schema validation for all message types
- Model factories: Create test data efficiently

**Integration Tests (10% target)**:
- DatabaseService + ConfigManager: write config, read from DB, verify persistence
- SQLite schema: run migrations, verify constraints, test unique indexes

**Test Files**:
```
packages/daemon/test/
├── db/
│   ├── DatabaseService.test.ts
│   └── schema.test.ts
├── config/
│   └── ConfigManager.test.ts
└── ipc/
    └── validators.test.ts
```

#### 1a.9 Definition of Done (Phase 1a)
- [ ] SQLite schema created and tested
- [ ] DatabaseService class fully implemented with all CRUD methods
- [ ] ConfigManager class fully implemented
- [ ] All IPC message types defined and validated with Zod
- [ ] Unit tests pass with 85%+ coverage
- [ ] Integration tests for persistence layer pass
- [ ] No console errors in daemon startup
- [ ] Database file persists across daemon restarts
- [ ] Code reviewed and approved by 2+ team members
- [ ] Documentation: Database schema rationale, IPC contract spec
- [ ] Ready for Phase 1b (Repo Manager can depend on this)

---

### Phase 1b: Repo Management — Scanner, Persistence, Sidebar
**Duration**: 2 weeks  
**Owner**: Backend + Frontend track  
**Depends on**: Phase 1a (Foundation)  
**Goal**: Enable users to scan directories, persist results, and navigate repos

#### 1b.1 Objectives & Deliverables
- [ ] RepoScanner daemon service fully implemented (git detection, branch reading, caching)
- [ ] RepoRepository data access layer (queries repos from DB)
- [ ] ScanQueue/ScanTask system (manage background scans, emit progress events)
- [ ] IPC handlers for repo:list, repo:scan, config:* operations
- [ ] Zustand repoStore (state management on renderer)
- [ ] RepoList sidebar component (display repos, status badges, branch names)
- [ ] Virtual scrolling for large repo lists (1000+)
- [ ] Settings dialog with working directory management
- [ ] Welcome screen for first-launch experience
- [ ] Integration tests: scan → DB → UI (end-to-end repo flow)
- [ ] E2E smoke test: add working dir → scan → see repos in sidebar

#### 1b.2 File Structure & Classes

```
packages/daemon/src/
├── services/
│   ├── RepoScanner.ts           # Main class: scans directories for repos
│   ├── RepoRepository.ts        # Data layer: queries repos from DB
│   ├── ScanQueue.ts             # Manages scan tasks, emits progress
│   └── GitClient.ts             # Wrapper around simple-git
├── ipc/
│   ├── handlers/
│   │   ├── repoHandlers.ts      # (repo:list, repo:scan)
│   │   └── configHandlers.ts    # (config:get, add, remove)
│   └── registerHandlers.ts      # Central IPC registration

packages/ui/src/
├── store/
│   ├── repoStore.ts             # Zustand: repos, scanning state
│   └── configStore.ts           # Zustand: working dirs, config
├── pages/
│   ├── Welcome.tsx              # First launch experience
│   └── Main.tsx                 # Main app layout
├── components/
│   ├── sidebar/
│   │   ├── RepoList.tsx         # Virtualized list of repos
│   │   ├── RepoItem.tsx         # Single repo row
│   │   ├── RepoStatusBadge.tsx  # Status badge (active/missing/archived)
│   │   └── ScanProgress.tsx     # Scan progress bar (during scan)
│   ├── settings/
│   │   ├── SettingsDialog.tsx   # Settings modal
│   │   ├── WorkingDirList.tsx   # List of working directories
│   │   └── AddWorkingDirButton.tsx
│   └── Welcome.tsx              # (or separate page)
```

#### 1b.3 Class Pseudocode

**RepoScanner (packages/daemon/src/services/RepoScanner.ts)**
```typescript
class RepoScanner {
  private gitClient: GitClient;
  private repoRepository: RepoRepository;
  private logger: Logger;

  constructor(gitClient: GitClient, repoRepository: RepoRepository) {
    this.gitClient = gitClient;
    this.repoRepository = repoRepository;
  }

  // Main entry point: scan working directories
  async scanDirectories(
    workingDirs: string[],
    onProgress: (progress: ScanProgress) => void
  ): Promise<ScanResult> {
    // Walk each working dir (max 3 levels deep)
    // Look for .git folders
    // For each repo found:
    //   - Get metadata (branch, spec count)
    //   - Check if already in DB (upsert vs create)
    //   - Emit progress event
    // Return summary (added, updated, missing)
  }

  private async getRepoMetadata(repoPath: string): Promise<RepoMetadata> {
    // Use GitClient to:
    //   - Get current branch
    //   - Check last commit timestamp
    // Check specs/ folder count
    // Return metadata
  }

  private async walkDirectory(
    dir: string,
    maxDepth: number,
    currentDepth: number = 0
  ): Promise<string[]> {
    // Recursively find .git folders
    // Stop at maxDepth to avoid scanning deep node_modules, etc.
    // Return array of repo root paths
  }
}
```

**ScanQueue (packages/daemon/src/services/ScanQueue.ts)**
```typescript
interface ScanTask {
  id: string;
  workingDirs: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: number;
  completedAt?: number;
  progress: ScanProgress;
}

class ScanQueue {
  private queue: ScanTask[] = [];
  private currentTask?: ScanTask;
  private scanner: RepoScanner;
  private ipc: IPCBridge;

  constructor(scanner: RepoScanner, ipc: IPCBridge) {
    this.scanner = scanner;
    this.ipc = ipc;
  }

  async enqueueScan(workingDirs: string[]): Promise<string> {
    // Create task, add to queue
    // If not currently scanning, start processing
    // Return task ID
  }

  private async processTasks(): Promise<void> {
    // Pull from queue, run scanner
    // Emit progress events
    // On complete, emit completion event
    // Move to next task
  }

  getTaskStatus(taskId: string): ScanTask | undefined {
    // Return task from queue
  }
}
```

**RepoRepository (packages/daemon/src/services/RepoRepository.ts)**
```typescript
class RepoRepository {
  private db: DatabaseService;

  constructor(db: DatabaseService) {
    this.db = db;
  }

  async findAll(): Promise<Repository[]> {
    // Query all repos, ordered by status (active first)
  }

  async findById(id: string): Promise<Repository | null> {
    // Query single repo
  }

  async findByPath(path: string): Promise<Repository | null> {
    // Query by path (unique constraint)
  }

  async create(data: RepoCreateInput): Promise<Repository> {
    // Insert repo, return inserted row
  }

  async upsert(repos: RepoCreateInput[]): Promise<Repository[]> {
    // Upsert multiple repos (for bulk scan results)
    // Use transaction
  }

  async updateStatus(id: string, status: RepoStatus): Promise<Repository> {
    // Update repo status (e.g., mark missing)
  }

  async getSpecCount(repoPath: string): Promise<number> {
    // Count spec folders in repo's specs/ directory
  }
}
```

**repoStore (packages/ui/src/store/repoStore.ts) — Zustand**
```typescript
interface RepoStoreState {
  repos: Repository[];
  isScanning: boolean;
  scanProgress: ScanProgress | null;
  scanError: string | null;
  selectedRepoPath: string | null;

  // Actions
  setRepos: (repos: Repository[]) => void;
  setScanning: (scanning: boolean) => void;
  setScanProgress: (progress: ScanProgress | null) => void;
  setScanError: (error: string | null) => void;
  selectRepo: (path: string | null) => void;

  // Async thunks
  fetchRepos: () => Promise<void>;
  triggerScan: () => Promise<void>;
}

export const useRepoStore = create<RepoStoreState>((set, get) => ({
  repos: [],
  isScanning: false,
  scanProgress: null,
  scanError: null,
  selectedRepoPath: null,

  setRepos: (repos) => set({ repos }),
  setScanning: (scanning) => set({ isScanning: scanning }),
  setScanProgress: (progress) => set({ scanProgress: progress }),
  setScanError: (error) => set({ scanError: error }),
  selectRepo: (path) => set({ selectedRepoPath: path }),

  fetchRepos: async () => {
    const repos = await ipc.send({ type: 'repo:list' });
    set({ repos: repos.data });
  },

  triggerScan: async () => {
    set({ isScanning: true, scanError: null });
    try {
      const result = await ipc.send({ type: 'repo:scan' });
      // Progress events received via ipc.on('repo:scan:progress', ...)
    } catch (err) {
      set({ scanError: err.message });
    } finally {
      set({ isScanning: false });
    }
  },
}));
```

#### 1b.4 IPC Handlers (packages/daemon/src/ipc/handlers/repoHandlers.ts)

```typescript
export function registerRepoHandlers(ipc: IPCBridge) {
  // repo:list — Get all repos from DB
  ipc.handle('repo:list', async () => {
    const repoRepo = new RepoRepository(db);
    const repos = await repoRepo.findAll();
    return { type: 'repo:list:result', repos };
  });

  // repo:scan — Trigger background scan
  ipc.handle('repo:scan', async () => {
    const configMgr = ConfigManager.getInstance();
    const workingDirs = configMgr.getWorkingDirs();
    
    if (workingDirs.length === 0) {
      return { type: 'error', message: 'No working directories configured' };
    }

    const scanner = new RepoScanner(gitClient, repoRepository);
    const result = await scanner.scanDirectories(workingDirs, (progress) => {
      ipc.send('repo:scan:progress', progress); // Push to renderer
    });

    return { type: 'repo:scan:complete', ...result };
  });
}
```

#### 1b.5 React Components

**RepoList.tsx** — Virtualized sidebar component
```typescript
import { useRepoStore } from '@/store/repoStore';
import { FixedSizeList as List } from 'react-window';

export const RepoList = () => {
  const repos = useRepoStore((s) => s.repos);
  const isScanning = useRepoStore((s) => s.isScanning);
  const selectRepo = useRepoStore((s) => s.selectRepo);

  if (repos.length === 0) {
    return <EmptyState />;
  }

  const rowRenderer = ({ index, style }) => (
    <RepoItem 
      key={repos[index].id} 
      repo={repos[index]} 
      style={style}
      onClick={() => selectRepo(repos[index].path)}
    />
  );

  return (
    <div className="flex flex-col h-full">
      {isScanning && <ScanProgress />}
      <List
        height={400}
        itemCount={repos.length}
        itemSize={60}
        width="100%"
      >
        {rowRenderer}
      </List>
    </div>
  );
};
```

**SettingsDialog.tsx**
```typescript
export const SettingsDialog = ({ open, onOpenChange }) => {
  const workingDirs = useConfigStore((s) => s.workingDirs);
  const addWorkingDir = useConfigStore((s) => s.addWorkingDir);
  const removeWorkingDir = useConfigStore((s) => s.removeWorkingDir);

  const handleAddDir = async () => {
    const selected = await window.electron.openFileDialog({
      properties: ['openDirectory'],
    });
    if (selected.filePaths.length > 0) {
      addWorkingDir(selected.filePaths[0]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <h2>Settings</h2>
        <div>
          <h3>Working Directories</h3>
          <WorkingDirList dirs={workingDirs} onRemove={removeWorkingDir} />
          <Button onClick={handleAddDir}>+ Add Directory</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
```

#### 1b.6 Dependencies (beyond Phase 1a)
- simple-git (git operations)
- react-window (virtual scrolling)
- electron file dialog API

#### 1b.7 Testing Strategy

**Unit Tests (80% target)**:
- RepoScanner: mock file system, verify repo detection, branch reading
- RepoRepository: CRUD operations, queries
- ScanQueue: task queuing, progress emission
- IPC handlers: message validation, response format
- Zustand stores: state mutations, async actions

**Integration Tests (15% target)**:
- RepoScanner + RepoRepository: scan → DB → query (full persistence cycle)
- IPC: send repo:list, receive result
- ConfigManager + RepoScanner: read working dirs, scan, verify results

**E2E Smoke Tests (5% target)**:
- Fresh install: launch → welcome → add working dir → scan → see repos in sidebar
- Existing install: launch → repos appear instantly → selected repo highlighted

#### 1b.8 Definition of Done (Phase 1b)
- [ ] RepoScanner class fully implemented and tested
- [ ] ScanQueue manages background tasks with progress emission
- [ ] RepoRepository CRUD layer fully implemented
- [ ] IPC handlers for repo operations registered and tested
- [ ] Zustand repoStore implemented with all mutations
- [ ] RepoList component renders virtua list (supports 1000+ repos)
- [ ] SettingsDialog allows add/remove working directories
- [ ] Settings changes trigger scan and update sidebar
- [ ] Welcome screen displays on first launch
- [ ] Scan completes in < 5 seconds for typical case (< 100 repos)
- [ ] Unit tests pass with 80%+ coverage
- [ ] Integration tests: full scan cycle passes
- [ ] E2E smoke test passes: add dir → scan → see repos
- [ ] No console errors during repo scanning
- [ ] Code reviewed and approved
- [ ] Ready for Phase 1c (SpecReader can depend on repo data)

---

### Phase 1c: Spec Discovery & Visualization — Spec Reader, React Flow, Sidebar Tree
**Duration**: 2 weeks  
**Owner**: Frontend + Backend track  
**Depends on**: Phase 1b (Repo Management)  
**Goal**: Enable users to browse specs, see pipeline status, visualize flow diagram

#### 1c.1 Objectives & Deliverables
- [ ] SpecReader daemon service (parse specs/ folder, detect stages, read file contents)
- [ ] SpecRepository data access layer (cache spec metadata in DB for fast queries)
- [ ] IPC handlers for spec:list and spec-related queries
- [ ] Zustand specStore (manage spec navigation, cache)
- [ ] SpecTree sidebar component (hierarchical view of spec folders)
- [ ] React Flow diagram component (5 nodes, interactive, responsive)
- [ ] Node status rendering (missing/draft/review/approved/running)
- [ ] Progress bars (task counts, implementation progress)
- [ ] Interactive controls (pan, zoom, fit-to-view, mini-map)
- [ ] Main content area layout (flow diagram centered)
- [ ] Integration: select repo → sidebar shows specs → click spec → diagram displays
- [ ] Full integration test: repo → specs → diagram rendering

#### 1c.2 File Structure & Classes

```
packages/daemon/src/services/
├── SpecReader.ts                # Parse specs/ folder, detect stages, read metadata

packages/ui/src/
├── store/
│   └── specStore.ts            # Zustand: specs, selected spec, diagram data
├── components/
│   ├── sidebar/
│   │   ├── SpecTree.tsx         # Hierarchical spec list
│   │   ├── SpecItem.tsx         # Single spec folder row
│   │   └── StageDots.tsx        # 5 progress dots (Constitution → Implementation)
│   ├── flow/
│   │   ├── FlowDiagram.tsx      # React Flow container
│   │   ├── PipelineNode.tsx     # Custom node component
│   │   ├── PipelineEdge.tsx     # Custom edge style (optional)
│   │   ├── nodeTypes.ts         # Node definitions
│   │   └── diagramUtils.ts      # Layout, color mapping
│   └── Main.tsx                 # Main layout (sidebar + flow + activity panel)
```

#### 1c.3 Class Pseudocode

**SpecReader (packages/daemon/src/services/SpecReader.ts)**
```typescript
class SpecReader {
  private repoRepository: RepoRepository;
  private logger: Logger;

  constructor(repoRepository: RepoRepository) {
    this.repoRepository = repoRepository;
  }

  // Main entry point: read all specs in a repo
  async readSpecs(repoPath: string): Promise<SpecFolder[]> {
    const specsDir = path.join(repoPath, 'specs');
    if (!fs.existsSync(specsDir)) {
      return [];
    }

    const specFolders: SpecFolder[] = [];
    const entries = await fs.promises.readdir(specsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const specPath = path.join(specsDir, entry.name);
        const spec = await this.readSpecFolder(specPath, entry.name);
        specFolders.push(spec);
      }
    }

    return specFolders;
  }

  private async readSpecFolder(specPath: string, name: string): Promise<SpecFolder> {
    const stages = await this.detectStages(specPath);
    return {
      id: ulid(),
      repoPath: path.dirname(path.dirname(specPath)),
      name,
      path: specPath,
      stages,
      createdAt: Date.now(),
    };
  }

  private async detectStages(specPath: string): Promise<PipelineStage[]> {
    const stages: PipelineStage[] = [];
    const stageNames = ['constitution', 'spec', 'plan', 'tasks', 'implementation'];

    for (const stageName of stageNames) {
      const filePath = path.join(specPath, `${stageName}.md`);
      const exists = fs.existsSync(filePath);

      if (exists) {
        if (stageName === 'tasks') {
          const metadata = await this.readTaskMetadata(filePath);
          stages.push({ name: stageName, status: 'approved', metadata });
        } else {
          stages.push({ name: stageName, status: 'approved', filePath });
        }
      } else {
        stages.push({ name: stageName, status: 'missing' });
      }
    }

    // Check for implementation/ folder
    const implDir = path.join(specPath, 'implementation');
    if (fs.existsSync(implDir)) {
      const progressFile = path.join(implDir, 'progress.json');
      const metadata = { implementationProgress: 0 };
      
      if (fs.existsSync(progressFile)) {
        try {
          const data = JSON.parse(fs.readFileSync(progressFile, 'utf-8'));
          metadata.implementationProgress = data.percentage || 0;
        } catch (err) {
          this.logger.warn(`Failed to read ${progressFile}: ${err.message}`);
        }
      }
      
      const implStage = stages.find(s => s.name === 'implementation');
      if (implStage) {
        implStage.status = 'running';
        implStage.metadata = metadata;
      }
    }

    return stages;
  }

  private async readTaskMetadata(tasksPath: string): Promise<object> {
    const content = await fs.promises.readFile(tasksPath, 'utf-8');
    const completedCount = (content.match(/- \[x\]/g) || []).length;
    const totalCount = (content.match(/- \[[x ]]/g) || []).length;

    return {
      taskCount: totalCount,
      completedCount,
    };
  }
}
```

**specStore (packages/ui/src/store/specStore.ts) — Zustand**
```typescript
interface SpecStoreState {
  specs: SpecFolder[];
  selectedSpec: SpecFolder | null;
  isLoading: boolean;
  error: string | null;
  diagramNodes: Node[];
  diagramEdges: Edge[];

  // Actions
  setSpecs: (specs: SpecFolder[]) => void;
  selectSpec: (spec: SpecFolder | null) => void;
  setDiagramData: (nodes: Node[], edges: Edge[]) => void;

  // Async thunks
  fetchSpecs: (repoPath: string) => Promise<void>;
  updateDiagramForSpec: (spec: SpecFolder) => void;
}

export const useSpecStore = create<SpecStoreState>((set) => ({
  specs: [],
  selectedSpec: null,
  isLoading: false,
  error: null,
  diagramNodes: [],
  diagramEdges: [],

  setSpecs: (specs) => set({ specs }),
  selectSpec: (spec) => set({ selectedSpec: spec }),
  setDiagramData: (nodes, edges) => set({ diagramNodes: nodes, diagramEdges: edges }),

  fetchSpecs: async (repoPath) => {
    set({ isLoading: true });
    try {
      const result = await ipc.send({ type: 'spec:list', repoPath });
      set({ specs: result.specs });
    } catch (err) {
      set({ error: err.message });
    } finally {
      set({ isLoading: false });
    }
  },

  updateDiagramForSpec: (spec) => {
    const { nodes, edges } = buildDiagramData(spec);
    set({ diagramNodes: nodes, diagramEdges: edges });
  },
}));
```

#### 1c.4 React Flow Diagram Components

**PipelineNode.tsx** — Custom React Flow node
```typescript
const PipelineNode = ({ data, selected }) => {
  const stage = data as PipelineStage;

  const statusColor = {
    missing: '#d4d4d8',     // gray
    draft: '#fbbf24',       // amber
    review: '#60a5fa',      // blue
    approved: '#22c55e',    // green
    running: '#f97316',     // orange
  };

  const borderColor = statusColor[stage.status] || '#d4d4d8';

  return (
    <div
      className="px-4 py-2 rounded border-2 bg-white"
      style={{ borderColor, borderWidth: stage.status === 'missing' ? '2px dashed' : '2px' }}
    >
      <div className="font-semibold text-sm capitalize">{stage.name}</div>
      {stage.metadata?.taskCount && (
        <div className="text-xs text-gray-600">
          {stage.metadata.completedCount}/{stage.metadata.taskCount} tasks
        </div>
      )}
      {stage.metadata?.implementationProgress && (
        <div className="mt-2">
          <ProgressBar value={stage.metadata.implementationProgress} />
        </div>
      )}
    </div>
  );
};
```

**FlowDiagram.tsx** — React Flow container
```typescript
import ReactFlow, { 
  Controls, 
  Background, 
  MiniMap,
  useNodesState,
  useEdgesState,
} from 'reactflow';

export const FlowDiagram = () => {
  const selectedSpec = useSpecStore((s) => s.selectedSpec);
  const diagramNodes = useSpecStore((s) => s.diagramNodes);
  const diagramEdges = useSpecStore((s) => s.diagramEdges);

  const [nodes, setNodes, onNodesChange] = useNodesState(diagramNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(diagramEdges);

  if (!selectedSpec) {
    return <EmptyDiagramState />;
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={{ pipeline: PipelineNode }}
      fitView
    >
      <Background />
      <Controls />
      <MiniMap />
    </ReactFlow>
  );
};
```

#### 1c.5 Diagram Layout Utility (diagramUtils.ts)

```typescript
export function buildDiagramData(spec: SpecFolder) {
  const stageOrder = ['constitution', 'spec', 'plan', 'tasks', 'implementation'];
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Create nodes in a horizontal line
  stageOrder.forEach((stageName, index) => {
    const stage = spec.stages.find(s => s.name === stageName) || {
      name: stageName,
      status: 'missing',
    };

    nodes.push({
      id: stageName,
      data: { ...stage },
      position: { x: index * 150, y: 0 },
      type: 'pipeline',
    });

    // Create edges between consecutive nodes
    if (index > 0) {
      edges.push({
        id: `${stageOrder[index - 1]}-${stageName}`,
        source: stageOrder[index - 1],
        target: stageName,
        animated: stage.status !== 'missing',
      });
    }
  });

  return { nodes, edges };
}
```

#### 1c.6 IPC Handler for Specs

```typescript
export function registerSpecHandlers(ipc: IPCBridge) {
  ipc.handle('spec:list', async ({ repoPath }) => {
    const specReader = new SpecReader(repoRepository);
    const specs = await specReader.readSpecs(repoPath);
    return { type: 'spec:list:result', repoPath, specs };
  });
}
```

#### 1c.7 Dependencies (beyond previous phases)
- React Flow v11
- lucide-react (icons)
- path (Node.js)

#### 1c.8 Testing Strategy

**Unit Tests (80% target)**:
- SpecReader: mock file system, verify stage detection, task metadata parsing
- Diagram utilities: build node/edge layout for various spec states
- Zustand spec store: mutations, selectors

**Integration Tests (15% target)**:
- SpecReader + RepoRepository: read specs → verify data structure
- Flow diagram: render for specs with all stages, partial stages, no stages
- IPC: send spec:list, receive properly formatted data

**E2E Smoke Tests (5% target)**:
- Select repo → specs appear in sidebar → click spec → diagram renders
- Diagram shows correct node colors for each stage status

#### 1c.9 Definition of Done (Phase 1c)
- [ ] SpecReader fully implemented and tested
- [ ] All five pipeline stages detected and parsed correctly
- [ ] Task metadata (completion percentage) extracted from tasks.md
- [ ] Implementation progress read from progress.json
- [ ] specStore Zustand fully implemented
- [ ] IPC handler for spec:list implemented and tested
- [ ] React Flow diagram renders for all spec states (full, partial, empty)
- [ ] Node colors and styles match design (missing/draft/review/approved/running)
- [ ] Diagram controls work (pan, zoom, fit-to-view, mini-map)
- [ ] SpecTree sidebar component lists specs with progress dots
- [ ] Integration: select repo → show specs → select spec → display diagram
- [ ] Unit tests pass with 80%+ coverage
- [ ] Integration tests pass
- [ ] E2E smoke test passes
- [ ] No console errors during spec browsing
- [ ] Code reviewed and approved
- [ ] Ready for Phase 1d (Polish)

---

### Phase 1d: Polish & Real-Time — Session State, File Watcher, Activity Panel, Settings
**Duration**: 2 weeks  
**Owner**: Frontend + Backend track (parallel work possible)  
**Depends on**: Phase 1c (Spec Discovery), Phase 1b (Repo Management)  
**Goal**: Complete feature with state persistence, real-time updates, activity panel, and UX polish

#### 1d.1 Objectives & Deliverables
- [ ] SessionManager daemon service (persist and restore session state)
- [ ] Zustand sessionStore (manage UI state persistence)
- [ ] IPC handlers for session:get, session:update operations
- [ ] TypeScript setup: debounce session writes (500ms)
- [ ] FileWatcher daemon service (chokidar, watch specs/ folder)
- [ ] File change detection: create/edit/delete spec files
- [ ] Real-time spec tree and diagram updates (< 500ms latency)
- [ ] ActivityPanel component (agent status placeholder, quick actions)
- [ ] Improved SettingsDialog (scan now, show last scan time)
- [ ] Main layout component (3-panel layout: sidebar, flow, activity)
- [ ] ResizablePanel components (allow resize sidebar/activity panel)
- [ ] Session restoration on app launch (repo → spec → file preserved)
- [ ] Fallback behavior: deleted items handled gracefully
- [ ] Performance optimization: debounce, avoid excessive IPC
- [ ] E2E test: full workflow (launch → navigate → close → reopen → restored)
- [ ] Polish: animations, loading states, error messages

#### 1d.2 File Structure & Classes

```
packages/daemon/src/services/
├── SessionManager.ts            # Manage session state persistence
├── FileWatcher.ts               # Watch specs/ folder for changes

packages/ui/src/
├── store/
│   ├── sessionStore.ts          # Zustand: session state, persistence
│   └── uiStateStore.ts          # Zustand: UI-only state (panel widths, tabs)
├── components/
│   ├── layouts/
│   │   └── MainLayout.tsx       # 3-panel layout with resizable dividers
│   ├── activity/
│   │   ├── ActivityPanel.tsx    # Agent status, quick actions, help
│   │   ├── QuickActions.tsx     # New spec, View diff, Run queued
│   │   └── Legend.tsx           # Pipeline stage legend
│   └── Main.tsx                 # Main container (orchestrates all)
└── hooks/
    └── useSessionRestoration.ts # Hook to restore session on mount
```

#### 1d.3 Class Pseudocode

**SessionManager (packages/daemon/src/services/SessionManager.ts)**
```typescript
const SESSION_STATE_DEBOUNCE_MS = 500;

class SessionManager {
  private db: DatabaseService;
  private ipc: IPCBridge;
  private debounceTimer: NodeJS.Timeout | null = null;

  constructor(db: DatabaseService, ipc: IPCBridge) {
    this.db = db;
    this.ipc = ipc;
  }

  // Get current session state
  async getSessionState(): Promise<SessionState> {
    const state = await this.db.getSessionState();
    // Validate: check if selected items still exist on disk
    // If not, clear references gracefully
    return this.sanitizeSession(state);
  }

  // Update session state with debouncing
  async updateSessionState(updates: Partial<SessionState>): Promise<void> {
    // Clear existing debounce timer
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    // Debounce database write by 500ms
    this.debounceTimer = setTimeout(async () => {
      const merged = { ...await this.getSessionState(), ...updates };
      await this.db.updateSessionState(merged);
      this.ipc.send('session:updated', merged);
    }, SESSION_STATE_DEBOUNCE_MS);
  }

  private sanitizeSession(session: SessionState): SessionState {
    // Validate selectedRepoPath exists
    // Validate selectedSpecPath exists
    // Validate selectedFilePath exists
    // If not, clear the reference and return sanitized version
    return session;
  }
}
```

**FileWatcher (packages/daemon/src/services/FileWatcher.ts)**
```typescript
import chokidar from 'chokidar';

class FileWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  private specReader: SpecReader;
  private ipc: IPCBridge;
  private watchingPath: string | null = null;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(specReader: SpecReader, ipc: IPCBridge) {
    this.specReader = specReader;
    this.ipc = ipc;
  }

  // Start watching a repo's specs/ folder
  startWatching(repoPath: string): void {
    if (this.watchingPath === repoPath && this.watcher) {
      return; // Already watching
    }

    this.stopWatching();

    const specsDir = path.join(repoPath, 'specs');
    if (!fs.existsSync(specsDir)) {
      return;
    }

    this.watcher = chokidar.watch(specsDir, {
      ignored: /(^|[\/\\])\.|node_modules/,
      awaitWriteFinish: true,
    });

    this.watcher.on('change', (filePath) => this.handleFileChange(repoPath, filePath));
    this.watcher.on('add', (filePath) => this.handleFileChange(repoPath, filePath));
    this.watcher.on('unlink', (filePath) => this.handleFileChange(repoPath, filePath));

    this.watchingPath = repoPath;
  }

  private handleFileChange(repoPath: string, filePath: string): void {
    // Debounce: coalesce multiple quick changes
    const key = `${repoPath}:${filePath}`;
    
    if (this.debounceTimers.has(key)) {
      clearTimeout(this.debounceTimers.get(key)!);
    }

    const timer = setTimeout(async () => {
      const specs = await this.specReader.readSpecs(repoPath);
      this.ipc.send('spec:list:updated', { repoPath, specs });
      this.debounceTimers.delete(key);
    }, 300);

    this.debounceTimers.set(key, timer);
  }

  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.watchingPath = null;
  }
}
```

**sessionStore (packages/ui/src/store/sessionStore.ts) — Zustand**
```typescript
interface SessionStoreState {
  selectedRepoPath: string | null;
  selectedSpecPath: string | null;
  selectedFilePath: string | null;
  sidebarWidth: number;
  activityPanelWidth: number;
  activityPanelOpen: boolean;
  mainTab: 'flow' | 'editor' | 'worktrees';
  isRestoring: boolean;

  // Actions
  selectRepo: (path: string | null) => void;
  selectSpec: (path: string | null) => void;
  selectFile: (path: string | null) => void;
  setSidebarWidth: (width: number) => void;
  setActivityPanelWidth: (width: number) => void;
  setActivityPanelOpen: (open: boolean) => void;
  setMainTab: (tab: 'flow' | 'editor' | 'worktrees') => void;

  // Async thunks
  restoreSession: () => Promise<void>;
  persistSession: () => Promise<void>;
}

export const useSessionStore = create<SessionStoreState>((set, get) => ({
  selectedRepoPath: null,
  selectedSpecPath: null,
  selectedFilePath: null,
  sidebarWidth: 300,
  activityPanelWidth: 300,
  activityPanelOpen: true,
  mainTab: 'flow',
  isRestoring: false,

  selectRepo: (path) => {
    set({ selectedRepoPath: path });
    get().persistSession();
  },
  selectSpec: (path) => {
    set({ selectedSpecPath: path });
    get().persistSession();
  },
  selectFile: (path) => {
    set({ selectedFilePath: path });
    get().persistSession();
  },
  setSidebarWidth: (width) => {
    set({ sidebarWidth: width });
    get().persistSession();
  },
  setActivityPanelWidth: (width) => {
    set({ activityPanelWidth: width });
    get().persistSession();
  },
  setActivityPanelOpen: (open) => {
    set({ activityPanelOpen: open });
    get().persistSession();
  },
  setMainTab: (tab) => {
    set({ mainTab: tab });
    get().persistSession();
  },

  restoreSession: async () => {
    set({ isRestoring: true });
    try {
      const result = await ipc.send({ type: 'session:get' });
      set({
        selectedRepoPath: result.state.selectedRepoPath || null,
        selectedSpecPath: result.state.selectedSpecPath || null,
        selectedFilePath: result.state.selectedFilePath || null,
        sidebarWidth: result.state.sidebarWidth,
        activityPanelWidth: result.state.activityPanelWidth,
        activityPanelOpen: result.state.activityPanelOpen,
        mainTab: result.state.mainTab,
      });
    } finally {
      set({ isRestoring: false });
    }
  },

  persistSession: async () => {
    const state = get();
    await ipc.send({
      type: 'session:update',
      state: {
        selectedRepoPath: state.selectedRepoPath,
        selectedSpecPath: state.selectedSpecPath,
        selectedFilePath: state.selectedFilePath,
        sidebarWidth: state.sidebarWidth,
        activityPanelWidth: state.activityPanelWidth,
        activityPanelOpen: state.activityPanelOpen,
        mainTab: state.mainTab,
      },
    });
  },
}));
```

#### 1d.4 React Components

**MainLayout.tsx** — 3-panel layout
```typescript
import { Resizable } from 'react-resizable-panels';

export const MainLayout = () => {
  const sidebarWidth = useSessionStore((s) => s.sidebarWidth);
  const activityPanelWidth = useSessionStore((s) => s.activityPanelWidth);
  const setSidebarWidth = useSessionStore((s) => s.setSidebarWidth);
  const setActivityPanelWidth = useSessionStore((s) => s.setActivityPanelWidth);

  return (
    <div className="flex h-screen w-full">
      {/* Left Sidebar */}
      <ResizablePanel
        defaultSize={sidebarWidth / window.innerWidth * 100}
        onResize={(newWidth) => setSidebarWidth(newWidth)}
        maxSize={40}
        minSize={20}
      >
        <Sidebar />
      </ResizablePanel>

      {/* Center: Main Content */}
      <ResizablePanel className="flex-1">
        <FlowDiagram />
      </ResizablePanel>

      {/* Right Activity Panel */}
      <ResizablePanel
        defaultSize={activityPanelWidth / window.innerWidth * 100}
        onResize={(newWidth) => setActivityPanelWidth(newWidth)}
        maxSize={30}
        minSize={15}
      >
        <ActivityPanel />
      </ResizablePanel>
    </div>
  );
};
```

**ActivityPanel.tsx**
```typescript
export const ActivityPanel = () => {
  return (
    <div className="flex flex-col h-full bg-gray-50 p-4 border-l">
      <h2 className="text-lg font-semibold mb-4">Activity</h2>
      
      <div className="mb-6">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Quick Actions</h3>
        <QuickActions />
      </div>

      <div className="mb-6">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Agent Status</h3>
        <div className="p-2 bg-white rounded border">
          <p className="text-xs text-gray-600">No agents running</p>
        </div>
      </div>

      <div className="flex-1">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Pipeline Legend</h3>
        <Legend />
      </div>
    </div>
  );
};
```

**Legend.tsx**
```typescript
export const Legend = () => {
  const stageStatuses = [
    { status: 'missing', color: '#d4d4d8', label: 'Missing' },
    { status: 'draft', color: '#fbbf24', label: 'Draft' },
    { status: 'review', color: '#60a5fa', label: 'Review' },
    { status: 'approved', color: '#22c55e', label: 'Approved' },
    { status: 'running', color: '#f97316', label: 'Running' },
  ];

  return (
    <div className="space-y-2">
      {stageStatuses.map((item) => (
        <div key={item.status} className="flex items-center gap-2">
          <div 
            className="w-4 h-4 rounded border"
            style={{ backgroundColor: item.color, borderColor: item.color }}
          />
          <span className="text-xs text-gray-700">{item.label}</span>
        </div>
      ))}
    </div>
  );
};
```

**useSessionRestoration.ts** — Hook for restoring session on mount
```typescript
export function useSessionRestoration() {
  const restoreSession = useSessionStore((s) => s.restoreSession);
  const isRestoring = useSessionStore((s) => s.isRestoring);
  const selectedRepoPath = useSessionStore((s) => s.selectedRepoPath);

  useEffect(() => {
    restoreSession();
  }, []);

  useEffect(() => {
    if (selectedRepoPath) {
      // Trigger spec list fetch when repo is selected
      useSpecStore.getState().fetchSpecs(selectedRepoPath);
    }
  }, [selectedRepoPath]);

  return { isRestoring };
}
```

#### 1d.5 IPC Handlers for Session

```typescript
export function registerSessionHandlers(ipc: IPCBridge) {
  const sessionManager = new SessionManager(db, ipc);

  ipc.handle('session:get', async () => {
    const state = await sessionManager.getSessionState();
    return { type: 'session:response', state };
  });

  ipc.handle('session:update', async ({ state }) => {
    await sessionManager.updateSessionState(state);
    return { type: 'session:updated' };
  });
}

// Register file watcher listening
export function setupFileWatcherEvents(ipc: IPCBridge) {
  const fileWatcher = new FileWatcher(specReader, ipc);

  // When repo is selected, start watching its specs/ folder
  ipc.on('repo:selected', ({ repoPath }) => {
    fileWatcher.startWatching(repoPath);
  });

  // When app closes, stop watching
  ipc.on('app:closing', () => {
    fileWatcher.stopWatching();
  });
}
```

#### 1d.6 Dependencies (beyond previous phases)
- react-resizable-panels (draggable panel resizing)
- chokidar (file system watching)

#### 1d.7 Testing Strategy

**Unit Tests (80% target)**:
- SessionManager: debounce timer, session sanitization, fallback behavior
- FileWatcher: start/stop watching, debounce file changes, change detection
- sessionStore: mutations, restoration logic

**Integration Tests (15% target)**:
- Session restoration: persist state → close app → reopen → state restored
- File watcher: add file → update event → spec tree updated → diagram updated
- Fallback: delete repo → restore session → show welcome instead

**E2E Smoke Tests (5% target)**:
- Full workflow: launch → add working dir → scan → select repo → select spec → adjust panels → close → reopen → everything restored
- Real-time updates: edit spec file in external editor → spec tree updates within 500ms

#### 1d.8 Definition of Done (Phase 1d)
- [ ] SessionManager fully implemented with debounced writes
- [ ] Session state persisted to SQLite on every meaningful action
- [ ] Session restoration on app launch with 100% accuracy
- [ ] Fallback behavior works: deleted items handled gracefully
- [ ] FileWatcher monitors specs/ folder for changes
- [ ] Spec tree and diagram update within 500ms when files change
- [ ] sessionStore fully implemented with all mutations
- [ ] useSessionRestoration hook works correctly on app mount
- [ ] MainLayout with 3 resizable panels (sidebar, flow, activity)
- [ ] ActivityPanel displays with quick actions and legend
- [ ] SettingsDialog enhanced with scan controls
- [ ] All UI sections render without console errors
- [ ] Unit tests pass with 80%+ coverage
- [ ] Integration tests: session restoration, file watcher
- [ ] E2E smoke test passes: full workflow from launch to restore
- [ ] Performance: no excessive IPC calls, debouncing works
- [ ] Code reviewed and approved
- [ ] **Feature complete and ready for QA**

---

## C. File Structure (Complete)

```
packages/shared/src/
├── models.ts                 # Repository, SpecFolder, PipelineStage, SessionState
├── ipc.ts                    # IPC request/response/event types
├── config.ts                 # ConfigSchema (Zod)
└── constants.ts              # Enums (RepoStatus, StageStatus, etc.)

packages/daemon/src/
├── db/
│   ├── schema.ts             # Drizzle schema (repos, working_dirs, session_state)
│   ├── DatabaseService.ts    # Singleton DB client
│   ├── migrations/
│   │   └── 0001_initial.ts
│   └── __tests__/
│       └── DatabaseService.test.ts
├── config/
│   ├── ConfigManager.ts      # Config load/save/validation
│   ├── configSchema.ts       # Zod schema
│   └── __tests__/
│       └── ConfigManager.test.ts
├── services/
│   ├── RepoScanner.ts        # Scan directories for repos
│   ├── RepoRepository.ts     # Repo data layer
│   ├── ScanQueue.ts          # Manage scan tasks
│   ├── SpecReader.ts         # Parse specs/ folder
│   ├── SessionManager.ts     # Persist/restore session
│   ├── FileWatcher.ts        # Watch specs/ folder (chokidar)
│   ├── GitClient.ts          # Wrapper around simple-git
│   └── __tests__/
│       ├── RepoScanner.test.ts
│       ├── SpecReader.test.ts
│       ├── SessionManager.test.ts
│       └── FileWatcher.test.ts
├── ipc/
│   ├── handlers/
│   │   ├── repoHandlers.ts   # repo:list, repo:scan
│   │   ├── specHandlers.ts   # spec:list
│   │   ├── sessionHandlers.ts # session:get, session:update
│   │   ├── configHandlers.ts # config:*
│   │   └── __tests__/
│   │       ├── repoHandlers.test.ts
│   │       └── specHandlers.test.ts
│   ├── validators.ts         # Zod IPC message validation
│   ├── registerHandlers.ts   # Central registration
│   └── IPCBridge.ts          # IPC abstraction
├── index.ts                  # Daemon entry point
└── __tests__/
    └── integration/
        ├── repoScan.integration.test.ts
        └── sessionPersistence.integration.test.ts

packages/ui/src/
├── renderer/
│   ├── store/
│   │   ├── repoStore.ts      # Zustand: repos, scanning
│   │   ├── specStore.ts      # Zustand: specs, selected spec
│   │   ├── sessionStore.ts   # Zustand: session state
│   │   ├── configStore.ts    # Zustand: config
│   │   ├── uiStateStore.ts   # Zustand: UI-only state
│   │   └── __tests__/
│   │       ├── repoStore.test.ts
│   │       ├── specStore.test.ts
│   │       └── sessionStore.test.ts
│   ├── pages/
│   │   ├── Welcome.tsx       # First-launch experience
│   │   ├── Main.tsx          # Main app container
│   │   └── __tests__/
│   │       └── Welcome.test.tsx
│   ├── components/
│   │   ├── layouts/
│   │   │   ├── MainLayout.tsx  # 3-panel layout
│   │   │   └── __tests__/
│   │   │       └── MainLayout.test.tsx
│   │   ├── sidebar/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── RepoList.tsx
│   │   │   ├── RepoItem.tsx
│   │   │   ├── RepoStatusBadge.tsx
│   │   │   ├── ScanProgress.tsx
│   │   │   ├── SpecTree.tsx
│   │   │   ├── SpecItem.tsx
│   │   │   ├── StageDots.tsx
│   │   │   └── __tests__/
│   │   │       ├── RepoList.test.tsx
│   │   │       └── SpecTree.test.tsx
│   │   ├── flow/
│   │   │   ├── FlowDiagram.tsx
│   │   │   ├── PipelineNode.tsx
│   │   │   ├── PipelineEdge.tsx (optional styling)
│   │   │   ├── nodeTypes.ts
│   │   │   ├── diagramUtils.ts
│   │   │   └── __tests__/
│   │   │       ├── FlowDiagram.test.tsx
│   │   │       └── diagramUtils.test.ts
│   │   ├── activity/
│   │   │   ├── ActivityPanel.tsx
│   │   │   ├── QuickActions.tsx
│   │   │   ├── Legend.tsx
│   │   │   └── __tests__/
│   │   │       └── ActivityPanel.test.tsx
│   │   ├── settings/
│   │   │   ├── SettingsDialog.tsx
│   │   │   ├── WorkingDirList.tsx
│   │   │   ├── AddWorkingDirButton.tsx
│   │   │   └── __tests__/
│   │   │       └── SettingsDialog.test.tsx
│   │   ├── common/
│   │   │   ├── EmptyState.tsx
│   │   │   ├── LoadingSpinner.tsx
│   │   │   ├── ErrorBoundary.tsx
│   │   │   └── ToastNotification.tsx
│   │   └── __tests__/
│   │       └── common/
│   │           └── ErrorBoundary.test.tsx
│   ├── hooks/
│   │   ├── useSessionRestoration.ts
│   │   ├── useFileWatcherUpdates.ts
│   │   └── __tests__/
│   │       └── useSessionRestoration.test.ts
│   ├── utils/
│   │   ├── ipc.ts            # IPC client abstraction
│   │   ├── formatting.ts     # Date, size, path formatting
│   │   └── __tests__/
│   │       └── formatting.test.ts
│   ├── App.tsx               # Root component
│   ├── index.tsx             # React entry point
│   ├── styles/
│   │   └── globals.css       # Tailwind + custom
│   └── __tests__/
│       ├── e2e/
│       │   ├── appLaunch.e2e.test.ts
│       │   ├── repoScan.e2e.test.ts
│       │   └── sessionRestoration.e2e.test.ts
│       └── integration/
│           ├── repoSelection.integration.test.tsx
│           └── specVisualization.integration.test.tsx

packages/main/src/
├── main.ts                   # Electron main process
├── preload.ts                # Preload script (IPC bridge)
└── __tests__/
    └── main.test.ts

root/
├── drizzle.config.ts         # Drizzle configuration
├── vitest.config.ts          # Vitest configuration
├── package.json
└── .env.example
```

---

## D. OOP Design Pattern & Architecture

### Daemon Services (Class-First)

All daemon business logic is organized into service classes with clear single responsibilities:

```typescript
// services/RepoScanner.ts - RESPONSIBILITY: Discover repos on disk
class RepoScanner {
  async scanDirectories(workingDirs: string[]): Promise<ScanResult> { }
}

// services/RepoRepository.ts - RESPONSIBILITY: Data access for repos
class RepoRepository {
  async findAll(): Promise<Repository[]> { }
  async upsert(repos: RepoData[]): Promise<Repository[]> { }
}

// services/SpecReader.ts - RESPONSIBILITY: Parse spec folder structure
class SpecReader {
  async readSpecs(repoPath: string): Promise<SpecFolder[]> { }
}

// services/SessionManager.ts - RESPONSIBILITY: Manage session persistence
class SessionManager {
  async getSessionState(): Promise<SessionState> { }
  async updateSessionState(updates: Partial<SessionState>): Promise<void> { }
}

// services/FileWatcher.ts - RESPONSIBILITY: Monitor spec folder changes
class FileWatcher {
  startWatching(repoPath: string): void { }
  stopWatching(): void { }
}

// db/DatabaseService.ts - RESPONSIBILITY: SQLite access (singleton)
class DatabaseService {
  static getInstance(): DatabaseService { }
  async query(sql: string, params: any[]): Promise<any[]> { }
}

// config/ConfigManager.ts - RESPONSIBILITY: Config load/save (singleton)
class ConfigManager {
  static getInstance(): ConfigManager { }
  getWorkingDirs(): string[] { }
  addWorkingDir(path: string): void { }
}
```

**IPC Handler Organization** (Thin adapters bridging classes to IPC protocol):

```typescript
// ipc/handlers/repoHandlers.ts
export function registerRepoHandlers(ipc: IPCBridge) {
  const scanner = new RepoScanner(gitClient, repoRepository);
  const queue = new ScanQueue(scanner, ipc);

  ipc.handle('repo:list', async () => {
    const repos = await repoRepository.findAll();
    return { type: 'repo:list:result', repos };
  });

  ipc.handle('repo:scan', async () => {
    await queue.enqueueScan(configManager.getWorkingDirs());
    return { type: 'repo:scan:started' };
  });
}
```

### Zustand Stores (State Management)

Each store manages a domain-specific slice of state:

```typescript
// store/repoStore.ts - Repos and scanning state
const useRepoStore = create<RepoStoreState>((set, get) => ({ ... }));

// store/specStore.ts - Specs and selected spec
const useSpecStore = create<SpecStoreState>((set, get) => ({ ... }));

// store/sessionStore.ts - Session persistence
const useSessionStore = create<SessionStoreState>((set, get) => ({ ... }));

// store/configStore.ts - Working directories
const useConfigStore = create<ConfigStoreState>((set, get) => ({ ... }));

// store/uiStateStore.ts - UI-only state (panels, tabs)
const useUIStateStore = create<UIStateStoreState>((set, get) => ({ ... }));
```

### React Component Organization

**Container Components** (orchestrate data and handlers):
```typescript
// components/layouts/MainLayout.tsx
export const MainLayout = () => {
  const repos = useRepoStore((s) => s.repos);
  const selectedSpec = useSpecStore((s) => s.selectedSpec);
  return (
    <div className="flex">
      <Sidebar repos={repos} />
      <FlowDiagram spec={selectedSpec} />
      <ActivityPanel />
    </div>
  );
};
```

**Presentational Components** (pure, no side effects):
```typescript
// components/sidebar/RepoItem.tsx
export const RepoItem = ({ repo, selected, onClick }) => (
  <div onClick={onClick} className={selected ? 'bg-blue-100' : ''}>
    <span>{repo.name}</span>
    <RepoStatusBadge status={repo.status} />
  </div>
);
```

**Hooks** (reusable logic):
```typescript
// hooks/useSessionRestoration.ts
export function useSessionRestoration() {
  const restoreSession = useSessionStore((s) => s.restoreSession);
  useEffect(() => {
    restoreSession();
  }, []);
}
```

### Data Flow (Uni-directional)

```
User Action (click repo)
    ↓
React Handler (onClick)
    ↓
Zustand Store Update (selectRepo)
    ↓
IPC Send (repo:selected)
    ↓
Daemon Receives (registerHandlers)
    ↓
Service Logic (FileWatcher.startWatching)
    ↓
IPC Emit (spec:list:updated)
    ↓
React Listener (ipc.on)
    ↓
Zustand Update (setSpecs)
    ↓
Component Re-render (useSpecStore selector)
```

---

## E. Task Breakdown (15 Implementable Tasks)

### Priority & Sequencing

**P0 (Critical Path)**: 1a-1, 1a-2, 1b-1, 1b-2, 1c-1, 1c-2, 1d-1  
**P1 (Core Features)**: 1b-3, 1b-4, 1c-3, 1c-4, 1d-2  
**P2 (Polish)**: 1a-4, 1b-5, 1d-3

### Tasks

#### Phase 1a Tasks

**Task 1a-1: SQLite Schema & DatabaseService (P0)**
- **Package**: daemon
- **Depends on**: None
- **Estimated LOC**: 400
- **Assigned to**: Backend Engineer A
- **Duration**: 3 days
- **Acceptance Criteria**:
  - [ ] Drizzle schema defined (repos, working_dirs, session_state tables)
  - [ ] DatabaseService class with singleton pattern
  - [ ] CRUD methods: getRepo, listRepos, createRepo, updateRepo, deleteRepo
  - [ ] Batch upsertRepos method
  - [ ] Transaction support
  - [ ] Unit tests: 85%+ coverage
  - [ ] Database initializes with correct constraints (unique, checks)

**Task 1a-2: ConfigManager & IPC Schema (P0)**
- **Package**: shared, daemon
- **Depends on**: Task 1a-1
- **Estimated LOC**: 250
- **Assigned to**: Backend Engineer A
- **Duration**: 2 days
- **Acceptance Criteria**:
  - [ ] ConfigManager singleton with load/save
  - [ ] ~/.magenta/config.json initialization on first run
  - [ ] Zod validation for config schema
  - [ ] Handles corrupt JSON gracefully
  - [ ] All IPC message types defined (shared/src/ipc.ts)
  - [ ] Zod validators for request/response messages
  - [ ] Unit tests pass

**Task 1a-3: Shared Models & Types (P1)**
- **Package**: shared
- **Depends on**: Task 1a-2
- **Estimated LOC**: 200
- **Assigned to**: Backend Engineer B
- **Duration**: 1 day
- **Acceptance Criteria**:
  - [ ] Repository, SpecFolder, PipelineStage, SessionState interfaces
  - [ ] Type exports available across daemon and UI packages
  - [ ] enums: RepoStatus, StageStatus
  - [ ] TypeScript compilation without errors

**Task 1a-4: Database Migrations & Error Handling (P2)**
- **Package**: daemon
- **Depends on**: Task 1a-1
- **Estimated LOC**: 300
- **Assigned to**: Backend Engineer B
- **Duration**: 2 days
- **Acceptance Criteria**:
  - [ ] Drizzle migration workflow set up
  - [ ] Migration for initial schema (0001_initial.ts)
  - [ ] Comprehensive error handling in DatabaseService
  - [ ] Connection pooling configured
  - [ ] WAL mode enabled for SQLite
  - [ ] Unit tests for error scenarios

---

#### Phase 1b Tasks

**Task 1b-1: RepoScanner & GitClient (P0)**
- **Package**: daemon
- **Depends on**: Task 1a-1, 1a-2
- **Estimated LOC**: 500
- **Assigned to**: Backend Engineer A
- **Duration**: 3 days
- **Acceptance Criteria**:
  - [ ] RepoScanner class scans directories recursively (max 3 levels)
  - [ ] Detects .git folders and reads metadata
  - [ ] GitClient wraps simple-git (get branch, check spec count)
  - [ ] Returns ScanResult (added, updated, missing repos)
  - [ ] Handles permission errors gracefully
  - [ ] Unit tests: 80%+ coverage
  - [ ] Scan completes in < 5 seconds for 100 repos

**Task 1b-2: ScanQueue & IPC Handlers (P0)**
- **Package**: daemon
- **Depends on**: Task 1b-1
- **Estimated LOC**: 350
- **Assigned to**: Backend Engineer B
- **Duration**: 2 days
- **Acceptance Criteria**:
  - [ ] ScanQueue manages background scan tasks
  - [ ] Progress events emitted every step
  - [ ] IPC handlers registered (repo:list, repo:scan, config:*)
  - [ ] Scan taskembeds start/progress/complete lifecycle
  - [ ] Unit tests: 80%+ coverage
  - [ ] Multiple listeners can subscribe to scan events

**Task 1b-3: Zustand RepoStore & IPC Client (P1)**
- **Package**: ui
- **Depends on**: Task 1b-2
- **Estimated LOC**: 250
- **Assigned to**: Frontend Engineer A
- **Duration**: 2 days
- **Acceptance Criteria**:
  - [ ] Zustand repoStore with repos, isScanning, selectedRepoPath
  - [ ] fetchRepos action sends repo:list IPC
  - [ ] triggerScan action sends repo:scan IPC
  - [ ] setupIPC listeners for progress/complete events
  - [ ] Store updates trigger component re-renders
  - [ ] Unit tests pass

**Task 1b-4: RepoList Sidebar Component (P1)**
- **Package**: ui
- **Depends on**: Task 1b-3
- **Estimated LOC**: 300
- **Assigned to**: Frontend Engineer A
- **Duration**: 3 days
- **Acceptance Criteria**:
  - [ ] RepoList component with virtual scrolling (react-window)
  - [ ] RepoItem shows name, branch, status badge, spec count
  - [ ] Click to select repo
  - [ ] ScanProgress bar during scanning
  - [ ] Empty state when no repos
  - [ ] Handles 1000+ repos smoothly
  - [ ] Component tests pass

**Task 1b-5: Settings Dialog & Welcome Screen (P2)**
- **Package**: ui
- **Depends on**: Task 1b-4
- **Estimated LOC**: 400
- **Assigned to**: Frontend Engineer B
- **Duration**: 3 days
- **Acceptance Criteria**:
  - [ ] SettingsDialog with working directory list
  - [ ] Add directory via native file picker
  - [ ] Remove directory functionality
  - [ ] "Scan Now" button triggers background scan
  - [ ] Shows last scan timestamp
  - [ ] Welcome screen on first launch
  - [ ] Welcome guides user to settings → add dir → scan
  - [ ] Component tests pass

---

#### Phase 1c Tasks

**Task 1c-1: SpecReader Service (P0)**
- **Package**: daemon
- **Depends on**: Task 1b-1
- **Estimated LOC**: 400
- **Assigned to**: Backend Engineer C
- **Duration**: 3 days
- **Acceptance Criteria**:
  - [ ] SpecReader class reads specs/ folder
  - [ ] Detects all five stages (constitution, spec, plan, tasks, implementation)
  - [ ] Parses task.md checkboxes for completion %
  - [ ] Reads implementation/progress.json
  - [ ] Returns SpecFolder[] with stage status
  - [ ] Handles missing specs/ folder gracefully
  - [ ] Unit tests: 80%+ coverage

**Task 1c-2: SpecTree Sidebar Component (P0)**
- **Package**: ui
- **Depends on**: Task 1b-4
- **Estimated LOC**: 300
- **Assigned to**: Frontend Engineer B
- **Duration**: 2 days
- **Acceptance Criteria**:
  - [ ] SpecTree lists spec folders for selected repo
  - [ ] SpecItem shows name and 5 progress dots
  - [ ] Dots filled (stages exist) vs hollow (missing)
  - [ ] Click spec to select
  - [ ] Empty state when no specs in repo
  - [ ] Component tests pass

**Task 1c-3: React Flow Diagram Component (P0)**
- **Package**: ui
- **Depends on**: Task 1c-1, 1c-2
- **Estimated LOC**: 500
- **Assigned to**: Frontend Engineer C
- **Duration**: 4 days
- **Acceptance Criteria**:
  - [ ] FlowDiagram renders five nodes (Constitution → Spec → Plan → Tasks → Implementation)
  - [ ] PipelineNode custom component with status-based colors
  - [ ] Edges connect nodes with animation when stage exists
  - [ ] Pan, zoom, fit-to-view controls work
  - [ ] Progress bars on Tasks node (task counts)
  - [ ] Progress on Implementation node (from progress.json)
  - [ ] Mini-map displays
  - [ ] Component tests pass
  - [ ] Renders without lag for all spec states

**Task 1c-4: Zustand SpecStore & IPC Handler (P1)**
- **Package**: ui, daemon
- **Depends on**: Task 1c-1
- **Estimated LOC**: 200
- **Assigned to**: Frontend Engineer C
- **Duration**: 2 days
- **Acceptance Criteria**:
  - [ ] specStore manages specs list, selected spec, diagram nodes/edges
  - [ ] fetchSpecs action triggers spec:list IPC
  - [ ] IPC handler for spec:list implemented in daemon
  - [ ] buildDiagramData utility creates nodes/edges layout
  - [ ] Unit tests pass

---

#### Phase 1d Tasks

**Task 1d-1: SessionManager & Session Persistence (P0)**
- **Package**: daemon, ui
- **Depends on**: Task 1a-1
- **Estimated LOC**: 350
- **Assigned to**: Backend Engineer C
- **Duration**: 3 days
- **Acceptance Criteria**:
  - [ ] SessionManager singleton manages session state
  - [ ] Debounced writes (500ms) to DB
  - [ ] Session sanitization (validate selected items exist)
  - [ ] IPC handlers for session:get and session:update
  - [ ] Zustand sessionStore for UI state management
  - [ ] useSessionRestoration hook on app mount
  - [ ] Unit tests: 80%+ coverage
  - [ ] Session restored on relaunch

**Task 1d-2: FileWatcher & Real-Time Spec Updates (P0)**
- **Package**: daemon
- **Depends on**: Task 1c-1
- **Estimated LOC**: 300
- **Assigned to**: Backend Engineer C
- **Duration**: 2 days
- **Acceptance Criteria**:
  - [ ] FileWatcher class uses chokidar to watch specs/ folder
  - [ ] Detects create/edit/delete events
  - [ ] Debounces rapid changes (300ms)
  - [ ] Emits spec:list:updated IPC event
  - [ ] Gracefully handles when watching folder doesn't exist
  - [ ] Unit tests pass

**Task 1d-3: Activity Panel & Main Layout (P1)**
- **Package**: ui
- **Depends on**: Task 1b-5, 1c-3
- **Estimated LOC**: 350
- **Assigned to**: Frontend Engineer B
- **Duration**: 2 days
- **Acceptance Criteria**:
  - [ ] MainLayout with 3 resizable panels (sidebar, flow, activity)
  - [ ] ActivityPanel displays quick actions, agent status placeholder, legend
  - [ ] QuickActions buttons for New spec, View diff, Run queued, Pause agents
  - [ ] Legend shows all stage statuses with colors
  - [ ] ResizablePanel dividers work smoothly
  - [ ] Panel widths persisted via sessionStore
  - [ ] Component tests pass

**Task 1d-4: Real-Time UI Updates & Fallback Handling (P1)**
- **Package**: ui
- **Depends on**: Task 1d-2
- **Estimated LOC**: 250
- **Assigned to**: Frontend Engineer A
- **Duration**: 2 days
- **Acceptance Criteria**:
  - [ ] useFileWatcherUpdates hook listens to spec:list:updated events
  - [ ] Spec tree and diagram update within 500ms
  - [ ] Fallback if repo deleted: show welcome screen
  - [ ] Fallback if spec deleted: show repo spec list
  - [ ] Fallback if file deleted: show spec diagram
  - [ ] Component tests pass
  - [ ] No console errors on updates

---

### Task Dependency Graph

```
Phase 1a:
1a-1 (Schema & DB)
  ↓
1a-2 (ConfigManager & IPC Schema)
  ↓
1a-3, 1a-4 (Models & Migrations)

Phase 1b (Parallel independent tracks):
1b-1 (RepoScanner) ← depends 1a-1, 1a-2
  ↓
1b-2 (ScanQueue) ← depends 1b-1
  ↓ (Parallel)
  1b-3 (RepoStore) ← depends 1b-2
    ↓
    1b-4 (RepoList UI) ← depends 1b-3
      ↓ (Parallel)
      1b-5 (Settings & Welcome) ← depends 1b-4

Phase 1c (Parallel, depends on Phase 1b completion):
1c-1 (SpecReader) ← depends 1b-1
1c-2 (SpecTree) ← depends 1b-4
  ↓
1c-3 (React Flow) ← depends 1c-1, 1c-2
  ↓
1c-4 (SpecStore & IPC) ← depends 1c-1

Phase 1d (Parallel, depends on Phase 1c completion):
1d-1 (SessionManager) ← depends 1a-1
1d-2 (FileWatcher) ← depends 1c-1
1d-3 (Activity Panel) ← depends 1b-5, 1c-3
1d-4 (Real-Time UI) ← depends 1d-2
```

### Parallel Work Opportunities

- **Week 2-3**: 1a-1, 1a-2 (serial) + 1a-3, 1a-4 (parallel after 1a-2)
- **Week 3-4**: 1b-1, 1b-2 (serial) in parallel with 1b-3, 1b-4, 1b-5
- **Week 5-6**: 1c-1, 1c-3, 1c-4 (mostly parallel after 1b completion)
- **Week 7-8**: 1d-1, 1d-2, 1d-3, 1d-4 (parallel)

---

## F. Risk Mitigation

### Critical Risk 1: SQLite Concurrency Issues
**Risk**: Multiple IPC calls writing to SQLite simultaneously → corruption or lock contention  
**Severity**: High  
**Mitigation**:
- Use SQLite WAL (Write-Ahead Logging) mode for concurrent readers + writer
- Implement transaction wrapper in DatabaseService for consistency
- Test concurrent writes (repo scan + session update simultaneously) early
- Monitor for SQLITE_BUSY errors in production builds
- **Contingency**: Fall back to in-memory cache during scan if DB locks for > 1s

### Critical Risk 2: File Watcher Lag During Large Spec Changes
**Risk**: Chokidar delays detecting large batch file operations → UI out of sync  
**Severity**: Medium  
**Mitigation**:
- Implement debouncing in FileWatcher (300ms coalesce window)
- Periodically re-scan specs/ folder every 60s even without file events
- Show "Last updated" timestamp so users see refresh happened
- **Contingency**: Provide manual "Refresh specs" button in UI

### Critical Risk 3: Session Restoration Fallback Complexity
**Risk**: Deleted repos/specs → complex validation logic → edge cases missed  
**Severity**: Medium  
**Mitigation**:
- Build sanitizeSession function early; test exhaustively in Phase 1d
- Define clear fallback rules in specification (avoid surprises)
- Write integration tests for all fallback scenarios
- Log all fallback events for debugging
- **Contingency**: If fallback fails, show welcome screen (safe default)

### Critical Risk 4: Large Directory Scans Block UI
**Risk**: Scanning 1000+ repos on first run → app appears frozen  
**Severity**: Medium  
**Mitigation**:
- Emit progress events every repo found (not batch)
- Render cached DB results immediately (before scan starts)
- Run scan in daemon process (not UI thread) — guaranteed by architecture
- Test with 1000+ repo dataset early (Phase 1b)
- **Contingency**: Add cancel scan button if scan takes > 30s

### Risk 5: IPC Message Validation Failures
**Risk**: Malformed IPC messages from daemon crash renderer  
**Severity**: Medium  
**Mitigation**:
- Validate all IPC messages with Zod on both sides
- Implement error boundary in React
- Log IPC errors to file for debugging
- Return error responses instead of throwing
- **Contingency**: App shows error toast but doesn't crash

### Risk 6: Performance: Panel Resizing Lag
**Risk**: ResizablePanel dividers feel unresponsive  
**Severity**: Low  
**Mitigation**:
- Use CSS transforms for immediate visual feedback
- Debounce sessionStore persistence (500ms)
- Profile with React DevTools Profiler
- Lazy-load UI sections if needed
- **Contingency**: Provide fixed layout option in settings

### Risk 7: Complex IPC Handler Registration
**Risk**: Register many handlers → spaghetti code → maintenance nightmare  
**Severity**: Low  
**Mitigation**:
- Centralize IPC handler registration in registerHandlers.ts
- Group handlers by domain (repoHandlers, specHandlers, etc.)
- Document IPC contract clearly
- Use TypeScript to enforce request/response shapes
- **Contingency**: Refactor into cleaner abstraction if > 20 handlers

---

## G. Testing Strategy

### Testing Philosophy
- **Unit**: 75% of tests — fast, isolated, implementation details
- **Integration**: 20% of tests — cross-service boundaries, real SQLite
- **E2E**: 5% of tests — smoke tests, critical user workflows

### Unit Testing (75% target)

**Backend Services**:
```typescript
// test/db/DatabaseService.test.ts
describe('DatabaseService', () => {
  it('should create repo with unique path', () => { });
  it('should upsert multiple repos in transaction', () => { });
  it('should handle concurrent writes without corruption', () => { });
});

// test/services/RepoScanner.test.ts
describe('RepoScanner', () => {
  it('should detect .git folders recursively', () => { });
  it('should read git branch from repo', () => { });
  it('should return added/updated/missing repos', () => { });
});

// test/services/SpecReader.test.ts
describe('SpecReader', () => {
  it('should parse all five pipeline stages', () => { });
  it('should extract task completion percentage', () => { });
  it('should return empty array for missing specs/ folder', () => { });
});
```

**Frontend Stores & Hooks**:
```typescript
// test/store/repoStore.test.ts
describe('repoStore', () => {
  it('should fetch repos via IPC', () => { });
  it('should emit scan progress events', () => { });
});

// test/hooks/useSessionRestoration.test.ts
describe('useSessionRestoration', () => {
  it('should restore session on mount', () => { });
  it('should handle missing session gracefully', () => { });
});
```

**UI Components**:
```typescript
// test/components/RepoList.test.tsx
describe('RepoList', () => {
  it('should render repos with virtual scrolling', () => { });
  it('should handle click to select repo', () => { });
  it('should show empty state when no repos', () => { });
});
```

### Integration Testing (20% target)

**Daemon → DB → Renderer**:
```typescript
// test/integration/repoScan.integration.test.ts
describe('Repo Scan Integration', () => {
  it('should scan dirs → store in DB → fetch via IPC', async () => {
    // 1. Scan directories with RepoScanner
    // 2. Verify repos in DB
    // 3. Call repo:list IPC handler
    // 4. Verify returned repos match DB
  });

  it('should mark repos as missing when deleted', async () => {
    // 1. Scan dirs, store in DB
    // 2. Delete repo from disk
    // 3. Rescan
    // 4. Verify status = 'missing' in DB
  });
});

// test/integration/sessionPersistence.integration.test.ts
describe('Session Persistence Integration', () => {
  it('should persist and restore full session', async () => {
    // 1. Select repo, spec, file
    // 2. Resize panels
    // 3. Call session:update IPC
    // 4. Close app simulation
    // 5. Call session:get IPC
    // 6. Verify all state restored
  });
});

// test/integration/repoSelection.integration.test.tsx
describe('Repo Selection Integration', () => {
  it('should sync repo selection across processes', async () => {
    // Renderer: select repo
    // Daemon: receive via IPC, start file watcher
    // Renderer: receive spec:list:updated via file watcher listener
    // Verify spec tree updated
  });
});
```

### E2E Smoke Tests (5% target)

```typescript
// test/e2e/appLaunch.e2e.test.ts
describe('App Launch Flow', () => {
  it('should show welcome screen on first launch', async () => {
    // Fresh install: launch app
    // Verify welcome screen displayed
  });

  it('should show repos from previous scan', async () => {
    // Login (if any): simulate previous session
    // Launch app
    // Verify repos appear instantly (< 100ms)
  });
});

// test/e2e/repoScan.e2e.test.ts
describe('Repo Scan Workflow', () => {
  it('should add working dir, scan, see repos in sidebar', async () => {
    // Launch app
    // Open settings
    // Add working directory via file picker
    // Verify scan triggered
    // Verify repos appear in sidebar after scan completes
  });
});

// test/e2e/sessionRestoration.e2e.test.ts
describe('Session Restoration Workflow', () => {
  it('should restore selected repo/spec/file after relaunch', async () => {
    // Launch app
    // Select repo, spec folder
    // Resize panels to custom widths
    // Close app
    // Relaunch app
    // Verify repo selected, spec displayed, panel widths restored
  });
});
```

### Test Infrastructure

**Vitest Configuration**:
```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom', // for UI tests
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      lines: 75,      // Unit: 75%
      functions: 75,
      branches: 70,
      statements: 75,
    },
    include: ['**/*.test.ts', '**/*.test.tsx'],
  },
});
```

**Test Database Setup** (isolated SQLite per test):
```typescript
// test/setup.ts
import Database from 'better-sqlite3';

beforeEach(() => {
  // Create in-memory DB for each test
  const db = new Database(':memory:');
  // Run schema
  // Make available to test
});

afterEach(() => {
  // Cleanup
});
```

**Mock IPC Bridge**:
```typescript
// test/mocks/ipc.mock.ts
export const mockIPC = {
  send: vi.fn().mockResolvedValue({ type: 'response' }),
  on: vi.fn(),
  off: vi.fn(),
};
```

### Coverage Targets by Phase

| Phase | Unit | Integration | E2E | Total |
|-------|------|-------------|-----|-------|
| 1a | 85% | 10% | 5% | 100% |
| 1b | 80% | 15% | 5% | 100% |
| 1c | 80% | 15% | 5% | 100% |
| 1d | 75% | 20% | 5% | 100% |

---

## H. Success Checkpoints & Demo Readiness

### Phase 1a Checkpoint (Week 2)

**Definition of Done**:
- [ ] SQLite schema created with all tables
- [ ] DatabaseService fully functional (CRUD, transactions)
- [ ] ConfigManager loads/saves ~/.magenta/config.json
- [ ] All IPC message types defined with Zod validation
- [ ] Unit tests pass with 85%+ coverage
- [ ] No TypeScript errors
- [ ] Database file persists across daemon restarts
- [ ] Code reviewed by tech lead

**Sign-Off**: Backend tech lead

**Demo Readiness**: Not ready (foundation only, no UI)

---

### Phase 1b Checkpoint (Week 4)

**Definition of Done**:
- [ ] RepoScanner fully implemented and tested
- [ ] ScanQueue manages background tasks correctly
- [ ] IPC handlers for repo operations respond correctly
- [ ] Zustand repoStore fully functional
- [ ] RepoList sidebar component renders and updates
- [ ] SettingsDialog allows add/remove working directories
- [ ] Scan completes in < 5 seconds for < 100 repos
- [ ] Virtual scrolling supports 1000+ repos
- [ ] Unit tests pass with 80%+ coverage
- [ ] Integration tests: scan → DB → UI pass
- [ ] E2E smoke test passes: add dir → scan → see repos
- [ ] No console errors during repo operations
- [ ] Code reviewed

**Sign-Off**: Frontend + Backend tech leads

**Demo Script**:
1. Launch app → show welcome screen
2. Open settings → add working directory
3. Wait for scan to complete (< 5 seconds)
4. Verify repos appear in sidebar with metadata
5. Scroll through 100+ repos (verify smoothness)
6. Verify status badges (active, missing, archived)

**Demo Readiness**: **Ready for internal demo**

---

### Phase 1c Checkpoint (Week 6)

**Definition of Done**:
- [ ] SpecReader fully implemented and tested
- [ ] All five pipeline stages detected correctly
- [ ] Task completion percentage calculated
- [ ] React Flow diagram renders all spec states
- [ ] Node colors match status (missing/draft/review/approved/running)
- [ ] Diagram controls work (pan, zoom, fit-to-view)
- [ ] SpecTree sidebar lists specs with progress dots
- [ ] Integration: select repo → see specs → click spec → see diagram
- [ ] Unit tests pass with 80%+ coverage
- [ ] Integration tests: spec parsing → diagram rendering pass
- [ ] E2E smoke test passes: full browsing workflow
- [ ] No console errors during spec visualization
- [ ] Code reviewed

**Sign-Off**: Frontend + Backend tech leads

**Demo Script**:
1. (From Phase 1b state) Repo selected in sidebar
2. SpecTree shows spec folders with progress dots
3. Click on spec → React Flow diagram appears
4. Show diagram with mixed stages (some missing, some approved, some running)
5. Demonstrate pan, zoom, fit-to-view controls
6. Hover over Task node → see task count and progress bar
7. Hover over Implementation node → see progress from progress.json
8. Verify responsive and smooth

**Demo Readiness**: **Ready for external beta demo (core features)**

---

### Phase 1d Checkpoint (Week 8 - Feature Complete)

**Definition of Done**:
- [ ] SessionManager persists and restores session state
- [ ] Session writes debounced (500ms) → no excessive DB churn
- [ ] Fallback handling works: deleted items handled gracefully
- [ ] File watcher monitors specs/ folder
- [ ] Spec tree and diagram update within 500ms of file changes
- [ ] ActivityPanel displays with quick actions and legend
- [ ] MainLayout with 3 resizable panels
- [ ] Panel widths persisted and restored
- [ ] SettingsDialog enhanced with scan controls
- [ ] Welcome screen optimized
- [ ] Unit tests pass with 75%+ coverage
- [ ] Integration tests: session persistence, real-time updates pass
- [ ] E2E smoke test passes: full app workflow (launch → navigate → close → restore)
- [ ] Performance optimized: no lag, responsive UI
- [ ] All console errors eliminated
- [ ] Code reviewed and approved

**Sign-Off**: Product Manager + Tech Lead + QA Lead

**[Full Workflow Demo Script]**:

1. **First Launch Experience**:
   - Launch app → welcome screen
   - Verify no errors in console
   
2. **Repository Scanning**:
   - Open settings
   - Add working directory (~/projects)
   - Scan triggers automatically
   - Repos appear in sidebar within 5 seconds
   - Verify metadata (branch, status badge, spec count)

3. **Spec Browsing**:
   - Select repo → SpecTree loads
   - Click spec folder → React Flow diagram appears
   - Diagram shows all stages with correct colors
   - Interact with diagram (pan, zoom, fit)

4. **Session Persistence**:
   - In sidebar, select different repo
   - Select spec folder
   - Resize panels to custom widths
   - Close app (Command+Q)
   - Relaunch app
   - Verify: same repo selected, same spec displayed, panel widths restored

5. **Real-Time Updates**:
   - While app is open, edit spec files externally (VS Code)
   - Create new spec file (e.g., spec.md in a missing stage)
   - SpecTree and diagram update within 500ms
   - No page reload needed

6. **Fallback Behavior**:
   - Delete selected repo from disk
   - Close and relaunch app
   - Verify: welcome screen shown, no errors
   - Add working dir again → scan → repos reappear

7. **Settings Management**:
   - Open settings
   - Show working directories list
   - Click "Scan Now"
   - Verify scan completes and results update
   - Remove a working directory
   - Verify repos from that dir disappear

8. **UI Polish**:
   - Verify all transitions smooth
   - Verify no console errors (DevTools clean)
   - Verify loading states (spinners, progress bars)
   - Verify error messages user-friendly
   - Verify responsive layout (resize window, panels adapt)

**Demo Readiness**: **Ready for production launch (MVP-1)**

---

## I. Deployment & Release Strategy

### Release Checklist

- [ ] All tests pass (unit, integration, E2E)
- [ ] Code coverage at target (75%+ unit, 20% integration, 5% E2E)
- [ ] Performance benchmarks met (scan < 5s, updates < 500ms, IPC < 200ms)
- [ ] Security audit: no hardcoded secrets, SQL injection risks, XSS vulnerabilities
- [ ] Accessibility check: keyboard navigation, screen reader compatibility
- [ ] Documentation complete: README, API docs, user guide
- [ ] Changelog written detailing features, fixes, breaking changes
- [ ] Version bumped (semantic versioning: 0.1.0 for MVP-1)
- [ ] Release branch created (release/0.1.0)
- [ ] Release notes prepared for GitHub
- [ ] Packaging verified (Electron build, dmg/exe/AppImage)

### Distribution Package

**DMG (macOS)**:
```bash
magenta-ide-0.1.0-x64.dmg
```

**EXE (Windows)**:
```bash
magenta-ide-0.1.0-x64.exe
magenta-ide-0.1.0-setup.exe
```

**AppImage (Linux)**:
```bash
magenta-ide-0.1.0-x64.AppImage
```

### Post-Launch Monitoring

**Metrics to Track**:
- App crash rate (target: < 0.1%)
- Startup time (target: < 1 second)
- Scan duration (target: < 5 seconds for 100 repos)
- IPC latency (target: < 200ms)
- UI frame rate (target: 60fps)
- Database corruption incidents (target: 0)

**Feedback Channels**:
- GitHub Issues (bug reports)
- Slack #feedback channel (feature requests)
- Weekly user sync (early adopters)

### Hotfix Strategy

If critical bugs discovered post-launch:
1. Create hotfix branch from release branch
2. Fix, test exhaustively
3. Bump patch version (0.1.1)
4. Release as hotfix version
5. Document in changelog

---

## J. Implementation Timeline

### Week-by-Week Breakdown

| Week | Phase | Focus | Deliverable |
|------|-------|-------|-------------|
| W1 | Setup | Project scaffolding, CI/CD | Repo ready, CI passing |
| W2 | 1a | Database, ConfigManager | SQLite + Drizzle working |
| W3 | 1a-1b | RepoScanner, ScanQueue | Backend services tested |
| W4 | 1b | UI integration, sidebar | RepoList component working |
| W5 | 1b-1c | SpecReader, specs parsing | Specs loading correctly |
| W6 | 1c | React Flow diagram | Diagram rendering & interactive |
| W7 | 1d | Session state, real-time | File watcher working |
| W8 | 1d | Polish, optimization | All features complete |
| W9 | QA | Testing, bug fix | Feature frozen |
| W10 | Release | Packaging, release | MVP-1 launched |

### Resource Allocation

**Backend (Daemon Services)**:
- Senior Backend Engineer A (Weeks 1-8)
- Mid-level Backend Engineer B (Weeks 2-8)
- Senior Backend Engineer C (Weeks 4-8)

**Frontend (UI)**:
- Senior Frontend Engineer (Weeks 1-8, tech lead)
- Mid-level Frontend Engineer A (Weeks 3-8)
- Mid-level Frontend Engineer B (Weeks 4-8)

**QA**:
- QA Engineer (Weeks 6-9)

**DevOps**:
- DevOps Engineer (Weeks 1-2, 9-10)

**Product**:
- Product Manager (Weeks 1-10, guide)
- Tech Lead (Weeks 1-10, architecture review)

---

## K. Glossary & Key Definitions

| Term | Definition |
|------|-----------|
| **Repository** | A git-tracked project directory (.git folder) |
| **Spec Folder** | Subdirectory in `specs/` containing stage files |
| **Pipeline Stage** | One of five stages: Constitution, Spec, Plan, Tasks, Implementation |
| **Stage Status** | missing, draft, review, approved, running |
| **Session State** | User's UI context: selected repo, spec, file, panel sizes |
| **Daemon Process** | Node.js backend process running background services |
| **Renderer Process** | React UI running in Electron's renderer thread |
| **IPC** | Inter-Process Communication (Electron messages) |
| **WAL Mode** | Write-Ahead Logging (SQLite concurrency mode) |
| **Debounce** | Delay repeated operations (e.g., session writes) |

---

## L. Appendix: Code Examples & Utilities

### IPC Client Utility (packages/ui/src/utils/ipc.ts)

```typescript
type RequestMessage = IPCRequest;
type ResponseMessage = IPCResponse;

export const ipc = {
  send: async (request: RequestMessage): Promise<any> => {
    return new Promise((resolve, reject) => {
      const eventId = `response_${Date.now()}_${Math.random()}`;

      const timeout = setTimeout(() => {
        window.electron.ipc.off(eventId, listener);
        reject(new Error(`IPC timeout for ${request.type}`));
      }, 5000);

      const listener = (response: ResponseMessage) => {
        clearTimeout(timeout);
        window.electron.ipc.off(eventId, listener);
        if (response.type?.startsWith('error')) {
          reject(new Error(response.message || 'Unknown error'));
        } else {
          resolve(response);
        }
      };

      window.electron.ipc.on(eventId, listener);
      window.electron.ipc.send('ipc:request', { ...request, eventId });
    });
  },

  on: (eventType: string, callback: (data: any) => void) => {
    window.electron.ipc.on(eventType, callback);
  },

  off: (eventType: string, callback: (data: any) => void) => {
    window.electron.ipc.off(eventType, callback);
  },
};
```

### Testing Factory: Create Mock Repositories

```typescript
// test/factories/repoFactory.ts
import { Repository } from '@shared/models';
import { ulid } from 'ulidx';

export function createMockRepo(overrides?: Partial<Repository>): Repository {
  return {
    id: ulid(),
    name: 'sample-repo',
    path: '/Users/test/projects/sample-repo',
    branch: 'main',
    hasSpecs: true,
    specCount: 5,
    status: 'active',
    scannedAt: Date.now(),
    createdAt: Date.now() - 86400000,
    ...overrides,
  };
}

export function createMockRepoList(count = 10): Repository[] {
  return Array.from({ length: count }, (_, i) =>
    createMockRepo({
      name: `repo-${i}`,
      path: `/Users/test/projects/repo-${i}`,
    })
  );
}
```

---

## Final Notes

This implementation plan provides a detailed roadmap for delivering the Kick-Start Feature across 4 phases. The architecture prioritizes **class-first OOP** in daemon services, clean **separation of concerns**, and **incremental value delivery** at each phase boundary.

**Key Success Factors**:
1. Strict adherence to OOP (no module-level procedures in daemon)
2. Comprehensive testing at each phase (75% unit, 20% integration, 5% E2E)
3. Real-time feedback loops (file watcher, IPC events)
4. User workflow preservation (session state persistence)
5. Graceful error handling and fallbacks

The plan is designed to be executed by a distributed team with clear task assignments, dependencies, and success criteria at each milestone.
