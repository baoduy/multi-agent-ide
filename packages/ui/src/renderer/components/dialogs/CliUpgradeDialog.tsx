import React, { useCallback, useEffect, useMemo } from "react";
import { ArrowUpCircle, RefreshCw, Loader2, ExternalLink } from "lucide-react";

import {
  CLI_TOOLS,
  CLI_TOOL_IDS,
  resolveCliToolSpec,
  type CliToolId,
  type CliToolStatus,
} from "@magenta/shared/cliTools";
import { colors } from "../../utils/colors";
import {
  useCliVersionStore,
  type CliUpgradeState,
} from "../../store/cliVersionStore";
import { useConfigStore } from "../../store/configStore";
import { BaseDialog } from "../common/BaseDialog";
import { MagentaTerminal } from "../common/MagentaTerminal";
import {
  CancelButton,
  DangerButton,
  PrimaryButton,
  SecondaryButton,
} from "../common/DialogButtons";

const PURPLE = colors.repoBadgeSpecFg;

function ensureAllToolsPresent(tools: CliToolStatus[]): CliToolStatus[] {
  if (tools.length === CLI_TOOL_IDS.length) return tools;
  const byId = new Map(tools.map((t) => [t.tool, t]));
  return CLI_TOOL_IDS.map(
    (id) =>
      byId.get(id) ?? {
        tool: id,
        installed: false,
        currentVersion: null,
        latestVersion: null,
        updateAvailable: false,
        releaseUrl: CLI_TOOLS[id].infoUrl,
        checkedAt: null,
        checkError: null,
      },
  );
}

export function CliUpgradeDialog(): React.ReactElement | null {
  const dialogOpen = useCliVersionStore((s) => s.dialogOpen);
  const rawTools = useCliVersionStore((s) => s.tools);
  const upgrades = useCliVersionStore((s) => s.upgrades);
  const isChecking = useCliVersionStore((s) => s.isChecking);
  const setDialogOpen = useCliVersionStore((s) => s.setDialogOpen);
  const recheck = useCliVersionStore((s) => s.recheck);
  const startUpgrade = useCliVersionStore((s) => s.startUpgrade);
  const cancelUpgrade = useCliVersionStore((s) => s.cancelUpgrade);
  const dismissUpgrade = useCliVersionStore((s) => s.dismissUpgrade);
  const initSubs = useCliVersionStore((s) => s.initializeSubscriptions);

  const sourceRepoPath = useCliVersionStore((s) => s.sourceRepoPath);
  const tools = useMemo(() => ensureAllToolsPresent(rawTools), [rawTools]);

  useEffect(() => {
    initSubs();
  }, [initSubs]);

  // Trigger a fresh check every time the dialog opens. No background cadence
  // exists anymore — this is the only moment the daemon pings the registries.
  useEffect(() => {
    if (dialogOpen) void recheck();
  }, [dialogOpen, recheck]);

  const activeTool = useMemo<CliToolId | null>(() => {
    for (const t of tools) {
      const upgrade = upgrades[t.tool];
      if (upgrade && upgrade.phase === "running") return t.tool;
    }
    return null;
  }, [tools, upgrades]);

  const isRunningAny = activeTool !== null;

  const handleClose = useCallback(() => {
    setDialogOpen(false);
  }, [setDialogOpen]);

  const handleMinimize = useCallback(() => {
    setDialogOpen(false);
  }, [setDialogOpen]);

  if (!dialogOpen) return null;

  const footer = isRunningAny && activeTool ? (
    <>
      <DangerButton onClick={() => cancelUpgrade(activeTool)}>Cancel</DangerButton>
      <SecondaryButton onClick={handleMinimize}>Run in Background</SecondaryButton>
    </>
  ) : (
    <>
      <CancelButton onClick={handleClose}>Close</CancelButton>
      <SecondaryButton
        onClick={() => void recheck()}
        icon={
          isChecking ? (
            <Loader2 size={12} strokeWidth={2} style={{ animation: "spin 1s linear infinite" }} />
          ) : (
            <RefreshCw size={12} strokeWidth={2} />
          )
        }
      >
        {isChecking ? "Checking…" : "Check Now"}
      </SecondaryButton>
    </>
  );

  return (
    <BaseDialog
      title="Upgrade Tools"
      icon={<ArrowUpCircle size={16} color={PURPLE} strokeWidth={2} />}
      width={560}
      onClose={handleClose}
      onMinimize={isRunningAny ? handleMinimize : undefined}
      showMinimize={isRunningAny}
      footer={footer}
      scrollable
      maxHeight="80vh"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {tools.map((tool) => (
          <CliToolRow
            key={tool.tool}
            tool={tool}
            upgrade={upgrades[tool.tool]}
            isChecking={isChecking}
            hasRepoContext={sourceRepoPath !== null}
            onUpgrade={() => void startUpgrade(tool.tool)}
            onDismiss={() => dismissUpgrade(tool.tool)}
          />
        ))}
      </div>
    </BaseDialog>
  );
}

