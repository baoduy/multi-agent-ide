# Git Management — Repository Context Menu Enhancement

**Status:** Draft
**Author:** Steven
**Created:** 2026-04-15
**Last Updated:** 2026-04-15

## Overview

Add 5 essential Git operations to the repository context menu so developers can branch and sync without leaving Magenta IDE. The scope is deliberately small — no merge conflict UI, no commit panel, no stash management. Just the daily workflow.

### The 5 Features

1. **Switch Branch** — searchable dialog, checkout a local branch
2. **Create Branch** — name + start point, optionally switch after creation
3. **Pull** — fetch + merge from remote (one-click)
4. **Push** — push current branch to remote (one-click)
5. **Fetch** — update remote tracking branches (one-click)

---

## Current State

The context menu has 6-7 items (pin, open, copy path, add worktree, refresh, onboard/upgrade). The daemon already supports `branch:list` and `branch:checkout` IPC endpoints but the UI has no way to trigger them from the context menu. No push/pull/fetch support exists at any layer.

---

## Design Decisions

### Context Menu Layout

No submenu needed for just 5 items. They go directly on the context menu with a separator:

```
Right-click repo:
  Pin to top
  Open in File Explorer
  Copy path
  Add Worktree
  ─────────────────
  Switch Branch...        ← NEW (opens dialog)
  Create Branch...        ← NEW (opens dialog)
  ─────────────────
  Pull                    ← NEW (one-click)
  Push                    ← NEW (one-click)
  Fetch                   ← NEW (one-click)
  ─────────────────
  Refresh
  Onboard / Upgrade Specify
```

### Pull/Push/Fetch UX

These are fire-and-forget actions — no dialog, no confirmation. The result (success or error message) is shown as an inline notification or toast. After pull, the repo store refreshes to update the branch label and spec state.

### No New Store Needed

The existing `repoStore` handles repo state refresh. The dialogs are self-contained (fetch branches on mount, call IPC, close). No `gitStore` required for this phase.

---

## Implementation

### Shared: IPC Schema Changes

**File:** `packages/shared/src/ipc.ts`

Add to `IpcRequestSchema`:

```typescript
z.object({ type: z.literal("branch:create"), repoPath: z.string(), branchName: z.string(), startPoint: z.string().optional() }),
z.object({ type: z.literal("git:fetch"), repoPath: z.string(), remote: z.string().optional() }),
z.object({ type: z.literal("git:pull"), repoPath: z.string(), remote: z.string().optional(), branch: z.string().optional() }),
z.object({ type: z.literal("git:push"), repoPath: z.string(), remote: z.string().optional(), branch: z.string().optional(), force: z.boolean().optional() }),
```

Add to `IpcResponseSchema`:

```typescript
z.object({ type: z.literal("branch:create:result"), repoPath: z.string(), branchName: z.string(), success: z.boolean() }),
z.object({ type: z.literal("git:fetch:result"), repoPath: z.string(), success: z.boolean(), message: z.string() }),
z.object({ type: z.literal("git:pull:result"), repoPath: z.string(), success: z.boolean(), message: z.string(), conflicts: z.array(z.string()).optional() }),
z.object({ type: z.literal("git:push:result"), repoPath: z.string(), success: z.boolean(), message: z.string() }),
```

Note: `branch:list`, `branch:checkout`, and their responses already exist. No changes needed for Switch Branch — we use the existing endpoints.

### Daemon: GitOperationsGateway

**File:** `packages/daemon/src/infrastructure/GitOperationsGateway.ts` (NEW)

