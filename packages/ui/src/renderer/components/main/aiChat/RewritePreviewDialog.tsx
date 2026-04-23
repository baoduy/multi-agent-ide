import React from "react";
import { colors } from "../../../utils/colors";
import { BaseDialog } from "../../common/BaseDialog";
import { CancelButton } from "../../common/DialogButtons";

/**
 * Two-pane "before / after" preview for the **Edit selection** apply path.
 * The user sees the original selected text side-by-side with the AI's
 * proposed replacement and chooses **Apply** or **Cancel**.
 *
 * Intentionally not a full diff viewer — that file is tied to git refs,
 * and a side-by-side render is easier to scan for short selections.
 */
export interface RewritePreviewDialogProps {
  isOpen: boolean;
  original: string;
  proposed: string;
  onApply: () => void;
  onCancel: () => void;
}

export function RewritePreviewDialog({
  isOpen,
  original,
  proposed,
  onApply,
  onCancel,
}: RewritePreviewDialogProps): React.ReactElement | null {
  if (!isOpen) return null;
  return (
    <BaseDialog
      title="Review proposed edit"
      width={720}
      maxHeight="60vh"
      scrollable
      onClose={onCancel}
      footer={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", width: "100%" }}>
          <CancelButton onClick={onCancel}>Cancel</CancelButton>
          <button
            type="button"
            onClick={onApply}
            style={{
              padding: "6px 14px",
              fontSize: 12,
              fontWeight: 500,
              background: colors.primary,
              color: "white",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Apply
          </button>
        </div>
      }
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Pane label="Current" variant="removed" content={original} />
        <Pane label="Proposed" variant="added" content={proposed} />
      </div>
    </BaseDialog>
  );
}

function Pane({
  label,
  variant,
  content,
}: {
  label: string;
  variant: "removed" | "added";
  content: string;
}): React.ReactElement {
  const bg =
    variant === "removed"
      ? "color-mix(in srgb, var(--destructive) 8%, transparent)"
      : "color-mix(in srgb, var(--primary) 10%, transparent)";
  const border =
    variant === "removed"
      ? "color-mix(in srgb, var(--destructive) 30%, transparent)"
      : "color-mix(in srgb, var(--primary) 35%, transparent)";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: colors.textMuted,
        }}
      >
        {label}
      </span>
      <pre
        style={{
          margin: 0,
          padding: 10,
          background: bg,
          border: `1px solid ${border}`,
          borderRadius: 4,
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          maxHeight: "40vh",
          overflow: "auto",
        }}
      >
        {content || <span style={{ color: colors.textTertiary }}>(empty)</span>}
      </pre>
    </div>
  );
}
