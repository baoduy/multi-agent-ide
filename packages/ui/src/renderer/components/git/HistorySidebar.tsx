import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Loader2, GitCommit } from "lucide-react";

import { colors } from "../../utils/colors";
import { useGitHistoryStore, historyKey } from "../../store/gitHistoryStore";
import { InlineLoadingRow } from "../common/InlineLoadingRow";
import { useViewSearchStore } from "../../store/viewSearchStore";
import type { CommitSummary } from "@magenta/shared/ipc";

type HistorySidebarProps = {
  repoPath?: string;
  onOpenCommit?: (repoPath: string, sha: string) => void;
};

const spin: React.CSSProperties = { animation: "spin 1s linear infinite" };

function relativeTime(unixSec: number): string {
  const ms = Date.now() - unixSec * 1000;
  if (ms < 60_000) return "now";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

function authorInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function HistorySidebar({ repoPath, onOpenCommit }: HistorySidebarProps): React.ReactElement {
  const search = useViewSearchStore((s) => s.queries["git-history"] ?? "");
  const [debounced, setDebounced] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const query = useMemo(
    () => (repoPath ? { repoPath, search: debounced.trim() || undefined } : null),
    [repoPath, debounced],
  );

  const entries = useGitHistoryStore((s) => s.entries);
  const loadFirstPage = useGitHistoryStore((s) => s.loadFirstPage);
  const loadMore = useGitHistoryStore((s) => s.loadMore);
  const refresh = useGitHistoryStore((s) => s.refresh);

  useEffect(() => {
    if (!query) return;
    void loadFirstPage(query);
  }, [query, loadFirstPage]);

  const entry = useMemo(() => {
    if (!query) return null;
    return entries.get(historyKey(query)) ?? null;
  }, [entries, query]);

  const handleOpen = useCallback((commit: CommitSummary) => {
    if (!repoPath) return;
    onOpenCommit?.(repoPath, commit.sha);
  }, [onOpenCommit, repoPath]);

  if (!repoPath) {
    return (
      <div style={{ padding: "12px 16px", color: colors.textTertiary, fontSize: 12 }}>
        Select a repository to view its commit history.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "4px 6px" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "2px 4px" }}>
        <button
          type="button"
          onClick={() => query && void refresh(query)}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "2px 6px", fontSize: 11, color: colors.textSecondary,
            background: "transparent", border: `1px solid ${colors.border}`,
            borderRadius: 4, cursor: "pointer", fontFamily: "inherit",
          }}
          title="Reload history"
        >
          {entry?.isLoading ? <Loader2 size={10} style={spin} /> : <RefreshCw size={10} strokeWidth={2} />}
          Reload
        </button>
      </div>

      {!entry || (entry.isLoading && entry.commits.length === 0) ? (
        <InlineLoadingRow label="Loading history…" />
      ) : entry.error ? (
        <div style={{ padding: "6px 10px", fontSize: 11, color: colors.error }}>
          {entry.error}
        </div>
      ) : entry.commits.length === 0 ? (
        <div style={{ padding: "6px 10px", fontSize: 12, color: colors.textTertiary }}>
          No commits.
        </div>
      ) : (
        <>
          {entry.commits.map((c) => (
            <CommitRow key={c.sha} commit={c} onClick={handleOpen} />
          ))}
          {entry.hasMore && (
            <button
              type="button"
              onClick={() => query && void loadMore(query)}
              disabled={entry.isLoading}
              style={{
                margin: "4px 8px", padding: "4px 8px",
                fontSize: 11, color: colors.primary, fontWeight: 600,
                background: "transparent", border: `1px dashed ${colors.border}`,
                borderRadius: 4, cursor: entry.isLoading ? "default" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {entry.isLoading ? "Loading…" : "Load more"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function CommitRow({ commit, onClick }: { commit: CommitSummary; onClick: (c: CommitSummary) => void }): React.ReactElement {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={() => onClick(commit)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        width: "100%",
        padding: "6px 10px",
        background: hover ? colors.bgHover : "transparent",
        border: "none",
        borderRadius: 4,
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "inherit",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
        <GitCommit size={11} color={colors.textTertiary} strokeWidth={2} style={{ flexShrink: 0 }} />
        <span
          style={{
            fontSize: 10, fontFamily: "var(--font-mono)",
            color: colors.textTertiary, flexShrink: 0,
          }}
        >
          {commit.shortSha}
        </span>
        <span
          style={{
            flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis",
            whiteSpace: "nowrap", fontSize: 12, fontWeight: 500, color: colors.text,
          }}
        >
          {commit.subject}
        </span>
      </div>
      <div style={{ display: "flex", gap: 6, fontSize: 10, color: colors.textTertiary, paddingLeft: 17 }}>
        <span
          title={commit.authorName}
          style={{
            fontSize: 9, fontWeight: 600, padding: "1px 4px",
            background: colors.bgMuted, borderRadius: 3, color: colors.textSecondary,
          }}
        >
          {authorInitials(commit.authorName)}
        </span>
        <span>{commit.authorName}</span>
        <span>· {relativeTime(commit.timestamp)}</span>
      </div>
    </button>
  );
}