```typescript
import { execSync } from "node:child_process";
import path from "node:path";

export class GitOperationsGateway {
  createBranch(repoPath: string, branchName: string, startPoint?: string): void {
    const resolved = path.resolve(repoPath);
    const cmd = startPoint
      ? `git branch "${branchName}" "${startPoint}"`
      : `git branch "${branchName}"`;
    execSync(cmd, { cwd: resolved, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
  }

  fetch(repoPath: string, remote?: string): { message: string } {
    const resolved = path.resolve(repoPath);
    const output = execSync(`git fetch ${remote ?? "origin"}`, {
      cwd: resolved, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"],
    });
    return { message: output.trim() || "Fetch complete." };
  }

  pull(repoPath: string, remote?: string, branch?: string): {
    success: boolean; message: string; conflicts?: string[];
  } {
    const resolved = path.resolve(repoPath);
    const args = [remote ?? "origin", branch].filter(Boolean).join(" ");
    try {
      const output = execSync(`git pull --no-rebase ${args}`, {
        cwd: resolved, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"],
      });
      return { success: true, message: output.trim() || "Already up to date." };
    } catch (error) {
      const stderr = error instanceof Error ? (error as any).stderr?.toString() ?? error.message : String(error);
      // Detect conflict state
      if (stderr.includes("CONFLICT") || stderr.includes("Automatic merge failed")) {
        const conflictFiles = this.getConflictedFiles(resolved);
        // Abort the failed merge so working tree is clean
        try { execSync("git merge --abort", { cwd: resolved, stdio: "pipe" }); } catch { /* best effort */ }
        return { success: false, message: "Pull resulted in merge conflicts.", conflicts: conflictFiles };
      }
      throw error;
    }
  }

  push(repoPath: string, remote?: string, branch?: string, force?: boolean): { message: string } {
    const resolved = path.resolve(repoPath);
    const forceFlag = force ? " --force-with-lease" : "";
    const args = [remote ?? "origin", branch].filter(Boolean).join(" ");
    const output = execSync(`git push${forceFlag} ${args}`, {
      cwd: resolved, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"],
    });
    return { message: output.trim() || "Push complete." };
  }

  private getConflictedFiles(repoPath: string): string[] {
    try {
      const raw = execSync("git diff --name-only --diff-filter=U", {
        cwd: repoPath, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"],
      });
      return raw.trim().split("\n").filter(Boolean);
    } catch { return []; }
  }
}
```

### Daemon: GitApplicationService

**File:** `packages/daemon/src/application/GitApplicationService.ts` (NEW)

```typescript
import type { GitOperationsGateway } from "../infrastructure/GitOperationsGateway";
import { requireNonEmpty } from "../errors/validation";
import { wrapError } from "../errors/wrapError";

export class GitApplicationService {
  constructor(private readonly gitOps: GitOperationsGateway) {}

  createBranch(repoPath: string, branchName: string, startPoint?: string): { success: boolean } {
    requireNonEmpty(repoPath, "repoPath");
    requireNonEmpty(branchName, "branchName");
    return wrapError(() => {
      this.gitOps.createBranch(repoPath, branchName, startPoint);
      return { success: true };
    }, "GIT_ERROR", "create branch");
  }

  fetch(repoPath: string, remote?: string): { success: boolean; message: string } {
    requireNonEmpty(repoPath, "repoPath");
    return wrapError(() => {
      const result = this.gitOps.fetch(repoPath, remote);
      return { success: true, message: result.message };
    }, "GIT_ERROR", "fetch");
  }

  pull(repoPath: string, remote?: string, branch?: string): {
    success: boolean; message: string; conflicts?: string[];
  } {
    requireNonEmpty(repoPath, "repoPath");
    return wrapError(() => this.gitOps.pull(repoPath, remote, branch), "GIT_ERROR", "pull");
  }

  push(repoPath: string, remote?: string, branch?: string, force?: boolean): {
    success: boolean; message: string;
  } {
    requireNonEmpty(repoPath, "repoPath");
    return wrapError(() => {
      const result = this.gitOps.push(repoPath, remote, branch, force);
      return { success: true, message: result.message };
    }, "GIT_ERROR", "push");
  }
}
```

### Daemon: IPC Handlers

**File:** `packages/daemon/src/ipc/handlers/gitOperationHandlers.ts` (NEW)

