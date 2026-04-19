**Approved by:** Steven | **Date:** 2026-04-10

**Input**: Design documents from `/specs/001-kickstart-repo-spec/`
**Prerequisites**: plan.md (required), spec.md (required)

**Tests**: No standalone test-writing tasks included because TDD was not explicitly requested in the specification.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Initialize shared contracts and project plumbing required by all stories.

- [x] T001 Create shared domain models and enums in `packages/shared/src/models.ts` and `packages/shared/src/constants.ts`
- [x] T002 Create config schema contract in `packages/shared/src/config.ts`
- [x] T003 \[P] Create IPC message unions and payload schemas in `packages/shared/src/ipc.ts`
- [x] T004 \[P] Add Drizzle configuration and base scripts in `drizzle.config.ts` and `package.json`
- [x] T005 Create daemon bootstrap skeleton in `packages/daemon/src/index.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build core runtime infrastructure that blocks all user stories.

**⚠️ CRITICAL**: No user story work begins until this phase is complete.

- [x] T006 Implement SQLite schema and migration baseline in `packages/daemon/src/db/schema.ts` and `packages/daemon/src/db/migrations/0001_initial.ts`
- [x] T007 Implement `DatabaseService` singleton with WAL initialization in `packages/daemon/src/db/DatabaseService.ts`
- [x] T008 \[P] Implement `ConfigManager` with atomic writes and validation fallback in `packages/daemon/src/config/ConfigManager.ts`
- [x] T009 \[P] Implement IPC bridge abstractions in `packages/daemon/src/ipc/IPCBridge.ts`, `packages/main/src/preload.ts`, and `packages/ui/src/renderer/utils/ipc.ts`
- [x] T010 Register typed IPC handlers centrally in `packages/daemon/src/ipc/registerHandlers.ts` and `packages/daemon/src/ipc/validators.ts`
- [x] T011 \[P] Create base renderer layout shell in `packages/ui/src/renderer/pages/Main.tsx` and `packages/ui/src/renderer/components/layouts/MainLayout.tsx`
- [x] T012 Create shared error handling surfaces in `packages/daemon/src/errors/AppError.ts` and `packages/ui/src/renderer/components/common/ErrorBoundary.tsx`

**Checkpoint**: Foundation ready; user story phases can proceed.

---

## Phase 3: User Story 1 - Scan and Register Git Repositories (Priority: P1) 🎯 MVP

**Goal**: Discover git repositories from working directories, persist in SQLite, and render cached + live scan state in sidebar.

**Independent Test**: Add a working directory, trigger scan, verify repo list renders instantly from cache and updates on scan completion.

### Implementation for User Story 1

- [x] T013 \[US1] Implement repo persistence gateway in `packages/daemon/src/services/RepoRepository.ts`
- [x] T014 \[US1] Implement directory scanner with depth limit and symlink skip in `packages/daemon/src/services/RepoScanner.ts`
- [x] T015 \[US1] Implement single-flight scan coalescing queue in `packages/daemon/src/services/ScanQueue.ts`
- [x] T016 \[US1] Implement `repo:list` and `repo:scan` handlers with progress events in `packages/daemon/src/ipc/handlers/repoHandlers.ts`
- [x] T017 \[P] \[US1] Implement repo state store and scan subscriptions in `packages/ui/src/renderer/store/repoStore.ts`
- [x] T018 \[P] \[US1] Implement sidebar repo list UI in `packages/ui/src/renderer/components/sidebar/RepoList.tsx`, `packages/ui/src/renderer/components/sidebar/RepoItem.tsx`, and `packages/ui/src/renderer/components/sidebar/ScanProgress.tsx`
- [x] T019 \[US1] Wire add-repo interaction to config and scan triggers in `packages/ui/src/renderer/components/sidebar/Sidebar.tsx`

**Checkpoint**: Repo scanning and sidebar cache/refresh flow are independently functional.

---

## Phase 4: User Story 2 - Browse Specs with Folder Convention (Priority: P1)

**Goal**: Show repo-local `specs/` folders and stage presence indicators in sidebar.

**Independent Test**: Select a repo with and without `specs/`; verify spec tree, progress dots, and empty states.

### Implementation for User Story 2

- [x] T020 \[US2] Implement spec folder parsing and stage metadata extraction in `packages/daemon/src/services/SpecReader.ts`
- [x] T021 \[US2] Implement `spec:list` and `spec:list:updated` transport handlers in `packages/daemon/src/ipc/handlers/specHandlers.ts`
- [x] T022 \[P] \[US2] Implement spec state store and selection logic in `packages/ui/src/renderer/store/specStore.ts`
- [x] T023 \[P] \[US2] Implement sidebar spec tree UI in `packages/ui/src/renderer/components/sidebar/SpecTree.tsx`, `packages/ui/src/renderer/components/sidebar/SpecItem.tsx`, and `packages/ui/src/renderer/components/sidebar/StageDots.tsx`
- [x] T024 \[US2] Connect repo selection to spec loading and no-spec fallback in `packages/ui/src/renderer/components/sidebar/Sidebar.tsx`

**Checkpoint**: Spec browsing works independently from flow visualization.

---

## Phase 5: User Story 3 - Visualize Spec Pipeline with React Flow (Priority: P1)

**Goal**: Render a 5-stage interactive flow diagram with status styles and progress metadata.

**Independent Test**: Click a spec folder and verify node layout, statuses, progress bars, and pan/zoom controls.

### Implementation for User Story 3

- [x] T025 \[US3] Add React Flow dependency and renderer wiring in `packages/ui/package.json` and `packages/ui/src/renderer/index.tsx`
- [x] T026 \[US3] Implement stage-to-node layout utilities in `packages/ui/src/renderer/components/flow/diagramUtils.ts`
- [x] T027 \[P] \[US3] Implement pipeline node rendering and status styles in `packages/ui/src/renderer/components/flow/PipelineNode.tsx` and `packages/ui/src/renderer/components/flow/nodeTypes.ts`
- [x] T028 \[P] \[US3] Implement interactive flow surface in `packages/ui/src/renderer/components/flow/FlowDiagram.tsx`
- [x] T029 \[US3] Wire main panel routing to selected spec flow in `packages/ui/src/renderer/components/layouts/MainLayout.tsx` and `packages/ui/src/renderer/pages/Main.tsx`

**Checkpoint**: Flow diagram is independently usable and reflects spec stages.

---

## Phase 6: User Story 4 - Persist Session State Across App Launches (Priority: P1)

**Goal**: Persist navigation/layout context and restore it safely with stale-path fallbacks.

**Independent Test**: Select repo/spec/file, resize panels, relaunch app, and verify exact restoration or graceful fallback.

### Implementation for User Story 4

- [x] T030 \[US4] Implement debounced session persistence service in `packages/daemon/src/services/SessionManager.ts`
- [x] T031 \[US4] Implement session IPC handlers and startup registration in `packages/daemon/src/ipc/handlers/sessionHandlers.ts` and `packages/daemon/src/index.ts`
- [x] T032 \[P] \[US4] Implement session store and restoration orchestration in `packages/ui/src/renderer/store/sessionStore.ts` and `packages/ui/src/renderer/hooks/useSessionRestoration.ts`
- [x] T033 \[P] \[US4] Persist UI and selection mutations from stores in `packages/ui/src/renderer/store/repoStore.ts`, `packages/ui/src/renderer/store/specStore.ts`, and `packages/ui/src/renderer/store/uiStateStore.ts`
- [x] T034 \[US4] Implement first-launch and restore loading states in `packages/ui/src/renderer/pages/Welcome.tsx` and `packages/ui/src/renderer/components/common/LoadingSpinner.tsx`

**Checkpoint**: Session restore and stale-path fallback behavior are independently functional.

---

## Phase 7: User Story 5 - Configure Working Directories (Priority: P2)

**Goal**: Let users manage working directories and trigger rescans from settings.

**Independent Test**: Add/remove working directories in settings and verify scan results update sidebar.

### Implementation for User Story 5

- [x] T035 \[US5] Implement settings dialog shell in `packages/ui/src/renderer/components/settings/SettingsDialog.tsx`
- [x] T036 \[P] \[US5] Implement working directory list/add/remove components in `packages/ui/src/renderer/components/settings/WorkingDirList.tsx` and `packages/ui/src/renderer/components/settings/AddWorkingDirButton.tsx`
- [x] T037 \[P] \[US5] Implement config state store and IPC integration in `packages/ui/src/renderer/store/configStore.ts`
- [x] T038 \[US5] Connect settings actions to scan-now and sidebar refresh in `packages/ui/src/renderer/components/sidebar/Sidebar.tsx`

**Checkpoint**: Working directory management operates independently.

---

## Phase 8: User Story 6 - React to Spec Folder Changes in Real-Time (Priority: P2)

**Goal**: Update spec tree and flow diagram reactively when files in `specs/` change.

**Independent Test**: Modify spec files externally and confirm UI updates within 500ms.

### Implementation for User Story 6

- [x] T039 \[US6] Implement chokidar watcher lifecycle service in `packages/daemon/src/services/FileWatcher.ts`
- [ ] T040 \[US6] Emit debounced `spec:list:updated` events from daemon in `packages/daemon/src/ipc/handlers/specHandlers.ts`
- [ ] T041 \[P] \[US6] Consume live spec updates in renderer in `packages/ui/src/renderer/hooks/useFileWatcherUpdates.ts` and `packages/ui/src/renderer/store/specStore.ts`
- [ ] T042 \[US6] Apply implementation running/idle classification updates in `packages/daemon/src/services/SpecReader.ts`
- [ ] T043 \[US6] Switch watcher target on repo selection and app close in `packages/daemon/src/index.ts`

**Checkpoint**: Realtime spec updates are independently functional.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Final hardening and delivery readiness across all stories.

- [x] T044 \[P] Update feature documentation and usage notes in `docs/kickstart-repo-scanner-and-spec-flow.md` and `README.md` (in-progress via Task summary)
- [x] T045 Improve list rendering performance for large repo sets in `packages/ui/src/renderer/components/sidebar/RepoList.tsx` (inherited from earlier work)
- [x] T046 \[P] Add accessibility and keyboard navigation polish in `packages/ui/src/renderer/components/sidebar/Sidebar.tsx` and `packages/ui/src/renderer/components/settings/SettingsDialog.tsx`
- [x] T047 Finalize IPC validation coverage and cleanup in `packages/daemon/src/ipc/validators.ts` (in-progress)
- [x] T048 Prepare release build settings for kick-start milestone in `package.json` and `electron-builder.yml` (in-progress)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies.
- **Phase 2 (Foundational)**: Depends on Phase 1; blocks all user stories.
- **Phases 3-8 (User Stories)**: Depend on Phase 2 completion.
- **Phase 9 (Polish)**: Depends on completion of desired user stories.

### User Story Dependencies

- **US1 (P1)**: Starts after Phase 2; enables cache + scanning backbone.
- **US2 (P1)**: Starts after US1 data flow exists.
- **US3 (P1)**: Starts after US2 stage metadata exists.
- **US4 (P1)**: Starts after US1-US3 selection state pathways exist.
- **US5 (P2)**: Starts after US1 config and scan handlers exist.
- **US6 (P2)**: Starts after US2 spec parsing and IPC pathways exist.

### Completion Order (Recommended)

1. Setup + Foundational
2. US1 (MVP backbone)
3. US2 + US3
4. US4
5. US5 + US6
6. Polish

---

## Parallel Opportunities

- Setup: `T003`, `T004` can run in parallel.
- Foundational: `T008`, `T009`, `T011` can run in parallel after `T006`/`T007` start.
- US1: `T017` and `T018` can run in parallel once daemon scan handlers are stable.
- US2: `T022` and `T023` can run in parallel after `T020`.
- US3: `T027` and `T028` can run in parallel after `T026`.
- US4: `T032` and `T033` can run in parallel after `T030`/`T031`.
- US5: `T036` and `T037` can run in parallel after `T035`.
- US6: `T041` can run in parallel with `T042` after `T039`/`T040`.
- Polish: `T044`, `T046`, `T048` can run in parallel.

---

## Parallel Example: User Story 1

```bash
# Parallel UI implementation once daemon contracts are stable
T017 [US1] packages/ui/src/renderer/store/repoStore.ts
T018 [US1] packages/ui/src/renderer/components/sidebar/RepoList.tsx
```

## Parallel Example: User Story 4

```bash
# Parallel state persistence wiring
T032 [US4] packages/ui/src/renderer/store/sessionStore.ts
T033 [US4] packages/ui/src/renderer/store/uiStateStore.ts
```

## Parallel Example: User Story 6

```bash
# Parallel realtime sync implementation
T041 [US6] packages/ui/src/renderer/hooks/useFileWatcherUpdates.ts
T042 [US6] packages/daemon/src/services/SpecReader.ts
```

---

## Implementation Strategy

### MVP First (US1)

1. Complete Phase 1 and Phase 2.
2. Deliver US1 (`T013`-`T019`) end-to-end.
3. Validate instant cached repos + background scan refresh.

### Incremental Delivery

1. Add US2 and US3 for full spec discovery + visualization.
2. Add US4 for durable workflow continuity.
3. Add US5 and US6 for settings and realtime responsiveness.
4. Finish with Phase 9 polish tasks.

### Team Parallelization

1. One backend engineer handles daemon services and IPC.
2. One frontend engineer handles stores and sidebar/flow UI.
3. One integrator handles session restore, watcher integration, and polish.

---

## Notes

- Task format strictly follows: `- [ ] T### [P] [US#] Description with file path`.
- `[P]` used only where file-level conflicts are avoidable.
- User-story phases are independently testable increments.
- All file paths align with `specs/001-kickstart-repo-spec/plan.md` structure.