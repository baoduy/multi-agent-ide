# Spec: Unified AI CLI Integration (Claude Code + Copilot)

**Status:** Draft
**Author:** Steven
**Created:** 2026-04-24
**Related plan:** [`supers/plans/2026-04-24-cli-programmatic-improvements.md`](../plans/2026-04-24-cli-programmatic-improvements.md)
**Area:** AI Terminal · Provider Registry · Spec → Task dispatch

---

## 1. Summary

Magenta IDE dispatches work to AI coding agents (Claude Code, GitHub Copilot CLI) through PTY sessions today. The integration is functional for interactive chat but only exercises a small fraction of each CLI's programmatic surface. This spec defines a **single unified interface** the rest of the application uses to launch, monitor, control, and consume output from any supported AI CLI, with provider differences hidden behind a typed capability layer.

The goal is that every Magenta feature — the Kanban dispatch panel, the spec‑review pane, the PR workflow, future batch‑automation tools — speaks one vocabulary. Adding a new provider (Gemini, Aider, direct Agent SDK) becomes a pure addition at the adapter layer with zero call‑site churn.

## 2. Background

- The Spec → Plan → Task → Implement → Review pipeline depends on agents running in worktrees. Dispatch currently hard‑codes provider choice at many call sites.
- Each CLI has shipped significant programmatic features (Claude: `--bare`, `--json-schema`, `--max-turns`, `--max-budget-usd`, `--fork-session`, `--agents`, `stream-json`; Copilot: `--silent`, `--allow-tool` pattern syntax, `--no-ask-user`, `--share`, `/review` agents) that Magenta does not use.
- Provider divergence is real (different flag names, different tool allow syntax, different permission vocabularies, different output formats). A thin abstraction that papers over intent while preserving escape hatches is required.

## 3. Goals

- **G1.** One typed IPC surface for every AI CLI interaction the UI initiates — creation, input, streaming output, resume, fork, stop, and one‑shot runs.
- **G2.** Provider‑neutral vocabulary at the call site. No component outside the provider adapter layer names a specific CLI or flag.
- **G3.** Capability‑aware UI. Controls for features the selected provider cannot honour are disabled with a human‑readable reason.
- **G4.** Reusable presets (read‑only review, commit‑and‑push, test‑and‑fix, etc.) that translate themselves across providers.
- **G5.** Deterministic, reproducible runs for programmatic callers (bare mode, explicit session IDs, MCP/plugin/system‑prompt files passed explicitly).
- **G6.** Structured observability: typed stream events for init, retries, tool use, permission requests, token/cost accounting, plugin installs.
- **G7.** Escape hatch for power users (raw argv passthrough) so unmodeled flags never block adoption.

## 4. Non‑goals

- **NG1.** Implementing a Claude Agent SDK wrapper or bypassing the `claude` binary. CLIs remain the integration point.
- **NG2.** Supporting Copilot's `acp-server` transport in this iteration (evaluate separately).
- **NG3.** Building a hooks‑authoring UI. We surface hook lifecycle events; authoring stays in the user's own config files.
- **NG4.** Replacing our worktree management with `claude --worktree`. Worktrees stay a Magenta concern so both providers benefit.
- **NG5.** Claude `--remote` / `--teleport` / `--remote-control` cloud session modes.

## 5. Users and use cases

### 5.1 Personas

- **Dispatcher (Steven / developer)** — drags a Task card to "In progress", picks an agent, watches it work, intervenes when needed.
- **Reviewer** — opens a spec or PR diff, asks an agent for a scripted review, expects structured output (issue list, severity, file, line).
- **Automation author** — writes Magenta automation (e.g., "when a spec is approved, auto‑generate tasks") that launches agents programmatically without a UI.
- **Power user** — needs a flag Magenta doesn't yet model; shouldn't have to wait for a release.

### 5.2 User stories

