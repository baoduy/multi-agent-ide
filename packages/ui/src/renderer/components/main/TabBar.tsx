import React from "react";

export type TabId = "plan" | "worktrees" | "spec";

type TabBarProps = {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
};

const tabs: { id: TabId; label: string }[] = [
  { id: "plan", label: "Plan & Tasks" },
  { id: "worktrees", label: "Worktrees" },
  { id: "spec", label: "Spec" },
];

export function TabBar({ activeTab, onTabChange }: TabBarProps): React.ReactElement {
  return (
    <div
      style={{
        display: "flex",
        borderBottom: "1px solid #e5e5ec",
        background: "#f8f8fa",
        padding: "0 4px",
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            style={{
              padding: "10px 18px",
              fontSize: 13,
              fontWeight: isActive ? 500 : 400,
              cursor: "pointer",
              border: "none",
              borderBottom: isActive ? "2px solid #5b57d1" : "2px solid transparent",
              background: "transparent",
              color: isActive ? "#1e1e2e" : "#8b8b96",
              transition: "color 0.12s, border-color 0.12s",
              marginBottom: -1,
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.color = "#1e1e2e";
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.color = "#8b8b96";
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
