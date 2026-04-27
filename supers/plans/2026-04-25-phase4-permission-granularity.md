# Phase 4 — Tool / Permission Granularity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the AI session surface from "default prompts vs. bypass everything" to least-privilege per task. This phase threads `allowedTools` / `disallowedTools` through `ai-session:create`, ships a built-in preset library with per-provider tool syntax, registers a daemon-side MCP server that surfaces Claude's permission prompts as typed IPC events, and exposes Copilot `--no-ask-user` for programmatic runs only.

**Architecture:** Phase 1's pure `getToArgv()` already understands `allowedTools` / `disallowedTools` / `permissionPromptTool` / `noAskUser` — Phase 4 only widens the IPC contract and adds three new layers above it: (1) static + DB-backed `AIPreset` library in `packages/shared`, (2) pure `translatePattern()` mapper between Claude `Bash(prefix *)` and Copilot `shell(prefix:*)` so each preset is authored once, (3) a tiny stdio MCP server (`PermissionPromptMcpServer`) auto-registered via `--mcp-config` whenever `permissionPromptTool` is set, bridging Claude's permission prompts to push event `ai-session:permission-request` and IPC request `ai-session:permission-response`.

**Tech Stack:** TypeScript 5.x · Zod 3.x · `@modelcontextprotocol/sdk` (already in daemon for outbound MCP) · Drizzle ORM · Vitest · pnpm workspace.

**Spec references:** `specs/2026-04-24-cli-programmatic-improvements.md` §4 Phase 4 · `specs/2026-04-24-unified-ai-cli-interface.md` FR-3.3, FR-8.1, FR-8.2, FR-8.3, AC-3, AC-8, AC-9 · CLAUDE.md "Adding a New IPC Endpoint" 5-file checklist.

**Out of scope for this phase:**
- `ai:run-once` IPC variant (Phase 2; this plan only touches `ai-session:create`).
- Caller-provided session IDs / `--session-id` round-trip (Phase 5).
- `--agents` / `--plugin-dir` (Phase 6).
- Observability (`api_retry`, cost) (Phase 7).
- Renderer permission-approval modal — Phase 4 wires the IPC protocol; the dialog component itself is renderer follow-up work.
- Claude `intentToSpawn` (FR-3.1, FR-3.2) — that helper is Phase 5/6 work; this phase ships only the preset library and translator (FR-3.3 + FR-8.3).

---

## File structure

| Action | Path | Responsibility |
|---|---|---|
| Create | `packages/daemon/src/domain/toolPatternTranslator.ts` | Pure `translatePattern(pattern, fromSyntax, toSyntax)` between Claude and Copilot tool syntaxes. |
| Create | `packages/daemon/src/domain/toolPatternTranslator.test.ts` | Round-trip tests for every pattern shape. |
| Create | `packages/shared/src/aiPresets.ts` | `AIPreset` Zod schema + 4 built-in presets (`read-only-review`, `commit-and-push`, `test-and-fix`, `docs-only`) authored once and exposed per-provider. |
| Create | `packages/shared/src/aiPresets.test.ts` | Schema round-trip + built-in preset shape assertions + per-provider rendering. |
| Create | `packages/daemon/src/domain/presetTranslator.ts` | `renderPresetForProvider(preset, provider)` → `Partial<AISpawnOptions>` using `translatePattern`. |
| Create | `packages/daemon/src/domain/presetTranslator.test.ts` | Snapshot test for every built-in preset × provider combination. |
| Create | `packages/daemon/src/db/migrations/0017_ai_task_presets.sql` | Migration 17 from spec §5 — `ai_task_presets` table. |
| Create | `packages/daemon/src/db/migrations/0017_ai_task_presets.test.ts` | Up/down golden snapshot. |
| Create | `packages/daemon/src/db/repositories/AiPresetRepository.ts` | CRUD over `ai_task_presets`, returning typed `AIPreset` rows. |
| Create | `packages/daemon/src/db/repositories/AiPresetRepository.test.ts` | Unit tests against in-memory SQLite. |
| Create | `packages/daemon/src/db/mappers/aiPresetMapper.ts` | Row ↔ `AIPreset` mapper (per CLAUDE.md infrastructure mapper rule). |
| Create | `packages/daemon/src/application/AiPresetService.ts` | Application service orchestrating built-in + DB presets, dedupe by id. |
| Create | `packages/daemon/src/application/AiPresetService.test.ts` | Service test (mocks repo, asserts built-ins always returned). |
| Create | `packages/daemon/src/ipc/handlers/aiPresetHandlers.ts` | `safeHandle` wrappers for `ai:presets:list \| create \| update \| delete`. |
| Create | `packages/daemon/src/infrastructure/PermissionPromptMcpServer.ts` | Stdio MCP server exposing a single `approve` tool; bridges to event bus. |
| Create | `packages/daemon/src/infrastructure/PermissionPromptMcpServer.test.ts` | Spawns the server, exercises tool list + tool call, asserts emitted events. |
| Create | `packages/daemon/src/application/PermissionPromptCoordinator.ts` | Owns the request→response correlation table; emits `ai-session:permission-request`, awaits matching `ai-session:permission-response`. |
| Create | `packages/daemon/src/application/PermissionPromptCoordinator.test.ts` | Resolves on response, rejects on timeout, rejects on session close. |
| Modify | `packages/shared/src/ipc.ts` | Add `allowedTools`, `disallowedTools`, `presetId?`, `permissionPromptTool?`, `noAskUser?` (programmatic only) to `ai-session:create`; add `ai:presets:list \| create \| update \| delete`, `ai-session:permission-response` requests + `ai-session:permission-request` push event. |
| Modify | `packages/shared/src/index.ts` | Re-export `AIPreset`, `BUILTIN_PRESETS` for renderer. |
| Modify | `packages/daemon/src/ipc/handlers/aiSessionHandlers.ts` | Pass new fields through to `AiSessionAppService`; merge resolved preset into spawn options before calling `getToArgv`. |
| Modify | `packages/daemon/src/application/AiSessionAppService.ts` (or equivalent owner of `ai-session:create`) | Resolve `presetId` via `AiPresetService.resolveForProvider`, materialize permission-prompt MCP into the per-session `--mcp-config` when `permissionPromptTool` is set, drop `noAskUser` for non-programmatic spawns. |
| Modify | `packages/daemon/src/ipc/registerHandlers.ts` | Wire `AiPresetRepository`, `AiPresetService`, `PermissionPromptCoordinator`, `PermissionPromptMcpServer`; register preset + permission handlers. |
| Modify | `packages/daemon/src/composition/DaemonContainer.ts` | Construct the new services as `readonly` properties (composition root rule). |
| Modify | `packages/daemon/src/errors/AppError.ts` | Add `PRESET_NOT_FOUND`, `PERMISSION_PROMPT_TIMEOUT`, `BUILTIN_PRESET_READONLY` codes. |
| Modify | `packages/ui/src/renderer/services/ipcClient.ts` | Update `ResponseForRequest` for the four preset variants + permission-response. |
| Modify | `packages/ui/src/renderer/stores/aiPresetStore.ts` (new) | Zustand store loading presets at boot; exposes `list`, `create`, `update`, `delete` via `sendOrThrow`. |
| Modify | `packages/ui/src/renderer/components/sessions/CreateAISessionDialog.tsx` (or equivalent) | Add "Tool preset" `<Select>` populated from `aiPresetStore`. Selecting a preset fills `allowedTools` / `disallowedTools` / `permissionMode` on the form. |

---

## Task 1: Tool-pattern translator (pure)

**Files:**
- Create: `packages/daemon/src/domain/toolPatternTranslator.ts`
- Create: `packages/daemon/src/domain/toolPatternTranslator.test.ts`

- [ ] **Step 1: Write the failing translator test**

