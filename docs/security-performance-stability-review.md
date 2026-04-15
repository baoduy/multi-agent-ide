# Magenta IDE — Security, Performance & Stability Review

> Deep code, architecture, and security audit of the full codebase.
> Every finding is grounded in specific files and line numbers.

---

## 1. Executive Summary

Magenta IDE is a well-structured Electron 30 + React 19 desktop app with a clear layered architecture, solid IPC validation at the boundary (Zod discriminated unions), good use of the composition-root pattern, and thoughtful UX details. The code quality is above average for a project of this size.

However, several **critical and high-severity issues** demand immediate attention:

1. **Unrestricted filesystem access** — `file:read`, `file:write`, and `dir:list` accept arbitrary paths with no directory allowlist, enabling read/write anywhere on disk.
2. **Shell injection via configurable command template** — `OnboardApplicationService` passes a user-editable config value to `spawn(cmd, { shell: true })`, enabling arbitrary shell command execution.
3. **Architectural split-brain** — The production daemon entry point (`daemon-ipc-worker.ts`) manually re-wires all services, entirely bypassing the `DaemonContainer` composition root, creating two diverging codepaths.
4. **Non-atomic database persistence** — `SqliteCompat.save()` writes the database with a naked `fs.writeFileSync`, risking corruption on process crash.
5. **Silent event loss** — Push events emitted from `gitOperationHandlers.ts` (`repo:force-reload:started`) are not in the worker's forwarding list, so they never reach the renderer.

---

## 2. Security Findings

---

### [CRITICAL] Path Traversal / Unrestricted Filesystem Access

**Files:** `packages/daemon/src/infrastructure/FileSystemGateway.ts:17–65`, `packages/daemon/src/ipc/handlers/fileHandlers.ts`

**Description:**
`file:read`, `file:write`, and `dir:list` IPC endpoints accept an arbitrary path string, resolve it with `path.resolve()`, and operate on it without verifying the result is inside any permitted root directory. Any renderer-side code (or XSS exploit in a rendered markdown/HTML) can:
- Read sensitive files: `~/.ssh/id_rsa`, `~/.aws/credentials`, `~/.magenta/config.json`
- Write files to arbitrary locations: `/etc/hosts`, shell rc files, `~/.ssh/authorized_keys`

```typescript
// FileSystemGateway.readFile — no containment check
const resolved = path.resolve(filePath);  // resolves ../../etc/passwd just fine
const content = fs.readFileSync(resolved, "utf-8");
```

The Zod schema only validates `filePath: z.string()` — no pattern restriction.

**Recommended fix:**
```typescript
function assertPathAllowed(resolved: string, allowedRoots: string[]): void {
  const allowed = allowedRoots.some(root =>
    resolved === root || resolved.startsWith(root + path.sep)
  );
  if (!allowed) throw new AppError("VALIDATION_ERROR", "Path is outside allowed directories");
}
```
Populate `allowedRoots` from `configManager.getConfig().workingDirs` plus per-session worktree paths. Add this check to all three gateway methods.

---

### [CRITICAL] Shell Command Injection via Configurable Template

**Files:** `packages/daemon/src/application/OnboardApplicationService.ts:195–214, 351–367`

**Description:**
`buildCommand()` substitutes `{agent}` into a command template read from user config (`specifyCommand`), then passes the resulting string to `spawn(fullCommand, { shell: true })`. Since `specifyCommand` is updated via the `config:update` IPC endpoint (which accepts `z.record(z.string(), z.unknown())`), any user (or malicious IPC event) can set it to `"rm -rf /;{agent}"` and trigger arbitrary shell command execution.

```typescript
// config:update accepts arbitrary record — no key allowlist
z.object({ type: z.literal("config:update"), config: z.record(z.string(), z.unknown()) })
// ... and later:
const child = spawn(fullCommand, { cwd, shell: true, ... });  // shell interprets the string
```

**Recommended fix:**
1. Never use `shell: true` — split the command into tokens and use the array form of `spawn`.
2. Re-validate `specifyCommand` against a strict safe-characters allowlist before executing.
3. Restrict `config:update` to an explicit allowlist of mutable keys.

