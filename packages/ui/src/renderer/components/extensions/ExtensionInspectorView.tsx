/**
 * ExtensionInspectorView — right-sidebar detail panel for the selected
 * extension item. Read-only in the mockup phase; action buttons log to
 * console so the wiring is demonstrable but harmless.
 */

import React from "react";
import { FolderOpen, FileText } from "lucide-react";

import { colors } from "../../utils/colors";
import { useExtensionsMockStore, selectVisibleItems } from "./extensionsMockStore";
import type { ExtensionCategory, ExtensionScope } from "./mockData";

const TYPE_LABEL: Record<ExtensionCategory, string> = {
  plugins: "Plugin",
  skills: "Skill",
  agents: "Agent",
  mcp: "MCP Server",
};

const SCOPE_LABEL: Record<ExtensionScope, string> = {
  user: "User",
  repo: "Repo",
};

export function ExtensionInspectorView(): React.ReactElement {
  const scope = useExtensionsMockStore((s) => s.scope);
  const category = useExtensionsMockStore((s) => s.category);
  const selectedItemId = useExtensionsMockStore((s) => s.selectedItemId);
  const items = useExtensionsMockStore(selectVisibleItems);

  const item = items.find((i) => i.id === selectedItemId) ?? null;

  if (!item) {
    return (
      <div style={{ padding: "8px 12px", color: colors.textTertiary, fontSize: 11 }}>
        Select an item to see details.
      </div>
    );
  }

  return (
    <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Name + version */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, wordBreak: "break-word" }}>
          {item.name}
        </div>
        {item.version && (
          <div
            style={{
              fontSize: 11,
              color: colors.textTertiary,
              fontFamily: "'SF Mono', 'Fira Code', ui-monospace, monospace",
              marginTop: 2,
            }}
          >
            v{item.version}
          </div>
        )}
      </div>

      {/* Key/value grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          columnGap: 10,
          rowGap: 6,
          fontSize: 11,
        }}
      >
        <span style={{ color: colors.textTertiary }}>Type</span>
        <span style={{ color: colors.text }}>{TYPE_LABEL[category]}</span>

        <span style={{ color: colors.textTertiary }}>Scope</span>
        <span style={{ color: colors.text }}>{SCOPE_LABEL[scope]}</span>

        <span style={{ color: colors.textTertiary }}>Enabled</span>
        <span style={{ color: item.enabled ? colors.successText : colors.textTertiary }}>
          {item.enabled ? "Yes" : "No"}
        </span>

        {item.meta?.skills !== undefined && (
          <>
            <span style={{ color: colors.textTertiary }}>Skills</span>
            <span style={{ color: colors.text }}>{item.meta.skills}</span>
          </>
        )}
        {item.meta?.agents !== undefined && (
          <>
            <span style={{ color: colors.textTertiary }}>Agents</span>
            <span style={{ color: colors.text }}>{item.meta.agents}</span>
          </>
        )}
        {item.meta?.mcp !== undefined && (
          <>
            <span style={{ color: colors.textTertiary }}>MCP</span>
            <span style={{ color: colors.text }}>{item.meta.mcp}</span>
          </>
        )}
      </div>

      {/* Path */}
      <div>
        <div
          style={{
            fontSize: 10,
            color: colors.textTertiary,
            marginBottom: 4,
            textTransform: "uppercase",
            letterSpacing: 0.4,
          }}
        >
          Path
        </div>
        <div
          style={{
            fontSize: 11,
            color: colors.text,
            fontFamily: "'SF Mono', 'Fira Code', ui-monospace, monospace",
            background: colors.bgMuted,
            padding: "6px 8px",
            borderRadius: 3,
            wordBreak: "break-all",
          }}
        >
          {item.path}
        </div>
      </div>

      {/* Description */}
      {item.description && (
        <div>
          <div
            style={{
              fontSize: 10,
              color: colors.textTertiary,
              marginBottom: 4,
              textTransform: "uppercase",
              letterSpacing: 0.4,
            }}
          >
            Description
          </div>
          <div style={{ fontSize: 12, color: colors.textMuted, lineHeight: 1.5 }}>
            {item.description}
          </div>
        </div>
      )}

      {/* Actions (stubs) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <InspectorButton
          icon={<FolderOpen size={12} strokeWidth={1.8} />}
          label="Open in Finder"
          onClick={() => console.log("[mockup] open in finder", item.path)}
        />
        <InspectorButton
          icon={<FileText size={12} strokeWidth={1.8} />}
          label="View files"
          onClick={() => console.log("[mockup] view files", item)}
        />
      </div>
    </div>
  );
}

function InspectorButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        background: colors.bgMuted,
        border: `1px solid ${colors.border}`,
        borderRadius: 4,
        color: colors.text,
        fontSize: 11,
        cursor: "pointer",
        textAlign: "left",
        transition: "background 120ms",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = colors.bgHover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = colors.bgMuted;
      }}
    >
      <span style={{ color: colors.iconNeutral, display: "inline-flex" }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
