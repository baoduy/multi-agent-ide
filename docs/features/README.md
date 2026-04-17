# Feature Documentation

This directory describes the features Magenta IDE actually ships today. Each file is a technical reference for one feature area: what it does, where it lives in the codebase, which IPC endpoints it uses, which daemon services and renderer stores back it, and the flows that matter.

These documents describe the shipped state, not plans. Design proposals and implementation roadmaps live in `../plans/` (see for example `git-manager-feature.md` in this directory, which pre-dates the convention — it is an implementation plan, not a reference).

## Feature Index

| Area | Document | What it covers |
|------|----------|----------------|
| Repositories | [repositories.md](./repositories.md) | Multi-repo registration, working dirs, scanning, sidebar tree, force-reload |
| Spec pipeline | [spec-pipeline.md](./spec-pipeline.md) | 5-stage pipeline (constitution → spec → plan → tasks → implementation), sync, approval, flow diagram |
| Onboarding | [onboarding.md](./onboarding.md) | Installing `specify` into a repo, agent switch, upgrade, per-repo banners |
| AI sessions | [ai-sessions.md](./ai-sessions.md) | Live Claude Code / Copilot PTY sessions, permission modes, provider registry, resume |
| Synced sessions | [synced-sessions.md](./synced-sessions.md) | Disk-scanned CLI session history from `~/.claude` and `~/.copilot` |
| Terminal | [terminal.md](./terminal.md) | Generic PTY shell sessions in the dock |
| Git management | [git-management.md](./git-management.md) | Clone, commit, branches, history, diff, blame, stash, remotes, reset/revert |
| Worktrees | [worktrees.md](./worktrees.md) | Per-branch worktree create/list/merge/delete and AI integration |
| Dock layout | [dock-layout.md](./dock-layout.md) | ActivityBar, sidebars, tabbed center, bottom panel, drag-to-reorder |
| Theme system | [theme-system.md](./theme-system.md) | Light/dark/system preference, CSS tokens, persistence |
| Configuration | [configuration.md](./configuration.md) | `~/.magenta/config.json`, working dirs, Specify command, sync intervals |
| Markdown manager | [markdown-manager.md](./markdown-manager.md) | Dedicated activity group for browsing and editing `.md` files across branches |

## Reading Order

If you are new to the codebase, the fastest on-ramp is:

1. [`repositories.md`](./repositories.md) — the primary entity everything else hangs off.
2. [`spec-pipeline.md`](./spec-pipeline.md) — the central workflow the IDE orchestrates.
3. [`dock-layout.md`](./dock-layout.md) — how the UI shell is composed.
4. [`ai-sessions.md`](./ai-sessions.md) + [`synced-sessions.md`](./synced-sessions.md) — the agent surface.
5. Reach for other files as you need them.

## Cross-Cutting Conventions

Every feature doc follows the same structure:

- **Purpose** — one paragraph describing what the feature does for the user.
- **User-visible surface** — the components, dialogs, and dock locations the user sees.
- **IPC contract** — the request/response types and push events declared in `packages/shared/src/ipc.ts`.
- **Daemon** — the application services and infrastructure gateways on the daemon side.
- **Renderer** — the Zustand stores and top-level components on the renderer side.
- **Data model** — DB tables, config files, localStorage keys, and in-memory shapes.
- **Flows** — ordered steps for the main happy paths.
- **Guardrails** — validation, allowlists, path guards, error codes that are easy to miss.
- **Notes** — anything non-obvious or surprising about the implementation.

## Also See

- [`../architecture/architecture-overview.md`](../architecture/architecture-overview.md) — how the four packages fit together.
- [`../../CLAUDE.md`](../../CLAUDE.md) — rules for adding or modifying code (IPC checklist, layer order, anti-patterns).
- [`../kickstart-repo-scanner-and-spec-flow.md`](../kickstart-repo-scanner-and-spec-flow.md) — the original kick-start spec; useful historical context for the repo/spec scaffolding.
