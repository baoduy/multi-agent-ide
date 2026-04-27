# Plan: Programmatic CLI Integration Improvements (Claude Code + Copilot)

**Date:** 2026-04-24
**Author:** Steven (with Claude)
**Status:** Draft — awaiting approval
**Scope:** `packages/shared`, `packages/daemon`, `packages/ui`

---

## 0. Executive summary

Magenta IDE currently shells out to the `claude` and `copilot` binaries via node‑pty to power its AI Terminal feature. The integration is solid for **interactive PTY use** but leaves the majority of each CLI's **programmatic surface** unused — flags like `--bare`, `--json-schema`, `--mcp-config`, `--max-turns`, `--max-budget-usd`, `--session-id`, `--fork-session`, `--agents`, `--allow-tool` patterns, `--share`, `--no-ask-user`, and the structured `stream-json` hook/retry events.

Because Magenta is a **multi‑repo orchestrator for the Spec → Plan → Task → Implement → Review pipeline**, these gaps directly constrain what we can do: we can't run scripted spec reviews, can't enforce per‑task least‑privilege, can't cap spend or turns, can't resume a forked branch of a conversation for a "what‑if" review, can't cleanly extract structured output from an agent, and can't surface hook/retry lifecycle events to the Kanban board.

This plan closes those gaps in seven phases. Each phase is independently shippable; phases 1–3 are the highest‑leverage.

---

## 1. Current state (thorough audit)

### 1.1 Architecture touchpoints

| Layer | File | Role |
|---|---|---|
| Provider metadata | `packages/daemon/src/domain/providerRegistry.ts` | Defines `PROVIDER_META`, binary names (`claude`, `copilot`), supported permission modes |
| Session factory | `packages/daemon/src/infrastructure/sessions/{ClaudeSessionFactory,CopilotSessionFactory,BaseAISession}.ts` | PTY spawn, ring buffer, heartbeat |
| One‑shot gateway | `packages/daemon/src/infrastructure/AiCliGateway.ts` | Non‑interactive `runOnce()` for spec‑review chat; builds argv, parses stream‑json |
| Application service | `packages/daemon/src/application/AISessionApplicationService.ts` | Orchestrates create/resume/stop/sendInput/setPermissionMode |
| Status detection | `packages/daemon/src/domain/statusDetection.ts` | Regex over ANSI‑stripped PTY output |
| Shared schema | `packages/shared/src/aiTerminal.ts`, `packages/shared/src/ipc.ts` | `AISessionRecord`, `AISessionConfig`, 11 IPC variants |
| Synced sessions | `packages/shared/src/syncedSession.ts` + `SyncedSessionRepository` | Scans `~/.claude/projects/*.jsonl`, `~/.copilot/session-state/*/workspace.yaml` |

### 1.2 Flags currently passed

**Claude (`AiCliGateway.buildArgs` + `AISessionApplicationService.createSession`):**
- `-p` (always, for one‑shot; PTY session does not use `-p`)
- `--model <model>`
- `--permission-mode <mode>` | `--dangerously-skip-permissions`
- `--append-system-prompt <text>` (one‑shot only, not exposed via IPC)
- `--allowedTools`, `--disallowedTools` (one‑shot only, **not wired to IPC**)
- `--resume <id>` (with automatic retry‑without‑resume fallback)
- `--output-format stream-json --verbose` (one‑shot only)

**Copilot:**
- `-p <prompt>`
- `--autopilot --yolo --max-autopilot-continues 50` (auto mode)
- `--allow-all` (bypass mode)
- `--resume=<id>`

### 1.3 Permission modes (6)

`default` · `acceptEdits` · `plan` · `auto` · `dontAsk` · `bypassPermissions`. Claude supports all 6; Copilot supports `default`, `auto`, `bypassPermissions`. Runtime cycling via `Shift+Tab` escape sequence sent to PTY.

### 1.4 Output handling

- **PTY sessions:** raw bytes → seq‑numbered ring buffer → push events (`ai-session:data`). No structured parsing.
- **One‑shot (`runOnce`):** line‑delimited JSON parser picks up `session_id`, assistant `text`/`thinking` deltas, compact tool‑use summaries. `tool_result` is intentionally dropped.
- **Copilot:** no stream parsing anywhere — captured as raw text only.
- **Status detection:** idle/active/waiting‑input inferred from ANSI‑stripped text regex. Error only on non‑zero exit.

### 1.5 Session resume / reconciliation

- On create: if `providerSessionId` present, pass `--resume`. Otherwise let CLI generate UUID.
- Post‑spawn: daemon watches `~/.claude/projects/<encodedCwd>/*.jsonl` and `~/.copilot/session-state/*/workspace.yaml`, matches cwd, extracts UUID, fires `ai-session:updated`.
- Resume failure heuristic: if stderr contains "session not found|expired|invalid", retry without `--resume`.

