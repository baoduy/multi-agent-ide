# Phase 2 — `ai:run-once` IPC + Claude stream-json parser Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose every one-shot capability of each provider through a single typed IPC request `ai:run-once`, and translate Claude `stream-json` events into a typed `AIStreamEvent` discriminated union pushed over a new `ai-session:event` push channel. Caps (`maxTurns`, `maxBudgetUsd`) raise typed `AppError`s; unsupported `AISpawnOptions` for the chosen provider raise `AppError("UNSUPPORTED_SPAWN_OPTION", …)` at the IPC boundary; Copilot one-shot runs gain `--silent` and `--output-format json`.

**Architecture:** Phase 1 produced pure `toArgv` adapters and an `AISpawnOptions` schema. Phase 2 layers on top of that: IPC schema (`shared`) → application service `AIRunOnceApplicationService` (`daemon/application`) → consumes `AiCliGateway.runOnceWithSpawn` (new method, thin wrapper over Phase 1's pure pipeline) and the new domain `streamJsonParser`. The parser is a **pure** `feedLine(state, line) => { state, events }` reducer — no I/O, no timers — fixture-tested against `*.jsonl` files. The application service owns the streaming/exit lifecycle, surfaces parser events as `AIStreamEvent`s on `ai-session:event`, and tallies `tokenUsage` / `costUsd` / `retriesSeen` for the response. Validation of unsupported options happens at the IPC handler boundary using the Phase 1 `ProviderCapability` manifest.

**Tech Stack:** TypeScript 5.x · Zod 3.x · Vitest · pnpm workspace · Node `child_process.spawn` (already a dependency of `AiCliGateway`).

**Spec references:**
- `specs/2026-04-24-cli-programmatic-improvements.md` §4 Phase 2 (changes 1–6)
- `specs/2026-04-24-unified-ai-cli-interface.md` FR-5.1–5.4 (`AIStreamEvent`), FR-6.1–6.3 (`ai:run-once`), §8.2, §8.4, AC-6
- `supers/plans/2026-04-25-phase1-spawn-options-foundation.md` (pre-requisite — assumed shipped)

**Out of scope for this phase:**
- Preset library (`ai:presets:*`) — Phase 4.
- `--bare` invocation in product code paths and per-working-dir MCP/system-prompt materialization — Phase 3.
- `--session-id` round-trip and `ai-session:fork` — Phase 5.
- `permissionPromptTool` MCP server registration & approval dialog — Phase 4.
- Persisting cost/token usage to `ai_sessions` rows (migration 15) — Phase 7.
- UI surfaces (Kanban "Run task programmatically" dialog). Phase 2 adds only the IPC; UI work is tracked as a follow-up.

---

## File structure

| Action | Path | Responsibility |
|---|---|---|
| Create | `packages/shared/src/aiStreamEvent.ts` | `AIStreamEvent` zod discriminated union + `TokenUsage` + `PluginError`. |
| Create | `packages/shared/src/aiStreamEvent.test.ts` | Schema round-trip tests. |
| Modify | `packages/shared/src/aiTerminal.ts` | Re-export `AIStreamEvent`, `TokenUsage`. |
| Modify | `packages/shared/src/ipc.ts` | Add `ai:run-once` request, `ai:run-once:result` response, `ai-session:event` push. |
| Modify | `packages/daemon/src/errors/AppError.ts` | Add `AI_BUDGET_EXCEEDED`, `AI_TURN_LIMIT`, `UNSUPPORTED_SPAWN_OPTION` error codes. |
| Create | `packages/daemon/src/domain/streamJsonParser.ts` | Pure parser: `createParserState()`, `feedLine(state, line)`, `flush(state)`. |
| Create | `packages/daemon/src/domain/__fixtures__/streamjson/system-init.jsonl` | Fixture: a `system/init` event. |
| Create | `packages/daemon/src/domain/__fixtures__/streamjson/system-plugin-install.jsonl` | Fixture: plugin install lifecycle. |
| Create | `packages/daemon/src/domain/__fixtures__/streamjson/system-api-retry.jsonl` | Fixture: api retry attempts. |
| Create | `packages/daemon/src/domain/__fixtures__/streamjson/assistant-blocks.jsonl` | Fixture: text + thinking + tool_use. |
| Create | `packages/daemon/src/domain/__fixtures__/streamjson/user-tool-result.jsonl` | Fixture: user tool_result. |
| Create | `packages/daemon/src/domain/__fixtures__/streamjson/result-success.jsonl` | Fixture: terminating result with usage + cost. |
| Create | `packages/daemon/src/domain/__fixtures__/streamjson/result-budget-exceeded.jsonl` | Fixture: result with `subtype: "error_max_budget"`. |
| Create | `packages/daemon/src/domain/__fixtures__/streamjson/result-turn-limit.jsonl` | Fixture: result with `subtype: "error_max_turns"`. |
| Create | `packages/daemon/src/domain/streamJsonParser.test.ts` | Fixture-driven tests. |
| Modify | `packages/daemon/src/infrastructure/AiCliGateway.ts` | Add `runOnceWithSpawn(provider, prompt, spawn, hooks)` returning `{stdout, stderr, exitCode, retriesSeen}` and forwarding parser events. |
| Create | `packages/daemon/src/application/AIRunOnceApplicationService.ts` | Orchestrates: validate via capability manifest → spawn → stream → translate caps errors → return typed result. |
| Create | `packages/daemon/src/application/AIRunOnceApplicationService.test.ts` | Application-level tests with mocked gateway. |
| Create | `packages/daemon/src/ipc/handlers/aiRunOnceHandlers.ts` | Thin `safeHandle` for `ai:run-once`. |
| Modify | `packages/daemon/src/ipc/registerHandlers.ts` | Wire `AIRunOnceApplicationService` and the handler. |
| Modify | `packages/daemon/src/DaemonContainer.ts` | Construct `AIRunOnceApplicationService`. |
| Modify | `packages/ui/src/renderer/services/ipcClient.ts` | Add `ai:run-once` to `ResponseForRequest`. |
| Modify | `packages/daemon/src/application/AiEditApplicationService.ts` | Route chat methods (`ask`, `editSelection`, `modifyDocument`) through `AIRunOnceApplicationService` instead of calling `AiCliGateway.run()` directly. |
| Create | `packages/daemon/src/application/AiEditApplicationService.test.ts` | Vitest spec asserting the three chat methods invoke `AIRunOnceApplicationService.runOnce` with the expected `AISpawnOptions` shape. |

---

## Task 1: Add `AIStreamEvent` schema in shared

**Files:**
- Create: `packages/shared/src/aiStreamEvent.ts`
- Create: `packages/shared/src/aiStreamEvent.test.ts`
- Modify: `packages/shared/src/aiTerminal.ts`

- [ ] **Step 1: Write the failing schema test**

```ts
// packages/shared/src/aiStreamEvent.test.ts
import { describe, it, expect } from "vitest";
import { AIStreamEventSchema, TokenUsageSchema } from "./aiStreamEvent";

describe("AIStreamEvent", () => {
  it("accepts session-init", () => {
    const ev = {
      kind: "session-init" as const,
      sessionId: "s1",
      seq: 0,
      timestamp: 1000,
      model: "claude-sonnet-4-6",
      tools: ["Read", "Edit"],
      mcpServers: ["github"],
      pluginErrors: [],
    };
    expect(AIStreamEventSchema.parse(ev)).toEqual(ev);
  });

  it("accepts assistant-text with partial flag", () => {
    const ev = {
      kind: "assistant-text" as const,
      sessionId: "s1",
      seq: 1,
      timestamp: 1001,
      text: "hello",
      partial: true,
    };
    expect(AIStreamEventSchema.parse(ev)).toEqual(ev);
  });

  it("accepts assistant-think", () => {
    expect(
      AIStreamEventSchema.parse({
        kind: "assistant-think",
        sessionId: "s1",
        seq: 2,
        timestamp: 1002,
        text: "thinking...",
      }),
    ).toBeTruthy();
  });

  it("accepts tool-use and tool-result", () => {
    expect(
      AIStreamEventSchema.parse({
        kind: "tool-use",
        sessionId: "s1",
        seq: 3,
        timestamp: 1003,
        tool: "Bash",
        summary: "git diff",
        id: "tu_1",
      }),
    ).toBeTruthy();
    expect(
      AIStreamEventSchema.parse({
        kind: "tool-result",
        sessionId: "s1",
        seq: 4,
        timestamp: 1004,
        id: "tu_1",
        ok: true,
        summary: "diff body",
      }),
    ).toBeTruthy();
  });

  it("accepts retry", () => {
    expect(
      AIStreamEventSchema.parse({
        kind: "retry",
        sessionId: "s1",
        seq: 5,
        timestamp: 1005,
        attempt: 2,
        max: 8,
        delayMs: 3000,
        category: "rate_limit",
        status: 429,
      }),
    ).toBeTruthy();
  });

  it("accepts result with usage + costUsd", () => {
    const ev = {
      kind: "result" as const,
      sessionId: "s1",
      seq: 9,
      timestamp: 1009,
      ok: true,
      tokenUsage: { inputTokens: 100, outputTokens: 50, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
      costUsd: 0.0123,
    };
    expect(AIStreamEventSchema.parse(ev)).toEqual(ev);
  });

  it("rejects unknown kind", () => {
    expect(() =>
      AIStreamEventSchema.parse({ kind: "nope", sessionId: "s1", seq: 0, timestamp: 0 }),
    ).toThrow();
  });

  it("TokenUsageSchema accepts all fields", () => {
    expect(
      TokenUsageSchema.parse({
        inputTokens: 1,
        outputTokens: 2,
        cacheCreationInputTokens: 3,
        cacheReadInputTokens: 4,
      }),
    ).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `pnpm --filter @magenta/shared test aiStreamEvent`
Expected: FAIL — module `./aiStreamEvent` not found.

- [ ] **Step 3: Write the schema**

```ts
// packages/shared/src/aiStreamEvent.ts
import { z } from "zod";

export const TokenUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheCreationInputTokens: z.number().int().nonnegative().optional(),
  cacheReadInputTokens: z.number().int().nonnegative().optional(),
});
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

