import React from "react";

type StatusBadgeProps = {
  text: string;
  color: string;
  background: string;
  borderColor?: string;
  icon?: React.ReactNode;
  fontSize?: number;
  fontWeight?: number;
  padding?: string;
  borderRadius?: number;
  letterSpacing?: string;
  uppercase?: boolean;
  style?: React.CSSProperties;
};

export function StatusBadge({
  text,
  color,
  background,
  borderColor,
  icon,
  fontSize = 10,
  fontWeight = 600,
  padding = "2px 8px",
  borderRadius = 4,
  letterSpacing,
  uppercase = false,
  style,
}: StatusBadgeProps): React.ReactElement {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize,
        fontWeight,
        color,
        background,
        padding,
        borderRadius,
        border: borderColor ? `1px solid ${borderColor}` : undefined,
        letterSpacing,
        textTransform: uppercase ? "uppercase" : undefined,
        ...style,
      }}
    >
      {icon}
      {text}
    </span>
  );
}