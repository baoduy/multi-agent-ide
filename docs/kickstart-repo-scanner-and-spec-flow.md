# Kick-Start Feature — Repo Scanner & Spec Flow Diagram

> Scan user-provided directories for git repos, persist them in SQLite, display specs from a folder convention, and render a node-based pipeline diagram using React Flow.

## Overview

This is the first working feature of Magenta IDE. It covers three connected capabilities:

1. **Repo Scanner** — Scan working directories for git repositories, store results in SQLite, background re-sync on launch
2. **Spec Explorer** — When a repo is selected, read its `specs/` folder and list spec folders/files
3. **Spec Flow Diagram** — When a spec folder is clicked, render a React Flow node diagram showing the pipeline stages (Constitution → Spec → Plan → Tasks → Implementation), auto-detected from the folder contents

---

## Data Architecture

All application metadata lives in SQLite at `~/.magenta/magenta.db`. User configuration is a simple JSON file at `~/.magenta/config.json`. The config file stores only user preferences (like `workingDirs`); everything derived from scanning lives in the database.

```
~/.magenta/
├── config.json          ← User configuration (workingDirs, preferences)
├── magenta.db           ← SQLite database (repos, specs, app metadata)
└── logs/                ← Application logs
```

### Config File: `~/.magenta/config.json`

```json
{
  "workingDirs": [
    "~/projects",
    "~/work",
    "/opt/repos"
  ]
}
```

The config file is intentionally minimal. `workingDirs` is the list of root directories the user has added for scanning. Everything else (scanned repos, spec metadata, agent state) is derived and stored in SQLite.

### SQLite Database: `~/.magenta/magenta.db`

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

-- Scan source directories (denormalized from config for query convenience)
CREATE TABLE working_dirs (
  id    TEXT PRIMARY KEY,  -- ulid
  path  TEXT NOT NULL UNIQUE
);

-- Session state: remembers where the user left off
-- Single row table (key-value would also work, but typed columns are clearer)
CREATE TABLE session_state (
  id                   INTEGER PRIMARY KEY CHECK (id = 1),  -- enforce single row
  selected_repo_path   TEXT,        -- path of the currently selected repo (FK to repos.path)
  selected_spec_path   TEXT,        -- absolute path of the selected spec folder
  selected_file_path   TEXT,        -- absolute path of the selected file within the spec
  sidebar_width        INTEGER,     -- persisted sidebar panel width in pixels
  activity_panel_width INTEGER,     -- persisted right panel width in pixels
  activity_panel_open  INTEGER DEFAULT 1,  -- boolean: right panel expanded or collapsed
  main_tab             TEXT DEFAULT 'flow', -- active tab in main panel: flow | editor | worktrees
  updated_at           INTEGER NOT NULL     -- last update timestamp
);
```

### Session State Persistence

The `session_state` table captures the user's navigation context so the app can restore it on next launch. It is a **single-row table** (enforced by `CHECK (id = 1)`) — every write is an `UPDATE`, never an `INSERT` after initialization.

**Save triggers** — session state is written to DB:
- When user selects a repo
- When user selects a spec folder or file
- When user resizes panels
- When user switches tabs
- On app quit (final flush)

Writes are **debounced** (500ms) to avoid excessive DB churn during rapid panel resizing.

**Restore logic on app launch:**

```
App Launch
    │
    ▼
Read session_state from DB
    │
    ├── selected_repo_path exists on disk?
    │     ├── YES → select repo in sidebar
    │     │         └── selected_spec_path exists on disk?
    │     │               ├── YES → open spec flow diagram
    │     │               │         └── selected_file_path exists?
    │     │               │               ├── YES → open file
    │     │               │               └── NO  → show flow diagram only
    │     │               └── NO  → show repo spec list
    │     └── NO  → clear stale state, show welcome screen
    │
    └── No session_state row → show welcome screen
```

**Fallback behavior:** If the selected repo, spec, or file has been deleted since last session, the app gracefully falls back to the nearest valid ancestor. If the repo itself is gone, it falls back to the welcome screen. Stale paths are cleared from the DB to avoid repeated fallback on future launches.

### Background Scan Lifecycle

```
App Launch
    │
    ▼
