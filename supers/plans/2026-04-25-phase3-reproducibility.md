# Phase 3 — Structured Context: Bare Mode, System Prompts, MCP, Settings

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Magenta's headless Claude / Copilot runs reproducible across machines. Plumb `--bare` (Claude one-shot only — PTY sessions stay full-context). Add per-working-dir defaults for system prompt templates and MCP config. Materialize MCP/prompt strings (or per-task `spec/claude-instructions.md` + `spec/copilot-instructions.md`) into temp files and pass them via `--mcp-config` / `--system-prompt-file` / `--append-system-prompt-file` (Claude) and `--additional-mcp-config` (Copilot). Surface a minimal Settings panel for the two new working-dir fields.

**Architecture:** Builds on Phase 1's `AISpawnOptions` + `getToArgv`. Adds:

1. **`packages/shared/src/workingDir.ts`** — `WorkingDirEntry` zod schema (`{ path, promptTemplatesPath?, mcpConfigJson? }`) and a backwards-compatible `WorkingDirsField` union (`string | WorkingDirEntry`) so the persisted `~/.magenta/config.json` can carry the new fields without breaking existing files. Old `string` entries are normalized to `{ path }` on load.
2. **`packages/daemon/src/domain/mcpConfigResolver.ts`** — pure function `resolveMcpConfig(spawn, workingDirDefault)` returning the effective config (string path or object) following precedence: `spawn.mcpConfig` wins; otherwise per-working-dir default. Returns `{ effective?: string | object, strict?: boolean }`.
3. **`packages/daemon/src/domain/systemPromptResolver.ts`** — pure function `resolveSystemPrompts({ spawn, workingDirDefault, taskDir })` that, for each provider, decides which `systemPromptFile` / `appendSystemPromptFile` paths apply (precedence: explicit `spawn.*File` → per-task `spec/<provider>-instructions.md` if present → per-working-dir `promptTemplatesPath`/`<provider>.md`).
4. **`packages/daemon/src/infrastructure/TempFileGateway.ts`** — wraps `fs.mkdtempSync` + tracked cleanup. One instance per `runOnce` call; `dispose()` removes the directory.
5. **`packages/daemon/src/application/AiBareRunApplicationService.ts`** — orchestrates fail-fast file checks, MCP/prompt materialization, calls `getToArgv("claude")`, hands to `AiCliGateway.run()` with `extraArgs` derived from `toArgv`, then disposes temp files.
6. **IPC**: extend `MagentaConfigSchema.workingDirs` so update flows through the existing `config:update` IPC handler. Add a new `ai:run-bare-once` IPC variant for the bare one-shot path used by spec-review and task-generation features.
7. **Renderer**: tiny "AI Reproducibility" tab in Settings with two text inputs per working-dir entry. No fancy editor.

**Cache schema impact:** None of the new fields live in LMDB sub-dbs — they live in `~/.magenta/config.json`, which is loaded/written by `ConfigManager` and validated by Zod on every read. (`packages/daemon/src/db/CACHE_SCHEMA_VERSION.ts` is unchanged.)

**Tech Stack:** TypeScript 5.x · Zod 3.x · Vitest · pnpm workspace · `node:fs` · `node:os` · existing `@magenta/shared` re-export pattern.

**Spec references:**
- `specs/2026-04-24-cli-programmatic-improvements.md` §4 Phase 3, §5 Data-model changes
- `specs/2026-04-24-unified-ai-cli-interface.md` FR-9.1 / FR-9.2 / FR-9.3 / FR-9.4, AC-4

**Out of scope for this phase:**
- Stream-json parser, `ai:run-once` general-purpose endpoint (Phase 2).
- Preset library (Phase 4).
- Session-id round-trip + reconciliation (Phase 5).
- Subagents / `--agents` / `--plugin-dir` UI (Phase 6).
- Token / cost accounting, retry events, debug-file UI (Phase 7).
- PTY sessions: those keep using full host context (`~/.claude`, `~/.copilot`) and never receive `--bare`.

> **Caveat about "migration 13/14":** the spec was written with a SQLite mental model. This codebase persists config in `~/.magenta/config.json` (Zod-validated) and uses LMDB only as a rebuildable cache (`packages/daemon/src/db/CACHE_SCHEMA_VERSION.ts` — bumping it wipes & rehydrates). The new `prompt_templates_path` / `mcp_config_json` columns are therefore implemented as new optional fields on a `WorkingDirEntry` Zod schema, with a backwards-compat loader that lifts legacy `string` working-dir entries to the new shape.

---

## File structure

| Action | Path | Responsibility |
|---|---|---|
| Create | `packages/shared/src/workingDir.ts` | `WorkingDirEntry` schema + `WorkingDirsField` union + `normalizeWorkingDirs()` migration helper. |
| Create | `packages/shared/src/workingDir.test.ts` | Round-trip + legacy-string lift + strict rejection tests. |
| Modify | `packages/shared/src/config.ts` | `MagentaConfigSchema.workingDirs` switches to `WorkingDirsField`; defaults preserved. |
| Modify | `packages/shared/src/aiSpawnOptions.ts` | No schema change (mcpConfig/systemPromptFile/etc. already exist from Phase 1). Touched only if a doc tweak is needed. |
| Create | `packages/daemon/src/domain/mcpConfigResolver.ts` | Pure precedence function. |
| Create | `packages/daemon/src/domain/mcpConfigResolver.test.ts` | All four precedence cases + strictMcpConfig pass-through. |
| Create | `packages/daemon/src/domain/systemPromptResolver.ts` | Pure precedence function for per-provider prompt-file paths. |
| Create | `packages/daemon/src/domain/systemPromptResolver.test.ts` | Precedence + missing-file fail-fast contract (returns `{ exists: false }`; caller raises). |
| Create | `packages/daemon/src/infrastructure/TempFileGateway.ts` | `mkdtemp()` + tracked `writeFile()` + `dispose()`. |
| Create | `packages/daemon/src/infrastructure/TempFileGateway.test.ts` | Materialize + dispose + idempotent dispose. |
| Modify | `packages/daemon/src/errors/AppError.ts` | Add `MCP_CONFIG_INVALID`, `SYSTEM_PROMPT_FILE_MISSING` codes. |
| Modify | `packages/daemon/src/config/ConfigManager.ts` | `getAllowedRoots()` extracts `entry.path`; `getWorkingDirEntry(path)` accessor; `updateWorkingDir(path, patch)` mutator; `loadConfig()` runs `normalizeWorkingDirs()`. |
| Create | `packages/daemon/src/config/ConfigManager.test.ts` | Round-trip persistence of new fields, legacy-string upgrade in-place, `getWorkingDirEntry` lookup. |
| Create | `packages/daemon/src/application/AiBareRunApplicationService.ts` | Orchestrates the bare one-shot path. |
| Create | `packages/daemon/src/application/AiBareRunApplicationService.test.ts` | Mock TempFileGateway + AiCliGateway + ConfigManager; assert argv composition + temp-file cleanup + fail-fast. |
| Modify | `packages/shared/src/ipc.ts` | Add `ai:run-bare-once` request + `ai:run-bare-once:result` response variants; extend `config:update` payload via existing `MagentaConfigSchema.partial()` (already covers new field). Add `config:update-working-dir` for ergonomic per-entry patch. |
| Create | `packages/daemon/src/ipc/handlers/aiBareRunHandlers.ts` | Thin `safeHandle` adapter calling `AiBareRunApplicationService`. |
| Modify | `packages/daemon/src/ipc/handlers/configHandlers.ts` | Add `safeHandle("config:update-working-dir", …)` calling `configManager.updateWorkingDir`. |
| Modify | `packages/daemon/src/ipc/registerHandlers.ts` | Wire `AiBareRunApplicationService` + register new handlers. |
| Modify | `packages/daemon/src/DaemonContainer.ts` | Construct `TempFileGateway` factory + `AiBareRunApplicationService`. |
| Modify | `packages/ui/src/renderer/services/ipcClient.ts` | Map `ai:run-bare-once` and `config:update-working-dir` in `ResponseForRequest`. |
| Modify | `packages/ui/src/renderer/store/configStore.ts` | `workingDirEntries` derived state + `updateWorkingDir(path, patch)` action. |
| Create | `packages/ui/src/renderer/components/settings/WorkingDirReproducibility.tsx` | Minimal text-input panel: per working-dir, two `<input>`s for prompt templates path + MCP config (path or inline JSON). |
| Modify | `packages/ui/src/renderer/components/settings/SettingsDialog.tsx` | New "AI Reproducibility" tab. |

---

## Task 1: `WorkingDirEntry` schema + backwards-compat loader

**Files:**
- Create: `packages/shared/src/workingDir.ts`
- Create: `packages/shared/src/workingDir.test.ts`
- Modify: `packages/shared/src/config.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/workingDir.test.ts
import { describe, it, expect } from "vitest";
import {
  WorkingDirEntrySchema,
  WorkingDirsFieldSchema,
  normalizeWorkingDirs,
  type WorkingDirEntry,
} from "./workingDir";

describe("WorkingDirEntry schema", () => {
  it("accepts a bare path", () => {
    const v: WorkingDirEntry = WorkingDirEntrySchema.parse({ path: "/tmp/a" });
    expect(v).toEqual({ path: "/tmp/a" });
  });

  it("accepts both optional fields", () => {
    const v = WorkingDirEntrySchema.parse({
      path: "/tmp/a",
      promptTemplatesPath: "/tmp/a/.magenta/prompts",
      mcpConfigJson: '{"servers":{}}',
    });
    expect(v.promptTemplatesPath).toBe("/tmp/a/.magenta/prompts");
    expect(v.mcpConfigJson).toBe('{"servers":{}}');
  });

  it("rejects unknown keys (.strict)", () => {
    expect(() =>
      WorkingDirEntrySchema.parse({ path: "/x", bogus: 1 } as unknown),
    ).toThrow();
  });

  it("rejects empty path", () => {
    expect(() => WorkingDirEntrySchema.parse({ path: "" })).toThrow();
  });
});

describe("WorkingDirsFieldSchema", () => {
  it("accepts a list of legacy strings", () => {
    expect(WorkingDirsFieldSchema.parse(["/a", "/b"])).toEqual(["/a", "/b"]);
  });

  it("accepts a list of entry objects", () => {
    expect(
      WorkingDirsFieldSchema.parse([
        { path: "/a" },
        { path: "/b", promptTemplatesPath: "/b/p" },
      ]),
    ).toEqual([{ path: "/a" }, { path: "/b", promptTemplatesPath: "/b/p" }]);
  });

  it("accepts a mixed list (string + object)", () => {
    expect(
      WorkingDirsFieldSchema.parse(["/a", { path: "/b" }]),
    ).toEqual(["/a", { path: "/b" }]);
  });
});

describe("normalizeWorkingDirs", () => {
  it("lifts legacy strings into entry objects", () => {
    expect(normalizeWorkingDirs(["/a", "/b"])).toEqual([
      { path: "/a" },
      { path: "/b" },
    ]);
  });

  it("preserves entry objects unchanged", () => {
    expect(
      normalizeWorkingDirs([{ path: "/a", mcpConfigJson: '{"x":1}' }]),
    ).toEqual([{ path: "/a", mcpConfigJson: '{"x":1}' }]);
  });

  it("upgrades a mixed array deterministically", () => {
    expect(
      normalizeWorkingDirs(["/a", { path: "/b", promptTemplatesPath: "/b/p" }]),
    ).toEqual([{ path: "/a" }, { path: "/b", promptTemplatesPath: "/b/p" }]);
  });

  it("dedupes by path, last write wins on metadata", () => {
    expect(
      normalizeWorkingDirs([
        "/a",
        { path: "/a", mcpConfigJson: '{"y":2}' },
      ]),
    ).toEqual([{ path: "/a", mcpConfigJson: '{"y":2}' }]);
  });
});
```

