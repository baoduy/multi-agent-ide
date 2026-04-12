# AI Terminal — Implementation Plan

**Source:** TRS-AI-TERMINAL-001 v1.0.0  
**Date:** 2026-04-12 (revised)  
**Adaptation:** Integrates AI Terminal into Magenta IDE's 4-package architecture with session persistence, titlebar tab, and MagentaTerminal reuse.

---

## UX Flow Summary

1. A new **"AI"** tab appears in the titlebar (alongside Specs, Workflow, Worktrees).
2. The AI tab shows a **session list** — each item displays provider icon, repo name, branch/worktree name (or "Workspace" if no repo).
3. Clicking a session **opens a terminal tab** (reuses `MagentaTerminal` interactive mode) and resumes the session via the provider's `--resume` flag.
4. A **"New Session"** action lets the user pick: provider (Claude / Copilot), current selected repo (or workspace fallback), and either current branch or create a new worktree.
5. **cwd logic:** If a repo is selected → launch in that repo (or its worktree). If not → launch at `$HOME/.magenta/workspace`.

---

## Phase 1: Shared Types & IPC Schemas (`packages/shared`)

### Task 1.1 — Add AI Terminal types to `packages/shared/src/aiTerminal.ts` (new file)

```typescript
export const AI_PROVIDERS = ["claude", "copilot"] as const;
export type AIProvider = (typeof AI_PROVIDERS)[number];

export type AISessionStatus = "idle" | "running" | "waiting-input" | "error" | "exited";

// Persisted session record (shown in the session list)
export interface AISessionRecord {
  id: string;                          // UUID
  provider: AIProvider;
  repoPath: string | null;             // null = workspace mode
  repoName: string | null;             // display name
  branch: string | null;               // branch name
  worktreePath: string | null;         // if session runs in a worktree
  worktreeName: string | null;         // display name for the worktree
  cwd: string;                         // resolved working directory
  providerSessionId: string | null;    // provider's own session ID (for --resume)
  status: AISessionStatus;
  createdAt: number;
  lastActiveAt: number;
}

// Config for creating a new session
export interface AISessionConfig {
  provider: AIProvider;
  repoPath?: string;
  branch?: string;
  worktreePath?: string;               // if launching in a worktree
  args?: string[];                     // extra CLI args
  env?: Record<string, string>;
}

// Slash command / CLI flag types (from TRS §5.1)
export type SlashCommandCategory =
  | "session" | "context" | "model" | "permissions"
  | "mcp" | "agents" | "output" | "git" | "navigation" | "info";

export interface SlashCommand {
  command: string;
  aliases?: string[];
  description: string;
  category: SlashCommandCategory;
  args?: string;
  providers: AIProvider[];
}

export interface CliFlag {
  flag: string;
  short?: string;
  aliases?: string[];
  description: string;
  valueHint?: string;
  category: SlashCommandCategory;
  providers: AIProvider[];
}

export interface ProviderMeta {
  name: string;                        // "Claude Code"
  icon: string;                        // emoji or icon ID
  binaryName: string;                  // "claude" | "copilot"
  defaultArgs: string[];
  slashCommands: SlashCommand[];
  cliFlags: CliFlag[];
}
```

Re-export from `packages/shared/src/index.ts`.

### Task 1.2 — Add Zod schemas for AI Terminal IPC in `packages/shared/src/ipc.ts`

**New request types:**

| Request | Fields | Purpose |
|---|---|---|
| `ai-session:create` | `provider`, `repoPath?`, `branch?`, `worktreePath?`, `args?`, `cols`, `rows` | Create + spawn a new AI session |
| `ai-session:resume` | `sessionId`, `cols`, `rows` | Resume an existing session from history |
| `ai-session:input` | `sessionId`, `data` | Send keystrokes to running session |
| `ai-session:resize` | `sessionId`, `cols`, `rows` | Resize PTY |
| `ai-session:stop` | `sessionId` | Kill PTY process |
| `ai-session:list` | *(none)* | List all persisted session records |
| `ai-session:delete` | `sessionId` | Remove session record from history |
| `ai-session:providers` | *(none)* | Get available provider metadata |

