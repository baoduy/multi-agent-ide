# Magenta IDE

**Multi-Repo · Multi-Agent · Full IDE**

A desktop-first developer tool that manages the full software development lifecycle across multiple repositories simultaneously. Magenta IDE orchestrates the Spec → Plan → Task → Implement → Review pipeline, dispatching implementation work to AI agents (Claude Code, GitHub Copilot) in dedicated git worktrees.

## Features

- **Multi-repo management** — Register and work across N repositories in a single window
- **Spec-driven development** — Author specs in a rich markdown editor, approve to generate tasks
- **AI agent dispatch** — Send tasks to Claude Code or GitHub Copilot in isolated git worktrees
- **Live monitoring** — Stream agent logs, view diffs in real-time, track progress on a Kanban board
- **PR workflow** — Create pull requests directly from completed agent work
- **Configurable concurrency** — Per-repo agent limits and global pause controls

## Tech Stack

Electron 30 · React 19 · Vite · shadcn/ui · Tailwind CSS v4 · Zustand · CodeMirror 6 · Node.js 22 · SQLite + Drizzle ORM · simple-git · Zod · Vitest · Playwright · electron-builder

## Documentation

The full implementation plan is broken into six phases with file-by-file task breakdowns:

| Phase | Document | Scope |
|-------|----------|-------|
| 1 | [Foundation](docs/phase-1-foundation.md) | Monorepo scaffold, Electron shell, daemon IPC, SQLite schema |
| 2 | [Repo & Spec](docs/phase-2-repo-and-spec.md) | Repo registration, spec editor, approval workflow, task generation |
| 3 | [Worktree & Agents](docs/phase-3-worktree-and-agents.md) | Git worktrees, Claude/Copilot runners, task queue, log streaming |
| 4 | [Task Board & Monitor](docs/phase-4-task-board-and-monitor.md) | Kanban board, diff viewer, PR creation, pause/resume |
| 5 | [Multi-Repo](docs/phase-5-multi-repo.md) | Parallel repos, cross-repo overview, per-repo settings |
| 6 | [Polish & Package](docs/phase-6-polish-and-package.md) | Settings, onboarding, testing, electron-builder packaging |

See [docs/README.md](docs/README.md) for the full architecture overview, data model, and IPC contract.

## Prerequisites

- Node.js 22+
- pnpm 9+
- Git 2.30+
- Claude Code CLI (`claude`) and/or GitHub CLI (`gh`)

## Getting Started

```bash
git clone https://github.com/your-org/magenta-ide.git
cd magenta-ide
pnpm install
pnpm dev
```

## License

MIT
