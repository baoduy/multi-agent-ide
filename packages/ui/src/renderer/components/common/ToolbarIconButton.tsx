import React from "react";
import { colors } from "../../utils/colors";

/**
 * Icon + label toolbar button. Replaces the recurring pattern of:
 *
 *   <button style={{
 *     display: "flex", alignItems: "center", gap: 3,
 *     padding: "0 5px", borderRadius: 3, border: "none",
 *     background: hovered ? colors.bgHover : "transparent",
 *     color: disabled ? colors.textMuted : active ? colors.textStrong : colors.textTertiary,
 *     cursor: disabled ? "default" : "pointer",
 *     fontSize: 11, opacity: disabled ? 0.5 : 1,
 *     transition: "background 0.1s, color 0.1s, opacity 0.1s",
 *     fontFamily: "var(--font-sans)",
 *   }} />
 *
 * Hover state is pure CSS so callers don't need `useState`.
 */
type ToolbarIconButtonProps = Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  disabledHint?: string;
  showLabel?: boolean;
};

export function ToolbarIconButton({
  icon,
  label,
  active = false,
  disabled = false,
  disabledHint,
  showLabel = true,
  title,
  style,
  ...rest
}: ToolbarIconButtonProps) {
  const resolvedTitle =
    title ?? (disabled && disabledHint ? `${label} (${disabledHint})` : label);

  return (
    <button
      type="button"
      title={resolvedTitle}
      disabled={disabled}
      className="toolbar-icon-btn"
      data-active={active ? "true" : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--gap-tight)",
        padding: "0 5px",
        borderRadius: "var(--radius-xs)",
        border: "none",
        background: "transparent",
        color: disabled
          ? colors.textMuted
          : active
            ? colors.textStrong
            : colors.textTertiary,
        cursor: disabled ? "default" : "pointer",
        fontSize: "var(--font-sm)",
        opacity: disabled ? 0.5 : 1,
        transition: "background 0.1s, color 0.1s, opacity 0.1s",
        fontFamily: "var(--font-sans)",
        ...style,
      }}
      {...rest}
    >
      {icon}
      {showLabel ? <span>{label}</span> : null}
    </button>
  );
}