---

### [HIGH] `config:update` Accepts Arbitrary Keys (No Allowlist)

**Files:** `packages/shared/src/ipc.ts`, `packages/daemon/src/ipc/handlers/configHandlers.ts:30–35`, `packages/daemon/src/config/ConfigManager.ts:50–54`

**Description:**
`config:update` accepts `z.record(z.string(), z.unknown())` — any key-value pairs. `ConfigManager.updateConfig()` does `{ ...this.config, ...partial }`. A renderer can inject arbitrary keys into the persisted config file, controllable by any future code that reads extra config keys (proxy URLs, API keys, plugin paths).

**Recommended fix:** Validate `msg.config` through `MagentaConfigSchema.partial()` inside the handler before passing to `updateConfig`, or define a stricter `UpdateableConfigSchema` that only permits leaf config fields.

---

### [HIGH] Hardened Runtime Disabled on macOS

**File:** `electron-builder.yml:76`

**Description:**
`hardenedRuntime: false` disables macOS App Sandbox and hardened runtime protections. Without it, the app is vulnerable to DYLIB injection attacks and cannot pass macOS notarization. This matters given the app executes AI binaries sourced from user PATH.

**Recommended fix:** Enable `hardenedRuntime: true` with required entitlements (`com.apple.security.cs.allow-jit` if needed by node-pty).

---

### [HIGH] Arbitrary `cwd` for Terminal Spawn

**Files:** `packages/shared/src/ipc.ts`, `packages/daemon/src/ipc/handlers/terminalHandlers.ts:15–20`

**Description:**
`terminal:spawn` accepts any `cwd: z.string()` and spawns a full shell there with no directory containment or rate limiting on concurrent sessions.

**Recommended fix:** Validate `cwd` against the same allowed-roots allowlist as file operations. Add a configurable cap on concurrent terminal sessions.

---

### [HIGH] Arbitrary `args` Array Passed to AI Binary

**Files:** `packages/shared/src/ipc.ts`, `packages/daemon/src/application/AISessionApplicationService.ts:60–62`

**Description:**
`ai-session:create` accepts `args: z.array(z.string()).optional()` which are appended verbatim to the AI binary's argv. Dangerous flags like `--dangerously-skip-permissions` (Claude) or `--allow-all` (Copilot) can be injected through this vector.

**Recommended fix:** Remove the `args` passthrough entirely or maintain an explicit allowlist. Permission modes must only be controlled through the validated `permissionMode` enum.

---

### [MEDIUM] Git Ref/Path Injection in `gitfile:read`

**Files:** `packages/daemon/src/infrastructure/SpecGitGateway.ts:130`, `packages/daemon/src/ipc/handlers/specHandlers.ts:20–26`

**Description:**
`gitfile:read` passes `ref` and `relativePath` directly to `git.show([`${ref}:${relativePath}`])`. A crafted `relativePath` like `../../.git/config` allows reading arbitrary git-tracked content. `ref` is not validated against a branch-name character allowlist.

**Recommended fix:** Validate `ref` against a strict pattern (branch name characters only). Normalize and validate `relativePath` to ensure it cannot start with `..`.

---

### [MEDIUM] Log File Contents Exposed to Renderer

**Files:** `packages/main/src/index.ts`, `packages/main/src/preload.ts`

**Description:**
`magenta:read-log` exposes the full application log file to the renderer. Logs include full filesystem paths, IPC request types, git operation results, and daemon stderr — unnecessary surface area for an XSS scenario.

**Recommended fix:** Remove the log-reading endpoint or sanitize returned content to strip paths and credential-adjacent data.

---

### [LOW] Error Messages Leak Full Filesystem Paths

**Files:** `packages/daemon/src/infrastructure/FileSystemGateway.ts:23, 38, 51`, `packages/daemon/src/errors/AppError.ts`

**Description:**
`AppError` messages sent back to the renderer include full absolute paths: `"File not found: /Users/johnsmith/.magenta/..."`. In a multi-user or shared-workspace context these leak the system username and directory structure.

**Recommended fix:** Sanitize error messages to use relative or redacted paths before serializing over IPC.

