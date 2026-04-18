import React, { useCallback } from "react";

import type { ComponentDensity } from "@magenta/shared/models";
import { colors } from "../../utils/colors";
import { useSessionStore } from "../../store/sessionStore";

type DensityOption = {
  value: ComponentDensity;
  label: string;
  hint: string;
};

const OPTIONS: readonly DensityOption[] = [
  { value: "xs", label: "Compact", hint: "xs" },
  { value: "sm", label: "Comfortable", hint: "sm" },
];

/**
 * Settings section for adjusting the global UI density. The choice is
 * persisted via sessionStore (localStorage) and consumed through the
 * `useComponentSize` hook by size-aware components.
 */
export function AppearanceSettings(): React.ReactElement {
  const density = useSessionStore((s) => s.componentDensity);
  const patchSession = useSessionStore((s) => s.patchSession);

  const handleSelect = useCallback(
    (value: ComponentDensity) => {
      if (value === density) return;
      patchSession({ componentDensity: value });
    },
    [density, patchSession],
  );

  return (
    <div>
      <h3 style={{ margin: "0 0 6px 0", fontSize: 12, fontWeight: 600, color: colors.textStrong }}>
        Appearance
      </h3>
      <p style={{ margin: "0 0 8px 0", fontSize: 11, color: colors.textMuted, lineHeight: 1.5 }}>
        Choose a compact or comfortable size for labels, badges, and buttons across the app.
      </p>

      <div
        role="radiogroup"
        aria-label="UI density"
        style={{
          display: "inline-flex",
          border: `1px solid ${colors.border}`,
          borderRadius: 5,
          overflow: "hidden",
          background: colors.bgSurface,
        }}
      >
        {OPTIONS.map((opt, idx) => {
          const selected = density === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => handleSelect(opt.value)}
              style={{
                padding: "4px 12px",
                fontSize: 11,
                fontWeight: 500,
                color: selected ? colors.textStrong : colors.textMuted,
                background: selected ? colors.bgHover : "transparent",
                border: "none",
                borderLeft: idx === 0 ? "none" : `1px solid ${colors.border}`,
                cursor: "pointer",
                outline: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>{opt.label}</span>
              <span style={{ fontSize: 10, color: colors.textTertiary }}>({opt.hint})</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