**New response/event types:**

| Response | Fields | Purpose |
|---|---|---|
| `ai-session:created` | `session: AISessionRecord` | Session record created + PTY spawned |
| `ai-session:resumed` | `session: AISessionRecord` | Existing session resumed |
| `ai-session:input:ack` | — | Input accepted |
| `ai-session:resize:ack` | — | Resize applied |
| `ai-session:stop:ack` | — | Session stopped |
| `ai-session:list:result` | `sessions: AISessionRecord[]` | All session records |
| `ai-session:deleted` | `sessionId` | Confirmation |
| `ai-session:providers:result` | `providers: Record<AIProvider, ProviderMeta>` | Provider metadata |
| `ai-session:data` | `sessionId`, `data` | Streamed PTY output (push event) |
| `ai-session:status` | `sessionId`, `status` | Status change (push event) |
| `ai-session:exited` | `sessionId`, `exitCode` | Session ended (push event) |

### Task 1.3 — Add `AISessionRecord` Zod schema for DB validation

```typescript
export const AISessionRecordSchema = z.object({
  id: z.string(),
  provider: z.enum(AI_PROVIDERS),
  repoPath: z.string().nullable(),
  repoName: z.string().nullable(),
  branch: z.string().nullable(),
  worktreePath: z.string().nullable(),
  worktreeName: z.string().nullable(),
  cwd: z.string(),
  providerSessionId: z.string().nullable(),
  status: z.enum(["idle", "running", "waiting-input", "error", "exited"]),
  createdAt: z.number().int().nonnegative(),
  lastActiveAt: z.number().int().nonnegative(),
});
```

---

## Phase 2: Database — Session Persistence (`packages/daemon`)

### Task 2.1 — Add `ai_sessions` table migration

**File:** `packages/daemon/src/db/migrations/0007_add_ai_sessions.ts`

```sql
CREATE TABLE ai_sessions (
  id            TEXT PRIMARY KEY,
  provider      TEXT NOT NULL,            -- 'claude' | 'copilot'
  repo_path     TEXT,                     -- NULL = workspace mode
  repo_name     TEXT,
  branch        TEXT,
  worktree_path TEXT,
  worktree_name TEXT,
  cwd           TEXT NOT NULL,
  provider_session_id TEXT,               -- provider's own session ID for resume
  status        TEXT NOT NULL DEFAULT 'idle',
  created_at    INTEGER NOT NULL,
  last_active_at INTEGER NOT NULL
);
```

### Task 2.2 — Create `AISessionRepository.ts` (data access layer)

**File:** `packages/daemon/src/services/AISessionRepository.ts`

```typescript
class AISessionRepository {
  constructor(private readonly db: DatabaseService) {}

  list(): AISessionRecord[]                                // ORDER BY last_active_at DESC
  getById(id: string): AISessionRecord | null
  create(record: AISessionRecord): void
  update(id: string, patch: Partial<AISessionRecord>): void
  delete(id: string): void
}
```

### Task 2.3 — Create `aiSessionMapper.ts`

**File:** `packages/daemon/src/infrastructure/mappers/aiSessionMapper.ts`

Maps SQLite rows ↔ `AISessionRecord`. Follows the same pattern as existing `repoMapper` / `sessionMapper`. Handles snake_case ↔ camelCase conversion.

---

## Phase 3: Daemon — Domain Layer (`packages/daemon/src/domain/`)

### Task 3.1 — Create `providerCommands.ts`

**File:** `packages/daemon/src/domain/providerCommands.ts`

Pure data module — single source of truth for all slash commands and CLI flags from TRS §6.1–6.6.

Contains:
- `SLASH_COMMANDS: SlashCommand[]` — all commands (shared + Claude-only + Copilot-only)
- `CLI_FLAGS: CliFlag[]` — all flags
- Helpers: `getCommandsForProvider()`, `getFlagsForProvider()`, `getSharedCommands()`, `getCommandsByCategory()`

### Task 3.2 — Create `providerRegistry.ts`

**File:** `packages/daemon/src/domain/providerRegistry.ts`