- [ ] **Step 2: Run test and verify fail**

Run: `pnpm --filter @magenta/shared test workingDir`
Expected: FAIL — module `./workingDir` not found.

- [ ] **Step 3: Implement schema + normalizer**

```ts
// packages/shared/src/workingDir.ts
import { z } from "zod";

/**
 * Per-working-directory metadata that the daemon merges into AI spawn options
 * when launching a Claude/Copilot run rooted in that working dir. Both extra
 * fields are optional — when absent, nothing is appended to argv. Adding new
 * optional fields here is additive and does NOT require a CACHE_SCHEMA_VERSION
 * bump (the cache doesn't store these — they live in `~/.magenta/config.json`).
 */
export const WorkingDirEntrySchema = z
  .object({
    path: z.string().min(1),
    /**
     * Directory holding `claude.md` / `copilot.md` (or arbitrary filenames the
     * resolver knows about). Used as a fallback `--system-prompt-file` /
     * `--append-system-prompt-file` source when a per-task or per-spawn file
     * is not provided. Spec FR-9.4.
     */
    promptTemplatesPath: z.string().optional(),
    /**
     * Default MCP config for runs rooted at this working dir. Either a path
     * to an existing JSON file or an inline JSON string (the resolver detects
     * which by attempting `JSON.parse`). Spec §5 migration 14 / FR-9.2.
     */
    mcpConfigJson: z.string().optional(),
  })
  .strict();

export type WorkingDirEntry = z.infer<typeof WorkingDirEntrySchema>;

/**
 * Persisted form of the `workingDirs` config field. Accepts the historical
 * `string[]` shape (Magenta 0.x) plus the new entry-object shape (FR-9.4).
 * Mixed arrays are tolerated to make the in-place upgrade reversible.
 */
export const WorkingDirsFieldSchema = z.array(
  z.union([z.string().min(1), WorkingDirEntrySchema]),
);

export type WorkingDirsField = z.infer<typeof WorkingDirsFieldSchema>;

/**
 * Lift any legacy string entries into `{ path }` objects, deduping by path.
 * On collision (same path appears twice), the entry with metadata wins; if
 * both have metadata, the last one wins (last-write-wins semantics suit the
 * "user is editing config.json by hand" case).
 *
 * Pure: no fs, no logging. Called by ConfigManager on load and by the IPC
 * handler when persisting partial updates.
 */
export function normalizeWorkingDirs(
  raw: WorkingDirsField,
): WorkingDirEntry[] {
  const map = new Map<string, WorkingDirEntry>();
  for (const item of raw) {
    const entry: WorkingDirEntry =
      typeof item === "string" ? { path: item } : item;
    const existing = map.get(entry.path);
    if (!existing) {
      map.set(entry.path, entry);
      continue;
    }
    // Merge: later wins for any explicitly set field.
    map.set(entry.path, {
      path: entry.path,
      promptTemplatesPath:
        entry.promptTemplatesPath ?? existing.promptTemplatesPath,
      mcpConfigJson: entry.mcpConfigJson ?? existing.mcpConfigJson,
    });
  }
  // Strip undefineds so equality checks in tests are clean.
  return [...map.values()].map((e) => {
    const out: WorkingDirEntry = { path: e.path };
    if (e.promptTemplatesPath !== undefined)
      out.promptTemplatesPath = e.promptTemplatesPath;
    if (e.mcpConfigJson !== undefined) out.mcpConfigJson = e.mcpConfigJson;
    return out;
  });
}
```

- [ ] **Step 4: Switch `MagentaConfigSchema.workingDirs` to the new field schema**

Edit `packages/shared/src/config.ts`. At the top, add:

```ts
import { WorkingDirsFieldSchema } from "./workingDir";
```

Replace the existing line `workingDirs: z.array(z.string()).default([]),` with:

```ts
workingDirs: WorkingDirsFieldSchema.default([]),
```

Re-export at the bottom of `config.ts`:

```ts
export {
  WorkingDirEntrySchema,
  WorkingDirsFieldSchema,
  normalizeWorkingDirs,
  type WorkingDirEntry,
  type WorkingDirsField,
} from "./workingDir";
```

- [ ] **Step 5: Run tests and verify pass**

Run: `pnpm --filter @magenta/shared test workingDir`
Expected: PASS, 12 tests.

Run: `pnpm --filter @magenta/shared typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/workingDir.ts packages/shared/src/workingDir.test.ts packages/shared/src/config.ts
git commit -m "feat(shared): WorkingDirEntry schema with prompt + mcp fields"
```

---

## Task 2: Add new error codes

**Files:**
- Modify: `packages/daemon/src/errors/AppError.ts`

- [ ] **Step 1: Add codes to the union**

Edit `packages/daemon/src/errors/AppError.ts`. The current union ends at `"FILE_WATCH_FAILED"`. Append:

```ts
  | "MCP_CONFIG_INVALID"
  | "SYSTEM_PROMPT_FILE_MISSING"
```

So the union now reads:

```ts
export type AppErrorCode =
  | "INTERNAL_ERROR"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "IPC_ERROR"
  | "REPO_NOT_FOUND"
  | "SPEC_PARSE_ERROR"
  | "FILE_TOO_LARGE"
  | "FILE_NOT_FOUND"
  | "FILE_EXISTS"
  | "WORKTREE_CONFLICT"
  | "WORKTREE_MISSING"
  | "GIT_ERROR"
  | "GIT_CLONE_FAILED"
  | "GIT_CONFLICT"
  | "GIT_UNSAFE_OPERATION"
  | "CONFIG_ERROR"
  | "SESSION_SYNC_ERROR"
  | "SESSION_PARSE_ERROR"
  | "AI_CONFIG_INVALID"
  | "AI_PROVIDER_NOT_AVAILABLE"
  | "AI_TIMEOUT"
  | "AI_CLI_FAILED"
  | "FILE_WATCH_FAILED"
  | "MCP_CONFIG_INVALID"
  | "SYSTEM_PROMPT_FILE_MISSING";
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm --filter @magenta/daemon typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/daemon/src/errors/AppError.ts
git commit -m "feat(daemon): MCP_CONFIG_INVALID + SYSTEM_PROMPT_FILE_MISSING error codes"
```

---

## Task 3: `mcpConfigResolver` — pure precedence

**Files:**
- Create: `packages/daemon/src/domain/mcpConfigResolver.ts`
- Create: `packages/daemon/src/domain/mcpConfigResolver.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/daemon/src/domain/mcpConfigResolver.test.ts
import { describe, it, expect } from "vitest";
import { resolveMcpConfig } from "./mcpConfigResolver";
import type { AISpawnOptions } from "@magenta/shared/aiSpawnOptions";
import type { WorkingDirEntry } from "@magenta/shared/workingDir";

describe("resolveMcpConfig", () => {
  const wdWithJson: WorkingDirEntry = {
    path: "/wd",
    mcpConfigJson: '{"servers":{"x":{"command":"x"}}}',
  };
  const wdWithPath: WorkingDirEntry = {
    path: "/wd",
    mcpConfigJson: "/wd/.magenta/mcp.json",
  };
  const wdNoMcp: WorkingDirEntry = { path: "/wd" };

  it("returns nothing when neither side specifies anything", () => {
    expect(resolveMcpConfig({}, wdNoMcp)).toEqual({});
  });

  it("uses working-dir default when spawn omits mcpConfig", () => {
    const r = resolveMcpConfig({}, wdWithJson);
    expect(r.effective).toEqual({ servers: { x: { command: "x" } } });
    expect(r.strict).toBe(false);
    expect(r.source).toBe("working-dir");
  });

  it("treats non-JSON working-dir mcpConfigJson as a path", () => {
    const r = resolveMcpConfig({}, wdWithPath);
    expect(r.effective).toBe("/wd/.magenta/mcp.json");
    expect(r.source).toBe("working-dir");
  });

  it("spawn.mcpConfig wins over working-dir default", () => {
    const spawn: AISpawnOptions = {
      mcpConfig: { servers: { y: { command: "y" } } },
    };
    const r = resolveMcpConfig(spawn, wdWithJson);
    expect(r.effective).toEqual({ servers: { y: { command: "y" } } });
    expect(r.source).toBe("spawn");
  });

  it("spawn.mcpConfig string passes through unchanged", () => {
    const r = resolveMcpConfig(
      { mcpConfig: "/explicit/mcp.json" },
      wdWithJson,
    );
    expect(r.effective).toBe("/explicit/mcp.json");
    expect(r.source).toBe("spawn");
  });

  it("strictMcpConfig is preserved from spawn", () => {
    const r = resolveMcpConfig(
      { mcpConfig: { servers: {} }, strictMcpConfig: true },
      wdNoMcp,
    );
    expect(r.strict).toBe(true);
  });

  it("strictMcpConfig defaults false when working-dir-only and not specified", () => {
    const r = resolveMcpConfig({}, wdWithJson);
    expect(r.strict).toBe(false);
  });

  it("an MCP-less working dir + a strict spawn still emits strict", () => {
    const r = resolveMcpConfig(
      { mcpConfig: "/p", strictMcpConfig: true },
      wdNoMcp,
    );
    expect(r.effective).toBe("/p");
    expect(r.strict).toBe(true);
  });
});
```

- [ ] **Step 2: Run test and verify fail**

