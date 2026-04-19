# Magenta IDE

**Multi-Repo · Multi-Agent · Spec-Driven Desktop IDE**

Magenta IDE is an Electron desktop app that manages spec-driven software delivery across many repositories in one workspace.

![Magenta IDE](App.png)

## What ships today

Magenta IDE currently ships these major feature areas:

1. **Repository Management**
   - Scan configured working directories (depth-limited) for git repos
   - Track repo status and branch metadata
   - Pin/search repos in the Explorer sidebar

2. **Spec Pipeline (Constitution → Spec → Plan → Tasks → Implementation)**
   - Detect and sync spec folders from current and non-current branches
   - Visual stage dots + workflow diagram
   - Stage approval markers written directly into markdown files

3. **Onboarding (Spec Kit integration)**
   - Run `specify` onboarding/upgrade/switch from UI
   - Stream command output live
   - Optional worktree-based onboarding isolation

4. **AI Sessions (live PTY)**
   - Launch Claude Code or Copilot CLI sessions in-terminal
   - Provider-specific permission modes
   - Resume using provider session IDs

5. **Synced Sessions (disk history indexing)**
   - Index CLI history from `~/.claude` and `~/.copilot`
   - Merge history with live sessions in one tree
   - Resume archived/synced sessions into live runs

6. **Terminal**
   - General-purpose PTY terminals in the dock
   - Same attach/stream/heartbeat pipeline as AI sessions

7. **Worktrees**
   - Create/list/merge/delete worktrees under `.worktrees/`
   - Validate worktree usage before AI session launch
   - Track ahead/behind + file status per worktree

8. **Git Management**
   - Clone (streaming progress), status, commit, push/pull/fetch
   - Branch operations, history, diff, blame
   - Stash, remotes, reset/revert

9. **Markdown Manager**
   - Markdown-only repo/branch browser
   - Edit current-branch files, read non-current branch files via `gitref://`
   - Preview, Mermaid rendering, table of contents

10. **Dock Layout System**
    - Activity groups: Explorer, Markdown Manager, Git
    - Drag/drop views between regions
    - Persisted, migration-safe layout state

11. **Theme System**
    - `light` / `dark` / `system`
    - Live OS preference tracking
    - CSS-token-driven semantic theming

12. **Configuration + CLI Version Tracking**
    - Config stored in `~/.magenta/config.json`
    - Working dirs, sync intervals, Specify command template
    - Background CLI version checks + upgrade flows for Claude/Copilot/Specify

For technical deep dives, see [`docs/features/README.md`](docs/features/README.md).

## Architecture at a glance

Monorepo packages:

- `packages/shared` — Zod schemas, IPC contracts, shared models/constants
- `packages/daemon` — background service (application/domain/infrastructure/data)
- `packages/main` — Electron main process + preload bridge
- `packages/ui` — React renderer + Zustand stores + dock UI

Reference: [`docs/architecture/architecture-overview.md`](docs/architecture/architecture-overview.md)

## Prerequisites

| Tool | Required | Notes |
|---|---|---|
| Git | Yes | Core repo/worktree/git operations |
| Claude Code CLI (`claude`) | Optional | Required to run Claude sessions |
| GitHub Copilot CLI (`copilot`) | Optional | Required to run Copilot sessions |
| Specify CLI (`specify`) / `uvx` setup | Optional | Required for Spec Kit onboarding commands |

> You can use the app with only some providers installed; unavailable tools are simply not runnable.

## Installation

### Download prebuilt binaries

Use the latest release from:

- <https://github.com/baoduy/multi-agent-ide/releases>

### macOS unsigned app note

```bash
xattr -cr /Applications/Magenta\ IDE.app
```

## First-time setup

1. Open **Settings**.
2. Add one or more **Working Directories**.
3. (Optional) Adjust:
   - Specify command template
   - Spec sync interval
   - Session sync interval
   - Fallback approver name
4. Select a repository from Explorer.
5. If needed, run onboarding for that repo (Specify integration).

## Typical workflow

1. **Discover repos** from configured working directories.
2. **Select spec** and progress stages in the pipeline.
3. **Approve stage docs** in markdown (file-based markers).
4. **Create worktree** and launch AI session (Claude/Copilot).
5. **Monitor output** in terminal/session views.
6. **Review changes** in Git Management (history, diff, blame, stash, remotes).
7. **Edit docs/spec files** in Markdown Manager across branches.

## Build from source

### Requirements

- Node.js 22+
- Corepack-enabled pnpm (repo is pinned to `pnpm@10.33.0`)

### Setup

```bash
git clone https://github.com/baoduy/multi-agent-ide.git
cd multi-agent-ide
corepack enable
corepack pnpm install
```

### Development

```bash
corepack pnpm dev
# or
corepack pnpm dev:watch
```

### Quality + build

```bash
corepack pnpm build
corepack pnpm test
corepack pnpm lint
```

### Distributables

```bash
corepack pnpm dist
corepack pnpm dist:mac
corepack pnpm dist:win
corepack pnpm dist:linux
```

## Docs index

- Feature docs: [`docs/features/README.md`](docs/features/README.md)
- Architecture: [`docs/architecture/architecture-overview.md`](docs/architecture/architecture-overview.md)
- Developer rules: [`CLAUDE.md`](CLAUDE.md)

## License

MIT
