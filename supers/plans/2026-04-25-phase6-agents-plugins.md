# Phase 6 — Subagents, Custom Agents, Plugins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the "agent inside an agent" capabilities both Anthropic and GitHub have shipped. Magenta tasks can now (1) carry a Claude subagents manifest at `spec/agents.json` and surface it to the CLI as `--agents '<json>'`, (2) pick a specific agent by name (`--agent <v>` for Claude; for Copilot, prepend `/agent <v>` or `/review` to the prompt), (3) opt into Copilot's `--enable-all-github-mcp-tools` per-task, and (4) configure a list of `--plugin-dir <path>` entries through a new Settings → Plugins panel persisted in the daemon settings store.

**Architecture:** Pure manifest parser (`packages/daemon/src/domain/agentsManifest.ts`) + pure prompt-injection function (`packages/daemon/src/domain/agentPromptInjector.ts`) + thin gateway over the `claude agents` shell-out (`packages/daemon/src/infrastructure/ClaudeAgentsGateway.ts`) + new IPC variant `ai:list-agents` and CRUD on a new `plugin_dirs` table + Application Service `AgentService` orchestrating the listing logic + Application Service `PluginDirService` for storage. Phase 1's `AISpawnOptions.agents`/`agent`/`pluginDirs` are already in the schema; this phase wires the data sources, the IPC surfaces, and the renderer surfaces. The Copilot-side prompt injector is invoked by the existing PTY input pipeline at session creation time when `spawn.agent` is set on a Copilot session.

**Tech Stack:** TypeScript 5.x · Zod 3.x · Vitest · pnpm workspace · LMDB (via existing `KeyValueStore` infrastructure) · React 19 · Zustand · shadcn/ui · `node:child_process` (`execFile`) for `claude agents`.

**Spec references:** `specs/2026-04-24-cli-programmatic-improvements.md` §4 Phase 6 (lines 402–414), §6 IPC summary (line 460), §7 capability matrix (lines 499–502), §8 verification (line 530) · `specs/2026-04-24-unified-ai-cli-interface.md` §8.4 `ai:list-agents` (line 222), Copilot built-in agents enumeration (`code-review`, `explore`, `general-purpose`, `research`, `task`).

**Out of scope for this phase:**
- Stream-json `system/plugin_install` progress toasts (Phase 7).
- Persisting agent selection into spawn presets (Phase 4 already handles preset CRUD; this plan just adds `agent`/`pluginDirs` as fields they can carry).
- Editing the `spec/agents.json` manifest from inside Magenta — this phase only **reads** the file from disk.
- Channels (`--channels`) and Claude marketplaces — explicitly deferred per spec §9.
- Any UI for editing per-plugin metadata beyond path add/remove.

---

## File structure

| Action | Path | Responsibility |
|---|---|---|
| Create | `packages/daemon/src/domain/agentsManifest.ts` | Pure Zod schema + `parseAgentsManifest(raw: string)` parser returning `Result<AgentsManifest, AppError>`. |
| Create | `packages/daemon/src/domain/agentsManifest.test.ts` | Fixture-driven tests: valid manifest, malformed JSON, missing required fields, extra keys, marshalling roundtrip. |
| Create | `packages/daemon/src/domain/agentPromptInjector.ts` | Pure `applyAgentToPrompt(prompt, agent, provider)` — Copilot maps to `/agent <name>` or `/review`; Claude pass-through. |
| Create | `packages/daemon/src/domain/agentPromptInjector.test.ts` | Table-driven tests covering all five built-in Copilot agents, Claude pass-through, empty prompt edge case. |
| Create | `packages/daemon/src/domain/copilotBuiltinAgents.ts` | Static `COPILOT_BUILTIN_AGENTS: readonly Agent[]` re-exported by Application Service. |
| Create | `packages/daemon/src/infrastructure/ClaudeAgentsGateway.ts` | Thin `execFile('claude', ['agents'])` wrapper; parses output into `Agent[]`; wraps errors as `AppError("CLAUDE_AGENTS_ERROR")`. |
| Create | `packages/daemon/src/infrastructure/ClaudeAgentsGateway.test.ts` | Mocks `execFile`; verifies parsing of valid output, unknown-format graceful empty array, error wrapping. |
| Create | `packages/daemon/src/application/AgentService.ts` | `listAgents(provider)` orchestrates Claude gateway / Copilot static list. |
| Create | `packages/daemon/src/application/AgentService.test.ts` | Integration test: mock `ClaudeAgentsGateway`; verify Copilot returns static list without calling gateway. |
| Create | `packages/daemon/src/application/PluginDirService.ts` | `list()` / `add(path)` / `remove(path)` on the new `plugin_dirs` LMDB key. |
| Create | `packages/daemon/src/application/PluginDirService.test.ts` | Add/remove/duplicate-path/empty cases. |
| Create | `packages/daemon/src/infrastructure/PluginDirRepository.ts` | LMDB-backed `Repository` for the `plugin_dirs` key (one document — `string[]`). |
| Create | `packages/daemon/src/ipc/handlers/agentsHandlers.ts` | `safeHandle` wrappers for `ai:list-agents`, `plugin-dirs:list`, `plugin-dirs:add`, `plugin-dirs:remove`. |
| Create | `packages/ui/src/renderer/components/settings/PluginDirsPanel.tsx` | Settings panel section: list + add (file picker) + remove. |
| Create | `packages/ui/src/renderer/components/settings/PluginDirsPanel.test.tsx` | RTL test: mock `sendOrThrow`, verify list render and add/remove flow. |
| Create | `packages/ui/src/renderer/components/sessions/AgentSelector.tsx` | `Run with agent:` dropdown (Claude) and built-in agent buttons (Copilot). |
| Create | `packages/ui/src/renderer/stores/pluginDirStore.ts` | Zustand store wrapping `plugin-dirs:*`. |
| Create | `packages/ui/src/renderer/stores/agentStore.ts` | Zustand store wrapping `ai:list-agents` (cached per provider). |
| Modify | `packages/shared/src/ipc.ts` | Add `Agent` model, four new variants to `IpcRequestSchema` and `IpcResponseSchema`. |
| Modify | `packages/shared/src/ipc.test.ts` | Round-trip tests for the four new variants. |
| Modify | `packages/daemon/src/errors/AppError.ts` | Add `CLAUDE_AGENTS_ERROR`, `AGENTS_MANIFEST_INVALID`, `PLUGIN_DIR_INVALID` to `AppErrorCode`. |
| Modify | `packages/daemon/src/composition/DaemonContainer.ts` | Wire `ClaudeAgentsGateway`, `AgentService`, `PluginDirRepository`, `PluginDirService`. |
| Modify | `packages/daemon/src/ipc/registerHandlers.ts` | Register `agentsHandlers` with the four new endpoints. |
| Modify | `packages/daemon/src/infrastructure/AiCliGateway.ts` | Resolve `pluginDirs` from `PluginDirService` and merge into `AISpawnOptions` *before* `getToArgv()`. Inject prompt via `applyAgentToPrompt` for Copilot sessions. Auto-load `spec/agents.json` for Claude when `spawn.agents` is unset and the file exists. |
| Modify | `packages/ui/src/renderer/services/ipcClient.ts` | Add the four new variants to `ResponseForRequest`. |
| Modify | `packages/ui/src/renderer/components/sessions/CreateSessionDialog.tsx` (or current dialog file) | Mount `<AgentSelector>` and `<EnableGithubMcpToggle>`; pass selections into the spawn payload. |
| Modify | `packages/ui/src/renderer/components/settings/SettingsPanel.tsx` (current settings entry) | Add a "Plugins" section that mounts `<PluginDirsPanel>`. |

