/**
 * ExtensionsBrowserView — center tab for the Extensions group.
 *
 * Category tab bar + search input + scrollable list of rows for the
 * currently selected (scope, category).
 */

import React from "react";
import { Search } from "lucide-react";

import { colors } from "../../utils/colors";
import {
  computeVisibleItems,
  useExtensionsMockStore,
} from "./extensionsMockStore";
import {
  categoriesForScope,
  mockKey,
  MOCK,
  type ExtensionCategory,
} from "./mockData";
import { ExtensionRow } from "./ExtensionRow";

const CATEGORY_LABELS: Record<ExtensionCategory, string> = {
  plugins: "Plugins",
  skills: "Skills",
  agents: "Agents",
  mcp: "MCP",
};

export function ExtensionsBrowserView(): React.ReactElement {
  const scope = useExtensionsMockStore((s) => s.scope);
  const category = useExtensionsMockStore((s) => s.category);
  const setCategory = useExtensionsMockStore((s) => s.setCategory);
  const search = useExtensionsMockStore((s) => s.search);
  const setSearch = useExtensionsMockStore((s) => s.setSearch);
  const selectedItemId = useExtensionsMockStore((s) => s.selectedItemId);
  const setSelectedItemId = useExtensionsMockStore((s) => s.setSelectedItemId);
  const toggleEnabled = useExtensionsMockStore((s) => s.toggleEnabled);
  const enabledOverrides = useExtensionsMockStore((s) => s.enabledOverrides);

  const items = React.useMemo(
    () => computeVisibleItems(scope, category, search, enabledOverrides),
    [scope, category, search, enabledOverrides],
  );
  const rawCount = MOCK[mockKey(scope, category)]?.length ?? 0;
  const tabs = categoriesForScope(scope);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: colors.bgPanel,
      }}
    >
      {/* Header: title + scope caption */}
      <div
        style={{
          padding: "12px 16px 4px",
          borderBottom: `1px solid ${colors.borderLight}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: colors.text }}>
            Extensions
          </span>
          <span
            style={{
              fontSize: 11,
              color: colors.textTertiary,
              fontFamily: "'SF Mono', 'Fira Code', ui-monospace, monospace",
            }}
          >
            {scope === "user" ? "User (~/.claude)" : "Repo (.claude)"}
          </span>
          <span
            style={{
              marginLeft: "auto",
              fontSize: 10,
              color: colors.warningText,
              background: colors.warningSoft,
              padding: "2px 8px",
              borderRadius: 3,
              border: `1px solid ${colors.warningBorder}`,
            }}
            title="Mockup phase — data is hardcoded and toggles don't persist."
          >
            MOCKUP · sample data
          </span>
        </div>

        {/* Category tabs */}
        <div
          style={{
            display: "flex",
            gap: 2,
            marginTop: 10,
          }}
        >
          {tabs.map((cat) => {
            const active = cat === category;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                style={{
                  padding: "6px 12px",
                  background: "transparent",
                  border: "none",
                  borderBottom: `2px solid ${active ? colors.primary : "transparent"}`,
                  color: active ? colors.text : colors.textMuted,
                  fontSize: 12,
                  fontWeight: active ? 600 : 500,
                  cursor: "pointer",
                  transition: "color 120ms, border-color 120ms",
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.color = colors.text;
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.color = colors.textMuted;
                }}
              >
                {CATEGORY_LABELS[cat]}
                <span
                  style={{
                    marginLeft: 6,
                    color: colors.textTertiary,
                    fontVariantNumeric: "tabular-nums",
                    fontWeight: 400,
                  }}
                >
                  {MOCK[mockKey(scope, cat)]?.length ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Search */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 16px",
          borderBottom: `1px solid ${colors.borderLight}`,
        }}
      >
        <Search size={13} strokeWidth={1.8} color={colors.textTertiary} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${CATEGORY_LABELS[category].toLowerCase()}…`}
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: colors.text,
            fontSize: 12,
          }}
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            style={{
              background: "transparent",
              border: "none",
              color: colors.textTertiary,
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            Clear
          </button>
        )}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {items.length === 0 ? (
          <div
            style={{
              color: colors.textTertiary,
              fontSize: 11,
              padding: "16px",
              textAlign: "center",
            }}
          >
            {rawCount === 0
              ? emptyMessage(scope, category)
              : `No matches for "${search}".`}
          </div>
        ) : (
          items.map((item) => (
            <ExtensionRow
              key={item.id}
              item={item}
              selected={selectedItemId === item.id}
              onSelect={() => setSelectedItemId(item.id)}
              onToggleEnabled={() => toggleEnabled(scope, category, item.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function emptyMessage(scope: string, category: ExtensionCategory): string {
  if (scope === "repo" && category === "agents") return "No repo-level agents. Add files under .claude/agents/.";
  if (scope === "repo" && category === "plugins") return "Plugins are only installed at user scope (~/.claude/plugins/).";
  if (category === "plugins") return "No plugins installed.";
  if (category === "skills") return "No skills found.";
  if (category === "agents") return "No agents found.";
  return "No MCP servers configured.";
}
