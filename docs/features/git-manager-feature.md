# Git Management DockGroup — Implementation Plan

## Context

Magenta IDE already has substantial Git infrastructure spread across dialogs and right-sidebar activity panels: `CommitDialog`, `BranchSwitcherDialog`, `CreateBranchOrWorktreeDialog`, `DiffViewer`, plus daemon-side `GitGateway` (worktrees), `GitOperationsGateway` (status/stage/commit/fetch/pull/push/branch), and `SpecGitGateway` (read-only git). However, these capabilities are scattered, there is no unified source-control surface, and several standard Git workflows are missing entirely: clone, commit history browser, stash, remote management, reset/revert, blame, per-file history, and file CRUD inside a repo's tree.

This plan adds a new **"Git Management" ActivityBarGroup** — a dedicated DockGroup (left sidebar + dedicated center tabs) that consolidates every existing Git capability and fills the gaps. The DockGroup becomes the IDE's equivalent of VS Code's Source Control view: one place to clone, browse files, stage, commit, push/pull, switch branches, read history, stash, manage remotes, reset, revert, and blame.

**User decisions captured before planning:**
- Full comprehensive scope (phased into 5 deliverables)
- Left sections + center tab layout
- ASCII wireframes in this plan (no React built during planning)
- Clone = modal dialog with URL + native dir picker + auto-register + scan

---

## Phase roadmap (5 phases, each shippable)

### Phase 1 — DockGroup shell on existing capabilities
Wire the new `git` group and views using only the IPC endpoints already in place. Quickest user value, zero backend risk.

- **Layout entry** in [packages/ui/src/renderer/components/dock/layoutStore.ts](packages/ui/src/renderer/components/dock/layoutStore.ts):
  ```
  { id: "git", title: "Git Management", iconViewId: "git-changes",
    viewIds: ["git-repos","git-file-tree","git-changes","git-branches","git-history"],
    rightViewIds: [] }
  ```
- **Register 6 views** in [packages/ui/src/renderer/components/dock/registerViews.tsx](packages/ui/src/renderer/components/dock/registerViews.tsx):
  - `git-repos` (left, `FolderGit2` icon) — thin repo picker reusing `Sidebar`.
  - `git-file-tree` (left, `FolderTree` icon) — new `GitFileTree.tsx`; drives `dir:list` from active repo root, opens files via `file:read`.
  - `git-changes` (left, `GitBranch` icon) — reuses `RepoFileChanges` with a header that has `[Commit][Fetch][Pull][Push]` buttons calling existing IPCs.
  - `git-branches` (left, `GitFork` icon) — new `BranchList.tsx` using `branch:list`, `branch:checkout`, `branch:create`, `worktree:branches`.
  - `git-history` (left, `History` icon) — placeholder stub until Phase 3.
  - `git-commit-composer` (center tab, `GitCommit` icon) — new `CommitComposerTab.tsx`; extracts logic out of `CommitDialog` into shared `useCommitComposer` hook.
- **Extract** `useCommitComposer` hook so both the dialog and the center tab share state/actions — do **not** delete `CommitDialog`, other callers still use it.

No new IPC schemas. No daemon changes. Verification: app launches, activity-bar icon switches the sidebar, existing commit/push/pull flows continue working.

---

### Phase 2 — Clone + auto-register
Adds the first greenfield daemon capability.

**New IPC schemas** in [packages/shared/src/ipc.ts](packages/shared/src/ipc.ts):
```ts
// Request
{ type: "git:clone", url, targetDir, folderName, depth? }
// Responses (initial + streaming push events + final)
{ type: "git:clone:started", cloneId, targetPath }
{ type: "git:clone:progress", cloneId, phase, percent, data }
{ type: "git:clone:complete", cloneId, repoPath, success, error? }
// Also add (if not present): { type: "dialog:pick-directory", startAt? }
```