### 1.6 IPC surface (session‑related)

Requests: `ai-session:create` · `:resume` · `:input` · `:resize` · `:stop` · `:attach` · `:ack` · `:list` · `:delete` · `:providers` · `:set-permission-mode`.
Pushes: `:data` · `:status` · `:exited` · `:heartbeat` · `:updated` · `:title`.

---

## 2. Capability reference (what the CLIs actually support)

### 2.1 Claude Code CLI — full flag inventory (from `/docs/en/cli-reference` and `/docs/en/headless`)

Grouped by purpose:

**Execution mode**
`-p / --print` · `--bare` (skip hooks/skills/plugins/MCP/CLAUDE.md auto‑discovery) · `--init` · `--init-only` · `--maintenance` · `--verbose`

**I/O format**
`--output-format <text|json|stream-json>` · `--input-format <text|stream-json>` · `--json-schema <JSON>` · `--include-partial-messages` · `--include-hook-events` · `--replay-user-messages`

**Model / budget**
`--model <alias|full>` · `--fallback-model <name>` · `--effort <low|medium|high|xhigh|max>` · `--max-turns <N>` · `--max-budget-usd <$>` · `--betas <list>`

**System prompt**
`--system-prompt <text>` · `--system-prompt-file <path>` · `--append-system-prompt <text>` · `--append-system-prompt-file <path>` · `--exclude-dynamic-system-prompt-sections`

**Tools & permissions**
`--allowedTools "Bash(git diff *),Read"` · `--disallowedTools ...` · `--tools "Bash,Edit,Read"` (restrict available set) · `--permission-mode <default|acceptEdits|plan|auto|dontAsk|bypassPermissions>` · `--permission-prompt-tool <mcp_tool>` · `--dangerously-skip-permissions` · `--allow-dangerously-skip-permissions`

**MCP / plugins / subagents**
`--mcp-config <file|json>` · `--strict-mcp-config` · `--plugin-dir <path>` (repeatable) · `--agents '<json>'` · `--agent <name>` · `--channels plugin:<name>@<marketplace>` · `--disable-slash-commands`

**Settings**
`--settings <file|json>` · `--setting-sources user,project,local`

**Session lifecycle**
`--session-id <uuid>` · `-c/--continue` · `-r/--resume <id|name>` · `-n/--name <display>` · `--fork-session` · `--from-pr <num|url>` · `--no-session-persistence`

**Workspace**
`--add-dir <path...>` · `-w/--worktree [name]` · `--tmux[=classic]` · `--ide` · `--chrome` / `--no-chrome`

**Debugging**
`--debug [categories]` · `--debug-file <path>` · `--verbose`

**Remote**
`--remote <task>` · `--teleport` · `--remote-control/--rc [name]` · `--remote-control-session-name-prefix`

**stream‑json events of interest (not currently parsed):**
`system/init` (model, tools, MCP servers, plugins, plugin_errors) · `system/plugin_install` (status/started/installed/failed/completed) · `system/api_retry` (attempt, max_retries, retry_delay_ms, error_status, error category)

### 2.2 Copilot CLI — full flag inventory (from `/reference/cli-command-reference` + `/reference/cli-programmatic-reference`)

**Execution mode**
`-p / --prompt <text>` · `-i` (force interactive) · `-s / --silent` (suppress metadata) · piped stdin (ignored if `-p` set)

**Output**
`--output-format json` · `--no-color` · `--share <path.md>` (export transcript) · `--share-gist`

**Model**
`--model <name>` (env: `COPILOT_MODEL`)

**Session lifecycle**
`--continue` · `--resume <id>` · session IDs in `~/.copilot/session-state/<uuid>/`

**Tools & permissions (pattern syntax)**
`--allow-tool '<pattern>'` / `--deny-tool '<pattern>'` (repeatable)
  Categories: `shell(<prefix>:*)` · `write` · `read` · `view` · `url` · `memory` · `MCP:<server>:<tool>`
  Example: `--allow-tool='shell(git:*), write, shell(npm:*)'`
`--allow-url <url|glob>` · `--allow-all-paths` · `--allow-all-tools` · `--allow-all`
`--no-ask-user` (skip clarifying questions)

**Autopilot**
`--autopilot` · `--yolo` · `--max-autopilot-continues <N>`

**MCP**
`--additional-mcp-config <path>` · `--enable-all-github-mcp-tools`

**Workspace**
`--add-dir <path>` (repeatable)

