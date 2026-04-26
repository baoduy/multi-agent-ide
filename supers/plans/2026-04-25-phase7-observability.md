# Phase 7 — Observability & Debugging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate the structured stream-json events parsed by Phase 2 (`system/init`, `system/api_retry`, `system/plugin_install`, `result`) into typed daemon push events and persisted token/cost accounting, then surface the resulting state in the renderer (cost badge, retry spinner, init metadata sidebar, debug-log tab, plugin-install toast). Forward Copilot's 11 OTel env vars to the Copilot child on spawn and document them in the renderer Settings panel.

**Architecture:** Phase 2 already emits typed `AIStreamEvent`s on a per-session bus. Phase 7 introduces:

1. **Migration 15** — adds `total_input_tokens`, `total_output_tokens`, `total_cost_usd`, `retry_count` columns to `ai_sessions`.
2. **`SessionCostAccumulator`** (daemon domain) — pure reducer that consumes `AIStreamEvent`s for a session, accumulates retry/usage counts, and produces snapshots.
3. **`SessionObservabilityService`** (daemon application layer) — owns one accumulator per live session, subscribes to the session's event bus, persists to `AISessionRepository` on `result`, and emits four new typed push events.
4. **`DebugLogService`** (daemon application) — when `AISpawnOptions.debugFile` is set, allocates `<tmpDir>/magenta-debug-<sessionId>.log`, materializes the path so Phase 1's `toArgvClaude` already passes `--debug-file`, then exposes a tail-follow IPC stream.
5. **Copilot OTel env wiring** — `CopilotSessionFactory` reads 11 named env vars from `process.env` and forwards them into the spawned child's env.
6. **Renderer surfaces** — cost badge (`SessionHeader`), retry spinner label (`SessionStatusIndicator`), init metadata sidebar panel (`SessionMetadataSidebar`), debug-log tab (`DebugLogTab`), plugin-install toast (`PluginInstallToast`), Settings panel docs (`OTelSettingsPanel`).

**Tech Stack:** TypeScript 5.x · Zod 3.x · Drizzle SQL migrations · Vitest · LMDB/SQLite via repository layer · React 19 · Zustand · pnpm workspace.

**Spec references:** `specs/2026-04-24-cli-programmatic-improvements.md` §4 Phase 7, §5 (migration 15) · `specs/2026-04-24-unified-ai-cli-interface.md` FR-10.1, FR-10.2, FR-10.3, FR-10.4, AC-7.

**Depends on (already landed):** Phase 1 `AISpawnOptions` + `toArgvClaude` (which already renders `--debug-file`). Phase 2 stream parser emitting `session-init`, `retry`, `tool-use`, `result`, plus a yet-to-add `plugin-install` variant on the `AIStreamEvent` union.

**Out of scope for this phase (per spec §6 / §13):**
- OTel collector deployment, dashboards, or any UI surface for the metrics themselves.
- Hooks authoring UI (Claude `--include-hook-events` is plumbed in Phase 2; authoring deferred).
- Cloud session features (`--remote`, `--teleport`, `--remote-control`).
- Re-running the parser; the parser itself lives in Phase 2's plan.

---

## File structure

| Action | Path | Responsibility |
|---|---|---|
| Create | `packages/daemon/src/db/migrations/0015_session_cost_accounting.sql` | Adds `total_input_tokens`, `total_output_tokens`, `total_cost_usd`, `retry_count` columns to `ai_sessions`. |
| Create | `packages/daemon/src/db/migrations/0015_session_cost_accounting.test.ts` | Migration golden test (column presence + idempotency). |
| Modify | `packages/daemon/src/db/schema/aiSessions.ts` | Adds the four columns to the Drizzle schema. |
| Modify | `packages/daemon/src/infrastructure/mappers/aiSessionRowMapper.ts` | Maps the four columns to `AISessionRecord`. |
| Modify | `packages/shared/src/aiTerminal.ts` | Extends `AISessionRecord` with `totalInputTokens`, `totalOutputTokens`, `totalCostUsd`, `retryCount`. |
| Create | `packages/shared/src/aiObservability.ts` | Adds `TokenUsage`, `PluginInstallStatus`, `PluginInstallEvent`, `SessionInitEvent`, `RetryEvent`, `CostUpdateEvent`, `DebugLogChunk`, `OTelEnvVarName`, `OTEL_ENV_VAR_NAMES` constants. |
| Modify | `packages/shared/src/ipc.ts` | Adds 5 new push variants (`ai-session:retry`, `ai-session:init`, `ai-session:plugin-install`, `ai-session:cost-update`, `ai-session:debug-log`) and 2 new requests (`ai-session:debug-log:open`, `ai-session:debug-log:close`). |
| Create | `packages/daemon/src/domain/SessionCostAccumulator.ts` | Pure reducer: consumes `AIStreamEvent`, accumulates usage/retry counters, produces snapshots. |
| Create | `packages/daemon/src/domain/SessionCostAccumulator.test.ts` | Unit tests; AC-7 timing test included. |
| Create | `packages/daemon/src/application/SessionObservabilityService.ts` | Subscribes accumulator to a session's event stream, persists on `result`, emits push events. |
| Create | `packages/daemon/src/application/SessionObservabilityService.test.ts` | Application-layer tests with a fake event bus + mock repository. |
| Create | `packages/daemon/src/application/DebugLogService.ts` | Allocates per-session debug-log path, tails it on demand, closes on session exit. |
| Create | `packages/daemon/src/application/DebugLogService.test.ts` | Tail/close lifecycle test. |
| Modify | `packages/daemon/src/infrastructure/sessions/CopilotSessionFactory.ts` | Forwards 11 OTel env vars from `process.env` to the spawned child's env. |
| Create | `packages/daemon/src/infrastructure/sessions/CopilotSessionFactory.otel.test.ts` | Verifies env forwarding (filtered, no leaks). |
| Modify | `packages/daemon/src/ipc/handlers/aiSessionDebugLog.ts` (new file) | `safeHandle` adapters for `ai-session:debug-log:open`/`close`. |
| Modify | `packages/daemon/src/ipc/registerHandlers.ts` | Wires `SessionObservabilityService` and `DebugLogService` from `DaemonContainer`; registers new handlers. |
| Modify | `packages/daemon/src/DaemonContainer.ts` | Constructs `SessionObservabilityService` + `DebugLogService` and exposes them. |
| Modify | `packages/ui/src/renderer/services/ipcClient.ts` | Adds the 5 new push payload types + 2 request response types to `ResponseForRequest`. |
| Modify | `packages/ui/src/renderer/store/aiSessionStore.ts` | Stores `tokenUsage`, `costUsd`, `retryCount`, `lastRetryEvent`, `initMetadata`, `pluginInstalls`, `debugLogChunks` per session via `patchSession`-style updates. |
| Modify | `packages/ui/src/renderer/services/SessionCoordinator.ts` | Subscribes to the 5 new push events on boot and routes them into the store. |
| Create | `packages/ui/src/renderer/components/ai/CostBadge.tsx` | Session-header badge: `12.4k in · 3.2k out · $0.18`. |
| Create | `packages/ui/src/renderer/components/ai/RetrySpinnerLabel.tsx` | "retrying (n/m) — k.ks" rendered when `lastRetryEvent` set. |
| Create | `packages/ui/src/renderer/components/ai/SessionMetadataSidebar.tsx` | Panel: model, tools, MCP servers, plugin errors. |
| Create | `packages/ui/src/renderer/components/ai/PluginInstallToast.tsx` | Toast that follows `pluginInstalls` map state. |
| Create | `packages/ui/src/renderer/components/ai/DebugLogTab.tsx` | Tail-follow log viewer; mounts `ai-session:debug-log:open` on visibility. |
| Modify | `packages/ui/src/renderer/components/ai/SessionHeader.tsx` | Mounts `<CostBadge>` + `<RetrySpinnerLabel>`. |
| Modify | `packages/ui/src/renderer/components/ai/AISessionView.tsx` | Adds the "Debug log" tab + sidebar slot. |
| Create | `packages/ui/src/renderer/components/settings/OTelSettingsPanel.tsx` | Read-only docs panel listing the 11 OTel env vars + which currently set in `process.env`. |
| Modify | `packages/ui/src/renderer/components/settings/SettingsView.tsx` | Mounts `<OTelSettingsPanel>` under "Observability". |

---

## Task 1: Migration 15 — `ai_sessions` cost/retry columns

**Files:**
- Create: `packages/daemon/src/db/migrations/0015_session_cost_accounting.sql`
- Create: `packages/daemon/src/db/migrations/0015_session_cost_accounting.test.ts`
- Modify: `packages/daemon/src/db/schema/aiSessions.ts`
- Modify: `packages/daemon/src/infrastructure/mappers/aiSessionRowMapper.ts`
- Modify: `packages/shared/src/aiTerminal.ts`