**New files:**
- `packages/daemon/src/infrastructure/GitCloneGateway.ts` — uses `child_process.spawn('git',['clone','--progress',url,target])` (not simple-git — we need stderr streaming for progress parsing).
- `packages/daemon/src/application/GitCloneApplicationService.ts` — validates `targetDir` is an entry in `ConfigManager.getConfig().workingDirs`; rejects with `VALIDATION_ERROR` otherwise. On success calls `scanQueue`/`RepoApplicationService` to register and scan the new repo.
- `packages/daemon/src/ipc/handlers/gitCloneHandlers.ts` — single thin `safeHandle` that kicks off the job and returns `git:clone:started`.
- `packages/ui/src/renderer/components/dialogs/CloneRepoDialog.tsx` — uses `BaseDialog`; URL + folderName inputs; parent dir dropdown from `configStore.workingDirs`; "Browse…" button opens native dir picker (only writes back if under a workingDir).
- `packages/ui/src/renderer/store/gitCloneStore.ts` — tracks `Map<cloneId, {phase, percent, log[]}>`; subscribes to `git:clone:progress` / `git:clone:complete` via `ipc.on(...)` in `initializeSubscriptions()` (same pattern as `repoStore`).

**New AppError codes** in [packages/daemon/src/errors/AppError.ts](packages/daemon/src/errors/AppError.ts): `GIT_CLONE_FAILED`, `GIT_CONFLICT`, `GIT_UNSAFE_OPERATION`.

**Extend** [packages/ui/src/renderer/services/ipcClient.ts](packages/ui/src/renderer/services/ipcClient.ts) `ResponseForRequest` map. **Wire** `GitCloneGateway` + `GitCloneApplicationService` in [packages/daemon/src/ipc/registerHandlers.ts](packages/daemon/src/ipc/registerHandlers.ts) and `DaemonContainer`.

"Clone…" button in `git-changes` header opens the dialog.

---

### Phase 3 — Commit history + diff for any ref + per-file log
Commit log browser + commit detail pane + per-file history + diff between arbitrary refs.

**New IPC schemas:**
```ts
{ type: "git:log", repoPath, branch?, path?, limit<=500, skip, search? }
  -> { type: "git:log:result", commits: CommitSummary[], hasMore }
{ type: "git:commit-detail", repoPath, sha }
  -> { type: "git:commit-detail:result", commit, files: CommitFile[] }
{ type: "git:diff", repoPath, fromRef?, toRef?, path?, staged? }
  -> { type: "git:diff:result", oldContent, newContent, oldPath, newPath, isBinary }

CommitSummary = { sha, shortSha, authorName, authorEmail, timestamp, subject, body, parents[], refs[] }
CommitFile    = { path, oldPath?, status, additions, deletions }
```

**New files:**
- `packages/daemon/src/infrastructure/GitHistoryGateway.ts` — `log()` (simple-git `git.log({...})` with `--skip`/`--grep`; `hasMore` via cheap probe `--skip=<skip+limit> -n 1`), `commitDetail()` (`git show --name-status --format=…` + `--numstat`), `diff()` (reads both sides via `git show <ref>:<path>`, sniffs binary by control-char ratio).
- `packages/daemon/src/application/GitHistoryApplicationService.ts` — validates sha regex `^[a-f0-9]{4,40}$` and bounds.
- `packages/daemon/src/ipc/handlers/gitHistoryHandlers.ts` — three thin handlers.
- `packages/ui/src/renderer/store/gitHistoryStore.ts` — pagination state keyed by `${repoPath}|${branch}|${path}|${search}`; actions `loadMore`, `refresh`, `selectCommit`, `setFilter`. Debounce filter input 250ms.
- UI components:
  - `HistorySidebar.tsx` + `CommitRow.tsx` — flip the Phase 1 stub to a real list; virtualized; "Load more" button paginates.
  - `HistoryTab.tsx` (center, `canHaveMultiple: true`) — split: commit detail top, file list bottom; clicking a file opens `RefDiffViewer`.
  - `RefDiffViewer.tsx` (center, `canHaveMultiple: true`) — wraps existing [DiffViewer](packages/ui/src/renderer/components/main/DiffViewer.tsx), sources both sides from `git:diff`. Do **not** fork CodeMirror logic.
- Right-click on a file in `git-file-tree` → "Show History" opens `HistoryTab` filtered by path.

---

### Phase 4 — Stash + remotes + branch extras + file CRUD
Fills out the "source control" muscle.

