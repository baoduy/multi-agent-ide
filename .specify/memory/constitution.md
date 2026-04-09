# Magenta IDE Constitution

## Core Principles

### I. Agent-First Orchestration
Every feature that manages external agents (Claude Code, GitHub Copilot) MUST dispatch work through isolated, independently monitored task runners. Agent lifecycle management is non-delegable: task creation → assignment → log streaming → completion tracking → result isolation. No synchronous blocking calls to external agents. All agent communication is queue-based with guaranteed message delivery.

### II. Strict OOP Architecture (Class-First Design)
All core logic MUST be implemented as cohesive classes with clear responsibilities. Avoid module-level procedural logic; keep orchestration in class methods. Class boundaries define worktree isolation, repo contexts, and agent dispatchers. UI components delegate business logic to service classes. Every service class MUST have a single, testable responsibility.

### III. Spec-Driven Task Pipeline (NON-NEGOTIABLE)
Development flows through: Spec → Approval → Task Generation → Agent Assignment. Each stage gates the next:
- Spec approval is explicit (no auto-approval).
- Tasks are generated deterministically from spec diffs.
- Agent assignment respects per-repo concurrency limits and pause controls.
- No tasks execute without corresponding approved spec.

### IV. Multi-Repo Safety & Isolation
Every repository operation occurs in a dedicated git worktree with isolated home context. Repositories cannot cross-modify each other's state. Pull request creation, branch management, and log streaming are all repo-scoped. Concurrency is configurable per-repo and globally pausable to prevent resource contention or cascading failures.

### V. Real-Time Monitoring & Feedback
Live log streaming from agent runners is mandatory for all long-running tasks. Diff viewers show pre-PR code changes in real-time. Task board Kanban state is continuously synchronized. No silent failures; all errors bubble up to the UI with actionable context. Monitoring infrastructure MUST NOT block task execution.

### VI. Test-First + Integration Coverage
All business logic (task dispatch, agent runners, multi-repo coordination) MUST have passing unit tests before implementation. Integration tests focus on: IPC daemon contracts, worktree lifecycle, concurrent task scheduling, and PR workflow end-to-end. No mocking of git or external CLI unless integration test requires it.

## Architecture Requirements

- **Tech Stack**: Electron 30 · React 19 · Vite · shadcn/ui · Zustand · CodeMirror 6 · Node.js 22 · SQLite + Drizzle ORM · simple-git · Zod
- **IPC Contract**: Main ↔ Daemon strictly versioned and documented; UI → Daemon request/response pairs; Daemon never initiates to Main (only events emit).
- **Data Model**: SQLite schema MUST be normalized to repo, task, agent-run, and log tables with proper foreign keys and indexing for concurrent access.
- **Error Handling**: All errors include stack traces, context (repo, task, agent), and remediation hints. No silent nulls or undefined states.

## Development Workflow

- **PR Requirements**: Every PR references a task/commit message. Reviewers verify: OOP class responsibility, test coverage, multi-repo side effects, and spec alignment.
- **Breaking Changes**: Major version bumps documented in CHANGELOG with migration guide.
- **Code Review**: Architecture review mandatory for agent-dispatch or IPC changes; functionality review for all others.

## Governance

This constitution supersedes all other practices. Amendments require:
1. Issue documenting the change rationale.
2. Updated spec/plan reflecting new principle.
3. Migration checklist for existing code (if breaking).
4. Approval by project maintainers before merge.

**Version**: 1.0.0 | **Ratified**: 2026-04-08 | **Last Amended**: 2026-04-08
