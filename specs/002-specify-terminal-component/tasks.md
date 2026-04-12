---
description: "Task list for MagentaTerminal Reuse and Sidebar Terminal"
---

# Tasks: MagentaTerminal Reuse and Sidebar Terminal

**Input**: Design documents from `specs/002-specify-terminal-component/`
**Branch**: `002-run-feature-hook`
**Prerequisites**: plan.md ✅ spec.md ✅ research.md ✅ data-model.md ✅ contracts/terminal-ipc.md ✅
**Analysis**: Issues C1 C2 I1 I2 I3 A1 A2 resolved in this revision (see analysis report)

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no blocking dependencies)
- **[Story]**: User story label — [US1], [US2], [US3]
- All file paths are relative to the workspace root

---

## Phase 1: Setup (Build & Package Configuration)

**Purpose**: Install native dependencies and configure the build toolchain so node-pty can be compiled for Electron's ABI. These tasks are independent and can run in parallel.

- [X] T001 Add `"node-pty": "*"` and `"strip-ansi": "^6.0.1"` to dependencies in `packages/daemon/package.json`
- [X] T002 [P] Add `asarUnpack: ["**/node_modules/node-pty/**"]` to `electron-builder.yml`
- [X] T003 [P] Add `"@electron/rebuild": "*"` to devDependencies and `"postinstall": "electron-rebuild -f -w node-pty"` to scripts in root `package.json` (no existing `postinstall` present; if one is found, chain with `&&` rather than replace)

**Checkpoint**: Build config ready — node-pty will be rebuilt to Electron's ABI on next `pnpm install` and unpacked at app runtime.

---

## Phase 2: Foundational (IPC Schema — Blocking Prerequisite)

**Purpose**: Extend shared IPC type contracts before any daemon or UI code can be written. Both daemon handlers and UI store depend on these types being defined first.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 Extend `IpcRequestSchema` in `packages/shared/src/ipc.ts` with four new discriminated union variants: `terminal:spawn` `{ cwd, cols, rows }`, `terminal:input` `{ sessionId, data }`, `terminal:resize` `{ sessionId, cols, rows }`, `terminal:close` `{ sessionId }` per `contracts/terminal-ipc.md`
- [X] T005 Extend `IpcResponseSchema` in `packages/shared/src/ipc.ts` with six new variants: `terminal:spawned`, `terminal:input:ack`, `terminal:resize:ack`, `terminal:close:ack` (direct replies), and `terminal:data`, `terminal:exited` (streamed events) per `contracts/terminal-ipc.md`
- [X] T006 Update `ResponseForRequest` type map in `packages/ui/src/renderer/services/ipcClient.ts` adding `"terminal:spawn" → terminal:spawned`, `"terminal:input" → terminal:input:ack`, `"terminal:resize" → terminal:resize:ack`, `"terminal:close" → terminal:close:ack` (depends on T005 response types existing first)

**Checkpoint**: IPC schema complete — daemon handlers and UI store can now be written against well-typed contracts.

---

## Phase 3: User Story 1 — Monitor Specify Scripts in Readonly Dialog Mode (Priority: P1) 🎯 MVP

**Goal**: Replace the inline `<pre>` terminal blocks in Specify onboarding and upgrade dialogs with a shared, reusable `MagentaTerminal` component in readonly mode.

**Independent Test**: Trigger an onboarding or upgrade run. Confirm output streams into the `MagentaTerminal` view, lines append in order, no user input is accepted, completion status (success/failure) renders correctly in the terminal footer.

### Implementation for User Story 1

