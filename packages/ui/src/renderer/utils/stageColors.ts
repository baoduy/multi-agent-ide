import type { StageStatus } from "@magenta/shared/constants";
import { colors } from "./colors";

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
      return { bg: colors.stagePendingBg, fg: colors.stagePendingFg, dot: colors.stagePendingDot, borderMuted: colors.stagePendingBorderMuted };
    case "draft":
    case "review":
    case "running":
    case "in-progress":
      return { bg: colors.stageReviewBg, fg: colors.stageReviewFg, dot: colors.stageReviewDot, borderMuted: colors.stageReviewBorderMuted };
    case "approved":
    case "done":
      return { bg: colors.stageApprovedBg, fg: colors.stageApprovedFg, dot: colors.stageApprovedDot, borderMuted: colors.stageApprovedBorderMuted };
    default:
      return { bg: colors.stageDefaultBg, fg: colors.stageDefaultFg, dot: colors.stageDefaultDot, borderMuted: colors.stageDefaultBorderMuted };
  }
}
