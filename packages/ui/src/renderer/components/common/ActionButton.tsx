import React, { useState } from "react";
import { Loader2 } from "lucide-react";

import { colors } from "../../utils/colors";

type ActionButtonVariant = "primary" | "secondary" | "danger" | "ghost";

type ActionButtonProps = {
  onClick: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  loadingText?: string;
  variant?: ActionButtonVariant;
  padding?: string;
  fontSize?: number;
  fontWeight?: number;
  borderRadius?: number;
  gap?: number;
  color?: string;
  background?: string;
  borderColor?: string;
  hoverColor?: string;
  hoverBackground?: string;
  justifyContent?: React.CSSProperties["justifyContent"];
  style?: React.CSSProperties;
};

type ActionButtonPalette = {
  color: string;
  background: string;
  borderColor: string | "transparent";
  hoverColor?: string;
  hoverBackground?: string;
};

function getPalette(variant: ActionButtonVariant): ActionButtonPalette {
  switch (variant) {
    case "danger":
      return {
        color: colors.textWhite,
        background: colors.errorDark,
        borderColor: "transparent",
      };
    case "secondary":
      return {
        color: colors.textMuted,
        background: colors.bgSurface,
        borderColor: colors.border,
        hoverBackground: colors.bgHover,
      };
    case "ghost":
      return {
        color: colors.textSecondary,
        background: "transparent",
        borderColor: colors.border,
        hoverColor: colors.primary,
        hoverBackground: colors.bgHover,
      };
    case "primary":
    default:
      return {
        color: colors.textWhite,
        background: colors.primary,
        borderColor: "transparent",
      };
  }
}

export function ActionButton({
  onClick,
  children,
  icon,
  disabled = false,
  loading = false,
  loadingText,
  variant = "primary",
  padding = "7px 16px",
  fontSize = 12,
  fontWeight = 600,
  borderRadius = 6,
  gap = 6,
  color,
  background,
  borderColor,
  hoverColor,
  hoverBackground,
  justifyContent,
  style,
}: ActionButtonProps): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const isDisabled = disabled || loading;
  const palette = getPalette(variant);
  const resolvedColor = color ?? palette.color;
  const resolvedBackground = background ?? palette.background;
  const resolvedBorderColor = borderColor ?? palette.borderColor;
  const resolvedHoverColor = hoverColor ?? palette.hoverColor;
  const resolvedHoverBackground = hoverBackground ?? palette.hoverBackground;

  return (
    <button
      type="button"
      onClick={() => {
        if (!isDisabled) onClick();
      }}
      disabled={isDisabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding,
        fontSize,
        fontWeight,
        color: hovered && !isDisabled && resolvedHoverColor ? resolvedHoverColor : resolvedColor,
        background: hovered && !isDisabled && resolvedHoverBackground ? resolvedHoverBackground : (isDisabled ? colors.borderMuted : resolvedBackground),
        border: resolvedBorderColor === "transparent" ? "none" : `1px solid ${resolvedBorderColor}`,
        borderRadius,
        cursor: isDisabled ? "not-allowed" : "pointer",
        fontFamily: "inherit",
        display: "inline-flex",
        alignItems: "center",
        justifyContent,
        gap,
        transition: "background 0.15s, color 0.15s, border-color 0.15s",
        ...style,
      }}
    >
      {loading ? <Loader2 size={12} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} /> : icon}
      {loading && loadingText ? loadingText : children}
    </button>
  );
}