- **US‑1** *As a dispatcher,* I want to pick "Claude" or "Copilot" per task with the same set of knobs available in the UI, so I can compare outputs without re‑learning each CLI.
- **US‑2** *As a dispatcher,* I want to cap runs by turn count and dollar spend, so runaway agents can't burn my budget overnight.
- **US‑3** *As a dispatcher,* I want to pick a preset ("read‑only review"), and have the right tool allow list applied regardless of provider.
- **US‑4** *As a reviewer,* I want structured JSON output for a spec review that conforms to a schema, so I can render issues directly on the spec editor without parsing prose.
- **US‑5** *As a reviewer,* I want to fork a conversation and explore a counter‑proposal, without losing the original thread.
- **US‑6** *As an automation author,* I want to call `ai:run-once` from a script with a typed spawn‑options object, and receive a typed result with usage and cost.
- **US‑7** *As an automation author,* I want runs to be reproducible across machines: bare mode + explicit MCP config + explicit system prompt file, with no dependence on `~/.claude` or `~/.copilot` state.
- **US‑8** *As a dispatcher,* when the agent pauses for a permission prompt, I want a Magenta dialog to appear (not a PTY text prompt), so I can approve or reject with full context.
- **US‑9** *As a dispatcher,* I want to see live retry activity ("retrying after rate limit — 3s"), so I know the agent is alive.
- **US‑10** *As a power user,* I want to pass one extra flag the UI doesn't expose yet, so I'm never blocked on a missing form field.
- **US‑11** *As a dispatcher,* I want to resume a specific historical session by UUID from the sidebar, and optionally fork from that point, so I can pick up mid‑thread work safely.
- **US‑12** *As an automation author,* I want the same event shape from both providers, so my consumer code is provider‑agnostic.

## 6. Functional requirements

Each requirement is numbered for traceability to acceptance tests.

### 6.1 Unified spawn schema

- **FR‑1.1** The system SHALL define a single zod schema `AISpawnOptions` in `packages/shared` covering every flag either supported CLI accepts today.
- **FR‑1.2** The system SHALL reject unknown keys (`.strict()`) and validate every field.
- **FR‑1.3** The system SHALL provide `extraArgs?: string[]` as an escape hatch appended verbatim to the final argv.
- **FR‑1.4** The system SHALL version the schema (`spawnOptionsSchemaVersion`) so migrations can be detected.

### 6.2 Capability manifest

- **FR‑2.1** Each provider SHALL publish a `ProviderCapability` manifest listing which `AISpawnOptions` fields it supports, plus provider‑specific tool‑allow syntax.
- **FR‑2.2** The IPC request `ai:providers` SHALL return all manifests; the renderer MUST use them to drive UI enable/disable state.
- **FR‑2.3** If a call specifies an option the selected provider cannot honour, the daemon SHALL respond with `AppError("UNSUPPORTED_SPAWN_OPTION", …)` carrying the offending field name and provider.

### 6.3 Intent and preset layers

- **FR‑3.1** The system SHALL define `AITaskIntent` — a discriminated union of at least: `one-shot`, `interactive`, `code-review`, `implement-spec`, `resume`, `fork`, `continue-recent`.
- **FR‑3.2** A pure function `intentToSpawn(intent, provider, preset?)` SHALL produce `AISpawnOptions`. It MUST be side‑effect free and live in `packages/daemon/src/domain/`.
- **FR‑3.3** At least four built‑in presets SHALL ship: `read-only-review`, `commit-and-push`, `test-and-fix`, `docs-only`. Each preset SHALL define allow/deny lists for both providers.

### 6.4 Provider argv translation

- **FR‑4.1** Each provider SHALL implement `toArgv(opts: AISpawnOptions, caps: ProviderCapability): string[]` as a pure function.
- **FR‑4.2** Unsupported options in `toArgv` SHALL NOT throw in internal callers; they SHALL be recorded in a debug warning sink when the daemon debug flag is on.
- **FR‑4.3** `toArgv` SHALL be called from exactly two places: `AiCliGateway.runOnce` and `BaseAISession.buildSpawnArgv`. No other call site assembles argv.

### 6.5 Unified output event stream