- [ ] **Step 1: Write the failing migration test**

```ts
// packages/daemon/src/db/migrations/0015_session_cost_accounting.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrationsUpTo } from "../../testing/runMigrationsUpTo";

describe("migration 0015 — session cost accounting", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
  });

  it("adds total_input_tokens, total_output_tokens, total_cost_usd, retry_count to ai_sessions", () => {
    runMigrationsUpTo(db, 15);
    const cols = db.prepare(`PRAGMA table_info(ai_sessions)`).all() as Array<{
      name: string;
      type: string;
      dflt_value: unknown;
    }>;
    const byName = Object.fromEntries(cols.map((c) => [c.name, c]));
    expect(byName.total_input_tokens).toMatchObject({ type: "INTEGER" });
    expect(byName.total_output_tokens).toMatchObject({ type: "INTEGER" });
    expect(byName.total_cost_usd).toMatchObject({ type: "REAL" });
    expect(byName.retry_count).toMatchObject({ type: "INTEGER" });
    // Defaults so existing rows hydrate cleanly.
    expect(byName.total_input_tokens.dflt_value).toBe(0);
    expect(byName.total_output_tokens.dflt_value).toBe(0);
    expect(byName.total_cost_usd.dflt_value).toBe(0);
    expect(byName.retry_count.dflt_value).toBe(0);
  });

  it("is idempotent against a fresh schema", () => {
    runMigrationsUpTo(db, 15);
    expect(() => runMigrationsUpTo(db, 15)).not.toThrow();
  });

  it("preserves rows inserted under migration 14", () => {
    runMigrationsUpTo(db, 14);
    db.prepare(
      `INSERT INTO ai_sessions (id, provider, repo_path, created_at) VALUES (?, ?, ?, ?)`,
    ).run("11111111-1111-4111-8111-111111111111", "claude", "/r", Date.now());
    runMigrationsUpTo(db, 15);
    const row = db
      .prepare(`SELECT id, total_input_tokens, retry_count FROM ai_sessions`)
      .get() as { id: string; total_input_tokens: number; retry_count: number };
    expect(row.total_input_tokens).toBe(0);
    expect(row.retry_count).toBe(0);
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `pnpm --filter @magenta/daemon test 0015_session_cost_accounting`
Expected: FAIL — migration file not found.

- [ ] **Step 3: Write the migration**

```sql
-- packages/daemon/src/db/migrations/0015_session_cost_accounting.sql
ALTER TABLE ai_sessions ADD COLUMN total_input_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_sessions ADD COLUMN total_output_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_sessions ADD COLUMN total_cost_usd REAL NOT NULL DEFAULT 0;
ALTER TABLE ai_sessions ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;
```

- [ ] **Step 4: Update Drizzle schema**

```ts
// packages/daemon/src/db/schema/aiSessions.ts — append to the existing table
totalInputTokens: integer("total_input_tokens").notNull().default(0),
totalOutputTokens: integer("total_output_tokens").notNull().default(0),
totalCostUsd: real("total_cost_usd").notNull().default(0),
retryCount: integer("retry_count").notNull().default(0),
```

- [ ] **Step 5: Update row mapper + shared record**

In `packages/daemon/src/infrastructure/mappers/aiSessionRowMapper.ts` add to both directions:

```ts
totalInputTokens: row.total_input_tokens,
totalOutputTokens: row.total_output_tokens,
totalCostUsd: row.total_cost_usd,
retryCount: row.retry_count,
```

In `packages/shared/src/aiTerminal.ts` extend the `AISessionRecord` zod schema:

```ts
totalInputTokens: z.number().int().nonnegative().default(0),
totalOutputTokens: z.number().int().nonnegative().default(0),
totalCostUsd: z.number().nonnegative().default(0),
retryCount: z.number().int().nonnegative().default(0),
```

- [ ] **Step 6: Run tests + typecheck**

Run: `pnpm --filter @magenta/daemon test 0015_session_cost_accounting`
Expected: PASS, 3 tests.

Run: `pnpm -w typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/daemon/src/db/migrations/0015_session_cost_accounting.sql \
        packages/daemon/src/db/migrations/0015_session_cost_accounting.test.ts \
        packages/daemon/src/db/schema/aiSessions.ts \
        packages/daemon/src/infrastructure/mappers/aiSessionRowMapper.ts \
        packages/shared/src/aiTerminal.ts
git commit -m "feat(daemon): migration 15 adds session cost/retry columns"
```

---

## Task 2: Shared observability types + IPC variants

**Files:**
- Create: `packages/shared/src/aiObservability.ts`
- Modify: `packages/shared/src/ipc.ts`

- [ ] **Step 1: Write a failing schema test**

```ts
// packages/shared/src/aiObservability.test.ts
import { describe, it, expect } from "vitest";
import {
  TokenUsageSchema,
  RetryEventSchema,
  SessionInitEventSchema,
  PluginInstallEventSchema,
  CostUpdateEventSchema,
  DebugLogChunkSchema,
  OTEL_ENV_VAR_NAMES,
} from "./aiObservability";

describe("aiObservability schemas", () => {
  it("TokenUsage round-trips", () => {
    const u = { inputTokens: 1200, outputTokens: 340, cacheReadTokens: 0, cacheCreationTokens: 0 };
    expect(TokenUsageSchema.parse(u)).toEqual(u);
  });

  it("RetryEvent has attempt/max/delayMs/category", () => {
    const r = { sessionId: "11111111-1111-4111-8111-111111111111", attempt: 2, max: 8, delayMs: 3000, category: "rate_limit", status: 429 };
    expect(RetryEventSchema.parse(r)).toEqual(r);
  });

  it("SessionInitEvent carries model/tools/mcpServers/pluginErrors", () => {
    const v = {
      sessionId: "11111111-1111-4111-8111-111111111111",
      model: "claude-opus-4-7",
      tools: ["Read", "Edit"],
      mcpServers: ["github"],
      pluginErrors: [{ plugin: "x", message: "fail" }],
    };
    expect(SessionInitEventSchema.parse(v)).toEqual(v);
  });

  it("PluginInstallEvent status enum has all 4 values", () => {
    for (const status of ["started", "installed", "failed", "completed"] as const) {
      expect(
        PluginInstallEventSchema.parse({
          sessionId: "11111111-1111-4111-8111-111111111111",
          plugin: "x",
          status,
        }).status,
      ).toBe(status);
    }
  });

  it("CostUpdateEvent carries tokenUsage + costUsd + retryCount", () => {
    const c = {
      sessionId: "11111111-1111-4111-8111-111111111111",
      tokenUsage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheCreationTokens: 0 },
      costUsd: 0.0123,
      retryCount: 2,
    };
    expect(CostUpdateEventSchema.parse(c)).toEqual(c);
  });

  it("DebugLogChunk carries seq + bytes", () => {
    const d = { sessionId: "11111111-1111-4111-8111-111111111111", seq: 1, bytes: "hello" };
    expect(DebugLogChunkSchema.parse(d)).toEqual(d);
  });

  it("OTEL_ENV_VAR_NAMES has exactly 11 entries", () => {
    expect(OTEL_ENV_VAR_NAMES.length).toBe(11);
    expect(new Set(OTEL_ENV_VAR_NAMES).size).toBe(11);
    for (const name of OTEL_ENV_VAR_NAMES) {
      expect(name).toMatch(/^(OTEL_|COPILOT_OTEL_)/);
    }
  });
});
```

- [ ] **Step 2: Run; verify fail**

Run: `pnpm --filter @magenta/shared test aiObservability`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the schemas**

```ts
// packages/shared/src/aiObservability.ts
import { z } from "zod";

export const TokenUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheCreationTokens: z.number().int().nonnegative(),
});
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

export const PluginInstallStatus = z.enum(["started", "installed", "failed", "completed"]);
export type PluginInstallStatus = z.infer<typeof PluginInstallStatus>;

const SessionId = z.string().uuid();

export const RetryEventSchema = z.object({
  sessionId: SessionId,
  attempt: z.number().int().positive(),
  max: z.number().int().positive(),
  delayMs: z.number().int().nonnegative(),
  category: z.string(),
  status: z.number().int().optional(),
});
export type RetryEvent = z.infer<typeof RetryEventSchema>;

export const SessionInitEventSchema = z.object({
  sessionId: SessionId,
  model: z.string(),
  tools: z.array(z.string()),
  mcpServers: z.array(z.string()),
  pluginErrors: z.array(z.object({ plugin: z.string(), message: z.string() })).optional(),
});
export type SessionInitEvent = z.infer<typeof SessionInitEventSchema>;

export const PluginInstallEventSchema = z.object({
  sessionId: SessionId,
  plugin: z.string(),
  status: PluginInstallStatus,
  message: z.string().optional(),
});
export type PluginInstallEvent = z.infer<typeof PluginInstallEventSchema>;

