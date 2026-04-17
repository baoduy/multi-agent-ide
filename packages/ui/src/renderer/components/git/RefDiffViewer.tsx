import React, { useEffect, useState } from "react";

import { colors } from "../../utils/colors";
import { sendOrThrow } from "../../services/ipcClient";
import { InlineLoadingRow } from "../common/InlineLoadingRow";

type RefDiffViewerProps = {
  repoPath?: string;
  fromRef?: string;
  toRef?: string;
  path?: string;
};

/**
 * Simple side-by-side text diff for two refs. Reuses the same
 * monospace font & status colors as DiffViewer without re-pulling
 * CodeMirror's merge view; the Phase 3 goal is just to show both
 * sides correctly — the rich merge UI comes in a later polish pass.
 */
export function RefDiffViewer({ repoPath, fromRef, toRef, path }: RefDiffViewerProps): React.ReactElement {
  const [oldContent, setOldContent] = useState<string | null>(null);
  const [newContent, setNewContent] = useState<string | null>(null);
  const [isBinary, setIsBinary] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!repoPath || !path) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    sendOrThrow({ type: "git:diff", repoPath, fromRef, toRef, path })
      .then((res) => {
        if (cancelled) return;
        setOldContent(res.oldContent);
        setNewContent(res.newContent);
        setIsBinary(res.isBinary);
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [repoPath, fromRef, toRef, path]);

  if (!repoPath || !path) {
    return <div style={{ padding: 20, fontSize: 13, color: colors.textTertiary }}>No file selected.</div>;
  }
  if (isLoading) return <div style={{ padding: 20 }}><InlineLoadingRow label="Loading diff…" /></div>;
  if (error) return <div style={{ padding: 20, fontSize: 12, color: colors.error }}>{error}</div>;
  if (isBinary) {
    return <div style={{ padding: 20, fontSize: 12, color: colors.textTertiary }}>Binary file — diff not shown.</div>;
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 1,
        height: "100%",
        background: colors.border,
      }}
    >
      <Panel
        label={fromRef ? `${fromRef}: ${path}` : "(not in left ref)"}
        content={oldContent}
        side="old"
      />
      <Panel
        label={toRef ? `${toRef}: ${path}` : `HEAD: ${path}`}
        content={newContent}
        side="new"
      />
    </div>
  );
}

function Panel({ label, content, side }: { label: string; content: string | null; side: "old" | "new" }): React.ReactElement {
  return (
    <div style={{ display: "flex", flexDirection: "column", background: colors.bgSurface, minHeight: 0 }}>
      <div
        style={{
          fontSize: 10, fontWeight: 600, color: colors.textTertiary,
          padding: "6px 12px", borderBottom: `1px solid ${colors.borderLight}`,
          fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.06em",
          flexShrink: 0, background: side === "old" ? colors.errorSoft : colors.successSoft,
        }}
      >
        {label}
      </div>
      <pre
        style={{
          flex: 1,
          margin: 0,
          padding: 12,
          fontSize: 12,
          fontFamily: "var(--font-mono)",
          color: colors.text,
          overflow: "auto",
          whiteSpace: "pre",
          lineHeight: 1.55,
        }}
      >
        {content ?? "(file not present)"}
      </pre>
    </div>
  );
}
