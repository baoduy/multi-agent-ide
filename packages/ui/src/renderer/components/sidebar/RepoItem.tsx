import React, { useState } from "react";
import { Star, FolderOpen, FolderGit2, Clipboard, Rocket, ArrowUpCircle, RefreshCw, GitFork } from "lucide-react";

import type { Repository } from "@magenta/shared/models";
import { ContextMenu, useContextMenu } from "../common/ContextMenu";
import type { ContextMenuAction } from "../common/ContextMenu";
import { ScrollableText } from "../common/ScrollableText";
import { BranchLabel } from "../common/RepoLabel";
import { openInFileManager } from "../../utils/ipc";
import { sendOrThrow } from "../../services/ipcClient";
import { useOnboardStore } from "../../store/onboardStore";
import { AddWorktreeDialog } from "../dialogs/AddWorktreeDialog";

/* ── Badge helpers ── */

interface BadgeInfo {
  label: string;
  bg: string;
  color: string;
}

function getRepoBadge(repo: Repository): BadgeInfo {
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

/* ── RepoItem ── */

type RepoItemProps = {
  repo: Repository;
  active: boolean;
  pinned: boolean;
  onSelect: (repoPath: string) => void;
  onTogglePin: (repoPath: string) => void;
};

export function RepoItem({ repo, active, pinned, onSelect, onTogglePin }: RepoItemProps): React.ReactElement {
  const badge = getRepoBadge(repo);
  const [hovered, setHovered] = useState(false);
  const [showAddWorktree, setShowAddWorktree] = useState(false);
  const { contextMenu, openContextMenu, closeContextMenu } = useContextMenu();

  const startProcess = useOnboardStore((s) => s.startProcess);
  const setDialogOpen = useOnboardStore((s) => s.setDialogOpen);
  const existingProcess = useOnboardStore((s) => s.processes[repo.path]);

  const ctxItems: ContextMenuAction[] = [
    {
      label: pinned ? "Unpin repository" : "Pin to top",
      Icon: Star,
      action: () => onTogglePin(repo.path),
    },
    {
      label: "Open in File Explorer",
      Icon: FolderOpen,
      action: () => void openInFileManager(repo.path),
    },
    {
      label: "Copy path",
      Icon: Clipboard,
      action: () => void navigator.clipboard.writeText(repo.path),
    },
    {
      label: "Add Worktree",
      Icon: GitFork,
      action: () => setShowAddWorktree(true),
    },
  ];

  // Force reload: rescan repo + refresh spec info
  ctxItems.push({
    label: "Force Reload",
    Icon: RefreshCw,
    separator: true,
    action: () => {
      void sendOrThrow({ type: "repo:force-reload", repoPath: repo.path });
    },
  });

  // Show "Onboard to Specify" or "Upgrade Specify" last
  if (!repo.hasSpecs) {
    ctxItems.push({
      label: existingProcess?.phase === "running"
        ? "View Onboarding..."
        : "Onboard to Specify",
      Icon: Rocket,
      action: () => {
        if (existingProcess) {
          setDialogOpen(repo.path, true);
        } else {
          startProcess("onboard", repo.path, repo.name);
        }
      },
    });
  } else {
    ctxItems.push({
      label: existingProcess?.phase === "running"
        ? "View Upgrade..."
        : "Upgrade Specify",
      Icon: ArrowUpCircle,
      action: () => {
        if (existingProcess) {
          setDialogOpen(repo.path, true);
        } else {
          startProcess("upgrade", repo.path, repo.name);
        }
      },
    });
  }

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "stretch",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type="button"
        onClick={() => onSelect(repo.path)}
        onContextMenu={openContextMenu}
        style={{
          flex: 1,
          textAlign: "left",
          border: "none",
          borderLeft: active ? "2px solid #C15F3C" : "2px solid transparent",
          background: active ? "#f0ebe4" : hovered ? "#eeece6" : "transparent",
          padding: "7px 32px 7px 10px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 10,
          transition: "background 0.12s",
        }}
      >
        {/* Git icon */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 26,
            height: 26,
            borderRadius: 5,
            background: "#C15F3C14",
            flexShrink: 0,
          }}
        >
          <FolderGit2 size={14} color="#C15F3C" strokeWidth={1.8} />
        </span>

        {/* Name + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <ScrollableText
            style={{
              fontWeight: 600,
              fontSize: 12,
              color: "#2c2c2c",
              lineHeight: 1.4,
            }}
          >
            {repo.name}
          </ScrollableText>
          <div
            style={{
              fontSize: 10,
              color: "#9a958c",
              marginTop: 2,
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
                fontSize: 9,
                fontWeight: 500,
                background: badge.bg,
                color: badge.color,
                lineHeight: "16px",
              }}
            >
              {badge.label}
            </span>

            {/* Current branch — read-only tag */}
            <BranchLabel name={repo.branch} size="xs" badge />
          </div>
        </div>
      </button>

      {/* Pin toggle */}
      {(hovered || pinned) && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin(repo.path);
          }}
          title={pinned ? "Unpin repository" : "Pin to top"}
          style={{
            position: "absolute",
            right: 8,
            top: "50%",
            transform: "translateY(-50%)",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "2px 4px",
            borderRadius: 4,
            lineHeight: 1,
            display: "inline-flex",
            alignItems: "center",
            color: pinned ? "#C15F3C" : "#d1cec6",
            transition: "color 0.12s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#C15F3C";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = pinned ? "#C15F3C" : "#d1cec6";
          }}
        >
          <Star size={12} fill={pinned ? "currentColor" : "none"} strokeWidth={1.8} />
        </button>
      )}

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu position={contextMenu} items={ctxItems} onClose={closeContextMenu} />
      )}

      {/* Add Worktree dialog */}
      {showAddWorktree && (
        <AddWorktreeDialog
          repoPath={repo.path}
          onCreated={() => setShowAddWorktree(false)}
          onCancel={() => setShowAddWorktree(false)}
        />
      )}
    </div>
  );
}
