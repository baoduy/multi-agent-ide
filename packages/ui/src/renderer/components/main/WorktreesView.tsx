import React from "react";

type WorktreesViewProps = {
  repoName: string | null;
};

export function WorktreesView({ repoName }: WorktreesViewProps): React.ReactElement {
  if (!repoName) {
    return (
      <div style={{ padding: 20, color: "#8b8b96", fontSize: 13 }}>
        Select a repository to view worktrees.
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#8b8b96",
          marginBottom: 12,
        }}
      >
        Active worktrees — {repoName}
      </div>

      <div
        style={{
          color: "#8b8b96",
          fontSize: 13,
          padding: "16px 0",
          borderBottom: "1px solid #e5e5ec",
        }}
      >
        No active worktrees. Start a task to create one.
      </div>

      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#8b8b96",
          marginBottom: 12,
          marginTop: 20,
        }}
      >
        Queued worktrees
      </div>

      <div style={{ color: "#8b8b96", fontSize: 13 }}>
        No queued worktrees.
      </div>
    </div>
  );
}