Run: `pnpm --filter @magenta/daemon test mcpConfigResolver`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement resolver**

```ts
// packages/daemon/src/domain/mcpConfigResolver.ts
import type { AISpawnOptions } from "@magenta/shared/aiSpawnOptions";
import type { WorkingDirEntry } from "@magenta/shared/workingDir";

export interface ResolvedMcpConfig {
  /**
   * The effective config the daemon should pass to the CLI. May be a string
   * (existing file path the CLI reads directly) or a plain object (which the
   * caller will materialize to a temp file via TempFileGateway). Absent when
   * neither spawn nor working-dir specify anything.
   */
  effective?: string | Record<string, unknown>;
  /** Whether to add `--strict-mcp-config` (Claude only). */
  strict?: boolean;
  /** Provenance — useful for debug logs and tests. */
  source?: "spawn" | "working-dir";
}

/**
 * Pure precedence rule for MCP config (FR-9.2):
 *
 *   1. If `spawn.mcpConfig` is present (string or object), it WINS.
 *   2. Otherwise, fall back to the working-dir entry's `mcpConfigJson`.
 *      If it parses as JSON it is treated as inline config; otherwise as a
 *      path the CLI can read directly.
 *   3. If neither, return `{}` (caller emits no MCP flag).
 *
 * `strict` is taken from `spawn.strictMcpConfig` only — working-dir defaults
 * are non-strict by design (a strict default would silently break existing
 * runs the moment a per-working-dir MCP file went missing).
 */
export function resolveMcpConfig(
  spawn: Pick<AISpawnOptions, "mcpConfig" | "strictMcpConfig">,
  workingDir: WorkingDirEntry,
): ResolvedMcpConfig {
  const strict = spawn.strictMcpConfig ?? false;

  if (spawn.mcpConfig !== undefined) {
    return {
      effective: spawn.mcpConfig,
      strict,
      source: "spawn",
    };
  }

  if (workingDir.mcpConfigJson !== undefined) {
    const raw = workingDir.mcpConfigJson;
    let parsed: Record<string, unknown> | undefined;
    try {
      const candidate = JSON.parse(raw);
      if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
        parsed = candidate as Record<string, unknown>;
      }
    } catch {
      /* not JSON — treat as path */
    }
    return {
      effective: parsed ?? raw,
      strict,
      source: "working-dir",
    };
  }

  return strict ? { strict } : {};
}
```

- [ ] **Step 4: Run tests and verify pass**

Run: `pnpm --filter @magenta/daemon test mcpConfigResolver`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/domain/mcpConfigResolver.ts packages/daemon/src/domain/mcpConfigResolver.test.ts
git commit -m "feat(daemon): pure mcpConfigResolver with spawn-over-workingdir precedence"
```

---

## Task 4: `systemPromptResolver` — pure precedence + fail-fast checks

**Files:**
- Create: `packages/daemon/src/domain/systemPromptResolver.ts`
- Create: `packages/daemon/src/domain/systemPromptResolver.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/daemon/src/domain/systemPromptResolver.test.ts
import { describe, it, expect } from "vitest";
import { resolveSystemPrompts } from "./systemPromptResolver";
import type { AISpawnOptions } from "@magenta/shared/aiSpawnOptions";
import type { WorkingDirEntry } from "@magenta/shared/workingDir";

const wdNoTpl: WorkingDirEntry = { path: "/wd" };
const wdTpl: WorkingDirEntry = {
  path: "/wd",
  promptTemplatesPath: "/wd/.magenta/prompts",
};

describe("resolveSystemPrompts (claude)", () => {
  it("returns no files when nothing is configured", () => {
    expect(resolveSystemPrompts("claude", {}, wdNoTpl, undefined)).toEqual({
      systemPromptFile: undefined,
      appendSystemPromptFile: undefined,
    });
  });

  it("explicit spawn.systemPromptFile wins", () => {
    const spawn: AISpawnOptions = { systemPromptFile: "/explicit/sys.md" };
    expect(
      resolveSystemPrompts("claude", spawn, wdTpl, "/task/spec"),
    ).toEqual({
      systemPromptFile: "/explicit/sys.md",
      appendSystemPromptFile: undefined,
    });
  });

  it("falls back to per-task spec/claude-instructions.md", () => {
    expect(
      resolveSystemPrompts("claude", {}, wdNoTpl, "/task/spec"),
    ).toEqual({
      systemPromptFile: undefined,
      appendSystemPromptFile: "/task/spec/claude-instructions.md",
    });
  });

  it("falls back to working-dir promptTemplatesPath/claude.md when no task file", () => {
    expect(
      resolveSystemPrompts("claude", {}, wdTpl, undefined),
    ).toEqual({
      systemPromptFile: undefined,
      appendSystemPromptFile: "/wd/.magenta/prompts/claude.md",
    });
  });

  it("per-task file beats per-working-dir default", () => {
    expect(
      resolveSystemPrompts("claude", {}, wdTpl, "/task/spec"),
    ).toEqual({
      systemPromptFile: undefined,
      appendSystemPromptFile: "/task/spec/claude-instructions.md",
    });
  });

  it("explicit spawn.appendSystemPromptFile wins over both fallbacks", () => {
    const spawn: AISpawnOptions = {
      appendSystemPromptFile: "/explicit/append.md",
    };
    expect(
      resolveSystemPrompts("claude", spawn, wdTpl, "/task/spec"),
    ).toEqual({
      systemPromptFile: undefined,
      appendSystemPromptFile: "/explicit/append.md",
    });
  });
});

describe("resolveSystemPrompts (copilot)", () => {
  it("uses copilot-instructions.md for the per-task fallback", () => {
    expect(
      resolveSystemPrompts("copilot", {}, wdNoTpl, "/task/spec"),
    ).toEqual({
      systemPromptFile: undefined,
      appendSystemPromptFile: "/task/spec/copilot-instructions.md",
    });
  });

  it("uses copilot.md for the per-working-dir fallback", () => {
    expect(
      resolveSystemPrompts("copilot", {}, wdTpl, undefined),
    ).toEqual({
      systemPromptFile: undefined,
      appendSystemPromptFile: "/wd/.magenta/prompts/copilot.md",
    });
  });
});
```

- [ ] **Step 2: Run test and verify fail**

Run: `pnpm --filter @magenta/daemon test systemPromptResolver`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement resolver**

```ts
// packages/daemon/src/domain/systemPromptResolver.ts
import path from "node:path";
import type { AIProvider } from "@magenta/shared/aiTerminal";
import type { AISpawnOptions } from "@magenta/shared/aiSpawnOptions";
import type { WorkingDirEntry } from "@magenta/shared/workingDir";

export interface ResolvedSystemPrompts {
  /** Absolute path for `--system-prompt-file`, or undefined to skip the flag. */
  systemPromptFile: string | undefined;
  /** Absolute path for `--append-system-prompt-file`, or undefined to skip. */
  appendSystemPromptFile: string | undefined;
}

const PER_TASK_FILENAME: Record<AIProvider, string> = {
  claude: "claude-instructions.md",
  copilot: "copilot-instructions.md",
};

const PER_WORKING_DIR_FILENAME: Record<AIProvider, string> = {
  claude: "claude.md",
  copilot: "copilot.md",
};

/**
 * Pure precedence rule for system-prompt files (FR-9.3, FR-9.4). Existence
 * checks are NOT performed here — this is a domain function. The caller
 * (AiBareRunApplicationService) is responsible for fail-fast `fs.existsSync`
 * verification of any path it actually plans to pass to the CLI, and for
 * raising `AppError("SYSTEM_PROMPT_FILE_MISSING", …)` when missing.
 *
 * Precedence per provider:
 *
 *   1. `spawn.systemPromptFile`           → absolute, wins for `--system-prompt-file`.
 *   2. `spawn.appendSystemPromptFile`     → absolute, wins for `--append-system-prompt-file`.
 *   3. `<taskDir>/<provider>-instructions.md`  → falls into the append slot.
 *   4. `<workingDir.promptTemplatesPath>/<provider>.md`  → falls into the append slot.
 *
 * (3) and (4) only populate the *append* slot — we never silently override the
 * model's primary system prompt from a working-dir default. Callers wanting a
 * full replacement must set `spawn.systemPromptFile` explicitly.
 */
export function resolveSystemPrompts(
  provider: AIProvider,
  spawn: Pick<AISpawnOptions, "systemPromptFile" | "appendSystemPromptFile">,
  workingDir: WorkingDirEntry,
  taskDir: string | undefined,
): ResolvedSystemPrompts {
  const systemPromptFile = spawn.systemPromptFile;

  let appendSystemPromptFile = spawn.appendSystemPromptFile;
  if (appendSystemPromptFile === undefined) {
    if (taskDir) {
      appendSystemPromptFile = path.join(taskDir, PER_TASK_FILENAME[provider]);
    } else if (workingDir.promptTemplatesPath) {
      appendSystemPromptFile = path.join(
        workingDir.promptTemplatesPath,
        PER_WORKING_DIR_FILENAME[provider],
      );
    }
  }

  return { systemPromptFile, appendSystemPromptFile };
}
```

- [ ] **Step 4: Run tests and verify pass**

Run: `pnpm --filter @magenta/daemon test systemPromptResolver`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/domain/systemPromptResolver.ts packages/daemon/src/domain/systemPromptResolver.test.ts
git commit -m "feat(daemon): pure systemPromptResolver with task→workingdir fallback"
```

---

## Task 5: `TempFileGateway` — tracked materialization + cleanup

