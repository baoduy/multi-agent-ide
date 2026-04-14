# Git Management — Repository Context Menu Enhancement

**Status:** Draft
**Author:** Steven
**Created:** 2026-04-14
**Last Updated:** 2026-04-14

## Overview

Enhance the repository context menu to provide complete Git repository management within Magenta IDE. This eliminates the need to switch to an external Git client for everyday operations like committing, branching, pushing, and pulling.

The plan is split into three incremental phases, each delivering standalone value. Every phase follows the existing architecture: Zod schemas in `packages/shared`, infrastructure gateway + application service + thin IPC handlers in `packages/daemon`, and Zustand store + UI components in `packages/ui`.

---

## Current State

### Existing Context Menu Items (RepoItem.tsx)

| Item                     | Action                          |
|--------------------------|---------------------------------|
| Pin / Unpin repository   | Toggle pinned state             |
| Open in File Explorer    | OS file manager                 |
| Copy path                | Clipboard                       |
| Add Worktree             | Opens AddWorktreeDialog         |
| Refresh                  | Force rescan + spec sync        |
| Onboard / Upgrade Specify| Starts onboard or upgrade flow  |

### Existing Git Infrastructure

| Layer               | Component                       | Capabilities                                                    |
|---------------------|--------------------------------|-----------------------------------------------------------------|
| Gateway             | `GitGateway`                   | Worktree CRUD, merge, status, branch list                      |
| Gateway             | `SpecGitGateway`               | Git file read, branch detection, git user                      |
| Application Service | `WorktreeApplicationService`   | Orchestrates worktree lifecycle                                 |
| IPC                 | `worktreeHandlers.ts`          | 6 handlers (list, create, status, merge, delete, branches)     |
| IPC                 | `repoHandlers.ts`              | `branch:checkout`, `branch:list`                                |
| Store               | `worktreeStore`                | Worktree state, status cache, merge/delete operations           |
| Store               | `repoStore`                    | Repos, active path, pinned, scanning                            |

### What Is Missing

No support for: `git add`, `git commit`, `git push`, `git pull`, `git fetch`, `git stash`, `git log`, `git diff`, `git tag`, `branch create`, `branch delete`, `branch rename`, `branch merge` (outside worktree context), `git reset`, `git revert`, `git cherry-pick`, `git rebase`, remote management, or conflict resolution UI.

---

## UX Decision: Context Menu Structure

The current context menu has 6-7 items. Adding 15+ git operations to the top level would be overwhelming. Instead, introduce a **"Git >" submenu** that groups all git operations:

```
Right-click repo:
  Pin to top
  Open in File Explorer
  Copy path
  ─────────────────
  Git >                    ← NEW submenu
    Switch Branch...
    Create Branch...
    Merge Branch...
    Delete Branch...
    Rename Branch...
    ─────────────────
    Pull
    Push
    Fetch
    ─────────────────
    Stash >
      Stash Changes...
      Pop Stash
      Apply Stash...
    ─────────────────
    View Log...
  ─────────────────
  Add Worktree
  Refresh
  Onboard / Upgrade Specify
```

This requires extending `ContextMenuAction` to support a `children` property for nested submenus. The `ContextMenu` component needs a minor enhancement to render nested menus on hover.

### Commit Panel

Commit and staging operations don't belong on a context menu — they need a persistent surface. A **Commit Panel** will be added to the bottom dock (similar to VS Code's Source Control view). It shows changed files, allows staging/unstaging, and provides a commit message input.

---

## Phase 1 — Branch Management + Remote Sync

**Goal:** Enable complete branch lifecycle and remote synchronization from the context menu.

### 1.1 Shared Package Changes (`packages/shared/src/ipc.ts`)

#### New IPC Request Types

```typescript
// Branch operations
z.object({ type: z.literal("branch:create"), repoPath: z.string(), branchName: z.string(), startPoint: z.string().optional() }),
z.object({ type: z.literal("branch:delete"), repoPath: z.string(), branchName: z.string(), force: z.boolean().optional() }),
z.object({ type: z.literal("branch:rename"), repoPath: z.string(), oldName: z.string(), newName: z.string() }),
z.object({ type: z.literal("branch:merge"), repoPath: z.string(), sourceBranch: z.string(), targetBranch: z.string().optional() }),

// Remote operations
z.object({ type: z.literal("git:fetch"), repoPath: z.string(), remote: z.string().optional() }),
z.object({ type: z.literal("git:pull"), repoPath: z.string(), remote: z.string().optional(), branch: z.string().optional() }),
z.object({ type: z.literal("git:push"), repoPath: z.string(), remote: z.string().optional(), branch: z.string().optional(), force: z.boolean().optional() }),
```

#### New IPC Response Types

```typescript
z.object({ type: z.literal("branch:create:result"), repoPath: z.string(), branchName: z.string(), success: z.boolean() }),
z.object({ type: z.literal("branch:delete:result"), repoPath: z.string(), branchName: z.string(), success: z.boolean(), message: z.string() }),
z.object({ type: z.literal("branch:rename:result"), repoPath: z.string(), success: z.boolean(), message: z.string() }),
z.object({ type: z.literal("branch:merge:result"), repoPath: z.string(), success: z.boolean(), message: z.string(), conflicts: z.array(z.string()).optional() }),
z.object({ type: z.literal("git:fetch:result"), repoPath: z.string(), success: z.boolean(), message: z.string() }),
z.object({ type: z.literal("git:pull:result"), repoPath: z.string(), success: z.boolean(), message: z.string(), conflicts: z.array(z.string()).optional() }),
z.object({ type: z.literal("git:push:result"), repoPath: z.string(), success: z.boolean(), message: z.string() }),
```

