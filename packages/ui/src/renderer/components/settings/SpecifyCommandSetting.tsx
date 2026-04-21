import React, { useState, useCallback, useEffect } from "react";
import { RotateCcw } from "lucide-react";

import { DEFAULT_SPECIFY_COMMAND } from "@magenta/shared/config";
import { colors } from "../../utils/colors";
import { useConfigStore } from "../../store/configStore";
import { AutoSaveStatus } from "../common/AutoSaveStatus";
import { useTransientFlag } from "../../hooks/useTransientFlag";

/**
 * Settings section for customizing the Specify install/upgrade command template.
 * Uses {agent} and {args} as placeholders.
 */
export function SpecifyCommandSetting(): React.ReactElement {
  const specifyCommand = useConfigStore((s) => s.specifyCommand);
  const updateSpecifyCommand = useConfigStore((s) => s.updateSpecifyCommand);
  const isLoading = useConfigStore((s) => s.isLoading);

  const [localValue, setLocalValue] = useState(specifyCommand);
  const [saved, showSaved] = useTransientFlag();

  // Sync with store when it changes externally
  useEffect(() => {
    setLocalValue(specifyCommand);
  }, [specifyCommand]);

  const handleSave = useCallback(async () => {
    const trimmed = localValue.trim();
    if (trimmed && trimmed !== specifyCommand) {
      await updateSpecifyCommand(trimmed);
      showSaved();
    }
  }, [localValue, specifyCommand, updateSpecifyCommand, showSaved]);

  const handleReset = useCallback(async () => {
    setLocalValue(DEFAULT_SPECIFY_COMMAND);
    await updateSpecifyCommand(DEFAULT_SPECIFY_COMMAND);
    showSaved();
  }, [updateSpecifyCommand, showSaved]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void handleSave();
      }
    },
    [handleSave],
  );

  const isDirty = localValue.trim() !== specifyCommand;
  const isDefault = specifyCommand === DEFAULT_SPECIFY_COMMAND;

  return (
    <div>
      <h3 style={{ margin: "0 0 6px 0", fontSize: 11, fontWeight: 600, color: colors.textStrong }}>
        Specify Command
      </h3>
      <p style={{ margin: "0 0 6px 0", fontSize: 11, color: colors.textMuted, lineHeight: 1.5 }}>
        Command used for both onboarding and upgrading Specify.
        Use <code style={{ fontSize: 10, background: colors.bgMuted, padding: "1px 3px", borderRadius: 3 }}>{"{agent}"}</code> as
        a placeholder for the selected AI agent.
      </p>

      <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
        <input
          type="text"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => { if (isDirty) void handleSave(); }}
          spellCheck={false}
          style={{
            flex: 1,
            padding: "4px 8px",
            fontSize: 11,
            fontFamily: "var(--font-sans)",
            border: `1px solid ${colors.border}`,
            borderRadius: 4,
            background: colors.bgSurface,
            color: colors.text,
            outline: "none",
          }}
        />
        {!isDefault && (
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
