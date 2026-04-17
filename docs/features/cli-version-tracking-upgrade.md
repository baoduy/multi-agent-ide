# CLI Version Tracking & Upgrade

## Context

The app already orchestrates three external CLIs — **Claude Code** (`claude`), **GitHub Copilot CLI** (`copilot`), and **Specify** (`specify` via `spec-kit`) — but gives no visibility into whether they're up to date. Users have to remember each tool's upgrade command and run them manually. This feature adds:

1. A **low-priority startup job** that compares the locally-installed version of each CLI to the latest GitHub release.
2. A **notification entry** in the existing bell-icon popover when updates are available.
3. An **upgrade dialog** (one tool at a time) that runs the upgrade command in the background with streaming output — the same UX pattern as `UpgradeSpecifyDialog`.

All four clarifying questions resolved to the recommended options: startup-only check, reuse bell popover, hardcoded upgrade commands, hide uninstalled tools.

---

## Design decisions

| Decision | Choice | Reason |
|---|---|---|
| Check timing | Once per app boot, ~10s after daemon ready. Results cached 24h in config. | Low network cost; survives quick restarts. |
| Cache storage | `~/.magenta/config.json` under new `cliVersions` key via `ConfigManager`. | JSON config already exists; no migration needed. |
| Notification UI | Reuse `BackgroundJobsPopover` with a new job-row variant. | Zero new UI surface; user already watches the bell. |
| Upgrade commands | Hardcoded in `packages/shared/src/cliTools.ts`. | Matches `DEFAULT_SPECIFY_COMMAND` pattern; avoids user config churn. |
| Missing tools | Hidden from the dialog. | Dialog stays focused on actionable rows. |
| HTTP client | Node 22 built-in `fetch`. | No new dep; daemon already runs on Node 22. |
| Upgrade execution | Reuse the `spawn(command, args, { shell: false })` + `tokenizeSafely` pattern from `OnboardApplicationService`. | Already hardened against shell injection per existing security review. |
| Version parsing | `semver`-style compare via tiny helper (major.minor.patch extraction). | No `semver` dep needed — each tool emits predictable `X.Y.Z`. |

---

## CLI metadata

Defined as a constant table in `packages/shared/src/cliTools.ts`:

| Tool ID | Binary | Version cmd | GitHub repo | Tag prefix | Upgrade cmd |
|---|---|---|---|---|---|
| `claude` | `claude` | `claude --version` | `anthropics/claude-code` | `v` | `npm install -g @anthropic-ai/claude-code@latest` |
| `copilot` | `copilot` | `copilot --version` | `github/copilot-cli` | `v` | `npm install -g @github/copilot@latest` |
| `specify` | `specify` | `specify --version` | `github/spec-kit` | `v` | `uv tool upgrade specify-cli` |

Each upgrade command must pass the existing `SAFE_TOKEN` allowlist (`/^[A-Za-z0-9_@:/.\-+=~,%]+$/`) — all three above do.

> If any of these upgrade commands turn out to be wrong for the user's environment, only this one constant file needs to change. No schema or IPC rework.

---

## Architecture

```
Daemon startup
  └─ DaemonContainer constructs CliVersionApplicationService
  └─ index.ts: after handlers registered, setTimeout(10_000) → jobManager.enqueue("cli:version-check", …)
        └─ For each tool:
              ├─ Detect installed version (spawn binary --version, 5s timeout)
              │     └─ If ENOENT → mark "not installed", skip
              ├─ GET https://api.github.com/repos/<repo>/releases/latest
              │     └─ Parse tag_name, strip leading "v"
              └─ Compare; if latest > installed, mark updateAvailable
        └─ Persist snapshot to config.cliVersions (timestamp, per-tool state)
        └─ If any update available → bridge.emit("cli:updates-available", { tools: [...] })

Renderer
  ├─ cliVersionStore (Zustand) subscribes to "cli:updates-available", loads initial snapshot via ipc "cli:get-version-status"
  ├─ useBackgroundJobs hook is extended to include an "updates" pseudo-job row when updateCount > 0
  ├─ BackgroundJobsPopover renders a new <CliUpdatesRow /> at the top when the store reports pending updates
  │     └─ Click opens CliUpgradeDialog (modal)
  └─ CliUpgradeDialog
        ├─ Lists only installed tools with updateAvailable === true
        ├─ Per row: current → latest, "Upgrade" button
        ├─ Clicking "Upgrade" sends IPC "cli:upgrade" { tool }
        │     └─ Daemon spawns upgrade cmd, streams output via "cli:upgrade:output"
        ├─ Terminal pane shows live stdout/stderr (reuse MagentaTerminal)
        └─ On completion, re-detect version; if current === latest, strike through and remove from list
```