**Environment variables**
`COPILOT_GITHUB_TOKEN` · `GH_TOKEN` / `GITHUB_TOKEN` · `COPILOT_HOME` · `COPILOT_MODEL` · `COPILOT_ALLOW_ALL` · `COPILOT_CUSTOM_INSTRUCTIONS_DIRS` · `COPILOT_SKILLS_DIRS` · 11 OTel vars

**Slash commands (usable inside `-p` prompt text):**
`/review` · `/agent <name>` · `/delegate` · `/fleet` · `/mcp` · `/context` · `/skills` · `/share` · `/plan` · `/clear` · `/allow-all`

**Built‑in agents:** `code-review` · `explore` · `general-purpose` · `research` · `task`

**Hooks:** 8 lifecycle events (preToolUse, postToolUse, agentStop, subagentStop, etc.) read from config files — no CLI flag, but `--allow-tool`/`--deny-tool` interact with them.

**ACP server:** `copilot acp-server` — an Agent Client Protocol transport for IDE integrations (separate command).

---

## 3. Gap analysis (docs vs current Magenta impl)

Legend: ✅ Supported · ⚠️ Partial / hard‑coded · ❌ Missing

### 3.1 Claude

| Capability | Supported by CLI | In Magenta today | Priority |
|---|---|---|---|
| `-p` headless one‑shot | ✅ | ✅ (`AiCliGateway.runOnce`) | — |
| `--bare` for deterministic CI runs | ✅ | ❌ | **P1** |
| `--output-format stream-json` parsing | ✅ | ⚠️ partial (one‑shot only, drops tool_result, no retry events) | **P1** |
| `--json-schema` structured extraction | ✅ | ❌ | **P1** |
| `--max-turns`, `--max-budget-usd` caps | ✅ | ❌ | **P1** |
| `--model`, `--fallback-model` | ✅ / ✅ | ✅ / ❌ | P2 |
| `--effort` | ✅ | ❌ | P2 |
| `--system-prompt`, `--system-prompt-file`, `--append-system-prompt-file` | ✅ | ⚠️ (`--append-system-prompt` only, one‑shot only) | **P1** |
| `--exclude-dynamic-system-prompt-sections` | ✅ | ❌ | P3 |
| `--mcp-config`, `--strict-mcp-config` | ✅ | ❌ (relies on `~/.claude` on disk) | **P1** |
| `--permission-prompt-tool` (delegate approvals to MCP) | ✅ | ❌ | P2 |
| `--allowedTools` / `--disallowedTools` / `--tools` | ✅ | ⚠️ (plumbing exists, not wired to IPC/UI) | **P1** |
| `--agents '<json>'` · `--agent <name>` | ✅ | ❌ | P2 |
| `--plugin-dir` | ✅ | ❌ | P3 |
| `--settings`, `--setting-sources` | ✅ | ❌ | P2 |
| `--session-id <uuid>` | ✅ | ❌ (let CLI generate → reconcile) | **P1** |
| `--fork-session` | ✅ | ❌ | P2 |
| `-n/--name` human‑readable session name | ✅ | ❌ (we synthesize title from first message) | P2 |
| `--from-pr` | ✅ | ❌ | P3 |
| `--no-session-persistence` | ✅ | ❌ | P3 |
| `--add-dir` additional working dirs | ✅ | ❌ | P2 |
| `--worktree` native | ✅ | ❌ (we manage worktrees ourselves → keep doing so) | SKIP |
| `--include-hook-events`, `--include-partial-messages` | ✅ | ❌ | P2 |
| `--replay-user-messages` (stream‑json input) | ✅ | ❌ | P3 |
| `system/api_retry` event surfacing | ✅ (emitted in stream) | ❌ (not parsed) | **P1** |
| `system/init` / `system/plugin_install` | ✅ | ❌ | P2 |
| Status detection from stream events | ✅ (reliable) | ❌ (regex on PTY bytes — fragile) | P2 |
| `--debug`, `--debug-file` | ✅ | ❌ | P3 |

### 3.2 Copilot