---

## 3. Performance Findings

---

### [HIGH] N+1 SQL Queries in `SpecRepository.getByRepoPath()`

**File:** `packages/daemon/src/services/SpecRepository.ts:38–66`

**Description:**
For each spec returned from the `specs` table, a separate `SELECT` is issued against `spec_stages`. For a repo with 20 specs, this is 21 queries per `spec:list` call — and this is called on every tab switch, repo selection, and spec sync completion.

```typescript
for (const specRow of specRows) {
  const stageRows = this.databaseService.getSqlite()
    .prepare(`SELECT ... FROM spec_stages WHERE spec_id = @specId`)
    .all({ specId });  // one query per spec
```

**Recommended fix:** Use a single `LEFT JOIN` query and group results by `spec_id` in application code:
```sql
SELECT s.*, ss.name as stage_name, ss.status as stage_status
FROM specs s
LEFT JOIN spec_stages ss ON ss.spec_id = s.id
WHERE s.repo_id = @repoId
ORDER BY s.is_current_branch DESC, s.name ASC
```

---

### [HIGH] `SqliteCompat.run()` Issues 3 DB Round-Trips per Write

**File:** `packages/daemon/src/db/SqliteCompat.ts:97–112`

**Description:**
Every call to `prepare(...).run(...)` executes three sql.js operations: the mutation, `SELECT changes()`, and `SELECT last_insert_rowid()`. Since `run()` is called very frequently (every repo upsert, session update, spec stage write), this triples effective write overhead.

**Recommended fix:** Most callers never use `lastInsertRowid`. Provide a `runChangesOnly()` variant or use the sql.js stmt API (`stmt.run(); stmt.reset()`) which avoids the double SELECT.

---

### [MEDIUM] Sequential Worktree Fetch in `fetchWorktreesForAll()`

**File:** `packages/ui/src/renderer/store/worktreeStore.ts:93–115`

**Description:**
Worktrees for all repos are fetched sequentially in a `for...of` loop. For 10 repos, this serializes 10 IPC round-trips that could be parallelized.

**Recommended fix:** Use `Promise.allSettled()` to issue all requests in parallel.

---

### [MEDIUM] `scopedStore` In `localStorage.ts` Has No Eviction

**File:** `packages/ui/src/renderer/services/localStorage.ts:105–145`

**Description:**
`scopedStore` creates a `Map<string, LocalStore<T>>` that grows indefinitely as new scope keys (repo paths, spec paths) are accessed. A user with many repos will accumulate many dead store instances in memory for the app's lifetime.

**Recommended fix:** Use a `WeakRef`-based LRU cache or evict entries when the scoped key's associated repo is deselected.

---

### [MEDIUM] Status Detection Runs Regex on Every Output Chunk

**File:** `packages/daemon/src/domain/statusDetection.ts`, `packages/daemon/src/infrastructure/sessions/BaseAISession.ts:153–160`

**Description:**
`detectClaudeStatus()` and `detectCopilotStatus()` are invoked on every 8ms batched PTY data chunk. The `/error:/i` regex matches common output (e.g., "no errors found"), causing spurious `error` status transitions and visible status flapping.

**Recommended fix:** Make status transitions monotonic. Only set `error` on process exit with non-zero code. Run detection at lower frequency (e.g., 500ms debounce).

---

### [LOW] `RepoScanner.scan()` Blocks the Event Loop

**File:** `packages/daemon/src/services/RepoScanner.ts:28–72`

**Description:**
`fs.existsSync()`, `fs.lstatSync()`, and `fs.readdirSync()` are synchronous. In a working directory with many folders, this blocks the Node.js event loop during scanning, delaying all other IPC responses.

**Recommended fix:** Refactor to use `fs.promises` (`readdir`, `lstat`) with bounded concurrency (e.g., `p-limit`).

---

## 4. Stability / Reliability Findings

---

### [CRITICAL] Non-Atomic Database Write in `SqliteCompat.save()`

**File:** `packages/daemon/src/db/SqliteCompat.ts:150–160`