### Layer map

```
packages/shared/
  src/
    cliTools.ts                         NEW  CLI metadata table + CliToolId type
    ipc.ts                              EDIT add cli:* request/response variants
    config.ts                           EDIT add optional cliVersions field to MagentaConfigSchema

packages/daemon/
  src/
    infrastructure/
      GitHubReleasesGateway.ts          NEW  fetch() latest release, parse tag
      CliVersionProbe.ts                NEW  spawn(bin, --version, { shell:false, timeout:5000 }) + parse
    application/
      CliVersionApplicationService.ts   NEW  orchestrates probe + fetch + compare + persist + upgrade-spawn
    ipc/
      handlers/
        cliVersionHandlers.ts           NEW  safeHandle for 3 requests
      registerHandlers.ts               EDIT wire new service + handlers
    DaemonContainer.ts                  EDIT expose cliVersionService
    index.ts                            EDIT schedule startup job via jobManager
    errors/AppError.ts                  EDIT add CLI_UPGRADE_FAILED code (optional — GIT_ERROR-style INTERNAL_ERROR is fine)

packages/ui/
  src/renderer/
    store/cliVersionStore.ts            NEW  Zustand store
    services/ipcClient.ts               EDIT ResponseForRequest entries for new IPC types
    components/
      titlebar/BackgroundJobsPopover.tsx  EDIT  inject <CliUpdatesRow /> when updates pending
      dialogs/CliUpgradeDialog.tsx        NEW   modeled on UpgradeSpecifyDialog
```

No packages/main changes — all child-process work lives in the daemon, matching existing conventions.

---

## IPC contract (new additions to `packages/shared/src/ipc.ts`)

**Requests**
```ts
z.object({ type: z.literal("cli:get-version-status") }),
z.object({ type: z.literal("cli:recheck") }),  // manual re-run for dialog "Check Now"
z.object({ type: z.literal("cli:upgrade"), tool: z.enum(["claude", "copilot", "specify"]) }),
z.object({ type: z.literal("cli:upgrade:cancel"), tool: z.enum(["claude", "copilot", "specify"]) }),
```

**Responses (reply to request)**
```ts
z.object({
  type: z.literal("cli:get-version-status:result"),
  tools: z.array(z.object({
    tool: z.enum(["claude", "copilot", "specify"]),
    installed: z.boolean(),
    currentVersion: z.string().nullable(),
    latestVersion: z.string().nullable(),
    updateAvailable: z.boolean(),
    releaseUrl: z.string().nullable(),
    checkedAt: z.number().nullable(),
    checkError: z.string().nullable(),
  })),
}),
z.object({ type: z.literal("cli:recheck:started") }),
z.object({ type: z.literal("cli:upgrade:started"), tool: z.string() }),
z.object({ type: z.literal("cli:upgrade:cancel:ack"), tool: z.string() }),
```

**Events (push, daemon → renderer)**
```ts
z.object({ type: z.literal("cli:updates-available"), updateCount: z.number() }),
z.object({ type: z.literal("cli:version-status-changed"), tools: /* same shape as above */ }),
z.object({ type: z.literal("cli:upgrade:output"), tool: z.string(), data: z.string() }),
z.object({ type: z.literal("cli:upgrade:complete"), tool: z.string(), success: z.boolean(), error: z.string().optional() }),
```

Must add matching entries to `ResponseForRequest` in [ipcClient.ts](packages/ui/src/renderer/services/ipcClient.ts).

---

## Reused utilities (do not reinvent)