- [X] T007 [US1] Create `packages/ui/src/renderer/components/common/MagentaTerminal.tsx` implementing the readonly branch with props: `readonly: boolean`, `output?: string`, `status?: "idle" | "running" | "done" | "canceled" | "error"`, `successMessage?: string`, `errorMessage?: string`, `cwd?: string`, `label?: string`, `maxHeight?: number`; render header bar with `Terminal` lucide icon + `label` prop + pulsing status dot when `status === "running"`; dark-styled `<pre>` output area (`#1e1e1e` background, `#d4d4d4` text, SF Mono monospace, `pre-wrap`, `overflowY: auto`, `maxHeight` defaulting to 300px); auto-scroll via `useRef` on `output` change; inline success span (`#4ade80`) on `status === "done"` without error; inline error span (`#f87171`) on `status === "done"` with error; inline canceled span (`#facc15`) on `status === "canceled"`; no input area, no `terminalStore` interaction
- [X] T008 [US1] Refactor `packages/ui/src/renderer/components/dialogs/UpgradeSpecifyDialog.tsx`: remove `terminalRef`, the auto-scroll `useEffect`, the inline terminal header div, and the inline `<pre>` block; remove `Terminal` from the lucide-react import; replace with `<MagentaTerminal readonly={true} output={output} status={phase === "running" ? "running" : phase === "done" ? (success ? "done" : error === "canceled" ? "canceled" : "error") : "idle"} successMessage="Upgrade complete!" errorMessage={error ?? undefined} label={phase === "running" ? "Upgrading..." : phase === "done" ? (success ? "Completed" : "Failed") : ""} />`; verify the existing Cancel and "Run in Background" buttons continue to work via the unchanged `handleCancel` and `handleMinimize` handlers (FR-007: cancellation must be preserved)
- [X] T009 [P] [US1] Refactor `packages/ui/src/renderer/components/dialogs/OnboardDialog.tsx` using the same replacement pattern as T008: remove inline terminal block and `Terminal` import, replace with `<MagentaTerminal readonly={true} output={output} status={phase === "running" ? "running" : phase === "done" ? (success ? "done" : error === "canceled" ? "canceled" : "error") : "idle"} successMessage="Setup complete!" errorMessage={error ?? undefined} label={...} />`; verify the existing Cancel and "Run in Background" buttons continue to work via the unchanged `handleCancel` and `handleMinimize` handlers (FR-007)

- [X] T010 [US1] Smoke-test cancel flow in both dialogs after the T008 and T009 refactors: trigger an onboard or upgrade run, click Cancel while running, confirm the process is killed via the existing `repo:onboard:cancel` IPC path, confirm the `MagentaTerminal` transitions to `status="canceled"` and renders the canceled visual state — no changes to IPC or cancel logic required, this is verification only (FR-007)

**Checkpoint**: User Story 1 is fully functional and independently testable. Both Specify dialogs stream output via `MagentaTerminal`, cancel flow is verified intact, no regressions.

**Parallel execution example**: After T007 completes, T008 and T009 can be worked on simultaneously (different files). T010 must wait for both T008 and T009.

---

## Phase 4: User Story 2 — Full Interactive Terminal in Right Sidebar (Priority: P2)

**Goal**: Spawn a live PTY session via node-pty in the daemon and surface a full interactive terminal in the `ActivityPanel` below the Legend section.

**Independent Test**: Open the right sidebar, scroll below the Legend section. Enter a shell command (`echo hello`, `pwd`, `ls`). Confirm the command appears, output is shown, the session continues after a failed command (`not-a-command`), and the terminal session closes cleanly when the sidebar is unmounted.

### Implementation for User Story 2 — Daemon Layer