**Description:**
`save()` writes the full in-memory database to disk with a single `fs.writeFileSync(filePath, buffer)`. A crash mid-write leaves the database file corrupted and the application loses all data on next start. Notably, `ConfigManager.writeConfig()` already uses the correct temp-file + rename pattern but `SqliteCompat` does not.

**Recommended fix:**
```typescript
const tempPath = `${this.filePath}.tmp`;
fs.writeFileSync(tempPath, buffer);
fs.renameSync(tempPath, this.filePath);  // atomic on POSIX
```

---

### [HIGH] Push Events from `gitOperationHandlers.ts` Never Reach Renderer

**Files:** `packages/daemon/src/ipc/handlers/gitOperationHandlers.ts:24, 49`, `packages/daemon/src/daemon-ipc-worker.ts:187–209`

**Description:**
`git:pull` and `git:commit` handlers emit `repo:force-reload:started` to trigger a UI refresh, but `"repo:force-reload:started"` is absent from `pushEventTypes` in `daemon-ipc-worker.ts`. These events are never forwarded to the renderer. After a commit or pull, the UI repo state does not auto-refresh.

**Recommended fix:** Add `"repo:force-reload:started"` to `pushEventTypes`.

---

### [HIGH] `daemon-ipc-worker.ts` Does Not Use `DaemonContainer`

**Files:** `packages/daemon/src/daemon-ipc-worker.ts`, `packages/daemon/src/DaemonContainer.ts`

**Description:**
The production daemon entry point manually duplicates the entire service construction from `DaemonContainer`. Any service added to `DaemonContainer` must be manually mirrored in the worker. The worker's `gracefulShutdown()` also maintains a separate `shutdownServices` object that can diverge from the container. `DaemonContainer` is effectively dead code in production.

**Recommended fix:** Replace the 60+ lines of manual construction in `daemon-ipc-worker.ts` with `DaemonContainer.create()` and expose lifecycle methods on the container.

---

### [HIGH] Onboard Fire-and-Forget Swallows Rejections

**Files:** `packages/daemon/src/ipc/handlers/onboardHandlers.ts:10–13`

**Description:**
```typescript
void onboardService.onboard(msg.repoPath, msg.aiAgent, msg.useWorktree);
return { type: "repo:onboard:started", repoPath: msg.repoPath };
```
If `onboard()` rejects before the process starts (e.g., `createOnboardWorktree()` throws), the rejection is silently swallowed and the UI never receives a `repo:onboard:complete` event, leaving it stuck in a "starting…" state indefinitely.

**Recommended fix:**
```typescript
onboardService.onboard(...).catch(err =>
  bridge.emit({ type: "repo:onboard:complete", repoPath, success: false, error: err.message })
);
```

---

### [HIGH] `mergeWorktree()` Modifies Working Branch Without Dirty State Check

**File:** `packages/daemon/src/infrastructure/GitGateway.ts:133–148`

**Description:**
The merge operation calls `git.checkout(targetBranch)` without first checking if the working tree is clean. If the user has uncommitted changes on their current branch, the checkout fails with a confusing error rather than a clear `WORKTREE_CONFLICT`.

**Recommended fix:** Call `git.status()` before checkout and throw `AppError("WORKTREE_CONFLICT", "Cannot merge: you have uncommitted changes")` if the tree is dirty.

---

### [MEDIUM] Missing Size Limit in `SessionSyncGateway.readJsonlLines()`

**File:** `packages/daemon/src/infrastructure/SessionSyncGateway.ts:82–97`

**Description:**
JSONL files are read in their entirety with no size limit. A Claude Code session with thousands of messages could be hundreds of MB. The `lines: string[]` array accumulates all lines before returning, negating the benefit of streaming.

**Recommended fix:** Add `if (stat.size > MAX_SESSION_FILE_BYTES) return []` before reading, and implement a line limit (e.g., last N lines for large files).

---

### [MEDIUM] `validateSession()` in `sessionStore.ts` Is Incomplete

**File:** `packages/ui/src/renderer/store/sessionStore.ts:17–24`