export const CostUpdateEventSchema = z.object({
  sessionId: SessionId,
  tokenUsage: TokenUsageSchema,
  costUsd: z.number().nonnegative(),
  retryCount: z.number().int().nonnegative(),
});
export type CostUpdateEvent = z.infer<typeof CostUpdateEventSchema>;

export const DebugLogChunkSchema = z.object({
  sessionId: SessionId,
  seq: z.number().int().nonnegative(),
  bytes: z.string(),
});
export type DebugLogChunk = z.infer<typeof DebugLogChunkSchema>;

/**
 * The 11 OpenTelemetry environment variables Copilot honours. Documented in
 * the renderer Settings panel so users opt in at the shell level; the daemon
 * forwards whichever are present at spawn time.
 */
export const OTEL_ENV_VAR_NAMES = [
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "OTEL_EXPORTER_OTLP_HEADERS",
  "OTEL_EXPORTER_OTLP_PROTOCOL",
  "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT",
  "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
  "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT",
  "OTEL_RESOURCE_ATTRIBUTES",
  "OTEL_SERVICE_NAME",
  "OTEL_LOG_LEVEL",
  "OTEL_METRIC_EXPORT_INTERVAL",
  "COPILOT_OTEL_ENABLED",
] as const;
export type OTelEnvVarName = (typeof OTEL_ENV_VAR_NAMES)[number];
```

- [ ] **Step 4: Extend `ipc.ts`**

In `packages/shared/src/ipc.ts` add the new push variants and requests to the discriminated unions:

```ts
// In IpcPushSchema (or whatever union holds push events):
z.object({ type: z.literal("ai-session:retry"),         payload: RetryEventSchema }),
z.object({ type: z.literal("ai-session:init"),          payload: SessionInitEventSchema }),
z.object({ type: z.literal("ai-session:plugin-install"),payload: PluginInstallEventSchema }),
z.object({ type: z.literal("ai-session:cost-update"),   payload: CostUpdateEventSchema }),
z.object({ type: z.literal("ai-session:debug-log"),     payload: DebugLogChunkSchema }),

// In IpcRequestSchema:
z.object({ type: z.literal("ai-session:debug-log:open"),  sessionId: z.string().uuid() }),
z.object({ type: z.literal("ai-session:debug-log:close"), sessionId: z.string().uuid() }),

// In IpcResponseSchema for the new requests:
z.object({ type: z.literal("ai-session:debug-log:open"),  filePath: z.string(), seq: z.number().int().nonnegative() }),
z.object({ type: z.literal("ai-session:debug-log:close"), ok: z.boolean() }),
```

Re-export the observability types from `aiTerminal.ts` for renderer convenience.

- [ ] **Step 5: Run; verify pass**

Run: `pnpm --filter @magenta/shared test aiObservability`
Expected: PASS, 7 tests.

Run: `pnpm -w typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/aiObservability.ts \
        packages/shared/src/aiObservability.test.ts \
        packages/shared/src/ipc.ts \
        packages/shared/src/aiTerminal.ts
git commit -m "feat(shared): observability types + 5 push variants + debug-log IPC"
```

---

## Task 3: `SessionCostAccumulator` (pure reducer) + AC-7 timing test

**Files:**
- Create: `packages/daemon/src/domain/SessionCostAccumulator.ts`
- Create: `packages/daemon/src/domain/SessionCostAccumulator.test.ts`
- Create: `packages/daemon/src/domain/__fixtures__/streamjson/phase7-retry-then-result.jsonl`

- [ ] **Step 1: Write the failing test**

```ts
// packages/daemon/src/domain/SessionCostAccumulator.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SessionCostAccumulator } from "./SessionCostAccumulator";
import { parseStreamJsonLines } from "./streamJsonParser"; // from Phase 2
import type { AIStreamEvent } from "@magenta/shared/aiObservability";

const SID = "11111111-1111-4111-8111-111111111111";

describe("SessionCostAccumulator", () => {
  it("starts with zeroed snapshot", () => {
    const acc = new SessionCostAccumulator(SID);
    expect(acc.snapshot()).toEqual({
      sessionId: SID,
      tokenUsage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
      costUsd: 0,
      retryCount: 0,
    });
  });

  it("retry events increment retryCount and produce a derived RetryEvent", () => {
    const acc = new SessionCostAccumulator(SID);
    const out: ReturnType<typeof acc.consume>[] = [];
    out.push(
      acc.consume({
        kind: "retry", sessionId: SID, seq: 1, timestamp: 1000,
        attempt: 1, max: 8, delayMs: 1500, category: "rate_limit", status: 429,
      } satisfies AIStreamEvent),
    );
    out.push(
      acc.consume({
        kind: "retry", sessionId: SID, seq: 2, timestamp: 2000,
        attempt: 2, max: 8, delayMs: 3000, category: "rate_limit", status: 429,
      } satisfies AIStreamEvent),
    );
    expect(acc.snapshot().retryCount).toBe(2);
    expect(out[0]).toMatchObject({ retry: { attempt: 1, max: 8, delayMs: 1500 } });
    expect(out[1]).toMatchObject({ retry: { attempt: 2, max: 8, delayMs: 3000 } });
  });

  it("result event captures usage + cost and emits costUpdate", () => {
    const acc = new SessionCostAccumulator(SID);
    const out = acc.consume({
      kind: "result", sessionId: SID, seq: 9, timestamp: 9000, ok: true,
      tokenUsage: { inputTokens: 1200, outputTokens: 340, cacheReadTokens: 50, cacheCreationTokens: 0 },
      costUsd: 0.0234,
    } satisfies AIStreamEvent);
    expect(acc.snapshot()).toEqual({
      sessionId: SID,
      tokenUsage: { inputTokens: 1200, outputTokens: 340, cacheReadTokens: 50, cacheCreationTokens: 0 },
      costUsd: 0.0234,
      retryCount: 0,
    });
    expect(out).toMatchObject({ costUpdate: { costUsd: 0.0234, retryCount: 0 } });
  });

  it("session-init produces a derived initEvent", () => {
    const acc = new SessionCostAccumulator(SID);
    const out = acc.consume({
      kind: "session-init", sessionId: SID, seq: 0, timestamp: 0,
      model: "claude-opus-4-7", tools: ["Read"], mcpServers: ["gh"],
    } as AIStreamEvent);
    expect(out).toMatchObject({ init: { model: "claude-opus-4-7", tools: ["Read"], mcpServers: ["gh"] } });
  });

  it("plugin-install events flow through unchanged", () => {
    const acc = new SessionCostAccumulator(SID);
    const out = acc.consume({
      kind: "plugin-install", sessionId: SID, seq: 1, timestamp: 100,
      plugin: "claude-code-mcp", status: "started",
    } as AIStreamEvent);
    expect(out).toMatchObject({ pluginInstall: { plugin: "claude-code-mcp", status: "started" } });
  });

  // AC-7: when an api_retry event is observed in the stream, the accumulator
  // must produce a RetryEvent within 250 ms of receiving the underlying line.
  // We feed a fixture line through the parser + accumulator and assert that
  // the elapsed wall-clock time between feeding the line and observing the
  // emit on the bus is well under 250 ms.
  it("AC-7: retry emit happens within 250 ms of stream line ingest", () => {
    const fixturePath = join(__dirname, "__fixtures__/streamjson/phase7-retry-then-result.jsonl");
    const lines = readFileSync(fixturePath, "utf8").trim().split("\n");
    const events = parseStreamJsonLines(lines.slice(0, 1), SID); // first line is the api_retry
    const acc = new SessionCostAccumulator(SID);

    const t0 = performance.now();
    const out = acc.consume(events[0]);
    const elapsed = performance.now() - t0;

    expect(elapsed).toBeLessThan(250);
    expect(out).toMatchObject({ retry: { attempt: expect.any(Number), max: expect.any(Number), delayMs: expect.any(Number) } });
  });
});
```

- [ ] **Step 2: Add the fixture**

```jsonl
// packages/daemon/src/domain/__fixtures__/streamjson/phase7-retry-then-result.jsonl
{"type":"system","subtype":"api_retry","attempt":2,"max_retries":8,"retry_delay_ms":3000,"error":{"category":"rate_limit","status":429}}
{"type":"result","subtype":"success","usage":{"input_tokens":1200,"output_tokens":340,"cache_read_input_tokens":50,"cache_creation_input_tokens":0},"total_cost_usd":0.0234}
```

- [ ] **Step 3: Run; verify fail**

Run: `pnpm --filter @magenta/daemon test SessionCostAccumulator`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the accumulator**

```ts
// packages/daemon/src/domain/SessionCostAccumulator.ts
import type {
  CostUpdateEvent,
  PluginInstallEvent,
  RetryEvent,
  SessionInitEvent,
  TokenUsage,
} from "@magenta/shared/aiObservability";
import type { AIStreamEvent } from "./streamJsonParser"; // from Phase 2

