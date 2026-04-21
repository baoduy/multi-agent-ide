import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GitCommit, Upload, ChevronDown, Loader2 } from "lucide-react";

import type { GitFileStatus } from "@magenta/shared/ipc";
import { colors } from "../../utils/colors";
import { sendOrThrow } from "../../services/ipcClient";
import { useRepoStore } from "../../store/repoStore";
import { BaseDialog } from "../common/BaseDialog";
import { FormError, SectionHeader } from "../common/FormControls";
import { InlineLoadingRow } from "../common/InlineLoadingRow";
import { FileChangesList } from "../common/FileChangesList";

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
  const messageRef = useRef<HTMLInputElement>(null);
  /** Tracks which primary action the user triggered so only that one shows a spinner. */
  const pushIntent = useRef(true); // default to push — it's the primary action
  /** Secondary-action dropdown (opens the "Commit only" option). */
  const [menuOpen, setMenuOpen] = useState(false);
  const splitRef = useRef<HTMLDivElement>(null);

  const fetchRepos = useRepoStore((s) => s.fetchRepos);

  /* ── Close dropdown on outside click ── */
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (splitRef.current && !splitRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => { clearTimeout(t); document.removeEventListener("mousedown", handler); };
  }, [menuOpen]);

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

  /* ── Footer: commit message input on the left + split button on the right ── */
  const primaryDisabled = !message.trim() || selected.size === 0 || isLoading || isCommitting;

  const onMessageKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    // Cmd/Ctrl+Enter to trigger the primary action (Commit & Push).
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !primaryDisabled) {
      e.preventDefault();
      void doCommit(true);
    }
  }, [doCommit, primaryDisabled]);

  const footer = (
    <>
      <input
        ref={messageRef}
        id="commit-message"
        type="text"
        value={message}
        onChange={(e) => { setMessage(e.target.value); setCommitError(null); }}
        onKeyDown={onMessageKeyDown}
        placeholder="Commit message"
        disabled={isLoading || files.length === 0}
        style={{
          flex: 1,
          minWidth: 0,
          padding: "8px 12px",
          //fontSize: 11,
          border: `1px solid ${commitError ? colors.error : colors.border}`,
          borderRadius: 6,
          outline: "none",
          background: colors.bgSurface,
          color: colors.text,
          fontFamily: "var(--font-sans)",
          boxSizing: "border-box",
          transition: "border-color 0.15s",
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = commitError ? colors.error : colors.primary;
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = commitError ? colors.error : colors.border;
        }}
      />
      <SplitButton
        containerRef={splitRef}
        disabled={primaryDisabled}
        primaryLabel={
          isCommitting && pushIntent.current
            ? "Committing & pushing..."
            : "Commit & Push"
        }
        primaryIcon={
          isCommitting && pushIntent.current
            ? <Loader2 size={12} className="spin" />
            : <Upload size={12} strokeWidth={2.2} />
        }
        onPrimary={() => void doCommit(true)}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen((o) => !o)}
        menuItem={{
          label: isCommitting && !pushIntent.current ? "Committing..." : "Commit only",
          icon: isCommitting && !pushIntent.current
            ? <Loader2 size={12} className="spin" />
            : <GitCommit size={12} strokeWidth={2.2} />,
          onSelect: () => { setMenuOpen(false); void doCommit(false); },
          disabled: primaryDisabled,
        }}
      />
    </>
  );

  /* ── Render ── */
  return (
    <BaseDialog
      title="Commit changes"
      icon={<GitCommit size={16} color={colors.primary} strokeWidth={2} />}
      width={680}
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
        <p style={{ 
          //fontSize: 11, 
          color: colors.textSecondary, margin: 0 }}>
          No changes to commit on <strong style={{ color: colors.text }}>{currentBranch}</strong>.
        </p>
      ) : (
        /* Flex column that fills the scrollable body — file list grows, commit input pinned to bottom. */
        <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
          {/* Files header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexShrink: 0 }}>
            <SectionHeader style={{ marginBottom: 0 }}>
              Files ({files.length})
            </SectionHeader>
            <button
              type="button"
              onClick={toggleAll}
              style={{
                //fontSize: 11,
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

          {/* File list — grows to fill available space */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              border: `1px solid ${colors.border}`,
              borderRadius: 6,
              padding: 4,
              background: colors.bgSurface,
              marginBottom: 12,
            }}
          >
            {groups.map((group) => (
              <div key={group.title} style={{ marginBottom: 4 }}>
                <div
                  style={{
                    //fontSize: 10,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    color: colors.textTertiary,
                    padding: "6px 8px 2px",
                  }}
                >
                  {group.title}
                </div>
                <FileChangesList
                  files={group.files}
                  basePath={repoPath}
                  selectedKeys={selected}
                  onToggleSelect={toggleFile}
                  keyOf={fileKey}
                />
              </div>
            ))}
          </div>

          {/* Inline hint + error — sits between the file list and the footer's message input */}
          {!hasUpstream && (
            <p style={{ 
              //fontSize: 11, 
              color: colors.textTertiary, marginTop: 0, marginBottom: 0, lineHeight: 1.5, flexShrink: 0 }}>
              Branch <strong style={{ color: colors.textSecondary }}>{currentBranch}</strong> has no upstream.
              Pushing will set <code style={{ fontFamily: "var(--font-sans)" }}>origin/{currentBranch}</code> as upstream.
            </p>
          )}

          <FormError message={commitError} />
        </div>
      )}
    </BaseDialog>
  );
}