- [X] T011 [P] [US2] Create `packages/daemon/src/application/TerminalApplicationService.ts` as a class with constructor `(bridge: IPCBridge)`, private `sessions: Map<string, IPty>`, method `spawn(sessionId, cwd, cols, rows)` that calls `pty.spawn(shell, [], { cwd, cols, rows, name: "xterm-color" })` (shell: `process.platform === "win32" ? "cmd.exe" : (process.env.SHELL ?? "/bin/bash")`), wires `pty.onData()` → strip ANSI via `strip-ansi` → emit `terminal:data` event, `pty.onExit()` → emit `terminal:exited` + remove from map; methods `write(sessionId, data)`, `resize(sessionId, cols, rows)`, `close(sessionId)` (with silent no-ops for unknown sessionId), and `closeAll()` iterating all active sessions — `closeAll()` is wired as a daemon shutdown hook in DaemonContainer (see T013)
- [X] T012 [US2] Create `packages/daemon/src/ipc/handlers/terminalHandlers.ts` with `registerTerminalHandlers({ bridge, terminalService })` registering four `safeHandle` calls: `terminal:spawn` generates ULID sessionId → calls `terminalService.spawn()` → returns `terminal:spawned`; `terminal:input` → `terminalService.write()` → returns `terminal:input:ack`; `terminal:resize` → `terminalService.resize()` → returns `terminal:resize:ack`; `terminal:close` → `terminalService.close()` → returns `terminal:close:ack`
- [X] T013 [US2] Update `packages/daemon/src/DaemonContainer.ts`: add `readonly terminalService: TerminalApplicationService`, instantiate it in `static async create()` passing `this.bridge`, call `this.terminalService.closeAll()` in the shutdown/cleanup path (this is the hook point referenced in T011)
- [X] T014 [US2] Update `packages/daemon/src/ipc/registerHandlers.ts`: import `registerTerminalHandlers` and `TerminalApplicationService`; call `registerTerminalHandlers({ bridge, terminalService: container.terminalService })` within `registerHandlers()`

### Implementation for User Story 2 — UI Layer

- [X] T015 [P] [US2] Create `packages/ui/src/renderer/store/terminalStore.ts` as a Zustand store with state `sessions: Record<string, TerminalSession>` and `subscriptionsReady: boolean`; actions: `spawn(cwd, cols, rows)` → `sendOrThrow terminal:spawn` → insert session at `"connecting"` → update to `"active"` → return `sessionId`; `write(sessionId, data)` → `sendCommand terminal:input`; `resize(sessionId, cols, rows)` → `sendCommand terminal:resize`; `close(sessionId)` → `sendOrThrow terminal:close` → set status `"closed"`; `appendOutput(sessionId, data)` → append to `sessions[sessionId].output`; `setExited(sessionId)` → set status `"closed"`; `initializeSubscriptions()` → subscribe `terminal:data` → `appendOutput`, `terminal:exited` → `setExited`
- [X] T016 [US2] Add the interactive branch to the existing file `packages/ui/src/renderer/components/common/MagentaTerminal.tsx` created by T007 (`readonly === false` path): on mount call `terminalStore.initializeSubscriptions()` then `terminalStore.spawn(cwd ?? "~", 80, 24)` storing `sessionId` in `useRef`; on unmount call `terminalStore.close(sessionId)` if session active; read `session` from `useTerminalStore(s => s.sessions[sessionIdRef.current])`; render same dark `<pre>` output area with auto-scroll; show "Connecting…" placeholder while `session.status === "connecting"`; render input row at bottom — `<input type="text">` monospace, on Enter calls `terminalStore.write(sessionId, value + "\n")` then clears input
- [X] T017 [US2] Update `packages/ui/src/renderer/components/activity/ActivityPanel.tsx`: add import for `MagentaTerminal`; append a new `<Section title="Terminal" style={{ flexShrink: 0, borderBottom: "none" }}>` as the last child of the root `<div>`, containing `<MagentaTerminal readonly={false} cwd={activeRepoPath ?? undefined} maxHeight={200} />`

**Checkpoint**: User Story 2 is fully functional and independently testable. Right sidebar shows a live PTY terminal below Legend. User can run shell commands. Session lifecycle managed correctly.

**Parallel execution example**: T011 (daemon service) and T015 (UI store) can be worked on simultaneously as they are in completely separate packages with no shared files. T012 can begin immediately after T011 finishes while T016 waits for T015.

---

## Phase 5: User Story 3 — Reuse One MagentaTerminal Across App Areas (Priority: P3)

**Goal**: Confirm that all three usage sites (OnboardDialog, UpgradeSpecifyDialog, ActivityPanel) share the same `MagentaTerminal` import and behavioral contract, validating the consistency requirement.

