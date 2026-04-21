import React, { useState } from "react";

import { colors } from "../../utils/colors";
import { FileStatusBadge } from "./FileStatusBadge";
import { FileIconBadge, FolderIconBadge } from "./fileIcons";
import { ScrollableText } from "./ScrollableText";

/** Union of every status value the two file-change data shapes emit today. */
export type FileChangeStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "conflicted";

/* ══════════════════════════════════════════
 * FileChangesList — shared presentational list of changed files.
 *
 * Used by:
 *   - Right-sidebar RepoFileChanges view              (read-only list, click-to-open)
 *   - WorktreeInlinePanel file list                    (read-only list, click-to-open)
 *   - CommitDialog + CommitComposerTab                 (selectable list with checkbox per row)
 *
 * Renders each file row: [checkbox?] · icon · name + dir-path · status badge.
 * Deleted files and directory entries are rendered as non-clickable in "open" mode.
 * For renames, the secondary line shows "from <oldPath>" instead of the dir path.
 *
 * Modes
 *   • Open mode (default): clicking a row calls `onOpen(fullPath, status)`.
 *   • Selection mode (when `selectedKeys` + `onToggleSelect` are provided):
 *     the whole row is a <label> toggling a checkbox; `onOpen` is ignored.
 *
 * Kept purely presentational — no fetching, no intervals, no store access.
 * ══════════════════════════════════════════ */

export type FileChangeItem = {
  path: string;
  status: FileChangeStatus;
  /** Present for rename entries. Shown as "from <oldPath>" under the new name. */
  oldPath?: string;
  /** Working-tree file mtime (ms since epoch). When present on any row, rows are sorted most-recent first. */
  mtimeMs?: number;
};

export type FileChangesListProps<T extends FileChangeItem = FileChangeItem> = {
  /** Changed files to render. */
  files: ReadonlyArray<T>;
  /**
   * Absolute base path that file paths are relative to. Used to build the
   * full path passed to `onOpen` when the user clicks a file row.
   */
  basePath: string;
  /** Called with `(fullPath, status)` when the user clicks a clickable row. */
  onOpen?: (fullPath: string, status: FileChangeItem["status"]) => void;

  /* ── Selection mode (opt-in) ── */
  /** Set of selected row keys. Enables checkbox rendering when provided. */
  selectedKeys?: ReadonlySet<string>;
  /** Called when the user toggles a row's checkbox. */
  onToggleSelect?: (key: string) => void;
  /**
   * Unique key for each file (e.g. `${staged ? "s" : "u"}:${path}` in the
   * commit flow). Required when `selectedKeys` is provided.
   */
  keyOf?: (file: T) => string;
};

export function FileChangesList<T extends FileChangeItem = FileChangeItem>({
  files,
  basePath,
  onOpen,
  selectedKeys,
  onToggleSelect,
  keyOf,
}: FileChangesListProps<T>): React.ReactElement | null {
  const [hoveredFile, setHoveredFile] = useState<string | null>(null);

  if (files.length === 0) return null;

  const selectable = !!selectedKeys && !!onToggleSelect && !!keyOf;
  const base = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;

  // Sort most-recently-modified first. Rows without an mtime sink to the bottom
  // (e.g. deleted files) while preserving their incoming relative order.
  const sorted = files.some((f) => typeof f.mtimeMs === "number")
    ? [...files].sort((a, b) => (b.mtimeMs ?? -1) - (a.mtimeMs ?? -1))
    : files;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {sorted.map((file) => {
        const isDirectory = file.path.endsWith("/");
        const isDeleted = file.status === "deleted";
        const fileName = file.path.split("/").pop() ?? file.path;
        const dirPath = file.path.includes("/")
          ? file.path.slice(0, file.path.lastIndexOf("/"))
          : "";
        const isHovered = hoveredFile === file.path;
        const key = selectable ? keyOf!(file) : file.path;
        const isChecked = selectable ? selectedKeys!.has(key) : false;

        // In open mode, deleted/directory rows are non-clickable.
        // In selection mode, every row is a label and therefore always "clickable".
        const openClickable = !selectable && !isDeleted && !isDirectory && !!onOpen;

        const rowStyle: React.CSSProperties = {
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "5px 8px",
          background: isHovered ? colors.bgHover : "transparent",
          borderRadius: 5,
          cursor: openClickable || selectable ? "pointer" : "default",
          opacity: !selectable && (isDeleted || isDirectory) ? 0.6 : 1,
          transition: "background 0.1s",
        };

        const inner = (
          <>
            {selectable && (
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => onToggleSelect!(key)}
                style={{ accentColor: colors.primary, flexShrink: 0, cursor: "pointer" }}
              />
            )}

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
                  color: openClickable && isHovered ? colors.primary : colors.text,
                  transition: "color 0.1s",
                }}
              >
                {fileName}
              </ScrollableText>
              {file.oldPath ? (
                <ScrollableText
                  style={{
                    fontSize: 10,
                    color: colors.textTertiary,
                    fontFamily: "var(--font-mono)",
                    fontStyle: "italic",
                  }}
                >
                  from {file.oldPath}
                </ScrollableText>
              ) : dirPath ? (
                <ScrollableText
                  style={{
                    fontSize: 10,
                    color: colors.textTertiary,
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {dirPath}
                </ScrollableText>
              ) : null}
            </div>

            <div style={{ flexShrink: 0 }}>
              <FileStatusBadge status={file.status} />
            </div>
          </>
        );

        const title = isDirectory
          ? `${file.path} (directory)`
          : isDeleted
            ? `${file.path} (deleted)`
            : file.path;

        if (selectable) {
          return (
            <label
              key={key}
              onMouseEnter={() => setHoveredFile(file.path)}
              onMouseLeave={() => setHoveredFile(null)}
              style={rowStyle}
              title={title}
            >
              {inner}
            </label>
          );
        }

        return (
          <div
            key={key}
            onClick={
              openClickable && onOpen
                ? () => onOpen(`${base}/${file.path}`, file.status)
                : undefined
            }
            onMouseEnter={() => setHoveredFile(file.path)}
            onMouseLeave={() => setHoveredFile(null)}
            style={rowStyle}
            title={openClickable ? `Click to open ${file.path}` : title}
          >
            {inner}
          </div>
        );
      })}
    </div>
  );
}
