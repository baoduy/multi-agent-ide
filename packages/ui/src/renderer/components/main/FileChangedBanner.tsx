import React, { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { colors } from "../../utils/colors";

export type FileChangedAction = "use-mine" | "take-disk";

type FileChangedBannerProps = {
  /** The user's in-editor content. */
  ours: string;
  /** The new content on disk. */
  theirs: string;
  /** Called when the user picks a resolution. */
  onAction: (action: FileChangedAction) => void;
};

/**
 * Shown above the editor when the file-watcher observes a disk change that
 * the 3-way merge can't reconcile with the user's unsaved edits. Offers
 * three actions:
 *   - Use mine — keep the in-editor buffer; the parent rebases future merges
 *     against the new disk content.
 *   - Take disk — discard unsaved edits and load the new content.
 *   - Diff — open a modal showing the two versions side-by-side (view only).
 *
 * Kept intentionally small — no conflict-region highlighting, no 3-way
 * resolver UI. If that becomes needed we'll reach for a full merge dialog
 * in a follow-up.
 */
export function FileChangedBanner({
  ours,
  theirs,
  onAction,
}: FileChangedBannerProps): React.ReactElement {
  const [diffOpen, setDiffOpen] = useState(false);

  return (
    <>
      <div
        role="alert"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "8px 12px",
          background: colors.warningSoft,
          borderBottom: `1px solid ${colors.warningBorder}`,
          color: colors.warningTextStrong,
          fontSize: 11,
          flexShrink: 0,
        }}
      >
        <AlertTriangle size={14} />
        <span style={{ flex: 1 }}>
          This file changed on disk and has edits that conflict with yours.
        </span>
        <BannerButton onClick={() => onAction("use-mine")}>Use mine</BannerButton>
        <BannerButton onClick={() => onAction("take-disk")}>Take disk</BannerButton>
        <BannerButton onClick={() => setDiffOpen(true)}>Diff</BannerButton>
      </div>
      {diffOpen && (
        <DiffModal
          ours={ours}
          theirs={theirs}
          onClose={() => setDiffOpen(false)}
        />
      )}
    </>
  );
}

function BannerButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}): React.ReactElement {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding: "4px 10px",
        fontSize: 11,
        fontWeight: 500,
        color: colors.warningTextDeep,
        background: hover ? colors.warningBorderSoft : "transparent",
        border: `1px solid ${colors.warningBorder}`,
        borderRadius: 4,
        cursor: "pointer",
        transition: "background 0.15s",
      }}
    >
      {children}
    </button>
  );
}

/**
 * Side-by-side view of the user's buffer vs. the new disk content. Read-only
 * by design — resolution goes through the banner buttons, not inside the
 * modal. If we later need in-place conflict editing we'll swap this for
 * `react-codemirror-merge` which is already a dependency.
 */
function DiffModal({
  ours,
  theirs,
  onClose,
}: {
  ours: string;
  theirs: string;
  onClose: () => void;
}): React.ReactElement {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: colors.backdropBg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(900px, 92vw)",
          height: "min(600px, 80vh)",
          background: colors.dialogBg,
          borderRadius: 8,
          boxShadow: colors.dialogShadow,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "8px 12px",
            borderBottom: `1px solid ${colors.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: colors.text }}>
            File changed on disk
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              fontSize: 11,
              color: colors.textTertiary,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "2px 6px",
            }}
          >
            Close
          </button>
        </div>
        <div
          style={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            minHeight: 0,
          }}
        >
          <DiffPane label="Your version" content={ours} />
          <DiffPane label="On disk" content={theirs} borderLeft />
        </div>
      </div>
    </div>
  );
}

function DiffPane({
  label,
  content,
  borderLeft,
}: {
  label: string;
  content: string;
  borderLeft?: boolean;
}): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        borderLeft: borderLeft ? `1px solid ${colors.border}` : undefined,
      }}
    >
      <div
        style={{
          padding: "6px 10px",
          fontSize: 10,
          fontWeight: 600,
          color: colors.textTertiary,
          background: colors.bgMuted,
          borderBottom: `1px solid ${colors.border}`,
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        {label}
      </div>
      <pre
        style={{
          flex: 1,
          margin: 0,
          padding: "8px 12px",
          overflow: "auto",
          fontFamily: "var(--font-mono, monospace)",
          fontSize: 11,
          lineHeight: 1.5,
          color: colors.text,
          background: colors.bgSurface,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {content}
      </pre>
    </div>
  );
}