| Capability | CLI | Magenta | Priority |
|---|---|---|---|
| `-p` prompt | ✅ | ✅ | — |
| `-s/--silent` metadata suppression | ✅ | ❌ | **P1** |
| `--output-format json` | ✅ | ❌ | **P1** |
| `--no-ask-user` | ✅ | ❌ | **P1** |
| `--model` | ✅ | ❌ (ignored) | **P1** |
| `--allow-tool` / `--deny-tool` pattern syntax | ✅ | ❌ (we only have `--allow-all`) | **P1** |
| `--allow-url` | ✅ | ❌ | P2 |
| `--additional-mcp-config` | ✅ | ❌ | P2 |
| `--enable-all-github-mcp-tools` | ✅ | ❌ | P2 |
| `--share <path>`, `--share-gist` | ✅ | ❌ | P3 |
| `--add-dir` | ✅ | ❌ | P2 |
| `--continue`, `--resume <id>` | ✅ | ⚠️ (resume only) | P2 |
| Built‑in agents (`/review`, `/delegate`, `/fleet`, etc.) as first‑class actions | ✅ | ❌ | P2 |
| Hooks (8 lifecycle events) | ✅ (read from config) | ❌ (no config surface) | P3 |
| Autopilot tuning (`--max-autopilot-continues`) | ✅ | ⚠️ hard‑coded `50` | P2 |
| ACP server mode | ✅ | ❌ | P3 (explore) |
| OTel env vars for metrics | ✅ | ❌ | P3 |

---

## 4. Proposed improvements — phased roadmap

> Verification across all phases stops at **typecheck + build** per `feedback_verification.md`. The user tests end‑to‑end manually.

### Phase 1 — Foundation: typed `SpawnOptions` + provider adapter refactor

**Goal:** Stop hand‑crafting argv in three places. Introduce a single typed spawn‑options schema in `packages/shared` that every provider adapter translates into its own argv.

**Changes**
1. `packages/shared/src/aiTerminal.ts` — add `AISpawnOptions` zod schema:
   ```ts
   export const AISpawnOptions = z.object({
     // I/O
     outputFormat: z.enum(["text","json","stream-json"]).optional(),
     jsonSchema: z.record(z.unknown()).optional(),      // Claude only
     includePartialMessages: z.boolean().optional(),
     includeHookEvents: z.boolean().optional(),
     silent: z.boolean().optional(),                    // Copilot -s
     // Model / budget
     model: z.string().optional(),
     fallbackModel: z.string().optional(),
     effort: z.enum(["low","medium","high","xhigh","max"]).optional(),
     maxTurns: z.number().int().positive().optional(),
     maxBudgetUsd: z.number().positive().optional(),
     maxAutopilotContinues: z.number().int().positive().optional(),
     // System prompt
     systemPrompt: z.string().optional(),
     systemPromptFile: z.string().optional(),
     appendSystemPrompt: z.string().optional(),
     appendSystemPromptFile: z.string().optional(),
     excludeDynamicSystemPromptSections: z.boolean().optional(),
     // Tools & permissions
     allowedTools: z.array(z.string()).optional(),
     disallowedTools: z.array(z.string()).optional(),
     toolsAvailable: z.array(z.string()).optional(),    // Claude --tools
     permissionMode: AIPermissionMode.optional(),
     permissionPromptTool: z.string().optional(),
     noAskUser: z.boolean().optional(),                 // Copilot
     allowUrls: z.array(z.string()).optional(),         // Copilot
     // MCP / agents / plugins
     mcpConfig: z.union([z.string(), z.record(z.unknown())]).optional(),
     strictMcpConfig: z.boolean().optional(),
     enableAllGithubMcpTools: z.boolean().optional(),   // Copilot
     agents: z.record(z.object({ description: z.string(), prompt: z.string() })).optional(),
     agent: z.string().optional(),
     pluginDirs: z.array(z.string()).optional(),
     settings: z.union([z.string(), z.record(z.unknown())]).optional(),
     settingSources: z.array(z.enum(["user","project","local"])).optional(),
     // Lifecycle
     sessionId: z.string().uuid().optional(),
     resumeSessionId: z.string().optional(),
     continueRecent: z.boolean().optional(),
     forkSession: z.boolean().optional(),
     sessionName: z.string().optional(),
     fromPR: z.string().optional(),
     noSessionPersistence: z.boolean().optional(),
     bare: z.boolean().optional(),
     // Workspace
     additionalDirs: z.array(z.string()).optional(),
     // Debug
     debug: z.string().optional(),
     debugFile: z.string().optional(),
     verbose: z.boolean().optional(),
   }).strict();
   ```

2. `packages/daemon/src/domain/providerRegistry.ts` — each provider exposes a pure `toArgv(opts: AISpawnOptions): string[]` function. Unsupported options become a documented no‑op (warn in debug mode) rather than silent drop.

3. `packages/daemon/src/infrastructure/AiCliGateway.ts` — `runOnce()` and `BaseAISession.buildSpawnArgv()` both consume `toArgv()`. Delete the inline argv building.

4. `AppErrorCode` — add `UNSUPPORTED_SPAWN_OPTION` for when a user asks for e.g. `jsonSchema` on a Copilot session.

**Verify:** `tsc --noEmit` clean · `vitest` passes for domain tests · build clean · new unit tests for `toArgv()` covering every option for both providers.

---