const PluginErrorSchema = z.object({
  name: z.string(),
  message: z.string(),
});
export type PluginError = z.infer<typeof PluginErrorSchema>;

const Base = {
  sessionId: z.string(),
  seq: z.number().int().nonnegative(),
  timestamp: z.number().int().nonnegative(),
};

/**
 * Provider-neutral typed event derived from a structured CLI output stream
 * (Claude `--output-format stream-json` today; future providers may emit a
 * subset). Every variant carries `{sessionId, seq, timestamp}` so consumers
 * can order, dedupe, and key UI updates uniformly. Spec §8.2 (FR-5.1).
 */
export const AIStreamEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("session-init"),
    ...Base,
    model: z.string(),
    tools: z.array(z.string()),
    mcpServers: z.array(z.string()),
    pluginErrors: z.array(PluginErrorSchema).optional(),
  }),
  z.object({
    kind: z.literal("plugin-install"),
    ...Base,
    plugin: z.string(),
    status: z.enum(["started", "installed", "failed", "completed"]),
    error: z.string().optional(),
  }),
  z.object({
    kind: z.literal("assistant-text"),
    ...Base,
    text: z.string(),
    partial: z.boolean(),
  }),
  z.object({
    kind: z.literal("assistant-think"),
    ...Base,
    text: z.string(),
  }),
  z.object({
    kind: z.literal("tool-use"),
    ...Base,
    tool: z.string(),
    summary: z.string(),
    id: z.string(),
  }),
  z.object({
    kind: z.literal("tool-result"),
    ...Base,
    id: z.string(),
    ok: z.boolean(),
    summary: z.string().optional(),
  }),
  z.object({
    kind: z.literal("permission-request"),
    ...Base,
    tool: z.string(),
    scope: z.string(),
    id: z.string(),
  }),
  z.object({
    kind: z.literal("retry"),
    ...Base,
    attempt: z.number().int().positive(),
    max: z.number().int().positive(),
    delayMs: z.number().int().nonnegative(),
    category: z.string(),
    status: z.number().int().optional(),
  }),
  z.object({
    kind: z.literal("result"),
    ...Base,
    ok: z.boolean(),
    output: z.unknown().optional(),
    tokenUsage: TokenUsageSchema.optional(),
    costUsd: z.number().nonnegative().optional(),
    /** Set when the provider terminated due to a budget/turn cap. */
    capExceeded: z.enum(["budget", "turns"]).optional(),
  }),
  z.object({
    kind: z.literal("raw-pty"),
    ...Base,
    bytes: z.string(),
  }),
]);
export type AIStreamEvent = z.infer<typeof AIStreamEventSchema>;
```

- [ ] **Step 4: Re-export from `aiTerminal.ts`**

Open `packages/shared/src/aiTerminal.ts` and append:

```ts
export {
  AIStreamEventSchema,
  TokenUsageSchema,
  type AIStreamEvent,
  type TokenUsage,
  type PluginError,
} from "./aiStreamEvent";
```

- [ ] **Step 5: Run tests and verify they pass**

Run: `pnpm --filter @magenta/shared test aiStreamEvent`
Expected: PASS, 8 tests.

Run: `pnpm --filter @magenta/shared typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/aiStreamEvent.ts packages/shared/src/aiStreamEvent.test.ts packages/shared/src/aiTerminal.ts
git commit -m "feat(shared): add AIStreamEvent zod discriminated union"
```

---

## Task 2: Add `ai:run-once` IPC request/response + `ai-session:event` push

**Files:**
- Modify: `packages/shared/src/ipc.ts`

- [ ] **Step 1: Locate the request and response unions**

Run: `rtk grep -n "IpcRequestSchema\|IpcResponseSchema" packages/shared/src/ipc.ts`
Expected: One discriminated-union definition each. Read the surrounding ~30 lines.

- [ ] **Step 2: Add the new variants**

In `packages/shared/src/ipc.ts`, locate the `IpcRequestSchema = z.discriminatedUnion("type", [ … ])` and add the following request inside the array (insertion point: just after the existing `ai-session:check-worktree` request):

```ts
z.object({
  type: z.literal("ai:run-once"),
  provider: z.enum(AI_PROVIDERS),
  repoPath: z.string(),
  worktreePath: z.string().optional(),
  prompt: z.string(),
  // Validated as AISpawnOptions. We re-import the schema here.
  spawn: AISpawnOptionsSchema,
  timeoutMs: z.number().int().positive().optional(),
}),
```

At the top of the file, ensure the import exists:

```ts
import { AISpawnOptionsSchema } from "./aiSpawnOptions";
```

In the same file, locate the `IpcResponseSchema` discriminated union and add (insertion point: just after `ai-session:check-worktree:result`):

```ts
z.object({
  type: z.literal("ai:run-once:result"),
  sessionId: z.string().optional(),
  exitCode: z.number().int(),
  stdout: z.string(),
  stderr: z.string(),
  structuredOutput: z.unknown().optional(),
  tokenUsage: z.object({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
    cacheCreationInputTokens: z.number().int().nonnegative().optional(),
    cacheReadInputTokens: z.number().int().nonnegative().optional(),
  }).optional(),
  costUsd: z.number().nonnegative().optional(),
  retriesSeen: z.number().int().nonnegative(),
}),
```

In the same response union, add the new push event variant (insertion point: just after `ai-session:title`):

```ts
z.object({
  type: z.literal("ai-session:event"),
  event: AIStreamEventSchema,
}),
```

Add the import at the top:

```ts
import { AIStreamEventSchema } from "./aiStreamEvent";
```

- [ ] **Step 3: Add a Zod round-trip test**

Append to (or create if missing) `packages/shared/src/ipc.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { IpcRequestSchema, IpcResponseSchema } from "./ipc";

describe("ai:run-once IPC variants", () => {
  it("request round-trips with full spawn options", () => {
    const msg = {
      type: "ai:run-once" as const,
      provider: "claude" as const,
      repoPath: "/r",
      worktreePath: "/r/wt",
      prompt: "review",
      spawn: { outputFormat: "stream-json" as const, maxTurns: 5 },
      timeoutMs: 30_000,
    };
    expect(IpcRequestSchema.parse(msg)).toEqual(msg);
  });

  it("rejects unknown spawn keys (Phase 1 .strict)", () => {
    expect(() =>
      IpcRequestSchema.parse({
        type: "ai:run-once",
        provider: "claude",
        repoPath: "/r",
        prompt: "x",
        spawn: { totallyBogus: true },
      } as unknown),
    ).toThrow();
  });

  it("response round-trips with usage + cost", () => {
    const msg = {
      type: "ai:run-once:result" as const,
      sessionId: "s1",
      exitCode: 0,
      stdout: "hi",
      stderr: "",
      tokenUsage: { inputTokens: 10, outputTokens: 5 },
      costUsd: 0.001,
      retriesSeen: 0,
    };
    expect(IpcResponseSchema.parse(msg)).toEqual(msg);
  });

  it("ai-session:event push round-trips", () => {
    const msg = {
      type: "ai-session:event" as const,
      event: {
        kind: "assistant-text" as const,
        sessionId: "s1",
        seq: 1,
        timestamp: 0,
        text: "hi",
        partial: false,
      },
    };
    expect(IpcResponseSchema.parse(msg)).toEqual(msg);
  });
});
```

- [ ] **Step 4: Run typecheck + tests**

Run: `pnpm --filter @magenta/shared typecheck`
Expected: PASS.

Run: `pnpm --filter @magenta/shared test ipc`
Expected: PASS, 4 new tests in addition to any pre-existing.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/ipc.ts packages/shared/src/ipc.test.ts
git commit -m "feat(shared): add ai:run-once IPC request and ai-session:event push"
```

---

## Task 3: Add new daemon error codes

**Files:**
- Modify: `packages/daemon/src/errors/AppError.ts`

- [ ] **Step 1: Locate the existing `AppErrorCode` union**

Run: `rtk grep -n "type AppErrorCode" packages/daemon/src/errors/AppError.ts`
Expected: a single union starting at the top of the file.

- [ ] **Step 2: Add the three new codes**

Edit `packages/daemon/src/errors/AppError.ts`. Add the following three union members anywhere within the existing `AppErrorCode` union (alphabetical position is fine; group with the other `AI_*` codes for readability):

```ts
  | "AI_BUDGET_EXCEEDED"
  | "AI_TURN_LIMIT"
  | "UNSUPPORTED_SPAWN_OPTION"
```