**New IPC schemas:**
```ts
stash:list | stash:push | stash:pop | stash:apply | stash:drop | stash:show
  (+ *:result variants, StashEntry = {index, message, branch, timestamp})

remote:list | remote:add | remote:rename | remote:remove | remote:set-url
  (Remote = {name, fetchUrl, pushUrl})

branch:delete { repoPath, branch, force? }
branch:rename { repoPath, oldName, newName }

file:create { filePath, content? }
dir:create  { dirPath }
```

**New files:**
- `packages/daemon/src/infrastructure/GitStashRemoteGateway.ts` — `git stash list/push/pop/apply/drop/show`; remotes via `git.getRemotes(true)`, `addRemote`, `raw(['remote','rename',…])`, `removeRemote`, `raw(['remote','set-url',…])`; branch delete/rename via `deleteLocalBranch` / `raw(['branch','-m',…])`.
- `packages/daemon/src/application/GitStashApplicationService.ts`, `GitRemoteApplicationService.ts`.
- Handler files `gitStashHandlers.ts`, `gitRemoteHandlers.ts`; extend `repoHandlers.ts` (branch delete/rename), `fileHandlers.ts` (file/dir create).
- **Extend** [packages/daemon/src/infrastructure/FileSystemGateway.ts](packages/daemon/src/infrastructure/FileSystemGateway.ts): `createFile(path, content?)` (fail if exists) + `createDirectory(path)` (`fs.mkdir recursive:true`).
- Renderer stores: `gitStashStore.ts`, `gitRemoteStore.ts`.
- Dialogs: `StashDialog.tsx` (list + create + pop/apply/drop + preview from `stash:show`); `RemoteDialog.tsx` (table with inline edit); extend branch context menu with Delete/Rename/Merge/Compare.
- `git-file-tree` right-click: New File, New Folder, Rename, Delete.
- `git-changes` header grows a Stash menu.

---

### Phase 5 — Reset, revert, blame, polish
Destructive ops behind safety rails + inspection.

**New IPC schemas:**
```ts
git:reset  { repoPath, mode: "soft"|"mixed"|"hard", ref, confirmHard? }
git:revert { repoPath, sha, noCommit? }
git:blame  { repoPath, path, ref? }
  -> { type: "git:blame:result", lines: BlameLine[] }

BlameLine = { lineNo, sha, shortSha, author, timestamp, content }
```

**New/extended files:**
- Extend `GitOperationsGateway` with `reset(mode, ref)`, `revert(sha, noCommit)`.
- New `GitBlameGateway.ts` — `git blame --porcelain <ref>? -- <path>`, parse porcelain lines.
- Extend `GitApplicationService` with `reset` (rejects `hard` when dirty unless `confirmHard:true` — two-layer guard: UI types "HARD" + daemon checks), `revert`, `blame`.
- `ResetConfirmDialog.tsx` — three-mode radio + ref picker from history + `type HARD` confirmation input + listed files that would be lost.
- Commit row context menu: "Revert this commit", "Reset to this commit…".
- `BlameTab.tsx` — center tab; gutter with sha chip + hover for full message; click sha → opens `HistoryTab` focused on that commit.

---

## Critical files to modify (full scan)