- **FR‑5.1** The system SHALL define `AIStreamEvent` — a discriminated union with at minimum: `session-init`, `assistant-text`, `assistant-think`, `tool-use`, `tool-result`, `permission-request`, `retry`, `result`, `raw-pty`.
- **FR‑5.2** Events MUST include `{sessionId, seq, timestamp}` on every variant.
- **FR‑5.3** For sessions launched with a structured output format, the parser SHALL translate provider‑specific events to `AIStreamEvent`; it SHALL fall back to `raw-pty` frames when structured output is unavailable.
- **FR‑5.4** Consumers of `AIStreamEvent` MUST NOT need to know which provider produced the event.

### 6.6 Programmatic one‑shot endpoint

- **FR‑6.1** A new IPC request `ai:run-once` SHALL accept `{provider, repoPath, worktreePath?, prompt, spawn, timeoutMs?}` and return `{exitCode, stdout?, stderr?, sessionId?, tokenUsage?, costUsd?, retries, events?}`.
- **FR‑6.2** When `spawn.outputFormat === "json"` and `spawn.jsonSchema` is set, the response SHALL include the validated `structuredOutput` object.
- **FR‑6.3** On timeout, the daemon SHALL emit `AppError("AI_TIMEOUT", …)`; on budget/turn exceeded, `AppError("AI_BUDGET_EXCEEDED" | "AI_TURN_LIMIT", …)` with usage attached.

### 6.7 Session lifecycle

#### 6.7.1 Caller‑provided session IDs (round‑trip contract)

- **FR‑7.1** Both `ai-session:create` and `ai:run-once` SHALL accept an optional `sessionId: string (UUID v4)` field on the request.
  - **FR‑7.1.a** When the caller provides a `sessionId`, the daemon SHALL use it as the canonical Magenta session identifier; it SHALL NOT generate its own.
  - **FR‑7.1.b** When the caller does **not** provide a `sessionId`, the daemon SHALL generate a UUID v4 and use it as the canonical Magenta session identifier.
  - **FR‑7.1.c** When the selected provider supports `--session-id` (Claude), the daemon SHALL pass the canonical sessionId to the CLI via `--session-id <uuid>` so the provider's own session file shares the same UUID from turn zero.
  - **FR‑7.1.d** When the selected provider does **not** support `--session-id` (Copilot today), the daemon SHALL still treat the canonical sessionId as the row's stable handle, and SHALL reconcile the provider‑assigned UUID into a separate `providerSessionId` field via the existing disk‑scan mechanism.
  - **FR‑7.1.e** The `ai-session:create` and `ai:run-once` responses SHALL include the canonical `sessionId` synchronously, regardless of provider.
- **FR‑7.2** Resuming SHALL be addressable by canonical `sessionId` only.
  - **FR‑7.2.a** `ai-session:resume({sessionId})` SHALL look up the row, retrieve the provider‑specific resume token (`providerSessionId` for Copilot, identical to `sessionId` for Claude), and pass `--resume <token>` to the CLI.
  - **FR‑7.2.b** Callers MUST NOT need to know whether the provider supports `--session-id` — the same `sessionId` they received from create SHALL be sufficient to resume later.
  - **FR‑7.2.c** Resuming with a `sessionId` whose row exists but whose `providerSessionId` has not yet been reconciled (Copilot, post‑create but pre‑first‑turn) SHALL block until reconciliation completes or fail with `AppError("AI_RESUME_PENDING_RECONCILIATION", ...)` after a configurable timeout (default 5s).
- **FR‑7.3** When the caller provides a `sessionId` that already exists in `ai_sessions` for the same `repoPath` + `worktreePath`, the daemon SHALL treat the request as an implicit resume instead of a create — equivalent to `ai-session:resume({sessionId})` — so UI reconnects after a transient disconnect are idempotent.
- **FR‑7.4** A successful create SHALL emit a push event `ai-session:reconciled` carrying `{sessionId, providerSessionId}` once the provider‑assigned ID is known. For Claude this fires immediately on the `system/init` event; for Copilot it fires when the disk scan resolves the workspace folder. UI consumers MAY use this to confirm the session is durable on disk and resumable across daemon restarts.

#### 6.7.2 Persistence and durability

