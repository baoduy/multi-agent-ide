import React, { useCallback, useEffect } from "react";
import { X, Minimize2 } from "lucide-react";

import { colors } from "../../utils/colors";

type BaseDialogProps = {
  /** Dialog title displayed in the header */
  title: string;
  /** Icon element rendered before the title */
  icon?: React.ReactNode;
  /** Dialog width in pixels (default: 440) */
  width?: number;
  /** Whether to constrain max height and allow scrolling */
  scrollable?: boolean;
  /** Dialog body content */
  children: React.ReactNode;
  /** Footer content (buttons etc.) */
  footer?: React.ReactNode;
  /** Called when the dialog should close */
  onClose: () => void;
  /** Optional: called when clicking backdrop or pressing Escape while running (minimizes instead of closing) */
  onMinimize?: () => void;
  /** Whether to show the minimize button in the header */
  showMinimize?: boolean;
  /** aria-label for the dialog */
  ariaLabel?: string;
};

/**
 * Shared modal dialog shell with backdrop, centered container, header with close button,
 * and optional footer. Handles Escape key and backdrop click.
 */
export function BaseDialog({
  title,
  icon,
  width = 440,
  scrollable = false,
  children,
  footer,
  onClose,
  onMinimize,
  showMinimize = false,
  ariaLabel,
}: BaseDialogProps): React.ReactElement {
  const handleBackdropClick = onMinimize ?? onClose;
  const handleCloseClick = onMinimize ?? onClose;

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        (onMinimize ?? onClose)();
      }
    },
    [onMinimize, onClose],
  );

  // Also handle Escape at the window level for cases where focus isn't in the dialog
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        (onMinimize ?? onClose)();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onMinimize, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleBackdropClick}
        style={{
          position: "fixed",
          inset: 0,
          background: colors.backdropBg,
          zIndex: 9998,
        }}
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-label={ariaLabel ?? title}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          background: colors.dialogBg,
          borderRadius: 12,
          boxShadow: colors.dialogShadow,
          width,
          maxWidth: "90vw",
          ...(scrollable
            ? { maxHeight: "80vh", display: "flex", flexDirection: "column" as const }
            : {}),
          zIndex: 9999,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px 12px",
            borderBottom: `1px solid ${colors.border}`,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {icon}
            <span style={{ fontSize: 14, fontWeight: 600, color: colors.text }}>
              {title}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {showMinimize && onMinimize && (
              <DialogIconButton onClick={onMinimize} title="Minimize to background">
                <Minimize2 size={13} strokeWidth={2} />
              </DialogIconButton>
            )}
            <DialogIconButton onClick={handleCloseClick} title={onMinimize ? "Minimize to background" : "Close"}>
              <X size={14} strokeWidth={2} />
            </DialogIconButton>
          </div>
        </div>

        {/* Body */}
        <div
          style={{
            padding: "16px 20px",
            ...(scrollable ? { flex: 1, overflowY: "auto" as const, minHeight: 100 } : {}),
          }}
        >
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              padding: "12px 20px 16px",
              borderTop: `1px solid ${colors.borderLight}`,
              flexShrink: 0,
            }}
          >
            {footer}
          </div>
        )}
      </div>

      {/* Spinner keyframe (shared by all dialogs) */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

/* ── Reusable small components ── */

/** Icon-sized button used for close / minimize in the dialog header */
function DialogIconButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 24,
        height: 24,
        borderRadius: 4,
        border: "none",
        background: "transparent",
        cursor: "pointer",
        color: colors.textTertiary,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = colors.bgHover; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {children}
    </button>
  );
}
