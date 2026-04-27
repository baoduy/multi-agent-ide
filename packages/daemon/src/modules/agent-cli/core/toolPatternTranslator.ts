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
