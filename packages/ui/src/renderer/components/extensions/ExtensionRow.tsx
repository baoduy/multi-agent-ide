/**
 * ExtensionRow — one row in the Extensions Browser list.
 *
 * Shows a checkbox (enable toggle), name + version, subtitle, and the
 * truncated path below. Clicking the row selects it for the Inspector;
 * clicking the checkbox stops propagation and toggles enabled.
 */

import React from "react";

import { colors } from "../../utils/colors";
import { ScrollableText } from "../common/ScrollableText";
import type { ExtensionItem } from "./mockData";

type ExtensionRowProps = {
  item: ExtensionItem;
  selected: boolean;
  onSelect: () => void;
  onToggleEnabled: () => void;
};

export function ExtensionRow({
  item,
  selected,
  onSelect,
  onToggleEnabled,
}: ExtensionRowProps): React.ReactElement {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 14px",
        background: selected ? colors.bgHover : "transparent",
        borderLeft: `2px solid ${selected ? colors.primary : "transparent"}`,
        borderBottom: `1px solid ${colors.borderLight}`,
        cursor: "pointer",
        transition: "background 120ms",
      }}
      onMouseEnter={(e) => {
        if (!selected) e.currentTarget.style.background = colors.bgMuted;
      }}
      onMouseLeave={(e) => {
        if (!selected) e.currentTarget.style.background = "transparent";
      }}
    >
      <input
        type="checkbox"
        checked={item.enabled}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          e.stopPropagation();
          onToggleEnabled();
        }}
        style={{
          marginTop: 2,
          cursor: "pointer",
          accentColor: colors.primary,
          flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0 }}>
          <ScrollableText
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: item.enabled ? colors.text : colors.textTertiary,
            }}
          >
            {item.name}
          </ScrollableText>
          {item.version && (
            <span
              style={{
                fontSize: 11,
                color: colors.textTertiary,
                fontFamily: "'SF Mono', 'Fira Code', ui-monospace, monospace",
                flexShrink: 0,
              }}
            >
              v{item.version}
            </span>
          )}
        </div>
        {item.subtitle && (
          <ScrollableText
            style={{
              fontSize: 11,
              color: item.enabled ? colors.textMuted : colors.textTertiary,
            }}
          >
            {item.subtitle}
          </ScrollableText>
        )}
        <ScrollableText
          style={{
            fontSize: 10,
            color: colors.textTertiary,
            fontFamily: "'SF Mono', 'Fira Code', ui-monospace, monospace",
          }}
          title={item.path}
        >
          {item.path}
        </ScrollableText>
      </div>
    </div>
  );
}
