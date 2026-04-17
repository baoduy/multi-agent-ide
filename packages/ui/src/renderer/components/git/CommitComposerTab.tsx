import React from "react";
import { GitCommit, Upload, Loader2, RefreshCw } from "lucide-react";

import { colors } from "../../utils/colors";
import { FormTextarea, FormError, SectionHeader } from "../common/FormControls";
import { InlineLoadingRow } from "../common/InlineLoadingRow";
import { useCommitComposer, fileKey } from "./useCommitComposer";
import type { GitFileStatus } from "@magenta/shared/ipc";

type CommitComposerTabProps = {
  repoPath?: string;
};

const spin: React.CSSProperties = { animation: "spin 1s linear infinite" };

function statusLetter(s: GitFileStatus["status"]): { letter: string; color: string } {
  switch (s) {
    case "modified": return { letter: "M", color: colors.warningText };
    case "added": return { letter: "A", color: colors.success };
    case "deleted": return { letter: "D", color: colors.error };
    case "renamed": return { letter: "R", color: colors.info };
    case "untracked": return { letter: "U", color: colors.textTertiary };
    case "conflicted": return { letter: "C", color: colors.error };
  }
}

export function CommitComposerTab({ repoPath }: CommitComposerTabProps): React.ReactElement {
  if (!repoPath) {
    return (
      <div style={{ padding: 20, color: colors.textTertiary, fontSize: 13 }}>
        Select a repository to open the commit composer.
      </div>
    );
  }

  return <CommitComposerInner repoPath={repoPath} key={repoPath} />;
}

function CommitComposerInner({ repoPath }: { repoPath: string }): React.ReactElement {
  const c = useCommitComposer({ repoPath });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        padding: 16,
        gap: 12,
        boxSizing: "border-box",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <GitCommit size={16} color={colors.primary} strokeWidth={2} />
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>
            Commit on <code style={{ fontFamily: "var(--font-mono)" }}>{c.branch || "…"}</code>
          </div>
          {c.hasUpstream && (c.ahead > 0 || c.behind > 0) && (
            <span style={{ fontSize: 11, color: colors.textTertiary }}>
              ↓{c.behind} ↑{c.ahead}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void c.reload()}
          disabled={c.isLoading}
          style={{
            display: "flex", alignItems: "center", gap: 4,
            padding: "4px 8px", fontSize: 11, fontWeight: 600,
            color: colors.textSecondary, background: "transparent",
            border: `1px solid ${colors.border}`, borderRadius: 4,
            cursor: c.isLoading ? "default" : "pointer", fontFamily: "inherit",
          }}
        >
          {c.isLoading ? <Loader2 size={11} style={spin} /> : <RefreshCw size={11} strokeWidth={2} />}
          Refresh
        </button>
      </div>

      {/* Message */}
      <div>
        <SectionHeader style={{ marginBottom: 6 }}>Commit message</SectionHeader>
        <FormTextarea
          value={c.message}
          onChange={c.setMessage}
          placeholder="Summary… (use blank line then body for more detail)"
          rows={3}
          minHeight={64}
          mono
        />
      </div>

      {/* Files */}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <SectionHeader style={{ marginBottom: 0 }}>Files ({c.files.length})</SectionHeader>
          {c.files.length > 0 && (
            <button
              type="button"
              onClick={c.toggleAll}
              style={{ fontSize: 11, fontWeight: 500, color: colors.primary, background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              {c.allSelected ? "Deselect all" : "Select all"}
            </button>
          )}
        </div>
        <div
          style={{
            flex: 1, minHeight: 0, overflowY: "auto",
            border: `1px solid ${colors.border}`, borderRadius: 6, padding: 4,
            background: colors.bgSurface,
          }}
        >
          {c.isLoading ? (
            <div style={{ padding: 10 }}><InlineLoadingRow label="Reading working tree…" /></div>
          ) : c.loadError ? (
            <div style={{ padding: 10 }}><FormError message={c.loadError} /></div>
          ) : c.files.length === 0 ? (
            <div style={{ padding: "10px 12px", fontSize: 12, color: colors.textTertiary }}>
              Nothing to commit on <strong style={{ color: colors.text }}>{c.branch}</strong>.
            </div>
          ) : (
            c.groups.map((group) => (
              <div key={group.title} style={{ marginBottom: 4 }}>
                <div
                  style={{
                    fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em",
                    color: colors.textTertiary, padding: "6px 8px 2px",
                  }}
                >
                  {group.title}
                </div>
                {group.files.map((f) => {
                  const key = fileKey(f);
                  const isSelected = c.selected.has(key);
                  const s = statusLetter(f.status);
                  return (
                    <label
                      key={key}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "4px 8px", borderRadius: 4, cursor: "pointer",
                        fontSize: 12, fontFamily: "var(--font-mono)", color: colors.text,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = colors.bgHover; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => c.toggleFile(key)}
                        style={{ accentColor: colors.primary, flexShrink: 0, cursor: "pointer" }}
                      />
                      <span style={{ width: 18, textAlign: "center", fontSize: 10, fontWeight: 700, color: s.color, flexShrink: 0 }}>
                        {s.letter}
                      </span>
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {f.oldPath ? `${f.oldPath} → ${f.path}` : f.path}
                      </span>
                    </label>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Upstream hint */}
      {!c.hasUpstream && c.branch && (
        <p style={{ fontSize: 11, color: colors.textTertiary, margin: 0, lineHeight: 1.5 }}>
          Branch <strong style={{ color: colors.textSecondary }}>{c.branch}</strong> has no upstream.
          Pushing will set <code style={{ fontFamily: "var(--font-mono)" }}>origin/{c.branch}</code> as upstream.
        </p>
      )}

      <FormError message={c.commitError} />

      {/* Actions */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button
          type="button"
          onClick={() => void c.doCommit(false)}
          disabled={c.primaryDisabled}
          style={{
            padding: "7px 14px", fontSize: 12, fontWeight: 600,
            color: colors.text, background: "transparent",
            border: `1px solid ${colors.border}`, borderRadius: 6,
            cursor: c.primaryDisabled ? "default" : "pointer",
            display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit",
            opacity: c.primaryDisabled ? 0.5 : 1,
          }}
        >
          {c.isCommitting && !c.pushIntent.current
            ? <Loader2 size={12} style={spin} />
            : <GitCommit size={12} strokeWidth={2.2} />}
          Commit
        </button>
        <button
          type="button"
          onClick={() => void c.doCommit(true)}
          disabled={c.primaryDisabled}
          style={{
            padding: "7px 14px", fontSize: 12, fontWeight: 600,
            color: colors.textWhite,
            background: c.primaryDisabled ? colors.textTertiary : colors.primary,
            border: "none", borderRadius: 6,
            cursor: c.primaryDisabled ? "default" : "pointer",
            display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit",
          }}
        >
          {c.isCommitting && c.pushIntent.current
            ? <Loader2 size={12} style={spin} />
            : <Upload size={12} strokeWidth={2.2} />}
          Commit & Push
        </button>
      </div>
    </div>
  );
}