**Independent Test**: Visual inspection and TypeScript compilation confirm all three consumers import from `../common/MagentaTerminal` (or equivalent path), pass props correctly, and the component renders consistently in all three contexts.

- [X] T018 [US3] Audit `packages/ui/src/renderer/components/dialogs/OnboardDialog.tsx`, `packages/ui/src/renderer/components/dialogs/UpgradeSpecifyDialog.tsx`, and `packages/ui/src/renderer/components/activity/ActivityPanel.tsx` to confirm all three import `MagentaTerminal` from the same source path, all readonly usages pass `output`, `status` (including `"canceled"` where applicable), `successMessage`/`errorMessage`, and the interactive usage passes `readonly={false}` with `cwd` and `maxHeight`; fix any import path inconsistency found

**Checkpoint**: All three consumption sites use `MagentaTerminal` consistently. User Story 3 acceptance scenarios are satisfied by the combined output of Phases 3 and 4 plus this audit task. `"canceled"` state is handled uniformly across all readonly consumers.

---

## Final Phase: Polish & Cross-Cutting Concerns

**Purpose**: Build validation and runtime correctness across all stories.

- [X] T019 [P] Run `pnpm typecheck` across all packages; fix any TypeScript errors introduced by the new IPC types, store, component props (including `"canceled"` in status union), or refactored dialogs in `packages/shared`, `packages/daemon`, `packages/ui`
- [X] T020 [P] Run `pnpm build` and verify the Electron app packages without errors; confirm node-pty native binary is present in `app.asar.unpacked/node_modules/node-pty/`; manually verify output latency is sub-1s during an onboarding or upgrade run to satisfy SC-001

---

## Dependencies Summary

```
T001, T002 [P], T003 [P]  ← Phase 1 (all parallel)
  └─► T004  ← ipc.ts requests
        └─► T005  ← ipc.ts responses
              └─► T006  ← ipcClient.ts (depends on T005 response types)

T004 + T005 + T006 complete ──► Phase 3 begins
  └─► T007 (MagentaTerminal readonly + canceled state)
        ├─► T008 (UpgradeSpecifyDialog)
        └─► T009 [P] (OnboardDialog) ← parallel with T008
              T008 + T009 ──► T010 (cancel smoke-test)

T001 complete ──► T011 [P] (TerminalApplicationService)  ← parallel with T015
T006 complete ──► T015 [P] (terminalStore)               ← parallel with T011
  T011 ──► T012 (terminalHandlers)
  T011 ──► T013 (DaemonContainer — wires closeAll)
  T012 + T013 ──► T014 (registerHandlers)
  T015 + T007 ──► T016 (extend MagentaTerminal interactive)
  T016 ──► T017 (ActivityPanel)

T010 + T017 ──► T018 (US3 audit)
T018 ──► T019 [P], T020 [P] ← final checks (parallel)
```

---

## Task Count Summary

| Phase | Story | Tasks | Notes |
|-------|-------|-------|-------|
| Phase 1: Setup | — | 3 (T001–T003) | All parallelizable; T003 postinstall clarified |
| Phase 2: Foundational | — | 3 (T004–T006) | T006 dependency on T005 corrected; no longer [P] |
| Phase 3: Implementation | US1 (P1) | 4 (T007–T010) | T007 has canceled state; T010 is new FR-007 task |
| Phase 4: Implementation | US2 (P2) | 7 (T011–T017) | T011+T015 parallel; T016 is extension not creation |
| Phase 5: Implementation | US3 (P3) | 1 (T018) | Includes canceled state audit |
| Final: Polish | — | 2 (T019–T020) | T020 includes SC-001 latency check |
| **Total** | | **20 tasks** | |

---

## Suggested MVP Scope

Implement **Phase 1 + Phase 2 + Phase 3 only** (T001–T010):
- node-pty build config in place for future use
- IPC schema ready
- `MagentaTerminal` component built (readonly branch), `"canceled"` state included
- Both Specify dialogs migrated with cancel verification — zero regressions on the existing critical path

Phase 4 (interactive sidebar terminal) can then be layered on top with a clean foundation already in place.
