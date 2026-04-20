/**
 * ExtensionsNavView — left-sidebar section for the Extensions group.
 *
 * Shows two radio rows: User (~/.claude) / Repo (.claude). Switching rows
 * updates the scope in the mock store, which also repoints the category
 * tabs + list in the center Extensions Browser.
 */

import React from "react";
import { Home, FolderOpen } from "lucide-react";

import { colors } from "../../utils/colors";
import { ScrollableText } from "../common/ScrollableText";
import { useExtensionsMockStore } from "./extensionsMockStore";
import type { ExtensionScope } from "./mockData";

type ScopeRow = {
  id: ExtensionScope;
  label: string;
  sublabel: string;
  icon: React.ReactNode;
};

const SCOPES: ScopeRow[] = [
  {
    id: "user",
    label: "User",
    sublabel: "~/.claude",
    icon: <Home size={14} strokeWidth={1.8} />,
  },
  {
    id: "repo",
    label: "Repo",
    sublabel: ".claude · .mcp.json",
    icon: <FolderOpen size={14} strokeWidth={1.8} />,
  },
];

export function ExtensionsNavView(): React.ReactElement {
  const scope = useExtensionsMockStore((s) => s.scope);
  const setScope = useExtensionsMockStore((s) => s.setScope);

  return (
    <div style={{ padding: "4px 0" }}>
      {SCOPES.map((row) => {
        const active = scope === row.id;
        return (
          <button
            key={row.id}
            type="button"
            onClick={() => setScope(row.id)}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "6px 12px",
              background: active ? colors.bgHover : "transparent",
              border: "none",
              borderLeft: `2px solid ${active ? colors.primary : "transparent"}`,
              cursor: "pointer",
              textAlign: "left",
              color: active ? colors.text : colors.textMuted,
              fontSize: 12,
              transition: "background 120ms",
            }}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.background = colors.bgMuted;
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.background = "transparent";
            }}
          >
            <span
              style={{
                display: "inline-flex",
                color: active ? colors.primary : colors.iconNeutral,
                flexShrink: 0,
              }}
            >
              {row.icon}
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
              <span style={{ fontWeight: active ? 600 : 500 }}>{row.label}</span>
              <ScrollableText
                style={{
                  fontSize: 10,
                  color: colors.textTertiary,
                  fontFamily: "'SF Mono', 'Fira Code', ui-monospace, monospace",
                }}
              >
                {row.sublabel}
              </ScrollableText>
            </span>
          </button>
        );
      })}
    </div>
  );
}
