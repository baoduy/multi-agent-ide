import React, { useState, useCallback, useEffect } from "react";

import {
  DEFAULT_SPEC_SYNC_INTERVAL_MINUTES,
  DEFAULT_SESSION_SYNC_INTERVAL_MINUTES,
  MIN_SYNC_INTERVAL_MINUTES,
  MAX_SYNC_INTERVAL_MINUTES,
} from "@magenta/shared/config";
import { colors } from "../../utils/colors";
import { useConfigStore } from "../../store/configStore";

type SyncIntervalFieldProps = {
  label: string;
  description: string;
  value: number;
  defaultValue: number;
  isLoading: boolean;
  onSave: (minutes: number) => Promise<void>;
};

/**
 * Single row for a sync interval setting. Validates bounds locally and
 * persists via the provided onSave callback.
 */
function SyncIntervalField({
  label,
  description,
  value,
  defaultValue,
  isLoading,
  onSave,
}: SyncIntervalFieldProps): React.ReactElement {
  const [localValue, setLocalValue] = useState<string>(String(value));
  const [saved, setSaved] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  // Sync with store when it changes externally
  useEffect(() => {
    setLocalValue(String(value));
  }, [value]);

  const commit = useCallback(async () => {
    const parsed = Number.parseInt(localValue, 10);

    if (!Number.isFinite(parsed)) {
      setErrorText("Enter a whole number of minutes");
      return;
    }

    if (parsed < MIN_SYNC_INTERVAL_MINUTES || parsed > MAX_SYNC_INTERVAL_MINUTES) {
      setErrorText(
        `Must be between ${MIN_SYNC_INTERVAL_MINUTES} and ${MAX_SYNC_INTERVAL_MINUTES} minutes`,
      );
      return;
    }

    setErrorText(null);

    if (parsed === value) {
      return;
    }

    await onSave(parsed);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [localValue, onSave, value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void commit();
      }
    },
    [commit],
  );

  const parsedPreview = Number.parseInt(localValue, 10);
  const isDirty = Number.isFinite(parsedPreview) && parsedPreview !== value;
  const isDefault = value === defaultValue;

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: colors.text, marginBottom: 4 }}>
        {label}
      </label>
      <p style={{ margin: "0 0 8px 0", fontSize: 12, color: colors.textMuted, lineHeight: 1.5 }}>
        {description}
      </p>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="number"
          min={MIN_SYNC_INTERVAL_MINUTES}
          max={MAX_SYNC_INTERVAL_MINUTES}
          step={1}
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => { if (isDirty) void commit(); }}
          disabled={isLoading}
          style={{
            width: 90,
            padding: "6px 8px",
            fontSize: 13,
            border: `1px solid ${errorText ? colors.errorDark : colors.border}`,
            borderRadius: 6,
            background: colors.bgSurface,
            color: colors.text,
            outline: "none",
          }}
        />
        <span style={{ fontSize: 12, color: colors.textMuted }}>minutes</span>
        {isDefault && (
          <span style={{ fontSize: 11, color: colors.textTertiary }}>
            (default: {defaultValue})
          </span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, minHeight: 18 }}>
        {errorText && (
          <span style={{ fontSize: 11, color: colors.errorDark, fontWeight: 500 }}>
            {errorText}
          </span>
        )}
        {!errorText && saved && (
          <span style={{ fontSize: 11, color: colors.success, fontWeight: 500 }}>
            Saved
          </span>
        )}
        {!errorText && isDirty && !saved && (
          <span style={{ fontSize: 11, color: colors.textTertiary }}>
            Press Enter or click away to save
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Settings section for customizing how often the daemon runs background
 * sync jobs (spec sync across repos and CLI session history sync).
 */
export function SyncIntervalSettings(): React.ReactElement {
  const specSyncIntervalMinutes = useConfigStore((s) => s.specSyncIntervalMinutes);
  const sessionSyncIntervalMinutes = useConfigStore((s) => s.sessionSyncIntervalMinutes);
  const updateSpecSyncInterval = useConfigStore((s) => s.updateSpecSyncInterval);
  const updateSessionSyncInterval = useConfigStore((s) => s.updateSessionSyncInterval);
  const isLoading = useConfigStore((s) => s.isLoading);

  return (
    <div>
      <h3 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 600, color: colors.textStrong }}>
        Background Sync Intervals
      </h3>

      <SyncIntervalField
        label="Spec sync"
        description="How often Magenta re-scans every active repository for new or updated spec branches."
        value={specSyncIntervalMinutes}
        defaultValue={DEFAULT_SPEC_SYNC_INTERVAL_MINUTES}
        isLoading={isLoading}
        onSave={updateSpecSyncInterval}
      />

      <SyncIntervalField
        label="Session sync"
        description="How often Magenta re-scans your local Claude Code session history for newly-saved conversations."
        value={sessionSyncIntervalMinutes}
        defaultValue={DEFAULT_SESSION_SYNC_INTERVAL_MINUTES}
        isLoading={isLoading}
        onSave={updateSessionSyncInterval}
      />
    </div>
  );
}