```ts
// packages/daemon/src/domain/toolPatternTranslator.test.ts
import { describe, it, expect } from "vitest";
import { translatePattern, type ToolSyntax } from "./toolPatternTranslator";

describe("translatePattern", () => {
  const claude: ToolSyntax = "claude";
  const copilot: ToolSyntax = "copilot";

  it("passes through bare tool names unchanged across syntaxes", () => {
    expect(translatePattern("Read", claude, copilot)).toBe("read");
    expect(translatePattern("read", copilot, claude)).toBe("Read");
    expect(translatePattern("Edit", claude, copilot)).toBe("write");
    expect(translatePattern("write", copilot, claude)).toBe("Edit");
  });

  it("rewrites Bash(prefix *) → shell(prefix:*)", () => {
    expect(translatePattern("Bash(git add *)", claude, copilot)).toBe(
      "shell(git:add:*)",
    );
    expect(translatePattern("Bash(npm test *)", claude, copilot)).toBe(
      "shell(npm:test:*)",
    );
    expect(translatePattern("Bash(git diff)", claude, copilot)).toBe(
      "shell(git:diff)",
    );
  });

  it("rewrites shell(prefix:*) → Bash(prefix *)", () => {
    expect(translatePattern("shell(git:add:*)", copilot, claude)).toBe(
      "Bash(git add *)",
    );
    expect(translatePattern("shell(pnpm:*)", copilot, claude)).toBe(
      "Bash(pnpm *)",
    );
  });

  it("is identity when fromSyntax === toSyntax", () => {
    expect(translatePattern("Bash(git *)", claude, claude)).toBe("Bash(git *)");
    expect(translatePattern("shell(git:*)", copilot, copilot)).toBe(
      "shell(git:*)",
    );
  });

  it("round-trips claude → copilot → claude losslessly for known shapes", () => {
    const inputs = [
      "Read",
      "Edit",
      "Grep",
      "Glob",
      "Bash(git add *)",
      "Bash(git commit *)",
      "Bash(git push *)",
      "Bash(npm test *)",
      "Bash(pnpm test *)",
      "WebFetch",
    ];
    for (const p of inputs) {
      const round = translatePattern(
        translatePattern(p, claude, copilot),
        copilot,
        claude,
      );
      expect(round).toBe(p);
    }
  });

  it("throws for unknown bare tool names — fail closed, never silently strip", () => {
    expect(() =>
      translatePattern("MadeUpTool", claude, copilot),
    ).toThrow(/unknown tool/i);
  });
});
```

- [ ] **Step 2: Run; verify fail**

Run: `pnpm --filter @magenta/daemon test toolPatternTranslator`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the translator**

```ts
// packages/daemon/src/domain/toolPatternTranslator.ts
export type ToolSyntax = "claude" | "copilot";

/**
 * Bare-tool name table. Add new rows as providers grow their tool surfaces.
 * Lookup is bidirectional; throws on unknown names so a typo in a preset
 * fails the build rather than silently dropping a permission rule.
 */
const BARE_NAME_MAP: ReadonlyArray<readonly [string, string]> = [
  ["Read", "read"],
  ["Edit", "write"],
  ["Write", "write"],
  ["Grep", "view"],
  ["Glob", "view"],
  ["WebFetch", "fetch"],
  ["WebSearch", "search"],
];

const claudeToCopilotBare = new Map(BARE_NAME_MAP);
const copilotToClaudeBare = new Map(
  BARE_NAME_MAP.map(([c, g]) => [g, c] as const),
);

const CLAUDE_BASH = /^Bash\(([^)]+)\)$/;
const COPILOT_SHELL = /^shell\(([^)]+)\)$/;

export function translatePattern(
  pattern: string,
  fromSyntax: ToolSyntax,
  toSyntax: ToolSyntax,
): string {
  if (fromSyntax === toSyntax) return pattern;

  if (fromSyntax === "claude" && toSyntax === "copilot") {
    const m = CLAUDE_BASH.exec(pattern);
    if (m) {
      const inner = m[1].trim().replace(/\s+/g, ":");
      return `shell(${inner})`;
    }
    const mapped = claudeToCopilotBare.get(pattern);
    if (!mapped) throw new Error(`unknown tool name: ${pattern}`);
    return mapped;
  }

  // copilot → claude
  const m = COPILOT_SHELL.exec(pattern);
  if (m) {
    const inner = m[1].replace(/:/g, " ");
    return `Bash(${inner})`;
  }
  const mapped = copilotToClaudeBare.get(pattern);
  if (!mapped) throw new Error(`unknown tool name: ${pattern}`);
  return mapped;
}
```

- [ ] **Step 4: Run; verify pass**

Run: `pnpm --filter @magenta/daemon test toolPatternTranslator`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/domain/toolPatternTranslator.ts \
        packages/daemon/src/domain/toolPatternTranslator.test.ts
git commit -m "feat(daemon): add tool-pattern translator between Claude and Copilot syntaxes"
```

---

## Task 2: `AIPreset` schema + 4 built-in presets in shared

**Files:**
- Create: `packages/shared/src/aiPresets.ts`
- Create: `packages/shared/src/aiPresets.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write the failing schema/preset test**

```ts
// packages/shared/src/aiPresets.test.ts
import { describe, it, expect } from "vitest";
import {
  AIPresetSchema,
  BUILTIN_PRESETS,
  BUILTIN_PRESET_IDS,
} from "./aiPresets";

describe("AIPreset", () => {
  it("schema accepts a minimal preset", () => {
    const ok = AIPresetSchema.parse({
      id: "custom-1",
      name: "Custom",
      builtin: false,
      claude: { allowedTools: ["Read"] },
      copilot: { allowedTools: ["read"] },
    });
    expect(ok.id).toBe("custom-1");
  });

  it("schema rejects unknown keys", () => {
    expect(() =>
      AIPresetSchema.parse({
        id: "x",
        name: "x",
        builtin: false,
        claude: {},
        copilot: {},
        bogus: 1,
      } as unknown),
    ).toThrow();
  });

  it("ships exactly the 4 mandatory built-ins", () => {
    expect(BUILTIN_PRESET_IDS.sort()).toEqual([
      "commit-and-push",
      "docs-only",
      "read-only-review",
      "test-and-fix",
    ]);
    expect(BUILTIN_PRESETS).toHaveLength(4);
    for (const p of BUILTIN_PRESETS) expect(p.builtin).toBe(true);
  });

  it("read-only-review preset blocks every write tool on both providers", () => {
    const p = BUILTIN_PRESETS.find((x) => x.id === "read-only-review")!;
    expect(p.claude.allowedTools).toEqual(["Read", "Grep", "Glob"]);
    expect(p.claude.disallowedTools).toContain("Edit");
    expect(p.copilot.allowedTools).toEqual(["read", "view"]);
  });

  it("commit-and-push preset includes git push permission on both providers", () => {
    const p = BUILTIN_PRESETS.find((x) => x.id === "commit-and-push")!;
    expect(p.claude.allowedTools).toContain("Bash(git push *)");
    expect(p.copilot.allowedTools?.some((t) => t.includes("git:push"))).toBe(
      true,
    );
  });

  it("every built-in preset parses against the schema", () => {
    for (const p of BUILTIN_PRESETS) {
      expect(() => AIPresetSchema.parse(p)).not.toThrow();
    }
  });
});
```

- [ ] **Step 2: Run; verify fail**

Run: `pnpm --filter @magenta/shared test aiPresets`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement schema + built-ins**

```ts
// packages/shared/src/aiPresets.ts
import { z } from "zod";
import { AISpawnOptionsSchema } from "./aiSpawnOptions";

/**
 * Per-provider partial spawn options; explicitly authored — no automatic
 * translation here. The daemon's preset translator (Phase 4 task 3) is the
 * place that does cross-syntax rendering when an author wants a single source.
 */
const PerProviderSpawn = AISpawnOptionsSchema.partial();

export const AIPresetSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    builtin: z.boolean(),
    claude: PerProviderSpawn,
    copilot: PerProviderSpawn,
  })
  .strict();

export type AIPreset = z.infer<typeof AIPresetSchema>;

export const BUILTIN_PRESETS: readonly AIPreset[] = [
  {
    id: "read-only-review",
    name: "Read-only review",
    description: "Inspect code; refuse all writes and shell commands.",
    builtin: true,
    claude: {
      allowedTools: ["Read", "Grep", "Glob"],
      disallowedTools: ["Edit", "Write", "Bash", "WebFetch"],
      permissionMode: "plan",
    },
    copilot: {
      allowedTools: ["read", "view"],
      disallowedTools: ["write", "shell"],
      permissionMode: "plan",
    },
  },
  {
    id: "commit-and-push",
    name: "Commit & push",
    description: "Edits + git add/commit/push only. No arbitrary shell.",
    builtin: true,
    claude: {
      allowedTools: [
        "Read",
        "Edit",
        "Bash(git add *)",
        "Bash(git commit *)",
        "Bash(git push *)",
        "Bash(git status)",
        "Bash(git diff *)",
      ],
      disallowedTools: ["WebFetch"],
    },
    copilot: {
      allowedTools: ["read", "write", "shell(git:*)"],
      disallowedTools: ["fetch"],
    },
  },
  {
    id: "test-and-fix",
    name: "Test & fix",
    description: "Run tests and edit code; no network, no git push.",
    builtin: true,
    claude: {
      allowedTools: [
        "Read",
        "Edit",
        "Bash(npm test *)",
        "Bash(pnpm test *)",
        "Bash(pnpm vitest *)",
      ],
      disallowedTools: ["Bash(git push *)", "WebFetch"],
    },
    copilot: {
      allowedTools: [
        "read",
        "write",
        "shell(npm:*)",
        "shell(pnpm:*)",
        "shell(npx:*)",
      ],
      disallowedTools: ["shell(git:push:*)", "fetch"],
    },
  },
  {
    id: "docs-only",
    name: "Docs only",
    description: "Read everything; only write Markdown files.",
    builtin: true,
    claude: {
      allowedTools: ["Read", "Grep", "Glob", "Edit"],
      disallowedTools: ["Bash", "WebFetch"],
    },
    copilot: {
      allowedTools: ["read", "view", "write"],
      disallowedTools: ["shell", "fetch"],
    },
  },
] as const;

export const BUILTIN_PRESET_IDS = BUILTIN_PRESETS.map((p) => p.id);
```

