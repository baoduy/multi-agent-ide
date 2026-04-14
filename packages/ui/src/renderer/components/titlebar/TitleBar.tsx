import React, { useCallback, useState } from "react";
import { Sun, Moon, Monitor, List, Workflow, GitBranch, Bot, Plus } from "lucide-react";

import type { ActiveTab, BuiltinTabId } from "../main/TabBar";
import {
  BackgroundJobsPopover,
  BellIcon,
  useBackgroundJobs,
} from "./BackgroundJobsPopover";
import { useTheme } from "../../theme/ThemeProvider";
import { Button } from "../ui/button";
import { ButtonGroup, ButtonGroupSeparator } from "../ui/button-group";

/* ── Types ── */

type TitleBarProps = {
  sidebarCollapsed: boolean;
  activityCollapsed: boolean;
  hasActivity: boolean;
  onToggleSidebar: () => void;
  onToggleActivity: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  activeTab: ActiveTab;
  onSelectBuiltinTab: (id: BuiltinTabId) => void;
  /** Optional callback shown as a "+" button next to the AI tab when AI tab is active */
  onNewSession?: () => void;
};

/* ── Built-in tab definitions ── */

const builtinTabs: { id: BuiltinTabId; label: string; icon: React.ReactNode }[] = [
  { id: "specs", label: "Specs", icon: <List size={14} strokeWidth={1.8} /> },
  { id: "workflow", label: "Workflow", icon: <Workflow size={14} strokeWidth={1.8} /> },
  { id: "worktrees", label: "Worktrees", icon: <GitBranch size={14} strokeWidth={1.8} /> },
  { id: "ai", label: "AI", icon: <Bot size={14} strokeWidth={1.8} /> },
];

/* ── Toolbar icon button ── */

function ToolbarButton({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        border: "none",
        borderRadius: 6,
        cursor: disabled ? "default" : "pointer",
        background: hovered && !disabled ? "var(--accent)" : "transparent",
        color: disabled ? "var(--muted-foreground)" : "var(--foreground)",
        transition: "background 0.12s, color 0.12s",
        padding: 0,
        flexShrink: 0,
        // Buttons must NOT be draggable
        appRegion: "no-drag",
        WebkitAppRegion: "no-drag",
      } as React.CSSProperties}
    >
      {children}
    </button>
  );
}

/* ── Title bar tab button group (shadcn ButtonGroup) ── */

const noDrag = {
  appRegion: "no-drag",
  WebkitAppRegion: "no-drag",
} as React.CSSProperties;

type TitleBarTabGroupProps = {
  tabs: typeof builtinTabs;
  activeTab: ActiveTab;
  onSelectTab: (id: BuiltinTabId) => void;
  onPlus?: () => void;
};

function TitleBarTabGroup({
  tabs,
  activeTab,
  onSelectTab,
  onPlus,
}: TitleBarTabGroupProps): React.ReactElement {
  return (
    <ButtonGroup style={noDrag}>
      {tabs.map((tab) => {
        const isActive = activeTab.kind === "builtin" && activeTab.id === tab.id;
        return (
          <Button
            key={tab.id}
            variant={isActive ? "default" : "outline"}
            //size="lg"
            onClick={() => onSelectTab(tab.id)}
            style={{ ...noDrag, paddingLeft: 15, paddingRight: 15 }}
          >
            {tab.icon}
            {tab.label}
          </Button>
        );
      })}
      {onPlus && (
        <>
          <ButtonGroupSeparator />
          <Button
            size="icon"
            variant="outline"
            onClick={onPlus}
            title="New AI Session"
            style={noDrag}
          >
            <Plus />
          </Button>
        </>
      )}
    </ButtonGroup>
  );
}

/* ── SVG Icons ── */

