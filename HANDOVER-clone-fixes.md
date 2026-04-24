# Handover: Git Clone Dialog Fixes + Destination Picker

**Purpose:** This document is a self-contained handover for Claude Code. Read this first, then `CLAUDE.md` for project conventions, then execute the plan phase by phase.

**Important:** Follow the four coding behaviors in `CLAUDE.md` (Think Before Coding, Simplicity First, Surgical Changes, Goal-Driven Execution). Verification in this repo stops at **typecheck + build** — the user tests manually.

---

## The problem

Two user-reported issues in the git clone flow:

1. **Clone dialog gets stuck** at high percent with the spinner still spinning, even though the repo has already been cloned successfully to disk. User has to close the dialog manually; the repo does appear after a refresh.
2. **Clone destination dropdown is too restrictive** — it only allows choosing one of the configured working directories from Settings. The user wants to clone into any **non-git subfolder** of a configured working directory (e.g. if `_CODE/GIT/` is configured, they want to pick `_CODE/GIT/clients/` if that subfolder isn't already a repo).

---

## Root-cause analysis (already done — don't redo)

### Bug A — Completion gated on scan queue

In `packages/daemon/src/application/GitCloneApplicationService.ts`, `runClone` awaits `scanQueue.requestScan(workingDirs)` **before** emitting `git:clone:complete`. The clone itself has already succeeded on disk at that point; the scan is a cache refresh. If the scan queue is busy or slow, the `complete` event is delayed indefinitely and the dialog stays open.

### Bug B — Event race against store seeding

In `packages/ui/src/renderer/store/gitCloneStore.ts`, `startClone` awaits `sendOrThrow({ type: "git:clone", ... })`, and only **after** the await adds the entry to the `clones` Map. The `ipc.on("git:clone:progress" | "git:clone:complete")` handlers drop events for unknown `cloneId`s (`if (!current) return;`). Any event that fires during the IPC round-trip is lost. This is survivable for progress events (spammy) but fatal for a fast `complete` event.

### Bug C — Subscription lifecycle tied to dialog mount

`CloneRepoDialog` calls `initializeCloneSubs()` inside a `useEffect`. It's idempotent (wrapped in `createSubscriptionInitializer`) so not buggy per se, but an in-flight clone started from elsewhere (or one still running when the dialog is closed/reopened) won't have its events handled. Consistent with the rest of the codebase, boot subscriptions should live at app boot.

### Scope for destination picker

`config.workingDirs` is the allowlist used both by the dialog dropdown and the daemon's validation in `startClone`. Relaxing this requires coordinated changes in shared schema + daemon validation + UI.

---

## Architecture conventions (enforce these)

From `CLAUDE.md` — do not violate:

- **Layering:** IPC handlers → Application services → Domain/Infrastructure → Data access → shared. Dependencies flow downward only.
- **Handlers are thin adapters.** No `fs`, no `git`, no `try/catch`, no casting. Use `safeHandle(bridge, "...", async (msg) => {...})`.
- **Infrastructure wraps I/O.** Any new `fs` access goes through `FileSystemGateway` (or a similarly-named gateway). `AppError` wrapping happens at the gateway boundary.
- **Composition root** is `DaemonContainer`. Don't construct services inside other services. Wire deps there.
- **`sendOrThrow()`** in the renderer — never manual `if (response.type === 'error')`.
- **Zod schema changes** in `packages/shared/src/ipc.ts` — update both `IpcRequestSchema` and `IpcResponseSchema` discriminated unions, and `ResponseForRequest` in `packages/ui/src/renderer/services/ipcClient.ts`.
- **No drive-by edits.** Only change what the task requires.

---

## Phase 1 — Unstick the dialog (smallest possible change)

**Goal:** `git:clone:complete` fires the moment the clone is on disk, not after the scan.

**File:** `packages/daemon/src/application/GitCloneApplicationService.ts`

**Current code** (lines ~71-102):

```ts
try {
  await this.cloneGateway.clone({ ... });

  // Repo is on disk — the scanner walks configured working dirs...
  try {
    const { workingDirs } = this.configManager.getConfig();
    await this.scanQueue.requestScan(workingDirs);
  } catch {
    // Scan errors shouldn't fail the clone...
  }

  this.bridge.emit({
    type: "git:clone:complete",
    cloneId,
    repoPath: targetPath,
    success: true,
  });
} catch (err) { ... }
```

**Change to:**

```ts
try {
  await this.cloneGateway.clone({ ... });

  // Repo is on disk → the clone has succeeded. Emit complete NOW so the UI
  // releases immediately; the scan is a cache refresh and must not gate the event.
  this.bridge.emit({
    type: "git:clone:complete",
    cloneId,
    repoPath: targetPath,
    success: true,
  });

  // Fire-and-forget scan. The scanner walks working dirs and picks up the
  // new repo without blocking the UI.
  const { workingDirs } = this.configManager.getConfig();
  void this.scanQueue.requestScan(workingDirs).catch(() => {
    // Scan errors are non-fatal — clone already succeeded on disk.
  });
} catch (err) { ... }
```

**Verification:**

- `pnpm typecheck` clean.
- `pnpm build` clean.
- No other callers of `runClone` depend on the scan having completed by the time `complete` is emitted (grep to confirm).

**Commit message suggestion:** `fix(daemon): emit git:clone:complete before scan to unblock UI dialog`

---

## Phase 2 — Close the event race permanently

**Goal:** No matter how fast the daemon emits events, the renderer's store has an entry for the `cloneId` before the first event arrives.

### 2.1 Add optional `cloneId` to the request schema

**File:** `packages/shared/src/ipc.ts`

Find the `git:clone` variant in `IpcRequestSchema`. Add an optional `cloneId: z.string().uuid().optional()` field. Update the TypeScript type accordingly.

**Do not** change the response schema — it already returns a `cloneId`.

### 2.2 Daemon honors the provided cloneId

**File:** `packages/daemon/src/application/GitCloneApplicationService.ts`

Update `StartCloneArgs` to include `cloneId?: string`. In `startClone`:

```ts
const cloneId = args.cloneId ?? randomUUID();
```

Keep server-side generation as a fallback so any other caller keeps working.

**File:** `packages/daemon/src/ipc/handlers/gitCloneHandlers.ts`

Pass `msg.cloneId` through to the service:

```ts
const result = await cloneService.startClone({
  cloneId: msg.cloneId,
  url: msg.url,
  targetDir: msg.targetDir,
  folderName: msg.folderName,
  depth: msg.depth,
});
```

### 2.3 Renderer seeds the store before the IPC await

**File:** `packages/ui/src/renderer/store/gitCloneStore.ts`

Current `startClone` awaits IPC, then seeds the Map. Invert the order:

```ts
async startClone(args) {
  const cloneId = crypto.randomUUID();
  const tentativeState: CloneState = {
    cloneId,
    url: args.url,
    targetPath: "", // filled in by server response
    phase: "Starting",
    percent: 0,
    status: "running",
    error: null,
    log: [],
  };
  const seeded = new Map(get().clones);
  seeded.set(cloneId, tentativeState);
  set({ clones: seeded, latestId: cloneId });

  try {
    const response = await sendOrThrow({
      type: "git:clone",
      cloneId,
      url: args.url,
      targetDir: args.targetDir,
      folderName: args.folderName,
      depth: args.depth,
    });
    // Fill in the server-confirmed target path. Don't overwrite status/percent —
    // push events may already have updated them.
    const current = get().clones.get(cloneId);
    if (current) {
      const withPath = new Map(get().clones);
      withPath.set(cloneId, { ...current, targetPath: response.targetPath });
      set({ clones: withPath });
    }
  } catch (err) {
    // Validation failed — remove the tentative entry so the dialog can show
    // the error via its own try/catch.
    const cleanup = new Map(get().clones);
    cleanup.delete(cloneId);
    set({
      clones: cleanup,
      latestId: get().latestId === cloneId ? null : get().latestId,
    });
    throw err;
  }

  return cloneId;
}
```

Use `crypto.randomUUID()` — available in modern browsers and Electron renderers. No new dependency needed.

### 2.4 Move the subscription init to app boot

**File:** `packages/ui/src/renderer/pages/DockMainPage.tsx`

Look around line ~115 where `initRepoSubscriptions`, `initConfigSubscriptions`, `initWorktreeSubscriptions` are wired. Add `initCloneSubscriptions` alongside them:

```ts
const initCloneSubscriptions = useGitCloneStore((s) => s.initializeSubscriptions);
```

And call it in the existing boot `useEffect` where the others are called.

**File:** `packages/ui/src/renderer/components/dialogs/CloneRepoDialog.tsx`

Remove the `initializeCloneSubs` import and the `initializeCloneSubs()` call from the dialog's `useEffect`. `fetchConfig()` stays.

**Verification for Phase 2:**

- Typecheck + build clean.
- Unit test for store (if the store has tests — check `packages/ui/src/renderer/store/__tests__/` or similar; if none exist, skip): simulate a `git:clone:progress` event for a seeded cloneId → expect the store state to update.
- Manual smoke: clone a small public repo; progress updates and complete event both land; dialog auto-closes.

**Commit message suggestion:** `fix(clone): client-generated cloneId to close store-seeding race`

---

## Phase 3 — Destination picker: non-git subfolders

**Goal:** The dropdown lists each configured working directory plus its direct non-git subfolders. User can pick any of them. Daemon validates accordingly.

**Design decisions (already made — don't re-litigate):**

- **Depth:** direct children only. Deeper nesting handled via `Browse…`.
- **Non-git definition:** folder does not contain a top-level `.git` entry (file or directory — handles both real repos and git worktree "gitlinks"). One `fs.stat` per candidate.
- **Hidden folders (leading `.`) are excluded.**

### 3.1 New IPC request

**File:** `packages/shared/src/ipc.ts`

Add a new variant to `IpcRequestSchema`:

```ts
z.object({
  type: z.literal("git:list-clone-destinations"),
}),
```

Add a new variant to `IpcResponseSchema`:

```ts
z.object({
  type: z.literal("git:clone-destinations"),
  roots: z.array(z.object({
    root: z.string(),
    children: z.array(z.string()),  // absolute paths of direct non-git subfolders
  })),
}),
```

Export the TypeScript types.

### 3.2 Gateway method

**File:** `packages/daemon/src/infrastructure/FileSystemGateway.ts` (or whichever existing gateway handles directory listing — check first; if there's a dedicated directory-listing utility used by the folder picker, extend that instead).

Add method:

```ts
/**
 * Lists direct subdirectories of `parent` that are not git repos, not hidden,
 * and not files/symlinks. Returns absolute paths, sorted alphabetically.
 * Throws AppError("FILE_NOT_FOUND") if parent doesn't exist.
 */
async listDirectNonGitChildren(parent: string): Promise<string[]> { ... }
```

Implementation sketch:

```ts
const entries = await fs.readdir(parent, { withFileTypes: true });
const out: string[] = [];
for (const ent of entries) {
  if (!ent.isDirectory()) continue;
  if (ent.name.startsWith(".")) continue;
  const full = path.join(parent, ent.name);
  const gitPath = path.join(full, ".git");
  // fs.stat — handles both .git dir (standard) and .git file (worktree gitlink).
  try {
    await fs.stat(gitPath);
    continue; // it's a repo — skip
  } catch {
    out.push(full);
  }
}
return out.sort();
```

Wrap I/O errors as `AppError` per existing convention in this gateway.

### 3.3 Application service method

**File:** `packages/daemon/src/application/GitCloneApplicationService.ts`

Add:

```ts
async listCloneDestinations(): Promise<{ root: string; children: string[] }[]> {
  const { workingDirs } = this.configManager.getConfig();
  const results: { root: string; children: string[] }[] = [];
  for (const root of workingDirs) {
    try {
      const children = await this.fileSystemGateway.listDirectNonGitChildren(root);
      results.push({ root, children });
    } catch {
      // Missing / unreadable working dir → include the root with no children
      // so the user can still select the root itself.
      results.push({ root, children: [] });
    }
  }
  return results;
}
```

Inject `FileSystemGateway` via the constructor. Update `DaemonContainer` (`packages/daemon/src/DaemonContainer.ts` — find it; it's the composition root) to pass it in.

### 3.4 Relax the allowlist in `startClone`

**File:** `packages/daemon/src/application/GitCloneApplicationService.ts`

Current:

```ts
const isAllowlisted = config.workingDirs.some(
  (wd) => path.resolve(wd) === normalizedParent,
);
```

Change to: accept `normalizedParent` if it is **either** a configured working dir **or** a direct child of one that is not itself a git repo. Implementation:

```ts
const workingDirs = config.workingDirs.map((wd) => path.resolve(wd));
const isWorkingDir = workingDirs.includes(normalizedParent);
const isDirectNonGitChild = workingDirs.some((wd) =>
  path.dirname(normalizedParent) === wd
) && !(await this.fileSystemGateway.pathExists(path.join(normalizedParent, ".git")));

if (!isWorkingDir && !isDirectNonGitChild) {
  throw new AppError(
    "VALIDATION_ERROR",
    `Clone target must be a configured working directory or a direct non-git subfolder. Got: ${normalizedParent}`,
  );
}
```

If `FileSystemGateway` doesn't have a `pathExists` method, add one — trivial wrapper around `fs.stat`. Or reuse `listDirectNonGitChildren(path.dirname(normalizedParent))` and check membership; either is fine.

### 3.5 Thin handler + registration

**File:** `packages/daemon/src/ipc/handlers/gitCloneHandlers.ts`

Add a second `safeHandle`:

```ts
safeHandle(bridge, "git:list-clone-destinations", async () => {
  const roots = await cloneService.listCloneDestinations();
  return { type: "git:clone-destinations", roots };
});
```

**File:** `packages/daemon/src/ipc/registerHandlers.ts`

No change expected — `registerGitCloneHandlers` is already wired. Confirm by reading.

### 3.6 Renderer — store and dialog

**File:** `packages/ui/src/renderer/services/ipcClient.ts`

Update `ResponseForRequest` so `git:list-clone-destinations` maps to the new response type.

**File:** `packages/ui/src/renderer/store/gitCloneStore.ts`

Add:

```ts
destinations: { root: string; children: string[] }[];
fetchDestinations: () => Promise<void>;
```

Implement `fetchDestinations` with `sendOrThrow`. Store the result. No cross-store imports.

**File:** `packages/ui/src/renderer/components/dialogs/CloneRepoDialog.tsx`

Replace the `workingDirs` dropdown with a grouped select backed by `destinations`. Each root is an `<optgroup label={root}>`, and each `<option>` is a full path — the root itself plus its non-git children. Sample rendering:

```tsx
{destinations.map(({ root, children }) => (
  <optgroup key={root} label={root}>
    <option value={root}>{root}  (root)</option>
    {children.map((c) => (
      <option key={c} value={c}>{"  "}{path.basename(c)}</option>
    ))}
  </optgroup>
))}
```

(Use a small helper for `basename` or inline it — don't import `node:path` into renderer code.)

Call `fetchDestinations()` in the existing `useEffect` alongside `fetchConfig()`.

Update `handleBrowse`: match the chosen folder against the **flat list** of all allowed paths (all roots + all children), not just `workingDirs`. The error message should say "Pick one from the dropdown or a direct subfolder of a working directory."

Update the default value of `targetDir`: prefer `defaultTargetDir`, else the first destination entry (root), else `""`.

Update the hint text under the dropdown: "The repo is cloned as a child folder inside your selected destination."

**Verification for Phase 3:**

- Typecheck + build clean.
- Unit test `FileSystemGateway.listDirectNonGitChildren` with fixtures: empty dir, mixed dir (repos + non-repos + files + hidden), nonexistent dir.
- Unit test updated allowlist validation in `GitCloneApplicationService.startClone`: accepts working dir, accepts direct non-git child, rejects nested grandchild, rejects path outside workingDirs tree, rejects direct child that is itself a git repo.
- Manual smoke: open clone dialog; destinations populate; select a non-git subfolder; clone succeeds into it; daemon doesn't reject.

**Commit message suggestion:** `feat(clone): allow non-git subfolders of working dirs as clone destinations`

---

## Rollout order

1. **Phase 1** as its own PR. Smallest change, directly fixes the user-facing symptom. Merge and confirm before proceeding.
2. **Phase 2** as its own PR. Race fix — cohesive unit.
3. **Phase 3** as its own PR. New feature; keep separate from bugfixes for clean revert.

---

## Out of scope (do NOT do)

- Do **not** swap `simple-git` for `nodegit` / `@readme/nodegit`. The clone path already uses `child_process.spawn` directly; nothing to gain.
- Do **not** touch `simple-git` callers elsewhere (`createGit.ts`, `RepoScanner.ts`).
- Do **not** add recursive subfolder listing — direct children only.
- Do **not** modify the Settings UI for working dirs. Same setting, broader interpretation in the clone dialog only.
- Do **not** refactor adjacent code. If you spot unrelated tech debt, mention it; don't delete it.

---

## Reference: files touched per phase

**Phase 1** (1 file):
- `packages/daemon/src/application/GitCloneApplicationService.ts`

**Phase 2** (5 files):
- `packages/shared/src/ipc.ts`
- `packages/daemon/src/application/GitCloneApplicationService.ts`
- `packages/daemon/src/ipc/handlers/gitCloneHandlers.ts`
- `packages/ui/src/renderer/store/gitCloneStore.ts`
- `packages/ui/src/renderer/components/dialogs/CloneRepoDialog.tsx`
- `packages/ui/src/renderer/pages/DockMainPage.tsx`

**Phase 3** (~8 files):
- `packages/shared/src/ipc.ts`
- `packages/daemon/src/infrastructure/FileSystemGateway.ts`
- `packages/daemon/src/application/GitCloneApplicationService.ts`
- `packages/daemon/src/DaemonContainer.ts` (if `FileSystemGateway` isn't already injected)
- `packages/daemon/src/ipc/handlers/gitCloneHandlers.ts`
- `packages/ui/src/renderer/services/ipcClient.ts`
- `packages/ui/src/renderer/store/gitCloneStore.ts`
- `packages/ui/src/renderer/components/dialogs/CloneRepoDialog.tsx`

If any of the above files is materially different from what this doc assumes (rare but possible), surface the discrepancy before editing — do not guess.
