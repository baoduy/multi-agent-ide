import React, { useState } from "react";
import { GitBranch, FolderOpen, Clock, ExternalLink } from "lucide-react";

import { useWorktreeStore, type WorktreeInfo } from "../../store/worktreeStore";
import { useRepoStore } from "../../store/repoStore";

type WorktreesViewProps = {
  repoName: string | null;
};

/* ── Single worktree card ── */

function WorktreeCard({ wt }: { wt: WorktreeInfo }): React.ReactElement {
  const [hovered, setHovered] = useState(false);

  const createdDate = new Date(wt.createdAt);
  const dateStr = createdDate.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        background: hovered ? "#faf9f5" : "#fff",
        border: "1px solid #e5e2da",
        borderRadius: 8,
        transition: "background 0.12s",
      }}
    >
      {/* Icon */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          height: 32,
          borderRadius: 6,
          background: "#f0ede8",
          flexShrink: 0,
        }}
      >
        <GitBranch size={16} color="#C15F3C" strokeWidth={1.8} />
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "#2c2c2c",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {wt.name}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 3,
            fontSize: 11,
            color: "#9a958c",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
            }}
          >
            <GitBranch size={10} strokeWidth={1.5} />
            {wt.branch}
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
            }}
          >
            <Clock size={10} strokeWidth={1.5} />
            {dateStr}
          </span>
        </div>
      </div>

      {/* Path (truncated) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontSize: 10,
          color: "#9a958c",
          fontFamily: "'SF Mono', 'Fira Code', ui-monospace, monospace",
          maxWidth: 200,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
        title={wt.worktreePath}
      >
        <FolderOpen size={10} strokeWidth={1.5} />
        {wt.worktreePath.split("/").slice(-2).join("/")}
      </div>
    </div>
  );
}

/* ── Main view ── */

export function WorktreesView({ repoName }: WorktreesViewProps): React.ReactElement {
  const activeRepoPath = useRepoStore((state) => state.activeRepoPath);
  const allWorktrees = useWorktreeStore((state) => state.worktrees);
  const repos = useRepoStore((state) => state.repos);

  if (!repoName) {
    return (
      <div style={{ padding: 20, color: "#9a958c", fontSize: 13 }}>
        Select a repository to view worktrees.
      </div>
    );
  }

  // Worktrees for the active repo
  const repoWorktrees = allWorktrees.filter((w) => w.repoPath === activeRepoPath);

  // Worktrees for OTHER repos
  const otherWorktrees = allWorktrees.filter((w) => w.repoPath !== activeRepoPath);

  // Group other worktrees by repo
  const otherByRepo = new Map<string, WorktreeInfo[]>();
  for (const wt of otherWorktrees) {
    const list = otherByRepo.get(wt.repoPath) ?? [];
    list.push(wt);
    otherByRepo.set(wt.repoPath, list);
  }

  return (
    <div style={{ padding: 20 }}>
      {/* Active repo section */}
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#9a958c",
          marginBottom: 12,
        }}
      >
        Active worktrees — {repoName}
      </div>

      {repoWorktrees.length === 0 ? (
        <div
          style={{
            color: "#9a958c",
            fontSize: 13,
            padding: "16px 0",
            borderBottom: "1px solid #e5e2da",
          }}
        >
          No worktrees yet. Approve a file from a remote branch to create one.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingBottom: 16, borderBottom: "1px solid #e5e2da" }}>
          {repoWorktrees.map((wt) => (
            <WorktreeCard key={wt.worktreePath} wt={wt} />
          ))}
        </div>
      )}

      {/* Other repos section */}
      {otherByRepo.size > 0 && (
        <>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#9a958c",
              marginBottom: 12,
              marginTop: 20,
            }}
          >
            Other repositories
          </div>

          {Array.from(otherByRepo.entries()).map(([repoPath, wts]) => {
            const repo = repos.find((r) => r.path === repoPath);
            const name = repo?.name ?? repoPath.split("/").pop() ?? repoPath;

            return (
              <div key={repoPath} style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: "#6b6560",
                    marginBottom: 8,
                  }}
                >
                  {name}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {wts.map((wt) => (
                    <WorktreeCard key={wt.worktreePath} wt={wt} />
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* Summary */}
      {allWorktrees.length > 0 && (
        <div
          style={{
            marginTop: 20,
            fontSize: 11,
            color: "#9a958c",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <GitBranch size={11} strokeWidth={1.5} />
          {allWorktrees.length} worktree{allWorktrees.length !== 1 ? "s" : ""} across{" "}
          {new Set(allWorktrees.map((w) => w.repoPath)).size} repo
          {new Set(allWorktrees.map((w) => w.repoPath)).size !== 1 ? "s" : ""}
        </div>
      )}
    </div>
  );
}