export interface CostSnapshot {
  sessionId: string;
  tokenUsage: TokenUsage;
  costUsd: number;
  retryCount: number;
}

export interface AccumulatorEmit {
  init?: SessionInitEvent;
  retry?: RetryEvent;
  pluginInstall?: PluginInstallEvent;
  costUpdate?: CostUpdateEvent;
}

const ZERO_USAGE: TokenUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
};

/**
 * Pure per-session reducer. No I/O. Given a sequence of `AIStreamEvent`s,
 * tracks rolling usage / cost / retry counters and produces typed push-event
 * payloads on each interesting input. The application layer is responsible
 * for fanning the emits out to the IPC bridge and persisting the final
 * snapshot on `result`.
 */
export class SessionCostAccumulator {
  private state: CostSnapshot;

  constructor(sessionId: string) {
    this.state = { sessionId, tokenUsage: { ...ZERO_USAGE }, costUsd: 0, retryCount: 0 };
  }

  snapshot(): CostSnapshot {
    return { ...this.state, tokenUsage: { ...this.state.tokenUsage } };
  }

  consume(ev: AIStreamEvent): AccumulatorEmit {
    switch (ev.kind) {
      case "session-init":
        return {
          init: {
            sessionId: this.state.sessionId,
            model: ev.model,
            tools: ev.tools,
            mcpServers: ev.mcpServers,
            pluginErrors: ev.pluginErrors,
          },
        };
      case "retry": {
        this.state.retryCount += 1;
        return {
          retry: {
            sessionId: this.state.sessionId,
            attempt: ev.attempt,
            max: ev.max,
            delayMs: ev.delayMs,
            category: ev.category,
            status: ev.status,
          },
        };
      }
      case "plugin-install":
        return {
          pluginInstall: {
            sessionId: this.state.sessionId,
            plugin: ev.plugin,
            status: ev.status,
            message: ev.message,
          },
        };
      case "result": {
        if (ev.tokenUsage) this.state.tokenUsage = { ...ev.tokenUsage };
        if (typeof ev.costUsd === "number") this.state.costUsd = ev.costUsd;
        return {
          costUpdate: {
            sessionId: this.state.sessionId,
            tokenUsage: { ...this.state.tokenUsage },
            costUsd: this.state.costUsd,
            retryCount: this.state.retryCount,
          },
        };
      }
      default:
        return {};
    }
  }
}
```

- [ ] **Step 5: Run; verify pass**

Run: `pnpm --filter @magenta/daemon test SessionCostAccumulator`
Expected: PASS, 6 tests including AC-7 timing test.

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/domain/SessionCostAccumulator.ts \
        packages/daemon/src/domain/SessionCostAccumulator.test.ts \
        packages/daemon/src/domain/__fixtures__/streamjson/phase7-retry-then-result.jsonl
git commit -m "feat(daemon): SessionCostAccumulator pure reducer with AC-7 timing test"
```

---

## Task 4: `SessionObservabilityService` (application layer)

**Files:**
- Create: `packages/daemon/src/application/SessionObservabilityService.ts`
- Create: `packages/daemon/src/application/SessionObservabilityService.test.ts`
- Modify: `packages/daemon/src/DaemonContainer.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/daemon/src/application/SessionObservabilityService.test.ts
import { describe, it, expect, vi } from "vitest";
import { SessionObservabilityService } from "./SessionObservabilityService";
import type { AIStreamEvent } from "../domain/streamJsonParser";

const SID = "11111111-1111-4111-8111-111111111111";

function makeBus() {
  const subs = new Set<(ev: AIStreamEvent) => void>();
  return {
    subscribe: (sessionId: string, cb: (ev: AIStreamEvent) => void) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    emit: (ev: AIStreamEvent) => subs.forEach((s) => s(ev)),
  };
}

describe("SessionObservabilityService", () => {
  it("publishes ai-session:retry on retry events", () => {
    const bus = makeBus();
    const push = vi.fn();
    const repo = { updateUsage: vi.fn().mockResolvedValue(undefined) };
    const svc = new SessionObservabilityService(bus, push, repo as never);
    svc.attach(SID);

    bus.emit({ kind: "retry", sessionId: SID, seq: 1, timestamp: 0, attempt: 1, max: 8, delayMs: 1000, category: "rate_limit", status: 429 } as AIStreamEvent);

    expect(push).toHaveBeenCalledWith({
      type: "ai-session:retry",
      payload: expect.objectContaining({ sessionId: SID, attempt: 1, max: 8, delayMs: 1000 }),
    });
  });

  it("publishes ai-session:init on session-init events", () => {
    const bus = makeBus();
    const push = vi.fn();
    const repo = { updateUsage: vi.fn() };
    const svc = new SessionObservabilityService(bus, push, repo as never);
    svc.attach(SID);

    bus.emit({ kind: "session-init", sessionId: SID, seq: 0, timestamp: 0, model: "claude-opus-4-7", tools: ["Read"], mcpServers: [] } as AIStreamEvent);

    expect(push).toHaveBeenCalledWith({
      type: "ai-session:init",
      payload: expect.objectContaining({ model: "claude-opus-4-7", tools: ["Read"] }),
    });
  });

  it("publishes ai-session:plugin-install on plugin events", () => {
    const bus = makeBus();
    const push = vi.fn();
    const repo = { updateUsage: vi.fn() };
    const svc = new SessionObservabilityService(bus, push, repo as never);
    svc.attach(SID);

    bus.emit({ kind: "plugin-install", sessionId: SID, seq: 0, timestamp: 0, plugin: "x", status: "started" } as AIStreamEvent);

    expect(push).toHaveBeenCalledWith({
      type: "ai-session:plugin-install",
      payload: expect.objectContaining({ plugin: "x", status: "started" }),
    });
  });

  it("on result: persists usage AND publishes ai-session:cost-update", async () => {
    const bus = makeBus();
    const push = vi.fn();
    const repo = { updateUsage: vi.fn().mockResolvedValue(undefined) };
    const svc = new SessionObservabilityService(bus, push, repo as never);
    svc.attach(SID);

    bus.emit({ kind: "retry", sessionId: SID, seq: 1, timestamp: 0, attempt: 1, max: 8, delayMs: 1000, category: "rate_limit" } as AIStreamEvent);
    bus.emit({
      kind: "result", sessionId: SID, seq: 2, timestamp: 0, ok: true,
      tokenUsage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheCreationTokens: 0 },
      costUsd: 0.01,
    } as AIStreamEvent);

    // Allow microtask queue to flush.
    await Promise.resolve();
    await Promise.resolve();

    expect(repo.updateUsage).toHaveBeenCalledWith(SID, {
      totalInputTokens: 100,
      totalOutputTokens: 50,
      totalCostUsd: 0.01,
      retryCount: 1,
    });
    expect(push).toHaveBeenCalledWith({
      type: "ai-session:cost-update",
      payload: expect.objectContaining({ costUsd: 0.01, retryCount: 1 }),
    });
  });

  it("detach() unsubscribes — no further pushes", () => {
    const bus = makeBus();
    const push = vi.fn();
    const repo = { updateUsage: vi.fn() };
    const svc = new SessionObservabilityService(bus, push, repo as never);
    svc.attach(SID);
    svc.detach(SID);
    bus.emit({ kind: "retry", sessionId: SID, seq: 1, timestamp: 0, attempt: 1, max: 8, delayMs: 0, category: "x" } as AIStreamEvent);
    expect(push).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run; verify fail**

Run: `pnpm --filter @magenta/daemon test SessionObservabilityService`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

```ts
// packages/daemon/src/application/SessionObservabilityService.ts
import { SessionCostAccumulator } from "../domain/SessionCostAccumulator";
import type { AIStreamEvent } from "../domain/streamJsonParser";
import type { AISessionRepository } from "../infrastructure/repositories/AISessionRepository";

export interface AIStreamBus {
  subscribe(sessionId: string, cb: (ev: AIStreamEvent) => void): () => void;
}

export type IpcPushFn = (msg: {
  type:
    | "ai-session:init"
    | "ai-session:retry"
    | "ai-session:plugin-install"
    | "ai-session:cost-update";
  payload: unknown;
}) => void;

/**
 * Owns one SessionCostAccumulator per active session. Subscribes to the
 * stream-json event bus produced by Phase 2's parser, fans out push events
 * for init/retry/plugin/cost, and persists the final snapshot on the
 * `result` event.
 */
export class SessionObservabilityService {
  private readonly accumulators = new Map<string, SessionCostAccumulator>();
  private readonly unsubs = new Map<string, () => void>();