### 1.2 New Infrastructure Gateway

**File:** `packages/daemon/src/infrastructure/GitOperationsGateway.ts`

This gateway wraps `simple-git` or raw `execSync` calls for general git operations (distinct from the worktree-focused `GitGateway`).

```typescript
export class GitOperationsGateway {
  // ── Branch Operations ──
  createBranch(repoPath: string, branchName: string, startPoint?: string): void;
  deleteBranch(repoPath: string, branchName: string, force?: boolean): { message: string };
  renameBranch(repoPath: string, oldName: string, newName: string): void;
  mergeBranch(repoPath: string, sourceBranch: string, targetBranch?: string): {
    success: boolean;
    message: string;
    conflicts?: string[];
  };

  // ── Remote Operations ──
  fetch(repoPath: string, remote?: string): { message: string };
  pull(repoPath: string, remote?: string, branch?: string): {
    success: boolean;
    message: string;
    conflicts?: string[];
  };
  push(repoPath: string, remote?: string, branch?: string, force?: boolean): { message: string };
}
```

Implementation notes:
- `createBranch` uses `git branch <name> [startPoint]` or `git checkout -b <name> [startPoint]`.
- `deleteBranch` uses `git branch -d` (or `-D` with `force: true`). Must verify the branch is not currently checked out and has no associated worktrees.
- `mergeBranch` follows the same pattern as `GitGateway.mergeWorktree()`: attempt fast-forward first, fall back to regular merge, detect conflicts. If `targetBranch` is omitted, merge into the current branch.
- `fetch` runs `git fetch [remote]` (default: `origin`).
- `pull` runs `git pull [remote] [branch]` with `--no-rebase` by default (configurable later). Must detect conflicts.
- `push` runs `git push [remote] [branch]`. With `force: true`, uses `--force-with-lease` (safer than `--force`).

### 1.3 New Application Service

**File:** `packages/daemon/src/application/GitApplicationService.ts`

```typescript
export class GitApplicationService {
  constructor(
    private readonly gitOps: GitOperationsGateway,
    private readonly gitGateway: GitGateway,   // for branch listing, worktree checks
  ) {}

  createBranch(repoPath: string, branchName: string, startPoint?: string): { success: boolean };
  deleteBranch(repoPath: string, branchName: string, force?: boolean): { success: boolean; message: string };
  renameBranch(repoPath: string, oldName: string, newName: string): { success: boolean; message: string };
  mergeBranch(repoPath: string, sourceBranch: string, targetBranch?: string): { success: boolean; message: string; conflicts?: string[] };
  fetch(repoPath: string, remote?: string): { success: boolean; message: string };
  pull(repoPath: string, remote?: string, branch?: string): { success: boolean; message: string; conflicts?: string[] };
  push(repoPath: string, remote?: string, branch?: string, force?: boolean): { success: boolean; message: string };
}
```

Orchestration logic:
- `deleteBranch` — before deleting, check `gitGateway.listWorktrees()` to ensure no worktree uses this branch. Throw `WORKTREE_CONFLICT` if so.
- `mergeBranch` — after successful merge, emit a push event so the UI refreshes branch state.
- `pull` — after pull, trigger a repo force-reload to refresh spec state (the branch may now have new specs).

### 1.4 IPC Handlers

**File:** `packages/daemon/src/ipc/handlers/gitOperationHandlers.ts`

```typescript
export function registerGitOperationHandlers({
  bridge,
  gitService,
}: { bridge: IPCBridge; gitService: GitApplicationService }): void {

  safeHandle(bridge, "branch:create", async (msg) => {
    const result = gitService.createBranch(msg.repoPath, msg.branchName, msg.startPoint);
    return { type: "branch:create:result", repoPath: msg.repoPath, branchName: msg.branchName, success: result.success };
  });

  safeHandle(bridge, "branch:delete", async (msg) => {
    const result = gitService.deleteBranch(msg.repoPath, msg.branchName, msg.force);
    return { type: "branch:delete:result", repoPath: msg.repoPath, branchName: msg.branchName, ...result };
  });

  safeHandle(bridge, "branch:rename", async (msg) => {
    const result = gitService.renameBranch(msg.repoPath, msg.oldName, msg.newName);
    return { type: "branch:rename:result", repoPath: msg.repoPath, ...result };
  });

  safeHandle(bridge, "branch:merge", async (msg) => {
    const result = gitService.mergeBranch(msg.repoPath, msg.sourceBranch, msg.targetBranch);
    bridge.emit({ type: "repo:force-reload:started", repoPath: msg.repoPath }); // refresh UI
    return { type: "branch:merge:result", repoPath: msg.repoPath, ...result };
  });

  safeHandle(bridge, "git:fetch", async (msg) => {
    const result = gitService.fetch(msg.repoPath, msg.remote);
    return { type: "git:fetch:result", repoPath: msg.repoPath, ...result };
  });

  safeHandle(bridge, "git:pull", async (msg) => {
    const result = gitService.pull(msg.repoPath, msg.remote, msg.branch);
    bridge.emit({ type: "repo:force-reload:started", repoPath: msg.repoPath }); // refresh specs
    return { type: "git:pull:result", repoPath: msg.repoPath, ...result };
  });

  safeHandle(bridge, "git:push", async (msg) => {
    const result = gitService.push(msg.repoPath, msg.remote, msg.branch, msg.force);
    return { type: "git:push:result", repoPath: msg.repoPath, ...result };
  });
}
```

### 1.5 Handler Registration

**File:** `packages/daemon/src/ipc/registerHandlers.ts`

Add to the existing `registerHandlers()` function:

