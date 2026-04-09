# Magenta IDE — Implementation Plan

> Multi-Repo · Multi-Agent · Full IDE

## Vision

Magenta IDE is a desktop-first developer tool that manages the full software development lifecycle across N repositories simultaneously. It orchestrates the **Spec → Plan → Task → Implement → Review** pipeline, dispatching implementation work to AI agents (Claude Code, GitHub Copilot) in dedicated git worktrees.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Electron Shell                        │
│  ┌──────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │ Sidebar   │  │  Main Panel      │  │ Activity Panel│ │
│  │ (Repos)   │  │  (Spec/Tasks)    │  │ (Agent Logs)  │ │
│  └──────────┘  └──────────────────┘  └───────────────┘ │
│                         │ IPC (Unix Socket / NDJSON)     │
│  ┌──────────────────────┴───────────────────────────┐   │
│  │                   Daemon                          │   │
│  │  ┌─────────┐ ┌──────────┐ ┌────────┐ ┌────────┐ │   │
│  │  │ DB      │ │ Git/     │ │ Agent  │ │ Task   │ │   │
│  │  │ (SQLite)│ │ Worktree │ │ Runner │ │ Queue  │ │   │
│  │  └─────────┘ └──────────┘ └────────┘ └────────┘ │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Monorepo Structure

```
magenta-ide/
├── packages/
│   ├── shared/          ← Zod schemas, TS types, IPC contracts
│   ├── daemon/          ← Node.js background service
│   └── ui/              ← Electron + React desktop app
├── docs/                ← You are here
├── pnpm-workspace.yaml
└── package.json
```

## Technology Stack

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| Desktop shell | Electron | 30.x | Native OS access for git, process spawn, file watch |
| UI framework | React + Vite | 19.x / 6.x | Component model, fast HMR in dev |
| UI components | shadcn/ui + Tailwind CSS | v4 | Accessible, unstyled primitives |
| State management | Zustand | 5.x | Minimal boilerplate, IPC-driven updates |
| Code editor | CodeMirror 6 | 6.x | Markdown + diff views, lightweight |
| Daemon runtime | Node.js + TypeScript | 22.x / 5.x | Native child_process, fs, net |
| Database | SQLite + Drizzle ORM | latest | Embedded, zero-config, offline |
| Git integration | simple-git | 3.x | Typed wrapper, good worktree support |
| Schema validation | Zod | 3.x | Runtime safety for IPC + DB |
| Testing | Vitest + Playwright | latest | Unit for daemon, E2E for UI |
| Packaging | electron-builder | latest | macOS, Windows, Linux |

## Core Data Model (SQLite / Drizzle)

Five core tables. All IDs are `ulid()` for sortability. Database at `~/.magenta/magenta.db`.

| Table | Key Columns | Notes |
|-------|------------|-------|
| `workspaces` | id, name, created_at | Single row in practice; extensible |
| `repos` | id, workspace_id, name, local_path, default_agent, max_concurrency, status, created_at | Registered local git repos |
| `specs` | id, repo_id, title, content (markdown), status, created_at, updated_at | Status: draft \| approved \| archived |
| `tasks` | id, spec_id, repo_id, title, description, branch_name, agent, status, progress_pct, created_at, started_at, completed_at | Status: queued \| running \| paused \| review \| done \| cancelled |
| `agent_logs` | id, task_id, ts, level, message | Level: stdout \| stderr \| system |

## IPC Message Contract

All messages are newline-delimited JSON with a discriminated `type` field. Full schema in `packages/shared/src/ipc.ts`.

| Request | Payload | Response | Response Payload |
|---------|---------|----------|-----------------|
| `repo:register` | `{ path }` | `repo:registered` | `{ repo }` |
| `spec:create` | `{ repoId, title, content }` | `spec:created` | `{ spec }` |
| `spec:approve` | `{ specId }` | `spec:approved` | `{ spec, tasks[] }` |
| `task:dispatch` | `{ taskId, agent }` | `task:started` | `{ task, worktreePath }` |
| `task:pause` | `{ taskId }` | `task:paused` | `{ taskId }` |
| `task:resume` | `{ taskId }` | `task:resumed` | `{ taskId }` |
| `task:cancel` | `{ taskId }` | `task:cancelled` | `{ taskId }` |

**Server push events:** `agent:log`, `task:progress`, `task:completed`, `file:changed`

## Kick-Start Feature

Before diving into the full phase plan, we're building the **Repo Scanner & Spec Flow Diagram** as the first working prototype:

| Document | Scope |
|----------|-------|
| [Kick-Start: Repo Scanner & Spec Flow](./kickstart-repo-scanner-and-spec-flow.md) | Directory scanning, sidebar repo list, spec folder convention, React Flow pipeline diagram |

This combines elements from Phase 1 (foundation) and Phase 2 (repo/spec) into a focused 2-week sprint with 8 tasks.

## Implementation Phases

| Phase | Document | Scope | Milestone |
|-------|----------|-------|-----------|
| Phase 1 | [Foundation](./phase-1-foundation.md) | Monorepo, Electron shell, daemon IPC, SQLite schema | M1 |
| Phase 2 | [Repo & Spec](./phase-2-repo-and-spec.md) | Repo registration, spec editor, approval, task generation | M2 |
| Phase 3 | [Worktree & Agents](./phase-3-worktree-and-agents.md) | Git worktrees, agent runners, task queue, log streaming | M3 |
| Phase 4 | [Task Board & Monitor](./phase-4-task-board-and-monitor.md) | Kanban board, diff viewer, PR creation, pause/resume | M4 |
| Phase 5 | [Multi-Repo](./phase-5-multi-repo.md) | Parallel repos, cross-repo overview, per-repo settings | M5 |
| Phase 6 | [Polish & Package](./phase-6-polish-and-package.md) | Settings, onboarding, testing, electron-builder | M6 |

## Milestones

| Milestone | Est. Duration | Definition of Done |
|-----------|--------------|-------------------|
| M1 | 1–2 weeks | Electron launches, daemon IPC ping/ack, three-panel layout, DB created |
| M2 | 2–3 weeks | Register repo, create + approve spec, see generated tasks |
| M3 | 2–3 weeks | Dispatch task to Claude Code, worktree created, logs stream, cleanup |
| M4 | 2–3 weeks | Kanban board, diff viewer, PR shortcut, pause/resume/cancel |
| M5 | 1–2 weeks | 3+ repos in parallel, cross-repo view, global pause |
| M6 | 2–3 weeks | Installable .dmg/.exe, onboarding, passing test suites |

**Total estimated timeline: 10–16 weeks** (single developer, full-time)

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Claude Code CLI API changes | High | Wrap in adapter interface — swap CLI args without touching queue logic |
| Copilot agent CLI limited | Medium | Start with Claude Code only; Copilot is additive |
| Worktree branch conflicts | Medium | Auto-suffix branch with task ulid; guard in worktree service |
| Electron app size | Low | ASAR compression; lazy-load heavy modules |
| SQLite concurrency | Low | WAL mode; single writer (daemon) |