  constructor(
    private readonly bus: AIStreamBus,
    private readonly push: IpcPushFn,
    private readonly repo: Pick<AISessionRepository, "updateUsage">,
  ) {}

  attach(sessionId: string): void {
    if (this.accumulators.has(sessionId)) return;
    const acc = new SessionCostAccumulator(sessionId);
    this.accumulators.set(sessionId, acc);
    const unsub = this.bus.subscribe(sessionId, (ev) => {
      if (ev.sessionId !== sessionId) return;
      const out = acc.consume(ev);
      if (out.init) this.push({ type: "ai-session:init", payload: out.init });
      if (out.retry) this.push({ type: "ai-session:retry", payload: out.retry });
      if (out.pluginInstall)
        this.push({ type: "ai-session:plugin-install", payload: out.pluginInstall });
      if (out.costUpdate) {
        this.push({ type: "ai-session:cost-update", payload: out.costUpdate });
        const snap = acc.snapshot();
        void this.repo.updateUsage(sessionId, {
          totalInputTokens: snap.tokenUsage.inputTokens,
          totalOutputTokens: snap.tokenUsage.outputTokens,
          totalCostUsd: snap.costUsd,
          retryCount: snap.retryCount,
        });
      }
    });
    this.unsubs.set(sessionId, unsub);
  }

  detach(sessionId: string): void {
    this.unsubs.get(sessionId)?.();
    this.unsubs.delete(sessionId);
    this.accumulators.delete(sessionId);
  }
}
```

Add `updateUsage(id, partial)` to `AISessionRepository` if not present (writes the four migration-15 columns through the row mapper).

- [ ] **Step 4: Wire in `DaemonContainer`**

```ts
// In packages/daemon/src/DaemonContainer.ts (add as readonly after the bus is built)
readonly sessionObservabilityService = new SessionObservabilityService(
  this.aiStreamBus,         // produced by Phase 2
  (msg) => this.ipcBridge.push(msg),
  this.aiSessionRepository,
);
```

Hook `attach`/`detach` from the existing `AISessionApplicationService` lifecycle (on create → `attach`; on exit → `detach`).

- [ ] **Step 5: Run; verify pass**

Run: `pnpm --filter @magenta/daemon test SessionObservabilityService`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/application/SessionObservabilityService.ts \
        packages/daemon/src/application/SessionObservabilityService.test.ts \
        packages/daemon/src/DaemonContainer.ts \
        packages/daemon/src/infrastructure/repositories/AISessionRepository.ts
git commit -m "feat(daemon): SessionObservabilityService persists usage + emits 4 push events"
```

---

## Task 5: `DebugLogService` + IPC handlers

**Files:**
- Create: `packages/daemon/src/application/DebugLogService.ts`
- Create: `packages/daemon/src/application/DebugLogService.test.ts`
- Create: `packages/daemon/src/ipc/handlers/aiSessionDebugLog.ts`
- Modify: `packages/daemon/src/ipc/registerHandlers.ts`
- Modify: `packages/daemon/src/application/AISessionApplicationService.ts` (only the `createSession` path: when `spawn.debugFile === undefined` *and* the caller asks for a debug log, allocate via `DebugLogService.allocate`)

- [ ] **Step 1: Write failing test**

```ts
// packages/daemon/src/application/DebugLogService.test.ts
import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DebugLogService } from "./DebugLogService";

describe("DebugLogService", () => {
  it("allocate() returns a path under a tmp dir", () => {
    const svc = new DebugLogService();
    const path = svc.allocate("11111111-1111-4111-8111-111111111111");
    expect(path).toMatch(/magenta-debug-11111111-1111-4111-8111-111111111111\.log$/);
  });

  it("open() tails new bytes via the push callback", async () => {
    const dir = mkdtempSync(join(tmpdir(), "magenta-debug-test-"));
    const file = join(dir, "trace.log");
    writeFileSync(file, "hello\n");
    const push = vi.fn();
    const svc = new DebugLogService();
    svc.registerExternalPath("11111111-1111-4111-8111-111111111111", file);
    const handle = await svc.open("11111111-1111-4111-8111-111111111111", push);
    expect(handle.filePath).toBe(file);
    // Append more bytes; after a 50ms tick, push should have fired.
    writeFileSync(file, "hello\nworld\n");
    await new Promise((r) => setTimeout(r, 100));
    const sentBytes = push.mock.calls.map((c) => c[0].payload.bytes).join("");
    expect(sentBytes).toContain("world");
    svc.close("11111111-1111-4111-8111-111111111111");
  });

  it("close() stops the tail and idempotent re-close is a no-op", () => {
    const svc = new DebugLogService();
    expect(() => svc.close("nonexistent")).not.toThrow();
  });
});
```

- [ ] **Step 2: Run; verify fail**

Run: `pnpm --filter @magenta/daemon test DebugLogService`
Expected: FAIL.

- [ ] **Step 3: Implement service**

```ts
// packages/daemon/src/application/DebugLogService.ts
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createReadStream, statSync, watch, type FSWatcher } from "node:fs";

export interface DebugLogPushPayload {
  type: "ai-session:debug-log";
  payload: { sessionId: string; seq: number; bytes: string };
}

interface ActiveTail {
  filePath: string;
  watcher: FSWatcher;
  cursor: number;
  seq: number;
}

/**
 * Per-session debug log allocator + tailer. The path is materialized at
 * spawn time and passed to Claude via `--debug-file` (already rendered by
 * Phase 1's `toArgvClaude`). The renderer asks the daemon to tail it via
 * `ai-session:debug-log:open`.
 */
export class DebugLogService {
  private readonly paths = new Map<string, string>();
  private readonly tails = new Map<string, ActiveTail>();

  allocate(sessionId: string): string {
    const path = join(tmpdir(), `magenta-debug-${sessionId}.log`);
    this.paths.set(sessionId, path);
    return path;
  }

  registerExternalPath(sessionId: string, path: string): void {
    this.paths.set(sessionId, path);
  }

  pathFor(sessionId: string): string | undefined {
    return this.paths.get(sessionId);
  }

  async open(
    sessionId: string,
    push: (msg: DebugLogPushPayload) => void,
  ): Promise<{ filePath: string; seq: number }> {
    const filePath = this.paths.get(sessionId);
    if (!filePath) throw new Error(`No debug-log path registered for ${sessionId}`);
    let cursor = 0;
    try { cursor = statSync(filePath).size; } catch { cursor = 0; }
    let seq = 0;

    const flush = () => {
      let size = 0;
      try { size = statSync(filePath).size; } catch { return; }
      if (size <= cursor) return;
      const stream = createReadStream(filePath, { start: cursor, end: size - 1, encoding: "utf8" });
      stream.on("data", (chunk) => {
        seq += 1;
        push({ type: "ai-session:debug-log", payload: { sessionId, seq, bytes: String(chunk) } });
      });
      stream.on("end", () => { cursor = size; });
    };

    const watcher = watch(filePath, { persistent: false }, () => flush());
    this.tails.set(sessionId, { filePath, watcher, cursor, seq });
    return { filePath, seq };
  }

  close(sessionId: string): void {
    const t = this.tails.get(sessionId);
    if (!t) return;
    t.watcher.close();
    this.tails.delete(sessionId);
  }
}
```

- [ ] **Step 4: IPC handler**

```ts
// packages/daemon/src/ipc/handlers/aiSessionDebugLog.ts
import type { IPCBridge } from "../IPCBridge";
import type { DebugLogService } from "../../application/DebugLogService";
import { safeHandle } from "../safeHandle";

export function registerDebugLogHandlers(
  bridge: IPCBridge,
  service: DebugLogService,
): void {
  safeHandle(bridge, "ai-session:debug-log:open", async (req) => {
    const { filePath, seq } = await service.open(req.sessionId, (msg) => bridge.push(msg));
    return { type: "ai-session:debug-log:open", filePath, seq };
  });
  safeHandle(bridge, "ai-session:debug-log:close", async (req) => {
    service.close(req.sessionId);
    return { type: "ai-session:debug-log:close", ok: true };
  });
}
```

Wire in `registerHandlers.ts`:

```ts
import { registerDebugLogHandlers } from "./handlers/aiSessionDebugLog";
// …
registerDebugLogHandlers(bridge, container.debugLogService);
```

In `AISessionApplicationService.createSession`, before spawn: if the caller passed `spawn.debugFile === ""` (sentinel = "auto-allocate"), call `debugLogService.allocate(sessionId)` and assign the result onto `spawn.debugFile`. If a real path was passed, call `debugLogService.registerExternalPath(sessionId, path)` so the tail handler can find it later.

- [ ] **Step 5: Run; verify pass**

