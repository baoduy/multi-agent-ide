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
  /** Optional max-height when scrollable (default: 80vh) */
  maxHeight?: number | string;
  /** Optional min-height */
  minHeight?: number | string;
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
  maxHeight = "80vh",
  minHeight,
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
          backdropFilter: "blur(2px)",
          WebkitBackdropFilter: "blur(2px)",
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
          ...(minHeight !== undefined ? { minHeight } : {}),
          ...(scrollable
            ? { maxHeight, display: "flex", flexDirection: "column" as const }
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
            padding: "8px 12px 6px",
            borderBottom: `1px solid ${colors.border}`,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {icon}
            <span style={{ fontSize: 12, fontWeight: 600, color: colors.text }}>
              {title}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
            {showMinimize && onMinimize && (
              <DialogIconButton onClick={onMinimize} title="Minimize to background">
                <Minimize2 size={12} strokeWidth={2} />
              </DialogIconButton>
            )}
            <DialogIconButton onClick={handleCloseClick} title={onMinimize ? "Minimize to background" : "Close"}>
              <X size={12} strokeWidth={2} />
            </DialogIconButton>
          </div>
        </div>

        {/* Body */}
        <div
          style={{
            padding: "10px 12px",
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
              gap: 6,
              padding: "8px 12px 10px",
              borderTop: `1px solid ${colors.borderLight}`,
              flexShrink: 0,
            }}
          >
            {footer}
          </div>
        )}
      </div>
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