- **FR‑7.5** The canonical `sessionId` and (when known) `providerSessionId` SHALL be persisted in the `ai_sessions` table on every create and reconcile event, so sessions remain resumable after a daemon restart, an Electron quit, or a host reboot.
- **FR‑7.6** `ai-session:list` SHALL return rows whose `providerSessionId` is still present in the provider's session store on disk, marking those that are not as `resumable: false` so the UI can disable the resume action.

#### 6.7.3 Forks, names, and PR linkage

- **FR‑7.7** A `ai-session:fork` IPC request SHALL create a new session resuming from a parent `sessionId` with `--fork-session` (or equivalent), generating a fresh canonical `sessionId` for the child unless the caller provides one.
- **FR‑7.8** `ai-session:create` SHALL accept a human‑readable `name`; the daemon SHALL pass `-n` when the provider supports it.
- **FR‑7.9** `ai-session:create` SHALL accept `resumeFromPR: string` and pass `--from-pr` when supported.
- **FR‑7.10** When a resume fails (CLI session file absent, expired, or the provider rejects the ID), the daemon SHALL retry once without the resume flag and surface a typed `ai-session:event { kind: "resume-fallback", reason }` warning event so the UI can warn the user that a new conversation thread was started.

### 6.8 Tool and permission granularity

- **FR‑8.1** Every session‑creating IPC path SHALL accept `allowedTools`, `disallowedTools`, `permissionMode`, and (Copilot) `allowUrls`.
- **FR‑8.2** A "permission prompt tool" SHALL be registered as an MCP server by the daemon; when the run specifies `permissionPromptTool`, Magenta's UI SHALL render a typed approval dialog bound to push event `ai-session:permission-request` and request `ai-session:permission-response`.
- **FR‑8.3** The preset translator SHALL correctly map between Claude `Bash(prefix *)` and Copilot `shell(prefix:*)` syntaxes with a round‑trip unit test covering all built‑in presets.

### 6.9 Reproducibility

- **FR‑9.1** When `spawn.bare === true` (Claude), the daemon SHALL pass `--bare`.
- **FR‑9.2** When `spawn.mcpConfig` is present, the daemon SHALL materialize it (string or object) to a temp file and pass `--mcp-config`/`--additional-mcp-config`. When `strictMcpConfig` is true, it SHALL also pass `--strict-mcp-config`.
- **FR‑9.3** When `spawn.systemPromptFile` is present, the daemon SHALL pass the corresponding flag for the provider, failing fast if the file is missing.
- **FR‑9.4** Per‑working‑directory defaults (prompts path, MCP config path) SHALL be stored in `working_dirs` table rows and merged into `spawn` with explicit fields overriding the defaults.

### 6.10 Observability

- **FR‑10.1** Claude stream events `system/api_retry`, `system/init`, `system/plugin_install` SHALL be parsed into `AIStreamEvent` and emitted as push events.
- **FR‑10.2** Token usage and estimated cost SHALL be captured from the final `result` stream event and persisted on `ai_sessions` rows.
- **FR‑10.3** Retries SHALL increment a per‑session counter exposed on `ai_sessions` rows.
- **FR‑10.4** The daemon SHALL support `spawn.debugFile` for per‑session debug logs when the provider supports it.

### 6.11 Backwards compatibility

- **FR‑11.1** Existing IPC requests (`ai-session:create`, `ai-session:resume`, `ai-session:input`, etc.) SHALL continue to accept their current payload shapes. New fields SHALL be optional and additive.
- **FR‑11.2** Sessions created before this change SHALL remain resumable.
- **FR‑11.3** The existing `synced_sessions` table SHALL continue to hydrate from `~/.claude` / `~/.copilot` regardless of how the session was originally created.

## 7. Non‑functional requirements