┌─────────────────────────────┐
│ 1. Load repos from SQLite   │  ← Instant: UI renders cached repo list
│    (show immediately in UI) │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ 2. Background scan starts   │  ← Non-blocking: daemon scans workingDirs
│    - Walk each workingDir   │
│    - Detect .git folders    │
│    - Compare with DB        │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ 3. Sync DB with scan result │
│    - New repos → INSERT     │
│    - Existing → UPDATE      │
│      (branch, has_specs,    │
│       spec_count, scanned_at│
│    - Missing → status =     │
│      'missing' (not DELETE) │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│ 4. Push update to UI        │  ← IPC: repo:scan:complete
│    UI diffs and re-renders  │
└─────────────────────────────┘
```

Key design decisions:
- **Instant UI on launch**: Repos load from SQLite cache immediately. No waiting for scan.
- **Non-destructive sync**: Repos that no longer exist on disk are marked `status = 'missing'`, not deleted. User can still see history and re-scan later if the drive is remounted.
- **Idempotent**: Scanning the same directory twice produces the same DB state.

---

## Spec Folder Convention

Each repository may contain a `specs/` directory at its root. Inside `specs/`, each subdirectory represents one spec (feature, epic, or project). The diagram stages are **auto-detected** based on which files/folders exist:

```
my-repo/
└── specs/
    ├── rewrite-rust-proxy/
    │   ├── constitution.md       → Constitution node (detected)
    │   ├── spec.md               → Spec node (detected)
    │   ├── plan.md               → Plan node (detected)
    │   ├── tasks.md              → Tasks node (detected, parse for task count)
    │   └── implementation/       → Implementation node (detected)
    │       ├── .worktrees/
    │       └── progress.json     → Optional: { "completed": 63, "total": 172 }
    ├── rate-limiting/
    │   ├── spec.md
    │   └── plan.md
    └── circuit-breaker/
        └── spec.md
```

### Stage Detection Rules

| File/Folder | Stage | Status Logic |
|-------------|-------|-------------|
| `constitution.md` | Constitution | `draft` if < 50 chars, `review` if present with content, `approved` if tasks.md also exists |
| `spec.md` | Spec | `draft` if < 50 chars, `review` if present with content, `approved` if plan.md also exists |
| `plan.md` | Plan | `draft` if < 50 chars, `review` if present with content, `approved` if tasks.md also exists |
| `tasks.md` | Tasks | `review` if present. Parse `- [ ]` and `- [x]` checkboxes for counts |
| `implementation/` | Implementation | `idle` if dir empty or missing. `running` if worktrees active. Progress from `progress.json` or task checkbox ratio |

### Status Colors

| Status | Color | Meaning |
|--------|-------|---------|
| `missing` | Gray, dashed border | Stage file doesn't exist yet |
| `draft` | Gray, solid border | File exists but minimal content |
| `review` | Orange border | Content present, needs review |
| `approved` | Green border | Stage complete, downstream stage exists |
| `idle` | Gray border | Implementation not started |
| `running` | Blue border + pulse | Agents actively working |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Electron Shell                          │
│                                                              │
│  ┌──────────────┐  ┌──────────────────────┐  ┌───────────┐ │
│  │   Sidebar     │  │    Main Panel         │  │  Activity │ │
│  │              │  │                      │  │  Panel    │ │
│  │  REPOSITORIES│  │  ┌────────────────┐  │  │           │ │
│  │  ○ repo-a    │  │  │  React Flow    │  │  │  Agent    │ │
│  │  ● repo-b    │  │  │  Diagram       │  │  │  Activity │ │
│  │  ○ repo-c    │  │  │                │  │  │           │ │
│  │              │  │  │  [Const]──►    │  │  │  Quick    │ │
│  │  SPECS       │  │  │  [Spec]──►     │  │  │  Actions  │ │
│  │  ▸ feature-1 │  │  │  [Plan]──►     │  │  │           │ │
│  │  ▸ feature-2 │  │  │  [Tasks]──►    │  │  │  Legend   │ │
│  │  ▸ feature-3 │  │  │  [Impl]        │  │  │           │ │
│  │              │  │  └────────────────┘  │  │           │ │
│  └──────────────┘  └──────────────────────┘  └───────────┘ │
│                           │ IPC                              │
│  ┌────────────────────────┴─────────────────────────────┐   │
│  │                     Daemon                            │   │
│  │  ┌───────────┐ ┌──────────────┐ ┌────────┐          │   │
│  │  │ SQLite DB │ │ Repo Scanner │ │ Spec   │          │   │
│  │  │ (Drizzle) │ │ (background) │ │ Reader │          │   │
│  │  └───────────┘ └──────────────┘ └────────┘          │   │
│  │  ┌──────────────┐ ┌──────────────┐                   │   │
│  │  │ Config Mgr   │ │ File Watcher │                   │   │
│  │  │ (config.json)│ │ (chokidar)   │                   │   │
│  │  └──────────────┘ └──────────────┘                   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Tasks

### Task K.1 — Config file manager

- **Package:** daemon + shared
- **Priority:** P0
- **Branch:** `feature/config-manager`

**What to do:**

1. Define config schema in `packages/shared/src/config.ts`:
   ```typescript
   import { z } from 'zod';

   export const MagentaConfigSchema = z.object({
     workingDirs: z.array(z.string()).default([]),
   });

   export type MagentaConfig = z.infer<typeof MagentaConfigSchema>;
   ```

2. Create `packages/daemon/src/config/configManager.ts`:
   ```typescript
   import fs from 'fs';
   import path from 'path';
   import os from 'os';
   import { MagentaConfigSchema, MagentaConfig } from '@magenta/shared';

   const MAGENTA_DIR = path.join(os.homedir(), '.magenta');
   const CONFIG_PATH = path.join(MAGENTA_DIR, 'config.json');

   export class ConfigManager {
     private config: MagentaConfig;

     constructor() {
       fs.mkdirSync(MAGENTA_DIR, { recursive: true });
       this.config = this.load();
     }

     private load(): MagentaConfig {
       if (!fs.existsSync(CONFIG_PATH)) {
         const defaults: MagentaConfig = { workingDirs: [] };
         this.writeToDisk(defaults);
         return defaults;
       }
       try {
         const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
         return MagentaConfigSchema.parse(raw);
       } catch {
         // Corrupt config — reset to defaults
         const defaults: MagentaConfig = { workingDirs: [] };
         this.writeToDisk(defaults);
         return defaults;
       }
     }

     private writeToDisk(config: MagentaConfig): void {
       fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
     }

     get(): MagentaConfig {
       return this.config;
     }

     addWorkingDir(dir: string): MagentaConfig {
       const expanded = dir.replace(/^~/, os.homedir());
       if (!this.config.workingDirs.includes(expanded)) {
         this.config.workingDirs.push(expanded);
         this.writeToDisk(this.config);
       }
       return this.config;
     }

     removeWorkingDir(dir: string): MagentaConfig {
       this.config.workingDirs = this.config.workingDirs.filter(d => d !== dir);
       this.writeToDisk(this.config);
       return this.config;
     }
   }
   ```

3. Add IPC messages in `packages/shared/src/ipc.ts`:
   ```typescript
   export const ConfigGet = z.object({ type: z.literal('config:get') });
   export const ConfigResponse = z.object({
     type: z.literal('config:response'),
     config: MagentaConfigSchema,
   });
   export const ConfigAddWorkingDir = z.object({
     type: z.literal('config:add-working-dir'),
     path: z.string(),
   });
   export const ConfigRemoveWorkingDir = z.object({
     type: z.literal('config:remove-working-dir'),
     path: z.string(),
   });
   export const ConfigUpdated = z.object({
     type: z.literal('config:updated'),
     config: MagentaConfigSchema,
   });
   ```

**Files created:**

- `packages/shared/src/config.ts`
- `packages/daemon/src/config/configManager.ts`

**Files modified:**

- `packages/shared/src/ipc.ts` — add config IPC schemas
- `packages/daemon/src/ipc/handlers.ts` — add config handlers

**Acceptance criteria:**

- [ ] `~/.magenta/` directory created on first run
- [ ] `config.json` created with `{ "workingDirs": [] }` if missing
- [ ] Add/remove working directories via IPC, persisted to disk
- [ ] Tilde (`~`) expanded to home directory
- [ ] Corrupt config file resets to defaults gracefully
- [ ] Config re-read from disk is validated via Zod

---

### Task K.2 — SQLite database + repo table

- **Package:** daemon
- **Priority:** P0
- **Branch:** `feature/sqlite-repos`

**What to do:**

1. Install: `pnpm add sql.js ulid && pnpm add -D @types/sql.js`

2. Create `packages/daemon/src/db/schema.ts`:
   ```typescript
   import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

   export const repos = sqliteTable('repos', {
     id:        text('id').primaryKey(),          // ulid
     name:      text('name').notNull(),            // directory name
     path:      text('path').notNull().unique(),   // absolute filesystem path
     branch:    text('branch').notNull(),           // current git branch
     hasSpecs:  integer('has_specs', { mode: 'boolean' }).notNull().default(false),
     specCount: integer('spec_count').notNull().default(0),
     status:    text('status').notNull().default('active'), // active | missing | archived
     scannedAt: integer('scanned_at', { mode: 'timestamp' }).notNull(),
     createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
   });

   export const workingDirs = sqliteTable('working_dirs', {
     id:   text('id').primaryKey(),   // ulid
     path: text('path').notNull().unique(),
   });

   export const sessionState = sqliteTable('session_state', {
     id:                 integer('id').primaryKey().default(1), // single-row table
     selectedRepoPath:   text('selected_repo_path'),       // currently selected repo
     selectedSpecPath:   text('selected_spec_path'),        // currently selected spec folder
     selectedFilePath:   text('selected_file_path'),        // currently selected file within spec
     sidebarWidth:       integer('sidebar_width'),          // persisted panel width (px)
     activityPanelWidth: integer('activity_panel_width'),   // persisted panel width (px)
     activityPanelOpen:  integer('activity_panel_open', { mode: 'boolean' }).default(true),
     mainTab:            text('main_tab').default('flow'),  // flow | editor | worktrees
     updatedAt:          integer('updated_at', { mode: 'timestamp' }).notNull(),
   });
   ```

3. Create `packages/daemon/src/db/client.ts`:
   ```typescript
  // Use SqliteCompat/DatabaseService wrappers around sql.js for DB access.
  // No native sqlite bindings are required.
   ```

4. Create `packages/daemon/src/db/migrate.ts`:
   - Use Drizzle Kit's push or migration runner
   - Auto-create tables on first run
   - Safe for re-runs (idempotent)

5. Add `drizzle.config.ts` in `packages/daemon/`:
   ```typescript
   import type { Config } from 'drizzle-kit';
   export default {
     schema: './src/db/schema.ts',
     out: './drizzle',
     dialect: 'sqlite',
     dbCredentials: { url: `${process.env.HOME}/.magenta/magenta.db` },
   } satisfies Config;
   ```

**Files created:**

- `packages/daemon/src/db/schema.ts`
- `packages/daemon/src/db/client.ts`
- `packages/daemon/src/db/migrate.ts`
- `packages/daemon/drizzle.config.ts`

**Acceptance criteria:**

- [ ] `magenta.db` created at `~/.magenta/` on daemon start
- [ ] WAL mode enabled
- [ ] `repos` table created with correct schema
- [ ] `working_dirs` table created
- [ ] Drizzle can insert, query, update repos
- [ ] `path` column has UNIQUE constraint (no duplicate repos)
- [ ] Migrations are idempotent (safe to re-run)
- [ ] `session_state` table created with single-row constraint
- [ ] Initial session_state row inserted on first run (all nulls, defaults)

---

### Task K.3 — Repo scanner service with background sync

- **Package:** daemon
- **Priority:** P0
- **Branch:** `feature/repo-scanner`

**What to do:**

1. Create `packages/daemon/src/services/repoScanner.ts`:
   ```typescript
   import fs from 'fs';
   import path from 'path';
   import os from 'os';
   import simpleGit from 'simple-git';
   import { eq } from 'drizzle-orm';
   import { ulid } from 'ulid';
   import { repos } from '../db/schema';

   export interface ScanResult {
     name: string;
     path: string;
     branch: string;
     hasSpecs: boolean;
     specCount: number;
   }

   export class RepoScanner {
     private maxDepth = 3;
     private excludePatterns = ['node_modules', '.cache', 'vendor', 'dist', '.Trash', 'Library'];

     /**
      * Walk directories and find all git repos.
      * Does NOT touch the database — returns raw scan results.
      */
     async scan(
       directories: string[],
       onProgress?: (scanned: number, found: number, currentDir: string) => void
     ): Promise<ScanResult[]> {
       const results: ScanResult[] = [];
       let scanned = 0;

       for (const dir of directories) {
         const expanded = dir.replace(/^~/, os.homedir());
         if (!fs.existsSync(expanded)) continue;
         await this.walk(expanded, 0, results, () => {
           scanned++;
           onProgress?.(scanned, results.length, expanded);
         });
       }

       return results;
     }

     private async walk(
       dir: string,
       depth: number,
       results: ScanResult[],
       onVisit: () => void
     ): Promise<void> {
       if (depth > this.maxDepth) return;
       onVisit();

       // Check if this directory is a git repo
       const gitDir = path.join(dir, '.git');
       if (fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory()) {
         const repo = await this.inspect(dir);
         results.push(repo);
         return; // Don't recurse into git repos
       }

       // Recurse into subdirectories
       let entries: fs.Dirent[];
       try {
         entries = fs.readdirSync(dir, { withFileTypes: true });
       } catch {
         return; // Permission denied or broken symlink
       }

       for (const entry of entries) {
         if (!entry.isDirectory()) continue;
         if (entry.name.startsWith('.')) continue;
         if (this.excludePatterns.includes(entry.name)) continue;
         await this.walk(path.join(dir, entry.name), depth + 1, results, onVisit);
       }
     }

     private async inspect(repoPath: string): Promise<ScanResult> {
       const git = simpleGit(repoPath);
       let branch = 'unknown';
       try {
         branch = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();
       } catch {}

       const specsDir = path.join(repoPath, 'specs');
       const hasSpecs = fs.existsSync(specsDir) && fs.statSync(specsDir).isDirectory();
       let specCount = 0;
       if (hasSpecs) {
         try {
           specCount = fs.readdirSync(specsDir, { withFileTypes: true })
             .filter(e => e.isDirectory()).length;
         } catch {}
       }

       return {
         name: path.basename(repoPath),
         path: repoPath,
         branch,
         hasSpecs,
         specCount,
       };
     }
   }
   ```

2. Create `packages/daemon/src/services/repoSyncService.ts`:
   ```typescript
   import { eq, inArray, notInArray } from 'drizzle-orm';
   import { ulid } from 'ulid';
   import { repos } from '../db/schema';
   import { RepoScanner, ScanResult } from './repoScanner';

   export class RepoSyncService {
     constructor(
       private db: Database,
       private scanner: RepoScanner,
     ) {}

     /**
      * Full sync: scan working dirs, compare with DB, add/update/mark missing.
      * Called on app launch (background) and when user adds a working dir.
      */
     async sync(
       workingDirs: string[],
       onProgress?: (scanned: number, found: number, currentDir: string) => void
     ): Promise<{ added: number; updated: number; missing: number }> {
       const now = new Date();
       const scanResults = await this.scanner.scan(workingDirs, onProgress);
       const scannedPaths = new Set(scanResults.map(r => r.path));

       // Get all existing repos from DB
       const existingRepos = await this.db.select().from(repos);
       const existingPaths = new Map(existingRepos.map(r => [r.path, r]));

       let added = 0, updated = 0, missing = 0;

       // INSERT new repos, UPDATE existing ones
       for (const result of scanResults) {
         const existing = existingPaths.get(result.path);
         if (existing) {
           // Update: branch, hasSpecs, specCount, scannedAt, status back to active
           await this.db.update(repos).set({
             branch: result.branch,
             hasSpecs: result.hasSpecs,
             specCount: result.specCount,
             scannedAt: now,
             status: 'active',
           }).where(eq(repos.path, result.path));
           updated++;
         } else {
           // Insert new repo
           await this.db.insert(repos).values({
             id: ulid(),
             name: result.name,
             path: result.path,
             branch: result.branch,
             hasSpecs: result.hasSpecs,
             specCount: result.specCount,
             status: 'active',
             scannedAt: now,
             createdAt: now,
           });
           added++;
         }
       }

       // Mark repos that are no longer on disk as 'missing'
       for (const existing of existingRepos) {
         if (!scannedPaths.has(existing.path) && existing.status === 'active') {
           await this.db.update(repos).set({ status: 'missing', scannedAt: now })
             .where(eq(repos.id, existing.id));
           missing++;
         }
       }

       return { added, updated, missing };
     }

     /**
      * Get all repos from DB (instant, no scanning).
      */
     async getAllRepos() {
       return this.db.select().from(repos).orderBy(repos.name);
     }

     /**
      * Get only active repos.
      */
     async getActiveRepos() {
       return this.db.select().from(repos)
         .where(eq(repos.status, 'active'))
         .orderBy(repos.name);
     }
   }
   ```

3. Wire into daemon startup in `packages/daemon/src/index.ts`:
   ```typescript
   // 1. Init DB + run migrations
   const db = createDb();
   await runMigrations(db);

   // 2. Start IPC server
   const server = new IpcServer(socketPath);

   // 3. Load config
   const configManager = new ConfigManager();

   // 4. Register IPC handlers (repos served from DB immediately)
   registerHandlers(server, db, configManager);

   // 5. Background scan (non-blocking)
   const syncService = new RepoSyncService(db, new RepoScanner());
   setImmediate(async () => {
     const config = configManager.get();
     if (config.workingDirs.length === 0) return;

     server.broadcast({ type: 'repo:scan:started' });

     const result = await syncService.sync(config.workingDirs, (scanned, found, dir) => {
       server.broadcast({ type: 'repo:scan:progress', scanned, found, currentDir: dir });
     });

     const repos = await syncService.getActiveRepos();
     server.broadcast({ type: 'repo:scan:complete', repos, ...result });
   });
   ```

4. Add IPC messages:
   ```typescript
   // Request: get repos from DB (instant, cached)
   export const RepoList = z.object({ type: z.literal('repo:list') });
   export const RepoListResult = z.object({
     type: z.literal('repo:list:result'),
     repos: z.array(ScannedRepoSchema),
   });

   // Request: trigger a manual re-scan
   export const RepoScan = z.object({ type: z.literal('repo:scan') });

   // Server push events during scan
   export const RepoScanStarted = z.object({ type: z.literal('repo:scan:started') });
   export const RepoScanProgress = z.object({
     type: z.literal('repo:scan:progress'),
     scanned: z.number(),
     found: z.number(),
     currentDir: z.string(),
   });
   export const RepoScanComplete = z.object({
     type: z.literal('repo:scan:complete'),
     repos: z.array(ScannedRepoSchema),
     added: z.number(),
     updated: z.number(),
     missing: z.number(),
   });
   ```

**Files created:**

- `packages/daemon/src/services/repoScanner.ts`
- `packages/daemon/src/services/repoSyncService.ts`

**Files modified:**

- `packages/daemon/src/index.ts` — wire background scan on startup
- `packages/shared/src/ipc.ts` — add scan IPC schemas
- `packages/shared/src/models.ts` — add `ScannedRepoSchema`
- `packages/daemon/src/ipc/handlers.ts` — add `repo:list`, `repo:scan` handlers

**Acceptance criteria:**

- [ ] On app launch: UI immediately shows repos from SQLite cache
- [ ] Background scan runs after launch, syncs DB with disk
- [ ] New repos found on disk → INSERT into DB
- [ ] Existing repos → UPDATE branch, hasSpecs, specCount, scannedAt
- [ ] Repos deleted from disk → `status = 'missing'` (NOT deleted from DB)
- [ ] `repo:scan:progress` events emitted during scan
- [ ] `repo:scan:complete` event sent when done, UI re-renders
- [ ] Manual re-scan triggered via `repo:scan` IPC
- [ ] Adding a new workingDir triggers a scan of that directory

---

### Task K.4 — Sidebar: repo list with cached data

- **Package:** ui
- **Priority:** P0
- **Branch:** `feature/sidebar-repos`

**What to do:**

1. Create `packages/ui/src/renderer/store/repoStore.ts`:
   ```typescript
   interface RepoStore {
     repos: ScannedRepo[];
     activeRepoId: string | null;     // repo path as ID
     isScanning: boolean;
     scanProgress: { scanned: number; found: number; currentDir: string } | null;

     setRepos: (repos: ScannedRepo[]) => void;
     setActiveRepo: (path: string | null) => void;
     setScanning: (scanning: boolean) => void;
     setScanProgress: (progress: ScanProgress | null) => void;
   }
   ```

2. App startup sequence in renderer:
   ```typescript
   // 1. Request cached repos from DB (instant)
   ipc.send({ type: 'repo:list' });

   // 2. Listen for background scan events
   ipc.on('repo:scan:started', () => repoStore.setScanning(true));
   ipc.on('repo:scan:progress', (msg) => repoStore.setScanProgress(msg));
   ipc.on('repo:scan:complete', (msg) => {
     repoStore.setRepos(msg.repos);
     repoStore.setScanning(false);
     repoStore.setScanProgress(null);
   });
   ```

3. Create `packages/ui/src/renderer/components/sidebar/RepoList.tsx`:
   ```tsx
   function RepoList() {
     const { repos, activeRepoId, setActiveRepo, isScanning } = useRepoStore();

     // Separate active from missing repos
     const activeRepos = repos.filter(r => r.status === 'active');
     const missingRepos = repos.filter(r => r.status === 'missing');

     return (
       <div className="flex flex-col h-full">
         <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
           Repositories
         </div>

         {isScanning && <ScanningIndicator />}

         <div className="flex-1 overflow-y-auto">
           {activeRepos.map(repo => (
             <RepoItem
               key={repo.path}
               repo={repo}
               isActive={repo.path === activeRepoId}
               onClick={() => setActiveRepo(repo.path)}
             />
           ))}
           {missingRepos.length > 0 && (
             <Collapsible>
               <CollapsibleTrigger className="text-xs text-muted-foreground px-3 py-1">
                 {missingRepos.length} unavailable
               </CollapsibleTrigger>
               <CollapsibleContent>
                 {missingRepos.map(repo => (
                   <RepoItem key={repo.path} repo={repo} isMissing />
                 ))}
               </CollapsibleContent>
             </Collapsible>
           )}
         </div>

         <div className="p-2 border-t">
           <Button variant="outline" className="w-full" onClick={addWorkingDir}>
             + Add repo
           </Button>
         </div>
       </div>
     );
   }
   ```

4. Create `packages/ui/src/renderer/components/sidebar/RepoItem.tsx` matching the mockup:
   - Left accent border (blue for selected, orange for queued, green for done)
   - Repo name (bold)
   - Status badge + branch name on second line
   - Missing repos shown with muted style and strikethrough

5. "Add repo" button:
   - Opens Electron folder picker (`dialog.showOpenDialog`)
   - Sends `config:add-working-dir { path }` IPC
   - Triggers `repo:scan` to scan the new directory
   - New repos appear in sidebar after scan completes

**Files created:**

- `packages/ui/src/renderer/store/repoStore.ts`
- `packages/ui/src/renderer/components/sidebar/RepoList.tsx`
- `packages/ui/src/renderer/components/sidebar/RepoItem.tsx`
- `packages/ui/src/renderer/components/sidebar/ScanningIndicator.tsx`

**Acceptance criteria:**

- [ ] Repos appear instantly on app launch (from DB cache)
- [ ] Scanning indicator shown during background sync
- [ ] Repo list updates when scan completes (new repos appear, missing ones marked)
- [ ] Each repo shows name, branch, status badge
- [ ] Active repo highlighted with left accent border
- [ ] Missing repos collapsed into "N unavailable" section
- [ ] "Add repo" adds working dir and triggers scan
- [ ] Empty state with prompt to add a working directory

---

### Task K.5 — Spec reader + sidebar spec tree

- **Package:** daemon + ui
- **Priority:** P0
- **Branch:** `feature/spec-reader`

**What to do:**

1. Create `packages/daemon/src/services/specReader.ts`:
   ```typescript
   export interface SpecFolder {
     name: string;                // folder name (e.g., "rewrite-rust-proxy")
     path: string;                // absolute path
     stages: SpecStage[];         // detected stages
     files: string[];             // all files in the folder
   }

   export interface SpecStage {
     name: 'constitution' | 'spec' | 'plan' | 'tasks' | 'implementation';
     status: 'missing' | 'draft' | 'review' | 'approved';
     filePath: string | null;
     metadata?: {
       taskCount?: number;
       completedCount?: number;
       worktreeCount?: number;
     };
   }

   export class SpecReader {
     readSpecsForRepo(repoPath: string): SpecFolder[] {
       const specsDir = path.join(repoPath, 'specs');
       if (!fs.existsSync(specsDir)) return [];

       return fs.readdirSync(specsDir, { withFileTypes: true })
         .filter(e => e.isDirectory())
         .map(e => this.readSpecFolder(path.join(specsDir, e.name)))
         .sort((a, b) => a.name.localeCompare(b.name));
     }

     private readSpecFolder(specPath: string): SpecFolder {
       const files = fs.readdirSync(specPath);
       return {
         name: path.basename(specPath),
         path: specPath,
         stages: this.detectStages(specPath, new Set(files)),
         files,
       };
     }

     private detectStages(specPath: string, files: Set<string>): SpecStage[] {
       return [
         this.detectFileStage(specPath, files, 'constitution', 'constitution.md', files.has('tasks.md')),
         this.detectFileStage(specPath, files, 'spec', 'spec.md', files.has('plan.md')),
         this.detectFileStage(specPath, files, 'plan', 'plan.md', files.has('tasks.md')),
         this.detectTasksStage(specPath, files),
         this.detectImplementationStage(specPath, files),
       ];
     }

     private detectFileStage(
       specPath: string, files: Set<string>,
       name: SpecStage['name'], fileName: string, hasDownstream: boolean
     ): SpecStage {
       if (!files.has(fileName)) return { name, status: 'missing', filePath: null };
       const filePath = path.join(specPath, fileName);
       const content = fs.readFileSync(filePath, 'utf-8').trim();
       if (content.length < 50) return { name, status: 'draft', filePath };
       if (hasDownstream) return { name, status: 'approved', filePath };
       return { name, status: 'review', filePath };
     }

     private detectTasksStage(specPath: string, files: Set<string>): SpecStage {
       if (!files.has('tasks.md')) return { name: 'tasks', status: 'missing', filePath: null };
       const filePath = path.join(specPath, 'tasks.md');
       const content = fs.readFileSync(filePath, 'utf-8');
       const total = (content.match(/- \[[ x]\]/g) || []).length;
       const completed = (content.match(/- \[x\]/g) || []).length;
       return {
         name: 'tasks', status: total > 0 ? 'review' : 'draft', filePath,
         metadata: { taskCount: total, completedCount: completed },
       };
     }

     private detectImplementationStage(specPath: string, files: Set<string>): SpecStage {
       const implDir = path.join(specPath, 'implementation');
       if (!fs.existsSync(implDir) || !fs.statSync(implDir).isDirectory()) {
         return { name: 'implementation', status: 'missing', filePath: null };
       }
       let metadata: SpecStage['metadata'] = {};
       const progressPath = path.join(implDir, 'progress.json');
       if (fs.existsSync(progressPath)) {
         try {
           const p = JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
           metadata = { taskCount: p.total, completedCount: p.completed };
         } catch {}
       }
       const wtDir = path.join(implDir, '.worktrees');
       if (fs.existsSync(wtDir)) {
         metadata.worktreeCount = fs.readdirSync(wtDir, { withFileTypes: true })
           .filter(e => e.isDirectory()).length;
       }
       return {
         name: 'implementation',
         status: (metadata.worktreeCount || 0) > 0 ? 'review' : 'draft',
         filePath: implDir, metadata,
       };
     }
   }
   ```

2. Add IPC messages:
   ```typescript
   export const SpecList = z.object({ type: z.literal('spec:list'), repoPath: z.string() });
   export const SpecListResult = z.object({
     type: z.literal('spec:list:result'),
     repoPath: z.string(),
     specs: z.array(SpecFolderSchema),
   });
   ```

3. Create `packages/ui/src/renderer/components/sidebar/SpecTree.tsx`:
   - Shown below repo list when a repo is selected
   - Section header: "SPECS" (uppercase, muted)
   - Each spec folder as a clickable row with name
   - Small progress dots showing which stages exist (5 dots: filled = exists, hollow = missing)
   - Clicking a spec opens the flow diagram in the main panel

4. Create Zustand slice `packages/ui/src/renderer/store/specStore.ts`:
   ```typescript
   interface SpecStore {
     specs: SpecFolder[];
     activeSpecPath: string | null;
     setSpecs: (specs: SpecFolder[]) => void;
     setActiveSpec: (path: string | null) => void;
   }
   ```

**Files created:**

- `packages/daemon/src/services/specReader.ts`
- `packages/ui/src/renderer/components/sidebar/SpecTree.tsx`
- `packages/ui/src/renderer/components/sidebar/SpecTreeItem.tsx`
- `packages/ui/src/renderer/store/specStore.ts`

**Files modified:**

- `packages/shared/src/ipc.ts` — add spec list schemas
- `packages/shared/src/models.ts` — add `SpecFolderSchema`, `SpecStageSchema`
- `packages/daemon/src/ipc/handlers.ts` — add `spec:list` handler

**Acceptance criteria:**

- [ ] Selecting a repo fetches specs from its `specs/` directory
- [ ] Spec folders listed in sidebar with name and stage progress dots
- [ ] Clicking a spec folder sets it as active (opens flow diagram)
- [ ] Stage detection matches the rules table (draft/review/approved/missing)
- [ ] Task checkbox parsing counts total and completed
- [ ] Repo without `specs/` shows "No specs found" empty state

---

### Task K.6 — React Flow spec pipeline diagram

- **Package:** ui
- **Priority:** P0
- **Branch:** `feature/spec-flow-diagram`

**What to do:**

1. Install: `pnpm add @xyflow/react`

2. Create custom node `packages/ui/src/renderer/components/flow/StageNode.tsx`:
   ```tsx
   import { Handle, Position, type NodeProps } from '@xyflow/react';

   interface StageNodeData {
     label: string;
     status: 'missing' | 'draft' | 'review' | 'approved' | 'idle' | 'running';
     fileName: string | null;
     metadata?: {
       taskCount?: number;
       completedCount?: number;
     };
   }

   const statusStyles: Record<string, { border: string; dot: string }> = {
     missing:  { border: 'border-dashed border-gray-400', dot: 'bg-gray-400' },
     draft:    { border: 'border-solid border-gray-500',  dot: 'bg-gray-500' },
     review:   { border: 'border-solid border-orange-500', dot: 'bg-orange-500' },
     approved: { border: 'border-solid border-green-500',  dot: 'bg-green-500' },
     idle:     { border: 'border-solid border-gray-400',   dot: 'bg-gray-400' },
     running:  { border: 'border-solid border-blue-500 animate-pulse', dot: 'bg-blue-500' },
   };

   export function StageNode({ data }: NodeProps) {
     const d = data as StageNodeData;
     const style = statusStyles[d.status] || statusStyles.missing;
     const hasProgress = d.metadata?.taskCount != null && d.metadata.taskCount > 0;
     const progressPct = hasProgress
       ? ((d.metadata!.completedCount || 0) / d.metadata!.taskCount!) * 100
       : 0;

     return (
       <div className={`rounded-lg border-2 ${style.border} bg-card p-4 min-w-[180px] shadow-sm`}>
         <Handle type="target" position={Position.Top} className="!bg-gray-400" />
         <Handle type="target" position={Position.Left} className="!bg-gray-400" />

         <div className="font-bold text-sm">{d.label}</div>

         <div className="flex items-center gap-1.5 mt-1">
           <span className={`w-2 h-2 rounded-full ${style.dot}`} />
           <span className="text-xs text-muted-foreground">{d.status}</span>
         </div>

         {d.fileName && (
           <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
             <span>📄</span>
             <span>{d.fileName}</span>
           </div>
         )}

         {hasProgress && (
           <div className="mt-2">
             <div className="text-xs text-muted-foreground">
               {d.metadata!.completedCount}/{d.metadata!.taskCount} tasks
             </div>
             <div className="w-full h-1.5 bg-muted rounded-full mt-1 overflow-hidden">
               <div
                 className="h-full bg-blue-500 rounded-full transition-all"
                 style={{ width: `${progressPct}%` }}
               />
             </div>
           </div>
         )}

         <Handle type="source" position={Position.Bottom} className="!bg-gray-400" />
         <Handle type="source" position={Position.Right} className="!bg-gray-400" />
       </div>
     );
   }
   ```

3. Create layout generator `packages/ui/src/renderer/components/flow/generateFlowLayout.ts`:
   ```typescript
   import type { Node, Edge } from '@xyflow/react';

   export function generateFlowLayout(spec: SpecFolder): { nodes: Node[]; edges: Edge[] } {
     const stages = spec.stages;
     const findStage = (name: string) => stages.find(s => s.name === name);

     const nodes: Node[] = [];
     const edges: Edge[] = [];

     // Constitution at top center
     const constitution = findStage('constitution');
     nodes.push({
       id: 'constitution',
       type: 'stageNode',
       position: { x: 350, y: 0 },
       data: {
         label: 'Constitution',
         status: constitution?.status || 'missing',
         fileName: constitution?.filePath ? 'constitution.md' : null,
       },
     });

     // Spec, Plan, Tasks in a row below
     const bottomRow = [
       { id: 'spec', label: 'Spec', file: 'spec.md', x: 0 },
       { id: 'plan', label: 'Plan', file: 'plan.md', x: 280 },
       { id: 'tasks', label: 'Tasks', file: 'tasks.md', x: 560 },
     ];

     for (const item of bottomRow) {
       const stage = findStage(item.id);
       nodes.push({
         id: item.id,
         type: 'stageNode',
         position: { x: item.x, y: 220 },
         data: {
           label: item.label,
           status: stage?.status || 'missing',
           fileName: stage?.filePath ? item.file : null,
           metadata: stage?.metadata,
         },
       });

       edges.push({
         id: `constitution-${item.id}`,
         source: 'constitution',
         target: item.id,
         type: 'smoothstep',
         style: { stroke: '#f97316', strokeWidth: 2 },  // Orange like mockup
       });
     }

     // Implementation to the right of Tasks
     const impl = findStage('implementation');
     nodes.push({
       id: 'implementation',
       type: 'stageNode',
       position: { x: 840, y: 220 },
       data: {
         label: 'Implementation',
         status: impl?.status || 'missing',
         fileName: null,
         metadata: impl?.metadata,
       },
     });

     edges.push({
       id: 'tasks-implementation',
       source: 'tasks',
       target: 'implementation',
       sourceHandle: 'right',
       targetHandle: 'left',
       type: 'smoothstep',
       style: { stroke: '#888', strokeWidth: 2 },
     });

     return { nodes, edges };
   }
   ```

4. Create page `packages/ui/src/renderer/pages/SpecFlowPage.tsx`:
   ```tsx
   import { ReactFlow, Background, Controls, MiniMap } from '@xyflow/react';
   import '@xyflow/react/dist/style.css';
   import { StageNode } from '../components/flow/StageNode';
   import { generateFlowLayout } from '../components/flow/generateFlowLayout';

   const nodeTypes = { stageNode: StageNode };

   export function SpecFlowPage() {
     const activeSpec = useSpecStore(s => s.specs.find(sp => sp.path === s.activeSpecPath));
     if (!activeSpec) return <EmptyState />;

     const { nodes, edges } = useMemo(
       () => generateFlowLayout(activeSpec),
       [activeSpec]
     );

     return (
       <div className="h-full w-full">
         <div className="px-4 py-2 border-b flex items-center gap-2">
           <span className="text-sm font-medium text-muted-foreground">
             {activeSpec.name}
           </span>
         </div>
         <ReactFlow
           nodes={nodes}
           edges={edges}
           nodeTypes={nodeTypes}
           fitView
           fitViewOptions={{ padding: 0.3 }}
           minZoom={0.5}
           maxZoom={2}
           proOptions={{ hideAttribution: true }}
         >
           <Background gap={20} size={1} color="#333" />
           <Controls />
         </ReactFlow>
       </div>
     );
   }
   ```

5. Dark theme: configure React Flow with dark background matching the second mockup

**Files created:**

- `packages/ui/src/renderer/pages/SpecFlowPage.tsx`
- `packages/ui/src/renderer/components/flow/StageNode.tsx`
- `packages/ui/src/renderer/components/flow/generateFlowLayout.ts`
- `packages/ui/src/renderer/components/flow/statusConfig.ts`

**Files modified:**

- `packages/ui/src/renderer/components/MainPanel.tsx` — route to SpecFlowPage when spec selected

**Acceptance criteria:**

- [ ] Selecting a spec renders a React Flow diagram in the main panel
- [ ] Constitution node at top, Spec/Plan/Tasks in row below, Implementation to the right
- [ ] Edges use orange color connecting Constitution to downstream stages
- [ ] Missing stages shown with dashed gray border
- [ ] Review stages shown with orange border
- [ ] Approved stages shown with green border
- [ ] Task count and progress bar shown on tasks/implementation nodes
- [ ] File names displayed on nodes that have associated files
- [ ] Pan, zoom, and fit-to-view work
- [ ] Dark theme background matching mockup

---

### Task K.7 — Right panel: activity & quick actions

- **Package:** ui
- **Priority:** P1
- **Branch:** `feature/right-panel`

**What to do:**

1. Create `packages/ui/src/renderer/components/activity/ActivityPanel.tsx` matching the first mockup:

   **Agent Activity Section (placeholder):**
   ```
   AGENT ACTIVITY
   Claude redis-cache · writing tests
   Copilot openapi-docs · finalising
   2 agents running
   ```

   **Quick Actions Section:**
   - Full-width card buttons (matching mockup style):
     - "View diff ↗"
     - "Pause agents ↗"
     - "New spec ↗"
     - "Run queued ↗"
   - Each card is a bordered button with label + arrow icon

   **Legend Section:**
   ```
   LEGEND
   ● Claude Code agent    (purple dot)
   ● GitHub Copilot agent (green dot)
   ● Idle / queued        (gray dot)
   ```

2. For kick-start, agent activity is **placeholder text**. Quick actions wired to real actions where possible ("New spec" can create a spec folder).

**Files created:**

- `packages/ui/src/renderer/components/activity/ActivityPanel.tsx`
- `packages/ui/src/renderer/components/activity/AgentActivitySection.tsx`
- `packages/ui/src/renderer/components/activity/QuickActionsSection.tsx`
- `packages/ui/src/renderer/components/activity/LegendSection.tsx`

**Acceptance criteria:**

- [ ] Right panel matches mockup layout
- [ ] Three sections: activity, quick actions, legend
- [ ] Quick action cards are full-width with arrow icons
- [ ] Panel is collapsible (ResizablePanel with collapsible prop)

---

### Task K.8 — Settings UI for working directories

- **Package:** ui
- **Priority:** P1
- **Branch:** `feature/settings-working-dirs`

**What to do:**

1. Create a settings dialog (accessible from sidebar gear icon):
   - **Working Directories** section:
     - List of configured directories with remove (×) button each
     - "Add Directory" button → Electron folder picker
     - "Scan Now" button → triggers `repo:scan` IPC
   - Last scan timestamp and repo count displayed

2. Wire to existing config IPC: `config:add-working-dir`, `config:remove-working-dir`

**Files created:**

- `packages/ui/src/renderer/components/settings/SettingsDialog.tsx`
- `packages/ui/src/renderer/components/settings/WorkingDirsSettings.tsx`

**Acceptance criteria:**

- [ ] Settings accessible from sidebar gear icon
- [ ] Working directories listed with remove button
- [ ] Add directory via native folder picker
- [ ] "Scan Now" triggers re-scan
- [ ] Results update in sidebar after scan

---

### Task K.9 — File watcher for specs directory

- **Package:** daemon
- **Priority:** P1
- **Branch:** `feature/spec-watcher`

**What to do:**

1. Create `packages/daemon/src/services/specWatcher.ts`:
   ```typescript
   import chokidar from 'chokidar';

   export class SpecWatcher {
     private watchers = new Map<string, chokidar.FSWatcher>();

     watch(repoPath: string, onChange: (repoPath: string) => void): void {
       const specsDir = path.join(repoPath, 'specs');
       if (!fs.existsSync(specsDir)) return;

       // Close existing watcher for this repo
       this.unwatch(repoPath);

       const watcher = chokidar.watch(specsDir, {
         ignored: ['**/node_modules/**', '**/.git/**'],
         ignoreInitial: true,
         depth: 2,
       });

       let timer: NodeJS.Timeout;
       const debounced = () => {
         clearTimeout(timer);
         timer = setTimeout(() => onChange(repoPath), 500);
       };

       watcher.on('add', debounced);
       watcher.on('change', debounced);
       watcher.on('unlink', debounced);
       watcher.on('addDir', debounced);
       watcher.on('unlinkDir', debounced);

       this.watchers.set(repoPath, watcher);
     }

     unwatch(repoPath: string): void {
       this.watchers.get(repoPath)?.close();
       this.watchers.delete(repoPath);
     }

     unwatchAll(): void {
       for (const w of this.watchers.values()) w.close();
       this.watchers.clear();
     }
   }
   ```

2. When specs directory changes:
   - Re-read via `SpecReader`
   - Push `spec:list:updated { repoPath, specs[] }` to UI
   - UI reactively updates sidebar tree and flow diagram

3. Start watching when a repo is selected, stop when deselected

**Files created:**

- `packages/daemon/src/services/specWatcher.ts`

**Files modified:**

- `packages/shared/src/ipc.ts` — add `spec:list:updated` push event
- `packages/daemon/src/ipc/handlers.ts` — wire watcher start/stop

**Acceptance criteria:**

- [ ] Creating/editing/deleting files in `specs/` triggers UI update
- [ ] Flow diagram refreshes automatically when stages change
- [ ] Debounced to 500ms
- [ ] Only watches the currently selected repo

---

### Task K.10 — Session state persistence + restore on launch

- **Package:** daemon + ui
- **Priority:** P0
- **Branch:** `feature/session-state`

**What to do:**

1. Create `packages/daemon/src/services/sessionStateService.ts`:
   ```typescript
   import { eq } from 'drizzle-orm';
   import { sessionState } from '../db/schema';

   export interface SessionState {
     selectedRepoPath: string | null;
     selectedSpecPath: string | null;
     selectedFilePath: string | null;
     sidebarWidth: number | null;
     activityPanelWidth: number | null;
     activityPanelOpen: boolean;
     mainTab: string;
   }

   export class SessionStateService {
     constructor(private db: Database) {}

     /**
      * Ensure the single row exists (called once on DB init).
      */
     async init(): Promise<void> {
       const existing = await this.db.select().from(sessionState).limit(1);
       if (existing.length === 0) {
         await this.db.insert(sessionState).values({
           id: 1,
           selectedRepoPath: null,
           selectedSpecPath: null,
           selectedFilePath: null,
           sidebarWidth: null,
           activityPanelWidth: null,
           activityPanelOpen: true,
           mainTab: 'flow',
           updatedAt: new Date(),
         });
       }
     }

     /**
      * Read current state.
      */
     async get(): Promise<SessionState> {
       const rows = await this.db.select().from(sessionState).limit(1);
       const row = rows[0];
       return {
         selectedRepoPath: row?.selectedRepoPath ?? null,
         selectedSpecPath: row?.selectedSpecPath ?? null,
         selectedFilePath: row?.selectedFilePath ?? null,
         sidebarWidth: row?.sidebarWidth ?? null,
         activityPanelWidth: row?.activityPanelWidth ?? null,
         activityPanelOpen: row?.activityPanelOpen ?? true,
         mainTab: row?.mainTab ?? 'flow',
       };
     }

     /**
      * Partial update — only writes the fields provided.
      */
     async update(partial: Partial<SessionState>): Promise<void> {
       await this.db.update(sessionState).set({
         ...partial,
         updatedAt: new Date(),
       }).where(eq(sessionState.id, 1));
     }

     /**
      * Validate and restore: check that saved paths still exist on disk.
      * Returns cleaned state with stale paths nulled out.
      */
     async validateAndRestore(): Promise<SessionState & { fallback: 'none' | 'repo' | 'spec' | 'welcome' }> {
       const state = await this.get();
       let fallback: 'none' | 'repo' | 'spec' | 'welcome' = 'none';

       // Check repo still exists
       if (state.selectedRepoPath) {
         const gitDir = path.join(state.selectedRepoPath, '.git');
         if (!fs.existsSync(gitDir)) {
           // Repo deleted — clear everything
           await this.update({
             selectedRepoPath: null,
             selectedSpecPath: null,
             selectedFilePath: null,
           });
           state.selectedRepoPath = null;
           state.selectedSpecPath = null;
           state.selectedFilePath = null;
           fallback = 'welcome';
           return { ...state, fallback };
         }
       } else {
         fallback = 'welcome';
         return { ...state, fallback };
       }

       // Repo exists — check spec folder
       if (state.selectedSpecPath) {
         if (!fs.existsSync(state.selectedSpecPath)) {
           await this.update({ selectedSpecPath: null, selectedFilePath: null });
           state.selectedSpecPath = null;
           state.selectedFilePath = null;
           fallback = 'repo';  // Fall back to repo's spec list
         }
       }

       // Spec exists — check file
       if (state.selectedFilePath) {
         if (!fs.existsSync(state.selectedFilePath)) {
           await this.update({ selectedFilePath: null });
           state.selectedFilePath = null;
           fallback = fallback === 'none' ? 'spec' : fallback;  // Fall back to spec diagram
         }
       }

       return { ...state, fallback };
     }
   }
   ```

2. Add IPC messages:
   ```typescript
   export const SessionGet = z.object({ type: z.literal('session:get') });
   export const SessionState = z.object({
     type: z.literal('session:state'),
     selectedRepoPath: z.string().nullable(),
     selectedSpecPath: z.string().nullable(),
     selectedFilePath: z.string().nullable(),
     sidebarWidth: z.number().nullable(),
     activityPanelWidth: z.number().nullable(),
     activityPanelOpen: z.boolean(),
     mainTab: z.string(),
     fallback: z.enum(['none', 'repo', 'spec', 'welcome']),
   });
   export const SessionUpdate = z.object({
     type: z.literal('session:update'),
     selectedRepoPath: z.string().nullable().optional(),
     selectedSpecPath: z.string().nullable().optional(),
     selectedFilePath: z.string().nullable().optional(),
     sidebarWidth: z.number().optional(),
     activityPanelWidth: z.number().optional(),
     activityPanelOpen: z.boolean().optional(),
     mainTab: z.string().optional(),
   });
   export const SessionUpdated = z.object({ type: z.literal('session:updated') });
   ```

3. Wire into UI startup (`packages/ui/src/renderer/App.tsx`):
   ```typescript
   function App() {
     const [ready, setReady] = useState(false);
     const setActiveRepo = useRepoStore(s => s.setActiveRepo);
     const setActiveSpec = useSpecStore(s => s.setActiveSpec);

     useEffect(() => {
       // Request session state from daemon
       ipc.send({ type: 'session:get' });
       ipc.on('session:state', (msg) => {
         // Restore panel sizes
         if (msg.sidebarWidth) setSidebarWidth(msg.sidebarWidth);
         if (msg.activityPanelWidth) setActivityPanelWidth(msg.activityPanelWidth);
         setActivityPanelOpen(msg.activityPanelOpen);

         // Restore navigation based on fallback level
         switch (msg.fallback) {
           case 'none':
             // Everything valid — restore fully
             if (msg.selectedRepoPath) setActiveRepo(msg.selectedRepoPath);
             if (msg.selectedSpecPath) setActiveSpec(msg.selectedSpecPath);
             break;
           case 'spec':
             // Spec exists but file was deleted
             if (msg.selectedRepoPath) setActiveRepo(msg.selectedRepoPath);
             if (msg.selectedSpecPath) setActiveSpec(msg.selectedSpecPath);
             break;
           case 'repo':
             // Repo exists but spec was deleted
             if (msg.selectedRepoPath) setActiveRepo(msg.selectedRepoPath);
             break;
           case 'welcome':
             // Repo deleted or no state — welcome screen
             break;
         }
         setReady(true);
       });
     }, []);

     if (!ready) return <SplashScreen />;

     return (
       <ResizablePanelGroup>
         {/* ... three-panel layout ... */}
       </ResizablePanelGroup>
     );
   }
   ```

4. Wire session saves into Zustand store actions (debounced):
   ```typescript
   // In repoStore.ts
   setActiveRepo: (path) => {
     set({ activeRepoId: path });
     debouncedSessionSave({ selectedRepoPath: path, selectedSpecPath: null, selectedFilePath: null });
   }

   // In specStore.ts
   setActiveSpec: (path) => {
     set({ activeSpecPath: path });
     debouncedSessionSave({ selectedSpecPath: path, selectedFilePath: null });
   }

   // In uiStore.ts — panel resize handlers
   onSidebarResize: (width) => {
     debouncedSessionSave({ sidebarWidth: width });
   }
   ```

5. Create debounced save helper:
   ```typescript
   // packages/ui/src/renderer/ipc/sessionSync.ts
   let saveTimer: NodeJS.Timeout;
   let pendingUpdates: Partial<SessionUpdate> = {};

   export function debouncedSessionSave(updates: Partial<SessionUpdate>) {
     Object.assign(pendingUpdates, updates);
     clearTimeout(saveTimer);
     saveTimer = setTimeout(() => {
       ipc.send({ type: 'session:update', ...pendingUpdates });
       pendingUpdates = {};
     }, 500);
   }

   // Also save on app quit (immediate, no debounce)
   window.addEventListener('beforeunload', () => {
     if (Object.keys(pendingUpdates).length > 0) {
       ipc.sendSync({ type: 'session:update', ...pendingUpdates });
     }
   });
   ```

6. Create welcome screen `packages/ui/src/renderer/pages/WelcomePage.tsx`:
   ```tsx
   function WelcomePage() {
     return (
       <div className="flex flex-col items-center justify-center h-full gap-6">
         <h1 className="text-2xl font-bold">Welcome to Magenta IDE</h1>
         <p className="text-muted-foreground text-center max-w-md">
           Add a working directory to scan for git repositories,
           then select a repo to start building specs.
         </p>
         <Button onClick={addWorkingDir}>
           + Add working directory
         </Button>
       </div>
     );
   }
   ```

**Files created:**

- `packages/daemon/src/services/sessionStateService.ts`
- `packages/ui/src/renderer/ipc/sessionSync.ts`
- `packages/ui/src/renderer/pages/WelcomePage.tsx`
- `packages/ui/src/renderer/components/SplashScreen.tsx`

**Files modified:**

- `packages/shared/src/ipc.ts` — add session IPC schemas
- `packages/daemon/src/ipc/handlers.ts` — add `session:get`, `session:update` handlers
- `packages/daemon/src/index.ts` — init session state service on startup
- `packages/ui/src/renderer/App.tsx` — restore session on mount, show splash while loading
- `packages/ui/src/renderer/store/repoStore.ts` — trigger session save on selection change
- `packages/ui/src/renderer/store/specStore.ts` — trigger session save on selection change
- `packages/ui/src/renderer/store/uiStore.ts` — trigger session save on panel resize/tab change

**Acceptance criteria:**

- [ ] On first launch: no session_state → welcome screen shown
- [ ] Selecting a repo saves `selectedRepoPath` to DB (debounced 500ms)
- [ ] Selecting a spec saves `selectedSpecPath` to DB
- [ ] Selecting a file saves `selectedFilePath` to DB
- [ ] Panel widths saved on resize (debounced)
- [ ] Active tab saved on switch
- [ ] On relaunch: app restores repo, spec, file, panel sizes, active tab
- [ ] If saved repo is deleted: falls back to welcome screen, clears stale state from DB
- [ ] If saved spec folder is deleted: falls back to repo's spec list
- [ ] If saved file is deleted: falls back to spec flow diagram
- [ ] Final flush on app quit ensures no pending state is lost
- [ ] Splash screen shown briefly while session state loads

---

## Implementation Order

```
K.1 Config Manager ──► K.2 SQLite + Schema ──► K.3 Repo Scanner + Sync ──► K.4 Sidebar Repos
                              │                                                      │
                              │                              K.5 Spec Reader ◄───────┘
                              │                                   │
                              └──► K.10 Session State ◄───────────┤
                                        │                         │
                                        ▼                    K.6 React Flow Diagram
                                   App restore logic              │
                                                     K.7 Right Panel (parallel with K.6)
                                                     K.8 Settings UI (after K.4)
                                                     K.9 Spec Watcher (after K.5)
```

K.10 (Session State) depends on K.2 (SQLite schema) and is wired into K.4/K.5/K.6 (the stores that trigger saves). It should be implemented alongside K.4 so the repo selection immediately persists.

**Sprint plan:**

| Week 1 | Week 2 |
|--------|--------|
| K.1 Config Manager | K.6 React Flow Diagram |
| K.2 SQLite + Drizzle Schema (incl. session_state table) | K.7 Right Panel |
| K.3 Repo Scanner + Background Sync | K.8 Settings UI |
| K.4 Sidebar Repos + K.10 Session State | K.9 Spec File Watcher |
| K.5 Spec Reader + Sidebar Tree | |

---

## Dependencies

```bash
# Daemon
pnpm add simple-git chokidar sql.js ulid --filter @magenta/daemon
pnpm add -D @types/sql.js --filter @magenta/daemon

# UI
pnpm add @xyflow/react --filter @magenta/ui

# Shared
pnpm add zod --filter @magenta/shared
```

---

## Acceptance Criteria (Kick-Start Complete)

- [ ] App launches and restores previous session (repo, spec, file, panel sizes)
- [ ] Falls back gracefully: deleted repo → welcome, deleted spec → repo list, deleted file → spec diagram
- [ ] App launches and loads cached repos from SQLite instantly
- [ ] Background scan syncs DB with disk (adds new, marks missing)
- [ ] Repos displayed in sidebar with name, branch, status badge
- [ ] "Add repo" adds a working directory, triggers scan
- [ ] Settings dialog manages working directories
- [ ] Selecting a repo shows its `specs/` folder contents in sidebar
- [ ] Clicking a spec folder renders a React Flow node diagram
- [ ] Diagram shows 5 pipeline stages auto-detected from folder convention
- [ ] Missing stages shown as dashed gray nodes, review as orange, approved as green
- [ ] Task counts and progress bars on relevant nodes
- [ ] Right panel shows agent activity placeholder and quick action cards
- [ ] Spec file changes detected and UI updated in real-time