---

## Task 1: Add IPC variants and `Agent` model in shared

**Files:**
- Modify: `packages/shared/src/ipc.ts`
- Modify: `packages/shared/src/ipc.test.ts`

- [ ] **Step 1: Write the failing IPC round-trip test**

```ts
// packages/shared/src/ipc.test.ts (append)
import { describe, it, expect } from "vitest";
import { IpcRequestSchema, IpcResponseSchema, AgentSchema } from "./ipc";

describe("Phase 6 IPC variants", () => {
  it("AgentSchema accepts a built-in Copilot agent", () => {
    const a = { name: "code-review", source: "builtin", description: "Reviews diffs" };
    expect(AgentSchema.parse(a)).toEqual(a);
  });

  it("ai:list-agents request round-trips", () => {
    const req = { type: "ai:list-agents", provider: "claude" } as const;
    expect(IpcRequestSchema.parse(req)).toEqual(req);
  });

  it("ai:list-agents response round-trips", () => {
    const res = {
      type: "ai:list-agents",
      ok: true,
      agents: [
        { name: "reviewer", source: "user", description: "" },
        { name: "code-review", source: "builtin", description: "Built-in review agent" },
      ],
    };
    expect(IpcResponseSchema.parse(res)).toEqual(res);
  });

  it("plugin-dirs:list/add/remove requests round-trip", () => {
    const list = { type: "plugin-dirs:list" } as const;
    const add = { type: "plugin-dirs:add", path: "/plugins/a" } as const;
    const rm = { type: "plugin-dirs:remove", path: "/plugins/a" } as const;
    expect(IpcRequestSchema.parse(list)).toEqual(list);
    expect(IpcRequestSchema.parse(add)).toEqual(add);
    expect(IpcRequestSchema.parse(rm)).toEqual(rm);
  });

  it("plugin-dirs:list response carries paths array", () => {
    const res = { type: "plugin-dirs:list", ok: true, paths: ["/plugins/a", "/plugins/b"] };
    expect(IpcResponseSchema.parse(res)).toEqual(res);
  });

  it("plugin-dirs:add rejects empty path", () => {
    expect(() => IpcRequestSchema.parse({ type: "plugin-dirs:add", path: "" })).toThrow();
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `pnpm --filter @magenta/shared test ipc`
Expected: FAIL — `AgentSchema` is not exported; new variants missing from the discriminated unions.

- [ ] **Step 3: Implement schema additions**

In `packages/shared/src/ipc.ts`:

```ts
export const AgentSchema = z.object({
  name: z.string().min(1),
  source: z.enum(["builtin", "user", "project", "system"]),
  description: z.string(),
});
export type Agent = z.infer<typeof AgentSchema>;

// Add these variants to IpcRequestSchema's discriminated union:
z.object({ type: z.literal("ai:list-agents"), provider: z.enum(["claude", "copilot"]) }),
z.object({ type: z.literal("plugin-dirs:list") }),
z.object({ type: z.literal("plugin-dirs:add"), path: z.string().min(1) }),
z.object({ type: z.literal("plugin-dirs:remove"), path: z.string().min(1) }),

// Add to IpcResponseSchema (success branches):
z.object({ type: z.literal("ai:list-agents"), ok: z.literal(true), agents: z.array(AgentSchema) }),
z.object({ type: z.literal("plugin-dirs:list"), ok: z.literal(true), paths: z.array(z.string()) }),
z.object({ type: z.literal("plugin-dirs:add"), ok: z.literal(true) }),
z.object({ type: z.literal("plugin-dirs:remove"), ok: z.literal(true) }),
```

- [ ] **Step 4: Re-run test, expect PASS**

Run: `pnpm --filter @magenta/shared test ipc`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/ipc.ts packages/shared/src/ipc.test.ts
git commit -m "feat(shared): add ai:list-agents and plugin-dirs IPC variants"
```

---

## Task 2: Pure agents-manifest parser

**Files:**
- Create: `packages/daemon/src/domain/agentsManifest.ts`
- Create: `packages/daemon/src/domain/agentsManifest.test.ts`
- Modify: `packages/daemon/src/errors/AppError.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/daemon/src/domain/agentsManifest.test.ts
import { describe, it, expect } from "vitest";
import { parseAgentsManifest, AgentsManifestSchema } from "./agentsManifest";
import { AppError } from "../errors/AppError";

describe("agentsManifest", () => {
  const valid = {
    reviewer: { description: "Reviews diffs", prompt: "You review diffs." },
    explorer: { description: "Maps code", prompt: "Walk the tree." },
  };

  it("parses a valid manifest", () => {
    const got = parseAgentsManifest(JSON.stringify(valid));
    expect(got).toEqual(valid);
  });

  it("returns an empty record when given '{}'", () => {
    expect(parseAgentsManifest("{}")).toEqual({});
  });

  it("throws AGENTS_MANIFEST_INVALID on malformed JSON", () => {
    try {
      parseAgentsManifest("{not json");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe("AGENTS_MANIFEST_INVALID");
    }
  });

  it("throws AGENTS_MANIFEST_INVALID when an entry is missing prompt", () => {
    const bad = JSON.stringify({ a: { description: "x" } });
    expect(() => parseAgentsManifest(bad)).toThrowError(/prompt/);
  });

  it("rejects extra unknown keys on entries", () => {
    const bad = JSON.stringify({ a: { description: "d", prompt: "p", extra: 1 } });
    expect(() => parseAgentsManifest(bad)).toThrow();
  });

  it("AgentsManifestSchema is a strict z.record of strict entries", () => {
    expect(() => AgentsManifestSchema.parse(valid)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @magenta/daemon test agentsManifest`
Expected: FAIL — module not found.

- [ ] **Step 3: Add the new error code**

In `packages/daemon/src/errors/AppError.ts`, append `"AGENTS_MANIFEST_INVALID"` to the `AppErrorCode` literal union.

- [ ] **Step 4: Implement the parser**

