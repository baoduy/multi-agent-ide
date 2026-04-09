import React, { useState } from "react";

import { getFileIconInfo } from "../common/fileIcons";

/* ── Types ── */

export type BuiltinTabId = "specs" | "worktrees" | "workflow";

export type OpenFileTab = {
  filePath: string;
  fileName: string;
};

export type ActiveTab =
  | { kind: "builtin"; id: BuiltinTabId }
  | { kind: "file"; filePath: string };

type TabBarProps = {
  activeTab: ActiveTab;
  openFiles: OpenFileTab[];
  onSelectBuiltinTab: (id: BuiltinTabId) => void;
  onSelectFileTab: (filePath: string) => void;
  onCloseFileTab: (filePath: string) => void;
};

/* ── Built-in tabs ── */

const builtinTabs: { id: BuiltinTabId; label: string }[] = [
  { id: "specs", label: "Specs" },
  { id: "workflow", label: "Workflow" },
  { id: "worktrees", label: "Worktrees" },
];

/* ── File tab close button ── */

function CloseButton({ onClick }: { onClick: (e: React.MouseEvent) => void }): React.ReactElement {
  const [hovered, setHovered] = useState(false);

  return (
    <span
      role="button"
      tabIndex={-1}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 16,
        height: 16,
        borderRadius: 3,
        fontSize: 11,
        lineHeight: 1,
        color: hovered ? "#2c2c2c" : "#9a958c",
        background: hovered ? "#e5e2da" : "transparent",
        cursor: "pointer",
        marginLeft: 4,
        transition: "all 0.1s",
      }}
    >
      ×
    </span>
  );
}

/* ── TabBar component ── */

export function TabBar({
  activeTab,
  openFiles,
  onSelectBuiltinTab,
  onSelectFileTab,
  onCloseFileTab,
}: TabBarProps): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        borderBottom: "1px solid #e5e2da",
        background: "#f5f4ed",
        padding: "0 4px",
        overflowX: "auto",
        flexShrink: 0,
      }}
    >
      {/* Built-in tabs */}
      {builtinTabs.map((tab) => {
        const isActive = activeTab.kind === "builtin" && activeTab.id === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelectBuiltinTab(tab.id)}
            style={{
              padding: "10px 18px",
              fontSize: 13,
              fontWeight: isActive ? 500 : 400,
              cursor: "pointer",
              border: "none",
              borderBottom: isActive ? "2px solid #C15F3C" : "2px solid transparent",
              background: "transparent",
              color: isActive ? "#2c2c2c" : "#9a958c",
              transition: "color 0.12s, border-color 0.12s",
              marginBottom: -1,
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.color = "#2c2c2c";
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.color = "#9a958c";
            }}
          >
            {tab.label}
          </button>
        );
      })}

      {/* Separator between built-in and file tabs */}
      {openFiles.length > 0 && (
        <div
          style={{
            width: 1,
            alignSelf: "stretch",
            background: "#e5e2da",
            margin: "6px 4px",
            flexShrink: 0,
          }}
        />
      )}

      {/* File tabs */}
      {openFiles.map((file) => {
        const isActive = activeTab.kind === "file" && activeTab.filePath === file.filePath;
        const iconInfo = getFileIconInfo(file.fileName);
        const IconComponent = iconInfo.Icon;

        return (
          <button
            key={file.filePath}
            type="button"
            onClick={() => onSelectFileTab(file.filePath)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              padding: "8px 10px",
              fontSize: 12,
              fontWeight: isActive ? 500 : 400,
              cursor: "pointer",
              border: "none",
              borderBottom: isActive ? "2px solid #C15F3C" : "2px solid transparent",
              background: "transparent",
              color: isActive ? "#2c2c2c" : "#9a958c",
              transition: "color 0.12s, border-color 0.12s",
              marginBottom: -1,
              flexShrink: 0,
              whiteSpace: "nowrap",
              maxWidth: 200,
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.color = "#2c2c2c";
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.color = "#9a958c";
            }}
          >
            {/* File icon */}
            <IconComponent size={12} color={iconInfo.color} strokeWidth={1.8} />

            {/* File name */}
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {file.fileName}
            </span>

            {/* Close button */}
            <CloseButton
              onClick={(e) => {
                e.stopPropagation();
                onCloseFileTab(file.filePath);
              }}
            />
          </button>
        );
      })}
    </div>
  );
}
