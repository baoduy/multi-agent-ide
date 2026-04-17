import React, { useEffect, useState } from "react";
import { GitCommit, FileText } from "lucide-react";

import { colors } from "../../utils/colors";
import { sendOrThrow } from "../../services/ipcClient";
import { InlineLoadingRow } from "../common/InlineLoadingRow";
import { FileStatusBadge } from "../common/FileStatusBadge";
import type { CommitSummary, CommitFile } from "@magenta/shared/ipc";

type HistoryTabProps = {
  repoPath?: string;
  sha?: string;
  onOpenDiff?: (repoPath: string, sha: string, filePath: string) => void;
};

export function HistoryTab({ repoPath, sha, onOpenDiff }: HistoryTabProps): React.ReactElement {
  const [commit, setCommit] = useState<CommitSummary | null>(null);
  const [files, setFiles] = useState<CommitFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!repoPath || !sha) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    sendOrThrow({ type: "git:commit-detail", repoPath, sha })
      .then((res) => {
        if (cancelled) return;
        setCommit(res.commit);
        setFiles(res.files);
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [repoPath, sha]);

  if (!repoPath || !sha) {
    return (
      <div style={{ padding: 20, color: colors.textTertiary, fontSize: 13 }}>
        Select a commit to view its details.
      </div>
    );
  }

  if (isLoading) {
    return <div style={{ padding: 20 }}><InlineLoadingRow label="Loading commit…" /></div>;
  }

  if (error) {
    return <div style={{ padding: 20, color: colors.error, fontSize: 12 }}>{error}</div>;
  }

  if (!commit) {
    return <div style={{ padding: 20, color: colors.textTertiary, fontSize: 12 }}>Commit not found.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Header */}
      <div style={{ padding: 16, borderBottom: `1px solid ${colors.border}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <GitCommit size={16} color={colors.primary} strokeWidth={2} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: colors.textTertiary }}>
            {commit.shortSha}
          </span>
          <span style={{ fontSize: 14, fontWeight: 600, color: colors.text }}>
            {commit.subject}
          </span>
        </div>

        <div style={{ fontSize: 11, color: colors.textTertiary, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <span>
            <strong style={{ color: colors.textSecondary }}>{commit.authorName}</strong>
            {" · "}
            <span style={{ fontFamily: "var(--font-mono)" }}>{commit.authorEmail}</span>
          </span>
          <span>{new Date(commit.timestamp * 1000).toLocaleString()}</span>
          {commit.parents.length > 0 && (
            <span>parent: <code style={{ fontFamily: "var(--font-mono)" }}>{commit.parents.map((p) => p.slice(0, 7)).join(", ")}</code></span>
          )}
        </div>

        {commit.refs.length > 0 && (
          <div style={{ marginTop: 8, display: "flex", gap: 4, flexWrap: "wrap" }}>
            {commit.refs.map((ref) => (
              <span
                key={ref}
                style={{
                  fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 600,
                  color: colors.branchFg, background: colors.branchBg,
                  padding: "1px 6px", borderRadius: 3,
                }}
              >
                {ref}
              </span>
            ))}
          </div>
        )}

        {commit.body.trim() && (
          <pre
            style={{
              marginTop: 10, fontSize: 12, color: colors.textSecondary,
              whiteSpace: "pre-wrap", wordBreak: "break-word",
              fontFamily: "var(--font-mono)", lineHeight: 1.5,
            }}
          >
            {commit.body.trim()}
          </pre>
        )}
      </div>

      {/* File list */}
      <div style={{ flex: 1, overflow: "auto", padding: "8px 12px", minHeight: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: colors.textTertiary, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
          Files ({files.length})
        </div>
        {files.length === 0 ? (
          <div style={{ fontSize: 12, color: colors.textTertiary, padding: 8 }}>No file changes.</div>
        ) : (
          files.map((f) => (
            <CommitFileRow
              key={f.path}
              file={f}
              onClick={() => onOpenDiff?.(repoPath, sha, f.path)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function CommitFileRow({ file, onClick }: { file: CommitFile; onClick: () => void }): React.ReactElement {
  const [hover, setHover] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "5px 8px", borderRadius: 4,
        background: hover ? colors.bgHover : "transparent",
        cursor: "pointer", fontSize: 12,
      }}
    >
      <FileText size={12} color={colors.textTertiary} strokeWidth={1.8} style={{ flexShrink: 0 }} />
      <FileStatusBadge status={file.status === "copied" ? "modified" : file.status} />
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--font-mono)" }}>
        {file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
      </span>
      <span style={{ fontSize: 10, color: colors.success, fontFamily: "var(--font-mono)" }}>
        +{file.additions}
      </span>
      <span style={{ fontSize: 10, color: colors.error, fontFamily: "var(--font-mono)" }}>
        -{file.deletions}
      </span>
    </div>
  );
}
