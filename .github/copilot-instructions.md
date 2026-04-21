# multi-agent-ide Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-04-11

## Active Technologies

- TypeScript 6.0.2 · Node.js 22 (Electron 41.2.0) (002-run-feature-hook)
- node-pty (native PTY spawning in Electron daemon) (002-run-feature-hook)
- strip-ansi@6.0.1 (ANSI stripping in daemon; use CJS v6, not ESM v7+) (002-run-feature-hook)
- @electron/rebuild (native addon rebuild for Electron ABI) (002-run-feature-hook)

## Project Structure

```text
packages/
  shared/src/ipc.ts            — Zod IPC schemas
  daemon/src/application/      — Application services (class-first OOP)
  daemon/src/ipc/handlers/     — Thin IPC handler adapters
  ui/src/renderer/components/  — React components (common/, dialogs/, activity/)
  ui/src/renderer/store/       — Zustand stores
```

## Commands

pnpm build && pnpm test && pnpm lint

## Code Style

TypeScript 6.0.2 · Node.js 22 (Electron 41.2.0): Follow standard conventions.
Class-first OOP for all daemon services. Zustand stores own state only — cross-store ops via SessionCoordinator.

## Recent Changes

- 002-run-feature-hook: Added TypeScript 6.0.2 · Node.js 22 (Electron 41.2.0)
- 002-run-feature-hook: Added node-pty, strip-ansi@6.0.1, @electron/rebuild for MagentaTerminal feature

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->

<claude-mem-context>
# claude-mem: Cross-Session Memory

*No context yet. Complete your first session and context will appear here.*

Use claude-mem's MCP search tools for manual memory queries.
</claude-mem-context>

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
<!-- SPECKIT END -->
