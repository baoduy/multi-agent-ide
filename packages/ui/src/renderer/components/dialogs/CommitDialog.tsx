import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GitCommit, Upload } from "lucide-react";

import type { GitFileStatus } from "@magenta/shared/ipc";
import { colors } from "../../utils/colors";
import { sendOrThrow } from "../../services/ipcClient";
import { useRepoStore } from "../../store/repoStore";
import { BaseDialog } from "../common/BaseDialog";
import { CancelButton, PrimaryButton } from "../common/DialogButtons";
import { FormLabel, FormTextarea, FormError, SectionHeader } from "../common/FormControls";
import { InlineLoadingRow } from "../common/InlineLoadingRow";

/* ══════════════════════════════════════════
 * CommitDialog
 *
 * Lets the user commit staged/unstaged/untracked changes in a repo.
 * Flow:
 *   1. On mount, load git:status to populate the file list.
 *   2. User selects files via checkboxes (initial selection = already-staged files).
 *   3. User writes a commit message.
 *   4. User clicks Commit OR Commit & Push.
 * ══════════════════════════════════════════ */

type CommitDialogProps = {
  repoPath: string;
  currentBranch: string;
  onClose: () => void;
};

/** Unique key for dedupe + selection: path + staged flag (so staged-modified != unstaged-modified). */
function fileKey(f: GitFileStatus): string {
  return `${f.staged ? "s" : "u"}:${f.path}`;
}

/** Short status badge letter (M/A/D/R/U/C). */
function statusLetter(s: GitFileStatus["status"]): { letter: string; label: string; color: string } {
  switch (s) {
    case "modified": return { letter: "M", label: "Modified", color: colors.warningText };
    case "added": return { letter: "A", label: "Added", color: colors.success };
    case "deleted": return { letter: "D", label: "Deleted", color: colors.error };
    case "renamed": return { letter: "R", label: "Renamed", color: colors.info };
    case "untracked": return { letter: "U", label: "Untracked", color: colors.textTertiary };
    case "conflicted": return { letter: "C", label: "Conflict", color: colors.error };
  }
}

/** Group file rows into Staged / Unstaged / Untracked sections. */
type FileGroup = { title: string; files: GitFileStatus[] };
function groupFiles(files: GitFileStatus[]): FileGroup[] {
  const staged: GitFileStatus[] = [];
  const unstaged: GitFileStatus[] = [];
  const untracked: GitFileStatus[] = [];
  for (const f of files) {
    if (f.status === "untracked") untracked.push(f);
    else if (f.staged) staged.push(f);
    else unstaged.push(f);
  }
  const out: FileGroup[] = [];
  if (staged.length) out.push({ title: `Staged (${staged.length})`, files: staged });
  if (unstaged.length) out.push({ title: `Changes (${unstaged.length})`, files: unstaged });
  if (untracked.length) out.push({ title: `Untracked (${untracked.length})`, files: untracked });
  return out;
}