**Description:**
`validateSession()` only checks that `mainTab` is a known value. Other fields (`selectedRepoPath`, `sidebarWidth`, etc.) are cast directly without type validation. A corrupted `localStorage` entry where `sidebarWidth` is `"hello"` is silently accepted and can cause downstream rendering errors.

**Recommended fix:** Use `SessionStateSchema.partial().parse(raw)` to validate the stored object, or add explicit field type checks.

---

### [MEDIUM] No Timeout on Git Operations

**Files:** `packages/daemon/src/infrastructure/GitGateway.ts`, `packages/daemon/src/infrastructure/GitOperationsGateway.ts`, `packages/daemon/src/infrastructure/SpecGitGateway.ts`

**Description:**
All `simple-git` operations have no timeout. A `git fetch` on a slow/unreachable remote, or `git worktree list` on a stale NFS mount, hangs indefinitely — blocking the `BackgroundJobManager` drain loop and preventing all subsequent background jobs from running.

**Recommended fix:**
```typescript
import { simpleGit, SimpleGitOptions } from "simple-git";
const options: Partial<SimpleGitOptions> = { timeout: { block: 30000 } };
```
Configure this in `createGit.ts` so it applies universally.

---

## 5. Architecture Findings

---

### [CRITICAL] Production Entry Point Bypasses Composition Root

**Files:** `packages/daemon/src/daemon-ipc-worker.ts:55–115`, `packages/daemon/src/DaemonContainer.ts`

**Description:**
`DaemonContainer` is the declared composition root per `CLAUDE.md`, but `daemon-ipc-worker.ts` (the actual production entry point) never instantiates it. Instead it manually constructs every service, creating a second wiring path that can silently diverge. New services added to `DaemonContainer` are simply absent from production unless the developer remembers to also update the worker. `DaemonContainer` is effectively dead code.

**Recommended fix:** Replace the 60+ lines of manual construction in `daemon-ipc-worker.ts` with `DaemonContainer.create()`. Expose a `registerAllHandlers()` and `shutdown()` method on the container.

---

### [HIGH] Application Services Directly Access Filesystem and Spawn Processes

**Files:**
- `AISessionApplicationService.ts:39, 101` — `fs.mkdir()`
- `WorktreeApplicationService.ts:28` — `fs.existsSync()`
- `OnboardApplicationService.ts:151–280` — `spawn()`, `readFileSync()`, `existsSync()`, `mkdirSync()`, `appendFileSync()`, direct `createGit()` calls

**Description:**
Per `CLAUDE.md`: *"Infrastructure I/O wrapped in a Gateway class"*. These application services directly perform filesystem I/O and spawn child processes, bypassing the infrastructure layer. `OnboardApplicationService` is especially egregious — it is essentially an infrastructure class masquerading as an application service.

**Recommended fix:**
- Move git operations in `OnboardApplicationService` into a new `OnboardGateway` or extend `GitGateway`.
- Move file reads (integration.json, init-options.json) into `FileSystemGateway`.
- Move `spawn()` calls into a `ProcessGateway` injectable into the service.
- Move `fs.mkdir()` in `AISessionApplicationService` into `FileSystemGateway`.

---

### [HIGH] `services/` Layer Classes Directly Use `IPCBridge`

**Files:**
- `ScanQueue.ts:43, 64, 79, 88, 98` — `this.bridge.emit(...)`
- `SpecSyncService.ts:80, 89` — `this.bridge.emit(...)`

**Description:**
`ScanQueue` and `SpecSyncService` are in the `services/` (data access) layer but directly import and use `IPCBridge`, creating an upward dependency: `services/ → ipc/`. The IPC layer should depend on services, not the reverse.

**Recommended fix:** These services should emit typed domain events via `EventEmitter` or a callback interface that the IPC layer subscribes to — analogous to how `BackgroundJobManager` emits `job:started`/`job:completed`.

---

### [HIGH] `registerHandlers.ts` Instantiates Infrastructure Singletons Outside Composition Root

**File:** `packages/daemon/src/ipc/registerHandlers.ts:42–46`

**Description:**
`registerHandlers()` instantiates `SpecGitGateway`, `FileSystemGateway`, `SpecReader`, and `RepoScanner` — creating fresh instances not in `DaemonContainer`, which cannot be shared or injected. This also creates a second `RepoScanner` instance alongside the one in `DaemonContainer`.

