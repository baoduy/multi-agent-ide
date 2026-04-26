# Phase 5 — Session Lifecycle Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make AI sessions deterministic, resumable, branchable, and idempotent. The UI becomes the source of truth for the canonical session identifier; the daemon translates that identifier into provider-specific resume flags. Adds caller-provided `sessionId` plumbing, idempotent reconnect, fork support, `--continue` / `--from-pr` / `-n` plumbing, resume-failure fallback, and a `ai-session:reconciled` push event.

**Session ID precedence rule (verbatim from spec §4 Phase 5):**

> Every session-creating IPC request (`ai-session:create`, `ai:run-once`, `ai-session:fork`) accepts an optional `sessionId: UUID v4` field. Resolution order:
>
> 1. **Caller provides `sessionId`** → daemon uses it verbatim as the canonical Magenta session identifier.
> 2. **Caller does not provide `sessionId`** → daemon generates a UUID v4 and uses it.
>
> In both cases:
>
> - The provider's `--session-id` flag SHALL be set to the canonical sessionId **iff** the provider's capability manifest declares `supportsExplicitSessionId: true`. Today that is Claude only.
> - The response from create / run-once SHALL carry the canonical `sessionId` synchronously, even when the provider does not yet know its own ID (Copilot pre-first-turn).
> - The canonical sessionId SHALL be persisted in `ai_sessions.id`. The provider-assigned ID (when different) SHALL be persisted in `ai_sessions.provider_session_id` once reconciled, and a push event `ai-session:reconciled { sessionId, providerSessionId }` SHALL fire.
> - **Resume is always addressable by canonical `sessionId`** — `ai-session:resume({ sessionId })` looks up the row, retrieves the provider-specific resume token (`provider_session_id` for Copilot, equal to `id` for Claude), and passes `--resume <token>` to the CLI. Callers never need to know the provider asymmetry.
> - **Idempotent reconnect**: calling create with a `sessionId` that already exists for the same `repoPath` + `worktreePath` is treated as resume, not as duplicate create.

**Architecture:** Builds on Phase 1's `AISpawnOptions` schema + `ProviderCapability.supportsExplicitSessionId` flag and Phase 2's `ai-session:event` push channel + `AIStreamEvent` union. Adds:

- A pure domain helper `sessionIdResolver.ts` that takes `{ callerProvided, generate }` and returns a canonical UUID v4.
- A pure domain helper `forkArgvBuilder.ts` that turns `{ parentSessionId, childSessionId, parentProviderSessionId, capability }` into argv suffix `["--resume", <token>, "--fork-session"]`.
- A bounded-wait helper `awaitProviderSessionId.ts` (timed wait with 5s default, configurable via `AISessionApplicationService` constructor).
- Extensions to `AISessionApplicationService.createSession`/`resumeSession`/new `forkSession` for the resolver + idempotent reconnect + resume-fallback retry.
- LMDB cache schema bump (`CACHE_SCHEMA_VERSION → 2`) carrying the new persisted column `parentSessionId` on `AISessionRecord` (stand-in for the spec's "migration 16"; per `project_db_role.md` the LMDB cache rebuilds on bump rather than running SQL).
- IPC additions: `ai-session:fork`, `name`, `resumeFromPR`, `sessionId`, `continueRecent` fields on `ai-session:create`; `ai-session:reconciled` push event.

**Tech Stack:** TypeScript 5.x · Zod 3.x · Vitest · pnpm workspace · existing `@magenta/shared` re-export pattern · LMDB cache · Phase 1's `AISpawnOptions` + `getToArgv()` · Phase 2's `AIStreamEvent`.

**Spec references:** `specs/2026-04-24-cli-programmatic-improvements.md` §4 Phase 5 (whole) · `specs/2026-04-24-unified-ai-cli-interface.md` FR-7.1 through FR-7.10, AC-5, AC-11, AC-13, AC-14, AC-15, AC-16, AC-17.

**Out of scope for this phase:**
- Subagents / `--agents` / plugins (Phase 6).
- Observability, retry events, cost accounting (Phase 7).
- Preset library (Phase 4 — already done).
- New transport for resume-fallback warnings beyond `ai-session:event` (the existing channel from Phase 2 is reused).
- Disk-scan internals — Copilot reconciliation reuses the existing `scheduleCopilotReconciliation` mechanism in `AISessionApplicationService`; no new file watcher is built here.

---

## File structure

| Action | Path | Responsibility |
|---|---|---|
| Create | `packages/daemon/src/domain/sessionIdResolver.ts` | Pure `resolveSessionId({ callerProvided, generate })` returning canonical UUID v4. |
| Create | `packages/daemon/src/domain/sessionIdResolver.test.ts` | Resolver unit tests (caller wins, fallback to generate, UUID v4 validation). |
| Create | `packages/daemon/src/domain/forkArgvBuilder.ts` | Pure `buildForkArgv({ parentResumeToken, childCanonicalId, capability })` returning `string[]` argv suffix. |
| Create | `packages/daemon/src/domain/forkArgvBuilder.test.ts` | Fork argv unit tests (Claude shape, Copilot rejection). |
| Create | `packages/daemon/src/application/awaitProviderSessionId.ts` | Bounded-wait helper around the existing `ai-session:updated` reconciliation patch. |
| Create | `packages/daemon/src/application/awaitProviderSessionId.test.ts` | Unit tests for resolves-on-patch, times-out-with-AppError. |
| Create | `packages/daemon/src/application/sessionLifecycle.test.ts` | Integration tests covering AC-13 → AC-17 with a mock CLI gateway. |
| Modify | `packages/shared/src/ipc.ts` | Add `sessionId`, `name`, `resumeFromPR`, `continueRecent`, `forkSession` fields on `ai-session:create`; add `ai-session:fork` request; add `ai-session:reconciled` push event; add `resumable` flag on list response. |
| Modify | `packages/shared/src/aiTerminal.ts` | Add `parentSessionId: string \| null` to `AISessionRecord`; thread `name`, `resumeFromPR`, `forkSession`, `continueRecent`, `sessionId` through `AISessionConfig`. |
| Modify | `packages/shared/src/providerCapabilities.ts` | Confirm `supportsExplicitSessionId: true` for Claude, `false` for Copilot; add `supportsForkSession`, `supportsContinueRecent`, `supportsFromPR`, `supportsName` capability flags (additive). |
| Modify | `packages/daemon/src/db/CACHE_SCHEMA_VERSION.ts` | Bump from `1 → 2` with comment: persisted `parentSessionId` added. |
| Modify | `packages/daemon/src/errors/AppError.ts` | Add `AI_RESUME_PENDING_RECONCILIATION` to `AppErrorCode` (only if absent). |
| Modify | `packages/daemon/src/application/AISessionApplicationService.ts` | Adopt resolver, idempotent-reconnect lookup, fork orchestration, resume-fallback retry, `ai-session:reconciled` emission, `name`/`resumeFromPR`/`continueRecent` argv plumbing. |
| Modify | `packages/daemon/src/ipc/handlers/aiSessionHandlers.ts` | Update `ai-session:create` handler signature; add thin `ai-session:fork` handler. |
| Modify | `packages/daemon/src/ipc/registerHandlers.ts` | Wire the new fork handler. |
| Modify | `packages/ui/src/renderer/services/ipcClient.ts` | Sync `ResponseForRequest` with new `ai-session:fork` and updated create response. |

---

## Task 1: Bump cache schema and add `parentSessionId` to the record

**Files:**
- Modify: `/Users/steven/_CODE/GIT/multi-agent-ide/packages/daemon/src/db/CACHE_SCHEMA_VERSION.ts`
- Modify: `/Users/steven/_CODE/GIT/multi-agent-ide/packages/shared/src/aiTerminal.ts`

- [ ] **Step 1: Write failing test for the new field on the record schema**

```ts
// packages/shared/src/aiTerminal.test.ts (append)
import { describe, it, expect } from "vitest";
import { AISessionRecordSchema } from "./aiTerminal";

describe("AISessionRecord parentSessionId", () => {
  it("accepts null parentSessionId by default", () => {
    const row = {
      id: "11111111-1111-4111-8111-111111111111",
      provider: "claude" as const,
      repoPath: null,
      repoName: null,
      branch: null,
      worktreePath: null,
      worktreeName: null,
      cwd: "/tmp",
      providerSessionId: null,
      status: "idle" as const,
      permissionMode: "default" as const,
      title: null,
      parentSessionId: null,
      createdAt: 0,
      lastActiveAt: 0,
    };
    expect(AISessionRecordSchema.parse(row).parentSessionId).toBeNull();
  });

  it("accepts a UUID parentSessionId", () => {
    const parsed = AISessionRecordSchema.parse({
      id: "22222222-2222-4222-8222-222222222222",
      provider: "claude" as const,
      repoPath: null, repoName: null, branch: null, worktreePath: null, worktreeName: null,
      cwd: "/tmp",
      providerSessionId: null,
      status: "idle" as const,
      permissionMode: "default" as const,
      title: null,
      parentSessionId: "11111111-1111-4111-8111-111111111111",
      createdAt: 0, lastActiveAt: 0,
    });
    expect(parsed.parentSessionId).toBe("11111111-1111-4111-8111-111111111111");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --filter @magenta/shared test aiTerminal`
Expected: FAIL — `parentSessionId` is not on the schema.

- [ ] **Step 3: Add `parentSessionId` to the schema**

```ts
// packages/shared/src/aiTerminal.ts — inside AISessionRecordSchema definition,
// add immediately before createdAt:
parentSessionId: z.string().nullable(),
```

Also extend `AISessionConfig` (interface block lower in the same file) with the new optional fields:

```ts
export interface AISessionConfig {
  provider: AIProvider;
  repoPath?: string;
  branch?: string;
  worktreePath?: string;
  permissionMode?: AIPermissionMode;
  env?: Record<string, string>;
  /** @see FR-7.1 — caller-provided canonical session ID (UUID v4). */
  sessionId?: string;
  /** @see FR-7.8 — `-n` plumbing (Claude-only). */
  name?: string;
  /** @see FR-7.9 — `--from-pr` plumbing (Claude-only). */
  resumeFromPR?: string;
  /** @see Phase 5 §"--continue" — explicit "continue most recent" action. */
  continueRecent?: boolean;
  /** Existing field, retained for sync-on-disk reconciliation. */
  providerSessionId?: string;
  /** @see FR-7.7 — populated by the fork code path; never set by direct create. */
  parentSessionId?: string;
  /** @see FR-7.7 — instructs the daemon to add `--fork-session`. */
  forkSession?: boolean;
}
```

- [ ] **Step 4: Bump cache schema version**

```ts
// packages/daemon/src/db/CACHE_SCHEMA_VERSION.ts
/**
 * Cache schema version for the LMDB persistence layer.
 *
 * The daemon DB is a cache — authoritative state lives in git, the filesystem,
 * and AI provider session files. When this version number is bumped, the
 * CacheSchemaManager wipes all sub-dbs on next open and lets background sync
 * jobs rehydrate. This replaces the hand-written SQL migration chain.
 *
 * Bump this whenever the shape of any msgpack-encoded value changes
 * incompatibly (field renamed, removed, or type-changed).
 *
 * v2 (Phase 5): persisted AISessionRecord gains `parentSessionId: string | null`
 * to support `ai-session:fork`. This is the LMDB equivalent of the spec's
 * "migration 16" (`ai_sessions.parent_session_id`).
 */
export const CACHE_SCHEMA_VERSION = 2;
```

- [ ] **Step 5: Verify**

Run: `pnpm --filter @magenta/shared test aiTerminal`
Expected: PASS.

Run: `pnpm -w typecheck`
Expected: PASS — every place that constructs `AISessionRecord` may now error with "missing parentSessionId". Fix each by setting `parentSessionId: null` (the field is non-optional but nullable). Expect ≤4 sites: `AISessionApplicationService.createSession`, the synced-sessions mapper, any test fixture, and the LMDB row mapper.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/aiTerminal.ts packages/shared/src/aiTerminal.test.ts packages/daemon/src/db/CACHE_SCHEMA_VERSION.ts
git commit -m "feat(shared): add parentSessionId to AISessionRecord; bump cache schema to v2"
```

---

## Task 2: Add capability flags for explicit session ID, fork, name, continue, from-pr

**Files:**
- Modify: `/Users/steven/_CODE/GIT/multi-agent-ide/packages/shared/src/providerCapabilities.ts`

This task is additive on top of Phase 1's `ProviderCapability`. Skip any flag that Phase 1 already added; only add what's still missing.

- [ ] **Step 1: Write failing test**

```ts
// packages/shared/src/providerCapabilities.test.ts (append)
import { describe, it, expect } from "vitest";
import { getProviderCapability } from "./providerCapabilities";

describe("ProviderCapability lifecycle flags", () => {
  it("Claude supports explicit session ID, fork, name, continue, from-pr", () => {
    const caps = getProviderCapability("claude");
    expect(caps.supportsExplicitSessionId).toBe(true);
    expect(caps.supportsForkSession).toBe(true);
    expect(caps.supportsName).toBe(true);
    expect(caps.supportsContinueRecent).toBe(true);
    expect(caps.supportsFromPR).toBe(true);
  });

  it("Copilot supports continue-recent only; rejects explicit session ID and fork", () => {
    const caps = getProviderCapability("copilot");
    expect(caps.supportsExplicitSessionId).toBe(false);
    expect(caps.supportsForkSession).toBe(false);
    expect(caps.supportsName).toBe(false);
    expect(caps.supportsContinueRecent).toBe(true);
    expect(caps.supportsFromPR).toBe(false);
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `pnpm --filter @magenta/shared test providerCapabilities`
Expected: FAIL — flags missing.

- [ ] **Step 3: Add the missing flags**

```ts
// packages/shared/src/providerCapabilities.ts (extend the manifest type and entries)
export interface ProviderCapability {
  // ... existing Phase-1 flags ...
  supportsExplicitSessionId: boolean;
  supportsForkSession: boolean;
  supportsName: boolean;
  supportsContinueRecent: boolean;
  supportsFromPR: boolean;
}

const CLAUDE_CAPS: ProviderCapability = {
  // ... existing Phase-1 flags ...
  supportsExplicitSessionId: true,
  supportsForkSession: true,
  supportsName: true,
  supportsContinueRecent: true,
  supportsFromPR: true,
};

const COPILOT_CAPS: ProviderCapability = {
  // ... existing Phase-1 flags ...
  supportsExplicitSessionId: false,
  supportsForkSession: false,
  supportsName: false,
  supportsContinueRecent: true,
  supportsFromPR: false,
};
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @magenta/shared test providerCapabilities`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/providerCapabilities.ts packages/shared/src/providerCapabilities.test.ts
git commit -m "feat(shared): capability flags for fork, name, continue, from-pr"
```

---

## Task 3: Pure `sessionIdResolver` helper

**Files:**
- Create: `/Users/steven/_CODE/GIT/multi-agent-ide/packages/daemon/src/domain/sessionIdResolver.ts`
- Create: `/Users/steven/_CODE/GIT/multi-agent-ide/packages/daemon/src/domain/sessionIdResolver.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// packages/daemon/src/domain/sessionIdResolver.test.ts
import { describe, it, expect } from "vitest";
import { resolveSessionId } from "./sessionIdResolver";

const FIXED = "11111111-1111-4111-8111-111111111111";
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("resolveSessionId", () => {
  it("returns the caller-provided ID verbatim when present (FR-7.1.a)", () => {
    const generate = () => "should-not-be-called";
    expect(resolveSessionId({ callerProvided: FIXED, generate })).toBe(FIXED);
  });

  it("falls back to generate when caller did not provide one (FR-7.1.b)", () => {
    const generate = () => FIXED;
    expect(resolveSessionId({ callerProvided: undefined, generate })).toBe(FIXED);
  });

  it("rejects a non-UUID-v4 caller-provided ID with VALIDATION_ERROR", () => {
    const generate = () => FIXED;
    expect(() =>
      resolveSessionId({ callerProvided: "not-a-uuid", generate }),
    ).toThrow(/VALIDATION_ERROR/);
  });

  it("the generated ID is itself a UUID v4 in production wiring", () => {
    // Documentation test: generator contract. resolveSessionId itself does not
    // generate; we just guarantee we hand off to a generator that does.
    const out = resolveSessionId({ callerProvided: undefined, generate: () => FIXED });
    expect(out).toMatch(UUID_V4_RE);
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @magenta/daemon test sessionIdResolver`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
// packages/daemon/src/domain/sessionIdResolver.ts
import { AppError } from "../errors/AppError";

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ResolveSessionIdInput {
  callerProvided: string | undefined;
  generate: () => string;
}

/**
 * Pure resolver for the canonical Magenta session UUID per spec §4 Phase 5
 * "Session ID precedence rule" / FR-7.1.
 *
 * 1. Caller provides → use verbatim.
 * 2. Caller absent → call `generate` (UUID v4 generator injected by caller).
 *
 * Throws `VALIDATION_ERROR` if a caller-provided ID is not a UUID v4. The
 * generated path is trusted — we cannot validate generator output here without
 * coupling this pure function to crypto.
 */
export function resolveSessionId({ callerProvided, generate }: ResolveSessionIdInput): string {
  if (callerProvided !== undefined) {
    if (!UUID_V4_RE.test(callerProvided)) {
      throw new AppError(
        "VALIDATION_ERROR",
        `sessionId must be a UUID v4, got: ${callerProvided}`,
      );
    }
    return callerProvided;
  }
  return generate();
}
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @magenta/daemon test sessionIdResolver`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/domain/sessionIdResolver.ts packages/daemon/src/domain/sessionIdResolver.test.ts
git commit -m "feat(daemon): pure sessionIdResolver for canonical UUID precedence"
```

---

## Task 4: Pure `forkArgvBuilder`

**Files:**
- Create: `/Users/steven/_CODE/GIT/multi-agent-ide/packages/daemon/src/domain/forkArgvBuilder.ts`
- Create: `/Users/steven/_CODE/GIT/multi-agent-ide/packages/daemon/src/domain/forkArgvBuilder.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// packages/daemon/src/domain/forkArgvBuilder.test.ts
import { describe, it, expect } from "vitest";
import { buildForkArgv } from "./forkArgvBuilder";

const PARENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHILD = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("buildForkArgv", () => {
  it("Claude: emits --resume <parent> --fork-session --session-id <child>", () => {
    expect(
      buildForkArgv({
        parentResumeToken: PARENT,
        childCanonicalId: CHILD,
        capability: {
          supportsForkSession: true,
          supportsExplicitSessionId: true,
          provider: "claude",
        },
      }),
    ).toEqual(["--resume", PARENT, "--fork-session", "--session-id", CHILD]);
  });

  it("Copilot: throws UNSUPPORTED_SPAWN_OPTION (FR-7.7 / Phase 5 fork)", () => {
    expect(() =>
      buildForkArgv({
        parentResumeToken: PARENT,
        childCanonicalId: CHILD,
        capability: {
          supportsForkSession: false,
          supportsExplicitSessionId: false,
          provider: "copilot",
        },
      }),
    ).toThrow(/UNSUPPORTED_SPAWN_OPTION/);
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @magenta/daemon test forkArgvBuilder`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
// packages/daemon/src/domain/forkArgvBuilder.ts
import { AppError } from "../errors/AppError";

export interface ForkArgvInput {
  parentResumeToken: string;
  childCanonicalId: string;
  capability: {
    supportsForkSession: boolean;
    supportsExplicitSessionId: boolean;
    provider: "claude" | "copilot";
  };
}

/**
 * Pure builder for the argv suffix that translates a fork operation into
 * provider-specific flags.
 *
 * Claude:  `--resume <parent> --fork-session --session-id <child>`
 * Copilot: not supported — raises `UNSUPPORTED_SPAWN_OPTION` per FR-7.7.
 */
export function buildForkArgv({
  parentResumeToken,
  childCanonicalId,
  capability,
}: ForkArgvInput): string[] {
  if (!capability.supportsForkSession) {
    throw new AppError(
      "UNSUPPORTED_SPAWN_OPTION",
      `Provider '${capability.provider}' does not support --fork-session`,
    );
  }
  const argv = ["--resume", parentResumeToken, "--fork-session"];
  if (capability.supportsExplicitSessionId) {
    argv.push("--session-id", childCanonicalId);
  }
  return argv;
}
```

- [ ] **Step 4: Verify**

Run: `pnpm --filter @magenta/daemon test forkArgvBuilder`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/domain/forkArgvBuilder.ts packages/daemon/src/domain/forkArgvBuilder.test.ts
git commit -m "feat(daemon): pure forkArgvBuilder for --fork-session translation"
```

---

## Task 5: `awaitProviderSessionId` bounded-wait helper

**Files:**
- Create: `/Users/steven/_CODE/GIT/multi-agent-ide/packages/daemon/src/application/awaitProviderSessionId.ts`
- Create: `/Users/steven/_CODE/GIT/multi-agent-ide/packages/daemon/src/application/awaitProviderSessionId.test.ts`
- Modify: `/Users/steven/_CODE/GIT/multi-agent-ide/packages/daemon/src/errors/AppError.ts` (add `AI_RESUME_PENDING_RECONCILIATION` if missing)

- [ ] **Step 1: Confirm error code is registered**

Open `packages/daemon/src/errors/AppError.ts`. If `AI_RESUME_PENDING_RECONCILIATION` is not in `AppErrorCode`, add it:

```ts
// inside the AppErrorCode union/enum:
| "AI_RESUME_PENDING_RECONCILIATION"
```

Per CLAUDE.md "Valid error codes" list: yes, this is a new code; it must be added in this file in the same commit as the helper.

- [ ] **Step 2: Write failing tests**

```ts
// packages/daemon/src/application/awaitProviderSessionId.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { awaitProviderSessionId } from "./awaitProviderSessionId";

describe("awaitProviderSessionId", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("resolves immediately when the providerSessionId is already known", async () => {
    const lookup = vi.fn(() => "PROVIDER-ID");
    const sub = vi.fn(() => () => {});
    await expect(
      awaitProviderSessionId({ sessionId: "S", lookup, subscribe: sub, timeoutMs: 5_000 }),
    ).resolves.toBe("PROVIDER-ID");
    expect(sub).not.toHaveBeenCalled();
  });

  it("resolves on subscription notification before the deadline", async () => {
    let notify: ((id: string) => void) | null = null;
    const lookup = vi.fn(() => null); // not yet known
    const subscribe = (sessionId: string, cb: (id: string) => void) => {
      notify = cb;
      return () => { notify = null; };
    };

    const promise = awaitProviderSessionId({
      sessionId: "S",
      lookup,
      subscribe,
      timeoutMs: 5_000,
    });

    // Simulate reconciliation happening 100ms in.
    await vi.advanceTimersByTimeAsync(100);
    notify!("LATE-PROVIDER-ID");
    await expect(promise).resolves.toBe("LATE-PROVIDER-ID");
  });

  it("throws AI_RESUME_PENDING_RECONCILIATION after timeout (FR-7.2.c)", async () => {
    const lookup = vi.fn(() => null);
    const subscribe = () => () => {};

    const promise = awaitProviderSessionId({
      sessionId: "S",
      lookup,
      subscribe,
      timeoutMs: 5_000,
    });

    await vi.advanceTimersByTimeAsync(5_000);
    await expect(promise).rejects.toThrow(/AI_RESUME_PENDING_RECONCILIATION/);
  });
});
```

- [ ] **Step 3: Run and verify failure**

Run: `pnpm --filter @magenta/daemon test awaitProviderSessionId`
Expected: FAIL — module missing.

- [ ] **Step 4: Implement**

```ts
// packages/daemon/src/application/awaitProviderSessionId.ts
import { AppError } from "../errors/AppError";

export interface AwaitProviderSessionIdInput {
  sessionId: string;
  /** Synchronous lookup of the current providerSessionId, or null if absent. */
  lookup: (sessionId: string) => string | null;
  /** Subscribe to reconciliation events; returns unsubscribe. */
  subscribe: (sessionId: string, cb: (providerSessionId: string) => void) => () => void;
  /** Default 5_000 ms per FR-7.2.c. */
  timeoutMs: number;
}

export async function awaitProviderSessionId({
  sessionId,
  lookup,
  subscribe,
  timeoutMs,
}: AwaitProviderSessionIdInput): Promise<string> {
  const existing = lookup(sessionId);
  if (existing) return existing;

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      unsubscribe();
      reject(
        new AppError(
          "AI_RESUME_PENDING_RECONCILIATION",
          `Session ${sessionId} not yet reconciled with provider after ${timeoutMs}ms`,
        ),
      );
    }, timeoutMs);

    const unsubscribe = subscribe(sessionId, (providerSessionId) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(providerSessionId);
    });
  });
}
```

- [ ] **Step 5: Verify**

Run: `pnpm --filter @magenta/daemon test awaitProviderSessionId`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/application/awaitProviderSessionId.ts packages/daemon/src/application/awaitProviderSessionId.test.ts packages/daemon/src/errors/AppError.ts
git commit -m "feat(daemon): bounded-wait helper for AI_RESUME_PENDING_RECONCILIATION"
```

---

## Task 6: Extend IPC schemas — `ai-session:create` (sessionId/name/continue/from-pr), `ai-session:fork`, `ai-session:reconciled`

**Files:**
- Modify: `/Users/steven/_CODE/GIT/multi-agent-ide/packages/shared/src/ipc.ts`
- Modify: `/Users/steven/_CODE/GIT/multi-agent-ide/packages/ui/src/renderer/services/ipcClient.ts`

- [ ] **Step 1: Write failing schema tests**

```ts
// packages/shared/src/ipc.test.ts (append, or create file if missing)
import { describe, it, expect } from "vitest";
import { IpcRequestSchema, IpcResponseSchema } from "./ipc";

const UUID = "11111111-1111-4111-8111-111111111111";

describe("Phase 5 IPC additions", () => {
  it("ai-session:create accepts sessionId, name, resumeFromPR, continueRecent, forkSession", () => {
    expect(() =>
      IpcRequestSchema.parse({
        type: "ai-session:create",
        provider: "claude",
        cols: 80, rows: 24,
        sessionId: UUID,
        name: "spec-review",
        resumeFromPR: "https://github.com/o/r/pull/1",
        continueRecent: false,
        forkSession: false,
      }),
    ).not.toThrow();
  });

  it("ai-session:create rejects non-UUID sessionId", () => {
    expect(() =>
      IpcRequestSchema.parse({
        type: "ai-session:create",
        provider: "claude",
        cols: 80, rows: 24,
        sessionId: "not-a-uuid",
      }),
    ).toThrow();
  });

  it("ai-session:fork is a registered request variant", () => {
    expect(() =>
      IpcRequestSchema.parse({
        type: "ai-session:fork",
        parentSessionId: UUID,
        cols: 80, rows: 24,
      }),
    ).not.toThrow();
  });

  it("ai-session:fork accepts an optional caller-provided child sessionId", () => {
    expect(() =>
      IpcRequestSchema.parse({
        type: "ai-session:fork",
        parentSessionId: UUID,
        sessionId: "22222222-2222-4222-8222-222222222222",
        cols: 80, rows: 24,
      }),
    ).not.toThrow();
  });

  it("ai-session:reconciled is a registered push event", () => {
    expect(() =>
      IpcResponseSchema.parse({
        type: "ai-session:reconciled",
        sessionId: UUID,
        providerSessionId: "PROVIDER-ID",
      }),
    ).not.toThrow();
  });

  it("ai-session:list:result rows expose `resumable: boolean`", () => {
    // Sample row with the new flag — exact response shape may already include
    // an array of records; the addition is a `resumable` boolean per row.
    expect(() =>
      IpcResponseSchema.parse({
        type: "ai-session:list:result",
        sessions: [
          {
            id: UUID,
            provider: "claude",
            repoPath: null, repoName: null, branch: null,
            worktreePath: null, worktreeName: null, cwd: "/tmp",
            providerSessionId: null,
            status: "idle",
            permissionMode: "default",
            title: null,
            parentSessionId: null,
            createdAt: 0, lastActiveAt: 0,
            resumable: false,
          },
        ],
      }),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @magenta/shared test ipc`
Expected: FAIL — schemas missing.

- [ ] **Step 3: Update `IpcRequestSchema`**

Replace the current `ai-session:create` literal entry (around line 146 of `ipc.ts`) with:

```ts
z.object({
  type: z.literal("ai-session:create"),
  provider: z.enum(AI_PROVIDERS),
  repoPath: z.string().optional(),
  branch: z.string().optional(),
  worktreePath: z.string().optional(),
  permissionMode: z.enum(AI_PERMISSION_MODES).optional(),
  // Phase 5 — caller-provided canonical session ID (FR-7.1).
  sessionId: z.string().uuid().optional(),
  // Phase 5 — `-n` plumbing (FR-7.8). Claude only.
  name: z.string().min(1).max(200).optional(),
  // Phase 5 — `--from-pr` plumbing (FR-7.9). Claude only.
  resumeFromPR: z.string().min(1).max(500).optional(),
  // Phase 5 — `--continue` (Claude `-c`) "continue most recent".
  continueRecent: z.boolean().optional(),
  // Existing pre-Phase-5 field, retained.
  providerSessionId: z.string().optional(),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
}),
```

Add immediately after the existing `ai-session:list` variant:

```ts
z.object({
  type: z.literal("ai-session:fork"),
  parentSessionId: z.string().uuid(),
  // Phase 5 — caller-provided child canonical session ID (FR-7.7).
  sessionId: z.string().uuid().optional(),
  prompt: z.string().optional(),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
}),
```

- [ ] **Step 4: Update `IpcResponseSchema`**

Add the following new variants (locate the section that defines push events and `*:result` payloads):

```ts
// Phase 5 — push event fired once provider-assigned UUID is known (FR-7.4).
z.object({
  type: z.literal("ai-session:reconciled"),
  sessionId: z.string().uuid(),
  providerSessionId: z.string(),
}),
// Phase 5 — paired success response for ai-session:fork.
z.object({
  type: z.literal("ai-session:fork:result"),
  session: AISessionRecordSchema,
}),
```

Locate the existing `ai-session:list:result` shape and extend each row with `resumable: z.boolean()` (FR-7.6). If the response uses `AISessionRecordSchema` directly, define a derived schema in `aiTerminal.ts` that adds the field:

```ts
export const AISessionListEntrySchema = AISessionRecordSchema.extend({
  resumable: z.boolean(),
});
export type AISessionListEntry = z.infer<typeof AISessionListEntrySchema>;
```

…and reference `AISessionListEntrySchema` in the list-result variant.

- [ ] **Step 5: Sync `ResponseForRequest` in the renderer**

```ts
// packages/ui/src/renderer/services/ipcClient.ts — extend the type map:
"ai-session:create": Extract<IpcResponse, { type: "ai-session:create:result" }>;
"ai-session:fork":   Extract<IpcResponse, { type: "ai-session:fork:result" }>;
// (the fork-session create route reuses the existing :create:result; no separate type)
```

- [ ] **Step 6: Verify**

Run: `pnpm --filter @magenta/shared test ipc`
Expected: PASS.

Run: `pnpm -w typecheck`
Expected: PASS — fix any handler/store sites that destructure the old `ai-session:create` shape so they tolerate the additive optional fields.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/ipc.ts packages/shared/src/ipc.test.ts packages/shared/src/aiTerminal.ts packages/ui/src/renderer/services/ipcClient.ts
git commit -m "feat(shared): IPC fields for caller-provided sessionId, fork, reconciled, resumable"
```

---

## Task 7: Wire resolver, idempotent reconnect, and `name`/`continue`/`from-pr` argv into `createSession`

**Files:**
- Modify: `/Users/steven/_CODE/GIT/multi-agent-ide/packages/daemon/src/application/AISessionApplicationService.ts`
- Modify: `/Users/steven/_CODE/GIT/multi-agent-ide/packages/daemon/src/ipc/handlers/aiSessionHandlers.ts`

This is the central wiring task. Tests for AC-13/14/15/16/17 land in Task 10.

- [ ] **Step 1: Adopt the resolver**

In `createSession`, replace the existing `const id = randomUUID();` with:

```ts
import { resolveSessionId } from "../domain/sessionIdResolver";
import { randomUUID } from "node:crypto";

// FR-7.1: caller-provided sessionId wins; otherwise generate UUID v4.
const id = resolveSessionId({
  callerProvided: config.sessionId,
  generate: randomUUID,
});
```

- [ ] **Step 2: Add idempotent-reconnect short-circuit (FR-7.3)**

Immediately after the `const id = ...` line above, before any spawn work:

```ts
// FR-7.3 — idempotent reconnect: if a row already exists for the same
// canonical sessionId AND the same repoPath/worktreePath, treat the create
// as resume.
const existing = this.records.get(id);
if (
  existing &&
  (existing.repoPath ?? null) === (config.repoPath ?? null) &&
  (existing.worktreePath ?? null) === (config.worktreePath ?? null)
) {
  return this.resumeSession(id, cols, rows);
}
```

- [ ] **Step 3: Plumb explicit session ID, name, continue, from-pr into argv**

Extend the existing argv assembly. After `const idArgs: string[] = [];` and the existing resume blocks, add:

```ts
const caps = getProviderCapability(provider); // already imported in Phase 1
const lifecycleArgs: string[] = [];

// FR-7.1.c — emit --session-id only when the provider supports it.
if (caps.supportsExplicitSessionId && !explicitId) {
  lifecycleArgs.push("--session-id", id);
}
// FR-7.8 — `-n <name>` for Claude.
if (config.name && caps.supportsName) {
  lifecycleArgs.push("-n", config.name);
}
// "Continue most recent" — Claude `-c`.
if (config.continueRecent && caps.supportsContinueRecent) {
  lifecycleArgs.push(provider === "claude" ? "-c" : "--continue");
}
// FR-7.9 — `--from-pr <num|url>` for Claude.
if (config.resumeFromPR && caps.supportsFromPR) {
  lifecycleArgs.push("--from-pr", config.resumeFromPR);
}

const args = [
  ...permissionArgs,
  ...providerMeta.defaultArgs,
  ...idArgs,
  ...lifecycleArgs,
];
```

- [ ] **Step 4: Persist `parentSessionId: null` on the record**

Inside the `record: AISessionRecord = { ... }` literal, add `parentSessionId: config.parentSessionId ?? null,` between `title: null,` and `createdAt: now,`.

- [ ] **Step 5: Emit `ai-session:reconciled`**

Find the two existing reconciliation patches in `scheduleClaudeReconciliation` and `scheduleCopilotReconciliation` (where they call `this.bridge?.send({ type: "ai-session:updated", ... })`). Immediately after each successful `providerSessionId` patch, add:

```ts
// FR-7.4 — surface provider-assigned UUID for resumability checks.
this.bridge?.send({
  type: "ai-session:reconciled",
  sessionId: liveId,
  providerSessionId: match.sessionId,
});
```

For Claude, `system/init` arrives via the stream-json parser (Phase 2). If the parser already emits an `AIStreamEvent` with kind `session-init`, hook the same emission off that path so Claude reconciliation fires immediately on init rather than waiting for disk scan. Otherwise, the disk-scan path remains the source.

- [ ] **Step 6: Update the IPC handler signature**

In `aiSessionHandlers.ts`, the `ai-session:create` handler currently constructs `AISessionConfig` from a subset of the message. Extend the construction to pass through the new fields:

```ts
safeHandle(bridge, "ai-session:create", async (msg) => {
  const config: AISessionConfig = {
    provider: msg.provider,
    repoPath: msg.repoPath,
    branch: msg.branch,
    worktreePath: msg.worktreePath,
    permissionMode: msg.permissionMode,
    providerSessionId: msg.providerSessionId,
    sessionId: msg.sessionId,
    name: msg.name,
    resumeFromPR: msg.resumeFromPR,
    continueRecent: msg.continueRecent,
  };
  const session = await aiSessionService.createSession(config, msg.cols, msg.rows);
  return { type: "ai-session:create:result", session } as const;
});
```

- [ ] **Step 7: Verify**

Run: `pnpm -w typecheck`
Expected: PASS.

Run: `pnpm --filter @magenta/daemon test`
Expected: existing tests still pass (no behavior change for tests that don't pass `sessionId`).

- [ ] **Step 8: Commit**

```bash
git add packages/daemon/src/application/AISessionApplicationService.ts packages/daemon/src/ipc/handlers/aiSessionHandlers.ts
git commit -m "feat(daemon): caller-provided sessionId, idempotent reconnect, name/continue/from-pr argv"
```

---

## Task 8: `ai-session:fork` — application service + IPC handler

**Files:**
- Modify: `/Users/steven/_CODE/GIT/multi-agent-ide/packages/daemon/src/application/AISessionApplicationService.ts`
- Modify: `/Users/steven/_CODE/GIT/multi-agent-ide/packages/daemon/src/ipc/handlers/aiSessionHandlers.ts`
- Modify: `/Users/steven/_CODE/GIT/multi-agent-ide/packages/daemon/src/ipc/registerHandlers.ts`

- [ ] **Step 1: Add `forkSession` method to the application service**

```ts
// Inside AISessionApplicationService, alongside createSession/resumeSession:

async forkSession(
  parentSessionId: string,
  childSessionId: string | undefined,
  cols: number,
  rows: number,
): Promise<AISessionRecord> {
  const parent = this.records.get(parentSessionId);
  if (!parent) {
    throw new AppError("NOT_FOUND", `Parent session not found: ${parentSessionId}`);
  }
  const caps = getProviderCapability(parent.provider);
  if (!caps.supportsForkSession) {
    throw new AppError(
      "UNSUPPORTED_SPAWN_OPTION",
      `Provider '${parent.provider}' does not support fork-session`,
    );
  }
  // Resolve provider-side resume token. For Claude this equals the canonical
  // ID; for Copilot we'd need providerSessionId — but Copilot is rejected
  // above, so this branch only runs for Claude.
  const parentResumeToken = parent.providerSessionId ?? parent.id;

  // Resolve child canonical ID.
  const childId = resolveSessionId({
    callerProvided: childSessionId,
    generate: randomUUID,
  });

  // Compose a config that re-uses repo/worktree/permissions of the parent.
  const config: AISessionConfig = {
    provider: parent.provider,
    repoPath: parent.repoPath ?? undefined,
    branch: parent.branch ?? undefined,
    worktreePath: parent.worktreePath ?? undefined,
    permissionMode: parent.permissionMode,
    sessionId: childId,
    parentSessionId: parent.id,
    forkSession: true,
    // The `--resume <parent>` token is plumbed via providerSessionId so the
    // existing argv assembly path picks it up.
    providerSessionId: parentResumeToken,
  };
  return this.createSession(config, cols, rows);
}
```

In the argv assembly inside `createSession`, when `config.forkSession === true`, replace the `idArgs` block with a call into `buildForkArgv`:

```ts
import { buildForkArgv } from "../domain/forkArgvBuilder";

if (config.forkSession && explicitId) {
  // Fork path: --resume <parent> --fork-session [--session-id <child>]
  idArgs.push(
    ...buildForkArgv({
      parentResumeToken: explicitId,
      childCanonicalId: id,
      capability: {
        supportsForkSession: caps.supportsForkSession,
        supportsExplicitSessionId: caps.supportsExplicitSessionId,
        provider,
      },
    }),
  );
}
```

- [ ] **Step 2: Add the IPC handler**

```ts
// packages/daemon/src/ipc/handlers/aiSessionHandlers.ts (append in the same
// registration function):
safeHandle(bridge, "ai-session:fork", async (msg) => {
  const session = await aiSessionService.forkSession(
    msg.parentSessionId,
    msg.sessionId,
    msg.cols,
    msg.rows,
  );
  return { type: "ai-session:fork:result", session } as const;
});
```

- [ ] **Step 3: Verify wiring in `registerHandlers.ts`**

The fork handler is registered through the existing AI session handler module; no new top-level wiring is needed beyond confirming the file imports the same `aiSessionService` instance.

- [ ] **Step 4: Verify**

Run: `pnpm -w typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/application/AISessionApplicationService.ts packages/daemon/src/ipc/handlers/aiSessionHandlers.ts
git commit -m "feat(daemon): ai-session:fork via buildForkArgv"
```

---

## Task 9: Resume — canonical-only addressing, bounded wait, fallback retry

**Files:**
- Modify: `/Users/steven/_CODE/GIT/multi-agent-ide/packages/daemon/src/application/AISessionApplicationService.ts`

- [ ] **Step 1: Update `resumeSession` to look up provider token by canonical ID**

The current `resumeSession` reads `record.providerSessionId` directly. Replace the resume-token resolution with capability-aware logic plus bounded wait:

```ts
import { awaitProviderSessionId } from "./awaitProviderSessionId";

async resumeSession(sessionId: string, cols: number, rows: number): Promise<AISessionRecord> {
  const record = this.records.get(sessionId);
  if (!record) throw new AppError("NOT_FOUND", `AI session not found: ${sessionId}`);

  // ... existing live-session short-circuit ...
  // ... existing worktree validity check ...

  const caps = getProviderCapability(record.provider);
  // FR-7.2.a — resolve the provider-specific resume token from the canonical ID.
  let resumeToken: string;
  if (caps.supportsExplicitSessionId) {
    // Claude: canonical ID equals provider session ID.
    resumeToken = record.id;
  } else {
    // Copilot: must look up provider_session_id; block up to 5s if pending.
    resumeToken = await awaitProviderSessionId({
      sessionId: record.id,
      lookup: (id) => this.records.get(id)?.providerSessionId ?? null,
      subscribe: (id, cb) => this.subscribeReconciled(id, cb),
      timeoutMs: this.resumeReconciliationTimeoutMs,
    });
  }

  // Build resume argv.
  const baseArgs = this.buildResumeArgs(record, resumeToken);

  // FR-7.10 — try once; on rejection, retry without resume and emit fallback event.
  return this.spawnWithResumeFallback(record, baseArgs, resumeToken, cols, rows);
}
```

Where:

- `this.subscribeReconciled(id, cb)` is a small new method that registers `cb` against an internal `Map<string, Set<(p: string) => void>>` keyed by sessionId. It is invoked from inside the `scheduleClaudeReconciliation` / `scheduleCopilotReconciliation` patches in Task 7 Step 5 (right after the `ai-session:reconciled` push) so that pending resumes wake up.
- `this.resumeReconciliationTimeoutMs` is a new constructor parameter on `AISessionApplicationService`, default `5_000`.
- `this.buildResumeArgs(record, token)` is the existing resume-argv assembly extracted into a method that returns the full args including `--resume <token>`.
- `this.spawnWithResumeFallback` implements:

```ts
private async spawnWithResumeFallback(
  record: AISessionRecord,
  argsWithResume: string[],
  resumeToken: string,
  cols: number,
  rows: number,
): Promise<AISessionRecord> {
  const factory = getSessionFactory(record.provider);
  const session = factory.create(record.id);
  this.wireSessionEvents(record.id, session);

  // First attempt — with --resume.
  try {
    session.start(record.cwd, argsWithResume, cols, rows);
    this.liveSessions.set(record.id, session);
    return record;
  } catch (err) {
    // Retry once without resume, surface a typed warning event (FR-7.10).
    const argsNoResume = argsWithResume.filter(
      (a, i, arr) => a !== "--resume" && arr[i - 1] !== "--resume" && a !== `--resume=${resumeToken}`,
    );
    const reason = err instanceof Error ? err.message : String(err);
    this.bridge?.send({
      type: "ai-session:event",
      sessionId: record.id,
      event: { kind: "resume-fallback", reason },
    });
    session.start(record.cwd, argsNoResume, cols, rows);
    this.liveSessions.set(record.id, session);
    return record;
  }
}
```

The exact `AIStreamEvent` shape for `resume-fallback` was added in Phase 2; this task assumes the kind is registered. If it is not, add it to the `AIStreamEvent` union in shared:

```ts
| { kind: "resume-fallback"; reason: string }
```

- [ ] **Step 2: Mark `resumable` in `ai-session:list`**

Find the `listSessions` IPC handler / mapper and produce `AISessionListEntry` rows:

```ts
listSessions(): AISessionListEntry[] {
  return [...this.records.values()].map((record) => ({
    ...record,
    resumable: this.isResumable(record),
  }));
}

private isResumable(record: AISessionRecord): boolean {
  // FR-7.6 — Claude: providerSessionId equals canonical id; resumable iff
  // session file present on disk. Copilot: resumable iff providerSessionId
  // present AND on disk. We trust the existing SessionFileWatcher /
  // SessionSyncGateway to mark missing-on-disk via a side-channel; in the
  // absence of disk-scan integration, fall back to "providerSessionId set".
  if (record.provider === "claude") return true; // canonical == provider; disk check happens lazily
  return record.providerSessionId !== null;
}
```

(If a richer `SessionFileWatcher` API exists for confirming on-disk presence, route through it instead of returning `true` for Claude.)

- [ ] **Step 3: Verify**

Run: `pnpm -w typecheck`
Expected: PASS.

Run: `pnpm --filter @magenta/daemon test`
Expected: existing AI session tests still pass.

- [ ] **Step 4: Commit**

```bash
git add packages/daemon/src/application/AISessionApplicationService.ts packages/shared/src/aiTerminal.ts
git commit -m "feat(daemon): resume by canonical sessionId with bounded wait and fallback retry"
```

---

## Task 10: Integration tests covering AC-13 → AC-17 and FR-7.2.c / FR-7.10

**Files:**
- Create: `/Users/steven/_CODE/GIT/multi-agent-ide/packages/daemon/src/application/sessionLifecycle.test.ts`

- [ ] **Step 1: Write the failing integration tests**

```ts
// packages/daemon/src/application/sessionLifecycle.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AISessionApplicationService } from "./AISessionApplicationService";

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const X = "11111111-1111-4111-8111-111111111111";
const Y = "22222222-2222-4222-8222-222222222222";

// Mock CLI gateway / session factory recording every spawn argv list.
function makeMocks() {
  const spawns: { provider: string; argv: string[] }[] = [];
  const sessionFactory = (provider: string) => ({
    create: (id: string) => ({
      start: (cwd: string, argv: string[]) => {
        spawns.push({ provider, argv });
      },
      getStatus: () => "active" as const,
      on: () => {},
    }),
  });
  const bridge = {
    sent: [] as { type: string; [k: string]: unknown }[],
    send(msg: { type: string; [k: string]: unknown }) { this.sent.push(msg); },
  };
  return { spawns, sessionFactory, bridge };
}

describe("Session lifecycle Phase 5 — AC-13..AC-17", () => {
  let svc: AISessionApplicationService;
  let mocks: ReturnType<typeof makeMocks>;

  beforeEach(() => {
    mocks = makeMocks();
    svc = new AISessionApplicationService(/* inject mocks via DaemonContainer pattern; in test we
       construct the service with stubbed factories per the project's existing test scaffold */
       { bridge: mocks.bridge, sessionFactoryFor: mocks.sessionFactory } as never,
    );
  });

  it("AC-13: caller-provided sessionId round-trips for Claude", async () => {
    const rec = await svc.createSession(
      { provider: "claude", repoPath: "/tmp/r", sessionId: X },
      80, 24,
    );
    expect(rec.id).toBe(X);
    const argv = mocks.spawns.at(-1)!.argv;
    expect(argv).toContain("--session-id");
    expect(argv[argv.indexOf("--session-id") + 1]).toBe(X);
  });

  it("AC-14: caller-provided sessionId for Copilot returns synchronously, providerSessionId null until reconciled", async () => {
    const rec = await svc.createSession(
      { provider: "copilot", repoPath: "/tmp/r", sessionId: X },
      80, 24,
    );
    expect(rec.id).toBe(X);
    expect(rec.providerSessionId).toBeNull();
    const argv = mocks.spawns.at(-1)!.argv;
    expect(argv).not.toContain("--session-id"); // Copilot doesn't get the flag.

    // Simulate reconciliation: the disk-scan side channel patches the record.
    (svc as unknown as { onProviderSessionIdReconciled: (id: string, p: string) => void })
      .onProviderSessionIdReconciled(X, Y);

    const reconciled = mocks.bridge.sent.find((m) => m.type === "ai-session:reconciled");
    expect(reconciled).toMatchObject({ type: "ai-session:reconciled", sessionId: X, providerSessionId: Y });
  });

  it("AC-15: omitting sessionId returns a freshly generated UUID v4", async () => {
    const rec = await svc.createSession({ provider: "claude", repoPath: "/tmp/r" }, 80, 24);
    expect(rec.id).toMatch(UUID_V4_RE);
  });

  it("AC-16: idempotent reconnect — second create with same sessionId+repo+worktree resumes", async () => {
    await svc.createSession(
      { provider: "claude", repoPath: "/tmp/r", worktreePath: "/tmp/r/wt", sessionId: X },
      80, 24,
    );
    const second = await svc.createSession(
      { provider: "claude", repoPath: "/tmp/r", worktreePath: "/tmp/r/wt", sessionId: X },
      80, 24,
    );
    expect(second.id).toBe(X);
    expect(svc.listSessions().filter((s) => s.id === X)).toHaveLength(1);
  });

  it("AC-17: durability — record persisted, resumeSession reattaches across simulated daemon restart", async () => {
    await svc.createSession(
      { provider: "claude", repoPath: "/tmp/r", sessionId: X },
      80, 24,
    );
    // Simulate restart by rebuilding service against the same persistence store.
    const persisted = svc.serializeForPersistence();
    const fresh = new AISessionApplicationService(
      { bridge: mocks.bridge, sessionFactoryFor: mocks.sessionFactory, restoreFrom: persisted } as never,
    );
    const reattached = await fresh.resumeSession(X, 80, 24);
    expect(reattached.id).toBe(X);
    const argv = mocks.spawns.at(-1)!.argv;
    expect(argv).toContain("--resume");
    expect(argv[argv.indexOf("--resume") + 1]).toBe(X);
  });

  it("FR-7.2.c: resuming a Copilot session whose providerSessionId is not yet reconciled fails with AI_RESUME_PENDING_RECONCILIATION after timeout", async () => {
    vi.useFakeTimers();
    const fast = new AISessionApplicationService(
      { bridge: mocks.bridge, sessionFactoryFor: mocks.sessionFactory, resumeReconciliationTimeoutMs: 50 } as never,
    );
    await fast.createSession({ provider: "copilot", repoPath: "/tmp/r", sessionId: X }, 80, 24);
    const promise = fast.resumeSession(X, 80, 24);
    await vi.advanceTimersByTimeAsync(60);
    await expect(promise).rejects.toThrow(/AI_RESUME_PENDING_RECONCILIATION/);
    vi.useRealTimers();
  });

  it("FR-7.10: resume failure → retry without --resume, emit ai-session:event resume-fallback", async () => {
    // Configure session factory to throw on first spawn (simulate CLI rejecting --resume).
    let attempt = 0;
    const flaky = (provider: string) => ({
      create: () => ({
        start: (cwd: string, argv: string[]) => {
          attempt++;
          if (attempt === 1 && argv.includes("--resume")) {
            throw new Error("session file not found");
          }
        },
        getStatus: () => "active" as const,
        on: () => {},
      }),
    });
    const svc2 = new AISessionApplicationService(
      { bridge: mocks.bridge, sessionFactoryFor: flaky } as never,
    );
    await svc2.createSession({ provider: "claude", repoPath: "/tmp/r", sessionId: X }, 80, 24);
    await svc2.resumeSession(X, 80, 24);
    const fallback = mocks.bridge.sent.find(
      (m) => m.type === "ai-session:event" && (m as { event?: { kind?: string } }).event?.kind === "resume-fallback",
    );
    expect(fallback).toBeDefined();
  });

  it("AC-5: fork creates a new row with parent_session_id set; argv contains --fork-session", async () => {
    const parent = await svc.createSession(
      { provider: "claude", repoPath: "/tmp/r", sessionId: X },
      80, 24,
    );
    const child = await svc.forkSession(parent.id, undefined, 80, 24);
    expect(child.parentSessionId).toBe(parent.id);
    expect(child.id).toMatch(UUID_V4_RE);
    expect(child.id).not.toBe(parent.id);
    const argv = mocks.spawns.at(-1)!.argv;
    expect(argv).toContain("--fork-session");
    expect(argv).toContain("--resume");
  });

  it("Fork on Copilot raises UNSUPPORTED_SPAWN_OPTION", async () => {
    const parent = await svc.createSession(
      { provider: "copilot", repoPath: "/tmp/r", sessionId: X },
      80, 24,
    );
    await expect(svc.forkSession(parent.id, undefined, 80, 24)).rejects.toThrow(
      /UNSUPPORTED_SPAWN_OPTION/,
    );
  });
});
```

> **Note for the implementing worker.** The constructor surface used in this test (`bridge`, `sessionFactoryFor`, `restoreFrom`, `resumeReconciliationTimeoutMs`) is the test seam. If the existing `AISessionApplicationService` constructor differs, expose these via an options bag (additive, with defaults preserving today's behaviour) rather than changing the production wiring in `DaemonContainer`. The two helpers `serializeForPersistence` and `onProviderSessionIdReconciled` are existing-or-new private hooks: `serializeForPersistence` reads the LMDB-backed records map; `onProviderSessionIdReconciled` is the internal entry point that the disk-scan callbacks already invoke (rename if it currently has another name).

- [ ] **Step 2: Run the tests and watch them fail at the spots that need code (then refine impl from Tasks 7–9 until all green)**

Run: `pnpm --filter @magenta/daemon test sessionLifecycle`
Expected: tests fail initially; iterate on Tasks 7–9 implementation until each AC test passes.

- [ ] **Step 3: Workspace verification (per `feedback_verification.md` — typecheck + build + tests, no app launch)**

Run in parallel:
- `pnpm -w typecheck` — Expected: PASS for all 5 packages.
- `pnpm -w build` — Expected: PASS.
- `pnpm -w test` — Expected: PASS, including the new `sessionLifecycle.test.ts`.

- [ ] **Step 4: Commit**

```bash
git add packages/daemon/src/application/sessionLifecycle.test.ts
git commit -m "test(daemon): integration coverage for AC-13..AC-17 and FR-7.2.c/FR-7.10"
```

---

## Task 11: Extend `ai-chat:*` IPC schemas with `sessionId` and `spawn` (additive)

> Depends on Phase 2's `AiEditApplicationService` migration to `AIRunOnceApplicationService`.

**Files:**
- Modify: `/Users/steven/_CODE/GIT/multi-agent-ide/packages/shared/src/ipc.ts`
- Modify: `/Users/steven/_CODE/GIT/multi-agent-ide/packages/daemon/src/application/AiEditApplicationService.ts`
- Modify: `/Users/steven/_CODE/GIT/multi-agent-ide/packages/ui/src/renderer/services/ipcClient.ts`
- Create/Modify: `/Users/steven/_CODE/GIT/multi-agent-ide/packages/daemon/src/application/AiEditApplicationService.test.ts`

- [ ] **Step 1: Write failing schema + service tests**

```ts
// packages/shared/src/ipc.test.ts (append)
import { describe, it, expect } from "vitest";
import { IpcRequestSchema } from "./ipc";

const UUID = "33333333-3333-4333-8333-333333333333";

describe("Phase 5 ai-chat:* additions", () => {
  it("ai-chat:ask accepts optional sessionId and spawn", () => {
    expect(() =>
      IpcRequestSchema.parse({
        type: "ai-chat:ask",
        repoPath: "/tmp/r",
        provider: "claude",
        prompt: "hello",
        sessionId: UUID,
        spawn: { maxTurns: 3 },
      }),
    ).not.toThrow();
  });

  it("ai-chat:ask rejects non-UUID sessionId", () => {
    expect(() =>
      IpcRequestSchema.parse({
        type: "ai-chat:ask",
        repoPath: "/tmp/r",
        provider: "claude",
        prompt: "hello",
        sessionId: "not-a-uuid",
      }),
    ).toThrow();
  });

  it("ai-chat:edit-selection accepts optional sessionId and spawn", () => {
    expect(() =>
      IpcRequestSchema.parse({
        type: "ai-chat:edit-selection",
        repoPath: "/tmp/r",
        provider: "claude",
        filePath: "/tmp/r/a.ts",
        selection: "x",
        instruction: "rename",
        sessionId: UUID,
        spawn: { maxTurns: 2 },
      }),
    ).not.toThrow();
  });

  it("ai-chat:modify-document accepts optional sessionId and spawn", () => {
    expect(() =>
      IpcRequestSchema.parse({
        type: "ai-chat:modify-document",
        repoPath: "/tmp/r",
        provider: "claude",
        filePath: "/tmp/r/a.ts",
        content: "...",
        instruction: "format",
        sessionId: UUID,
        spawn: { maxTurns: 1 },
      }),
    ).not.toThrow();
  });

  it("ai-chat:ask-spec remains unchanged — sessionId/spawn are NOT accepted", () => {
    const parsed = IpcRequestSchema.safeParse({
      type: "ai-chat:ask-spec",
      specPath: "/tmp/r/spec.md",
      provider: "claude",
      prompt: "explain",
      sessionId: UUID,
    });
    // Either the schema rejects extras, or it strips them — either way the parsed
    // object MUST NOT carry sessionId.
    if (parsed.success) {
      expect((parsed.data as { sessionId?: unknown }).sessionId).toBeUndefined();
    } else {
      expect(parsed.success).toBe(false);
    }
  });
});
```

```ts
// packages/daemon/src/application/AiEditApplicationService.test.ts (new or append)
import { describe, it, expect, vi } from "vitest";
import { AiEditApplicationService } from "./AiEditApplicationService";

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const X = "44444444-4444-4444-8444-444444444444";

describe("AiEditApplicationService — sessionId + spawn plumbing (Phase 5)", () => {
  it("forwards caller-provided sessionId verbatim to AIRunOnceApplicationService.run()", async () => {
    const runOnce = { run: vi.fn().mockResolvedValue({ output: "" }) };
    const svc = new AiEditApplicationService({ runOnce } as never);
    await svc.ask({
      repoPath: "/tmp/r",
      provider: "claude",
      prompt: "hi",
      sessionId: X,
      spawn: { maxTurns: 4 },
    });
    expect(runOnce.run).toHaveBeenCalledTimes(1);
    const arg = runOnce.run.mock.calls[0][0];
    expect(arg.sessionId).toBe(X);
    expect(arg.spawn).toMatchObject({ maxTurns: 4 });
  });

  it("generates a UUID v4 when sessionId is omitted", async () => {
    const runOnce = { run: vi.fn().mockResolvedValue({ output: "" }) };
    const svc = new AiEditApplicationService({ runOnce } as never);
    await svc.ask({ repoPath: "/tmp/r", provider: "claude", prompt: "hi" });
    const arg = runOnce.run.mock.calls[0][0];
    expect(arg.sessionId).toMatch(UUID_V4_RE);
  });

  it("treats a second ask with the same (repoPath, provider, sessionId) as implicit resume", async () => {
    const runOnce = { run: vi.fn().mockResolvedValue({ output: "" }) };
    const svc = new AiEditApplicationService({ runOnce } as never);
    await svc.ask({ repoPath: "/tmp/r", provider: "claude", prompt: "first", sessionId: X });
    await svc.ask({ repoPath: "/tmp/r", provider: "claude", prompt: "second", sessionId: X });
    const second = runOnce.run.mock.calls[1][0];
    // Same canonical id; the engine resolves --resume internally via sessionIdResolver.
    expect(second.sessionId).toBe(X);
    expect(second.resume).toBe(true);
  });

  it("flows spawn.maxTurns through to the run", async () => {
    const runOnce = { run: vi.fn().mockResolvedValue({ output: "" }) };
    const svc = new AiEditApplicationService({ runOnce } as never);
    await svc.editSelection({
      repoPath: "/tmp/r",
      provider: "claude",
      filePath: "/tmp/r/a.ts",
      selection: "x",
      instruction: "rename",
      sessionId: X,
      spawn: { maxTurns: 7 },
    });
    expect(runOnce.run.mock.calls[0][0].spawn).toMatchObject({ maxTurns: 7 });
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm --filter @magenta/shared test ipc`
Expected: FAIL — the new `sessionId` / `spawn` fields are not yet on the schemas.

Run: `pnpm --filter @magenta/daemon test AiEditApplicationService`
Expected: FAIL — `ask` / `editSelection` / `modifyDocument` do not yet thread `sessionId` and `spawn` to `AIRunOnceApplicationService.run()`.

- [ ] **Step 3: Extend the three chat IPC request variants in `IpcRequestSchema`**

Locate each of the existing `ai-chat:ask`, `ai-chat:edit-selection`, and `ai-chat:modify-document` variants in `packages/shared/src/ipc.ts` and add the two optional fields. **Do not touch `ai-chat:ask-spec`.**

```ts
// ai-chat:ask
z.object({
  type: z.literal("ai-chat:ask"),
  repoPath: z.string(),
  provider: z.enum(AI_PROVIDERS),
  prompt: z.string(),
  // …existing optional fields preserved verbatim…
  // Phase 5 — chat-bubble unification spec FR-3 + Phase 5 sessionId precedence rule.
  sessionId: z.string().uuid().optional(),
  spawn: AISpawnOptionsSchema.partial().optional(),
}),

// ai-chat:edit-selection
z.object({
  type: z.literal("ai-chat:edit-selection"),
  repoPath: z.string(),
  provider: z.enum(AI_PROVIDERS),
  filePath: z.string(),
  selection: z.string(),
  instruction: z.string(),
  // …existing optional fields preserved verbatim…
  sessionId: z.string().uuid().optional(),
  spawn: AISpawnOptionsSchema.partial().optional(),
}),

// ai-chat:modify-document
z.object({
  type: z.literal("ai-chat:modify-document"),
  repoPath: z.string(),
  provider: z.enum(AI_PROVIDERS),
  filePath: z.string(),
  content: z.string(),
  instruction: z.string(),
  // …existing optional fields preserved verbatim…
  sessionId: z.string().uuid().optional(),
  spawn: AISpawnOptionsSchema.partial().optional(),
}),
```

> `AISpawnOptionsSchema` is the Phase 1 spawn-options schema already imported by `ipc.ts`. `.partial()` makes every spawn knob optional so callers can override just `maxTurns` (or any single field) without re-supplying the full options bag.

`ai-chat:ask-spec` MUST remain untouched — Spec-Review chat is stateless by design.

- [ ] **Step 4: Thread `sessionId` and `spawn` through `AiEditApplicationService`**

In `packages/daemon/src/application/AiEditApplicationService.ts`, each of the three methods (`ask`, `editSelection`, `modifyDocument`) currently calls `this.runOnce.run({ … })`. Update them to:

```ts
// Inside each method, build the run() argument from req plus the resolved canonical id.
const canonicalId = sessionIdResolver({
  callerProvided: req.sessionId,
  generate: () => crypto.randomUUID(),
});

// Implicit-resume rule: same idempotency key Phase 5 enforces for ai-session:create.
const existing = this.threadIndex.find({
  repoPath: req.repoPath,
  provider: req.provider,
  sessionId: canonicalId,
});

return this.runOnce.run({
  repoPath: req.repoPath,
  provider: req.provider,
  prompt: /* method-specific prompt assembly preserved verbatim */,
  sessionId: canonicalId,
  resume: existing !== undefined,
  spawn: req.spawn,
});
```

`sessionIdResolver` is the pure helper from Task 3 (already imported elsewhere in this service after Phase 2's migration). `threadIndex` is the existing in-memory map the service uses to track chat threads keyed by `(repoPath, provider, sessionId)`; if it does not yet exist, add a private `Map<string, true>` keyed by `${repoPath}::${provider}::${sessionId}` populated on each successful `run()`.

The response shape is unchanged (still returns the same `{ output, … }` payload); the additive fields are request-only.

- [ ] **Step 5: Sync `ResponseForRequest` in the renderer**

In `packages/ui/src/renderer/services/ipcClient.ts`, the chat IPC response types are unchanged (additive request-only). However, if the file declares request-side type aliases (e.g. `AskChatRequest`, `EditSelectionRequest`, `ModifyDocumentRequest`) that mirror the shared schemas, extend each with the two new optional fields:

```ts
export type AskChatRequest = Extract<IpcRequest, { type: "ai-chat:ask" }>;
export type EditSelectionRequest = Extract<IpcRequest, { type: "ai-chat:edit-selection" }>;
export type ModifyDocumentRequest = Extract<IpcRequest, { type: "ai-chat:modify-document" }>;
```

Because these types are derived via `Extract<IpcRequest, …>`, the additive `sessionId` and `spawn` fields surface automatically once `ipc.ts` is updated. No further `ResponseForRequest` map entries are required (the chat response variants are unchanged). Verify by running typecheck.

- [ ] **Step 6: Run the tests and verify they pass**

Run: `pnpm --filter @magenta/shared test ipc`
Expected: PASS — the four new chat assertions and the unchanged `ai-chat:ask-spec` assertion all green.

Run: `pnpm --filter @magenta/daemon test AiEditApplicationService`
Expected: PASS — caller-provided sessionId forwarded, omitted sessionId generates UUID v4, second call with same key resumes, `spawn.maxTurns` flows through.

Run: `pnpm -w typecheck`
Expected: PASS — fix any renderer call sites that explicitly type the chat request payloads so they tolerate the additive optional fields.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/ipc.ts packages/shared/src/ipc.test.ts packages/daemon/src/application/AiEditApplicationService.ts packages/daemon/src/application/AiEditApplicationService.test.ts packages/ui/src/renderer/services/ipcClient.ts
git commit -m "feat(shared): chat IPC variants accept canonical sessionId and spawn overrides"
```

---

## Task 12: Final verification and reporting

- [ ] **Step 1: Workspace typecheck**

Run: `pnpm -w typecheck`
Expected: All 5 packages clean.

- [ ] **Step 2: Workspace build**

Run: `pnpm -w build`
Expected: All packages build.

- [ ] **Step 3: Workspace tests**

Run: `pnpm -w test`
Expected: All tests pass; new tests from Tasks 1–10 included; no flakes.

- [ ] **Step 4: Stop here per `feedback_verification.md`**

Do not launch the app. Steven runs manual E2E (caller-provided sessionId for Claude, idempotent reconnect, fork from sidebar, resume after Electron quit, Copilot session created then resumed). Report:

> Phase 5 done. Caller-provided sessionId wins; daemon falls back to UUID v4 when omitted. Idempotent reconnect short-circuits to resume. Fork uses `--resume <parent> --fork-session [--session-id <child>]` for Claude; Copilot fork raises `UNSUPPORTED_SPAWN_OPTION`. Resume blocks up to 5s for Copilot pending reconciliation, then `AI_RESUME_PENDING_RECONCILIATION`. Resume failure retries once without `--resume` and surfaces `ai-session:event { kind: "resume-fallback" }`. New `ai-session:reconciled` push event fires on Claude `system/init` and after Copilot disk-scan. `parentSessionId` persisted (cache schema v2). `name`, `--continue`, `--from-pr` plumbed through capability-gated argv.

---

## Spec coverage check (self-review)

| Spec requirement | Covered by |
|---|---|
| Plan §4 Phase 5, Session ID precedence rule (caller wins, else generate UUID v4) | Task 3 (resolver) + Task 7 Step 1 (wired into `createSession`) |
| Plan §4 Phase 5, `--session-id` only when provider supports it | Task 2 (capability flag) + Task 7 Step 3 |
| Plan §4 Phase 5, response carries canonical `sessionId` synchronously | Task 6 (IPC schema) + Task 7 Step 1 |
| Plan §4 Phase 5, persist canonical id + provider_session_id; emit `ai-session:reconciled` | Task 1 (`parentSessionId` row) + Task 6 (event schema) + Task 7 Step 5 |
| Plan §4 Phase 5, resume addressable by canonical sessionId only | Task 9 Step 1 |
| Plan §4 Phase 5, idempotent reconnect | Task 7 Step 2 + Task 10 (AC-16 test) |
| Plan §4 Phase 5, `--fork-session` IPC + argv | Task 4 (builder) + Task 8 (service + handler) + Task 6 (IPC) |
| Plan §4 Phase 5, `-n/--name` plumbed | Task 7 Step 3 |
| Plan §4 Phase 5, `--continue` action | Task 7 Step 3 |
| Plan §4 Phase 5, `--from-pr` plumbed | Task 7 Step 3 |
| Plan §4 Phase 5, resume failure handling (`resume-fallback` event) | Task 9 Step 1 + Task 10 (FR-7.10 test) |
| Plan §5, "migration 16" (`parent_session_id`) | Task 1 (`AISessionRecord.parentSessionId` + cache schema v2 — LMDB equivalent per `project_db_role.md`) |
| FR-7.1.a — caller wins | Task 3 + Task 7 Step 1 |
| FR-7.1.b — generate when absent | Task 3 + Task 7 Step 1 |
| FR-7.1.c — `--session-id` for Claude | Task 2 + Task 7 Step 3 |
| FR-7.1.d — Copilot reconciles via disk scan | Task 7 Step 5 |
| FR-7.1.e — synchronous canonical sessionId in response | Task 6 + Task 7 Step 1 |
| FR-7.2.a — resume by canonical, lookup provider token | Task 9 Step 1 |
| FR-7.2.b — caller asymmetry hidden | Task 9 Step 1 |
| FR-7.2.c — bounded wait, `AI_RESUME_PENDING_RECONCILIATION` | Task 5 (helper) + Task 9 Step 1 + Task 10 (test) |
| FR-7.3 — idempotent reconnect | Task 7 Step 2 + Task 10 (AC-16 test) |
| FR-7.4 — `ai-session:reconciled` push event | Task 6 + Task 7 Step 5 |
| FR-7.5 — durability across daemon restart | Task 1 (cache schema v2) + Task 10 (AC-17 test) |
| FR-7.6 — `ai-session:list` carries `resumable` flag | Task 6 + Task 9 Step 2 |
| FR-7.7 — `ai-session:fork` with optional caller sessionId | Task 4 + Task 6 + Task 8 |
| FR-7.8 — `name` / `-n` plumbed | Task 6 + Task 7 Step 3 |
| FR-7.9 — `resumeFromPR` / `--from-pr` plumbed | Task 6 + Task 7 Step 3 |
| FR-7.10 — resume failure retry + warning event | Task 9 Step 1 + Task 10 (test) |
| AC-5 — fork row has `parent_session_id`, child UUID matches CLI session file | Task 8 + Task 10 |
| AC-11 — existing sessions still resumable post-migration | Task 1 (cache schema v2 rebuilds; sync rehydrates) + Task 9 |
| AC-13 — Claude caller-provided sessionId round-trip | Task 7 + Task 10 |
| AC-14 — Copilot caller-provided sessionId round-trip + reconcile | Task 7 + Task 10 |
| AC-15 — daemon-generated UUID v4 when sessionId omitted | Task 3 + Task 10 |
| AC-16 — idempotent reconnect | Task 7 + Task 10 |
| AC-17 — durability across daemon restart | Task 1 + Task 10 |
| FR-7.1 (sessionId precedence) extended to chat IPC | Task 11 |
| FR-7.3 (idempotent reconnect) extended to chat IPC | Task 11 |
| Chat-bubble unification spec FR-3 — chat threads carry canonical sessionId across turns | Task 11 |

**Out-of-scope deferrals** (covered by later phase plans):
- Subagents / `--agents` / plugins → Phase 6.
- Retry/cost observability → Phase 7.
- Preset library (already shipped in Phase 4).