| Area | File | Action |
|---|---|---|
| schemas | [packages/shared/src/ipc.ts](packages/shared/src/ipc.ts) | add all new request/response variants + `CommitSummarySchema`, `CommitFileSchema`, `BlameLineSchema`, `StashEntrySchema`, `RemoteSchema` |
| IPC type map | [packages/ui/src/renderer/services/ipcClient.ts](packages/ui/src/renderer/services/ipcClient.ts) | extend `ResponseForRequest` |
| errors | [packages/daemon/src/errors/AppError.ts](packages/daemon/src/errors/AppError.ts) | add `GIT_CLONE_FAILED`, `GIT_CONFLICT`, `GIT_UNSAFE_OPERATION` |
| gateways (new) | `GitCloneGateway.ts`, `GitHistoryGateway.ts`, `GitStashRemoteGateway.ts`, `GitBlameGateway.ts` | Phase 2/3/4/5 |
| gateways (extend) | [GitOperationsGateway.ts](packages/daemon/src/infrastructure/GitOperationsGateway.ts) | `reset`, `revert`, `deleteLocalBranch`, `renameBranch` |
| gateways (extend) | [FileSystemGateway.ts](packages/daemon/src/infrastructure/FileSystemGateway.ts) | `createFile`, `createDirectory` |
| app services (new) | `GitCloneApplicationService.ts`, `GitHistoryApplicationService.ts`, `GitStashApplicationService.ts`, `GitRemoteApplicationService.ts` |
| app services (extend) | [GitApplicationService.ts](packages/daemon/src/application/GitApplicationService.ts) | `reset`, `revert`, `blame`, branch delete/rename |
| handlers (new) | `gitCloneHandlers.ts`, `gitHistoryHandlers.ts`, `gitStashHandlers.ts`, `gitRemoteHandlers.ts`, `gitBlameHandlers.ts` |
| handlers (extend) | `gitOperationHandlers.ts`, `repoHandlers.ts`, `fileHandlers.ts` |
| wiring | [registerHandlers.ts](packages/daemon/src/ipc/registerHandlers.ts) + `DaemonContainer.ts` |
| layout | [layoutStore.ts](packages/ui/src/renderer/components/dock/layoutStore.ts) | add `git` group to `DEFAULT_LAYOUT.activityBar.groups` + migration block for persisted layouts |
| views | [registerViews.tsx](packages/ui/src/renderer/components/dock/registerViews.tsx) | register 8 new views |
| UI stores (new) | `gitCloneStore.ts`, `gitHistoryStore.ts`, `gitStashStore.ts`, `gitRemoteStore.ts` |
| UI components | new dir `packages/ui/src/renderer/components/git/`: `GitFileTree.tsx`, `BranchList.tsx`, `BranchRowGit.tsx`, `HistorySidebar.tsx`, `CommitRow.tsx`, `GitChangesHeader.tsx`, `CommitComposerTab.tsx`, `HistoryTab.tsx`, `RefDiffViewer.tsx`, `BlameTab.tsx` |
| UI dialogs | `CloneRepoDialog.tsx`, `StashDialog.tsx`, `RemoteDialog.tsx`, `ResetConfirmDialog.tsx`, `BranchActionsDialog.tsx` |
| hooks | `useCommitComposer.ts` (extracted from `CommitDialog`) |

**Top 5 skeleton files** (everything plugs into these):
1. [packages/shared/src/ipc.ts](packages/shared/src/ipc.ts)
2. [packages/daemon/src/ipc/registerHandlers.ts](packages/daemon/src/ipc/registerHandlers.ts)
3. [packages/ui/src/renderer/components/dock/layoutStore.ts](packages/ui/src/renderer/components/dock/layoutStore.ts)
4. [packages/ui/src/renderer/components/dock/registerViews.tsx](packages/ui/src/renderer/components/dock/registerViews.tsx)
5. [packages/ui/src/renderer/services/ipcClient.ts](packages/ui/src/renderer/services/ipcClient.ts)

---

## Reuse map (important — do not rebuild)

| New UI element | Reuse |
|---|---|
| `git-file-tree` | [FileTree](packages/ui/src/renderer/components/common/FileTree.tsx) + existing `dir:list` + [fileIcons](packages/ui/src/renderer/components/common/fileIcons.tsx) |
| `git-changes` | [RepoFileChanges](packages/ui/src/renderer/components/activity/RepoFileChanges.tsx), [FileStatusBadge](packages/ui/src/renderer/components/common/FileStatusBadge.tsx), [Tag](packages/ui/src/renderer/components/common/Tag.tsx) |
| `CommitComposerTab` | Extract logic from [CommitDialog](packages/ui/src/renderer/components/dialogs/CommitDialog.tsx) into `useCommitComposer`; shell uses `FormControls`, `InlineLoadingRow` |
| `BranchList` | `BranchRow`, `BranchPicker`, [ContextMenu](packages/ui/src/renderer/components/common/ContextMenu.tsx), existing `branch:list` / `branch:create` / `branch:checkout` |
| `HistorySidebar` | `BranchPicker`, `ScrollableText`, `ClickableRow` |
| `RefDiffViewer` | Wrap existing [DiffViewer](packages/ui/src/renderer/components/main/DiffViewer.tsx) with different source hooks — do **not** fork CodeMirror logic |
| All dialogs | [BaseDialog](packages/ui/src/renderer/components/common/BaseDialog.tsx), `DialogButtons`, `FormControls` |
| Commit detail pane | `Tag` (refs), `RepoLabel` (author), `FileStatusBadge` (file list) |
| Repo picker | `Sidebar` / repo items already driven by `repoStore` |
| Loading | `InlineLoadingRow`, `LoadingSpinner` |
| Activity-bar icons | lucide-react: `GitBranch`, `GitFork`, `GitCommit`, `GitCommitHorizontal`, `GitCompareArrows`, `History`, `FolderGit2`, `FolderTree` |