- [ ] **Step 4: Re-export from shared barrel**

In `packages/shared/src/index.ts`, add:

```ts
export * from "./aiPresets";
```

- [ ] **Step 5: Run; verify pass**

Run: `pnpm --filter @magenta/shared test aiPresets`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/aiPresets.ts \
        packages/shared/src/aiPresets.test.ts \
        packages/shared/src/index.ts
git commit -m "feat(shared): AIPreset schema + 4 built-in presets"
```

---

## Task 3: Preset translator (renders preset → spawn options for one provider)

**Files:**
- Create: `packages/daemon/src/domain/presetTranslator.ts`
- Create: `packages/daemon/src/domain/presetTranslator.test.ts`

- [ ] **Step 1: Write the failing translator test**

```ts
// packages/daemon/src/domain/presetTranslator.test.ts
import { describe, it, expect } from "vitest";
import { BUILTIN_PRESETS } from "@magenta/shared";
import { renderPresetForProvider } from "./presetTranslator";

describe("renderPresetForProvider", () => {
  it("returns the claude side verbatim for provider=claude", () => {
    const p = BUILTIN_PRESETS.find((x) => x.id === "commit-and-push")!;
    expect(renderPresetForProvider(p, "claude")).toEqual(p.claude);
  });

  it("returns the copilot side verbatim for provider=copilot", () => {
    const p = BUILTIN_PRESETS.find((x) => x.id === "commit-and-push")!;
    expect(renderPresetForProvider(p, "copilot")).toEqual(p.copilot);
  });

  // FR-8.3 / AC-9 — every built-in renders to a stable, snapshottable shape
  it.each(BUILTIN_PRESETS.map((p) => [p.id]))(
    "renders %s for both providers without throwing",
    (id) => {
      const p = BUILTIN_PRESETS.find((x) => x.id === id)!;
      expect(() => renderPresetForProvider(p, "claude")).not.toThrow();
      expect(() => renderPresetForProvider(p, "copilot")).not.toThrow();
    },
  );

  it("matches snapshot for read-only-review × claude (AC-9)", () => {
    const p = BUILTIN_PRESETS.find((x) => x.id === "read-only-review")!;
    expect(renderPresetForProvider(p, "claude")).toMatchInlineSnapshot(`
      {
        "allowedTools": [
          "Read",
          "Grep",
          "Glob",
        ],
        "disallowedTools": [
          "Edit",
          "Write",
          "Bash",
          "WebFetch",
        ],
        "permissionMode": "plan",
      }
    `);
  });
});
```

- [ ] **Step 2: Run; verify fail**

Run: `pnpm --filter @magenta/daemon test presetTranslator`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the translator**

```ts
// packages/daemon/src/domain/presetTranslator.ts
import type { AIPreset, AIProvider, AISpawnOptions } from "@magenta/shared";

/**
 * Render an `AIPreset` for a single provider.
 *
 * Built-in presets are authored explicitly per provider — no syntax
 * translation happens here. The pattern translator (`toolPatternTranslator.ts`)
 * exists for *user-authored* presets that opt-in to single-source authoring;
 * those are produced by future preset CRUD UI work and not by this Phase 4.
 */
export function renderPresetForProvider(
  preset: AIPreset,
  provider: AIProvider,
): Partial<AISpawnOptions> {
  return provider === "claude" ? preset.claude : preset.copilot;
}
```

- [ ] **Step 4: Run; verify pass**

Run: `pnpm --filter @magenta/daemon test presetTranslator`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/domain/presetTranslator.ts \
        packages/daemon/src/domain/presetTranslator.test.ts
git commit -m "feat(daemon): preset translator with snapshot test for read-only-review"
```

---

## Task 4: Migration 17 — `ai_task_presets` table

**Files:**
- Create: `packages/daemon/src/db/migrations/0017_ai_task_presets.sql`
- Create: `packages/daemon/src/db/migrations/0017_ai_task_presets.test.ts`

- [ ] **Step 1: Write the failing migration golden-snapshot test**

```ts
// packages/daemon/src/db/migrations/0017_ai_task_presets.test.ts
import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { runMigrationsTo } from "../runner";

describe("migration 0017_ai_task_presets", () => {
  it("creates ai_task_presets table with expected columns", () => {
    const db = new Database(":memory:");
    runMigrationsTo(db, 17);
    const cols = db
      .prepare("PRAGMA table_info(ai_task_presets)")
      .all() as Array<{ name: string; type: string; notnull: number }>;
    expect(cols.map((c) => c.name).sort()).toEqual([
      "claude_json",
      "copilot_json",
      "created_at",
      "description",
      "id",
      "name",
      "updated_at",
    ]);
    const idCol = cols.find((c) => c.name === "id")!;
    expect(idCol.type.toUpperCase()).toContain("TEXT");
    expect(idCol.notnull).toBe(1);
  });

  it("enforces unique id", () => {
    const db = new Database(":memory:");
    runMigrationsTo(db, 17);
    db.prepare(
      "INSERT INTO ai_task_presets (id,name,claude_json,copilot_json,created_at,updated_at) VALUES (?,?,?,?,?,?)",
    ).run("a", "A", "{}", "{}", 1, 1);
    expect(() =>
      db
        .prepare(
          "INSERT INTO ai_task_presets (id,name,claude_json,copilot_json,created_at,updated_at) VALUES (?,?,?,?,?,?)",
        )
        .run("a", "A2", "{}", "{}", 2, 2),
    ).toThrow(/UNIQUE/i);
  });
});
```

- [ ] **Step 2: Run; verify fail**

Run: `pnpm --filter @magenta/daemon test 0017_ai_task_presets`
Expected: FAIL — no migration file.

- [ ] **Step 3: Write the migration**

```sql
-- packages/daemon/src/db/migrations/0017_ai_task_presets.sql
CREATE TABLE IF NOT EXISTS ai_task_presets (
  id           TEXT PRIMARY KEY NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  claude_json  TEXT NOT NULL,
  copilot_json TEXT NOT NULL,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_task_presets_name_idx ON ai_task_presets(name);
```

- [ ] **Step 4: Run; verify pass**

Run: `pnpm --filter @magenta/daemon test 0017_ai_task_presets`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/db/migrations/0017_ai_task_presets.sql \
        packages/daemon/src/db/migrations/0017_ai_task_presets.test.ts
git commit -m "feat(daemon): migration 17 — ai_task_presets table"
```

---

## Task 5: Repository + mapper + `AiPresetService`

**Files:**
- Create: `packages/daemon/src/db/mappers/aiPresetMapper.ts`
- Create: `packages/daemon/src/db/repositories/AiPresetRepository.ts`
- Create: `packages/daemon/src/db/repositories/AiPresetRepository.test.ts`
- Create: `packages/daemon/src/application/AiPresetService.ts`
- Create: `packages/daemon/src/application/AiPresetService.test.ts`
- Modify: `packages/daemon/src/errors/AppError.ts`

- [ ] **Step 1: Add new error codes**

In `packages/daemon/src/errors/AppError.ts`, extend `AppErrorCode`:

```ts
export type AppErrorCode =
  | /* existing codes... */
  | "PRESET_NOT_FOUND"
  | "BUILTIN_PRESET_READONLY"
  | "PERMISSION_PROMPT_TIMEOUT";
```

- [ ] **Step 2: Write the failing repository test**

```ts
// packages/daemon/src/db/repositories/AiPresetRepository.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { runMigrationsTo } from "../runner";
import { AiPresetRepository } from "./AiPresetRepository";
import type { AIPreset } from "@magenta/shared";

const sample: AIPreset = {
  id: "user-1",
  name: "User one",
  builtin: false,
  claude: { allowedTools: ["Read"] },
  copilot: { allowedTools: ["read"] },
};

