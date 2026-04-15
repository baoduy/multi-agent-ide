/**
 * CloseWarningDialog — shown when the user tries to close the app
 * while AI sessions are still running.
 */

import React from "react";
import { AlertTriangle } from "lucide-react";

import { BaseDialog } from "../common/BaseDialog";
import { CancelButton, DangerButton } from "../common/DialogButtons";
import { colors } from "../../utils/colors";

type CloseWarningDialogProps = {
  runningCount: number;
  onCancel: () => void;
  onForceQuit: () => void;
};

export function CloseWarningDialog({
  runningCount,
  onCancel,
  onForceQuit,
}: CloseWarningDialogProps): React.ReactElement {
  return (
    <BaseDialog
      title="Running AI Sessions"
      icon={<AlertTriangle size={16} color={colors.warningText} />}
      width={420}
      onClose={onCancel}
      footer={
        <>
          <CancelButton onClick={onCancel}>Cancel</CancelButton>
          <DangerButton
            onClick={onForceQuit}
            icon={<AlertTriangle size={12} />}
          >
            Quit
          </DangerButton>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 13, color: colors.text, lineHeight: 1.5 }}>
        {runningCount === 1
          ? "1 AI session is still running."
          : `${runningCount} AI sessions are still running.`}
        {" "}Closing the app will stop all active sessions and any in-progress work will be lost.
      </p>
    </BaseDialog>
  );
}