```typescript
import { GitOperationsGateway } from "../infrastructure/GitOperationsGateway";
import { GitApplicationService } from "../application/GitApplicationService";
import { registerGitOperationHandlers } from "./handlers/gitOperationHandlers";

// Inside registerHandlers():
const gitOpsGateway = new GitOperationsGateway();
const gitService = new GitApplicationService(gitOpsGateway, ctx.gitGateway);
registerGitOperationHandlers({ bridge, gitService });
```

### 1.6 UI — ResponseForRequest Updates

**File:** `packages/ui/src/renderer/services/ipcClient.ts`

Add to the `ResponseForRequest` type map:

```typescript
"branch:create": "branch:create:result";
"branch:delete": "branch:delete:result";
"branch:rename": "branch:rename:result";
"branch:merge": "branch:merge:result";
"git:fetch": "git:fetch:result";
"git:pull": "git:pull:result";
"git:push": "git:push:result";
```

### 1.7 UI — ContextMenu Submenu Support

**File:** `packages/ui/src/renderer/components/common/ContextMenu.tsx`

Extend the `ContextMenuAction` type:

```typescript
export type ContextMenuAction = {
  label: string;
  Icon?: LucideIcon;
  emoji?: string;
  action?: () => void;       // undefined if has children
  separator?: boolean;
  disabled?: boolean;         // NEW: grey out items when not applicable
  children?: ContextMenuAction[];  // NEW: submenu items
};
```

The `ContextMenu` component needs to render a nested `<div>` on hover when `children` is present. Position the submenu to the right of the parent item (or left if near the viewport edge).

### 1.8 UI — Git Submenu in RepoItem

**File:** `packages/ui/src/renderer/components/sidebar/RepoItem.tsx`

Add a "Git" submenu item to `ctxItems`:

```typescript
import { GitBranch, GitMerge, GitPullRequest, ArrowDown, ArrowUp, Download, Trash2, PenLine } from "lucide-react";

ctxItems.push({
  label: "Git",
  Icon: GitBranch,
  separator: true,
  children: [
    { label: "Switch Branch...", Icon: GitBranch, action: () => setShowBranchSwitcher(true) },
    { label: "Create Branch...", Icon: GitBranch, action: () => setShowCreateBranch(true) },
    { label: "Merge Branch...", Icon: GitMerge, action: () => setShowMergeBranch(true) },
    { label: "Delete Branch...", Icon: Trash2, action: () => setShowDeleteBranch(true) },
    { label: "Rename Branch...", Icon: PenLine, action: () => setShowRenameBranch(true) },
    { label: "Pull", Icon: ArrowDown, separator: true, action: () => handlePull() },
    { label: "Push", Icon: ArrowUp, action: () => handlePush() },
    { label: "Fetch", Icon: Download, action: () => handleFetch() },
  ],
});
```

### 1.9 UI — Dialog Components

#### BranchSwitcherDialog

**File:** `packages/ui/src/renderer/components/dialogs/BranchSwitcherDialog.tsx`