Defines `ProviderMeta` for Claude and Copilot, referencing `providerCommands.ts` for slash commands and flags.

### Task 3.3 — Create `statusDetection.ts`

**File:** `packages/daemon/src/domain/statusDetection.ts`

Pure functions for parsing PTY output into status transitions:
- `detectClaudeStatus(data, currentStatus) → AISessionStatus | null`
- `detectCopilotStatus(data, currentStatus) → AISessionStatus | null`

Detects prompt patterns (`> `, `? `), auth flows, error output.

### Task 3.4 — Create `sessionCwdResolver.ts`

**File:** `packages/daemon/src/domain/sessionCwdResolver.ts`

Pure function to resolve the working directory:

```typescript
export function resolveSessionCwd(config: {
  repoPath?: string;
  worktreePath?: string;
}): string {
  if (config.worktreePath) return config.worktreePath;
  if (config.repoPath) return config.repoPath;
  return path.join(os.homedir(), ".magenta", "workspace");
}
```

---

## Phase 4: Daemon — Infrastructure Layer (`packages/daemon/src/infrastructure/`)

### Task 4.1 — Create `BaseAISession.ts`

**File:** `packages/daemon/src/infrastructure/sessions/BaseAISession.ts`

Abstract class extending `EventEmitter`, implementing `ITerminalSession` (TRS §5.1.5):

- `start(cwd, args, cols, rows)` → spawns PTY via `node-pty` with the provider binary
- `sendInput(text)` → PTY stdin
- `resize(cols, rows)` → PTY resize
- `stop()` → kill PTY
- Emits `data`, `status`, `exit` events
- Calls abstract `detectStatus(data)` on each PTY data chunk
- PTY env: `TERM=xterm-256color`, `COLORTERM=truecolor`

### Task 4.2 — Create `ClaudeSession.ts` + `CopilotSession.ts`

**Files:**
- `packages/daemon/src/infrastructure/sessions/ClaudeSession.ts`
- `packages/daemon/src/infrastructure/sessions/CopilotSession.ts`

Each extends `BaseAISession`, provides `binaryName` and `detectStatus()` delegation.

### Task 4.3 — Create session factories

**Files:**
- `packages/daemon/src/infrastructure/sessions/ClaudeSessionFactory.ts`
- `packages/daemon/src/infrastructure/sessions/CopilotSessionFactory.ts`

Implements `ISessionFactory` — `create(id)` returns a session, `getProviderMeta()` returns metadata.

---

## Phase 5: Daemon — Application Layer (`packages/daemon/src/application/`)

### Task 5.1 — Create `AISessionApplicationService.ts`

**File:** `packages/daemon/src/application/AISessionApplicationService.ts`

This is the main orchestrator. It manages both live PTY sessions and persisted session records.

```typescript
class AISessionApplicationService {
  private readonly liveSessions = new Map<string, ITerminalSession>();
  private readonly factories: Map<AIProvider, ISessionFactory>;

  constructor(
    private readonly bridge: IPCBridge,
    private readonly sessionRepo: AISessionRepository,
    private readonly gitGateway: GitGateway,
  ) { ... }

  // ── Session lifecycle ──

  async createSession(config: AISessionConfig, cols: number, rows: number): Promise<AISessionRecord> {
    // 1. Resolve cwd (repo path → worktree path → workspace fallback)
    // 2. Resolve repo name and branch from gitGateway if repoPath provided
    // 3. mkdir -p the cwd
    // 4. Create AISessionRecord + persist to DB
    // 5. Spawn PTY via factory (provider binary, cwd, default args)
    // 6. Wire PTY events → bridge push events
    // 7. Return the session record
  }

  async resumeSession(sessionId: string, cols: number, rows: number): Promise<AISessionRecord> {
    // 1. Load session record from DB
    // 2. Build args: ["--resume", record.providerSessionId] (or --continue)
    // 3. Spawn PTY in record.cwd
    // 4. Update record status + lastActiveAt
    // 5. Return updated record
  }

  listSessions(): AISessionRecord[] {
    return this.sessionRepo.list();  // ordered by lastActiveAt DESC
  }

  deleteSession(sessionId: string): void {
    this.stop(sessionId);  // kill PTY if live
    this.sessionRepo.delete(sessionId);
  }

  // ── PTY operations ──
  sendInput(sessionId: string, data: string): void { ... }
  resize(sessionId: string, cols: number, rows: number): void { ... }
  stop(sessionId: string): void { ... }

  // ── Provider info ──
  getProviderMeta(): Record<AIProvider, ProviderMeta> { ... }

  // ── Lifecycle ──
  destroyAll(): void { ... }   // shutdown hook — kills all live PTYs
}
```