```ts
// packages/daemon/src/domain/agentsManifest.ts
import { z } from "zod";
import { AppError } from "../errors/AppError";

const AgentEntry = z
  .object({ description: z.string(), prompt: z.string() })
  .strict();

export const AgentsManifestSchema = z.record(AgentEntry);
export type AgentsManifest = z.infer<typeof AgentsManifestSchema>;

/**
 * Parses raw JSON content of `spec/agents.json`. Throws AppError on any failure
 * so callers can surface a single error code to the IPC layer.
 */
export function parseAgentsManifest(raw: string): AgentsManifest {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    throw new AppError("AGENTS_MANIFEST_INVALID", `agents.json is not valid JSON: ${(e as Error).message}`);
  }
  const result = AgentsManifestSchema.safeParse(json);
  if (!result.success) {
    throw new AppError("AGENTS_MANIFEST_INVALID", `agents.json schema error: ${result.error.message}`);
  }
  return result.data;
}
```

- [ ] **Step 5: Re-run test, expect PASS**

Run: `pnpm --filter @magenta/daemon test agentsManifest`
Expected: PASS (6 cases green).

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/domain/agentsManifest.ts \
        packages/daemon/src/domain/agentsManifest.test.ts \
        packages/daemon/src/errors/AppError.ts
git commit -m "feat(daemon): add pure agentsManifest parser with strict zod schema"
```

---

## Task 3: Pure agent prompt injector for Copilot built-ins

**Files:**
- Create: `packages/daemon/src/domain/copilotBuiltinAgents.ts`
- Create: `packages/daemon/src/domain/agentPromptInjector.ts`
- Create: `packages/daemon/src/domain/agentPromptInjector.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/daemon/src/domain/agentPromptInjector.test.ts
import { describe, it, expect } from "vitest";
import { applyAgentToPrompt } from "./agentPromptInjector";

