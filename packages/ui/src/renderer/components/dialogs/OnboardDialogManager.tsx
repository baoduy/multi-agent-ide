import React from "react";

import { useOnboardStore } from "../../store/onboardStore";
import { OnboardDialog } from "./OnboardDialog";
import { UpgradeSpecifyDialog } from "./UpgradeSpecifyDialog";

/**
 * Global dialog manager for onboard/upgrade processes.
 * Renders a dialog for any process that has `dialogOpen: true`.
 * Mount this once near the top of the component tree (e.g., in MainLayout).
 */
export function OnboardDialogManager(): React.ReactElement | null {
  const processes = useOnboardStore((s) => s.processes);
  const setDialogOpen = useOnboardStore((s) => s.setDialogOpen);

  const openProcesses = Object.values(processes).filter((p) => p.dialogOpen);

  if (openProcesses.length === 0) return null;

  // Show the most recently relevant one (just the first open one)
  const proc = openProcesses[0];

  const handleClose = () => {
    setDialogOpen(proc.repoPath, false);
  };

  if (proc.kind === "onboard") {
    return (
      <OnboardDialog
        repoPath={proc.repoPath}
        repoName={proc.repoName}
        onClose={handleClose}
      />
    );
  }

  return (
    <UpgradeSpecifyDialog
      repoPath={proc.repoPath}
      repoName={proc.repoName}
      onClose={handleClose}
    />
  );
}
