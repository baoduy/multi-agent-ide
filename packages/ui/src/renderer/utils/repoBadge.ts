import type { Repository } from "@magenta/shared/models";

export interface BadgeInfo {
  label: string;
  bg: string;
  color: string;
}

export function getRepoBadge(repo: Repository): BadgeInfo {
  if (repo.status === "missing") {
    return { label: "missing", bg: "#fae8e1", color: "#a14a2f" };
  }
  if (repo.hasSpecs) {
    return { label: "spec", bg: "#e8e5f5", color: "#6b5ebd" };
  }
  if (repo.status === "active") {
    return { label: "active", bg: "#e4f0df", color: "#3d7a2a" };
  }
  return { label: repo.status, bg: "#eeece6", color: "#6b6560" };
}
