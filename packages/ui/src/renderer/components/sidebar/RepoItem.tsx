import React, { useState } from "react";
import { Star, FolderOpen, Clipboard, Rocket, ArrowUpCircle, RefreshCw, GitFork } from "lucide-react";

import type { Repository } from "@magenta/shared/models";
import { ContextMenu, useContextMenu } from "../common/ContextMenu";
import type { ContextMenuAction } from "../common/ContextMenu";
import { RepoLabel, BranchLabel } from "../common/RepoLabel";
import { openInFileManager } from "../../utils/ipc";
import { sendOrThrow } from "../../services/ipcClient";
import { useOnboardStore } from "../../store/onboardStore";
import { AddWorktreeDialog } from "../dialogs/AddWorktreeDialog";
import { getRepoBadge } from "../../utils/repoBadge";
import { colors } from "../../utils/colors";

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
          borderLeft: active ? `2px solid ${colors.primary}` : "2px solid transparent",
          background: active ? colors.bgHover : hovered ? colors.bgCodeInline : "transparent",
          padding: "7px 32px 7px 10px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 10,
          transition: "background 0.12s",
        }}
      >
        <RepoLabel name={repo.name} size="md" boxed style={{ flex: 1, minWidth: 0 }}>
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
          <BranchLabel name={repo.branch} size="xs" />
        </RepoLabel>
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
            color: pinned ? colors.primary : colors.borderMuted,
            transition: "color 0.12s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = colors.primary;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = pinned ? colors.primary : colors.borderMuted;
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