describe("applyAgentToPrompt", () => {
  it("returns prompt unchanged for Claude (Claude uses --agent flag)", () => {
    expect(applyAgentToPrompt("hello", "reviewer", "claude")).toBe("hello");
  });

  it("returns prompt unchanged when agent is undefined", () => {
    expect(applyAgentToPrompt("hello", undefined, "copilot")).toBe("hello");
  });

  it("prepends /review for Copilot 'code-review' built-in", () => {
    expect(applyAgentToPrompt("look at PR 42", "code-review", "copilot")).toBe(
      "/review look at PR 42",
    );
  });

  it("prepends /agent <name> for non-review Copilot built-ins", () => {
    expect(applyAgentToPrompt("map the codebase", "explore", "copilot")).toBe(
      "/agent explore map the codebase",
    );
    expect(applyAgentToPrompt("plan", "general-purpose", "copilot")).toBe(
      "/agent general-purpose plan",
    );
    expect(applyAgentToPrompt("dig", "research", "copilot")).toBe("/agent research dig");
    expect(applyAgentToPrompt("do work", "task", "copilot")).toBe("/agent task do work");
  });

  it("prepends /agent <name> for unknown Copilot agent names (forward-compat)", () => {
    expect(applyAgentToPrompt("hi", "future-agent", "copilot")).toBe(
      "/agent future-agent hi",
    );
  });

  it("handles an empty prompt gracefully", () => {
    expect(applyAgentToPrompt("", "code-review", "copilot")).toBe("/review ");
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @magenta/daemon test agentPromptInjector`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement built-ins constant**

```ts
// packages/daemon/src/domain/copilotBuiltinAgents.ts
import type { Agent } from "@magenta/shared/ipc";

/**
 * Static list of Copilot CLI built-in agents (per spec §2 line 153 of the
 * unified-ai-cli-interface). Source-of-truth lives here so application code
 * can return it without shelling out — Copilot has no "list agents" command.
 */
export const COPILOT_BUILTIN_AGENTS: readonly Agent[] = [
  { name: "code-review", source: "builtin", description: "Reviews a diff (mapped to /review)." },
  { name: "explore", source: "builtin", description: "Maps the repo's structure." },
  { name: "general-purpose", source: "builtin", description: "Default Copilot assistant." },
  { name: "research", source: "builtin", description: "Researches a topic before coding." },
  { name: "task", source: "builtin", description: "Executes a focused implementation task." },
];
```

- [ ] **Step 4: Implement injector**

```ts
// packages/daemon/src/domain/agentPromptInjector.ts
import type { AIProvider } from "@magenta/shared/aiTerminal";

/**
 * Pure transform that prepends a Copilot agent directive to a prompt.
 * Claude exposes --agent as a flag, so this is a pass-through there.
 *
 * The 'code-review' agent maps to Copilot's `/review` slash command per
 * spec §4 Phase 6 line 411; all other built-ins use `/agent <name>`.
 */
export function applyAgentToPrompt(
  prompt: string,
  agent: string | undefined,
  provider: AIProvider,
): string {
  if (!agent || provider !== "copilot") return prompt;
  if (agent === "code-review") return `/review ${prompt}`;
  return `/agent ${agent} ${prompt}`;
}
```

- [ ] **Step 5: Re-run test, expect PASS**

Run: `pnpm --filter @magenta/daemon test agentPromptInjector`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/domain/copilotBuiltinAgents.ts \
        packages/daemon/src/domain/agentPromptInjector.ts \
        packages/daemon/src/domain/agentPromptInjector.test.ts
git commit -m "feat(daemon): pure prompt injector for Copilot built-in agents"
```

---

## Task 4: `ClaudeAgentsGateway` — thin wrapper over `claude agents`

**Files:**
- Create: `packages/daemon/src/infrastructure/ClaudeAgentsGateway.ts`
- Create: `packages/daemon/src/infrastructure/ClaudeAgentsGateway.test.ts`
- Modify: `packages/daemon/src/errors/AppError.ts`

- [ ] **Step 1: Add error code**

In `packages/daemon/src/errors/AppError.ts`, append `"CLAUDE_AGENTS_ERROR"` to `AppErrorCode`.

- [ ] **Step 2: Write the failing test**

```ts
// packages/daemon/src/infrastructure/ClaudeAgentsGateway.test.ts
import { describe, it, expect, vi } from "vitest";
import { ClaudeAgentsGateway } from "./ClaudeAgentsGateway";
import { AppError } from "../errors/AppError";

type ExecResult = { stdout: string; stderr: string };
const okExec = (stdout: string) =>
  vi.fn().mockResolvedValue({ stdout, stderr: "" } satisfies ExecResult);
const failExec = (msg: string) =>
  vi.fn().mockRejectedValue(Object.assign(new Error(msg), { code: 1 }));

describe("ClaudeAgentsGateway", () => {
  it("parses tab-separated `claude agents` output into Agent[]", async () => {
    const stdout = [
      "NAME           SOURCE   DESCRIPTION",
      "reviewer       user     Reviews diffs carefully",
      "explorer       project  Walks the tree",
    ].join("\n");
    const gw = new ClaudeAgentsGateway(okExec(stdout));
    const got = await gw.list();
    expect(got).toEqual([
      { name: "reviewer", source: "user", description: "Reviews diffs carefully" },
      { name: "explorer", source: "project", description: "Walks the tree" },
    ]);
  });

  it("returns [] when the CLI prints only a header", async () => {
    const gw = new ClaudeAgentsGateway(okExec("NAME SOURCE DESCRIPTION\n"));
    expect(await gw.list()).toEqual([]);
  });

  it("returns [] for entirely empty output", async () => {
    const gw = new ClaudeAgentsGateway(okExec(""));
    expect(await gw.list()).toEqual([]);
  });

  it("treats an unknown SOURCE column as 'system'", async () => {
    const stdout = "NAME SOURCE DESC\nfoo wonky describes foo";
    const gw = new ClaudeAgentsGateway(okExec(stdout));
    const [first] = await gw.list();
    expect(first.source).toBe("system");
  });

  it("wraps exec failure as AppError(CLAUDE_AGENTS_ERROR)", async () => {
    const gw = new ClaudeAgentsGateway(failExec("ENOENT: claude"));
    await expect(gw.list()).rejects.toBeInstanceOf(AppError);
    await expect(gw.list()).rejects.toMatchObject({ code: "CLAUDE_AGENTS_ERROR" });
  });
});
```

- [ ] **Step 3: Run and verify failure**

Run: `pnpm --filter @magenta/daemon test ClaudeAgentsGateway`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the gateway**

```ts
// packages/daemon/src/infrastructure/ClaudeAgentsGateway.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Agent } from "@magenta/shared/ipc";
import { AppError } from "../errors/AppError";

type ExecFn = (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;
const defaultExec: ExecFn = (cmd, args) =>
  promisify(execFile)(cmd, args, { encoding: "utf8", maxBuffer: 1024 * 1024 });

const KNOWN_SOURCES = new Set(["builtin", "user", "project", "system"]);

/**
 * Thin gateway over `claude agents`. The CLI prints a tab/whitespace-aligned
 * table with columns NAME / SOURCE / DESCRIPTION; we split on the first two
 * whitespace runs and treat the rest as the description so descriptions can
 * contain spaces.
 */
export class ClaudeAgentsGateway {
  constructor(private readonly exec: ExecFn = defaultExec) {}

  async list(): Promise<Agent[]> {
    let stdout: string;
    try {
      ({ stdout } = await this.exec("claude", ["agents"]));
    } catch (err) {
      throw new AppError(
        "CLAUDE_AGENTS_ERROR",
        `Failed to invoke 'claude agents': ${(err as Error).message}`,
      );
    }
    const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return [];
    const [, ...rows] = lines; // drop header row
    return rows.map((row) => {
      const m = row.match(/^(\S+)\s+(\S+)\s+(.*)$/);
      if (!m) return { name: row, source: "system" as const, description: "" };
      const [, name, rawSource, description] = m;
      const source = KNOWN_SOURCES.has(rawSource) ? (rawSource as Agent["source"]) : "system";
      return { name, source, description };
    });
  }
}
```

- [ ] **Step 5: Re-run test, expect PASS**

Run: `pnpm --filter @magenta/daemon test ClaudeAgentsGateway`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/infrastructure/ClaudeAgentsGateway.ts \
        packages/daemon/src/infrastructure/ClaudeAgentsGateway.test.ts \
        packages/daemon/src/errors/AppError.ts
git commit -m "feat(daemon): add ClaudeAgentsGateway thin wrapper over `claude agents`"
```

---

## Task 5: `AgentService` orchestrator + `PluginDirRepository` + `PluginDirService`

**Files:**
- Create: `packages/daemon/src/application/AgentService.ts`
- Create: `packages/daemon/src/application/AgentService.test.ts`
- Create: `packages/daemon/src/infrastructure/PluginDirRepository.ts`
- Create: `packages/daemon/src/application/PluginDirService.ts`
- Create: `packages/daemon/src/application/PluginDirService.test.ts`
- Modify: `packages/daemon/src/errors/AppError.ts`

- [ ] **Step 1: Add error code**

Append `"PLUGIN_DIR_INVALID"` to `AppErrorCode`.

- [ ] **Step 2: Write `AgentService` test**

```ts
// packages/daemon/src/application/AgentService.test.ts
import { describe, it, expect, vi } from "vitest";
import { AgentService } from "./AgentService";

const fakeGateway = (agents: { name: string; source: "user"; description: string }[]) => ({
  list: vi.fn().mockResolvedValue(agents),
});

describe("AgentService", () => {
  it("returns the static built-in list for Copilot without touching the gateway", async () => {
    const gw = fakeGateway([]);
    const svc = new AgentService(gw as never);
    const got = await svc.listAgents("copilot");
    expect(gw.list).not.toHaveBeenCalled();
    expect(got.map((a) => a.name)).toEqual([
      "code-review",
      "explore",
      "general-purpose",
      "research",
      "task",
    ]);
    expect(got.every((a) => a.source === "builtin")).toBe(true);
  });

  it("delegates to the Claude gateway for Claude", async () => {
    const userAgents = [{ name: "reviewer", source: "user" as const, description: "x" }];
    const gw = fakeGateway(userAgents);
    const svc = new AgentService(gw as never);
    const got = await svc.listAgents("claude");
    expect(gw.list).toHaveBeenCalledOnce();
    expect(got).toEqual(userAgents);
  });
});
```

- [ ] **Step 3: Implement `AgentService`**

```ts
// packages/daemon/src/application/AgentService.ts
import type { Agent } from "@magenta/shared/ipc";
import type { AIProvider } from "@magenta/shared/aiTerminal";
import type { ClaudeAgentsGateway } from "../infrastructure/ClaudeAgentsGateway";
import { COPILOT_BUILTIN_AGENTS } from "../domain/copilotBuiltinAgents";

export class AgentService {
  constructor(private readonly claudeAgentsGateway: ClaudeAgentsGateway) {}

  async listAgents(provider: AIProvider): Promise<Agent[]> {
    if (provider === "copilot") return [...COPILOT_BUILTIN_AGENTS];
    return this.claudeAgentsGateway.list();
  }
}
```

- [ ] **Step 4: Write `PluginDirService` test**

```ts
// packages/daemon/src/application/PluginDirService.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { PluginDirService } from "./PluginDirService";
import { AppError } from "../errors/AppError";

const memRepo = () => {
  let state: string[] = [];
  return {
    get: async () => [...state],
    set: async (next: string[]) => {
      state = [...next];
    },
  };
};

describe("PluginDirService", () => {
  let repo: ReturnType<typeof memRepo>;
  let svc: PluginDirService;
  beforeEach(() => {
    repo = memRepo();
    svc = new PluginDirService(repo);
  });

  it("starts empty", async () => {
    expect(await svc.list()).toEqual([]);
  });

  it("adds and lists a plugin dir", async () => {
    await svc.add("/plugins/a");
    expect(await svc.list()).toEqual(["/plugins/a"]);
  });

  it("ignores duplicate adds", async () => {
    await svc.add("/plugins/a");
    await svc.add("/plugins/a");
    expect(await svc.list()).toEqual(["/plugins/a"]);
  });

  it("rejects empty path with PLUGIN_DIR_INVALID", async () => {
    await expect(svc.add("")).rejects.toBeInstanceOf(AppError);
    await expect(svc.add("   ")).rejects.toMatchObject({ code: "PLUGIN_DIR_INVALID" });
  });

  it("removes a path; remove of unknown is a no-op", async () => {
    await svc.add("/plugins/a");
    await svc.add("/plugins/b");
    await svc.remove("/plugins/a");
    expect(await svc.list()).toEqual(["/plugins/b"]);
    await svc.remove("/plugins/zzz"); // no throw
    expect(await svc.list()).toEqual(["/plugins/b"]);
  });
});
```

- [ ] **Step 5: Implement repository + service**

```ts
// packages/daemon/src/infrastructure/PluginDirRepository.ts
import type { KeyValueStore } from "./KeyValueStore"; // existing LMDB wrapper

const KEY = "plugin_dirs";

export class PluginDirRepository {
  constructor(private readonly store: KeyValueStore<string[]>) {}
  async get(): Promise<string[]> {
    return (await this.store.get(KEY)) ?? [];
  }
  async set(paths: string[]): Promise<void> {
    await this.store.put(KEY, paths);
  }
}
```

```ts
// packages/daemon/src/application/PluginDirService.ts
import { AppError } from "../errors/AppError";

interface PluginDirRepoLike {
  get(): Promise<string[]>;
  set(paths: string[]): Promise<void>;
}

export class PluginDirService {
  constructor(private readonly repo: PluginDirRepoLike) {}

  async list(): Promise<string[]> {
    return this.repo.get();
  }

  async add(path: string): Promise<void> {
    const trimmed = path.trim();
    if (!trimmed) throw new AppError("PLUGIN_DIR_INVALID", "plugin dir path cannot be empty");
    const cur = await this.repo.get();
    if (cur.includes(trimmed)) return;
    await this.repo.set([...cur, trimmed]);
  }

  async remove(path: string): Promise<void> {
    const cur = await this.repo.get();
    const next = cur.filter((p) => p !== path);
    if (next.length !== cur.length) await this.repo.set(next);
  }
}
```

- [ ] **Step 6: Run all new tests, expect PASS**

Run: `pnpm --filter @magenta/daemon test AgentService PluginDirService`
Expected: PASS (both files green).

- [ ] **Step 7: Commit**

```bash
git add packages/daemon/src/application/AgentService.ts \
        packages/daemon/src/application/AgentService.test.ts \
        packages/daemon/src/application/PluginDirService.ts \
        packages/daemon/src/application/PluginDirService.test.ts \
        packages/daemon/src/infrastructure/PluginDirRepository.ts \
        packages/daemon/src/errors/AppError.ts
git commit -m "feat(daemon): add AgentService + PluginDirService application layer"
```

---

## Task 6: IPC handlers + composition wiring

**Files:**
- Create: `packages/daemon/src/ipc/handlers/agentsHandlers.ts`
- Modify: `packages/daemon/src/ipc/registerHandlers.ts`
- Modify: `packages/daemon/src/composition/DaemonContainer.ts`
- Modify: `packages/ui/src/renderer/services/ipcClient.ts`

- [ ] **Step 1: Implement the handlers**

```ts
// packages/daemon/src/ipc/handlers/agentsHandlers.ts
import { safeHandle, type HandlerBridge } from "../safeHandle";
import type { AgentService } from "../../application/AgentService";
import type { PluginDirService } from "../../application/PluginDirService";

export function registerAgentsHandlers(
  bridge: HandlerBridge,
  agents: AgentService,
  pluginDirs: PluginDirService,
): void {
  safeHandle(bridge, "ai:list-agents", async (req) => ({
    agents: await agents.listAgents(req.provider),
  }));

  safeHandle(bridge, "plugin-dirs:list", async () => ({
    paths: await pluginDirs.list(),
  }));

  safeHandle(bridge, "plugin-dirs:add", async (req) => {
    await pluginDirs.add(req.path);
    return {};
  });

  safeHandle(bridge, "plugin-dirs:remove", async (req) => {
    await pluginDirs.remove(req.path);
    return {};
  });
}
```

- [ ] **Step 2: Wire the composition root**

In `packages/daemon/src/composition/DaemonContainer.ts`, add:

```ts
readonly claudeAgentsGateway = new ClaudeAgentsGateway();
readonly agentService = new AgentService(this.claudeAgentsGateway);
readonly pluginDirRepository = new PluginDirRepository(this.kvStore /* or appropriate store */);
readonly pluginDirService = new PluginDirService(this.pluginDirRepository);
```

(Match the existing `readonly` field style; reuse the existing `kvStore` / settings store rather than creating a new LMDB env.)

- [ ] **Step 3: Register handlers**

In `packages/daemon/src/ipc/registerHandlers.ts`, after the existing handler registrations:

```ts
registerAgentsHandlers(bridge, container.agentService, container.pluginDirService);
```

- [ ] **Step 4: Update the renderer's `ResponseForRequest` map**

In `packages/ui/src/renderer/services/ipcClient.ts`, add:

```ts
"ai:list-agents": Extract<IpcResponse, { type: "ai:list-agents"; ok: true }>;
"plugin-dirs:list": Extract<IpcResponse, { type: "plugin-dirs:list"; ok: true }>;
"plugin-dirs:add": Extract<IpcResponse, { type: "plugin-dirs:add"; ok: true }>;
"plugin-dirs:remove": Extract<IpcResponse, { type: "plugin-dirs:remove"; ok: true }>;
```

- [ ] **Step 5: Typecheck the workspace**

Run: `pnpm -w typecheck`
Expected: PASS for all 4 packages.

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/ipc/handlers/agentsHandlers.ts \
        packages/daemon/src/ipc/registerHandlers.ts \
        packages/daemon/src/composition/DaemonContainer.ts \
        packages/ui/src/renderer/services/ipcClient.ts
git commit -m "feat(daemon): wire ai:list-agents and plugin-dirs IPC handlers"
```

---

## Task 7: Wire `pluginDirs`, `agents`, and prompt injection through `AiCliGateway`

**Files:**
- Modify: `packages/daemon/src/infrastructure/AiCliGateway.ts`
- Create: `packages/daemon/src/infrastructure/AiCliGateway.phase6.test.ts`

- [ ] **Step 1: Write the failing integration test**

```ts
// packages/daemon/src/infrastructure/AiCliGateway.phase6.test.ts
import { describe, it, expect, vi } from "vitest";
import { AiCliGateway } from "./AiCliGateway";

// Helper: build a gateway with mocked dependencies and inspect the argv it
// hands to its (also-mocked) spawn function.
function buildGateway() {
  const spawn = vi.fn().mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });
  const pluginDirSvc = { list: vi.fn().mockResolvedValue(["/plugins/a", "/plugins/b"]) };
  const fileSystem = {
    readFile: vi.fn().mockImplementation(async (p: string) => {
      if (p.endsWith("spec/agents.json")) {
        return JSON.stringify({ rev: { description: "d", prompt: "p" } });
      }
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    }),
  };
  const gw = new AiCliGateway({
    spawn,
    pluginDirService: pluginDirSvc,
    fileSystem,
    /* …other injected deps… */
  } as never);
  return { gw, spawn, pluginDirSvc, fileSystem };
}

describe("AiCliGateway Phase 6 wiring", () => {
  it("passes each pluginDir as a separate --plugin-dir flag for Claude", async () => {
    const { gw, spawn } = buildGateway();
    await gw.runOnce({
      provider: "claude",
      repoPath: "/repo",
      prompt: "hi",
      spawn: {},
    });
    const args: string[] = spawn.mock.calls[0][1];
    const pairs = args.flatMap((a, i) => (a === "--plugin-dir" ? [args[i + 1]] : []));
    expect(pairs).toEqual(["/plugins/a", "/plugins/b"]);
  });

  it("auto-loads spec/agents.json into AISpawnOptions.agents when not set (Claude)", async () => {
    const { gw, spawn } = buildGateway();
    await gw.runOnce({
      provider: "claude",
      repoPath: "/repo",
      prompt: "hi",
      spawn: {},
    });
    const args: string[] = spawn.mock.calls[0][1];
    const idx = args.indexOf("--agents");
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(JSON.parse(args[idx + 1])).toEqual({ rev: { description: "d", prompt: "p" } });
  });

  it("does NOT auto-load spec/agents.json when caller already set spawn.agents", async () => {
    const { gw, spawn, fileSystem } = buildGateway();
    await gw.runOnce({
      provider: "claude",
      repoPath: "/repo",
      prompt: "hi",
      spawn: { agents: { custom: { description: "d", prompt: "p" } } },
    });
    expect(fileSystem.readFile).not.toHaveBeenCalledWith(expect.stringContaining("spec/agents.json"));
    const args: string[] = spawn.mock.calls[0][1];
    expect(JSON.parse(args[args.indexOf("--agents") + 1])).toEqual({
      custom: { description: "d", prompt: "p" },
    });
  });

  it("Copilot: prepends agent directive to the prompt", async () => {
    const { gw, spawn } = buildGateway();
    await gw.runOnce({
      provider: "copilot",
      repoPath: "/repo",
      prompt: "review this",
      spawn: { agent: "code-review" },
    });
    const args: string[] = spawn.mock.calls[0][1];
    // Final prompt should be passed via -p (or whichever flag the existing
    // gateway uses); locate it after the prompt-flag.
    const promptIdx = args.findIndex((a) => a === "-p" || a === "--prompt");
    expect(args[promptIdx + 1]).toBe("/review review this");
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `pnpm --filter @magenta/daemon test AiCliGateway.phase6`
Expected: FAIL — Phase 6 wiring not yet present.

- [ ] **Step 3: Implement the wiring in `AiCliGateway`**

In `runOnce` (and the equivalent PTY path used by `BaseAISession.buildSpawnArgv`), before invoking `getToArgv()`:

```ts
// Resolve effective spawn opts: caller wins, but plugin dirs and agents come
// from settings/disk when caller hasn't set them.
const effective: AISpawnOptions = { ...input.spawn };

// 1. Plugin dirs from settings (Claude only — toArgv ignores for Copilot)
if (effective.pluginDirs === undefined) {
  const fromSettings = await this.pluginDirService.list();
  if (fromSettings.length > 0) effective.pluginDirs = fromSettings;
}

// 2. Auto-load spec/agents.json for Claude when caller hasn't set agents
if (input.provider === "claude" && effective.agents === undefined) {
  const manifestPath = path.join(input.repoPath, "spec", "agents.json");
  try {
    const raw = await this.fileSystem.readFile(manifestPath);
    effective.agents = parseAgentsManifest(raw); // throws AGENTS_MANIFEST_INVALID on bad file
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    // file absent → continue without agents
  }
}

// 3. Copilot agent injection happens on the prompt, not on argv
const finalPrompt = applyAgentToPrompt(input.prompt, effective.agent, input.provider);

const { args } = getToArgv(input.provider)(effective, getProviderCapability(input.provider));
const fullArgs = [...args, "-p", finalPrompt]; // (preserve existing prompt-passing convention)
return this.spawn(this.binFor(input.provider), fullArgs);
```

(Match the gateway's existing prompt-passing convention; the `-p` example above is illustrative — replace with whatever the Phase 1/Phase 2 implementation actually uses.)

- [ ] **Step 4: Re-run test, expect PASS**

Run: `pnpm --filter @magenta/daemon test AiCliGateway.phase6`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/infrastructure/AiCliGateway.ts \
        packages/daemon/src/infrastructure/AiCliGateway.phase6.test.ts
git commit -m "feat(daemon): wire pluginDirs, spec/agents.json autoload, and Copilot prompt injection"
```

---

## Task 8: Renderer — `pluginDirStore`, `agentStore`, Settings panel

**Files:**
- Create: `packages/ui/src/renderer/stores/pluginDirStore.ts`
- Create: `packages/ui/src/renderer/stores/agentStore.ts`
- Create: `packages/ui/src/renderer/components/settings/PluginDirsPanel.tsx`
- Create: `packages/ui/src/renderer/components/settings/PluginDirsPanel.test.tsx`
- Modify: `packages/ui/src/renderer/components/settings/SettingsPanel.tsx`

- [ ] **Step 1: Write the failing component test**

```tsx
// packages/ui/src/renderer/components/settings/PluginDirsPanel.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PluginDirsPanel } from "./PluginDirsPanel";
import * as ipc from "../../services/ipcClient";

vi.mock("../../services/ipcClient");

describe("<PluginDirsPanel />", () => {
  beforeEach(() => vi.resetAllMocks());

  it("renders existing plugin dirs and supports remove", async () => {
    const send = vi.spyOn(ipc, "sendOrThrow") as unknown as ReturnType<typeof vi.fn>;
    send.mockImplementation(async (req: { type: string; path?: string }) => {
      if (req.type === "plugin-dirs:list") return { type: "plugin-dirs:list", ok: true, paths: ["/p/a"] };
      if (req.type === "plugin-dirs:remove") return { type: "plugin-dirs:remove", ok: true };
      return { type: req.type, ok: true };
    });
    render(<PluginDirsPanel />);
    await waitFor(() => screen.getByText("/p/a"));
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith({ type: "plugin-dirs:remove", path: "/p/a" }),
    );
  });

  it("calls plugin-dirs:add when the add form is submitted", async () => {
    const send = vi.spyOn(ipc, "sendOrThrow") as unknown as ReturnType<typeof vi.fn>;
    send.mockImplementation(async (req: { type: string; path?: string }) => {
      if (req.type === "plugin-dirs:list") return { type: "plugin-dirs:list", ok: true, paths: [] };
      return { type: req.type, ok: true };
    });
    render(<PluginDirsPanel />);
    fireEvent.change(screen.getByPlaceholderText(/path/i), { target: { value: "/p/b" } });
    fireEvent.click(screen.getByRole("button", { name: /add/i }));
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith({ type: "plugin-dirs:add", path: "/p/b" }),
    );
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @magenta/ui test PluginDirsPanel`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the stores**

```ts
// packages/ui/src/renderer/stores/pluginDirStore.ts
import { create } from "zustand";
import { sendOrThrow } from "../services/ipcClient";

interface PluginDirState {
  paths: string[];
  loading: boolean;
  error: string | null;
  refresh(): Promise<void>;
  add(p: string): Promise<void>;
  remove(p: string): Promise<void>;
}

export const usePluginDirStore = create<PluginDirState>((set, get) => ({
  paths: [],
  loading: false,
  error: null,
  async refresh() {
    set({ loading: true, error: null });
    try {
      const res = await sendOrThrow({ type: "plugin-dirs:list" });
      set({ paths: res.paths, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },
  async add(p) {
    await sendOrThrow({ type: "plugin-dirs:add", path: p });
    await get().refresh();
  },
  async remove(p) {
    await sendOrThrow({ type: "plugin-dirs:remove", path: p });
    await get().refresh();
  },
}));
```

```ts
// packages/ui/src/renderer/stores/agentStore.ts
import { create } from "zustand";
import { sendOrThrow } from "../services/ipcClient";
import type { Agent } from "@magenta/shared/ipc";
import type { AIProvider } from "@magenta/shared/aiTerminal";

interface AgentState {
  byProvider: Partial<Record<AIProvider, Agent[]>>;
  loading: boolean;
  loadFor(p: AIProvider): Promise<void>;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  byProvider: {},
  loading: false,
  async loadFor(provider) {
    if (get().byProvider[provider]) return;
    set({ loading: true });
    const res = await sendOrThrow({ type: "ai:list-agents", provider });
    set((s) => ({ byProvider: { ...s.byProvider, [provider]: res.agents }, loading: false }));
  },
}));
```

- [ ] **Step 4: Implement `<PluginDirsPanel />`**

```tsx
// packages/ui/src/renderer/components/settings/PluginDirsPanel.tsx
import { useEffect, useState } from "react";
import { usePluginDirStore } from "../../stores/pluginDirStore";

export function PluginDirsPanel() {
  const { paths, refresh, add, remove, error } = usePluginDirStore();
  const [draft, setDraft] = useState("");
  useEffect(() => void refresh(), [refresh]);

  return (
    <section aria-labelledby="plugin-dirs-heading" className="space-y-3">
      <h3 id="plugin-dirs-heading" className="text-sm font-semibold">Plugin directories</h3>
      <p className="text-xs text-muted-foreground">
        Each entry is passed to <code>claude</code> as <code>--plugin-dir &lt;path&gt;</code>.
      </p>
      <ul className="space-y-1">
        {paths.map((p) => (
          <li key={p} className="flex items-center justify-between gap-2 text-sm">
            <span className="font-mono">{p}</span>
            <button onClick={() => void remove(p)} aria-label={`Remove ${p}`}>Remove</button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          void add(draft.trim()).then(() => setDraft(""));
        }}
        className="flex gap-2"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="/absolute/path/to/plugin"
          className="flex-1 rounded border px-2 py-1 text-sm"
        />
        <button type="submit">Add</button>
      </form>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </section>
  );
}
```

- [ ] **Step 5: Mount inside the settings entry component**

In `packages/ui/src/renderer/components/settings/SettingsPanel.tsx`, add a section block:

```tsx
import { PluginDirsPanel } from "./PluginDirsPanel";
// …inside the existing render:
<PluginDirsPanel />
```

- [ ] **Step 6: Re-run test, expect PASS**

Run: `pnpm --filter @magenta/ui test PluginDirsPanel`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/renderer/stores/pluginDirStore.ts \
        packages/ui/src/renderer/stores/agentStore.ts \
        packages/ui/src/renderer/components/settings/PluginDirsPanel.tsx \
        packages/ui/src/renderer/components/settings/PluginDirsPanel.test.tsx \
        packages/ui/src/renderer/components/settings/SettingsPanel.tsx
git commit -m "feat(ui): plugin dirs settings panel + agent/plugin Zustand stores"
```

---

## Task 9: Renderer — `<AgentSelector />` + Copilot GitHub-MCP toggle on session create

**Files:**
- Create: `packages/ui/src/renderer/components/sessions/AgentSelector.tsx`
- Create: `packages/ui/src/renderer/components/sessions/AgentSelector.test.tsx`
- Modify: `packages/ui/src/renderer/components/sessions/CreateSessionDialog.tsx` (or whichever file currently hosts the create-session form)

- [ ] **Step 1: Write the failing test**

```tsx
// packages/ui/src/renderer/components/sessions/AgentSelector.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AgentSelector } from "./AgentSelector";
import * as ipc from "../../services/ipcClient";

vi.mock("../../services/ipcClient");

const claudeAgents = [
  { name: "reviewer", source: "user", description: "" },
];
const copilotAgents = [
  { name: "code-review", source: "builtin", description: "" },
  { name: "explore", source: "builtin", description: "" },
  { name: "general-purpose", source: "builtin", description: "" },
  { name: "research", source: "builtin", description: "" },
  { name: "task", source: "builtin", description: "" },
];

beforeEach(() => vi.resetAllMocks());

describe("<AgentSelector />", () => {
  it("renders a dropdown of Claude agents on Claude provider", async () => {
    vi.spyOn(ipc, "sendOrThrow").mockResolvedValue({
      type: "ai:list-agents", ok: true, agents: claudeAgents,
    } as never);
    const onChange = vi.fn();
    render(<AgentSelector provider="claude" value={undefined} onChange={onChange} />);
    await waitFor(() => screen.getByRole("combobox"));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "reviewer" } });
    expect(onChange).toHaveBeenCalledWith("reviewer");
  });

  it("renders five buttons for Copilot built-ins", async () => {
    vi.spyOn(ipc, "sendOrThrow").mockResolvedValue({
      type: "ai:list-agents", ok: true, agents: copilotAgents,
    } as never);
    const onChange = vi.fn();
    render(<AgentSelector provider="copilot" value={undefined} onChange={onChange} />);
    await waitFor(() => screen.getByRole("button", { name: /code-review/i }));
    expect(screen.getAllByRole("button")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: /code-review/i }));
    expect(onChange).toHaveBeenCalledWith("code-review");
  });
});
```

- [ ] **Step 2: Run, verify failure**

Run: `pnpm --filter @magenta/ui test AgentSelector`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

```tsx
// packages/ui/src/renderer/components/sessions/AgentSelector.tsx
import { useEffect } from "react";
import { useAgentStore } from "../../stores/agentStore";
import type { AIProvider } from "@magenta/shared/aiTerminal";

