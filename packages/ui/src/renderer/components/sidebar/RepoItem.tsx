import React from "react";

import type { Repository } from "@magenta/shared/models";

type RepoItemProps = {
  repo: Repository;
  active: boolean;
  onSelect: (repoPath: string) => void;
};

interface BadgeInfo {
  label: string;
  bg: string;
  color: string;
}

function getRepoBadge(repo: Repository): BadgeInfo {
  if (repo.status === "missing") {
    return { label: "missing", bg: "#fef2f2", color: "#c93c37" };
  }
  if (repo.specCount > 0 && repo.hasSpecs) {
    return { label: "spec", bg: "#f0f0ff", color: "#5b57d1" };
  }
  if (repo.status === "active") {
    return { label: "active", bg: "#f0faf0", color: "#1a7f37" };
  }
  return { label: repo.status, bg: "#f4f4f6", color: "#6b6b76" };
}

export function RepoItem({ repo, active, onSelect }: RepoItemProps): React.ReactElement {
  const badge = getRepoBadge(repo);

  return (
    <button
      type="button"
      onClick={() => onSelect(repo.path)}
      style={{
        width: "100%",
        textAlign: "left",
        border: "none",
        borderLeft: active ? "2px solid #5b57d1" : "2px solid transparent",
        background: active ? "#f0f0ff" : "transparent",
        padding: "9px 16px 9px 14px",
        cursor: "pointer",
        display: "block",
        transition: "background 0.12s",
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "#f4f4f6";
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = "transparent";
      }}
    >
      <div style={{ fontWeight: 500, fontSize: 13, color: "#1e1e2e", lineHeight: 1.4 }}>
        {repo.name}
      </div>
      <div
        style={{
          fontSize: 11,
          color: "#8b8b96",
          marginTop: 3,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span
          style={{
            display: "inline-block",
            padding: "1px 6px",
            borderRadius: 3,
            fontSize: 10,
            fontWeight: 500,
            background: badge.bg,
            color: badge.color,
            lineHeight: "16px",
          }}
        >
          {badge.label}
        </span>
        <span>{repo.branch}</span>
      </div>
    </button>
  );
}
