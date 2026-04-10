import React, { useState, useCallback, useEffect } from "react";
import { RotateCcw } from "lucide-react";

import { DEFAULT_SPECIFY_COMMAND } from "@magenta/shared/config";
import { useConfigStore } from "../../store/configStore";

/**
 * Settings section for customizing the Specify install/upgrade command template.
 * Uses {agent} and {args} as placeholders.
 */
export function SpecifyCommandSetting(): React.ReactElement {
  const specifyCommand = useConfigStore((s) => s.specifyCommand);
  const updateSpecifyCommand = useConfigStore((s) => s.updateSpecifyCommand);
  const isLoading = useConfigStore((s) => s.isLoading);

  const [localValue, setLocalValue] = useState(specifyCommand);
  const [saved, setSaved] = useState(false);

  // Sync with store when it changes externally
  useEffect(() => {
    setLocalValue(specifyCommand);
  }, [specifyCommand]);

  const handleSave = useCallback(async () => {
    const trimmed = localValue.trim();
    if (trimmed && trimmed !== specifyCommand) {
      await updateSpecifyCommand(trimmed);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }, [localValue, specifyCommand, updateSpecifyCommand]);

  const handleReset = useCallback(async () => {
    setLocalValue(DEFAULT_SPECIFY_COMMAND);
    await updateSpecifyCommand(DEFAULT_SPECIFY_COMMAND);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [updateSpecifyCommand]);

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
      <h3 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 600, color: "#374151" }}>
        Specify Command
      </h3>
      <p style={{ margin: "0 0 8px 0", fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>
        Command used for both onboarding and upgrading Specify.
        Use <code style={{ fontSize: 12, background: "#f3f4f6", padding: "1px 4px", borderRadius: 3 }}>{"{agent}"}</code> as
        a placeholder for the selected AI agent.
      </p>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <input
          type="text"
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => { if (isDirty) void handleSave(); }}
          spellCheck={false}
          style={{
            flex: 1,
            padding: "8px 10px",
            fontSize: 12,
            fontFamily: "'SF Mono', 'Fira Code', ui-monospace, monospace",
            border: "1px solid #e5e2da",
            borderRadius: 6,
            background: "#faf9f5",
            color: "#2c2c2c",
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
              padding: "8px",
              border: "1px solid #e5e2da",
              borderRadius: 6,
              background: "#faf9f5",
              cursor: isLoading ? "not-allowed" : "pointer",
              color: "#6b6560",
              flexShrink: 0,
            }}
          >
            <RotateCcw size={14} strokeWidth={2} />
          </button>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, minHeight: 18 }}>
        {saved && (
          <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 500 }}>
            Saved
          </span>
        )}
        {isDirty && !saved && (
          <span style={{ fontSize: 11, color: "#9a958c" }}>
            Press Enter or click away to save
          </span>
        )}
      </div>
    </div>
  );
}