describe("AiPresetRepository", () => {
  let db: Database.Database;
  let repo: AiPresetRepository;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrationsTo(db, 17);
    repo = new AiPresetRepository(db);
  });

  it("create + list round-trips", () => {
    repo.create(sample, 1000);
    expect(repo.list()).toEqual([sample]);
  });

  it("update modifies fields", () => {
    repo.create(sample, 1000);
    repo.update(sample.id, { name: "renamed" }, 2000);
    expect(repo.list()[0].name).toBe("renamed");
  });

  it("delete removes the row", () => {
    repo.create(sample, 1000);
    repo.delete(sample.id);
    expect(repo.list()).toEqual([]);
  });

  it("findById returns undefined for missing id", () => {
    expect(repo.findById("nope")).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run; verify fail**

Run: `pnpm --filter @magenta/daemon test AiPresetRepository`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the mapper + repository**

```ts
// packages/daemon/src/db/mappers/aiPresetMapper.ts
import type { AIPreset } from "@magenta/shared";

export type AiPresetRow = {
  id: string;
  name: string;
  description: string | null;
  claude_json: string;
  copilot_json: string;
  created_at: number;
  updated_at: number;
};

export function rowToPreset(row: AiPresetRow): AIPreset {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    builtin: false,
    claude: JSON.parse(row.claude_json),
    copilot: JSON.parse(row.copilot_json),
  };
}

export function presetToRow(p: AIPreset, now: number): AiPresetRow {
  return {
    id: p.id,
    name: p.name,
    description: p.description ?? null,
    claude_json: JSON.stringify(p.claude),
    copilot_json: JSON.stringify(p.copilot),
    created_at: now,
    updated_at: now,
  };
}
```

```ts
// packages/daemon/src/db/repositories/AiPresetRepository.ts
import type Database from "better-sqlite3";
import type { AIPreset } from "@magenta/shared";
import { presetToRow, rowToPreset, type AiPresetRow } from "../mappers/aiPresetMapper";

export class AiPresetRepository {
  constructor(private readonly db: Database.Database) {}

  list(): AIPreset[] {
    return (this.db
      .prepare("SELECT * FROM ai_task_presets ORDER BY name ASC")
      .all() as AiPresetRow[]).map(rowToPreset);
  }

  findById(id: string): AIPreset | undefined {
    const row = this.db
      .prepare("SELECT * FROM ai_task_presets WHERE id = ?")
      .get(id) as AiPresetRow | undefined;
    return row ? rowToPreset(row) : undefined;
  }

  create(preset: AIPreset, now: number): void {
    const row = presetToRow(preset, now);
    this.db
      .prepare(
        "INSERT INTO ai_task_presets (id,name,description,claude_json,copilot_json,created_at,updated_at) VALUES (@id,@name,@description,@claude_json,@copilot_json,@created_at,@updated_at)",
      )
      .run(row);
  }

  update(id: string, patch: Partial<AIPreset>, now: number): void {
    const current = this.findById(id);
    if (!current) return;
    const next: AIPreset = { ...current, ...patch };
    const row = presetToRow(next, now);
    this.db
      .prepare(
        "UPDATE ai_task_presets SET name=@name, description=@description, claude_json=@claude_json, copilot_json=@copilot_json, updated_at=@updated_at WHERE id=@id",
      )
      .run(row);
  }

  delete(id: string): void {
    this.db.prepare("DELETE FROM ai_task_presets WHERE id = ?").run(id);
  }
}
```

- [ ] **Step 5: Write the failing service test**

```ts
// packages/daemon/src/application/AiPresetService.test.ts
import { describe, it, expect, vi } from "vitest";
import { BUILTIN_PRESETS } from "@magenta/shared";
import { AiPresetService } from "./AiPresetService";
import { AppError } from "../errors/AppError";

const repo = () => ({
  list: vi.fn(() => []),
  findById: vi.fn(() => undefined),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
});

describe("AiPresetService", () => {
  it("list returns built-ins first, then DB rows", () => {
    const r = repo();
    r.list.mockReturnValue([
      { id: "u1", name: "U", builtin: false, claude: {}, copilot: {} },
    ]);
    const svc = new AiPresetService(r as never);
    const out = svc.list();
    expect(out.slice(0, 4).map((p) => p.id).sort()).toEqual([
      "commit-and-push",
      "docs-only",
      "read-only-review",
      "test-and-fix",
    ]);
    expect(out[4].id).toBe("u1");
  });

  it("resolveForProvider returns rendered options for built-in", () => {
    const svc = new AiPresetService(repo() as never);
    const out = svc.resolveForProvider("read-only-review", "claude");
    expect(out.allowedTools).toEqual(["Read", "Grep", "Glob"]);
  });

  it("resolveForProvider throws PRESET_NOT_FOUND for unknown id", () => {
    const svc = new AiPresetService(repo() as never);
    expect(() => svc.resolveForProvider("nope", "claude")).toThrow(AppError);
  });

  it("update rejects built-in preset id with BUILTIN_PRESET_READONLY", () => {
    const svc = new AiPresetService(repo() as never);
    try {
      svc.update("read-only-review", { name: "x" });
      expect.fail("expected throw");
    } catch (e) {
      expect((e as AppError).code).toBe("BUILTIN_PRESET_READONLY");
    }
  });

  it("delete rejects built-in preset id", () => {
    const svc = new AiPresetService(repo() as never);
    try {
      svc.delete("docs-only");
      expect.fail("expected throw");
    } catch (e) {
      expect((e as AppError).code).toBe("BUILTIN_PRESET_READONLY");
    }
  });
});
```

- [ ] **Step 6: Run; verify fail**

Run: `pnpm --filter @magenta/daemon test AiPresetService`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement the service**

```ts
// packages/daemon/src/application/AiPresetService.ts
import {
  AIPresetSchema,
  BUILTIN_PRESETS,
  BUILTIN_PRESET_IDS,
  type AIPreset,
  type AIProvider,
  type AISpawnOptions,
} from "@magenta/shared";
import { AppError } from "../errors/AppError";
import type { AiPresetRepository } from "../db/repositories/AiPresetRepository";
import { renderPresetForProvider } from "../domain/presetTranslator";

export class AiPresetService {
  constructor(private readonly repo: AiPresetRepository) {}

  list(): AIPreset[] {
    return [...BUILTIN_PRESETS, ...this.repo.list()];
  }

  create(input: AIPreset): AIPreset {
    const parsed = AIPresetSchema.parse({ ...input, builtin: false });
    if (BUILTIN_PRESET_IDS.includes(parsed.id)) {
      throw new AppError(
        "BUILTIN_PRESET_READONLY",
        `Cannot create preset with built-in id: ${parsed.id}`,
      );
    }
    this.repo.create(parsed, Date.now());
    return parsed;
  }

  update(id: string, patch: Partial<AIPreset>): void {
    if (BUILTIN_PRESET_IDS.includes(id)) {
      throw new AppError(
        "BUILTIN_PRESET_READONLY",
        `Built-in preset is read-only: ${id}`,
      );
    }
    if (!this.repo.findById(id)) {
      throw new AppError("PRESET_NOT_FOUND", `Preset not found: ${id}`);
    }
    this.repo.update(id, patch, Date.now());
  }

  delete(id: string): void {
    if (BUILTIN_PRESET_IDS.includes(id)) {
      throw new AppError(
        "BUILTIN_PRESET_READONLY",
        `Built-in preset is read-only: ${id}`,
      );
    }
    this.repo.delete(id);
  }

  resolveForProvider(
    id: string,
    provider: AIProvider,
  ): Partial<AISpawnOptions> {
    const found = this.list().find((p) => p.id === id);
    if (!found) {
      throw new AppError("PRESET_NOT_FOUND", `Preset not found: ${id}`);
    }
    return renderPresetForProvider(found, provider);
  }
}
```

- [ ] **Step 8: Run; verify pass**

Run: `pnpm --filter @magenta/daemon test AiPreset`
Expected: PASS for both repo and service.

- [ ] **Step 9: Commit**

```bash
git add packages/daemon/src/db/mappers/aiPresetMapper.ts \
        packages/daemon/src/db/repositories/AiPresetRepository.ts \
        packages/daemon/src/db/repositories/AiPresetRepository.test.ts \
        packages/daemon/src/application/AiPresetService.ts \
        packages/daemon/src/application/AiPresetService.test.ts \
        packages/daemon/src/errors/AppError.ts
git commit -m "feat(daemon): AiPresetRepository + AiPresetService with built-in protection"
```

---

## Task 6: Preset CRUD IPC (FR-3.3, list/create/update/delete)

**Files:**
- Modify: `packages/shared/src/ipc.ts`
- Create: `packages/daemon/src/ipc/handlers/aiPresetHandlers.ts`
- Modify: `packages/daemon/src/ipc/registerHandlers.ts`
- Modify: `packages/daemon/src/composition/DaemonContainer.ts`
- Modify: `packages/ui/src/renderer/services/ipcClient.ts`

- [ ] **Step 1: Extend the IPC schemas**

In `packages/shared/src/ipc.ts`, add to `IpcRequestSchema` and `IpcResponseSchema`:

```ts
// requests
z.object({ type: z.literal("ai:presets:list") }),
z.object({ type: z.literal("ai:presets:create"), preset: AIPresetSchema }),
z.object({
  type: z.literal("ai:presets:update"),
  id: z.string(),
  patch: AIPresetSchema.partial(),
}),
z.object({ type: z.literal("ai:presets:delete"), id: z.string() }),

// responses
z.object({ type: z.literal("ai:presets:listed"), presets: z.array(AIPresetSchema) }),
z.object({ type: z.literal("ai:presets:created"), preset: AIPresetSchema }),
z.object({ type: z.literal("ai:presets:updated"), id: z.string() }),
z.object({ type: z.literal("ai:presets:deleted"), id: z.string() }),
```

(Import `AIPresetSchema` from `./aiPresets`.)

- [ ] **Step 2: Write the failing handler test**

```ts
// packages/daemon/src/ipc/handlers/aiPresetHandlers.test.ts
import { describe, it, expect, vi } from "vitest";
import { registerAiPresetHandlers } from "./aiPresetHandlers";

function makeBridge() {
  const handlers = new Map<string, (req: unknown) => unknown>();
  return {
    handle: (type: string, fn: (req: unknown) => unknown) =>
      handlers.set(type, fn),
    invoke: async (req: { type: string }) =>
      handlers.get(req.type)!(req),
  };
}

describe("aiPresetHandlers", () => {
  it("delegates list to service.list()", async () => {
    const bridge = makeBridge();
    const svc = { list: vi.fn(() => []), create: vi.fn(), update: vi.fn(), delete: vi.fn() };
    registerAiPresetHandlers(bridge as never, svc as never);
    const res = (await bridge.invoke({ type: "ai:presets:list" })) as {
      type: string;
      presets: unknown[];
    };
    expect(res.type).toBe("ai:presets:listed");
    expect(svc.list).toHaveBeenCalled();
  });

  it("delegates create with the parsed preset payload", async () => {
    const bridge = makeBridge();
    const preset = {
      id: "u1",
      name: "U",
      builtin: false,
      claude: {},
      copilot: {},
    };
    const svc = {
      list: vi.fn(),
      create: vi.fn(() => preset),
      update: vi.fn(),
      delete: vi.fn(),
    };
    registerAiPresetHandlers(bridge as never, svc as never);
    const res = (await bridge.invoke({
      type: "ai:presets:create",
      preset,
    })) as { type: string };
    expect(res.type).toBe("ai:presets:created");
    expect(svc.create).toHaveBeenCalledWith(preset);
  });
});
```

- [ ] **Step 3: Run; verify fail**

Run: `pnpm --filter @magenta/daemon test aiPresetHandlers`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the handler**

```ts
// packages/daemon/src/ipc/handlers/aiPresetHandlers.ts
import type { IPCBridge } from "../IPCBridge";
import { safeHandle } from "../createHandler";
import type { AiPresetService } from "../../application/AiPresetService";

export function registerAiPresetHandlers(
  bridge: IPCBridge,
  service: AiPresetService,
): void {
  safeHandle(bridge, "ai:presets:list", async () => ({
    type: "ai:presets:listed" as const,
    presets: service.list(),
  }));

  safeHandle(bridge, "ai:presets:create", async (req) => ({
    type: "ai:presets:created" as const,
    preset: service.create(req.preset),
  }));

  safeHandle(bridge, "ai:presets:update", async (req) => {
    service.update(req.id, req.patch);
    return { type: "ai:presets:updated" as const, id: req.id };
  });

  safeHandle(bridge, "ai:presets:delete", async (req) => {
    service.delete(req.id);
    return { type: "ai:presets:deleted" as const, id: req.id };
  });
}
```

- [ ] **Step 5: Wire dependencies**

In `packages/daemon/src/composition/DaemonContainer.ts` add:

```ts
readonly aiPresetRepository = new AiPresetRepository(this.db);
readonly aiPresetService = new AiPresetService(this.aiPresetRepository);
```

In `packages/daemon/src/ipc/registerHandlers.ts`:

```ts
registerAiPresetHandlers(bridge, container.aiPresetService);
```

- [ ] **Step 6: Update renderer typings**

In `packages/ui/src/renderer/services/ipcClient.ts`, extend `ResponseForRequest`:

```ts
"ai:presets:list":   { type: "ai:presets:listed";   presets: AIPreset[] };
"ai:presets:create": { type: "ai:presets:created";  preset: AIPreset };
"ai:presets:update": { type: "ai:presets:updated";  id: string };
"ai:presets:delete": { type: "ai:presets:deleted";  id: string };
```

- [ ] **Step 7: Run; verify pass**

Run: `pnpm --filter @magenta/daemon test aiPresetHandlers && pnpm -w typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/ipc.ts \
        packages/daemon/src/ipc/handlers/aiPresetHandlers.ts \
        packages/daemon/src/ipc/handlers/aiPresetHandlers.test.ts \
        packages/daemon/src/ipc/registerHandlers.ts \
        packages/daemon/src/composition/DaemonContainer.ts \
        packages/ui/src/renderer/services/ipcClient.ts
git commit -m "feat(ipc): preset CRUD IPC (list/create/update/delete)"
```

---

## Task 7: `PermissionPromptCoordinator` + permission-response IPC

**Files:**
- Create: `packages/daemon/src/application/PermissionPromptCoordinator.ts`
- Create: `packages/daemon/src/application/PermissionPromptCoordinator.test.ts`
- Modify: `packages/shared/src/ipc.ts`
- Modify: `packages/daemon/src/ipc/handlers/aiSessionHandlers.ts` (add response handler)
- Modify: `packages/ui/src/renderer/services/ipcClient.ts`

- [ ] **Step 1: Extend IPC schemas**

In `packages/shared/src/ipc.ts`:

```ts
// request
z.object({
  type: z.literal("ai-session:permission-response"),
  sessionId: z.string(),
  requestId: z.string(),
  allow: z.boolean(),
  scope: z.enum(["once", "session", "always"]).optional(),
}),

// response
z.object({ type: z.literal("ai-session:permission-response-ack"), ok: z.boolean() }),

// push event (extend the existing push event union)
z.object({
  type: z.literal("ai-session:permission-request"),
  sessionId: z.string(),
  requestId: z.string(),
  tool: z.string(),
  scope: z.string(),
}),
```

- [ ] **Step 2: Write the failing coordinator test**

```ts
// packages/daemon/src/application/PermissionPromptCoordinator.test.ts
import { describe, it, expect, vi } from "vitest";
import { PermissionPromptCoordinator } from "./PermissionPromptCoordinator";
import { AppError } from "../errors/AppError";

const fakeBus = () => ({ emit: vi.fn() });

describe("PermissionPromptCoordinator", () => {
  it("emits permission-request and resolves on matching response", async () => {
    const bus = fakeBus();
    const c = new PermissionPromptCoordinator(bus as never, { timeoutMs: 1000 });
    const promise = c.requestApproval({
      sessionId: "s1",
      tool: "Bash",
      scope: "git push",
    });
    expect(bus.emit).toHaveBeenCalledWith(
      "ai-session:permission-request",
      expect.objectContaining({ sessionId: "s1", tool: "Bash" }),
    );
    const reqId = bus.emit.mock.calls[0][1].requestId;
    c.resolveResponse({ sessionId: "s1", requestId: reqId, allow: true });
    await expect(promise).resolves.toEqual({ allow: true, scope: undefined });
  });

  it("times out with PERMISSION_PROMPT_TIMEOUT", async () => {
    const c = new PermissionPromptCoordinator(fakeBus() as never, {
      timeoutMs: 5,
    });
    await expect(
      c.requestApproval({ sessionId: "s2", tool: "x", scope: "y" }),
    ).rejects.toMatchObject({ code: "PERMISSION_PROMPT_TIMEOUT" });
  });

  it("rejects when the session is closed before a response", async () => {
    const c = new PermissionPromptCoordinator(fakeBus() as never, {
      timeoutMs: 1000,
    });
    const p = c.requestApproval({ sessionId: "s3", tool: "x", scope: "y" });
    c.cancelSession("s3");
    await expect(p).rejects.toBeInstanceOf(AppError);
  });

  it("ignores responses for unknown requestIds", () => {
    const c = new PermissionPromptCoordinator(fakeBus() as never, {
      timeoutMs: 1000,
    });
    expect(() =>
      c.resolveResponse({ sessionId: "s4", requestId: "ghost", allow: true }),
    ).not.toThrow();
  });
});
```

- [ ] **Step 3: Run; verify fail**

Run: `pnpm --filter @magenta/daemon test PermissionPromptCoordinator`
Expected: FAIL.

- [ ] **Step 4: Implement the coordinator**

```ts
// packages/daemon/src/application/PermissionPromptCoordinator.ts
import { randomUUID } from "node:crypto";
import { AppError } from "../errors/AppError";

type PendingEntry = {
  sessionId: string;
  resolve: (r: { allow: boolean; scope?: "once" | "session" | "always" }) => void;
  reject: (e: unknown) => void;
  timer: NodeJS.Timeout;
};

export interface PermissionEventBus {
  emit(
    name: "ai-session:permission-request",
    payload: { sessionId: string; requestId: string; tool: string; scope: string },
  ): void;
}

export class PermissionPromptCoordinator {
  private readonly pending = new Map<string, PendingEntry>();
  private readonly timeoutMs: number;

  constructor(
    private readonly bus: PermissionEventBus,
    opts: { timeoutMs?: number } = {},
  ) {
    this.timeoutMs = opts.timeoutMs ?? 60_000;
  }

  requestApproval(args: {
    sessionId: string;
    tool: string;
    scope: string;
  }): Promise<{ allow: boolean; scope?: "once" | "session" | "always" }> {
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(
          new AppError(
            "PERMISSION_PROMPT_TIMEOUT",
            `Permission prompt for tool '${args.tool}' timed out`,
          ),
        );
      }, this.timeoutMs);
      this.pending.set(requestId, {
        sessionId: args.sessionId,
        resolve,
        reject,
        timer,
      });
      this.bus.emit("ai-session:permission-request", {
        sessionId: args.sessionId,
        requestId,
        tool: args.tool,
        scope: args.scope,
      });
    });
  }

  resolveResponse(r: {
    sessionId: string;
    requestId: string;
    allow: boolean;
    scope?: "once" | "session" | "always";
  }): void {
    const entry = this.pending.get(r.requestId);
    if (!entry || entry.sessionId !== r.sessionId) return;
    clearTimeout(entry.timer);
    this.pending.delete(r.requestId);
    entry.resolve({ allow: r.allow, scope: r.scope });
  }

  cancelSession(sessionId: string): void {
    for (const [reqId, entry] of this.pending) {
      if (entry.sessionId !== sessionId) continue;
      clearTimeout(entry.timer);
      entry.reject(
        new AppError(
          "PERMISSION_PROMPT_TIMEOUT",
          `Session ${sessionId} closed before permission was answered`,
        ),
      );
      this.pending.delete(reqId);
    }
  }
}
```

- [ ] **Step 5: Add the response IPC handler**

In `packages/daemon/src/ipc/handlers/aiSessionHandlers.ts`:

```ts
safeHandle(bridge, "ai-session:permission-response", async (req) => {
  permissionCoordinator.resolveResponse({
    sessionId: req.sessionId,
    requestId: req.requestId,
    allow: req.allow,
    scope: req.scope,
  });
  return { type: "ai-session:permission-response-ack" as const, ok: true };
});
```

(`permissionCoordinator` is injected through `registerHandlers.ts` from `DaemonContainer`.)

- [ ] **Step 6: Update renderer typings**

In `packages/ui/src/renderer/services/ipcClient.ts`:

```ts
"ai-session:permission-response": { type: "ai-session:permission-response-ack"; ok: boolean };
```

- [ ] **Step 7: Run; verify pass**

Run: `pnpm --filter @magenta/daemon test PermissionPromptCoordinator && pnpm -w typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/ipc.ts \
        packages/daemon/src/application/PermissionPromptCoordinator.ts \
        packages/daemon/src/application/PermissionPromptCoordinator.test.ts \
        packages/daemon/src/ipc/handlers/aiSessionHandlers.ts \
        packages/ui/src/renderer/services/ipcClient.ts
git commit -m "feat(daemon): permission prompt coordinator + ai-session:permission-response IPC"
```

---

## Task 8: `PermissionPromptMcpServer` (stdio MCP bridge)

**Files:**
- Create: `packages/daemon/src/infrastructure/PermissionPromptMcpServer.ts`
- Create: `packages/daemon/src/infrastructure/PermissionPromptMcpServer.test.ts`
- Modify: `packages/daemon/src/composition/DaemonContainer.ts`

- [ ] **Step 1: Write the failing server test**

```ts
// packages/daemon/src/infrastructure/PermissionPromptMcpServer.test.ts
import { describe, it, expect, vi } from "vitest";
import { PermissionPromptMcpServer } from "./PermissionPromptMcpServer";
import { PermissionPromptCoordinator } from "../application/PermissionPromptCoordinator";

describe("PermissionPromptMcpServer", () => {
  it("exposes a single 'approve' tool in its capability listing", () => {
    const coord = new PermissionPromptCoordinator(
      { emit: vi.fn() } as never,
      { timeoutMs: 1000 },
    );
    const server = new PermissionPromptMcpServer(coord);
    const tools = server.listTools();
    expect(tools.map((t) => t.name)).toEqual(["approve"]);
    expect(tools[0].inputSchema).toMatchObject({ type: "object" });
  });

  it("calling 'approve' delegates to the coordinator and resolves with its decision", async () => {
    const bus = { emit: vi.fn() };
    const coord = new PermissionPromptCoordinator(bus as never, {
      timeoutMs: 1000,
    });
    const server = new PermissionPromptMcpServer(coord);
    const callPromise = server.callTool("approve", {
      sessionId: "s1",
      tool_name: "Bash",
      input: { command: "git push" },
    });
    // event bus saw the request
    expect(bus.emit).toHaveBeenCalledTimes(1);
    const reqId = bus.emit.mock.calls[0][1].requestId;
    coord.resolveResponse({
      sessionId: "s1",
      requestId: reqId,
      allow: true,
      scope: "session",
    });
    const result = await callPromise;
    expect(result).toEqual({ behavior: "allow", updatedInput: { command: "git push" } });
  });

  it("returns deny payload when the user denies", async () => {
    const coord = new PermissionPromptCoordinator(
      { emit: vi.fn() } as never,
      { timeoutMs: 1000 },
    );
    const server = new PermissionPromptMcpServer(coord);
    const p = server.callTool("approve", {
      sessionId: "s2",
      tool_name: "Bash",
      input: {},
    });
    // pluck request id
    const reqId = (server as unknown as { lastRequestId: string }).lastRequestId;
    coord.resolveResponse({ sessionId: "s2", requestId: reqId, allow: false });
    await expect(p).resolves.toMatchObject({ behavior: "deny" });
  });
});
```

- [ ] **Step 2: Run; verify fail**

Run: `pnpm --filter @magenta/daemon test PermissionPromptMcpServer`
Expected: FAIL.

- [ ] **Step 3: Implement the server**

```ts
// packages/daemon/src/infrastructure/PermissionPromptMcpServer.ts
import type { PermissionPromptCoordinator } from "../application/PermissionPromptCoordinator";

/**
 * In-process MCP server that exposes a single `approve` tool. Claude calls
 * this whenever it needs human approval for an otherwise un-allowed action;
 * we translate that into an IPC push event and await the renderer's response.
 *
 * The MCP wire protocol is mounted in DaemonContainer via the existing
 * @modelcontextprotocol/sdk stdio transport. This class owns the tool
 * surface; the transport is responsible for JSON-RPC framing.
 *
 * The coordinator generates the requestId; we expose it on the instance for
 * tests (and future logging) via `lastRequestId`.
 */
export interface ApproveResult {
  behavior: "allow" | "deny";
  updatedInput?: Record<string, unknown>;
  message?: string;
}

export class PermissionPromptMcpServer {
  lastRequestId: string | undefined;

  constructor(private readonly coord: PermissionPromptCoordinator) {}

  listTools() {
    return [
      {
        name: "approve",
        description:
          "Ask the human in Magenta whether to allow a tool invocation.",
        inputSchema: {
          type: "object",
          properties: {
            sessionId: { type: "string" },
            tool_name: { type: "string" },
            input: { type: "object" },
          },
          required: ["sessionId", "tool_name", "input"],
        },
      },
    ];
  }

  async callTool(
    name: string,
    args: { sessionId: string; tool_name: string; input: Record<string, unknown> },
  ): Promise<ApproveResult> {
    if (name !== "approve") {
      return { behavior: "deny", message: `unknown tool: ${name}` };
    }
    // The coordinator generates the requestId internally; we lift it through
    // a small shim by wrapping its bus emit.
    const original = (this.coord as unknown as { bus: { emit: (...a: unknown[]) => void } }).bus.emit;
    let captured: string | undefined;
    (this.coord as unknown as { bus: { emit: (...a: unknown[]) => void } }).bus.emit = (
      type: unknown,
      payload: unknown,
    ) => {
      const p = payload as { requestId: string };
      captured = p.requestId;
      this.lastRequestId = p.requestId;
      return original(type, payload);
    };
    try {
      const decision = await this.coord.requestApproval({
        sessionId: args.sessionId,
        tool: args.tool_name,
        scope: JSON.stringify(args.input).slice(0, 200),
      });
      return decision.allow
        ? { behavior: "allow", updatedInput: args.input }
        : { behavior: "deny", message: "denied by user" };
    } finally {
      (this.coord as unknown as { bus: { emit: (...a: unknown[]) => void } }).bus.emit = original;
      void captured;
    }
  }
}
```

- [ ] **Step 4: Wire into composition root**

In `DaemonContainer.ts`:

```ts
readonly permissionCoordinator = new PermissionPromptCoordinator(this.eventBus);
readonly permissionPromptMcp = new PermissionPromptMcpServer(this.permissionCoordinator);
```

(`eventBus` is the existing daemon→renderer push channel.)

- [ ] **Step 5: Run; verify pass**

Run: `pnpm --filter @magenta/daemon test PermissionPromptMcpServer`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/daemon/src/infrastructure/PermissionPromptMcpServer.ts \
        packages/daemon/src/infrastructure/PermissionPromptMcpServer.test.ts \
        packages/daemon/src/composition/DaemonContainer.ts
git commit -m "feat(daemon): in-process MCP server bridging Claude permission prompts"
```

---

## Task 9: Wire `allowedTools` / `disallowedTools` / `presetId` / `permissionPromptTool` / `noAskUser` into `ai-session:create`

**Files:**
- Modify: `packages/shared/src/ipc.ts`
- Modify: `packages/daemon/src/ipc/handlers/aiSessionHandlers.ts`
- Modify: `packages/daemon/src/application/AiSessionAppService.ts` (or whichever app service owns create)
- Create: `packages/daemon/src/application/AiSessionAppService.preset.test.ts`

- [ ] **Step 1: Extend `ai-session:create` schema**

In `packages/shared/src/ipc.ts`, replace the existing `ai-session:create` request variant with:

```ts
z.object({
  type: z.literal("ai-session:create"),
  provider: z.enum(AI_PROVIDERS),
  repoPath: z.string().optional(),
  branch: z.string().optional(),
  worktreePath: z.string().optional(),
  permissionMode: z.enum(AI_PERMISSION_MODES).optional(),
  providerSessionId: z.string().optional(),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
  // NEW — Phase 4
  allowedTools: z.array(z.string()).optional(),
  disallowedTools: z.array(z.string()).optional(),
  presetId: z.string().optional(),
  permissionPromptTool: z.string().optional(),
  // Programmatic-only; ignored for interactive PTY sessions.
  noAskUser: z.boolean().optional(),
  programmatic: z.boolean().optional(),
}),
```

- [ ] **Step 2: Write the failing app-service test**

```ts
// packages/daemon/src/application/AiSessionAppService.preset.test.ts
import { describe, it, expect, vi } from "vitest";
import { AiSessionAppService } from "./AiSessionAppService";
import { AppError } from "../errors/AppError";

const baseDeps = () => ({
  presetService: {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    resolveForProvider: vi.fn(() => ({
      allowedTools: ["Read", "Grep"],
      disallowedTools: ["WebFetch"],
      permissionMode: "plan" as const,
    })),
  },
  sessionFactory: { spawn: vi.fn(async () => ({ id: "sess-1" })) },
  permissionCoordinator: { cancelSession: vi.fn() },
  // ...other deps stubbed
});

describe("AiSessionAppService.create — Phase 4 wiring", () => {
  it("merges resolved preset into spawn options before spawning", async () => {
    const deps = baseDeps();
    const svc = new AiSessionAppService(deps as never);
    await svc.create({
      provider: "claude",
      cols: 80,
      rows: 24,
      presetId: "read-only-review",
    } as never);
    expect(deps.presetService.resolveForProvider).toHaveBeenCalledWith(
      "read-only-review",
      "claude",
    );
    const spawned = deps.sessionFactory.spawn.mock.calls[0][0];
    expect(spawned.spawn.allowedTools).toEqual(["Read", "Grep"]);
    expect(spawned.spawn.disallowedTools).toEqual(["WebFetch"]);
  });

  it("explicit allowedTools override preset", async () => {
    const deps = baseDeps();
    const svc = new AiSessionAppService(deps as never);
    await svc.create({
      provider: "claude",
      cols: 80,
      rows: 24,
      presetId: "read-only-review",
      allowedTools: ["Read"],
    } as never);
    const spawned = deps.sessionFactory.spawn.mock.calls[0][0];
    expect(spawned.spawn.allowedTools).toEqual(["Read"]);
  });

  it("auto-injects permission MCP into mcpConfig when permissionPromptTool is set", async () => {
    const deps = baseDeps();
    const svc = new AiSessionAppService(deps as never);
    await svc.create({
      provider: "claude",
      cols: 80,
      rows: 24,
      permissionPromptTool: "mcp__magenta__approve",
    } as never);
    const spawned = deps.sessionFactory.spawn.mock.calls[0][0];
    expect(spawned.spawn.mcpConfig).toBeDefined();
    expect(spawned.spawn.permissionPromptTool).toBe("mcp__magenta__approve");
  });

  it("drops noAskUser for non-programmatic (interactive) sessions", async () => {
    const deps = baseDeps();
    const svc = new AiSessionAppService(deps as never);
    await svc.create({
      provider: "copilot",
      cols: 80,
      rows: 24,
      noAskUser: true,
      programmatic: false,
    } as never);
    const spawned = deps.sessionFactory.spawn.mock.calls[0][0];
    expect(spawned.spawn.noAskUser).toBeUndefined();
  });

  it("keeps noAskUser when programmatic === true", async () => {
    const deps = baseDeps();
    const svc = new AiSessionAppService(deps as never);
    await svc.create({
      provider: "copilot",
      cols: 80,
      rows: 24,
      noAskUser: true,
      programmatic: true,
    } as never);
    const spawned = deps.sessionFactory.spawn.mock.calls[0][0];
    expect(spawned.spawn.noAskUser).toBe(true);
  });

  it("AC-3: jsonSchema on copilot surfaces UNSUPPORTED_SPAWN_OPTION already, so permissionPromptTool on copilot does the same", async () => {
    const deps = baseDeps();
    const svc = new AiSessionAppService(deps as never);
    await expect(
      svc.create({
        provider: "copilot",
        cols: 80,
        rows: 24,
        permissionPromptTool: "x",
      } as never),
    ).rejects.toBeInstanceOf(AppError);
  });
});
```

- [ ] **Step 3: Run; verify fail**

Run: `pnpm --filter @magenta/daemon test AiSessionAppService.preset`
Expected: FAIL — branches not implemented.

- [ ] **Step 4: Update the app service**

Inside `AiSessionAppService.create`, replace the spawn-options assembly with:

```ts
async create(req: CreateSessionRequest): Promise<AISessionRecord> {
  // Start from any explicit fields the caller passed
  let spawn: AISpawnOptions = {
    permissionMode: req.permissionMode,
    allowedTools: req.allowedTools,
    disallowedTools: req.disallowedTools,
    permissionPromptTool: req.permissionPromptTool,
    noAskUser: req.programmatic ? req.noAskUser : undefined,
  };

  // Layer preset under explicit fields
  if (req.presetId) {
    const preset = this.deps.presetService.resolveForProvider(
      req.presetId,
      req.provider,
    );
    spawn = { ...preset, ...stripUndefined(spawn) };
  }

  // Auto-register permission-prompt MCP if requested
  if (spawn.permissionPromptTool) {
    if (!getProviderCapability(req.provider).supports.permissionPromptTool) {
      throw new AppError(
        "UNSUPPORTED_SPAWN_OPTION",
        `${req.provider} does not support permissionPromptTool`,
      );
    }
    spawn.mcpConfig = mergeMcp(spawn.mcpConfig, {
      mcpServers: {
        magenta_permission: {
          command: process.execPath,
          args: [this.deps.paths.permissionMcpEntry],
          env: { MAGENTA_DAEMON_SOCKET: this.deps.paths.daemonSocket },
        },
      },
    });
  }

  return this.deps.sessionFactory.spawn({
    provider: req.provider,
    repoPath: req.repoPath,
    worktreePath: req.worktreePath,
    cols: req.cols,
    rows: req.rows,
    spawn,
  });
}
```

`stripUndefined` and `mergeMcp` are private helpers added in the same file.

- [ ] **Step 5: Update the IPC handler**

In `aiSessionHandlers.ts`, the existing thin handler keeps shape; just thread the new fields through verbatim:

```ts
safeHandle(bridge, "ai-session:create", async (req) =>
  appService.create(req),
);
```

- [ ] **Step 6: Run; verify pass**

Run: `pnpm --filter @magenta/daemon test AiSessionAppService`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/ipc.ts \
        packages/daemon/src/ipc/handlers/aiSessionHandlers.ts \
        packages/daemon/src/application/AiSessionAppService.ts \
        packages/daemon/src/application/AiSessionAppService.preset.test.ts
git commit -m "feat(daemon): thread allowedTools/disallowedTools/preset/permission MCP through ai-session:create"
```

---

## Task 10: Renderer — preset store + create-dialog dropdown

**Files:**
- Create: `packages/ui/src/renderer/stores/aiPresetStore.ts`
- Create: `packages/ui/src/renderer/stores/aiPresetStore.test.ts`
- Modify: `packages/ui/src/renderer/components/sessions/CreateAISessionDialog.tsx` (or whichever component owns the dialog)

- [ ] **Step 1: Write the failing store test**

```ts
// packages/ui/src/renderer/stores/aiPresetStore.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAiPresetStore } from "./aiPresetStore";

vi.mock("../services/ipcClient", () => ({
  sendOrThrow: vi.fn(async (req: { type: string }) => {
    if (req.type === "ai:presets:list") {
      return {
        type: "ai:presets:listed",
        presets: [
          {
            id: "read-only-review",
            name: "Read-only review",
            builtin: true,
            claude: {},
            copilot: {},
          },
        ],
      };
    }
    throw new Error("unexpected " + req.type);
  }),
}));

beforeEach(() => useAiPresetStore.setState({ presets: [], loading: false }));

describe("aiPresetStore", () => {
  it("loadAll fills the presets array", async () => {
    await useAiPresetStore.getState().loadAll();
    expect(useAiPresetStore.getState().presets).toHaveLength(1);
    expect(useAiPresetStore.getState().presets[0].id).toBe("read-only-review");
  });
});
```

- [ ] **Step 2: Run; verify fail**

Run: `pnpm --filter @magenta/ui test aiPresetStore`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the store**

```ts
// packages/ui/src/renderer/stores/aiPresetStore.ts
import { create } from "zustand";
import type { AIPreset } from "@magenta/shared";
import { sendOrThrow } from "../services/ipcClient";

type State = {
  presets: AIPreset[];
  loading: boolean;
  loadAll: () => Promise<void>;
  create: (p: AIPreset) => Promise<void>;
  update: (id: string, patch: Partial<AIPreset>) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

export const useAiPresetStore = create<State>((set, get) => ({
  presets: [],
  loading: false,
  async loadAll() {
    set({ loading: true });
    const res = await sendOrThrow({ type: "ai:presets:list" });
    set({ presets: res.presets, loading: false });
  },
  async create(p) {
    await sendOrThrow({ type: "ai:presets:create", preset: p });
    await get().loadAll();
  },
  async update(id, patch) {
    await sendOrThrow({ type: "ai:presets:update", id, patch });
    await get().loadAll();
  },
  async remove(id) {
    await sendOrThrow({ type: "ai:presets:delete", id });
    await get().loadAll();
  },
}));
```

- [ ] **Step 4: Add the dropdown to the create-session dialog**

In `CreateAISessionDialog.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useAiPresetStore } from "@/renderer/stores/aiPresetStore";

// inside the component:
const { presets, loadAll } = useAiPresetStore();
const [presetId, setPresetId] = useState<string | undefined>(undefined);

useEffect(() => {
  if (presets.length === 0) void loadAll();
}, [presets.length, loadAll]);

// in the form JSX, near the permission-mode field:
<label className="flex flex-col gap-1">
  <span className="text-sm">Tool preset</span>
  <select
    className="rounded border px-2 py-1"
    value={presetId ?? ""}
    onChange={(e) => {
      const id = e.target.value || undefined;
      setPresetId(id);
      if (id) {
        const p = presets.find((x) => x.id === id);
        const side = provider === "claude" ? p?.claude : p?.copilot;
        setAllowedTools(side?.allowedTools ?? []);
        setDisallowedTools(side?.disallowedTools ?? []);
        if (side?.permissionMode) setPermissionMode(side.permissionMode);
      }
    }}
  >
    <option value="">(none)</option>
    {presets.map((p) => (
      <option key={p.id} value={p.id}>
        {p.name}
        {p.builtin ? " (built-in)" : ""}
      </option>
    ))}
  </select>
</label>;
```

When the dialog submits, include `presetId`, `allowedTools`, `disallowedTools` on the `ai-session:create` request.

- [ ] **Step 5: Run; verify pass**

Run: `pnpm --filter @magenta/ui test aiPresetStore`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/renderer/stores/aiPresetStore.ts \
        packages/ui/src/renderer/stores/aiPresetStore.test.ts \
        packages/ui/src/renderer/components/sessions/CreateAISessionDialog.tsx
git commit -m "feat(ui): tool preset dropdown on session-create dialog"
```

---

## Task 11: Final verification — repository-wide

- [ ] **Step 1: Confirm no handler bypasses Application Services**

Run: `rtk grep -n "presetRepository\." packages/daemon/src/ipc/handlers/`
Expected: zero hits — handlers must go through `AiPresetService`.

- [ ] **Step 2: Workspace typecheck**

Run: `pnpm -w typecheck`
Expected: All 5 packages clean.

- [ ] **Step 3: Workspace build**

Run: `pnpm -w build`
Expected: All packages build.

- [ ] **Step 4: Workspace tests**

Run: `pnpm -w test`
Expected: All tests pass; new tests from Tasks 1–10 included.

- [ ] **Step 5: Stop here per `feedback_verification.md`**

Do not launch the app. Report:

> Phase 4 done. `ai-session:create` accepts `allowedTools` / `disallowedTools` / `presetId` / `permissionPromptTool` / `noAskUser` (programmatic-only); 4 built-in presets ship with both-provider tool lists; preset CRUD IPC backed by migration 17; `PermissionPromptMcpServer` auto-mounts when `permissionPromptTool` is set, bridging Claude's prompts to `ai-session:permission-request` events. Steven verifies manually before Phase 5.

---

## Spec coverage check (self-review)

| Spec requirement | Covered by |
|---|---|
| Plan §4 Phase 4 — wire allow/disallow tools through IPC | Task 9 |
| Plan §4 Phase 4 — built-in tool presets (≥4) | Task 2 |
| Plan §4 Phase 4 — Copilot pattern translator | Task 1 |
| Plan §4 Phase 4 — `--permission-prompt-tool` MCP bridge | Tasks 7, 8, 9 |
| Plan §4 Phase 4 — Copilot `--no-ask-user` programmatic-only | Task 9 (test "drops noAskUser for non-programmatic", "keeps noAskUser when programmatic") |
| Plan §5 Migration 17 — `ai_task_presets` table | Task 4 |
| Spec §6.3 FR-3.3 — ≥4 built-in presets per provider | Task 2 |
| Spec §6.8 FR-8.1 — `allowedTools`, `disallowedTools`, `permissionMode`, `allowUrls` accepted by every session-creating IPC | Task 9 (Phase 1 already covered the schema; this phase widens IPC) |
| Spec §6.8 FR-8.2 — permission prompt MCP server + push/response IPC | Tasks 7, 8 |
| Spec §6.8 FR-8.3 — round-trip translator unit test for built-in presets | Tasks 1, 3 |
| Spec §8.4 — preset CRUD IPC `ai:presets:list \| create \| update \| delete` | Task 6 |
| Spec §8.5 — `ai-session:permission-request` push event | Task 7 |
| Spec AC-3 — jsonSchema-style `UNSUPPORTED_SPAWN_OPTION` for incompatible options | Task 9 (test "permissionPromptTool on copilot") |
| Spec AC-8 — Claude permission prompt opens a typed dialog hook | Tasks 7, 8 (protocol; the actual dialog is renderer follow-up) |
| Spec AC-9 — `read-only-review` snapshot test on `toArgv` | Task 3 (`renderPresetForProvider` snapshot) + Phase 1's `toArgv` snapshot infra |

**Out-of-scope deferrals** (covered by later phase plans):
- Renderer permission-approval modal UI — follow-up after Phase 4 (Phase 4 ships the IPC protocol; AC-8's "modal dialog appears" is a separate UI task).
- `ai:run-once` IPC variant carrying the same `allowedTools` / `presetId` fields → Phase 2.
- Session-id round-trip (`--session-id`) → Phase 5.
- `--agents` / `--plugin-dir` and Copilot built-in agents → Phase 6.
- Token / cost / retry observability → Phase 7.
