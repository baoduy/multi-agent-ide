import React, { useCallback, useEffect, useMemo } from "react";
import { ArrowUpCircle, RefreshCw, Check } from "lucide-react";

import { CLI_TOOLS, type CliToolId, type CliToolStatus } from "@magenta/shared/cliTools";
import { colors } from "../../utils/colors";
import {
  computeActionableCliTools,
  useCliVersionStore,
  type CliUpgradeState,
} from "../../store/cliVersionStore";
import { BaseDialog } from "../common/BaseDialog";
import { MagentaTerminal } from "../common/MagentaTerminal";
import {
  CancelButton,
  DangerButton,
  PrimaryButton,
  SecondaryButton,
} from "../common/DialogButtons";

const PURPLE = colors.repoBadgeSpecFg;

export function CliUpgradeDialog(): React.ReactElement | null {
  const dialogOpen = useCliVersionStore((s) => s.dialogOpen);
  const rawTools = useCliVersionStore((s) => s.tools);
  const upgrades = useCliVersionStore((s) => s.upgrades);
  const setDialogOpen = useCliVersionStore((s) => s.setDialogOpen);
  const recheck = useCliVersionStore((s) => s.recheck);
  const startUpgrade = useCliVersionStore((s) => s.startUpgrade);
  const cancelUpgrade = useCliVersionStore((s) => s.cancelUpgrade);
  const dismissUpgrade = useCliVersionStore((s) => s.dismissUpgrade);
  const initSubs = useCliVersionStore((s) => s.initializeSubscriptions);

  const tools = useMemo(
    () => computeActionableCliTools(rawTools, upgrades),
    [rawTools, upgrades],
  );

  useEffect(() => {
    initSubs();
  }, [initSubs]);

  const activeTool = useMemo<CliToolId | null>(() => {
    for (const t of tools) {
      const upgrade = upgrades[t.tool];
      if (upgrade && (upgrade.phase === "running" || upgrade.phase === "done")) {
        return t.tool;
      }
    }
    return null;
  }, [tools, upgrades]);

  const activeUpgrade: CliUpgradeState | null = activeTool ? upgrades[activeTool] ?? null : null;
  const isRunning = activeUpgrade?.phase === "running";

  const handleClose = useCallback(() => {
    setDialogOpen(false);
  }, [setDialogOpen]);

  const handleMinimize = useCallback(() => {
    setDialogOpen(false);
  }, [setDialogOpen]);

  const handleDismiss = useCallback(
    (tool: CliToolId) => {
      dismissUpgrade(tool);
    },
    [dismissUpgrade],
  );

  if (!dialogOpen) return null;

  const footer = isRunning && activeTool ? (
    <>
      <DangerButton onClick={() => cancelUpgrade(activeTool)}>Cancel</DangerButton>
      <SecondaryButton onClick={handleMinimize}>Run in Background</SecondaryButton>
    </>
  ) : (
    <>
      <CancelButton onClick={handleClose}>Close</CancelButton>
      <SecondaryButton onClick={() => void recheck()} icon={<RefreshCw size={12} strokeWidth={2} />}>
        Check Now
      </SecondaryButton>
    </>
  );

  return (
    <BaseDialog
      title="CLI Updates"
      icon={<ArrowUpCircle size={16} color={PURPLE} strokeWidth={2} />}
      width={560}
      onClose={handleClose}
      onMinimize={isRunning ? handleMinimize : undefined}
      showMinimize={isRunning}
      footer={footer}
      scrollable
      maxHeight="80vh"
    >
      {tools.length === 0 ? (
        <EmptyState />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {tools.map((tool) => (
            <CliToolRow
              key={tool.tool}
              tool={tool}
              upgrade={upgrades[tool.tool]}
              onUpgrade={() => void startUpgrade(tool.tool)}
              onDismiss={() => handleDismiss(tool.tool)}
            />
          ))}
        </div>
      )}
    </BaseDialog>
  );
}

function EmptyState(): React.ReactElement {
  return (
    <div
      style={{
        padding: "24px 12px",
        textAlign: "center",
        color: colors.textMuted,
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <Check size={20} strokeWidth={2} style={{ color: colors.success, marginBottom: 8 }} />
      <div>All installed CLI tools are up to date.</div>
      <div style={{ fontSize: 11, marginTop: 4, color: colors.textTertiary }}>
        Click "Check Now" to refresh.
      </div>
    </div>
  );
}

type CliToolRowProps = {
  tool: CliToolStatus;
  upgrade: CliUpgradeState | undefined;
  onUpgrade: () => void;
  onDismiss: () => void;
};

function CliToolRow({ tool, upgrade, onUpgrade, onDismiss }: CliToolRowProps): React.ReactElement {
  const spec = CLI_TOOLS[tool.tool];
  const phase = upgrade?.phase ?? "idle";
  const isRunning = phase === "running";
  const isDone = phase === "done";
  const success = upgrade?.success === true;

  return (
    <div
      style={{
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        padding: 12,
        background: colors.bgWhite,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: colors.text }}>
            {spec.displayName}
          </div>
          <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
            <code style={{ fontFamily: "'SF Mono', ui-monospace, monospace" }}>
              {tool.currentVersion ?? "?"}
            </code>
            {tool.latestVersion && (
              <>
                {" → "}
                <code style={{ fontFamily: "'SF Mono', ui-monospace, monospace", color: success ? colors.success : colors.text }}>
                  {tool.latestVersion}
                </code>
              </>
            )}
          </div>
        </div>

        {!isRunning && !isDone && tool.updateAvailable && (
          <PrimaryButton onClick={onUpgrade} color={PURPLE}>
            Upgrade
          </PrimaryButton>
        )}
        {isRunning && (
          <span style={{ fontSize: 11, color: colors.textMuted }}>Running…</span>
        )}
        {isDone && (
          <SecondaryButton onClick={onDismiss}>
            {success ? "Dismiss" : "Retry"}
          </SecondaryButton>
        )}
      </div>

      {(isRunning || isDone) && upgrade && (
        <div style={{ marginTop: 10 }}>
          <MagentaTerminal
            readonly={true}
            output={upgrade.output}
            status={
              isRunning
                ? "running"
                : success
                  ? "done"
                  : upgrade.error === "canceled"
                    ? "canceled"
                    : "error"
            }
            successMessage="Upgrade complete!"
            errorMessage={upgrade.error ?? undefined}
            label={isRunning ? "Upgrading…" : success ? "Completed" : "Failed"}
            maxHeight={220}
          />
        </div>
      )}

      <div style={{ fontSize: 10, color: colors.textTertiary, marginTop: 8, fontFamily: "'SF Mono', ui-monospace, monospace" }}>
        $ {spec.upgradeCommand}
      </div>
    </div>
  );
}
