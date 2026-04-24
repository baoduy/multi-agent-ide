import React, { useCallback } from "react";

import { colors } from "../../utils/colors";
import { useDensityTokens } from "../../hooks/useComponentSize";

export type ButtonGroupOption<T extends string = string> = {
  /** Unique key for this option (used as the value). */
  key: T;
  /** Display label. */
  label: string;
  /** Optional icon element rendered before the label. */
  icon?: React.ReactNode;
  /** Whether this option is disabled. */
  disabled?: boolean;
  /**
   * Override background color when this option is active.
   * Defaults to `colors.primary`.
   */
  activeColor?: string;
};

type ButtonGroupProps<T extends string = string> = {
  options: readonly ButtonGroupOption<T>[];
  value: T;
  onChange: (value: T) => void;
};

/**
 * Segmented button group for mutually-exclusive selections.
 *
 * Renders a single bordered row of buttons; the active segment fills
 * with the primary color (or a per-option override). Disabled segments
 * are greyed-out and non-interactive.
 */
function ButtonGroupComponent<T extends string = string>({
  options,
  value,
  onChange,
}: ButtonGroupProps<T>): React.ReactElement {
  const d = useDensityTokens();
  const handleClick = useCallback(
    (key: T, disabled?: boolean) => {
      if (!disabled) onChange(key);
    },
    [onChange],
  );

  return (
    <div
      style={{
        display: "flex",
        border: `1px solid ${colors.border}`,
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      {options.map((opt, i) => {
        const isActive = value === opt.key;
        const bg = isActive ? (opt.activeColor ?? colors.primary) : colors.bgSurface;
        const fg = isActive ? colors.textWhite : opt.disabled ? colors.textTertiary : colors.textSecondary;

        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => handleClick(opt.key, opt.disabled)}
            disabled={opt.disabled}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 4,
              padding: "4px 8px",
              cursor: opt.disabled ? "not-allowed" : "pointer",
              border: "none",
              borderRight: i < options.length - 1 ? `1px solid ${colors.border}` : "none",
              background: bg,
              color: fg,
              fontSize: d.font,
              fontWeight: 500,
              fontFamily: "inherit",
              opacity: opt.disabled ? 0.4 : 1,
              transition: "background 0.12s, color 0.12s",
            }}
          >
            {opt.icon && (
              <span style={{ display: "flex", alignItems: "center", color: fg }}>
                {opt.icon}
              </span>
            )}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export const ButtonGroup = React.memo(ButtonGroupComponent) as typeof ButtonGroupComponent;