### Phase 2 — Programmatic primitives (headless + stream parsing + caps)

**Goal:** Make every one‑shot capability of each CLI reachable through typed IPC. This unlocks spec‑review at scale, PR‑review bots, budget‑capped batch runs, and programmatic integrations from the Kanban board.

**Changes**

1. **New IPC request** `ai:run-once` (schema in `packages/shared/src/ipc.ts`):
   ```ts
   { type: "ai:run-once",
     provider: "claude" | "copilot",
     repoPath: string, worktreePath?: string,
     prompt: string,
     spawn: AISpawnOptions,
     timeoutMs?: number }
   ```
   Response: `{ stdout, stderr, exitCode, sessionId?, tokenUsage?, costUsd?, retriesSeen: number }`.

2. **Stream parser** (`packages/daemon/src/domain/streamJsonParser.ts`):
   - Claude events: `system/init` · `system/plugin_install` · `system/api_retry` · assistant blocks (text, thinking, tool_use) · user blocks · `result`
   - Copilot (when `--output-format json` is added): parse the single JSON object emitted at end
   - Emit **typed domain events** — not raw lines — so UI consumers (`ai-session:data` can stay, but new `ai-session:event` carries `{kind, payload}`)

3. **IPC push** `ai-session:event` with union type `AIStreamEvent`. Replaces most of our current regex‑based status detection for sessions started with stream‑json.

4. **Status detection switch**: when `outputFormat === "stream-json"`, derive status from events (`result` → idle, `assistant` mid‑turn → active, permission request → waiting‑input) instead of regex.

5. **Budget / turn caps** — pass `--max-turns`, `--max-budget-usd` directly. On exceeded, bubble `AppError("AI_BUDGET_EXCEEDED" | "AI_TURN_LIMIT")` with actual usage attached.

6. **Copilot silent + JSON** — wire `-s` and `--output-format json` for one‑shot runs so we can `result = await runOnce(...)` from the spec review path without parsing PTY bytes.

7. **UI** — new "Run task programmatically" dialog on the Kanban card (Phase 2 surfaces only the one‑shot path; PTY sessions unchanged). Expose budget/turn sliders.

**Verify:** `tsc` · build · vitest covers parser events (fixtures checked into `packages/daemon/src/domain/__fixtures__/streamjson/*.jsonl`).

---

### Phase 3 — Structured context: bare mode, system prompts, MCP, settings

**Goal:** Make runs reproducible across machines. Right now a Magenta run depends on whatever happens to be in `~/.claude` or `~/.copilot` on the host.

**Changes**

1. **`--bare` for Claude one‑shot runs** used by internal features (spec review, task generation). PTY sessions keep full context.
2. **System prompt plumbing** — `systemPromptFile` / `appendSystemPromptFile` paths stored in a new `working_dirs.prompt_templates_path` column (migration 13). UI gets a "System prompt" panel in Settings.
3. **MCP config** — new `working_dirs.mcp_config_json` column (migration 14). When set, `--mcp-config` + `--strict-mcp-config` pass it to each spawn. `AISpawnOptions.mcpConfig` wins over the per‑working‑dir default when present.
4. **Copilot `--additional-mcp-config`** mirrored.
5. **Claude `--settings`** — surface `ANTHROPIC_API_KEY` / `apiKeyHelper` injection via JSON rather than relying on keychain (needed for `--bare` in CI).
6. **Per‑task instruction files** — a task can carry a `spec/claude-instructions.md` + `spec/copilot-instructions.md`; daemon materializes these into a temp file, passes path to `--system-prompt-file` / `--append-system-prompt-file`.

**Verify:** `tsc` · `drizzle-kit generate` clean · migration test with a golden snapshot · build clean.

---

### Phase 4 — Tool / permission granularity

**Goal:** Least‑privilege per task. Today the only choice is "default prompts" or "bypass everything."

**Changes**

1. **Wire `allowedTools` / `disallowedTools` into IPC** — already built in the gateway; just expose through `ai-session:create` and `ai:run-once`.
2. **Tool preset UI** — per‑provider preset library:
   - "Read‑only review": Claude `Read,Grep,Glob` · Copilot `--allow-tool='read, view, shell(git:diff), shell(git:log)'`
   - "Commit & push": Claude `Bash(git add *),Bash(git commit *),Bash(git push *),Read,Edit` · Copilot `--allow-tool='write, shell(git:*)'`
   - "Test runner": `Bash(npm test *),Bash(pnpm test *),Read,Edit` / `--allow-tool='shell(npm:*), shell(pnpm:*), shell(npx:*), write'`