**Recommended fix:** Move all infrastructure instantiation to `DaemonContainer`. Pass them through `HandlerContext`.

---

### [MEDIUM] Git Handlers Co-Located in `specHandlers.ts` (Cohesion Violation)

**File:** `packages/daemon/src/ipc/handlers/specHandlers.ts:19–28`

**Description:**
`registerSpecHandlers()` registers `git:user` and `gitfile:read` — handlers that have nothing to do with spec business logic. They are co-located here presumably because `SpecApplicationService` has access to `SpecGitGateway`.

**Recommended fix:** Create `registerGitReadHandlers()` or move these two handlers into a dedicated git-metadata handler file.

---

### [MEDIUM] `SpecSyncService.syncRepo()` Emits Success Event on Failure

**File:** `packages/daemon/src/services/SpecSyncService.ts:86–95`

**Description:**
```typescript
} catch (error) {
  console.error(`${TAG} Failed to sync specs:`, error);
  this.bridge.emit({ type: "spec:sync:complete" as const, repoPath }); // ← same as success
}
```
On sync failure, `spec:sync:complete` is emitted just as on success. The renderer has no way to distinguish a successful sync from a failed one.

**Recommended fix:** Add `success: boolean` and optional `error: string` to `spec:sync:complete`, or emit a distinct `spec:sync:failed` event.

---

### [LOW] `setPermissionMode()` Comment vs. Implementation Mismatch

**File:** `packages/daemon/src/application/AISessionApplicationService.ts:130–155`

**Description:**
The JSDoc says *"sending Shift+Tab key sequences to cycle through available modes"*, but the implementation only updates the DB record and emits a push event — it never actually sends any input to the live PTY. The AI CLI tool is not notified of the mode change.

**Recommended fix:** Either send the actual Shift+Tab sequence (`\x1b[Z`) to the session's PTY, or update the comment to accurately describe that this only persists the preference.

---

## 6. Code Quality Findings

---

### [HIGH] `daemon-ipc-worker.ts` Uses `(ipcBridge as any).on(...)` Cast

**File:** `packages/daemon/src/daemon-ipc-worker.ts:208`

**Description:**
Push event listeners are registered using `(ipcBridge as any).on(eventType, ...)`, bypassing TypeScript's type system. This exists because the worker is not using `DaemonContainer` and had to work around the public `IPCBridge` API.

**Recommended fix:** This cast disappears once the worker is refactored to use `DaemonContainer`.

---

### [HIGH] `configHandlers.ts` Has Redundant Cast (Anti-Pattern From CLAUDE.md)

**File:** `packages/daemon/src/ipc/handlers/configHandlers.ts:33`

```typescript
const config = configManager.updateConfig(msg.config as Record<string, unknown>);
```

`CLAUDE.md` explicitly bans `payload as Record<string, unknown>` in handlers. Zod has already validated `msg.config` to be `Record<string, unknown>`, making the cast both redundant and misleading.

**Recommended fix:** Remove the cast.

---

### [MEDIUM] `sanitizeName()` Empty String Not Checked in `OnboardApplicationService`

**Files:** `packages/daemon/src/domain/sanitizeName.ts`, `packages/daemon/src/application/OnboardApplicationService.ts:231–236`

**Description:**
`sanitizeName()` on a string of all special characters (e.g., `"!@#$%"`) returns `""`. `WorktreeApplicationService` correctly guards against this, but `OnboardApplicationService.createOnboardWorktree()` uses the result directly in path and branch name construction without checking for empty string.

**Recommended fix:** Add the same empty-string guard used in `WorktreeApplicationService`.

---

### [MEDIUM] Status Detection Has False Positives

**File:** `packages/daemon/src/domain/statusDetection.ts`

**Description:**
```typescript
if (/error:/i.test(data) && currentStatus !== "error") {
  return "error";
}
```
This matches any output containing `"error:"` — including tool output, code snippets, and informational messages like `"Retry on error: false"`. This causes status flickering visible to the user.