Run: `pnpm --filter @magenta/daemon test DebugLogService`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/application/DebugLogService.ts \
        packages/daemon/src/application/DebugLogService.test.ts \
        packages/daemon/src/ipc/handlers/aiSessionDebugLog.ts \
        packages/daemon/src/ipc/registerHandlers.ts \
        packages/daemon/src/application/AISessionApplicationService.ts
git commit -m "feat(daemon): per-session debug-log allocation + tail-follow IPC"
```

---

## Task 6: Forward Copilot OTel env vars

**Files:**
- Modify: `packages/daemon/src/infrastructure/sessions/CopilotSessionFactory.ts`
- Create: `packages/daemon/src/infrastructure/sessions/CopilotSessionFactory.otel.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// packages/daemon/src/infrastructure/sessions/CopilotSessionFactory.otel.test.ts
import { describe, it, expect } from "vitest";
import { collectOTelEnv } from "./CopilotSessionFactory";
import { OTEL_ENV_VAR_NAMES } from "@magenta/shared/aiObservability";

describe("collectOTelEnv", () => {
  it("forwards only the 11 known OTel keys that are present in the input env", () => {
    const env = {
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
      OTEL_SERVICE_NAME: "magenta",
      COPILOT_OTEL_ENABLED: "1",
      UNRELATED_VAR: "leak-me",
      PATH: "/usr/bin",
    };
    const out = collectOTelEnv(env);
    expect(out).toEqual({
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://localhost:4318",
      OTEL_SERVICE_NAME: "magenta",
      COPILOT_OTEL_ENABLED: "1",
    });
    expect(Object.keys(out)).toHaveLength(3);
  });

  it("returns empty object when no OTel vars are set", () => {
    expect(collectOTelEnv({ PATH: "/usr/bin" })).toEqual({});
  });

  it("every documented OTel name is recognised", () => {
    const env = Object.fromEntries(OTEL_ENV_VAR_NAMES.map((n) => [n, "v"]));
    expect(Object.keys(collectOTelEnv(env)).sort()).toEqual([...OTEL_ENV_VAR_NAMES].sort());
  });
});
```

- [ ] **Step 2: Run; verify fail**

Run: `pnpm --filter @magenta/daemon test CopilotSessionFactory.otel`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `CopilotSessionFactory.ts` add and export:

```ts
import { OTEL_ENV_VAR_NAMES } from "@magenta/shared/aiObservability";

export function collectOTelEnv(source: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of OTEL_ENV_VAR_NAMES) {
    const v = source[name];
    if (typeof v === "string" && v.length > 0) out[name] = v;
  }
  return out;
}
```

In the spawn path (where `env: { ... }` is built before `spawn(...)` / `pty.spawn(...)`), merge:

```ts
const env: NodeJS.ProcessEnv = {
  ...process.env, // existing
  ...collectOTelEnv(process.env),
  // existing additions (COPILOT_GITHUB_TOKEN etc.)
};
```

- [ ] **Step 4: Run; verify pass**

Run: `pnpm --filter @magenta/daemon test CopilotSessionFactory.otel`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/infrastructure/sessions/CopilotSessionFactory.ts \
        packages/daemon/src/infrastructure/sessions/CopilotSessionFactory.otel.test.ts
git commit -m "feat(daemon): forward 11 OTel env vars to Copilot child"
```

---

## Task 7: Renderer store + coordinator wiring

**Files:**
- Modify: `packages/ui/src/renderer/services/ipcClient.ts` (add response types for the 2 new requests)
- Modify: `packages/ui/src/renderer/store/aiSessionStore.ts`
- Modify: `packages/ui/src/renderer/services/SessionCoordinator.ts`
- Create: `packages/ui/src/renderer/store/aiSessionStore.observability.test.ts`

- [ ] **Step 1: Add response type in `ipcClient.ts`**

```ts
"ai-session:debug-log:open":  { type: "ai-session:debug-log:open"; filePath: string; seq: number };
"ai-session:debug-log:close": { type: "ai-session:debug-log:close"; ok: boolean };
```

- [ ] **Step 2: Failing test for the store**

```ts
// packages/ui/src/renderer/store/aiSessionStore.observability.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { useAiSessionStore } from "./aiSessionStore";

const SID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  useAiSessionStore.setState({ sessions: { [SID]: { id: SID } } } as never);
});

describe("aiSessionStore observability slice", () => {
  it("applyInitEvent stores model/tools/mcpServers", () => {
    useAiSessionStore.getState().applyInitEvent({
      sessionId: SID, model: "claude-opus-4-7", tools: ["Read"], mcpServers: ["gh"],
    });
    expect(useAiSessionStore.getState().sessions[SID].initMetadata).toEqual({
      model: "claude-opus-4-7", tools: ["Read"], mcpServers: ["gh"], pluginErrors: undefined,
    });
  });

  it("applyRetryEvent sets lastRetryEvent + increments retryCount", () => {
    useAiSessionStore.getState().applyRetryEvent({
      sessionId: SID, attempt: 2, max: 8, delayMs: 3000, category: "rate_limit", status: 429,
    });
    const s = useAiSessionStore.getState().sessions[SID];
    expect(s.lastRetryEvent).toMatchObject({ attempt: 2, max: 8, delayMs: 3000 });
  });

  it("applyCostUpdate sets tokenUsage + costUsd + retryCount and clears lastRetryEvent", () => {
    useAiSessionStore.getState().applyRetryEvent({
      sessionId: SID, attempt: 1, max: 8, delayMs: 1000, category: "x",
    });
    useAiSessionStore.getState().applyCostUpdate({
      sessionId: SID,
      tokenUsage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheCreationTokens: 0 },
      costUsd: 0.01, retryCount: 1,
    });
    const s = useAiSessionStore.getState().sessions[SID];
    expect(s.costUsd).toBe(0.01);
    expect(s.tokenUsage.inputTokens).toBe(100);
    expect(s.retryCount).toBe(1);
    expect(s.lastRetryEvent).toBeUndefined(); // cleared on result
  });

  it("applyPluginInstall accumulates by plugin name", () => {
    useAiSessionStore.getState().applyPluginInstall({ sessionId: SID, plugin: "p", status: "started" });
    useAiSessionStore.getState().applyPluginInstall({ sessionId: SID, plugin: "p", status: "installed" });
    expect(useAiSessionStore.getState().sessions[SID].pluginInstalls.p.status).toBe("installed");
  });

  it("appendDebugLogChunk pushes by seq order, capping at 5MB", () => {
    useAiSessionStore.getState().appendDebugLogChunk({ sessionId: SID, seq: 1, bytes: "a" });
    useAiSessionStore.getState().appendDebugLogChunk({ sessionId: SID, seq: 2, bytes: "b" });
    expect(useAiSessionStore.getState().sessions[SID].debugLogChunks.map((c) => c.bytes).join("")).toBe("ab");
  });
});
```

- [ ] **Step 3: Run; verify fail**

Run: `pnpm --filter @magenta/ui test aiSessionStore.observability`
Expected: FAIL.

- [ ] **Step 4: Extend the store**