- Fetches branches via `sendOrThrow({ type: "branch:list", repoPath })`.
- Searchable list with the current branch highlighted.
- On select, calls `sendOrThrow({ type: "branch:checkout", repoPath, branch })`.
- After successful checkout, refreshes `repoStore` (the repo's `branch` field updates).

#### CreateBranchDialog

**File:** `packages/ui/src/renderer/components/dialogs/CreateBranchDialog.tsx`

- Text input for branch name with validation (no spaces, valid git ref).
- Dropdown to select start point (defaults to current branch, lists all local branches).
- On confirm, calls `sendOrThrow({ type: "branch:create", repoPath, branchName, startPoint })`.
- Optionally auto-switches to the new branch after creation.

#### MergeBranchDialog

**File:** `packages/ui/src/renderer/components/dialogs/MergeBranchDialog.tsx`

- Source branch dropdown (all local branches except current).
- Target branch shown as current branch (read-only display).
- On confirm, calls `sendOrThrow({ type: "branch:merge", repoPath, sourceBranch })`.
- Displays success message or conflict list in the dialog.

#### DeleteBranchDialog

**File:** `packages/ui/src/renderer/components/dialogs/DeleteBranchDialog.tsx`

- Branch dropdown (excludes current branch — cannot delete checked-out branch).
- Checkbox for force delete (explains risk: deletes even if unmerged).
- Warns if branch has an associated worktree.
- On confirm, calls `sendOrThrow({ type: "branch:delete", repoPath, branchName, force })`.

#### RenameBranchDialog

**File:** `packages/ui/src/renderer/components/dialogs/RenameBranchDialog.tsx`

- Shows current branch name (or lets user select a branch).
- Text input for new name with validation.
- On confirm, calls `sendOrThrow({ type: "branch:rename", repoPath, oldName, newName })`.

### 1.10 Checklist

- [ ] Zod schemas added to `packages/shared/src/ipc.ts` (7 new request types, 7 new response types)
- [ ] `GitOperationsGateway` created in `packages/daemon/src/infrastructure/`
- [ ] `GitApplicationService` created in `packages/daemon/src/application/`
- [ ] `gitOperationHandlers.ts` created in `packages/daemon/src/ipc/handlers/`
- [ ] Handlers registered in `registerHandlers.ts`
- [ ] `ResponseForRequest` updated in `packages/ui/src/renderer/services/ipcClient.ts`
- [ ] `ContextMenuAction` extended with `children` and `disabled` in `ContextMenu.tsx`
- [ ] `ContextMenu` component renders nested submenus
- [ ] Git submenu added to `RepoItem.tsx`
- [ ] 5 dialog components created (BranchSwitcher, CreateBranch, MergeBranch, DeleteBranch, RenameBranch)
- [ ] Pull/Push/Fetch fire-and-forget handlers in RepoItem
- [ ] After checkout/merge/pull: repo store refreshes current branch display

---

## Phase 2 — Commit, Staging, and Stash

**Goal:** Provide a full commit workflow — view changes, stage/unstage files, write commit messages, view diffs, and manage stashes — without leaving Magenta IDE.

### 2.1 Shared Package Changes (`packages/shared/src/ipc.ts`)

#### New IPC Request Types

```typescript
// Status & staging
z.object({ type: z.literal("git:status"), repoPath: z.string() }),
z.object({ type: z.literal("git:stage"), repoPath: z.string(), files: z.array(z.string()) }),
z.object({ type: z.literal("git:unstage"), repoPath: z.string(), files: z.array(z.string()) }),
z.object({ type: z.literal("git:discard"), repoPath: z.string(), files: z.array(z.string()) }),

// Commit
z.object({ type: z.literal("git:commit"), repoPath: z.string(), message: z.string(), amend: z.boolean().optional() }),

// Diff
z.object({ type: z.literal("git:diff"), repoPath: z.string(), filePath: z.string(), staged: z.boolean().optional() }),

// Stash
z.object({ type: z.literal("git:stash:list"), repoPath: z.string() }),
z.object({ type: z.literal("git:stash:push"), repoPath: z.string(), message: z.string().optional(), includeUntracked: z.boolean().optional() }),
z.object({ type: z.literal("git:stash:pop"), repoPath: z.string(), index: z.number().int().nonnegative().optional() }),
z.object({ type: z.literal("git:stash:apply"), repoPath: z.string(), index: z.number().int().nonnegative().optional() }),
z.object({ type: z.literal("git:stash:drop"), repoPath: z.string(), index: z.number().int().nonnegative().optional() }),
```

#### New IPC Response Types

```typescript
z.object({
  type: z.literal("git:status:result"),
  repoPath: z.string(),
  staged: z.array(z.object({ path: z.string(), status: z.enum(["added", "modified", "deleted", "renamed", "copied"]) })),
  unstaged: z.array(z.object({ path: z.string(), status: z.enum(["modified", "deleted"]) })),
  untracked: z.array(z.string()),
  branch: z.string(),
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
}),
z.object({ type: z.literal("git:stage:result"), repoPath: z.string(), success: z.boolean() }),
z.object({ type: z.literal("git:unstage:result"), repoPath: z.string(), success: z.boolean() }),
z.object({ type: z.literal("git:discard:result"), repoPath: z.string(), success: z.boolean() }),
z.object({ type: z.literal("git:commit:result"), repoPath: z.string(), success: z.boolean(), commitHash: z.string().optional(), message: z.string() }),
z.object({
  type: z.literal("git:diff:result"),
  repoPath: z.string(),
  filePath: z.string(),
  diff: z.string(),         // unified diff output
  oldContent: z.string(),   // full file before changes
  newContent: z.string(),   // full file after changes
}),
z.object({
  type: z.literal("git:stash:list:result"),
  repoPath: z.string(),
  stashes: z.array(z.object({
    index: z.number().int().nonnegative(),
    message: z.string(),
    date: z.string(),
    branch: z.string().optional(),
  })),
}),
z.object({ type: z.literal("git:stash:push:result"), success: z.boolean(), message: z.string() }),
z.object({ type: z.literal("git:stash:pop:result"), success: z.boolean(), message: z.string() }),
z.object({ type: z.literal("git:stash:apply:result"), success: z.boolean(), message: z.string() }),
z.object({ type: z.literal("git:stash:drop:result"), success: z.boolean(), message: z.string() }),
```

### 2.2 Gateway Extensions

**File:** `packages/daemon/src/infrastructure/GitOperationsGateway.ts`

Add methods to the existing gateway created in Phase 1:

```typescript
// ── Status ──
getStatus(repoPath: string): {
  staged: Array<{ path: string; status: string }>;
  unstaged: Array<{ path: string; status: string }>;
  untracked: string[];
  branch: string;
  ahead: number;
  behind: number;
};

// ── Staging ──
stageFiles(repoPath: string, files: string[]): void;     // git add <files>
unstageFiles(repoPath: string, files: string[]): void;   // git reset HEAD <files>
discardFiles(repoPath: string, files: string[]): void;   // git checkout -- <files> + git clean for untracked

// ── Commit ──
commit(repoPath: string, message: string, amend?: boolean): { commitHash: string };

// ── Diff ──
getDiff(repoPath: string, filePath: string, staged?: boolean): {
  diff: string;
  oldContent: string;
  newContent: string;
};

// ── Stash ──
listStashes(repoPath: string): Array<{ index: number; message: string; date: string; branch?: string }>;
stashPush(repoPath: string, message?: string, includeUntracked?: boolean): void;
stashPop(repoPath: string, index?: number): void;
stashApply(repoPath: string, index?: number): void;
stashDrop(repoPath: string, index?: number): void;
```

Implementation notes:
- `getStatus` uses `git status --porcelain=v2 --branch` for richer parsing (separates staged vs unstaged vs untracked, includes branch and ahead/behind info). This is an upgrade from the `--porcelain=v1` used by the existing `GitGateway.getWorktreeStatus()`.
- `getDiff` with `staged: true` uses `git diff --cached <file>`; without, uses `git diff <file>`. For `oldContent`/`newContent`, use `git show HEAD:<file>` and read the working tree file.
- `discardFiles` distinguishes tracked files (`git checkout -- <file>`) from untracked files (`rm <file>`) based on status.
- `commit` with `amend: true` uses `git commit --amend --no-edit -m <message>`.

### 2.3 Application Service Extensions

**File:** `packages/daemon/src/application/GitApplicationService.ts`

Add to the existing service from Phase 1:

```typescript
getStatus(repoPath: string): GitStatusResult;
stageFiles(repoPath: string, files: string[]): void;
unstageFiles(repoPath: string, files: string[]): void;
discardFiles(repoPath: string, files: string[]): void;
commit(repoPath: string, message: string, amend?: boolean): { success: boolean; commitHash?: string; message: string };
getDiff(repoPath: string, filePath: string, staged?: boolean): DiffResult;
listStashes(repoPath: string): StashEntry[];
stashPush(repoPath: string, message?: string, includeUntracked?: boolean): void;
stashPop(repoPath: string, index?: number): void;
stashApply(repoPath: string, index?: number): void;
stashDrop(repoPath: string, index?: number): void;
```

Orchestration logic:
- `commit` — validates message is non-empty, checks that there are staged changes (throw `VALIDATION_ERROR` if nothing staged), calls gateway, returns hash.
- `discardFiles` — confirms the files actually have changes before discarding (safety check).
- `stashPop` — after pop, emit a status refresh event so UI updates.

### 2.4 IPC Handlers

Add to `gitOperationHandlers.ts` (or create a separate `gitStagingHandlers.ts` if the file grows too large):

Thin handlers for all 12 new request types following the same `safeHandle()` pattern. Status-changing operations (stage, unstage, discard, commit, stash push/pop/apply) should emit a `git:status:changed` push event so the UI can auto-refresh.

#### New Push Event

```typescript
// Add to IpcResponseSchema:
z.object({ type: z.literal("git:status:changed"), repoPath: z.string() }),
```

This event is emitted after any operation that changes the working tree or index, allowing the Commit Panel to auto-refresh.

### 2.5 UI — New Zustand Store

**File:** `packages/ui/src/renderer/store/gitStore.ts`

```typescript
interface GitState {
  // Status
  statusByRepo: Record<string, GitStatusResult>;
  isLoadingStatus: Record<string, boolean>;

  // Diff
  activeDiff: { repoPath: string; filePath: string; diff: string; oldContent: string; newContent: string } | null;
  isLoadingDiff: boolean;

  // Stash
  stashesByRepo: Record<string, StashEntry[]>;

  // Commit
  commitMessage: string;
  isCommitting: boolean;
  lastCommitResult: { success: boolean; message: string } | null;
}

interface GitActions {
  fetchStatus(repoPath: string): Promise<void>;
  stageFiles(repoPath: string, files: string[]): Promise<void>;
  unstageFiles(repoPath: string, files: string[]): Promise<void>;
  discardFiles(repoPath: string, files: string[]): Promise<void>;
  commit(repoPath: string): Promise<void>;
  fetchDiff(repoPath: string, filePath: string, staged?: boolean): Promise<void>;
  clearDiff(): void;
  setCommitMessage(msg: string): void;

  // Stash
  fetchStashes(repoPath: string): Promise<void>;
  stashPush(repoPath: string, message?: string): Promise<void>;
  stashPop(repoPath: string, index?: number): Promise<void>;
  stashApply(repoPath: string, index?: number): Promise<void>;
  stashDrop(repoPath: string, index?: number): Promise<void>;

  // Subscriptions
  initializeSubscriptions(): void;
}
```

The store listens for `git:status:changed` push events and auto-refetches status for the affected repo.

### 2.6 UI — Commit Panel

**File:** `packages/ui/src/renderer/components/panels/CommitPanel.tsx`

This is a new panel in the bottom dock area. Layout:

```
┌──────────────────────────────────────────────┐
│  Source Control: my-repo (main)         [↻]  │
├──────────────────────────────────────────────┤
│  Staged Changes (3)                     [-]  │
│    M  src/utils/parser.ts            [⊖] [📄]│
│    A  src/new-feature.ts             [⊖] [📄]│
│    D  src/deprecated.ts              [⊖] [📄]│
├──────────────────────────────────────────────┤
│  Changes (2)                            [+]  │
│    M  README.md                      [⊕] [📄]│
│    ?  temp.log                       [⊕] [📄]│
├──────────────────────────────────────────────┤
│  ┌────────────────────────────────────┐      │
│  │ Commit message...                  │      │
│  └────────────────────────────────────┘      │
│  [Commit] [Amend]    ↑2 ↓0                  │
└──────────────────────────────────────────────┘
```

Features:
- File list with status icons (M/A/D/R/?) and color coding.
- `[⊕]` stages a file; `[⊖]` unstages a file.
- `[📄]` opens the diff viewer for that file.
- `[+]` next to "Changes" stages all; `[-]` next to "Staged" unstages all.
- Commit message textarea with Ctrl+Enter to commit.
- Amend button toggles amend mode (loads last commit message).
- Ahead/behind counter next to Commit button.
- Auto-refreshes when `git:status:changed` events arrive.

### 2.7 UI — Diff Viewer

**File:** `packages/ui/src/renderer/components/panels/DiffViewer.tsx`

Uses CodeMirror 6's `@codemirror/merge` extension (already available via the existing CodeMirror dependency) to show a side-by-side or unified diff view.

- Receives `oldContent` and `newContent` from the `git:diff` response.
- Syntax highlighting based on file extension.
- Opens as a tab in the center panel (like editing a file, but read-only diff).
- Header shows file path and status (staged/unstaged).

### 2.8 UI — Stash Manager

**File:** `packages/ui/src/renderer/components/dialogs/StashManagerDialog.tsx`

- Lists stashes with index, message, date, and source branch.
- Actions per stash: Apply, Pop, Drop.
- "Stash Changes" button at top with optional message input.
- Checkbox: "Include untracked files".

### 2.9 Context Menu Additions

Add to the Git submenu (from Phase 1):

```typescript
{ label: "Stash Changes...", Icon: Archive, action: () => setShowStashManager(true), separator: true },
```

The commit workflow is primarily accessed via the Commit Panel, not the context menu. But a "Stash" entry in the Git submenu provides quick access.

### 2.10 Checklist

- [ ] 12 new Zod request types + 11 new response types + 1 push event in `packages/shared/src/ipc.ts`
- [ ] `GitOperationsGateway` extended with status, staging, commit, diff, stash methods
- [ ] `GitApplicationService` extended with corresponding orchestration methods
- [ ] New IPC handlers registered (12 handlers)
- [ ] `ResponseForRequest` updated for all new types
- [ ] `gitStore.ts` created with status, diff, stash, and commit state
- [ ] `CommitPanel` component built and wired into bottom dock
- [ ] `DiffViewer` component built using CodeMirror merge extension
- [ ] `StashManagerDialog` built
- [ ] Auto-refresh on `git:status:changed` push events
- [ ] Stash entry added to Git submenu

---

## Phase 3 — Advanced Operations

**Goal:** Complete the Git management story with history viewing, cherry-pick, rebase, tags, remotes, reset/revert, and conflict resolution.

### 3.1 Shared Package Changes (`packages/shared/src/ipc.ts`)

#### New IPC Request Types

```typescript
// Log / History
z.object({ type: z.literal("git:log"), repoPath: z.string(), branch: z.string().optional(), limit: z.number().int().positive().optional(), skip: z.number().int().nonnegative().optional() }),

// Cherry-pick
z.object({ type: z.literal("git:cherry-pick"), repoPath: z.string(), commitHash: z.string() }),

// Rebase
z.object({ type: z.literal("git:rebase"), repoPath: z.string(), onto: z.string(), interactive: z.boolean().optional() }),
z.object({ type: z.literal("git:rebase:abort"), repoPath: z.string() }),
z.object({ type: z.literal("git:rebase:continue"), repoPath: z.string() }),

// Tags
z.object({ type: z.literal("git:tag:list"), repoPath: z.string() }),
z.object({ type: z.literal("git:tag:create"), repoPath: z.string(), tagName: z.string(), message: z.string().optional(), commitHash: z.string().optional() }),
z.object({ type: z.literal("git:tag:delete"), repoPath: z.string(), tagName: z.string() }),

// Remotes
z.object({ type: z.literal("git:remote:list"), repoPath: z.string() }),
z.object({ type: z.literal("git:remote:add"), repoPath: z.string(), name: z.string(), url: z.string() }),
z.object({ type: z.literal("git:remote:remove"), repoPath: z.string(), name: z.string() }),

// Reset / Revert
z.object({ type: z.literal("git:reset"), repoPath: z.string(), commitHash: z.string(), mode: z.enum(["soft", "mixed", "hard"]) }),
z.object({ type: z.literal("git:revert"), repoPath: z.string(), commitHash: z.string() }),

// Conflict resolution
z.object({ type: z.literal("git:conflicts"), repoPath: z.string() }),
z.object({ type: z.literal("git:resolve"), repoPath: z.string(), filePath: z.string(), resolution: z.enum(["ours", "theirs", "manual"]), content: z.string().optional() }),
z.object({ type: z.literal("git:merge:abort"), repoPath: z.string() }),
```

#### New IPC Response Types

```typescript
z.object({
  type: z.literal("git:log:result"),
  repoPath: z.string(),
  commits: z.array(z.object({
    hash: z.string(),
    shortHash: z.string(),
    author: z.string(),
    email: z.string(),
    date: z.string(),
    message: z.string(),
    refs: z.array(z.string()),   // branch/tag labels
  })),
  hasMore: z.boolean(),
}),
z.object({ type: z.literal("git:cherry-pick:result"), success: z.boolean(), message: z.string(), conflicts: z.array(z.string()).optional() }),
z.object({ type: z.literal("git:rebase:result"), success: z.boolean(), message: z.string(), conflicts: z.array(z.string()).optional() }),
z.object({ type: z.literal("git:rebase:abort:result"), success: z.boolean() }),
z.object({ type: z.literal("git:rebase:continue:result"), success: z.boolean(), message: z.string() }),
z.object({
  type: z.literal("git:tag:list:result"),
  repoPath: z.string(),
  tags: z.array(z.object({ name: z.string(), commitHash: z.string(), message: z.string().optional(), date: z.string().optional() })),
}),
z.object({ type: z.literal("git:tag:create:result"), success: z.boolean(), message: z.string() }),
z.object({ type: z.literal("git:tag:delete:result"), success: z.boolean(), message: z.string() }),
z.object({
  type: z.literal("git:remote:list:result"),
  repoPath: z.string(),
  remotes: z.array(z.object({ name: z.string(), fetchUrl: z.string(), pushUrl: z.string() })),
}),
z.object({ type: z.literal("git:remote:add:result"), success: z.boolean() }),
z.object({ type: z.literal("git:remote:remove:result"), success: z.boolean() }),
z.object({ type: z.literal("git:reset:result"), success: z.boolean(), message: z.string() }),
z.object({ type: z.literal("git:revert:result"), success: z.boolean(), message: z.string(), conflicts: z.array(z.string()).optional() }),
z.object({
  type: z.literal("git:conflicts:result"),
  repoPath: z.string(),
  files: z.array(z.object({
    path: z.string(),
    oursContent: z.string(),
    theirsContent: z.string(),
    baseContent: z.string(),
  })),
}),
z.object({ type: z.literal("git:resolve:result"), success: z.boolean() }),
z.object({ type: z.literal("git:merge:abort:result"), success: z.boolean() }),
```

### 3.2 Gateway Extensions

Add to `GitOperationsGateway`:

```typescript
// ── Log ──
getLog(repoPath: string, branch?: string, limit?: number, skip?: number): CommitLogEntry[];

// ── Cherry-pick ──
cherryPick(repoPath: string, commitHash: string): { success: boolean; message: string; conflicts?: string[] };

// ── Rebase ──
rebase(repoPath: string, onto: string): { success: boolean; message: string; conflicts?: string[] };
rebaseAbort(repoPath: string): void;
rebaseContinue(repoPath: string): { success: boolean; message: string };

// ── Tags ──
listTags(repoPath: string): TagEntry[];
createTag(repoPath: string, tagName: string, message?: string, commitHash?: string): void;
deleteTag(repoPath: string, tagName: string): void;

// ── Remotes ──
listRemotes(repoPath: string): RemoteEntry[];
addRemote(repoPath: string, name: string, url: string): void;
removeRemote(repoPath: string, name: string): void;

// ── Reset / Revert ──
reset(repoPath: string, commitHash: string, mode: "soft" | "mixed" | "hard"): void;
revert(repoPath: string, commitHash: string): { success: boolean; message: string; conflicts?: string[] };

// ── Conflict Resolution ──
getConflictFiles(repoPath: string): ConflictFile[];
resolveConflict(repoPath: string, filePath: string, resolution: "ours" | "theirs" | "manual", content?: string): void;
mergeAbort(repoPath: string): void;
```

Implementation notes:
- `getLog` uses `git log --format=<custom> --decorate=short` with pagination via `--skip` and `-n` (limit).
- `cherryPick` uses `git cherry-pick <hash>`. On conflict, returns the list of conflicted files.
- `reset` with `mode: "hard"` is destructive — the application service must add a confirmation flow.
- `getConflictFiles` reads the base, ours, and theirs versions using `git show :1:<path>` (base), `:2:<path>` (ours), `:3:<path>` (theirs).
- `resolveConflict` with `"manual"` writes the provided content to disk, then `git add <file>`.

### 3.3 Application Service Extensions

Add to `GitApplicationService`:

```typescript
getLog(repoPath: string, branch?: string, limit?: number, skip?: number): { commits: CommitLogEntry[]; hasMore: boolean };
cherryPick(repoPath: string, commitHash: string): CherryPickResult;
rebase(repoPath: string, onto: string): RebaseResult;
rebaseAbort(repoPath: string): void;
rebaseContinue(repoPath: string): RebaseResult;
listTags(repoPath: string): TagEntry[];
createTag(repoPath: string, tagName: string, message?: string, commitHash?: string): void;
deleteTag(repoPath: string, tagName: string): void;
listRemotes(repoPath: string): RemoteEntry[];
addRemote(repoPath: string, name: string, url: string): void;
removeRemote(repoPath: string, name: string): void;
reset(repoPath: string, commitHash: string, mode: "soft" | "mixed" | "hard"): void;
revert(repoPath: string, commitHash: string): RevertResult;
getConflicts(repoPath: string): ConflictFile[];
resolveConflict(repoPath: string, filePath: string, resolution: string, content?: string): void;
mergeAbort(repoPath: string): void;
```

Orchestration logic:
- `reset("hard")` — throw `VALIDATION_ERROR` if there are worktrees on the affected branch (data loss risk). The UI should show a confirmation dialog.
- `rebase` — check for uncommitted changes first; require clean working tree.
- `cherryPick` — after success, emit `git:status:changed` so Commit Panel updates.

### 3.4 UI — Commit Log Panel

**File:** `packages/ui/src/renderer/components/panels/CommitLogPanel.tsx`

A scrollable list of commits displayed in the center panel (as a tab). Each commit shows:
- Short hash (clickable to copy full hash)
- Author name and relative date
- Commit message (first line)
- Branch/tag labels as colored badges
- Right-click context menu: "Cherry-pick", "Revert", "Reset to here...", "Copy hash"

Supports infinite scroll (pagination via `skip` parameter).

Optional enhancement: a simple ASCII branch graph using the `--graph` output from git log.

### 3.5 UI — Conflict Resolution Panel

**File:** `packages/ui/src/renderer/components/panels/ConflictResolutionPanel.tsx`

Opens automatically when a merge/rebase/cherry-pick results in conflicts. Shows:
- List of conflicted files
- Per file: "Accept Ours", "Accept Theirs", "Edit Manually" buttons
- "Edit Manually" opens a 3-pane merge editor using CodeMirror:
  - Left: "ours" version
  - Center: merged result (editable)
  - Right: "theirs" version
- Footer: "Mark All Resolved" + "Abort Merge/Rebase" buttons

### 3.6 UI — Tag Manager Dialog

**File:** `packages/ui/src/renderer/components/dialogs/TagManagerDialog.tsx`

- Lists existing tags with commit hash, message, and date.
- "Create Tag" form: name, optional message, optional commit (defaults to HEAD).
- Delete button per tag (with confirmation).
- Push tags button (`git push --tags`).

### 3.7 UI — Remote Manager Dialog

**File:** `packages/ui/src/renderer/components/dialogs/RemoteManagerDialog.tsx`

- Lists remotes with name, fetch URL, and push URL.
- "Add Remote" form: name and URL.
- Delete button per remote (with confirmation for non-origin remotes).

### 3.8 Context Menu Additions

Extend the Git submenu from Phase 1:

```typescript
// After the existing items:
{ label: "View Log...", Icon: Clock, action: () => openCommitLog(), separator: true },
{ label: "Tags...", Icon: Tag, action: () => setShowTagManager(true) },
{ label: "Remotes...", Icon: Globe, action: () => setShowRemoteManager(true) },
```

### 3.9 Checklist

- [ ] 16 new Zod request types + 16 new response types in `packages/shared/src/ipc.ts`
- [ ] `GitOperationsGateway` extended with log, cherry-pick, rebase, tag, remote, reset, revert, conflict methods
- [ ] `GitApplicationService` extended with corresponding orchestration methods
- [ ] New IPC handlers registered (16 handlers)
- [ ] `ResponseForRequest` updated for all new types
- [ ] `gitStore` extended with log, tags, remotes, conflicts state
- [ ] `CommitLogPanel` built with infinite scroll and commit context menu
- [ ] `ConflictResolutionPanel` built with 3-pane merge editor
- [ ] `TagManagerDialog` built
- [ ] `RemoteManagerDialog` built
- [ ] Git submenu extended with Log, Tags, Remotes entries
- [ ] Safety guards: confirmation for hard reset, clean-tree check for rebase

---

## Cross-Cutting Concerns

### Error Handling

All new operations use the existing `AppError` pattern. The `GIT_ERROR` code covers most git failures. Add one new code:

```typescript
"MERGE_CONFLICT"  // specifically for conflict states (merge, rebase, cherry-pick)
```

This allows the UI to distinguish "something went wrong" from "there are conflicts to resolve" and open the Conflict Resolution Panel automatically.

### Auto-Refresh Strategy

The daemon emits `git:status:changed` push events after any state-changing operation. The UI subscribes to this event in `gitStore.initializeSubscriptions()` and refetches status for the affected repo.

Additionally, the Commit Panel polls `git:status` on a 30-second interval (configurable) when the panel is visible, to catch changes made by external tools (e.g., the user editing files in another editor).

On window focus (`document.visibilitychange`), trigger an immediate status refresh for the active repo.

### Testing Strategy

| Layer | Test Type | Approach |
|-------|-----------|----------|
| `GitOperationsGateway` | Integration | Test against a real temporary git repo (use `tmp` directory with `git init`). No mocks. |
| `GitApplicationService` | Unit | Mock `GitOperationsGateway` and `GitGateway`. Test orchestration, validation, error wrapping. |
| IPC Handlers | Unit | Mock `GitApplicationService`. Verify handlers are thin (delegate and return). |
| `gitStore` | Unit | Mock `sendOrThrow`. Test state transitions: loading states, error states, optimistic updates. |
| `CommitPanel` | Integration | Mount with mocked IPC. Verify staging/unstaging/commit flows. |
| `DiffViewer` | Snapshot | Render with sample diff data. Verify CodeMirror merge extension mounts correctly. |
| Dialogs | Integration | Mount with mocked store. Verify form validation and IPC calls on submit. |

### New Files Summary (All Phases)

```
packages/shared/src/ipc.ts                                    (MODIFY — ~35 new request types, ~34 new response types)

packages/daemon/src/infrastructure/GitOperationsGateway.ts     (NEW)
packages/daemon/src/application/GitApplicationService.ts       (NEW)
packages/daemon/src/ipc/handlers/gitOperationHandlers.ts       (NEW)
packages/daemon/src/ipc/registerHandlers.ts                    (MODIFY — wire new service + handlers)
packages/daemon/src/errors/AppError.ts                         (MODIFY — add MERGE_CONFLICT code)

packages/ui/src/renderer/store/gitStore.ts                     (NEW)
packages/ui/src/renderer/services/ipcClient.ts                 (MODIFY — extend ResponseForRequest)
packages/ui/src/renderer/components/common/ContextMenu.tsx      (MODIFY — add submenu support)
packages/ui/src/renderer/components/sidebar/RepoItem.tsx        (MODIFY — add Git submenu)

packages/ui/src/renderer/components/dialogs/BranchSwitcherDialog.tsx   (NEW)
packages/ui/src/renderer/components/dialogs/CreateBranchDialog.tsx     (NEW)
packages/ui/src/renderer/components/dialogs/MergeBranchDialog.tsx      (NEW)
packages/ui/src/renderer/components/dialogs/DeleteBranchDialog.tsx     (NEW)
packages/ui/src/renderer/components/dialogs/RenameBranchDialog.tsx     (NEW)
packages/ui/src/renderer/components/dialogs/StashManagerDialog.tsx     (NEW)
packages/ui/src/renderer/components/dialogs/TagManagerDialog.tsx       (NEW)
packages/ui/src/renderer/components/dialogs/RemoteManagerDialog.tsx    (NEW)

packages/ui/src/renderer/components/panels/CommitPanel.tsx             (NEW)
packages/ui/src/renderer/components/panels/DiffViewer.tsx              (NEW)
packages/ui/src/renderer/components/panels/CommitLogPanel.tsx          (NEW)
packages/ui/src/renderer/components/panels/ConflictResolutionPanel.tsx (NEW)
```

### Dependencies Between Phases

```
Phase 1 ← standalone (no dependencies)
Phase 2 ← depends on Phase 1 (uses GitOperationsGateway + GitApplicationService created in Phase 1)
Phase 3 ← depends on Phase 2 (uses gitStore, DiffViewer, and the Git submenu from Phase 2)
```

Phase 1 can be implemented and shipped independently. Phase 2 builds on the gateway and service from Phase 1. Phase 3 builds on the store and UI patterns established in Phase 2.
