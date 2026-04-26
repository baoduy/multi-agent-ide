# Phase 1 — SpawnOptions Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ad-hoc argv construction (currently in `AiCliGateway.buildArgs` and the session factories) with one typed `AISpawnOptions` schema in `packages/shared` plus pure per-provider `toArgv()` adapters and a capability manifest. All later phases consume this foundation.

**Architecture:** Schema (`shared`) → Capability manifest (`shared`) → Pure adapter `toArgv(opts, caps)` per provider in `packages/daemon/src/domain/providerArgv/` → consumed by exactly two call sites (`AiCliGateway.runOnce` and `BaseAISession.buildSpawnArgv`). Unsupported options for a given provider are skipped with a debug-mode warning, except in `runOnce` where they raise `AppError("UNSUPPORTED_SPAWN_OPTION")` so callers learn early.

**Tech Stack:** TypeScript 5.x · Zod 3.x · Vitest · pnpm workspace · existing `@magenta/shared` re-export pattern.

**Spec references:** `specs/2026-04-24-cli-programmatic-improvements.md` §4 Phase 1 · `specs/2026-04-24-unified-ai-cli-interface.md` FR-1.x, FR-2.x, FR-4.x, NFR-6.

**Out of scope for this phase:**
- IPC changes (Phase 2).
- Stream-json parser (Phase 2).
- New migrations (Phase 3+).
- UI surfaces (Phase 2+).
- Wiring `AISpawnOptions` end-to-end through IPC — this plan stops at the daemon-internal layer.

---

## File structure

| Action | Path | Responsibility |
|---|---|---|
| Create | `packages/shared/src/aiSpawnOptions.ts` | `AISpawnOptions` Zod schema, type, `SPAWN_OPTIONS_SCHEMA_VERSION`. |
| Create | `packages/shared/src/providerCapabilities.ts` | `ProviderCapability` type + static manifest per provider listing supported `AISpawnOptions` keys + tool-allow syntax kind. |
| Create | `packages/shared/src/aiSpawnOptions.test.ts` | Schema round-trip + `.strict()` rejection + `extraArgs` passthrough. |
| Create | `packages/daemon/src/domain/providerArgv/claude.ts` | Pure `toArgv(opts, caps)` for Claude. |
| Create | `packages/daemon/src/domain/providerArgv/copilot.ts` | Pure `toArgv(opts, caps)` for Copilot. |
| Create | `packages/daemon/src/domain/providerArgv/index.ts` | `getToArgv(provider)` dispatcher; re-exports. |
| Create | `packages/daemon/src/domain/providerArgv/toArgv.test.ts` | Table-driven tests, one row per option × provider. |
| Modify | `packages/shared/src/aiTerminal.ts` | Re-export `AISpawnOptions`, `ProviderCapability`. |
| Modify | `packages/daemon/src/errors/AppError.ts` | Add `UNSUPPORTED_SPAWN_OPTION` to `AppErrorCode`. |
| Modify | `packages/daemon/src/infrastructure/AiCliGateway.ts` | `runOnce` consumes `toArgv`; deletes inline arg building from `claudeAdapter.buildArgs` / `copilotAdapter.buildArgs`. |
| Modify | `packages/daemon/src/infrastructure/sessions/BaseAISession.ts` (or whichever method builds PTY argv) | Consume `toArgv`; delete inline arg building. |
| Modify | `packages/daemon/src/domain/providerRegistry.ts` | Export `getProviderCapability(provider)` that re-exports the shared manifest, so daemon code reads through a single accessor. |

---

## Task 1: Add `AISpawnOptions` schema in shared

**Files:**
- Create: `packages/shared/src/aiSpawnOptions.ts`
- Create: `packages/shared/src/aiSpawnOptions.test.ts`

- [ ] **Step 1: Write the failing schema test**

```ts
// packages/shared/src/aiSpawnOptions.test.ts
import { describe, it, expect } from "vitest";
import { AISpawnOptionsSchema, SPAWN_OPTIONS_SCHEMA_VERSION } from "./aiSpawnOptions";

describe("AISpawnOptions", () => {
  it("exports a schema version constant", () => {
    expect(typeof SPAWN_OPTIONS_SCHEMA_VERSION).toBe("number");
    expect(SPAWN_OPTIONS_SCHEMA_VERSION).toBeGreaterThanOrEqual(1);
  });

  it("accepts an empty object", () => {
    expect(AISpawnOptionsSchema.parse({})).toEqual({});
  });

  it("accepts every documented field", () => {
    const sample = {
      outputFormat: "stream-json" as const,
      jsonSchema: { type: "object" },
      includePartialMessages: true,
      includeHookEvents: true,
      silent: true,
      model: "claude-sonnet-4-6",
      fallbackModel: "claude-haiku-4-5",
      effort: "high" as const,
      maxTurns: 10,
      maxBudgetUsd: 0.5,
      maxAutopilotContinues: 25,
      systemPrompt: "be terse",
      systemPromptFile: "/tmp/sys.md",
      appendSystemPrompt: "...",
      appendSystemPromptFile: "/tmp/append.md",
      excludeDynamicSystemPromptSections: true,
      allowedTools: ["Read", "Bash(git diff *)"],
      disallowedTools: ["WebFetch"],
      toolsAvailable: ["Read", "Edit"],
      permissionMode: "plan" as const,
      permissionPromptTool: "mcp__magenta__approve",
      noAskUser: true,
      allowUrls: ["https://github.com/*"],
      mcpConfig: { servers: {} },
      strictMcpConfig: true,
      enableAllGithubMcpTools: true,
      agents: { reviewer: { description: "d", prompt: "p" } },
      agent: "reviewer",
      pluginDirs: ["/plugins/a"],
      settings: { ANTHROPIC_API_KEY: "x" },
      settingSources: ["user", "project"] as const,
      sessionId: "11111111-1111-4111-8111-111111111111",
      resumeSessionId: "abc",
      continueRecent: true,
      forkSession: true,
      sessionName: "thread-1",
      fromPR: "https://github.com/o/r/pull/1",
      noSessionPersistence: true,
      bare: true,
      additionalDirs: ["/tmp/extra"],
      debug: "api,hooks",
      debugFile: "/tmp/d.log",
      verbose: true,
      extraArgs: ["--unstable-flag"],
    };
    expect(AISpawnOptionsSchema.parse(sample)).toEqual(sample);
  });

  it("rejects unknown keys (.strict)", () => {
    expect(() =>
      AISpawnOptionsSchema.parse({ totallyUnknown: true } as unknown),
    ).toThrow();
  });

  it("rejects non-uuid sessionId", () => {
    expect(() =>
      AISpawnOptionsSchema.parse({ sessionId: "not-a-uuid" }),
    ).toThrow();
  });

  it("rejects negative maxTurns", () => {
    expect(() => AISpawnOptionsSchema.parse({ maxTurns: -1 })).toThrow();
    expect(() => AISpawnOptionsSchema.parse({ maxTurns: 0 })).toThrow();
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `pnpm --filter @magenta/shared test aiSpawnOptions`
Expected: FAIL — module `./aiSpawnOptions` not found.

- [ ] **Step 3: Write the schema**

```ts
// packages/shared/src/aiSpawnOptions.ts
import { z } from "zod";

