import type { Repository } from "@magenta/shared/models";
import { colors } from "./colors";

export interface BadgeInfo {
  label: string;
  bg: string;
  color: string;
}

export function getRepoBadge(repo: Repository): BadgeInfo {
  if (repo.status === "missing") {
    return { label: "missing", bg: colors.repoBadgeMissingBg, color: colors.repoBadgeMissingFg };
  }
  if (repo.hasSpecs) {
    return { label: "spec", bg: colors.repoBadgeSpecBg, color: colors.repoBadgeSpecFg };
  }
  if (repo.status === "active") {
    return { label: "active", bg: colors.repoBadgeActiveBg, color: colors.repoBadgeActiveFg };
  }
  return { label: repo.status, bg: colors.repoBadgeDefaultBg, color: colors.repoBadgeDefaultFg };
}