**Recommended fix:** Scope error detection to structured output patterns from the specific CLI tools, or only set error status on process exit with non-zero code.

---

### [MEDIUM] `SpecRepository.syncSpecs()` Does Not Use a Transaction

**File:** `packages/daemon/src/services/SpecRepository.ts:70–195`

**Description:**
Multiple DELETE and INSERT operations are performed without wrapping them in `DatabaseService.transaction()`. A crash mid-sync leaves the database in a partially-synced state (some specs deleted, new ones not yet inserted).

**Recommended fix:** Wrap the entire sync operation in `this.databaseService.transaction(() => { ... })`.

---

### [MEDIUM] `RepoRepository.markMissingAbsentPaths()` Issues N Individual Updates

**File:** `packages/daemon/src/services/RepoRepository.ts:83–97`

**Description:**
For each repo not in the scanned set, a separate `UPDATE` query is issued. With 50 repos and 10 missing, this is 10 individual queries.

**Recommended fix:** Use a single `UPDATE repos SET status = 'missing' WHERE path NOT IN (?, ?, ...) AND status != 'missing'` with a parameterized `IN` clause.

---

### [LOW] `DatabaseService.transaction()` Saves After Every Commit

**File:** `packages/daemon/src/db/DatabaseService.ts:68–73`

**Description:**
Every transaction triggers a full `db.export()` + `writeFileSync`, even for minor operations like updating `lastActiveAt`. The 5-second auto-save timer should be sufficient; explicit saves should be reserved for critical writes.

**Recommended fix:** Remove `this.sqlite.save()` from `transaction()`. Reserve explicit saves for shutdown and post-migration critical operations.

---

### [LOW] `useSessionRestoration` Re-runs on Every Repo Scan

**File:** `packages/ui/src/renderer/hooks/useSessionRestoration.ts:29–33`

**Description:**
```typescript
useEffect(() => {
  if (!initialized) return;
  void SessionCoordinator.restoreSession();
}, [initialized, repos]);  // `repos` causes re-run on every scan
```
`SessionCoordinator.restoreSession()` is called on every repos array change (scans, refreshes), which may reset the repo selection unexpectedly if a scan arrives while the user is interacting.

**Recommended fix:** Only run restoration once after initialization. Move repo-validation logic into the scan completion handler with a "only apply if no repo is currently selected" guard.

---

### [LOW] `progressData.progress` Is Not Range-Validated

**File:** `packages/daemon/src/domain/SpecParser.ts:77–81`

**Description:**
A `progress.json` with `{ "progress": 9999 }` would set `implementationProgress = 9999`. The Zod schema `z.number().min(0).max(100)` on `SpecFolderSchema.stages[*].metadata` will then fail validation when this is serialized through IPC.

**Recommended fix:** Clamp:
```typescript
implementationProgress = Math.min(100, Math.max(0, progressData.progress));
```

---

## 7. Prioritized Improvement Roadmap

### Phase 1 — Critical (Fix Immediately)

Security vulnerabilities and crash-inducing bugs.

| # | Issue | File(s) |
|---|-------|---------|
| 1 | **Path traversal** — add allowed-roots check to all `FileSystemGateway` methods | `FileSystemGateway.ts` |
| 2 | **Shell injection** — switch to array-form `spawn`, stop trusting `specifyCommand` verbatim | `OnboardApplicationService.ts` |
| 3 | **Non-atomic DB write** — use temp + rename in `SqliteCompat.save()` | `SqliteCompat.ts` |
| 4 | **Push events lost after git ops** — add `repo:force-reload:started` to `pushEventTypes` | `daemon-ipc-worker.ts` |
| 5 | **Arbitrary config keys** — validate `config:update` against `MagentaConfigSchema.partial()` | `configHandlers.ts` |
| 6 | **Arbitrary AI binary args** — remove or restrict the `args` passthrough in `ai-session:create` | `ipc.ts`, `AISessionApplicationService.ts` |

---

### Phase 2 — High (Fix Soon)

Major reliability, security, and architecture issues.

