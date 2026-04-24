import React from "react";
import { Loader2 } from "lucide-react";

import { colors } from "../../utils/colors";
import { useDensityTokens } from "../../hooks/useComponentSize";

type CancelButtonProps = {
  onClick: () => void;
  children?: React.ReactNode;
};

/** Standard cancel/secondary button for dialog footers. */
export function CancelButton({ onClick, children = "Cancel" }: CancelButtonProps): React.ReactElement {
  const d = useDensityTokens();
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "4px 10px",
        fontSize: d.font,
        fontWeight: 500,
        color: colors.textSecondary,
        background: colors.bgMuted,
        border: `1px solid ${colors.border}`,
        borderRadius: 4,
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
  const d = useDensityTokens();

  return (
    <button
      type="button"
      onClick={() => { if (!isDisabled) onClick(); }}
      disabled={isDisabled}
      style={{
        padding: "4px 10px",
        fontSize: d.font,
        fontWeight: 600,
        color: colors.textWhite,
        background: isDisabled ? colors.textTertiary : bgColor,
        border: "none",
        borderRadius: 4,
        cursor: isDisabled ? "default" : "pointer",
        fontFamily: "inherit",
        display: "flex",
        alignItems: "center",
        gap: 6,
        opacity: loading ? 0.7 : 1,
      }}
    >
      {loading && (
        <Loader2 size={12} className="spin" />
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
  const d = useDensityTokens();
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "4px 10px",
        fontSize: d.font,
        fontWeight: 500,
        color: colors.errorDark,
        background: colors.errorSoft,
        border: `1px solid ${colors.errorSoftBorder}`,
        borderRadius: 4,
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
  disabled?: boolean;
  title?: string;
};

/** Secondary action button with icon support (e.g. "Run in Background"). */
export function SecondaryButton({
  onClick,
  children,
  icon,
  disabled = false,
  title,
}: SecondaryButtonProps): React.ReactElement {
  const d = useDensityTokens();
  return (
    <button
      type="button"
      onClick={() => { if (!disabled) onClick(); }}
      disabled={disabled}
      title={title}
      style={{
        padding: "4px 10px",
        fontSize: d.font,
        fontWeight: 500,
        color: disabled ? colors.textTertiary : colors.textSecondary,
        background: colors.bgMuted,
        border: `1px solid ${colors.border}`,
        borderRadius: 4,
        cursor: disabled ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        display: "flex",
        alignItems: "center",
        gap: 6,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {icon}
      {children}
    </button>
  );
}