---

## ASCII wireframes

### Activity bar + left sidebar (all sections expanded)
```
┌──┬────────────────────────────────────┐
│📁│  GIT MANAGEMENT                    │
│🔍│  Repositories           [Clone +]  │
│📝│  ├─ ★ magenta-ide (main)           │
│⎇ │  ├─   my-project     (feat/x)      │
│⏱ │  └─   notes-repo     (main)        │
│  │ ─────────────────────────────────  │
│  │  Files (magenta-ide)       [🔎]    │
│  │  ├─ ▾ packages/                    │
│  │  │   ├─ ▸ daemon/                  │
│  │  │   ├─ ▸ ui/                      │
│  │  │   └─ ▾ shared/src/              │
│  │  │       └─ ipc.ts  M              │
│  │  └─ README.md                      │
│  │ ─────────────────────────────────  │
│  │  Changes (3)  [Commit][↻][↓][↑]    │
│  │   M  packages/shared/src/ipc.ts    │
│  │   U  notes/todo.md                 │
│  │   D  old-file.txt                  │
│  │ ─────────────────────────────────  │
│  │  Branches         [New +][Stash]   │
│  │   ● main                           │
│  │     feat/new-dock                  │
│  │     remotes/origin/main            │
│  │ ─────────────────────────────────  │
│  │  History (main) 🔎 filter…         │
│  │   a1b2c3 fix merge (2h) – Steven   │
│  │   d4e5f6 init DockGroup (1d) – …   │
│  │   9f8e7d Release v0.3 ↗ v0.3       │
│  │   [Load more]                      │
└──┴────────────────────────────────────┘
```

### Center tab — Commit composer
```
┌─ Commit (main) ──────────────────────────────────── ✕ ┐
│ On branch main · ↓0 ↑2 · origin/main                  │
│ ┌─ Message ───────────────────────────────────────┐   │
│ │ Summary: fix commit composer layout             │   │
│ │                                                 │   │
│ │ Longer description…                             │   │
│ └─────────────────────────────────────────────────┘   │
│                                                       │
│ Staged (1)                                            │
│  [x] M  packages/shared/src/ipc.ts                    │
│ Changes (2)                                           │
│  [ ] M  packages/ui/src/renderer/.../layoutStore.ts   │
│  [ ] U  notes/todo.md                                 │
│                                                       │
│ ─── Diff preview: packages/shared/src/ipc.ts ───────  │
│  -  z.literal("git:commit"),                          │
│  +  z.literal("git:commit"), files: z.array(...)      │
│  … (CodeMirror merge view, read-only)                 │
│                                                       │
│                      [ Commit ] [ Commit & Push ▾ ]   │
└───────────────────────────────────────────────────────┘
```

### Center tab — History browser
```
┌─ History: main ──────────────────────────── ✕ ┐
│ Branch [main ▾]  Path [ all ▾]  🔎 filter…    │
├───────────────────────────────┬───────────────┤
│ a1b2c3 fix merge              │ commit a1b2c3…│
│  Steven · 2h                  │ parent d4e5f6 │
│ d4e5f6 init DockGroup         │ Steven Hoang  │
│  Steven · 1d                  │ 2026-04-17    │
│ 9f8e7d Release v0.3           │ refs: main,   │
│  bot · 3d                     │       v0.3    │
│ […load more]                  │               │
│                               │ Message:      │
│                               │  fix merge    │
│                               │  conflict…    │
│                               │               │
│                               │ Files (3):    │
│                               │  M  ipc.ts    │
│                               │  A  clone.ts  │
│                               │  D  old.ts    │
│                               │ [Revert][Reset│
│                               │  to this…]    │
└───────────────────────────────┴───────────────┘
```

