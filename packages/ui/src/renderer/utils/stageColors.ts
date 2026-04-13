import type { StageStatus } from "@magenta/shared/constants";

/**
 * Shared stage-status color mapping.
 * Used by both the sidebar StageDots and the main SpecsListView
 * to ensure consistent visual language.
 */
export function stageStatusColor(status: StageStatus): { bg: string; fg: string; dot: string; borderMuted: string } {
  // Unified palette:
  //   Pending / missing / idle → Blue
  //   Review / draft / running / in-progress → Yellow / Amber
  //   Approved / done → Green
  switch (status) {
    case "missing":
    case "pending":
    case "idle":
      return { bg: "#dbeafe", fg: "#1e40af", dot: "#3b82f6", borderMuted: "#93c5fd" };
    case "draft":
    case "review":
    case "running":
    case "in-progress":
      return { bg: "#fef3c7", fg: "#92400e", dot: "#f59e0b", borderMuted: "#fcd34d" };
    case "approved":
    case "done":
      return { bg: "#dcfce7", fg: "#166534", dot: "#16a34a", borderMuted: "#86efac" };
    default:
      return { bg: "#f3f4f6", fg: "#6b6560", dot: "#d1cec6", borderMuted: "#d1d5db" };
  }
}
