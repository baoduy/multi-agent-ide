import React, { useCallback, useEffect, useRef, useState } from "react";
import { Star, FolderOpen, Clipboard, GitBranch, ChevronDown, Check, Loader2 } from "lucide-react";

import type { Repository } from "@magenta/shared/models";
import { ContextMenu, useContextMenu } from "../common/ContextMenu";
import type { ContextMenuAction } from "../common/ContextMenu";
import { openInFileManager } from "../../utils/ipc";
import { useRepoStore } from "../../store/repoStore";

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
  if (repo.specCount > 0 && repo.hasSpecs) {
    return { label: "spec", bg: "#e8e5f5", color: "#6b5ebd" };
  }
  if (repo.status === "active") {
    return { label: "active", bg: "#e4f0df", color: "#3d7a2a" };
  }
  return { label: repo.status, bg: "#eeece6", color: "#6b6560" };
}

/* ── Branch dropdown ── */

type BranchDropdownProps = {
  repoPath: string;
  currentBranch: string;
  onClose: () => void;
};

function BranchDropdown({ repoPath, currentBranch, onClose }: BranchDropdownProps): React.ReactElement {
  const branchState = useRepoStore((s) => s.branchStateByRepo[repoPath]);
  const fetchBranches = useRepoStore((s) => s.fetchBranches);
  const checkoutBranch = useRepoStore((s) => s.checkoutBranch);

  const [filter, setFilter] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);

  const branches = branchState?.branches ?? [];
  const isLoading = branchState?.isLoading ?? true;
  const isCheckingOut = branchState?.isCheckingOut ?? false;

  useEffect(() => {
    void fetchBranches(repoPath);
  }, [fetchBranches, repoPath]);

  useEffect(() => {
    if (!isLoading) {
      filterInputRef.current?.focus();
    }
  }, [isLoading]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const filtered = filter.trim()
    ? branches.filter((b) => b.toLowerCase().includes(filter.toLowerCase()))
    : branches;

  const handleSelect = useCallback(
    async (branch: string) => {
      if (branch === currentBranch) {
        onClose();
        return;
      }
      await checkoutBranch(repoPath, branch);
      onClose();
    },
    [checkoutBranch, repoPath, currentBranch, onClose],
  );

  return (
    <div
      ref={dropdownRef}
      style={{
        position: "absolute",
        top: "100%",
        left: 0,
        right: 0,
        zIndex: 100,
        background: "#fff",
        border: "1px solid #e5e2da",
        borderRadius: 6,
        boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
        marginTop: 2,
        maxHeight: 240,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Filter input */}
      <div style={{ padding: "6px 8px", borderBottom: "1px solid #f0ede8" }}>
        <input
          ref={filterInputRef}
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter branches..."
          style={{
            width: "100%",
            border: "1px solid #e5e2da",
            borderRadius: 4,
            padding: "4px 8px",
            fontSize: 11,
            outline: "none",
            background: "#faf9f7",
            color: "#2c2c2c",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Branch list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {isLoading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "12px", gap: 6, color: "#9a958c", fontSize: 11 }}>
            <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
            Loading branches...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "10px 12px", color: "#9a958c", fontSize: 11 }}>
            {filter ? "No matching branches" : "No branches found"}
          </div>
        ) : (
          filtered.map((branch) => {
            const isCurrent = branch === currentBranch;
            return (
              <button
                key={branch}
                type="button"
                disabled={isCheckingOut}
                onClick={() => void handleSelect(branch)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  border: "none",
                  background: isCurrent ? "#f5f0eb" : "transparent",
                  padding: "5px 10px",
                  cursor: isCheckingOut ? "wait" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 11,
                  color: isCurrent ? "#C15F3C" : "#2c2c2c",
                  fontWeight: isCurrent ? 600 : 400,
                  fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', ui-monospace, monospace",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => {
                  if (!isCurrent) e.currentTarget.style.background = "#f5f3ef";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isCurrent ? "#f5f0eb" : "transparent";
                }}
              >
                <span style={{ width: 14, display: "inline-flex", flexShrink: 0 }}>
                  {isCurrent && <Check size={11} strokeWidth={2.5} />}
                </span>
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                  }}
                >
                  {branch}
                </span>
              </button>
            );
          })
        )}
      </div>

      {/* Spinner keyframes (injected inline) */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
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
  const [branchOpen, setBranchOpen] = useState(false);
  const { contextMenu, openContextMenu, closeContextMenu } = useContextMenu();

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
  ];

  const handleBranchClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setBranchOpen((prev) => !prev);
    },
    [],
  );

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
          <GitBranch size={14} color="#C15F3C" strokeWidth={1.8} />
        </span>

        {/* Name + meta */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 13,
              color: "#2c2c2c",
              lineHeight: 1.4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {repo.name}
          </div>
          <div
            style={{
              fontSize: 11,
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
                fontSize: 10,
                fontWeight: 500,
                background: badge.bg,
                color: badge.color,
                lineHeight: "16px",
              }}
            >
              {badge.label}
            </span>

            {/* Branch selector button */}
            <span
              role="button"
              tabIndex={0}
              onClick={handleBranchClick}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleBranchClick(e as unknown as React.MouseEvent); }}
              title="Switch branch"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 2,
                fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', ui-monospace, monospace",
                fontSize: 10,
                cursor: "pointer",
                padding: "0 4px",
                borderRadius: 3,
                transition: "background 0.1s, color 0.1s",
                background: branchOpen ? "#e5e2da" : "transparent",
                color: branchOpen ? "#C15F3C" : "inherit",
              }}
              onMouseEnter={(e) => {
                if (!branchOpen) {
                  e.currentTarget.style.background = "#eeece6";
                  e.currentTarget.style.color = "#C15F3C";
                }
              }}
              onMouseLeave={(e) => {
                if (!branchOpen) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "inherit";
                }
              }}
            >
              {repo.branch}
              <ChevronDown size={10} strokeWidth={2} style={{ transform: branchOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
            </span>
          </div>
        </div>
      </button>

      {/* Branch dropdown */}
      {branchOpen && (
        <BranchDropdown
          repoPath={repo.path}
          currentBranch={repo.branch}
          onClose={() => setBranchOpen(false)}
        />
      )}

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
    </div>
  );
}
