import React, { useState } from "react";

import { colors } from "../../utils/colors";
import { useConfigStore } from "../../store/configStore";
import { AddWorkingDirButton } from "./AddWorkingDirButton";
import { SpecifyCommandSetting } from "./SpecifyCommandSetting";
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
      width={500}
      onClose={onClose}
      footer={<CancelButton onClick={onClose}>Close</CancelButton>}
    >
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 600, color: colors.textStrong }}>
          Working Directories
        </h3>
        <p style={{ margin: "0 0 16px 0", fontSize: 13, color: colors.textMuted, lineHeight: 1.5 }}>
          Magenta IDE will scan these directories for git repositories. You can add multiple directories.
        </p>

        <WorkingDirList />

        <AddWorkingDirButton onError={setLocalError} />
      </div>

      <div style={{ marginBottom: 24, borderTop: `1px solid ${colors.border}`, paddingTop: 20 }}>
        <SpecifyCommandSetting />
      </div>

      {error && (
        <div
          style={{
            backgroundColor: colors.errorSoft,
            border: `1px solid ${colors.errorSoftBorder}`,
            borderRadius: 6,
            padding: 12,
            marginBottom: 16,
          }}
        >
          <p style={{ margin: 0, fontSize: 13, color: colors.errorDark }}>{error}</p>
        </div>
      )}
    </BaseDialog>
  );
}
