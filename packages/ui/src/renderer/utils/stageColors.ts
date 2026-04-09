import type { StageStatus } from "@magenta/shared/constants";

/**
 * Shared stage-status color mapping.
 * Used by both the sidebar StageDots and the main SpecsListView
 * to ensure consistent visual language.
 */
export function stageStatusColor(status: StageStatus): { bg: string; fg: string; dot: string } {
  switch (status) {
    case "missing":
      return { bg: "#f3f4f6", fg: "#9a958c", dot: "#d1cec6" };
    case "draft":
      return { bg: "#fef3c7", fg: "#92400e", dot: "#f59e0b" };
    case "review":
      return { bg: "#dbeafe", fg: "#1e40af", dot: "#3b82f6" };
    case "approved":
      return { bg: "#dcfce7", fg: "#166534", dot: "#16a34a" };
    case "idle":
      return { bg: "#f0fdf4", fg: "#15803d", dot: "#86efac" };
    case "running":
      return { bg: "#fef3c7", fg: "#78350f", dot: "#f59e0b" };
    default:
      return { bg: "#f3f4f6", fg: "#6b6560", dot: "#d1cec6" };
  }
}
