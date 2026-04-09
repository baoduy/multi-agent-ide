import React from "react";

import type { Repository } from "@magenta/shared/models";

type RepoItemProps = {
  repo: Repository;
  active: boolean;
  onSelect: (repoPath: string) => void;
};

function statusColor(status: Repository["status"]): string {
  if (status === "active") {
    return "#10b981";
  }

  if (status === "missing") {
    return "#f59e0b";
  }

  return "#6b7280";
}

export function RepoItem({ repo, active, onSelect }: RepoItemProps): React.ReactElement {
  return (
    <button
      type="button"
      onClick={() => onSelect(repo.path)}
      style={{
        width: "100%",
        textAlign: "left",
        border: active ? "1px solid #60a5fa" : "1px solid #e5e7eb",
        borderLeft: `4px solid ${active ? "#3b82f6" : statusColor(repo.status)}`,
        borderRadius: 8,
        background: active ? "#eff6ff" : "#ffffff",
        padding: 10,
        marginBottom: 8,
        cursor: "pointer",
      }}
    >
      <div style={{ fontSize: 14, fontWeight: 600 }}>{repo.name}</div>
      <div style={{ marginTop: 4, fontSize: 12, color: "#4b5563", display: "flex", gap: 8 }}>
        <span>{repo.branch}</span>
        <span style={{ color: statusColor(repo.status), textTransform: "uppercase", fontWeight: 600 }}>
          {repo.status}
        </span>
        <span>{repo.specCount} specs</span>
      </div>
    </button>
  );
}