3. **Copilot pattern translator** — since Copilot uses `shell(prefix:*)` syntax and Claude uses `Bash(prefix *)`, keep a mapper so a single preset covers both providers.
4. **`--permission-prompt-tool`** — plumb a daemon‑supplied MCP tool that surfaces Claude's permission questions to the Magenta UI (push event `ai-session:permission-request`, response `ai-session:permission-response`). This lets us show a proper approval dialog instead of the PTY's text prompt.
5. **Copilot `--no-ask-user`** for programmatic runs; keep it off for interactive.

**Verify:** `tsc` · unit tests for preset translator · build clean.

---

### Phase 5 — Session lifecycle polish

**Goal:** Deterministic, resumable, branchable sessions. The UI is the source of truth for the canonical session identifier; the daemon is responsible for translating that identifier into provider‑specific resume flags.

**Session ID precedence rule (canonical)**

Every session‑creating IPC request (`ai-session:create`, `ai:run-once`, `ai-session:fork`) accepts an optional `sessionId: UUID v4` field. Resolution order:

1. **Caller provides `sessionId`** → daemon uses it verbatim as the canonical Magenta session identifier.
2. **Caller does not provide `sessionId`** → daemon generates a UUID v4 and uses it.

In both cases:

- The provider's `--session-id` flag SHALL be set to the canonical sessionId **iff** the provider's capability manifest declares `supportsExplicitSessionId: true`. Today that is Claude only.
- The response from create / run‑once SHALL carry the canonical `sessionId` synchronously, even when the provider does not yet know its own ID (Copilot pre‑first‑turn).
- The canonical sessionId SHALL be persisted in `ai_sessions.id`. The provider‑assigned ID (when different) SHALL be persisted in `ai_sessions.provider_session_id` once reconciled, and a push event `ai-session:reconciled { sessionId, providerSessionId }` SHALL fire.
- **Resume is always addressable by canonical `sessionId`** — `ai-session:resume({ sessionId })` looks up the row, retrieves the provider‑specific resume token (`provider_session_id` for Copilot, equal to `id` for Claude), and passes `--resume <token>` to the CLI. Callers never need to know the provider asymmetry.
- **Idempotent reconnect**: calling create with a `sessionId` that already exists for the same `repoPath` + `worktreePath` is treated as resume, not as duplicate create.

**Other changes**

1. **`--fork-session`** — new "Fork conversation" action on the session sidebar. Generates a fresh canonical `sessionId` for the child (or accepts one from the caller), passes `--resume <parent> --fork-session`.
2. **`-n/--name`** — store `title` as the session name and pass it, so `claude --resume <name>` works from the user's own terminal on the host.
3. **`--continue`** — explicit "Continue" action for the most recent cwd‑local conversation. Useful when a user Claude‑ran outside Magenta and wants to pick up inside it.
4. **`--from-pr`** — when a Magenta task is linked to a PR, surface a "Resume Claude from this PR" button.
5. **Copilot `--continue`** mirrored.
6. **Resume failure handling** — when the CLI rejects a `--resume <token>` (session expired, file missing), retry once without the resume flag and fire `ai-session:event { kind: "resume-fallback", reason }` so the UI can warn the user that a fresh thread was started.

**Verify:** `tsc` · vitest session lifecycle tests (create with caller ID, create without, idempotent reconnect, resume after daemon restart, fork) · build clean.

---

### Phase 6 — Subagents, custom agents, skills, plugins

**Goal:** Expose the "agent inside an agent" capabilities Anthropic and GitHub have both shipped.

**Changes**

