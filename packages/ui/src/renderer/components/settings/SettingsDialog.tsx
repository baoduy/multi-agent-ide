import React, { useState } from "react";
import {
  Settings,
  FolderOpen,
  Sparkles,
  Terminal as TerminalIcon,
  RefreshCw,
  Palette,
} from "lucide-react";

import { colors } from "../../utils/colors";
import { useConfigStore } from "../../store/configStore";
import { AddWorkingDirButton } from "./AddWorkingDirButton";
import { AppearanceSettings } from "./AppearanceSettings";
import { CliCommandsSettings } from "./CliCommandsSettings";
import { SpecifyCommandSetting } from "./SpecifyCommandSetting";
import { SpecifyExtensionsSettings } from "./SpecifyExtensionsSettings";
import { SyncIntervalSettings } from "./SyncIntervalSettings";
import { WorkingDirList } from "./WorkingDirList";
import { BaseDialog } from "../common/BaseDialog";
import { CancelButton } from "../common/DialogButtons";

type SettingsDialogProps = {
  isOpen: boolean;
  onClose: () => void;
};

type TabId = "directories" | "specify" | "cli" | "sync" | "appearance";

type TabDef = {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
};

const TABS: readonly TabDef[] = [
  { id: "directories", label: "Directories", icon: FolderOpen },
  { id: "specify", label: "Specify", icon: Sparkles },
  { id: "cli", label: "CLI Commands", icon: TerminalIcon },
  { id: "sync", label: "Sync", icon: RefreshCw },
  { id: "appearance", label: "Appearance", icon: Palette },
];

const tabId = (id: TabId): string => `settings-tab-${id}`;
const panelId = (id: TabId): string => `settings-panel-${id}`;

/**
 * Settings dialog. Uses a left-side vertical tab list so each group gets its
 * own scrollable panel — keeps the dialog compact while holding many sections.
 */
export function SettingsDialog({ isOpen, onClose }: SettingsDialogProps): React.ReactElement | null {
  const [localError, setLocalError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("directories");
  const storeError = useConfigStore((state) => state.error);

  const error = localError || storeError;

  if (!isOpen) {
    return null;
  }

  return (
    <BaseDialog
      title="Settings"
      icon={<Settings size={16} color={colors.primary} strokeWidth={2} />}
      width={720}
      scrollable
      maxHeight="75vh"
      minHeight={380}
      onClose={onClose}
      footer={<CancelButton onClick={onClose}>Close</CancelButton>}
    >
      <div style={{ display: "flex", gap: 14, height: "100%", minHeight: 0 }}>
        <SettingsTabList activeTab={activeTab} onSelect={setActiveTab} />
        <SettingsPanel activeTab={activeTab}>
          {activeTab === "directories" && <DirectoriesPanel onError={setLocalError} />}
          {activeTab === "specify" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <SpecifyCommandSetting />
              <SpecifyExtensionsSettings />
            </div>
          )}
          {activeTab === "cli" && <CliCommandsSettings />}
          {activeTab === "sync" && <SyncIntervalSettings />}
          {activeTab === "appearance" && <AppearanceSettings />}

          {error && (
            <div
              style={{
                backgroundColor: colors.errorSoft,
                border: `1px solid ${colors.errorSoftBorder}`,
                borderRadius: 4,
                padding: 8,
                marginTop: 12,
              }}
            >
              <p style={{ margin: 0, fontSize: 11, color: colors.errorDark }}>{error}</p>
            </div>
          )}
        </SettingsPanel>
      </div>
    </BaseDialog>
  );
}

function SettingsTabList({
  activeTab,
  onSelect,
}: {
  activeTab: TabId;
  onSelect: (tab: TabId) => void;
}): React.ReactElement {
  return (
    <nav
      role="tablist"
      aria-orientation="vertical"
      aria-label="Settings sections"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        width: 160,
        flexShrink: 0,
        borderRight: `1px solid ${colors.border}`,
        paddingRight: 10,
      }}
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            id={tabId(tab.id)}
            role="tab"
            aria-selected={isActive}
            aria-controls={panelId(tab.id)}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onSelect(tab.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 8px",
              fontSize: 11,
              fontWeight: isActive ? 600 : 500,
              border: "none",
              borderRadius: 4,
              background: isActive ? colors.primaryAlpha : "transparent",
              color: isActive ? colors.primary : colors.text,
              cursor: "pointer",
              textAlign: "left",
              transition: "background 120ms ease",
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.background = colors.bgHover;
            }}
            onMouseLeave={(e) => {
              if (!isActive) e.currentTarget.style.background = "transparent";
            }}
          >
            <Icon size={13} strokeWidth={2} />
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}

function SettingsPanel({
  activeTab,
  children,
}: {
  activeTab: TabId;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div
      id={panelId(activeTab)}
      role="tabpanel"
      aria-labelledby={tabId(activeTab)}
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        overflowY: "auto",
        paddingRight: 4,
      }}
    >
      {children}
    </div>
  );
}

function DirectoriesPanel({ onError }: { onError: (msg: string | null) => void }): React.ReactElement {
  return (
    <div>
      <h3 style={{ margin: "0 0 6px 0", fontSize: 11, fontWeight: 600, color: colors.textStrong }}>
        Working Directories
      </h3>
      <p style={{ margin: "0 0 8px 0", fontSize: 11, color: colors.textMuted, lineHeight: 1.5 }}>
        Magenta IDE will scan these directories for git repositories. You can add multiple directories.
      </p>

      <WorkingDirList />

      <AddWorkingDirButton onError={onError} />
    </div>
  );
}
