import React, { useMemo, useState } from "react";

import { colors } from "../../utils/colors";
import { FileStatusBadge } from "./FileStatusBadge";
import { FileIconBadge } from "./fileIcons";
import { FileTree, type TreeEntry } from "./FileTree";
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
 * FileChangesList — shared presentational tree of changed files.
 *
 * Used by:
 *   - Right-sidebar RepoFileChanges view              (read-only, click-to-open)
 *   - WorktreeInlinePanel file list                    (read-only, click-to-open)
 *   - CommitDialog + CommitComposerTab                 (selectable with checkbox per file)
 *
 * Rendering: paths are grouped into a collapsible folder tree (built on top
 * of the shared `FileTree` component). Single-child directory chains are
 * compacted VS-Code-style ("src/foo/bar" appears as one row when each segment
 * has a single child). When any item carries `mtimeMs`, rows at every level
 * are sorted most-recently-modified first; folders use the max mtime of their
 * descendants.
 *
 * Modes
 *   • Open mode (default): clicking a file row calls `onOpen(fullPath, status)`.
 *     Deleted files and renames' original paths are non-clickable.
 *   • Selection mode (when `selectedKeys` + `onToggleSelect` are provided):
 *     every file row is a checkbox; each folder gets a tri-state checkbox
 *     that toggles all descendant files.
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
  /** Called with `(fullPath, status)` when the user clicks a clickable file row. */
  onOpen?: (fullPath: string, status: FileChangeItem["status"]) => void;

  /* ── Selection mode (opt-in) ── */
  /** Set of selected row keys. Enables checkbox rendering when provided. */
  selectedKeys?: ReadonlySet<string>;
  /** Called when the user toggles a file row's checkbox. */
  onToggleSelect?: (key: string) => void;
  /**
   * Unique key for each file (e.g. `${staged ? "s" : "u"}:${path}` in the
   * commit flow). Required when `selectedKeys` is provided.
   */
  keyOf?: (file: T) => string;
};

/* ─────────────────────────── Internal tree model ─────────────────────────── */

type FileNode<T extends FileChangeItem> = {
  kind: "file";
  id: string;
  name: string;
  path: string;
  file: T;
  selectionKey: string;
  latestMtime: number;
};

type DirNode<T extends FileChangeItem> = {
  kind: "dir";
  id: string;
  /** Display name — may contain "/" for compacted chains. */
  name: string;
  path: string;
  children: Array<DirNode<T> | FileNode<T>>;
  latestMtime: number;
  descendantFileKeys: string[];
};

type AnyNode<T extends FileChangeItem> = DirNode<T> | FileNode<T>;