### Clone dialog
```
┌─ Clone repository ───────────────────────────── ✕ ┐
│  Remote URL                                       │
│  [ https://github.com/user/repo.git            ]  │
│                                                   │
│  Clone into                                       │
│  [ ~/code                                     ▾]  │
│  [ Browse… ]  (only working dirs are selectable)  │
│                                                   │
│  Folder name                                      │
│  [ repo                                        ]  │
│                                                   │
│  [ ] Shallow clone (depth=1)                      │
│                                                   │
│  ── Progress ───────────────────────────────────  │
│   Receiving objects: 78% (12543/16073)            │
│   [##########################----] 78%            │
│                                                   │
│                      [ Cancel ]  [  Clone  ]      │
└───────────────────────────────────────────────────┘
```

### Remote dialog
```
┌─ Remotes — magenta-ide ───────────────────── ✕ ┐
│ ┌──────────┬─────────────────────────────────┐ │
│ │ origin   │ git@github.com:me/ide.git       │ │
│ │          │ push: same                      │ │
│ │          │ [Rename][Set URL…][Remove]      │ │
│ ├──────────┼─────────────────────────────────┤ │
│ │ upstream │ https://github.com/up/ide.git   │ │
│ │          │ [Rename][Set URL…][Remove]      │ │
│ └──────────┴─────────────────────────────────┘ │
│                                                │
│ + Add remote                                   │
│   name [    ] url [                         ]  │
│   [  Add  ]                                    │
│                                                │
│                                     [ Close ]  │
└────────────────────────────────────────────────┘
```

### Stash dialog
```
┌─ Stash — magenta-ide ──────────────────────── ✕ ┐
│ ┌─ Existing ─────────────────────────────────┐  │
│ │ [0] WIP on main: fix commit composer  2h   │  │
│ │     [Apply][Pop][Drop][Show diff ▾]        │  │
│ │ [1] On feat/x: partial refactor       3d   │  │
│ │     [Apply][Pop][Drop][Show diff ▾]        │  │
│ └────────────────────────────────────────────┘  │
│                                                 │
│ ┌─ New stash ────────────────────────────────┐  │
│ │ Message: [                               ] │  │
│ │ [x] Include untracked                      │  │
│ │                               [  Stash  ]  │  │
│ └────────────────────────────────────────────┘  │
│                                                 │
│                                    [ Close ]    │
└─────────────────────────────────────────────────┘
```

### Reset confirmation dialog
```
┌─ Reset branch — main ─────────────────────────── ✕ ┐
│ Current HEAD: a1b2c3 "fix merge"                   │
│                                                    │
│ Reset to:                                          │
│ [ d4e5f6 init DockGroup                         ▾] │
│                                                    │
│ Mode:                                              │
│  (•) Mixed   – keep changes, unstage (default)     │
│  ( ) Soft    – keep staged                         │
│  ( ) HARD    – discard all uncommitted changes ⚠   │
│                                                    │
│ ⚠ HARD reset will permanently lose:                │
│     • 3 modified files                             │
│     • 1 untracked file                             │
│                                                    │
│ Type HARD to confirm  [        ]                   │
│                                                    │
│                         [ Cancel ] [ Reset ]       │
└────────────────────────────────────────────────────┘
```

---

## Data flow example — user clones a repo

1. User clicks "Clone…" in the Repositories section header.
2. `CloneRepoDialog` mounts; reads `configStore.config.workingDirs` into parent-dir dropdown.
3. User fills URL + folder name, clicks Clone.
4. `gitCloneStore.startClone({url, targetDir, folderName})` → `sendOrThrow({type:"git:clone", …})`.
5. Zod validates at `IPCBridge.invoke`. `gitCloneHandlers.ts` runs inside `safeHandle`, calls `gitCloneService.startClone(...)`. Handler returns `{type:"git:clone:started", cloneId, targetPath}` immediately; the actual clone runs as a background promise inside the service.
6. `GitCloneApplicationService` validates `targetDir ∈ workingDirs` else `AppError("VALIDATION_ERROR", …)`.
7. Service calls `GitCloneGateway.clone(url, targetDir, folderName, onProgress)`. Gateway spawns `git clone --progress` and parses stderr line-by-line → `bridge.emit({type:"git:clone:progress", cloneId, phase, percent, data})`.
8. Renderer `gitCloneStore` already subscribed via `ipc.on('git:clone:progress', …)` (registered in `initializeSubscriptions()`). Progress bar updates by cloneId.
9. On success, service calls `scanQueue.requestSingleRepoReload(targetPath)` to register and scan the new repo, then emits `git:clone:complete{success:true, repoPath}`.
10. `gitCloneStore.onComplete` → `repoStore.fetchRepos()` → `SessionCoordinator.selectRepo(repoPath)` → dialog closes.
11. `git-repos`, `git-file-tree`, `git-changes`, `git-branches` all react to `activeRepoPath` change and rehydrate.