- **NFR‑1.** Type safety: `tsc --noEmit` clean after each phase across all packages.
- **NFR‑2.** Test coverage: ≥85% line coverage for `intentToSpawn`, `toArgv`, preset translator, and stream parser. Fixture files for stream‑json events checked into the repo.
- **NFR‑3.** Latency: `ai:run-once` adds ≤50ms of overhead on top of raw CLI exec time (measured over a 10‑run sample of a no‑op prompt).
- **NFR‑4.** Memory: ring buffer + event queue per session ≤16 MB steady state; older seq ranges dropped with a sliding window.
- **NFR‑5.** Extensibility: adding a third provider SHALL NOT require changes outside `packages/shared/providerCapabilities.ts`, `packages/daemon/src/domain/providerArgv/*`, and the stream parser. Verified by adding a stub `echo` provider in tests.
- **NFR‑6.** Determinism: the same `AITaskIntent` + `AISpawnOptions` + provider SHALL produce the same argv on every invocation. Asserted by a snapshot test.
- **NFR‑7.** Security: secrets (API keys, GitHub tokens) MUST NOT be passed on the command line; they MUST go via env vars or files passed by path.
- **NFR‑8.** Error taxonomy: every daemon failure SHALL carry a known `AppErrorCode` documented in `AppError.ts`; renderer SHALL render a specific recovery message for each code.
- **NFR‑9.** Documentation: each new IPC variant, store action, and CLI flag wrapper SHALL have a short doc comment explaining its scope.

## 8. Interface contracts (normative)

The canonical schemas live in `packages/shared`. Summarized here:

### 8.1 `AISpawnOptions`