If Phase 1 already added `UNSUPPORTED_SPAWN_OPTION`, leave that line as-is and add only the two new `AI_*` codes; verify with `rtk grep "UNSUPPORTED_SPAWN_OPTION" packages/daemon/src/errors/AppError.ts` first.

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter @magenta/daemon typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/daemon/src/errors/AppError.ts
git commit -m "feat(daemon): add AI_BUDGET_EXCEEDED, AI_TURN_LIMIT, UNSUPPORTED_SPAWN_OPTION error codes"
```

---

## Task 4: Pure stream-json parser + fixtures

**Files:**
- Create: `packages/daemon/src/domain/streamJsonParser.ts`
- Create: 7 fixture files in `packages/daemon/src/domain/__fixtures__/streamjson/`
- Create: `packages/daemon/src/domain/streamJsonParser.test.ts`

The parser is **pure**: a reducer over lines. State carries the running `seq`, the last seen `sessionId`, and a per-tool `id → toolName` map so `tool_result` events can reference the tool name. No I/O, no timers.

- [ ] **Step 1: Write the seven fixture files**

Each is a JSON-Lines file. Create exactly the bytes shown.

`packages/daemon/src/domain/__fixtures__/streamjson/system-init.jsonl`:
```jsonl
{"type":"system","subtype":"init","session_id":"sess-1","model":"claude-sonnet-4-6","tools":["Read","Edit","Bash"],"mcp_servers":[{"name":"github","status":"connected"}],"plugin_errors":[]}
```

`packages/daemon/src/domain/__fixtures__/streamjson/system-plugin-install.jsonl`:
```jsonl
{"type":"system","subtype":"plugin_install","session_id":"sess-1","plugin":"superpowers","status":"started"}
{"type":"system","subtype":"plugin_install","session_id":"sess-1","plugin":"superpowers","status":"installed"}
{"type":"system","subtype":"plugin_install","session_id":"sess-1","plugin":"broken-one","status":"failed","error":"checksum mismatch"}
{"type":"system","subtype":"plugin_install","session_id":"sess-1","plugin":"superpowers","status":"completed"}
```

`packages/daemon/src/domain/__fixtures__/streamjson/system-api-retry.jsonl`:
```jsonl
{"type":"system","subtype":"api_retry","session_id":"sess-1","attempt":1,"max_retries":8,"retry_delay_ms":1000,"error_status":429,"error":"rate_limit"}
{"type":"system","subtype":"api_retry","session_id":"sess-1","attempt":2,"max_retries":8,"retry_delay_ms":3000,"error_status":429,"error":"rate_limit"}
```

`packages/daemon/src/domain/__fixtures__/streamjson/assistant-blocks.jsonl`:
```jsonl
{"type":"assistant","session_id":"sess-1","message":{"content":[{"type":"thinking","thinking":"let me plan"}]}}
{"type":"assistant","session_id":"sess-1","message":{"content":[{"type":"text","text":"Hello, "}]}}
{"type":"assistant","session_id":"sess-1","message":{"content":[{"type":"text","text":"world."}]}}
{"type":"assistant","session_id":"sess-1","message":{"content":[{"type":"tool_use","id":"tu_1","name":"Read","input":{"path":"/tmp/x"}}]}}
```

`packages/daemon/src/domain/__fixtures__/streamjson/user-tool-result.jsonl`:
```jsonl
{"type":"user","session_id":"sess-1","message":{"content":[{"type":"tool_result","tool_use_id":"tu_1","is_error":false,"content":"file contents here"}]}}
{"type":"user","session_id":"sess-1","message":{"content":[{"type":"tool_result","tool_use_id":"tu_2","is_error":true,"content":"ENOENT"}]}}
```

`packages/daemon/src/domain/__fixtures__/streamjson/result-success.jsonl`:
```jsonl
{"type":"result","subtype":"success","session_id":"sess-1","is_error":false,"result":"done","usage":{"input_tokens":120,"output_tokens":45,"cache_creation_input_tokens":0,"cache_read_input_tokens":10},"total_cost_usd":0.0123}
```

`packages/daemon/src/domain/__fixtures__/streamjson/result-budget-exceeded.jsonl`:
```jsonl
{"type":"result","subtype":"error_max_budget","session_id":"sess-1","is_error":true,"usage":{"input_tokens":500,"output_tokens":200},"total_cost_usd":0.10}
```

`packages/daemon/src/domain/__fixtures__/streamjson/result-turn-limit.jsonl`:
```jsonl
{"type":"result","subtype":"error_max_turns","session_id":"sess-1","is_error":true,"usage":{"input_tokens":300,"output_tokens":100},"total_cost_usd":0.02}
```

- [ ] **Step 2: Write the failing parser test**

```ts
// packages/daemon/src/domain/streamJsonParser.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createParserState,
  feedLine,
  flush,
  type ParserState,
} from "./streamJsonParser";
import type { AIStreamEvent } from "@magenta/shared/aiStreamEvent";

const FIXTURES = join(__dirname, "__fixtures__", "streamjson");

function runFixture(filename: string): { state: ParserState; events: AIStreamEvent[] } {
  const raw = readFileSync(join(FIXTURES, filename), "utf8");
  let state = createParserState({ now: () => 1000 });
  const events: AIStreamEvent[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const r = feedLine(state, line);
    state = r.state;
    events.push(...r.events);
  }
  const f = flush(state);
  state = f.state;
  events.push(...f.events);
  return { state, events };
}

describe("streamJsonParser", () => {
  it("ignores blank lines without producing events", () => {
    const r = feedLine(createParserState(), "");
    expect(r.events).toEqual([]);
  });

  it("ignores malformed JSON without throwing", () => {
    const r = feedLine(createParserState(), "{not json");
    expect(r.events).toEqual([]);
  });

  it("system/init -> session-init event", () => {
    const { events, state } = runFixture("system-init.jsonl");
    expect(state.sessionId).toBe("sess-1");
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.kind).toBe("session-init");
    if (ev.kind === "session-init") {
      expect(ev.model).toBe("claude-sonnet-4-6");
      expect(ev.tools).toEqual(["Read", "Edit", "Bash"]);
      expect(ev.mcpServers).toEqual(["github"]);
      expect(ev.pluginErrors).toEqual([]);
    }
  });

  it("system/plugin_install -> 4 plugin-install events", () => {
    const { events } = runFixture("system-plugin-install.jsonl");
    expect(events.map((e) => e.kind)).toEqual([
      "plugin-install",
      "plugin-install",
      "plugin-install",
      "plugin-install",
    ]);
    const failed = events[2];
    if (failed.kind === "plugin-install") {
      expect(failed.status).toBe("failed");
      expect(failed.error).toBe("checksum mismatch");
    }
  });

  it("system/api_retry -> retry events with status + delay", () => {
    const { events } = runFixture("system-api-retry.jsonl");
    expect(events).toHaveLength(2);
    const ev = events[0];
    if (ev.kind === "retry") {
      expect(ev.attempt).toBe(1);
      expect(ev.max).toBe(8);
      expect(ev.delayMs).toBe(1000);
      expect(ev.category).toBe("rate_limit");
      expect(ev.status).toBe(429);
    } else {
      throw new Error("expected retry");
    }
  });

  it("assistant blocks -> think + text + tool-use", () => {
    const { events } = runFixture("assistant-blocks.jsonl");
    expect(events.map((e) => e.kind)).toEqual([
      "assistant-think",
      "assistant-text",
      "assistant-text",
      "tool-use",
    ]);
    const tu = events[3];
    if (tu.kind === "tool-use") {
      expect(tu.tool).toBe("Read");
      expect(tu.id).toBe("tu_1");
      expect(tu.summary).toContain("/tmp/x");
    }
  });

  it("user tool_result -> tool-result events with ok flag derived from is_error", () => {
    const { events } = runFixture("user-tool-result.jsonl");
    expect(events).toHaveLength(2);
    const ok = events[0];
    const bad = events[1];
    if (ok.kind === "tool-result") {
      expect(ok.id).toBe("tu_1");
      expect(ok.ok).toBe(true);
    }
    if (bad.kind === "tool-result") {
      expect(bad.id).toBe("tu_2");
      expect(bad.ok).toBe(false);
    }
  });

  it("result/success -> result event with usage + cost; capExceeded undefined", () => {
    const { events } = runFixture("result-success.jsonl");
    expect(events).toHaveLength(1);
    const ev = events[0];
    if (ev.kind === "result") {
      expect(ev.ok).toBe(true);
      expect(ev.tokenUsage).toEqual({
        inputTokens: 120,
        outputTokens: 45,
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: 10,
      });
      expect(ev.costUsd).toBe(0.0123);
      expect(ev.capExceeded).toBeUndefined();
    } else {
      throw new Error("expected result");
    }
  });

  it("result/error_max_budget -> capExceeded='budget'", () => {
    const { events } = runFixture("result-budget-exceeded.jsonl");
    const ev = events[0];
    if (ev.kind === "result") {
      expect(ev.ok).toBe(false);
      expect(ev.capExceeded).toBe("budget");
      expect(ev.tokenUsage?.inputTokens).toBe(500);
    } else {
      throw new Error("expected result");
    }
  });

  it("result/error_max_turns -> capExceeded='turns'", () => {
    const { events } = runFixture("result-turn-limit.jsonl");
    const ev = events[0];
    if (ev.kind === "result") {
      expect(ev.ok).toBe(false);
      expect(ev.capExceeded).toBe("turns");
    } else {
      throw new Error("expected result");
    }
  });

  it("seq is monotonically increasing across the whole stream", () => {
    const { events } = runFixture("assistant-blocks.jsonl");
    for (let i = 1; i < events.length; i++) {
      expect(events[i].seq).toBeGreaterThan(events[i - 1].seq);
    }
  });

  it("flush emits no events when there's no buffered partial line", () => {
    let state = createParserState();
    state = feedLine(state, '{"type":"system","subtype":"init","session_id":"x","model":"m","tools":[],"mcp_servers":[]}').state;
    const { events } = flush(state);
    expect(events).toEqual([]);
  });

  it("flush parses a trailing partial line that lacked a newline", () => {
    let state = createParserState();
    // Feed it as a fragment via the partial buffer path: pretend the caller
    // fed the buffered tail directly to flush.
    state = { ...state, partial: '{"type":"system","subtype":"init","session_id":"sess-2","model":"m","tools":[],"mcp_servers":[]}' };
    const { events, state: next } = flush(state);
    expect(events).toHaveLength(1);
    expect(next.sessionId).toBe("sess-2");
  });
});
```

- [ ] **Step 3: Run test and verify it fails**

Run: `pnpm --filter @magenta/daemon test streamJsonParser`
Expected: FAIL — module `./streamJsonParser` not found.

- [ ] **Step 4: Implement the parser**

```ts
// packages/daemon/src/domain/streamJsonParser.ts
import type { AIStreamEvent } from "@magenta/shared/aiStreamEvent";

/**
 * Pure reducer over Claude `--output-format stream-json` lines. The caller
 * owns I/O: it splits stdout into lines (or feeds a raw buffer for `flush`)
 * and emits the resulting `AIStreamEvent`s upstream. State is immutable —
 * each `feedLine` returns a fresh state.
 *
 * Spec FR-5.1, FR-5.3. Phase 2 covers Claude only; Copilot stream support is
 * tracked as a separate task and currently emits raw-pty frames upstream.
 */
