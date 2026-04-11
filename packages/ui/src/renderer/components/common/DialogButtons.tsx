import React from "react";
import { Loader2 } from "lucide-react";

import { colors } from "../../utils/colors";

type CancelButtonProps = {
  onClick: () => void;
  children?: React.ReactNode;
};

/** Standard cancel/secondary button for dialog footers. */
export function CancelButton({ onClick, children = "Cancel" }: CancelButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "7px 16px",
        fontSize: 12,
        fontWeight: 500,
        color: colors.textSecondary,
        background: colors.bgMuted,
        border: `1px solid ${colors.border}`,
        borderRadius: 6,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  );
}

type PrimaryButtonProps = {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string;
  color?: string;
  children: React.ReactNode;
};

/** Standard primary action button for dialog footers. */
export function PrimaryButton({
  onClick,
  disabled = false,
  loading = false,
  loadingText,
  color: bgColor = colors.primary,
  children,
}: PrimaryButtonProps): React.ReactElement {
  const isDisabled = disabled || loading;

  return (
    <button
      type="button"
      onClick={() => { if (!isDisabled) onClick(); }}
      disabled={isDisabled}
      style={{
        padding: "7px 16px",
        fontSize: 12,
        fontWeight: 600,
        color: "#fff",
        background: isDisabled ? colors.textTertiary : bgColor,
        border: "none",
        borderRadius: 6,
        cursor: isDisabled ? "default" : "pointer",
        fontFamily: "inherit",
        display: "flex",
        alignItems: "center",
        gap: 6,
        opacity: loading ? 0.7 : 1,
      }}
    >
      {loading && (
        <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
      )}
      {loading && loadingText ? loadingText : children}
    </button>
  );
}

type DangerButtonProps = {
  onClick: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
};

/** Red/danger action button for cancel operations. */
export function DangerButton({ onClick, children, icon }: DangerButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "7px 16px",
        fontSize: 12,
        fontWeight: 500,
        color: colors.errorDark,
        background: "#fef2f2",
        border: "1px solid #fecaca",
        borderRadius: 6,
        cursor: "pointer",
        fontFamily: "inherit",
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {icon}
      {children}
    </button>
  );
}

type SecondaryButtonProps = {
  onClick: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
};

/** Secondary action button with icon support (e.g. "Run in Background"). */
export function SecondaryButton({ onClick, children, icon }: SecondaryButtonProps): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "7px 16px",
        fontSize: 12,
        fontWeight: 500,
        color: colors.textSecondary,
        background: colors.bgMuted,
        border: `1px solid ${colors.border}`,
        borderRadius: 6,
        cursor: "pointer",
        fontFamily: "inherit",
        display: "flex",
        alignItems: "center",
        gap: 6,
      }}
    >
      {icon}
      {children}
    </button>
  );
}