function buildTree<T extends FileChangeItem>(
  files: ReadonlyArray<T>,
  keyOf: (f: T) => string,
): DirNode<T> {
  const root: DirNode<T> = {
    kind: "dir",
    id: "",
    name: "",
    path: "",
    children: [],
    latestMtime: -1,
    descendantFileKeys: [],
  };

  for (const file of files) {
    const segments = file.path.split("/").filter(Boolean);
    if (segments.length === 0) continue;

    let cursor = root;
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i]!;
      const dirPath = segments.slice(0, i + 1).join("/");
      let next = cursor.children.find(
        (c): c is DirNode<T> => c.kind === "dir" && c.name === segment,
      );
      if (!next) {
        next = {
          kind: "dir",
          id: `d:${dirPath}`,
          name: segment,
          path: dirPath,
          children: [],
          latestMtime: -1,
          descendantFileKeys: [],
        };
        cursor.children.push(next);
      }
      cursor = next;
    }

    const leafName = segments[segments.length - 1]!;
    const selectionKey = keyOf(file);
    const leaf: FileNode<T> = {
      kind: "file",
      id: `f:${selectionKey}`,
      name: leafName,
      path: file.path,
      file,
      selectionKey,
      latestMtime: file.mtimeMs ?? -1,
    };
    cursor.children.push(leaf);
  }

  // Bottom-up pass: compact single-child dir chains, propagate mtime,
  // collect descendant selection keys, and sort siblings by recency.
  const finalize = (node: AnyNode<T>): void => {
    if (node.kind === "file") return;

    for (const child of node.children) finalize(child);

    // Compact: if a dir has exactly one child and that child is a dir, fold it.
    while (node.children.length === 1 && node.children[0]!.kind === "dir") {
      const only = node.children[0] as DirNode<T>;
      if (node.path === "") break; // never compact the synthetic root
      node.name = `${node.name}/${only.name}`;
      node.path = only.path;
      node.children = only.children;
    }

    let maxMtime = -1;
    const keys: string[] = [];
    for (const child of node.children) {
      if (child.kind === "file") {
        keys.push(child.selectionKey);
        if (child.latestMtime > maxMtime) maxMtime = child.latestMtime;
      } else {
        keys.push(...child.descendantFileKeys);
        if (child.latestMtime > maxMtime) maxMtime = child.latestMtime;
      }
    }
    node.latestMtime = maxMtime;
    node.descendantFileKeys = keys;

    // Sort siblings: most-recently-modified first. Stable-tie-break on name.
    node.children.sort((a, b) => {
      const am = a.kind === "file" ? a.latestMtime : a.latestMtime;
      const bm = b.kind === "file" ? b.latestMtime : b.latestMtime;
      if (bm !== am) return bm - am;
      return a.name.localeCompare(b.name);
    });
  };

  finalize(root);
  return root;
}

function toTreeEntries<T extends FileChangeItem>(nodes: Array<AnyNode<T>>): TreeEntry[] {
  return nodes.map((n) => {
    if (n.kind === "file") {
      return {
        id: n.id,
        name: n.name,
        path: n.path,
        isDirectory: false,
      } satisfies TreeEntry;
    }
    return {
      id: n.id,
      name: n.name,
      path: n.path,
      isDirectory: true,
      children: toTreeEntries(n.children),
    } satisfies TreeEntry;
  });
}

/* ─────────────────────────── Component ─────────────────────────── */