| # | Issue | File(s) |
|---|-------|---------|
| 7 | **Refactor worker to use `DaemonContainer`** — eliminate duplicate service wiring | `daemon-ipc-worker.ts`, `DaemonContainer.ts` |
| 8 | **Move I/O out of application services** — `OnboardApplicationService`, `AISessionApplicationService`, `WorktreeApplicationService` | `application/` |
| 9 | **Remove `IPCBridge` from `services/` layer** — replace with observer pattern in `ScanQueue` and `SpecSyncService` | `ScanQueue.ts`, `SpecSyncService.ts` |
| 10 | **Enable hardened runtime on macOS** — `hardenedRuntime: true` with required entitlements | `electron-builder.yml` |
| 11 | **N+1 SQL queries** — rewrite `getByRepoPath()` with a single JOIN | `SpecRepository.ts` |
| 12 | **Onboard unhandled rejection** — attach `.catch()` error emitter to void call | `onboardHandlers.ts` |
| 13 | **Git operation timeouts** — configure `simple-git` with `timeout: { block: 30000 }` globally | `createGit.ts` |
| 14 | **`syncSpecs()` without transaction** — wrap in `databaseService.transaction()` | `SpecRepository.ts` |
| 15 | **`mergeWorktree()` no dirty-state check** — check working tree before checkout | `GitGateway.ts` |

---

### Phase 3 — Medium (Planned Improvement)

Architecture cleanup and robustness improvements.

| # | Issue | File(s) |
|---|-------|---------|
| 16 | Move infra singletons from `registerHandlers.ts` into `DaemonContainer` | `registerHandlers.ts`, `DaemonContainer.ts` |
| 17 | Move `git:user` and `gitfile:read` out of `specHandlers.ts` | `specHandlers.ts` |
| 18 | Fix `setPermissionMode()` to send actual PTY input or correct the comment | `AISessionApplicationService.ts` |
| 19 | Fix status detection false positives — scope to structured CLI patterns | `statusDetection.ts` |
| 20 | Add `success`/`error` to `spec:sync:complete` event | `SpecSyncService.ts`, `ipc.ts` |
| 21 | Full `validateSession()` with Zod partial schema | `sessionStore.ts` |
| 22 | Add JSONL file size limit in `readJsonlLines()` | `SessionSyncGateway.ts` |
| 23 | Parallelize `fetchWorktreesForAll()` with `Promise.allSettled()` | `worktreeStore.ts` |
| 24 | Reduce `SqliteCompat.run()` DB round-trips | `SqliteCompat.ts` |
| 25 | Add empty-string guard after `sanitizeName()` in onboard flow | `OnboardApplicationService.ts` |

---

### Phase 4 — Low (Nice to Have)

Minor improvements and housekeeping.

| # | Issue | File(s) |
|---|-------|---------|
| 26 | Remove `sqlite.save()` from `DatabaseService.transaction()` | `DatabaseService.ts` |
| 27 | Clamp `progress.json` value to 0–100 | `SpecParser.ts` |
| 28 | Remove redundant `as Record<string, unknown>` cast | `configHandlers.ts` |
| 29 | Remove `as any` cast from IPC bridge listener registration | `daemon-ipc-worker.ts` |
| 30 | Fix `useSessionRestoration` effect deps — only run restore once after init | `useSessionRestoration.ts` |
| 31 | Add `scopedStore` eviction (LRU or on repo deselect) | `localStorage.ts` |
| 32 | Batch `markMissingAbsentPaths()` into a single SQL `NOT IN` query | `RepoRepository.ts` |
| 33 | Sanitize error messages to remove full filesystem paths before IPC | `AppError.ts`, `FileSystemGateway.ts` |

---

## Summary Statistics

| Severity | Security | Performance | Stability | Architecture | Code Quality | Total |
|----------|----------|-------------|-----------|--------------|--------------|-------|
| Critical | 2 | — | 1 | 1 | — | **4** |
| High | 4 | 2 | 4 | 3 | 2 | **15** |
| Medium | 2 | 3 | 4 | 3 | 4 | **16** |
| Low | 2 | 1 | — | 1 | 4 | **8** |
| **Total** | **10** | **6** | **9** | **8** | **10** | **43** |
