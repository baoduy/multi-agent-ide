import React, { useCallback, useMemo } from "react";
import { FolderOpen, FileText, Clipboard } from "lucide-react";

import { FileTree } from "../common/FileTree";
import type { TreeEntry } from "../common/FileTree";
import type { ContextMenuAction } from "../common/ContextMenu";
import { ipc, openInFileManager } from "../../utils/ipc";

/* ── Convert flat spec file paths → TreeEntry[] ── */

function toEntries(files: string[]): TreeEntry[] {
  return files.map((filePath) => {
    const name = filePath.split("/").pop() ?? filePath;
    const hasExt = /\.[^./]+$/.test(name);
    return {
      id: filePath,
      name,
      path: filePath,
      isDirectory: !hasExt,
      children: !hasExt ? null : undefined, // folders get null (lazy-loadable), files get undefined
    };
  });
}

function sortEntries(entries: TreeEntry[]): TreeEntry[] {
  return [...entries].sort((a, b) => {
    // Directories first
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    // Markdown files first among files
    if (!a.isDirectory && !b.isDirectory) {
      const aIsMd = /\.(md|mdx)$/i.test(a.name);
      const bIsMd = /\.(md|mdx)$/i.test(b.name);
      if (aIsMd && !bIsMd) return -1;
      if (!aIsMd && bIsMd) return 1;
    }
    return a.name.localeCompare(b.name);
  });
}

/* ── SpecFileList ── */

type SpecFileListProps = {
  files: string[];
  onOpenFile?: (filePath: string) => void;
};

export function SpecFileList({ files, onOpenFile }: SpecFileListProps): React.ReactElement {
  const entries = useMemo(() => sortEntries(toEntries(files)), [files]);

  /* Lazy-load folder children via IPC */
  const loadChildren = useCallback(async (dirPath: string): Promise<TreeEntry[]> => {
    const response = await ipc.send({ type: "dir:list", dirPath });
    if (response.type === "dir:list:result") {
      return (response.entries as Array<{ name: string; path: string; isDirectory: boolean }>).map(
        (e) => ({
          id: e.path,
          name: e.name,
          path: e.path,
          isDirectory: e.isDirectory,
          children: e.isDirectory ? null : undefined,
        }),
      );
    }
    return [];
  }, []);

  /* Context menu builder */
  const buildContextMenu = useCallback(
    (entry: TreeEntry): ContextMenuAction[] => {
      const items: ContextMenuAction[] = [];

      if (!entry.isDirectory && onOpenFile) {
        items.push({
          label: "Open file",
          Icon: FileText,
          action: () => onOpenFile(entry.path),
        });
      }

      items.push({
        label: "Reveal in File Explorer",
        Icon: FolderOpen,
        action: () => void openInFileManager(entry.path),
      });

      items.push({
        label: "Copy path",
        Icon: Clipboard,
        action: () => void navigator.clipboard.writeText(entry.path),
      });

      return items;
    },
    [onOpenFile],
  );

  if (files.length === 0) {
    return <div style={{ fontSize: 12, color: "#9a958c" }}>No files in this spec.</div>;
  }

  return (
    <FileTree
      entries={entries}
      onLoadChildren={loadChildren}
      onFileClick={(entry) => onOpenFile?.(entry.path)}
      contextMenuItems={buildContextMenu}
      showFileIcons
      showExtensionBadge
    />
  );
}
