import React, { useEffect, useState } from "react";
import { FileText } from "lucide-react";

import type { BlameLine } from "@magenta/shared/ipc";
import { colors } from "../../utils/colors";
import { sendOrThrow } from "../../services/ipcClient";
import { InlineLoadingRow } from "../common/InlineLoadingRow";

type BlameTabProps = {
  repoPath?: string;
  path?: string;
  ref?: string;
  onOpenCommit?: (repoPath: string, sha: string) => void;
};

function relativeTime(unixSec: number): string {
  if (!unixSec) return "";
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

export function BlameTab({ repoPath, path, ref, onOpenCommit }: BlameTabProps): React.ReactElement {
  const [lines, setLines] = useState<BlameLine[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!repoPath || !path) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    sendOrThrow({ type: "git:blame", repoPath, path, ref })
      .then((res) => { if (!cancelled) setLines(res.lines); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [repoPath, path, ref]);

  if (!repoPath || !path) {
    return (
      <div style={{ padding: 20, fontSize: 13, color: colors.textTertiary }}>
        No file selected.
      </div>
    );
  }

  if (isLoading) {
    return <div style={{ padding: 20 }}><InlineLoadingRow label="Loading blame…" /></div>;
  }

  if (error) {
    return <div style={{ padding: 20, fontSize: 12, color: colors.error }}>{error}</div>;
  }

  if (lines.length === 0) {
    return <div style={{ padding: 20, fontSize: 12, color: colors.textTertiary }}>Empty file.</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "8px 12px", borderBottom: `1px solid ${colors.border}`,
          flexShrink: 0,
        }}
      >
        <FileText size={14} color={colors.textTertiary} strokeWidth={1.8} />
        <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: colors.text }}>
          {path}
        </span>
        {ref && <span style={{ fontSize: 11, color: colors.textTertiary }}>@ {ref}</span>}
      </div>

      <div
        style={{
          flex: 1, overflow: "auto", fontFamily: "var(--font-mono)",
          fontSize: 12, lineHeight: "20px", background: colors.bgSurface,
        }}
      >
        {lines.map((l, idx) => {
          const prev = idx > 0 ? lines[idx - 1]!.sha : null;
          const isFirst = prev !== l.sha;
          return (
            <div
              key={idx}
              style={{
                display: "grid",
                gridTemplateColumns: "72px 110px 44px 1fr",
                borderLeft: `2px solid ${isFirst ? colors.primary : "transparent"}`,
                opacity: isFirst ? 1 : 0.9,
              }}
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => onOpenCommit?.(repoPath, l.sha)}
                onKeyDown={(e) => { if (e.key === "Enter") onOpenCommit?.(repoPath, l.sha); }}
                title={`${l.sha}\n${l.author}`}
                style={{
                  padding: "0 8px", color: colors.textTertiary, fontSize: 10,
                  borderRight: `1px solid ${colors.borderLight}`,
                  cursor: onOpenCommit ? "pointer" : "default",
                  display: "flex", alignItems: "center",
                }}
              >
                {isFirst ? l.shortSha : ""}
              </div>
              <div
                style={{
                  padding: "0 6px", color: colors.textTertiary, fontSize: 10,
                  borderRight: `1px solid ${colors.borderLight}`,
                  display: "flex", alignItems: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
                title={l.author}
              >
                {isFirst ? `${l.author}` : ""}
              </div>
              <div
                style={{
                  padding: "0 6px", color: colors.textTertiary, fontSize: 10,
                  borderRight: `1px solid ${colors.borderLight}`, textAlign: "right",
                  display: "flex", alignItems: "center", justifyContent: "flex-end",
                }}
              >
                {isFirst ? relativeTime(l.timestamp) : ""}
              </div>
              <div style={{ padding: "0 12px", color: colors.text, whiteSpace: "pre", overflow: "hidden" }}>
                <span style={{ color: colors.textTertiary, marginRight: 10 }}>{l.lineNo}</span>
                {l.content}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