1. **Claude `--agents '<json>'`** — Magenta tasks can carry a subagents manifest (`spec/agents.json`). Daemon marshals it to the flag.
2. **Claude `--agent <name>`** — surface "Run with agent:" dropdown, populated from `claude agents` output (new daemon command that just exec's and parses).
3. **Claude `--plugin-dir`** — Settings → Plugins panel with add/remove; pass each as `--plugin-dir`.
4. **Copilot built‑in agents** — first‑class "Review", "Explore", "Research", "Task" buttons that prepend the appropriate `/agent <name>` or `/review` directive to the user's prompt.
5. **Copilot `--enable-all-github-mcp-tools`** — a toggle on tasks that need GitHub MCP access.

**Verify:** `tsc` · fixture manifest tests · build clean.

---

### Phase 7 — Observability & debugging

**Goal:** Make runs legible. Surface retries, errors, and costs.

**Changes**

1. **`system/api_retry` events** → new push `ai-session:retry` (`{attempt, maxRetries, delayMs, category, status}`). Render as a subtle spinner label: "retrying (2/8) after rate limit — 3.0s".
2. **`system/init` events** → fill out session metadata panel (model used, tool list, MCP servers actually loaded, plugin load errors).
3. **`system/plugin_install`** → progress toast while `CLAUDE_CODE_SYNC_PLUGIN_INSTALL=1` plugin install runs.
4. **`--debug-file`** — per‑session debug log tab, configurable by level (`api,hooks,statsig` categories).
5. **Token / cost accounting** — stream‑json final `result` event carries usage; persist to `ai_sessions.total_input_tokens`, `total_output_tokens`, `total_cost_usd` (migration 15).
6. **Copilot OTel env vars** — opt‑in observability; doc the env knobs, no UI surface yet.

**Verify:** `tsc` · unit tests for event parsers · build clean.

---

## 5. Data‑model changes summary

| Migration | Change |
|---|---|
| 13 | `working_dirs.prompt_templates_path TEXT` |
| 14 | `working_dirs.mcp_config_json TEXT` (per‑working‑dir default MCP config) |
| 15 | `ai_sessions.total_input_tokens`, `total_output_tokens`, `total_cost_usd`, `retry_count` |
| 16 | `ai_sessions.parent_session_id` (for `--fork-session`) |
| 17 | `task_spawn_presets` table: `id, name, provider, spawn_options_json` — reusable spawn presets |

**Existing columns relied on by Phase 5 (no migration; already present)**

- `ai_sessions.id` — canonical Magenta session UUID. Source of truth for the UI's "conversation handle". Equal to `--session-id` for Claude, equal to Magenta's own UUID for Copilot.
- `ai_sessions.provider_session_id` — provider‑assigned UUID. Equal to `id` for Claude. For Copilot, populated post‑spawn by the disk reconciler. Used as the `--resume` token at resume time. NULL between create and first reconcile.

Per `project_db_role.md`, SQLite is a cache; all these are rebuildable from the CLIs' own session files on disk. The schema additions are denormalized accelerators, not source of truth.

---

## 6. IPC surface changes summary

**New requests**
- `ai:run-once` — headless, typed spawn
- `ai-session:fork` — `{sessionId, spawn?}`
- `ai-session:permission-response` — `{sessionId, allow, scope}` (pairs with push below)
- `ai:list-agents` — proxies `claude agents` / Copilot built‑ins
- `ai:presets:list | create | update | delete`

**New push events**
- `ai-session:event` — typed stream‑json event union
- `ai-session:retry` — api_retry surfaced
- `ai-session:init` — model/tool/mcp metadata
- `ai-session:permission-request` — approval dialog fodder
- `ai-session:cost-update` — rolling token/dollar counts

**Update `ResponseForRequest`** in `packages/ui/src/renderer/services/ipcClient.ts` per CLAUDE.md's 5‑file checklist.

---

## 7. Per‑provider adapter matrix (Phase 1 output)

A sketch of how `toArgv()` translates `AISpawnOptions` for each provider. Unsupported options log a warning (visible with `--debug` daemon flag) and are skipped.

| Option | Claude argv | Copilot argv |
|---|---|---|
| `outputFormat` | `--output-format <v>` | `--output-format json` (only "json" supported) |
| `jsonSchema` | `--json-schema '<json>'` | ⚠️ unsupported |
| `silent` | ⚠️ unsupported | `-s` |
| `model` | `--model <v>` | `--model <v>` (or env `COPILOT_MODEL`) |
| `fallbackModel` | `--fallback-model <v>` | ⚠️ unsupported |
| `effort` | `--effort <v>` | ⚠️ unsupported |
| `maxTurns` | `--max-turns <v>` | ⚠️ unsupported |
| `maxBudgetUsd` | `--max-budget-usd <v>` | ⚠️ unsupported |
| `maxAutopilotContinues` | ⚠️ unsupported | `--max-autopilot-continues <v>` |
| `systemPrompt` | `--system-prompt <v>` | ⚠️ unsupported (use custom instructions dir) |
| `appendSystemPrompt` | `--append-system-prompt <v>` | ⚠️ unsupported |
| `allowedTools` | `--allowedTools <csv>` | `--allow-tool '<pattern>'` per entry |
| `disallowedTools` | `--disallowedTools <csv>` | `--deny-tool '<pattern>'` per entry |
| `allowUrls` | ⚠️ unsupported | `--allow-url <v>` per entry |
| `permissionMode` | `--permission-mode <v>` | maps `default→nothing`, `auto→--autopilot --yolo`, `bypassPermissions→--allow-all`; others unsupported |
| `permissionPromptTool` | `--permission-prompt-tool <v>` | ⚠️ unsupported |
| `noAskUser` | ⚠️ unsupported | `--no-ask-user` |
| `mcpConfig` | `--mcp-config <path\|json>` | `--additional-mcp-config <path>` |
| `strictMcpConfig` | `--strict-mcp-config` | ⚠️ unsupported |
| `enableAllGithubMcpTools` | ⚠️ unsupported | `--enable-all-github-mcp-tools` |
| `agents` | `--agents '<json>'` | ⚠️ unsupported (use config files) |
| `agent` | `--agent <v>` | prepend `/agent <v>` to prompt |
| `pluginDirs` | `--plugin-dir <p>` per entry | ⚠️ unsupported |
| `settings` | `--settings <v>` | ⚠️ unsupported (config file cascade) |
| `sessionId` | `--session-id <uuid>` (canonical = provider ID) | stored as canonical Magenta ID; provider ID reconciled post‑spawn into `provider_session_id` and surfaced via `ai-session:reconciled` push event |
| `resumeSessionId` | `--resume <id>` (canonical) | `--resume=<provider_session_id>` (looked up from canonical) |
| `continueRecent` | `-c` | `--continue` |
| `forkSession` | `--fork-session` | ⚠️ unsupported |
| `sessionName` | `-n <v>` | ⚠️ unsupported |
| `fromPR` | `--from-pr <v>` | ⚠️ unsupported |
| `bare` | `--bare` | ⚠️ unsupported |
| `additionalDirs` | `--add-dir <p>` per entry | `--add-dir <p>` per entry |
| `includePartialMessages` | `--include-partial-messages` | ⚠️ unsupported |
| `includeHookEvents` | `--include-hook-events` | ⚠️ unsupported |
| `debugFile` | `--debug-file <path>` | ⚠️ unsupported |

---

## 8. Verification strategy

Per `feedback_verification.md`, verification stops at **typecheck + build** — do not launch the app. For each phase:

1. `pnpm -w typecheck` clean (all four packages)
2. `pnpm -w build` clean
3. `pnpm vitest run` — new unit tests:
   - Phase 1: `providers/toArgv.test.ts` — one table‑driven test per option × provider
   - Phase 2: `streamJsonParser.test.ts` — fixture files in `__fixtures__/streamjson/`
   - Phase 3: `mcpConfigResolver.test.ts` — precedence rules
   - Phase 4: `permissionPresets.test.ts` — cross‑provider translation
   - Phase 5: `sessionLifecycle.test.ts` — create + fork + resume flow with mocked gateway
   - Phase 6: `agentsManifest.test.ts` — schema parsing
   - Phase 7: `apiRetryEvent.test.ts`, `costAccounting.test.ts`
4. New IPC variants — Zod round‑trip tests in `packages/shared/src/ipc.test.ts`
5. User does manual E2E per the project's convention.

**Out of scope for tests:** PTY‑level integration tests. Covered by the user's manual pass.

---

## 9. Out of scope / deferred

- **ACP server integration** (Copilot `acp-server`). Worth a follow‑up research spike — potentially a cleaner protocol than PTY wrapping, but requires a protocol implementation on our side.
- **Native `claude --worktree`** — we already manage worktrees via `GitGateway`; adopting Claude's native flag would mean giving up our ability to use worktrees for Copilot runs.
- **Claude `--remote` / `--teleport` / `--remote-control`** — these are cloud‑session features that don't match Magenta's local‑first model.
- **Channels / `--channels`** — research preview, evaluate after GA.
- **Copilot hooks authoring UI** — phase 7 surfaces observability of hook events (Claude `--include-hook-events`); a full hooks authoring UI is a separate initiative.

---

## 10. Rollout order & effort estimate

Each phase is independent once Phase 1 lands. Rough estimate (solo engineer):

| Phase | Effort | Blocks |
|---|---|---|
| 1. Foundation (SpawnOptions + toArgv) | 2–3 days | all others |
| 2. Programmatic primitives + stream parser | 3–4 days | Phases 3, 7 |
| 3. Structured context (bare/system/MCP) | 3 days | — |
| 4. Tool/permission granularity | 2–3 days | — |
| 5. Session lifecycle polish | 2 days | — |
| 6. Subagents/skills/plugins | 3 days | Phase 1 |
| 7. Observability | 2 days | Phase 2 (stream parser) |

Total: ~17–20 engineer‑days. Phases 1 + 2 alone (~5–7 days) deliver the bulk of the capability and unlock the rest.

---

## Appendix — source URLs (fetched 2026-04-24)

- Claude Code CLI reference: https://code.claude.com/docs/en/cli-reference
- Claude Code headless / programmatic: https://code.claude.com/docs/en/headless
- Copilot CLI programmatic reference: https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-programmatic-reference
- Copilot CLI command reference: https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference
- Copilot CLI programmatic how‑to: https://docs.github.com/en/copilot/how-tos/copilot-cli/automate-copilot-cli/run-cli-programmatically