interface Props {
  provider: AIProvider;
  value: string | undefined;
  onChange(name: string | undefined): void;
}

export function AgentSelector({ provider, value, onChange }: Props) {
  const { byProvider, loadFor } = useAgentStore();
  useEffect(() => void loadFor(provider), [provider, loadFor]);
  const list = byProvider[provider] ?? [];

  if (provider === "copilot") {
    return (
      <div className="flex flex-wrap gap-1" role="group" aria-label="Copilot built-in agents">
        {list.map((a) => (
          <button
            key={a.name}
            type="button"
            aria-pressed={value === a.name}
            onClick={() => onChange(value === a.name ? undefined : a.name)}
          >
            {a.name}
          </button>
        ))}
      </div>
    );
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span>Run with agent:</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || undefined)}
        aria-label="Claude agent"
      >
        <option value="">(default)</option>
        {list.map((a) => (
          <option key={a.name} value={a.name}>{a.name} — {a.source}</option>
        ))}
      </select>
    </label>
  );
}
```

- [ ] **Step 4: Wire into the create-session dialog**

In `CreateSessionDialog.tsx`, add to the form's local state:

```tsx
const [agent, setAgent] = useState<string | undefined>(undefined);
const [enableGithubMcp, setEnableGithubMcp] = useState(false);
// …in the JSX:
<AgentSelector provider={provider} value={agent} onChange={setAgent} />
{provider === "copilot" && (
  <label className="flex items-center gap-2 text-sm">
    <input
      type="checkbox"
      checked={enableGithubMcp}
      onChange={(e) => setEnableGithubMcp(e.target.checked)}
    />
    Enable all GitHub MCP tools
  </label>
)}
// …in the submit handler that builds AISpawnOptions:
const spawn: AISpawnOptions = {
  ...existing,
  ...(agent ? { agent } : {}),
  ...(provider === "copilot" && enableGithubMcp ? { enableAllGithubMcpTools: true } : {}),
};
```

- [ ] **Step 5: Re-run test, expect PASS**

Run: `pnpm --filter @magenta/ui test AgentSelector`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/renderer/components/sessions/AgentSelector.tsx \
        packages/ui/src/renderer/components/sessions/AgentSelector.test.tsx \
        packages/ui/src/renderer/components/sessions/CreateSessionDialog.tsx
git commit -m "feat(ui): agent selector + GitHub-MCP toggle on session create dialog"
```

