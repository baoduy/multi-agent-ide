import React, { useCallback, useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";

import { CLI_TOOLS, type CliToolId } from "@magenta/shared/cliTools";

/**
 * CLI tools whose `upgradeCommand` the user can customise here. Specify is
 * intentionally excluded — its "upgrade" is a template refresh driven by
 * the Specify tab's `specifyCommand` template, not a standalone install.
 */
const EDITABLE_CLI_IDS = ["claude", "copilot"] as const satisfies readonly CliToolId[];
import { colors } from "../../utils/colors";
import { useConfigStore } from "../../store/configStore";
import { AutoSaveStatus } from "../common/AutoSaveStatus";
import { useTransientFlag } from "../../hooks/useTransientFlag";

/**
 * Per-CLI upgrade-command editor. Writes to `config.cliTools[id].upgradeCommand`;
 * clearing or matching the default removes the override so future default
 * changes still propagate.
 */
export function CliCommandsSettings(): React.ReactElement {
  return (
    <div>
      <h3 style={{ margin: "0 0 6px 0", fontSize: 11, fontWeight: 600, color: colors.textStrong }}>
        CLI Upgrade Commands
      </h3>
      <p style={{ margin: "0 0 8px 0", fontSize: 11, color: colors.textMuted, lineHeight: 1.5 }}>
        Override the install/upgrade command used for each CLI. Leave blank to use
        the default. Commands must only use safe characters
        (<code style={{ fontSize: 10, background: colors.bgMuted, padding: "1px 3px", borderRadius: 3 }}>A-Za-z0-9_@:/.-+=~,%</code>)
        — they are executed without a shell.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {EDITABLE_CLI_IDS.map((id) => (
          <CliToolCommandRow key={id} tool={id} />
        ))}
      </div>
    </div>
  );
}

function CliToolCommandRow({ tool }: { tool: CliToolId }): React.ReactElement {
  const defaultCommand = CLI_TOOLS[tool].upgradeCommand;
  const displayName = CLI_TOOLS[tool].displayName;

  const override = useConfigStore((s) => s.cliTools[tool]?.upgradeCommand);
  const updateCliToolOverride = useConfigStore((s) => s.updateCliToolOverride);
  const isLoading = useConfigStore((s) => s.isLoading);
  const existingOverride = useConfigStore((s) => s.cliTools[tool]);

  const current = override ?? defaultCommand;
  const [localValue, setLocalValue] = useState(current);
  const [saved, showSaved] = useTransientFlag();

  useEffect(() => {
    setLocalValue(current);
  }, [current]);

  const handleSave = useCallback(async () => {
    const trimmed = localValue.trim();
    if (!trimmed || trimmed === current) return;

    const rest = existingOverride ?? {};
    if (trimmed === defaultCommand) {
      // Matches default — drop just this field. If nothing else is overridden,
      // the store action will delete the whole entry.
      const { upgradeCommand: _omit, ...remaining } = rest;
      await updateCliToolOverride(
        tool,
        Object.keys(remaining).length === 0 ? null : remaining,
      );
    } else {
      await updateCliToolOverride(tool, { ...rest, upgradeCommand: trimmed });
    }
    showSaved();
  }, [localValue, current, existingOverride, defaultCommand, tool, updateCliToolOverride, showSaved]);

  const handleReset = useCallback(async () => {
    setLocalValue(defaultCommand);
    const rest = existingOverride ?? {};
    const { upgradeCommand: _omit, ...remaining } = rest;
    await updateCliToolOverride(
      tool,
      Object.keys(remaining).length === 0 ? null : remaining,
    );
    showSaved();
  }, [defaultCommand, existingOverride, tool, updateCliToolOverride, showSaved]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void handleSave();
      }
    },
    [handleSave],
  );

  const isDirty = localValue.trim() !== current;
  const isCustom = override !== undefined;

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 500, color: colors.text, marginBottom: 3 }}>
        {displayName}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
        <input
          type="text"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (isDirty) void handleSave();
          }}
          spellCheck={false}
          placeholder={defaultCommand}
          style={{
            flex: 1,
            padding: "4px 8px",
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            border: `1px solid ${colors.border}`,
            borderRadius: 4,
            background: colors.bgSurface,
            color: colors.text,
            outline: "none",
          }}
        />
        {isCustom && (
          <button
            type="button"
            onClick={handleReset}
            title="Reset to default"
            disabled={isLoading}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "4px",
              border: `1px solid ${colors.border}`,
              borderRadius: 4,
              background: colors.bgSurface,
              cursor: isLoading ? "not-allowed" : "pointer",
              color: colors.textMuted,
              flexShrink: 0,
            }}
          >
            <RotateCcw size={12} strokeWidth={2} />
          </button>
        )}
      </div>
      <AutoSaveStatus saved={saved} isDirty={isDirty} />
    </div>
  );
}