**Files:**
- Create: `packages/daemon/src/infrastructure/TempFileGateway.ts`
- Create: `packages/daemon/src/infrastructure/TempFileGateway.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/daemon/src/infrastructure/TempFileGateway.test.ts
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { TempFileGateway } from "./TempFileGateway";

describe("TempFileGateway", () => {
  const created: TempFileGateway[] = [];
  afterEach(() => {
    for (const g of created) g.dispose();
    created.length = 0;
  });

  it("creates a unique directory under os tmpdir", () => {
    const a = new TempFileGateway("magenta-test");
    const b = new TempFileGateway("magenta-test");
    created.push(a, b);
    expect(a.dir).not.toBe(b.dir);
    expect(fs.existsSync(a.dir)).toBe(true);
    expect(fs.existsSync(b.dir)).toBe(true);
    expect(path.basename(a.dir).startsWith("magenta-test")).toBe(true);
  });

  it("writes a file inside the dir and returns its absolute path", () => {
    const g = new TempFileGateway("magenta-test");
    created.push(g);
    const p = g.writeFile("mcp.json", '{"servers":{}}');
    expect(path.dirname(p)).toBe(g.dir);
    expect(fs.readFileSync(p, "utf8")).toBe('{"servers":{}}');
  });

  it("dispose removes the directory and tracked files", () => {
    const g = new TempFileGateway("magenta-test");
    const p = g.writeFile("a.txt", "hi");
    expect(fs.existsSync(p)).toBe(true);
    g.dispose();
    expect(fs.existsSync(p)).toBe(false);
    expect(fs.existsSync(g.dir)).toBe(false);
  });

  it("dispose is idempotent", () => {
    const g = new TempFileGateway("magenta-test");
    g.dispose();
    expect(() => g.dispose()).not.toThrow();
  });

  it("rejects path traversal in filename", () => {
    const g = new TempFileGateway("magenta-test");
    created.push(g);
    expect(() => g.writeFile("../escape.txt", "x")).toThrow(
      /must be a simple filename/i,
    );
    expect(() => g.writeFile("/abs/path.txt", "x")).toThrow(
      /must be a simple filename/i,
    );
  });
});
```

- [ ] **Step 2: Run test and verify fail**

Run: `pnpm --filter @magenta/daemon test TempFileGateway`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement gateway**

```ts
// packages/daemon/src/infrastructure/TempFileGateway.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { AppError } from "../errors/AppError";

/**
 * Per-run scratch space for files the daemon needs to materialize before
 * spawning a CLI (inline MCP config, per-task instruction files merged into
 * one). One gateway instance per `runOnce` invocation; `dispose()` is
 * idempotent and called from a `finally` block so a thrown error during
 * spawn cannot leak a temp directory.
 *
 * Why not pass JSON on the command line? Spec NFR-7: secrets MUST NOT appear
 * on argv. MCP configs frequently embed API tokens for downstream services,
 * so they always go via file paths.
 */
export class TempFileGateway {
  readonly dir: string;
  private readonly tracked = new Set<string>();
  private disposed = false;

  constructor(prefix: string = "magenta-aibare") {
    this.dir = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  }

  /**
   * Writes `contents` to a file named `name` inside the gateway's directory.
   * `name` MUST be a simple filename — no slashes, no `..`, no absolute path.
   * Returns the absolute path of the created file.
   */
  writeFile(name: string, contents: string): string {
    if (this.disposed) {
      throw new AppError(
        "INTERNAL_ERROR",
        "TempFileGateway.writeFile after dispose",
      );
    }
    if (
      name.length === 0 ||
      name.includes("/") ||
      name.includes("\\") ||
      name.includes("\0") ||
      name.startsWith(".") === false && name.startsWith("/") ||
      name === ".." ||
      name === "." ||
      path.basename(name) !== name
    ) {
      throw new AppError(
        "VALIDATION_ERROR",
        `TempFileGateway: name must be a simple filename, got: ${name}`,
      );
    }
    const p = path.join(this.dir, name);
    fs.writeFileSync(p, contents, { encoding: "utf8", mode: 0o600 });
    this.tracked.add(p);
    return p;
  }

  /**
   * Remove tracked files and the gateway directory. Idempotent — calling it
   * twice is safe so a `finally` block can always invoke it.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const p of this.tracked) {
      try {
        fs.unlinkSync(p);
      } catch {
        /* file may already be gone */
      }
    }
    try {
      fs.rmSync(this.dir, { recursive: true, force: true });
    } catch {
      /* ignore — caller is in cleanup, best-effort */
    }
    this.tracked.clear();
  }
}
```

- [ ] **Step 4: Run tests and verify pass**

Run: `pnpm --filter @magenta/daemon test TempFileGateway`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/infrastructure/TempFileGateway.ts packages/daemon/src/infrastructure/TempFileGateway.test.ts
git commit -m "feat(daemon): TempFileGateway with tracked-cleanup materialization"
```

---

## Task 6: `ConfigManager` per-working-dir field accessors

**Files:**
- Modify: `packages/daemon/src/config/ConfigManager.ts`
- Create: `packages/daemon/src/config/ConfigManager.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/daemon/src/config/ConfigManager.test.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ConfigManager } from "./ConfigManager";

let tmpDir: string;
let configPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "magenta-cfg-"));
  configPath = path.join(tmpDir, "config.json");
  ConfigManager.resetInstanceForTesting();
});

afterEach(() => {
  ConfigManager.resetInstanceForTesting();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("ConfigManager working-dir entries", () => {
  it("loads a legacy string array and lifts it to entry objects", () => {
    fs.writeFileSync(
      configPath,
      JSON.stringify({ workingDirs: ["/repos/a", "/repos/b"] }),
    );
    const cm = ConfigManager.getInstance(configPath);
    const cfg = cm.getConfig();
    expect(cfg.workingDirs).toEqual([
      { path: "/repos/a" },
      { path: "/repos/b" },
    ]);
    expect(cm.getAllowedRoots()).toEqual(["/repos/a", "/repos/b"]);
  });

  it("preserves entry objects round-trip", () => {
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        workingDirs: [
          { path: "/repos/a", promptTemplatesPath: "/repos/a/.magenta/prompts" },
        ],
      }),
    );
    const cm = ConfigManager.getInstance(configPath);
    expect(cm.getWorkingDirEntry("/repos/a")).toEqual({
      path: "/repos/a",
      promptTemplatesPath: "/repos/a/.magenta/prompts",
    });
  });

  it("updateWorkingDir patches a single entry and persists", () => {
    fs.writeFileSync(
      configPath,
      JSON.stringify({ workingDirs: ["/repos/a"] }),
    );
    const cm = ConfigManager.getInstance(configPath);
    cm.updateWorkingDir("/repos/a", {
      mcpConfigJson: '{"servers":{"x":{}}}',
    });
    const persisted = JSON.parse(fs.readFileSync(configPath, "utf8"));
    expect(persisted.workingDirs).toEqual([
      { path: "/repos/a", mcpConfigJson: '{"servers":{"x":{}}}' },
    ]);
    expect(cm.getWorkingDirEntry("/repos/a")?.mcpConfigJson).toBe(
      '{"servers":{"x":{}}}',
    );
  });

  it("updateWorkingDir on an unknown path throws CONFIG_ERROR", () => {
    fs.writeFileSync(configPath, JSON.stringify({ workingDirs: [] }));
    const cm = ConfigManager.getInstance(configPath);
    expect(() =>
      cm.updateWorkingDir("/repos/nope", { promptTemplatesPath: "/x" }),
    ).toThrow(/not a registered working dir/i);
  });

  it("clearing a field by passing undefined removes it", () => {
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        workingDirs: [{ path: "/repos/a", mcpConfigJson: "x" }],
      }),
    );
    const cm = ConfigManager.getInstance(configPath);
    cm.updateWorkingDir("/repos/a", { mcpConfigJson: undefined });
    expect(cm.getWorkingDirEntry("/repos/a")).toEqual({ path: "/repos/a" });
  });

  it("addWorkingDir on a fresh path produces an entry object", () => {
    fs.writeFileSync(configPath, JSON.stringify({ workingDirs: [] }));
    const cm = ConfigManager.getInstance(configPath);
    cm.addWorkingDir("/repos/c");
    expect(cm.getConfig().workingDirs).toEqual([{ path: "/repos/c" }]);
  });

  it("removeWorkingDir removes by path regardless of entry shape", () => {
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        workingDirs: [
          { path: "/repos/a", mcpConfigJson: "x" },
          "/repos/b",
        ],
      }),
    );
    const cm = ConfigManager.getInstance(configPath);
    cm.removeWorkingDir("/repos/a");
    expect(cm.getConfig().workingDirs).toEqual([{ path: "/repos/b" }]);
  });
});
```

- [ ] **Step 2: Run test and verify fail**

Run: `pnpm --filter @magenta/daemon test ConfigManager`
Expected: FAIL — `getWorkingDirEntry` and `updateWorkingDir` undefined; current `addWorkingDir` returns `string[]` not entry-object form.

- [ ] **Step 3: Update `ConfigManager`**

Edit `packages/daemon/src/config/ConfigManager.ts`. Replace the file with:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  MagentaConfigSchema,
  type MagentaConfig,
  normalizeWorkingDirs,
  type WorkingDirEntry,
} from "@magenta/shared/config";
import { AppError } from "../errors/AppError";

export class ConfigManager {
  private static instance: ConfigManager | null = null;

  private readonly configDir: string;
  private readonly configPath: string;
  private config: MagentaConfig;

  private constructor(configPath?: string) {
    this.configDir = path.join(os.homedir(), ".magenta");
    this.configPath = configPath ?? path.join(this.configDir, "config.json");

    fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    this.config = this.loadConfig();
  }

  static getInstance(configPath?: string): ConfigManager {
    if (ConfigManager.instance === null) {
      ConfigManager.instance = new ConfigManager(configPath);
    }

    return ConfigManager.instance;
  }

  static resetInstanceForTesting(): void {
    ConfigManager.instance = null;
  }

  getConfig(): MagentaConfig {
    return {
      ...this.config,
      // Defensive deep-copy so callers can't mutate our entries.
      workingDirs: this.workingDirEntries().map((e) => ({ ...e })),
    };
  }

  /**
   * Returns just the absolute paths — used by `PathAllowlistProvider`
   * consumers that don't care about per-dir reproducibility metadata.
   */
  getAllowedRoots(): readonly string[] {
    return this.workingDirEntries().map((e) => e.path);
  }

  /** Returns the entry object for a working-dir path, or undefined. */
  getWorkingDirEntry(workingDirPath: string): WorkingDirEntry | undefined {
    const normalized = this.normalizePath(workingDirPath);
    return this.workingDirEntries().find((e) => e.path === normalized);
  }

  /**
   * Patches a single working-dir entry. `patch` keys explicitly set to
   * `undefined` are deleted from the entry; absent keys are left alone.
   * Throws CONFIG_ERROR if the path is not registered (callers should
   * `addWorkingDir` first).
   */
  updateWorkingDir(
    workingDirPath: string,
    patch: Partial<Omit<WorkingDirEntry, "path">>,
  ): MagentaConfig {
    const normalized = this.normalizePath(workingDirPath);
    const entries = this.workingDirEntries();
    const idx = entries.findIndex((e) => e.path === normalized);
    if (idx === -1) {
      throw new AppError(
        "CONFIG_ERROR",
        `${workingDirPath} is not a registered working dir`,
      );
    }
    const current = entries[idx];
    const next: WorkingDirEntry = { path: current.path };
    const promptTemplatesPath =
      "promptTemplatesPath" in patch
        ? patch.promptTemplatesPath
        : current.promptTemplatesPath;
    const mcpConfigJson =
      "mcpConfigJson" in patch ? patch.mcpConfigJson : current.mcpConfigJson;
    if (promptTemplatesPath !== undefined)
      next.promptTemplatesPath = promptTemplatesPath;
    if (mcpConfigJson !== undefined) next.mcpConfigJson = mcpConfigJson;
    entries[idx] = next;
    this.config = { ...this.config, workingDirs: entries };
    this.writeConfig(this.config);
    return this.getConfig();
  }

  /**
   * Merges partial config updates into the current config and persists.
   * If `partial.workingDirs` is provided, it is normalized via
   * `normalizeWorkingDirs` so callers may pass the legacy string-array form.
   */
  updateConfig(partial: Partial<MagentaConfig>): MagentaConfig {
    const merged: MagentaConfig = { ...this.config, ...partial };
    if (partial.workingDirs !== undefined) {
      merged.workingDirs = normalizeWorkingDirs(partial.workingDirs);
    }
    this.config = merged;
    this.writeConfig(this.config);
    return this.getConfig();
  }

  addWorkingDir(dirPath: string): MagentaConfig {
    const normalizedPath = this.normalizePath(dirPath);
    const entries = this.workingDirEntries();
    if (!entries.some((e) => e.path === normalizedPath)) {
      entries.push({ path: normalizedPath });
      this.config = { ...this.config, workingDirs: entries };
      this.writeConfig(this.config);
    }
    return this.getConfig();
  }

  removeWorkingDir(dirPath: string): MagentaConfig {
    const normalizedPath = this.normalizePath(dirPath);
    const entries = this.workingDirEntries().filter(
      (e) => e.path !== normalizedPath,
    );
    this.config = { ...this.config, workingDirs: entries };
    this.writeConfig(this.config);
    return this.getConfig();
  }

  /** Normalized internal view of `workingDirs`. */
  private workingDirEntries(): WorkingDirEntry[] {
    return normalizeWorkingDirs(this.config.workingDirs).map((e) => ({
      ...e,
      path: this.normalizePath(e.path),
    }));
  }

  private normalizePath(inputPath: string): string {
    if (inputPath.startsWith("~/")) {
      return path.join(os.homedir(), inputPath.slice(2));
    }

    if (inputPath === "~") {
      return os.homedir();
    }

    return inputPath;
  }

  private loadConfig(): MagentaConfig {
    const defaults = MagentaConfigSchema.parse({});

    if (!fs.existsSync(this.configPath)) {
      this.writeConfig(defaults);
      return defaults;
    }

    try {
      const raw = fs.readFileSync(this.configPath, "utf-8");
      const parsed = JSON.parse(raw);
      const validated = MagentaConfigSchema.parse(parsed);
      const normalized = normalizeWorkingDirs(validated.workingDirs).map(
        (e) => ({ ...e, path: this.normalizePath(e.path) }),
      );
      return { ...validated, workingDirs: normalized };
    } catch {
      this.writeConfig(defaults);
      return defaults;
    }
  }

  private writeConfig(config: MagentaConfig): void {
    const tempPath = `${this.configPath}.tmp`;
    const serialized = JSON.stringify(config, null, 2);

    fs.writeFileSync(tempPath, serialized, "utf-8");
    fs.renameSync(tempPath, this.configPath);

    this.config = config;
  }
}
```