**Key behaviors:**
- On PTY exit: update session record `status = "exited"` and `lastActiveAt` in DB.
- On PTY data: try to parse the provider's own session ID from output (Claude prints it at startup) and persist to `providerSessionId` for future `--resume`.
- The `cwd` resolution: `worktreePath > repoPath > $HOME/.magenta/workspace`.

---

## Phase 6: Daemon — IPC Handlers & Wiring

### Task 6.1 — Create `aiSessionHandlers.ts`

**File:** `packages/daemon/src/ipc/handlers/aiSessionHandlers.ts`

Thin handlers using `safeHandle()`:

```typescript
export function registerAISessionHandlers({ bridge, aiSessionService }: Deps): void {
  safeHandle(bridge, "ai-session:create",    (req) => aiSessionService.createSession(req, req.cols, req.rows));
  safeHandle(bridge, "ai-session:resume",    (req) => aiSessionService.resumeSession(req.sessionId, req.cols, req.rows));
  safeHandle(bridge, "ai-session:input",     (req) => { aiSessionService.sendInput(req.sessionId, req.data); return { type: "ai-session:input:ack" }; });
  safeHandle(bridge, "ai-session:resize",    (req) => { aiSessionService.resize(req.sessionId, req.cols, req.rows); return { type: "ai-session:resize:ack" }; });
  safeHandle(bridge, "ai-session:stop",      (req) => { aiSessionService.stop(req.sessionId); return { type: "ai-session:stop:ack" }; });
  safeHandle(bridge, "ai-session:list",      ()    => ({ type: "ai-session:list:result", sessions: aiSessionService.listSessions() }));
  safeHandle(bridge, "ai-session:delete",    (req) => { aiSessionService.deleteSession(req.sessionId); return { type: "ai-session:deleted", sessionId: req.sessionId }; });
  safeHandle(bridge, "ai-session:providers", ()    => ({ type: "ai-session:providers:result", providers: aiSessionService.getProviderMeta() }));
}
```

### Task 6.2 — Wire into `DaemonContainer` and `registerHandlers`

**`DaemonContainer.ts`:**
- Instantiate `AISessionRepository` with DB
- Instantiate `AISessionApplicationService` with `bridge`, `sessionRepo`, `gitGateway`
- Add `this.aiSessionService.destroyAll()` to `shutdown()`

**`registerHandlers.ts`:**
- Call `registerAISessionHandlers({ bridge, aiSessionService })`

### Task 6.3 — Update `ResponseForRequest` in UI ipcClient

**File:** `packages/ui/src/renderer/services/ipcClient.ts`

Add type mappings for all `ai-session:*` request/response pairs.

---

## Phase 7: UI — Store (`packages/ui/src/renderer/store/`)

### Task 7.1 — Create `aiSessionStore.ts`

**File:** `packages/ui/src/renderer/store/aiSessionStore.ts`

```typescript
type AISessionStoreState = {
  // Session records (persisted history)
  sessions: AISessionRecord[];
  activeSessionId: string | null;       // currently open in terminal

  // Live PTY output (ephemeral, per active session)
  liveOutput: Record<string, string>;   // sessionId → accumulated output

  // Provider metadata
  providers: Record<AIProvider, ProviderMeta> | null;

  // Actions
  fetchSessions: () => Promise<void>;
  createSession: (config: AISessionConfig, cols: number, rows: number) => Promise<AISessionRecord>;
  resumeSession: (sessionId: string, cols: number, rows: number) => Promise<AISessionRecord>;
  deleteSession: (sessionId: string) => Promise<void>;
  setActiveSession: (sessionId: string | null) => void;

  sendInput: (sessionId: string, data: string) => Promise<void>;
  resize: (sessionId: string, cols: number, rows: number) => Promise<void>;
  stopSession: (sessionId: string) => Promise<void>;
  fetchProviders: () => Promise<void>;

  // Internal (called by event subscriptions)
  appendOutput: (sessionId: string, data: string) => void;
  updateStatus: (sessionId: string, status: AISessionStatus) => void;
  setExited: (sessionId: string, exitCode: number) => void;

  initializeSubscriptions: () => void;
};
```