---

## Task 10: Final verification — workspace-wide

- [ ] **Step 1: Workspace typecheck**

Run: `pnpm -w typecheck`
Expected: All 4 packages clean.

- [ ] **Step 2: Workspace build**

Run: `pnpm -w build`
Expected: All packages build.

- [ ] **Step 3: Workspace tests**

Run: `pnpm -w test`
Expected: All tests pass — newly added: `agentsManifest`, `agentPromptInjector`, `ClaudeAgentsGateway`, `AgentService`, `PluginDirService`, `AiCliGateway.phase6`, `PluginDirsPanel`, `AgentSelector`, plus the appended `ipc` round-trip tests.

- [ ] **Step 4: Stop here per `feedback_verification.md`**

Do not launch the app. Steven runs manual E2E:

- Open Settings → Plugins; add and remove a plugin dir.
- Create a Claude session in a repo that has `spec/agents.json`; verify the dropdown lists user/project/builtin agents and that `--agents` and any selected `--agent` reach the CLI.
- Create a Copilot session; verify the five built-in buttons render and that picking `code-review` makes the prompt start with `/review `.

Report:

> Phase 6 done. New IPC variants (`ai:list-agents`, `plugin-dirs:list|add|remove`) wired end-to-end. `AiCliGateway` now resolves `pluginDirs` from settings, auto-loads `spec/agents.json` for Claude when caller didn't set `agents`, and applies Copilot prompt injection through the pure `applyAgentToPrompt` transform. Settings → Plugins panel and per-session agent selector live.