> Note: `MagentaConfig.workingDirs` is now `WorkingDirsField` (i.e. it can be a string-or-entry array on the wire). After `loadConfig()` and any mutation method, the in-memory `this.config.workingDirs` is always the entry-object form. `getConfig()` always returns entry-objects. Old callsites in the daemon that did `.includes(somePath)` on `workingDirs` need adapting — Task 7 covers callers.

- [ ] **Step 4: Run tests and verify pass**

Run: `pnpm --filter @magenta/daemon test ConfigManager`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/config/ConfigManager.ts packages/daemon/src/config/ConfigManager.test.ts
git commit -m "feat(daemon): per-working-dir entry fields in ConfigManager"
```

---

## Task 7: Adapt existing callers of `config.workingDirs` (compile-fix sweep)

**Files (read-only check + minimal edits):** any file flagged by typecheck.

- [ ] **Step 1: Run typecheck to find broken callers**

Run: `pnpm -w typecheck`

Expected: errors in any file that previously assumed `workingDirs: string[]`. Likely candidates (scan the output):

- `packages/daemon/src/services/RepoScanner.ts` (or similar) — passes paths to chokidar.
- `packages/daemon/src/services/DirWatcher.ts`.
- `packages/ui/src/renderer/store/configStore.ts` — `workingDirs: string[]`.
- `packages/ui/src/renderer/components/settings/WorkingDirList.tsx`.

- [ ] **Step 2: For each daemon caller, switch to `configManager.getAllowedRoots()`**

Daemon callers should use the existing `getAllowedRoots()` accessor (returns `string[]`) instead of indexing `config.workingDirs`. This is a no-op compatibility shim — `getAllowedRoots()` already returned `string[]` in Task 6's update.

Where the code currently does:

```ts
const dirs = configManager.getConfig().workingDirs; // was string[]
```

change to:

```ts
const dirs = configManager.getAllowedRoots();
```

- [ ] **Step 3: For renderer, keep `workingDirs` field internally as `WorkingDirEntry[]` and derive a `paths` array for any UI that needed strings**

Edit `packages/ui/src/renderer/store/configStore.ts`. Update the `ConfigStoreState` declaration:

```ts
import type { WorkingDirEntry } from "@magenta/shared/workingDir";
// ...
type ConfigStoreState = {
  workingDirs: WorkingDirEntry[]; // was string[]
  workingDirPaths: string[];      // derived convenience
  // ... existing fields stay ...
  updateWorkingDir: (
    path: string,
    patch: { promptTemplatesPath?: string; mcpConfigJson?: string },
  ) => Promise<void>;
};
```

Update `applyConfig`:

```ts
function applyConfig(config: MagentaConfig): Partial<ConfigStoreState> {
  const entries = (config.workingDirs as readonly (string | WorkingDirEntry)[]).map(
    (e) => (typeof e === "string" ? { path: e } : e),
  );
  return {
    workingDirs: entries,
    workingDirPaths: entries.map((e) => e.path),
    // ... rest unchanged ...
  };
}
```

Initial state:

```ts
workingDirs: [],
workingDirPaths: [],
```

Add `updateWorkingDir` action (mirrors the others):

```ts
updateWorkingDir(path, patch) {
  return createAsyncAction<ConfigStoreState, { config: MagentaConfig }>({
    set,
    action: () =>
      sendOrThrow({ type: "config:update-working-dir", path, patch }),
    onSuccess: (response) => applyConfig(response.config),
  })();
},
```

- [ ] **Step 4: Update `WorkingDirList.tsx`** (renderer)

Where it iterates `workingDirs`, switch to iterating `workingDirPaths` (string list). The list display itself doesn't care about per-dir metadata.

- [ ] **Step 5: Run typecheck again**

Run: `pnpm -w typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/services/ packages/ui/src/renderer/
git commit -m "fix(daemon,ui): adapt workingDirs callers to entry-object shape"
```

---

## Task 8: IPC variant `config:update-working-dir`

**Files:**
- Modify: `packages/shared/src/ipc.ts`
- Modify: `packages/daemon/src/ipc/handlers/configHandlers.ts`
- Modify: `packages/ui/src/renderer/services/ipcClient.ts`

- [ ] **Step 1: Write the failing handler test**

Create `packages/daemon/src/ipc/handlers/configHandlers.test.ts`:

```ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ConfigManager } from "../../config/ConfigManager";

let tmpDir: string;
let configPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "magenta-cfg-handler-"));
  configPath = path.join(tmpDir, "config.json");
  ConfigManager.resetInstanceForTesting();
  fs.writeFileSync(
    configPath,
    JSON.stringify({ workingDirs: [{ path: "/repos/a" }] }),
  );
});