Uses `sendOrThrow` for IPC. Uses `createSubscriptionInitializer` for push events (`ai-session:data`, `ai-session:status`, `ai-session:exited`).

---

## Phase 8: UI — Titlebar & Tab Integration

### Task 8.1 — Add "AI" to `BuiltinTabId` and `MAIN_TABS`

**Files:**
- `packages/shared/src/constants.ts` — add `"ai"` to `MAIN_TABS`
- `packages/ui/src/renderer/components/main/TabBar.tsx` — add `"ai"` to `BuiltinTabId`
- `packages/ui/src/renderer/components/titlebar/TitleBar.tsx` — add `{ id: "ai", label: "AI" }` to `builtinTabs` array

This makes "AI" appear as a clickable tab in the center of the titlebar, matching the exact same visual pattern as Specs / Workflow / Worktrees.

### Task 8.2 — Add `AISessionsView` to `Main.tsx` tab dispatch

**File:** `packages/ui/src/renderer/pages/Main.tsx`

Add a new case in `renderTabContent()`:

```typescript
case "ai":
  return <AISessionsView repoPath={activeRepoPath} repoName={repoName} />;
```

---

## Phase 9: UI — AI Sessions View (main content area)

### Task 9.1 — Create `AISessionsView.tsx` (session list + terminal)

**File:** `packages/ui/src/renderer/components/ai-terminal/AISessionsView.tsx`

This is the main view rendered when the "AI" tab is active. It has two states:

**State A — Session List (no active session):**
- Header with "New Session" button
- List of `AISessionRecord` items, ordered by `lastActiveAt` DESC
- Each item shows:
  - Provider icon (🟠 Claude / 🟢 Copilot)
  - Repo name (or "Workspace" if `repoPath === null`)
  - Branch name or worktree name
  - Status badge (running / exited / idle)
  - Relative timestamp ("2 hours ago")
- Clicking an item → calls `resumeSession()` → switches to State B
- Swipe/button to delete a session record

**State B — Active Terminal (session open):**
- Back button to return to session list
- Session header: provider icon + repo + branch/worktree
- `MagentaTerminal` (interactive mode, `mode="ai-agent"`) fills the remaining space
- Status bar at bottom: `AISessionStatus` + provider name

Layout sketch:
```
┌─────────────────────────────────────┐
│ ← Back    🟠 Claude · my-repo/main │  ← session header
├─────────────────────────────────────┤
│                                     │
│    MagentaTerminal (ai-agent mode)  │  ← full-height xterm.js
│                                     │
├─────────────────────────────────────┤
│ ● Running    Claude Code            │  ← status bar
└─────────────────────────────────────┘
```

### Task 9.2 — Create `AISessionListItem.tsx`

**File:** `packages/ui/src/renderer/components/ai-terminal/AISessionListItem.tsx`

Memoized (`React.memo`) list item component for the session list. Follows rerender prevention patterns — no inline arrow functions.

Displays:
- Provider icon (color-coded dot matching legend: `#C15F3C` Claude, `#3d7a2a` Copilot)
- Repo name or "Workspace"
- Branch/worktree label
- Status indicator
- "Last active" relative time
- Delete button (on hover)

### Task 9.3 — Create `NewAISessionDialog.tsx`

**File:** `packages/ui/src/renderer/components/dialogs/NewAISessionDialog.tsx`

Modal dialog for creating a new AI session. Fields:

1. **Provider selector** — toggle between Claude and Copilot (two buttons)
2. **Repository** — shows currently selected repo (from `useRepoStore.activeRepoPath`), or "No repo selected — will use workspace"
3. **Branch / Worktree** — radio choice:
   - "Current branch" (shows branch name)
   - "New worktree" → text input for worktree name (same pattern as `AddWorktreeDialog`)
4. **Create** button

On submit:
1. If "New worktree" selected → call `worktree:create` IPC first, get `worktreePath`
2. Call `aiSessionStore.createSession({ provider, repoPath, branch, worktreePath }, cols, rows)`
3. Close dialog → switch to terminal view (State B)

If no repo is selected, hide the branch/worktree selector entirely — session launches in `$HOME/.magenta/workspace`.

---

## Phase 10: UI — MagentaTerminal AI Agent Mode

### Task 10.1 — Extend `MagentaTerminal` props for AI agent mode

**File:** `packages/ui/src/renderer/components/common/MagentaTerminal.tsx`

Add new props:

```typescript
interface MagentaTerminalProps {
  // ... existing props unchanged ...
  mode?: "shell" | "ai-agent";            // default: "shell"
  aiSessionId?: string;                    // required when mode="ai-agent"
  aiProvider?: AIProvider;                 // required when mode="ai-agent"
}
```

When `mode="ai-agent"`:
- `buildTab()` does NOT call `terminalStore.spawn()`. Instead it connects to the already-spawned AI session via `aiSessionId`.
- Keyboard input → `aiSessionStore.sendInput(aiSessionId, data)`
- Resize → `aiSessionStore.resize(aiSessionId, cols, rows)`
- Output comes from `aiSessionStore.liveOutput[aiSessionId]`
- Tab label shows provider icon instead of generic "Terminal"
- Single-tab mode (no tab bar) — the session list is the tab management

Existing `mode="shell"` (default) behavior is completely unchanged.

### Task 10.2 — Create `AIStatusBar.tsx`

**File:** `packages/ui/src/renderer/components/ai-terminal/AIStatusBar.tsx`

Thin bar below the terminal:
- Color-coded status dot + label (Running / Waiting / Error / Exited)
- Provider name
- Session duration

---

## Phase 11: Daemon — Provider Command Registry (deferred, not blocking)

### Task 11.1 — Create `providerCommands.ts`

Populate all slash commands and CLI flags from TRS §6.1–6.6. This is needed for the future `CommandPalette` component but is **not blocking** for the core session list + terminal flow.

### Task 11.2 — Create `CommandPalette.tsx` (future)

Searchable slash command overlay triggered by keyboard shortcut. Can be added after the core flow ships.

---

## Phase 12: Testing

### Task 12.1 — Domain unit tests
- `sessionCwdResolver.test.ts` — worktree > repo > workspace fallback
- `statusDetection.test.ts` — prompt pattern parsing
- `providerCommands.test.ts` — filter helpers

### Task 12.2 — Application service tests
- `AISessionApplicationService.test.ts` — mock factories + repo, verify create/resume/delete lifecycle, cwd resolution, DB persistence

### Task 12.3 — IPC handler tests
- `aiSessionHandlers.test.ts` — verify thin delegation

### Task 12.4 — Store tests
- `aiSessionStore.test.ts` — mock `sendOrThrow`, verify state transitions

### Task 12.5 — Integration acceptance
- AC-01: "AI" tab appears in titlebar, clickable
- AC-02: Session list loads from DB, displays provider/repo/branch correctly
- AC-03: Creating a new session spawns PTY, shows terminal
- AC-04: Resuming a session reconnects to provider with `--resume`
- AC-05: cwd resolves: worktree > repo > `~/.magenta/workspace`
- AC-06: New worktree option creates worktree before spawning agent
- AC-07: Multiple sessions can exist, only one active at a time
- AC-08: Closing terminal updates session status in DB
- AC-09: Session list updates on create/delete/status change

---

## Implementation Order