export interface ParserState {
  /** Monotonic counter for emitted events (becomes `event.seq`). */
  seq: number;
  /** First session_id seen on any event; never overwritten. */
  sessionId: string | null;
  /** Map from `tool_use.id` to its `name`, used to label tool-result events. */
  toolNames: Record<string, string>;
  /** Buffer for a trailing partial line (no newline) — drained via `flush`. */
  partial: string;
  /** Injectable clock for deterministic tests. */
  now: () => number;
}

export interface ParserOptions {
  now?: () => number;
}

export function createParserState(opts: ParserOptions = {}): ParserState {
  return {
    seq: 0,
    sessionId: null,
    toolNames: {},
    partial: "",
    now: opts.now ?? (() => Date.now()),
  };
}

interface FeedResult {
  state: ParserState;
  events: AIStreamEvent[];
}

function bumpSeq(state: ParserState): { state: ParserState; seq: number } {
  const seq = state.seq + 1;
  return { state: { ...state, seq }, seq };
}

function ensureSessionId(state: ParserState, candidate: unknown): ParserState {
  if (state.sessionId !== null) return state;
  if (typeof candidate !== "string" || candidate.length === 0) return state;
  return { ...state, sessionId: candidate };
}

function summarizeToolInput(input: unknown): string {
  if (input == null) return "";
  if (typeof input === "string") return input.slice(0, 200);
  try {
    const s = JSON.stringify(input);
    return s.length > 200 ? `${s.slice(0, 200)}…` : s;
  } catch {
    return "";
  }
}

function summarizeToolResult(content: unknown): string | undefined {
  if (content == null) return undefined;
  if (typeof content === "string") return content.slice(0, 200);
  if (Array.isArray(content)) {
    const text = content
      .map((c) => (c && typeof c === "object" && "text" in c ? String((c as { text: unknown }).text) : ""))
      .join("");
    return text ? text.slice(0, 200) : undefined;
  }
  try {
    return JSON.stringify(content).slice(0, 200);
  } catch {
    return undefined;
  }
}

function parseUsage(raw: unknown): AIStreamEvent extends infer _ ? undefined | {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
} : never {
  if (!raw || typeof raw !== "object") return undefined as never;
  const o = raw as Record<string, unknown>;
  const input = typeof o.input_tokens === "number" ? o.input_tokens : 0;
  const output = typeof o.output_tokens === "number" ? o.output_tokens : 0;
  const usage: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens?: number;
    cacheReadInputTokens?: number;
  } = { inputTokens: input, outputTokens: output };
  if (typeof o.cache_creation_input_tokens === "number")
    usage.cacheCreationInputTokens = o.cache_creation_input_tokens;
  if (typeof o.cache_read_input_tokens === "number")
    usage.cacheReadInputTokens = o.cache_read_input_tokens;
  return usage as never;
}

/**
 * Feed a single line (no trailing newline) to the parser.
 * Returns the new state plus zero or more emitted events.
 */
export function feedLine(prev: ParserState, line: string): FeedResult {
  const trimmed = line.trim();
  if (!trimmed) return { state: prev, events: [] };

  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return { state: prev, events: [] };
  }
  if (!raw || typeof raw !== "object") return { state: prev, events: [] };
  const e = raw as Record<string, unknown>;

  let state = ensureSessionId(prev, e.session_id);
  const sid = state.sessionId ?? "unknown";
  const ts = state.now();
  const events: AIStreamEvent[] = [];
  const emit = (build: (seq: number) => AIStreamEvent) => {
    const next = bumpSeq(state);
    state = next.state;
    events.push(build(next.seq));
  };

  const type = e.type;

  if (type === "system" && e.subtype === "init") {
    const tools = Array.isArray(e.tools) ? (e.tools as unknown[]).filter((t): t is string => typeof t === "string") : [];
    const servers = Array.isArray(e.mcp_servers)
      ? (e.mcp_servers as unknown[]).map((s) => {
          if (s && typeof s === "object" && "name" in (s as Record<string, unknown>)) {
            const n = (s as Record<string, unknown>).name;
            return typeof n === "string" ? n : null;
          }
          return null;
        }).filter((n): n is string => n !== null)
      : [];
    const pluginErrors = Array.isArray(e.plugin_errors)
      ? (e.plugin_errors as unknown[]).map((p) => {
          const o = (p ?? {}) as Record<string, unknown>;
          return {
            name: typeof o.name === "string" ? o.name : "",
            message: typeof o.message === "string" ? o.message : "",
          };
        })
      : [];
    emit((seq) => ({
      kind: "session-init",
      sessionId: sid,
      seq,
      timestamp: ts,
      model: typeof e.model === "string" ? e.model : "",
      tools,
      mcpServers: servers,
      pluginErrors,
    }));
    return { state, events };
  }

  if (type === "system" && e.subtype === "plugin_install") {
    const status = e.status;
    if (status === "started" || status === "installed" || status === "failed" || status === "completed") {
      emit((seq) => ({
        kind: "plugin-install",
        sessionId: sid,
        seq,
        timestamp: ts,
        plugin: typeof e.plugin === "string" ? e.plugin : "",
        status,
        error: typeof e.error === "string" ? e.error : undefined,
      }));
    }
    return { state, events };
  }

  if (type === "system" && e.subtype === "api_retry") {
    emit((seq) => ({
      kind: "retry",
      sessionId: sid,
      seq,
      timestamp: ts,
      attempt: typeof e.attempt === "number" ? e.attempt : 1,
      max: typeof e.max_retries === "number" ? e.max_retries : 1,
      delayMs: typeof e.retry_delay_ms === "number" ? e.retry_delay_ms : 0,
      category: typeof e.error === "string" ? e.error : "unknown",
      status: typeof e.error_status === "number" ? e.error_status : undefined,
    }));
    return { state, events };
  }

  if (type === "assistant" && e.message && typeof e.message === "object") {
    const content = (e.message as Record<string, unknown>).content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (!block || typeof block !== "object") continue;
        const b = block as Record<string, unknown>;
        if (b.type === "text" && typeof b.text === "string") {
          const text = b.text;
          const partial = b.partial === true;
          emit((seq) => ({
            kind: "assistant-text",
            sessionId: sid,
            seq,
            timestamp: ts,
            text,
            partial,
          }));
        } else if (b.type === "thinking" && typeof b.thinking === "string") {
          const text = b.thinking;
          emit((seq) => ({
            kind: "assistant-think",
            sessionId: sid,
            seq,
            timestamp: ts,
            text,
          }));
        } else if (b.type === "tool_use" && typeof b.id === "string" && typeof b.name === "string") {
          const id = b.id;
          const name = b.name;
          state = { ...state, toolNames: { ...state.toolNames, [id]: name } };
          const summary = summarizeToolInput(b.input);
          emit((seq) => ({
            kind: "tool-use",
            sessionId: sid,
            seq,
            timestamp: ts,
            tool: name,
            id,
            summary,
          }));
        }
      }
    }
    return { state, events };
  }

  if (type === "user" && e.message && typeof e.message === "object") {
    const content = (e.message as Record<string, unknown>).content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (!block || typeof block !== "object") continue;
        const b = block as Record<string, unknown>;
        if (b.type === "tool_result" && typeof b.tool_use_id === "string") {
          const id = b.tool_use_id;
          const ok = b.is_error !== true;
          const summary = summarizeToolResult(b.content);
          emit((seq) => ({
            kind: "tool-result",
            sessionId: sid,
            seq,
            timestamp: ts,
            id,
            ok,
            summary,
          }));
        }
      }
    }
    return { state, events };
  }

  if (type === "result") {
    const subtype = typeof e.subtype === "string" ? e.subtype : "";
    const ok = e.is_error !== true;
    const usage = parseUsage(e.usage);
    const costUsd = typeof e.total_cost_usd === "number" ? e.total_cost_usd : undefined;
    const capExceeded =
      subtype === "error_max_budget" ? "budget" :
      subtype === "error_max_turns" ? "turns" :
      undefined;
    emit((seq) => ({
      kind: "result",
      sessionId: sid,
      seq,
      timestamp: ts,
      ok,
      output: e.result,
      tokenUsage: usage as ReturnType<typeof parseUsage>,
      costUsd,
      capExceeded,
    }));
    return { state, events };
  }

  return { state, events };
}

/**
 * Drain a trailing partial line. Callers that batch-read stdout should
 * place any unterminated tail in `state.partial` then call `flush`.
 */
export function flush(prev: ParserState): FeedResult {
  if (!prev.partial) return { state: prev, events: [] };
  const result = feedLine({ ...prev, partial: "" }, prev.partial);
  return result;
}
```

- [ ] **Step 5: Run tests and verify they pass**

Run: `pnpm --filter @magenta/daemon test streamJsonParser`
Expected: PASS, all 13 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/domain/streamJsonParser.ts packages/daemon/src/domain/streamJsonParser.test.ts packages/daemon/src/domain/__fixtures__/streamjson/
git commit -m "feat(daemon): pure stream-json parser with fixture-driven tests"
```

---

## Task 5: `AiCliGateway.runOnceWithSpawn` — typed wrapper around the existing process spawn

**Files:**
- Modify: `packages/daemon/src/infrastructure/AiCliGateway.ts`
- Create: `packages/daemon/src/infrastructure/AiCliGateway.runOnceWithSpawn.test.ts`

The existing `AiCliGateway.run` accepts the legacy `RunOptions`. Phase 2 adds a sibling method `runOnceWithSpawn(provider, prompt, spawn, hooks)` that:

1. Calls `getToArgv(provider)(spawn, getProviderCapability(provider))` (Phase 1 dispatcher).
2. Spawns the process via `child_process.spawn`, prepending `-p` (Claude) or `-p <prompt>` (Copilot) — same argv shape the legacy `runOnce` uses.
3. Splits stdout into newline-delimited frames and **does not** parse them itself; instead it calls `hooks.onStdoutLine?.(line)` so the application service can run the parser. Stderr is buffered and returned verbatim.
4. Resolves with `{ stdout, stderr, exitCode, retriesSeen }` where `retriesSeen` starts at zero (the application service increments it from parser events).
5. Honours `spawn.timeoutMs`-derived timeout passed in via `hooks.timeoutMs`; on timeout, kills the child and rejects with `AppError("AI_TIMEOUT")`.

