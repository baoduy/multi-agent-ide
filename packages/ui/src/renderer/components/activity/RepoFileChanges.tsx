import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { colors } from "../../utils/colors";
import { useWorktreeStore, type WorktreeStatus } from "../../store/worktreeStore";
import { ScrollableText } from "../common/ScrollableText";
import { FileStatusBadge } from "../common/FileStatusBadge";

/** How often to auto-refresh file changes (ms). */
const REFRESH_INTERVAL = 60_000; // 1 minute

type RepoFileChangesProps = {
  /** The repo root path to query git status against. */
  repoPath: string;
  /** Optional worktree path — if the AI session is in a worktree, use that instead. */
  worktreePath?: string | null;
  /** Called when user clicks a changed file. */
  onOpenFile?: (filePath: string) => void;
  /** Called when the file count changes (so parent can display it in the section title). */
  onFileCountChange?: (count: number) => void;
};

export function RepoFileChanges({
  repoPath,
  worktreePath,
  onOpenFile,
  onFileCountChange,
}: RepoFileChangesProps): React.ReactElement {
  const fetchWorktreeStatus = useWorktreeStore((s) => s.fetchWorktreeStatus);

  // Local state — we don't pollute the worktree store's statusCache with repo-level status
  const [status, setStatus] = useState<WorktreeStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hoveredFile, setHoveredFile] = useState<string | null>(null);

  // The effective path to run git status against
  const effectivePath = worktreePath || repoPath;

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
    (filePath: string) => {
      const fullPath = `${effectivePath}/${filePath}`;
      onOpenFile?.(fullPath);
    },
    [effectivePath, onOpenFile],
  );

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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: colors.textTertiary,
            fontSize: 12,
            padding: "12px 0",
          }}
        >
          <Loader2
            size={14}
            strokeWidth={2}
            style={{ animation: "spin 1s linear infinite" }}
          />
          Loading file status…
        </div>
      )}

      {/* Empty state */}
      {!isLoading && status && status.files.length === 0 && (
        <div style={{ color: colors.textTertiary, fontSize: 12, padding: "8px 0" }}>
          No changed files.
        </div>
      )}

      {/* File list */}
      {status && status.files.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {status.files.map((file) => {
            const isClickable = file.status !== "deleted";

            return (
              <div
                key={file.path}
                onClick={isClickable ? () => handleFileClick(file.path) : undefined}
                onMouseEnter={() => setHoveredFile(file.path)}
                onMouseLeave={() => setHoveredFile(null)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "5px 8px",
                  background:
                    isClickable && hoveredFile === file.path
                      ? colors.bgHover
                      : "transparent",
                  borderRadius: 5,
                  cursor: isClickable ? "pointer" : "default",
                  opacity: isClickable ? 1 : 0.6,
                  transition: "background 0.1s",
                }}
                title={
                  isClickable
                    ? `Click to open ${file.path}`
                    : `${file.path} (deleted)`
                }
              >
                <ScrollableText
                  style={{
                    fontSize: 11,
                    color:
                      isClickable && hoveredFile === file.path
                        ? colors.primary
                        : colors.text,
                    fontFamily:
                      "'SF Mono', 'Fira Code', ui-monospace, monospace",
                    flex: 1,
                    minWidth: 0,
                    transition: "color 0.1s",
                  }}
                >
                  {file.path}
                </ScrollableText>
                <div style={{ flexShrink: 0, marginLeft: 8 }}>
                  <FileStatusBadge status={file.status} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

