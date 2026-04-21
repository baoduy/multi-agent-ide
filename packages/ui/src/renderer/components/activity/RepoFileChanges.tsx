import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { colors } from "../../utils/colors";
import { useWorktreeStore, type WorktreeStatus } from "../../store/worktreeStore";
import { useViewSearchStore } from "../../store/viewSearchStore";
import { InlineLoadingRow } from "../common/InlineLoadingRow";
import { FileChangesList } from "../common/FileChangesList";

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

  const handleFileOpen = useCallback(
    (fullPath: string, fileStatus: string) => {
      if (onOpenDiff) {
        onOpenDiff(fullPath, fileStatus);
      } else {
        onOpenFile?.(fullPath);
      }
    },
    [onOpenFile, onOpenDiff],
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
            //fontSize: 11,
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
        <div style={{ color: colors.textTertiary, 
        //fontSize: 11,
         padding: "8px 0" }}>
          {searchQuery.trim()
            ? `No matches for \u201c${searchQuery}\u201d`
            : "No changed files."}
        </div>
      )}

      {/* File list */}
      {status && filteredFiles.length > 0 && (
        <FileChangesList
          files={filteredFiles}
          basePath={effectivePath}
          onOpen={handleFileOpen}
        />
      )}
    </div>
  );
}