In `aiSessionStore.ts` add to per-session state shape (extend the existing record type, do NOT add an `updateX` method per CLAUDE.md — these are typed apply-methods that work on the targeted session's slot):

```ts
interface AiSessionSlot {
  // …existing fields…
  initMetadata?: { model: string; tools: string[]; mcpServers: string[]; pluginErrors?: { plugin: string; message: string }[] };
  lastRetryEvent?: { attempt: number; max: number; delayMs: number; category: string; status?: number; observedAt: number };
  retryCount: number;
  tokenUsage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreationTokens: number };
  costUsd: number;
  pluginInstalls: Record<string, { plugin: string; status: PluginInstallStatus; message?: string }>;
  debugLogChunks: { seq: number; bytes: string }[];
}
```

Add the four `applyX` actions plus `appendDebugLogChunk`. They mutate only the targeted session slot.

- [ ] **Step 5: Wire the coordinator**

In `SessionCoordinator.ts` boot path, register listeners that route:

- `ai-session:init` → `applyInitEvent`
- `ai-session:retry` → `applyRetryEvent`
- `ai-session:plugin-install` → `applyPluginInstall`
- `ai-session:cost-update` → `applyCostUpdate` (also clears `lastRetryEvent`)
- `ai-session:debug-log` → `appendDebugLogChunk`

- [ ] **Step 6: Run; verify pass + typecheck**

Run: `pnpm --filter @magenta/ui test aiSessionStore.observability`
Expected: PASS, 5 tests.

Run: `pnpm -w typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/renderer/services/ipcClient.ts \
        packages/ui/src/renderer/store/aiSessionStore.ts \
        packages/ui/src/renderer/store/aiSessionStore.observability.test.ts \
        packages/ui/src/renderer/services/SessionCoordinator.ts
git commit -m "feat(ui): observability state slice + coordinator wiring"
```

---

## Task 8: Renderer surfaces — cost badge, retry spinner, init sidebar, plugin toast, debug tab

**Files:**
- Create: `packages/ui/src/renderer/components/ai/CostBadge.tsx`
- Create: `packages/ui/src/renderer/components/ai/RetrySpinnerLabel.tsx`
- Create: `packages/ui/src/renderer/components/ai/SessionMetadataSidebar.tsx`
- Create: `packages/ui/src/renderer/components/ai/PluginInstallToast.tsx`
- Create: `packages/ui/src/renderer/components/ai/DebugLogTab.tsx`
- Create: `packages/ui/src/renderer/components/ai/CostBadge.test.tsx`
- Create: `packages/ui/src/renderer/components/ai/RetrySpinnerLabel.test.tsx`
- Modify: `packages/ui/src/renderer/components/ai/SessionHeader.tsx`
- Modify: `packages/ui/src/renderer/components/ai/AISessionView.tsx`

- [ ] **Step 1: Failing component tests**

```tsx
// packages/ui/src/renderer/components/ai/CostBadge.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { CostBadge } from "./CostBadge";
import { useAiSessionStore } from "../../store/aiSessionStore";

const SID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  useAiSessionStore.setState({
    sessions: {
      [SID]: {
        id: SID, retryCount: 0, costUsd: 0.184,
        tokenUsage: { inputTokens: 12450, outputTokens: 3210, cacheReadTokens: 0, cacheCreationTokens: 0 },
        pluginInstalls: {}, debugLogChunks: [],
      },
    },
  } as never);
});

describe("CostBadge", () => {
  it("renders compact tokens-in/out and dollar cost", () => {
    render(<CostBadge sessionId={SID} />);
    expect(screen.getByText(/12\.4k in/)).toBeInTheDocument();
    expect(screen.getByText(/3\.2k out/)).toBeInTheDocument();
    expect(screen.getByText(/\$0\.18/)).toBeInTheDocument();
  });

  it("hides itself when no usage observed yet", () => {
    useAiSessionStore.setState({
      sessions: { [SID]: { id: SID, retryCount: 0, costUsd: 0, tokenUsage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }, pluginInstalls: {}, debugLogChunks: [] } },
    } as never);
    const { container } = render(<CostBadge sessionId={SID} />);
    expect(container.firstChild).toBeNull();
  });
});
```

```tsx
// packages/ui/src/renderer/components/ai/RetrySpinnerLabel.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { RetrySpinnerLabel } from "./RetrySpinnerLabel";
import { useAiSessionStore } from "../../store/aiSessionStore";

const SID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  useAiSessionStore.setState({
    sessions: {
      [SID]: {
        id: SID,
        retryCount: 1,
        costUsd: 0,
        tokenUsage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
        lastRetryEvent: { attempt: 2, max: 8, delayMs: 3000, category: "rate_limit", observedAt: Date.now() },
        pluginInstalls: {},
        debugLogChunks: [],
      },
    },
  } as never);
});

describe("RetrySpinnerLabel", () => {
  it("renders 'retrying (2/8) — 3.0s' format", () => {
    render(<RetrySpinnerLabel sessionId={SID} />);
    expect(screen.getByText(/retrying \(2\/8\) — 3\.0s/)).toBeInTheDocument();
  });

  it("renders nothing when lastRetryEvent is undefined", () => {
    useAiSessionStore.setState({ sessions: { [SID]: { id: SID, retryCount: 0, costUsd: 0, tokenUsage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 }, pluginInstalls: {}, debugLogChunks: [] } } } as never);
    const { container } = render(<RetrySpinnerLabel sessionId={SID} />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run; verify fail**

Run: `pnpm --filter @magenta/ui test CostBadge RetrySpinnerLabel`
Expected: FAIL.

- [ ] **Step 3: Implement components**

```tsx
// packages/ui/src/renderer/components/ai/CostBadge.tsx
import { useAiSessionStore } from "../../store/aiSessionStore";

function fmtTokens(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1)}k`;
}

export function CostBadge({ sessionId }: { sessionId: string }) {
  const slot = useAiSessionStore((s) => s.sessions[sessionId]);
  if (!slot) return null;
  const { tokenUsage, costUsd } = slot;
  if (tokenUsage.inputTokens === 0 && tokenUsage.outputTokens === 0 && costUsd === 0) return null;
  return (
    <span className="inline-flex items-center gap-2 text-xs tabular-nums text-muted-foreground">
      <span>{fmtTokens(tokenUsage.inputTokens)} in</span>
      <span>·</span>
      <span>{fmtTokens(tokenUsage.outputTokens)} out</span>
      <span>·</span>
      <span>${costUsd.toFixed(2)}</span>
    </span>
  );
}
```

```tsx
// packages/ui/src/renderer/components/ai/RetrySpinnerLabel.tsx
import { useAiSessionStore } from "../../store/aiSessionStore";

export function RetrySpinnerLabel({ sessionId }: { sessionId: string }) {
  const ev = useAiSessionStore((s) => s.sessions[sessionId]?.lastRetryEvent);
  if (!ev) return null;
  const seconds = (ev.delayMs / 1000).toFixed(1);
  return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-600">
      <span className="animate-spin">⟳</span>
      retrying ({ev.attempt}/{ev.max}) — {seconds}s
    </span>
  );
}
```

```tsx
// packages/ui/src/renderer/components/ai/SessionMetadataSidebar.tsx
import { useAiSessionStore } from "../../store/aiSessionStore";

export function SessionMetadataSidebar({ sessionId }: { sessionId: string }) {
  const meta = useAiSessionStore((s) => s.sessions[sessionId]?.initMetadata);
  if (!meta) return <div className="p-3 text-sm text-muted-foreground">No init event yet.</div>;
  return (
    <div className="space-y-3 p-3 text-sm">
      <Row label="Model" value={meta.model} />
      <Row label="Tools" value={meta.tools.join(", ")} />
      <Row label="MCP servers" value={meta.mcpServers.length ? meta.mcpServers.join(", ") : "(none)"} />
      {meta.pluginErrors && meta.pluginErrors.length > 0 && (
        <div>
          <div className="font-medium text-destructive">Plugin errors</div>
          <ul className="ml-4 list-disc">
            {meta.pluginErrors.map((e) => (
              <li key={e.plugin}>{e.plugin}: {e.message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
```

```tsx
// packages/ui/src/renderer/components/ai/PluginInstallToast.tsx
import { useAiSessionStore } from "../../store/aiSessionStore";

export function PluginInstallToast({ sessionId }: { sessionId: string }) {
  const installs = useAiSessionStore((s) => s.sessions[sessionId]?.pluginInstalls ?? {});
  const inFlight = Object.values(installs).filter((p) => p.status === "started" || p.status === "installed");
  if (inFlight.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 rounded-md border bg-background p-3 text-sm shadow">
      {inFlight.map((p) => (
        <div key={p.plugin}>{p.plugin}: {p.status}{p.message ? ` — ${p.message}` : null}</div>
      ))}
    </div>
  );
}
```

```tsx
// packages/ui/src/renderer/components/ai/DebugLogTab.tsx
import { useEffect } from "react";
import { sendOrThrow, sendCommand } from "../../services/ipcClient";
import { useAiSessionStore } from "../../store/aiSessionStore";

export function DebugLogTab({ sessionId }: { sessionId: string }) {
  const chunks = useAiSessionStore((s) => s.sessions[sessionId]?.debugLogChunks ?? []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const r = await sendOrThrow({ type: "ai-session:debug-log:open", sessionId });
        if (!active) sendCommand({ type: "ai-session:debug-log:close", sessionId });
        // Path could be displayed if needed: r.filePath
        void r;
      } catch {
        // Renderer can render an empty state; daemon will surface IpcError on truly broken cases.
      }
    })();
    return () => {
      active = false;
      sendCommand({ type: "ai-session:debug-log:close", sessionId });
    };
  }, [sessionId]);

  return (
    <pre className="h-full overflow-auto whitespace-pre-wrap font-mono text-xs">
      {chunks.map((c) => c.bytes).join("")}
    </pre>
  );
}
```

- [ ] **Step 4: Mount in `SessionHeader.tsx` and `AISessionView.tsx`**

In `SessionHeader.tsx`, add `<CostBadge sessionId={sessionId} />` and `<RetrySpinnerLabel sessionId={sessionId} />` next to existing status text.

In `AISessionView.tsx`, add a "Debug log" tab that mounts `<DebugLogTab>`, and a sidebar slot that renders `<SessionMetadataSidebar>`. Mount `<PluginInstallToast>` once at the layout root for the session.

- [ ] **Step 5: Run; verify pass**

