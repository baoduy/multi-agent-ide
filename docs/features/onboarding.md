# Repository Onboarding

## Purpose

Before a repo can participate in the spec pipeline it has to be initialised with [Spec Kit](https://github.com/github/spec-kit) — the `specify` CLI installed and configured for a chosen AI agent (`claude` or `copilot`). The Onboarding feature runs the `specify init`/`integration switch` commands against a repo, streams the CLI output back into the IDE, and records which AI integration is active. The same surface handles "upgrade" (re-run `specify init` against an already-onboarded repo) and "switch" (change the agent without re-installing). Onboarding can optionally operate inside a dedicated git worktree so it does not touch the user's working tree.

## User-visible surface

Four components drive the UI:

- `OnboardDialog.tsx` — the primary modal. Offers the agent dropdown (Claude Code / GitHub Copilot), a "use worktree" checkbox, and a Start/Cancel control. Once started, the command output streams into an embedded `MagentaTerminal`.
- `UpgradeSpecifyDialog.tsx` — a thinner variant for repos that already have `.specify/`. Shows an Upgrade button and reuses the same output view.
- `SpecifyOnboardBanner.tsx` — a self-contained inline banner used inside `NewSessionDialog` so users can onboard or switch the agent while creating an AI session, without colliding with the global dialog state.
- `SpecifyFooterStatus.tsx` — a read-only footer surface showing the current Specify agent for the active repo. If the agent conflicts with the provider the user is about to spawn, the status is highlighted in the workflow-yellow token.

`OnboardDialogManager.tsx` sits above these and decides which (if any) banner or dialog should be offered for a repo. Settings surface `SpecifyCommandSetting.tsx`, which lets the user customise the install command template.

## IPC contract

Onboarding is fire-and-forget: the handler replies `*:started` immediately and pushes progress and completion events out of band.

| Direction | Type | Payload |
|-----------|------|---------|
| Request | `repo:onboard` | `{ repoPath, aiAgent, useWorktree? }` (agent must match `^[a-z0-9_-]+$`) |
| Response | `repo:onboard:started` | `{ repoPath }` |
| Push | `repo:onboard:output` | `{ repoPath, data }` (raw CLI stdout/stderr) |
| Push | `repo:onboard:complete` | `{ repoPath, success, error? }` |
| Request | `repo:onboard:cancel` | `{ repoPath }` |
| Response | `repo:onboard:cancelled` | `{ repoPath }` |
| Request | `repo:upgrade-specify` | `{ repoPath }` |
| Response | `repo:upgrade-specify:started` | `{ repoPath }` |
| Push | `repo:upgrade-specify:output` | `{ repoPath, data }` |
| Push | `repo:upgrade-specify:complete` | `{ repoPath, success, error? }` |
| Request | `repo:specify-switch` | `{ repoPath, aiAgent }` |
| Response | `repo:specify-switch:started` | `{ repoPath }` |
| Request | `repo:specify-status` | `{ repoPath }` |
| Response | `repo:specify-status:result` | `{ repoPath, hasSpecs, currentAgent }` |

Switch reuses the `repo:onboard:output` / `repo:onboard:complete` channels for streaming.

## Daemon

- `packages/daemon/src/application/OnboardApplicationService.ts` — the orchestrator. `onboard(repoPath, agent, useWorktree)` optionally creates a worktree, ensures `.worktrees/` is in `.gitignore`, spawns the configured `specify init` command, and streams output. `upgrade` runs the same command without creating a worktree. `switchIntegration` uses a lighter template (`specify integration switch <agent>`). `getSpecifyStatus` reports whether `.specify/` exists and which agent is active. `cancel` sends `SIGTERM`, escalating to `SIGKILL` after 2 seconds.
- `packages/daemon/src/ipc/handlers/onboardHandlers.ts` — the thin IPC adapters. Every handler has an error catch that guarantees a completion event fires even if spawn fails before the first output.

Command templates live in `ConfigManager` (`specifyCommand`, defaulting to `uvx --from git+https://github.com/github/spec-kit.git specify init --here --ai {agent} --force`). The `{agent}` placeholder is substituted at runtime. The command string is validated against an allowlist that rejects shell metacharacters before being split into argv and handed to `child_process.spawn` without a shell.

## Renderer

- `packages/ui/src/renderer/store/onboardStore.ts` — holds a `processes[repoPath]` map. Each entry is `{ kind: 'onboard' | 'upgrade', phase: 'select' | 'running' | 'done', output, success, error, dialogOpen }`. The store subscribes to `repo:onboard:*` and `repo:upgrade-specify:*` push events and appends to the right record.
- `OnboardDialog` / `UpgradeSpecifyDialog` — read from the store by `repoPath`, render the agent picker and the live terminal, dispatch Start/Cancel.
- `SpecifyOnboardBanner` — holds its own IPC subscriptions so it can run standalone inside `NewSessionDialog` without interacting with the global dialog.

## Data model

On disk, Spec Kit writes two files the onboarding feature cares about:

- `.specify/integration.json` — `{ integration: 'claude' | 'copilot' }`. Canonical source of the active agent after any switch.
- `.specify/init-options.json` — `{ ai: 'claude' | 'copilot', … }`. Fallback for repos that were initialised before the integration file was introduced.

`.worktrees/` is added to `.gitignore` the first time a worktree-mode onboarding runs. `OnboardProcess` in the store tracks the UI side only; the daemon tracks `activeProcesses: Map<repoPath, ChildProcess>` to prevent duplicate concurrent runs against the same repo.

The install template lives in config at `~/.magenta/config.json` under `specifyCommand` and is validated via `MagentaConfigSchema`.

## Flows

### Onboard a repo with a worktree

1. The user opens `OnboardDialog`, picks an agent, and toggles the "use worktree" checkbox. Clicking Start sends `repo:onboard` with `useWorktree=true`.
2. `OnboardApplicationService.onboard` creates a worktree at `.worktrees/specify-init-<branch>-<timestamp>` on a new branch `specify-init/<branch>`, ensures `.worktrees/` is in `.gitignore` (silently skipping if the `.gitignore` is read-only or missing), then spawns the templated command inside the worktree cwd.
3. stdout and stderr are streamed as `repo:onboard:output` events. On child exit a `repo:onboard:complete` is pushed with `success: true/false`.
4. The renderer's `MagentaTerminal` renders the output; the store keeps the final state until the dialog is dismissed.

### Upgrade an existing onboarding

1. User opens `UpgradeSpecifyDialog` for a repo with an existing `.specify/`.
2. The daemon reads the current agent from `integration.json` (preferred) or `init-options.json` (fallback; defaults to `claude` if both are missing).
3. The same `specifyCommand` template is spawned directly in the repo root (no worktree). Output and completion stream as for onboard.

### Switch agent

1. UI sends `repo:specify-switch` with the new agent.
2. `OnboardApplicationService.switchIntegration` builds a lighter command by extracting the `specify` prefix from the template and appending `integration switch <agent>`, then spawns it.
3. On success, `.specify/integration.json` is updated with the new agent.

### Status check

`getSpecifyStatus` is used by `SpecifyFooterStatus` and `OnboardDialogManager`. It checks whether `.specify/` exists, reads `integration.json` first (falling back to `init-options.json`), and returns `{ hasSpecs, currentAgent }` so the UI can decide whether to show an onboarding CTA or a mismatch warning.

## Guardrails

- `aiAgent` is validated twice: once by the Zod schema at the IPC boundary (`^[a-z0-9_-]+$`) and again against a hardcoded whitelist (`SPECIFY_AI_AGENTS`). Only `claude` and `copilot` are accepted today.
- The command template is split into argv with `trim().split(' ')` and spawned without `shell: true`. The allowlist in `OnboardApplicationService` rejects templates that contain `;`, `|`, `` ` ``, redirect operators, quotes, globs, or braces before spawning.
- `{agent}` substitution happens on the pre-split argv pieces, not via shell interpolation.
- `activeProcesses` prevents two concurrent onboard runs for the same repo. Cancel sends `SIGTERM`, then escalates to `SIGKILL` after 2 seconds.
- Worktree branch naming uses `sanitizeName` to strip invalid characters. If the source branch is entirely non-identifier characters, the service throws `WORKTREE_CONFLICT` rather than producing a junk name.
- Every handler wraps spawn in a try/catch that emits `repo:onboard:complete { success: false, error }` even for spawn-time errors (e.g. `uvx` not installed), so the UI is never left waiting on a response.

## Notes

- There is no timeout on a running onboard. If the spawned process spawns successfully but hangs indefinitely, the UI will stay in the "running" phase until the user cancels.
- Output is streamed raw (ANSI escape codes included). `MagentaTerminal` is responsible for interpreting or stripping colour sequences.
- `.specify/integration.json` is canonical after any switch; `.specify/init-options.json` is read as a compatibility fallback but is not updated by the switch command.
- The default `specifyCommand` uses `uvx`. Users without `uv` installed must update the template in Settings or install `uv` locally. The error surfaces as a spawn failure (`ENOENT`) in the completion event.
