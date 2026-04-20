import React, { useCallback, useEffect, useState } from "react";

import type { CommitFile } from "@magenta/shared/ipc";
import { colors } from "../../utils/colors";
import { useGitHistoryStore } from "../../store/gitHistoryStore";
import { FileStatusBadge } from "../common/FileStatusBadge";
import { FileIconBadge } from "../common/fileIcons";
import { InlineLoadingRow } from "../common/InlineLoadingRow";
import { ScrollableText } from "../common/ScrollableText";
import { RepoFileChanges } from "../activity/RepoFileChanges";
import type { SelectedRow } from "./CommitGraphList";

type ChangedFilesPanelProps = {
  repoPath: string;
  selected: SelectedRow;
  /** Open a working-tree diff (file vs HEAD) — used when the working-tree row is selected. */
  onOpenWorkingDiff: (filePath: string, fileStatus: string) => void;
  /** Open a ref-diff between commit^ and commit for a given file. */
  onOpenRefDiff?: (args: {
    repoPath: string;
    fromRef?: string;
    toRef: string;
    path: string;
    oldPath?: string;
  }) => void;
};

export function ChangedFilesPanel({
  repoPath,
  selected,
  onOpenWorkingDiff,
  onOpenRefDiff,
}: ChangedFilesPanelProps): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "6px 10px",
          borderBottom: `1px solid ${colors.borderLight}`,
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: colors.textTertiary,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span>Files</span>
        {selected.kind === "working" ? (
          <span style={{ fontFamily: "var(--font-mono)", color: colors.warningText, fontSize: 10 }}>
            (working tree)
          </span>
        ) : (
          <span style={{ fontFamily: "var(--font-mono)", color: colors.textTertiary, fontSize: 10 }}>
            ({selected.sha.slice(0, 7)})
          </span>
        )}
      </div>

      <div style={{ flex: 1, overflow: "auto", minHeight: 0, padding: "4px 8px" }}>
        {selected.kind === "working" ? (
          <RepoFileChanges repoPath={repoPath} onOpenDiff={onOpenWorkingDiff} />
        ) : (
          <CommitFiles
            repoPath={repoPath}
            sha={selected.sha}
            onOpenRefDiff={onOpenRefDiff}
          />
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */

function CommitFiles({
  repoPath,
  sha,
  onOpenRefDiff,
}: {
  repoPath: string;
  sha: string;
  onOpenRefDiff?: (args: {
    repoPath: string;
    fromRef?: string;
    toRef: string;
    path: string;
    oldPath?: string;
  }) => void;
}): React.ReactElement {
  const getCommitDetail = useGitHistoryStore((s) => s.getCommitDetail);
  const cached = useGitHistoryStore((s) => s.commitDetailCache.get(`${repoPath}|${sha}`));

  const [files, setFiles] = useState<CommitFile[]>(cached?.files ?? []);
  const [parents, setParents] = useState<string[]>(cached?.commit.parents ?? []);
  const [isLoading, setIsLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    const entry = useGitHistoryStore.getState().commitDetailCache.get(`${repoPath}|${sha}`);
    if (entry) {
      setFiles(entry.files);
      setParents(entry.commit.parents);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    getCommitDetail(repoPath, sha)
      .then((res) => {
        if (cancelled) return;
        setFiles(res.files);
        setParents(res.commit.parents);
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [repoPath, sha, getCommitDetail]);

  const fromRef = parents[0];

  const handleClick = useCallback(
    (file: CommitFile) => {
      if (!onOpenRefDiff) return;
      onOpenRefDiff({
        repoPath,
        fromRef,
        toRef: sha,
        path: file.path,
        oldPath: file.oldPath,
      });
    },
    [onOpenRefDiff, repoPath, fromRef, sha],
  );

  if (isLoading) return <InlineLoadingRow label="Loading files…" />;
  if (error) return <div style={{ padding: 4, fontSize: 11, color: colors.error }}>{error}</div>;
  if (files.length === 0) {
    return <div style={{ padding: 4, fontSize: 11, color: colors.textTertiary }}>No file changes.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {files.map((f) => (
        <CommitFileRow key={f.path + (f.oldPath ?? "")} file={f} onClick={() => handleClick(f)} />
      ))}
    </div>
  );
}

function CommitFileRow({ file, onClick }: { file: CommitFile; onClick: () => void }): React.ReactElement {
  const [hover, setHover] = useState(false);
  const fileName = file.path.split("/").pop() ?? file.path;
  const dirPath = file.path.includes("/")
    ? file.path.slice(0, file.path.lastIndexOf("/"))
    : "";
  const badgeStatus = file.status === "copied" ? "modified" : file.status;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 8px",
        borderRadius: 5,
        background: hover ? colors.bgHover : "transparent",
        cursor: "pointer",
      }}
      title={`Click to open diff · ${file.path}`}
    >
      <div style={{ flexShrink: 0 }}>
        <FileIconBadge fileName={fileName} />
      </div>
      <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
        <ScrollableText
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: hover ? colors.primary : colors.text,
          }}
        >
          {file.oldPath ? `${fileName} ← ${file.oldPath.split("/").pop()}` : fileName}
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
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: colors.success, fontFamily: "var(--font-mono)" }}>
          +{file.additions}
        </span>
        <span style={{ fontSize: 10, color: colors.error, fontFamily: "var(--font-mono)" }}>
          -{file.deletions}
        </span>
        <FileStatusBadge status={badgeStatus} />
      </div>
    </div>
  );
}
