import React, { useState } from "react";
import { Settings } from "lucide-react";

import { colors } from "../../utils/colors";
import { useConfigStore } from "../../store/configStore";
import { AddWorkingDirButton } from "./AddWorkingDirButton";
import { AppearanceSettings } from "./AppearanceSettings";
import { SpecifyCommandSetting } from "./SpecifyCommandSetting";
import { SyncIntervalSettings } from "./SyncIntervalSettings";
import { WorkingDirList } from "./WorkingDirList";
import { BaseDialog } from "../common/BaseDialog";
import { CancelButton } from "../common/DialogButtons";

type SettingsDialogProps = {
  isOpen: boolean;
  onClose: () => void;
};

/**
 * Settings dialog for managing working directories.
 */
export function SettingsDialog({ isOpen, onClose }: SettingsDialogProps): React.ReactElement | null {
  const [localError, setLocalError] = useState<string | null>(null);
  const storeError = useConfigStore((state) => state.error);

  const error = localError || storeError;

  if (!isOpen) {
    return null;
  }

  return (
    <BaseDialog
      title="Settings"
      icon={<Settings size={16} color={colors.primary} strokeWidth={2} />}
      width={500}
      onClose={onClose}
      footer={<CancelButton onClick={onClose}>Close</CancelButton>}
    >
      <div style={{ marginBottom: 14 }}>
        <h3 style={{ margin: "0 0 6px 0", fontSize: 11, fontWeight: 600, color: colors.textStrong }}>
          Working Directories
        </h3>
        <p style={{ margin: "0 0 8px 0", fontSize: 11, color: colors.textMuted, lineHeight: 1.5 }}>
          Magenta IDE will scan these directories for git repositories. You can add multiple directories.
        </p>

        <WorkingDirList />

        <AddWorkingDirButton onError={setLocalError} />
      </div>

      <div style={{ marginBottom: 14, borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}>
        <SpecifyCommandSetting />
      </div>

      <div style={{ marginBottom: 14, borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}>
        <SyncIntervalSettings />
      </div>

      <div style={{ marginBottom: 14, borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}>
        <AppearanceSettings />
      </div>

      {error && (
        <div
          style={{
            backgroundColor: colors.errorSoft,
            border: `1px solid ${colors.errorSoftBorder}`,
            borderRadius: 4,
            padding: 8,
            marginBottom: 10,
          }}
        >
          <p style={{ margin: 0, fontSize: 11, color: colors.errorDark }}>{error}</p>
        </div>
      )}
    </BaseDialog>
  );
}