function SidebarLeftIcon({ collapsed }: { collapsed: boolean }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" fill={collapsed ? "none" : "none"} />
      <line x1="5.5" y1="2.5" x2="5.5" y2="13.5" stroke="currentColor" strokeWidth="1.2" />
      {!collapsed && (
        <>
          <line x1="3" y1="5.5" x2="4.5" y2="5.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
          <line x1="3" y1="7.5" x2="4.5" y2="7.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
          <line x1="3" y1="9.5" x2="4.5" y2="9.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

function SidebarRightIcon({ collapsed }: { collapsed: boolean }): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="10.5" y1="2.5" x2="10.5" y2="13.5" stroke="currentColor" strokeWidth="1.2" />
      {!collapsed && (
        <>
          <line x1="11.5" y1="5.5" x2="13" y2="5.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
          <line x1="11.5" y1="7.5" x2="13" y2="7.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
          <line x1="11.5" y1="9.5" x2="13" y2="9.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

function ChevronLeftIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 3L5.5 8L10 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronRightIcon(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M6 3L10.5 8L6 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}


/* ── Title Bar ── */

export const TITLE_BAR_HEIGHT = 40;

export function TitleBar({
  sidebarCollapsed,
  activityCollapsed,
  hasActivity,
  onToggleSidebar,
  onToggleActivity,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  activeTab,
  onSelectBuiltinTab,
  onNewSession,
}: TitleBarProps): React.ReactElement {
  const { jobs, runningCount, failedCount, totalCount, clearCompleted } = useBackgroundJobs();
  const [jobsOpen, setJobsOpen] = useState(false);
  const toggleJobs = useCallback(() => setJobsOpen((o) => !o), []);
  const { preference, cyclePreference } = useTheme();

  const themeIcon =
    preference === "light" ? (
      <Sun size={16} strokeWidth={1.8} />
    ) : preference === "dark" ? (
      <Moon size={16} strokeWidth={1.8} />
    ) : (
      <Monitor size={16} strokeWidth={1.8} />
    );
  const themeTitle =
    preference === "light"
      ? "Theme: Light (click for Dark)"
      : preference === "dark"
      ? "Theme: Dark (click for System)"
      : "Theme: System (click for Light)";

  const badgeCount = totalCount;

  return (
    <div
      style={{
        height: TITLE_BAR_HEIGHT,
        display: "flex",
        alignItems: "center",
        background: "var(--muted)",
        color: "var(--foreground)",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
        position: "relative",
        zIndex: 100,
        // The entire title bar is draggable by default
        appRegion: "drag",
        WebkitAppRegion: "drag",
      } as React.CSSProperties}
    >
      {/* Left section: macOS traffic light spacer + sidebar toggle + nav */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          // On macOS, leave space for the traffic lights (3 buttons ~ 70px)
          paddingLeft: 78,
          paddingRight: 8,
          height: "100%",
          flexShrink: 0,
        }}
      >
        {/* Toggle left sidebar */}
        <ToolbarButton
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
        >
          <SidebarLeftIcon collapsed={sidebarCollapsed} />
        </ToolbarButton>

        {/* Separator */}
        <div
          style={{
            width: 1,
            height: 16,
            background: "var(--border)",
            margin: "0 4px",
            flexShrink: 0,
          }}
        />

        {/* Back / Forward navigation */}
        <ToolbarButton
          onClick={onGoBack}
          disabled={!canGoBack}
          title="Go back"
        >
          <ChevronLeftIcon />
        </ToolbarButton>
        <ToolbarButton
          onClick={onGoForward}
          disabled={!canGoForward}
          title="Go forward"
        >
          <ChevronRightIcon />
        </ToolbarButton>
      </div>

      {/* Center: Built-in tab button group */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        <TitleBarTabGroup
          tabs={builtinTabs}
          activeTab={activeTab}
          onSelectTab={onSelectBuiltinTab}
          onPlus={onNewSession}
        />
      </div>

      {/* Right section: notifications + activity panel toggle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          paddingLeft: 8,
          paddingRight: 16,
          height: "100%",
          flexShrink: 0,
        }}
      >
        {/* Theme cycle: light → dark → system → light */}
        <ToolbarButton onClick={cyclePreference} title={themeTitle}>
          {themeIcon}
        </ToolbarButton>

        {/* Separator */}
        <div
          style={{
            width: 1,
            height: 16,
            background: "var(--border)",
            margin: "0 4px",
            flexShrink: 0,
          }}
        />

        {/* Background jobs notification bell */}
        <div style={{ position: "relative" }}>
          <ToolbarButton onClick={toggleJobs} title="Background jobs">
            <BellIcon badgeCount={badgeCount} hasError={failedCount > 0} />
          </ToolbarButton>
          {jobsOpen && (
            <BackgroundJobsPopover
              jobs={jobs}
              onClearCompleted={clearCompleted}
              onClose={() => setJobsOpen(false)}
            />
          )}
        </div>

        {/* Separator */}
        <div
          style={{
            width: 1,
            height: 16,
            background: "var(--border)",
            margin: "0 4px",
            flexShrink: 0,
          }}
        />

        {/* Toggle right activity panel */}
        <ToolbarButton
          onClick={onToggleActivity}
          disabled={!hasActivity}
          title={activityCollapsed ? "Show activity panel" : "Hide activity panel"}
        >
          <SidebarRightIcon collapsed={activityCollapsed} />
        </ToolbarButton>
      </div>
    </div>
  );
}
