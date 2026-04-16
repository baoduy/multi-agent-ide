import type { Repository } from "@magenta/shared/models";

import type { TagTone } from "../components/common/Tag";

export interface BadgeInfo {
  label: string;
  /** Tone for the unified `Tag` primitive. Maps to the repo-badge palette. */
  tone: TagTone;
}

export function getRepoBadge(repo: Repository): BadgeInfo {
  if (repo.status === "missing") {
    return { label: "missing", tone: "missing" };
  }
  if (repo.hasSpecs) {
    return { label: "spec", tone: "spec" };
  }
  if (repo.status === "active") {
    return { label: "active", tone: "active" };
  }
  // `default` repo-badge palette has no dedicated tone — fall back to
  // "neutral" so any future Repository.status variant still renders.
  return { label: repo.status, tone: "neutral" };
}