```typescript
import type { IPCBridge } from "../IPCBridge";
import type { GitApplicationService } from "../../application/GitApplicationService";
import { safeHandle } from "../createHandler";

type GitOperationHandlerContext = {
  bridge: IPCBridge;
  gitService: GitApplicationService;
};

export function registerGitOperationHandlers({ bridge, gitService }: GitOperationHandlerContext): void {
  safeHandle(bridge, "branch:create", async (msg) => {
    const result = gitService.createBranch(msg.repoPath, msg.branchName, msg.startPoint);
    return { type: "branch:create:result", repoPath: msg.repoPath, branchName: msg.branchName, success: result.success };
  });

  safeHandle(bridge, "git:fetch", async (msg) => {
    const result = gitService.fetch(msg.repoPath, msg.remote);
    return { type: "git:fetch:result", repoPath: msg.repoPath, ...result };
  });

  safeHandle(bridge, "git:pull", async (msg) => {
    const result = gitService.pull(msg.repoPath, msg.remote, msg.branch);
    // Refresh repo state after pull (branch may have moved, specs may have changed)
    bridge.emit({ type: "repo:force-reload:started", repoPath: msg.repoPath });
    return { type: "git:pull:result", repoPath: msg.repoPath, ...result };
  });

  safeHandle(bridge, "git:push", async (msg) => {
    const result = gitService.push(msg.repoPath, msg.remote, msg.branch, msg.force);
    return { type: "git:push:result", repoPath: msg.repoPath, ...result };
  });
}
```

### Daemon: Handler Registration

**File:** `packages/daemon/src/ipc/registerHandlers.ts` (MODIFY)

Add:

```typescript
import { GitOperationsGateway } from "../infrastructure/GitOperationsGateway";
import { GitApplicationService } from "../application/GitApplicationService";
import { registerGitOperationHandlers } from "./handlers/gitOperationHandlers";

// Inside registerHandlers(), after existing service setup:
const gitOpsGateway = new GitOperationsGateway();
const gitService = new GitApplicationService(gitOpsGateway);
registerGitOperationHandlers({ bridge, gitService });
```

### UI: ResponseForRequest

**File:** `packages/ui/src/renderer/services/ipcClient.ts` (MODIFY)

Add to `ResponseForRequest`:

```typescript
"branch:create": "branch:create:result";
"git:fetch": "git:fetch:result";
"git:pull": "git:pull:result";
"git:push": "git:push:result";
```

### UI: RepoItem Context Menu

**File:** `packages/ui/src/renderer/components/sidebar/RepoItem.tsx` (MODIFY)

Add 5 new context menu items and 2 dialog state variables. The Pull/Push/Fetch actions call `sendOrThrow` directly and trigger `repoStore.fetchRepos()` on completion.

### UI: BranchSwitcherDialog

**File:** `packages/ui/src/renderer/components/dialogs/BranchSwitcherDialog.tsx` (NEW)

- Props: `repoPath`, `currentBranch`, `onClose`
- On mount: fetch branches via `sendOrThrow({ type: "branch:list", repoPath })`
- Searchable text input filters the branch list
- Current branch shown with a checkmark, non-clickable
- Clicking another branch calls `sendOrThrow({ type: "branch:checkout", repoPath, branch })`
- On success: close dialog, refresh repoStore
- On error: show error message inline

### UI: CreateBranchDialog

**File:** `packages/ui/src/renderer/components/dialogs/CreateBranchDialog.tsx` (NEW)

- Props: `repoPath`, `currentBranch`, `onClose`
- Text input for branch name (validate: no spaces, valid git ref)
- Dropdown for start point (fetch branches, default to current)
- Checkbox: "Switch to new branch after creation"
- On confirm: `sendOrThrow({ type: "branch:create", repoPath, branchName, startPoint })`
- If switch checked: follow with `sendOrThrow({ type: "branch:checkout", ... })`
- On success: close dialog, refresh repoStore

---

## Implementation Tasks

7 tasks, ordered by dependency. Tasks in the same group can be done in parallel.

### Task 1: IPC schemas (4 new request types, 4 new response types)

**File:** `packages/shared/src/ipc.ts`

Add `branch:create`, `git:fetch`, `git:pull`, `git:push` to `IpcRequestSchema` and their `:result` variants to `IpcResponseSchema`. See exact schemas above.