afterEach(() => {
  ConfigManager.resetInstanceForTesting();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("config:update-working-dir handler contract", () => {
  it("ConfigManager.updateWorkingDir patches and returns the new config", () => {
    const cm = ConfigManager.getInstance(configPath);
    const cfg = cm.updateWorkingDir("/repos/a", {
      promptTemplatesPath: "/repos/a/.magenta/prompts",
    });
    expect(cfg.workingDirs[0]).toEqual({
      path: "/repos/a",
      promptTemplatesPath: "/repos/a/.magenta/prompts",
    });
  });
});
```

(The full IPC round-trip is exercised by user manual testing per `feedback_verification.md`. We assert the application-layer contract here — handler is a thin adapter and Phase 1's `safeHandle` wrapper is already covered by handler tests elsewhere.)

- [ ] **Step 2: Run test and verify fail**

Run: `pnpm --filter @magenta/daemon test configHandlers`
Expected: FAIL — `updateWorkingDir` is on the new ConfigManager from Task 6 and test imports look good but the IPC schema hasn't been added yet (the test as written will pass once Task 6 is in; this is a safety net).

If the test passes immediately because Task 6 is already merged, that's expected — proceed to Step 3 to add the IPC variant.

- [ ] **Step 3: Add IPC request schema**

Edit `packages/shared/src/ipc.ts`. Find the line:

```ts
z.object({ type: z.literal("config:update"), config: MagentaConfigSchema.partial() }),
```

Immediately after it, add:

```ts
z.object({
  type: z.literal("config:update-working-dir"),
  path: z.string(),
  patch: z
    .object({
      promptTemplatesPath: z.string().optional(),
      mcpConfigJson: z.string().optional(),
    })
    .strict(),
}),
```

The response shape reuses the existing `config:response` variant; no new response variant required.

- [ ] **Step 4: Add the handler**

Edit `packages/daemon/src/ipc/handlers/configHandlers.ts`. Inside `registerConfigHandlers`, after the existing `config:update` handler:

```ts
safeHandle(bridge, "config:update-working-dir", async (msg) => {
  const config = configManager.updateWorkingDir(msg.path, msg.patch);
  bridge.emit({ type: "config:updated", config });
  return { type: "config:response", config };
});
```

- [ ] **Step 5: Map response in the renderer**

Edit `packages/ui/src/renderer/services/ipcClient.ts`. Add to the `ResponseForRequest` map:

```ts
"config:update-working-dir": Extract<IpcResponse, { type: "config:response" }>;
```

- [ ] **Step 6: Verify typecheck + tests + build**

Run:
```bash
pnpm -w typecheck
pnpm --filter @magenta/daemon test configHandlers
pnpm -w build
```
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/ipc.ts packages/daemon/src/ipc/handlers/configHandlers.ts packages/daemon/src/ipc/handlers/configHandlers.test.ts packages/ui/src/renderer/services/ipcClient.ts
git commit -m "feat(ipc): config:update-working-dir variant"
```

---

## Task 9: `AiBareRunApplicationService` — orchestrate bare one-shot

**Files:**
- Create: `packages/daemon/src/application/AiBareRunApplicationService.ts`
- Create: `packages/daemon/src/application/AiBareRunApplicationService.test.ts`
- Modify: `packages/shared/src/ipc.ts` (add `ai:run-bare-once` request + response variants)
- Create: `packages/daemon/src/ipc/handlers/aiBareRunHandlers.ts`
- Modify: `packages/daemon/src/ipc/registerHandlers.ts`
- Modify: `packages/daemon/src/DaemonContainer.ts`
- Modify: `packages/ui/src/renderer/services/ipcClient.ts`

- [ ] **Step 1: Add IPC schema**

Edit `packages/shared/src/ipc.ts`. Append (after the existing AI session variants):

```ts
// `ai:run-bare-once` — Phase 3. One-shot Claude run with `--bare` so
// hooks/skills/plugins/MCP/CLAUDE.md auto-discovery is skipped, making the
// run reproducible across machines (Spec FR-9.1, AC-4). MCP config and
// system prompts are passed explicitly via files materialized by the daemon.
// Used by spec-review and task-generation features. PTY sessions DO NOT
// route through this — they keep full host context.
z.object({
  type: z.literal("ai:run-bare-once"),
  // Provider — Phase 3 supports claude only (Copilot has no `--bare`).
  // Copilot is added as a separate enum member to keep the request shape
  // stable when Copilot equivalent flags arrive in a later phase.
  provider: z.enum(["claude", "copilot"]),
  workingDirPath: z.string().min(1),
  /** Absolute path of a per-task spec directory (e.g. `<repo>/specs/<slug>/`). Optional. */
  taskSpecDir: z.string().optional(),
  prompt: z.string().min(1),
  /** Subset of AISpawnOptions the bare endpoint honours. Validated server-side. */
  spawn: z
    .object({
      model: z.string().optional(),
      mcpConfig: z.union([z.string(), z.record(z.unknown())]).optional(),
      strictMcpConfig: z.boolean().optional(),
      systemPromptFile: z.string().optional(),
      appendSystemPromptFile: z.string().optional(),
      maxTurns: z.number().int().positive().optional(),
      maxBudgetUsd: z.number().positive().optional(),
      allowedTools: z.array(z.string()).optional(),
      disallowedTools: z.array(z.string()).optional(),
      /** Claude-only `--settings` JSON or path. Required for `ANTHROPIC_API_KEY` / `apiKeyHelper` injection under `--bare` (Spec §4 Phase 3 item 5). */
      settings: z.union([z.string(), z.record(z.unknown())]).optional(),
    })
    .strict()
    .default({}),
  timeoutMs: z.number().int().positive().max(10 * 60_000).default(120_000),
}),
```

And in the response union:

```ts
z.object({
  type: z.literal("ai:run-bare-once:result"),
  stdout: z.string(),
  exitCode: z.number().int(),
  /** Argv we actually invoked the CLI with — useful for AC-4 byte-identical-argv assertions. */
  argv: z.array(z.string()),
  /** Provenance trace for debugging reproducibility issues. */
  resolution: z.object({
    mcpConfigSource: z.enum(["spawn", "working-dir", "none"]),
    systemPromptFileSource: z.enum(["spawn", "task", "working-dir", "none"]),
    appendSystemPromptFileSource: z.enum([
      "spawn",
      "task",
      "working-dir",
      "none",
    ]),
  }),
}),
```

- [ ] **Step 2: Write the failing application service test**

```ts
// packages/daemon/src/application/AiBareRunApplicationService.test.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AiBareRunApplicationService } from "./AiBareRunApplicationService";
import { AppError } from "../errors/AppError";
import type { ConfigManager } from "../config/ConfigManager";
import type { AiCliGateway } from "../infrastructure/AiCliGateway";
import { TempFileGateway } from "../infrastructure/TempFileGateway";

let scratch: string;

beforeEach(() => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "magenta-bare-svc-"));
});
afterEach(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
});

function makeMockGateway(captured: { args?: string[] } = {}) {
  return {
    run: vi.fn(async (_p, _m, _prompt, opts) => {
      captured.args = [...opts.extraArgs];
      return "bare-stdout";
    }),
  } as unknown as AiCliGateway;
}

function makeConfigManager(
  workingDirPath: string,
  entry: { promptTemplatesPath?: string; mcpConfigJson?: string } = {},
): ConfigManager {
  return {
    getWorkingDirEntry: () => ({ path: workingDirPath, ...entry }),
    getAllowedRoots: () => [workingDirPath],
  } as unknown as ConfigManager;
}

describe("AiBareRunApplicationService", () => {
  it("happy path: claude bare with no fallbacks emits --bare + prompt-only", async () => {
    const captured: { args?: string[] } = {};
    const svc = new AiBareRunApplicationService({
      configManager: makeConfigManager("/wd"),
      aiCliGateway: makeMockGateway(captured),
      tempFileFactory: () => new TempFileGateway("test"),
    });
    const out = await svc.runBareOnce({
      provider: "claude",
      workingDirPath: "/wd",
      taskSpecDir: undefined,
      prompt: "hello",
      spawn: {},
      timeoutMs: 10_000,
    });
    expect(out.stdout).toBe("bare-stdout");
    expect(captured.args).toContain("--bare");
    expect(captured.args).not.toContain("--mcp-config");
    expect(captured.args).not.toContain("--system-prompt-file");
    expect(captured.args).not.toContain("--append-system-prompt-file");
    expect(out.resolution.mcpConfigSource).toBe("none");
    expect(out.resolution.appendSystemPromptFileSource).toBe("none");
  });

  it("inline mcpConfig object is materialized to a temp file and passed", async () => {
    const captured: { args?: string[] } = {};
    let createdTempDirs: string[] = [];
    const svc = new AiBareRunApplicationService({
      configManager: makeConfigManager("/wd"),
      aiCliGateway: makeMockGateway(captured),
      tempFileFactory: () => {
        const t = new TempFileGateway("test");
        createdTempDirs.push(t.dir);
        return t;
      },
    });
    await svc.runBareOnce({
      provider: "claude",
      workingDirPath: "/wd",
      taskSpecDir: undefined,
      prompt: "hi",
      spawn: { mcpConfig: { servers: { x: { command: "x" } } } },
      timeoutMs: 10_000,
    });
    const i = captured.args!.indexOf("--mcp-config");
    expect(i).toBeGreaterThan(-1);
    const tempPath = captured.args![i + 1];
    // After dispose() the temp dir is gone, but during the assertion the
    // service's `finally` already disposed; assert the path *was inside* a
    // tracked dir.
    expect(createdTempDirs.some((d) => tempPath.startsWith(d))).toBe(true);
    // Cleanup happened.
    expect(createdTempDirs.every((d) => !fs.existsSync(d))).toBe(true);
  });

  it("strictMcpConfig=true adds --strict-mcp-config", async () => {
    const captured: { args?: string[] } = {};
    const svc = new AiBareRunApplicationService({
      configManager: makeConfigManager("/wd"),
      aiCliGateway: makeMockGateway(captured),
      tempFileFactory: () => new TempFileGateway("test"),
    });
    await svc.runBareOnce({
      provider: "claude",
      workingDirPath: "/wd",
      taskSpecDir: undefined,
      prompt: "hi",
      spawn: {
        mcpConfig: { servers: {} },
        strictMcpConfig: true,
      },
      timeoutMs: 10_000,
    });
    expect(captured.args).toContain("--strict-mcp-config");
  });

  it("working-dir mcpConfigJson is used when spawn omits it", async () => {
    const captured: { args?: string[] } = {};
    const svc = new AiBareRunApplicationService({
      configManager: makeConfigManager("/wd", {
        mcpConfigJson: '{"servers":{"y":{"command":"y"}}}',
      }),
      aiCliGateway: makeMockGateway(captured),
      tempFileFactory: () => new TempFileGateway("test"),
    });
    const out = await svc.runBareOnce({
      provider: "claude",
      workingDirPath: "/wd",
      taskSpecDir: undefined,
      prompt: "hi",
      spawn: {},
      timeoutMs: 10_000,
    });
    expect(captured.args).toContain("--mcp-config");
    expect(out.resolution.mcpConfigSource).toBe("working-dir");
  });

  it("per-task claude-instructions.md is materialized as --append-system-prompt-file", async () => {
    const taskDir = path.join(scratch, "spec");
    fs.mkdirSync(taskDir, { recursive: true });
    fs.writeFileSync(
      path.join(taskDir, "claude-instructions.md"),
      "task-rules",
    );

    const captured: { args?: string[] } = {};
    const svc = new AiBareRunApplicationService({
      configManager: makeConfigManager("/wd"),
      aiCliGateway: makeMockGateway(captured),
      tempFileFactory: () => new TempFileGateway("test"),
    });
    const out = await svc.runBareOnce({
      provider: "claude",
      workingDirPath: "/wd",
      taskSpecDir: taskDir,
      prompt: "hi",
      spawn: {},
      timeoutMs: 10_000,
    });
    const i = captured.args!.indexOf("--append-system-prompt-file");
    expect(i).toBeGreaterThan(-1);
    expect(captured.args![i + 1]).toBe(
      path.join(taskDir, "claude-instructions.md"),
    );
    expect(out.resolution.appendSystemPromptFileSource).toBe("task");
  });

  it("explicit spawn.systemPromptFile that does not exist throws SYSTEM_PROMPT_FILE_MISSING", async () => {
    const svc = new AiBareRunApplicationService({
      configManager: makeConfigManager("/wd"),
      aiCliGateway: makeMockGateway(),
      tempFileFactory: () => new TempFileGateway("test"),
    });
    await expect(
      svc.runBareOnce({
        provider: "claude",
        workingDirPath: "/wd",
        taskSpecDir: undefined,
        prompt: "hi",
        spawn: { systemPromptFile: "/nope/missing.md" },
        timeoutMs: 10_000,
      }),
    ).rejects.toMatchObject({
      code: "SYSTEM_PROMPT_FILE_MISSING",
    });
  });

  it("unknown working dir throws CONFIG_ERROR", async () => {
    const cm = {
      getWorkingDirEntry: () => undefined,
      getAllowedRoots: () => [],
    } as unknown as ConfigManager;
    const svc = new AiBareRunApplicationService({
      configManager: cm,
      aiCliGateway: makeMockGateway(),
      tempFileFactory: () => new TempFileGateway("test"),
    });
    await expect(
      svc.runBareOnce({
        provider: "claude",
        workingDirPath: "/not/registered",
        taskSpecDir: undefined,
        prompt: "hi",
        spawn: {},
        timeoutMs: 10_000,
      }),
    ).rejects.toMatchObject({ code: "CONFIG_ERROR" });
  });

  it("settings object is materialized for --settings", async () => {
    const captured: { args?: string[] } = {};
    const svc = new AiBareRunApplicationService({
      configManager: makeConfigManager("/wd"),
      aiCliGateway: makeMockGateway(captured),
      tempFileFactory: () => new TempFileGateway("test"),
    });
    await svc.runBareOnce({
      provider: "claude",
      workingDirPath: "/wd",
      taskSpecDir: undefined,
      prompt: "hi",
      spawn: { settings: { apiKeyHelper: "/usr/local/bin/helper" } },
      timeoutMs: 10_000,
    });
    const i = captured.args!.indexOf("--settings");
    expect(i).toBeGreaterThan(-1);
    // Path, not inline JSON (NFR-7).
    expect(captured.args![i + 1].endsWith(".json")).toBe(true);
  });

  it("copilot uses --additional-mcp-config rather than --mcp-config", async () => {
    const captured: { args?: string[] } = {};
    const svc = new AiBareRunApplicationService({
      configManager: makeConfigManager("/wd"),
      aiCliGateway: makeMockGateway(captured),
      tempFileFactory: () => new TempFileGateway("test"),
    });
    await svc.runBareOnce({
      provider: "copilot",
      workingDirPath: "/wd",
      taskSpecDir: undefined,
      prompt: "hi",
      spawn: { mcpConfig: { servers: {} } },
      timeoutMs: 10_000,
    });
    expect(captured.args).toContain("--additional-mcp-config");
    expect(captured.args).not.toContain("--mcp-config");
    expect(captured.args).not.toContain("--bare");
  });
});
```

- [ ] **Step 3: Run test and verify fail**

Run: `pnpm --filter @magenta/daemon test AiBareRunApplicationService`
Expected: FAIL — module `./AiBareRunApplicationService` not found.

- [ ] **Step 4: Implement service**

```ts
// packages/daemon/src/application/AiBareRunApplicationService.ts
import fs from "node:fs";

import type { AIProvider } from "@magenta/shared/aiTerminal";
import type { AISpawnOptions } from "@magenta/shared/aiSpawnOptions";

import type { ConfigManager } from "../config/ConfigManager";
import { AppError } from "../errors/AppError";
import { resolveMcpConfig } from "../domain/mcpConfigResolver";
import { resolveSystemPrompts } from "../domain/systemPromptResolver";
import { getToArgv } from "../domain/providerArgv";
import { TempFileGateway } from "../infrastructure/TempFileGateway";
import type { AiCliGateway } from "../infrastructure/AiCliGateway";

export interface AiBareRunRequest {
  provider: AIProvider;
  workingDirPath: string;
  taskSpecDir: string | undefined;
  prompt: string;
  spawn: Pick<
    AISpawnOptions,
    | "model"
    | "mcpConfig"
    | "strictMcpConfig"
    | "systemPromptFile"
    | "appendSystemPromptFile"
    | "maxTurns"
    | "maxBudgetUsd"
    | "allowedTools"
    | "disallowedTools"
    | "settings"
  >;
  timeoutMs: number;
}

export interface AiBareRunResolution {
  mcpConfigSource: "spawn" | "working-dir" | "none";
  systemPromptFileSource: "spawn" | "task" | "working-dir" | "none";
  appendSystemPromptFileSource: "spawn" | "task" | "working-dir" | "none";
}

export interface AiBareRunResult {
  stdout: string;
  exitCode: number;
  argv: string[];
  resolution: AiBareRunResolution;
}

export interface AiBareRunDeps {
  configManager: ConfigManager;
  aiCliGateway: AiCliGateway;
  /** Factory so tests can swap a fake. */
  tempFileFactory: () => TempFileGateway;
}

/**
 * Phase 3 application service. Orchestrates a reproducible non-interactive
 * Claude (or Copilot) run:
 *
 *  1. Resolve the working-dir entry; reject unknown working dirs.
 *  2. Resolve effective MCP config (spawn → working-dir → none).
 *  3. Resolve effective system-prompt files (spawn → per-task → working-dir).
 *  4. Materialize any inline JSON (mcpConfig object, settings object) to
 *     temp files (NFR-7: secrets stay off argv).
 *  5. Fail-fast existence checks on every file path we plan to pass to the
 *     CLI (FR-9.3).
 *  6. Translate the merged AISpawnOptions to argv via Phase 1's `toArgv()`,
 *     prepending `--bare` for Claude.
 *  7. Spawn via AiCliGateway.run; collect stdout / exitCode.
 *  8. Always dispose the temp file gateway (idempotent) in `finally`.
 */
export class AiBareRunApplicationService {
  constructor(private readonly deps: AiBareRunDeps) {}

  async runBareOnce(req: AiBareRunRequest): Promise<AiBareRunResult> {
    const wd = this.deps.configManager.getWorkingDirEntry(req.workingDirPath);
    if (!wd) {
      throw new AppError(
        "CONFIG_ERROR",
        `${req.workingDirPath} is not a registered working dir`,
      );
    }

    const tmp = this.deps.tempFileFactory();
    try {
      // 1. MCP
      const mcp = resolveMcpConfig(req.spawn, wd);
      let mcpEffective: string | undefined;
      let mcpSource: AiBareRunResolution["mcpConfigSource"] = "none";
      if (mcp.effective !== undefined) {
        mcpSource = mcp.source ?? "none";
        if (typeof mcp.effective === "string") {
          if (!fs.existsSync(mcp.effective)) {
            throw new AppError(
              "MCP_CONFIG_INVALID",
              `MCP config file not found: ${mcp.effective}`,
            );
          }
          mcpEffective = mcp.effective;
        } else {
          mcpEffective = tmp.writeFile(
            "mcp.json",
            JSON.stringify(mcp.effective),
          );
        }
      }

      // 2. System prompt files
      const sys = resolveSystemPrompts(
        req.provider,
        req.spawn,
        wd,
        req.taskSpecDir,
      );
      const checkExists = (
        p: string | undefined,
        kind: "primary" | "append",
      ): string | undefined => {
        if (p === undefined) return undefined;
        if (!fs.existsSync(p)) {
          throw new AppError(
            "SYSTEM_PROMPT_FILE_MISSING",
            `${kind} system prompt file not found: ${p}`,
          );
        }
        return p;
      };
      const systemPromptFile = checkExists(sys.systemPromptFile, "primary");
      const appendSystemPromptFile = checkExists(
        sys.appendSystemPromptFile,
        "append",
      );

      const systemPromptFileSource: AiBareRunResolution["systemPromptFileSource"] =
        req.spawn.systemPromptFile ? "spawn" : "none";
      const appendSystemPromptFileSource: AiBareRunResolution["appendSystemPromptFileSource"] =
        req.spawn.appendSystemPromptFile
          ? "spawn"
          : appendSystemPromptFile && req.taskSpecDir
            ? "task"
            : appendSystemPromptFile
              ? "working-dir"
              : "none";

      // 3. Settings (Claude)
      let settingsEffective: string | undefined;
      if (req.spawn.settings !== undefined) {
        if (typeof req.spawn.settings === "string") {
          // Either a path or a JSON string — Claude CLI accepts both. Pass through.
          settingsEffective = req.spawn.settings;
        } else {
          settingsEffective = tmp.writeFile(
            "settings.json",
            JSON.stringify(req.spawn.settings),
          );
        }
      }

      // 4. Build merged AISpawnOptions for toArgv. The provider determines
      //    which mcp flag is used (Claude: --mcp-config; Copilot:
      //    --additional-mcp-config); both are produced by the per-provider
      //    toArgv from the same `mcpConfig` field, with a path string here.
      const merged: AISpawnOptions = {
        ...req.spawn,
        mcpConfig: mcpEffective,
        strictMcpConfig: mcp.strict ?? undefined,
        systemPromptFile,
        appendSystemPromptFile,
        settings: settingsEffective,
        // Bare mode is Claude-only; toArgv drops it for Copilot with a warning.
        bare: req.provider === "claude" ? true : undefined,
      };

      const toArgv = getToArgv(req.provider);
      const { args } = toArgv(merged, /* caps fetched inside */);

      // 5. Spawn. AiCliGateway already manages timeouts, ENOENT handling, and
      //    stdout collection. We pass `args` through `extraArgs` because the
      //    gateway's adapter layer pre-pends provider-specific defaults
      //    (`-p`, `--model`); from Phase 4 onwards the gateway will consume
      //    `toArgv` directly, but Phase 3 only needs the bare path wired.
      const stdout = await this.deps.aiCliGateway.run(
        req.provider,
        req.spawn.model ?? "",
        req.prompt,
        {
          timeoutMs: req.timeoutMs,
          extraArgs: args,
          cwd: req.workingDirPath,
        },
      );

      return {
        stdout,
        exitCode: 0,
        argv: args,
        resolution: {
          mcpConfigSource: mcpSource,
          systemPromptFileSource,
          appendSystemPromptFileSource,
        },
      };
    } finally {
      tmp.dispose();
    }
  }
}
```

> Note on `getToArgv` second-argument: Phase 1's `getToArgv(provider)` returns a function `(opts, caps) => …`. The line `toArgv(merged, /* caps fetched inside */)` is a Phase 3 hand-wave — replace with the actual call signature Phase 1 settled on (likely `toArgv(merged, getProviderCapability(req.provider))`). If the Phase 1 PR is already merged, copy the exact signature from `packages/daemon/src/domain/providerArgv/index.ts`.

- [ ] **Step 5: Add IPC handler**

Create `packages/daemon/src/ipc/handlers/aiBareRunHandlers.ts`:

```ts
import type { IPCBridge } from "../IPCBridge";
import type { AiBareRunApplicationService } from "../../application/AiBareRunApplicationService";
import { safeHandle } from "../createHandler";

type Ctx = {
  bridge: IPCBridge;
  aiBareRunApplicationService: AiBareRunApplicationService;
};

export function registerAiBareRunHandlers({
  bridge,
  aiBareRunApplicationService,
}: Ctx): void {
  safeHandle(bridge, "ai:run-bare-once", async (msg) => {
    const result = await aiBareRunApplicationService.runBareOnce({
      provider: msg.provider,
      workingDirPath: msg.workingDirPath,
      taskSpecDir: msg.taskSpecDir,
      prompt: msg.prompt,
      spawn: msg.spawn,
      timeoutMs: msg.timeoutMs,
    });
    return {
      type: "ai:run-bare-once:result",
      stdout: result.stdout,
      exitCode: result.exitCode,
      argv: result.argv,
      resolution: result.resolution,
    };
  });
}
```

- [ ] **Step 6: Wire in `DaemonContainer.ts` and `registerHandlers.ts`**

In `packages/daemon/src/DaemonContainer.ts`, instantiate the service alongside other application services:

```ts
import { AiBareRunApplicationService } from "./application/AiBareRunApplicationService";
import { TempFileGateway } from "./infrastructure/TempFileGateway";

// inside the constructor, after AiCliGateway is constructed:
this.aiBareRunApplicationService = new AiBareRunApplicationService({
  configManager: this.configManager,
  aiCliGateway: this.aiCliGateway,
  tempFileFactory: () => new TempFileGateway("magenta-aibare"),
});
```

And expose it as a `readonly` property.

In `packages/daemon/src/ipc/registerHandlers.ts`, import and call:

```ts
import { registerAiBareRunHandlers } from "./handlers/aiBareRunHandlers";

registerAiBareRunHandlers({
  bridge,
  aiBareRunApplicationService: container.aiBareRunApplicationService,
});
```

- [ ] **Step 7: Map response in `ipcClient.ts`**

Add to `ResponseForRequest`:

```ts
"ai:run-bare-once": Extract<IpcResponse, { type: "ai:run-bare-once:result" }>;
```

- [ ] **Step 8: Run the full verification gate**

```bash
pnpm -w typecheck
pnpm -w build
pnpm --filter @magenta/daemon test
pnpm --filter @magenta/shared test
```

Expected: all PASS, including the 9 new application service tests.

- [ ] **Step 9: Commit**

```bash
git add packages/daemon/src/application/AiBareRunApplicationService.ts packages/daemon/src/application/AiBareRunApplicationService.test.ts packages/daemon/src/ipc/handlers/aiBareRunHandlers.ts packages/daemon/src/ipc/registerHandlers.ts packages/daemon/src/DaemonContainer.ts packages/shared/src/ipc.ts packages/ui/src/renderer/services/ipcClient.ts
git commit -m "feat(daemon): AiBareRunApplicationService for reproducible one-shot runs"
```

---

## Task 10: Settings UI — minimal "AI Reproducibility" tab

**Files:**
- Create: `packages/ui/src/renderer/components/settings/WorkingDirReproducibility.tsx`
- Modify: `packages/ui/src/renderer/components/settings/SettingsDialog.tsx`

- [ ] **Step 1: Create the panel component**

```tsx
// packages/ui/src/renderer/components/settings/WorkingDirReproducibility.tsx
import React from "react";

import { colors } from "../../utils/colors";
import { useConfigStore } from "../../store/configStore";

/**
 * Minimal reproducibility settings — per working-dir, two free-form text
 * inputs:
 *   - Prompt templates path (a directory containing `claude.md` /
 *     `copilot.md` used as fallback `--append-system-prompt-file`).
 *   - MCP config (an existing file path, OR an inline JSON string starting
 *     with `{`; the daemon decides which by attempting JSON.parse).
 *
 * No tree-view, no JSON editor — Phase 3 keeps the UI cheap. A richer editor
 * can come later. Empty inputs clear the field via `updateWorkingDir(path,
 * { ...: undefined })`.
 */
export function WorkingDirReproducibility(): React.ReactElement {
  const workingDirs = useConfigStore((s) => s.workingDirs);
  const updateWorkingDir = useConfigStore((s) => s.updateWorkingDir);

  if (workingDirs.length === 0) {
    return (
      <p style={{ fontSize: 11, color: colors.textMuted }}>
        Add a working directory in the Directories tab first.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <h3
          style={{
            margin: "0 0 6px 0",
            fontSize: 11,
            fontWeight: 600,
            color: colors.textStrong,
          }}
        >
          AI Reproducibility (per working directory)
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: 11,
            color: colors.textMuted,
            lineHeight: 1.5,
          }}
        >
          Used by bare-mode runs (spec review, task generation). Leave blank
          to skip the corresponding flag.
        </p>
      </div>

      {workingDirs.map((wd) => (
        <fieldset
          key={wd.path}
          style={{
            border: `1px solid ${colors.border}`,
            borderRadius: 4,
            padding: "8px 10px",
            margin: 0,
          }}
        >
          <legend
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: colors.text,
              padding: "0 4px",
            }}
          >
            {wd.path}
          </legend>

          <Field
            label="Prompt templates path"
            placeholder="/path/to/.magenta/prompts"
            value={wd.promptTemplatesPath ?? ""}
            onCommit={(v) =>
              void updateWorkingDir(wd.path, {
                promptTemplatesPath: v.trim() || undefined,
              })
            }
          />
          <Field
            label="MCP config (path or inline JSON)"
            placeholder='/path/to/mcp.json  or  {"servers":{}}'
            value={wd.mcpConfigJson ?? ""}
            onCommit={(v) =>
              void updateWorkingDir(wd.path, {
                mcpConfigJson: v.trim() || undefined,
              })
            }
          />
        </fieldset>
      ))}
    </div>
  );
}

function Field({
  label,
  placeholder,
  value,
  onCommit,
}: {
  label: string;
  placeholder: string;
  value: string;
  onCommit: (v: string) => void;
}): React.ReactElement {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);
  return (
    <label style={{ display: "block", marginTop: 8 }}>
      <span
        style={{
          display: "block",
          fontSize: 10,
          fontWeight: 500,
          color: colors.textMuted,
          marginBottom: 3,
        }}
      >
        {label}
      </span>
      <input
        type="text"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== value) onCommit(draft);
        }}
        style={{
          width: "100%",
          fontSize: 11,
          padding: "5px 7px",
          border: `1px solid ${colors.border}`,
          borderRadius: 3,
          background: colors.bgInput,
          color: colors.text,
          fontFamily: "monospace",
        }}
      />
    </label>
  );
}
```

- [ ] **Step 2: Wire the new tab into `SettingsDialog`**

Edit `packages/ui/src/renderer/components/settings/SettingsDialog.tsx`:

Add the import:

```ts
import { Boxes } from "lucide-react";
import { WorkingDirReproducibility } from "./WorkingDirReproducibility";
```

Extend the tab union:

```ts
type TabId =
  | "directories"
  | "specify"
  | "cli"
  | "sync"
  | "appearance"
  | "ai"
  | "reproducibility";
```

Add to `TABS`:

```ts
{ id: "reproducibility", label: "AI Reproducibility", icon: Boxes },
```

Add the panel branch in the `<SettingsPanel>`:

```tsx
{activeTab === "reproducibility" && <WorkingDirReproducibility />}
```

- [ ] **Step 3: Verify the build**

Run:
```bash
pnpm -w typecheck
pnpm -w build
```
Expected: PASS.

(No new vitest tests for the panel — it's a thin form. The store action it calls is exercised by Task 6's `ConfigManager` tests. Per `feedback_verification.md`, manual UI testing happens at Steven's pass.)

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/renderer/components/settings/WorkingDirReproducibility.tsx packages/ui/src/renderer/components/settings/SettingsDialog.tsx
git commit -m "feat(ui): minimal AI Reproducibility settings tab"
```

---

## Final verification gate

Per `feedback_verification.md`, do **NOT** launch the app. Run:

```bash
pnpm -w typecheck
pnpm -w build
pnpm --filter @magenta/shared test
pnpm --filter @magenta/daemon test
```

Every command must exit 0. Then hand off to Steven for the manual E2E pass.

---

## Spec coverage check

| Spec ref | Topic | Covered by task |
|---|---|---|
| Plan §4 Phase 3 item 1 | `--bare` for Claude one-shot | Task 9 (AiBareRunApplicationService passes `bare: true` for claude only) |
| Plan §4 Phase 3 item 2 / FR-9.3 / FR-9.4 | `systemPromptFile` / `appendSystemPromptFile` plumbing + per-working-dir templates | Task 4 (resolver), Task 9 (fail-fast existence checks) |
| Plan §4 Phase 3 item 3 / FR-9.2 / §5 migration 14 | per-working-dir MCP config + spawn precedence | Task 1 (`mcpConfigJson` field), Task 3 (resolver), Task 9 (materialization) |
| Plan §4 Phase 3 item 4 | Copilot `--additional-mcp-config` mirrored | Task 9 (last test asserts Copilot's mcp flag); Phase 1 `toArgvCopilot` already emits the right flag from `mcpConfig` |
| Plan §4 Phase 3 item 5 | Claude `--settings` JSON injection (`ANTHROPIC_API_KEY` / `apiKeyHelper`) under `--bare` for CI | Task 9 (settings object materialized to temp file) |
| Plan §4 Phase 3 item 6 / FR-9.4 | per-task `spec/<provider>-instructions.md` files | Task 4 (resolver precedence #3), Task 9 (per-task test) |
| Plan §5 migration 13 | `working_dirs.prompt_templates_path` | Task 1 (`promptTemplatesPath` field) |
| Plan §5 migration 14 | `working_dirs.mcp_config_json` | Task 1 (`mcpConfigJson` field) |
| FR-9.1 | `--bare` plumbed when `spawn.bare === true` (here: forced true for Claude bare path) | Task 9 |
| FR-9.2 | mcpConfig materialized to temp file + `--mcp-config` / `--additional-mcp-config` + optional `--strict-mcp-config` | Task 9 (mcp materialization + strict test) |
| FR-9.3 | `systemPromptFile` / `appendSystemPromptFile` fail-fast on missing | Task 9 (`SYSTEM_PROMPT_FILE_MISSING` test) |
| FR-9.4 | per-working-dir defaults merged with explicit overriding | Task 1 + Task 3 + Task 4 + Task 6 (ConfigManager accessors) |
| AC-4 | bare-mode run on a second machine produces byte-identical argv | Task 9 (response includes `argv`); deterministic argv comes from Phase 1 `toArgv` (NFR-6 snapshot) |
| Settings UI panel | minimal text-input panel for the two new fields | Task 10 |
| Spec FR-2.3 (UNSUPPORTED_SPAWN_OPTION) | Out of scope for Phase 3 (Phase 2 introduces `ai:run-once` validator) | — |
