import React, { useState } from "react";

import { getFileIconInfo } from "../common/fileIcons";
import { ScrollableText } from "../common/ScrollableText";

/* ── Types ── */

export type BuiltinTabId = "specs" | "worktrees" | "workflow" | "ai";

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
  onSelectFileTab: (filePath: string) => void;
  onCloseFileTab: (filePath: string) => void;
};

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

/* ── TabBar component (file tabs only) ── */

export function TabBar({
  activeTab,
  openFiles,
  onSelectFileTab,
  onCloseFileTab,
}: TabBarProps): React.ReactElement | null {
  // Don't render at all if there are no open file tabs
  if (openFiles.length === 0) {
    return null;
  }

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
            <ScrollableText
              style={{
                maxWidth: 150,
              }}
            >
              {file.fileName}
            </ScrollableText>

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