The legacy `RunOptions`-shaped `run()` is left untouched so the existing spec-review path continues to work.

- [ ] **Step 1: Write the failing test**

```ts
// packages/daemon/src/infrastructure/AiCliGateway.runOnceWithSpawn.test.ts
import { describe, it, expect, vi } from "vitest";
import { AiCliGateway } from "./AiCliGateway";
import type { AISpawnOptions } from "@magenta/shared/aiSpawnOptions";

// Minimal stub `spawn` that emits a few stdout lines, an exit code, and
// records the argv we were called with.
const captured: { command?: string; args?: string[] } = {};
vi.mock("node:child_process", () => {
  const { EventEmitter } = require("node:events");
  return {
    spawn: (command: string, args: string[]) => {
      captured.command = command;
      captured.args = args;
      const proc: any = new EventEmitter();
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.stdin = { end: () => {} };
      proc.kill = () => {};
      setImmediate(() => {
        proc.stdout.emit("data", Buffer.from('{"type":"assistant","session_id":"s1","message":{"content":[{"type":"text","text":"hi"}]}}\n'));
        proc.stdout.emit("data", Buffer.from('{"type":"result","subtype":"success","session_id":"s1","is_error":false,"usage":{"input_tokens":1,"output_tokens":1},"total_cost_usd":0.001}\n'));
        proc.emit("close", 0);
      });
      return proc;
    },
  };
});

describe("AiCliGateway.runOnceWithSpawn", () => {
  it("invokes provider toArgv, prepends -p for Claude, captures stdout lines", async () => {
    const gw = new AiCliGateway();
    const lines: string[] = [];
    const spawn: AISpawnOptions = { outputFormat: "stream-json", model: "claude-sonnet-4-6" };
    const result = await gw.runOnceWithSpawn(
      "claude",
      "review",
      spawn,
      {
        cwd: "/tmp",
        timeoutMs: 5_000,
        onStdoutLine: (l) => lines.push(l),
      },
    );

    expect(captured.command).toBe("claude");
    expect(captured.args?.[0]).toBe("-p");
    expect(captured.args).toContain("--output-format");
    expect(captured.args).toContain("stream-json");
    expect(captured.args).toContain("--model");
    expect(captured.args).toContain("claude-sonnet-4-6");
    expect(result.exitCode).toBe(0);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("assistant");
    expect(lines[1]).toContain("result");
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `pnpm --filter @magenta/daemon test AiCliGateway.runOnceWithSpawn`
Expected: FAIL — `runOnceWithSpawn` not defined.

- [ ] **Step 3: Implement `runOnceWithSpawn`**

In `packages/daemon/src/infrastructure/AiCliGateway.ts`, add the following imports near the top (next to existing imports):

```ts
import { getToArgv } from "../domain/providerArgv";
import { getProviderCapability } from "@magenta/shared/providerCapabilities";
import type { AISpawnOptions } from "@magenta/shared/aiSpawnOptions";
import type { AIProvider } from "@magenta/shared/aiTerminal";
```

Then add the new method on the `AiCliGateway` class (anywhere; conventionally just below `run`):

```ts
/**
 * Phase 2 typed entry point. Translates AISpawnOptions to argv via the
 * provider's pure adapter, spawns, and forwards stdout line-by-line to the
 * caller. Caller (application service) owns parsing & event emission.
 */
async runOnceWithSpawn(
  provider: AIProvider,
  prompt: string,
  spawn: AISpawnOptions,
  hooks: {
    cwd: string;
    timeoutMs: number;
    onStdoutLine?: (line: string) => void;
  },
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  retriesSeen: number;
}> {
  const caps = getProviderCapability(provider);
  const { args } = getToArgv(provider)(spawn, caps);
  const command = provider === "claude" ? "claude" : "copilot";

  if (provider === "claude") {
    args.unshift("-p");
  } else {
    args.unshift("-p", prompt);
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { spawn: nodeSpawn } = require("node:child_process") as typeof import("node:child_process");

  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof nodeSpawn>;
    try {
      child = nodeSpawn(command, args, {
        cwd: hooks.cwd,
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (err) {
      reject(
        new AppError(
          "AI_PROVIDER_NOT_AVAILABLE",
          `Could not spawn "${command}": ${(err as Error).message}.`,
        ),
      );
      return;
    }

    let stdout = "";
    let stderr = "";
    let buf = "";
    let settled = false;
    const retriesSeen = 0;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill("SIGTERM"); } catch { /* ignore */ }
      reject(new AppError("AI_TIMEOUT", `${command} did not respond within ${hooks.timeoutMs}ms.`));
    }, hooks.timeoutMs);

    child.stdout!.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      stdout += text;
      buf += text;
      let nl = buf.indexOf("\n");
      while (nl !== -1) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (hooks.onStdoutLine) hooks.onStdoutLine(line);
        nl = buf.indexOf("\n");
      }
    });
    child.stderr!.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err.code === "ENOENT") {
        reject(
          new AppError(
            "AI_PROVIDER_NOT_AVAILABLE",
            `"${command}" not found on PATH. Install the ${provider} CLI first.`,
          ),
        );
        return;
      }
      reject(new AppError("AI_CLI_FAILED", err.message));
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (buf && hooks.onStdoutLine) hooks.onStdoutLine(buf);
      resolve({ stdout, stderr, exitCode: code ?? 0, retriesSeen });
    });

    if (provider === "claude") {
      // Claude reads the prompt from stdin when -p is given without a value.
      child.stdin!.end(prompt, "utf8");
    } else {
      child.stdin!.end();
    }
  });
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @magenta/daemon test AiCliGateway.runOnceWithSpawn`
Expected: PASS.

Run: `pnpm --filter @magenta/daemon typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/infrastructure/AiCliGateway.ts packages/daemon/src/infrastructure/AiCliGateway.runOnceWithSpawn.test.ts
git commit -m "feat(daemon): AiCliGateway.runOnceWithSpawn (typed AISpawnOptions entry point)"
```

---

## Task 6: `AIRunOnceApplicationService` — orchestrate validate → spawn → stream → tally

**Files:**
- Create: `packages/daemon/src/application/AIRunOnceApplicationService.ts`
- Create: `packages/daemon/src/application/AIRunOnceApplicationService.test.ts`

This service does **all** the orchestration:
1. **Validate** every key present in `spawn` against the provider's `ProviderCapability.supportedKeys`. Any unsupported key throws `AppError("UNSUPPORTED_SPAWN_OPTION")`.
2. **Force structured Copilot output** when callers ask for `outputFormat: "json"` or set `silent: true` (Copilot one-shot needs `-s` + `--output-format json` to be parseable). This is purely a passthrough; `toArgvCopilot` (Phase 1) already renders both flags.
3. **Spawn** via `gateway.runOnceWithSpawn`, feeding each stdout line into the `streamJsonParser` when `provider === "claude"` and `spawn.outputFormat === "stream-json"`.
4. **Push every parser event** as `{ type: "ai-session:event", event }` over the IPC bridge.
5. **Tally** `tokenUsage`, `costUsd`, `retriesSeen`, and capture `sessionId` and `capExceeded` from the terminal `result` event.
6. **Translate** `capExceeded` to `AppError("AI_BUDGET_EXCEEDED" | "AI_TURN_LIMIT")` with `details: { tokenUsage, costUsd }`.
7. **Return** `{ sessionId, exitCode, stdout, stderr, structuredOutput, tokenUsage, costUsd, retriesSeen }`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/daemon/src/application/AIRunOnceApplicationService.test.ts
import { describe, it, expect, vi } from "vitest";
import { AIRunOnceApplicationService } from "./AIRunOnceApplicationService";
import { AppError } from "../errors/AppError";
import type { IPCBridge } from "../ipc/IPCBridge";
import type { AiCliGateway } from "../infrastructure/AiCliGateway";

function makeBridge(): IPCBridge & { sent: unknown[] } {
  const sent: unknown[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { sent, sendPush: (msg: unknown) => sent.push(msg) } as any;
}

function makeGateway(stdoutLines: string[], opts: { exitCode?: number } = {}): AiCliGateway {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return {
    runOnceWithSpawn: vi.fn(async (_p, _prompt, _spawn, hooks: { onStdoutLine?: (l: string) => void }) => {
      for (const line of stdoutLines) hooks.onStdoutLine?.(line);
      return { stdout: stdoutLines.join("\n"), stderr: "", exitCode: opts.exitCode ?? 0, retriesSeen: 0 };
    }),
  } as any;
}

describe("AIRunOnceApplicationService", () => {
  it("rejects unsupported spawn option for Copilot (jsonSchema is Claude-only)", async () => {
    const svc = new AIRunOnceApplicationService(makeGateway([]), makeBridge());
    await expect(
      svc.runOnce({
        provider: "copilot",
        repoPath: "/r",
        prompt: "x",
        spawn: { jsonSchema: { type: "object" } },
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_SPAWN_OPTION" });
  });

  it("translates result/error_max_budget into AI_BUDGET_EXCEEDED", async () => {
    const lines = [
      '{"type":"result","subtype":"error_max_budget","session_id":"s1","is_error":true,"usage":{"input_tokens":500,"output_tokens":200},"total_cost_usd":0.10}',
    ];
    const svc = new AIRunOnceApplicationService(makeGateway(lines), makeBridge());
    await expect(
      svc.runOnce({
        provider: "claude",
        repoPath: "/r",
        prompt: "x",
        spawn: { outputFormat: "stream-json", maxBudgetUsd: 0.05 },
      }),
    ).rejects.toMatchObject({
      code: "AI_BUDGET_EXCEEDED",
      details: expect.objectContaining({
        tokenUsage: expect.objectContaining({ inputTokens: 500 }),
        costUsd: 0.10,
      }),
    });
  });

  it("translates result/error_max_turns into AI_TURN_LIMIT", async () => {
    const lines = [
      '{"type":"result","subtype":"error_max_turns","session_id":"s1","is_error":true,"usage":{"input_tokens":300,"output_tokens":100},"total_cost_usd":0.02}',
    ];
    const svc = new AIRunOnceApplicationService(makeGateway(lines), makeBridge());
    await expect(
      svc.runOnce({
        provider: "claude",
        repoPath: "/r",
        prompt: "x",
        spawn: { outputFormat: "stream-json", maxTurns: 3 },
      }),
    ).rejects.toMatchObject({ code: "AI_TURN_LIMIT" });
  });

  it("happy path: returns sessionId, usage, cost; pushes every parser event", async () => {
    const lines = [
      '{"type":"system","subtype":"init","session_id":"s1","model":"m","tools":["Read"],"mcp_servers":[]}',
      '{"type":"assistant","session_id":"s1","message":{"content":[{"type":"text","text":"ok"}]}}',
      '{"type":"result","subtype":"success","session_id":"s1","is_error":false,"result":"done","usage":{"input_tokens":10,"output_tokens":5},"total_cost_usd":0.001}',
    ];
    const bridge = makeBridge();
    const svc = new AIRunOnceApplicationService(makeGateway(lines), bridge);
    const result = await svc.runOnce({
      provider: "claude",
      repoPath: "/r",
      prompt: "review",
      spawn: { outputFormat: "stream-json" },
    });
    expect(result.sessionId).toBe("s1");
    expect(result.exitCode).toBe(0);
    expect(result.tokenUsage).toEqual({ inputTokens: 10, outputTokens: 5 });
    expect(result.costUsd).toBe(0.001);
    expect(result.retriesSeen).toBe(0);
    expect(result.structuredOutput).toBe("done");
    // 3 parser events pushed.
    const pushed = (bridge as { sent: { type: string }[] }).sent.filter((m) => m.type === "ai-session:event");
    expect(pushed).toHaveLength(3);
  });

  it("counts api_retry events into retriesSeen", async () => {
    const lines = [
      '{"type":"system","subtype":"api_retry","session_id":"s1","attempt":1,"max_retries":8,"retry_delay_ms":1000,"error":"rate_limit","error_status":429}',
      '{"type":"system","subtype":"api_retry","session_id":"s1","attempt":2,"max_retries":8,"retry_delay_ms":3000,"error":"rate_limit","error_status":429}',
      '{"type":"result","subtype":"success","session_id":"s1","is_error":false,"usage":{"input_tokens":1,"output_tokens":1},"total_cost_usd":0.0001}',
    ];
    const svc = new AIRunOnceApplicationService(makeGateway(lines), makeBridge());
    const result = await svc.runOnce({
      provider: "claude",
      repoPath: "/r",
      prompt: "x",
      spawn: { outputFormat: "stream-json" },
    });
    expect(result.retriesSeen).toBe(2);
  });

  it("Copilot: silent + outputFormat=json passes through; unsupported keys still validated", async () => {
    const lines = ['{"some":"copilot json"}'];
    const gw = makeGateway(lines);
    const svc = new AIRunOnceApplicationService(gw, makeBridge());
    const result = await svc.runOnce({
      provider: "copilot",
      repoPath: "/r",
      prompt: "x",
      spawn: { silent: true, outputFormat: "json" },
    });
    expect(result.exitCode).toBe(0);
    expect(gw.runOnceWithSpawn).toHaveBeenCalledWith(
      "copilot",
      "x",
      expect.objectContaining({ silent: true, outputFormat: "json" }),
      expect.any(Object),
    );
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `pnpm --filter @magenta/daemon test AIRunOnceApplicationService`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

```ts
// packages/daemon/src/application/AIRunOnceApplicationService.ts
import type { AiCliGateway } from "../infrastructure/AiCliGateway";
import type { IPCBridge } from "../ipc/IPCBridge";
import { AppError } from "../errors/AppError";
import type { AIProvider } from "@magenta/shared/aiTerminal";
import type { AISpawnOptions } from "@magenta/shared/aiSpawnOptions";
import type { AIStreamEvent, TokenUsage } from "@magenta/shared/aiStreamEvent";
import {
  getProviderCapability,
  type SpawnOptionKey,
} from "@magenta/shared/providerCapabilities";
import {
  createParserState,
  feedLine,
  flush,
  type ParserState,
} from "../domain/streamJsonParser";