| # | Phase | Est. Effort | Dependencies | Parallelizable |
|---|-------|-------------|-------------|----------------|
| 1 | Phase 1 — Shared types + IPC schemas | Small | None | — |
| 2 | Phase 2 — Database migration + repository | Small | Phase 1 | — |
| 3 | Phase 3 — Domain (cwd resolver, status detection, commands) | Small | Phase 1 | Yes (3 files) |
| 4 | Phase 4 — Infrastructure (BaseAISession, Claude/Copilot sessions, factories) | Medium | Phase 1, 3 | — |
| 5 | Phase 5 — Application service | Medium | Phase 2, 4 | — |
| 6 | Phase 6 — IPC handlers + DaemonContainer wiring | Small | Phase 5 | — |
| 7 | Phase 7 — UI store | Small | Phase 6 | — |
| 8 | Phase 8 — Titlebar "AI" tab + Main.tsx routing | Small | Phase 7 | — |
| 9 | Phase 9 — AI Sessions View + List + New Session Dialog | Medium-Large | Phase 8 | Yes (3 components) |
| 10 | Phase 10 — MagentaTerminal ai-agent mode + StatusBar | Medium | Phase 9 | — |
| 11 | Phase 11 — Command registry + palette (deferred) | Medium | Phase 10 | — |
| 12 | Phase 12 — Testing | Medium | All above | Yes |

**Critical path:** Phases 1→2→4→5→6→7→8→9→10 (the core session list + terminal flow).  
**Phases 3 and 11** can be deferred or parallelized — they add richness but don't block the core UX.

---

## Files Summary

### New files (~18)

| File | Package | Phase |
|---|---|---|
| `src/aiTerminal.ts` (types) | shared | 1 |
| `src/db/migrations/0007_add_ai_sessions.ts` | daemon | 2 |
| `src/services/AISessionRepository.ts` | daemon | 2 |
| `src/infrastructure/mappers/aiSessionMapper.ts` | daemon | 2 |
| `src/domain/sessionCwdResolver.ts` | daemon | 3 |
| `src/domain/statusDetection.ts` | daemon | 3 |
| `src/domain/providerCommands.ts` | daemon | 3 |
| `src/domain/providerRegistry.ts` | daemon | 3 |
| `src/infrastructure/sessions/BaseAISession.ts` | daemon | 4 |
| `src/infrastructure/sessions/ClaudeSession.ts` | daemon | 4 |
| `src/infrastructure/sessions/CopilotSession.ts` | daemon | 4 |
| `src/infrastructure/sessions/ClaudeSessionFactory.ts` | daemon | 4 |
| `src/infrastructure/sessions/CopilotSessionFactory.ts` | daemon | 4 |
| `src/application/AISessionApplicationService.ts` | daemon | 5 |
| `src/ipc/handlers/aiSessionHandlers.ts` | daemon | 6 |
| `src/renderer/store/aiSessionStore.ts` | ui | 7 |
| `src/renderer/components/ai-terminal/AISessionsView.tsx` | ui | 9 |
| `src/renderer/components/ai-terminal/AISessionListItem.tsx` | ui | 9 |
| `src/renderer/components/dialogs/NewAISessionDialog.tsx` | ui | 9 |
| `src/renderer/components/ai-terminal/AIStatusBar.tsx` | ui | 10 |

### Modified files (~8)

| File | Change | Phase |
|---|---|---|
| `packages/shared/src/ipc.ts` | Add `ai-session:*` schemas | 1 |
| `packages/shared/src/constants.ts` | Add `"ai"` to `MAIN_TABS` | 1 |
| `packages/shared/src/index.ts` | Re-export new types | 1 |
| `packages/daemon/src/DaemonContainer.ts` | Wire AISessionApplicationService | 6 |
| `packages/daemon/src/ipc/registerHandlers.ts` | Register AI session handlers | 6 |
| `packages/ui/src/renderer/services/ipcClient.ts` | Update `ResponseForRequest` | 6 |
| `packages/ui/src/renderer/components/titlebar/TitleBar.tsx` | Add "AI" to `builtinTabs` | 8 |
| `packages/ui/src/renderer/pages/Main.tsx` | Add `case "ai"` to tab dispatch | 8 |
| `packages/ui/src/renderer/components/common/MagentaTerminal.tsx` | Add `mode="ai-agent"` | 10 |