export function FileChangesList<T extends FileChangeItem = FileChangeItem>({
  files,
  basePath,
  onOpen,
  selectedKeys,
  onToggleSelect,
  keyOf,
}: FileChangesListProps<T>): React.ReactElement | null {
  const selectable = !!selectedKeys && !!onToggleSelect && !!keyOf;
  const effectiveKeyOf = keyOf ?? ((f: T) => f.path);

  // Build the tree + index lookups. Recomputed when files change.
  const { entries, nodeIndex, autoExpand } = useMemo(() => {
    const root = buildTree(files, effectiveKeyOf);
    const index = new Map<string, AnyNode<T>>();
    const expand = new Set<string>();
    const walk = (n: AnyNode<T>): void => {
      index.set(n.id, n);
      if (n.kind === "dir") {
        expand.add(n.path);
        for (const c of n.children) walk(c);
      }
    };
    for (const c of root.children) walk(c);
    return {
      entries: toTreeEntries(root.children),
      nodeIndex: index,
      autoExpand: expand,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  if (files.length === 0) return null;

  const base = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;

  // --- Folder tri-state checkbox (selection mode only). ---
  const renderFolderContent = (entry: TreeEntry): React.ReactNode => {
    const node = nodeIndex.get(entry.id);
    if (!node || node.kind !== "dir") {
      return (
        <ScrollableText style={{ fontSize: 11, fontWeight: 500, color: "var(--foreground)", flex: 1 }}>
          {entry.name}
        </ScrollableText>
      );
    }

    const keys = node.descendantFileKeys;
    const selected = selectable
      ? keys.reduce((n, k) => (selectedKeys!.has(k) ? n + 1 : n), 0)
      : 0;
    const allSelected = selectable && keys.length > 0 && selected === keys.length;
    const someSelected = selectable && selected > 0 && !allSelected;

    return (
      <>
        {selectable && (
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
            onChange={(e) => {
              e.stopPropagation();
              // Toggle: if not all selected, select all; else clear.
              const shouldSelect = !allSelected;
              for (const k of keys) {
                const currentlySelected = selectedKeys!.has(k);
                if (shouldSelect && !currentlySelected) onToggleSelect!(k);
                else if (!shouldSelect && currentlySelected) onToggleSelect!(k);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            style={{ accentColor: colors.primary, flexShrink: 0, cursor: "pointer" }}
          />
        )}
        <ScrollableText
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: "var(--foreground)",
            flex: 1,
          }}
        >
          {entry.name}
        </ScrollableText>
        <span
          style={{
            fontSize: 9,
            color: colors.textTertiary,
            marginLeft: 4,
            flexShrink: 0,
            fontFamily: "var(--font-mono)",
          }}
        >
          {keys.length}
        </span>
      </>
    );
  };

  // --- File row (replaces the default FileTree leaf). ---
  const renderFile = (entry: TreeEntry, depth: number): React.ReactNode => {
    const node = nodeIndex.get(entry.id);
    if (!node || node.kind !== "file") return null;
    const { file, selectionKey } = node;
    const isDeleted = file.status === "deleted";
    const isChecked = selectable ? selectedKeys!.has(selectionKey) : false;
    const openClickable = !selectable && !isDeleted && !!onOpen;
    const indent = depth * 14;

    const row = (
      <FileRowInner<T>
        file={file}
        selectable={selectable}
        isChecked={isChecked}
        onToggle={selectable ? () => onToggleSelect!(selectionKey) : undefined}
        openClickable={openClickable}
        indent={indent}
        onOpenClick={
          openClickable && onOpen ? () => onOpen(`${base}/${file.path}`, file.status) : undefined
        }
      />
    );

    return <React.Fragment key={entry.id}>{row}</React.Fragment>;
  };

  return (
    <FileTree
      entries={entries}
      autoExpandPaths={autoExpand}
      renderItemContent={selectable ? renderFolderContent : undefined}
      renderLeaf={renderFile}
      showCountBadge={false}
      showExtensionBadge={false}
      indentPx={10}
    />
  );
}

/* ─────────────────────────── File row ─────────────────────────── */

type FileRowInnerProps<T extends FileChangeItem> = {
  file: T;
  selectable: boolean;
  isChecked: boolean;
  onToggle?: () => void;
  openClickable: boolean;
  onOpenClick?: () => void;
  indent: number;
};

function FileRowInner<T extends FileChangeItem>({
  file,
  selectable,
  isChecked,
  onToggle,
  openClickable,
  onOpenClick,
  indent,
}: FileRowInnerProps<T>): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const isDeleted = file.status === "deleted";
  const fileName = file.path.split("/").pop() ?? file.path;

  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: `4px 8px 4px ${14 + indent}px`,
    background: hovered ? colors.bgHover : "transparent",
    borderRadius: 5,
    cursor: openClickable || selectable ? "pointer" : "default",
    opacity: !selectable && isDeleted ? 0.6 : 1,
    transition: "background 0.1s",
  };

  const inner = (
    <>
      {selectable && (
        <input
          type="checkbox"
          checked={isChecked}
          onChange={() => onToggle?.()}
          style={{ accentColor: colors.primary, flexShrink: 0, cursor: "pointer" }}
        />
      )}

      <div style={{ flexShrink: 0 }}>
        <FileIconBadge fileName={fileName} />
      </div>

      <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
        <ScrollableText
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: openClickable && hovered ? colors.primary : colors.text,
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
        ) : null}
      </div>

      <div style={{ flexShrink: 0 }}>
        <FileStatusBadge status={file.status} />
      </div>
    </>
  );

  const title = isDeleted ? `${file.path} (deleted)` : file.path;

  if (selectable) {
    return (
      <label
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={rowStyle}
        title={title}
      >
        {inner}
      </label>
    );
  }

  return (
    <div
      onClick={onOpenClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={rowStyle}
      title={openClickable ? `Click to open ${file.path}` : title}
    >
      {inner}
    </div>
  );
}