/* ══════════════════════════════════════════
 * SplitButton — primary action + dropdown chevron for alternate actions.
 *
 * Layout: [ primary action | ▾ ]  with a subtle divider between halves.
 * Visual language matches PrimaryButton so it reads as one unit.
 * ══════════════════════════════════════════ */

type SplitButtonProps = {
  /** Ref on the outer container — used by the parent for click-outside handling. */
  containerRef: React.Ref<HTMLDivElement>;
  primaryLabel: React.ReactNode;
  primaryIcon?: React.ReactNode;
  onPrimary: () => void;
  disabled: boolean;
  menuOpen: boolean;
  onToggleMenu: () => void;
  menuItem: {
    label: React.ReactNode;
    icon?: React.ReactNode;
    onSelect: () => void;
    disabled?: boolean;
  };
};

function SplitButton({
  containerRef,
  primaryLabel,
  primaryIcon,
  onPrimary,
  disabled,
  menuOpen,
  onToggleMenu,
  menuItem,
}: SplitButtonProps): React.ReactElement {
  const baseBg = disabled ? colors.textTertiary : colors.primary;
  const cursor = disabled ? "default" : "pointer";

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-flex" }}>
      {/* Primary half */}
      <button
        type="button"
        onClick={() => { if (!disabled) onPrimary(); }}
        disabled={disabled}
        style={{
          padding: "5px 10px",
          //fontSize: 11,
          fontWeight: 600,
          color: colors.textWhite,
          background: baseBg,
          border: "none",
          borderTopLeftRadius: 6,
          borderBottomLeftRadius: 6,
          cursor,
          fontFamily: "var(--font-sans)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {primaryIcon}
        {primaryLabel}
      </button>

      {/* Divider */}
      <div
        aria-hidden
        style={{
          width: 1,
          background: "rgba(255,255,255,0.25)",
          alignSelf: "stretch",
          pointerEvents: "none",
        }}
      />

      {/* Chevron half */}
      <button
        type="button"
        onClick={() => { if (!disabled) onToggleMenu(); }}
        disabled={disabled}
        aria-label="More commit options"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        style={{
          padding: "7px 8px",
          background: baseBg,
          border: "none",
          borderTopRightRadius: 6,
          borderBottomRightRadius: 6,
          cursor,
          color: colors.textWhite,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ChevronDown size={14} strokeWidth={2.2} />
      </button>

      {/* Menu */}
      {menuOpen && (
        <div
          role="menu"
          style={{
            position: "absolute",
            bottom: "calc(100% + 6px)",
            right: 0,
            minWidth: 180,
            background: colors.bgSurface,
            border: `1px solid ${colors.border}`,
            borderRadius: 6,
            boxShadow: colors.shadowPopover,
            padding: 4,
            zIndex: 10000,
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={menuItem.onSelect}
            disabled={menuItem.disabled}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              //fontSize: 11,
              fontWeight: 500,
              color: colors.text,
              background: "transparent",
              border: "none",
              borderRadius: 4,
              cursor: menuItem.disabled ? "default" : "pointer",
              textAlign: "left",
              fontFamily: "var(--font-sans)",
              opacity: menuItem.disabled ? 0.5 : 1,
            }}
            onMouseEnter={(e) => { if (!menuItem.disabled) e.currentTarget.style.background = colors.bgHover; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            {menuItem.icon}
            {menuItem.label}
          </button>
        </div>
      )}
    </div>
  );
}