| What | Where | Why |
|---|---|---|
| `BackgroundJobManager.enqueue(name, action)` | [BackgroundJobManager.ts](packages/daemon/src/services/BackgroundJobManager.ts) | Dedup + FIFO + emit `job:started/completed/failed` — exactly the "low-priority background job" the user described. |
| `spawn(cmd, args, { shell: false })` + `SAFE_TOKEN` + `tokenizeSafely` | [OnboardApplicationService.ts:371-390](packages/daemon/src/application/OnboardApplicationService.ts) | Copy the pattern verbatim into `CliVersionApplicationService` for probe + upgrade. |
| `safeHandle(bridge, type, fn)` | [createHandler.ts](packages/daemon/src/ipc/createHandler.ts) | Normalizes errors to `{ type: "error", message }`. |
| `sendOrThrow<T>(request)` | [ipcClient.ts](packages/ui/src/renderer/services/ipcClient.ts) | Typed IPC call from renderer. |
| `createAsyncAction` | [createStoreAction.ts](packages/ui/src/renderer/services/createStoreAction.ts) | Zustand action wrapper with loading/error. |
| `BaseDialog` + `MagentaTerminal` + `PrimaryButton`/`CancelButton` | [BaseDialog.tsx](packages/ui/src/renderer/components/common/BaseDialog.tsx), [UpgradeSpecifyDialog.tsx](packages/ui/src/renderer/components/dialogs/UpgradeSpecifyDialog.tsx) | `CliUpgradeDialog` is ~80% `UpgradeSpecifyDialog`, just parameterized per-tool. |
| `ConfigManager.updateConfig(partial)` | [ConfigManager.ts](packages/daemon/src/config/ConfigManager.ts) | Persist `cliVersions` snapshot. |

---

## Key implementation details

### 1. GitHubReleasesGateway
- Single method: `getLatestRelease(repo: string): Promise<{ tagName: string; htmlUrl: string } | null>`.
- `fetch('https://api.github.com/repos/${repo}/releases/latest', { headers: { 'User-Agent': 'magenta-ide', Accept: 'application/vnd.github+json' } })`.
- 10s timeout via `AbortSignal.timeout(10_000)`.
- Returns `null` on network failure, 404, or non-2xx (do not throw — startup job should never propagate errors that crash the daemon). Log at `console.warn` level.
- No auth header in v1 — 60 req/hr unauthenticated is plenty for 3 repos on startup.

### 2. Version probe
- `spawn(binary, ['--version'], { shell: false, timeout: 5000, env: process.env })`.
- Capture stdout; strip ANSI; extract first `\d+\.\d+\.\d+(?:-[A-Za-z0-9.]+)?` match.
- `ENOENT` → `{ installed: false }`. Any other spawn error → `{ installed: false, probeError: msg }`.

