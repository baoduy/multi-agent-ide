/**
 * ExtensionsSummaryView — left-sidebar section that shows item counts for
 * the currently selected scope, broken down by category. Clicking a row
 * sets the Browser's active category tab.
 */

import React from "react";

import { colors } from "../../utils/colors";
import { useExtensionsMockStore } from "./extensionsMockStore";
import {
  categoriesForScope,
  MOCK,
  mockKey,
  type ExtensionCategory,
} from "./mockData";

const CATEGORY_LABELS: Record<ExtensionCategory, string> = {
  plugins: "Plugins",
  skills: "Skills",
  agents: "Agents",
  mcp: "MCP Servers",
};

export function ExtensionsSummaryView(): React.ReactElement {
  const scope = useExtensionsMockStore((s) => s.scope);
  const category = useExtensionsMockStore((s) => s.category);
  const setCategory = useExtensionsMockStore((s) => s.setCategory);

  const rows = categoriesForScope(scope).map((cat) => ({
    cat,
    count: MOCK[mockKey(scope, cat)]?.length ?? 0,
  }));

  return (
    <div style={{ padding: "4px 0" }}>
      {rows.map(({ cat, count }) => {
        const active = cat === category;
        return (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "5px 12px",
              background: active ? colors.bgHover : "transparent",
              border: "none",
              cursor: "pointer",
              textAlign: "left",
              color: active ? colors.text : colors.textMuted,
              fontSize: 11,
              transition: "background 120ms",
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.background = colors.bgMuted;
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.background = "transparent";
            }}
          >
            <span style={{ fontWeight: active ? 600 : 400 }}>{CATEGORY_LABELS[cat]}</span>
            <span
              style={{
                fontFamily: "'SF Mono', 'Fira Code', ui-monospace, monospace",
                color: count === 0 ? colors.textTertiary : colors.text,
                fontSize: 11,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
