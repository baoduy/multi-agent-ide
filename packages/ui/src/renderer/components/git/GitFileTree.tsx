import React, { useCallback, useEffect, useState } from "react";

import { colors } from "../../utils/colors";
import { sendOrThrow } from "../../services/ipcClient";
import { FileTree, type TreeEntry } from "../common/FileTree";
import { InlineLoadingRow } from "../common/InlineLoadingRow";
import { useViewSearchStore } from "../../store/viewSearchStore";

type GitFileTreeProps = {
  repoPath?: string;
  onOpenFile?: (filePath: string) => void;
};

async function loadDir(dirPath: string): Promise<TreeEntry[]> {
  const res = await sendOrThrow({ type: "dir:list", dirPath });
  return res.entries
    .filter((e) => !e.name.startsWith(".") || e.name === ".env.example")
    .map((e) => ({
      id: e.path,
      name: e.name,
      path: e.path,
      isDirectory: e.isDirectory,
      children: e.isDirectory ? null : undefined,
    }))
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export function GitFileTree({ repoPath, onOpenFile }: GitFileTreeProps): React.ReactElement {
  const [entries, setEntries] = useState<TreeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchQuery = useViewSearchStore((s) => s.queries["git-file-tree"] ?? "");

  useEffect(() => {
    if (!repoPath) {
      setEntries([]);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    loadDir(repoPath)
      .then((res) => { if (!cancelled) setEntries(res); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [repoPath]);

  const handleFileClick = useCallback((entry: TreeEntry) => {
    onOpenFile?.(entry.path);
  }, [onOpenFile]);

  if (!repoPath) {
    return (
      <div style={{ padding: "12px 16px", color: colors.textTertiary, fontSize: 12 }}>
        Select a repository to see its files.
      </div>
    );
  }

  if (isLoading && entries.length === 0) {
    return <div style={{ padding: "8px 12px" }}><InlineLoadingRow label="Loading files…" /></div>;
  }

  if (error) {
    return (
      <div style={{ padding: "8px 12px", fontSize: 12, color: colors.error }}>
        {error}
      </div>
    );
  }

  const filterQ = searchQuery.trim().toLowerCase();
  const shown = filterQ
    ? entries.filter((e) => e.name.toLowerCase().includes(filterQ))
    : entries;

  return (
    <div style={{ padding: "4px 6px" }}>
      <FileTree
        entries={shown}
        onLoadChildren={loadDir}
        onFileClick={handleFileClick}
        showFileIcons
        showExtensionBadge={false}
      />
    </div>
  );
}
