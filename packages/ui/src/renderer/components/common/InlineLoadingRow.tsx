import React from "react";
import { Loader2 } from "lucide-react";

import { colors } from "../../utils/colors";

type InlineLoadingRowProps = {
  label: React.ReactNode;
  size?: number;
  strokeWidth?: number;
  padding?: string;
  gap?: number;
  fontSize?: number;
  color?: string;
  style?: React.CSSProperties;
};

export function InlineLoadingRow({
  label,
  size = 14,
  strokeWidth = 2,
  padding = "12px 0",
  gap = 8,
  fontSize = 12,
  color = colors.textTertiary,
  style,
}: InlineLoadingRowProps): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap,
        color,
        fontSize,
        padding,
        ...style,
      }}
    >
      <Loader2 size={size} strokeWidth={strokeWidth} className="spin" />
      <span>{label}</span>
    </div>
  );
}