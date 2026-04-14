/**
 * Tab types — shared between old and new layout systems.
 *
 * These were originally in components/main/TabBar.tsx.
 * Extracted here so they can be imported without depending on the old TabBar component.
 */

export type BuiltinTabId = "specs" | "worktrees" | "workflow" | "ai";

export type OpenFileTab = {
  filePath: string;
  fileName: string;
};

export type ActiveTab =
  | { kind: "builtin"; id: BuiltinTabId }
  | { kind: "file"; filePath: string };