Defined in [the plan, §4 Phase 1](../plans/2026-04-24-cli-programmatic-improvements.md#phase-1--foundation-typed-spawnoptions--provider-adapter-refactor). Any change to the superset of fields is a schema version bump (FR‑1.4).

### 8.2 `AIStreamEvent`

```ts
type AIStreamEvent =
  | { kind: "session-init";       sessionId: string; model: string; tools: string[]; mcpServers: string[]; pluginErrors?: PluginError[] }
  | { kind: "assistant-text";     sessionId: string; seq: number; timestamp: number; text: string; partial: boolean }
  | { kind: "assistant-think";    sessionId: string; seq: number; timestamp: number; text: string }
  | { kind: "tool-use";           sessionId: string; seq: number; timestamp: number; tool: string; summary: string; id: string }
  | { kind: "tool-result";        sessionId: string; seq: number; timestamp: number; id: string; ok: boolean; summary?: string }
  | { kind: "permission-request"; sessionId: string; seq: number; timestamp: number; tool: string; scope: string; id: string }
  | { kind: "retry";              sessionId: string; seq: number; timestamp: number; attempt: number; max: number; delayMs: number; category: string; status?: number }
  | { kind: "result";             sessionId: string; seq: number; timestamp: number; ok: boolean; output?: unknown; tokenUsage?: TokenUsage; costUsd?: number }
  | { kind: "raw-pty";            sessionId: string; seq: number; timestamp: number; bytes: string };
```

### 8.3 `AITaskIntent`

Every "creating" intent kind accepts an optional `sessionId: string (UUID v4)`. When provided, it is used verbatim as the canonical session identifier (FR‑7.1.a) and — for providers that support it — passed via `--session-id`. When omitted, the daemon generates a UUID v4 (FR‑7.1.b). The `resume` and `fork` kinds reference an existing canonical `sessionId`.

```ts
type AITaskIntent =
  | { kind: "one-shot";         sessionId?: string; prompt: string; jsonSchema?: JSONSchema; overrides?: Partial<AISpawnOptions> }
  | { kind: "interactive";      sessionId?: string; initialPrompt?: string; overrides?: Partial<AISpawnOptions> }
  | { kind: "code-review";      sessionId?: string; diffRef: string; focus?: string; overrides?: Partial<AISpawnOptions> }
  | { kind: "implement-spec";   sessionId?: string; specPath: string; branch: string; overrides?: Partial<AISpawnOptions> }
  | { kind: "resume";           sessionId: string;  prompt?: string }
  | { kind: "fork";             parentSessionId: string; sessionId?: string; prompt?: string; overrides?: Partial<AISpawnOptions> }
  | { kind: "continue-recent";  sessionId?: string; prompt?: string; overrides?: Partial<AISpawnOptions> };
```

### 8.4 New / updated IPC requests

| Request | Request shape (excerpt) | Response shape (excerpt) | Notes |
|---|---|---|---|
| `ai-session:create` *(updated)* | `{ provider, repoPath, worktreePath?, sessionId?: UUID, name?, intent?, spawn?, cols?, rows? }` | `{ sessionId, providerSessionId? }` | `sessionId` from caller wins (FR‑7.1). Response always carries the canonical `sessionId`. |
| `ai-session:resume` *(updated)* | `{ sessionId, cols?, rows? }` | `{ sessionId, providerSessionId? }` | Addressable by canonical `sessionId` only (FR‑7.2). |
| `ai-session:fork` *(new)* | `{ parentSessionId, sessionId?: UUID, prompt?, overrides? }` | `{ sessionId, providerSessionId? }` | Generates canonical `sessionId` if omitted. |
| `ai:run-once` *(new)* | `{ provider, repoPath, worktreePath?, sessionId?: UUID, prompt, spawn, timeoutMs? }` | `{ sessionId, exitCode, stdout?, stderr?, structuredOutput?, tokenUsage?, costUsd?, retries, events? }` | Same `sessionId` rule. Response always carries the canonical `sessionId`. |
| `ai:providers` *(updated)* | `{}` | `ProviderCapability[]` | Reports `supportsExplicitSessionId: boolean` per provider so UI knows whether the ID round‑trip is deterministic. |
| `ai-session:permission-response` *(new)* | `{ sessionId, requestId, allow, scope? }` | `{ ok: boolean }` | Answer an active permission prompt. |
| `ai:list-agents` *(new)* | `{ provider }` | `Agent[]` | Enumerate configured subagents (`claude agents` + Copilot built‑ins). |
| `ai:presets:list \| create \| update \| delete` *(new)* | preset CRUD | preset CRUD | Preset library. |

### 8.5 New / updated IPC push events

- `ai-session:reconciled` *(new)* — `{ sessionId, providerSessionId }`. Fires when the provider‑assigned UUID is known (immediately on `system/init` for Claude, after disk scan for Copilot). Confirms the session is durable on disk.
- `ai-session:event` *(new)* — any `AIStreamEvent`
- `ai-session:permission-request` *(new)* — `{ sessionId, requestId, tool, scope }`
- `ai-session:retry` *(new)* — `{ sessionId, attempt, max, delayMs, category, status? }`
- `ai-session:cost-update` *(new)* — `{ sessionId, tokenUsage, costUsd }`

## 9. Acceptance criteria

The feature is accepted when every statement below holds:

- **AC‑1.** A typecheck‑clean sample call `runIntent({kind:"code-review", diffRef:"HEAD~1"})` works on both providers without the caller referencing provider names.
- **AC‑2.** Switching a running task's provider from Claude to Copilot and back keeps the same UI, preset, allow list, and cost display.
- **AC‑3.** Asking for `jsonSchema` on a Copilot task surfaces a `UNSUPPORTED_SPAWN_OPTION` error in the UI with a clear "Copilot does not support JSON schema output. Switch to Claude or remove the schema." message.
- **AC‑4.** A bare‑mode run on a second machine with an empty `~/.claude` produces byte‑identical argv (modulo absolute paths) and succeeds if `ANTHROPIC_API_KEY` is set.
- **AC‑5.** A fork of a session appears as a new row in the session list with `parent_session_id` set, and its UUID matches the CLI's session file on disk.
- **AC‑6.** Setting `maxTurns: 3` or `maxBudgetUsd: 0.10` on a Claude run causes the run to abort cleanly with `AppError("AI_TURN_LIMIT" | "AI_BUDGET_EXCEEDED")`; the UI renders the attached usage.
- **AC‑7.** When Claude emits a `system/api_retry`, the session badge reads "retrying (n/m) — ks" within 250 ms and clears on success.
- **AC‑8.** When Claude requests permission for an un‑allowed Bash command and `permissionPromptTool` is set, a modal dialog appears in Magenta; approval resumes the run with the specified scope.
- **AC‑9.** The `read-only-review` preset generates the expected argv for both providers, verified by a snapshot test on `toArgv`.
- **AC‑10.** Adding a stub `echo` provider requires changes only to `providerCapabilities.ts`, `domain/providerArgv/echo.ts`, and the parser — zero lines of UI, preset, or call‑site code change. Covered by test.
- **AC‑11.** After a clean install and migration, existing sessions are resumable via the same UI flow as before.
- **AC‑12.** All seven phases in the related plan each finish with `tsc`, `vitest`, and `build` clean.
- **AC‑13.** *Caller‑provided session ID round‑trip (Claude).* The UI calls `ai-session:create({ provider: "claude", sessionId: X })` for a UUID `X` it generated. The response carries `sessionId === X`. The Claude CLI session file at `~/.claude/projects/<encoded>/<X>.jsonl` exists. After PTY exit, calling `ai-session:resume({ sessionId: X })` reattaches to the same conversation history as visible in `claude --resume X` from the host shell.
- **AC‑14.** *Caller‑provided session ID round‑trip (Copilot).* The UI calls `ai-session:create({ provider: "copilot", sessionId: X })`. The response carries `sessionId === X` synchronously and `providerSessionId: null`. After the first turn completes, an `ai-session:reconciled` push event arrives with `{ sessionId: X, providerSessionId: Y }` where `Y` is the Copilot‑assigned UUID. After PTY exit, `ai-session:resume({ sessionId: X })` looks up `Y` and passes `--resume=Y` to Copilot, reattaching to the same conversation.
- **AC‑15.** *Daemon‑generated session ID.* Calling `ai-session:create` without a `sessionId` returns a freshly generated UUID v4 in the response, and that UUID is sufficient to resume the session later for both providers.
- **AC‑16.** *Idempotent reconnect.* Calling `ai-session:create({ sessionId: X, ... })` for an `X` that already exists in `ai_sessions` for the same `repoPath`+`worktreePath` returns the existing session (same response shape as resume) instead of creating a duplicate row.
- **AC‑17.** *Durability across daemon restart.* After creating a session with explicit `sessionId: X`, quitting Electron, reopening Magenta, and calling `ai-session:resume({ sessionId: X })`, the conversation history is intact and the session is fully interactive again.

## 10. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| CLI flag surface changes upstream (Claude or Copilot revs) | Med | Med | Fetch docs quarterly; treat provider argv translators as a thin, well‑tested layer; use `--version` gate in capability manifest where behavior depends on minimum version. |
| Stream‑json format drift breaks parser | Med | High | Fixture files for known events; integration smoke test that runs a tiny real prompt weekly. |
| Copilot's lack of structured output limits parity | High | Low‑Med | Document parity gaps prominently; fall back to `raw-pty` frames; consumers treat missing fields as expected. |
| Secrets exposure through `extraArgs` | Low | High | Lint/warn if `extraArgs` contains substrings resembling API keys; document the risk in the UI tooltip. |
| Two providers diverging on session‑ID semantics | Med | Med | Keep reconciliation path as fallback; never assume `--session-id` was honoured without confirming via first `session-init` event. |
| UI complexity from exposing every flag | High | Med | Default to preset‑driven UI; advanced panel gates raw flags behind a toggle. |
| Backwards compat break during migration | Low | High | Keep new fields optional; migration tests for schemas 12→current; ship a flag to fall back to pre‑unification code for one release. |

## 11. Open questions

- **OQ‑1.** Do we prefer a capability manifest per *minor version* of each CLI, or do we feature‑detect at runtime by running `--help`? (Runtime detection avoids version bumps; manifest is simpler.)
- **OQ‑2.** Should `permissionPromptTool` be always‑on, or opt‑in per task? Always‑on improves UX; opt‑in preserves the current PTY behavior for users who prefer it.
- **OQ‑3.** Where do preset libraries live on disk — bundled with the app, in the repo (`spec/presets.json`), or in the user's home? (Plan: bundled + optional per‑repo overrides.)
- **OQ‑4.** Do we model Copilot's `/review` / `/delegate` / `/fleet` built‑in agents as `intent: code-review` kinds, as `agent: "code-review"` overrides, or both?
- **OQ‑5.** Should cost accounting be authoritative (daemon holds the number and refuses runs when exceeded) or advisory (UI shows it, Claude's `--max-budget-usd` enforces)?
- **OQ‑6.** What's the policy for `extraArgs` — warn only, warn+confirm, or gate behind a developer‑mode toggle?

## 12. Dependencies

- **D‑1.** Claude Code binary reachable on `PATH` at a version ≥ 2.x that supports `--bare`, `--json-schema`, `--session-id`, `--fork-session`, `--max-turns`, `--max-budget-usd`.
- **D‑2.** Copilot CLI binary reachable on `PATH` at a version supporting `--allow-tool` pattern syntax and `--output-format=json`.
- **D‑3.** Node‑pty, simple‑git, Zod, Drizzle (already present).
- **D‑4.** SQLite migrations 13–17 (per plan §5) applied.
- **D‑5.** No new runtime packages required; TypeScript‑only work.

## 13. Out of scope

- ACP server transport for Copilot
- Claude `--remote` / `--teleport` / `--remote-control`
- `claude --worktree` native worktrees
- OpenTelemetry collector deployment (env vars wiring only)
- A hooks authoring UI
- Marketplace integration for Claude plugins / Copilot skills beyond `--plugin-dir`

## 14. Success metrics

- **SM‑1.** Fraction of AI‑integration code outside the adapter layer that references a specific provider: **target 0** (was > 30 files).
- **SM‑2.** Number of IPC variants required to cover every supported flag: **1 spawn schema + ≤8 new IPC variants** (was: N flags × M endpoints).
- **SM‑3.** Time to wire a net‑new preset end‑to‑end (both providers, UI surface, tests): **< 1 hour**.
- **SM‑4.** Time to add a third provider (new adapter only, no call‑site changes): **< 1 engineer‑day**.
- **SM‑5.** User‑visible "unsupported flag" errors in the first month post‑ship: **< 5 per week** across beta users (indicates capability matrix is correct).

## 15. Rollout

Phased per the related plan. Each phase is independently shippable behind no feature flag — upper layers consume new fields as they become available and ignore them otherwise. A breaking change to `AISpawnOptions` would require a `spawnOptionsSchemaVersion` bump and a coordinated renderer + daemon release.

---

## Appendix A — Traceability matrix

| User story | Functional requirement(s) | Acceptance criteria |
|---|---|---|
| US‑1 | FR‑1, FR‑2, FR‑3 | AC‑1, AC‑2 |
| US‑2 | FR‑1, FR‑6.3, FR‑10.2 | AC‑6 |
| US‑3 | FR‑3, FR‑8.3 | AC‑9 |
| US‑4 | FR‑6.1, FR‑6.2 | AC‑1 |
| US‑5 | FR‑7.2 | AC‑5 |
| US‑6 | FR‑6.1 | AC‑1, AC‑6 |
| US‑7 | FR‑9 | AC‑4 |
| US‑8 | FR‑8.2, FR‑5.1 | AC‑8 |
| US‑9 | FR‑10.1, FR‑5.1 | AC‑7 |
| US‑10 | FR‑1.3 | (manual) |
| US‑11 | FR‑7.1–7.10 | AC‑5, AC‑11, AC‑13, AC‑14, AC‑15, AC‑16, AC‑17 |
| US‑12 | FR‑5.4 | AC‑1, AC‑10 |

## Appendix B — Glossary

- **Adapter** — the per‑provider pure‑function module that knows how to translate `AISpawnOptions` to argv and parse CLI output into `AIStreamEvent`.
- **Capability manifest** — a static object per provider listing which `AISpawnOptions` fields it honours.
- **Intent** — a high‑level verb (e.g. "code‑review") that the caller expresses; lowered to `AISpawnOptions` by `intentToSpawn`.
- **Preset** — a named partial `AISpawnOptions` with both‑provider translations, typically baking in a tool allow list.
- **Bare mode** — a Claude Code flag that skips auto‑discovery of local config (`~/.claude`, plugins, hooks, CLAUDE.md) so runs are reproducible across machines.
- **Fork session** — creating a new session ID that resumes from a parent's state without mutating the parent.
- **Permission prompt tool** — an MCP tool that intercepts Claude's permission prompts and routes them through a custom UI (here: Magenta's approval dialog).