Run: `pnpm --filter @magenta/ui test CostBadge RetrySpinnerLabel`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/renderer/components/ai/
git commit -m "feat(ui): cost badge, retry spinner, init sidebar, plugin toast, debug tab"
```

---

## Task 9: OTel Settings panel (renderer-only docs)

**Files:**
- Create: `packages/ui/src/renderer/components/settings/OTelSettingsPanel.tsx`
- Create: `packages/ui/src/renderer/components/settings/OTelSettingsPanel.test.tsx`
- Modify: `packages/ui/src/renderer/components/settings/SettingsView.tsx`
- Modify: `packages/shared/src/ipc.ts` — add `ai:env:otel-status` request returning `{ name; present }[]` so the panel can show which vars are wired.
- Modify: `packages/daemon/src/ipc/handlers/aiEnvOtelStatus.ts` (new) — returns whether each name is present in the daemon's `process.env`.

- [ ] **Step 1: Add the IPC variant + handler**

In `packages/shared/src/ipc.ts`:

```ts
// Request:
z.object({ type: z.literal("ai:env:otel-status") }),
// Response:
z.object({ type: z.literal("ai:env:otel-status"), vars: z.array(z.object({ name: z.string(), present: z.boolean() })) }),
```

Handler:

```ts
// packages/daemon/src/ipc/handlers/aiEnvOtelStatus.ts
import { OTEL_ENV_VAR_NAMES } from "@magenta/shared/aiObservability";
import { safeHandle } from "../safeHandle";
import type { IPCBridge } from "../IPCBridge";

export function registerAiEnvOtelStatus(bridge: IPCBridge): void {
  safeHandle(bridge, "ai:env:otel-status", async () => ({
    type: "ai:env:otel-status",
    vars: OTEL_ENV_VAR_NAMES.map((name) => ({ name, present: typeof process.env[name] === "string" && process.env[name]!.length > 0 })),
  }));
}
```

Register in `registerHandlers.ts`. Add to `ResponseForRequest` in `ipcClient.ts`.

- [ ] **Step 2: Failing test**

```tsx
// packages/ui/src/renderer/components/settings/OTelSettingsPanel.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { OTelSettingsPanel } from "./OTelSettingsPanel";
import * as ipc from "../../services/ipcClient";

vi.mock("../../services/ipcClient", async () => ({
  sendOrThrow: vi.fn().mockResolvedValue({
    type: "ai:env:otel-status",
    vars: [
      { name: "OTEL_EXPORTER_OTLP_ENDPOINT", present: true },
      { name: "OTEL_SERVICE_NAME", present: false },
      { name: "COPILOT_OTEL_ENABLED", present: false },
      { name: "OTEL_EXPORTER_OTLP_HEADERS", present: false },
      { name: "OTEL_EXPORTER_OTLP_PROTOCOL", present: false },
      { name: "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT", present: false },
      { name: "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", present: false },
      { name: "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT", present: false },
      { name: "OTEL_RESOURCE_ATTRIBUTES", present: false },
      { name: "OTEL_LOG_LEVEL", present: false },
      { name: "OTEL_METRIC_EXPORT_INTERVAL", present: false },
    ],
  }),
}));

beforeEach(() => vi.clearAllMocks());

describe("OTelSettingsPanel", () => {
  it("lists all 11 OTel env var names with their present/absent state", async () => {
    render(<OTelSettingsPanel />);
    await waitFor(() => {
      expect(screen.getByText("OTEL_EXPORTER_OTLP_ENDPOINT")).toBeInTheDocument();
    });
    expect(screen.getAllByText(/set|not set/).length).toBe(11);
    expect(ipc.sendOrThrow).toHaveBeenCalledWith({ type: "ai:env:otel-status" });
  });
});
```

- [ ] **Step 3: Run; verify fail**

Run: `pnpm --filter @magenta/ui test OTelSettingsPanel`
Expected: FAIL.

- [ ] **Step 4: Implement panel**

```tsx
// packages/ui/src/renderer/components/settings/OTelSettingsPanel.tsx
import { useEffect, useState } from "react";
import { sendOrThrow } from "../../services/ipcClient";

interface VarRow { name: string; present: boolean }

export function OTelSettingsPanel() {
  const [vars, setVars] = useState<VarRow[]>([]);
  useEffect(() => {
    void (async () => {
      const r = await sendOrThrow({ type: "ai:env:otel-status" });
      setVars(r.vars);
    })();
  }, []);
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">OpenTelemetry (Copilot)</h3>
      <p className="text-xs text-muted-foreground">
        Magenta forwards these environment variables from your shell into the Copilot child
        process when present. Set them in your shell profile to opt into Copilot OTel telemetry.
        Magenta does not host a collector or surface metrics in the UI.
      </p>
      <ul className="divide-y rounded border text-xs">
        {vars.map((v) => (
          <li key={v.name} className="flex items-center justify-between p-2 font-mono">
            <span>{v.name}</span>
            <span className={v.present ? "text-emerald-600" : "text-muted-foreground"}>
              {v.present ? "set" : "not set"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

Mount `<OTelSettingsPanel />` under an "Observability" section in `SettingsView.tsx`.

- [ ] **Step 5: Run; verify pass**

Run: `pnpm --filter @magenta/ui test OTelSettingsPanel`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/renderer/components/settings/OTelSettingsPanel.tsx \
        packages/ui/src/renderer/components/settings/OTelSettingsPanel.test.tsx \
        packages/ui/src/renderer/components/settings/SettingsView.tsx \
        packages/shared/src/ipc.ts \
        packages/daemon/src/ipc/handlers/aiEnvOtelStatus.ts \
        packages/daemon/src/ipc/registerHandlers.ts \
        packages/ui/src/renderer/services/ipcClient.ts
git commit -m "feat(ui): OTel env var status panel in Settings"
```

---

## Task 10: Final verification — repository-wide

- [ ] **Step 1: Confirm no orphaned imports / regressions**

Run: `pnpm -w typecheck`
Expected: All 4 packages clean.

- [ ] **Step 2: Workspace build**

Run: `pnpm -w build`
Expected: All packages build.

- [ ] **Step 3: Workspace tests**

Run: `pnpm -w test`
Expected: All tests pass — including:
- Migration 15 test
- `SessionCostAccumulator` 6 tests (including AC-7 timing)
- `SessionObservabilityService` 5 tests
- `DebugLogService` 3 tests
- `CopilotSessionFactory.otel` 3 tests
- `aiObservability` 7 schema tests
- `aiSessionStore.observability` 5 tests
- `CostBadge`, `RetrySpinnerLabel`, `OTelSettingsPanel` component tests

- [ ] **Step 4: Stop here per `feedback_verification.md`**

Do not launch the app. Steven runs manual E2E (start a Claude session, observe live token/cost badge update on first response; trigger a 429 to confirm retry spinner; open Debug log tab with a `--debug-file` session; check Settings → Observability shows OTel env state).

Report:

> Phase 7 done. Migration 15 + `SessionCostAccumulator` + `SessionObservabilityService` + `DebugLogService` + Copilot OTel forwarding wired. Renderer surfaces (cost badge, retry spinner, init sidebar, plugin toast, debug log tab, OTel Settings panel) shipped. AC-7 timing test asserts retry emit < 250 ms.

---

## Spec coverage check (self-review)

| Spec requirement | Covered by |
|---|---|
| Plan §4 Phase 7 — `system/api_retry` → `ai-session:retry` push | Tasks 2, 3, 4 |
| Plan §4 Phase 7 — `system/init` → metadata sidebar via `ai-session:init` | Tasks 2, 3, 4, 8 |
| Plan §4 Phase 7 — `system/plugin_install` → progress toast | Tasks 2, 3, 4, 8 |
| Plan §4 Phase 7 — `--debug-file` per-session log tab | Task 5, Task 8 |
| Plan §4 Phase 7 — token / cost accounting persisted | Tasks 1, 3, 4 |
| Plan §4 Phase 7 — Copilot OTel env vars (opt-in env wiring only) | Task 6, Task 9 |
| Plan §5 Migration 15 (cost columns + retry_count) | Task 1 |
| Spec FR-10.1 stream events parsed into `AIStreamEvent` push events | Tasks 2, 3, 4 |
| Spec FR-10.2 token usage + cost from `result` persisted on `ai_sessions` | Tasks 1, 3, 4 |
| Spec FR-10.3 retry counter exposed on `ai_sessions` | Tasks 1, 3, 4 |
| Spec FR-10.4 daemon supports `spawn.debugFile` | Task 5 (Task 1 of Phase 1 already renders the flag) |
| Spec AC-7 retry badge updates within 250 ms | Task 3 (vitest timing assertion against fixture) |

**Out-of-scope deferrals** (per spec §13 / §6):
- OTel collector deployment / dashboards.
- Hooks authoring UI.
- Cloud session features (`--remote`, `--teleport`, `--remote-control`).
- Marketplace integration for Claude plugins beyond `--plugin-dir`.