type CliToolRowProps = {
  tool: CliToolStatus;
  upgrade: CliUpgradeState | undefined;
  isChecking: boolean;
  /** True when the dialog was opened from a repo — required to reinstall Specify. */
  hasRepoContext: boolean;
  onUpgrade: () => void;
  onDismiss: () => void;
};

function CliToolRow({
  tool,
  upgrade,
  isChecking,
  hasRepoContext,
  onUpgrade,
  onDismiss,
}: CliToolRowProps): React.ReactElement {
  const override = useConfigStore((s) => s.cliTools[tool.tool]);
  const specifyTemplate = useConfigStore((s) => s.specifyCommand);
  const spec = resolveCliToolSpec(tool.tool, override);
  const displayedCommand =
    tool.tool === "specify"
      ? specifyTemplate.replace(/\s+/g, " ").trim()
      : spec.upgradeCommand;
  const phase = upgrade?.phase ?? "idle";
  const isRunning = phase === "running";
  const isDone = phase === "done";
  const success = upgrade?.success === true;

  return (
    <div
      style={{
        border: `1px solid ${colors.border}`,
        borderRadius: 6,
        padding: 12,
        background: colors.bgWhite,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: colors.text }}>
              {spec.displayName}
            </span>
            <a
              href={spec.infoUrl}
              target="_blank"
              rel="noreferrer"
              style={{ color: colors.textTertiary, display: "inline-flex" }}
              title={spec.infoUrl}
            >
              <ExternalLink size={11} strokeWidth={2} />
            </a>
          </div>
          <VersionLine tool={tool} isChecking={isChecking} success={success} />
          {tool.checkError && (
            <div style={{ fontSize: 10, color: colors.warningText, marginTop: 2 }}>
              {tool.checkError}
            </div>
          )}
        </div>

        {renderRowAction({
          tool,
          upgrade,
          isRunning,
          isDone,
          success,
          hasRepoContext,
          onUpgrade,
          onDismiss,
        })}
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

      <div
        style={{
          fontSize: 10,
          color: colors.textTertiary,
          marginTop: 8,
          fontFamily: "'SF Mono', ui-monospace, monospace",
        }}
      >
        $ {displayedCommand}
      </div>
    </div>
  );
}

function VersionLine({
  tool,
  isChecking,
  success,
}: {
  tool: CliToolStatus;
  isChecking: boolean;
  success: boolean;
}): React.ReactElement {
  if (!tool.installed) {
    return (
      <div style={{ fontSize: 11, color: colors.textTertiary, marginTop: 2 }}>
        Not installed locally
      </div>
    );
  }
  const monoStyle: React.CSSProperties = {
    fontFamily: "'SF Mono', ui-monospace, monospace",
  };
  return (
    <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
      <code style={monoStyle}>{tool.currentVersion ?? "?"}</code>
      {" → "}
      {tool.latestVersion ? (
        <code
          style={{
            ...monoStyle,
            color: success ? colors.success : colors.text,
          }}
        >
          {tool.latestVersion}
        </code>
      ) : (
        <span style={{ color: colors.textTertiary }}>
          {isChecking ? "checking…" : "unknown"}
        </span>
      )}
    </div>
  );
}

function renderRowAction({
  tool,
  upgrade,
  isRunning,
  isDone,
  success,
  hasRepoContext,
  onUpgrade,
  onDismiss,
}: {
  tool: CliToolStatus;
  upgrade: CliUpgradeState | undefined;
  isRunning: boolean;
  isDone: boolean;
  success: boolean;
  hasRepoContext: boolean;
  onUpgrade: () => void;
  onDismiss: () => void;
}): React.ReactElement | null {
  if (isRunning) {
    return <span style={{ fontSize: 11, color: colors.textMuted }}>Running…</span>;
  }
  if (isDone && upgrade) {
    return (
      <SecondaryButton onClick={onDismiss}>
        {success ? "Dismiss" : "Retry"}
      </SecondaryButton>
    );
  }
  if (tool.installed && tool.updateAvailable) {
    return (
      <PrimaryButton onClick={onUpgrade} color={PURPLE}>
        Upgrade
      </PrimaryButton>
    );
  }
  if (tool.installed && tool.latestVersion && !tool.updateAvailable) {
    // Specify's "upgrade" is really `specify init --here --force` followed by
    // the configured extension installs. Offer a Reinstall action even when
    // the template is up to date so editing the extensions list and picking
    // it up is a one-click affair. Disabled outside a repo context because
    // the command requires `cwd: <repo>` to resolve `--here`.
    if (tool.tool === "specify") {
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: colors.success, fontWeight: 500 }}>
            Up to date
          </span>
          <SecondaryButton
            onClick={onUpgrade}
            disabled={!hasRepoContext}
            title={
              hasRepoContext
                ? "Re-run specify init and reinstall configured extensions"
                : "Open from a repo to reinstall Specify"
            }
          >
            Reinstall
          </SecondaryButton>
        </div>
      );
    }
    return (
      <span style={{ fontSize: 11, color: colors.success, fontWeight: 500 }}>
        Up to date
      </span>
    );
  }
  return null;
}