/**
 * Schema version for AISpawnOptions. Bump when a field is renamed or removed
 * (additive changes do not require a bump). Persistence layers should record
 * the version they were written with so future migrations can detect drift.
 */
export const SPAWN_OPTIONS_SCHEMA_VERSION = 1;

const PermissionMode = z.enum([
  "default",
  "acceptEdits",
  "plan",
  "auto",
  "dontAsk",
  "bypassPermissions",
]);

const Effort = z.enum(["low", "medium", "high", "xhigh", "max"]);
const OutputFormat = z.enum(["text", "json", "stream-json"]);
const SettingSource = z.enum(["user", "project", "local"]);

const AgentManifestEntry = z.object({
  description: z.string(),
  prompt: z.string(),
});

export const AISpawnOptionsSchema = z
  .object({
    // I/O
    outputFormat: OutputFormat.optional(),
    jsonSchema: z.record(z.unknown()).optional(),
    includePartialMessages: z.boolean().optional(),
    includeHookEvents: z.boolean().optional(),
    silent: z.boolean().optional(),

    // Model / budget
    model: z.string().optional(),
    fallbackModel: z.string().optional(),
    effort: Effort.optional(),
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
    toolsAvailable: z.array(z.string()).optional(),
    permissionMode: PermissionMode.optional(),
    permissionPromptTool: z.string().optional(),
    noAskUser: z.boolean().optional(),
    allowUrls: z.array(z.string()).optional(),

    // MCP / agents / plugins
    mcpConfig: z.union([z.string(), z.record(z.unknown())]).optional(),
    strictMcpConfig: z.boolean().optional(),
    enableAllGithubMcpTools: z.boolean().optional(),
    agents: z.record(AgentManifestEntry).optional(),
    agent: z.string().optional(),
    pluginDirs: z.array(z.string()).optional(),
    settings: z.union([z.string(), z.record(z.unknown())]).optional(),
    settingSources: z.array(SettingSource).optional(),

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

    // Power-user escape hatch (FR-1.3). Appended verbatim AFTER all
    // schema-derived flags. Callers carry the secrets-on-CLI risk (NFR-7).
    extraArgs: z.array(z.string()).optional(),
  })
  .strict();

export type AISpawnOptions = z.infer<typeof AISpawnOptionsSchema>;
```

- [ ] **Step 4: Run tests and verify they pass**

Run: `pnpm --filter @magenta/shared test aiSpawnOptions`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/aiSpawnOptions.ts packages/shared/src/aiSpawnOptions.test.ts
git commit -m "feat(shared): add AISpawnOptions zod schema"
```

---

## Task 2: Add `ProviderCapability` manifest

**Files:**
- Create: `packages/shared/src/providerCapabilities.ts`
- Create: `packages/shared/src/providerCapabilities.test.ts`
- Modify: `packages/shared/src/aiTerminal.ts` (re-export)

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/providerCapabilities.test.ts
import { describe, it, expect } from "vitest";
import {
  PROVIDER_CAPABILITIES,
  getProviderCapability,
  type SpawnOptionKey,
} from "./providerCapabilities";

