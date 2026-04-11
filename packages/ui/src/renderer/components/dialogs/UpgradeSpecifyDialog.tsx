import React, { useCallback, useEffect } from "react";
import { ArrowUpCircle, Minimize2, Square } from "lucide-react";

import { colors } from "../../utils/colors";
import { sendOrThrow } from "../../services/ipcClient";
import { useOnboardStore } from "../../store/onboardStore";
import { MagentaTerminal } from "../common/MagentaTerminal";
import { BaseDialog } from "../common/BaseDialog";
import { CancelButton, PrimaryButton, DangerButton, SecondaryButton } from "../common/DialogButtons";

type UpgradeSpecifyDialogProps = {
  repoPath: string;
  repoName: string;
  onClose: () => void;
};

const PURPLE = "#6b5ebd";

export function UpgradeSpecifyDialog({
  repoPath,
  repoName,
  onClose,
}: UpgradeSpecifyDialogProps): React.ReactElement {
  const process = useOnboardStore((s) => s.processes[repoPath]);
  const setRunning = useOnboardStore((s) => s.setRunning);
  const setDialogOpen = useOnboardStore((s) => s.setDialogOpen);
  const dismiss = useOnboardStore((s) => s.dismiss);
  const initSubs = useOnboardStore((s) => s.initializeSubscriptions);

  const phase = process?.phase ?? "select";
  const output = process?.output ?? "";
  const success = process?.success ?? null;
  const error = process?.error ?? null;

  useEffect(() => { initSubs(); }, [initSubs]);

  const handleStart = useCallback(async () => {
    setRunning(repoPath);
    try {
      await sendOrThrow({
        type: "repo:upgrade-specify",
        repoPath,
      });
    } catch (err) {
      // Error will be caught by IPC event
    }
  }, [repoPath, setRunning]);

  const handleCancel = useCallback(async () => {
    try {
      await sendOrThrow({ type: "repo:onboard:cancel", repoPath });
    } catch {
      // Best effort
    }
  }, [repoPath]);

  const handleMinimize = useCallback(() => {
    setDialogOpen(repoPath, false);
    onClose();
  }, [repoPath, setDialogOpen, onClose]);

  const handleClose = useCallback(() => {
    if (phase === "done") {
      dismiss(repoPath);
    }
    onClose();
  }, [phase, repoPath, dismiss, onClose]);

  const footer = (
    <>
      {phase === "select" && (
        <>
          <CancelButton onClick={handleClose} />
          <PrimaryButton onClick={handleStart} color={PURPLE}>
            Upgrade
          </PrimaryButton>
        </>
      )}
      {phase === "running" && (
        <>
          <DangerButton onClick={handleCancel} icon={<Square size={10} strokeWidth={2.5} fill={colors.errorDark} />}>
            Cancel
          </DangerButton>
          <SecondaryButton onClick={handleMinimize} icon={<Minimize2 size={12} strokeWidth={2} />}>
            Run in Background
          </SecondaryButton>
        </>
      )}
      {phase === "done" && (
        <PrimaryButton onClick={handleClose} color={success ? colors.success : PURPLE}>
          {success ? "Done" : "Close"}
        </PrimaryButton>
      )}
    </>
  );

  return (
    <BaseDialog
      title="Upgrade Specify"
      icon={<ArrowUpCircle size={16} color={PURPLE} strokeWidth={2} />}
      width={520}
      onClose={handleClose}
      onMinimize={phase === "running" ? handleMinimize : undefined}
      showMinimize={phase === "running"}
      footer={footer}
    >
      {phase === "select" && (
        <p
          style={{
            fontSize: 13,
            color: colors.textMuted,
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          Upgrade Specify for <strong>{repoName}</strong> to the latest
          version. This will install the latest <code>specify-cli</code> and
          re-initialize the configuration using the existing AI agent setting.
        </p>
      )}

      {/* Terminal output */}
      {(phase === "running" || phase === "done") && (
        <MagentaTerminal
          readonly={true}
          output={output}
          status={
            phase === "running"
              ? "running"
              : phase === "done"
                ? success
                  ? "done"
                  : error === "canceled"
                    ? "canceled"
                    : "error"
                : "idle"
          }
          successMessage="Upgrade complete!"
          errorMessage={error ?? undefined}
          label={
            phase === "running"
              ? "Upgrading..."
              : phase === "done"
                ? success
                  ? "Completed"
                  : "Failed"
                : ""
          }
        />
      )}
    </BaseDialog>
  );
}