---

## Spec coverage check (self-review)

| Spec requirement | Covered by |
|---|---|
| Plan §4 Phase 6 (1) Claude `--agents '<json>'` from `spec/agents.json` | Tasks 2, 7 (autoload + parse) |
| Plan §4 Phase 6 (2) Claude `--agent <name>` dropdown from `claude agents` | Tasks 4, 5 (gateway + service), 9 (UI) |
| Plan §4 Phase 6 (3) Claude `--plugin-dir` settings panel | Tasks 5, 6, 7, 8 |
| Plan §4 Phase 6 (4) Copilot built-in agents as first-class actions | Tasks 3 (injector), 5 (static list), 9 (button row) |
| Plan §4 Phase 6 (5) Copilot `--enable-all-github-mcp-tools` toggle | Task 9 (CreateSessionDialog wiring; Phase 1 schema field) |
| Spec §6 IPC summary `ai:list-agents` | Tasks 1, 6 |
| Spec §7 capability matrix: `agent` → `--agent <v>` (Claude) / `/agent <v>` prepend (Copilot) | Tasks 3 (injector), Phase 1's `toArgv` for the Claude branch |
| Spec §7 capability matrix: `pluginDirs` → `--plugin-dir <p>` per entry | Task 7 (relies on Phase 1's `toArgv`) |
| Spec §7 capability matrix: `agents` → `--agents '<json>'` | Task 7 (autoload) + Phase 1's `toArgv` |
| Spec §8 verification: `agentsManifest.test.ts` schema parsing | Task 2 |
| Unified-AI-CLI §8.4 `ai:list-agents { provider } → Agent[]` | Tasks 1, 5, 6 |
| Unified-AI-CLI: Copilot built-ins (`code-review`, `explore`, `general-purpose`, `research`, `task`) | Tasks 3 (mapping), 5 (constant) |
| CLAUDE.md IPC 5-file checklist (schema, App service, handler, registerHandlers, ResponseForRequest) | Tasks 1, 5, 6 |

**Out-of-scope deferrals** (covered by other phases or explicitly out per spec §9):
- `system/plugin_install` progress events → Phase 7.
- Editing `spec/agents.json` from inside Magenta → not in scope; manifest is read-only here.
- `--channels` / marketplaces → spec §9 (out of scope project-wide).
- Per-plugin metadata UI → out of scope; this phase only manages a list of directories.
- Persisting `agent` selection inside a spawn preset → Phase 4's preset CRUD already accepts arbitrary `AISpawnOptions`; no additional work needed here.
