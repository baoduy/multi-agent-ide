import React, { useState } from "react";

import { colors } from "../../utils/colors";
import { FileStatusBadge } from "./FileStatusBadge";
import { FileIconBadge, FolderIconBadge } from "./fileIcons";
import { ScrollableText } from "./ScrollableText";
import type { WorktreeFileStatus } from "../../store/worktreeStore";

/* ══════════════════════════════════════════
 * FileChangesList — shared presentational list of changed files.
 *
 * Used by:
 *   - Right-sidebar RepoFileChanges view
 *   - WorktreeInlinePanel (file list inside an expanded worktree row)
 *
 * Renders each file row: icon · name (+ dir path) · status badge.
 * Deleted files and directory entries are rendered as non-clickable.
 * Kept purely presentational — no fetching, no intervals, no store access.
 * ══════════════════════════════════════════ */

export type FileChangeItem = {
  path: string;
  status: WorktreeFileStatus["status"];
};

export type FileChangesListProps = {
  /** Changed files to render. */
  files: ReadonlyArray<FileChangeItem>;
  /**
   * Absolute base path that file paths are relative to. Used to build the
   * full path passed to `onOpen` when the user clicks a file row.
   */
  basePath: string;
  /** Called with `(fullPath, status)` when the user clicks a clickable row. */
  onOpen?: (fullPath: string, status: FileChangeItem["status"]) => void;
};

export function FileChangesList({
  files,
  basePath,
  onOpen,
}: FileChangesListProps): React.ReactElement | null {
  const [hoveredFile, setHoveredFile] = useState<string | null>(null);

  if (files.length === 0) return null;

  const base = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {files.map((file) => {
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
            onClick={
              isClickable && onOpen
                ? () => onOpen(`${base}/${file.path}`, file.status)
                : undefined
            }
            onMouseEnter={() => setHoveredFile(file.path)}
            onMouseLeave={() => setHoveredFile(null)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 8px",
              background: isClickable && isHovered ? colors.bgHover : "transparent",
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
            <div style={{ flexShrink: 0 }}>
              {isDirectory ? (
                <FolderIconBadge isOpen={false} />
              ) : (
                <FileIconBadge fileName={fileName} />
              )}
            </div>

            <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
              <ScrollableText
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: isClickable && isHovered ? colors.primary : colors.text,
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

            <div style={{ flexShrink: 0 }}>
              <FileStatusBadge status={file.status} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