---

## Verification plan

For every mutating IPC, compare UI state with `cd <repo> && git <equivalent>` in a shell:

- **Phase 1:** open composer, diff its list against `git status --porcelain`. Confirm all 5 sections render when the activity-bar icon is clicked. Existing commit/push/pull flows still work.
- **Phase 2:** clone a small public repo; `.git/config` exists, `git remote -v` matches, repo appears in list. Try a non-workingDir target → expect `VALIDATION_ERROR`.
- **Phase 3:** first 20 entries of `git:log` against `git log --pretty=oneline -20`; `commit-detail` against `git show <sha> --stat`; per-file history against `git log -- <path>`.
- **Phase 4:** stashes against `git stash list`; remotes against `git remote -v`; deleted branch absent from `git branch -a`; new file shows as untracked in `git status`.
- **Phase 5:** reset mixed leaves unstaged changes; reset hard blocks when dirty without confirmation; revert creates a new commit; blame output matches `git blame <file>` line-for-line.

**Automated tests:**
- Zod schema tests in `packages/shared/__tests__` — reject missing/invalid fields per new request type.
- Application-service unit tests — mock gateways; assert branching (clone rejects non-allowlisted parent; reset without confirm throws).
- Store tests — mock `sendOrThrow`; assert `loadMore` appends without duplicating; `onComplete` triggers repo refresh.
- End-to-end via `playwright-debug` skill — clone a local bare-repo fixture; verify UI transitions.

---

## Non-obvious decisions / risks

1. **Clone target lives outside the PathGuard allowlist at start.** The child path doesn't exist when Clone is clicked. Solution: validate the **parent** dir is an exact entry in `workingDirs`; the clone creates the child; after success the existing scanner picks it up without allowlist updates.

2. **Log pagination state is per-query, not per-repo.** Cache key `${repoPath}|${branch}|${path}|${search}`. Debounce filter input 250ms; keep only the current query entry; evict prior key on filter change. Don't persist log across repo selects.

3. **Huge-history blocking.** `git log --skip` is O(N) server-side. Cap `limit` at 500, first page at 100; never fetch without a limit.

4. **Clone progress streaming.** `simple-git.clone()` buffers stderr and doesn't expose progress cleanly. `GitCloneGateway` uses raw `child_process.spawn('git',['clone','--progress',…])` instead — rest of the codebase stays on simple-git.

5. **Worktree interaction on reset/branch ops.** `branch:delete` must refuse branches checked out in a worktree (`git worktree list --porcelain` check). Stash on a worktree root (where `.git` is a file, not a dir) is allowed but must be surfaced in the UI. Use `WORKTREE_CONFLICT` code.

6. **Commit composer vs. existing CommitDialog.** Do **not** delete `CommitDialog` — `RepoFileChanges` button still opens it. Both consume shared `useCommitComposer` hook to prevent drift. The center-tab version is the "pro" surface; the dialog stays for quick commits.

7. **Reset-hard guard is two-layer.** UI requires typing "HARD"; daemon also refuses hard reset when working tree is dirty unless `confirmHard:true` is passed. A misbehaving client can't wipe work.

8. **Defaults on open questions:**
   - Clone targets auto-pinned in repo list → **yes**.
   - Blame gutter → inline sha chip per line, hover tooltip for full message (GitLens-lite feel).
   - Remote URL token redaction in UI → strip `://user:token@` to `://***@` for display only.

---

## Execution order summary

Ship Phase 1 first (no daemon changes, tangible user value). Phases 2–5 can queue independently — each produces its own IPC schemas, gateway, application service, handlers, stores, and UI surfaces with no cross-phase blockers.