export interface RunOnceArgs {
  provider: AIProvider;
  repoPath: string;
  worktreePath?: string;
  prompt: string;
  spawn: AISpawnOptions;
  timeoutMs?: number;
}

export interface RunOnceResult {
  sessionId?: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  structuredOutput?: unknown;
  tokenUsage?: TokenUsage;
  costUsd?: number;
  retriesSeen: number;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export class AIRunOnceApplicationService {
  constructor(
    private readonly gateway: AiCliGateway,
    private readonly bridge: IPCBridge,
  ) {}

  async runOnce(args: RunOnceArgs): Promise<RunOnceResult> {
    const caps = getProviderCapability(args.provider);
    const supported = new Set<SpawnOptionKey>(caps.supportedKeys);
    for (const key of Object.keys(args.spawn) as SpawnOptionKey[]) {
      if ((args.spawn as Record<string, unknown>)[key] === undefined) continue;
      if (!supported.has(key)) {
        throw new AppError(
          "UNSUPPORTED_SPAWN_OPTION",
          `Provider '${args.provider}' does not support AISpawnOptions key '${key}'.`,
          { provider: args.provider, field: key },
        );
      }
    }

    const cwd = args.worktreePath ?? args.repoPath;
    const useStreamParser =
      args.provider === "claude" && args.spawn.outputFormat === "stream-json";

    let parser: ParserState = createParserState();
    let sessionId: string | undefined;
    let tokenUsage: TokenUsage | undefined;
    let costUsd: number | undefined;
    let structuredOutput: unknown;
    let capExceeded: "budget" | "turns" | undefined;
    let retriesSeen = 0;

    const handleEvent = (ev: AIStreamEvent) => {
      this.bridge.sendPush({ type: "ai-session:event", event: ev });
      if (ev.kind === "session-init") {
        sessionId = ev.sessionId;
      } else if (ev.kind === "retry") {
        retriesSeen += 1;
      } else if (ev.kind === "result") {
        if (ev.tokenUsage) tokenUsage = ev.tokenUsage;
        if (typeof ev.costUsd === "number") costUsd = ev.costUsd;
        if (ev.output !== undefined) structuredOutput = ev.output;
        if (ev.capExceeded) capExceeded = ev.capExceeded;
      }
    };

    const onStdoutLine = (line: string) => {
      if (!useStreamParser) return;
      const r = feedLine(parser, line);
      parser = r.state;
      for (const ev of r.events) handleEvent(ev);
    };

    const gatewayResult = await this.gateway.runOnceWithSpawn(
      args.provider,
      args.prompt,
      args.spawn,
      {
        cwd,
        timeoutMs: args.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        onStdoutLine,
      },
    );

    if (useStreamParser) {
      const f = flush(parser);
      parser = f.state;
      for (const ev of f.events) handleEvent(ev);
      if (parser.sessionId && !sessionId) sessionId = parser.sessionId;
    }

    if (capExceeded === "budget") {
      throw new AppError(
        "AI_BUDGET_EXCEEDED",
        `Run terminated: max budget reached.`,
        { tokenUsage, costUsd, sessionId },
      );
    }
    if (capExceeded === "turns") {
      throw new AppError(
        "AI_TURN_LIMIT",
        `Run terminated: max turns reached.`,
        { tokenUsage, costUsd, sessionId },
      );
    }

    return {
      sessionId,
      exitCode: gatewayResult.exitCode,
      stdout: gatewayResult.stdout,
      stderr: gatewayResult.stderr,
      structuredOutput,
      tokenUsage,
      costUsd,
      retriesSeen: retriesSeen + gatewayResult.retriesSeen,
    };
  }
}
```

- [ ] **Step 4: Run tests and verify they pass**

Run: `pnpm --filter @magenta/daemon test AIRunOnceApplicationService`
Expected: PASS, 6 tests.

Run: `pnpm --filter @magenta/daemon typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/application/AIRunOnceApplicationService.ts packages/daemon/src/application/AIRunOnceApplicationService.test.ts
git commit -m "feat(daemon): AIRunOnceApplicationService orchestrates validate, stream, caps"
```

---

## Task 7: IPC handler for `ai:run-once`

**Files:**
- Create: `packages/daemon/src/ipc/handlers/aiRunOnceHandlers.ts`

The handler is a thin `safeHandle`. It must contain **no** logic beyond unpacking the typed request and calling `service.runOnce(...)`. Per CLAUDE.md, no `try/catch`, no payload casting.

- [ ] **Step 1: Write the handler**

```ts
// packages/daemon/src/ipc/handlers/aiRunOnceHandlers.ts
import type { IPCBridge } from "../IPCBridge";
import type { AIRunOnceApplicationService } from "../../application/AIRunOnceApplicationService";
import { safeHandle } from "../createHandler";

type AIRunOnceHandlerContext = {
  bridge: IPCBridge;
  runOnceService: AIRunOnceApplicationService;
};

export function registerAIRunOnceHandlers({
  bridge,
  runOnceService,
}: AIRunOnceHandlerContext): void {
  safeHandle(bridge, "ai:run-once", async (msg) => {
    const result = await runOnceService.runOnce({
      provider: msg.provider,
      repoPath: msg.repoPath,
      worktreePath: msg.worktreePath,
      prompt: msg.prompt,
      spawn: msg.spawn,
      timeoutMs: msg.timeoutMs,
    });
    return {
      type: "ai:run-once:result",
      sessionId: result.sessionId,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      structuredOutput: result.structuredOutput,
      tokenUsage: result.tokenUsage,
      costUsd: result.costUsd,
      retriesSeen: result.retriesSeen,
    };
  });
}
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @magenta/daemon typecheck`
Expected: FAIL — `runOnceService` not yet wired in `registerHandlers.ts`. That's the next task.

(Skip the commit until Task 8; we want a single coherent wiring commit.)

---

## Task 8: Wire the service into `DaemonContainer` + `registerHandlers`

**Files:**
- Modify: `packages/daemon/src/DaemonContainer.ts`
- Modify: `packages/daemon/src/ipc/registerHandlers.ts`

- [ ] **Step 1: Construct the service in `DaemonContainer`**

In `packages/daemon/src/DaemonContainer.ts`, locate the `aiCliGateway` field declaration (`readonly aiCliGateway: AiCliGateway;`) and add a sibling:

```ts
readonly aiRunOnceService: AIRunOnceApplicationService;
```

Add the import at the top:

```ts
import { AIRunOnceApplicationService } from "./application/AIRunOnceApplicationService";
```

In the constructor body, after `this.aiCliGateway = new AiCliGateway();`, insert:

```ts
this.aiRunOnceService = new AIRunOnceApplicationService(this.aiCliGateway, this.bridge);
```

If `this.bridge` is not yet a field on `DaemonContainer` at the point you need it, instead expose a `setBridge(bridge)` method or move the construction into the existing `wire(bridge)` step if one exists. Read the file end-to-end before editing to pick the path that matches the existing pattern.

- [ ] **Step 2: Add the service to `HandlerContext` and register the handler**

In `packages/daemon/src/ipc/registerHandlers.ts`:

1. Add to the imports:
   ```ts
   import type { AIRunOnceApplicationService } from "../application/AIRunOnceApplicationService";
   import { registerAIRunOnceHandlers } from "./handlers/aiRunOnceHandlers";
   ```
2. Add a field to `HandlerContext`:
   ```ts
   aiRunOnceService: AIRunOnceApplicationService;
   ```
3. Inside `registerHandlers`, after the existing `registerAISessionHandlers(...)` call, add:
   ```ts
   registerAIRunOnceHandlers({ bridge, runOnceService: context.aiRunOnceService });
   ```

- [ ] **Step 3: Pass the service through the daemon entry point**

Find the daemon entry that builds `HandlerContext` and calls `registerHandlers(bridge, context)`. Add `aiRunOnceService: container.aiRunOnceService` to the context object.

Run: `rtk grep -n "registerHandlers(bridge" packages/daemon/src/`
Read the call site and add the field.

- [ ] **Step 4: Verify typecheck + build**

Run: `pnpm --filter @magenta/daemon typecheck`
Expected: PASS.

Run: `pnpm --filter @magenta/daemon build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/ipc/handlers/aiRunOnceHandlers.ts packages/daemon/src/ipc/registerHandlers.ts packages/daemon/src/DaemonContainer.ts
git commit -m "feat(daemon): wire ai:run-once IPC handler"
```

---

## Task 9: Update `ResponseForRequest` in the renderer ipcClient

**Files:**
- Modify: `packages/ui/src/renderer/services/ipcClient.ts`

- [ ] **Step 1: Add the typed mapping**

Open `packages/ui/src/renderer/services/ipcClient.ts`. Inside the `ResponseForRequest` type, add the row immediately after `ai-session:check-worktree`:

```ts
  "ai:run-once": Extract<IpcResponse, { type: "ai:run-once:result" }>;
```

- [ ] **Step 2: Verify typecheck across the workspace**

Run: `pnpm -w typecheck`
Expected: PASS in all packages.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/renderer/services/ipcClient.ts
git commit -m "feat(ui): map ai:run-once response in ResponseForRequest"
```

---

## Task 10: Migrate `AiEditApplicationService` to `AIRunOnceApplicationService`

**Files:**
- Create: `packages/daemon/src/application/AiEditApplicationService.test.ts`
- Modify: `packages/daemon/src/application/AiEditApplicationService.ts`
- Modify: `packages/daemon/src/DaemonContainer.ts`

The chat-bubble IPC handlers (`ai-chat:ask`, `ai-chat:edit-selection`, `ai-chat:modify-document`) are served today by `AiEditApplicationService.ask()`, `.editSelection()`, and `.modifyDocument()` — each of which calls `AiCliGateway.run()` directly. The unification spec (`supers/specs/2026-04-25-chat-bubble-unification.md`) requires every chat send to route through the new `AIRunOnceApplicationService` introduced in Task 6 so that capability validation, stream-parser translation, cap-error semantics, and `ai-session:event` push emission all apply uniformly. This task is a pure engine swap: chat IPC payload shapes are unchanged (callers still send the same `provider`, `model`, `allowedTools`, `disallowedTools`, `systemPromptAppend`, `permissionMode`, `resumeSessionId`, etc.). Each chat method now translates those existing arguments into an `AISpawnOptions` and calls `runOnceService.runOnce(...)`. The streaming surface is unchanged from the renderer's perspective: `AIRunOnceApplicationService` already pushes every parser event over `ai-session:event` (Task 6, Step 3), so any callback the chat code previously wired against `AiCliGateway.run`'s `onChunk`/`onSessionId` hooks is now driven by subscribing to `AIStreamEvent` push frames (kinds `assistant-text`, `session-init`). Adding new optional payload fields (`sessionId`, `spawn`) is **not** in scope here — that lands in Phase 5.

- [ ] **Step 1: Write the failing test**

```ts
// packages/daemon/src/application/AiEditApplicationService.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AiEditApplicationService } from "./AiEditApplicationService";
import type { AIRunOnceApplicationService } from "./AIRunOnceApplicationService";

function makeRunOnceService() {
  return {
    runOnce: vi.fn(async () => ({
      sessionId: "s-new",
      exitCode: 0,
      stdout: "ok",
      stderr: "",
      retriesSeen: 0,
    })),
  } as unknown as AIRunOnceApplicationService & { runOnce: ReturnType<typeof vi.fn> };
}

describe("AiEditApplicationService — routes chat through AIRunOnceApplicationService", () => {
  let runOnce: ReturnType<typeof makeRunOnceService>;
  let svc: AiEditApplicationService;

  beforeEach(() => {
    runOnce = makeRunOnceService();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    svc = new AiEditApplicationService(runOnce as any);
  });

  it("ask() invokes runOnce with chat-shaped AISpawnOptions", async () => {
    await svc.ask({
      provider: "claude",
      repoPath: "/r",
      model: "claude-sonnet-4-6",
      prompt: "what does this file do?",
      allowedTools: ["Read", "Grep"],
      disallowedTools: ["Bash"],
      systemPromptAppend: "Be concise.",
      resumeSessionId: "s-prev",
    });

    expect(runOnce.runOnce).toHaveBeenCalledTimes(1);
    const call = runOnce.runOnce.mock.calls[0][0];
    expect(call).toMatchObject({
      provider: "claude",
      repoPath: "/r",
      prompt: "what does this file do?",
    });
    expect(call.spawn).toMatchObject({
      model: "claude-sonnet-4-6",
      allowedTools: ["Read", "Grep"],
      disallowedTools: ["Bash"],
      systemPromptAppend: "Be concise.",
      resumeSessionId: "s-prev",
      outputFormat: "stream-json",
    });
  });

  it("editSelection() forwards selection prompt and uses default permission mode", async () => {
    await svc.editSelection({
      provider: "claude",
      repoPath: "/r",
      model: "claude-sonnet-4-6",
      selection: "const x = 1;",
      instruction: "rename to y",
      allowedTools: ["Edit"],
    });

    const call = runOnce.runOnce.mock.calls[0][0];
    expect(call.provider).toBe("claude");
    expect(call.spawn.allowedTools).toEqual(["Edit"]);
    expect(call.spawn.outputFormat).toBe("stream-json");
    expect(typeof call.prompt).toBe("string");
    expect(call.prompt).toContain("const x = 1;");
    expect(call.prompt).toContain("rename to y");
  });

  it("modifyDocument() uses permissionMode 'plan' for spec/document review flows", async () => {
    await svc.modifyDocument({
      provider: "claude",
      repoPath: "/r",
      model: "claude-sonnet-4-6",
      document: "# Spec\n...",
      instruction: "tighten requirement 3",
      allowedTools: ["Read"],
      permissionMode: "plan",
    });

    const call = runOnce.runOnce.mock.calls[0][0];
    expect(call.spawn.permissionMode).toBe("plan");
    expect(call.spawn.allowedTools).toEqual(["Read"]);
    expect(call.spawn.outputFormat).toBe("stream-json");
  });

  it("threads resumeSessionId through to spawn options when prior turn exists", async () => {
    await svc.ask({
      provider: "claude",
      repoPath: "/r",
      model: "claude-sonnet-4-6",
      prompt: "follow up",
      allowedTools: ["Read"],
      resumeSessionId: "s-existing",
    });

    expect(runOnce.runOnce.mock.calls[0][0].spawn.resumeSessionId).toBe("s-existing");
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `pnpm --filter @magenta/daemon test AiEditApplicationService`
Expected: FAIL — constructor signature still accepts `AiCliGateway`, not `AIRunOnceApplicationService`; `ask`/`editSelection`/`modifyDocument` still call `gateway.run(...)` so `runOnce.runOnce` is never invoked.

- [ ] **Step 3: Implement the migration**

Open `packages/daemon/src/application/AiEditApplicationService.ts` and:

1. Replace the constructor dependency:

```ts
import type { AIRunOnceApplicationService } from "./AIRunOnceApplicationService";
import type { AISpawnOptions } from "@magenta/shared/aiSpawnOptions";

export class AiEditApplicationService {
  constructor(private readonly runOnceService: AIRunOnceApplicationService) {}
  // ...
}
```

2. Rewrite the three chat methods so each builds an `AISpawnOptions` from its existing arguments and delegates to `runOnceService.runOnce(...)`. Stream output is consumed via the `ai-session:event` push channel that `AIRunOnceApplicationService` already emits; chat methods no longer take per-call `onChunk`/`onSessionId` callbacks (the renderer subscribes to push frames). Return value: the terminal `stdout` (or `structuredOutput`, when set) so existing IPC handlers stay shape-compatible.

```ts
async ask(args: AskArgs): Promise<string> {
  const spawn: AISpawnOptions = {
    model: args.model,
    allowedTools: args.allowedTools,
    disallowedTools: args.disallowedTools,
    systemPromptAppend: args.systemPromptAppend,
    resumeSessionId: args.resumeSessionId,
    outputFormat: "stream-json",
  };
  const result = await this.runOnceService.runOnce({
    provider: args.provider,
    repoPath: args.repoPath,
    worktreePath: args.worktreePath,
    prompt: args.prompt,
    spawn,
  });
  return result.stdout;
}

async editSelection(args: EditSelectionArgs): Promise<string> {
  const spawn: AISpawnOptions = {
    model: args.model,
    allowedTools: args.allowedTools,
    disallowedTools: args.disallowedTools,
    systemPromptAppend: args.systemPromptAppend,
    resumeSessionId: args.resumeSessionId,
    outputFormat: "stream-json",
  };
  const prompt = buildSelectionEditPrompt(args.selection, args.instruction);
  const result = await this.runOnceService.runOnce({
    provider: args.provider,
    repoPath: args.repoPath,
    worktreePath: args.worktreePath,
    prompt,
    spawn,
  });
  return result.stdout;
}

async modifyDocument(args: ModifyDocumentArgs): Promise<string> {
  const spawn: AISpawnOptions = {
    model: args.model,
    allowedTools: args.allowedTools,
    disallowedTools: args.disallowedTools,
    systemPromptAppend: args.systemPromptAppend,
    resumeSessionId: args.resumeSessionId,
    permissionMode: args.permissionMode ?? "default",
    outputFormat: "stream-json",
  };
  const prompt = buildDocumentModifyPrompt(args.document, args.instruction);
  const result = await this.runOnceService.runOnce({
    provider: args.provider,
    repoPath: args.repoPath,
    worktreePath: args.worktreePath,
    prompt,
    spawn,
  });
  return result.stdout;
}
```

(Keep the existing `buildSelectionEditPrompt` / `buildDocumentModifyPrompt` helpers — they are still pure prompt assembly and have not changed.)

3. Delete the now-orphaned `AiCliGateway` import and field if no remaining method uses it. If any non-chat method still calls `AiCliGateway.run()` directly, leave that path untouched (out of scope).

- [ ] **Step 4: Re-wire `DaemonContainer`**

In `packages/daemon/src/DaemonContainer.ts`, locate where `AiEditApplicationService` is constructed. Replace the `aiCliGateway` argument with `aiRunOnceService` (added in Task 8, Step 1):

```ts
this.aiEditService = new AiEditApplicationService(this.aiRunOnceService);
```

Ensure the `aiRunOnceService` field is declared **before** `aiEditService` in the constructor body so the dependency is initialised first.

- [ ] **Step 5: Run tests and verify they pass**

Run: `pnpm --filter @magenta/daemon test AiEditApplicationService`
Expected: PASS, 4 tests.

Run: `pnpm --filter @magenta/daemon typecheck`
Expected: PASS.

Run: `pnpm --filter @magenta/daemon build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/application/AiEditApplicationService.ts packages/daemon/src/application/AiEditApplicationService.test.ts packages/daemon/src/DaemonContainer.ts
git commit -m "refactor(daemon): chat bubble routes through AIRunOnceApplicationService"
```

---

## Task 11: Workspace verification

- [ ] **Step 1: Confirm no orphan inline argv assembly leaked into Phase 2 files**

Run: `rtk grep -n "args.push\|argv.push" packages/daemon/src/application/ packages/daemon/src/ipc/handlers/aiRunOnceHandlers.ts`
Expected: zero hits. (All argv composition still flows through Phase 1's `getToArgv`.)

- [ ] **Step 2: Workspace typecheck**

Run: `pnpm -w typecheck`
Expected: All packages clean.

- [ ] **Step 3: Workspace tests**

Run: `pnpm -w test`
Expected: All tests pass; new tests from Tasks 1, 2, 4, 5, 6 included.

- [ ] **Step 4: Workspace build**

Run: `pnpm -w build`
Expected: All packages build.

- [ ] **Step 5: Stop here per `feedback_verification.md`**

Do not launch the app. Steven runs manual E2E. Report:

> Phase 2 done. `ai:run-once` IPC ships end-to-end: schema validated at the boundary, capability-checked against the provider manifest, executed via the typed `runOnceWithSpawn` gateway, parsed through the pure `streamJsonParser`, and surfaced as `ai-session:event` push events plus a typed result with `tokenUsage`, `costUsd`, and `retriesSeen`. Caps raise `AppError("AI_BUDGET_EXCEEDED" | "AI_TURN_LIMIT")` with usage attached. Copilot one-shot supports `--silent` and `--output-format json` via the Phase 1 adapter (no Copilot stream parsing yet — Copilot output is still treated as opaque stdout). Awaiting manual E2E before Phase 3.

---

## Spec coverage check

| Spec / Plan reference | Requirement | Covered by |
|---|---|---|
| Plan §4 Phase 2 (1) | New IPC request `ai:run-once` | Task 2 (request schema) · Task 7 (handler) · Task 8 (wiring) · Task 9 (renderer typing) |
| Plan §4 Phase 2 (2) | Stream parser at `domain/streamJsonParser.ts` with fixtures | Task 4 |
| Plan §4 Phase 2 (3) | IPC push `ai-session:event` carrying `AIStreamEvent` | Task 1 (schema) · Task 2 (push variant) · Task 6 (emission) |
| Plan §4 Phase 2 (4) | Status detection from stream events when `outputFormat=stream-json` | Task 6 (`useStreamParser` branch — events drive `sessionId`, retries, result) |
| Plan §4 Phase 2 (5) | Budget / turn caps surfaced as `AppError("AI_BUDGET_EXCEEDED" \| "AI_TURN_LIMIT")` with usage attached | Task 3 (codes) · Task 4 (`capExceeded` parsing) · Task 6 (translation) |
| Plan §4 Phase 2 (6) | Copilot `--silent` and `--output-format json` for one-shot runs | Task 6 (passthrough validated by capability manifest; argv produced by Phase 1's `toArgvCopilot`) |
| Spec FR-5.1 | `AIStreamEvent` discriminated union with all 9+ kinds | Task 1 |
| Spec FR-5.2 | Every variant carries `{sessionId, seq, timestamp}` | Task 1 (`Base` mixin) · Task 4 (parser stamps `seq` + `timestamp` + `sessionId`) |
| Spec FR-5.3 | Provider-specific events translated to `AIStreamEvent`; fallback to `raw-pty` when structured output unavailable | Task 4 (Claude translation) · Task 6 (`useStreamParser` gate; non-stream Copilot path emits no events — raw-pty fallback is a Phase 7 concern, deferred) |
| Spec FR-5.4 | Consumers don't need to know which provider produced an event | Task 1 (provider field absent from event) |
| Spec FR-6.1 | `ai:run-once` shape `{provider, repoPath, worktreePath?, prompt, spawn, timeoutMs?}` → `{exitCode, stdout?, stderr?, sessionId?, tokenUsage?, costUsd?, retries, events?}` | Task 2 (schemas) · Task 6 (return shape) · Task 7 (handler) |
| Spec FR-6.2 | When `spawn.outputFormat === "json"` and `spawn.jsonSchema` set, response includes validated `structuredOutput` | Task 6 (captures `result.output` into `structuredOutput`); JSON-Schema validation against `spawn.jsonSchema` deferred to Phase 3 (no fixture available without schema lib selection) — flagged in spec coverage |
| Spec FR-6.3 | On budget/turn exceeded, `AppError("AI_BUDGET_EXCEEDED" \| "AI_TURN_LIMIT")` with usage attached | Task 6 |
| Spec §8.2 | `AIStreamEvent` shape | Task 1 |
| Spec §8.4 (`ai:run-once` row) | New IPC request signature | Task 2 (schema) · Task 7 (handler) · Task 9 (renderer) |
| Spec §8.4 (`ai-session:event` row) | New push event signature | Task 2 (push variant) · Task 6 (emit) |
| Spec AC-6 | `maxTurns: 3` or `maxBudgetUsd: 0.10` aborts with `AppError("AI_TURN_LIMIT" \| "AI_BUDGET_EXCEEDED")`; UI renders attached usage | Task 4 (`capExceeded` parsing) · Task 6 (error translation with `details: { tokenUsage, costUsd }`) |
| Plan boundary requirement | Daemon raises `AppError("UNSUPPORTED_SPAWN_OPTION", offendingField, provider)` at IPC boundary | Task 3 (code) · Task 6 (manifest check) |
| Unification spec (`2026-04-25-chat-bubble-unification.md`) | Chat bubble (`ai-chat:ask`, `ai-chat:edit-selection`, `ai-chat:modify-document`) routes through unified `AIRunOnceApplicationService` instead of calling `AiCliGateway.run()` directly | Task 10 |

**Out-of-scope deferrals** (covered by later phase plans):
- FR-5.3 raw-pty fallback for non-stream Copilot one-shots → deferred (Copilot one-shot returns opaque stdout in Phase 2; raw-pty frame emission is a Phase 7 observability concern).
- FR-6.2 strict JSON-Schema validation of `structuredOutput` against `spawn.jsonSchema` → Phase 3 (paired with `--bare` materialization).
- Persisting `tokenUsage` / `costUsd` to `ai_sessions` rows (migration 15) → Phase 7.
- UI surfaces (Kanban "Run task programmatically" dialog) → follow-up; the Phase 2 IPC is sufficient for scripted callers.
- `ai-session:fork`, `--session-id` round-trip, idempotent reconnect → Phase 5.
- `permissionPromptTool` MCP server registration → Phase 4.
- Preset library (`ai:presets:*`, `ai:list-agents`) → Phase 4 / Phase 6.
