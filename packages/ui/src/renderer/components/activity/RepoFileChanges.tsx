import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { colors } from "../../utils/colors";
import { useWorktreeStore, type WorktreeStatus } from "../../store/worktreeStore";
import { useViewSearchStore } from "../../store/viewSearchStore";
import { FileStatusBadge } from "../common/FileStatusBadge";
import { FileIconBadge, FolderIconBadge } from "../common/fileIcons";
import { InlineLoadingRow } from "../common/InlineLoadingRow";
import { ScrollableText } from "../common/ScrollableText";

/** How often to auto-refresh file changes (ms). */
const REFRESH_INTERVAL = 60_000; // 1 minute

type RepoFileChangesProps = {
  /** The repo root path to query git status against. */
  repoPath: string;
  /** Optional worktree path — if the AI session is in a worktree, use that instead. */
  worktreePath?: string | null;
  /** Called when user clicks a changed file (fallback if onOpenDiff is not provided). */
  onOpenFile?: (filePath: string) => void;
  /** Called when user clicks a changed file to open a diff view. */
  onOpenDiff?: (filePath: string, fileStatus: string) => void;
  /** Called when the file count changes (so parent can display it in the section title). */
  onFileCountChange?: (count: number) => void;
};

export function RepoFileChanges({
  repoPath,
  worktreePath,
  onOpenFile,
  onOpenDiff,
  onFileCountChange,
}: RepoFileChangesProps): React.ReactElement {
  const fetchWorktreeStatus = useWorktreeStore((s) => s.fetchWorktreeStatus);

  // Local state — we don't pollute the worktree store's statusCache with repo-level status
  const [status, setStatus] = useState<WorktreeStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hoveredFile, setHoveredFile] = useState<string | null>(null);

  // The effective path to run git status against
  const effectivePath = worktreePath || repoPath;
  const searchQuery = useViewSearchStore((s) => s.queries["repo-changes"] ?? "");

  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await fetchWorktreeStatus(repoPath, effectivePath);
      if (result) {
        setStatus(result);
        onFileCountChange?.(result.files.length);
      }
    } catch {
      // Silently fail — don't crash the sidebar
    } finally {
      setIsLoading(false);
    }
  }, [repoPath, effectivePath, fetchWorktreeStatus, onFileCountChange]);

  // Fetch on mount and when path changes
  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  // Auto-refresh every 1 minute
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      void fetchStatus();
    }, REFRESH_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchStatus]);

  const handleFileClick = useCallback(
    (filePath: string, fileStatus: string) => {
      const base = effectivePath.endsWith("/") ? effectivePath.slice(0, -1) : effectivePath;
      const fullPath = `${base}/${filePath}`;
      if (onOpenDiff) {
        onOpenDiff(fullPath, fileStatus);
      } else {
        onOpenFile?.(fullPath);
      }
    },
    [effectivePath, onOpenFile, onOpenDiff],
  );

  const filteredFiles = useMemo(() => {
    if (!status || !searchQuery.trim()) return status?.files ?? [];
    const q = searchQuery.toLowerCase().trim();
    return status.files.filter((f) => f.path.toLowerCase().includes(q));
  }, [status, searchQuery]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Ahead/behind indicator */}
      {status && (status.ahead > 0 || status.behind > 0) && (
        <div
          style={{
            fontSize: 11,
            color: colors.textTertiary,
            marginBottom: 8,
          }}
        >
          {status.ahead > 0 && `${status.ahead} ahead`}
          {status.ahead > 0 && status.behind > 0 && " · "}
          {status.behind > 0 && `${status.behind} behind`}
        </div>
      )}

      {/* Loading state (only on first load — refresh shows spinner in button) */}
      {isLoading && !status && (
        <InlineLoadingRow label="Loading file status…" />
      )}

      {/* Empty state */}
      {!isLoading && status && filteredFiles.length === 0 && (
        <div style={{ color: colors.textTertiary, fontSize: 11, padding: "8px 0" }}>
          {searchQuery.trim()
            ? `No matches for \u201c${searchQuery}\u201d`
            : "No changed files."}
        </div>
      )}

      {/* File list */}
      {status && filteredFiles.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {filteredFiles.map((file) => {
            const isDirectory = file.path.endsWith("/");
            const isClickable = file.status !== "deleted" && !isDirectory;
            const fileName = file.path.split("/").pop() ?? file.path;
            const dirPath = file.path.includes("/")
              ? file.path.slice(0, file.path.lastIndexOf("/"))
              : "";
            const isHovered = hoveredFile === file.path;

            return (
              <div
                key={file.path}
                onClick={isClickable ? () => handleFileClick(file.path, file.status) : undefined}
                onMouseEnter={() => setHoveredFile(file.path)}
                onMouseLeave={() => setHoveredFile(null)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "5px 8px",
                  background:
                    isClickable && isHovered ? colors.bgHover : "transparent",
                  borderRadius: 5,
                  cursor: isClickable ? "pointer" : "default",
                  opacity: isClickable ? 1 : 0.6,
                  transition: "background 0.1s",
                }}
                title={
                  isClickable
                    ? `Click to open ${file.path}`
                    : isDirectory
                      ? `${file.path} (directory)`
                      : `${file.path} (deleted)`
                }
              >
                {/* File/folder icon */}
                <div style={{ flexShrink: 0 }}>
                  {isDirectory ? (
                    <FolderIconBadge isOpen={false} />
                  ) : (
                    <FileIconBadge fileName={fileName} />
                  )}
                </div>

                {/* Name + path */}
                <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                  <ScrollableText
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color:
                        isClickable && isHovered ? colors.primary : colors.text,
                      transition: "color 0.1s",
                    }}
                  >
                    {fileName}
                  </ScrollableText>
                  {dirPath && (
                    <ScrollableText
                      style={{
                        fontSize: 10,
                        color: colors.textTertiary,
                        fontFamily: "var(--font-mono)",
                      }}
                    >
                      {dirPath}
                    </ScrollableText>
                  )}
                </div>

                {/* Status badge */}
                <div style={{ flexShrink: 0 }}>
                  <FileStatusBadge status={file.status} />
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}

