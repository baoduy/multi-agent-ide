/**
 * mockData — hardcoded sample Extensions data for the mockup phase.
 *
 * Phase 1 (this file) ships fake data so the UI can be built + reviewed
 * without wiring the daemon. Phase 2 will replace these reads with IPC
 * calls into an ExtensionsGateway that reads the real files on disk.
 *
 * Shape mirrors the future shared `ExtensionItem` so the Phase 2 swap
 * touches only the data source, not the components.
 */

export type ExtensionScope = "user" | "repo";
export type ExtensionCategory = "plugins" | "skills" | "agents" | "mcp";

export type ExtensionItem = {
  /** Stable id unique within (scope, category) — `${name}@${marketplace}` for plugins, slug for others */
  id: string;
  /** Human-readable name shown in the row */
  name: string;
  /** Version string (plugins only; undefined for skills/agents/mcp) */
  version?: string;
  /** Location on disk (or `<file>#<key>` for MCP entries inside a shared json) */
  path: string;
  /** Whether the user has enabled this item */
  enabled: boolean;
  /** One-line secondary text rendered under the name (e.g. "78 skills · 3 agents · 1 mcp") */
  subtitle?: string;
  /** Long-form description surfaced in the Inspector panel */
  description?: string;
  /** Aggregate counts for plugin rows — drives the summary totals */
  meta?: {
    skills?: number;
    agents?: number;
    mcp?: number;
  };
};

/** Key shape: `${scope}:${category}` */
type MockKey = `${ExtensionScope}:${ExtensionCategory}`;

export const MOCK: Record<MockKey, ExtensionItem[]> = {
  "user:plugins": [
    {
      id: "superpowers@official",
      name: "superpowers",
      version: "5.0.7",
      path: "~/.claude/plugins/cache/claude-plugins-official/superpowers/5.0.7",
      enabled: true,
      subtitle: "78 skills · 3 agents · 1 mcp",
      description:
        "Curated bundle of process skills (brainstorming, TDD, debugging, code review) and engineering subagents.",
      meta: { skills: 78, agents: 3, mcp: 1 },
    },
    {
      id: "claude-mem@official",
      name: "claude-mem",
      version: "1.2.0",
      path: "~/.claude/plugins/cache/claude-plugins-official/claude-mem/1.2.0",
      enabled: true,
      subtitle: "12 skills · 1 mcp",
      description: "Cross-session memory: observations, timeline reports, semantic search over past work.",
      meta: { skills: 12, mcp: 1 },
    },
    {
      id: "claude-plugins-community@official",
      name: "claude-plugins-community",
      version: "0.3.1",
      path: "~/.claude/plugins/cache/claude-plugins-official/community/0.3.1",
      enabled: false,
      subtitle: "disabled",
      description: "Community-contributed plugin index. Disable to hide its marketplace entries.",
      meta: { skills: 0 },
    },
  ],
  "user:skills": [
    {
      id: "brainstorming",
      name: "brainstorming",
      path: "~/.claude/plugins/cache/claude-plugins-official/superpowers/5.0.7/skills/brainstorming/SKILL.md",
      enabled: true,
      subtitle: "Explore intent, requirements and design before implementation",
    },
    {
      id: "debugging",
      name: "systematic-debugging",
      path: "~/.claude/plugins/cache/…/superpowers/5.0.7/skills/systematic-debugging/SKILL.md",
      enabled: true,
      subtitle: "Reproduce · isolate · diagnose · fix",
    },
    {
      id: "tdd",
      name: "test-driven-development",
      path: "~/.claude/plugins/cache/…/superpowers/5.0.7/skills/test-driven-development/SKILL.md",
      enabled: true,
      subtitle: "Red · Green · Refactor discipline",
    },
    {
      id: "mem-search",
      name: "mem-search",
      path: "~/.claude/plugins/cache/…/claude-mem/1.2.0/skills/mem-search/SKILL.md",
      enabled: true,
      subtitle: "Semantic search over past sessions",
    },
    {
      id: "make-plan",
      name: "make-plan",
      path: "~/.claude/plugins/cache/…/claude-mem/1.2.0/skills/make-plan/SKILL.md",
      enabled: true,
      subtitle: "Phased implementation plan with documentation discovery",
    },
    {
      id: "verification",
      name: "verification-before-completion",
      path: "~/.claude/plugins/cache/…/superpowers/5.0.7/skills/verification-before-completion/SKILL.md",
      enabled: true,
      subtitle: "Evidence before assertions — always",
    },
  ],
  "user:agents": [
    {
      id: "code-reviewer",
      name: "code-reviewer",
      path: "~/.claude/plugins/cache/…/superpowers/5.0.7/agents/code-reviewer.md",
      enabled: true,
      subtitle: "Review completed work against the original plan + coding standards",
    },
    {
      id: "explore",
      name: "Explore",
      path: "~/.claude/plugins/cache/…/superpowers/5.0.7/agents/explore.md",
      enabled: true,
      subtitle: "Fast codebase exploration agent (read-only)",
    },
    {
      id: "plan",
      name: "Plan",
      path: "~/.claude/plugins/cache/…/superpowers/5.0.7/agents/plan.md",
      enabled: true,
      subtitle: "Software-architect agent that drafts implementation plans",
    },
  ],
  "user:mcp": [
    {
      id: "shadcn",
      name: "shadcn",
      path: "~/.claude.json#mcpServers.shadcn",
      enabled: true,
      subtitle: "stdio · npx shadcn@latest mcp",
    },
    {
      id: "claude-mem-search",
      name: "claude-mem-search",
      path: "~/.claude.json#mcpServers.claude-mem-search",
      enabled: true,
      subtitle: "stdio · local claude-mem binary",
    },
  ],
  // Repo scope has no plugins by design (Claude plugins only live under ~/.claude/plugins/).
  "repo:plugins": [],
  "repo:skills": [
    {
      id: "playwright-debug",
      name: "playwright-debug",
      path: ".claude/skills/playwright-debug/SKILL.md",
      enabled: true,
      subtitle: "Drive this app via Playwright for UI debugging",
    },
    {
      id: "shadcn-repo",
      name: "shadcn",
      path: ".claude/skills/shadcn (symlink)",
      enabled: true,
      subtitle: "Symlinked from .agents/skills/shadcn",
    },
    {
      id: "tailwind-v4-shadcn",
      name: "tailwind-v4-shadcn",
      path: ".agents/skills/tailwind-v4-shadcn/SKILL.md",
      enabled: true,
      subtitle: "Tailwind v4 + shadcn patterns for this repo",
    },
  ],
  "repo:agents": [],
  "repo:mcp": [
    {
      id: "shadcn",
      name: "shadcn",
      path: ".mcp.json#shadcn",
      enabled: true,
      subtitle: "stdio · npx shadcn@latest mcp",
    },
    {
      id: "playwright",
      name: "playwright",
      path: ".mcp.json#playwright",
      enabled: true,
      subtitle: "stdio · npx @playwright/mcp@latest",
    },
  ],
};

export const ALL_CATEGORIES: ExtensionCategory[] = ["plugins", "skills", "agents", "mcp"];

export function categoriesForScope(scope: ExtensionScope): ExtensionCategory[] {
  return scope === "user" ? ALL_CATEGORIES : ["skills", "agents", "mcp"];
}

export function mockKey(scope: ExtensionScope, category: ExtensionCategory): MockKey {
  return `${scope}:${category}` as MockKey;
}