**Done when:** TypeScript compiles, Zod parses sample payloads for all 4 new types.

---

### Task 2: GitOperationsGateway

**File:** `packages/daemon/src/infrastructure/GitOperationsGateway.ts` (NEW)

Create the gateway with 4 methods: `createBranch`, `fetch`, `pull`, `push`. See implementation above.

`pull` must detect conflicts (check stderr for "CONFLICT"), abort the failed merge, and return the conflict file list. `push` with `force: true` uses `--force-with-lease`.

**Done when:** Integration tests pass against a temp git repo with a bare remote.

---

### Task 3: GitApplicationService + IPC handlers + wiring

**Files:**
- `packages/daemon/src/application/GitApplicationService.ts` (NEW)
- `packages/daemon/src/ipc/handlers/gitOperationHandlers.ts` (NEW)
- `packages/daemon/src/ipc/registerHandlers.ts` (MODIFY)

Create the service (4 methods with validation + wrapError), create 4 thin safeHandle handlers, wire in registerHandlers. The `git:pull` handler emits `repo:force-reload:started` after success.

**Depends on:** Task 1, Task 2.
**Done when:** All 4 IPC endpoints respond correctly. TypeScript compiles.

---

### Task 4: UI — ResponseForRequest update

**File:** `packages/ui/src/renderer/services/ipcClient.ts`

Add 4 entries to the `ResponseForRequest` type map.

**Depends on:** Task 1.
**Done when:** TypeScript compiles.

---

### Task 5: BranchSwitcherDialog

**File:** `packages/ui/src/renderer/components/dialogs/BranchSwitcherDialog.tsx` (NEW)

Searchable branch list dialog. Uses existing `branch:list` and `branch:checkout` endpoints. See spec above.

**Depends on:** Task 4.
**Done when:** Dialog opens, lists branches, filters on search, switches branch, refreshes repo label.

---

### Task 6: CreateBranchDialog

**File:** `packages/ui/src/renderer/components/dialogs/CreateBranchDialog.tsx` (NEW)

Branch name input + start point dropdown + optional auto-switch. Uses new `branch:create` endpoint. See spec above.

**Depends on:** Task 4.
**Done when:** Dialog creates a branch, optionally switches to it, refreshes repo.

---

### Task 7: RepoItem context menu integration

**File:** `packages/ui/src/renderer/components/sidebar/RepoItem.tsx` (MODIFY)

Add 5 items to the context menu: "Switch Branch..." and "Create Branch..." open dialogs; "Pull", "Push", "Fetch" are one-click fire-and-forget actions that show a result/error via notification.

**Depends on:** Task 3, Task 5, Task 6.
**Done when:** Right-click a repo, all 5 items visible, all 5 actions work end-to-end.

---

### Execution Order

```
Group A (parallel):  Task 1, Task 2
Group B (after A):   Task 3, Task 4
Group C (parallel, after B):  Task 5, Task 6
Group D (after C):   Task 7
```

### Files Changed Summary

```
packages/shared/src/ipc.ts                                  (MODIFY — 4 request + 4 response types)
packages/daemon/src/infrastructure/GitOperationsGateway.ts   (NEW — 4 methods)
packages/daemon/src/application/GitApplicationService.ts     (NEW — 4 methods)
packages/daemon/src/ipc/handlers/gitOperationHandlers.ts     (NEW — 4 handlers)
packages/daemon/src/ipc/registerHandlers.ts                  (MODIFY — wire new service)
packages/ui/src/renderer/services/ipcClient.ts               (MODIFY — 4 type map entries)
packages/ui/src/renderer/components/sidebar/RepoItem.tsx     (MODIFY — 5 menu items)
packages/ui/src/renderer/components/dialogs/BranchSwitcherDialog.tsx  (NEW)
packages/ui/src/renderer/components/dialogs/CreateBranchDialog.tsx    (NEW)
```

9 files total (4 new, 5 modified). No new stores, no new panels, no submenu complexity.
