import React, { useState, useCallback, useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";

import { FileIconBadge, FolderIconBadge, ExtensionBadge } from "./fileIcons";
import { ScrollableText } from "./ScrollableText";
import { ContextMenu, useContextMenu } from "./ContextMenu";
import type { ContextMenuAction, ContextMenuPosition } from "./ContextMenu";

/* ═══════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════ */

export type TreeEntry = {
  id: string;
  name: string;
  path: string;
  isDirectory: boolean;
  /** Pre-loaded children (for static trees). null = not yet loaded. */
  children?: TreeEntry[] | null;
};

export type FileTreeProps = {
  /** The entries to render at this level. */
  entries: TreeEntry[];
  /** Lazy-load children for a folder. Return entries sorted as desired. */
  onLoadChildren?: (dirPath: string) => Promise<TreeEntry[]>;
  /** Fired when a file (non-directory) is clicked. */
  onFileClick?: (entry: TreeEntry) => void;
  /** Fired when a folder is clicked (beyond expand/collapse). */
  onFolderClick?: (entry: TreeEntry) => void;
  /** Build context menu items for an entry. Return [] to disable. */
  contextMenuItems?: (entry: TreeEntry) => ContextMenuAction[];
  /**
   * Optional custom renderer for the item content area (after icon, before badges).
   * If provided, replaces the default name + extension badge.
   */
  renderItemContent?: (entry: TreeEntry, depth: number) => React.ReactNode;
  /**
   * Optional custom renderer for leaf nodes (replaces the entire row).
   * Useful for the repo sidebar where leaf items are RepoItem components.
   */
  renderLeaf?: (entry: TreeEntry, depth: number) => React.ReactNode;
  /** Depth-based colors for folder names. Falls back to default warm gray. */
  depthColors?: string[];
  /** Show lucide file-type icon badges. Default: true */
  showFileIcons?: boolean;
  /** Show extension badge on files. Default: true */
  showExtensionBadge?: boolean;
  /** Show item count badge on folders. Default: false */
  showCountBadge?: boolean;
  /** Count function for the count badge. */
  countItems?: (entry: TreeEntry) => number;
  /** Paths that should be auto-expanded on mount / when changed. */
  autoExpandPaths?: Set<string>;
  /** Starting depth (for internal recursion). Default: 0 */
  depth?: number;
  /** Indent per depth level in px. Default: 14 */
  indentPx?: number;
};

/* ═══════════════════════════════════════════════════════
   Default depth colors (matches existing design)
   ═══════════════════════════════════════════════════════ */

const DEFAULT_DEPTH_COLORS = [
  "#7C3AED", // purple
  "#16A34A", // green
  "#2563EB", // blue
  "#6b6560", // warm gray
];

function colorForDepth(depth: number, colors: string[]): string {
  return colors[Math.min(depth, colors.length - 1)];
}

/* ═══════════════════════════════════════════════════════
   FileTree (entry point)
   ═══════════════════════════════════════════════════════ */

export function FileTree(props: FileTreeProps): React.ReactElement {
  const { entries, depth = 0, ...rest } = props;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {entries.map((entry) =>
        entry.isDirectory ? (
          <FolderNode key={entry.id} entry={entry} depth={depth} {...rest} />
        ) : rest.renderLeaf ? (
          <React.Fragment key={entry.id}>
            {rest.renderLeaf(entry, depth)}
          </React.Fragment>
        ) : (
          <FileNode key={entry.id} entry={entry} depth={depth} {...rest} />
        ),
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   FolderNode
   ═══════════════════════════════════════════════════════ */

type NodeProps = Omit<FileTreeProps, "entries" | "depth"> & {
  entry: TreeEntry;
  depth: number;
};

function FolderNode({
  entry,
  depth,
  onLoadChildren,
  onFileClick,
  onFolderClick,
  contextMenuItems,
  renderItemContent,
  renderLeaf,
  depthColors = DEFAULT_DEPTH_COLORS,
  showFileIcons = true,
  showExtensionBadge = true,
  showCountBadge = false,
  countItems,
  autoExpandPaths,
  indentPx = 14,
}: NodeProps): React.ReactElement {
  // Auto-expand if this path is in autoExpandPaths
  const shouldAutoExpand = autoExpandPaths?.has(entry.path) ?? false;
  const [expanded, setExpanded] = useState(shouldAutoExpand);
  const [children, setChildren] = useState<TreeEntry[] | null>(entry.children ?? null);
  const [loading, setLoading] = useState(false);
  const [hovered, setHovered] = useState(false);

  const { contextMenu, openContextMenu, closeContextMenu } = useContextMenu();

  // Track autoExpandPaths changes
  const prevAutoExpandRef = useRef(autoExpandPaths);
  useEffect(() => {
    if (autoExpandPaths !== prevAutoExpandRef.current) {
      prevAutoExpandRef.current = autoExpandPaths;
      if (autoExpandPaths?.has(entry.path)) {
        setExpanded(true);
      }
    }
  }, [autoExpandPaths, entry.path]);

  // Sync static children when entry changes
  useEffect(() => {
    if (entry.children !== undefined) {
      setChildren(entry.children);
    }
  }, [entry.children]);

  const handleToggle = useCallback(async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }

    // Lazy-load if no children yet
    if (children === null && onLoadChildren) {
      setLoading(true);
      try {
        const loaded = await onLoadChildren(entry.path);
        setChildren(loaded);
      } catch {
        setChildren([]);
      }
      setLoading(false);
    }

    setExpanded(true);
    onFolderClick?.(entry);
  }, [expanded, children, onLoadChildren, entry, onFolderClick]);

  const indent = depth * indentPx;
  const folderColor = colorForDepth(depth, depthColors);
  const hasChildren = children ? children.length > 0 : entry.children !== null || onLoadChildren !== undefined;

  const ctxItems = contextMenuItems?.(entry) ?? [];

  return (
    <>
      {/* Folder row */}
      <button
        type="button"
        onClick={() => void handleToggle()}
        onContextMenu={ctxItems.length > 0 ? openContextMenu : undefined}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          padding: `5px 8px 5px ${8 + indent}px`,
          border: "none",
          borderRadius: 4,
          background: hovered ? "#eeece6" : "transparent",
          cursor: "pointer",
          textAlign: "left",
          transition: "background 0.1s",
        }}
      >
        {/* Chevron */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 14,
            flexShrink: 0,
            transition: "transform 0.12s",
            transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
            color: "#9a958c",
          }}
        >
          {hasChildren ? <ChevronDown size={12} strokeWidth={2} /> : null}
        </span>

        {/* Folder icon */}
        {showFileIcons && <FolderIconBadge isOpen={expanded} size={14} />}

        {/* Name or custom content */}
        {renderItemContent ? (
          renderItemContent(entry, depth)
        ) : (
          <ScrollableText
            style={{
              fontSize: 11,
              fontWeight: expanded ? 600 : 500,
              color: folderColor,
              flex: 1,
              transition: "font-weight 0.1s",
            }}
          >
            {entry.name}
          </ScrollableText>
        )}

        {/* Count badge */}
        {showCountBadge && countItems && (
          <span
            style={{
              fontSize: 9,
              color: "#b5b1a8",
              marginLeft: "auto",
              flexShrink: 0,
              fontFamily: "'SF Mono', 'Fira Code', ui-monospace, monospace",
            }}
          >
            {countItems(entry)}
          </span>
        )}

        {/* Loading */}
        {loading && (
          <span style={{ fontSize: 9, color: "#9a958c", marginLeft: "auto", flexShrink: 0 }}>...</span>
        )}
      </button>

      {/* Children */}
      {expanded && children && children.length > 0 && (
        <FileTree
          entries={children}
          depth={depth + 1}
          onLoadChildren={onLoadChildren}
          onFileClick={onFileClick}
          onFolderClick={onFolderClick}
          contextMenuItems={contextMenuItems}
          renderItemContent={renderItemContent}
          renderLeaf={renderLeaf}
          depthColors={depthColors}
          showFileIcons={showFileIcons}
          showExtensionBadge={showExtensionBadge}
          showCountBadge={showCountBadge}
          countItems={countItems}
          autoExpandPaths={autoExpandPaths}
          indentPx={indentPx}
        />
      )}

      {expanded && children && children.length === 0 && (
        <div
          style={{
            padding: `3px 8px 3px ${22 + indent}px`,
            fontSize: 10,
            color: "#b5b1a8",
            fontStyle: "italic",
          }}
        >
          Empty folder
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu position={contextMenu} items={ctxItems} onClose={closeContextMenu} />
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════
   FileNode
   ═══════════════════════════════════════════════════════ */

function FileNode({
  entry,
  depth,
  onFileClick,
  contextMenuItems,
  renderItemContent,
  showFileIcons = true,
  showExtensionBadge = true,
  indentPx = 14,
}: NodeProps): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const { contextMenu, openContextMenu, closeContextMenu } = useContextMenu();

  const ctxItems = contextMenuItems?.(entry) ?? [];
  const indent = depth * indentPx;

  return (
    <>
      <button
        type="button"
        onClick={() => onFileClick?.(entry)}
        onContextMenu={ctxItems.length > 0 ? openContextMenu : undefined}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          width: "100%",
          padding: `5px 8px 5px ${22 + indent}px`,
          border: "none",
          borderRadius: 4,
          background: hovered ? "#eeece6" : "transparent",
          cursor: "pointer",
          textAlign: "left",
          transition: "background 0.1s",
        }}
      >
        {/* File icon */}
        {showFileIcons && <FileIconBadge fileName={entry.name} size={14} />}

        {/* Name or custom content */}
        {renderItemContent ? (
          renderItemContent(entry, depth)
        ) : (
          <ScrollableText
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: "#2c2c2c",
              flex: 1,
            }}
          >
            {entry.name}
          </ScrollableText>
        )}

        {/* Extension badge */}
        {showExtensionBadge && <ExtensionBadge fileName={entry.name} />}
      </button>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu position={contextMenu} items={ctxItems} onClose={closeContextMenu} />
      )}
    </>
  );
}