### 3. Version compare
- Tiny inline helper — parse both sides into `[major, minor, patch]` triples (drop pre-release suffix for comparison). `latest > current` → update available.
- If parse fails for either side, treat as "unknown" and mark `updateAvailable: false` (don't nag user with noise).

### 4. Startup scheduling
In [index.ts](packages/daemon/src/index.ts) after `registerAllHandlers()`:
```ts
setTimeout(() => {
  jobManager.enqueue("cli:version-check", () => cliVersionService.runStartupCheck());
}, 10_000);
```
`runStartupCheck()` short-circuits if `config.cliVersions.checkedAt` is within 24h unless `force: true`.

### 5. Upgrade execution
- Single-flight per tool: reject `cli:upgrade` if that tool is already upgrading.
- Stream stdout+stderr via `cli:upgrade:output` events.
- On close code 0, re-run probe for that tool and emit `cli:version-status-changed` so UI updates "current version" in place.

### 6. BackgroundJobsPopover integration
- Extend `useBackgroundJobs` hook to select `updateCount` from `cliVersionStore`.
- Render an always-top row inside the popover when `updateCount > 0`: *"%N CLI update(s) available — Click to review"*, with arrow icon. Click opens `CliUpgradeDialog`, closes popover.
- Include `updateCount` in `totalCount` so the bell badge increments for updates too.

### 7. Upgrade dialog
- `CliUpgradeDialog` takes no props (reads list from store).
- Shows a vertical list; each row: icon, name, `1.2.3 → 1.3.0`, `Upgrade` button.
- Clicking `Upgrade` swaps that row into a running state with a `MagentaTerminal` below it (same `status` prop transitions as `UpgradeSpecifyDialog`).
- `Minimize` + `Close` buttons; minimized state keeps the upgrade running via `BackgroundJobsPopover` (the upgrade itself is a named job).
- If the user cancels via `cli:upgrade:cancel`, the daemon calls `child.kill("SIGTERM")`, then `SIGKILL` after 5s — same pattern used for onboard cancel.

---

## Files to edit vs. create

**Create (7 files)**
- [packages/shared/src/cliTools.ts](packages/shared/src/cliTools.ts)
- [packages/daemon/src/infrastructure/GitHubReleasesGateway.ts](packages/daemon/src/infrastructure/GitHubReleasesGateway.ts)
- [packages/daemon/src/infrastructure/CliVersionProbe.ts](packages/daemon/src/infrastructure/CliVersionProbe.ts)
- [packages/daemon/src/application/CliVersionApplicationService.ts](packages/daemon/src/application/CliVersionApplicationService.ts)
- [packages/daemon/src/ipc/handlers/cliVersionHandlers.ts](packages/daemon/src/ipc/handlers/cliVersionHandlers.ts)
- [packages/ui/src/renderer/store/cliVersionStore.ts](packages/ui/src/renderer/store/cliVersionStore.ts)
- [packages/ui/src/renderer/components/dialogs/CliUpgradeDialog.tsx](packages/ui/src/renderer/components/dialogs/CliUpgradeDialog.tsx)

**Edit (6 files)**
- [packages/shared/src/ipc.ts](packages/shared/src/ipc.ts) — add request/response/event variants
- [packages/shared/src/config.ts](packages/shared/src/config.ts) — add optional `cliVersions` field
- [packages/daemon/src/DaemonContainer.ts](packages/daemon/src/DaemonContainer.ts) — wire `cliVersionService`
- [packages/daemon/src/index.ts](packages/daemon/src/index.ts) — schedule startup check via `jobManager`
- [packages/daemon/src/ipc/registerHandlers.ts](packages/daemon/src/ipc/registerHandlers.ts) — register `cliVersionHandlers`
- [packages/ui/src/renderer/services/ipcClient.ts](packages/ui/src/renderer/services/ipcClient.ts) — add `ResponseForRequest` entries
- [packages/ui/src/renderer/components/titlebar/BackgroundJobsPopover.tsx](packages/ui/src/renderer/components/titlebar/BackgroundJobsPopover.tsx) — inject `<CliUpdatesRow />` and wire dialog open

---

## Verification

1. **Build:** `npm run build` from repo root — all four packages should build with no type errors.
2. **Startup behavior:** Launch the app; watch daemon logs for `[JobManager] Running job "cli:version-check"` ~10s after boot. Verify `~/.magenta/config.json` gains a `cliVersions` block with a recent `checkedAt`.
3. **GitHub fetch:** With network on, verify the three releases endpoints are hit exactly once (temporarily `console.log` the URLs; remove before commit).
4. **Notification:** On a machine where at least one CLI is outdated, confirm the bell badge increments and the popover shows a "N CLI update(s) available" row.
5. **Dialog:** Click the row → `CliUpgradeDialog` opens, shows only installed+outdated tools with correct current/latest versions.
6. **Upgrade flow:**
   - Click `Upgrade` on one tool → terminal pane streams output, `Cancel`/`Run in Background` buttons appear.
   - On success: row updates in place (current == latest), falls off list after a short delay, bell badge decrements.
   - On failure: terminal shows stderr, `Close` button ends the flow; row stays with a retry button.
7. **Missing tool:** Uninstall one CLI temporarily (`which` returns nothing) → next `cli:recheck` marks it `installed: false`; row does not appear in dialog.
8. **Offline:** Disable network before the startup check fires → `checkError` is logged, badge does not appear, no crash.
9. **Cache:** Restart the app within 24h; `[JobManager]` still fires the job, but service short-circuits to cached snapshot (verify via log), no GitHub call.
10. **Security:** Attempt to inject a payload by temporarily editing the hardcoded upgrade command in `cliTools.ts` to include `;` — `tokenizeSafely` throws `VALIDATION_ERROR`, spawn never runs. Revert after test.