describe("ProviderCapability manifests", () => {
  it("declares both providers", () => {
    expect(Object.keys(PROVIDER_CAPABILITIES).sort()).toEqual([
      "claude",
      "copilot",
    ]);
  });

  it("Claude advertises supportsExplicitSessionId=true", () => {
    expect(PROVIDER_CAPABILITIES.claude.supportsExplicitSessionId).toBe(true);
  });

  it("Copilot advertises supportsExplicitSessionId=false", () => {
    expect(PROVIDER_CAPABILITIES.copilot.supportsExplicitSessionId).toBe(false);
  });

  it("Claude supports jsonSchema, Copilot does not", () => {
    expect(PROVIDER_CAPABILITIES.claude.supportedKeys).toContain("jsonSchema");
    expect(PROVIDER_CAPABILITIES.copilot.supportedKeys).not.toContain(
      "jsonSchema",
    );
  });

  it("Copilot supports silent, Claude does not", () => {
    expect(PROVIDER_CAPABILITIES.copilot.supportedKeys).toContain("silent");
    expect(PROVIDER_CAPABILITIES.claude.supportedKeys).not.toContain("silent");
  });

  it("getProviderCapability returns the right manifest", () => {
    expect(getProviderCapability("claude").id).toBe("claude");
    expect(getProviderCapability("copilot").id).toBe("copilot");
  });

  it("toolAllowSyntax differs per provider", () => {
    expect(PROVIDER_CAPABILITIES.claude.toolAllowSyntax).toBe("claude");
    expect(PROVIDER_CAPABILITIES.copilot.toolAllowSyntax).toBe("copilot");
  });

  it("typecheck: SpawnOptionKey is keyof AISpawnOptions", () => {
    const k: SpawnOptionKey = "model";
    expect(k).toBe("model");
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `pnpm --filter @magenta/shared test providerCapabilities`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the manifest**

```ts
// packages/shared/src/providerCapabilities.ts
import type { AIProvider } from "./aiTerminal";
import type { AISpawnOptions } from "./aiSpawnOptions";

export type SpawnOptionKey = keyof AISpawnOptions;

/**
 * Static description of which AISpawnOptions a provider honours, what
 * tool-allow syntax it expects, and whether the daemon can pre-assign a
 * canonical session UUID. Phases 2+ may extend with version-gated entries.
 */
export interface ProviderCapability {
  id: AIProvider;
  /** Subset of AISpawnOptions keys the provider's toArgv knows how to render. */
  supportedKeys: readonly SpawnOptionKey[];
  /** Discriminator the preset translator branches on. */
  toolAllowSyntax: "claude" | "copilot";
  /** True when the provider's `--session-id` is honoured (Claude today). */
  supportsExplicitSessionId: boolean;
  /** Whether structured stream-json output is parseable for this provider. */
  supportsStreamJson: boolean;
}

const CLAUDE_KEYS: readonly SpawnOptionKey[] = [
  "outputFormat",
  "jsonSchema",
  "includePartialMessages",
  "includeHookEvents",
  "model",
  "fallbackModel",
  "effort",
  "maxTurns",
  "maxBudgetUsd",
  "systemPrompt",
  "systemPromptFile",
  "appendSystemPrompt",
  "appendSystemPromptFile",
  "excludeDynamicSystemPromptSections",
  "allowedTools",
  "disallowedTools",
  "toolsAvailable",
  "permissionMode",
  "permissionPromptTool",
  "mcpConfig",
  "strictMcpConfig",
  "agents",
  "agent",
  "pluginDirs",
  "settings",
  "settingSources",
  "sessionId",
  "resumeSessionId",
  "continueRecent",
  "forkSession",
  "sessionName",
  "fromPR",
  "noSessionPersistence",
  "bare",
  "additionalDirs",
  "debug",
  "debugFile",
  "verbose",
  "extraArgs",
];

const COPILOT_KEYS: readonly SpawnOptionKey[] = [
  "outputFormat",
  "silent",
  "model",
  "maxAutopilotContinues",
  "allowedTools",
  "disallowedTools",
  "permissionMode",
  "noAskUser",
  "allowUrls",
  "mcpConfig",
  "enableAllGithubMcpTools",
  "agent",
  "resumeSessionId",
  "continueRecent",
  "additionalDirs",
  "extraArgs",
];

export const PROVIDER_CAPABILITIES: Record<AIProvider, ProviderCapability> = {
  claude: {
    id: "claude",
    supportedKeys: CLAUDE_KEYS,
    toolAllowSyntax: "claude",
    supportsExplicitSessionId: true,
    supportsStreamJson: true,
  },
  copilot: {
    id: "copilot",
    supportedKeys: COPILOT_KEYS,
    toolAllowSyntax: "copilot",
    supportsExplicitSessionId: false,
    supportsStreamJson: false,
  },
};

export function getProviderCapability(p: AIProvider): ProviderCapability {
  return PROVIDER_CAPABILITIES[p];
}
```

- [ ] **Step 4: Re-export from `aiTerminal.ts`**

Open `packages/shared/src/aiTerminal.ts` and add at the bottom:

```ts
export {
  AISpawnOptionsSchema,
  SPAWN_OPTIONS_SCHEMA_VERSION,
  type AISpawnOptions,
} from "./aiSpawnOptions";
export {
  PROVIDER_CAPABILITIES,
  getProviderCapability,
  type ProviderCapability,
  type SpawnOptionKey,
} from "./providerCapabilities";
```

- [ ] **Step 5: Run tests and verify**

Run: `pnpm --filter @magenta/shared test providerCapabilities`
Expected: PASS, 8 tests.

Run: `pnpm --filter @magenta/shared typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/providerCapabilities.ts packages/shared/src/providerCapabilities.test.ts packages/shared/src/aiTerminal.ts
git commit -m "feat(shared): add ProviderCapability manifest"
```

---

## Task 3: Add `UNSUPPORTED_SPAWN_OPTION` error code

**Files:**
- Modify: `packages/daemon/src/errors/AppError.ts`

- [ ] **Step 1: Locate the existing `AppErrorCode` union**

Run: `rtk grep "UNSUPPORTED_SPAWN_OPTION\|type AppErrorCode" packages/daemon/src/errors/`
Expected: One match for the type definition; zero for the new code.

- [ ] **Step 2: Add the new code**

Edit `packages/daemon/src/errors/AppError.ts`. In the `AppErrorCode` union, add `"UNSUPPORTED_SPAWN_OPTION"` between two existing codes (alphabetical position is fine).

- [ ] **Step 3: Verify typecheck**

Run: `pnpm --filter @magenta/daemon typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/daemon/src/errors/AppError.ts
git commit -m "feat(daemon): add UNSUPPORTED_SPAWN_OPTION error code"
```

---

## Task 4: Pure `toArgv` for Claude

**Files:**
- Create: `packages/daemon/src/domain/providerArgv/claude.ts`
- Create: `packages/daemon/src/domain/providerArgv/toArgv.test.ts` (Claude rows only — extended in Task 5)

- [ ] **Step 1: Write the failing test (Claude rows)**

```ts
// packages/daemon/src/domain/providerArgv/toArgv.test.ts
import { describe, it, expect } from "vitest";
import type { AISpawnOptions } from "@magenta/shared/aiSpawnOptions";
import { getProviderCapability } from "@magenta/shared/providerCapabilities";
import { toArgvClaude } from "./claude";

const claudeCaps = getProviderCapability("claude");

function argv(opts: AISpawnOptions): { args: string[]; warnings: string[] } {
  return toArgvClaude(opts, claudeCaps);
}

describe("toArgvClaude", () => {
  it("empty options produce empty argv", () => {
    expect(argv({})).toEqual({ args: [], warnings: [] });
  });

  it("model -> --model", () => {
    expect(argv({ model: "claude-sonnet-4-6" }).args).toEqual([
      "--model",
      "claude-sonnet-4-6",
    ]);
  });

  it("outputFormat stream-json -> --output-format stream-json --verbose", () => {
    expect(argv({ outputFormat: "stream-json" }).args).toEqual([
      "--output-format",
      "stream-json",
      "--verbose",
    ]);
  });

  it("outputFormat json -> --output-format json (no --verbose)", () => {
    expect(argv({ outputFormat: "json" }).args).toEqual([
      "--output-format",
      "json",
    ]);
  });

  it("jsonSchema -> --json-schema with stringified JSON", () => {
    const schema = { type: "object", properties: { a: { type: "string" } } };
    expect(argv({ jsonSchema: schema }).args).toEqual([
      "--json-schema",
      JSON.stringify(schema),
    ]);
  });

  it("permissionMode bypassPermissions -> --dangerously-skip-permissions", () => {
    expect(argv({ permissionMode: "bypassPermissions" }).args).toEqual([
      "--dangerously-skip-permissions",
    ]);
  });

  it("permissionMode plan -> --permission-mode plan", () => {
    expect(argv({ permissionMode: "plan" }).args).toEqual([
      "--permission-mode",
      "plan",
    ]);
  });

  it("permissionMode auto -> --permission-mode auto --enable-auto-mode", () => {
    expect(argv({ permissionMode: "auto" }).args).toEqual([
      "--permission-mode",
      "auto",
      "--enable-auto-mode",
    ]);
  });

  it("allowedTools comma-joined to --allowedTools", () => {
    expect(
      argv({ allowedTools: ["Read", "Bash(git diff *)"] }).args,
    ).toEqual(["--allowedTools", "Read,Bash(git diff *)"]);
  });

  it("disallowedTools comma-joined to --disallowedTools", () => {
    expect(argv({ disallowedTools: ["WebFetch", "Edit"] }).args).toEqual([
      "--disallowedTools",
      "WebFetch,Edit",
    ]);
  });

  it("maxTurns / maxBudgetUsd render", () => {
    expect(argv({ maxTurns: 5, maxBudgetUsd: 0.25 }).args).toEqual([
      "--max-turns",
      "5",
      "--max-budget-usd",
      "0.25",
    ]);
  });

  it("bare -> --bare", () => {
    expect(argv({ bare: true }).args).toEqual(["--bare"]);
  });

  it("sessionId -> --session-id", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(argv({ sessionId: id }).args).toEqual(["--session-id", id]);
  });

  it("resumeSessionId -> --resume", () => {
    expect(argv({ resumeSessionId: "abc" }).args).toEqual(["--resume", "abc"]);
  });

  it("forkSession -> --fork-session", () => {
    expect(argv({ forkSession: true }).args).toEqual(["--fork-session"]);
  });

  it("continueRecent -> -c", () => {
    expect(argv({ continueRecent: true }).args).toEqual(["-c"]);
  });

  it("sessionName -> -n", () => {
    expect(argv({ sessionName: "thread-1" }).args).toEqual(["-n", "thread-1"]);
  });

  it("additionalDirs render one --add-dir per entry", () => {
    expect(argv({ additionalDirs: ["/a", "/b"] }).args).toEqual([
      "--add-dir",
      "/a",
      "--add-dir",
      "/b",
    ]);
  });

  it("pluginDirs render one --plugin-dir per entry", () => {
    expect(argv({ pluginDirs: ["/p1", "/p2"] }).args).toEqual([
      "--plugin-dir",
      "/p1",
      "--plugin-dir",
      "/p2",
    ]);
  });

  it("agents serialized to --agents", () => {
    const agents = { reviewer: { description: "r", prompt: "p" } };
    expect(argv({ agents }).args).toEqual(["--agents", JSON.stringify(agents)]);
  });

  it("agent -> --agent", () => {
    expect(argv({ agent: "reviewer" }).args).toEqual(["--agent", "reviewer"]);
  });

  it("settings object stringified to --settings", () => {
    expect(argv({ settings: { foo: 1 } }).args).toEqual([
      "--settings",
      JSON.stringify({ foo: 1 }),
    ]);
  });

  it("settings string passed through unchanged", () => {
    expect(argv({ settings: "/path/to/settings.json" }).args).toEqual([
      "--settings",
      "/path/to/settings.json",
    ]);
  });

  it("settingSources -> --setting-sources csv", () => {
    expect(argv({ settingSources: ["user", "project"] }).args).toEqual([
      "--setting-sources",
      "user,project",
    ]);
  });

  it("debugFile -> --debug-file", () => {
    expect(argv({ debugFile: "/tmp/d.log" }).args).toEqual([
      "--debug-file",
      "/tmp/d.log",
    ]);
  });

  it("extraArgs appended verbatim at the end", () => {
    expect(
      argv({ model: "x", extraArgs: ["--flag", "value"] }).args,
    ).toEqual(["--model", "x", "--flag", "value"]);
  });

  it("unsupported key (silent) is dropped with a warning", () => {
    const r = argv({ silent: true });
    expect(r.args).toEqual([]);
    expect(r.warnings).toEqual([
      "claude: unsupported AISpawnOptions key 'silent' was dropped",
    ]);
  });

  it("deterministic order: snapshot test for a complex combo", () => {
    expect(
      argv({
        bare: true,
        model: "claude-opus-4-7",
        permissionMode: "plan",
        allowedTools: ["Read"],
        sessionId: "11111111-1111-4111-8111-111111111111",
        outputFormat: "stream-json",
        maxTurns: 3,
      }).args,
    ).toMatchInlineSnapshot(`
      [
        "--bare",
        "--output-format",
        "stream-json",
        "--verbose",
        "--model",
        "claude-opus-4-7",
        "--max-turns",
        "3",
        "--permission-mode",
        "plan",
        "--allowedTools",
        "Read",
        "--session-id",
        "11111111-1111-4111-8111-111111111111",
      ]
    `);
  });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run: `pnpm --filter @magenta/daemon test toArgv`
Expected: FAIL — module `./claude` not found.

- [ ] **Step 3: Implement `toArgvClaude`**

```ts
// packages/daemon/src/domain/providerArgv/claude.ts
import type { AISpawnOptions } from "@magenta/shared/aiSpawnOptions";
import type {
  ProviderCapability,
  SpawnOptionKey,
} from "@magenta/shared/providerCapabilities";

export interface ToArgvResult {
  args: string[];
  warnings: string[];
}

/**
 * Pure translation of AISpawnOptions to Claude CLI argv. The caller is
 * responsible for passing the correct Claude capability manifest. Order is
 * deterministic (NFR-6): execution-mode flags first, then I/O, model/budget,
 * system prompt, tools/permissions, MCP/agents/settings, lifecycle,
 * workspace, debug, finally extraArgs verbatim.
 */
export function toArgvClaude(
  opts: AISpawnOptions,
  caps: ProviderCapability,
): ToArgvResult {
  const args: string[] = [];
  const warnings: string[] = [];
  const supported = new Set<SpawnOptionKey>(caps.supportedKeys);

  const drop = (key: SpawnOptionKey) => {
    warnings.push(`claude: unsupported AISpawnOptions key '${key}' was dropped`);
  };

  // Execution mode
  if (opts.bare !== undefined) supported.has("bare") && opts.bare ? args.push("--bare") : opts.bare && drop("bare");
  if (opts.verbose) args.push("--verbose");

  // I/O
  if (opts.outputFormat) {
    args.push("--output-format", opts.outputFormat);
    if (opts.outputFormat === "stream-json" && !opts.verbose) {
      // Claude CLI requires --verbose with stream-json to emit full payloads.
      args.push("--verbose");
    }
  }
  if (opts.jsonSchema !== undefined) {
    args.push("--json-schema", JSON.stringify(opts.jsonSchema));
  }
  if (opts.includePartialMessages) args.push("--include-partial-messages");
  if (opts.includeHookEvents) args.push("--include-hook-events");
  if (opts.silent !== undefined && opts.silent) drop("silent");

  // Model / budget
  if (opts.model) args.push("--model", opts.model);
  if (opts.fallbackModel) args.push("--fallback-model", opts.fallbackModel);
  if (opts.effort) args.push("--effort", opts.effort);
  if (opts.maxTurns !== undefined) args.push("--max-turns", String(opts.maxTurns));
  if (opts.maxBudgetUsd !== undefined)
    args.push("--max-budget-usd", String(opts.maxBudgetUsd));
  if (opts.maxAutopilotContinues !== undefined) drop("maxAutopilotContinues");

  // System prompt
  if (opts.systemPrompt) args.push("--system-prompt", opts.systemPrompt);
  if (opts.systemPromptFile)
    args.push("--system-prompt-file", opts.systemPromptFile);
  if (opts.appendSystemPrompt)
    args.push("--append-system-prompt", opts.appendSystemPrompt);
  if (opts.appendSystemPromptFile)
    args.push("--append-system-prompt-file", opts.appendSystemPromptFile);
  if (opts.excludeDynamicSystemPromptSections)
    args.push("--exclude-dynamic-system-prompt-sections");

  // Tools & permissions
  if (opts.permissionMode) {
    if (opts.permissionMode === "bypassPermissions") {
      args.push("--dangerously-skip-permissions");
    } else if (opts.permissionMode === "auto") {
      args.push("--permission-mode", "auto", "--enable-auto-mode");
    } else if (opts.permissionMode !== "default") {
      args.push("--permission-mode", opts.permissionMode);
    }
  }
  if (opts.permissionPromptTool)
    args.push("--permission-prompt-tool", opts.permissionPromptTool);
  if (opts.allowedTools && opts.allowedTools.length > 0)
    args.push("--allowedTools", opts.allowedTools.join(","));
  if (opts.disallowedTools && opts.disallowedTools.length > 0)
    args.push("--disallowedTools", opts.disallowedTools.join(","));
  if (opts.toolsAvailable && opts.toolsAvailable.length > 0)
    args.push("--tools", opts.toolsAvailable.join(","));
  if (opts.noAskUser) drop("noAskUser");
  if (opts.allowUrls && opts.allowUrls.length > 0) drop("allowUrls");

  // MCP / agents / plugins / settings
  if (opts.mcpConfig !== undefined) {
    const v =
      typeof opts.mcpConfig === "string"
        ? opts.mcpConfig
        : JSON.stringify(opts.mcpConfig);
    args.push("--mcp-config", v);
  }
  if (opts.strictMcpConfig) args.push("--strict-mcp-config");
  if (opts.enableAllGithubMcpTools) drop("enableAllGithubMcpTools");
  if (opts.agents) args.push("--agents", JSON.stringify(opts.agents));
  if (opts.agent) args.push("--agent", opts.agent);
  if (opts.pluginDirs) {
    for (const p of opts.pluginDirs) args.push("--plugin-dir", p);
  }
  if (opts.settings !== undefined) {
    const v =
      typeof opts.settings === "string"
        ? opts.settings
        : JSON.stringify(opts.settings);
    args.push("--settings", v);
  }
  if (opts.settingSources && opts.settingSources.length > 0)
    args.push("--setting-sources", opts.settingSources.join(","));

  // Lifecycle
  if (opts.continueRecent) args.push("-c");
  if (opts.resumeSessionId) args.push("--resume", opts.resumeSessionId);
  if (opts.sessionName) args.push("-n", opts.sessionName);
  if (opts.forkSession) args.push("--fork-session");
  if (opts.fromPR) args.push("--from-pr", opts.fromPR);
  if (opts.noSessionPersistence) args.push("--no-session-persistence");
  if (opts.sessionId) args.push("--session-id", opts.sessionId);

  // Workspace
  if (opts.additionalDirs) {
    for (const d of opts.additionalDirs) args.push("--add-dir", d);
  }

  // Debug
  if (opts.debug) args.push("--debug", opts.debug);
  if (opts.debugFile) args.push("--debug-file", opts.debugFile);

  // Escape hatch — verbatim, last
  if (opts.extraArgs && opts.extraArgs.length > 0) args.push(...opts.extraArgs);

  void supported; // capability gating live above per-key; manifest reserved for FR-2.3 enforcement layer
  return { args, warnings };
}
```

> Note: in this phase `caps.supportedKeys` is only used for the `drop()` warning on Copilot-only fields. Phase 2's `runOnce` IPC handler will additionally raise `AppError("UNSUPPORTED_SPAWN_OPTION")` instead of warning, using the same `caps` object. The pure adapter only warns so it stays usable from internal callers (FR-4.2).

- [ ] **Step 4: Run tests and verify pass**

Run: `pnpm --filter @magenta/daemon test toArgv`
Expected: PASS, all Claude tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/domain/providerArgv/claude.ts packages/daemon/src/domain/providerArgv/toArgv.test.ts
git commit -m "feat(daemon): pure toArgv adapter for Claude"
```

---

## Task 5: Pure `toArgv` for Copilot

**Files:**
- Create: `packages/daemon/src/domain/providerArgv/copilot.ts`
- Modify: `packages/daemon/src/domain/providerArgv/toArgv.test.ts` (append Copilot block)

- [ ] **Step 1: Append the Copilot test block**

Append to `toArgv.test.ts`:

```ts
import { toArgvCopilot } from "./copilot";

const copilotCaps = getProviderCapability("copilot");
const copArgv = (opts: AISpawnOptions) => toArgvCopilot(opts, copilotCaps);

describe("toArgvCopilot", () => {
  it("empty -> empty", () => {
    expect(copArgv({})).toEqual({ args: [], warnings: [] });
  });

  it("silent -> -s", () => {
    expect(copArgv({ silent: true }).args).toEqual(["-s"]);
  });

  it("outputFormat json -> --output-format json", () => {
    expect(copArgv({ outputFormat: "json" }).args).toEqual([
      "--output-format",
      "json",
    ]);
  });

  it("outputFormat stream-json is dropped (Copilot has no equivalent)", () => {
    const r = copArgv({ outputFormat: "stream-json" });
    expect(r.args).toEqual([]);
    expect(r.warnings).toEqual([
      "copilot: unsupported AISpawnOptions key 'outputFormat=stream-json' was dropped",
    ]);
  });

  it("model -> --model", () => {
    expect(copArgv({ model: "gpt-4.1" }).args).toEqual(["--model", "gpt-4.1"]);
  });

  it("permissionMode auto -> --autopilot --yolo --max-autopilot-continues 50", () => {
    expect(copArgv({ permissionMode: "auto" }).args).toEqual([
      "--autopilot",
      "--yolo",
      "--max-autopilot-continues",
      "50",
    ]);
  });

  it("permissionMode auto + maxAutopilotContinues=10 overrides 50", () => {
    expect(
      copArgv({ permissionMode: "auto", maxAutopilotContinues: 10 }).args,
    ).toEqual([
      "--autopilot",
      "--yolo",
      "--max-autopilot-continues",
      "10",
    ]);
  });

  it("permissionMode bypassPermissions -> --allow-all", () => {
    expect(copArgv({ permissionMode: "bypassPermissions" }).args).toEqual([
      "--allow-all",
    ]);
  });

  it("permissionMode plan dropped with warning", () => {
    const r = copArgv({ permissionMode: "plan" });
    expect(r.args).toEqual([]);
    expect(r.warnings).toEqual([
      "copilot: unsupported AISpawnOptions key 'permissionMode=plan' was dropped",
    ]);
  });

  it("noAskUser -> --no-ask-user", () => {
    expect(copArgv({ noAskUser: true }).args).toEqual(["--no-ask-user"]);
  });

  it("allowedTools render one --allow-tool per entry", () => {
    expect(
      copArgv({ allowedTools: ["read", "shell(git:*)"] }).args,
    ).toEqual([
      "--allow-tool",
      "read",
      "--allow-tool",
      "shell(git:*)",
    ]);
  });

  it("disallowedTools render one --deny-tool per entry", () => {
    expect(copArgv({ disallowedTools: ["write"] }).args).toEqual([
      "--deny-tool",
      "write",
    ]);
  });

  it("allowUrls render one --allow-url per entry", () => {
    expect(copArgv({ allowUrls: ["https://github.com/*"] }).args).toEqual([
      "--allow-url",
      "https://github.com/*",
    ]);
  });

  it("mcpConfig string -> --additional-mcp-config", () => {
    expect(copArgv({ mcpConfig: "/tmp/mcp.json" }).args).toEqual([
      "--additional-mcp-config",
      "/tmp/mcp.json",
    ]);
  });

  it("mcpConfig object dropped with warning (Copilot needs file path)", () => {
    const r = copArgv({ mcpConfig: { servers: {} } });
    expect(r.args).toEqual([]);
    expect(r.warnings[0]).toMatch(/mcpConfig/);
  });

  it("enableAllGithubMcpTools -> --enable-all-github-mcp-tools", () => {
    expect(copArgv({ enableAllGithubMcpTools: true }).args).toEqual([
      "--enable-all-github-mcp-tools",
    ]);
  });

  it("agent -> prepended /agent <name> NOT here (handled by intent layer); flag dropped", () => {
    // Phase 1: agent injection is the intent layer's job. Adapter drops it.
    const r = copArgv({ agent: "code-review" });
    expect(r.args).toEqual([]);
  });

  it("resumeSessionId -> --resume=<id>", () => {
    expect(copArgv({ resumeSessionId: "abc" }).args).toEqual(["--resume=abc"]);
  });

  it("continueRecent -> --continue", () => {
    expect(copArgv({ continueRecent: true }).args).toEqual(["--continue"]);
  });

  it("additionalDirs render one --add-dir per entry", () => {
    expect(copArgv({ additionalDirs: ["/x", "/y"] }).args).toEqual([
      "--add-dir",
      "/x",
      "--add-dir",
      "/y",
    ]);
  });

  it("Claude-only field jsonSchema dropped with warning", () => {
    const r = copArgv({ jsonSchema: { type: "object" } });
    expect(r.args).toEqual([]);
    expect(r.warnings).toEqual([
      "copilot: unsupported AISpawnOptions key 'jsonSchema' was dropped",
    ]);
  });

  it("extraArgs appended verbatim", () => {
    expect(
      copArgv({ silent: true, extraArgs: ["--share", "/tmp/x.md"] }).args,
    ).toEqual(["-s", "--share", "/tmp/x.md"]);
  });
});
```

- [ ] **Step 2: Run tests; verify they fail**

Run: `pnpm --filter @magenta/daemon test toArgv`
Expected: FAIL — `./copilot` module not found.

- [ ] **Step 3: Implement `toArgvCopilot`**

```ts
// packages/daemon/src/domain/providerArgv/copilot.ts
import type { AISpawnOptions } from "@magenta/shared/aiSpawnOptions";
import type {
  ProviderCapability,
  SpawnOptionKey,
} from "@magenta/shared/providerCapabilities";
import type { ToArgvResult } from "./claude";

const COPILOT_AUTOPILOT_DEFAULT = 50;

export function toArgvCopilot(
  opts: AISpawnOptions,
  caps: ProviderCapability,
): ToArgvResult {
  const args: string[] = [];
  const warnings: string[] = [];
  const drop = (label: string) =>
    warnings.push(`copilot: unsupported AISpawnOptions key '${label}' was dropped`);

  // I/O
  if (opts.silent) args.push("-s");
  if (opts.outputFormat) {
    if (opts.outputFormat === "json") {
      args.push("--output-format", "json");
    } else {
      drop(`outputFormat=${opts.outputFormat}`);
    }
  }

  // Model
  if (opts.model) args.push("--model", opts.model);

  // Permission mode (Copilot vocabulary is reduced)
  if (opts.permissionMode) {
    if (opts.permissionMode === "auto") {
      const cont =
        opts.maxAutopilotContinues ?? COPILOT_AUTOPILOT_DEFAULT;
      args.push("--autopilot", "--yolo", "--max-autopilot-continues", String(cont));
    } else if (opts.permissionMode === "bypassPermissions") {
      args.push("--allow-all");
    } else if (opts.permissionMode !== "default") {
      drop(`permissionMode=${opts.permissionMode}`);
    }
  } else if (opts.maxAutopilotContinues !== undefined) {
    // bare maxAutopilotContinues without auto mode is meaningless
    drop("maxAutopilotContinues");
  }

  if (opts.noAskUser) args.push("--no-ask-user");

  // Tool allow / deny — pattern strings rendered one flag per entry.
  if (opts.allowedTools) {
    for (const t of opts.allowedTools) args.push("--allow-tool", t);
  }
  if (opts.disallowedTools) {
    for (const t of opts.disallowedTools) args.push("--deny-tool", t);
  }
  if (opts.allowUrls) {
    for (const u of opts.allowUrls) args.push("--allow-url", u);
  }

  // MCP — file path only; objects can't be passed without daemon-side materialization (Phase 3).
  if (opts.mcpConfig !== undefined) {
    if (typeof opts.mcpConfig === "string") {
      args.push("--additional-mcp-config", opts.mcpConfig);
    } else {
      drop("mcpConfig (object form requires Phase 3 materialization)");
    }
  }
  if (opts.enableAllGithubMcpTools) args.push("--enable-all-github-mcp-tools");

  // Lifecycle
  if (opts.continueRecent) args.push("--continue");
  if (opts.resumeSessionId) args.push(`--resume=${opts.resumeSessionId}`);

  // Workspace
  if (opts.additionalDirs) {
    for (const d of opts.additionalDirs) args.push("--add-dir", d);
  }

  // Drop everything else with a warning if the caller set it.
  const dropIfSet = (k: SpawnOptionKey) => {
    if ((opts as Record<string, unknown>)[k] !== undefined) drop(k);
  };
  dropIfSet("jsonSchema");
  dropIfSet("includePartialMessages");
  dropIfSet("includeHookEvents");
  dropIfSet("fallbackModel");
  dropIfSet("effort");
  dropIfSet("maxTurns");
  dropIfSet("maxBudgetUsd");
  dropIfSet("systemPrompt");
  dropIfSet("systemPromptFile");
  dropIfSet("appendSystemPrompt");
  dropIfSet("appendSystemPromptFile");
  dropIfSet("excludeDynamicSystemPromptSections");
  dropIfSet("toolsAvailable");
  dropIfSet("permissionPromptTool");
  dropIfSet("strictMcpConfig");
  dropIfSet("agents");
  dropIfSet("agent"); // intent layer prepends /agent to prompt, not here
  dropIfSet("pluginDirs");
  dropIfSet("settings");
  dropIfSet("settingSources");
  dropIfSet("sessionId");
  dropIfSet("sessionName");
  dropIfSet("forkSession");
  dropIfSet("fromPR");
  dropIfSet("noSessionPersistence");
  dropIfSet("bare");
  dropIfSet("debug");
  dropIfSet("debugFile");
  dropIfSet("verbose");

  // Escape hatch
  if (opts.extraArgs) args.push(...opts.extraArgs);

  void caps;
  return { args, warnings };
}
```

- [ ] **Step 4: Run tests; verify pass**

Run: `pnpm --filter @magenta/daemon test toArgv`
Expected: PASS, all Claude + Copilot tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/domain/providerArgv/copilot.ts packages/daemon/src/domain/providerArgv/toArgv.test.ts
git commit -m "feat(daemon): pure toArgv adapter for Copilot"
```

---

## Task 6: `getToArgv` dispatcher

**Files:**
- Create: `packages/daemon/src/domain/providerArgv/index.ts`

- [ ] **Step 1: Add a dispatcher test**

Append to `toArgv.test.ts`:

```ts
import { getToArgv } from "./index";

describe("getToArgv dispatcher", () => {
  it("returns Claude renderer", () => {
    const fn = getToArgv("claude");
    expect(fn({ model: "x" }, claudeCaps).args).toEqual(["--model", "x"]);
  });
  it("returns Copilot renderer", () => {
    const fn = getToArgv("copilot");
    expect(fn({ model: "x" }, copilotCaps).args).toEqual(["--model", "x"]);
  });
});
```

- [ ] **Step 2: Run; verify fail**

Run: `pnpm --filter @magenta/daemon test toArgv`
Expected: FAIL — `./index` not found.

- [ ] **Step 3: Implement dispatcher**

```ts
// packages/daemon/src/domain/providerArgv/index.ts
import type { AIProvider } from "@magenta/shared/aiTerminal";
import type { AISpawnOptions } from "@magenta/shared/aiSpawnOptions";
import type { ProviderCapability } from "@magenta/shared/providerCapabilities";
import { toArgvClaude, type ToArgvResult } from "./claude";
import { toArgvCopilot } from "./copilot";

export type ToArgv = (
  opts: AISpawnOptions,
  caps: ProviderCapability,
) => ToArgvResult;

const REGISTRY: Record<AIProvider, ToArgv> = {
  claude: toArgvClaude,
  copilot: toArgvCopilot,
};

export function getToArgv(provider: AIProvider): ToArgv {
  return REGISTRY[provider];
}

export { toArgvClaude, toArgvCopilot, type ToArgvResult };
```

- [ ] **Step 4: Run; verify pass**

Run: `pnpm --filter @magenta/daemon test toArgv`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/domain/providerArgv/index.ts packages/daemon/src/domain/providerArgv/toArgv.test.ts
git commit -m "feat(daemon): provider argv dispatcher"
```

---

## Task 7: Wire `toArgv` into `AiCliGateway.runOnce`

**Files:**
- Modify: `packages/daemon/src/infrastructure/AiCliGateway.ts`

The current gateway hand-builds argv inside `claudeAdapter.buildArgs` / `copilotAdapter.buildArgs`. Phase 1's job is to *delete* those builders and have `runOnce` call `getToArgv(provider)` once. The existing public method signature `run(provider, model, prompt, options)` must keep working — Phase 1 is a refactor, not an API change. Internally we map `RunOptions` → `AISpawnOptions` and call `getToArgv`.

- [ ] **Step 1: Locate the existing test (if any) for `AiCliGateway`**

Run: `rtk grep "AiCliGateway" packages/daemon/src/ --include="*.test.ts"`
Note any existing tests; this refactor must keep them passing.

- [ ] **Step 2: Add a refactor-guard test**

Create `packages/daemon/src/infrastructure/AiCliGateway.refactor.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { runOptionsToSpawn } from "./AiCliGateway";

describe("runOptionsToSpawn (Phase 1 refactor seam)", () => {
  it("maps fields 1:1", () => {
    expect(
      runOptionsToSpawn({
        timeoutMs: 1000,
        extraArgs: ["--foo"],
        systemPromptAppend: "S",
        permissionMode: "plan",
        allowedTools: ["Read"],
        disallowedTools: ["Edit"],
        resumeSessionId: "abc",
      }),
    ).toEqual({
      appendSystemPrompt: "S",
      permissionMode: "plan",
      allowedTools: ["Read"],
      disallowedTools: ["Edit"],
      resumeSessionId: "abc",
      extraArgs: ["--foo"],
    });
  });

  it("enables stream-json output when streaming flag is set", () => {
    expect(
      runOptionsToSpawn(
        { timeoutMs: 1000, extraArgs: [] },
        { streaming: true, model: "x" },
      ),
    ).toEqual({
      outputFormat: "stream-json",
      verbose: true,
      model: "x",
    });
  });
});
```

- [ ] **Step 3: Run; verify fail**

Run: `pnpm --filter @magenta/daemon test AiCliGateway.refactor`
Expected: FAIL — `runOptionsToSpawn` not exported.

- [ ] **Step 4: Refactor `AiCliGateway.ts`**

In `AiCliGateway.ts`:

1. Delete the `claudeAdapter.buildArgs` and `copilotAdapter.buildArgs` *body* (keep `command`, `promptChannel`, `streamJsonSupported`).
2. Replace the `CliAdapter` interface to drop `buildArgs`.
3. Add an exported pure helper:

```ts
import { getToArgv } from "../domain/providerArgv";
import { getProviderCapability } from "@magenta/shared/providerCapabilities";
import type { AISpawnOptions } from "@magenta/shared/aiSpawnOptions";

export function runOptionsToSpawn(
  options: RunOptions,
  extras: { streaming?: boolean; model?: string } = {},
): AISpawnOptions {
  const out: AISpawnOptions = {};
  if (extras.model) out.model = extras.model;
  if (options.systemPromptAppend) out.appendSystemPrompt = options.systemPromptAppend;
  if (options.permissionMode) out.permissionMode = options.permissionMode;
  if (options.allowedTools && options.allowedTools.length > 0)
    out.allowedTools = [...options.allowedTools];
  if (options.disallowedTools && options.disallowedTools.length > 0)
    out.disallowedTools = [...options.disallowedTools];
  if (options.resumeSessionId) out.resumeSessionId = options.resumeSessionId;
  if (extras.streaming) {
    out.outputFormat = "stream-json";
    out.verbose = true;
  }
  if (options.extraArgs.length > 0) out.extraArgs = [...options.extraArgs];
  return out;
}
```

4. Inside `runOnce`, replace the `adapter.buildArgs(...)` call with:

```ts
const spawnOpts = runOptionsToSpawn(options, {
  streaming,
  model: provider === "claude" ? model : undefined, // Copilot ignores model in adapter
});
const caps = getProviderCapability(provider);
const { args, warnings } = getToArgv(provider)(spawnOpts, caps);
// Phase 1: warnings are not surfaced upstream; Phase 2 wires them through a debug logger.
void warnings;
// Claude historically receives the prompt via stdin AFTER `-p` argv flag.
// Preserve that: prepend `-p` for Claude here so behaviour is unchanged.
if (provider === "claude") args.unshift("-p");
// Copilot still receives the prompt via argv `-p <prompt>` (its old buildArgs did this).
if (provider === "copilot") args.unshift("-p", prompt);
```

5. Update the spawn call to use `args` from `getToArgv`.

- [ ] **Step 5: Run all daemon tests**

Run: `pnpm --filter @magenta/daemon test`
Expected: PASS, including the new `runOptionsToSpawn` test and any pre-existing `AiCliGateway` tests.

Run: `pnpm --filter @magenta/daemon typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/infrastructure/AiCliGateway.ts packages/daemon/src/infrastructure/AiCliGateway.refactor.test.ts
git commit -m "refactor(daemon): AiCliGateway consumes shared toArgv"
```

---

## Task 8: Wire `toArgv` into PTY session factories

**Files:**
- Modify: `packages/daemon/src/infrastructure/sessions/BaseAISession.ts` (and/or `ClaudeSessionFactory.ts`, `CopilotSessionFactory.ts` — whichever owns argv assembly today)

- [ ] **Step 1: Locate the current PTY argv builder**

Run: `rtk grep "buildSpawnArgv\|spawn(.*claude\|spawn(.*copilot" packages/daemon/src/infrastructure/sessions/`
Expected: A single function that builds argv for the PTY spawn. Read it.

- [ ] **Step 2: Identify the existing argv shape**

Read the file end-to-end. List in a comment (in the plan execution log) which `AISessionConfig` fields contribute to argv today. Typical fields: `model`, `permissionMode`, `resumeSessionId`, possibly `allowedTools`/`disallowedTools` once Phase 4 wires them. PTY sessions do **not** use `-p` — that's the difference from `runOnce`.

- [ ] **Step 3: Add a session-argv guard test**

Create `packages/daemon/src/infrastructure/sessions/sessionArgv.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sessionConfigToSpawn } from "./BaseAISession";

describe("sessionConfigToSpawn", () => {
  it("Claude: maps model + permissionMode + resumeSessionId", () => {
    expect(
      sessionConfigToSpawn("claude", {
        model: "claude-sonnet-4-6",
        permissionMode: "plan",
        providerSessionId: "abc-123",
      } as never),
    ).toEqual({
      model: "claude-sonnet-4-6",
      permissionMode: "plan",
      resumeSessionId: "abc-123",
    });
  });

  it("Copilot: maps permissionMode auto + maxAutopilotContinues default", () => {
    expect(
      sessionConfigToSpawn("copilot", {
        permissionMode: "auto",
      } as never),
    ).toEqual({
      permissionMode: "auto",
    });
  });
});
```

- [ ] **Step 4: Run; verify fail**

Run: `pnpm --filter @magenta/daemon test sessionArgv`
Expected: FAIL — `sessionConfigToSpawn` not exported.

- [ ] **Step 5: Add `sessionConfigToSpawn` and refactor `buildSpawnArgv`**

Inside `BaseAISession.ts` (or wherever argv is built), add:

```ts
import { getToArgv } from "../../domain/providerArgv";
import { getProviderCapability } from "@magenta/shared/providerCapabilities";
import type { AISessionConfig, AIProvider } from "@magenta/shared/aiTerminal";
import type { AISpawnOptions } from "@magenta/shared/aiSpawnOptions";

export function sessionConfigToSpawn(
  _provider: AIProvider,
  config: AISessionConfig,
): AISpawnOptions {
  const out: AISpawnOptions = {};
  if (config.model) out.model = config.model;
  if (config.permissionMode) out.permissionMode = config.permissionMode;
  if (config.providerSessionId) out.resumeSessionId = config.providerSessionId;
  // Future fields wired here in Phase 4 (allowedTools / disallowedTools)
  // and Phase 5 (sessionId, forkSession).
  return out;
}
```

Replace the body of the existing `buildSpawnArgv` (or equivalent) with:

```ts
const spawnOpts = sessionConfigToSpawn(provider, config);
const caps = getProviderCapability(provider);
const { args } = getToArgv(provider)(spawnOpts, caps);
return args;
```

Delete any per-provider inline argv assembly that's now redundant. Keep the existing default-args injection from `getProviderMeta(provider).defaultArgs` if any — prepend it.

- [ ] **Step 6: Run all daemon tests + typecheck + build**

Run: `pnpm --filter @magenta/daemon test`
Expected: PASS.

Run: `pnpm -w typecheck`
Expected: PASS for all 5 packages.

Run: `pnpm -w build`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/daemon/src/infrastructure/sessions/
git commit -m "refactor(daemon): PTY sessions consume shared toArgv"
```

---

## Task 9: Final verification — repository-wide

- [ ] **Step 1: Confirm no remaining inline argv assembly**

Run: `rtk grep -n "args.push\|argv.push" packages/daemon/src/infrastructure/AiCliGateway.ts packages/daemon/src/infrastructure/sessions/`
Expected: zero hits other than inside `claude.ts` / `copilot.ts` adapters and `runOnce`'s `-p` prepend.

- [ ] **Step 2: Workspace typecheck**

Run: `pnpm -w typecheck`
Expected: All 5 packages clean.

- [ ] **Step 3: Workspace build**

Run: `pnpm -w build`
Expected: All packages build.

- [ ] **Step 4: Workspace tests**

Run: `pnpm -w test`
Expected: All tests pass; new tests from Tasks 1–8 included.

- [ ] **Step 5: Stop here per `feedback_verification.md`**

Do not launch the app. Steven runs manual E2E (PTY session for Claude, PTY session for Copilot, spec-review chat). Report:

> Phase 1 done. Refactor preserves observed behaviour: `AiCliGateway` and PTY sessions now both call `getToArgv()`. Two PTY sessions and one spec-review chat verified manually by user before Phase 2 begins.

---

## Spec coverage check (self-review)

| Spec requirement | Covered by |
|---|---|
| Plan §4 Phase 1, `AISpawnOptions` schema | Task 1 |
| Plan §4 Phase 1, `toArgv()` per provider | Tasks 4, 5 |
| Plan §4 Phase 1, two consumer sites only | Tasks 7, 8 |
| Plan §4 Phase 1, unsupported option becomes documented no-op | Tasks 4, 5 (warnings in `ToArgvResult`) |
| Spec §6.1 FR-1.1 single zod schema | Task 1 |
| Spec §6.1 FR-1.2 `.strict()` | Task 1 (test "rejects unknown keys") |
| Spec §6.1 FR-1.3 `extraArgs` escape hatch | Task 1 (schema) + Tasks 4/5 (passthrough) |
| Spec §6.1 FR-1.4 schema version | Task 1 (`SPAWN_OPTIONS_SCHEMA_VERSION`) |
| Spec §6.2 FR-2.1 capability manifest | Task 2 |
| Spec §6.2 FR-2.3 `UNSUPPORTED_SPAWN_OPTION` error code | Task 3 (code added; raised in Phase 2's `ai:run-once` handler) |
| Spec §6.4 FR-4.1 pure `toArgv` | Tasks 4, 5 |
| Spec §6.4 FR-4.2 internal callers don't throw | Tasks 4, 5 (warnings, not throws) |
| Spec §6.4 FR-4.3 exactly two call sites | Tasks 7, 8 |
| Spec NFR-6 deterministic argv | Task 4 (snapshot test) + Task 5 (deterministic ordering by construction) |

**Out-of-scope deferrals** (covered by later phase plans):
- FR-2.2 `ai:providers` returning manifests → Phase 2 (IPC).
- FR-2.3 daemon raising `UNSUPPORTED_SPAWN_OPTION` at IPC boundary → Phase 2.
- FR-3 intent + preset layer → Phase 4.
- FR-5 `AIStreamEvent` → Phase 2.
- FR-6 `ai:run-once` IPC → Phase 2.
- FR-7 session lifecycle → Phase 5.
- FR-8.2 permission prompt tool → Phase 4.
- FR-9 reproducibility (bare/MCP files) → Phase 3.
- FR-10 observability → Phase 7.