export function CommitDialog({ repoPath, currentBranch, onClose }: CommitDialogProps): React.ReactElement {
  const [files, setFiles] = useState<GitFileStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasUpstream, setHasUpstream] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [isCommitting, setIsCommitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  /** Tracks which primary button the user clicked so only that one shows a spinner. */
  const pushIntent = useRef(false);

  const fetchRepos = useRepoStore((s) => s.fetchRepos);

  /* ── Load status on mount ── */
  useEffect(() => {
    let cancelled = false;
    sendOrThrow({ type: "git:status", repoPath })
      .then((res) => {
        if (cancelled) return;
        setFiles(res.files);
        setHasUpstream(res.hasUpstream);
        // Default selection: everything already staged.
        const next = new Set<string>();
        for (const f of res.files) if (f.staged) next.add(fileKey(f));
        setSelected(next);
        setIsLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
          setIsLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [repoPath]);

  /* ── Focus message after load ── */
  useEffect(() => {
    if (!isLoading && files.length > 0) messageRef.current?.focus();
  }, [isLoading, files.length]);

  const groups = useMemo(() => groupFiles(files), [files]);

  /* ── Selection helpers ── */
  const toggleFile = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setCommitError(null);
  }, []);

  const allKeys = useMemo(() => files.map(fileKey), [files]);
  const allSelected = selected.size === allKeys.length && allKeys.length > 0;

  const toggleAll = useCallback(() => {
    setSelected((prev) => (prev.size === allKeys.length ? new Set() : new Set(allKeys)));
    setCommitError(null);
  }, [allKeys]);

  /* ── Commit ── */
  const doCommit = useCallback(async (push: boolean) => {
    pushIntent.current = push;
    const trimmed = message.trim();
    if (!trimmed) { setCommitError("Commit message cannot be empty."); return; }
    if (selected.size === 0) { setCommitError("Select at least one file to commit."); return; }

    // Collect unique paths (a file staged + unstaged appears twice; git add handles dedupe).
    const paths = Array.from(new Set(
      files.filter((f) => selected.has(fileKey(f))).map((f) => f.path),
    ));

    setIsCommitting(true);
    setCommitError(null);
    try {
      await sendOrThrow({ type: "git:commit", repoPath, message: trimmed, files: paths, push });
      await fetchRepos();
      onClose();
    } catch (err) {
      setCommitError(err instanceof Error ? err.message : String(err));
      setIsCommitting(false);
    }
  }, [message, selected, files, repoPath, fetchRepos, onClose]);

  /* ── Footer ── */
  const footer = (
    <>
      <CancelButton onClick={onClose} />
      <PrimaryButton
        onClick={() => void doCommit(false)}
        disabled={!message.trim() || selected.size === 0 || isLoading}
        loading={isCommitting && !pushIntent.current}
        loadingText="Committing..."
      >
        <GitCommit size={12} strokeWidth={2.2} />
        Commit
      </PrimaryButton>
      <PrimaryButton
        onClick={() => void doCommit(true)}
        disabled={!message.trim() || selected.size === 0 || isLoading}
        loading={isCommitting && pushIntent.current}
        loadingText="Committing & pushing..."
      >
        <Upload size={12} strokeWidth={2.2} />
        Commit & Push
      </PrimaryButton>
    </>
  );

  /* ── Render ── */
  return (
    <BaseDialog
      title="Commit changes"
      icon={<GitCommit size={16} color={colors.primary} strokeWidth={2} />}
      width={540}
      minHeight={480}
      scrollable
      maxHeight="82vh"
      onClose={onClose}
      footer={footer}
    >
      {isLoading ? (
        <InlineLoadingRow label="Reading working tree..." size={16} fontSize={13} color={colors.textSecondary} />
      ) : loadError ? (
        <FormError message={loadError} />
      ) : files.length === 0 ? (
        <p style={{ fontSize: 13, color: colors.textSecondary, margin: 0 }}>
          No changes to commit on <strong style={{ color: colors.text }}>{currentBranch}</strong>.
        </p>
      ) : (
        <>
          {/* Files */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <SectionHeader style={{ marginBottom: 0 }}>
              Files ({files.length})
            </SectionHeader>
            <button
              type="button"
              onClick={toggleAll}
              style={{
                fontSize: 11,
                fontWeight: 500,
                color: colors.primary,
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              {allSelected ? "Deselect all" : "Select all"}
            </button>
          </div>

          <div
            style={{
              maxHeight: 240,
              overflowY: "auto",
              border: `1px solid ${colors.border}`,
              borderRadius: 6,
              padding: 4,
              background: colors.bgSurface,
              marginBottom: 16,
            }}
          >
            {groups.map((group) => (
              <div key={group.title} style={{ marginBottom: 4 }}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: colors.textTertiary,
                    padding: "6px 8px 2px",
                  }}
                >
                  {group.title}
                </div>
                {group.files.map((f) => {
                  const key = fileKey(f);
                  const isSelected = selected.has(key);
                  const s = statusLetter(f.status);
                  return (
                    <label
                      key={key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "4px 8px",
                        borderRadius: 4,
                        cursor: "pointer",
                        fontSize: 12,
                        fontFamily: "var(--font-mono)",
                        color: colors.text,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = colors.bgHover; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleFile(key)}
                        style={{ accentColor: colors.primary, flexShrink: 0, cursor: "pointer" }}
                      />
                      <span
                        title={s.label}
                        style={{
                          display: "inline-block",
                          width: 18,
                          textAlign: "center",
                          fontSize: 10,
                          fontWeight: 700,
                          color: s.color,
                          flexShrink: 0,
                        }}
                      >
                        {s.letter}
                      </span>
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {f.oldPath ? `${f.oldPath} → ${f.path}` : f.path}
                      </span>
                    </label>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Commit message */}
          <FormLabel htmlFor="commit-message">Commit message</FormLabel>
          <FormTextarea
            id="commit-message"
            textareaRef={messageRef}
            value={message}
            onChange={(v) => { setMessage(v); setCommitError(null); }}
            placeholder="Short subject line&#10;&#10;Optional longer description..."
            rows={5}
          />

          {!hasUpstream && (
            <p style={{ fontSize: 11, color: colors.textTertiary, marginTop: 8, marginBottom: 0, lineHeight: 1.5 }}>
              Branch <strong style={{ color: colors.textSecondary }}>{currentBranch}</strong> has no upstream.
              Pushing will set <code style={{ fontFamily: "var(--font-mono)" }}>origin/{currentBranch}</code> as upstream.
            </p>
          )}

          <FormError message={commitError} />
        </>
      )}
    </BaseDialog>
  );
}
