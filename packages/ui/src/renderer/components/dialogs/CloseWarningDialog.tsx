/**
 * CloseWarningDialog — shown when the user tries to close the app
 * while AI sessions are still actively processing (status === "active").
 * Idle / waiting-input sessions are allowed to quit silently since
 * there's no in-progress work to lose.
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
      title="AI Sessions In Progress"
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
      <p style={{ margin: 0, 
        //fontSize: 11,
         color: colors.text, lineHeight: 1.5 }}>
        {runningCount === 1
          ? "1 AI session is actively processing."
          : `${runningCount} AI sessions are actively processing.`}
        {" "}Closing the app will interrupt them and any in-progress work will be lost.
      </p>
    </BaseDialog>
  );
}
