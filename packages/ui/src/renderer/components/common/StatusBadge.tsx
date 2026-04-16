import React from "react";

import { Tag } from "./Tag";

/* ══════════════════════════════════════════
 * StatusBadge — legacy raw-colour API preserved as a thin wrapper over
 * the unified `Tag` primitive. New code should import `Tag` directly and
 * prefer named `tone` props; this shim exists only so existing callers
 * (FileStatusBadge, AISessionListItem, …) keep working without churn.
 * ══════════════════════════════════════════ */

export type StatusBadgeProps = {
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
    <Tag
      text={text}
      color={color}
      bg={background}
      borderColor={borderColor}
      icon={icon}
      fontSize={fontSize}
      fontWeight={fontWeight}
      padding={padding}
      borderRadius={borderRadius}
      letterSpacing={letterSpacing}
      uppercase={uppercase}
      style={style}
    />
  );
}
